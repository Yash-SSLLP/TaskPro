/**
 * A labelled on/off switch with a line of explanation; the whole row is
 * the tap target.
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, font, radius, space, type } from '../theme';

export function SwitchRow({ label, description, value, onChange, disabled = false, boxed = true, style }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      style={({ pressed }) => [styles.row, boxed && styles.boxed, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor={colors.white}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 56, paddingVertical: space(3) },
  boxed: {
    paddingHorizontal: space(4),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    marginBottom: space(5),
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { flex: 1 },
  label: { fontSize: 16, fontWeight: font.medium, color: colors.text },
  description: { ...type.small, marginTop: 2, lineHeight: 19 },
});
