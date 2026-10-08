/**
 * The root of the app: providers (safe areas, React Query, navigation), the
 * global toast and dialog hosts, and the launch sequence (keep the splash
 * screen up until the language and the saved session have been read).
 *
 * A language switch re-mounts the navigator with its current state, so every
 * screen redraws in the new language and stays where it was.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLang } from '../i18n';
import AppEvents from './AppEvents';
import { navigationRef } from './navigation/links';
import RootNavigator from './navigation/RootNavigator';
import { setupNotifications } from './push';
import { queryClient } from './queryClient';
import { useSession } from './session';
import { navigationColors, theme } from './theme';
import { DialogHost, ToastHost } from './ui';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });
setupNotifications();

const baseTheme = theme.dark ? DarkTheme : DefaultTheme;
const navigationTheme = { ...baseTheme, colors: { ...baseTheme.colors, ...navigationColors } };

export default function AppRoot() {
  const status = useSession((s) => s.status);
  const lang = useLang();
  const [navReady, setNavReady] = useState(false);
  // Where the person is, so a language switch can rebuild the screens in place.
  const navState = useRef(undefined);

  useEffect(() => {
    useSession.getState().boot();
  }, []);

  useEffect(() => {
    if (status !== 'booting') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer
          key={lang}
          ref={navigationRef}
          theme={navigationTheme}
          initialState={navState.current}
          onStateChange={(state) => {
            navState.current = state;
          }}
          onReady={() => setNavReady(true)}
        >
          <RootNavigator />
        </NavigationContainer>
        {/* Outside the navigator, so a language switch does not replay launch links. */}
        <AppEvents navReady={navReady} />
        <ToastHost />
        <DialogHost />
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
