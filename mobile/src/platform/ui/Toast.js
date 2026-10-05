/**
 * Toast: a short message at the bottom of the screen ("Saved", or what went
 * wrong). One ToastHost is mounted at the app root.
 *
 *   toast('Book created');  toast.error(err.message);
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { CircleAlert, CircleCheck } from '../icons';
import { colors, font, radius, shadowRaised, space } from '../theme';

const useToastStore = create(() => ({ current: null }));
let hideTimer = null;

export function toast(message, { tone = 'default', duration = 2800 } = {}) {
  if (!message) return;
  clearTimeout(hideTimer);
  useToastStore.setState({ current: { message: String(message), tone, id: Date.now() } });
  hideTimer = setTimeout(() => useToastStore.setState({ current: null }), duration);
}
toast.success = (m, o) => toast(m, { ...o, tone: 'success' });
toast.error = (m, o) => toast(m, { duration: 4000, ...o, tone: 'error' });

export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  // What is on screen: kept while the toast fades out, then removed.
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (current) {
      setShown(current);
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [current, anim]);

  if (!shown) return null;
  const Icon = shown.tone === 'error' ? CircleAlert : shown.tone === 'success' ? CircleCheck : null;
  const bg = shown.tone === 'error' ? colors.danger : colors.text;
  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 88 }]}>
      <Animated.View
        style={[
          styles.toast,
          { backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        {Icon ? <Icon size={18} color={colors.white} /> : null}
        <Text style={styles.text}>{shown.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space(4), right: space(4), alignItems: 'center', pointerEvents: 'none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderRadius: radius.input,
    maxWidth: 480,
    ...shadowRaised,
  },
  text: { color: colors.white, fontSize: 15, fontWeight: font.medium, flexShrink: 1 },
});
