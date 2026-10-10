// Web only (metro.config.js): `expo-sharing` for the iPhone web build.
//
// shareAsync(uri) comes after a download, by which time Safari no longer
// counts the original tap as permission to open the share sheet. So it tries
// the share sheet, and when Safari refuses, opens the file in the in-app
// viewer (./fileViewer), whose Share button is a fresh tap that always works.
import { getBlob } from './fileSystem';
import { presentFile, shareBlob } from './fileViewer';

export async function isAvailableAsync() {
  return true;
}

export async function shareAsync(uri, options = {}) {
  const blob = await getBlob(uri);
  const name = decodeURIComponent(String(uri).split('?')[0].split('/').pop() || 'file');
  try {
    if (await shareBlob(blob, name, options.mimeType)) return;
  } catch {
    /* NotAllowedError: no tap left to spend; the viewer below has one */
  }
  await presentFile({ blob, name, mimeType: options.mimeType });
}

export default { isAvailableAsync, shareAsync };
