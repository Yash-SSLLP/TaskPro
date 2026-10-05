/**
 * Choose a new password: shown instead of the app while an admin-set
 * (temporary) password is in use. The server allows nothing else until then.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { authApi } from '../endpoints';
import { Lock } from '../icons';
import { useSession } from '../session';
import { colors, font, space, type } from '../theme';
import { Button, Notice, Screen, TextButton, TextField } from '../ui';
import { tr } from '../../i18n';

export default function ForcePasswordScreen() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const replaceToken = useSession((s) => s.replaceToken);
  const signOut = useSession((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const againRef = useRef(null);

  const submit = async () => {
    const e = {};
    if (password.length < 8) e.password = tr('Use at least 8 characters');
    else if (password !== again) e.again = tr('The two passwords do not match');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    try {
      const res = await authApi.changePassword({ newPassword: password });
      await replaceToken(res.token);
      setUser(res.user ? { ...res.user, mustChangePassword: false } : { ...user, mustChangePassword: false });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen scroll keyboard contentStyle={styles.content}>
      <View style={styles.icon}>
        <Lock size={28} color={colors.primary} />
      </View>
      <Text style={styles.title}>{tr('Choose your own password')}</Text>
      <Text style={styles.intro}>
        {tr('Hi {name}, you signed in with a temporary password. Choose a new one that only you know.', { name: user?.name?.split(' ')[0] || '' })}
      </Text>
      <TextField
        label={tr('New password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => againRef.current?.focus()}
        hint={tr('At least 8 characters.')}
        error={errors.password}
      />
      <TextField
        ref={againRef}
        label={tr('Type it again')}
        value={again}
        onChangeText={setAgain}
        secure
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={errors.again}
      />
      <Notice tone="danger">{error}</Notice>
      <Button title={tr('Save and continue')} size="lg" onPress={submit} />
      <TextButton title={tr('Sign out')} color={colors.textSecondary} onPress={() => signOut()} style={styles.signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space(10) },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: space(4),
  },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
  intro: { ...type.small, fontSize: 15, textAlign: 'center', marginTop: space(2), marginBottom: space(6), lineHeight: 21 },
  signOut: { marginTop: space(4) },
});
