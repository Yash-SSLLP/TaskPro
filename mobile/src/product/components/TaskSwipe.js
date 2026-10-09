/**
 * A task card that SWIPES: the HRMS app's swipe (components/TaskSwipe there),
 * with its numbers, finished like a premium app.
 *
 *   not accepted   right → Accept      left → Reject
 *   in progress    right → Complete    left → Ask for more time
 *   in review      right → Complete    left → Send it back
 *
 * and, on any other open card, a side with no move of its own opens the
 * status menu ('menu'), or (right, on a task I set nobody has taken on yet)
 * the assign form ('edit'). Which a card carries is
 * taskStatus.swipeActionsFor (read off `can`), so a swipe never offers a
 * move the server would refuse.
 *
 * THE FEEL. The card takes the finger once it has gone 10 px more sideways
 * than up or down (anything steeper stays the list's scroll), then follows
 * it at 1/1.5. The pull counts at 76 px, or sooner with a flick (the
 * finger's speed, 50 ms ahead). At 104 px the pane is fully open; past it
 * the card stretches like a rubber band instead of stopping dead. The pane
 * deepens from a muted tint to its full colour as the pull reaches the
 * point where it counts; there its icon pops and the phone ticks (and ticks
 * again if the pull goes back). Let go past it and the card opens to the
 * stop, carrying the finger's speed, closes, and the move goes to
 * `onAction` a beat later, with a firmer tap: a success for a move that gets
 * work done, a heavier knock for one that turns something down. Let go short
 * of it and the card goes home; nothing happens.
 *
 * NOTHING HAPPENS ON THE SWIPE ITSELF: `onAction` decides (a remark sheet,
 * the menu, the form, or Accept at once).
 *
 * Reduce Motion: no pop, no open-and-close, no peek; the card goes straight
 * home. A screen reader gets the same moves as actions on the card
 * (swipeAccessibility). FIRST USE: until the person swipes once (or closes
 * the tip), the Tasks screen shows SwipeHint and one card peeks each way
 * (`peek`), once a launch. Built on PanResponder + Animated with the native
 * driver (no gesture library); a card's panes are drawn the first time it is
 * pulled, not before.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import MoveHorizontal from 'lucide-react-native/icons/move-horizontal';
import { create } from 'zustand';
import { tr } from '../../i18n';
import { colors, radius, space } from '../../platform/theme';
import { X } from '../icons';
import { ActionIcon } from './actionIcons';

/** The card follows the finger at 1/FRICTION, once it has gone SLOP px sideways. */
const FRICTION = 1.5;
const SLOP = 10;
/** Where a pull counts (card px). */
const THRESHOLD = 76;
/** A flick counts the finger's speed this many seconds ahead (gesture-handler's DRAG_TOSS). */
const TOSS = 0.05;
/** Where the pane is fully open and the card stops, give or take a rubber band STRETCH long. */
const STOP = 104;
const STRETCH = 44;
/** The pane runs this far on under the card's rounded corner, so no page shows between them. */
const OVERLAP = 12;
const PANE_WIDTH = STOP + OVERLAP + STRETCH;
/** The first-use peek: how far it slides, and how long after the card shows. */
const PEEK = 56;
const PEEK_AFTER = 900;
/** The move reaches onAction this long after the card turns for home. */
const FIRE_AFTER = 120;
/** gesture-handler's springs: no bounce, settling where its Swipeable does. */
const SETTLE = { bounciness: 0, restSpeedThreshold: 1.7, restDisplacementThreshold: 0.4, useNativeDriver: true };

const quiet = () => {};

/** How far the card goes for the finger's `dx`: 1/1.5 to the stop, then a rubber band that never quite reaches STRETCH more. */
function travel(dx) {
  const t = dx / FRICTION;
  const over = Math.abs(t) - STOP;
  if (over <= 0) return t;
  return Math.sign(t) * (STOP + STRETCH * (1 - 1 / (1 + (over * 0.55) / STRETCH)));
}

// ===== Haptics =====

const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;

