/**
 * TextField: a labelled input with a focus ring, an error or hint line under
 * it, and a show/hide eye for passwords. FieldLabel and FieldError are
 * exported for custom fields that want the same look.
 */
import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from '../icons';
import { colors, font, radius, space } from '../theme';
import { tr } from '../../i18n';

export function FieldLabel({ children, optional }) {
  return (
    <Text style={styles.label}>
      {children}
      {optional ? <Text style={styles.optional}>{`  ${tr('optional')}`}</Text> : null}
    </Text>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export const TextField = forwardRef(function TextField(
  { label, optional, value, onChangeText, error, hint, secure = false, left, right, multiline = false, style, inputStyle, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      {label ? <FieldLabel optional={optional}>{label}</FieldLabel> : null}
      <View style={[styles.box, multiline && styles.boxMultiline, focused && styles.boxFocused, !!error && styles.boxError]}>
        {left}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && !reveal}
          multiline={multiline}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={reveal ? tr('Hide password') : tr('Show password')}
            style={styles.eye}
            hitSlop={6}
          >
            {reveal ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
          </Pressable>
        ) : (
          right
        )}
      </View>
      {error ? <FieldError>{error}</FieldError> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export const fieldStyles = StyleSheet.create({
  box: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
  },
  focused: { borderColor: colors.primary, borderWidth: 2, paddingHorizontal: space(3) - 1 },
  error: { borderColor: colors.danger },
});

const styles = StyleSheet.create({
  wrap: { marginBottom: space(4) },
  label: { fontSize: 14, fontWeight: font.medium, color: colors.text, marginBottom: space(1.5) },
  optional: { fontSize: 13, fontWeight: font.regular, color: colors.textFaint },
  box: fieldStyles.box,
  boxMultiline: { alignItems: 'flex-start', paddingVertical: space(2) },
  boxFocused: fieldStyles.focused,
  boxError: fieldStyles.error,
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: space(3) },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top', paddingVertical: space(1) },
  eye: { paddingLeft: space(2), height: 44, justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 13, marginTop: space(1.5) },
  hint: { color: colors.textSecondary, fontSize: 13, marginTop: space(1.5) },
});
