/**
 * The tasks themselves: list, board, counters, export, create, read, edit,
 * delete, the feed and file streaming. (Status moves and the doer's answers
 * are in actions.js.)
 */
const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const TaskUpdate = require('../models/TaskUpdate');
const RecurringTask = require('../models/RecurringTask');
const User = require('../../platform/models/User');
const { HttpError, badRequest, forbidden, notFound } = require('../../platform/errors');
const { openStream, deleteFiles, getFile } = require('../../platform/services/files');
const people = require('../services/people');
const access = require('../services/access');
const engine = require('../services/engine');
const notify = require('../services/notify');
const recurrence = require('../services/recurrence');
const exporter = require('../services/export');
const { decorate, updateOut, PERSON_FIELDS } = require('../services/present');
const { buildQuery, countersFor, resolveSort, sortedRows, FIGURES_IGNORE, populateRows } = require('../services/query');
const {
  taskUpload, parseBody, truthy, cleanReminders, ROUTINE_REMINDERS, cleanRepeat, cleanLinks, storeFiles, storeVoiceNote,
} = require('../services/inputs');
const { zoneOf, settingsOf, whenText, atZone, dayKey, startOfDay } = require('../services/time');
const {
  STATUS, ACCEPTANCE, FREQUENCY, BOARD_COLUMNS, EDIT_FIELD_LABELS, DEFAULT_PRIORITY, normalisePriority, reminderLabel,
  isRoutineFrequency, statusLabel, idOf,
} = require('../config');
const { listRow, taskBody } = require('./helpers');

const router = express.Router();
const later = (p) => p.catch((e) => console.warn('[tasks] notify failed:', e.message));

// ---------------------------------------------------------------- reading

/** GET / — one page of rows, the counters above it, and (withScopes) each pile's figures. */
router.get('/', async (req, res) => {
  const who = await access.actor(req);
  const filter = await buildQuery(req);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const { sort, key: sortKey, dir: sortDir } = resolveSort(req.query);

  const withScopes = req.query.withScopes === '1' || req.query.withScopes === 'true';
  const scopeKeys = withScopes ? access.scopesFor(who) : [];
  const narrowed = Object.keys(FIGURES_IGNORE).some((k) => req.query[k] !== undefined && String(req.query[k]).trim() !== '');
  const barFilter = narrowed ? await buildQuery(req, FIGURES_IGNORE) : filter;

  const [rows, total, counters, ...scopeCounters] = await Promise.all([
    sortedRows(filter, sort, sortKey, (page - 1) * limit, limit),
    Task.countDocuments(filter),
    countersFor(barFilter),
    ...scopeKeys.map(async (scope) => countersFor(await buildQuery(req, { scope, ...FIGURES_IGNORE }))),
  ]);

  res.json({
    ...(withScopes ? { scopes: Object.fromEntries(scopeKeys.map((k, i) => [k, scopeCounters[i]])) } : {}),
    // The serial continues across pages: row 51 is "51".
    tasks: rows.map((row, i) => listRow(who, row, (page - 1) * limit + i + 1)),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit) || 1,
    sort: sortKey,
    dir: sortDir,
    counters,
  });
});

/** GET /board — the four columns, each capped, with the list's filters. */
router.get('/board', async (req, res) => {
  const who = await access.actor(req);
  const base = await buildQuery(req);
  const perColumn = Math.min(100, Math.max(5, parseInt(req.query.limitPerColumn, 10) || 50));
  const { sort, key } = resolveSort(req.query);
  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (col) => {
      const filter = { $and: [base, { status: col.key }] };
      const [rows, count] = await Promise.all([sortedRows(filter, sort, key, 0, perColumn), Task.countDocuments(filter)]);
      return {
        key: col.key,
        label: statusLabel(col.key),
        boardLabel: col.label,
        count,
        more: Math.max(0, count - rows.length),
        tasks: rows.map((row, i) => listRow(who, row, i + 1)),
      };
    })
  );
  res.json({ columns, limitPerColumn: perColumn, counters: await countersFor(base) });
});

/** GET /export — the list as an Excel report (every page of it). */
router.get('/export', async (req, res) => {
  await exporter.exportTasks(req, res);
});