/** A light tick: the pull has just crossed the point where it counts, or come back over it. */
function tick() {
  if (Platform.OS === 'android') Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(quiet);
  else Haptics.selectionAsync().catch(quiet);
}

/**
 * The tap as a move is made: a success for one that gets work done, a
 * heavier knock for one that turns something down or sends it back, a
 * light one for the rest (more time, the menu, the form). On Android these
 * are the system's own haptics, which follow the phone's touch-feedback
 * setting, not the vibrator; Confirm needs Android 11.
 */
function knock(tone) {
  if (Platform.OS === 'android') {
    const H = Haptics.AndroidHaptics;
    let type = H.Context_Click;
    if (tone === 'success') type = ANDROID_API >= 30 ? H.Confirm : H.Virtual_Key;
    else if (tone === 'danger') type = H.Long_Press;
    Haptics.performAndroidHapticsAsync(type).catch(quiet);
    return;
  }
  if (tone === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(quiet);
  else Haptics.impactAsync(tone === 'danger' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(quiet);
}

// ===== Reduce Motion, read once and followed for every card =====

let reduceMotion = false;
let followingMotion = false;

function followReduceMotion() {
  if (followingMotion) return;
  followingMotion = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => {
      reduceMotion = Boolean(on);
    })
    .catch(quiet);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
    reduceMotion = Boolean(on);
  });
}

// ===== The first-use tip =====

const HINT_KEY = 'taskpro.swipeLearned';
/** 'idle' (not read yet) · 'reading' · 'show' · 'leaving' (on its way out) · 'done' (never again). */
const useHint = create(() => ({ status: 'idle', wait: 0 }));
/** The peek plays once a launch, on one card. */
let peeked = false;

function readHint() {
  if (useHint.getState().status !== 'idle') return;
  useHint.setState({ status: 'reading' });
  AsyncStorage.getItem(HINT_KEY)
    .then((saved) => {
      if (useHint.getState().status === 'reading') useHint.setState({ status: saved ? 'done' : 'show' });
    })
    // Storage that cannot be read: no tip, rather than one that never goes away.
    .catch(() => useHint.setState({ status: 'done' }));
}

/** The swipe is learned (the tip closed, or a first real swipe): the tip goes, `wait` ms from now, and never comes back. */
function learnSwipe(wait = 0) {
  const { status } = useHint.getState();
  if (status === 'done' || status === 'leaving') return;
  useHint.setState({ status: status === 'show' ? 'leaving' : 'done', wait });
  AsyncStorage.setItem(HINT_KEY, '1').catch(quiet);
}

/** For the Tasks screen: `show` while the tip is up (a card may peek), `visible` until it has finished leaving. */
export function useSwipeHint() {
  const status = useHint((s) => s.status);
  useEffect(() => {
    readHint();
    followReduceMotion();
  }, []);
  return { show: status === 'show', visible: status === 'show' || status === 'leaving' };
}

/**
 * The tip itself: one line above the cards saying what a swipe each way
 * does, and a ✕. It fades in; on its way out it fades, the space it took
 * closes, and it is gone for good. `gap` is the space above it in its
 * column, which closes with it.
 */
