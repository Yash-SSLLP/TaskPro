/**
 * Choosing how the app looks: System (follow the phone), Light or Dark.
 *
 * The palette is fixed when the app starts (see theme.js and index.js), so a
 * new choice is saved and the app restarts to apply it. "System" also
 * restarts on its own when the phone switches while the app is in the
 * background, so it never shows the old look on return.
 */
import React, { useEffect } from 'react';
import { AppState, Appearance, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNRestart from 'react-native-restart';
import { tr } from '../i18n';
import { Check, Moon, Smartphone, Sun } from './icons';
import { colors, font, radius, space, theme, THEME_KEY, THEME_MODES } from './theme';
import { BottomSheet, confirm, toast } from './ui';

const ICONS = { system: Smartphone, light: Sun, dark: Moon };

export function themeLabel(mode) {
  return { system: tr('System default'), light: tr('Light'), dark: tr('Dark') }[mode] || tr('System default');
}

async function restartWith(mode) {
  try {
    await AsyncStorage.setItem(THEME_KEY, mode);
  } catch {
    toast.error(tr('Could not save that. Try again.'));
    return;
  }
  try {
    RNRestart.restart('theme');
  } catch {
    toast(tr('Close and reopen the app to see the new look.'));
  }
}

/** Ask, save, restart. */
export async function chooseTheme(mode) {
  if (mode === theme.mode) return;
  const ok = await confirm({
    title: tr('Change the look?'),
    message: tr('The app restarts to switch to {theme}.', { theme: themeLabel(mode) }),
    confirmLabel: tr('Restart'),
  });
  if (ok) await restartWith(mode);
}

/** "System": restart when the phone changed between light and dark while the app was away. */
export function useFollowSystemTheme() {
  useEffect(() => {
    if (theme.mode !== 'system') return undefined;
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (state) => {
      const back = last === 'background' && state === 'active';
      last = state;
      const now = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
      if (back && now !== theme.scheme) restartWith('system');
    });
    return () => sub.remove();
  }, []);
}

export function ThemeSheet({ visible, onClose }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Appearance')} subtitle={tr('Choose how the app looks.')}>
      {THEME_MODES.map((mode) => {
        const on = mode === theme.mode;
        const Icon = ICONS[mode];
        return (
          <Pressable
            key={mode}
            onPress={() => {
              onClose?.();
              // After the sheet has closed: two modals at once can lose the second on Android.
              setTimeout(() => chooseTheme(mode), 300);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={themeLabel(mode)}
            style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
          >
            <Icon size={20} color={on ? colors.primary : colors.textSecondary} strokeWidth={2} />
            <View style={styles.texts}>
              <Text style={[styles.label, on && styles.labelOn]}>{themeLabel(mode)}</Text>
              {mode === 'system' ? <Text style={styles.hint}>{tr("Matches your phone's setting")}</Text> : null}
            </View>
            {on ? <Check size={20} color={colors.primary} strokeWidth={2.5} /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    marginBottom: space(1),
  },
  rowOn: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.75 },
  texts: { flex: 1 },
  label: { fontSize: 17, fontWeight: font.semibold, color: colors.text },
  labelOn: { color: colors.primary },
  hint: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
});
