/**
 * The website's pictures. The browser shrinks each one before it is sent
 * (canvas → WebP, at most 1600 px a side, plus a 640 px small copy for cards
 * and phones), so an upload stays under Vercel's ~4.5 MB request cap and the
 * site stays quick. The server checks the bytes again (JPEG, PNG or WebP only;
 * never SVG) — see POST /api/site/media in backend/API.md §6.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';

const MAX_SIDE = 1600;
const THUMB_SIDE = 640;
const MAX_BYTES = 4 * 1024 * 1024;

const NOT_A_PICTURE = 'Choose a picture (JPEG, PNG or WebP). SVG and other files cannot be used on the website.';

/** Every picture in the library (60 a page on the server), newest first. */
export function useMediaLibrary() {
  return useQuery({
    queryKey: ['site', 'media'],
    queryFn: async () => {
      const all = [];
      for (let page = 1; page <= 20; page += 1) {
        const res = await api.get(`/api/site/media?page=${page}`);
        all.push(...(res.media || []));
        if (page >= (res.pages || 1)) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
}

/** The picture, decoded: something canvas can draw, with its size. */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close?.() };
    } catch {
      /* not every browser takes every format this way: try an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Couldn't read that picture. Try a JPEG, PNG or WebP file.");
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** One copy no bigger than `side` a side, as WebP (JPEG where the browser can't write WebP), under MAX_BYTES. */
async function shrink(pic, side) {
  const scale = Math.min(1, side / Math.max(pic.width, pic.height));
  const width = Math.max(1, Math.round(pic.width * scale));
  const height = Math.max(1, Math.round(pic.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic.source, 0, 0, width, height);
  let flat = null;
  for (const quality of [0.86, 0.76, 0.62]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') {
      // Older Safari writes PNG instead: send JPEG, on white (it has no transparency).
      if (!flat) {
        flat = document.createElement('canvas');
        flat.width = width;
        flat.height = height;
        const f = flat.getContext('2d');
        f.fillStyle = '#ffffff';
        f.fillRect(0, 0, width, height);
        f.drawImage(canvas, 0, 0);
      }
      blob = await toBlob(flat, 'image/jpeg', quality);
    }
    if (blob && blob.size <= MAX_BYTES) return { blob, width, height, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
  }
  throw new Error('That picture is still over 4 MB after shrinking it. Try a smaller one.');
}

/** The picture ready to send: the full copy and, when it is bigger than that, the small one. */
async function preparePicture(file) {
  if (!file || !/^image\//.test(file.type) || /svg/i.test(file.type)) throw new Error(NOT_A_PICTURE);
  const pic = await decode(file);
  try {
    if (!pic.width || !pic.height) throw new Error("Couldn't read that picture. Try a JPEG, PNG or WebP file.");
    const full = await shrink(pic, MAX_SIDE);
    const thumb = Math.max(full.width, full.height) > THUMB_SIDE ? await shrink(pic, THUMB_SIDE) : null;
    return { full, thumb };
  } finally {
    pic.done();
  }
}

/** Shrink and upload one picture; resolves to the new Media. */
export async function uploadPicture(file, { alt = '' } = {}) {
  const { full, thumb } = await preparePicture(file);
  const base = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
  const form = new FormData();
  form.append('name', base);
  if (alt.trim()) form.append('alt', alt.trim());
  form.append('file', full.blob, `${base}.${full.ext}`);
  if (thumb) form.append('thumb', thumb.blob, `${base}-small.${thumb.ext}`);
  const res = await api.post('/api/site/media', form);
  return res.media;
}
