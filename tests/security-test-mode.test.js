const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidRoot = path.join(root, 'android');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const readAndroid = (...parts) => fs.readFileSync(path.join(androidRoot, ...parts), 'utf8');

// 1. The web UI exposes the menu entry point and its debug messaging.
const indexHtml = read('index.html');
for (const id of ['menuWrap', 'menuButton', 'appMenu', 'securityTestMenuItem', 'securityTestMenuSub']) {
  assert.ok(indexHtml.includes(`id="${id}"`), `index.html must expose #${id}`);
}
assert.ok(indexHtml.includes('Android debug builds only'), 'menu states that the tools are debug-build only');

// 2. The web app only activates the menu when the native debug bridge exists.
const calculatorJs = read('calculator.js');
assert.ok(calculatorJs.includes('hasSecurityTestBridge()'), 'calculator.js must detect the security test bridge');
assert.ok(calculatorJs.includes('setupAppMenu()'), 'calculator.js must wire the app menu');
assert.ok(calculatorJs.includes('window.AndroidSecurityTest.open()'), 'menu item must launch the native test screen');
assert.equal(
  calculatorJs.match(/hasNativeVoiceBridge\(\) \{/g).length,
  1,
  'voice bridge detection must be defined exactly once'
);

// 3. Styles and offline cache stay current.
assert.ok(read('styles.css').includes('.app-menu'), 'styles.css must style the app menu');
assert.ok(read('service-worker.js').includes('calc-static-v3'), 'service worker cache name must be bumped for changed assets');

// 4. Debug builds: consent gates are mandatory in the native test screen.
const debugManifest = readAndroid('app', 'src', 'debug', 'AndroidManifest.xml');
assert.ok(debugManifest.includes('.security.SecurityTestActivity'), 'debug manifest must register the test activity');
assert.ok(debugManifest.includes('android:exported="false"'), 'test activity must not be exported');
assert.ok(debugManifest.includes('android.permission.CAMERA'), 'camera permission is declared for runtime request');

const activity = readAndroid('app', 'src', 'debug', 'java', 'com', 'pummyrajput', 'calc', 'security', 'SecurityTestActivity.kt');
for (const gate of [
  'I understand',          // first-run consent acknowledgement
  'Capture test photo',    // manual capture only
  'Send this test photo?', // confirmation dialog before every upload
  'Request camera permission',
  'Clear test data'
]) {
  assert.ok(activity.includes(gate), `SecurityTestActivity must include consent gate "${gate}"`);
}
// No silent/background capabilities anywhere in the test module.
for (const forbidden of ['WorkManager', 'AlarmManager', 'JobIntentService', 'BOOT_COMPLETED', 'startForegroundService']) {
  assert.ok(!activity.includes(forbidden), `SecurityTestActivity must not use ${forbidden} (nothing runs silently)`);
}
assert.ok(activity.includes('checkSelfPermission(Manifest.permission.CAMERA)'), 'camera use must be gated by runtime permission');

// 5. The sale-unit bridge only exists in debug builds; release is a no-op.
const debugHooks = readAndroid('app', 'src', 'debug', 'java', 'com', 'pummyrajput', 'calc', 'SecurityTestHooks.kt');
assert.ok(debugHooks.includes('"AndroidSecurityTest"'), 'debug build must expose the AndroidSecurityTest bridge');
const releaseHooks = readAndroid('app', 'src', 'release', 'java', 'com', 'pummyrajput', 'calc', 'SecurityTestHooks.kt');
assert.ok(releaseHooks.includes('= Unit'), 'release build must ship a no-op (no security test code)');
assert.ok(!releaseHooks.includes('AndroidSecurityTest'), 'release bridge must not expose AndroidSecurityTest');

// 6. Gradle: test tooling and secrets are debug-only.
const gradle = readAndroid('app', 'build.gradle.kts');
assert.ok(gradle.includes('debugImplementation('), 'camera/network libraries must be debugImplementation');
const releaseBlocks = gradle.split('release {').slice(1).join('release {');
assert.ok(releaseBlocks.includes('buildConfigField("String", "SECURITY_TEST_BOT_TOKEN", "\\"\\"")'), 'release builds must embed empty tester tokens');
assert.ok(gradle.includes('isMinifyEnabled = true'), 'release builds must be minified');

// 7. The production UI shell never touches the camera.
const mainActivity = readAndroid('app', 'src', 'main', 'java', 'com', 'pummyrajput', 'calc', 'MainActivity.kt');
assert.ok(!mainActivity.includes('Manifest.permission.CAMERA'), 'MainActivity (shared code) must not use the camera');
assert.ok(mainActivity.includes('SecurityTestHooks.attach'), 'MainActivity must route the security test hooks');

// 8. Tester configuration is stored only on-device; tokens are never written to logs.
const config = readAndroid('app', 'src', 'debug', 'java', 'com', 'pummyrajput', 'calc', 'security', 'SecurityTestConfig.kt');
assert.ok(config.includes('MODE_PRIVATE'), 'tester config must use app-private storage');
const audit = readAndroid('app', 'src', 'debug', 'java', 'com', 'pummyrajput', 'calc', 'security', 'SecurityAuditLog.kt');
assert.ok(audit.includes('clearAllTestData'), 'audit log must support clearing test data');
const uploader = readAndroid('app', 'src', 'debug', 'java', 'com', 'pummyrajput', 'calc', 'security', 'TestUploader.kt');
assert.ok(!uploader.includes('https://') || uploader.includes('api.telegram.org'), 'uploads only go to tester-configured Telegram/webhook targets');

console.log('✓ Security Test Mode: consent gates, debug-only wiring, and audit controls verified');
