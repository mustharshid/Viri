# Viri Browser Extension Bridge

This is a Manifest V3 Chrome extension that acts as a privileged background bridge for the Viri PWA. 

## Capabilities
- Operates using the terminal's local IP address to avoid centralized server blocks.
- Modifies CORS/CSP headers securely using `declarativeNetRequest`.
- Executes bank API polling in the background without UI interruption.
- Uses `crypto.subtle` to decrypt local hardware-bound TOTP seeds and generate 2FA codes on the fly.

## Side-loading Instructions
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top right.
3. Click **Load unpacked**.
4. Select this `extension` directory.

The PWA (running on localhost or production domain) will automatically detect and message this extension via `chrome.runtime.sendMessage`.
