/**
 * The keyboard: what keeps the field being typed in above it.
 *
 * The phone app is drawn edge to edge (app.json; Android 15 insists), so
 * Android no longer shrinks the window for the keyboard, and React Native's
 * own KeyboardAvoidingView cannot follow it inside a bottom sheet (a Modal is
 * a window of its own). react-native-keyboard-controller follows the keyboard
 * frame by frame in both, so the screens and sheets use its pieces:
 *
 * - KeyboardProvider: once, at the root (AppRoot).
 * - KeyboardAwareScrollView: Screen's scrolling body; scrolls the field (and
 *   the caret in a long multi-line one) into view.
 * - KeyboardStickyView: Screen's footer, riding up on the keyboard.
 * - KeyboardAvoidingView: BottomSheet, lifted by the keyboard's height.
 * - useKeyboardHeight / useKeyboardVisible / useVisibleHeight: told as the
 *   keyboard STARTS to move, on Android too (React Native's own Keyboard
 *   events only say so once it has finished).
 *
 * The iPhone web build loads keyboard.web.js instead (Metro picks the .web.js
 * file for the web platform), so the native library never reaches the page.
 */
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';

export {
  KeyboardProvider,
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
  KeyboardEvents,
} from 'react-native-keyboard-controller';

/**
 * The keyboard's height while it is up, 0 while it is down. A keyboard opened
 * in a bottom sheet (a Modal: a window of its own) can go away with the sheet
 * without a hide ever being reported, so this starts from "down" and goes back
 * to it whenever `resetKey` changes (a sheet passes its `visible`: a sheet
 * always opens with the keyboard down, and its field's focus reports the rest).
 */
export function useKeyboardHeight(resetKey) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const up = (e) => setHeight(e.height);
    const down = () => setHeight(0);
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', up),
      KeyboardEvents.addListener('keyboardDidShow', up),
      KeyboardEvents.addListener('keyboardWillHide', down),
      KeyboardEvents.addListener('keyboardDidHide', down),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  useEffect(() => {
    if (resetKey !== undefined) setHeight(0);
  }, [resetKey]);
  return height;
}

/** True while the keyboard is up (or on its way up). */
export function useKeyboardVisible(resetKey) {
  return useKeyboardHeight(resetKey) > 0;
}

/** How much of the window the keyboard leaves showing (all of it while it is down). */
export function useVisibleHeight() {
  const { height } = useWindowDimensions();
  return height - useKeyboardHeight();
}
