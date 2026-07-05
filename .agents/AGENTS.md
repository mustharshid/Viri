# Custom Rules for Viri Workspace

## Extension Versioning Guideline
* **Increment Version on Modification**: Whenever any code in the Chrome extension (`extension/` directory) is modified, you must increment the extension version number inside [manifest.json](file:///Users/Mustho/Documents/Viri/extension/manifest.json).
* **Sync Version check in PWA**: Whenever the extension version number is incremented, you must update `LATEST_EXTENSION_VERSION` constant in the Terminal PWA code [CashierApp.tsx](file:///Users/Mustho/Documents/Viri/pwa/src/pages/Cashier/CashierApp.tsx) to match, ensuring the System Health panel reflects the correct version compatibility.
* **Package and Distribute Extension**: Whenever the extension version number is incremented, you must package/zip the `extension` directory and copy it to `public/viri/viri-bridge.zip` (and all other download link destinations) so cashiers can download the latest version directly from the PWA dashboard interface.
