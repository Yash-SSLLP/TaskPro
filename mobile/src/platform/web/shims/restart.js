// Web only (metro.config.js) — `react-native-restart`: reloading the page
// re-runs index.js, which is all a restart does (re-theme, new language).
const RNRestart = {
  Restart: () => window.location.reload(),
  restart: () => window.location.reload(),
};

export default RNRestart;
