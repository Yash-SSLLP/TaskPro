/**
 * BottomSheet: a panel that slides up over the screen for short tasks
 * ("New book", "Add person", filters). Tapping outside or the Android back
 * button closes it; it moves up with the keyboard.
 *
 * Toasts and confirm dialogs cannot draw above an open sheet on every
 * platform, so sheets show their own errors inline.
 *
 * THE HRMS SHEET (2026-10-08): the page's grey under the content (so white
 * fields and rows stand out on it), a 22px top curve, a 19pt title with a
 * plain close cross, and the footer's buttons set off by a hairline rule.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '../icons';
import { colors, font, radius, space, type } from '../theme';
import { tr } from '../../i18n';

export function BottomSheet({ visible, onClose, title, subtitle, children, footer, scroll = true, dismissable = true }) {
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
  }, [visible, anim]);

  if (!mounted) return null;

  const close = () => {
    if (dismissable) onClose?.();
  };
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={tr('Close')} accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { marginTop: insets.top + space(10), paddingBottom: insets.bottom + space(4), transform: [{ translateY }] }]}
        >
          <View style={styles.handle} />
          {title ? (
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={styles.title} accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? <Text style={[type.caption, styles.subtitle]}>{subtitle}</Text> : null}
              </View>
              {dismissable ? (
                <Pressable
                  onPress={close}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={tr('Close')}
                  style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
                >
                  <X size={22} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {scroll ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space(2),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: space(3),
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), marginBottom: space(3) },
  headText: { flex: 1 },
  title: { fontSize: 19, fontWeight: font.bold, color: colors.text },
  subtitle: { marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: -space(1) },
  closePressed: { backgroundColor: colors.muted },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: space(4), paddingBottom: space(2) },
  footer: {
    marginTop: space(2),
    marginHorizontal: space(4),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space(2),
  },
});
