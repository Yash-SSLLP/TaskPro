/**
 * Forgot password: sends the request and shows the server's answer (an email
 * is on its way, or who to ask). "I have a reset code" opens the screen that
 * sets a new password with the code from the email.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { tr } from '../../i18n';
import { authApi } from '../endpoints';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextButton, TextField } from '../ui';

export default function ForgotPasswordScreen({ navigation, route }) {
  const [identifier, setIdentifier] = useState(route.params?.identifier || '');
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!identifier.trim()) {
      setFieldError(tr('Enter your email or mobile number'));
      return;
    }
    setFieldError(null);
    setError(null);
    try {
      const res = await authApi.forgotPassword(identifier.trim());
      setResult(res?.message || (res?.emailEnabled ? tr('If that account exists, an email with a reset code is on its way.') : tr('Please contact support to reset your password.')));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen header={<Header back title={tr('Forgot password')} />} scroll keyboard>
      {result ? (
        <>
          <Notice tone="success">{result}</Notice>
          <Button title={tr('I have a reset code')} onPress={() => navigation.navigate('ResetPassword')} />
          <TextButton title={tr('Back to sign in')} onPress={() => navigation.goBack()} style={styles.more} />
        </>
      ) : (
        <>
          <Text style={styles.intro}>{tr('Enter what you sign in with. We’ll tell you how to get back in.')}</Text>
          <TextField
            label={tr('Email or mobile')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!identifier}
            returnKeyType="send"
            onSubmitEditing={submit}
            error={fieldError}
          />
          <Notice tone="danger">{error}</Notice>
          <Button title={tr('Continue')} size="lg" onPress={submit} />
          <TextButton title={tr('I have a reset code')} onPress={() => navigation.navigate('ResetPassword')} style={styles.more} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.small, fontSize: 15, marginBottom: space(5), lineHeight: 21 },
  more: { marginTop: space(3) },
});
