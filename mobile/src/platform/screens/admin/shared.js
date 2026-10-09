/**
 * What the Super Admin screens share: devices and app versions (and the
 * published release to compare them with), presence, polling while a screen
 * is open, and one line of the activity log.
 *
 * The activity log's sentences and badges come from the server in English
 * (server text stays English); everything around them is translated.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import ActivityIcon from 'lucide-react-native/icons/activity';
import Bot from 'lucide-react-native/icons/bot';
import Globe from 'lucide-react-native/icons/globe';
import Monitor from 'lucide-react-native/icons/monitor';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import UserRound from 'lucide-react-native/icons/user-round';
import { tr } from '../../../i18n';
import { getApiUrl } from '../../api';
import { platformKeys } from '../../endpoints';
import { formatTime, relativeTime } from '../../format';
import { Smartphone } from '../../icons';
import { colors, font, space, type } from '../../theme';
import { Avatar, Badge } from '../../ui';

export { ActivityIcon, Globe, Monitor };

// ---------------------------------------------------------------- devices

/** The platform's name, in the app's language. */
export function platformLabel(p) {
  if (p === 'android') return tr('Android');
  if (p === 'ios') return tr('iPhone');
  if (p === 'web') return tr('Web');
  return tr('Other device');
}

export const PlatformIcon = ({ platform, size = 18, color = colors.textSecondary }) => {
  const Icon = platform === 'web' ? Monitor : platform === 'android' || platform === 'ios' ? Smartphone : Globe;
  return <Icon size={size} color={color} strokeWidth={2} />;
};

/** "Pixel 7 · Android 14", "Chrome on Windows", or the platform's name. */
export function deviceLine(s) {
  const parts = [s?.deviceName || platformLabel(s?.platform)];
  if (s?.osVersion && !String(s.deviceName || '').includes(s.osVersion)) parts.push(s.osVersion);
  return parts.filter(Boolean).join(' · ');
}

/** "Online now" or "5 min ago". */
export const seenLabel = (s) => (s?.online ? tr('Online now') : s?.lastSeenAt ? relativeTime(s.lastSeenAt) : tr('Never'));

/** A green dot while online, a grey ring otherwise. */
export function OnlineDot({ online, size = 9, style }) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        online ? styles.dotOn : styles.dotOff,
        style,
      ]}
    />
  );
}