/** GET /counters — the figures alone. */
router.get('/counters', async (req, res) => {
  res.json(await countersFor(await buildQuery(req)));
});

// ---------------------------------------------------------------- creating

/** A due date off the wire: an ISO instant, or a plain date (6 PM that day, viewer's zone). */
function parseDue(raw, tz) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? atZone(s, '18:00', tz) : new Date(s);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) throw badRequest('That due date is not a date.');
  return d;
}

/** A start date: a plain date is the start of that day (viewer's zone). */
function parseStart(raw, tz) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? startOfDay(raw, tz) : new Date(String(raw));
  if (!d || Number.isNaN(d.getTime())) throw badRequest('That start date is not a date.');
  return d;
}

function cleanTitle(raw, message = 'Give the task a title.') {
  const title = String(raw ?? '').trim();
  if (!title) throw badRequest(message);
  if (title.length > 300) throw badRequest('Keep the title under 300 characters.');
  return title;
}

/** A team the setter may file a task under (an active member; the Super Admin: any). */
async function teamFor(raw, setter, superAdmin) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (!mongoose.isValidObjectId(String(raw))) throw badRequest('Choose a valid team.');
  const Team = require('../../platform/models/Team');
  const team = await Team.findById(String(raw)).select('_id').lean();
  if (!team) throw badRequest('That team no longer exists.');
  if (!superAdmin && !(await people.platform.isActiveMember(setter._id, team._id))) {
    throw badRequest('You can only file a task under a team you are in.');
  }
  return team._id;
}

const uploadsOf = (req) => (req.files || []).filter((f) => f.fieldname !== 'voice');

/**
 * POST / — hand work over. Nobody chosen means a task for yourself. The
 * Super Admin may set it in someone else's name (`onBehalfOf`).
 */
