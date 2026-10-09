/**
 * "WhatsApp" under the reminder bell on a task: opens a WhatsApp chat with
 * the person the bell reaches, the reminder and the task's link typed in.
 * Only for people who agreed to it through a WhatsApp invite link and have a
 * mobile number; the server sends them as `can.whatsappTo`.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { getApiUrl } from '../../platform/api';
import { WhatsAppIcon, WHATSAPP_GREEN } from '../../platform/components/WhatsAppIcon';
import { openWhatsapp } from '../../platform/invite';
import productConfig from '../config';
import { fullWhen, isOverdue } from '../taskStatus';

const firstName = (name) => String(name || '').split(' ')[0];

export function whatsappReminder(task, to) {
  const url = `${getApiUrl()}/tasks/${task._id}`;
  const title = `"${task.title}"${task.code ? ` (${task.code})` : ''}`;
  const vars = { name: firstName(to.name), title, app: productConfig.name, url };
  if (task.can?.nudgeTo === 'approver') {
    return tr("Hi {name}, I've handed in the task {title} on {app}. Could you review it?\nOpen it: {url}", vars);
  }
  const lines = [tr('Hi {name}, a reminder about the task {title} on {app}.', vars)];
  if (task.dueDate) {
    lines.push(isOverdue(task) ? tr('Due: {when} (overdue)', { when: fullWhen(task.dueDate) }) : tr('Due: {when}', { when: fullWhen(task.dueDate) }));
  }
  lines.push(tr('Open it: {url}', vars));
  return lines.join('\n');
}

export default function WhatsAppNudge({ task, style }) {
  const people = task.can?.whatsappTo || [];
  if (!people.length) return null;
  return (
    <View style={[styles.wrap, style]}>
      {people.map((p) => {
        const label = people.length > 1 ? tr('WhatsApp {name}', { name: firstName(p.name) }) : tr('WhatsApp');
        return (
          <Pressable
            key={p.id}
            onPress={() => openWhatsapp(whatsappReminder(task, p), p.phone)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={tr('WhatsApp {name} about this task', { name: p.name })}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <WhatsAppIcon size={15} color="#FFFFFF" />
            <Text style={styles.text} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end', gap: 6 },
  // The bell pill's size (36), so the two line up under each other.
  pill: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: WHATSAPP_GREEN },
  text: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  pressed: { opacity: 0.75 },
});
