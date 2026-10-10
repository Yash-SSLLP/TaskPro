/**
 * Web only (rendered by WebHosts): asks once to turn on notifications in the
 * iPhone home-screen app.
 *
 * iOS grants notification permission only from a tap, and only to an app
 * added to the home screen, so this cannot happen silently the way the phone
 * app's registerForPush does. Shown when signed in, installed, and not yet
 * asked; "Not now" waits a few days before asking again. Once allowed,
 * onAllowed (registerForPush) subscribes the phone.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { Bell } from '../icons';
import { colors, font, radius, space, type } from '../theme';
import { Button } from '../ui/Button';
import { isStandalone, requestWebPushPermission, webPushSupported } from './webPush';

const SNOOZE_KEY = 'taskpro.pushPromptSnooze';
const SNOOZE_DAYS = 3;

function snoozed() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export default function PushPrompt({ onAllowed }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!webPushSupported() || !isStandalone() || Notification.permission !== 'default' || snoozed()) return undefined;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch {
      /* asks again next time */
    }
    setOpen(false);
  };
  const allow = () => {
    // Inside the tap itself: iOS ignores a request made after an await.
    requestWebPushPermission()
      .then((granted) => {
        if (granted) onAllowed?.();
      })
      .catch(() => {})
      .finally(() => setOpen(false));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <View style={styles.fill}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.icon}>
            <Bell size={26} color={colors.primary} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {tr('Turn on notifications?')}
          </Text>
          <Text style={styles.message}>{tr('New tasks, updates and reminders on this iPhone.')}</Text>
          <View style={styles.buttons}>
            <Button title={tr('Not now')} variant="secondary" onPress={later} style={styles.button} />
            <Button title={tr('Allow')} onPress={allow} style={styles.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.card, padding: space(5), alignItems: 'center' },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: space(3),
  },
  title: { fontSize: 18, fontWeight: font.semibold, color: colors.text, textAlign: 'center' },
  message: { ...type.body, color: colors.textSecondary, marginTop: space(2), lineHeight: 22, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: space(3), marginTop: space(6), alignSelf: 'stretch' },
  button: { flex: 1 },
});
