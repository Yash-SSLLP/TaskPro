/**
 * Full-screen file viewer: swipe between photos, each fitted to the screen,
 * with a Share button. Documents (PDF, Excel, …) show their name and an
 * "Open or share" button that hands them to another app.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr } from '../../i18n';
import { authHeaders, downloadPublic } from '../../platform/api';
import { colors, font, space } from '../../platform/theme';
import { Button, IconButton, toast } from '../../platform/ui';
import { FileText, Share, X } from '../icons';
import { isImage } from '../uploads';

const isRemote = (uri) => /^https?:/i.test(uri || '');

export async function shareFile(f) {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      toast.error(tr('Sharing is not available on this phone'));
      return;
    }
    const local = isRemote(f.uri) ? await downloadPublic(f.uri, f.name || `file-${Date.now()}`, { auth: !!f.auth }) : f.uri;
    await Sharing.shareAsync(local, { mimeType: f.mime || undefined, dialogTitle: f.name || tr('Share file') });
  } catch (e) {
    toast.error(e.message || tr('Could not open this file'));
  }
}

function Page({ file, width, height }) {
  const [loading, setLoading] = useState(true);
  if (!isImage(file)) {
    return (
      <View style={[styles.page, { width, height }]}>
        <FileText size={64} color={colors.white} />
        <Text style={styles.docName} numberOfLines={3}>
          {file.name || tr('File')}
        </Text>
        <Button title={tr('Open or share')} variant="soft" full={false} onPress={() => shareFile(file)} style={styles.docButton} />
      </View>
    );
  }
  return (
    <View style={[styles.page, { width, height }]}>
      <Image
        source={file.auth ? { uri: file.uri, headers: authHeaders() } : { uri: file.uri }}
        style={{ width, height }}
        resizeMode="contain"
        onLoadEnd={() => setLoading(false)}
        accessibilityLabel={file.name || tr('Photo')}
      />
      {loading ? <ActivityIndicator color={colors.white} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** @param {{ files: Array<{ key, name, mime, uri, auth }>, index: number | null, onClose: () => void }} props */
export default function FileViewer({ files, index, onClose }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index || 0);
  const visible = index !== null && index !== undefined;
  useEffect(() => {
    if (visible) setCurrent(index);
  }, [visible, index]);
  const file = files[current] || files[0];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.root}>
        {visible ? (
          <FlatList
            data={files}
            keyExtractor={(f, i) => f.key || String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Page file={item} width={width} height={height} />}
          />
        ) : null}
        <View style={[styles.bar, { paddingTop: insets.top + space(2) }]}>
          <IconButton icon={X} label={tr('Close')} color={colors.white} onPress={onClose} />
          <Text style={styles.count} numberOfLines={1}>
            {files.length > 1 ? tr('{n} of {total}', { n: current + 1, total: files.length }) : file?.name || ''}
          </Text>
          {file ? <IconButton icon={Share} label={tr('Share')} showLabel color={colors.white} onPress={() => shareFile(file)} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  page: { alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(2),
    paddingBottom: space(2),
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  count: { flex: 1, color: colors.white, fontSize: 16, fontWeight: font.semibold, textAlign: 'center', marginHorizontal: space(2) },
  docName: { color: colors.white, fontSize: 16, marginTop: space(4), paddingHorizontal: space(8), textAlign: 'center' },
  docButton: { marginTop: space(6) },
});
