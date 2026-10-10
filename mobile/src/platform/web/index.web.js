/**
 * The iPhone web build's adaptations (the phone app loads index.js).
 *
 * iPhones have no KARO build in the App Store, so the same app is exported
 * for the web into the website's /iphone/ (scripts/build-iphone.js) and added
 * to the home screen from Safari, where it opens full screen like an app.
 *
 * - webOrigin: the site this copy was loaded from. The API is on the same
 *   host (/api), so the web app follows whichever deployment served it.
 * - installWeb() / prepareForm(): uploads. React Native's FormData takes
 *   `{ uri, name, type }` and reads the file itself; a browser's turns that
 *   into the text "[object Object]".
 * - registerWebPush / listenWebPush: notifications through Web Push (sw.js,
 *   backend platform/services/webPush.js), the iPhone's stand-in for Expo push.
 * - WebHosts: the file viewer, date picker and allow-notifications overlays,
 *   mounted once by AppRoot.
 */
import React, { useEffect } from 'react';
import { colors } from '../theme';
import { DateTimePickerHost } from './shims/DateTimePicker';
import { FileViewerHost } from './shims/fileViewer';
import { getBlob } from './shims/fileSystem';
import PushPrompt from './PushPrompt';

export const IS_WEB = true;
export const webOrigin = typeof window !== 'undefined' ? window.location.origin : null;

const isRnFile = (v) => v && typeof v === 'object' && typeof v.uri === 'string' && !(typeof Blob !== 'undefined' && v instanceof Blob);

let installed = false;
let nativeAppend = null;

/**
 * Record every FormData append in order, and hold back React Native style
 * files until prepareForm swaps them for real Blobs. Call before any screen
 * can build an upload (index.js does).
 */
export function installWeb() {
  if (installed || typeof FormData === 'undefined') return;
  installed = true;
  nativeAppend = FormData.prototype.append;
  FormData.prototype.append = function append(name, value, filename) {
    if (!this.__entries) this.__entries = [];
    this.__entries.push([name, value, filename]);
    if (isRnFile(value)) {
      this.__hasRnFiles = true;
      return undefined;
    }
    return filename === undefined ? nativeAppend.call(this, name, value) : nativeAppend.call(this, name, value, filename);
  };
}

/**
 * The form the browser can send: held-back files resolved into Blobs (the
 * image and document pickers hand back blob: or data: uris; downloads live in
 * the in-memory file system).
 * @param {FormData} form
 * @returns {Promise<FormData>}
 */
export async function prepareForm(form) {
  if (!form || !form.__hasRnFiles) return form;
  const out = new FormData();
   
  for (const [name, value, filename] of form.__entries) {
    if (isRnFile(value)) {
      let blob = value.file instanceof Blob ? value.file : await getBlob(value.uri);
      if (value.type && blob.type !== value.type) blob = new Blob([blob], { type: value.type });
      const fname = value.name || filename || value.uri.split('?')[0].split('/').pop() || 'file';
      nativeAppend.call(out, name, blob, fname);
    } else if (filename === undefined) {
      nativeAppend.call(out, name, value);
    } else {
      nativeAppend.call(out, name, value, filename);
    }
  }
   
  return out;
}

export { registerWebPush, listenWebPush, webPushPermission } from './webPush';

/**
 * The status bar and the page behind the app take the app's own background,
 * so a Light / Dark choice that differs from the phone's still matches.
 */
function usePageColour() {
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', colors.bg);
      m.removeAttribute('media');
    });
    document.body.style.background = colors.bg;
  }, []);
}

/** @param {{ signedIn?: boolean, onPushAllowed?: () => void }} props */
export function WebHosts({ signedIn, onPushAllowed }) {
  usePageColour();
  return (
    <>
      <FileViewerHost />
      <DateTimePickerHost />
      {signedIn ? <PushPrompt onAllowed={onPushAllowed} /> : null}
    </>
  );
}
