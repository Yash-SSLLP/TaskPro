/**
 * Right after sign-up: "Your Task Pin". The pin in big letters with Copy,
 * Share and WhatsApp, what it is for, and Continue into the app.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tr } from '../../i18n';
import { PinCard } from '../components/PinCard';
import { CircleCheck } from '../icons';
import { useSession } from '../session';
import { colors, font, space, type } from '../theme';
import { Button, Screen } from '../ui';

function Step({ n, text }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

export default function WelcomePinScreen() {
  const user = useSession((s) => s.user);
  const finishWelcome = useSession((s) => s.finishWelcome);
  const first = String(user?.name || '').split(' ')[0];
  return (
    <Screen scroll contentStyle={styles.content} footer={<Button title={tr('Continue')} size="lg" onPress={finishWelcome} />}>
      <View style={styles.icon}>
        <CircleCheck size={30} color={colors.success} />
      </View>
      <Text style={styles.title}>{first ? tr('Welcome, {name}!', { name: first }) : tr('Welcome!')}</Text>
      <Text style={styles.intro}>{tr('Your account is ready. This is your Task Pin — it never changes.')}</Text>
      <PinCard user={user} />
      <Text style={styles.howTitle}>{tr('How it works')}</Text>
      <Step n="1" text={tr('Share your pin with the people you work with.')} />
      <Step n="2" text={tr('They add you by your pin, and you accept.')} />
      <Step n="3" text={tr('Now you can give each other tasks, or work together in a team.')} />
      <Text style={styles.later}>{tr('You can find your pin any time under More.')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space(8) },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: space(4),
  },
  title: { fontSize: 24, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
  intro: { ...type.small, fontSize: 15, textAlign: 'center', marginTop: space(2), marginBottom: space(6), lineHeight: 21 },
  howTitle: { ...type.overline, marginTop: space(6), marginBottom: space(3) },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3), marginBottom: space(3) },
  stepNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: colors.primary, fontWeight: font.bold, fontSize: 13 },
  stepText: { flex: 1, ...type.body, lineHeight: 22 },
  later: { ...type.caption, textAlign: 'center', marginTop: space(3) },
});
