/**
 * Surfaces: Card (white, rounded, soft shadow), Section (a titled card of
 * rows with dividers between them) and Divider.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, space, type } from '../theme';

export function Card({ children, style, onPress, padded = true, accessibilityLabel }) {
  const content = [styles.card, padded && styles.padded, style];
  if (!onPress) return <View style={content}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...content, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export function Divider({ inset = 0, style }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

/** A group of rows under a small heading. Falsy children are skipped. */
export function Section({ title, children, footer, style, inset = space(4) }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <Card padded={false} style={styles.sectionCard}>
        {rows.map((row, i) => (
          <React.Fragment key={row.key ?? i}>
            {i > 0 ? <Divider inset={inset} /> : null}
            {row}
          </React.Fragment>
        ))}
      </Card>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  padded: { padding: space(4) },
  pressed: { backgroundColor: colors.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  section: { marginBottom: space(5) },
  sectionTitle: { ...type.overline, marginBottom: space(2), marginLeft: space(1) },
  sectionCard: { overflow: 'hidden' },
  sectionFooter: { ...type.caption, marginTop: space(2), marginHorizontal: space(1) },
});