router.post('/', taskUpload, async (req, res) => {
  const who = await access.actor(req);
  const body = parseBody(req);
  const title = cleanTitle(body.title);
  const tz = zoneOf(req);

  let setter = req.user;
  let proxy = null;
  const behalfId = String(body.onBehalfOf || '').trim();
  if (behalfId && behalfId !== who.id) {
    if (!who.superAdmin) throw forbidden('Only the Super Admin can set a task on somebody else’s behalf.');
    const principal = mongoose.isValidObjectId(behalfId)
      ? await User.findOne({ _id: behalfId, role: 'user', status: 'active' }).select('name settings role status')
      : null;
    if (!principal) throw badRequest('Choose an active person to set the task for.');
    setter = principal;
    proxy = { by: req.user._id, byName: req.user.name, at: new Date() };
  }
  const setterSettings = settingsOf(setter);

  let wanted = people.validIds(Array.isArray(body.assignees) ? body.assignees : body.assignees ? [body.assignees] : []);
  if (!wanted.length) wanted = [String(setter._id)];
  const loopUsers = people.validIds(body.loopUsers).filter((id) => !wanted.includes(id));
  await people.assertAssignable(req.user, [...wanted, ...loopUsers]);
  const team = await teamFor(body.team, setter, who.superAdmin);

  const assignees = await people.buildAssignees(wanted);
  if (!assignees.length) throw badRequest('None of the people chosen are available any more.');

  const dueDate = parseDue(body.dueDate, tz) || null;
  const repeat = cleanRepeat(body.repeat);
  const recurring = repeat.frequency !== FREQUENCY.ONCE;
  const routine = recurring && isRoutineFrequency(repeat.frequency);
  const reminders = body.reminders !== undefined
    ? cleanReminders(body.reminders)
    : routine ? ROUTINE_REMINDERS() : cleanReminders(setterSettings.defaultReminders);
  const selfOnly = wanted.every((id) => id === String(setter._id));
  const requiresApproval = body.requiresApproval === undefined || body.requiresApproval === ''
    ? setterSettings.approvalDefault
    : truthy(body.requiresApproval);

  const task = new Task({
    title,
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    team,
    createdBy: setter._id,
    createdByName: setter.name,
    ...(proxy ? { onBehalf: proxy } : {}),
    assignees,
    loopUsers,
    priority: normalisePriority(body.priority) || DEFAULT_PRIORITY,
    requiresApproval,
    dueDate: recurring ? undefined : dueDate,
    startDate: recurring ? dueDate || new Date() : parseStart(body.startDate, tz) || undefined,
    repeat,
    reminders,
    links: cleanLinks(body.links),
    template: mongoose.isValidObjectId(String(body.template || '')) ? body.template : undefined,
  });
  await task.save();

  const ref = { kind: 'task', id: task._id };
  const files = await storeFiles(uploadsOf(req), ref, req.user);
  const voice = await storeVoiceNote(req.files, ref, req.user, body.voiceDurationMs);
  if (files.length) task.attachments = files;
  if (voice) task.voiceNote = voice;
  if (files.length || voice) await task.save();

  await TaskUpdate.create({
    task: task._id,
    kind: 'CREATED',
    by: req.user._id,
    byName: req.user.name,
    to: task.status,
    note: proxy ? `Set this task on behalf of ${setter.name}.` : selfOnly ? 'Set this task for themselves.' : 'Set this task.',
  });

  // A Repeat on the assign form becomes a schedule; this row is its first occurrence.
  if (recurring) {
    const now = new Date();
    const zone = recurrence.zoneFromUser(setter);
    const schedule = await RecurringTask.create({
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      team,
      assignees: assignees.map((a) => a.user),
      loopUsers,
      voiceNote: task.voiceNote,
      links: task.links,
      reminders: task.reminders,
      frequency: repeat.frequency,
      interval: repeat.interval,
      weekdays: repeat.weekdays,
      monthlyMode: repeat.monthlyMode,
      nthWeek: repeat.nthWeek,
      weekday: repeat.weekday,
      monthDay: repeat.monthDay,
      month: repeat.month,
      time: repeat.time || '18:00',
      startDate: task.startDate,
      until: repeat.until,
      requiresApproval: task.requiresApproval,
      mintFrom: now,
      createdBy: setter._id,
      createdByName: setter.name,
      ...(proxy ? { onBehalf: proxy } : {}),
    });
    const next = recurrence.nextOccurrence(schedule.toObject(), now, zone);
    task.recurringTask = schedule._id;
    task.dueDate = next ? next.dueAt : atZone(dayKey(now, zone.tz), schedule.time, zone.tz);
    task.occurrenceKey = next ? next.key : dayKey(task.dueDate, zone.tz);
    task.remindFrom = now;
    task.repeat = { ...repeat, time: schedule.time };
    if (routine) {
      task.routine = true;
      task.requiresApproval = false;
      for (const a of task.assignees) Object.assign(a, { status: STATUS.IN_PROGRESS, acceptance: ACCEPTANCE.ACCEPTED, acceptedAt: now, startedAt: now });
    }
    await task.save();
    await RecurringTask.updateOne({ _id: schedule._id }, { $set: { lastOccurrenceKey: task.occurrenceKey }, $inc: { generatedCount: 1 } });
  }

  later(notify.assigned(task, setter));
  if (proxy) later(notify.setOnYourBehalf(task, req.user));
  res.status(201).json(await taskBody(who, task));
});

// ---------------------------------------------------------------- one task

const loadPopulated = (who, id) =>
  access.loadVisible(who, id, {
    query: (q) => q
      .populate('assignees.user', PERSON_FIELDS)
      .populate('createdBy', PERSON_FIELDS)
      .populate('loopUsers', PERSON_FIELDS)
      .populate('openTo', PERSON_FIELDS)
      .populate('team', 'name')
      .populate('parentTask', 'code title status progress'),
  });

const childrenOf = (task) =>
  populateRows(Task.find({ parentTask: task._id, archived: { $ne: true } }).sort({ createdAt: 1 })).lean();

const feedOf = (taskId, { before, limit = 200 } = {}) => {
  const filter = { task: taskId };
  if (before) filter.createdAt = { $lt: before };
  return TaskUpdate.find(filter).populate('by', PERSON_FIELDS).sort({ createdAt: -1 }).limit(limit).lean();
};

/** GET /:id — the task, its pieces, its feed, and what this caller may do. */
router.get('/:id', async (req, res) => {
  const who = await access.actor(req);
  const task = await loadPopulated(who, req.params.id);
  const [updates, children] = await Promise.all([feedOf(task._id), childrenOf(task)]);
  const out = decorate(task);
  if (task.parentTask && typeof task.parentTask === 'object') {
    out.parentTask = { _id: task.parentTask._id, code: task.parentTask.code, title: task.parentTask.title, status: task.parentTask.status, progress: task.parentTask.progress };
  }
  res.json({
    task: out,
    children: children.map((c, i) => listRow(who, c, i + 1)),
    updates: updates.map(updateOut),
    can: access.capabilitiesFor(who, task),
  });
});

