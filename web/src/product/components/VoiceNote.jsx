/**
 * Recording and playing a voice note (MediaRecorder).
 *
 * The container is negotiated (webm on Chrome/Firefox, mp4 on Safari) and
 * whatever comes out is uploaded. The microphone is released on every exit
 * path, and permission is asked only when the button is pressed.
 *
 * The recorder calls `onChange({ blob, name, durationMs, url })`, or
 * `onChange(null)` when it is cleared; the parent sends it with the request.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { api, apiUrl } from '../../platform/api';
import { duration as fmtDuration } from '../lifecycle';

function pickMimeType() {
  const wanted = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return null;
  return wanted.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
}

const extensionFor = (mime = '') => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

export function VoiceRecorder({ value, onChange, disabled = false, compact = false }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [levels, setLevels] = useState([]);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const release = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const watchLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const read = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] - 128));
      setLevels((prev) => [...prev.slice(-47), Math.min(1, peak / 90)]);
      rafRef.current = requestAnimationFrame(read);
    };
    rafRef.current = requestAnimationFrame(read);
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot record audio. Try Chrome, Edge or Safari.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = Date.now() - startedAtRef.current;
        release();
        setRecording(false);
        setLevels([]);
        setElapsed(0);
        if (blob.size < 1024 || durationMs < 700) {
          setError('That was too short to save. Keep recording while you speak.');
          return;
        }
        onChangeRef.current?.({ blob, name: `voice-note.${extensionFor(type)}`, durationMs, url: URL.createObjectURL(blob) });
      };
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
        watchLevels();
      } catch {
        /* no waveform; the recording itself is unaffected */
      }
    } catch (err) {
      release();
      setRecording(false);
      setError(err?.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it for this site and try again.' : 'Could not start recording.');
    }
  }, [release, watchLevels]);

  const stop = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      release();
      setRecording(false);
    }
  }, [release]);

  const cancel = useCallback(() => {
    if (recorderRef.current) recorderRef.current.onstop = null;
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    release();
    setRecording(false);
    setElapsed(0);
    setLevels([]);
  }, [release]);

  if (value && !recording) {
    return <VoicePlayer src={value.url} durationMs={value.durationMs} onRemove={disabled ? undefined : () => onChange?.(null)} />;
  }

  if (recording) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
          {levels.map((lvl, i) => (
            <span key={i} className="w-[3px] shrink-0 rounded-full bg-red-400" style={{ height: `${Math.max(10, lvl * 100)}%` }} />
          ))}
        </div>
        <span className="shrink-0 font-mono text-xs text-red-700">{fmtDuration(elapsed)}</span>
        <button type="button" onClick={stop} className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700">
          <Square className="h-[11px] w-[11px]" /> Stop
        </button>
        <button type="button" onClick={cancel} className="min-h-[32px] shrink-0 rounded-lg px-2 text-xs text-red-700 hover:bg-red-100">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? 'inline-flex flex-col' : 'space-y-1'}>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        title="Record a voice note"
        aria-label="Record a voice note"
        className={clsx(
          'inline-flex items-center justify-center gap-2 border border-line bg-card text-ink-soft transition-colors hover:border-slate-300 hover:text-brand disabled:opacity-40',
          // The same 36px square as the attachment buttons beside it.
          compact ? 'h-9 w-9 shrink-0 rounded-lg' : 'min-h-[36px] rounded-xl px-3 text-sm'
        )}
      >
        <Mic className="h-4 w-4" />
        {!compact && <span>Record a voice note</span>}
      </button>
      {error && (
        <p className="flex max-w-xs items-start gap-1 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Play one back. `src` is a local object URL or a signed URL; `path` is a
 * session-only API path (fetched as a blob first, since <audio> can't send
 * the token).
 */
export function VoicePlayer({ src, path, durationMs, onRemove, className }) {
  const [url, setUrl] = useState(src ? apiUrl(src) : null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef(null);
  const madeRef = useRef(null);
  const pendingPlay = useRef(false);

  useEffect(() => setUrl(src ? apiUrl(src) : null), [src]);
  useEffect(
    () => () => {
      if (madeRef.current) URL.revokeObjectURL(madeRef.current);
    },
    []
  );

  const toggle = async () => {
    if (!url) {
      if (!path) return;
      setLoading(true);
      try {
        const made = await api.blobUrl(path);
        madeRef.current = made;
        pendingPlay.current = true;
        setUrl(made);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    }
  };

  if (failed) return <p className={clsx('text-xs text-ink-faint', className)}>That recording could not be played.</p>;

  const shown = durationMs ? `${fmtDuration(progress ? progress * durationMs : 0)} / ${fmtDuration(durationMs)}` : null;

  return (
    <div className={clsx('flex w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-well px-3 py-2', className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-on-brand disabled:opacity-50"
        aria-label={playing ? 'Pause' : 'Play the voice note'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-ink-soft">{loading ? 'Loading…' : shown || 'Voice note'}</p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-slate-200 hover:text-red-600" aria-label="Remove the voice note">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onCanPlay={(e) => {
            if (pendingPlay.current) {
              pendingPlay.current = false;
              e.currentTarget.play().then(() => setPlaying(true)).catch(() => {});
            }
          }}
          onTimeUpdate={(e) => {
            const { currentTime, duration: d } = e.currentTarget;
            if (d && Number.isFinite(d)) setProgress(currentTime / d);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  );
}
