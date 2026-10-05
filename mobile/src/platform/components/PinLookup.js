/**
 * Find someone by their Task Pin: type it (case, spaces and dashes don't
 * matter), see who it is, then act on it: send a contact request, invite
 * them to a team… The caller decides the button through `actionFor`.
 *
 * Errors show inline, because this sits inside sheets where a toast would be
 * hidden.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { peopleApi } from '../endpoints';
import { Hash, Search } from '../icons';
import { normalizePin, pinInput, pinOf, pinProblem } from '../pin';
import { colors, font, radius, space, type } from '../theme';
import { Avatar, Badge, Button, Notice, TextField } from '../ui';

export const relationLabel = (relation) =>
  ({
    self: tr('This is you'),
    contact: tr('Already in your contacts'),
    incoming: tr('Has asked to add you'),
    outgoing: tr('Request already sent'),
    none: tr('Not in your contacts yet'),
  })[relation] || '';

const relationTone = (relation) => (relation === 'contact' ? 'success' : relation === 'none' ? 'neutral' : 'info');

/** A person, as a small card: avatar, name, title and pin. */
export function PersonCard({ person, badge, style }) {
  return (
    <View style={[styles.person, style]}>
      <Avatar name={person?.name} size={44} />
      <View style={styles.personText}>
        <Text style={styles.name} numberOfLines={1}>
          {person?.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[person?.title, pinOf(person)].filter(Boolean).join(' · ')}
        </Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} style={styles.badge} /> : null}
      </View>
    </View>
  );
}

/**
 * @param {{
 *   actionFor: (found: { person, relation }) => ({ label: string, onPress?: () => Promise<string|void>, variant?: string, icon?: any } | null),
 *   label?: string, autoFocus?: boolean, onDone?: () => void, style?: any
 * }} props  onPress may resolve to a success message, shown under the card
 */
export function PinLookup({ actionFor, label, autoFocus = false, style }) {
  const [pin, setPin] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [looking, setLooking] = useState(false);
  const seq = useRef(0);

  const lookup = async () => {
    const problem = pinProblem(pin);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setDone(null);
    setLooking(true);
    const mine = ++seq.current;
    try {
      const res = await peopleApi.lookup(normalizePin(pin));
      if (mine === seq.current) setFound(res);
    } catch (e) {
      if (mine === seq.current) {
        setFound(null);
        setError(e.status === 404 ? tr('No one has that Task Pin. Check it and try again.') : e.message);
      }
    } finally {
      if (mine === seq.current) setLooking(false);
    }
  };

  const action = found ? actionFor(found) : null;
  const run = async () => {
    if (!action?.onPress) return;
    setError(null);
    try {
      const message = await action.onPress();
      setDone(message || null);
      setFound(null);
      setPin('');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <View style={style}>
      <View style={styles.row}>
        <TextField
          label={label}
          value={pin}
          onChangeText={(t) => {
            setPin(pinInput(t));
            setFound(null);
            setDone(null);
            if (error) setError(null);
          }}
          placeholder="7KQ4-M9XA"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={autoFocus}
          maxLength={9}
          returnKeyType="search"
          onSubmitEditing={lookup}
          left={<Hash size={18} color={colors.textSecondary} style={styles.hash} />}
          inputStyle={styles.pinInput}
          style={styles.field}
        />
        <Button
          title={tr('Find')}
          icon={Search}
          full={false}
          onPress={lookup}
          loading={looking}
          style={[styles.find, label ? styles.findLabelled : null]}
        />
      </View>
      <Notice tone="danger">{error}</Notice>
      <Notice tone="success">{done}</Notice>
      {found ? (
        <View style={styles.result}>
          <PersonCard person={found.person} badge={{ label: relationLabel(found.relation), tone: relationTone(found.relation) }} />
          {action ? (
            <Button
              title={action.label}
              icon={action.icon}
              variant={action.variant || 'primary'}
              disabled={!action.onPress}
              onPress={run}
              style={styles.action}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  field: { flex: 1, marginBottom: space(3) },
  hash: { marginRight: space(2) },
  pinInput: { fontSize: 18, fontWeight: font.semibold, letterSpacing: 1.5 },
  find: { height: 50 },
  findLabelled: { marginTop: 14 + space(1.5) + 6 },
  result: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space(4),
    backgroundColor: colors.card,
    marginBottom: space(4),
  },
  person: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  personText: { flex: 1 },
  name: { fontSize: 17, fontWeight: font.semibold, color: colors.text },
  sub: { ...type.small, marginTop: 1 },
  badge: { marginTop: space(1.5) },
  action: { marginTop: space(4) },
});
