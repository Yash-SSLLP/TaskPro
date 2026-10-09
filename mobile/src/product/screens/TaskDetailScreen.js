/**
 * One task. One scroll: what it is (with what was asked for) · the facts ·
 * the edit trail · the pieces · the history (ending in "Add a remark") · how
 * far along · more time · what happens next. The moves come last, under
 * everything they depend on.
 *
 * THE BUTTONS COME FROM THE SERVER and nothing else decides them: the `can`
 * object answers canAccept / canDecline / canSubmit / canApprove / canReject /
 * canWithdraw / canSetProgress / canDelegate / canSplit / canTransfer /
 * canClaim / canRequestExtension / canDecideExtension / canEdit / canDelete /
 * canPurge / canNudge / canDone / canComment, plus the leftover `transitions`.
 *
 * THE HRMS APP'S LOOK (2026-10-08, the user: "check the UI of HRMS task, need
 * same as that"): a header card with a big icon, the code and the bell, the
 * tags as pills and a Due figure tile; facts with icon boxes, avatars and the
 * clock time the task was set; section headings OUTSIDE the cards; the history
 * as one card per entry. Every button is one local shape (Btn): HRMS's, but
 * SMALLER (the user: "reduce the size of all the buttons") — 42 tall, not 50 —
 * and a long label wraps rather than being cut off.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { colors, font, space } from '../../platform/theme';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Notice,
  Screen,
  SkeletonCards,
  TextField,
  confirm,
  toast,
} from '../../platform/ui';
import {
  acceptTask,
  claimTask,
  decideExtension,
  declineTask,
  deleteTask,
  getTask,
  invalidateTasks,
  setProgress,
  taskKeys,
  taskVoiceSource,
  updateVoiceSource,
  useTaskMeta,
} from '../api';
import { actionIcon } from '../components/actionIcons';
import DelegateSheet from '../components/DelegateSheet';
import ExtensionSheet from '../components/ExtensionSheet';
import { FileGrid, viewable } from '../components/Files';
import NudgeBell from '../components/NudgeBell';
import WhatsAppNudge from '../components/WhatsAppNudge';
import ProgressControl from '../components/ProgressControl';
import TaskStatusSheets from '../components/TaskStatusSheets';
import TaskUpdateSheet from '../components/TaskUpdateSheet';
import TransferSheet from '../components/TransferSheet';
import { VoicePlayer } from '../components/VoiceNote';
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  CircleCheck,
  CirclePlay,
  CircleX,
  Clock,
  ExternalLink,
  Eye,
  GitBranch,
  Hand,
  Link,
  Lock,
  MessageSquare,
  Redo,
  Repeat,
  RotateCcw,
  ShieldCheck,
  SquareCheckBig,
  SquarePen,
  Tag,
  Trash,
  TriangleAlert,
  Undo,
  User,
  Users,
  X,
} from '../icons';
import {
  ACCEPTANCE,
  acceptanceLabel,
  accentFor,
  clockOf,
  dayLabel,
  dueColor,
  dueLabel,
  fullWhen,
  idOf,
  isOverdue,
  isTerminal,
  personName,
  priorityLabel,
  reminderLabel,
  repeatLabel,
  statusColors,
  statusLabel,
  timeAgo,
} from '../taskStatus';

/** Rows whose note the ENGINE writes, not a person. */
const MACHINE_SAID = new Set(['PROGRESS', 'SPLIT', 'CLAIMED', 'REMINDER']);

/** The wording for a move with no button of its own. */
function moveWording(from, to) {
  if (to === 'CANCELLED') return { Icon: CircleX, label: tr('Cancel it'), tone: 'danger' };
  if (to === 'PENDING' && from === 'CANCELLED') return { Icon: RotateCcw, label: tr('Put it back'), tone: 'plain' };
  if (to === 'PENDING') return { Icon: Undo, label: tr('Hand it back'), tone: 'plain' };
  if (to === 'IN_PROGRESS' && from === 'COMPLETED') return { Icon: RotateCcw, label: tr('Reopen it'), tone: 'plain' };
  if (to === 'IN_PROGRESS' && from === 'PENDING') return { Icon: CirclePlay, label: tr('Start it'), tone: 'primary' };
  if (to === 'IN_PROGRESS') return { Icon: CirclePlay, label: tr('Move to in progress'), tone: 'plain' };
  if (to === 'SUBMITTED') return { Icon: ArrowRight, label: tr('Send for review'), tone: 'plain' };
  if (to === 'COMPLETED') return { Icon: CircleCheck, label: tr('Mark complete'), tone: 'go' };
  return { Icon: ArrowRight, label: statusLabel(to), tone: 'plain' };
}

/** "7:02 AM" today; "8 Oct, 7:02 AM" another day (with the year when it is not this one). */
function stampOf(d) {
  if (!d) return '';
  const when = new Date(d);
  if (Number.isNaN(when.getTime())) return '';
  const clock = clockOf(when);
  return when.toDateString() === new Date().toDateString() ? clock : `${dayLabel(when)}, ${clock}`;
}

/**
 * "14h ago · 7:02 AM": how long ago AND the clock time. Past a week "how long
 * ago" is already the day, so the stamp alone says it.
 */
function whenLine(d) {
  if (!d) return '';
  const ago = timeAgo(d);
  const stamp = stampOf(d);
  return !ago || stamp.startsWith(ago) ? stamp : `${ago} · ${stamp}`;
}

