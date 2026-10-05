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
 * WHO: the picker is fed by GET /tasks/meta (me, team-mates, contacts; the
 * Super Admin sees everyone) and has an "Add someone by Task Pin" shortcut
 * that sends a contact request. An empty "Assign to" means the task is mine.
 * The Super Admin can set it "On behalf of" somebody (onBehalfOf).
 *
 * The deadline is two strings ('YYYY-MM-DD', 'HH:mm'), joined into a real
 * timestamp once, on submit.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { useSettings } from '../../platform/session';
import { colors, font, radius, space, type } from '../../platform/theme';
import {
  BottomSheet,
  Button,
  Chip,
  ChipRow,
  DateField,
  EmptyState,
  FieldLabel,
  Header,
  ListRow,
  Notice,
  Screen,
  Segmented,
  SkeletonCards,
  SwitchRow,
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
  listTemplates,
  taskKeys,
  templatePrefill,
  updateRecurring,
  updateTask,
  useTaskMeta,
} from '../api';
import { AttachSheet, FileGrid } from '../components/Files';
import ReminderEditor from '../components/ReminderEditor';
import ReminderPatternPicker, { remindersFor, repeatingRule, splitReminders } from '../components/ReminderPatternPicker';
import Stepper from '../components/Stepper';
import TaskPeoplePicker from '../components/TaskPeoplePicker';
import { VoiceRecorder } from '../components/VoiceNote';
import { ChevronDown, Eye, FileText, Link, Paperclip, Plus, Repeat, Tag, User, Users, X } from '../icons';
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

