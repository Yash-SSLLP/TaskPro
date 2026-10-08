/**
 * The entry point. A tiny root is registered SYNCHRONOUSLY (registering late
 * crashes with «"main" has not been registered»); it reads the saved
 * Light / Dark / System choice, applies it, and only THEN requires ./App, so
 * every screen's module-level StyleSheet.create is built with that palette.
 * The splash screen stays up meanwhile (AppRoot hides it once the session is
 * read), so there is no flash between the two.
 */
import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, initTheme, THEME_KEY } from './src/platform/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const [App, setApp] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let mode = 'system';
      try {
        mode = (await AsyncStorage.getItem(THEME_KEY)) || 'system';
      } catch {
        /* the phone's setting, then */
      }
      initTheme(mode);
      // The window behind every screen, seen while the keyboard or a sheet animates.
      SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
      const app = require('./App').default;
      if (alive) setApp(() => app);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return App ? <App /> : null;
}

registerRootComponent(Root);
