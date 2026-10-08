// Expo config plugin: patch android/gradle.properties at prebuild time.
//
// `android/` is generated and gitignored, so hand-editing gradle.properties
// only lasts until the next `expo prebuild`. This plugin makes the settings
// durable — they are reapplied every time the native project is regenerated.
//
// Two things are set:
//
// 1. Gradle JVM memory. The Expo template ships
//    `-Xmx2048m -XX:MaxMetaspaceSize=512m`, and dexing this app's dependency
//    graph exhausts that metaspace — the build dies with
//    `D8: java.lang.OutOfMemoryError: Metaspace` well into the run.
//
// 2. Target ABIs. The template builds all four (armeabi-v7a, arm64-v8a, x86,
//    x86_64), which roughly quadruples native compile time. Every Android
//    phone shipped in years is arm64-v8a; armeabi-v7a covers older handsets.
//    The x86 pair only matters for emulators — add them back (or override with
//    `-PreactNativeArchitectures=...` on the command line) when you need one.
const { withGradleProperties } = require('expo/config-plugins');

const DEFAULTS = {
  jvmArgs: '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  architectures: 'armeabi-v7a,arm64-v8a',
};

module.exports = function withBuildTuning(config, props = {}) {
  const { jvmArgs, architectures } = { ...DEFAULTS, ...props };

  return withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      const existing = cfg.modResults.find((i) => i.type === 'property' && i.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };
    set('org.gradle.jvmargs', jvmArgs);
    set('reactNativeArchitectures', architectures);
    return cfg;
  });
};
