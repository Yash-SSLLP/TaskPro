/**
 * Files on a task or a remark: FileTile (photo thumbnail or document icon),
 * FileGrid (tiles that open the viewer), PickedFiles (files chosen for a form,
 * not sent yet) and AttachSheet ("Take photo", "Choose photos", "Choose a
 * document").
 *
 * A viewable file is { key, name, mime, uri, auth }: `auth` means the uri is
 * a session-protected stream and needs the Authorization header.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { authHeaders } from '../../platform/api';
import { colors, font, radius, space } from '../../platform/theme';
import { BottomSheet, ListRow } from '../../platform/ui';
import { attachmentSource } from '../api';
import { Camera, FileText, ImageIcon, Paperclip, X } from '../icons';
import { isImage, pickFiles } from '../uploads';
import FileViewer from './FileViewer';

const extLabel = (name) => (/\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1] || tr('file')).toUpperCase();

/** A task attachment (HRMS shape, plus `url`) → a viewable file. */
export function viewable(taskId, f) {
  const src = attachmentSource(taskId, f);
  return { key: String(f._id || f.id || src.uri), name: f.name || f.originalName || tr('Attachment'), mime: f.mimeType || f.mime || '', uri: src.uri, auth: src.auth };
}

export const imageSource = (file) => (file.auth ? { uri: file.uri, headers: authHeaders() } : { uri: file.uri });

export function FileTile({ file, size = 80, onPress, onRemove }) {
  const dims = { width: size, height: size };
  return (
    <View style={dims}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tr('Open {name}', { name: file.name || tr('file') })} style={[styles.tile, dims]}>
        {isImage(file) && file.uri ? (
          <Image source={imageSource(file)} style={dims} />
        ) : (
          <View style={styles.doc}>
            <FileText size={size > 64 ? 26 : 20} color={colors.textSecondary} />
            <Text style={styles.docExt}>{extLabel(file.name)}</Text>
            {size > 64 ? (
              <Text style={styles.docName} numberOfLines={1}>
                {file.name}
              </Text>
            ) : null}
          </View>
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={tr('Remove {name}', { name: file.name || tr('file') })}
          hitSlop={8}
        >
          <X size={14} color={colors.white} strokeWidth={3} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tiles for files; tapping one opens the viewer. */
export function FileGrid({ files, size = 80, onRemove, style }) {
  const [viewing, setViewing] = useState(null);
  if (!files?.length) return null;
  return (
    <View style={[styles.grid, style]}>
      {files.map((f, i) => (
        <FileTile key={f.key || i} file={f} size={size} onPress={() => setViewing(i)} onRemove={onRemove ? () => onRemove(f) : undefined} />
      ))}
      <FileViewer files={files} index={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

/** "Add a file" choices. The sheet closes before the camera or picker opens. */
export function AttachSheet({ visible, onClose, onPicked, room = 10, title }) {
  const choose = (source) => {
    onClose();
    setTimeout(async () => {
      const picked = await pickFiles(source, room);
      if (picked.length) onPicked(picked);
    }, 350);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title || tr('Add a file')}>
      <ListRow icon={Camera} iconColor={colors.primary} title={tr('Take photo')} chevron={false} onPress={() => choose('camera')} style={styles.choice} />
      <ListRow icon={ImageIcon} iconColor={colors.primary} title={tr('Choose photos')} chevron={false} onPress={() => choose('library')} style={styles.choice} />
      <ListRow
        icon={Paperclip}
        iconColor={colors.primary}
        title={tr('Choose a document')}
        subtitle={tr('PDF, Word, Excel and more, up to 20 MB')}
        chevron={false}
        onPress={() => choose('document')}
        style={styles.choice}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  tile: { borderRadius: radius.input, overflow: 'hidden', backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  doc: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: space(1) },
  docExt: { fontSize: 11, fontWeight: font.bold, color: colors.textSecondary },
  docName: { fontSize: 10, color: colors.textSecondary, maxWidth: '100%' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  choice: { paddingHorizontal: space(1) },
});
