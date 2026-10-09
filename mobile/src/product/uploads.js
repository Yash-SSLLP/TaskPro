/**
 * Getting files into a task: take or choose photos (shrunk to 1600 px, JPEG
 * 70%) and choose documents. The picked files travel inside the task request
 * itself (multipart `files`, HRMS style), so nothing is uploaded until the
 * form or remark is sent.
 *
 *   picked file: { key, uri, name, mime, photo, width?, height? }
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { tr } from '../i18n';
import { toast } from '../platform/ui';
import { mimeFromName } from './api';

const MAX_SIDE = 1600;
const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 10;

export const isImage = (f) => /^image\//i.test(f?.mime || f?.mimeType || '');

const keyOf = () => `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function shrinkPhoto(asset) {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const w = asset.width || 0;
    const h = asset.height || 0;
    if (Math.max(w, h) > MAX_SIDE) context.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const image = await context.renderAsync();
    try {
      return await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    } finally {
      image.release?.();
    }
  } finally {
    context.release?.();
  }
}

/**
 * Ask the phone for photos or documents.
 * @param {'camera' | 'library' | 'document'} source
 * @returns {Promise<Array<{ key, uri, name, mime, photo }>>}
 */
export async function pickFiles(source, room = MAX_FILES) {
  if (room <= 0) return [];
  try {
    if (source === 'document') {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: room > 1, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return [];
      const ok = [];
      for (const a of res.assets.slice(0, room)) {
        if (a.size && a.size > MAX_BYTES) toast.error(tr('“{name}” is larger than 20 MB', { name: a.name }));
        else ok.push({ key: keyOf(), uri: a.uri, name: a.name || 'file', mime: a.mimeType || mimeFromName(a.name), photo: false });
      }
      return ok;
    }
    let res;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.error(tr('Allow camera access for PinTask in your phone settings to take photos.'));
        return [];
      }
      res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    } else {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: room > 1,
        selectionLimit: room,
      });
    }
    if (res.canceled || !res.assets?.length) return [];
    const out = [];
    for (const [i, a] of res.assets.slice(0, room).entries()) {
      let uri = a.uri;
      try {
        uri = (await shrinkPhoto(a)).uri;
      } catch {
        /* send the original if it cannot be shrunk */
      }
      out.push({ key: keyOf(), uri, name: `photo-${Date.now()}-${i + 1}.jpg`, mime: 'image/jpeg', photo: true });
    }
    return out;
  } catch (e) {
    toast.error(e.message || tr('Could not open that'));
    return [];
  }
}
