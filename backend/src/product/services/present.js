/**
 * How tasks, feed rows and people look in responses (HRMS shapes).
 *
 * People inside task responses carry `_id` and `id`, `name`, `pin`,
 * `pinDisplay` and `photoUrl` (a signed link, or null). Files carry a signed
 * `url` so an <img>/<audio> can open them without a header. Everything
 * derived (overdue, declined, the accent colour) is computed here, never stored.
 */
const { formatPin } = require('../../platform/pin');
const { signedPath } = require('../../platform/services/files');
const { photoUrlOf } = require('../../platform/models/User');
const {
  STATUS, EXTENSION_STATUS, FREQUENCY, FREQUENCY_LABELS, DEFAULT_PRIORITY,
  statusLabel, isOverdue, isDeclined, isAwaitingAcceptance, accentFor, normalisePriority, patternLabel,
} = require('../config');

/** What populate() asks for on a User. */
const PERSON_FIELDS = 'name pin status photo';

/** A populated user as a person object; an unpopulated id is left alone. */
function personOut(u) {
  if (!u || typeof u !== 'object' || !u._id || u.name === undefined) return u ?? null;
  const id = String(u._id);
  return { _id: id, id, name: u.name, pin: u.pin || '', pinDisplay: formatPin(u.pin), photoUrl: photoUrlOf(u) };
}

/** A team reference as `{ id, name }` (name null when not loaded), or null. */
function teamOut(t) {
  if (!t) return null;
  if (typeof t === 'object' && t._id && t.name !== undefined) return { id: String(t._id), name: t.name };
  return { id: String(t), name: null };
}

const fileId = (f) => f?.file || f?.storagePath;
const withUrl = (f) => (f && fileId(f) ? { ...f, url: signedPath(fileId(f)) } : f);

/** A plain object from a document or a lean row. */
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });

// What the server wrote while the name was "KARO" (1.0.6 and older), shown in
// today's words: the welcome task (until its owner edits it) and system rows.
const OLD_NAME = 'KARO';
const OLD_WELCOME = {
  title: 'Welcome to KARO: share your Task Pin',
  description:
    'Share your Task Pin with the people you work with and add theirs from Contacts. ' +
    'Create a team to give tasks to everyone in it. Mark this done when you have added your first contact.',
};
const product = () => require('..');

/** A task (document or lean row) as a client gets it. */
function decorate(input) {
  const row = plain(input);
  delete row.rev;
  delete row.__v;
  // Older tasks may still carry the id of the template they came from.
  delete row.template;
  if (row.title === OLD_WELCOME.title) {
    row.title = product().welcome.title;
    if (row.description === OLD_WELCOME.description) row.description = product().welcome.description;
  }
  const assignees = (row.assignees || []).map((a) => ({ ...a, user: personOut(a.user) }));
  const extensions = row.extensions || [];
  const pending = extensions.find((e) => e.status === EXTENSION_STATUS.PENDING) || null;
  const last = extensions[extensions.length - 1];
  const out = {
    ...row,
    assignees,
    createdBy: personOut(row.createdBy),
    team: teamOut(row.team),
    loopUsers: (row.loopUsers || []).map(personOut),
    openTo: (row.openTo || []).map(personOut),
    attachments: (row.attachments || []).map(withUrl),
    voiceNote: row.voiceNote ? withUrl(row.voiceNote) : row.voiceNote,
  };
  return {
    ...out,
    statusLabel: statusLabel(row.status),
    overdue: isOverdue(row),
    frequencyLabel: FREQUENCY_LABELS[row.repeat?.frequency || FREQUENCY.ONCE],
    hasVoiceNote: Boolean(row.voiceNote?.storagePath),
    attachmentCount: (row.attachments || []).length,
    declined: isDeclined(row),
    awaitingAcceptance: isAwaitingAcceptance(row),
    delegationCount: (row.delegations || []).length,
    accent: accentFor(row),
    priority: normalisePriority(row.priority) || DEFAULT_PRIORITY,
    isPiece: Boolean(row.parentTask),
    isOpenPiece: Boolean(row.parentTask) && !assignees.length,
    subtaskCount: Number(row.childCount) || 0,
    subtasksDone: Number(row.childDoneCount) || 0,
    pendingExtension: pending
      ? {
          _id: pending._id,
          toDate: pending.toDate,
          fromDate: pending.fromDate,
          reason: pending.reason,
          requestedBy: pending.requestedBy,
          requestedByName: pending.requestedByName,
          requestedAt: pending.requestedAt,
        }
      : null,
    extensionRequests: extensions.length,
    lastExtension: last
      ? {
          status: last.status || EXTENSION_STATUS.PENDING,
          toDate: last.toDate || null,
          requestedByName: last.requestedByName || '',
          requestedAt: last.requestedAt || null,
          decidedByName: last.decidedByName || '',
          decidedAt: last.decidedAt || null,
        }
      : null,
    routine: Boolean(row.routine),
    editCount: Number(row.editCount) || 0,
    lastNudgeAt: row.lastNudgeAt || null,
    repeatLabel: row.repeat?.frequency && row.repeat.frequency !== FREQUENCY.ONCE ? patternLabel(row.repeat) : '',
  };
}

/** A feed row as a client gets it. */
function updateOut(input) {
  const u = plain(input);
  delete u.__v;
  return {
    ...u,
    ...(u.system && u.byName === OLD_NAME ? { byName: product().name } : {}),
    by: personOut(u.by),
    files: (u.files || []).map(withUrl),
    voiceNote: u.voiceNote ? withUrl(u.voiceNote) : u.voiceNote,
  };
}

/** Where a row stands, in the words the list's status button uses (export). */
function statusWords(row) {
  if (row.declined) return 'Declined';
  if (row.routine && row.status === STATUS.IN_PROGRESS) return 'To do';
  if (row.status === STATUS.PENDING && row.awaitingAcceptance) return 'Not accepted yet';
  return statusLabel(row.status);
}

module.exports = { PERSON_FIELDS, personOut, teamOut, withUrl, decorate, updateOut, statusWords };
