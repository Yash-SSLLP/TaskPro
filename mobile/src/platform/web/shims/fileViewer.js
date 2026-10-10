// Web only: the iPhone web build's stand-in for "open with another app".
//
// On Android a document is handed to another app through the share sheet. A
// home-screen web app cannot open a blob in a new tab, and Safari only opens
// its share sheet from a fresh tap, so a file that could not be shared
// straight away opens here: a full-screen sheet with the document (PDF pages
// drawn by pdf.js, photos as images) and Save / Share buttons. Share is the
// iOS share sheet (Save to Files, Print, Mail, WhatsApp).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native-web';
import { colors, font, space } from '../../theme';
import { Download, FileText, Share, X } from '../../icons';
import { getBlob } from './fileSystem';

let listener = null;

const nameOf = (uri) => decodeURIComponent(String(uri).split('?')[0].split('/').pop() || 'file');

/**
 * Show a file.
 * @param {{uri?: string, blob?: Blob, name?: string, mimeType?: string}} file
 */
export async function presentFile({ uri, blob, name, mimeType }) {
  const b = blob || (await getBlob(uri));
  const file = { blob: b, name: name || nameOf(uri), type: mimeType || b.type || '', url: URL.createObjectURL(b), id: Date.now() };
  if (listener) listener(file);
  else saveBlob(file.blob, file.name);
}

/** Hand a file to the iOS share sheet. Needs a tap. @returns {Promise<boolean>} */
export async function shareBlob(blob, name, type) {
  const file = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return true; // closed by the person
      throw err;
    }
  }
  return false;
}

/** Save through the browser's own download. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// pdf.js is copied next to the app by scripts/build-iphone.js (renamed .js, as
// some hosts send .mjs with the wrong type) and loaded only when a PDF opens.
let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    const base = new URL('pdfjs/', document.baseURI).href;
    const dynamicImport = new Function('u', 'return import(u)');  
    pdfjsPromise = dynamicImport(`${base}pdf.min.js`).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.js`;
      return lib;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

function PdfPages({ blob, url }) {
  const holder = useRef(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const lib = await loadPdfJs();
        const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const el = holder.current;
        if (!el || dead) return;
        const width = el.clientWidth || window.innerWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= doc.numPages && !dead; n += 1) {
          const page = await doc.getPage(n);  
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.cssText = 'width:100%;display:block;margin-bottom:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25)';
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;  
          if (n === 1) setState('ready');
        }
      } catch {
        if (!dead) setState('fallback');
      }
    })();
    return () => {
      dead = true;
    };
  }, [blob]);

  if (state === 'fallback') {
    return React.createElement('iframe', { src: url, title: 'Document', style: { border: 0, width: '100%', height: '100%', background: '#fff' } });
  }
  return (
    <View style={{ flex: 1 }}>
      {state === 'loading' ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : null}
      {React.createElement('div', { ref: holder, style: { width: '100%' } })}
    </View>
  );
}

function BarButton({ icon: Icon, label, onPress, disabled, color }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      <Icon size={22} color={color} />
    </Pressable>
  );
}

/** Mount once near the root (WebHosts does). */
export function FileViewerHost() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listener = setFile;
    return () => {
      if (listener === setFile) listener = null;
    };
  }, []);
  if (!file) return null;

  const close = () => {
    URL.revokeObjectURL(file.url);
    setFile(null);
  };
  const share = async () => {
    setBusy(true);
    try {
      if (!(await shareBlob(file.blob, file.name, file.type))) saveBlob(file.blob, file.name);
    } catch {
      saveBlob(file.blob, file.name);
    } finally {
      setBusy(false);
    }
  };
  const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
  const isImage = /^image\//i.test(file.type) || /\.(png|jpe?g|gif|webp)$/i.test(file.name);

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={[styles.bar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <BarButton icon={X} label="Close" onPress={close} color={colors.text} />
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {file.name}
          </Text>
          <BarButton icon={Download} label="Save" onPress={() => saveBlob(file.blob, file.name)} color={colors.text} />
          <BarButton icon={Share} label="Share" onPress={share} disabled={busy} color={colors.primary} />
        </View>
        {isPdf ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pdfBody}>
            <PdfPages blob={file.blob} url={file.url} />
          </ScrollView>
        ) : isImage ? (
          <View style={styles.imageBody}>
            <Image source={{ uri: file.url }} style={styles.image} resizeMode="contain" />
          </View>
        ) : (
          <View style={styles.other}>
            <FileText size={56} color={colors.textSecondary} />
            <Text style={[styles.otherName, { color: colors.text }]}>{file.name}</Text>
            <Pressable onPress={share} style={[styles.bigBtn, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Share size={18} color={colors.onPrimary} />
              <Text style={[styles.bigBtnText, { color: colors.onPrimary }]}>Share</Text>
            </Pressable>
            <Pressable
              onPress={() => saveBlob(file.blob, file.name)}
              style={[styles.bigBtn, { borderColor: colors.borderStrong, borderWidth: 1 }]}
              accessibilityRole="button"
            >
              <Download size={18} color={colors.text} />
              <Text style={[styles.bigBtnText, { color: colors.text }]}>Save</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Plain objects, not StyleSheet.create: this module may load before the theme.
const styles = {
  root: { flex: 1, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: space(1), borderBottomWidth: 1 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, fontWeight: font.semibold, marginHorizontal: space(1) },
  pdfBody: { padding: space(2.5), flexGrow: 1 },
  imageBody: { flex: 1, padding: space(2) },
  image: { flex: 1, width: '100%' },
  other: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  otherName: { fontSize: 16, fontWeight: font.semibold, marginTop: space(3), marginBottom: space(6), textAlign: 'center' },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    minHeight: 48,
    minWidth: 200,
    borderRadius: 12,
    paddingHorizontal: space(5),
    marginTop: space(2.5),
  },
  bigBtnText: { fontSize: 16, fontWeight: font.semibold },
};
