/**
 * Screen: the frame every page sits in: safe areas, background, an optional
 * header, scrolling, keyboard avoidance and a footer for the main action.
 *
 * Stack screens pad for the phone's bottom edge; tab screens (`inTabs`) leave
 * that to the tab bar.
 *
 * THE KEYBOARD (ui/keyboard): a scrolling screen scrolls the field being
 * typed in clear of the keyboard and of the footer, which rides up on the
 * keyboard (dropping the padding for the phone's bottom edge, which the
 * keyboard covers). `keyboard` is only for a screen that does not scroll: its
 * body then shrinks above the keyboard.
 */
import React, { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';
import { KeyboardAvoidingView, KeyboardAwareScrollView, KeyboardStickyView } from './keyboard';

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
  const [footerHeight, setFooterHeight] = useState(0);
  const avoiding = keyboard && !scroll;

  const body = scroll ? (
    <KeyboardAwareScrollView
      ref={scrollRef}
      // The field stops this far above the keyboard: clear of the footer riding on it.
      bottomOffset={(footer && footerHeight ? footerHeight - bottomInset : 0) + space(4)}
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
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  const footerView = footer ? <View style={[styles.footer, { paddingBottom: space(3) + bottomInset }]}>{footer}</View> : null;

  const inner = (
    <>
      {body}
      {footerView && !avoiding ? (
        <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }} onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
          {footerView}
        </KeyboardStickyView>
      ) : (
        footerView
      )}
      {!footer && !scroll && bottomInset ? <View style={{ height: bottomInset }} /> : null}
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }, style]}>
      {header}
      {avoiding ? (
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
