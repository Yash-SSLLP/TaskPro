/**
 * The phone app: nothing to adapt. The iPhone web build loads index.web.js
 * instead (Metro picks the .web.js file for the web platform).
 */
export const IS_WEB = false;
export const webOrigin = null;
export function installWeb() {}
export async function prepareForm(form) {
  return form;
}
export async function registerWebPush() {
  return null;
}
export function listenWebPush() {
  return () => {};
}
export function webPushPermission() {
  return null;
}
export function WebHosts() {
  return null;
}