/** GET /:id/children — the pieces alone. */
router.get('/:id/children', async (req, res) => {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  const children = await childrenOf(task);
  res.json({ children: children.map((c, i) => listRow(who, c, i + 1)) });
});

/** GET /:id/updates?before=&limit= — the feed, paged newest first. */
router.get('/:id/updates', async (req, res) => {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const before = req.query.before ? new Date(req.query.before) : null;
  const updates = await feedOf(task._id, { before: before && !Number.isNaN(before.getTime()) ? before : null, limit });
  res.json({ updates: updates.map(updateOut) });
});

// ---------------------------------------------------------------- editing

const shortText = (v) => {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 280 ? `${s.slice(0, 277)}…` : s;
};

/**
 * PATCH /:id — change the terms. The assigners, only until someone takes it
 * on (409 with the reason afterwards); the Super Admin always. Every field
 * that moves goes in the trail as before → after.
 */
async function updateTask(req, res) {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  access.assertCanEdit(who, task);
  const tz = zoneOf(req);
  const body = parseBody(req);
  const changed = [];
  const changes = [];
  const note = (field, before, after) => changes.push({ field, label: EDIT_FIELD_LABELS[field] || field, before: shortText(before), after: shortText(after) });

  if (body.title !== undefined) {
    const t = cleanTitle(body.title, 'A task needs a title.');
    if (t !== task.title) { note('title', task.title, t); task.title = t; changed.push('title'); }
  }
  if (body.description !== undefined) {
    const d = String(body.description ?? '').trim();
    if (d !== (task.description || '')) { note('description', task.description, d); task.description = d; changed.push('details'); }
  }
  if (body.category !== undefined) {
    const c = String(body.category ?? '').trim();
    if (c !== (task.category || '')) { note('category', task.category, c); task.category = c; changed.push('category'); }
  }
  if (body.priority !== undefined) {
    const p = normalisePriority(body.priority);
    if (p && p !== task.priority) { note('priority', task.priority, p); task.priority = p; changed.push('priority'); }
  }
  if (body.requiresApproval !== undefined) {
    const want = truthy(body.requiresApproval);
    if (want !== task.requiresApproval) {
      note('requiresApproval', task.requiresApproval ? 'Needed' : 'Not needed', want ? 'Needed' : 'Not needed');
      task.requiresApproval = want;
      changed.push(want ? 'review needed' : 'no review needed');
    }
  }
  if (body.team !== undefined) {
    const setter = (await User.findById(task.createdBy).select('_id')) || req.user;
    const team = await teamFor(body.team, setter, who.superAdmin);
    if (idOf(team) !== idOf(task.team)) {
      const Team = require('../../platform/models/Team');
      const names = new Map((await Team.find({ _id: { $in: [task.team, team].filter(Boolean) } }).select('name').lean()).map((t) => [String(t._id), t.name]));
      note('team', names.get(idOf(task.team)) || 'No team', names.get(idOf(team)) || 'No team');
      task.team = team;
      changed.push('team');
    }
  }
  if (body.dueDate !== undefined) {
    const d = parseDue(body.dueDate, tz);
    const minute = (x) => (x ? Math.floor(new Date(x).getTime() / 60000) : null);
    if (minute(d) !== minute(task.dueDate)) {
      note('dueDate', task.dueDate ? whenText(task.dueDate, tz) : 'No deadline', d ? whenText(d, tz) : 'No deadline');
      if (task.dueDate && d) task.extensionCount = (task.extensionCount || 0) + 1;
      task.dueDate = d || undefined;
      task.firedReminders = [];
      task.overdueNotifiedAt = undefined;
      changed.push('deadline');
    }
  }
  if (body.startDate !== undefined) {
    const d = parseStart(body.startDate, tz);
    const minute = (x) => (x ? Math.floor(new Date(x).getTime() / 60000) : null);
    if (minute(d) !== minute(task.startDate)) {
      note('startDate', task.startDate ? whenText(task.startDate, tz) : 'None', d ? whenText(d, tz) : 'None');
      task.startDate = d || undefined;
      changed.push('start date');
    }
  }
  if (body.reminders !== undefined) {
    const next = cleanReminders(body.reminders);
    const words = (list) => (list || []).map(reminderLabel).join(', ') || 'None';
    if (words(task.reminders) !== words(next)) { note('reminders', words(task.reminders), words(next)); changed.push('reminders'); }
    task.reminders = next;
    task.firedReminders = [];
  }
  if (body.links !== undefined) {
    const next = cleanLinks(body.links);
    const words = (list) => (list || []).map((l) => l.label || l.url).join(', ') || 'None';
    if (words(task.links) !== words(next)) { note('links', words(task.links), words(next)); changed.push('links'); }
    task.links = next;
  }
  if (body.loopUsers !== undefined) {
    const next = people.validIds(body.loopUsers);
    const before = (task.loopUsers || []).map(String);
    await people.assertAssignable(req.user, next.filter((id) => !before.includes(id)));
    if (before.slice().sort().join() !== next.slice().sort().join()) {
      const names = await people.namesOf([...before, ...next]);
      const say = (list) => list.map((id) => names.get(id)).filter(Boolean).join(', ') || 'Nobody';
      note('loopUsers', say(before), say(next));
      changed.push('who is kept in the loop');
    }
    task.loopUsers = next;
  }
  if (body.assignees !== undefined) {
    const wanted = people.validIds(Array.isArray(body.assignees) ? body.assignees : [body.assignees]);
    if (!wanted.length) throw badRequest('A task needs at least one person on it.');
    const before = (task.assignees || []).map((a) => idOf(a.user));
    await people.assertAssignable(req.user, wanted.filter((id) => !before.includes(id)));
    const fresh = await people.buildAssignees(wanted);
    if (!fresh.length) throw badRequest('None of the people chosen are available any more.');
    const existing = new Map((task.assignees || []).map((a) => [idOf(a.user), a]));
    const beforeNames = (task.assignees || []).map((a) => a.name).filter(Boolean).join(', ') || '—';
    task.assignees = fresh.map((f) => existing.get(String(f.user)) || f);
    if (before.slice().sort().join() !== fresh.map((f) => String(f.user)).sort().join()) {
      note('assignees', beforeNames, fresh.map((f) => f.name).join(', '));
      changed.push('who is on it');
    }
  }

  const ref = { kind: 'task', id: task._id };
  const uploaded = uploadsOf(req);
  if (uploaded.length) {
    const had = (task.attachments || []).length;
    task.attachments.push(...(await storeFiles(uploaded, ref, req.user)));
    note('attachments', `${had} file${had === 1 ? '' : 's'}`, `${had + uploaded.length} files: added ${uploaded.map((f) => f.originalname).filter(Boolean).join(', ')}`);
    changed.push('files');
  }
  const voice = await storeVoiceNote(req.files, ref, req.user, body.voiceDurationMs);
  if (voice) {
    note('voiceNote', task.voiceNote?.storagePath ? 'Earlier recording' : 'None', 'New recording');
    task.voiceNote = voice;
    changed.push('voice note');
  }

  if (changes.length) {
    task.editCount = (task.editCount || 0) + 1;
    task.lastEditedAt = new Date();
    task.lastEditedByName = req.user.name;
  }
  await task.save();
  if (task.parentTask) await engine.recomputeParent(task.parentTask).catch(() => {});

  if (changed.length) {
    await TaskUpdate.create({
      task: task._id,
      kind: 'EDITED',
      by: req.user._id,
      byName: req.user.name,
      note: `Changed ${changed.join(', ')}.`,
      changes: changes.length ? changes : undefined,
    });
    const said = changes.slice(0, 2).map((c) => `${c.label}: ${c.before || '—'} → ${c.after || '—'}`).join(' · ') +
      (changes.length > 2 ? ` · +${changes.length - 2} more` : '');
    later(notify.edited(task, req.user, said));
  }
  res.json({ ...(await taskBody(who, task)), changes });
}

