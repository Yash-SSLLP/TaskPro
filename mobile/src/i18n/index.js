/**
 * The app's language: English, Hindi, Kannada, Tamil, Telugu or Malayalam.
 *
 * THE ENGLISH TEXT IS THE KEY. `tr('Save')` looks the phrase up in the chosen
 * language's column of ./strings.js and falls back to the English itself when
 * there is no row for it, so the app is never blank because of a missing
 * translation. Variables go in braces: `tr('{n} unread', { n })`, and each
 * translation keeps the braces wherever its grammar wants them.
 *
 * The choice lives on this phone (AsyncStorage) and, once signed in, in the
 * person's settings on the server (`settings.lang`, synced by
 * platform/language.js). Switching is live: `useLang()` re-renders whoever
 * reads it, and AppRoot re-mounts the navigator (keeping its place) so every
 * screen picks up the new words.
 *
 * Call tr() at RENDER time, never at module load: a label built when the file
 * is first read would stay in the language that was on at launch.
 */
import { cloneElement, isValidElement } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const LANG_KEY = 'taskpro.lang';
const CHOSEN_KEY = 'taskpro.langChosen';

/** The choices, in the order they are offered. `native` is how each names itself. */
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
];

// Column order of every row in ./strings.js.
const COLUMNS = ['en', 'hi', 'kn', 'ta', 'te', 'ml'];

export const isLanguage = (code) => COLUMNS.includes(code);

let current = 'en';
/** English → the current language's text, or null while English is in use. */
let table = null;

function applyTable(code) {
  const col = COLUMNS.indexOf(code);
  if (col <= 0) {
    current = 'en';
    table = null;
    return;
  }
  const rows = require('./strings').default;
  const next = new Map();
  for (const row of rows) {
    if (row[col]) next.set(row[0], row[col]);
  }
  current = code;
  table = next;
}

/** `lang` re-renders whoever reads it; `chosen` = picked on this phone on purpose. */
export const useLangStore = create(() => ({ lang: 'en', chosen: false }));

/** The language in use now, re-rendering the caller when it changes. */
export function useLang() {
  return useLangStore((s) => s.lang);
}

/** Read the saved language and apply it. Called once at launch, before anything is drawn. */
export async function initLanguage() {
  let code = 'en';
  let chosen = false;
  try {
    const [saved, flag] = await Promise.all([AsyncStorage.getItem(LANG_KEY), AsyncStorage.getItem(CHOSEN_KEY)]);
    if (isLanguage(saved)) code = saved;
    chosen = flag === '1';
  } catch {
    /* unreadable storage → English */
  }
  try {
    applyTable(code);
  } catch {
    applyTable('en'); // a broken table must never stop the app from starting
  }
  useLangStore.setState({ lang: current, chosen });
}

/**
 * Switch the app's language now and remember it on this phone.
 * @param {string} code 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml'
 * @param {{ chosen?: boolean }} opts chosen: the person picked it here (not adopted from the server)
 */
export async function setLanguage(code, { chosen = true } = {}) {
  const next = isLanguage(code) ? code : 'en';
  try {
    applyTable(next);
  } catch {
    applyTable('en');
  }
  const wasChosen = useLangStore.getState().chosen;
  useLangStore.setState({ lang: current, chosen: chosen || wasChosen });
  try {
    await AsyncStorage.multiSet([
      [LANG_KEY, current],
      [CHOSEN_KEY, chosen || wasChosen ? '1' : '0'],
    ]);
  } catch {
    /* the switch still applies until the app restarts */
  }
}

/** The language in use now ('en', 'hi', 'kn', 'ta', 'te' or 'ml'). */
export function currentLanguage() {
  return current;
}

/** Did the person pick the language on this phone (rather than it coming from their account)? */
export function languageChosen() {
  return useLangStore.getState().chosen;
}

/** "हिन्दी" for 'hi'. */
export function languageName(code) {
  return LANGUAGES.find((l) => l.code === code)?.native || 'English';
}

/**
 * Translate one phrase. Anything that is not a string (a number, a React node,
 * undefined) comes back untouched, so components can pass props straight in.
 * @param {*} text the English phrase
 * @param {Object} [vars] values for `{name}` placeholders
 * @returns {*}
 */
export function tr(text, vars) {
  if (typeof text !== 'string') return text;
  let out = text;
  if (table) {
    const hit = table.get(text);
    if (hit !== undefined) {
      out = hit;
    } else {
      // "Save " and " Save" read as "Save": keep the spacing, translate the words.
      const core = text.trim();
      if (core !== text) {
        const coreHit = table.get(core);
        if (coreHit !== undefined) out = text.replace(core, coreHit);
      }
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
  return out;
}

/**
 * A sentence with live values in it, for JSX children: the WHOLE sentence is
 * translated as one template (so each language puts the values where its own
 * word order wants them) and comes back as parts with the values dropped in.
 * A value may be a string, a number or a React element (a bold span, say).
 *   <Text>{trParts('By {name}', { name: <Text style={bold}>{who}</Text> })}</Text>
 * @param {string} template the English sentence with {placeholders}
 * @param {Object} vars
 * @returns {Array}
 */
export function trParts(template, vars = {}) {
  const text = tr(template);
  const parts = [];
  let last = 0;
  const re = /\{(\w+)\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const v = Object.prototype.hasOwnProperty.call(vars, m[1]) ? vars[m[1]] : m[0];
    parts.push(isValidElement(v) ? cloneElement(v, { key: `p${parts.length}` }) : v);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** "1 task" / "3 tasks", translated as whole phrases. */
export function trCount(n, one, many) {
  return tr(n === 1 ? one : many, { n });
}
