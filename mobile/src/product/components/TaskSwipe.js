/**
 * A task card that SWIPES:
 *   not accepted   right → Accept      left → Reject
 *   in progress    right → Complete    left → Ask for more time
 *   in review      right → Complete    left → Send it back
 * Which pair a card carries is taskStatus.swipeActionsFor (read off `can`),
 * so a swipe never offers a move the server would refuse.
 *
 * NOTHING HAPPENS ON THE SWIPE ITSELF. A full pull springs the card back and
 * hands the move to `onAction`, which opens the remark sheet. A half pull
 * does nothing. Built on PanResponder + Animated (no gesture library).
 */
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { radius } from '../../platform/theme';
import { ActionIcon } from './actionIcons';

const THRESHOLD = 76;
const MAX_PULL = 116;

function Pane({ action, side, pull }) {
  const scale = pull.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.08], extrapolate: 'clamp' });
  const opacity = pull.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.8, 1], extrapolate: 'clamp' });
  return (
    <View style={[styles.pane, { backgroundColor: action.fill }, side === 'left' ? styles.paneLeft : styles.paneRight]} pointerEvents="none">
      <Animated.View style={[styles.paneBody, { opacity, transform: [{ scale }] }]}>
        <ActionIcon name={action.icon} size={22} color={action.ink} />
        <Text style={[styles.paneText, { color: action.ink }]} numberOfLines={1}>
          {action.label}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function TaskSwipe({ actions, onAction, enabled = true, children }) {
  const { left, right } = actions || {};
  const x = useRef(new Animated.Value(0)).current;
  const live = useRef({ left, right, onAction });
  live.current = { left, right, onAction };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => {
          const { left: l, right: r } = live.current;
          if (Math.abs(g.dx) < 12 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return false;
          return (g.dx > 0 && !!r) || (g.dx < 0 && !!l);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const { left: l, right: r } = live.current;
          let dx = g.dx;
          if (dx > 0 && !r) dx = 0;
          if (dx < 0 && !l) dx = 0;
          x.setValue(Math.max(-MAX_PULL, Math.min(MAX_PULL, dx / 1.3)));
        },
        onPanResponderRelease: (_e, g) => {
          const { left: l, right: r, onAction: act } = live.current;
          const dx = g.dx / 1.3;
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
          const hit = dx >= THRESHOLD ? r : dx <= -THRESHOLD ? l : null;
          if (hit) setTimeout(() => act?.(hit.key), 120);
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [x]
  );

  if (!enabled || (!left && !right)) return children;

  const pullRight = x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const pullLeft = x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const showLeftPane = x.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const showRightPane = x.interpolate({ inputRange: [-1, 0, 1], outputRange: [1, 0, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.wrap}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {right ? (
          <Animated.View style={[StyleSheet.absoluteFill, styles.row, { opacity: showLeftPane }]}>
            <Pane action={right} side="left" pull={pullRight} />
          </Animated.View>
        ) : null}
        {left ? (
          <Animated.View style={[StyleSheet.absoluteFill, styles.row, styles.rowEnd, { opacity: showRightPane }]}>
            <Pane action={left} side="right" pull={pullLeft} />
          </Animated.View>
        ) : null}
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { flexDirection: 'row' },
  rowEnd: { justifyContent: 'flex-end' },
  pane: { width: MAX_PULL + 12, justifyContent: 'center', alignItems: 'center', borderRadius: radius.card },
  paneLeft: { paddingRight: 12 },
  paneRight: { paddingLeft: 12 },
  paneBody: { alignItems: 'center', gap: 4, minWidth: 64 },
  paneText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
});
