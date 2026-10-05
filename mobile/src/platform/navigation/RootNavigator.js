/**
 * The app's navigation: which world you are in (offline, signed out,
 * choosing a new password, the new account's Task Pin, or the app) and,
 * inside the app, the bottom tabs (by role) plus every stack screen.
 *
 * The tabs and product screens come from src/product/navigation.js; the
 * shared screens (contacts, teams, profile, password, the console's person
 * page) are added here.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { productScreens, tabsFor } from '../../product/navigation';
import { tr } from '../../i18n';
import { useContacts, useTeams, useUnreadCount } from '../hooks';
import AdminPersonScreen from '../screens/AdminPersonScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ForcePasswordScreen from '../screens/ForcePasswordScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import OfflineScreen from '../screens/OfflineScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import ServerSettingsScreen from '../screens/ServerSettingsScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import TeamsScreen from '../screens/TeamsScreen';
import WelcomePinScreen from '../screens/WelcomePinScreen';
import { useSession } from '../session';
import { colors, font } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const user = useSession((s) => s.user);
  const unread = useUnreadCount().data || 0;
  // Requests and invitations waiting on me show on More.
  const waiting = (useContacts().data?.incoming?.length || 0) + (useTeams().data?.invites?.length || 0);
  const tabs = tabsFor(user);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: font.semibold },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {tabs.map((t) => {
        const count = t.badge === 'unread' ? unread : t.name === 'More' ? waiting : 0;
        const label = tr(t.label);
        return (
          <Tab.Screen
            key={t.name}
            name={t.name}
            component={t.component}
            initialParams={t.initialParams}
            options={{
              tabBarLabel: label,
              tabBarAccessibilityLabel: count > 0 ? tr('{label}, {n} new', { label, n: count }) : label,
              tabBarIcon: ({ color }) => <t.icon color={color} size={22} strokeWidth={2} />,
              tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
              tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.white, fontSize: 11 },
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const status = useSession((s) => s.status);
  const mustChangePassword = useSession((s) => !!s.user?.mustChangePassword);
  const justSignedUp = useSession((s) => s.justSignedUp);

  if (status === 'booting') return null;

  let screens;
  if (status === 'offline') {
    screens = (
      <>
        <Stack.Screen name="Offline" component={OfflineScreen} />
        <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
      </>
    );
  } else if (status !== 'signedIn') {
    screens = (
      <>
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ animationTypeForReplace: 'pop' }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} />
      </>
    );
  } else if (mustChangePassword) {
    screens = <Stack.Screen name="ForcePassword" component={ForcePasswordScreen} />;
  } else if (justSignedUp) {
    screens = <Stack.Screen name="WelcomePin" component={WelcomePinScreen} />;
  } else {
    screens = (
      <>
        <Stack.Screen name="Main" component={MainTabs} />
        {productScreens.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} options={s.options} />
        ))}
        <Stack.Screen name="Contacts" component={ContactsScreen} />
        <Stack.Screen name="Teams" component={TeamsScreen} />
        <Stack.Screen name="TeamDetail" component={TeamDetailScreen} />
        <Stack.Screen name="AdminPerson" component={AdminPersonScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      </>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {screens}
    </Stack.Navigator>
  );
}
