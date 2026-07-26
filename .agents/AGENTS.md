# Custom Rules for Viri Workspace

## Extension Versioning Guideline
Whenever any code in the Chrome extension (`extension/` directory) is modified or when asked to bump the extension version, you MUST perform ALL of the following steps:
1. **Manifest Version**: Increment `version` string in `extension/manifest.json`.
2. **PWA Cashier App**: Update `LATEST_EXTENSION_VERSION` constant in `pwa/src/pages/Cashier/CashierApp.tsx` to match the new version.
3. **PWA Company Dashboard**: Update `LATEST_EXTENSION_VERSION` constant in `pwa/src/pages/Dashboard/CompanyDashboard.tsx` to match the new version.
4. **Package Extension**: Run `./package-extension.sh` to build and distribute `viri-bridge.zip` and versioned zips across all download paths.
5. **Rebuild & Deploy PWA**: Clean old bundle assets and deploy fresh built assets by running:
   `rm -rf public/viri/assets && npm run --prefix pwa build && cp -R pwa/dist/* public/viri/`

## 3-Tier Feature Governance Rule
* **3-Tier Cascade Governance**: Every feature/permission option (such as `verification_enabled`, `ledger_enabled`, `ledger_show_balance`, `ledger_show_debit`, `reports_enabled`, `statement_enabled`, etc.) MUST follow the 3-tier governance model:
  1. **Superadmin Portal**: Managed via `tenants.features` per company/plan.
  2. **Company Dashboard**: If disabled by Superadmin, the option MUST be disabled and grayed-out in the Company Dashboard (with `DISABLED BY PLAN` badge) and cannot be enabled by Company Admins. Backend API controllers MUST reject any attempt to override disabled plan features.
  3. **Cashier PWA**: Effective permission = `(Superadmin Feature Enabled) && (Terminal Counter Permission Enabled)`. Disabled features MUST be hidden from Cashier PWA UI/navigation and restricted on API routes.


