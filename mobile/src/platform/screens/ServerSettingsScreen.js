/**
 * Server settings: point the app at another backend (e.g. a test server on
 * the office Wi-Fi). The address is checked with GET /api/health before it
 * is saved, so a typo can never lock anyone out.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import productConfig from '../../product/config';
import { checkServer, defaultApiUrl, getApiUrl, saveApiUrl } from '../api';
import { space, type } from '../theme';
import { Button, Header, Notice, Screen, TextButton, TextField, toast } from '../ui';
import { tr } from '../../i18n';

// "http://192.168.1.20:5120", with the port of the built-in address.
const port = /:(\d+)$/.exec(defaultApiUrl())?.[1];
const example = `http://192.168.1.20${port ? `:${port}` : ''}`;

export default function ServerSettingsScreen({ navigation }) {
  const [url, setUrl] = useState(getApiUrl());
  const [error, setError] = useState(null);
  const isDefault = getApiUrl() === defaultApiUrl();

  const save = async () => {
    setError(null);
    try {
      const clean = await checkServer(url);
      await saveApiUrl(clean);
      toast.success(tr('Connected to {host}', { host: clean.replace(/^https?:\/\//, '') }));
      navigation.goBack();
    } catch (e) {
      setError(e.message);
    }
  };

  const reset = async () => {
    await saveApiUrl('');
    setUrl(defaultApiUrl());
    setError(null);
    toast(tr('Using the default server'));
  };

  return (
    <Screen header={<Header back title={tr('Server settings')} />} scroll keyboard>
      <Text style={styles.intro}>
        {tr('{name} talks to this server. Change it only if you were given a different address.', { name: productConfig.name })}
      </Text>
      <TextField
        label={tr('Server address')}
        value={url}
        onChangeText={setUrl}
        placeholder={example}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={save}
        hint={tr('For example {a} or {b}', { a: example, b: `https://${productConfig.key}.example.com` })}
      />
      <Notice tone="danger">{error}</Notice>
      <Button title={tr('Check and save')} size="lg" onPress={save} />
      {!isDefault ? (
        <TextButton title={tr('Use the default ({host})', { host: defaultApiUrl().replace(/^https?:\/\//, '') })} onPress={reset} style={styles.reset} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.small, fontSize: 15, marginBottom: space(5), lineHeight: 21 },
  reset: { marginTop: space(3) },
});
