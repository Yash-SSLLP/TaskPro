/**
 * Screen: the frame every page sits in: safe areas, background, an optional
 * header, scrolling, keyboard avoidance and a footer for the main action.
 *
 * Stack screens pad for the phone's bottom edge; tab screens (`inTabs`) leave
 * that to the tab bar.
 */
import React from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';

export function Screen({
  header,
  children,
  scroll = false,
  keyboard = false,
  footer,
  inTabs = false,
  padded = true,
  refreshing = false,
  onRefresh,
  contentStyle,
  style,
  scrollRef,
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = inTabs ? 0 : insets.bottom;

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[padded && styles.padded, styles.scrollContent, !footer && { paddingBottom: space(6) + bottomInset }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  const inner = (
    <>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: space(3) + bottomInset }]}>{footer}</View> : null}
      {!footer && !scroll && bottomInset ? <View style={{ height: bottomInset }} /> : null}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }, style]}>
      {header}
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  padded: { paddingHorizontal: space(4) },
  scrollContent: { paddingTop: space(2) },
  footer: {
    paddingHorizontal: space(4),
    paddingTop: space(3),
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
