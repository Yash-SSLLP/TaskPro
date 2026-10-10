/**
 * Assign a task. Also: EDIT one before it is taken on, and set up or edit a
 * RECURRING one. Three modes, one form:
 *
 *   assign      a one-off: who, what, when, reminders, links, files, voice
 *   edit        `editTaskId`: the same fields, filled in, while nobody has
 *               accepted it; the server keeps every change as a trail
 *   recurring   `recurring` (+ `scheduleId` to edit): the pattern, the time,
 *               the start and end, and the reminders
 *
 * WHO: the picker is fed by GET /tasks/meta (me, people in my organizations,
 * contacts; the Super Admin sees everyone) and has an "Add someone by Task Pin" shortcut
 * that sends a contact request. An empty "Assign to" means the task is mine.
 * The Super Admin can set it "On behalf of" somebody (onBehalfOf).
 *
 * The deadline is two strings ('YYYY-MM-DD', 'HH:mm'), joined into a real
 * timestamp once, on submit.
 *
 * ORGANIZATION: General (none) or one of mine; opened from an organization's
 * tab on Tasks (a `team` param) it starts on that one. REVIEW starts off on
 * a new task unless the person turned "Ask for a review by default" on; an
 * edit keeps the task's own.
 *
 * LAID OUT AS THE HRMS APP'S FORM (2026-10-08): the fields in framed cards —
 * the task · who · how it is handled · when — the Repeats and Reminders
 * blocks under a small tinted icon and a tracked heading, dropdown boxes with
 * an icon chip, priority chips FILLED with the priority's own colour, and one
 * 46 button in the footer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { useSettings } from '../../platform/session';
import { colors, font, radius, space } from '../../platform/theme';
import {
  BottomSheet,
  Button,
  Chip,
  DateField,
  EmptyState,
  Header,
  Notice,
  Screen,
  Segmented,
  SkeletonCards,
  TextField,
  TimeField,
  hmLabel,
  hmOf,
  toast,
  ymdOf,
} from '../../platform/ui';
import {
  createCategory,
  createRecurring,
  createTask,
  getRecurring,
  getTask,
  invalidateTasks,
  listCategories,
  taskKeys,
  updateRecurring,
  updateTask,
  useTaskMeta,
} from '../api';
import productConfig from '../config';
import { AttachSheet, FileGrid } from '../components/Files';
import ReminderEditor from '../components/ReminderEditor';
import ReminderPatternPicker, { remindersFor, repeatingRule, splitReminders } from '../components/ReminderPatternPicker';
import Stepper from '../components/Stepper';
import TaskPeoplePicker from '../components/TaskPeoplePicker';
import { VoiceRecorder } from '../components/VoiceNote';
import { Bell, Building, Check, ChevronDown, Clock, Eye, Link, Paperclip, Plus, Repeat, Tag, User, Users, X } from '../icons';
import {
  DEFAULT_LEAD_DAYS,
  NTH_WEEK_KEYS,
  RECUR_FREQUENCIES,
  TASK_PRIORITY,
  frequencyLabel,
  idOf,
  monthShort,
  nthLabel,
  ordinal,
  patternLabel,
  priorityColor,
  priorityLabel,
  reminderLabel,
  reminderPattern,
  weekdayLetter,
  weekdayName,
  weekdayShort,
} from '../taskStatus';
import { MAX_FILES } from '../uploads';

/** Six this evening, or tomorrow if that has passed. */
function defaultDue() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  return d;
}

const ymdOfInstant = (d) => (d ? ymdOf(new Date(d)) : '');

/**
 * EDIT: the form's fields as a task stands, in the form's own shapes (the
 * load below fills the form from the same values). Kept as they were loaded,
 * so a save sends only what was changed here.
 */
function editFieldsOf(t) {
  const due = t.dueDate ? new Date(t.dueDate) : null;
  return {
    title: t.title || '',
    description: t.description || '',
    assignees: (t.assignees || []).map((a) => idOf(a.user)),
    loopUsers: (t.loopUsers || []).map(idOf),
    team: t.team ? idOf(t.team) : '',
    category: typeof t.category === 'string' ? t.category : t.category?.name || '',
    priority: t.priority || 'Medium',
    requiresApproval: t.requiresApproval !== false,
    due: due ? `${ymdOf(due)} ${hmOf(due)}` : '',
    reminders: t.reminders || [],
    links: t.links || [],
  };
}

/** Each field an edit sends, and the form value it comes from. */
const EDIT_SENDS = {
  title: 'title',
  description: 'description',
  assignees: 'assignees',
  loopUsers: 'loopUsers',
  team: 'team',
  category: 'category',
  priority: 'priority',
  requiresApproval: 'requiresApproval',
  dueDate: 'due',
  reminders: 'reminders',
  links: 'links',
};

