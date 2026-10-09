/**
 * Framing a profile photo before it is sent: the picked image in a square
 * window with the circle people will see, moved by dragging (a finger, the
 * mouse or the arrow keys) and zoomed with the slider, a pinch, the wheel or
 * + and -. Small live previews show it at the sizes the app draws it.
 *
 * "Use photo" draws the square into a 512 × 512 JPEG at 85%, so even a
 * phone's 12 MB photo goes up as a few dozen kilobytes.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Modal } from '../ui';

const OUT = 512;
const QUALITY = 0.85;
const MAX_ZOOM = 4;
const KEY_STEP = 12;

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** Open a picked file as an image; the browser turns phone photos the right way up. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo can't be opened here. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

/**
 * The square (`side` px at `x`, `y` of the image) as a 512 px JPEG. A big
 * photo is halved in steps first: one long jump down looks grainy in some
 * browsers. Transparent pixels become white.
 */
function squareJpeg(img, x, y, side) {
  let src = img;
  let sx = x;
  let sy = y;
  let s = side;
  while (s / 2 > OUT) {
    const half = Math.round(s / 2);
    const step = document.createElement('canvas');
    step.width = half;
    step.height = half;
    const g = step.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, sx, sy, s, s, 0, 0, half, half);
    src = step;
    sx = 0;
    sy = 0;
    s = half;
  }
  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, s, s, 0, 0, OUT, OUT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo. Please try again."))), 'image/jpeg', QUALITY);
  });
}

/** The photo, placed for a window `size` px wide at this view. */
function placed(image, view, size) {
  const s = (size / Math.min(image.width, image.height)) * view.z;
  return {
    width: image.width * s,
    height: image.height * s,
    transform: `translate3d(${size / 2 - view.x * s}px, ${size / 2 - view.y * s}px, 0)`,
  };
}

/** A small live circle: how the photo will look at `size` px. */
function Preview({ image, view, size }) {
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-full bg-well ring-1 ring-line" style={{ width: size, height: size }} aria-hidden>
      <img src={image.url} alt="" draggable={false} className="absolute left-0 top-0 max-w-none" style={placed(image, view, size)} />
    </span>
  );
}

/**
 * @param {{ image: { img, url, width, height }, onCancel: () => void, onSave: (blob: Blob) => void }} props
 * Mount it with `key={image.url}` so a new photo starts centred.
 */
export function PhotoCropDialog({ image, onCancel, onSave }) {
  const { width: w, height: h } = image;
  const minSide = Math.min(w, h);
  // What the window shows: zoom (1 = the short side just fills it) and the
  // image point at its centre, in image pixels.
  const [view, setView] = useState({ z: 1, x: w / 2, y: h / 2 });
  const [size, setSize] = useState(320);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const pointers = useRef(new Map());

  const fit = (v) => {
    const z = clamp(v.z, 1, MAX_ZOOM);
    const half = minSide / (2 * z);
    return { z, x: clamp(v.x, half, w - half), y: clamp(v.y, half, h - half) };
  };
  /** Move the photo by (dx, dy) screen pixels. */
  const pan = (dx, dy) =>
    setView((v) => {
      const s = (sizeRef.current / minSide) * v.z;
      return fit({ ...v, x: v.x - dx / s, y: v.y - dy / s });
    });
  /** Zoom by `factor`, keeping the point under (px, py) of the window still. */
  const zoomAt = (factor, px = sizeRef.current / 2, py = sizeRef.current / 2) =>
    setView((v) => {
      const half = sizeRef.current / 2;
      const s1 = (sizeRef.current / minSide) * v.z;
      const z = clamp(v.z * factor, 1, MAX_ZOOM);
      const s2 = (sizeRef.current / minSide) * z;
      const ix = v.x + (px - half) / s1;
      const iy = v.y + (py - half) / s1;
      return fit({ z, x: ix - (px - half) / s2, y: iy - (py - half) / s2 });
    });

  // The window's width follows the dialog (narrower on a phone).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setSize(el.clientWidth || 320);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The wheel zooms; a non-passive listener so the dialog doesn't scroll instead.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const was = [...pointers.current.values()];
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = [...pointers.current.values()];
    if (now.length === 1) {
      pan(now[0].x - was[0].x, now[0].y - was[0].y);
      return;
    }
    // Two fingers: pinch to zoom around them, and move with them.
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const r = boxRef.current.getBoundingClientRect();
    const m0 = mid(was[0], was[1]);
    const m1 = mid(now[0], now[1]);
    const d0 = dist(was[0], was[1]);
    if (d0 > 0) zoomAt(dist(now[0], now[1]) / d0, m0.x - r.left, m0.y - r.top);
    pan(m1.x - m0.x, m1.y - m0.y);
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setDragging(false);
  };
  const onKeyDown = (e) => {
    const moves = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    if (moves[e.key]) {
      e.preventDefault();
      pan(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt(1.1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomAt(1 / 1.1);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const side = minSide / view.z;
      onSave(await squareJpeg(image.img, view.x - side / 2, view.y - side / 2, side));
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Position your photo"
      subtitle="Drag to move it. Zoom until the circle looks right."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button icon={Check} onClick={save} loading={saving}>
            Use photo
          </Button>
        </>
      }
    >
      <div className="mx-auto w-full max-w-[320px]">
        <div
          ref={boxRef}
          tabIndex={0}
          role="group"
          aria-label="Photo framing. Drag or use the arrow keys to move it, plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={`relative aspect-square w-full touch-none select-none overflow-hidden rounded-2xl bg-[#15130f] outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <img
            src={image.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ ...placed(image, view, size), willChange: 'transform' }}
          />
          {/* The circle people will see; the corners are dimmed. */}
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 9999px rgba(21, 19, 15, 0.6)' }} />
          <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ring-white/85" />
          {dragging && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <span className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
              <span className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
              <span className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
              <span className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomAt(1 / 1.25)}
            disabled={view.z <= 1}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-well hover:text-ink disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.z}
            onChange={(e) => {
              const z = Number(e.target.value);
              setView((v) => fit({ ...v, z }));
            }}
            aria-label="Zoom"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-brand"
          />
          <button
            type="button"
            onClick={() => zoomAt(1.25)}
            disabled={view.z >= MAX_ZOOM}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-well hover:text-ink disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-line bg-well/60 px-4 py-3">
          <Preview image={image} view={view} size={56} />
          <Preview image={image} view={view} size={40} />
          <Preview image={image} view={view} size={28} />
          <p className="ml-1 text-xs leading-snug text-ink-soft">How people will see you in lists and on tasks</p>
        </div>
      </div>
    </Modal>
  );
}
