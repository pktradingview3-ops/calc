#!/usr/bin/env bash
# Copies the dependency-free web calculator into Android's packaged asset folder.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSET_DIR="$ROOT_DIR/android/app/src/main/assets/www"
mkdir -p "$ASSET_DIR"

for file in index.html styles.css calculator.js manifest.webmanifest service-worker.js; do
  cp "$ROOT_DIR/$file" "$ASSET_DIR/$file"
done

echo "Synced calculator web assets to android/app/src/main/assets/www"
