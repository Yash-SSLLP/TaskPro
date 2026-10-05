/**
 * Voice notes with expo-audio.
 *
 * VoicePlayer: play / pause with a progress bar and the length. The audio
 * loads on the first tap, only one note plays at a time, and a stored note
 * that needs the session is fetched with the Authorization header.
 * VoiceRecorder: the microphone button → recording (time, Stop, Cancel) →
 * a player with a remove button. It hands `{ uri, name, type, durationMs }`
 * to the parent, which sends it inside the task request as `voice`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { tr } from '../../i18n';
import { authHeaders } from '../../platform/api';
import { colors, font, radius, space, tabular } from '../../platform/theme';
import { confirm, toast } from '../../platform/ui';
import { duration } from '../taskStatus';
import { Mic, Pause, Play, Square, Trash } from '../icons';

// ---------------------------------------------------------------- playing

let playingNow = null;

/**
 * @param {{ source?: { uri: string, auth?: boolean }, uri?: string, durationMs?: number, onRemove?: () => void, style?: any }} props
 */
export function VoicePlayer({ source, uri, durationMs, onRemove, style }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(null);
  const [failed, setFailed] = useState(false);
  const src = source || (uri ? { uri, auth: false } : null);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  useEffect(
    () => () => {
      if (playingNow === player) playingNow = null;
    },
    [player]
  );

  const toggle = async () => {
    if (!src?.uri) return;
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      if (playingNow && playingNow !== player) {
        try {
          playingNow.pause();
        } catch {
          /* already released */
        }
      }
      playingNow = player;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      if (loaded.current !== src.uri) {
        player.replace(src.auth ? { uri: src.uri, headers: authHeaders() } : { uri: src.uri });
        loaded.current = src.uri;
      }
      player.play();
    } catch {
      setFailed(true);
      toast.error(tr('That recording could not be played.'));
    }
  };

  const total = durationMs ? durationMs / 1000 : status.duration || 0;
  const at = status.currentTime || 0;
  const progress = total > 0 ? Math.min(1, at / total) : 0;
  const started = at > 0.05 || status.playing;

  if (failed) return <Text style={styles.failed}>{tr('That recording could not be played.')}</Text>;

  return (
    <View style={[styles.player, style]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? tr('Pause voice note') : tr('Play voice note, {length}', { length: duration(total * 1000) })}
        hitSlop={6}
        style={({ pressed }) => [styles.play, pressed && styles.pressed]}
      >
        {status.isBuffering && !status.playing ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : status.playing ? (
          <Pause size={18} color={colors.white} fill={colors.white} />
        ) : (
          <Play size={18} color={colors.white} fill={colors.white} style={styles.playIcon} />
        )}
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.time}>{started ? `${duration(at * 1000)} / ${duration(total * 1000)}` : duration(total * 1000)}</Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} style={styles.remove} accessibilityRole="button" accessibilityLabel={tr('Remove the voice note')}>
          <Trash size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- recording

const MIN_MS = 700;

async function allowMicrophone() {
  let perm = await getRecordingPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain !== false) {
    perm = await requestRecordingPermissionsAsync();
    if (perm.granted) return true;
  }
  if (perm.canAskAgain === false) {
    const open = await confirm({
      title: tr('Allow the microphone'),
      message: tr('To record voice notes, allow Task Pro to use the microphone in your phone settings.'),
      confirmLabel: tr('Open settings'),
      cancelLabel: tr('Not now'),
    });
    if (open) Linking.openSettings().catch(() => {});
  } else {
    toast(tr('Voice notes need the microphone. You can still type.'));
  }
  return false;
}

