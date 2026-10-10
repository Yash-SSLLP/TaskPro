/**
 * The keyboard on the iPhone web build: the same names as keyboard.js, worked
 * out from the browser's visualViewport. A web page is told nothing about the
 * keyboard (react-native-web's Keyboard and KeyboardAvoidingView do nothing),
 * and Metro picks this file for the web, so the native library never loads.
 *
 * Safari never shrinks the page for the keyboard: it shrinks only the part
 * that shows (the visual viewport), lays the keyboard over the bottom of the
 * page and pans the page up to the field. So here:
 * - the keyboard's height is the part of the page below what shows. Sheets
 *   are padded by it, Screen's footer rides up on it and scrolling screens
 *   get that much more room at the end, as on the phone;
 * - Safari's pan is undone (it pushes the header off the top), and the field
 *   is scrolled into view inside its own scrolling boxes instead;
 * - a home-screen app on iOS 17 and 18 can keep a short page after the
 *   keyboard closes, until it is relaunched; re-laying out the root fixes it.
 *
 * A browser that resizes the page for the keyboard reads a height of 0 here,
 * so nothing is counted twice.
 */
import React, { forwardRef, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

const MIN_KEYBOARD = 80; // a smaller gap is Safari's own bars coming and going
const SETTLE_MS = 250; // the keyboard's slide
const MARGIN = 12; // clear space kept round a field scrolled into view

let height = 0;
let up = false; // the keyboard is up, even while Safari's pan leaves none of the page under it
let started = false;
let frame = 0;
let settling = false;
const listeners = new Set();
// Scrolling boxes whose bottom is covered while the keyboard is up (Screen's footer rides over it), and by how much.
const coveredBottom = new WeakMap();
// The tallest the page has been with no field focused, per width (a turned phone is another page).
const tallest = {};

const isField = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

function measure() {
  frame = 0;
  const vv = window.visualViewport;
  // The keyboard is told by how much shorter what shows is than the page (a
  // zoomed-in page is not the keyboard); what it covers is that less Safari's
  // pan, which can be most of it when the field sits low on the page.
  const shorter = document.documentElement.clientHeight - vv.height;
  up = shorter >= MIN_KEYBOARD && Math.abs(vv.scale - 1) < 0.01;
  const next = up ? Math.max(0, Math.round(shorter - vv.offsetTop)) : 0;
  if (!isField(document.activeElement)) tallest[window.innerWidth] = Math.max(tallest[window.innerWidth] || 0, window.innerHeight);
  if (next !== height) {
    height = next;
    listeners.forEach((l) => l());
  }
  if (up && !settling) {
    // Once the sheets and screens have redrawn round the keyboard.
    settling = true;
    requestAnimationFrame(() => requestAnimationFrame(settle));
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(measure);
}

/** Undo Safari's pan and bring the field being typed in into view. */
function settle() {
  settling = false;
  if (!up) return;
  if (window.visualViewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  revealFocused();
}

/** Scroll the focused field into the part of each of its scrolling boxes that shows above the keyboard. */
function revealFocused() {
  const field = document.activeElement;
  if (!isField(field)) return;
  const vv = window.visualViewport;
  for (let box = field.parentElement; box && box !== document.body; box = box.parentElement) {
    if (box.scrollHeight <= box.clientHeight) continue;
    const { overflowY } = getComputedStyle(box);
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    const b = box.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    const top = Math.max(b.top, vv.offsetTop) + MARGIN;
    const bottom = Math.min(b.bottom - MARGIN, vv.offsetTop + vv.height - (coveredBottom.get(box) ?? MARGIN));
    let by = 0;
    // A field taller than the room left (a long note) shows its top, where typing starts.
    if (f.bottom > bottom) by = f.height > bottom - top ? f.top - top : f.bottom - bottom;
    else if (f.top < top) by = f.top - top;
    if (by) box.scrollTop += by;
  }
}

function onFocusIn(e) {
  // Moving to another field while the keyboard stays up resizes nothing.
  if (isField(e.target)) setTimeout(() => up && settle(), SETTLE_MS);
}

function onFocusOut() {
  schedule();
  setTimeout(() => {
    // iOS 17/18 home-screen apps: the page stays short after the keyboard has
    // gone. Only when it really is short, since the redraw also loses scroll
    // positions.
    if (!window.navigator.standalone || isField(document.activeElement)) return;
    if (window.innerHeight >= (tallest[window.innerWidth] || 0) - 4) return;
    const root = document.getElementById('root');
    if (!root) return;
    root.style.display = 'none';
    void root.offsetHeight; // forces the re-layout
    root.style.display = '';
  }, SETTLE_MS * 2);
}

function start() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return;
  started = true;
  window.visualViewport.addEventListener('resize', schedule);
  window.visualViewport.addEventListener('scroll', schedule);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  measure();
}

function subscribe(listener) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => height;

/** The keyboard's height while it is up, 0 while it is down. */
export function useKeyboardHeight() {
  return useSyncExternalStore(subscribe, read, () => 0);
}

/** True while the keyboard is up. */
export function useKeyboardVisible() {
  return useKeyboardHeight() > 0;
}

/** How much of the window the keyboard leaves showing (react-native-web's window is the visual viewport already). */
export function useVisibleHeight() {
  return useWindowDimensions().height;
}

/** Nothing to provide on the web; starts listening to the page. */
export function KeyboardProvider({ children }) {
  useEffect(start, []);
  return <>{children}</>;
}

/** The phone app's events never come on the web. */
export const KeyboardEvents = { addListener: () => ({ remove() {} }) };

/**
 * `behavior="padding"` (all the app uses): padded by the keyboard's height.
 * Every one in the app reaches the bottom of the page, so that is how much of
 * it the keyboard covers.
 */
export const KeyboardAvoidingView = forwardRef(function KeyboardAvoidingView(
  { behavior, enabled = true, keyboardVerticalOffset, contentContainerStyle, style, ...rest },
  ref
) {
  const kb = useKeyboardHeight();
  return <View ref={ref} style={[style, enabled && behavior === 'padding' && kb ? { paddingBottom: kb } : null]} {...rest} />;
});

/** A View that rides up on the keyboard, `offset.opened` lower while it is up (as on the phone). */
export const KeyboardStickyView = forwardRef(function KeyboardStickyView({ offset: { closed = 0, opened = 0 } = {}, enabled = true, style, ...rest }, ref) {
  const kb = useKeyboardHeight();
  return <View ref={ref} style={[{ transform: [{ translateY: enabled && kb ? opened - kb : closed }] }, style]} {...rest} />;
});

/**
 * A ScrollView with room for the keyboard at the end. The focused field is
 * scrolled into view by revealFocused above, kept `bottomOffset` clear of the
 * bottom (the footer riding up over it).
 */
export const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  { children, bottomOffset = 0, enabled = true, extraKeyboardSpace = 0, disableScrollOnKeyboardHide, ScrollViewComponent = ScrollView, ...rest },
  ref
) {
  const kb = useKeyboardHeight();
  const node = useRef(null);
  // react-native-web hands back the scrolling element itself, with scrollTo / scrollToEnd on it.
  const setRef = useCallback(
    (el) => {
      node.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );
  useEffect(() => {
    const el = node.current;
    if (!el || !enabled) return undefined;
    coveredBottom.set(el, bottomOffset);
    return () => coveredBottom.delete(el);
  }, [enabled, bottomOffset]);
  return (
    <ScrollViewComponent ref={setRef} {...rest}>
      {children}
      {enabled && kb ? <View style={{ height: kb + extraKeyboardSpace }} /> : null}
    </ScrollViewComponent>
  );
});
