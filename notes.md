To compile and Git Push everything


npm run --prefix pwa build && cp -R pwa/dist/* public/viri/ && ./package-extension.sh && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

Without ZIPs:

npm run --prefix pwa build && cp -R pwa/dist/* public/viri/ && git add . && git commit -m "build: compile assets, package extension, and deploy" && git push

npm run --prefix pwa build && \
cp -R pwa/dist/* public/viri/ && \
git add . && \
git commit -m "working on improvements" && \
git push

Commands to run when starting Laravel services and webserver:

php artisan serve & php artisan queue:work & php artisan schedule:work & npm run dev --prefix pwa

Simple command to git push
git add . && git commit -m "fix: resolve verify-terminal 500 error and array type checks" && git push

After creating a new Cashier Counter, by design I can see all the account used by the company. To fix this problem, I want to create a architecture where admin specify which accounts should be seen in which terminals. I want this to be a very visual GUI system. I also want to ensure:
- all the credential tokens can be access by the new terminal
- for MIB, tokens, username & password are available for the terminal
- any tokens, usernames of password can be stored locally in the browser, if needed.

---

## BML API Endpoint Audit Map

### Trigger Name: View History

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard`
  - **File Location**: `extension/background.js` (Line 1694)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches cashier account dashboard payload containing account list, internal account IDs, and live balances.

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{accountInternalId}/history/1`
  - **File Location**: `extension/background.js` (Line 1727)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches Page 1 historical transactions for the specified BML account.

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{accountInternalId}/history/today` *(Legacy Extension Mode)*
  - **File Location**: `extension/background.js` (Line 1414)
  - **Function/Method Name**: `executeLegacyBmlFetch()`
  - **Purpose**: Fetches transactions posted today for the BML account.

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/history/pending/{accountInternalId}` *(Legacy Extension Mode)*
  - **File Location**: `extension/background.js` (Line 1422)
  - **Function/Method Name**: `executeLegacyBmlFetch()`
  - **Purpose**: Fetches pending authorization holds and unsettled transfers for the BML account.

- **Endpoint URL/Path**: `[POST] {backendUrl}/verify-terminal` *(System Licensing Guard)*
  - **File Location**: `pwa/src/pages/Cashier/CashierApp.tsx` (Line 3544)
  - **Function/Method Name**: `handleVerify()`
  - **Purpose**: Validates terminal hardware ID, subscription state, and records verification usage count.

---

### Trigger Name: Sync History

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard`
  - **File Location**: `extension/background.js` (Line 1694)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches account dashboard payload to verify internal account ID and balance prior to pagination.

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{accountInternalId}/history/{page}`
  - **File Location**: `extension/background.js` (Line 1727)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches historical statement transactions for the requested page number (`page = 1, 2, 3...`).

- **Endpoint URL/Path**: `[POST] {backendUrl}/verify-terminal` *(System Licensing Guard)*
  - **File Location**: `pwa/src/pages/Cashier/CashierApp.tsx` (Line 3857)
  - **Function/Method Name**: `syncLedgerLocally()`
  - **Purpose**: Validates cashier terminal license before executing ledger history synchronization.

---

### Trigger Name: Live View

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard`
  - **File Location**: `extension/background.js` (Line 1694)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches live cleared balance, available balance, and reserved balance during periodic background polls.

- **Endpoint URL/Path**: `[GET] https://www.bankofmaldives.com.mv/internetbanking/api/mobile/account/{accountInternalId}/history/1`
  - **File Location**: `extension/background.js` (Line 1727)
  - **Function/Method Name**: `fetchBmlHistoryPage()`
  - **Purpose**: Fetches Page 1 statement entries to update live balance and recent transaction cache in background.

- **Endpoint URL/Path**: `[GET] {backendUrl}/terminal/ledger-history?hardware_id={id}&bank_account_id={id}&page=1` *(Direct API Mode)*
  - **File Location**: `pwa/src/pages/Cashier/CashierApp.tsx` (Line 3358)
  - **Function/Method Name**: `executeSilentAutoSync()`
  - **Purpose**: Fetches real-time balance, reserved balance, and Page 1 transactions via backend proxy server.

- **Endpoint URL/Path**: `[POST] {backendUrl}/terminal/session/log` *(Background Activity Logger)*
  - **File Location**: `pwa/src/pages/Cashier/CashierApp.tsx` (Line 3338 & Line 3370)
  - **Function/Method Name**: `executeSilentAutoSync()`
  - **Purpose**: Logs silent background polling initiation and completion events (`auto_sync_poll_initiated` and `auto_sync_poll_fulfilled`).

---

### Trigger Name: BML - Combined Transaction Ledger & Verification View

- **Endpoint URL/Path**: None *(No outgoing BML network requests are triggered upon toggling)*
  - **File Location**: `pwa/src/pages/Cashier/CashierApp.tsx` (Lines 5054–5058)
  - **Function/Method Name**: `onChange` event handler on `setting-bml-combined` checkbox
  - **Purpose**: Updates client React state (`bmlCombinedLedger = true`) and persists setting in `localStorage`. Merging of local verification entries with statement history occurs in-memory when rendering the ledger view.