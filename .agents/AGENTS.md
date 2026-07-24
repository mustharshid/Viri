# Custom Rules for Viri Workspace

## Extension Versioning Guideline
* **Increment Version on Modification**: Whenever any code in the Chrome extension (`extension/` directory) is modified, you must increment the extension version number inside [manifest.json](file:///Users/Mustho/Documents/Viri/extension/manifest.json).
* **Sync Version check in PWA**: Whenever the extension version number is incremented, you must update `LATEST_EXTENSION_VERSION` constant in the Terminal PWA code [CashierApp.tsx](file:///Users/Mustho/Documents/Viri/pwa/src/pages/Cashier/CashierApp.tsx) to match, ensuring the System Health panel reflects the correct version compatibility.
* **Package and Distribute Extension**: Whenever the extension version number is incremented, you must package/zip the `extension` directory and copy it to `public/viri/viri-bridge.zip` (and all other download link destinations) so cashiers can download the latest version directly from the PWA dashboard interface.

## 3-Tier Feature Governance Rule
* **3-Tier Cascade Governance**: Every feature/permission option (such as `verification_enabled`, `ledger_enabled`, `ledger_show_balance`, `ledger_show_debit`, `reports_enabled`, `statement_enabled`, etc.) MUST follow the 3-tier governance model:
  1. **Superadmin Portal**: Managed via `tenants.features` per company/plan.
  2. **Company Dashboard**: If disabled by Superadmin, the option MUST be disabled and grayed-out in the Company Dashboard (with `DISABLED BY PLAN` badge) and cannot be enabled by Company Admins. Backend API controllers MUST reject any attempt to override disabled plan features.
  3. **Cashier PWA**: Effective permission = `(Superadmin Feature Enabled) && (Terminal Counter Permission Enabled)`. Disabled features MUST be hidden from Cashier PWA UI/navigation and restricted on API routes.


