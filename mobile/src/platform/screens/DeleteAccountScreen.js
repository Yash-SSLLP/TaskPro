/**
 * Delete my account (Google Play and the App Store require it in the app).
 * Asks for the password, confirms once more, then the server deletes the
 * account and this phone signs out.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { authApi } from '../endpoints';
import { useSession } from '../session';
import { colors, space, type } from '../theme';
import { Button, confirm, Header, Notice, Screen, TextButton, TextField } from '../ui';

export default function DeleteAccountScreen({ navigation }) {
  const signOut = useSession((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);

  const points = [
    tr('Your name, email, mobile number, password, Task Pin and settings are deleted.'),
    tr('Your contacts, team memberships and alerts are deleted.'),
    tr('Tasks only you were on are deleted, with their files and voice notes.'),
    tr('Tasks you shared stay with the other people, with your name shown as "Deleted user".'),
    tr('Teams you own pass to an admin or member.'),
  ];

  const submit = async () => {
    if (!password) {
      setFieldError(tr('Enter your password'));
      return;
    }
    setFieldError(null);
    setError(null);
    const ok = await confirm({
      title: tr('Delete your account?'),
      message: tr('This cannot be undone.'),
      confirmLabel: tr('Delete account'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await authApi.deleteAccount(password);
      // The server has already removed this phone's push token and ended every session.
      await signOut({ notice: tr('Your account has been deleted.'), remote: false });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen
      header={<Header back title={tr('Delete account')} />}
      scroll
      keyboard
      footer={<Button title={tr('Delete my account')} variant="danger" size="lg" onPress={submit} />}
    >
      <Text style={styles.intro}>{tr('Deleting your account cannot be undone. This is what happens:')}</Text>
      <View style={styles.list}>
        {points.map((p) => (
          <View key={p} style={styles.li}>
            <Text style={styles.bullet}>{'\u2022'}</Text>
            <Text style={styles.liText}>{p}</Text>
          </View>
        ))}
      </View>
      <TextField
        label={tr('Your password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={fieldError}
      />
      <Notice tone="danger">{error}</Notice>
      <TextButton title={tr('Privacy policy')} onPress={() => navigation.navigate('PrivacyPolicy')} style={styles.link} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, fontSize: 15, lineHeight: 21, marginBottom: space(3) },
  list: { marginBottom: space(5) },
  li: { flexDirection: 'row', gap: space(2), marginBottom: space(1.5) },
  bullet: { ...type.small, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  liText: { ...type.small, flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  link: { marginTop: space(3) },
});
