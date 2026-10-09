/**
 * One task in a list. THE WHOLE CARD IS THE PRIORITY COLOUR (green once
 * done), from the server's palette via accentFor. Overdue adds a solid red
 * chip and a red deadline; it never changes the tint. The only control is
 * the status pill; the card itself opens the task, and it swipes (a screen
 * reader gets the swipes as actions on the card). `peek` is the first-use
 * peek (TaskSwipe).
 *
 * The HRMS card (2026-10-08): a heavier two-line title, both sides of the
 * handover and the day it was handed over in small print, pill-shaped tags,
 * a labelled "More time" chip that says where the latest ask stands, and a
 * labelled "Overdue" chip. Spacing as HRMS's card (2026-10-09; the compact
 * card of the day before is gone).
 */
import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr, trParts } from '../../i18n';
import { colors, radius, space } from '../../platform/theme';
import { CircleCheck, CircleX, Clock, Mic, Paperclip, Repeat, SquarePen, Tag, Users } from '../icons';
import {
  accentFor,
  assigneeNames,
  dayLabel,
  dueColor,
  dueLabel,
  extensionLook,
  frequencyLabel,
  idOf,
  isOverdue,
  isTerminal,
  personName,
  priorityColor,
  priorityLabel,
  swipeActionsFor,
} from '../taskStatus';
import NudgeBell from './NudgeBell';
import { StatusPill } from './TaskStatusSheets';
import TaskSwipe, { swipeAccessibility } from './TaskSwipe';

const EXT_ICONS = { clock: Clock, check: CircleCheck, x: CircleX };

