#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$PROJECT_DIR/public/downloads"
mkdir -p "$PROJECT_DIR/pwa/public/downloads"
mkdir -p "$PROJECT_DIR/public/viri/downloads"

# Package desktop runner bundle
TEMP_DESKTOP="$PROJECT_DIR/viri-desktop-temp.zip"
rm -f "$TEMP_DESKTOP"

(
  cd "$PROJECT_DIR/desktop"
  zip -r "$TEMP_DESKTOP" main.js preload.js package.json
)

# If compiled electron-builder dmg exists, copy real binary
if [ -f "$PROJECT_DIR/desktop/dist-electron/Viri Cashier-1.4.0-arm64.dmg" ]; then
  for target_dir in "$PROJECT_DIR/public/downloads" "$PROJECT_DIR/pwa/public/downloads" "$PROJECT_DIR/public/viri/downloads"; do
    cp "$PROJECT_DIR/desktop/dist-electron/Viri Cashier-1.4.0-arm64.dmg" "$target_dir/viri-cashier.dmg"
    cp "$PROJECT_DIR/public/viri/viri-bridge.zip" "$target_dir/viri-bridge.zip"
  done
fi

rm -f "$TEMP_DESKTOP"
echo "Standalone app download packages generated successfully."
