/**
 * Sign in: logo, one line about the product, login + password, and the ways
 * out: forgot password, create an account, and the app's look and language
 * (top right). The server address is not shown: a long press on the logo opens
 * Server settings, for whoever needs to point the app somewhere else.
 */
import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { ThemeButton, ThemeSheet } from '../appearance';
import { LanguageButton, LanguageSheet } from '../language';
import { useSession } from '../session';
import { colors, font, space, type } from '../theme';
import { Button, Notice, Screen, TextButton, TextField } from '../ui';

export default function SignInScreen({ navigation }) {
  const signIn = useSession((s) => s.signIn);
  const notice = useSession((s) => s.notice);
  const clearNotice = useSession((s) => s.clearNotice);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const passwordRef = useRef(null);

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
      <View style={styles.topRow}>
        <ThemeButton onPress={() => setThemeOpen(true)} />
        <LanguageButton onPress={() => setLangOpen(true)} style={styles.topButton} />
      </View>
      <View style={styles.brand}>
        <Pressable onLongPress={() => navigation.navigate('ServerSettings')} delayLongPress={1500} accessible={false}>
          <Image source={productConfig.logo} style={styles.logo} accessibilityIgnoresInvertColors />
        </Pressable>
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

      <LanguageSheet visible={langOpen} onClose={() => setLangOpen(false)} />
      <ThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space(3), flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space(2) },
  topButton: { alignSelf: 'auto' },
  brand: { alignItems: 'center', marginTop: space(4), marginBottom: space(8) },
  // The tile carries its own squircle and transparent corners: no clipping.
  logo: { width: 80, height: 80, marginBottom: space(3) },
  name: { fontSize: 28, fontWeight: font.semibold, letterSpacing: -0.6, color: colors.text },
  tagline: { ...type.small, fontSize: 15, marginTop: space(1), textAlign: 'center' },
  forgot: { marginTop: space(2) },
  newHere: { marginTop: space(8), gap: space(2) },
  newHereText: { ...type.small, textAlign: 'center' },
});
