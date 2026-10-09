/**
 * CurvedTabBar: the app's bottom bar, after the HRMS app's (navigation/
 * CurvedTabBar.js there).
 *
 * The selected tab's icon sits in a raised primary bubble, cradled in a
 * curved notch cut into the bar, and the bubble and the notch slide together
 * to whichever tab is chosen next. Every other tab is a plain icon over its
 * label. Lucide has no filled icons, so the bubble carries the same glyph in
 * white.
 *
 * BUILT FROM PLAIN VIEWS, NOT SVG. The notch is a circle in the SCREEN's
 * background colour, clipped to its lower half and laid over the bar's top
 * edge, so it reads as a bite out of the bar; the bubble is a circle centred
 * on that edge. Both move with ONE Animated value on the native driver
 * (translateX), so the slide stays smooth while the JS thread is busy drawing
 * the tab it slid to. No `elevation` anywhere: elevation on a rounded View
 * renders blank on some Android phones (the HRMS app met it on Adreno/ColorOS).
 *
 * A route is left off the bar with the option `tabBarHidden: true`; while the
 * focused route has no slot, the bubble and the notch fade out. Presses emit
 * the same `tabPress` / `tabLongPress` events the stock bar does. The stock
 * bar's `tabBarHideOnKeyboard` is its own, so this bar listens to the
 * keyboard itself (honouring the option; on unless it is set to false).
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../theme';

const BAR_HEIGHT = 62;
const BUBBLE = 50; // the raised circle
const NOTCH = 66; // the bite out of the bar: the bubble plus an 8px ring each side

/** The label a route shows, worked out as the stock bar does. */
function labelOf(options, route) {
  if (typeof options.tabBarLabel === 'string') return options.tabBarLabel;
  if (typeof options.title === 'string') return options.title;
  return route.name;
}

/** True while the keyboard is up (iOS says so as it starts to move; Android once it has). */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return shown;
}

export default function CurvedTabBar({ state, descriptors, navigation, insets }) {
  const { width } = useWindowDimensions();
  const keyboardShown = useKeyboardShown();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  // The bar's own height replaces the one React Navigation would work out,
  // so the phone's bottom inset goes back on here: the iPhone's home
  // indicator, and on Android (drawn edge to edge) the system navigation bar.
  const bottomInset = insets?.bottom || 0;

  const focused = state.routes[state.index];
  const visible = state.routes.filter((r) => !descriptors[r.key]?.options.tabBarHidden);
  const activeIndex = visible.findIndex((r) => r.key === focused.key);
  const slot = width / Math.max(visible.length, 1);
  const centre = activeIndex >= 0 ? slot * (activeIndex + 0.5) : null;

  // One value moves both the notch and the bubble; `shown` fades them for a
  // route with no slot; `pop` gives the icon a little bounce as it lands.
  const x = useRef(new Animated.Value(centre ?? width / 2)).current;
  const shown = useRef(new Animated.Value(centre == null ? 0 : 1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const [bubbleKey, setBubbleKey] = useState(activeIndex >= 0 ? focused.key : null);
  const first = useRef(true);

  useEffect(() => {
    if (centre == null) {
      Animated.timing(shown, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      return;
    }
    setBubbleKey(focused.key);
    if (first.current) {
      // Opening the app: be where the tab is, no slide in from nowhere.
      first.current = false;
      x.setValue(centre);
      shown.setValue(1);
      return;
    }
    pop.setValue(0.6);
    Animated.parallel([
      Animated.spring(x, { toValue: centre, useNativeDriver: true, speed: 14, bounciness: 7 }),
      Animated.timing(shown, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 12 }),
    ]).start();
    // The slot is what matters; `focused` is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre, focused.key]);

  const press = (route, isFocused) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.dispatch({ ...CommonActions.navigate(route.name, route.params), target: state.key });
    }
  };
  const longPress = (route) => navigation.emit({ type: 'tabLongPress', target: route.key });

  // Out of the way while typing (the stock bar's tabBarHideOnKeyboard): it
  // would otherwise ride up on the keyboard and cover the field.
  if (keyboardShown && descriptors[focused.key]?.options.tabBarHideOnKeyboard !== false) return null;

  const bubbleOptions = bubbleKey ? descriptors[bubbleKey]?.options : null;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
      style={[styles.bar, { height: BAR_HEIGHT + bottomInset, paddingBottom: bottomInset }]}
    >
      {/* The notch: a circle in the screen's colour, clipped to its lower half. */}
      <Animated.View pointerEvents="none" style={[styles.notchClip, { opacity: shown, transform: [{ translateX: x }] }]}>
        <View style={styles.notch} />
      </Animated.View>

      {visible.map((route, i) => {
        const { options } = descriptors[route.key];
        const isFocused = focused.key === route.key;
        const active = i === activeIndex;
        const label = labelOf(options, route);
        const color = active ? colors.primary : colors.textFaint;
        return (
          <Pressable
            key={route.key}
            onPress={() => press(route, isFocused)}
            onLongPress={() => longPress(route)}
            accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
            accessibilityState={{ selected: active }}
            accessibilityLabel={options.tabBarAccessibilityLabel || label}
            testID={options.tabBarButtonTestID}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
          >
            {/* The selected tab's icon lives in the bubble, so its slot keeps
                the space but draws nothing there. */}
            <View style={[styles.iconWrap, active && styles.iconHidden]}>
              {options.tabBarIcon?.({ focused: false, color, size: 24 })}
              {options.tabBarBadge != null && !active ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {options.tabBarBadge}
                  </Text>
                </View>
              ) : null}
            </View>
            {typeof options.tabBarLabel === 'function' ? (
              options.tabBarLabel({ focused: active, color, position: 'below-icon', children: label })
            ) : (
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}

      {/* The raised bubble, over everything, carrying the selected tab's icon. */}
      <Animated.View pointerEvents="none" style={[styles.bubble, { opacity: shown, transform: [{ translateX: x }, { scale: pop }] }]}>
        {bubbleOptions?.tabBarIcon?.({ focused: true, color: colors.onPrimary, size: 24 })}
        {bubbleOptions?.tabBarBadge != null ? (
          <View style={[styles.badge, styles.bubbleBadge]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {bubbleOptions.tabBarBadge}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
  pressed: { opacity: 0.7 },
  iconWrap: { height: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  iconHidden: { opacity: 0 },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  // Positioned from the bar's LEFT edge and moved by translateX to the slot's
  // centre, hence the negative half-width offsets.
  notchClip: {
    position: 'absolute',
    top: -StyleSheet.hairlineWidth,
    left: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH / 2 + 1,
    overflow: 'hidden',
  },
  notch: {
    position: 'absolute',
    top: -NOTCH / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubble: {
    position: 'absolute',
    top: -BUBBLE / 2,
    left: -BUBBLE / 2,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // dangerFill, not danger: the fill made to carry white text in both themes.
  badge: {
    position: 'absolute',
    top: -2,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleBadge: { top: -2, right: -2 },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
});
