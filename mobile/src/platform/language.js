/**
 * Choosing the app's language: the switch itself (live, remembered on this
 * phone, and saved to the account as `settings.lang` when signed in) and the
 * sheet that offers the six languages, each named in its own script.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, setLanguage, tr, useLang } from '../i18n';
import productConfig from '../product/config';
import { settingsApi } from './endpoints';
import { Check, Languages } from './icons';
import { useSession } from './session';
import { colors, font, radius, space } from './theme';
import { BottomSheet } from './ui';

/** Switch now; tell the server when somebody is signed in. */
export async function chooseLanguage(code) {
  await setLanguage(code, { chosen: true });
  const s = useSession.getState();
  if (s.status !== 'signedIn') return;
  s.setSettings({ ...s.settings, lang: code });
  try {
    const settings = await settingsApi.update({ lang: code });
    if (settings) useSession.getState().setSettings(settings);
  } catch {
    /* the phone keeps the choice; the next sign-in sends it again */
  }
}

export function LanguageSheet({ visible, onClose }) {
  const lang = useLang();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={tr('Language')} subtitle={tr('Choose the language for {app}.', { app: productConfig.name })}>
      {LANGUAGES.map((l) => {
        const on = l.code === lang;
        return (
          <Pressable
            key={l.code}
            onPress={async () => {
              await chooseLanguage(l.code);
              onClose?.();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${l.native} (${l.name})`}
            style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
          >
            <View style={styles.texts}>
              <Text style={[styles.native, on && styles.nativeOn]}>{l.native}</Text>
              {l.native !== l.name ? <Text style={styles.name}>{l.name}</Text> : null}
            </View>
            {on ? <Check size={20} color={colors.primary} strokeWidth={2.5} /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

/** A small "Language: हिन्दी" button (the sign-in screen). */
export function LanguageButton({ onPress, style }) {
  const lang = useLang();
  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tr('Language')}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Languages size={18} color={colors.textSecondary} />
      <Text style={styles.buttonText}>{current.native}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    marginBottom: space(1),
  },
  rowOn: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.75 },
  texts: { flex: 1 },
  native: { fontSize: 17, fontWeight: font.semibold, color: colors.text },
  nativeOn: { color: colors.primary },
  name: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    minHeight: 40,
    paddingHorizontal: space(3),
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignSelf: 'flex-end',
  },
  buttonText: { fontSize: 14, fontWeight: font.semibold, color: colors.text },
});