export default function AssignTaskScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const qc = useQueryClient();
  const settings = useSettings();
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
  const [requiresApproval, setRequiresApproval] = useState(settings?.approvalDefault !== false);
  const [dueDay, setDueDay] = useState(ymdOf(start));
  const [dueTime, setDueTime] = useState(hmOf(start));
  const [links, setLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState({ url: '', label: '' });
  const [voice, setVoice] = useState(null);
  const [files, setFiles] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [picking, setPicking] = useState(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
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
  const teams = meta?.teams || [];

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

  const applyTemplate = async (tpl) => {
    setTemplatesOpen(false);
    try {
      const p = await templatePrefill(tpl._id || tpl.id);
      if (!p) return;
      setTitle(p.title || '');
      setDescription(p.description || '');
      if (p.category) setCategory(typeof p.category === 'string' ? p.category : p.category?.name || '');
      if (p.priority) setPriority(p.priority);
      if (p.dueDate) {
        setDueDay(ymdOf(new Date(p.dueDate)));
        setDueTime(hmOf(new Date(p.dueDate)));
      }
      setAssignees((p.assignees || []).map(String).filter((x) => byId.has(x) || x === myId));
      setLoopUsers((p.loopUsers || []).map(String).filter((x) => byId.has(x)));
      setLinks(p.links || []);
      if (p.team) setTeam(idOf(p.team));
      if ((p.reminders || []).length) {
        setTaskReminders(p.reminders);
        setRemindOpen(true);
      }
      setTemplateId(String(p.template || tpl._id || tpl.id || ''));
      toast.success(tr('Filled in from the template.'));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) return setError(tr('Give the task a title.'));
    if (recurringMode && frequency === 'WEEKLY' && !weekdays.length) return setError(tr('Pick at least one day of the week.'));
    if (recurringMode && untilDay && untilDay < startDay) return setError(tr('The end date is before the start date.'));
    const sentReminders = !recurringMode && (remindOpen || mode === 'edit') ? taskReminders || [] : [];
    if (recurringMode && every && reminderPattern(every) === 'WEEKLY' && !(every.weekdays || []).length) return setError(tr('Pick at least one day for the reminder — or turn it off.'));
    if (recurringMode && every && reminderPattern(every) === 'HOURLY' && every.from && every.to && !(every.from < every.to)) return setError(tr('The reminder window has to end after it starts.'));
    if (sentReminders.some((r) => r.when === 'EVERY' && reminderPattern(r) === 'HOURLY' && r.from && r.to && !(r.from < r.to))) {
      return setError(tr('The reminder window has to end after it starts.'));
    }

    const reviewShown = !selfOnly && !routine;
    const common = {
      title: title.trim(),
      description: description.trim(),
      assignees: mode === 'edit' && !assignees.length && myId ? [myId] : assignees,
      loopUsers,
      category,
      priority,
      // Filed under a team: sent when chosen; an edit also sends "none" to take it off.
      ...(team ? { team } : mode === 'edit' || scheduleId ? { team: null } : {}),
      ...(mode === 'edit' && !reviewShown ? {} : { requiresApproval: reviewShown ? requiresApproval : false }),
    };

    try {
      if (mode === 'edit') {
        const res = await updateTask(
          editTaskId,
          {
            ...common,
            dueDate: dueAt ? dueAt.toISOString() : null,
            ...(taskReminders && JSON.stringify(taskReminders) !== loadedReminders.current ? { reminders: taskReminders } : {}),
            ...(JSON.stringify(links) !== loadedLinks.current ? { links } : {}),
          },
          { voice, files }
        );
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
          ...(templateId ? { template: templateId } : {}),
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
      setError(e.message || tr('Could not save that.'));
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

  return (
    <Screen header={<Header back="close" title={screenTitle} />} scroll keyboard footer={<Button title={submitLabel} size="lg" icon={recurringMode ? Repeat : undefined} onPress={submit} />}>
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

      {mode === 'assign' ? (
        <ListRow
          icon={FileText}
          iconColor={colors.primary}
          title={tr('Start from a template')}
          subtitle={templateId ? tr('Filled in from a template. Change anything you like.') : tr('Fill this form from a saved task')}
          onPress={() => setTemplatesOpen(true)}
          style={styles.templateRow}
        />
      ) : null}

      <TextField
        label={tr('Task title')}
        value={title}
        onChangeText={setTitle}
        placeholder={recurringMode ? tr('e.g. Count the cash and lock the drawer') : tr('e.g. Create the sales report')}
        multiline
        maxLength={300}
        inputStyle={styles.titleInput}
      />
      <TextField label={tr('Details')} optional value={description} onChangeText={setDescription} placeholder={tr('A short description…')} multiline maxLength={5000} />

      {/* Who */}
      <FieldLabel>{tr('Assign to')}</FieldLabel>
      <PickerBox icon={Users} text={assignees.length ? namesOf(assignees) : onBehalf ? onBehalfName : tr('Myself')} faint={!assignees.length} onPress={() => setPicking('assignees')} />
      {!assignees.length ? (
        <Text style={styles.blockHint}>
          {onBehalf ? tr('Nobody chosen — it will be assigned to {name}.', { name: onBehalfName }) : tr('Nobody chosen — it will be assigned to you.')}
        </Text>
      ) : null}

      {meta.canAssignOnBehalf && mode !== 'edit' && !scheduleId ? (
        <View style={styles.block}>
          <FieldLabel>{tr('On behalf of')}</FieldLabel>
          <PickerBox
            icon={User}
            text={onBehalf ? onBehalfName : tr('Yourself')}
            faint={!onBehalf}
            onPress={() => setPicking('behalf')}
            onClear={onBehalf ? () => setOnBehalfOf('') : undefined}
          />
          <Text style={styles.blockHint}>
            {onBehalf ? tr("It goes out in {name}'s name and becomes theirs — they review it.", { name: onBehalfName }) : tr('Leave it as yourself to set the task in your own name.')}
          </Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <FieldLabel optional>{tr('Keep in the loop')}</FieldLabel>
        <PickerBox icon={Eye} text={loopUsers.length ? namesOf(loopUsers) : tr('Nobody')} faint={!loopUsers.length} onPress={() => setPicking('loop')} />
      </View>

      {teams.length ? (
        <View style={styles.block}>
          <FieldLabel optional>{tr('Team')}</FieldLabel>
          <ChipRow>
            <Chip label={tr('No team')} selected={!team} onPress={() => setTeam('')} />
            {teams.map((t) => (
              <Chip key={t.id} label={t.name} icon={Users} selected={String(team) === String(t.id)} onPress={() => setTeam(t.id)} />
            ))}
          </ChipRow>
          <Text style={styles.blockHint}>{tr("Filed under a team, it shows on the team's list for its owner and admins.")}</Text>
        </View>
      ) : null}

      {/* Repeats */}
      {recurringMode ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{tr('Repeats')}</Text>
          <Segmented options={RECUR_FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(f) }))} value={frequency} onChange={setFrequency} />

          {frequency === 'DAILY' ? (
            <>
              <Text style={styles.subLabel}>{tr('How often')}</Text>
              <ChipRow>
                {[
                  [1, tr('Every day')],
                  [2, tr('Alternate days')],
                  [3, tr('Every 3 days')],
                ].map(([n, label]) => (
                  <Chip key={n} label={label} selected={interval === n} onPress={() => setIntervalN(n)} />
                ))}
              </ChipRow>
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
                  <ChipRow>
                    {NTH_WEEK_KEYS.map((n) => (
                      <Chip key={n} label={nthLabel(n)} selected={nthWeek === n} onPress={() => setNthWeek(n)} />
                    ))}
                  </ChipRow>
                  <Text style={styles.subLabel}>{tr('Day')}</Text>
                  <ChipRow>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <Chip key={d} label={weekdayShort(d)} selected={weekday === d} onPress={() => setWeekday(d)} />
                    ))}
                  </ChipRow>
                </>
              )}
            </>
          ) : null}

          {frequency === 'YEARLY' ? (
            <>
              <Text style={styles.subLabel}>{tr('Month')}</Text>
              <ChipRow>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <Chip key={m} label={monthShort(m)} selected={month === m} onPress={() => setMonth(m)} />
                ))}
              </ChipRow>
              <Stepper label={tr('Day')} value={monthDay} min={1} max={31} onChange={setMonthDay} format={(n) => ordinal(n)} />
            </>
          ) : null}

          <View style={styles.twoCol}>
            <TimeField style={styles.flex} label={tr('Due at')} value={dueTime} onChange={setDueTime} />
            <DateField style={styles.flex} label={tr('Starts on')} value={startDay} onChange={setStartDay} />
          </View>
          <DateField style={styles.top} label={tr('Ends on')} value={untilDay} onChange={setUntilDay} placeholder={tr('No end date')} clearable />

          <View style={styles.preview}>
            <View style={styles.previewIcon}>
              <Repeat size={16} color={colors.white} />
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

      {/* Priority */}
      <View style={styles.block}>
        <FieldLabel>{tr('Priority')}</FieldLabel>
        <ChipRow>
          {TASK_PRIORITY.map((p) => {
            const c = priorityColor(p);
            return <Chip key={p} label={priorityLabel(p)} selected={priority === p} color={c.solid} softColor={c.bg} onPress={() => setPriority(p)} />;
          })}
        </ChipRow>
      </View>

      {/* Category */}
      <View style={styles.block}>
        <FieldLabel optional>{tr('Category')}</FieldLabel>
        <ChipRow>
          <Chip label={tr('None')} selected={!category} onPress={() => setCategory('')} />
          {categories.map((c) => (
            <Chip key={c} label={c} icon={Tag} selected={category === c} onPress={() => setCategory(c)} />
          ))}
          {newCategory === null ? <Chip label={tr('New category')} icon={Plus} onPress={() => setNewCategory('')} /> : null}
        </ChipRow>
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
        {newCategory !== null && team ? <Text style={styles.blockHint}>{tr('It is shared with the team you picked above.')}</Text> : null}
      </View>

      {selfOnly ? (
        <Notice tone="neutral">
          {onBehalf
            ? tr("This goes on {name}'s own list. They mark it done themselves — there is no review step.", { name: onBehalfName })
            : tr('This goes on your own list. You mark it done yourself — there is no review step.')}
        </Notice>
      ) : !routine ? (
        <SwitchRow
          label={requiresApproval ? (onBehalf ? tr('{name} reviews it first', { name: onBehalfName }) : tr('You review it first')) : tr('They can close it themselves')}
          description={
            requiresApproval
              ? tr('Finishing hands it in for review. It is approved, or sent back with a note.')
              : tr('It is done the moment they say so — no review step.')
          }
          value={requiresApproval}
          onChange={setRequiresApproval}
        />
      ) : null}

      {/* Reminders (recurring) */}
      {recurringMode ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{tr('Reminders')}</Text>
          <ReminderPatternPicker value={every} onChange={setEvery} hints={reminderHints} hourlyOnly />
          {otherReminders.length > 0 ? (
            <ChipRow style={styles.top}>
              {otherReminders.map((r, i) => (
                <Chip key={`${r.when}-${r.amount}-${r.unit}-${i}`} label={reminderLabel(r)} trailingIcon={X} onPress={() => setOtherReminders((o) => o.filter((_, j) => j !== i))} />
              ))}
            </ChipRow>
          ) : null}
        </View>
      ) : null}

      {/* When (a one-off) */}
      {!recurringMode ? (
        <>
          <View style={styles.twoCol}>
            <DateField style={styles.flex} label={tr('Due date')} value={dueDay} onChange={setDueDay} placeholder={tr('No deadline')} clearable />
            {dueDay ? <TimeField style={styles.timeCol} label={tr('Due time')} value={dueTime} onChange={setDueTime} /> : null}
          </View>
          <Text style={styles.blockHint}>{dueDay ? tr('Due by {time}.', { time: hmLabel(dueTime || '18:00') }) : tr('No deadline — it stays open until it is done.')}</Text>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{tr('Reminders')}</Text>
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
                    : (meta?.defaultReminders || settings?.defaultReminders || []).length
                      ? tr('None of your own — your usual ones go: {list}.', {
                          list: (meta?.defaultReminders || settings?.defaultReminders).map((r) => reminderLabel(r)).join(', '),
                        })
                      : tr('None — nobody will be chased about this one unless you add a reminder.')}
                </Text>
                <Button
                  title={tr('Add a reminder')}
                  icon={Plus}
                  variant="secondary"
                  onPress={() => {
                    setTaskReminders((cur) => (cur && cur.length ? cur : [repeatingRule('HOURLY')]));
                    setRemindOpen(true);
                  }}
                  style={styles.top}
                />
              </>
            )}
          </View>
        </>
      ) : null}

      {/* Links */}
      <View style={styles.block}>
        <FieldLabel optional>{tr('Links')}</FieldLabel>
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
      </View>

      {/* Attachments & the recording */}
      <View style={styles.block}>
        <FieldLabel optional>{recurringMode ? tr('Voice note') : tr('Voice note and files')}</FieldLabel>
        <View style={styles.iconRow}>
          <View style={styles.flex}>
            <VoiceRecorder value={voice} onChange={setVoice} />
          </View>
          {!recurringMode ? (
            <Pressable
              onPress={() => setAttachOpen(true)}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={tr('Attach a file')}
              disabled={files.length >= MAX_FILES}
            >
              <Paperclip size={19} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {hadVoice && !voice ? <Text style={styles.blockHint}>{tr('It has a voice note — record a new one to replace it.')}</Text> : null}
        <FileGrid files={files} size={64} onRemove={(f) => setFiles((list) => list.filter((x) => x.key !== f.key))} style={styles.top} />
      </View>

      <Notice tone="danger">{error}</Notice>

      {/* The people pickers */}
      <BottomSheet
        visible={Boolean(picking)}
        onClose={() => setPicking(null)}
        title={picking === 'loop' ? tr('Keep in the loop') : picking === 'behalf' ? tr('On behalf of') : tr('Assign to')}
        footer={<Button title={tr('Done')} onPress={() => setPicking(null)} />}
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

      <TemplateSheet visible={templatesOpen} onClose={() => setTemplatesOpen(false)} onPick={applyTemplate} />
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        room={MAX_FILES - files.length}
        onPicked={(picked) => setFiles((list) => [...list, ...picked].slice(0, MAX_FILES))}
      />
    </Screen>
  );
}

