/**
 * Set a new password with the reset code from the email
 * (POST /api/auth/reset-password { token, newPassword }).
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { tr } from '../../i18n';
import { authApi } from '../endpoints';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextField, toast } from '../ui';

export default function ResetPasswordScreen({ navigation, route }) {
  const [code, setCode] = useState(route.params?.token || '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const passRef = useRef(null);
  const againRef = useRef(null);

  const submit = async () => {
    const e = {};
    if (!code.trim()) e.code = tr('Enter the code from the email');
    if (password.length < 8) e.password = tr('Use at least 8 characters');
    else if (password !== again) e.again = tr('The two passwords do not match');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    try {
      await authApi.resetPassword(code.trim(), password);
      toast.success(tr('Password changed. Sign in with your new password.'));
      navigation.navigate('SignIn');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen header={<Header back title={tr('Reset password')} />} scroll keyboard>
      <Text style={styles.intro}>{tr('Paste the code from the email, then choose a new password.')}</Text>
      <TextField
        label={tr('Reset code')}
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passRef.current?.focus()}
        error={errors.code}
      />
      <TextField
        ref={passRef}
        label={tr('New password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
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
      <Button title={tr('Set new password')} size="lg" onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.small, fontSize: 15, marginBottom: space(5), lineHeight: 21 },
});
