const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const androidAssets = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');
const bundledFiles = ['index.html', 'styles.css', 'calculator.js', 'manifest.webmanifest', 'service-worker.js'];

for (const file of bundledFiles) {
  const source = fs.readFileSync(path.join(root, file));
  const bundled = fs.readFileSync(path.join(androidAssets, file));
  assert.deepEqual(bundled, source, `${file} must be synced into the Android asset bundle`);
}

console.log(`✓ ${bundledFiles.length} Android assets are in sync`);
