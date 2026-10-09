/**
 * The app's navigation: which world you are in (offline, signed out,
 * choosing a new password, the new account's Task Pin, or the app) and,
 * inside the app, the bottom tabs (by role) plus every stack screen.
 *
 * The tabs and product screens come from src/product/navigation.js; the
 * shared screens (contacts, teams, profile, password, the console's person
 * page) are added here. The tabs are drawn by CurvedTabBar: the selected
 * tab's icon rides in a raised bubble that slides to whichever tab is chosen.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { productScreens, tabsFor } from '../../product/navigation';
import { tr } from '../../i18n';
import { useContacts, useTeams, useUnreadCount } from '../hooks';
import AdminPersonScreen from '../screens/AdminPersonScreen';
import ActivityScreen from '../screens/admin/ActivityScreen';
import AddPersonScreen from '../screens/admin/AddPersonScreen';
import AppVersionsScreen from '../screens/admin/AppVersionsScreen';
import OnlineScreen from '../screens/admin/OnlineScreen';
import AppUpdateScreen from '../screens/AppUpdateScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ContactsScreen from '../screens/ContactsScreen';
import JoinScreen from '../screens/JoinScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import ForcePasswordScreen from '../screens/ForcePasswordScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import OfflineScreen from '../screens/OfflineScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import ServerSettingsScreen from '../screens/ServerSettingsScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import TeamsScreen from '../screens/TeamsScreen';
import WelcomePinScreen from '../screens/WelcomePinScreen';
import { useSession } from '../session';
import { colors } from '../theme';
import { useUpdate } from '../updates';
import CurvedTabBar from './CurvedTabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const user = useSession((s) => s.user);
  const unread = useUnreadCount().data || 0;
  // Requests and invitations waiting on me, and a newer app build, show on More.
  const update = useUpdate((s) => s.available);
  const waiting = (useContacts().data?.incoming?.length || 0) + (useTeams().data?.invites?.length || 0) + (update ? 1 : 0);
  const tabs = tabsFor(user);
  return (
    <Tab.Navigator
      // The curved bar draws each tab's icon, label and badge from the options
      // below, in its own colours; it hides itself while the keyboard is up.
      tabBar={(props) => <CurvedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
              tabBarIcon: ({ color, size }) => <t.icon color={color} size={size} strokeWidth={2} />,
              tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
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
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="AppUpdate" component={AppUpdateScreen} />
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
        <Stack.Screen name="Join" component={JoinScreen} />
        <Stack.Screen name="Teams" component={TeamsScreen} />
        <Stack.Screen name="TeamDetail" component={TeamDetailScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
        <Stack.Screen name="AdminPerson" component={AdminPersonScreen} />
        <Stack.Screen name="AdminOnline" component={OnlineScreen} />
        <Stack.Screen name="AdminAppVersions" component={AppVersionsScreen} />
        <Stack.Screen name="AdminActivity" component={ActivityScreen} />
        <Stack.Screen name="AdminAddPerson" component={AddPersonScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        <Stack.Screen name="AppUpdate" component={AppUpdateScreen} />
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