function PickerBox({ icon: Icon, text, faint, onPress, onClear }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.picker, pressed && styles.pressed]} accessibilityRole="button">
      <Icon size={18} color={colors.textSecondary} />
      <Text style={[styles.pickerText, faint && styles.pickerFaint]} numberOfLines={2}>
        {text}
      </Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Clear')}>
          <X size={17} color={colors.textSecondary} />
        </Pressable>
      ) : (
        <ChevronDown size={17} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

/** Mine, then each team's shared templates. Picking one fills the form. */
function TemplateSheet({ visible, onClose, onPick }) {
  const q = useQuery({ queryKey: taskKeys.templates, queryFn: listTemplates, enabled: visible, staleTime: 60 * 1000 });
  const mine = q.data?.mine || q.data?.templates || [];
  const groups = q.data?.team || [];
  const empty = !q.isPending && !mine.length && !groups.some((g) => (g.templates || []).length);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Start from a template')}>
      {q.isPending ? <SkeletonCards count={3} height={52} /> : null}
      {q.isError ? <Notice tone="danger">{q.error?.message}</Notice> : null}
      {empty ? <Text style={styles.blockHint}>{tr('No templates yet. Templates saved on the web show up here.')}</Text> : null}
      {mine.length ? <Text style={styles.groupTitle}>{tr('My templates')}</Text> : null}
      {mine.map((t) => (
        <ListRow key={t._id || t.id} icon={FileText} title={t.name || t.title} subtitle={t.name && t.title !== t.name ? t.title : undefined} onPress={() => onPick(t)} style={styles.sheetRow} />
      ))}
      {groups.map((g) =>
        (g.templates || []).length ? (
          <View key={g.team?.id || g.team?.name}>
            <Text style={styles.groupTitle}>{g.team?.name || tr('Team')}</Text>
            {g.templates.map((t) => (
              <ListRow key={t._id || t.id} icon={FileText} title={t.name || t.title} subtitle={t.name && t.title !== t.name ? t.title : undefined} onPress={() => onPick(t)} style={styles.sheetRow} />
            ))}
          </View>
        ) : null
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { marginTop: space(3) },
  pressed: { opacity: 0.85 },
  templateRow: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, backgroundColor: colors.card, marginBottom: space(4) },
  titleInput: { fontSize: 17, fontWeight: font.semibold, minHeight: 48 },
  block: { marginTop: space(4), marginBottom: space(1) },
  blockHint: { color: colors.textFaint, fontSize: 13, lineHeight: 18, marginTop: space(1.5) },
  picker: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    backgroundColor: colors.card,
  },
  pickerText: { flex: 1, color: colors.text, fontSize: 15 },
  pickerFaint: { color: colors.textSecondary },
  panel: {
    padding: space(3),
    marginVertical: space(4),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  panelTitle: { ...type.overline, marginBottom: space(2) },
  subLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold, marginTop: space(3), marginBottom: space(2) },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  dayChip: { minWidth: 40, justifyContent: 'center', paddingHorizontal: space(2) },
  twoCol: { flexDirection: 'row', gap: space(2.5), marginTop: space(3) },
  timeCol: { width: 140 },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2.5), marginTop: space(4), padding: space(3), borderRadius: radius.input, backgroundColor: colors.primarySoft },
  previewIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  previewHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(2) },
  inlineInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.card,
  },
  inlineX: { padding: space(1) },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 40 },
  linkText: { flex: 1, color: colors.primary, fontSize: 14 },
  linkAdd: { gap: space(2), marginTop: space(1) },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  iconBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  groupTitle: { ...type.overline, marginTop: space(3), marginBottom: space(1) },
  sheetRow: { paddingHorizontal: space(1) },
});
