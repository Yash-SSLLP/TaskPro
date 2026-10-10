// Web only (metro.config.js): `expo-secure-store` for the iPhone web build.
//
// A page has no Keychain; the nearest thing is the home-screen app's own
// storage, which iOS keeps apart from Safari's. It holds the session token
// (platform/session.js), as the website itself does.
export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

const PREFIX = 'securestore:';

export async function isAvailableAsync() {
  return true;
}

export async function getItemAsync(key) {
  try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
}

export async function setItemAsync(key, value) {
  window.localStorage.setItem(PREFIX + key, String(value));
}

export async function deleteItemAsync(key) {
  try { window.localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export function getItem(key) {
  try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
}

export function setItem(key, value) {
  window.localStorage.setItem(PREFIX + key, String(value));
}

export function canUseBiometricAuthentication() {
  return false;
}
