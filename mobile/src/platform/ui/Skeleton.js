/**
 * Skeletons: grey placeholder shapes that pulse while a list loads, so the
 * page keeps its layout instead of showing a spinner.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { tr } from '../../i18n';

function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function Skeleton({ width = '100%', height = 14, r = 6, style }) {
  const opacity = usePulse();
  return <Animated.View style={[styles.block, { width, height, borderRadius: r, opacity }, style]} />;
}

/** Rows like a list of people or entries. */
export function SkeletonList({ rows = 6, avatar = false, style }) {
  const opacity = usePulse();
  return (
    <View style={[styles.card, style]} accessibilityLabel={tr('Loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowBorder]}>
          {avatar ? <Animated.View style={[styles.block, styles.avatar, { opacity }]} /> : null}
          <View style={styles.texts}>
            <Animated.View style={[styles.block, { width: '60%', height: 14, opacity }]} />
            <Animated.View style={[styles.block, { width: '40%', height: 12, marginTop: space(2), opacity }]} />
          </View>
          <Animated.View style={[styles.block, { width: 64, height: 14, opacity }]} />
        </View>
      ))}
    </View>
  );
}

/** A few stacked cards (e.g. books). */
export function SkeletonCards({ count = 3, height = 76 }) {
  const opacity = usePulse();
  return (
    <View accessibilityLabel={tr('Loading')}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.block, styles.cardBlock, { height, opacity }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#e2e8f0' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: space(4), gap: space(3) },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  texts: { flex: 1 },
  cardBlock: { borderRadius: radius.card, marginBottom: space(3) },
});
