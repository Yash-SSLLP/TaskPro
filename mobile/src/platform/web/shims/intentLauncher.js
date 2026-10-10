// Web only (metro.config.js) — `expo-intent-launcher`: Android intents do not
// exist in a browser. Every caller already treats a rejection as "no viewer"
// and falls back (files open in the in-app viewer on web instead).
export const ResultCode = { Success: -1, Canceled: 0, FirstUser: 1 };
export const ActivityAction = {};

export async function startActivityAsync() {
  throw new Error('Not available on this device.');
}

export async function getApplicationIconAsync() { return ''; }
export async function openApplication() {}
