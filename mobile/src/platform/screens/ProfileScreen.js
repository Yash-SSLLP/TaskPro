/**
 * My profile: name, job title, email and mobile. Only what changed is sent.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { PinCard } from '../components/PinCard';
import { authApi } from '../endpoints';
import { useSession } from '../session';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextField, toast } from '../ui';
import { tr } from '../../i18n';

export default function ProfileScreen({ navigation }) {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const initial = { name: user?.name || '', title: user?.title || '', email: user?.email || '', phone: user?.phoneDisplay || '' };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changed = Object.keys(initial).filter((k) => form[k].trim() !== initial[k]);

  const save = async () => {
    const e = {};
    if (!form.name.trim()) e.name = tr('Enter your name');
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!changed.length) {
      navigation.goBack();
      return;
    }
    setError(null);
    try {
      const body = {};
      for (const k of changed) body[k] = form[k].trim();
      const res = await authApi.updateProfile(body);
      setUser(res.user);
      toast.success(tr('Profile saved'));
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Screen
      header={<Header back title={tr('My profile')} />}
      scroll
      keyboard
      footer={<Button title={tr('Save')} size="lg" onPress={save} disabled={!changed.length} />}
    >
      {user?.pin ? <PinCard user={user} compact style={styles.pin} /> : null}
      <TextField label={tr('Name')} value={form.name} onChangeText={set('name')} autoCapitalize="words" error={errors.name} />
      <TextField label={tr('Job title')} optional value={form.title} onChangeText={set('title')} autoCapitalize="words" />
      <TextField
        label={tr('Email')}
        optional
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextField label={tr('Mobile')} optional value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {user?.username ? <Text style={styles.username}>{tr('Username: {name}', { name: user.username })}</Text> : null}
      <Text style={styles.note}>{tr('You can sign in with your email, mobile number or username.')}</Text>
      <Notice tone="danger">{error}</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pin: { marginBottom: space(5) },
  username: { ...type.small, marginBottom: space(2) },
  note: { ...type.caption, marginBottom: space(4) },
});
