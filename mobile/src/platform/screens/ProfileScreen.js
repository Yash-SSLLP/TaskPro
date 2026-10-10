/**
 * My profile: my photo on a navy band (tap it to take one, choose one or
 * remove it), my name, job title and how long I have been here, my Task Pin,
 * then name, job title, email and mobile. Only what changed is sent.
 *
 * A new photo is cropped square in the phone's own editor, made a 512 px
 * JPEG here, and shown at once with a spinner while it uploads. When the
 * server has it, the signed-in user is replaced and every list that shows
 * people reads again. The camera is asked for only when "Take photo" is
 * tapped; the gallery needs no permission.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { fileUrl } from '../api';
import { PinCard } from '../components/PinCard';
import { authApi, photoApi, platformKeys } from '../endpoints';
import { formatDate } from '../format';
import { Camera, ImageIcon, Trash } from '../icons';
import { useSession } from '../session';
import { colors, font, radius, shadow, shadowRaised, space, type } from '../theme';
import { Avatar, BottomSheet, Button, confirm, Header, ListRow, Notice, Screen, Section, TextButton, TextField, toast } from '../ui';
import productConfig from '../../product/config';
import { tr } from '../../i18n';

const PHOTO_SIZE = 512;
const PHOTO_QUALITY = 0.85;
const AVATAR = 108;
const NAVY = '#032d60';
// Let the sheet finish closing before the camera, the gallery or a dialog opens over it.
const SHEET_CLOSE_MS = 320;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every list that shows people (their photo, their name) reads again. */
function refreshPeople(qc) {
  for (const queryKey of [platformKeys.contacts, platformKeys.teams, platformKeys.console, ['people'], ['taskMeta'], ['tasks'], ['calendar']]) {
    qc.invalidateQueries({ queryKey });
  }
}

/**
 * The picked photo as a 512 px square JPEG: the middle square, if the editor
 * left it oblong. Measured after decoding, so a rotated photo crops right.
 */
async function squarePhoto(uri) {
  const refs = [];
  const keep = (r) => {
    refs.push(r);
    return r;
  };
  try {
    const decoded = await keep(ImageManipulator.manipulate(uri)).renderAsync();
    keep(decoded);
    const { width: w, height: h } = decoded;
    const side = Math.min(w, h);
    const context = keep(ImageManipulator.manipulate(decoded));
    if (w !== h) context.crop({ originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side });
    context.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE });
    const image = keep(await context.renderAsync());
    return await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  } finally {
    refs.forEach((r) => r?.release?.());
  }
}

/** Take or choose one photo, cropped square in the phone's editor. Null when cancelled or not allowed. */
async function pickPhoto(source) {
  const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const message = tr('Allow camera access for {app} in your phone settings to take photos.', { app: productConfig.name });
      if (perm.canAskAgain) {
        toast.error(message);
      } else if (await confirm({ title: tr('Camera access is off'), message, confirmLabel: tr('Open settings') })) {
        Linking.openSettings().catch(() => {});
      }
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front });
    return res.canceled ? null : res.assets?.[0] || null;
  }
  const res = await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : res.assets?.[0] || null;
}

/** The band behind the photo: navy with a glow of the accent, in both themes. */
function Band() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="profileGlow" cx="100%" cy="0%" rx="85%" ry="160%" fx="100%" fy="0%">
          <Stop offset="0" stopColor={colors.primary} stopOpacity={0.55} />
          <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="profileSheen" cx="0%" cy="100%" rx="70%" ry="130%" fx="0%" fy="100%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={NAVY} />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#profileGlow)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#profileSheen)" />
    </Svg>
  );
}

