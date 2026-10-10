/**
 * Shown at launch when there is a saved session but the server cannot be
 * reached: try again, or sign out.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import productConfig from '../../product/config';
import { WifiOff } from '../icons';
import { useSession } from '../session';
import { colors, font, space, type } from '../theme';
import { Button, Screen, TextButton } from '../ui';
import { tr } from '../../i18n';

export default function OfflineScreen() {
  const bootError = useSession((s) => s.bootError);
  const refresh = useSession((s) => s.refresh);
  const signOut = useSession((s) => s.signOut);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.icon}>
        <WifiOff size={30} color={colors.danger} />
      </View>
      <Text style={styles.title}>{tr('Can’t reach {app}', { app: productConfig.name })}</Text>
      <Text style={styles.message}>{bootError || tr('Check your internet connection and try again.')}</Text>
      <Button title={tr('Try again')} size="lg" onPress={() => refresh({ launching: true })} style={styles.retry} />
      <TextButton title={tr('Sign out')} color={colors.textSecondary} onPress={() => signOut({ remote: false })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingHorizontal: space(6) },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: space(5),
  },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
  message: { ...type.small, fontSize: 15, textAlign: 'center', marginTop: space(2), lineHeight: 21 },
  retry: { marginTop: space(8), marginBottom: space(2) },
});
