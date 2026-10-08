/**
 * App updates: the installed version, a check against the server, and, when
 * there is a newer build, its notes and Download & install.
 *
 * The download only starts on a tap (the APK is tens of MB), and Android shows
 * its own install confirmation on top of that: an app installed outside a
 * store can never replace itself silently.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import productConfig from '../../product/config';
import { tr } from '../../i18n';
import { Download, RefreshCw } from '../icons';
import { colors, font, radius, space, type } from '../theme';
import { Button, Card, Divider, Header, Notice, Screen, toast } from '../ui';
import { canSelfUpdate, checkForUpdate, downloadAndInstall, installedBuild, installedVersion, sizeLabel, useUpdate } from '../updates';

export default function AppUpdateScreen() {
  // Seeded with what the background check found, so arriving from the prompt
  // shows the update straight away.
  const [info, setInfo] = useState(() => useUpdate.getState().available);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // 0..1 while downloading
  const downloading = progress !== null;

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const found = await checkForUpdate();
      setInfo(found.upToDate ? null : found);
      if (found.upToDate) toast.success(tr('You have the latest version'));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    setError(null);
    setProgress(0);
    try {
      await downloadAndInstall(info, setProgress);
      toast(tr('Downloaded. Follow the install prompt.'));
    } catch (e) {
      setError(e.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Screen scroll header={<Header back title={tr('App updates')} />}>
      <Card style={styles.card}>
        <Text style={type.overline}>{tr('Installed version')}</Text>
        <Text style={styles.version}>v{installedVersion}</Text>
        <Text style={type.caption}>{tr('Build {n}', { n: installedBuild })}</Text>
      </Card>

      <Notice tone="danger">{error}</Notice>

      {info ? (
        <Card style={styles.card}>
          <Text style={[type.overline, { color: colors.success }]}>{tr('Update available')}</Text>
          <Text style={[styles.version, { color: colors.success }]}>v{info.versionName}</Text>
          <Text style={type.caption}>
            {[tr('Build {n}', { n: info.versionCode }), sizeLabel(info.size)].filter(Boolean).join('  ·  ')}
          </Text>
          {info.notes ? (
            <>
              <Divider style={styles.divider} />
              <Text style={type.overline}>{tr("What's new")}</Text>
              <Text style={styles.notes}>{info.notes}</Text>
            </>
          ) : null}
          {downloading ? (
            <View style={styles.progress}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={type.caption}>{tr('Downloading… {n}%', { n: Math.round(progress * 100) })}</Text>
            </View>
          ) : null}
          {canSelfUpdate ? (
            <Button title={tr('Download and install')} icon={Download} size="lg" onPress={install} loading={downloading} style={styles.button} />
          ) : null}
          <Text style={[type.caption, styles.hint]}>
            {tr('Android asks you to confirm the install, and the first time to allow installs from {name}. Your tasks and sign-in stay as they are.', {
              name: productConfig.name,
            })}
          </Text>
        </Card>
      ) : null}

      <Button
        title={tr('Check for updates')}
        icon={RefreshCw}
        variant={info ? 'secondary' : 'primary'}
        size="lg"
        onPress={check}
        loading={checking}
        disabled={downloading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space(4), gap: space(1) },
  version: { fontSize: 26, fontWeight: font.bold, color: colors.text, marginTop: space(1) },
  divider: { marginVertical: space(3) },
  notes: { ...type.body, fontSize: 15, lineHeight: 21, marginTop: space(1) },
  progress: { marginTop: space(4), gap: space(1.5) },
  track: { height: 8, borderRadius: radius.chip, backgroundColor: colors.muted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.chip, backgroundColor: colors.primary },
  button: { marginTop: space(4) },
  hint: { marginTop: space(3), lineHeight: 18 },
});
