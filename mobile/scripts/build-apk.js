// Build the release APK locally: regenerate android/ from app.json, then
// `gradlew assembleRelease`. The APK lands in
// android/app/build/outputs/apk/release/app-release.apk; stage it with
// `npm run publish`.
//
//   npm run apk
//
// Gradle needs JDK 17 or newer. A JAVA_HOME pointing at an older JDK is the
// usual reason a build dies before it starts, so when it does, the JDK that
// ships with Android Studio is used instead.
//
// Every build is signed with the same key (android/app/debug.keystore from
// the template), so it installs as an update over the previous one.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const win = process.platform === 'win32';

function javaMajor(home) {
  try {
    const release = fs.readFileSync(path.join(home, 'release'), 'utf8');
    const v = /JAVA_VERSION="(\d+)(?:\.(\d+))?/.exec(release);
    return v ? (v[1] === '1' ? Number(v[2]) : Number(v[1])) : 0;
  } catch {
    return 0;
  }
}

function pickJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    win ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : null,
    process.platform === 'darwin' ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home' : null,
  ].filter(Boolean);
  return candidates.find((home) => javaMajor(home) >= 17);
}

const env = { ...process.env };
const javaHome = pickJavaHome();
if (!javaHome) {
  console.error('✗ Gradle needs JDK 17 or newer. Install Android Studio, or set JAVA_HOME to a JDK 17+.');
  process.exit(1);
}
env.JAVA_HOME = javaHome;
env.PATH = `${path.join(javaHome, 'bin')}${path.delimiter}${env.PATH}`;
if (!env.ANDROID_HOME && win && env.LOCALAPPDATA) env.ANDROID_HOME = path.join(env.LOCALAPPDATA, 'Android', 'Sdk');
console.log(`  JDK      ${javaHome} (${javaMajor(javaHome)})`);
console.log(`  SDK      ${env.ANDROID_HOME || '(from local.properties)'}\n`);

const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, env, stdio: 'inherit' });
run('npx expo prebuild --platform android --no-install');
// The full path: Windows may be set not to run programs from the current folder.
const androidDir = path.join(ROOT, 'android');
run(`"${path.join(androidDir, win ? 'gradlew.bat' : 'gradlew')}" assembleRelease`, androidDir);
console.log('\n✓ Built android/app/build/outputs/apk/release/app-release.apk\n  Next: npm run publish\n');