function TaskCard({ task, meId, nudgedAt, onNudged, onOpen, onStatus, onSwipe, peek = false }) {
  const accent = accentFor(task);
  const late = isOverdue(task);
  const done = isTerminal(task.status);
  const due = dueLabel(task.dueDate, task.status);
  const swipe = useMemo(() => swipeActionsFor(task), [task]);
  const swipeA11y = useMemo(() => swipeAccessibility(swipe, onSwipe), [swipe, onSwipe]);
  const freq = task.recurringTask && task.repeat?.frequency && task.repeat.frequency !== 'ONCE' ? frequencyLabel(task.repeat.frequency) : '';

  const setterId = idOf(task.createdBy);
  const byMe = Boolean(meId) && setterId === meId;
  const onlyMe = byMe && (task.assignees || []).length === 1 && idOf(task.assignees[0].user) === meId;
  const setBy = byMe ? tr('you') : task.createdByName || personName(task.createdBy) || '—';
  const sentById = idOf(task.onBehalf?.by);
  const sentBy = sentById ? (sentById === meId ? tr('you') : task.onBehalf?.byName || '') : '';
  const setFor = task.isOpenPiece ? tr('nobody yet') : assigneeNames(task.assignees);
  const assignedOn = dayLabel(task.assignedAt || task.createdAt);

  // The latest ask for more time (the server's `lastExtension`; an older
  // server only says one is pending).
  const extStatus = task.lastExtension?.status || (task.pendingExtension ? 'PENDING' : '');
  const ext = extensionLook(extStatus);
  const extInk = ext ? (ext.tone === 'success' ? colors.success : ext.tone === 'danger' ? colors.danger : colors.warning) : null;
  const extBg = ext ? (ext.tone === 'success' ? colors.successSoft : ext.tone === 'danger' ? colors.dangerSoft : colors.warningSoft) : null;
  const ExtIcon = ext ? EXT_ICONS[ext.icon] || Clock : null;

  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const pieces = Number(task.subtaskCount ?? task.childCount) || 0;
  const piecesDone = Number(task.subtasksDone ?? task.childDoneCount) || 0;
  const showBar = !done && (progress > 0 || pieces > 0);
  const teamName = task.team?.name || task.teamName || '';
  const category = typeof task.category === 'string' ? task.category : task.category?.name;

  return (
    <TaskSwipe actions={swipe} onAction={onSwipe} peek={peek}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={[task.title, due.text, late ? tr('Overdue') : '', ext ? ext.label : ''].filter(Boolean).join('. ')}
        {...swipeA11y}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: accent.bg, borderColor: accent.border, borderLeftColor: accent.solid },
          accent.faded && styles.faded,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.codeRow}>
          {task.serial ? <Text style={[styles.serial, { color: accent.ink }]}>#{task.serial}</Text> : null}
          {task.code ? <Text style={styles.code}>{task.code}</Text> : null}
          {task.isPiece && task.parentCode ? (
            <Text style={styles.code} numberOfLines={1}>
              {tr('· part of {code}', { code: task.parentCode })}
            </Text>
          ) : null}
          <View style={styles.codeEnd}>
            {/* More time asked, and where the latest ask stands; overdue. */}
            {ext ? (
              <View style={[styles.extChip, { borderColor: extInk, backgroundColor: extBg }]}>
                <ExtIcon size={11} color={extInk} strokeWidth={2.5} />
                <Text style={[styles.extText, { color: extInk }]} numberOfLines={1}>
                  {ext.label}
                </Text>
              </View>
            ) : null}
            {late ? (
              <View style={styles.overdueChip}>
                <Text style={styles.overdueText}>{tr('Overdue')}</Text>
              </View>
            ) : null}
            <NudgeBell task={task} override={nudgedAt} onNudged={onNudged} size={34} />
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>

        {/* Who handed it to whom: two lines at most, so a long list of
            assignees wraps rather than pushing the deadline off the card. */}
        <Text style={styles.meta} numberOfLines={2}>
          {onlyMe ? (
            tr('Your own task')
          ) : (
            <>
              <Text style={styles.metaFaint}>{trParts('By {name}', { name: <Text style={styles.meta}>{setBy}</Text> })}</Text>
              {sentBy ? <Text style={styles.metaFaint}> {tr('(sent by {name})', { name: sentBy })}</Text> : null}
              <Text style={styles.metaFaint}>
                {'  →  '}
                {trParts('To {name}', { name: <Text style={styles.meta}>{setFor}</Text> })}
              </Text>
            </>
          )}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, styles.metaFaint]} numberOfLines={1}>
            {assignedOn ? trParts('Assigned {date}', { date: <Text style={styles.meta}>{assignedOn}</Text> }) : null}
          </Text>
          <Text style={[styles.meta, { color: dueColor(due.tone) }]} numberOfLines={1}>
            {due.text}
          </Text>
        </View>

        {showBar ? (
          <View style={styles.barWrap}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%`, backgroundColor: accent.solid }]} />
            </View>
            <View style={styles.barRow}>
              <Text style={[styles.barText, { color: accent.ink }]}>{tr('{n}% done', { n: progress })}</Text>
              {pieces > 0 ? <Text style={styles.barText}>{tr('{done}/{total} pieces', { done: piecesDone, total: pieces })}</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={styles.footRow}>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <View style={[styles.dot, { backgroundColor: priorityColor(task.priority).solid }]} />
              <Text style={styles.tagLabel}>{priorityLabel(task.priority)}</Text>
            </View>
            {freq ? (
              <View style={styles.tag}>
                <Repeat size={11} color={colors.textSecondary} />
                <Text style={styles.tagLabel}>{freq}</Text>
              </View>
            ) : null}
            {teamName ? (
              <View style={styles.tag}>
                <Users size={11} color={colors.textSecondary} />
                <Text style={styles.tagLabel} numberOfLines={1}>
                  {teamName}
                </Text>
              </View>
            ) : null}
            {category ? (
              <View style={styles.tag}>
                <Tag size={11} color={colors.textSecondary} />
                <Text style={styles.tagLabel} numberOfLines={1}>
                  {category}
                </Text>
              </View>
            ) : null}
            {/* Changed after it was sent, and nobody has taken it on yet: worth
                a second read before accepting. */}
            {task.editCount > 0 && task.status === 'PENDING' ? (
              <View style={[styles.tag, styles.editedTag]}>
                <SquarePen size={11} color={colors.warning} />
                <Text style={[styles.tagLabel, { color: colors.warning }]}>
                  {task.editCount > 1 ? tr('Edited ×{n}', { n: task.editCount }) : tr('Edited')}
                </Text>
              </View>
            ) : null}
            {task.hasVoiceNote ? <Mic size={13} color={accent.ink} /> : null}
            {task.attachmentCount > 0 ? <Paperclip size={14} color={accent.ink} /> : null}
          </View>
          <StatusPill task={task} onPress={onStatus} />
        </View>
      </Pressable>
    </TaskSwipe>
  );
}

export default memo(TaskCard);

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1, borderLeftWidth: 4, paddingVertical: space(3), paddingHorizontal: space(3.5), gap: 8 },
  faded: { opacity: 0.6 },
  pressed: { opacity: 0.92 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  // The more-time chip, the overdue chip and the bell, pinned right of the code.
  codeEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space(2) },
  serial: { fontSize: 11, fontWeight: '800' },
  code: { color: colors.textSecondary, fontSize: 10, letterSpacing: 0.3, flexShrink: 1 },
  extChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 22,
    maxWidth: 170,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  extText: { fontSize: 10.5, fontWeight: '800', flexShrink: 1 },
  overdueChip: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.dangerFill },
  overdueText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  title: { color: colors.text, fontSize: 15.5, fontWeight: '800', lineHeight: 21 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  meta: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },
  metaFaint: { color: colors.textFaint },
  barWrap: { gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  barText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2), marginTop: 2 },
  tagRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  editedTag: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  tagLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
