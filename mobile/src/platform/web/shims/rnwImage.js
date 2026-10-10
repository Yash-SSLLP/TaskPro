// Web only (metro.config.js): react-native-web's Image, plus `source.headers`.
//
// RNW ignores headers, and every protected photo in the app (avatars, task
// photos) is fetched with a bearer header. Such a source is fetched
// here with its headers and shown from a blob URL; any other source goes
// straight to RNW's Image.
import React, { forwardRef, useEffect, useState } from 'react';
import { Image as RNWImage } from 'react-native-web';

// uri → object URL, shared across mounts so a list of avatars is fetched once.
const blobCache = new Map();
const inflight = new Map();

function fetchAuthed(uri, headers) {
  if (blobCache.has(uri)) return Promise.resolve(blobCache.get(uri));
  if (inflight.has(uri)) return inflight.get(uri);
  const p = fetch(uri, { headers })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      blobCache.set(uri, url);
      return url;
    })
    .finally(() => inflight.delete(uri));
  inflight.set(uri, p);
  return p;
}

const AuthImage = forwardRef(function AuthImage(props, ref) {
  const { source, onError, onLoadEnd } = props;
  const single = source && !Array.isArray(source) && typeof source === 'object' ? source : null;
  const needsAuth = !!(single && single.uri && single.headers && Object.keys(single.headers).length);
  const [blobUri, setBlobUri] = useState(() => (needsAuth ? blobCache.get(single.uri) || null : null));

  const uri = single?.uri;
  const auth = needsAuth ? JSON.stringify(single.headers) : '';
  useEffect(() => {
    if (!needsAuth) return undefined;
    let live = true;
    const cached = blobCache.get(uri);
    if (cached) { setBlobUri(cached); return undefined; }
    setBlobUri(null);
    fetchAuthed(uri, single.headers)
      .then((u) => { if (live) setBlobUri(u); })
      .catch((err) => {
        if (!live) return;
        onError?.({ nativeEvent: { error: err.message } });
        onLoadEnd?.();
      });
    return () => { live = false; };
  }, [uri, auth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!needsAuth) return <RNWImage ref={ref} {...props} />;
  const { headers, ...rest } = single;
  return <RNWImage ref={ref} {...props} source={blobUri ? { ...rest, uri: blobUri } : undefined} />;
});
Object.assign(AuthImage, {
  getSize: RNWImage.getSize,
  getSizeWithHeaders: (uri, headers, ok, fail) => fetchAuthed(uri, headers)
    .then((u) => RNWImage.getSize(u, ok, fail))
    .catch((e) => fail?.(e)),
  prefetch: RNWImage.prefetch,
  queryCache: RNWImage.queryCache,
  resolveAssetSource: RNWImage.resolveAssetSource,
});

export default AuthImage;
