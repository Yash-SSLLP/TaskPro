// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*"],
  },
  {
    // Build and release scripts run in Node, not in the app.
    files: ["scripts/**/*.js", "plugins/**/*.js"],
    languageOptions: { globals: globals.node },
  }
]);
