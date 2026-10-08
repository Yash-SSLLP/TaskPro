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
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tr } from '../../i18n';
import { colors, font, radius, space, type } from '../../platform/theme';
import {
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Notice,
  Screen,
  Segmented,
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
  ChevronRight,
  CircleCheck,
  CirclePlay,
  CircleX,
  Eye,
  Link,
  Lock,
  MessageSquare,
  Redo,
  Repeat,
  RotateCcw,
  ShieldCheck,
  SquarePen,
  Tag,
  Trash,
  TriangleAlert,
  Undo,
  User,
  Users,
} from '../icons';
import {
  ACCEPTANCE,
  acceptanceLabel,
  accentFor,
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

  const openChild = (child) => nav.push('TaskDetail', { id: child._id });
  const header = <Header back title={task?.code || tr('Task')} subtitle={task?.isPiece && task?.parentCode ? tr('part of {code}', { code: task.parentCode }) : undefined} />;

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
  const tone = statusColors(task.status, false);
  const pending = task.pendingExtension || (task.extensions || []).find((e) => e.status === 'PENDING') || null;
  const myProgress = can.myProgress ?? task.progress ?? 0;
  const attachments = (task.attachments || []).map((f) => viewable(task._id, f));
  const hasVoice = Boolean(task.voiceNote?.storagePath || task.voiceNote?.url);
  const teamName = task.team?.name || task.teamName || '';
  const feedList = feedAll === 'all' ? updates : feedComments;

  const anyMove =
    can.canClaim || can.canSubmit || can.canApprove || can.canReject || can.canWithdraw || can.canRequestExtension || can.canDelegate || can.canSplit || can.canTransfer || extraMoves.length > 0;

  return (
    <Screen header={header} scroll refreshing={q.isRefetching} onRefresh={q.refetch} contentStyle={styles.content}>
      {/* What it is */}
      <View style={[styles.head, { backgroundColor: accent.bg, borderColor: accent.border, borderLeftColor: accent.solid }, accent.faded && styles.faded]}>
        <View style={styles.codeRow}>
          {task.isPiece && task.parentTask ? (
            <Pressable onPress={() => nav.push('TaskDetail', { id: idOf(task.parentTask) })} style={styles.parentLink} accessibilityRole="link">
              <Undo size={13} color={accent.ink} />
              <Text style={[styles.parentText, { color: accent.ink }]} numberOfLines={1}>
                {tr('Open the main task')}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.bell}>
            <NudgeBell
              task={{ ...task, can }}
              override={nudgedAt}
              label
              onNudged={(_id, at) => {
                setNudgedAt(at);
                reload();
              }}
            />
          </View>
        </View>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.tagRow}>
          {late ? (
            <View style={styles.overdueChip}>
              <Text style={styles.overdueText}>{tr('Overdue')}</Text>
            </View>
          ) : (
            <View style={styles.tag}>
              <Text style={[styles.tagLabel, { color: tone.fg }]}>{statusLabel(task.status)}</Text>
            </View>
          )}
          <View style={styles.tag}>
            <View style={[styles.dot, { backgroundColor: accent.solid }]} />
            <Text style={styles.tagLabel}>{priorityLabel(task.priority)}</Text>
          </View>
          <View style={styles.tag}>
            <Calendar size={12} color={dueColor(due.tone)} />
            <Text style={[styles.tagLabel, { color: dueColor(due.tone) }]}>{due.text}</Text>
          </View>
        </View>
      </View>

      {/* Editing: open until it is taken on */}
      {can.canEdit ? (
        <Card onPress={() => nav.navigate('AssignTask', { editTaskId: task._id })} style={styles.editRow} accessibilityLabel={tr('Edit task')}>
          <View style={styles.editIcon}>
            <SquarePen size={18} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.editTitle}>{tr('Edit task')}</Text>
            <Text style={styles.editHint}>{tr('Not accepted yet — you can still change it. Every change is shown to them.')}</Text>
          </View>
          <ChevronRight size={17} color={colors.textFaint} />
        </Card>
      ) : can.editLocked ? (
        <View style={styles.lockRow}>
          <Lock size={14} color={colors.textFaint} />
          <Text style={styles.lockText}>{can.editLocked}</Text>
        </View>
      ) : null}

      {/* A routine task: only Done */}
      {can.canDone ? (
        <View style={[styles.banner, styles.bannerRoutine]}>
          <Text style={styles.bannerTitle}>{tr('Today’s routine')}</Text>
          <Text style={styles.bannerBody}>{tr('Nothing to accept or hand in — mark it done when it is done.')}</Text>
          <Button title={tr('Mark done')} color={colors.success} onPress={() => setDoneOpen(true)} style={styles.bannerBtn} />
        </View>
      ) : null}

      {/* The handover, unanswered */}
      {can.canAccept ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{tr('Will you take this on?')}</Text>
          <Text style={styles.bannerBody}>{tr('{name} is waiting to hear. Accepting starts it.', { name: task.createdByName || personName(task.createdBy) || tr('Somebody') })}</Text>
          {edits.length > 0 ? (
            <Text style={[styles.bannerBody, styles.strong]}>
              {edits.length === 1 ? tr('It was edited once after it was sent — see Edit history below.') : tr('It was edited {n} times after it was sent — see Edit history below.', { n: edits.length })}
            </Text>
          ) : null}
          <View style={styles.bannerRow}>
            <Button title={tr('Accept')} icon={actionIcon('accept')} color={colors.success} loading={busy === 'accept'} onPress={accept} style={styles.flex} />
            {can.canDecline ? (
              <Button title={tr('Decline')} variant="secondary" onPress={() => setDeclineOpen(true)} style={styles.flex} />
            ) : null}
          </View>
        </View>
      ) : null}

      {task.declined ? (
        <View style={[styles.banner, styles.bannerBad]}>
          <Text style={[styles.bannerTitle, { color: colors.danger }]}>{tr('Nobody has taken this on')}</Text>
          {(task.assignees || [])
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
            <View style={styles.gap}>
              <Text style={styles.factLabel}>{tr('Voice note from {name}', { name: task.voiceNote.recordedByName || task.createdByName || tr('the assigner') })}</Text>
              <VoicePlayer source={taskVoiceSource(task)} durationMs={task.voiceNote.durationMs} />
            </View>
          ) : null}
          {(task.links || []).map((l, i) => (
            <Pressable key={l._id || l.url || i} onPress={() => Linking.openURL(l.url).catch(() => toast.error(tr('Could not open that link.')))} style={styles.linkRow} accessibilityRole="link">
              <Link size={15} color={colors.primary} />
              <Text style={styles.link} numberOfLines={1}>
                {l.label || l.url}
              </Text>
            </Pressable>
          ))}
          {attachments.length ? <FileGrid files={attachments} size={72} /> : null}
        </Card>
      ) : null}

      {/* The facts */}
      <Card style={styles.card}>
        <Fact icon={User} label={tr('Assigned by')}>
          <Text style={styles.factValue}>{task.createdByName || personName(task.createdBy) || '—'}</Text>
          {task.onBehalf?.byName ? <Text style={styles.factFaint}>{tr('Sent by {name} on their behalf', { name: task.onBehalf.byName })}</Text> : null}
        </Fact>
        <Fact icon={Users} label={tr('Assigned to')}>
          {(task.assignees || []).length === 0 ? (
            <Text style={styles.factValue}>{task.isOpenPiece ? tr('Nobody yet — it is there to be picked up.') : '—'}</Text>
          ) : (
            (task.assignees || []).map((a) => (
              <View key={idOf(a.user) || a._id || a.name} style={styles.assigneeRow}>
                <Text style={[styles.factValue, styles.flex]} numberOfLines={1}>
                  {a.name || personName(a.user)}
                </Text>
                <Text style={styles.factFaint}>
                  {a.acceptance && a.acceptance !== ACCEPTANCE.ACCEPTED ? acceptanceLabel(a.acceptance) : statusLabel(a.status)}
                  {Number(a.progress) > 0 ? ` · ${a.progress}%` : ''}
                  {a.completedLate ? ` · ${tr('late')}` : ''}
                </Text>
              </View>
            ))
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
          <Fact icon={Bell} label={tr('Reminders')} last>
            {task.reminders.map((r) => `${r.channel === 'EMAIL' ? tr('Email') : tr('App')} · ${reminderLabel(r)}`).join('\n')}
          </Fact>
        ) : null}
      </Card>

      {/* Edit history */}
      {edits.length > 0 ? (
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{tr('Edit history')}</Text>
            <Text style={styles.factFaint}>{edits.length === 1 ? tr('1 edit') : tr('{n} edits', { n: edits.length })}</Text>
          </View>
          {edits.map((u, i) => (
            <View key={u._id} style={[styles.editEntry, i > 0 && styles.editSep]}>
              <View style={styles.editWho}>
                <SquarePen size={13} color={colors.textSecondary} />
                <Text style={styles.editBy}>{u.byName || tr('Somebody')}</Text>
                <Text style={styles.feedTime}>· {fullWhen(u.createdAt)}</Text>
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
        </Card>
      ) : null}

      {/* The pieces */}
      {children.length > 0 || can.canSplit ? (
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{tr('Pieces')}</Text>
            {children.length > 0 ? (
              <Text style={styles.factFaint}>{tr('{done} of {total} done', { done: task.childDoneCount || children.filter((c) => c.status === 'COMPLETED').length, total: children.length })}</Text>
            ) : null}
          </View>
          {children.length === 0 ? (
            <Text style={styles.cardHint}>{tr('Not split up. Use Delegate to break it into pieces.')}</Text>
          ) : (
            children.map((c) => {
              const ca = accentFor(c);
              return (
                <Pressable key={c._id} onPress={() => openChild(c)} style={[styles.piece, { borderLeftColor: ca.solid, backgroundColor: ca.bg, borderColor: ca.border }]} accessibilityRole="button">
                  <View style={styles.flex}>
                    <Text style={styles.pieceTitle} numberOfLines={2}>
                      {c.title}
                    </Text>
                    <Text style={styles.factFaint} numberOfLines={1}>
                      {c.isOpenPiece ? tr('Nobody yet') : c.assignees?.[0]?.name || personName(c.assignees?.[0]?.user) || '—'}
                      {' · '}
                      {statusLabel(c.status)}
                    </Text>
                  </View>
                  {c.can?.canClaim ? (
                    <Button title={tr('Pick up')} size="sm" full={false} loading={busy === `claim-${c._id}`} onPress={() => claim(c._id)} />
                  ) : (
                    <ChevronRight size={16} color={colors.textFaint} />
                  )}
                </Pressable>
              );
            })
          )}
        </Card>
      ) : null}

      {/* History */}
      <Text style={styles.sectionTitle}>{tr('History')}</Text>
      <Segmented
        options={[
          { value: 'comments', label: `${tr('Comments')} ${feedComments.length}` },
          { value: 'all', label: `${tr('Everything')} ${updates.length}` },
        ]}
        value={feedAll}
        onChange={setFeedAll}
        style={styles.feedTabs}
      />
      {feedList.length === 0 ? (
        <Text style={styles.empty}>{feedAll === 'all' ? tr('Nothing has happened yet.') : tr('Nobody has said anything yet.')}</Text>
      ) : (
        feedList
          .slice()
          .reverse()
          .map((u) => <FeedRow key={u._id} update={u} taskId={task._id} />)
      )}
      {can.canComment !== false ? (
        <Button title={tr('Add a remark')} icon={MessageSquare} variant="secondary" onPress={() => setSheet({ kind: 'update', action: 'comment' })} style={styles.remark} />
      ) : null}

      {/* How far along */}
      {can.canSetProgress || (task.progress > 0 && !done) ? (
        <Card style={styles.card}>
          {can.canSetProgress ? (
            <ProgressControl value={myProgress} onCommit={saveProgress} tint={accent.solid} />
          ) : (
            <View style={styles.gap}>
              <Text style={styles.cardTitle}>{tr('How far along')}</Text>
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
        <Card style={[styles.card, { borderColor: colors.warning }]}>
          <Text style={[styles.cardTitle, { color: colors.warning }]}>{tr('More time asked for')}</Text>
          <Text style={styles.factValue}>{tr('{name} wants until {when}.', { name: pending.requestedByName || tr('Somebody'), when: fullWhen(pending.toDate) })}</Text>
          {pending.reason ? <Text style={styles.quote}>“{pending.reason}”</Text> : null}
          {can.canDecideExtension ? (
            <View style={styles.bannerRow}>
              <Button title={tr('Give it')} color={colors.success} loading={busy === 'extension'} onPress={() => decide(pending, true)} style={styles.flex} />
              <Button title={tr('Refuse')} variant="secondary" disabled={busy === 'extension'} onPress={() => decide(pending, false)} style={styles.flex} />
            </View>
          ) : (
            <Text style={styles.cardHint}>
              {tr('Waiting on {name}. The work carries on in the meantime.', { name: task.approverName || task.createdByName || tr('the person who set it') })}
            </Text>
          )}
        </Card>
      ) : null}

      {/* What happens next */}
      {anyMove ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{tr('What happens next')}</Text>
          {can.canClaim ? (
            <Button title={tr('Pick this up')} icon={actionIcon('claim')} loading={busy === `claim-${id}`} onPress={() => claim(id)} />
          ) : null}
          {can.canSubmit ? (
            <Button title={tr('Send for review')} icon={actionIcon('submit')} onPress={() => setSheet({ kind: 'update', action: 'submit' })} />
          ) : null}
          {can.canApprove ? (
            <Button title={tr('Approve it')} color={colors.success} icon={actionIcon('approve')} onPress={() => setSheet({ kind: 'update', action: 'approve' })} />
          ) : null}
          {can.canReject ? (
            <Button title={tr('Send it back')} color={colors.warning} icon={actionIcon('sendBack')} onPress={() => setSheet({ kind: 'update', action: 'reject' })} />
          ) : null}
          {can.canWithdraw && !can.canApprove ? (
            <Button title={tr('Pull it back')} variant="secondary" icon={Undo} onPress={() => setSheet({ kind: 'update', action: 'status', to: 'PENDING' })} />
          ) : null}
          {can.canRequestExtension ? (
            <Button title={tr('Ask for more time')} variant="secondary" icon={actionIcon('extension')} onPress={() => setSheet({ kind: 'extension' })} />
          ) : null}
          {can.canDelegate || can.canSplit ? (
            <Button
              title={can.canDelegate ? tr('Delegate — whole or in pieces') : tr('Split it into pieces')}
              variant="secondary"
              icon={actionIcon('delegate')}
              onPress={() => setSheet({ kind: 'delegate' })}
            />
          ) : null}
          {can.canTransfer ? (
            <Button title={tr('Transfer — it went to the wrong person')} variant="secondary" icon={ArrowLeftRight} onPress={() => setSheet({ kind: 'transfer' })} />
          ) : null}
          {extraMoves.map(({ to }) => {
            const w = moveWording(task.status, to);
            const style = w.tone === 'danger' ? { variant: 'danger' } : w.tone === 'go' ? { color: colors.successFill } : w.tone === 'primary' ? {} : { variant: 'secondary' };
            return <Button key={to} title={w.label} icon={w.Icon} {...style} onPress={() => setSheet({ kind: 'update', action: 'status', to })} />;
          })}
          <Text style={styles.cardHint}>{tr('Every move carries a note or a voice note — that is what the history is made of.')}</Text>
        </Card>
      ) : null}

      {/* Footer */}
      {can.canDelete || can.canPurge ? (
        <View style={styles.footerRow}>
          {can.canDelete ? <Button title={tr('Remove')} variant="secondary" color={colors.danger} icon={Trash} onPress={() => remove(false)} style={styles.flex} /> : null}
          {can.canPurge ? <Button title={tr('Delete for good')} variant="danger" icon={TriangleAlert} onPress={() => remove(true)} style={styles.flex} /> : null}
        </View>
      ) : null}

      <BottomSheet
        visible={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={tr('Cannot take this on?')}
        footer={<Button title={tr('Decline it')} variant="danger" size="lg" onPress={confirmDecline} />}
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
        task={doneOpen ? { ...task, can } : null}
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

function Fact({ icon: Icon, label, children, last }) {
  return (
    <View style={[styles.fact, last && styles.factLast]}>
      <Icon size={16} color={colors.textFaint} style={styles.factIcon} />
      <View style={styles.flex}>
        <Text style={styles.factLabel}>{label}</Text>
        {typeof children === 'string' ? <Text style={styles.factValue}>{children}</Text> : children}
      </View>
    </View>
  );
}

function FeedRow({ update, taskId }) {
  const moved = Boolean(update.to) && update.kind !== 'CREATED';
  const tone = moved ? statusColors(update.to) : null;
  const files = (update.files || []).map((f) => viewable(taskId, f));
  const hasVoice = Boolean(update.voiceNote?.storagePath || update.voiceNote?.url);
  return (
    <View style={[styles.feedRow, update.system && styles.faded]}>
      <View style={[styles.feedDot, moved && { backgroundColor: colors.primary }]} />
      <View style={styles.flex}>
        <View style={styles.feedHead}>
          <Text style={styles.feedBy}>{update.byName || tr('System')}</Text>
          {moved ? (
            <View style={[styles.tag, { borderColor: tone.fg }]}>
              <Text style={[styles.tagLabel, { color: tone.fg }]}>{statusLabel(update.to)}</Text>
            </View>
          ) : null}
          <Text style={styles.feedTime}>{timeAgo(update.createdAt)}</Text>
        </View>
        {update.note ? <Text style={styles.feedNote}>{update.note}</Text> : null}
        {hasVoice ? <VoicePlayer source={updateVoiceSource(taskId, update)} durationMs={update.voiceNote.durationMs} style={styles.feedVoice} /> : null}
        {files.length ? <FileGrid files={files} size={60} style={styles.feedFiles} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space(1.5) },
  content: { gap: space(3), paddingBottom: space(10) },
  faded: { opacity: 0.6 },
  head: { gap: space(2), padding: space(3), borderRadius: radius.card, borderWidth: 1, borderLeftWidth: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 8 },
  parentLink: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minHeight: 28 },
  parentText: { fontSize: 13, fontWeight: font.semibold },
  bell: { marginLeft: 'auto' },
  title: { color: colors.text, fontSize: 21, fontWeight: font.bold },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tagLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: font.semibold },
  dot: { width: 8, height: 8, borderRadius: 4 },
  overdueChip: { minHeight: 24, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: '#D92D20' },
  overdueText: { color: colors.white, fontSize: 12, fontWeight: font.bold },
  card: { gap: space(2) },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  cardHint: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  editIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  editTitle: { color: colors.text, fontSize: 15, fontWeight: font.bold },
  editHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 1 },
  lockRow: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start', padding: space(3), borderRadius: radius.input, backgroundColor: colors.muted },
  lockText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  banner: { padding: space(3), gap: space(1), borderRadius: radius.card, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft },
  bannerBad: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  bannerRoutine: { borderColor: colors.success, backgroundColor: colors.successSoft },
  bannerTitle: { color: colors.text, fontSize: 16, fontWeight: font.bold },
  bannerBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  strong: { color: colors.text, fontWeight: font.semibold },
  bannerRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  bannerBtn: { marginTop: space(2) },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  quote: { color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 40 },
  link: { flex: 1, color: colors.primary, fontSize: 14 },
  fact: { flexDirection: 'row', gap: space(2.5), paddingVertical: space(2), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  factLast: { borderBottomWidth: 0 },
  factIcon: { marginTop: 2 },
  factLabel: { color: colors.textFaint, fontSize: 12 },
  factValue: { color: colors.text, fontSize: 15 },
  factFaint: { color: colors.textFaint, fontSize: 12 },
  assigneeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2), alignItems: 'center' },
  editEntry: { gap: space(1.5), paddingTop: space(1) },
  editSep: { marginTop: space(1.5), paddingTop: space(2.5), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  editWho: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  editBy: { color: colors.text, fontSize: 14, fontWeight: font.semibold },
  change: { gap: 3, padding: space(2.5), borderRadius: radius.input, backgroundColor: colors.muted },
  changeLabel: { color: colors.textFaint, fontSize: 11, fontWeight: font.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  changeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  arrow: { marginTop: 3 },
  changeBefore: { flex: 1, color: colors.textFaint, fontSize: 13, lineHeight: 18, textDecorationLine: 'line-through' },
  changeAfter: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: font.semibold },
  piece: { flexDirection: 'row', alignItems: 'center', gap: space(2.5), minHeight: 56, padding: space(3), borderRadius: radius.input, borderWidth: 1, borderLeftWidth: 4 },
  pieceTitle: { color: colors.text, fontSize: 15, fontWeight: font.medium },
  sectionTitle: { ...type.overline, marginTop: space(2) },
  feedTabs: { marginBottom: space(1) },
  empty: { color: colors.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: space(4) },
  feedRow: { flexDirection: 'row', gap: space(2.5), paddingVertical: space(2) },
  feedDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.border },
  feedHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  feedBy: { color: colors.text, fontSize: 14, fontWeight: font.semibold },
  feedTime: { color: colors.textFaint, fontSize: 12 },
  feedNote: { color: colors.textSecondary, fontSize: 14, marginTop: 3, lineHeight: 20 },
  feedVoice: { marginTop: space(1.5) },
  feedFiles: { marginTop: space(2) },
  remark: { marginTop: space(1) },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  footerRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
  sheetText: { ...type.small, lineHeight: 20, marginBottom: space(3) },
});
