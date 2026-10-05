/**
 * Avatar: initials in a circle, with a soft colour picked from the name so
 * the same person always gets the same colour ("Ravi Kumar" → "RK").
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { initials } from '../format';
import { avatarPalette, font } from '../theme';

function colourFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return avatarPalette[h % avatarPalette.length];
}

export function Avatar({ name, size = 40, style, dimmed = false }) {
  const [bg, fg] = colourFor(name);
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }, dimmed && styles.dimmed, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.text, { color: fg, fontSize: Math.round(size * 0.38) }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: font.semibold },
  dimmed: { opacity: 0.5 },
});
