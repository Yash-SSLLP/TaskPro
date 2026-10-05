/**
 * Change password. The server signs out every other device and hands this
 * phone a fresh token.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { authApi } from '../endpoints';
import { useSession } from '../session';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextField, toast } from '../ui';
import { tr } from '../../i18n';

export default function ChangePasswordScreen({ navigation }) {
  const setUser = useSession((s) => s.setUser);
  const replaceToken = useSession((s) => s.replaceToken);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const nextRef = useRef(null);
  const againRef = useRef(null);

  const save = async () => {
    const e = {};
    if (!current) e.current = tr('Enter your current password');
    if (next.length < 8) e.next = tr('Use at least 8 characters');
    else if (next !== again) e.again = tr('The two passwords do not match');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    try {
      const res = await authApi.changePassword({ currentPassword: current, newPassword: next });
      await replaceToken(res.token);
      setUser(res.user);
      toast.success(tr('Password changed. Other phones are signed out.'));
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen header={<Header back title={tr('Change password')} />} scroll keyboard footer={<Button title={tr('Change password')} size="lg" onPress={save} />}>
      <Text style={styles.intro}>{tr('After this, you stay signed in here and are signed out everywhere else.')}</Text>
      <TextField
        label={tr('Current password')}
        value={current}
        onChangeText={setCurrent}
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => nextRef.current?.focus()}
        error={errors.current}
      />
      <TextField
        ref={nextRef}
        label={tr('New password')}
        value={next}
        onChangeText={setNext}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => againRef.current?.focus()}
        hint={tr('At least 8 characters.')}
        error={errors.next}
      />
      <TextField
        ref={againRef}
        label={tr('Type the new password again')}
        value={again}
        onChangeText={setAgain}
        secure
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={save}
        error={errors.again}
      />
      <Notice tone="danger">{error}</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.small, fontSize: 15, marginBottom: space(5), lineHeight: 21 },
});