/**
 * @returns {{ phase: 'idle' | 'starting' | 'recording' | 'stopping', elapsedMs: number,
 *   clip: { uri, name, type, durationMs } | null, start, stop, cancel, discard }}
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState('idle');
  const [clip, setClip] = useState(null);
  const startedAt = useRef(0);

  const start = useCallback(async () => {
    if (phase !== 'idle') return;
    setPhase('starting');
    try {
      if (!(await allowMicrophone())) {
        setPhase('idle');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setClip(null);
      setPhase('recording');
    } catch (e) {
      setPhase('idle');
      toast.error(e.message || tr("Couldn't start recording"));
    }
  }, [phase, recorder]);

  const finish = useCallback(
    async (keep) => {
      if (phase !== 'recording') return null;
      setPhase('stopping');
      const ms = recorder.getStatus?.()?.durationMillis || Date.now() - startedAt.current;
      try {
        await recorder.stop();
      } catch {
        /* nothing was recorded */
      }
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      setPhase('idle');
      if (!keep) return null;
      if (!uri || ms < MIN_MS) {
        toast(tr('That was too short. Tap the microphone and speak, then tap stop.'));
        return null;
      }
      const ext = (uri.split('.').pop() || 'm4a').split('?')[0];
      const next = { uri, name: `voice-note.${ext}`, type: ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`, durationMs: Math.round(ms) };
      setClip(next);
      return next;
    },
    [phase, recorder]
  );

  return {
    phase,
    elapsedMs: phase === 'recording' ? state.durationMillis || Date.now() - startedAt.current : 0,
    clip,
    start,
    stop: () => finish(true),
    cancel: () => finish(false),
    discard: () => setClip(null),
  };
}

/**
 * The recorder as one control. `value` is the recording the parent holds.
 * @param {{ value: object | null, onChange: (clip: object | null) => void, compact?: boolean, disabled?: boolean }} props
 */
export function VoiceRecorder({ value, onChange, compact = false, disabled = false }) {
  const rec = useVoiceRecorder();

  if (value && rec.phase === 'idle') {
    return <VoicePlayer uri={value.uri} durationMs={value.durationMs} onRemove={disabled ? undefined : () => onChange?.(null)} />;
  }

  if (rec.phase === 'recording' || rec.phase === 'stopping') {
    return (
      <View style={styles.recording}>
        <View style={styles.dot} />
        <Text style={styles.recTime}>{duration(rec.elapsedMs)}</Text>
        <Text style={styles.recHint} numberOfLines={1}>
          {tr('Recording…')}
        </Text>
        <Pressable
          onPress={async () => {
            const clip = await rec.stop();
            if (clip) onChange?.(clip);
          }}
          style={styles.stopBtn}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Square size={12} color={colors.white} fill={colors.white} />
          <Text style={styles.stopText}>{tr('Stop')}</Text>
        </Pressable>
        <Pressable onPress={rec.cancel} style={styles.cancelBtn} hitSlop={8} accessibilityRole="button">
          <Text style={styles.cancelText}>{tr('Cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={rec.start}
      disabled={disabled || rec.phase !== 'idle'}
      accessibilityRole="button"
      accessibilityLabel={tr('Record a voice note')}
      style={({ pressed }) => [compact ? styles.micCompact : styles.micWide, (disabled || rec.phase !== 'idle') && styles.off, pressed && styles.pressed]}
      hitSlop={6}
    >
      {rec.phase === 'starting' ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Mic size={19} color={colors.textSecondary} />}
      {!compact ? <Text style={styles.micLabel}>{tr('Record a voice note')}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.chip,
    paddingVertical: space(1.5),
    paddingLeft: space(1.5),
    paddingRight: space(3),
    alignSelf: 'stretch',
    maxWidth: 420,
  },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  playIcon: { marginLeft: 2 },
  pressed: { opacity: 0.8 },
  off: { opacity: 0.45 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#c7d2fe', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.primary },
  time: { fontSize: 13, fontWeight: font.medium, color: colors.primary, ...tabular },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  failed: { color: colors.textFaint, fontSize: 13 },
  micCompact: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  micWide: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  micLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: font.medium },
  recording: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.dangerSoft,
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  recTime: { color: '#b91c1c', fontSize: 14, fontWeight: font.semibold, ...tabular },
  recHint: { flex: 1, color: '#b91c1c', fontSize: 13 },
  stopBtn: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(3),
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
  },
  stopText: { color: colors.white, fontSize: 13, fontWeight: font.semibold },
  cancelBtn: { minHeight: 34, justifyContent: 'center', paddingHorizontal: space(2) },
  cancelText: { color: '#b91c1c', fontSize: 13 },
});
