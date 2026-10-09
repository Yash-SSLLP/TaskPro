/**
 * Add a person (Super Admin): the account is made exactly as sign-up makes it
 * (a Task Pin, the welcome task), with a temporary password they must change
 * the first time they sign in. The password is shown once, to copy or share.
 */
import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import productConfig from '../../../product/config';
import { tr } from '../../../i18n';
import { platformApi, platformKeys } from '../../endpoints';
import { Copy, KeyRound, RefreshCw, Share as ShareIcon, UserPlus } from '../../icons';
import { pinOf } from '../../pin';
import { colors, font, radius, space, type } from '../../theme';
import { Button, Header, Notice, Screen, TextField, toast } from '../../ui';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** An easy-to-read temporary password such as "kmrt-4829-xpqz". */
export function tempPassword() {
  let out = '';
  for (let i = 0; i < 12; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

const loginOf = (u) => u?.email || u?.phoneDisplay || u?.username || '';

export default function AddPersonScreen({ navigation }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', phone: '', username: '', title: '' });
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };

  const submit = async () => {
    if (!form.name.trim()) return setError(tr('Enter their name.'));
    if (!form.email.trim() && !form.phone.trim() && !form.username.trim()) {
      return setError(tr('Give them an email, a mobile number or a username to sign in with.'));
    }
    if (password && password.length < 8) return setError(tr('Use at least 8 characters'));
    setError(null);
    const body = Object.fromEntries(
      Object.entries({ ...form, password })
        .map(([k, v]) => [k, String(v || '').trim()])
        .filter(([, v]) => v)
    );
    try {
      const res = await platformApi.createUser(body);
      qc.invalidateQueries({ queryKey: platformKeys.console });
      setDone(res);
    } catch (e) {
      setError(e.message);
    }
  };

  const message = () =>
    tr('Your {app} account is ready. Sign in with {login} and this temporary password: {password} — you will choose your own straight away. Your Task Pin is {pin}.', {
      app: productConfig.name,
      login: loginOf(done.user),
      password: done.temporaryPassword,
      pin: pinOf(done.user) || '—',
    });

  if (done) {
    const u = done.user;
    return (
      <Screen header={<Header back title={tr('Person added')} />} scroll>
        <Notice tone="success">{tr('{name} is added. Their temporary password is shown only now.', { name: u.name })}</Notice>
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>{tr('Signs in with')}</Text>
            <Text style={styles.factValue} selectable>
              {loginOf(u)}
            </Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>{tr('Task Pin')}</Text>
            <Text style={[styles.factValue, styles.mono]} selectable>
              {pinOf(u) || '—'}
            </Text>
          </View>
        </View>
        <View style={styles.temp}>
          <Text style={styles.tempLabel}>{tr('Temporary password')}</Text>
          <Text style={styles.tempValue} selectable>
            {done.temporaryPassword}
          </Text>
          <Text style={styles.tempHint}>{tr('They must choose their own password the first time they sign in.')}</Text>
        </View>
        <View style={styles.actions}>
          <Button
            title={tr('Copy')}
            icon={Copy}
            variant="secondary"
            style={styles.flex}
            onPress={async () => {
              await Clipboard.setStringAsync(done.temporaryPassword);
              toast.success(tr('Password copied.'));
            }}
          />
          <Button title={tr('Share with them')} icon={ShareIcon} style={styles.flex} onPress={() => Share.share({ message: message() }).catch(() => {})} />
        </View>
        <Button title={tr('Open their page')} variant="secondary" onPress={() => navigation.replace('AdminPerson', { id: u.id })} style={styles.gapTop} />
        <Button title={tr('Done')} variant="ghost" onPress={() => navigation.goBack()} style={styles.gapTop} />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header back title={tr('Add a person')} />}
      scroll
      keyboard
      footer={<Button title={tr('Add person')} icon={UserPlus} size="lg" onPress={submit} />}
    >
      <Text style={styles.intro}>{tr('They get a Task Pin and a welcome task, as if they had signed up.')}</Text>
      <TextField label={tr('Name')} value={form.name} onChangeText={set('name')} maxLength={80} autoCapitalize="words" />
      <TextField label={tr('Email')} optional value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <TextField label={tr('Mobile number')} optional value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <TextField
        label={tr('Username')}
        optional
        value={form.username}
        onChangeText={set('username')}
        autoCapitalize="none"
        autoCorrect={false}
        hint={tr('For staff with no email or mobile.')}
      />
      <TextField label={tr('Job title')} optional value={form.title} onChangeText={set('title')} maxLength={60} />
      <TextField
        label={tr('Temporary password')}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        left={<KeyRound size={18} color={colors.textSecondary} style={styles.leftIcon} />}
        right={<Button title={tr('New')} icon={RefreshCw} size="sm" variant="ghost" full={false} onPress={() => setPassword(tempPassword())} />}
        hint={tr('They must choose a new password the first time they sign in.')}
      />
      <Notice tone="danger">{error}</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { ...type.small, lineHeight: 20, marginBottom: space(4) },
  leftIcon: { marginRight: space(2) },
  facts: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(4), marginBottom: space(4) },
  fact: { paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  factLabel: { ...type.caption },
  factValue: { fontSize: 16, color: colors.text, fontWeight: font.semibold, marginTop: 2 },
  mono: { letterSpacing: 1.5 },
  temp: { padding: space(4), borderRadius: radius.input, backgroundColor: colors.warningSoft, marginBottom: space(4), alignItems: 'center' },
  tempLabel: { ...type.caption, color: colors.warning, fontWeight: font.semibold },
  tempValue: { fontSize: 24, fontWeight: font.bold, color: colors.text, letterSpacing: 1, marginTop: space(1) },
  tempHint: { ...type.caption, textAlign: 'center', marginTop: space(2) },
  actions: { flexDirection: 'row', gap: space(3) },
  gapTop: { marginTop: space(3) },
});
