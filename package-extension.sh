#!/bin/bash

# Exit on error
set -e

# Path setup
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_DIR="$PROJECT_DIR/extension"
MANIFEST_FILE="$EXTENSION_DIR/manifest.json"

# Read extension version from manifest.json
VERSION=$(node -e "console.log(require('$MANIFEST_FILE').version)")

if [ -z "$VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

echo "Packaging extension version: $VERSION"

# Zip destinations
ZIPS=(
  "$PROJECT_DIR/public/viri/viri-bridge-$VERSION.zip"
  "$PROJECT_DIR/public/viri/viri-bridge.zip"
  "$PROJECT_DIR/public/viri/viri/viri-bridge-$VERSION.zip"
  "$PROJECT_DIR/public/viri/viri/viri-bridge.zip"
  "$PROJECT_DIR/pwa/public/viri/viri-bridge-$VERSION.zip"
  "$PROJECT_DIR/pwa/public/viri/viri-bridge.zip"
  "$PROJECT_DIR/ViRi extension.zip"
)

# Clean up all existing target zip files first to prevent file accumulation or structure mixing
echo "Cleaning up old zip files..."
for zip_path in "${ZIPS[@]}"; do
    rm -f "$zip_path"
done

# Create directories if they don't exist
mkdir -p "$PROJECT_DIR/public/viri/viri"
mkdir -p "$PROJECT_DIR/pwa/public/viri"

# Package extension:
# We run from within the extension directory so that files are zipped at the root level of the archive.
# We exclude development, test, and system files:
# - tests/ (exclude tests folder entirely)
# - _metadata/ (exclude chrome auto-generated metadata folders entirely)
# - build-crx.sh (build script)
# - test.js, test-clear.js (test scripts)
# - README.md (documentation file)
# - .DS_Store (OS-specific files)
echo "Creating the new zip file..."
TEMP_ZIP="$PROJECT_DIR/viri-bridge-temp.zip"
rm -f "$TEMP_ZIP"

(
  cd "$EXTENSION_DIR"
  zip -r "$TEMP_ZIP" . -x \
    "tests/*" \
    "tests" \
    "_metadata/*" \
    "_metadata" \
    "build-crx.sh" \
    "test.js" \
    "test-clear.js" \
    "README.md" \
    ".DS_Store" \
    "*/.DS_Store"
)

# Distribute the temp zip to all target destinations
echo "Distributing packaged zip to destinations..."
for zip_path in "${ZIPS[@]}"; do
    cp "$TEMP_ZIP" "$zip_path"
    echo "  -> Created: $zip_path"
done

# Clean up temp zip
rm -f "$TEMP_ZIP"

echo "Success! Extension packaged and distributed cleanly."