export default function AssignTaskScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const qc = useQueryClient();
  const settings = useSettings();
  const scrollRef = useRef(null);
  const editTaskId = route.params?.editTaskId || null;
  const scheduleId = route.params?.scheduleId || null;
  const mode = editTaskId ? 'edit' : route.params?.recurring || scheduleId ? 'recurring' : 'assign';
  const recurringMode = mode === 'recurring';

  const start = useMemo(defaultDue, []);
  const today = useMemo(() => new Date(), []);
  const metaQ = useTaskMeta();
  const meta = metaQ.data;

  const [title, setTitle] = useState(route.params?.title || '');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState(() => (route.params?.assignees || []).map(String));
  const [onBehalfOf, setOnBehalfOf] = useState('');
  const [loopUsers, setLoopUsers] = useState([]);
  const [team, setTeam] = useState(route.params?.team || '');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState(null);
  const [priority, setPriority] = useState('Medium');
  // Off on a new task unless the person asked for reviews by default (Settings).
  const [requiresApproval, setRequiresApproval] = useState(settings?.approvalDefault === true);
  const [dueDay, setDueDay] = useState(ymdOf(start));
  const [dueTime, setDueTime] = useState(hmOf(start));
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState({ url: '', label: '' });
  const [voice, setVoice] = useState(null);
  const [files, setFiles] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [picking, setPicking] = useState(null);
  const [error, setError] = useState('');

  // The recurring pattern
  const [frequency, setFrequency] = useState('DAILY');
  const [interval, setIntervalN] = useState(1);
  const [weekdays, setWeekdays] = useState([today.getDay()]);
  const [monthlyMode, setMonthlyMode] = useState('DATE');
  const [monthDay, setMonthDay] = useState(today.getDate());
  const [nthWeek, setNthWeek] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [startDay, setStartDay] = useState(ymdOf(today));
  const [untilDay, setUntilDay] = useState('');
  const [every, setEvery] = useState(() => remindersFor().every);
  const [otherReminders, setOtherReminders] = useState([]);

  // A one-off's reminders: closed until "+ Add a reminder".
  const [taskReminders, setTaskReminders] = useState(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const loadedReminders = useRef(null);
  const loadedLinks = useRef(null);
  // EDIT: the form as it was filled in, and the task's updatedAt then (the
  // server refuses to undo somebody else's newer change: a 409 EDIT_CONFLICT).
  const loadedForm = useRef(null);
  const editBase = useRef(null);
  const [hadVoice, setHadVoice] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editTaskId || scheduleId));
  const [editWho, setEditWho] = useState('');
  const [editIds, setEditIds] = useState([]);

  const categoriesQ = useQuery({ queryKey: taskKeys.categories, queryFn: listCategories, staleTime: 60 * 1000 });

  /** EDIT: fill the form with the task as it stands. */
  useEffect(() => {
    if (!editTaskId) return undefined;
    let live = true;
    getTask(editTaskId)
      .then(({ task: t, can }) => {
        if (!live) return;
        if (!can?.canEdit) {
          toast.error(can?.editLocked || tr('This task can no longer be edited.'));
          nav.goBack();
          return;
        }
        setTitle(t.title || '');
        setDescription(t.description || '');
        setAssignees((t.assignees || []).map((a) => idOf(a.user)));
        setLoopUsers((t.loopUsers || []).map(idOf));
        setTeam(t.team ? idOf(t.team) : '');
        setCategory(typeof t.category === 'string' ? t.category : t.category?.name || '');
        setPriority(t.priority || 'Medium');
        setRequiresApproval(t.requiresApproval !== false);
        if (t.dueDate) {
          setDueDay(ymdOf(new Date(t.dueDate)));
          setDueTime(hmOf(new Date(t.dueDate)));
        } else setDueDay('');
        setLinks(t.links || []);
        loadedLinks.current = JSON.stringify(t.links || []);
        setHadVoice(Boolean(t.voiceNote?.storagePath || t.voiceNote?.url));
        setEditWho((t.assignees || []).map((a) => a.name).filter(Boolean).join(', '));
        setEditIds((t.assignees || []).map((a) => idOf(a.user)));
        setTaskReminders(t.reminders || []);
        loadedReminders.current = JSON.stringify(t.reminders || []);
        setRemindOpen((t.reminders || []).length > 0);
        loadedForm.current = editFieldsOf(t);
        editBase.current = t.updatedAt || null;
      })
      .catch((e) => {
        toast.error(e.message);
        nav.goBack();
      })
      .finally(() => live && setLoadingEdit(false));
    return () => {
      live = false;
    };
  }, [editTaskId, nav]);

  /** RECURRING, editing: fill the form with the schedule. */
  useEffect(() => {
    if (!scheduleId) return undefined;
    let live = true;
    getRecurring(scheduleId)
      .then((sc) => {
        if (!live || !sc) return;
        setTitle(sc.title || '');
        setDescription(sc.description || '');
        setAssignees((sc.assignees || []).map(idOf));
        setLoopUsers((sc.loopUsers || []).map(idOf));
        setTeam(sc.team ? idOf(sc.team) : '');
        setCategory(typeof sc.category === 'string' ? sc.category : sc.category?.name || '');
        setPriority(sc.priority || 'Medium');
        setRequiresApproval(sc.requiresApproval !== false);
        setFrequency(sc.frequency || 'DAILY');
        setIntervalN(sc.interval || 1);
        if (sc.weekdays?.length) setWeekdays(sc.weekdays);
        setMonthlyMode(sc.monthlyMode || 'DATE');
        if (sc.monthDay) setMonthDay(sc.monthDay);
        if (sc.nthWeek) setNthWeek(sc.nthWeek);
        if (Number.isInteger(sc.weekday)) setWeekday(sc.weekday);
        if (sc.month) setMonth(sc.month);
        setDueTime(sc.time || '18:00');
        setStartDay(ymdOfInstant(sc.startDate) || ymdOf(new Date()));
        setUntilDay(ymdOfInstant(sc.until));
        const split = splitReminders(sc.reminders || []);
        setEvery(split.every);
        setOtherReminders(split.otherReminders);
        setLinks(sc.links || []);
        setHadVoice(Boolean(sc.voiceNote?.storagePath || sc.voiceNote?.url));
      })
      .catch((e) => {
        toast.error(e.message);
        nav.goBack();
      })
      .finally(() => live && setLoadingEdit(false));
    return () => {
      live = false;
    };
  }, [scheduleId, nav]);

  const people = useMemo(() => meta?.people || [], [meta]);
  const byId = useMemo(() => new Map(people.map((p) => [idOf(p), p])), [people]);
  const myId = String(meta?.me || people.find((p) => p.relation === 'self')?._id || '');
  const teams = useMemo(() => meta?.teams || [], [meta]);

  // A new task opened on an organization I am no longer in starts in General.
  const routeTeam = route.params?.team;
  useEffect(() => {
    if (mode === 'assign' && meta && routeTeam && !teams.some((t) => String(t.id) === String(routeTeam))) setTeam('');
  }, [mode, meta, routeTeam, teams]);

  const onBehalf = mode !== 'edit' && !scheduleId && meta?.canAssignOnBehalf && onBehalfOf && String(onBehalfOf) !== myId ? String(onBehalfOf) : '';
  const onBehalfName = onBehalf ? byId.get(onBehalf)?.name || tr('them') : '';
  const setterId = onBehalf || myId;
  const selfOnly = assignees.length === 0 || (assignees.length === 1 && String(assignees[0]) === setterId);
  const editForSelf = mode === 'edit' && !!myId && editIds.length > 0 && editIds.every((x) => x === myId);
  const routine = recurringMode && frequency === 'DAILY';
  const leadDays = DEFAULT_LEAD_DAYS[frequency] ?? 0;

  const namesOf = (ids) =>
    ids
      .map((x) => (String(x) === myId ? tr('Myself') : byId.get(String(x))?.name))
      .filter(Boolean)
      .join(', ');

  const dueAt = useMemo(() => {
    if (!dueDay) return null;
    const [y, m, d] = dueDay.split('-').map(Number);
    const [h, mi] = String(dueTime || '18:00').split(':').map(Number);
    const when = new Date(y, m - 1, d, h || 0, mi || 0, 0, 0);
    return Number.isNaN(when.getTime()) ? null : when;
  }, [dueDay, dueTime]);

  const pattern = useMemo(
    () => ({
      frequency,
      ...(frequency === 'DAILY' ? { interval } : {}),
      ...(frequency === 'WEEKLY' ? { weekdays } : {}),
      ...(frequency === 'MONTHLY' ? { monthlyMode, ...(monthlyMode === 'WEEKDAY' ? { nthWeek, weekday } : { monthDay }) } : {}),
      ...(frequency === 'YEARLY' ? { month, monthDay } : {}),
      time: dueTime || '18:00',
    }),
    [frequency, interval, weekdays, monthlyMode, nthWeek, weekday, monthDay, month, dueTime]
  );

  const reminderHints = useMemo(() => {
    const [h, m] = String(dueTime || '18:00').split(':').map((n) => parseInt(n, 10) || 0);
    const after = (h * 60 + m < 10 * 60 ? h * 60 + m - 60 : 9 * 60) + 30;
    return {
      firstBeatAfter: leadDays ? null : `${String(Math.floor(after / 60)).padStart(2, '0')}:${String(after % 60).padStart(2, '0')}`,
      ...(frequency === 'WEEKLY' ? { weekdays } : {}),
      ...(frequency === 'MONTHLY' ? { monthlyMode, monthDay, nthWeek, weekday } : {}),
    };
  }, [frequency, weekdays, monthlyMode, monthDay, nthWeek, weekday, dueTime, leadDays]);

  const categories = useMemo(() => {
    const list = categoriesQ.data || meta?.categories || [];
    const names = list.map((c) => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
    if (category && !names.includes(category)) names.push(category);
    return [...new Set(names)];
  }, [categoriesQ.data, meta, category]);

  const addCategory = async () => {
    const name = String(newCategory || '').trim();
    if (!name) return;
    try {
      const made = await createCategory(name, team || undefined);
      setCategory(made?.name || name);
      setNewCategory(null);
      qc.invalidateQueries({ queryKey: taskKeys.categories });
      qc.invalidateQueries({ queryKey: taskKeys.meta });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const addLink = () => {
    let url = linkDraft.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLinks((l) => [...l, { url, label: linkDraft.label.trim() }].slice(0, 20));
    setLinkDraft({ url: '', label: '' });
  };

  /**
   * A refusal is shown at the foot of the form, so scroll it into view: the
   * button that asked is pinned in the footer, far from where it lands.
   */
  const fail = (message) => {
    setError(message);
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60);
    return undefined;
  };

  /** EDIT: the form's fields now, in editFieldsOf's shapes. */
  const editNow = () => ({
    title,
    description,
    assignees,
    loopUsers,
    team,
    category,
    priority,
    requiresApproval,
    due: dueDay ? `${dueDay} ${dueTime}` : '',
    reminders: taskReminders || [],
    links,
  });

  /**
   * EDIT: somebody else changed some of the same things while this form was
   * open (a 409 EDIT_CONFLICT, `clashed` its fields): bring the form up to
   * date. Their change shows in those fields and in anything not touched
   * here; what was changed here elsewhere stays, ready to save again.
   */
  const showLatest = async (clashed) => {
    try {
      const data = await getTask(editTaskId);
      if (!data?.task) return;
      qc.setQueryData(taskKeys.detail(editTaskId), data);
      const latest = editFieldsOf(data.task);
      const was = loadedForm.current || latest;
      const now = editNow();
      const pick = (key) => {
        const mine = JSON.stringify(now[key]) !== JSON.stringify(was[key]) && !clashed.includes(key === 'due' ? 'dueDate' : key);
        return mine ? now[key] : latest[key];
      };
      setTitle(pick('title'));
      setDescription(pick('description'));
      setAssignees(pick('assignees'));
      setLoopUsers(pick('loopUsers'));
      setTeam(pick('team'));
      setCategory(pick('category'));
      setPriority(pick('priority'));
      setRequiresApproval(pick('requiresApproval'));
      const due = pick('due');
      if (due) {
        const [day, time] = due.split(' ');
        setDueDay(day);
        setDueTime(time);
      } else setDueDay('');
      setTaskReminders(pick('reminders'));
      setLinks(pick('links'));
      loadedReminders.current = JSON.stringify(latest.reminders);
      loadedLinks.current = JSON.stringify(latest.links);
      loadedForm.current = latest;
      editBase.current = data.task.updatedAt || null;
      setEditWho((data.task.assignees || []).map((a) => a.name).filter(Boolean).join(', '));
      setEditIds(latest.assignees);
    } catch {
      /* the message already says to look again */
    }
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) return fail(tr('Give the task a title.'));
    if (recurringMode && frequency === 'WEEKLY' && !weekdays.length) return fail(tr('Pick at least one day of the week.'));
    if (recurringMode && untilDay && untilDay < startDay) return fail(tr('The end date is before the start date.'));
    const sentReminders = !recurringMode && (remindOpen || mode === 'edit') ? taskReminders || [] : [];
    if (recurringMode && every && reminderPattern(every) === 'WEEKLY' && !(every.weekdays || []).length) return fail(tr('Pick at least one day for the reminder — or turn it off.'));
    if (recurringMode && every && reminderPattern(every) === 'HOURLY' && every.from && every.to && !(every.from < every.to)) return fail(tr('The reminder window has to end after it starts.'));
    if (sentReminders.some((r) => r.when === 'EVERY' && reminderPattern(r) === 'HOURLY' && r.from && r.to && !(r.from < r.to))) {
      return fail(tr('The reminder window has to end after it starts.'));
    }

    const reviewShown = !selfOnly && !routine;
    const common = {
      title: title.trim(),
      description: description.trim(),
      assignees: mode === 'edit' && !assignees.length && myId ? [myId] : assignees,
      loopUsers,
      category,
      priority,
      // Filed under an organization: sent when chosen; an edit also sends "none" (General) to take it off.
      ...(team ? { team } : mode === 'edit' || scheduleId ? { team: null } : {}),
      ...(mode === 'edit' && !reviewShown ? {} : { requiresApproval: reviewShown ? requiresApproval : false }),
    };

    try {
      if (mode === 'edit') {
        const body = {
          ...common,
          dueDate: dueAt ? dueAt.toISOString() : null,
          ...(taskReminders && JSON.stringify(taskReminders) !== loadedReminders.current ? { reminders: taskReminders } : {}),
          ...(JSON.stringify(links) !== loadedLinks.current ? { links } : {}),
        };
        // Only what was changed here: an old value still sitting in this form
        // must not undo somebody else's newer change to it.
        const now = editNow();
        const was = loadedForm.current;
        if (was) {
          Object.entries(EDIT_SENDS).forEach(([field, key]) => {
            if (field in body && JSON.stringify(now[key]) === JSON.stringify(was[key])) delete body[field];
          });
        }
        if (editBase.current) body.baseUpdatedAt = editBase.current;
        const res = await updateTask(editTaskId, body, { voice, files });
        const n = (res?.changes || []).length;
        if (!n) toast(tr('Nothing changed'));
        else if (editForSelf) toast.success(n === 1 ? tr('1 change saved.') : tr('{n} changes saved.', { n }));
        else toast.success(tr('Saved. {who} has been told what changed.', { who: editWho || tr('They') }));
        invalidateTasks(qc);
        nav.goBack();
        return undefined;
      }

      if (recurringMode) {
        const body = {
          ...common,
          ...pattern,
          startDate: startDay,
          until: untilDay || null,
          links,
          reminders: [...(every ? [every] : []), ...otherReminders],
          ...(onBehalf ? { onBehalfOf: onBehalf } : {}),
        };
        const res = scheduleId ? await updateRecurring(scheduleId, body, { voice }) : await createRecurring(body, { voice });
        toast.success(res?.message || (scheduleId ? tr('Recurring task saved') : tr('Recurring task set up')));
        invalidateTasks(qc);
        nav.goBack();
        return undefined;
      }

      await createTask(
        {
          ...common,
          dueDate: dueAt ? dueAt.toISOString() : null,
          repeat: { frequency: 'ONCE' },
          ...(remindOpen && sentReminders.length ? { reminders: sentReminders } : {}),
          ...(links.length ? { links } : {}),
          ...(onBehalf ? { onBehalfOf: onBehalf } : {}),
        },
        { voice, files }
      );
      toast.success(
        selfOnly
          ? onBehalf
            ? tr("Added to {name}'s tasks.", { name: onBehalfName })
            : tr('Added to your tasks.')
          : onBehalf
            ? tr('Task assigned on behalf of {name}.', { name: onBehalfName })
            : tr('Task assigned. They will see it waiting for them to accept.')
      );
      invalidateTasks(qc);
      nav.goBack();
    } catch (e) {
      // Somebody else got there first: the form now shows the latest.
      if (mode === 'edit' && e?.code === 'EDIT_CONFLICT') await showLatest(e.data?.fields || []);
      fail(e.message || tr('Could not save that.'));
    }
    return undefined;
  };

  const screenTitle = mode === 'edit' ? tr('Edit task') : recurringMode ? (scheduleId ? tr('Edit recurring task') : tr('New recurring task')) : tr('Assign a task');
  const submitLabel =
    mode === 'edit'
      ? tr('Save changes')
      : recurringMode
        ? scheduleId
          ? tr('Save recurring task')
          : tr('Set up recurring task')
        : selfOnly
          ? onBehalf
            ? tr("Add to {name}'s tasks", { name: onBehalfName })
            : tr('Add to my tasks')
          : tr('Assign task');

  if (!meta || loadingEdit) {
    return (
      <Screen header={<Header back="close" title={screenTitle} />}>
        {metaQ.isError ? <EmptyState title={tr("Couldn't load this")} message={metaQ.error?.message} actionLabel={tr('Try again')} onAction={metaQ.refetch} /> : <SkeletonCards count={4} height={64} />}
      </Screen>
    );
  }

  const usual = meta?.defaultReminders || settings?.defaultReminders || [];

  return (
    <Screen
      header={<Header back="close" title={screenTitle} />}
      scroll
      keyboard
      scrollRef={scrollRef}
      footer={<Button title={submitLabel} size="lg" icon={recurringMode ? Repeat : Check} onPress={submit} />}
    >
      {mode === 'edit' ? (
        <Notice tone="info">
          {editForSelf
            ? tr('You have not accepted this yet, so you can still change it. Every change is kept as a trail — before and after.')
            : tr('{who} has not accepted this yet, so you can still change it. Every change is kept as a trail — before and after — and they are told.', { who: editWho || tr('They') })}
        </Notice>
      ) : null}
      {recurringMode ? (
        <Notice tone="info">
          {leadDays
            ? tr('Set it up once. Each time it comes round it lands in their Tasks on its own — {n} days before it is due.', { n: leadDays })
            : tr('Set it up once. Each time it comes round it lands in their Tasks on its own.')}
        </Notice>
      ) : null}

      {/* The task: the title is the first thing and the biggest. */}
      <View style={styles.group}>
        <Field label={tr('Task title')}>
          <TextField
            value={title}
            onChangeText={setTitle}
            placeholder={recurringMode ? tr('e.g. Count the cash and lock the drawer') : tr('e.g. Create the sales report')}
            multiline
            maxLength={300}
            accessibilityLabel={tr('Task title')}
            inputStyle={styles.titleInput}
            style={styles.flat}
          />
        </Field>
        <Field label={tr('Details')} optional>
          <TextField
            value={description}
            onChangeText={setDescription}
            placeholder={tr('A short description…')}
            multiline
            maxLength={5000}
            accessibilityLabel={tr('Details')}
            inputStyle={styles.detailsInput}
            style={styles.flat}
          />
        </Field>
      </View>

      {/* Who: dropdowns, each a sheet with the search already focused. An empty "Assign to" means the task is yours. */}
      <View style={styles.group}>
        <Field
          label={tr('Assign to')}
          hint={
            assignees.length
              ? null
              : onBehalf
                ? tr('Nobody chosen — it will be assigned to {name}.', { name: onBehalfName })
                : tr('Nobody chosen — it will be assigned to you.')
          }
        >
          <PickerBox icon={Users} text={assignees.length ? namesOf(assignees) : onBehalf ? onBehalfName : tr('Myself')} faint={!assignees.length} onPress={() => setPicking('assignees')} label={tr('Assign to')} />
        </Field>

        {meta.canAssignOnBehalf && mode !== 'edit' && !scheduleId ? (
          <Field
            label={tr('On behalf of')}
            hint={onBehalf ? tr("It goes out in {name}'s name and becomes theirs — they review it.", { name: onBehalfName }) : tr('Leave it as yourself to set the task in your own name.')}
          >
            <PickerBox
              icon={User}
              text={onBehalf ? onBehalfName : tr('Yourself')}
              faint={!onBehalf}
              onPress={() => setPicking('behalf')}
              onClear={onBehalf ? () => setOnBehalfOf('') : undefined}
              label={tr('On behalf of')}
            />
          </Field>
        ) : null}

        <Field label={tr('Keep in the loop')} optional>
          <PickerBox icon={Eye} text={loopUsers.length ? namesOf(loopUsers) : tr('Nobody')} faint={!loopUsers.length} onPress={() => setPicking('loop')} label={tr('Keep in the loop')} />
        </Field>

        {teams.length ? (
          <Field label={tr('Organization')} optional hint={tr("In {app}, a task filed under an organization shows in that organization's tab. Its owner and admins see it too.", { app: productConfig.name })}>
            <View style={styles.chipRow}>
              <Chip label={tr('General')} selected={!team} onPress={() => setTeam('')} />
              {teams.map((t) => (
                <Chip key={t.id} label={t.name} icon={Building} selected={String(team) === String(t.id)} onPress={() => setTeam(t.id)} />
              ))}
            </View>
          </Field>
        ) : null}
      </View>

      {/* Repeats */}
      {recurringMode ? (
        <View style={styles.block}>
          <BlockHead icon={Repeat} title={tr('Repeats')} />
          <Segmented options={RECUR_FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(f) }))} value={frequency} onChange={setFrequency} />

          {frequency === 'DAILY' ? (
            <>
              <Text style={styles.subLabel}>{tr('How often')}</Text>
              <View style={styles.chipRow}>
                {[
                  [1, tr('Every day')],
                  [2, tr('Alternate days')],
                  [3, tr('Every 3 days')],
                ].map(([n, label]) => (
                  <Chip key={n} label={label} selected={interval === n} onPress={() => setIntervalN(n)} />
                ))}
              </View>
              <Stepper label={tr('Every')} value={interval} min={1} max={31} onChange={setIntervalN} format={(n) => (n === 1 ? tr('1 day') : tr('{n} days', { n }))} />
            </>
          ) : null}

          {frequency === 'WEEKLY' ? (
            <>
              <Text style={styles.subLabel}>{tr('On these days')}</Text>
              <View style={styles.dayRow}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                  const on = weekdays.includes(i);
                  return (
                    <Chip
                      key={i}
                      label={weekdayLetter(i)}
                      accessibilityLabel={weekdayName(i)}
                      selected={on}
                      style={styles.dayChip}
                      onPress={() => setWeekdays((w) => (on ? w.filter((x) => x !== i) : [...w, i].sort((a, b) => a - b)))}
                    />
                  );
                })}
              </View>
            </>
          ) : null}

          {frequency === 'MONTHLY' ? (
            <>
              <Segmented
                style={styles.top}
                options={[
                  { value: 'DATE', label: tr('On a date') },
                  { value: 'WEEKDAY', label: tr('On a weekday') },
                ]}
                value={monthlyMode}
                onChange={setMonthlyMode}
              />
              {monthlyMode === 'DATE' ? (
                <>
                  <Stepper label={tr('Day of the month')} value={monthDay} min={1} max={31} onChange={setMonthDay} format={(n) => ordinal(n)} />
                  {monthDay > 28 ? <Text style={styles.blockHint}>{tr('In a shorter month it falls on the last day.')}</Text> : null}
                </>
              ) : (
                <>
                  <Text style={styles.subLabel}>{tr('Which one')}</Text>
                  <View style={styles.chipRow}>
                    {NTH_WEEK_KEYS.map((n) => (
                      <Chip key={n} label={nthLabel(n)} selected={nthWeek === n} onPress={() => setNthWeek(n)} />
                    ))}
                  </View>
                  <Text style={styles.subLabel}>{tr('Day')}</Text>
                  <View style={styles.chipRow}>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <Chip key={d} label={weekdayShort(d)} selected={weekday === d} onPress={() => setWeekday(d)} />
                    ))}
                  </View>
                </>
              )}
            </>
          ) : null}

          {frequency === 'YEARLY' ? (
            <>
              <Text style={styles.subLabel}>{tr('Month')}</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <Chip key={m} label={monthShort(m)} selected={month === m} onPress={() => setMonth(m)} style={styles.monthChip} />
                ))}
              </View>
              <Stepper label={tr('Day')} value={monthDay} min={1} max={31} onChange={setMonthDay} format={(n) => ordinal(n)} />
            </>
          ) : null}

          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <Text style={styles.subLabel}>{tr('Due at')}</Text>
              <TimeField value={dueTime} onChange={setDueTime} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.subLabel}>{tr('Starts on')}</Text>
              <DateField value={startDay} onChange={setStartDay} />
            </View>
          </View>
          <Text style={styles.subLabel}>{tr('Ends on')}</Text>
          <DateField value={untilDay} onChange={setUntilDay} placeholder={tr('No end date')} clearable />

          {/* The pattern in words — the same words the list will use. */}
          <View style={styles.preview}>
            <View style={styles.previewIcon}>
              <Repeat size={16} color={colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.previewTitle}>{patternLabel(pattern)}</Text>
              <Text style={styles.previewHint}>
                {leadDays
                  ? tr('Appears in their Tasks {n} days before it is due, at 9:00 AM.', { n: leadDays })
                  : tr('Appears in their Tasks at 9:00 AM on the day.')}
                {routine ? ` ${tr('A daily task is only marked done — nothing to accept, no review.')}` : ''}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* How it is handled. Three priority levels colour the WHOLE card
          everywhere else, so the chosen one is filled with that same colour. */}
      <View style={styles.group}>
        <Field label={tr('Priority')}>
          <View style={styles.chipRow}>
            {TASK_PRIORITY.map((p) => {
              const c = priorityColor(p);
              return <Chip key={p} label={priorityLabel(p)} selected={priority === p} color={c.solid} dot={c.solid} onPress={() => setPriority(p)} />;
            })}
          </View>
        </Field>

        {selfOnly ? (
          <Notice tone="neutral">
            {onBehalf
              ? tr("This goes on {name}'s own list. They mark it done themselves — there is no review step.", { name: onBehalfName })
              : tr('This goes on your own list. You mark it done yourself — there is no review step.')}
          </Notice>
        ) : !routine ? (
          <ToggleRow
            label={requiresApproval ? (onBehalf ? tr('{name} reviews it first', { name: onBehalfName }) : tr('You review it first')) : tr('They can close it themselves')}
            description={requiresApproval ? tr('Finishing hands it in for review. It is approved, or sent back with a note.') : tr('It is done the moment they say so — no review step.')}
            value={requiresApproval}
            onChange={setRequiresApproval}
          />
        ) : null}

        <Field label={tr('Category')} optional hint={newCategory !== null && team ? tr('It is shared with the organization you picked above.') : null}>
          <View style={styles.chipRow}>
            <Chip label={tr('None')} selected={!category} onPress={() => setCategory('')} />
            {categories.map((c) => (
              <Chip key={c} label={c} icon={Tag} selected={category === c} onPress={() => setCategory(c)} />
            ))}
            {newCategory === null ? <Chip label={tr('New category')} icon={Plus} onPress={() => setNewCategory('')} /> : null}
          </View>
          {newCategory !== null ? (
            <View style={styles.inlineAdd}>
              <TextInput
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder={tr('Category name')}
                placeholderTextColor={colors.textFaint}
                style={styles.inlineInput}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={addCategory}
              />
              <Button title={tr('Add')} full={false} onPress={addCategory} />
              <Pressable onPress={() => setNewCategory(null)} hitSlop={8} style={styles.inlineX} accessibilityRole="button" accessibilityLabel={tr('Cancel')}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </Field>
      </View>

      {/* Reminders (recurring) */}
      {recurringMode ? (
        <View style={styles.block}>
          <BlockHead icon={Bell} title={tr('Reminders')} />
          <ReminderPatternPicker value={every} onChange={setEvery} hints={reminderHints} hourlyOnly />
          {otherReminders.length > 0 ? (
            <View style={[styles.chipRow, styles.top]}>
              {otherReminders.map((r, i) => (
                <Chip key={`${r.when}-${r.amount}-${r.unit}-${i}`} label={reminderLabel(r)} trailingIcon={X} onPress={() => setOtherReminders((o) => o.filter((_, j) => j !== i))} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* When (a one-off) */}
      {!recurringMode ? (
        <>
          <View style={styles.group}>
            <View style={styles.twoCol}>
              <Field label={tr('Due date')} style={styles.flex}>
                <DateField value={dueDay} onChange={setDueDay} placeholder={tr('No deadline')} />
              </Field>
              {dueDay ? (
                <Field label={tr('Due time')} style={styles.flex}>
                  <TimeField value={dueTime} onChange={setDueTime} />
                </Field>
              ) : null}
            </View>
            <View style={styles.dueLine}>
              <Clock size={14} color={colors.primary} />
              <Text style={styles.dueLineText}>{dueDay ? tr('Due by {time}.', { time: hmLabel(dueTime || '18:00') }) : tr('No deadline — it stays open until it is done.')}</Text>
              {/* No deadline at all is a real answer here: one tap, beside the line it changes. */}
              {dueDay ? (
                <Pressable onPress={() => setDueDay('')} hitSlop={8} style={({ pressed }) => [styles.clearDue, pressed && styles.pressed]} accessibilityRole="button">
                  <X size={13} color={colors.textSecondary} />
                  <Text style={styles.clearDueText}>{tr('No deadline')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Reminders (a one-off): closed until "+ Add a reminder". */}
          <View style={styles.block}>
            <BlockHead icon={Bell} title={tr('Reminders')} />
            {remindOpen ? (
              <ReminderEditor
                value={taskReminders || []}
                onChange={(list) => {
                  setTaskReminders(list);
                  if (!list.length && mode !== 'edit') setRemindOpen(false);
                }}
              />
            ) : (
              <>
                <Text style={styles.blockHint}>
                  {mode === 'edit'
                    ? tr('None on this task — nobody is chased about it.')
                    : usual.length
                      ? tr('Usual reminder: {list}.', { list: usual.map((r) => reminderLabel(r)).join(', ') })
                      : tr('None — nobody will be chased about this one unless you add a reminder.')}
                </Text>
                <Pressable
                  onPress={() => {
                    setTaskReminders((cur) => (cur && cur.length ? cur : [repeatingRule('HOURLY')]));
                    setRemindOpen(true);
                  }}
                  style={({ pressed }) => [styles.addReminder, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Plus size={17} color={colors.text} />
                  <Text style={styles.addReminderText}>{tr('Add a reminder')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </>
      ) : null}

      {/* Links, the recording and the files */}
      <View style={styles.group}>
        <Field label={tr('Links')} optional>
          {links.map((l, i) => (
            <View key={`${l.url}-${i}`} style={styles.linkRow}>
              <Link size={15} color={colors.primary} />
              <Text style={styles.linkText} numberOfLines={1}>
                {l.label ? `${l.label} · ${l.url}` : l.url}
              </Text>
              <Pressable onPress={() => setLinks((list) => list.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Remove')}>
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          <View style={styles.linkAdd}>
            <TextInput
              value={linkDraft.url}
              onChangeText={(url) => setLinkDraft((d) => ({ ...d, url }))}
              placeholder="https://"
              placeholderTextColor={colors.textFaint}
              style={styles.inlineInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              value={linkDraft.label}
              onChangeText={(label) => setLinkDraft((d) => ({ ...d, label }))}
              placeholder={tr('Name (optional)')}
              placeholderTextColor={colors.textFaint}
              style={styles.inlineInput}
            />
            <Button title={tr('Add link')} variant="secondary" icon={Plus} onPress={addLink} disabled={!linkDraft.url.trim()} />
          </View>
        </Field>

        {/* A schedule carries its recording onto every occurrence; files belong to one task. */}
        <Field
          label={recurringMode ? tr('Voice note') : tr('Voice note and files')}
          optional
          hint={hadVoice && !voice ? tr('It has a voice note — record a new one to replace it.') : null}
        >
          <View style={styles.iconRow}>
            <View style={styles.flex}>
              <VoiceRecorder value={voice} onChange={setVoice} />
            </View>
            {!recurringMode ? (
              <Pressable
                onPress={() => setAttachOpen(true)}
                style={({ pressed }) => [styles.iconBtn, files.length >= MAX_FILES && styles.off, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={tr('Attach a file')}
                disabled={files.length >= MAX_FILES}
              >
                <Paperclip size={18} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
          <FileGrid files={files} size={64} onRemove={(f) => setFiles((list) => list.filter((x) => x.key !== f.key))} style={styles.top} />
        </Field>
      </View>

      <Notice tone="danger">{error}</Notice>

      {/* The people pickers: one sheet, its picker swapped by `picking`. */}
      <BottomSheet
        visible={Boolean(picking)}
        onClose={() => setPicking(null)}
        title={picking === 'loop' ? tr('Keep in the loop') : picking === 'behalf' ? tr('On behalf of') : tr('Assign to')}
        footer={<Button title={tr('Done')} icon={Check} size="lg" onPress={() => setPicking(null)} />}
      >
        {picking === 'behalf' ? (
          <TaskPeoplePicker
            people={people.filter((p) => idOf(p) !== myId)}
            value={onBehalf ? [onBehalf] : []}
            onChange={(ids) => {
              setOnBehalfOf(ids[0] || '');
              setPicking(null);
            }}
            max={1}
            autoFocus
            maxListHeight={380}
          />
        ) : null}
        {picking === 'assignees' ? (
          <TaskPeoplePicker people={people} value={assignees} onChange={setAssignees} allowSelf selfId={myId} autoFocus maxListHeight={360} allowAddByPin={!meta.isAdmin} />
        ) : null}
        {picking === 'loop' ? <TaskPeoplePicker people={people} value={loopUsers} onChange={setLoopUsers} autoFocus maxListHeight={360} allowAddByPin={!meta.isAdmin} /> : null}
      </BottomSheet>

      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        room={MAX_FILES - files.length}
        onPicked={(picked) => setFiles((list) => [...list, ...picked].slice(0, MAX_FILES))}
      />
    </Screen>
  );
}

/** One field: the HRMS form's small bold label, the control, and a quiet hint under it. */
function Field({ label, optional = false, hint, children, style }) {
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {optional ? <Text style={styles.optional}>{`  ${tr('optional')}`}</Text> : null}
        </Text>
      ) : null}
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A Repeats / Reminders block heading: a small tinted icon chip and a tracked title. */
function BlockHead({ icon: Icon, title }) {
  return (
    <View style={styles.blockHead}>
      <View style={styles.blockIcon}>
        <Icon size={15} color={colors.primary} />
      </View>
      <Text style={styles.blockTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** A dropdown box: a tinted icon chip, what is chosen, and a chevron (or a clear cross). */
function PickerBox({ icon: Icon, text, faint, onPress, onClear, label }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.picker, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label ? `${label}: ${text}` : text}>
      <View style={styles.pickerIcon}>
        <Icon size={16} color={colors.primary} />
      </View>
      <Text style={[styles.pickerText, faint && styles.pickerFaint]} numberOfLines={2}>
        {text}
      </Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Clear')}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      ) : (
        <ChevronDown size={16} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

/** The review switch, framed like the HRMS form's: a bold line, what it means, the switch. */
function ToggleRow({ label, description, value, onChange }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      style={({ pressed }) => [styles.switchRow, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.switchTitle}>{label}</Text>
        {description ? <Text style={styles.switchHint}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor={colors.white}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { marginTop: space(3) },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.4 },

  // One framed card per group of fields. The last field's own bottom margin
  // is the card's bottom padding, so it is not doubled.
  group: {
    paddingHorizontal: space(3.5),
    paddingTop: space(3.5),
    marginBottom: space(3),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  field: { marginBottom: space(4) },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold, marginBottom: 6 },
  optional: { color: colors.textFaint, fontSize: 12, fontWeight: font.regular },
  fieldHint: { color: colors.textFaint, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  flat: { marginBottom: 0 },
  titleInput: { fontSize: 17, fontWeight: '700', lineHeight: 23, minHeight: 34 },
  detailsInput: { fontSize: 14, lineHeight: 20 },

  picker: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space(2),
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    backgroundColor: colors.card,
  },
  pickerIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  pickerText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: font.semibold },
  pickerFaint: { color: colors.textSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // Seven across a 320px phone without wrapping: each takes an equal share.
  dayRow: { flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, minHeight: 42, paddingHorizontal: 0 },
  monthChip: { minWidth: 62 },

  // The Repeats / Reminders blocks: one framed card each, under a tinted icon.
  block: {
    padding: space(3.5),
    marginBottom: space(3),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space(3) },
  blockIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  blockTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  blockHint: { color: colors.textFaint, fontSize: 12.5, lineHeight: 18, marginTop: space(1) },
  subLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: font.bold, marginTop: space(3), marginBottom: 6 },
  twoCol: { flexDirection: 'row', gap: 10 },
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(2.5),
    marginTop: space(4),
    padding: space(3),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  previewIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  previewTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  previewHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  // "+ Add a reminder": the closed Reminders block's one control.
  addReminder: {
    marginTop: space(3),
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.input,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  addReminderText: { color: colors.text, fontSize: 13.5, fontWeight: font.bold },

  // The deadline, said in words under the two boxes.
  dueLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -space(1), marginBottom: space(3.5) },
  dueLineText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, fontWeight: font.semibold },
  clearDue: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space(2.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  clearDueText: { color: colors.textSecondary, fontSize: 12, fontWeight: font.bold },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: space(3),
    marginBottom: space(4),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  switchTitle: { color: colors.text, fontSize: 13.5, fontWeight: font.bold },
  switchHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },

  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(2) },
  inlineInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.card,
  },
  inlineX: { padding: space(1) },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: space(3),
    marginBottom: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  linkText: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: font.semibold },
  linkAdd: { gap: space(2) },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  // The HRMS app's attach button: a small square in the brand tint.
  iconBtn: {
    minHeight: 42,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
});
