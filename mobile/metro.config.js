/**
 * Expo's default Metro config, plus the iPhone web build.
 *
 * The same app is exported for the web (react-native-web) and installed on
 * iPhones from Safari with Share › Add to Home Screen (src/platform/web/,
 * scripts/build-iphone.js). A few native-only modules have no web version,
 * so on the WEB platform ONLY they are swapped for the browser stand-ins in
 * src/platform/web/shims/. Android resolves exactly as before: every branch
 * below is gated on `platform === 'web'`.
 */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const SHIM_DIR = path.join(__dirname, 'src', 'platform', 'web', 'shims');
// On web, babel-preset-expo rewrites `import { Alert } from 'react-native'` to
// `react-native-web/dist/exports/Alert` before anything is resolved, so those
// are the names replaced here.
const RNW = (name) => [`react-native-web/dist/exports/${name}`, `react-native-web/dist/cjs/exports/${name}`];
const WEB_SHIMS = {
  // RNW's Alert.alert does nothing; RNW's Image drops source.headers (every
  // protected photo); Linking.openSettings cannot exist in a page.
  ...Object.fromEntries(RNW('Alert').map((m) => [m, 'rnwAlert.js'])),
  ...Object.fromEntries(RNW('Image').map((m) => [m, 'rnwImage.js'])),
  ...Object.fromEntries(RNW('Linking').map((m) => [m, 'rnwLinking.js'])),
  'expo-file-system/legacy': 'fileSystem.js',
  'expo-sharing': 'sharing.js',
  'expo-secure-store': 'secureStore.js',
  'expo-intent-launcher': 'intentLauncher.js',
  'react-native-restart': 'restart.js',
  '@react-native-community/datetimepicker': 'DateTimePicker.js',
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    // A shim importing the module it replaces must reach the real one
    // (rnwImage.js wraps react-native-web's own Image, never itself).
    const fromShim = path.dirname(context.originModulePath) === SHIM_DIR;
    if (!fromShim) {
      return { type: 'sourceFile', filePath: path.join(SHIM_DIR, WEB_SHIMS[moduleName]) };
    }
  }
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
