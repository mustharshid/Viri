#!/bin/bash

# Configuration
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$EXTENSION_DIR")"
PEM_FILE="$PARENT_DIR/viri-bridge.pem"
CRX_FILE="$PARENT_DIR/extension.crx"
DEST_DIR="$PARENT_DIR/public/viri"
DEST_CRX="$DEST_DIR/viri-bridge.crx"

echo "Building Viri Bridge .crx package..."

# Check if Chrome is installed
if [ ! -f "$CHROME_PATH" ]; then
    echo "Error: Google Chrome not found at $CHROME_PATH"
    exit 1
fi

# Pack the extension
if [ -f "$PEM_FILE" ]; then
    echo "Found existing private key: $PEM_FILE"
    "$CHROME_PATH" --pack-extension="$EXTENSION_DIR" --pack-extension-key="$PEM_FILE"
else
    echo "No private key found. Chrome will generate a new one (extension.pem)."
    "$CHROME_PATH" --pack-extension="$EXTENSION_DIR"
    
    # Rename the generated pem file for future use
    if [ -f "$PARENT_DIR/extension.pem" ]; then
        mv "$PARENT_DIR/extension.pem" "$PEM_FILE"
        echo "Generated and saved private key to: $PEM_FILE"
        echo "CRITICAL: Backup this .pem file! If you lose it, you can't update the extension!"
    fi
fi

# Move the built .crx to the public directory
if [ -f "$CRX_FILE" ]; then
    mkdir -p "$DEST_DIR"
    mv "$CRX_FILE" "$DEST_CRX"
    echo "Success! .crx file created and moved to: $DEST_CRX"
else
    echo "Error: Failed to create .crx file. Check if Chrome is already running. You might need to close Chrome completely to run this command."
    exit 1
fi