export function SwipeHint({ gap = 0 }) {
  const status = useHint((s) => s.status);
  const [fade] = useState(() => new Animated.Value(0, { useNativeDriver: true }));
  const rise = useMemo(() => fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }), [fade]);
  const height = useRef(0);
  // The closing: a height and a margin that shrink together (layout, so not the native driver).
  const [shut, setShut] = useState(null);

  useEffect(() => {
    followReduceMotion();
    if (reduceMotion) {
      fade.setValue(1);
      return undefined;
    }
    const a = Animated.timing(fade, { toValue: 1, duration: 280, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [fade]);

  useEffect(() => {
    if (status !== 'leaving') return undefined;
    let mounted = true;
    let t = null;
    if (reduceMotion) useHint.setState({ status: 'done' });
    else {
      t = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
          if (!mounted) return;
          const p = new Animated.Value(1);
          setShut({
            p,
            style: {
              overflow: 'hidden',
              height: p.interpolate({ inputRange: [0, 1], outputRange: [0, height.current] }),
              marginTop: p.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }),
            },
          });
        });
      }, useHint.getState().wait || 0);
    }
    return () => {
      mounted = false;
      clearTimeout(t);
      // Gone before it finished leaving (the screen closed): gone all the same.
      if (useHint.getState().status === 'leaving') useHint.setState({ status: 'done' });
    };
  }, [status, fade, gap]);

  useEffect(() => {
    if (!shut) return undefined;
    const a = Animated.timing(shut.p, { toValue: 0, duration: 240, easing: Easing.inOut(Easing.cubic), useNativeDriver: false });
    a.start(() => {
      if (useHint.getState().status === 'leaving') useHint.setState({ status: 'done' });
    });
    return () => a.stop();
  }, [shut]);

  return (
    <Animated.View
      style={shut?.style}
      onLayout={(e) => {
        if (!shut) height.current = e.nativeEvent.layout.height;
      }}
    >
      <Animated.View style={[styles.hint, { opacity: fade, transform: [{ translateY: rise }] }]} accessibilityLiveRegion="polite">
        <View style={styles.hintMark}>
          <MoveHorizontal size={16} color={colors.primary} strokeWidth={2.25} />
        </View>
        <Text style={styles.hintText}>{tr('Swipe a task right to accept, complete or edit it, left to reject, send back or ask for more time.')}</Text>
        <Pressable
          onPress={() => learnSwipe(0)}
          hitSlop={12}
          style={({ pressed }) => [styles.hintClose, pressed && styles.hintClosePressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('Close')}
        >
          <X size={16} color={colors.textSecondary} strokeWidth={2.25} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ===== For a screen reader =====

/**
 * The same moves for a screen reader, as actions on the card (TalkBack's
 * actions menu, VoiceOver's Actions rotor), spread onto the card's
 * Pressable: right's first, then left's, each once ('menu' included: the
 * card reads as one button, so the pill inside it is not reached on its
 * own).
 */
export function swipeAccessibility(actions, onAction) {
  const moves = [];
  for (const a of [actions?.right, actions?.left]) {
    if (a && !moves.some((m) => m.key === a.key)) moves.push(a);
  }
  if (!moves.length) return {};
  return {
    accessibilityActions: moves.map((a) => ({ name: a.key, label: a.label })),
    onAccessibilityAction: (e) => {
      const key = e?.nativeEvent?.actionName;
      if (moves.some((m) => m.key === key)) onAction?.(key);
    },
  };
}

// ===== The pane =====

/**
 * The coloured pane a pull uncovers. `side` is where it sits: 'left' is
 * uncovered by a pull to the right (the right move), 'right' by a pull to
 * the left. It deepens from a muted tint to its full colour by the point
 * where the pull counts; its icon and word grow in, keep to the middle of
 * the strip uncovered, and pop when the pull counts.
 */
function Pane({ action, side, x, pop }) {
  const anim = useMemo(() => {
    const onLeft = side === 'left';
    const pull = x.interpolate(
      onLeft
        ? { inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' }
        : { inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' }
    );
    // The body is laid out in the middle of the open strip (STOP / 2 from the
    // edge); until the card has gone PEEK it sits PEEK / 2 from the edge,
    // then it rides in the middle of what is uncovered.
    const off = STOP / 2 - PEEK / 2;
    return {
      shown: x.interpolate(
        onLeft
          ? { inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: 'clamp' }
          : { inputRange: [-0.5, 0], outputRange: [1, 0], extrapolate: 'clamp' }
      ),
      wash: pull.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
      fade: pull.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.8, 1] }),
      grow: pull.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
      ride: x.interpolate(
        onLeft
          ? { inputRange: [0, PEEK, STOP], outputRange: [-off, -off, 0], extrapolate: 'clamp' }
          : { inputRange: [-STOP, -PEEK, 0], outputRange: [0, off, off], extrapolate: 'clamp' }
      ),
      burst: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
    };
  }, [x, pop, side]);

  return (
    <Animated.View style={[styles.pane, side === 'left' ? styles.paneLeft : styles.paneRight, { opacity: anim.shown }]}>
      <Animated.View style={[styles.wash, { backgroundColor: action.fill, opacity: anim.wash }]} />
      <Animated.View style={[styles.paneBody, { opacity: anim.fade, transform: [{ translateX: anim.ride }, { scale: anim.grow }, { scale: anim.burst }] }]}>
        <ActionIcon name={action.icon} size={22} color={action.ink} />
        {/* Never cut: a long word (in Malayalam, say) shrinks or takes a second line. */}
        <Text style={[styles.paneText, { color: action.ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2}>
          {action.label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

// ===== The card =====

export default function TaskSwipe({ actions, onAction, enabled = true, peek = false, children }) {
  const { left, right } = actions || {};
  const swipes = enabled && Boolean(left || right);
  // Native from the start, so even a card's first pull moves on the UI thread.
  const [x] = useState(() => new Animated.Value(0, { useNativeDriver: true }));
  const [pop] = useState(() => new Animated.Value(0, { useNativeDriver: true }));
  // The panes are drawn once the card is first pulled sideways (or peeks):
  // a list of cards nobody swipes carries none.
  const [drawn, setDrawn] = useState(false);
  const live = useRef(null);
  live.current = { left, right, onAction };
  // What the gesture knows between events: the side armed (1 right, -1
  // left, 0 neither), a move on its way (no new pull until it is home), the
  // peek running, and the timer that hands the move over.
  const run = useRef({ drawn: false, armed: 0, busy: false, peek: null, timer: null }).current;

  const pan = useMemo(() => {
    const draw = () => {
      if (run.drawn) return;
      run.drawn = true;
      setDrawn(true);
    };
    /** A side with no move does not move. */
    const reach = (dx) => {
      const { left: l, right: r } = live.current;
      if ((dx > 0 && !r) || (dx < 0 && !l)) return 0;
      return dx;
    };
    /** The pull has crossed (or come back over) the point where it counts: tick, and pop the icon. */
    const arm = (side, silent = false) => {
      if (run.armed === side) return;
      run.armed = side;
      if (!silent) tick();
      if (reduceMotion) {
        pop.setValue(0);
        return;
      }
      Animated.spring(pop, { toValue: side ? 1 : 0, speed: 22, bounciness: side ? 12 : 0, useNativeDriver: true }).start();
    };
    /** Home, carrying the finger's speed (px/s). */
    const home = (velocity = 0) => {
      arm(0, true);
      if (reduceMotion) Animated.timing(x, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      else Animated.spring(x, { ...SETTLE, toValue: 0, velocity }).start();
    };
    /** A counted pull: open to the stop, close, and hand the move over as the card turns for home. */
    const commit = (side, velocity) => {
      const move = side > 0 ? live.current.right : live.current.left;
      if (!move) {
        home(velocity);
        return;
      }
      run.busy = true;
      knock(move.tone);
      // A first real swipe: the tip has done its job (it leaves once the sheet is up).
      learnSwipe(700);
      const hand = () => {
        run.timer = setTimeout(() => {
          run.timer = null;
          live.current.onAction?.(move.key);
        }, FIRE_AFTER);
      };
      if (reduceMotion) {
        arm(0, true);
        Animated.timing(x, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
          run.busy = false;
        });
        hand();
        return;
      }
      // Popped while it opens, flick or no flick.
      arm(side, true);
      Animated.spring(x, { ...SETTLE, toValue: side * STOP, velocity }).start(({ finished }) => {
        arm(0, true);
        if (!finished) {
          run.busy = false;
          return;
        }
        Animated.spring(x, { ...SETTLE, toValue: 0 }).start(() => {
          run.busy = false;
        });
        hand();
      });
    };

    return PanResponder.create({
      // A finger on the card stops a first-use peek and sends the card home.
      // Never claims the touch: a tap still opens the task.
      onStartShouldSetPanResponderCapture: () => {
        if (run.peek) {
          run.peek.stop();
          run.peek = null;
          Animated.timing(x, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        }
        return false;
      },
      // Sideways first, and only towards a side with a move: a drag that
      // starts steeper than level is the list's scroll, and stays it.
      onMoveShouldSetPanResponder: (_e, g) => {
        if (run.busy) return false;
        const sideways = Math.abs(g.dx) > Math.abs(g.dy);
        // Drawn a few px early, so the panes are there by the time the card moves.
        if (sideways && Math.abs(g.dx) > 3) draw();
        if (!sideways || Math.abs(g.dx) <= SLOP) return false;
        const { left: l, right: r } = live.current;
        return (g.dx > 0 && !!r) || (g.dx < 0 && !!l);
      },
      onPanResponderGrant: () => {
        draw();
        x.stopAnimation();
        run.armed = 0;
      },
      // Once the card is moving it keeps the finger.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        const t = travel(reach(g.dx));
        x.setValue(t);
        arm(t >= THRESHOLD ? 1 : t <= -THRESHOLD ? -1 : 0);
      },
      onPanResponderRelease: (_e, g) => {
        const dx = reach(g.dx);
        // Where the card would be 50 ms on, at the finger's speed (vx is px/ms).
        const toss = (dx + TOSS * 1000 * g.vx) / FRICTION;
        const velocity = (1000 * g.vx) / FRICTION;
        const { left: l, right: r } = live.current;
        if (toss > THRESHOLD && r) commit(1, velocity);
        else if (toss < -THRESHOLD && l) commit(-1, velocity);
        else home(velocity);
      },
      onPanResponderTerminate: () => home(0),
    });
  }, [x, pop, run]);

  // A move on its way when the card goes (the list changed under it) is dropped with it.
  useEffect(() => {
    followReduceMotion();
    return () => {
      clearTimeout(run.timer);
      run.peek?.stop();
    };
  }, [run]);

  // FIRST USE: the card slides PEEK to show its right move, comes back, then
  // shows its left one. Once a launch, never under Reduce Motion.
  useEffect(() => {
    if (!peek || !swipes || peeked) return undefined;
    run.drawn = true;
    setDrawn(true);
    const t = setTimeout(() => {
      if (peeked || run.busy || reduceMotion) return;
      peeked = true;
      const { left: l, right: r } = live.current;
      const out = (to) => Animated.timing(x, { toValue: to, duration: 420, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true });
      const back = () => Animated.timing(x, { toValue: 0, duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true });
      const steps = [];
      if (r) steps.push(out(PEEK), Animated.delay(520), back());
      if (l) steps.push(Animated.delay(r ? 260 : 0), out(-PEEK), Animated.delay(520), back());
      if (!steps.length) return;
      run.peek = Animated.sequence(steps);
      run.peek.start(() => {
        run.peek = null;
      });
    }, PEEK_AFTER);
    return () => clearTimeout(t);
  }, [peek, swipes, x, run]);

  const moving = useMemo(() => ({ transform: [{ translateX: x }] }), [x]);

  if (!swipes) return children;

  return (
    <View style={styles.wrap}>
      {drawn ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {right ? <Pane action={right} side="left" x={x} pop={pop} /> : null}
          {left ? <Pane action={left} side="right" x={x} pop={pop} /> : null}
        </View>
      ) : null}
      <Animated.View style={moving} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  // A strip, not the whole row: open, it shows STOP of colour, and it runs
  // on under the card's corner and past the rubber band, so no page ever
  // shows between them. Rounded like the card.
  pane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PANE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  paneLeft: { left: 0, paddingRight: PANE_WIDTH - STOP },
  paneRight: { right: 0, paddingLeft: PANE_WIDTH - STOP },
  wash: { ...StyleSheet.absoluteFillObject },
  paneBody: { alignItems: 'center', gap: 4, minWidth: 64, maxWidth: STOP - 8 },
  paneText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center' },

  // ── The first-use tip ──
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    paddingVertical: space(2.5),
    paddingLeft: space(2.5),
    paddingRight: space(2),
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  hintMark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  hintText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  hintClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hintClosePressed: { backgroundColor: colors.muted },
});