export default function ProfileScreen({ navigation }) {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const tz = useSession((s) => s.settings?.timezone);
  const qc = useQueryClient();
  const titleRef = useRef(null);
  const initial = { name: user?.name || '', title: user?.title || '', email: user?.email || '', phone: user?.phoneDisplay || '' };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const changed = Object.keys(initial).filter((k) => form[k].trim() !== initial[k]);
  const hasPhoto = Boolean(user?.photoUrl);

  const save = async () => {
    const e = {};
    if (!form.name.trim()) e.name = tr('Enter your name');
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!changed.length) {
      navigation.goBack();
      return;
    }
    setError(null);
    try {
      const body = {};
      for (const k of changed) body[k] = form[k].trim();
      const res = await authApi.updateProfile(body);
      setUser(res.user);
      refreshPeople(qc);
      toast.success(tr('Profile saved'));
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    }
  };

  const choose = async (source) => {
    setSheet(false);
    await wait(SHEET_CLOSE_MS);
    let photo;
    try {
      const asset = await pickPhoto(source);
      if (!asset) return;
      photo = await squarePhoto(asset.uri);
    } catch (err) {
      toast.error(err?.message || tr('Could not open that'));
      return;
    }
    setPreview(photo.uri);
    setProgress(0);
    setBusy(true);
    try {
      const next = await photoApi.set({ uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' }, setProgress);
      // Fetch the server's copy first, so the photo doesn't blink back to initials.
      if (next?.photoUrl) await Promise.race([Image.prefetch(fileUrl(next.photoUrl)).catch(() => {}), wait(8000)]);
      setUser(next);
      refreshPeople(qc);
      toast.success(tr('Profile photo updated'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setPreview(null);
      setProgress(0);
    }
  };

  const removePhoto = async () => {
    setSheet(false);
    await wait(SHEET_CLOSE_MS);
    const ok = await confirm({
      title: tr('Remove your photo?'),
      message: tr('People will see your initials instead.'),
      confirmLabel: tr('Remove photo'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setUser(await photoApi.remove());
      refreshPeople(qc);
      toast.success(tr('Photo removed'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const percent = Math.round(progress * 100);

  return (
    <Screen
      header={<Header back title={tr('My profile')} />}
      scroll
      keyboard
      footer={<Button title={tr('Save')} size="lg" onPress={save} disabled={!changed.length} />}
    >
      <View style={styles.hero}>
        <View style={styles.band}>
          <Band />
        </View>
        <View style={styles.heroBody}>
          <Pressable
            onPress={() => setSheet(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? tr('Change photo') : tr('Add a photo')}
            accessibilityState={{ busy }}
            style={({ pressed }) => [styles.photoWrap, pressed && styles.pressed]}
          >
            <View style={styles.photoRing}>
              <Avatar person={user} uri={preview} size={AVATAR} />
              {busy ? (
                <View style={styles.photoBusy}>
                  <ActivityIndicator color={colors.white} />
                  {percent > 0 && percent < 100 ? <Text style={styles.photoPercent}>{`${percent}%`}</Text> : null}
                </View>
              ) : null}
            </View>
            <View style={styles.cameraBadge}>
              <Camera size={17} color={colors.onPrimary} strokeWidth={2.25} />
            </View>
          </Pressable>
          <Text style={styles.heroName} numberOfLines={2}>
            {user?.name}
          </Text>
          {user?.title ? (
            <Text style={styles.heroTitle} numberOfLines={1}>
              {user.title}
            </Text>
          ) : (
            <TextButton title={tr('Add your job title')} onPress={() => titleRef.current?.focus()} style={styles.addTitle} />
          )}
          {user?.createdAt ? <Text style={styles.since}>{tr('Member since {date}', { date: formatDate(user.createdAt, tz) })}</Text> : null}
        </View>
      </View>

      {user?.pin ? <PinCard user={user} compact style={styles.pin} /> : null}

      <Text style={styles.overline}>{tr('Details')}</Text>
      <TextField label={tr('Name')} value={form.name} onChangeText={set('name')} autoCapitalize="words" error={errors.name} />
      <TextField ref={titleRef} label={tr('Job title')} optional value={form.title} onChangeText={set('title')} autoCapitalize="words" />
      <TextField
        label={tr('Email')}
        optional
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextField label={tr('Mobile')} optional value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {user?.username ? <Text style={styles.username}>{tr('Username: {name}', { name: user.username })}</Text> : null}
      <Text style={styles.note}>{tr('You can sign in with your email, mobile number or username.')}</Text>
      <Notice tone="danger">{error}</Notice>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={tr('Profile photo')} subtitle={tr('People see it next to your name.')}>
        <Section style={styles.sheetList}>
          <ListRow icon={Camera} title={tr('Take photo')} onPress={() => choose('camera')} chevron={false} />
          <ListRow icon={ImageIcon} title={tr('Choose from gallery')} onPress={() => choose('library')} chevron={false} />
          {hasPhoto ? <ListRow icon={Trash} title={tr('Remove photo')} danger onPress={removePhoto} chevron={false} /> : null}
        </Section>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: space(5),
    ...shadow,
  },
  band: { height: 104, backgroundColor: NAVY },
  heroBody: { alignItems: 'center', paddingHorizontal: space(4), paddingBottom: space(5), marginTop: -(AVATAR / 2 + 4) },
  photoWrap: { borderRadius: AVATAR / 2 + 4 },
  pressed: { opacity: 0.85 },
  photoRing: { padding: 4, borderRadius: AVATAR / 2 + 4, backgroundColor: colors.card, ...shadowRaised },
  photoBusy: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: 'rgba(21, 19, 15, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoPercent: { color: colors.white, fontSize: 12, fontWeight: font.semibold },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 22, fontWeight: font.bold, color: colors.text, letterSpacing: -0.3, textAlign: 'center', marginTop: space(3) },
  heroTitle: { ...type.small, textAlign: 'center', marginTop: 2 },
  addTitle: { marginTop: space(1) },
  since: { ...type.caption, color: colors.textFaint, marginTop: space(2) },
  pin: { marginBottom: space(5) },
  overline: { ...type.overline, color: colors.primary, marginBottom: space(3), marginLeft: space(1) },
  username: { ...type.small, marginBottom: space(2) },
  note: { ...type.caption, marginBottom: space(4) },
  sheetList: { marginBottom: space(2) },
});
