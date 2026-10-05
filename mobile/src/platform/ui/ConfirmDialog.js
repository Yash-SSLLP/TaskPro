/**
 * ConfirmDialog: ask before something destructive.
 *
 *   if (await confirm({ title: 'Delete this entry?', confirmLabel: 'Delete', destructive: true })) …
 *
 * One DialogHost is mounted at the app root.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';
import { colors, font, radius, space, type } from '../theme';
import { Button } from './Button';
import { tr } from '../../i18n';

const useDialog = create(() => ({ dialog: null }));

/** @returns {Promise<boolean>} true when confirmed */
export function confirm({ title, message, confirmLabel, cancelLabel, destructive = false }) {
  return new Promise((resolve) => {
    const previous = useDialog.getState().dialog;
    previous?.resolve(false);
    useDialog.setState({
      dialog: { title, message, confirmLabel: confirmLabel || tr('OK'), cancelLabel: cancelLabel || tr('Cancel'), destructive, resolve },
    });
  });
}

export function DialogHost() {
  const dialog = useDialog((s) => s.dialog);
  const close = (result) => {
    dialog?.resolve(result);
    useDialog.setState({ dialog: null });
  };
  return (
    <Modal
      visible={!!dialog}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close(false)}
    >
      <View style={styles.fill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(false)} accessibilityLabel={tr('Cancel')} />
        {dialog ? (
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title} accessibilityRole="header">
              {dialog.title}
            </Text>
            {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
            <View style={styles.buttons}>
              <Button title={dialog.cancelLabel} variant="secondary" onPress={() => close(false)} style={styles.button} />
              <Button
                title={dialog.confirmLabel}
                variant={dialog.destructive ? 'danger' : 'primary'}
                onPress={() => close(true)}
                style={styles.button}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.card, padding: space(5) },
  title: { fontSize: 18, fontWeight: font.semibold, color: colors.text },
  message: { ...type.body, color: colors.textSecondary, marginTop: space(2), lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: space(3), marginTop: space(6) },
  button: { flex: 1 },
});