router.patch('/:id', taskUpload, updateTask);
router.put('/:id', taskUpload, updateTask);

/**
 * DELETE /:id — archive (the setter, team owner/admin, Super Admin), or with
 * `?purge=1` delete for good, files and all (Super Admin only).
 */
router.delete('/:id', async (req, res) => {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  if (!access.canDelete(who, task)) throw forbidden('Only the person who set this task, a team owner or admin, or the Super Admin can remove it.');

  if (req.query.purge === '1' || req.query.purge === 'true') {
    if (!access.canPurge(who)) throw forbidden('Only the Super Admin can delete a task for good.');
    const updates = await TaskUpdate.find({ task: task._id }).select('files voiceNote').lean();
    const schedule = task.recurringTask ? await RecurringTask.findById(task.recurringTask).select('voiceNote').lean() : null;
    const keepVoice = schedule?.voiceNote?.storagePath;
    const fileIds = [
      ...(task.attachments || []).map((a) => a.file || a.storagePath),
      ...(task.voiceNote?.storagePath && task.voiceNote.storagePath !== keepVoice ? [task.voiceNote.file || task.voiceNote.storagePath] : []),
      ...updates.flatMap((u) => [...(u.files || []).map((f) => f.file || f.storagePath), ...(u.voiceNote ? [u.voiceNote.file || u.voiceNote.storagePath] : [])]),
    ];
    await TaskUpdate.deleteMany({ task: task._id });
    await Task.deleteOne({ _id: task._id });
    await deleteFiles([...new Set(fileIds.map(String))]);
    if (task.parentTask) await engine.recomputeParent(task.parentTask).catch(() => {});
    return res.json({ ok: true, purged: true, message: 'Deleted for good.' });
  }

  task.archived = true;
  await task.save();
  await TaskUpdate.create({ task: task._id, kind: 'EDITED', by: req.user._id, byName: req.user.name, note: 'Removed this task.' });
  if (task.parentTask) await engine.recomputeParent(task.parentTask).catch(() => {});
  res.json({ ok: true, purged: false, message: 'Removed.' });
});

