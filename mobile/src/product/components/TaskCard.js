/**
 * One task in a list. THE WHOLE CARD IS THE PRIORITY COLOUR (green once
 * done), from the server's palette via accentFor. Overdue adds a solid red
 * chip and a red deadline; it never changes the tint. The only control is
 * the status pill; the card itself opens the task, and it swipes.
 */
import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr, trParts } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { Mic, Paperclip, Repeat, SquarePen, Tag, Users } from '../icons';
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
import TaskSwipe from './TaskSwipe';

function TaskCard({ task, meId, nudgedAt, onNudged, onOpen, onStatus, onSwipe }) {
  const accent = accentFor(task);
  const late = isOverdue(task);
  const done = isTerminal(task.status);
  const due = dueLabel(task.dueDate, task.status);
  const swipe = useMemo(() => swipeActionsFor(task), [task]);
  const freq = task.recurringTask && task.repeat?.frequency && task.repeat.frequency !== 'ONCE' ? frequencyLabel(task.repeat.frequency) : '';

  const setterId = idOf(task.createdBy);
  const byMe = Boolean(meId) && setterId === meId;
  const onlyMe = byMe && (task.assignees || []).length === 1 && idOf(task.assignees[0].user) === meId;
  const setBy = byMe ? tr('you') : task.createdByName || personName(task.createdBy) || '—';
  const sentById = idOf(task.onBehalf?.by);
  const sentBy = sentById ? (sentById === meId ? tr('you') : task.onBehalf?.byName || '') : '';
  const setFor = task.isOpenPiece ? tr('nobody yet') : assigneeNames(task.assignees);
  const assignedOn = dayLabel(task.assignedAt || task.createdAt);

  const extStatus = task.lastExtension?.status || (task.pendingExtension ? 'PENDING' : '');
  const ext = extensionLook(extStatus);
  const extInk = ext ? (ext.tone === 'success' ? colors.success : ext.tone === 'danger' ? colors.danger : colors.warning) : null;
  const extBg = ext ? (ext.tone === 'success' ? colors.successSoft : ext.tone === 'danger' ? colors.dangerSoft : colors.warningSoft) : null;

  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const pieces = Number(task.subtaskCount ?? task.childCount) || 0;
  const piecesDone = Number(task.subtasksDone ?? task.childDoneCount) || 0;
  const showBar = !done && (progress > 0 || pieces > 0);
  const teamName = task.team?.name || task.teamName || '';

  return (
    <TaskSwipe actions={swipe} onAction={onSwipe}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${due.text}`}
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
            {ext ? (
              <View style={[styles.extChip, { borderColor: extInk, backgroundColor: extBg }]}>
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
            {task.category ? (
              <View style={styles.tag}>
                <Tag size={11} color={colors.textSecondary} />
                <Text style={styles.tagLabel} numberOfLines={1}>
                  {typeof task.category === 'string' ? task.category : task.category?.name}
                </Text>
              </View>
            ) : null}
            {task.editCount > 0 && task.status === 'PENDING' ? (
              <View style={[styles.tag, styles.editedTag]}>
                <SquarePen size={11} color={colors.warning} />
                <Text style={[styles.tagLabel, { color: colors.warning }]}>
                  {task.editCount > 1 ? tr('Edited ×{n}', { n: task.editCount }) : tr('Edited')}
                </Text>
              </View>
            ) : null}
            {task.hasVoiceNote ? <Mic size={14} color={accent.ink} /> : null}
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
  card: { borderRadius: radius.card, borderWidth: 1, borderLeftWidth: 4, padding: space(3), gap: space(2) },
  faded: { opacity: 0.6 },
  pressed: { opacity: 0.92 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  codeEnd: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space(2) },
  serial: { fontSize: 12, fontWeight: font.bold },
  code: { color: colors.textSecondary, fontSize: 11, letterSpacing: 0.3, flexShrink: 1 },
  overdueChip: { minHeight: 22, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: '#D92D20' },
  overdueText: { color: colors.white, fontSize: 11, fontWeight: font.bold },
  extChip: { flexDirection: 'row', alignItems: 'center', minHeight: 22, maxWidth: 150, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  extText: { fontSize: 10.5, fontWeight: font.bold, flexShrink: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: font.semibold },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  meta: { color: colors.textSecondary, fontSize: 13, flexShrink: 1 },
  metaFaint: { color: colors.textFaint },
  barWrap: { gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  barRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(2) },
  barText: { color: colors.textSecondary, fontSize: 11, fontWeight: font.semibold },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2), marginTop: 2 },
  tagRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  editedTag: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  tagLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: font.semibold, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
