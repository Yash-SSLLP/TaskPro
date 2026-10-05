/**
 * The privacy policy, in the app (the same words as the website's /privacy
 * page; both read ../privacy.js). Open from Sign up and from More, signed in
 * or not. It stays in English: it is the legal text.
 */
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { PRIVACY } from '../privacy';
import { colors, font, space, type } from '../theme';
import { Header, Screen, TextButton } from '../ui';

function Block({ item }) {
  if (typeof item === 'string') return <Text style={styles.p}>{item}</Text>;
  return (
    <View style={styles.list}>
      {item.list.map((li) => (
        <View key={li} style={styles.li}>
          <Text style={styles.bullet}>{'\u2022'}</Text>
          <Text style={[styles.p, styles.liText]}>{li}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <Screen header={<Header back title={tr('Privacy policy')} />} scroll>
      <Text style={styles.updated}>{`Last updated ${PRIVACY.updated}`}</Text>
      {PRIVACY.intro.map((p) => (
        <Text key={p} style={styles.p}>
          {p}
        </Text>
      ))}
      {PRIVACY.sections.map((s, i) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.h2}>{`${i + 1}. ${s.title}`}</Text>
          {s.body.map((item, j) => (
            <Block key={j} item={item} />
          ))}
        </View>
      ))}
      <TextButton title={PRIVACY.email} onPress={() => Linking.openURL(`mailto:${PRIVACY.email}`)} style={styles.mail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  updated: { ...type.caption, marginBottom: space(4) },
  section: { marginTop: space(5) },
  h2: { ...type.heading, fontSize: 17, marginBottom: space(2) },
  p: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: space(2) },
  list: { marginBottom: space(2) },
  li: { flexDirection: 'row', gap: space(2) },
  bullet: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, fontWeight: font.bold },
  liText: { flex: 1 },
  mail: { marginTop: space(4), marginBottom: space(6) },
});
