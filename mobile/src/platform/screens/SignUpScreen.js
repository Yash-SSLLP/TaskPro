/**
 * Create your account: your name, email or mobile, and a password. Everyone
 * signs up as themselves; the new account gets its own Task Pin, shown on
 * the next screen (WelcomePinScreen).
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { useSession } from '../session';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextButton, TextField } from '../ui';

export default function SignUpScreen({ navigation }) {
  const signUp = useSession((s) => s.signUp);
  const [form, setForm] = useState({ name: '', identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const refs = { identifier: useRef(null), password: useRef(null) };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const e = {};
    if (!form.name.trim()) e.name = tr('Enter your name');
    if (!form.identifier.trim()) e.identifier = tr('Enter your email or mobile number');
    if (form.password.length < 8) e.password = tr('Use at least 8 characters');
    setErrors(e);
    if (Object.keys(e).length) return;
    setError(null);
    try {
      await signUp({ name: form.name.trim(), identifier: form.identifier.trim(), password: form.password });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen header={<Header back title={tr('Create your account')} />} scroll keyboard>
      <Text style={styles.intro}>
        {tr('Sign up for {name}. You get your own Task Pin: share it, and people can add you and give you tasks.', { name: productConfig.name })}
      </Text>
      <TextField
        label={tr('Your name')}
        value={form.name}
        onChangeText={set('name')}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => refs.identifier.current?.focus()}
        error={errors.name}
      />
      <TextField
        ref={refs.identifier}
        label={tr('Email or mobile')}
        value={form.identifier}
        onChangeText={set('identifier')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => refs.password.current?.focus()}
        hint={tr("You'll use this to sign in.")}
        error={errors.identifier}
      />
      <TextField
        ref={refs.password}
        label={tr('Password')}
        value={form.password}
        onChangeText={set('password')}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        hint={tr('At least 8 characters.')}
        error={errors.password}
      />
      <Notice tone="danger">{error}</Notice>
      <Text style={styles.consent}>{tr('By creating an account you agree to our privacy policy.')}</Text>
      <TextButton title={tr('Read the privacy policy')} onPress={() => navigation.navigate('PrivacyPolicy')} style={styles.policy} />
      <Button title={tr('Create account')} size="lg" onPress={submit} />
      <TextButton title={tr('Already have an account? Sign in')} onPress={() => navigation.goBack()} style={styles.back} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.small, fontSize: 15, marginBottom: space(5), lineHeight: 21 },
  back: { marginTop: space(3) },
  consent: { ...type.small, marginBottom: space(1) },
  policy: { marginBottom: space(4) },
});
