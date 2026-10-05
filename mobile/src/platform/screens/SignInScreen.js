/**
 * Sign in: logo, one line about the product, login + password, and the ways
 * out: forgot password, create an account, server settings, and the app's
 * language (top right).
 */
import React, { useCallback, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { getApiUrl } from '../api';
import { Server } from '../icons';
import { LanguageButton, LanguageSheet } from '../language';
import { useSession } from '../session';
import { colors, font, space, type } from '../theme';
import { Button, Notice, Screen, TextButton, TextField } from '../ui';

const hostOf = (url) => url.replace(/^https?:\/\//, '');

export default function SignInScreen({ navigation }) {
  const signIn = useSession((s) => s.signIn);
  const notice = useSession((s) => s.notice);
  const clearNotice = useSession((s) => s.clearNotice);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [langOpen, setLangOpen] = useState(false);
  const passwordRef = useRef(null);
  const [host, setHost] = useState(hostOf(getApiUrl()));
  useFocusEffect(useCallback(() => setHost(hostOf(getApiUrl())), []));

  const submit = async () => {
    const next = {};
    if (!identifier.trim()) next.identifier = tr('Enter your email or mobile number');
    if (!password) next.password = tr('Enter your password');
    setErrors(next);
    if (Object.keys(next).length) return;
    setError(null);
    clearNotice();
    try {
      await signIn(identifier, password);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen scroll keyboard contentStyle={styles.content}>
      <LanguageButton onPress={() => setLangOpen(true)} />
      <View style={styles.brand}>
        <Image source={productConfig.logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.name}>{productConfig.name}</Text>
        <Text style={styles.tagline}>{tr(productConfig.tagline)}</Text>
      </View>

      <Notice tone="warning">{notice}</Notice>

      <TextField
        label={tr('Email or mobile')}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={errors.identifier}
      />
      <TextField
        ref={passwordRef}
        label={tr('Password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={errors.password}
      />

      <Notice tone="danger">{error}</Notice>

      <Button title={tr('Sign in')} size="lg" onPress={submit} />
      <TextButton title={tr('Forgot password?')} onPress={() => navigation.navigate('ForgotPassword', { identifier: identifier.trim() })} style={styles.forgot} />

      <View style={styles.newHere}>
        <Text style={styles.newHereText}>{tr('New to {name}?', { name: productConfig.name })}</Text>
        <Button title={tr('Create your account')} variant="secondary" onPress={() => navigation.navigate('SignUp')} />
      </View>

      <TextButton
        title={tr('Server settings · {host}', { host })}
        icon={Server}
        color={colors.textSecondary}
        onPress={() => navigation.navigate('ServerSettings')}
        style={styles.server}
      />
      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space(3), flexGrow: 1 },
  brand: { alignItems: 'center', marginTop: space(4), marginBottom: space(8) },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: space(3) },
  name: { fontSize: 26, fontWeight: font.bold, color: colors.text },
  tagline: { ...type.small, fontSize: 15, marginTop: space(1), textAlign: 'center' },
  forgot: { marginTop: space(2) },
  newHere: { marginTop: space(8), gap: space(2) },
  newHereText: { ...type.small, textAlign: 'center' },
  server: { marginTop: 'auto', paddingTop: space(8) },
});
