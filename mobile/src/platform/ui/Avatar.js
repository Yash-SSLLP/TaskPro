/**
 * Avatar: a person's profile photo, or their initials in a circle with a
 * soft colour picked from the name, so the same person always gets the same
 * colour ("Ravi Kumar" → "RK").
 *
 * Pass `person` (anything with `name` and `photoUrl`, as the API sends
 * people), or `name` and `photoUrl`; `uri` shows a local picture (a photo
 * still uploading). The initials sit underneath, so they show while the
 * photo loads and stay if it can't be loaded.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fileUrl } from '../api';
import { initials } from '../format';
import { avatarPalette, font } from '../theme';

function colourFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}

export function Avatar({ person, name, photoUrl, uri, size = 40, style, dimmed = false }) {
  const label = name ?? person?.name ?? '';
  const src = uri || fileUrl(photoUrl || person?.photoUrl) || null;
  const [failed, setFailed] = useState(null);
  const [bg, fg] = colourFor(label);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={[styles.circle, round, { backgroundColor: bg }, dimmed && styles.dimmed, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, { color: fg, fontSize: Math.round(size * 0.38) }]}>{initials(label)}</Text>
      {src && failed !== src ? <Image source={{ uri: src }} style={[styles.photo, round]} onError={() => setFailed(src)} fadeDuration={150} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontWeight: font.semibold },
  photo: { position: 'absolute', top: 0, left: 0 },
  dimmed: { opacity: 0.5 },
});