// ---------------------------------------------------------------- files

async function stream(res, f, fallbackName) {
  const id = f.file || f.storagePath;
  const meta = await getFile(id);
  if (!meta) throw notFound('That file is not there.');
  res.setHeader('Content-Type', f.mimeType || meta.metadata?.mime || 'application/octet-stream');
  res.setHeader('Content-Length', meta.length);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name || meta.filename || fallbackName)}`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  await new Promise((resolve, reject) => {
    const s = openStream(meta._id);
    s.on('error', reject);
    s.on('end', resolve);
    s.pipe(res);
  });
}

/** GET /:id/files/:fileId — an attachment (the task's or an update's), or `voice`. */
router.get('/:id/files/:fileId', async (req, res) => {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  let file = null;
  if (req.params.fileId === 'voice') file = task.voiceNote?.storagePath ? { ...task.voiceNote.toObject(), name: 'voice-note' } : null;
  else if (mongoose.isValidObjectId(req.params.fileId)) {
    file = (task.attachments || []).find((a) => String(a._id) === req.params.fileId)?.toObject() || null;
    if (!file) {
      const upd = await TaskUpdate.findOne({ task: task._id, 'files._id': req.params.fileId }).select('files').lean();
      file = (upd?.files || []).find((f) => String(f._id) === req.params.fileId) || null;
    }
  }
  if (!file) throw notFound('That file is not there.');
  await stream(res, file, 'file');
});

/** GET /:id/updates/:updateId/voice — a remark's recording. */
router.get('/:id/updates/:updateId/voice', async (req, res) => {
  const who = await access.actor(req);
  const task = await access.loadVisible(who, req.params.id);
  const upd = mongoose.isValidObjectId(req.params.updateId)
    ? await TaskUpdate.findOne({ _id: req.params.updateId, task: task._id }).select('voiceNote').lean()
    : null;
  if (!upd?.voiceNote?.storagePath) throw new HttpError(404, 'That recording is not there.');
  await stream(res, { ...upd.voiceNote, name: 'voice-note' }, 'voice-note');
});

module.exports = router;
module.exports.uploadsOf = uploadsOf;
module.exports.parseDue = parseDue;
module.exports.cleanTitle = cleanTitle;
module.exports.teamFor = teamFor;