/** `#rrggbb` with an alpha byte added; anything else falls back to the hairline colour. */
const faint = (hex, alpha = '33') => (/^#[0-9a-f]{6}$/i.test(String(hex || '')) ? `${hex}${alpha}` : colors.border);

export default function TaskDetailScreen() {
  const nav = useNavigation();
  const { id } = useRoute().params || {};
  const qc = useQueryClient();
  const meta = useTaskMeta().data;

  const q = useQuery({ queryKey: taskKeys.detail(id), queryFn: () => getTask(id), enabled: !!id });
  const task = q.data?.task || null;
  const children = q.data?.children || [];
  const updates = useMemo(() => q.data?.updates || [], [q.data]);
  const can = useMemo(() => q.data?.can || { transitions: [] }, [q.data]);

  const [feedAll, setFeedAll] = useState('comments');
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [nudgedAt, setNudgedAt] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const reload = useCallback(async () => {
    await invalidateTasks(qc);
  }, [qc]);

  const edits = useMemo(() => updates.filter((u) => u.kind === 'EDITED' && (u.changes || []).length > 0), [updates]);
  const feedComments = useMemo(
    () =>
      updates.filter((u) => {
        const kind = u.kind || 'COMMENT';
        const attached = Boolean(u.voiceNote?.storagePath || u.voiceNote?.url) || (u.files || []).length > 0;
        if (MACHINE_SAID.has(kind)) return attached;
        return Boolean(String(u.note || '').trim()) || attached;
      }),
    [updates]
  );

  const accept = async () => {
    setBusy('accept');
    try {
      await acceptTask(id);
      toast.success(tr('Accepted — it is in progress now.'));
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const confirmDecline = async () => {
    const why = declineReason.trim();
    if (!why) {
      setDeclineError(tr('Say why, so it can be given to somebody else.'));
      return;
    }
    try {
      await declineTask(id, why);
      toast.success(tr('Declined. Whoever set it has been told.'));
      setDeclineOpen(false);
      setDeclineReason('');
      reload();
    } catch (e) {
      setDeclineError(e.message);
    }
  };

  const claim = async (which = id) => {
    setBusy(`claim-${which}`);
    try {
      await claimTask(which);
      toast.success(tr('Picked up. It is yours.'));
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const saveProgress = useCallback(
    async (pct) => {
      try {
        await setProgress(id, pct);
        await reload();
        return true;
      } catch (e) {
        toast.error(e.message);
        return false;
      }
    },
    [id, reload]
  );

  const decide = async (req, approve) => {
    const ok = await confirm({
      title: approve ? tr('Give more time?') : tr('Refuse more time?'),
      message: approve
        ? tr('The deadline moves to {when} and the reminders start again from there.', { when: fullWhen(req.toDate) })
        : tr('Nothing changes. They will be told, and the deadline stands.'),
      confirmLabel: approve ? tr('Give it') : tr('Refuse'),
      destructive: !approve,
    });
    if (!ok) return;
    setBusy('extension');
    try {
      await decideExtension(id, req._id || req.id, approve);
      toast.success(approve ? tr('Deadline moved.') : tr('Refused. The deadline stands.'));
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (purge = false) => {
    const ok = await confirm({
      title: purge ? tr('Delete this task for good?') : tr('Remove this task?'),
      message: purge
        ? tr('The task and its whole history are erased. This cannot be undone.')
        : tr('It disappears from every list. The history stays on file.'),
      confirmLabel: purge ? tr('Delete for good') : tr('Remove'),
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await deleteTask(id, { purge });
      toast.success(res?.message || tr('Removed.'));
      invalidateTasks(qc);
      nav.goBack();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const extraMoves = useMemo(() => {
    const covered = new Set();
    if (can.canSubmit) covered.add('SUBMITTED');
    if (can.canApprove) covered.add('COMPLETED');
    if (can.canReject) covered.add('IN_PROGRESS');
    if (can.canWithdraw) covered.add('PENDING');
    // Accepting starts it: no separate Start while an acceptance is asked for.
    if (task?.status === 'PENDING' && can.canAccept) covered.add('IN_PROGRESS');
    if (can.canDone) covered.add('COMPLETED');
    return (can.transitions || []).filter((t) => !covered.has(t.to));
  }, [can, task]);

  // The done sheet's task, taken when it opens: a live refresh would otherwise
  // hand it a new object and reset the note being typed.
  const doneTask = useMemo(
    () => (doneOpen && task ? { ...task, can } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doneOpen]
  );

  const openChild = (child) => nav.push('TaskDetail', { id: child._id });
  // "Task", as in the HRMS app: the code moved into the header card.
  const header = <Header back title={tr('Task')} />;

  if (q.isPending) {
    return (
      <Screen header={header}>
        <SkeletonCards count={3} height={120} />
      </Screen>
    );
  }
  if (q.isError && !task) {
    return (
      <Screen header={header}>
        {q.error?.status === 404 ? (
          <EmptyState icon={TriangleAlert} title={tr('This task is not there')} message={tr('It may have been removed, or it is not shared with you.')} actionLabel={tr('Go back')} onAction={() => nav.goBack()} />
        ) : (
          <ErrorState error={q.error} onRetry={q.refetch} />
        )}
      </Screen>
    );
  }
  if (!task) return null;

  const accent = accentFor(task);
  const late = isOverdue(task);
  const done = isTerminal(task.status);
  const due = dueLabel(task.dueDate, task.status);
  const pending = task.pendingExtension || (task.extensions || []).find((e) => e.status === 'PENDING') || null;
  const myProgress = can.myProgress ?? task.progress ?? 0;
  const attachments = (task.attachments || []).map((f) => viewable(task._id, f));
  const hasVoice = Boolean(task.voiceNote?.storagePath || task.voiceNote?.url);
  const teamName = task.team?.name || task.teamName || '';
  const feedList = feedAll === 'all' ? updates : feedComments;
  const setterName = task.createdByName || personName(task.createdBy);
  const parentId = task.isPiece && task.parentTask ? idOf(task.parentTask) : '';
  const assignees = task.assignees || [];

  const anyMove =
    can.canClaim || can.canSubmit || can.canApprove || can.canReject || can.canWithdraw || can.canRequestExtension || can.canDelegate || can.canSplit || can.canTransfer || extraMoves.length > 0;

  return (
    <Screen header={header} scroll refreshing={q.isRefetching} onRefresh={q.refetch} contentStyle={styles.content}>
      {/* What it is. The module's ONE colour rule (accentFor): tinted by
          priority, green when done, grey and faded when called off. */}
      <View style={[styles.head, { backgroundColor: accent.bg, borderColor: accent.border, borderLeftColor: accent.solid }, accent.faded && styles.faded]}>
        <View style={styles.headTop}>
          <View style={[styles.headIcon, { borderColor: accent.border }]}>
            <SquareCheckBig size={24} color={accent.ink} />
          </View>
          <View style={styles.headIds}>
            {task.code ? (
              <Text style={styles.code} selectable>
                {task.code}
              </Text>
            ) : null}
            {parentId ? (
              <Pressable onPress={() => nav.push('TaskDetail', { id: parentId })} style={styles.parentLink} hitSlop={8} accessibilityRole="link">
                <Undo size={13} color={accent.ink} />
                <Text style={[styles.parentText, { color: accent.ink }]} numberOfLines={1}>
                  {task.parentCode ? tr('part of {code}', { code: task.parentCode }) : tr('Open the main task')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {/* The reminder bell: the setter chasing the work, or the doer chasing the review — whichever the server says.
              Under it, WhatsApp for people who agreed to it (invite links). */}
          <View style={styles.nudges}>
            <NudgeBell
              task={{ ...task, can }}
              override={nudgedAt}
              label
              onNudged={(_id, at) => {
                setNudgedAt(at);
                reload();
              }}
            />
            <WhatsAppNudge task={{ ...task, can }} />
          </View>
        </View>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.tagRow}>
          {late ? <Pill label={tr('Overdue')} bg={colors.dangerSoft} fg={colors.danger} /> : <StatusPill status={task.status} />}
          <View style={styles.tag}>
            <View style={[styles.dot, { backgroundColor: accent.solid }]} />
            <Text style={styles.tagLabel}>{priorityLabel(task.priority)}</Text>
          </View>
        </View>
        <View style={styles.figRow}>
          <Figure
            icon={Calendar}
            label={tr('Due')}
            value={due.text}
            tint={dueColor(due.tone)}
            ink={due.tone === 'overdue' || due.tone === 'today' ? dueColor(due.tone) : null}
          />
        </View>
      </View>

      {/* Editing: open until it is taken on; once it is, the reason why not. */}
      {can.canEdit ? (
        <Pressable
          onPress={() => nav.navigate('AssignTask', { editTaskId: task._id })}
          style={({ pressed }) => [styles.editRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('Edit task')}
        >
          <View style={styles.editIcon}>
            <SquarePen size={19} color={colors.primary} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.editTitle}>{tr('Edit task')}</Text>
            <Text style={styles.editHint}>{tr('Not accepted yet — you can still change it. Every change is shown to them.')}</Text>
          </View>
          <ChevronRight size={17} color={colors.textFaint} />
        </Pressable>
      ) : can.editLocked ? (
        <View style={styles.lockRow}>
          <Lock size={14} color={colors.textFaint} style={styles.lockIcon} />
          <Text style={styles.lockText}>{can.editLocked}</Text>
        </View>
      ) : null}

      {/* A routine task: only Done */}
      {can.canDone ? (
        <View style={[styles.banner, styles.bannerRoutine]}>
          <BannerHead icon={Repeat} tint={colors.success} title={tr('Today’s routine')} />
          <Text style={styles.bannerBody}>{tr('Nothing to accept or hand in — mark it done when it is done.')}</Text>
          <Btn icon={actionIcon('approve')} label={tr('Mark done')} tone="go" onPress={() => setDoneOpen(true)} />
        </View>
      ) : null}

      {/* The handover, unanswered: a banner, because "do you accept this?"
          decides whether the rest of the screen is even relevant. */}
      {can.canAccept ? (
        <View style={styles.banner}>
          <BannerHead icon={Hand} tint={colors.warning} title={tr('Will you take this on?')} />
          <Text style={styles.bannerBody}>{tr('{name} is waiting to hear. Accepting starts it.', { name: setterName || tr('Somebody') })}</Text>
          {edits.length > 0 ? (
            <Text style={[styles.bannerBody, styles.strong]}>
              {edits.length === 1 ? tr('It was edited once after it was sent — see Edit history below.') : tr('It was edited {n} times after it was sent — see Edit history below.', { n: edits.length })}
            </Text>
          ) : null}
          <View style={styles.bannerRow}>
            <Btn icon={actionIcon('accept')} label={tr('Accept')} tone="go" loading={busy === 'accept'} onPress={accept} style={styles.flex} />
            {can.canDecline ? <Btn icon={actionIcon('decline')} label={tr('Decline')} onPress={() => setDeclineOpen(true)} style={styles.flex} /> : null}
          </View>
        </View>
      ) : null}

      {/* Everybody on it has said no: the reasons are on the screen, not buried in the feed. */}
      {task.declined ? (
        <View style={[styles.banner, styles.bannerBad]}>
          <BannerHead icon={CircleX} tint={colors.danger} title={tr('Nobody has taken this on')} titleColor={colors.danger} />
          {assignees
            .filter((a) => a.acceptance === ACCEPTANCE.REJECTED)
            .map((a) => (
              <Text key={idOf(a.user) || a.name} style={[styles.bannerBody, { color: colors.danger }]}>
                {a.name || personName(a.user)}: {a.declineReason || tr('no reason given')}
              </Text>
            ))}
        </View>
      ) : null}

      {/* What was asked for */}
      {task.description || hasVoice || task.links?.length > 0 || attachments.length > 0 ? (
        <Card style={styles.card}>
          {task.description ? <Text style={styles.body}>{task.description}</Text> : null}
          {hasVoice ? (
            <View style={styles.gapSm}>
              <Text style={styles.voiceLabel}>{tr('Voice note from {name}', { name: task.voiceNote.recordedByName || task.createdByName || tr('the assigner') })}</Text>
              <VoicePlayer source={taskVoiceSource(task)} durationMs={task.voiceNote.durationMs} />
            </View>
          ) : null}
          {(task.links || []).map((l, i) => (
            <Pressable
              key={l._id || l.url || i}
              onPress={() => Linking.openURL(l.url).catch(() => toast.error(tr('Could not open that link.')))}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
              accessibilityRole="link"
            >
              <Link size={16} color={colors.primary} />
              <Text style={styles.link} numberOfLines={1}>
                {l.label || l.url}
              </Text>
              <ExternalLink size={14} color={colors.textFaint} />
            </Pressable>
          ))}
          {attachments.length ? <FileGrid files={attachments} size={72} /> : null}
        </Card>
      ) : null}

      {/* The facts */}
      <Card style={styles.factsCard}>
        <Fact icon={User} label={tr('Assigned by')} first>
          {/* When it was set, beside who set it. */}
          <View style={styles.personRow}>
            {setterName ? <Avatar person={task.createdBy} name={setterName} size={26} /> : null}
            <Text style={[styles.factValue, styles.grow]} numberOfLines={1}>
              {setterName || '—'}
            </Text>
            {task.createdAt ? <Text style={styles.factFaint}>{stampOf(task.createdAt)}</Text> : null}
          </View>
          {task.onBehalf?.byName ? <Text style={styles.factFaint}>{tr('Sent by {name} on their behalf', { name: task.onBehalf.byName })}</Text> : null}
        </Fact>
        <Fact icon={Users} label={tr('Assigned to')}>
          {assignees.length === 0 ? (
            <Text style={styles.factValue}>{task.isOpenPiece ? tr('Nobody yet — it is there to be picked up.') : '—'}</Text>
          ) : (
            assignees.map((a) => {
              const name = a.name || personName(a.user);
              return (
                <View key={idOf(a.user) || a._id || name} style={styles.personRow}>
                  <Avatar person={a.user} name={name} size={26} />
                  <Text style={[styles.factValue, styles.grow]} numberOfLines={1}>
                    {name || '—'}
                  </Text>
                  {/* Two axes: how far the WORK is, and whether the PERSON has agreed to do it. */}
                  <Text style={styles.factFaint} numberOfLines={1}>
                    {a.acceptance && a.acceptance !== ACCEPTANCE.ACCEPTED ? acceptanceLabel(a.acceptance) : statusLabel(a.status)}
                    {Number(a.progress) > 0 ? ` · ${a.progress}%` : ''}
                    {a.completedLate ? ` · ${tr('late')}` : ''}
                  </Text>
                </View>
              );
            })
          )}
        </Fact>
        {task.requiresApproval !== false ? (
          <Fact icon={ShieldCheck} label={tr('Reviewed by')}>
            <Text style={styles.factValue}>{task.approverName || task.createdByName || '—'}</Text>
            <Text style={styles.factFaint}>{tr('They approve it once it is handed in.')}</Text>
          </Fact>
        ) : null}
        {task.loopUsers?.length > 0 ? (
          <Fact icon={Eye} label={tr('In the loop')}>
            {task.loopUsers.map((u) => personName(u)).filter(Boolean).join(', ')}
          </Fact>
        ) : null}
        {teamName ? (
          <Fact icon={Users} label={tr('Team')}>
            {teamName}
          </Fact>
        ) : null}
        <Fact icon={Calendar} label={tr('Due')}>
          <Text style={[styles.factValue, { color: dueColor(due.tone) }]}>{fullWhen(task.dueDate)}</Text>
          {task.extensionCount > 0 ? (
            <Text style={styles.factFaint}>{task.extensionCount === 1 ? tr('Moved once.') : tr('Moved {n} times.', { n: task.extensionCount })}</Text>
          ) : null}
        </Fact>
        {task.completedAt ? (
          <Fact icon={CircleCheck} label={tr('Finished')}>
            <Text style={[styles.factValue, { color: task.completedLate ? colors.warning : colors.success }]}>
              {fullWhen(task.completedAt)} · {task.completedLate ? tr('delayed') : tr('in time')}
            </Text>
          </Fact>
        ) : null}
        {task.category ? (
          <Fact icon={Tag} label={tr('Category')}>
            {typeof task.category === 'string' ? task.category : task.category?.name}
          </Fact>
        ) : null}
        {task.repeat?.frequency && task.repeat.frequency !== 'ONCE' ? (
          <Fact icon={Repeat} label={tr('Repeats')}>
            {repeatLabel(task.repeat)}
          </Fact>
        ) : null}
        {task.delegations?.length > 0 ? (
          <Fact icon={Redo} label={tr('Passed on')}>
            {task.delegations.map((d) => tr('{from} to {to}', { from: d.fromName, to: d.toName })).join('\n')}
          </Fact>
        ) : null}
        {task.transfers?.length > 0 ? (
          <Fact icon={ArrowLeftRight} label={tr('Transferred')}>
            {task.transfers
              .map((t) => `${tr('{from} to {to} by {by}', { from: t.fromName || tr('nobody'), to: t.toName, by: t.byName })}${t.reason ? ` — ${t.reason}` : ''}`)
              .join('\n')}
          </Fact>
        ) : null}
        {task.reminders?.length > 0 ? (
          <Fact icon={Bell} label={tr('Reminders')}>
            {task.reminders.map((r) => `${r.channel === 'EMAIL' ? tr('Email') : tr('App')} · ${reminderLabel(r)}`).join('\n')}
          </Fact>
        ) : null}
      </Card>

      {/* Edit history: each change the setter made before it was taken on — who, when, before → after. */}
      {edits.length > 0 ? (
        <Section title={tr('Edit history')} meta={edits.length === 1 ? tr('1 edit') : tr('{n} edits', { n: edits.length })}>
          <View style={styles.stack}>
            {edits.map((u) => (
              <View key={u._id} style={styles.rowCard}>
                <View style={styles.editWho}>
                  <View style={styles.miniChip}>
                    <SquarePen size={14} color={colors.textSecondary} />
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.editBy} numberOfLines={1}>
                      {u.byName || tr('Somebody')}
                    </Text>
                    <Text style={styles.feedTime}>{fullWhen(u.createdAt)}</Text>
                  </View>
                </View>
                {(u.changes || []).map((c, j) => (
                  <View key={`${u._id}-${c.field}-${j}`} style={styles.change}>
                    <Text style={styles.changeLabel}>{c.label || c.field}</Text>
                    <View style={styles.changeLine}>
                      <Text style={styles.changeBefore} numberOfLines={3}>
                        {c.before || '—'}
                      </Text>
                      <ArrowRight size={12} color={colors.textFaint} style={styles.arrow} />
                      <Text style={styles.changeAfter} numberOfLines={3}>
                        {c.after || '—'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {/* The pieces: each a task of its own, so it opens like one. */}
      {children.length > 0 || can.canSplit ? (
        <Section
          title={tr('Pieces')}
          meta={
            children.length > 0
              ? tr('{done} of {total} done', { done: task.childDoneCount || children.filter((c) => c.status === 'COMPLETED').length, total: children.length })
              : null
          }
        >
          {children.length === 0 ? (
            <Text style={styles.sectionHint}>{tr('Not split up. Use Delegate to break it into pieces.')}</Text>
          ) : (
            <View style={styles.stack}>
              {children.map((c) => {
                const ca = accentFor(c);
                return (
                  <Pressable
                    key={c._id}
                    onPress={() => openChild(c)}
                    style={({ pressed }) => [styles.piece, { backgroundColor: ca.bg, borderColor: ca.border }, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <View style={[styles.pieceEdge, { backgroundColor: ca.solid }]} />
                    <View style={[styles.rowChip, { borderColor: ca.border }]}>
                      <GitBranch size={16} color={ca.ink} />
                    </View>
                    <View style={styles.grow}>
                      <Text style={styles.pieceTitle} numberOfLines={2}>
                        {c.title}
                      </Text>
                      <Text style={styles.pieceSub} numberOfLines={1}>
                        {c.isOpenPiece ? tr('Nobody yet') : c.assignees?.[0]?.name || personName(c.assignees?.[0]?.user) || '—'}
                      </Text>
                      <View style={styles.pieceMeta}>
                        <StatusPill status={c.status} />
                      </View>
                    </View>
                    {c.can?.canClaim ? (
                      <Button title={tr('Pick up')} size="sm" full={false} loading={busy === `claim-${c._id}`} onPress={() => claim(c._id)} />
                    ) : (
                      <ChevronRight size={16} color={colors.textFaint} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>
      ) : null}

      {/* History. Two shapes, and the default is the conversation: a remark
          made with a move rides on that move's row, so "Comments" is every row
          a PERSON said something on; "Everything" is the full record. */}
      <Section title={tr('History')}>
        <FeedTabs
          options={[
            { value: 'comments', label: tr('Comments'), count: feedComments.length },
            { value: 'all', label: tr('Everything'), count: updates.length },
          ]}
          value={feedAll}
          onChange={setFeedAll}
        />
        {/* Oldest first: the thread reads downwards, and the newest thing said
            is nearest the button that says something. */}
        <View style={[styles.stack, styles.feedList]}>
          {feedList.length === 0 ? (
            <EmptyState
              compact
              icon={feedAll === 'all' ? Clock : MessageSquare}
              title={feedAll === 'all' ? tr('Nothing has happened yet.') : tr('Nobody has said anything yet.')}
            />
          ) : (
            feedList
              .slice()
              .reverse()
              .map((u) => <FeedRow key={u._id} update={u} taskId={task._id} />)
          )}
        </View>
        {can.canComment !== false ? (
          <Btn icon={MessageSquare} label={tr('Add a remark')} onPress={() => setSheet({ kind: 'update', action: 'comment' })} style={styles.remark} />
        ) : null}
      </Section>

      {/* How far along */}
      {can.canSetProgress || (task.progress > 0 && !done) ? (
        <Card style={styles.card}>
          {can.canSetProgress ? (
            <ProgressControl value={myProgress} onCommit={saveProgress} tint={accent.solid} />
          ) : (
            <View style={styles.gapSm}>
              <View style={styles.progressHead}>
                <Text style={[styles.cardTitle, styles.grow]}>{tr('How far along')}</Text>
                <Text style={[styles.progressValue, { color: accent.solid }]}>{`${task.progress}%`}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, task.progress || 0)}%`, backgroundColor: accent.solid }]} />
              </View>
              <Text style={styles.cardHint}>{tr('{n}% reported by the people doing it.', { n: task.progress })}</Text>
            </View>
          )}
          {task.childCount > 0 ? <Text style={styles.cardHint}>{tr('This one is worked out from its pieces.')}</Text> : null}
        </Card>
      ) : null}

      {/* More time */}
      {pending ? (
        <Card style={[styles.card, styles.warnCard]}>
          <BannerHead icon={Clock} tint={colors.warning} title={tr('More time asked for')} titleColor={colors.warning} />
          <Text style={styles.factValue}>{tr('{name} wants until {when}.', { name: pending.requestedByName || tr('Somebody'), when: fullWhen(pending.toDate) })}</Text>
          {pending.reason ? <Text style={styles.quote}>“{pending.reason}”</Text> : null}
          {can.canDecideExtension ? (
            <View style={styles.bannerRow}>
              <Btn icon={Check} label={tr('Give it')} tone="go" loading={busy === 'extension'} onPress={() => decide(pending, true)} style={styles.flex} />
              <Btn icon={X} label={tr('Refuse')} disabled={busy === 'extension'} onPress={() => decide(pending, false)} style={styles.flex} />
            </View>
          ) : (
            <Text style={styles.cardHint}>
              {tr('Waiting on {name}. The work carries on in the meantime.', { name: task.approverName || task.createdByName || tr('the person who set it') })}
            </Text>
          )}
        </Card>
      ) : null}

      {/* What happens next: last, under everything it depends on. */}
      {anyMove ? (
        <Section title={tr('What happens next')}>
          <Card style={styles.card}>
            {can.canClaim ? <Btn icon={actionIcon('claim')} label={tr('Pick this up')} tone="primary" loading={busy === `claim-${id}`} onPress={() => claim(id)} /> : null}
            {can.canSubmit ? <Btn icon={actionIcon('submit')} label={tr('Send for review')} tone="primary" onPress={() => setSheet({ kind: 'update', action: 'submit' })} /> : null}
            {can.canApprove ? <Btn icon={actionIcon('approve')} label={tr('Approve it')} tone="go" onPress={() => setSheet({ kind: 'update', action: 'approve' })} /> : null}
            {can.canReject ? <Btn icon={actionIcon('sendBack')} label={tr('Send it back')} tone="warn" onPress={() => setSheet({ kind: 'update', action: 'reject' })} /> : null}
            {/* The doer spotted the mistake before the reviewer did. */}
            {can.canWithdraw && !can.canApprove ? (
              <Btn icon={Undo} label={tr('Pull it back')} onPress={() => setSheet({ kind: 'update', action: 'status', to: 'PENDING' })} />
            ) : null}
            {can.canRequestExtension ? <Btn icon={actionIcon('extension')} label={tr('Ask for more time')} onPress={() => setSheet({ kind: 'extension' })} /> : null}
            {can.canDelegate || can.canSplit ? (
              <Btn
                icon={actionIcon('delegate')}
                label={can.canDelegate ? tr('Delegate — whole or in pieces') : tr('Split it into pieces')}
                onPress={() => setSheet({ kind: 'delegate' })}
              />
            ) : null}
            {can.canTransfer ? (
              <Btn icon={actionIcon('transfer')} label={tr('Transfer — it went to the wrong person')} onPress={() => setSheet({ kind: 'transfer' })} />
            ) : null}
            {extraMoves.map(({ to }) => {
              const w = moveWording(task.status, to);
              return <Btn key={to} icon={w.Icon} label={w.label} tone={w.tone} onPress={() => setSheet({ kind: 'update', action: 'status', to })} />;
            })}
            <Text style={styles.cardHint}>{tr('Every move carries a note or a voice note — that is what the history is made of.')}</Text>
          </Card>
        </Section>
      ) : null}

      {/* Footer: Remove (archive) and, for a Super Admin, gone for ever — two
          buttons, so the two are never one slip apart. */}
      {can.canDelete || can.canPurge ? (
        <View style={styles.footerRow}>
          {can.canDelete ? <Btn icon={Trash} label={tr('Remove')} tone="quietBad" onPress={() => remove(false)} style={styles.flex} /> : null}
          {can.canPurge ? <Btn icon={TriangleAlert} label={tr('Delete for good')} tone="quietBad" onPress={() => remove(true)} style={styles.flex} /> : null}
        </View>
      ) : null}

      <BottomSheet
        visible={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={tr('Cannot take this on?')}
        footer={<Button title={tr('Decline it')} icon={actionIcon('decline')} variant="danger" size="lg" onPress={confirmDecline} />}
      >
        <Text style={styles.sheetText}>{tr('Say why, so it can be given to somebody else. They will see this.')}</Text>
        <TextField
          value={declineReason}
          onChangeText={(t) => {
            setDeclineReason(t);
            if (declineError) setDeclineError('');
          }}
          placeholder={tr('e.g. I am on leave from Thursday')}
          multiline
          maxLength={500}
          autoFocus
          accessibilityLabel={tr('Reason')}
          inputStyle={styles.sheetInput}
        />
        <Notice tone="danger">{declineError}</Notice>
      </BottomSheet>

      <TaskUpdateSheet
        visible={sheet?.kind === 'update'}
        task={task}
        action={sheet?.action || 'status'}
        to={sheet?.to}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          reload();
        }}
      />
      <DelegateSheet
        visible={sheet?.kind === 'delegate'}
        task={task}
        meta={meta}
        can={can}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          reload();
        }}
      />
      <TransferSheet
        visible={sheet?.kind === 'transfer'}
        task={task}
        meta={meta}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          reload();
        }}
      />
      <ExtensionSheet
        visible={sheet?.kind === 'extension'}
        task={task}
        onClose={() => setSheet(null)}
        onDone={() => {
          setSheet(null);
          reload();
        }}
      />
      <TaskStatusSheets
        task={doneTask}
        meta={meta}
        initialStage="done"
        onClose={() => setDoneOpen(false)}
        onChanged={() => {
          setDoneOpen(false);
          reload();
        }}
      />
    </Screen>
  );
}

// ---- Presentation pieces (file-local) ---------------------------------------

/**
 * Every button on this screen: one shape, the fill and its ink fixed per tone
 * so white only ever sits on a *Fill colour. minHeight + padding, never a
 * fixed height, so "Transfer — it went to the wrong person" can wrap at a
 * large system font instead of being cut.
 */
const BTN = {
  primary: { bg: colors.primary, border: colors.primary, ink: colors.onPrimary },
  go: { bg: colors.successFill, border: colors.successFill, ink: colors.white },
  warn: { bg: colors.warningFill, border: colors.warningFill, ink: colors.white },
  danger: { bg: colors.dangerFill, border: colors.dangerFill, ink: colors.white },
  plain: { bg: colors.card, border: colors.borderStrong, ink: colors.text },
  quietBad: { bg: colors.dangerSoft, border: colors.dangerBorder, ink: colors.danger },
};

function Btn({ icon: Icon, label, tone = 'plain', onPress, loading = false, disabled = false, style }) {
  const v = BTN[tone] || BTN.plain;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [styles.btn, { backgroundColor: v.bg, borderColor: v.border }, disabled && styles.btnOff, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator size="small" color={v.ink} /> : Icon ? <Icon size={17} color={v.ink} strokeWidth={2.25} /> : null}
      <Text style={[styles.btnText, { color: v.ink }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A section: the small tracked heading OUTSIDE its card, a quiet figure on the right. */
function Section({ title, meta, children }) {
  return (
    <View>
      <View style={styles.secHead}>
        <Text style={styles.secTitle} accessibilityRole="header">
          {title}
        </Text>
        {meta ? (
          <Text style={styles.secMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** The 38px tinted icon box and the bold line that open a banner. */
function BannerHead({ icon: Icon, tint, title, titleColor }) {
  return (
    <View style={styles.bannerHead}>
      <View style={[styles.bannerIcon, { borderColor: faint(tint) }]}>
        <Icon size={18} color={tint} />
      </View>
      <Text style={[styles.bannerTitle, titleColor ? { color: titleColor } : null]}>{title}</Text>
    </View>
  );
}

/** A pill: a dot and a word in one colour, on its soft tint. */
function Pill({ label, bg, fg }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: faint(fg) }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A status pill in the task module's own status colours. */
function StatusPill({ status }) {
  const c = statusColors(status);
  return <Pill label={statusLabel(status)} bg={c.bg} fg={c.fg} />;
}

/** A small figure tile on the header card. */
function Figure({ icon: Icon, label, value, tint, ink }) {
  return (
    <View style={styles.fig}>
      <View style={styles.figIcon}>
        <Icon size={16} color={tint} />
      </View>
      <View style={styles.grow}>
        <Text style={styles.figLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.figValue, ink ? { color: ink } : null]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** One fact: a 30px icon box, a tracked label, the value. `first` has no rule above it. */
function Fact({ icon: Icon, label, children, first = false }) {
  return (
    <View style={[styles.fact, !first && styles.factSep]}>
      <View style={styles.factIcon}>
        <Icon size={15} color={colors.textSecondary} />
      </View>
      <View style={styles.factBody}>
        <Text style={styles.factLabel}>{label}</Text>
        {typeof children === 'string' ? <Text style={styles.factValue}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** The history's two views, each with its count in a bubble. */
function FeedTabs({ options, value, onChange }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}, ${o.count}`}
            style={[styles.segBtn, on && styles.segBtnOn]}
          >
            <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
            <View style={[styles.segCount, on && styles.segCountOn]}>
              <Text style={[styles.segCountText, on && styles.segCountTextOn]}>{o.count}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One entry of the history, as its own card: who, the move it made, when, what was said. */
function FeedRow({ update, taskId }) {
  // A row that carries a landing status is a move, whatever it is called; CREATED carries one too and is not.
  const moved = Boolean(update.to) && update.kind !== 'CREATED';
  const files = (update.files || []).map((f) => viewable(taskId, f));
  const hasVoice = Boolean(update.voiceNote?.storagePath || update.voiceNote?.url);
  const who = update.byName || tr('System');
  return (
    <View style={[styles.rowCard, styles.feedRow, update.system && styles.faded]}>
      <Avatar person={update.by} name={who} size={34} />
      <View style={styles.grow}>
        <View style={styles.feedHead}>
          <Text style={styles.feedBy} numberOfLines={1}>
            {who}
          </Text>
          {moved ? <StatusPill status={update.to} /> : null}
        </View>
        <Text style={styles.feedTime}>{whenLine(update.createdAt)}</Text>
        {update.note ? <Text style={styles.feedNote}>{update.note}</Text> : null}
        {hasVoice ? <VoicePlayer source={updateVoiceSource(taskId, update)} durationMs={update.voiceNote.durationMs} style={styles.feedVoice} /> : null}
        {files.length ? <FileGrid files={files} size={60} style={styles.feedFiles} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  gapSm: { gap: 6 },
  stack: { gap: space(2) },
  content: { gap: space(3), paddingBottom: space(10) },
  faded: { opacity: 0.6 },
  pressed: { opacity: 0.85 },

  // Header card: the 4px priority rail, a big icon, the tags as pills, a figure tile.
  head: { gap: space(3), padding: space(4), borderRadius: 18, borderWidth: 1, borderLeftWidth: 4 },
  nudges: { alignItems: 'flex-end', gap: 6 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  headIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  headIds: { flex: 1, minWidth: 0, gap: 2 },
  code: { color: colors.textSecondary, fontSize: 12, fontWeight: font.bold, letterSpacing: 0.6 },
  parentLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 24 },
  parentText: { fontSize: 12, fontWeight: font.bold, flexShrink: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', lineHeight: 27, letterSpacing: -0.2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
  },
  tagLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: font.bold },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: font.bold },
  figRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  fig: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space(3),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  figIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  figLabel: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  figValue: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 1 },

  // Sections: the heading sits OUTSIDE the card, small, tracked and quiet.
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2), marginTop: space(2), marginBottom: space(3) },
  secTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  secMeta: { color: colors.textFaint, fontSize: 12, fontWeight: font.bold },
  sectionHint: { color: colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  card: { gap: space(2.5), borderRadius: 18 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  warnCard: { borderColor: colors.warning },

  // The one button shape: HRMS's, 42 tall instead of 50.
  btn: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnText: { fontSize: 15, fontWeight: font.bold, letterSpacing: 0.2, flexShrink: 1, textAlign: 'center' },
  btnOff: { opacity: 0.5 },

  // Banners: the accept question, a rejection, today's routine.
  banner: { padding: space(4), gap: space(2.5), borderRadius: 18, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft },
  bannerBad: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  bannerRoutine: { borderColor: colors.success, backgroundColor: colors.successSoft },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  bannerIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  bannerTitle: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: '800' },
  bannerBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  strong: { color: colors.text, fontWeight: font.bold },
  bannerRow: { flexDirection: 'row', gap: space(2) },

  // Edit (while nobody has accepted it) and, once they have, why not.
  editRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  editIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder },
  editTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  editHint: { color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  lockRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  lockIcon: { marginTop: 1 },
  lockText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 },

  // A row card: one per edit, one per history entry.
  rowCard: { gap: space(2.5), padding: space(3.5), borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  miniChip: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  editWho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editBy: { color: colors.text, fontSize: 14, fontWeight: font.bold },
  change: { gap: 3, padding: 10, borderRadius: 12, backgroundColor: colors.muted },
  changeLabel: { color: colors.textFaint, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  changeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  arrow: { marginTop: 3 },
  changeBefore: { flex: 1, color: colors.textFaint, fontSize: 13, lineHeight: 18, textDecorationLine: 'line-through' },
  changeAfter: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: font.semibold },

  // What was asked for
  body: { color: colors.text, fontSize: 14.5, lineHeight: 22 },
  voiceLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semibold },
  quote: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', lineHeight: 20 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: space(3),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  link: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: font.semibold },

  // The facts
  factsCard: { paddingVertical: space(1.5), borderRadius: 18 },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: space(2.5) },
  factSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  factIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  factBody: { flex: 1, minWidth: 0, gap: 4 },
  factLabel: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  factValue: { color: colors.text, fontSize: 14.5 },
  factFaint: { color: colors.textFaint, fontSize: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // The pieces: a 3px rail in the piece's own colour.
  piece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: space(3),
    paddingHorizontal: space(3.5),
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pieceEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  rowChip: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  pieceTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  pieceSub: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  pieceMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },

  // History: the two views, with counts in bubbles.
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted },
  segBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segBtnOn: { backgroundColor: colors.card, borderColor: colors.primaryBorder },
  segText: { color: colors.textSecondary, fontSize: 13, fontWeight: font.bold },
  segTextOn: { color: colors.text },
  segCount: { minWidth: 20, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  segCountOn: { backgroundColor: colors.primarySoft },
  segCountText: { color: colors.textSecondary, fontSize: 10.5, fontWeight: '800' },
  segCountTextOn: { color: colors.text },
  feedList: { marginTop: space(3) },
  feedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  feedHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  feedBy: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: font.bold },
  feedTime: { color: colors.textFaint, fontSize: 11.5, marginTop: 2 },
  feedNote: { color: colors.text, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  feedVoice: { marginTop: space(2) },
  feedFiles: { marginTop: space(2) },
  remark: { marginTop: space(3) },

  // How far along, read-only
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressValue: { fontSize: 18, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },

  footerRow: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  sheetText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: space(3) },
  sheetInput: { fontSize: 15 },
});
