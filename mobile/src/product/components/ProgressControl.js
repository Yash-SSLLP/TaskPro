/**
 * "How far along are you?": the doer's own figure. A drag and four
 * shortcuts; the value is only sent on release or on a shortcut, never per
 * pixel. A failed save puts the bar back.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { colors, font, radius, space } from '../../platform/theme';
import { PROGRESS_STEPS, clampProgress } from '../taskStatus';

const STEP = 5;
const snap = (n) => clampProgress(Math.round(n / STEP) * STEP);

export default function ProgressControl({ value = 0, onCommit, disabled = false, busy = false, tint = colors.success }) {
  const [live, setLive] = useState(clampProgress(value));
  const [dragging, setDragging] = useState(false);
  const bar = useRef(null);
  const width = useRef(0);
  const originX = useRef(0);
  const liveRef = useRef(live);
  const draggingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const commitRef = useRef(onCommit);
  const saved = useRef(clampProgress(value));

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // Follow the prop only when the prop itself moves.
  useEffect(() => {
    const next = clampProgress(value);
    if (next === saved.current) return;
    saved.current = next;
    if (draggingRef.current) return;
    setLive(next);
    liveRef.current = next;
  }, [value]);

  const set = useCallback((pct) => {
    const next = snap(pct);
    liveRef.current = next;
    setLive(next);
    return next;
  }, []);

  const commit = useCallback(async (pct) => {
    const before = saved.current;
    try {
      const ok = await commitRef.current?.(pct);
      if (ok === false) {
        liveRef.current = before;
        setLive(before);
      }
    } catch {
      liveRef.current = before;
      setLive(before);
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: (_e, g) => !disabledRef.current && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          draggingRef.current = true;
          setDragging(true);
          if (width.current > 0) set(((e.nativeEvent.pageX - originX.current) / width.current) * 100);
        },
        onPanResponderMove: (_e, g) => {
          if (width.current <= 0) return;
          set(((g.moveX - originX.current) / width.current) * 100);
        },
        onPanResponderRelease: () => {
          draggingRef.current = false;
          setDragging(false);
          commit(liveRef.current);
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          setDragging(false);
        },
      }),
    [set, commit]
  );

  const steps = PROGRESS_STEPS.filter((n) => n > 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>{tr('How far along')}</Text>
        <Text style={[styles.value, { color: tint }]}>{live}%</Text>
      </View>
      <View
        ref={bar}
        {...pan.panHandlers}
        onLayout={() => {
          bar.current?.measureInWindow?.((x, _y, w) => {
            originX.current = x;
            if (w > 0) width.current = w;
          });
        }}
        style={[styles.hit, disabled && styles.off]}
        accessibilityRole="adjustable"
        accessibilityLabel={tr('How far along')}
        accessibilityValue={{ min: 0, max: 100, now: live }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${live}%`, backgroundColor: tint }]} />
        </View>
        <View style={[styles.knob, { left: `${live}%`, borderColor: tint }, dragging && styles.knobBig]} />
      </View>
      <View style={styles.steps}>
        {steps.map((n) => {
          const on = live === n;
          return (
            <Pressable
              key={n}
              disabled={disabled || busy}
              onPress={() => commit(set(n))}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.step, on && { borderColor: tint, backgroundColor: colors.muted }]}
            >
              <Text style={[styles.stepText, on && { color: tint }]}>{n}%</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: font.semibold },
  value: { fontSize: 18, fontWeight: font.bold },
  hit: { minHeight: 40, justifyContent: 'center' },
  off: { opacity: 0.5 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  knob: {
    position: 'absolute',
    top: 9,
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: colors.card,
  },
  knobBig: { top: 7, width: 26, height: 26, marginLeft: -13, borderRadius: 13 },
  steps: { flexDirection: 'row', gap: space(2) },
  step: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepText: { color: colors.textSecondary, fontSize: 13, fontWeight: font.semibold },
});