/** An avatar with the online dot on its corner. */
export function PersonAvatar({ person, size = 40, online, dimmed }) {
  return (
    <View>
      <Avatar person={person} size={size} dimmed={dimmed} />
      {online ? <View style={[styles.avatarDot, { right: -1, bottom: -1 }]} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- app versions

/** The newest published Android build (<server>/app/release.json), or null. */
export function useRelease() {
  return useQuery({
    queryKey: platformKeys.release,
    queryFn: async () => {
      try {
        const res = await fetch(`${getApiUrl()}/app/release.json?t=${Date.now()}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const r = await res.json();
        const versionCode = Number(r?.versionCode) || 0;
        return versionCode ? { versionName: String(r.versionName || ''), versionCode, publishedAt: r.publishedAt || null } : null;
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** -1, 0 or 1 for two dotted versions ("1.0.10" > "1.0.9"). */
export function compareVersions(a, b) {
  const x = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** 'latest', 'behind', or null when it cannot be told (no release, no version, the web). */
export function freshness(s, latest) {
  if (!latest || !s || (s.platform !== 'android' && s.platform !== 'ios')) return null;
  const build = Number(s.appBuild) || 0;
  if (s.platform === 'android' && build) return build >= latest.versionCode ? 'latest' : 'behind';
  if (s.appVersion && latest.versionName) return compareVersions(s.appVersion, latest.versionName) >= 0 ? 'latest' : 'behind';
  return null;
}

/** "1.0.3 (4)", "Web", "Not reported". */
export function versionLabel(s) {
  if (s?.platform === 'web') return tr('Web');
  if (!s?.appVersion) return tr('Not reported');
  return `${s.appVersion}${s.appBuild ? ` (${s.appBuild})` : ''}`;
}

/** The version with a badge saying whether it is the newest. */
export function VersionLine({ s, latest, style }) {
  const state = freshness(s, latest);
  return (
    <View style={[styles.versionRow, style]}>
      <Text style={styles.versionText}>{versionLabel(s)}</Text>
      {state === 'behind' ? <Badge label={tr('Out of date')} tone="warning" /> : null}
      {state === 'latest' ? <Badge label={tr('Latest')} tone="success" /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- polling

/**
 * Call `refetch` every `ms` while this screen is focused AND the app is in
 * the foreground; once more as soon as the app comes back.
 */
export function useLivePolling(refetch, ms = 10000) {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  }, [refetch]);
  useFocusEffect(
    useCallback(() => {
      let timer = null;
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
      const start = () => {
        stop();
        timer = setInterval(() => latest.current?.(), ms);
      };
      if (AppState.currentState === 'active') start();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          latest.current?.();
          start();
        } else stop();
      });
      return () => {
        stop();
        sub.remove();
      };
    }, [ms])
  );
}

// ---------------------------------------------------------------- activity

const BADGE_TONE = { good: 'success', bad: 'danger', wait: 'warning', info: 'info', neutral: 'neutral' };

export function ActivityBadge({ badge }) {
  if (!badge?.text) return null;
  return <Badge label={badge.text} tone={BADGE_TONE[badge.tone] || 'neutral'} />;
}

/** The round mark at the start of a row: the person, the system, or "someone". */
export function ActorMark({ item, size = 34 }) {
  if (item?.actorName) return <Avatar person={{ name: item.actorName, photoUrl: item.actorPhotoUrl }} size={size} />;
  const Icon = item?.meta?.system ? Bot : item?.action === 'auth.login_failed' ? ShieldAlert : UserRound;
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon size={Math.round(size * 0.5)} color={colors.textSecondary} />
    </View>
  );
}

/** The sentence, with whoever did it in bold. */
export function Sentence({ item, style, numberOfLines }) {
  const s = item?.summary || '';
  const who = item?.actorLabel || '';
  if (who && s.startsWith(who)) {
    return (
      <Text style={[styles.sentence, style]} numberOfLines={numberOfLines}>
        <Text style={styles.sentenceWho}>{who}</Text>
        {s.slice(who.length)}
      </Text>
    );
  }
  return (
    <Text style={[styles.sentence, style]} numberOfLines={numberOfLines}>
      {s}
    </Text>
  );
}

/** One line of the log. `withDay` shows "2h ago" instead of the clock time. */
export function ActivityRow({ item, onPress, withDay = false }) {
  const when = withDay ? relativeTime(item.at) : formatTime(item.at);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole={onPress ? 'button' : undefined}>
      <ActorMark item={item} />
      <View style={styles.rowBody}>
        <Sentence item={item} numberOfLines={4} />
        <View style={styles.rowMeta}>
          <Text style={styles.meta}>{when}</Text>
          {item.platform ? (
            <View style={styles.metaPlace}>
              <PlatformIcon platform={item.platform} size={12} color={colors.textFaint} />
              <Text style={styles.meta}>{platformLabel(item.platform)}</Text>
            </View>
          ) : null}
          <ActivityBadge badge={item.badge} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dotOn: { backgroundColor: colors.successFill },
  dotOff: { borderWidth: 1, borderColor: colors.borderStrong },
  avatarDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.successFill, borderWidth: 2, borderColor: colors.card },
  versionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(1.5) },
  versionText: { fontSize: 13, color: colors.text, fontWeight: font.medium, fontVariant: ['tabular-nums'] },
  mark: { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  sentence: { fontSize: 14, lineHeight: 20, color: colors.text },
  sentenceWho: { fontWeight: font.bold },
  row: { flexDirection: 'row', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3) },
  pressed: { backgroundColor: colors.muted },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(2), marginTop: space(1.5) },
  metaPlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...type.caption, color: colors.textFaint },
});
