# PWA / Application Code Modification Changelog (`app_changes.md`)

This document maintains a chronological record of code modifications made to the application frontend (`pwa/` directory) and backend, including exact before-and-after code snippets.

## [2026-08-05] - Render VBTL Debug Log Panel in Transaction Ledger View

### Overview & Rationale
- Updated `pwa/src/pages/Cashier/CashierApp.tsx` so that when `show_vbtl` feature is enabled by Superadmin (`permissions.show_vbtl === true`), the **Viri Bridge Cashier Counter Logs** debugging window is displayed at the top of the **Transaction Ledger** page as well as the Verification page.
- Fully respects 3-Tier Feature Governance (remains hidden when `show_vbtl` is disabled by Superadmin).

### Files Modified:
1. `pwa/src/pages/Cashier/CashierApp.tsx`
2. `app_changes.md`

---

## [2026-08-04] - Superadmin App Config: Single 'Live View Interval Setting' Slider Card & Renamed Timeout Card

### Overview & Rationale
1. **Single 'Live View Interval Setting' Card**:
   - Converted the two separate min/max poll delay cards in Superadmin > App Config into a single **'Live View Interval Setting'** card.
   - Includes a single range slider with max 3 minutes (180s).
   - Displays the **Target Interval** (e.g. `60s`) and calculated **Poll Range** (e.g. `55s - 65s` / ±5s range).
   - Live View polling continuously runs at randomized intervals within this range until toggled OFF manually or by inactivity timeout.
2. **Renamed Timeout Card**:
   - Renamed **Auto-Sync Inactivity Timeout (Minutes)** to **Live View Inactivity Timeout (Minutes)** in Superadmin > App Config.

### Files Modified:
1. `routes/api.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`
3. `app_changes.md`

---

## [2026-08-04] - Immediate Live View Poll Execution & Removal of Duplicate Form Toggle

### Overview & Rationale
1. **Immediate Poll Execution on Toggle ON**:
   - Updated `toggleAccountAutoSync` so that turning Live View ON for an account triggers an immediate background poll tick (`executeSilentAutoSync(accountId)`) without waiting 50–60 seconds for the first scheduled interval.
2. **Master OFF State Auto-Disable & Off-State Toggles**:
   - When PWA > Settings > **Enable/Disable Live Balance & Transaction** is OFF, all active account Live Views are cleared (`autoSyncAccounts = []`) and toggle buttons are hidden (`visibility OFF`).
   - When turned ON, all account toggles render in the **OFF state** (`"Live View Disabled"`), allowing cashiers to explicitly opt-in per account.
3. **Removal of Duplicate Form Controls Toggle**:
   - Removed the extra auto-sync toggle switch from the verification form controls area next to Sync History. Toggles are now strictly placed on **Carousel Cards** and **Active Account Card**.

### Files Modified:
1. `pwa/src/pages/Cashier/CashierApp.tsx`
2. `app_changes.md`

---

## [2026-08-04] - Live View Visibility Control, "Live View Enabled/Disabled" Wording & Combined Settings Grouping

### Overview & Rationale
1. **Master Setting Visibility Control**:
   - Updated PWA > Settings master toggle to **"Enable/Disable Live Balance & Transaction"**.
   - When the master toggle is ON (`liveViewMasterEnabled = true` & plan feature allowed), Live View buttons become VISIBLE throughout the PWA on carousel bank account cards and active account cards.
   - When OFF, Live View buttons are hidden (`visibility OFF`) across the PWA.
2. **"Live View Enabled / Disabled" Card Wording**:
   - Renamed "Auto-Sync" to **"Live View"** across cards and banner notifications.
   - Bank account cards now display `"Live View Enabled"` (when active) or `"Live View Disabled"` (when inactive).
3. **Grouped Combined View Settings**:
   - Neatly grouped **MIB - Combined Transaction Ledger & Verification View** (always ON) and **BML - Combined Transaction Ledger & Verification View** under a unified **Combined View Settings** section card in PWA > Settings.

### Files Modified:
1. `pwa/src/pages/Cashier/CashierApp.tsx`
2. `app_changes.md`

---

## [2026-08-04] - Silent Non-Intrusive Auto-Sync Engine & Per-Card Carousel Toggle Buttons

### Overview & Rationale
Refined the **Auto-Sync Live Balance & Transactions** polling engine to operate completely silently without UI disruption or flag collision:
1. **Silent Non-Intrusive Engine (`executeSilentAutoSync`)**:
   - Created a dedicated background fetch handler that bypasses interactive manual UI spinners (`setLoading(true)`) and avoids locking `isVerifyingRef.current`.
   - Connects seamlessly to API endpoints or background Chrome Extension ports (`viri-auto-sync`).
   - Updates `recentTxCache` and `ledgerCache` with fresh balance, reserved balance, and transactions while updating the live `HH:MM:SS` timer.
   - Emits structured session log events (`auto_sync_poll_initiated` and `auto_sync_poll_fulfilled`) under `event_type: 'auto_sync_activity'` with unmasked account numbers.
2. **Carousel & Active Account Toggle Placement**:
   - Moved auto-sync toggle slider buttons onto **EACH individual bank account card in the Transaction Ledger carousel**.
   - Added auto-sync toggle slider button on the **Active Account card in Verification View**.
   - Ensured initial state defaults to `[]` (empty list; no accounts are auto-enabled ON automatically).

### Files Modified:
1. `pwa/src/pages/Cashier/CashierApp.tsx`
2. `app_changes.md`

---

## [2026-08-04] - Auto-Sync Live Balance & Transactions Background Polling (v1.2.97)

### Overview & Rationale
Implemented the **Auto-Sync Live Balance & Transactions** background polling feature across all 3 tiers with strict governance:
1. **Superadmin App Config & Governance**:
   - Added `auto_sync_min_interval` slider (range 5s–180s, default 50s) and `auto_sync_max_interval` slider (range 5s–180s, default 60s) in Superadmin App Config.
   - Added `auto_sync_idle_timeout` textbox input (range 1m–180m, default 15m) in Superadmin App Config for idle auto-disabling.
   - Added `auto_sync_enabled` tenant feature flag.
2. **Company Dashboard**:
   - Rendered read-only `auto_sync_enabled` toggle in Terminal Counter Permissions modal with `DISABLED BY PLAN` or `ENABLED BY PLAN` badge.
3. **Cashier PWA & 2-Account FIFO Queue**:
   - Added auto-sync toggle switches in Verification Active Account card, Transaction Ledger controls, and PWA Settings.
   - Restricted maximum active auto-sync accounts to 2 per cashier PWA session. Enabling a 3rd account automatically evicts the oldest (1st) account with a bottom notification banner.
   - Added background polling scheduler with randomized interval between `minSec` and `maxSec` seconds.
   - Added **Collision Safeguard**: Defers background poll ticks if manual verification search or extension port action is active.
   - Added **Button Imitation Safeguard**: If cashier clicks **View History** / **Sync History** while auto-sync is active, waits for the background poll result and updates UI without sending duplicate API calls.
   - Added **Idle Auto-Disable Safeguard**: Automatically turns OFF auto-sync when cashier terminal is deep idle for longer than `auto_sync_idle_timeout` minutes.
   - Added `<FormatSinceLastSync />` component rendering live `HH:MM:SS` timer above Daily Entries and Recent Transactions tables.
   - Grouped session logs under `event_type: 'auto_sync_activity'` with unmasked account numbers.
4. **Extension Version Bump**:
   - Incremented version to `1.2.97` across `manifest.json`, `CashierApp.tsx`, `CompanyDashboard.tsx`, ran `./package-extension.sh`, and rebuilt/deployed PWA bundle to `public/viri/`.

### Files Modified:
1. `routes/api.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`
3. `pwa/src/pages/Dashboard/CompanyDashboard.tsx`
4. `pwa/src/pages/Cashier/CashierApp.tsx`
5. `extension/manifest.json`
6. `app_changes.md`

### Code Snippets & Revert Instructions

#### 1. `routes/api.php` (App Config & Permissions)
```php
// BEFORE:
'bml_login_procedure' => 'api',
'mib_login_procedure' => 'api',
];
'bml_combined_ledger_allowed' => (bool) ($tenantFeatures['bml_combined_ledger'] ?? ! $isFreeOr499),
'shift_claim_report_enabled' => true,

// AFTER:
'bml_login_procedure' => 'api',
'mib_login_procedure' => 'api',
'auto_sync_min_interval' => max(5, min(180, (int) ($settings['auto_sync_min_interval'] ?? 50))),
'auto_sync_max_interval' => max(5, min(180, (int) ($settings['auto_sync_max_interval'] ?? 60))),
'auto_sync_idle_timeout' => max(1, (int) ($settings['auto_sync_idle_timeout'] ?? 15)),
];
'bml_combined_ledger_allowed' => (bool) ($tenantFeatures['bml_combined_ledger'] ?? ! $isFreeOr499),
'auto_sync_enabled' => (bool) ($tenantFeatures['auto_sync_enabled'] ?? false),
'shift_claim_report_enabled' => true,
```

#### 2. `CashierApp.tsx` (State, FIFO, Polling & Timers)
```tsx
const [autoSyncAccounts, setAutoSyncAccounts] = useState<string[]>(() => {
  return safeJsonParse(localStorage.getItem('viri_auto_sync_accounts'), []);
});

const toggleAccountAutoSync = (accountId: string) => {
  const accObj = bankAccounts.find(a => a.id.toString() === accountId);
  const isEnabling = !autoSyncAccounts.includes(accountId);

  setAutoSyncAccounts(prev => {
    let next = [...prev];
    if (isEnabling) {
      if (next.length >= 2) {
        const evictedId = next.shift();
        const evictedAcc = bankAccounts.find(a => a.id.toString() === evictedId);
        showAutoSyncBanner(`Auto-sync disabled for ${evictedAcc?.bank_name || ''} (${evictedAcc?.account_number.slice(-4) || evictedId}) (Max 2 accounts limit reached).`);
      }
      next.push(accountId);
    } else {
      next = next.filter(id => id !== accountId);
    }
    localStorage.setItem('viri_auto_sync_accounts', JSON.stringify(next));
    return next;
  });
};
```

---

## [2026-08-03] - Remove Duplicate View Mode Toggle from Session Activity & Telemetry Center Header

### Overview & Rationale
Cleaned up the Telemetry Center header UI:
- **Removed Duplicate Toggle**: Removed the `Grouped Flows | Raw Stream` view mode toggle buttons from the top `Session Activity & Telemetry Center` header bar, leaving the toggle buttons strictly on the Activity Log card headers where logs are displayed.

### Files Modified:
1. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - Combined BML vs MIB Latency Graph & Activity Log Card View Mode Toggle

### Overview & Rationale
Refines the Telemetry Center layout and visual metrics:
1. **Combined Bank API Reply Health Dual Line Graph (BML vs MIB)**: Transformed individual bank cards into a combined 7-day dual-line latency trend graph comparing Bank of Maldives (BML) latency (solid emerald line) vs Maldives Islamic Bank (MIB) latency (dashed cyan line), complete with real-time status pills and latency averages.
2. **Activity Log Card View Mode Toggle**: Prominently placed the **Grouped Flows | Raw Stream** toggle button group directly on the top header of both the Recent Request Flow Cards section and the Raw Activity Log Stream section for instant mode switching.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - Terminal Click Filter, Bank API Health (BML/MIB), 15m Active Threshold, Error Card Stream Action & Delta Animations

### Overview & Rationale
Implements 5 major telemetry enhancements to the Superadmin Portal:
1. **Terminal Click Filter**: Added click handler to **Current Hour Active Terminals** cards to instantly filter **Recent Request Flow Cards (3-Step Sessions)** by selected terminal name (with active badge & clear button).
2. **Bank API Reply Health Card (BML & MIB)**: Added a dedicated health widget calculating average API latency & success rates per bank based on trace timestamps (`Submitted` &rarr; `Fulfilled`).
3. **15-Minute Active Terminals Threshold**: Updated active terminals threshold query in `SuperadminController.php` from 5 minutes to 15 minutes (`subMinutes(15)`).
4. **Error Ratio Card Stream Filter**: Added click handler to **Error Ratio (24h)** stat card to automatically switch to **Raw Activity Log Stream**, apply `Request Failed` event filter, and scroll to stream.
5. **Telemetry Refresh Value Animations**: Added delta diff tracking in `AdminDashboard.tsx` to highlight changed telemetry values with pulsing change badges (`+3`, `-1%`) for 8 seconds after refresh.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - 24-Hour Spectrum GMT+5 (Maldives Time) Fix & Last 5 Active Terminals Breakdown Card

### Overview & Rationale
Fixes hourly spectrum timezone alignment and adds the last 5 active terminals breakdown to the current hour telemetry section:
- **24-Hour API Activity Spectrum GMT+5 Fix**: Updated `SuperadminController.php` to calculate hourly buckets using `$nowMvt = Carbon::now('+05:00')` and MySQL `DATE_ADD(created_at, INTERVAL 5 HOUR)`, aligning spectrum hours (`15:00` MVT) directly with local Maldives Time instead of UTC (`10:00`).
- **Last 5 Active Terminals Breakdown**: Updated **Current Hour Active Terminals (Past 60 Minutes)** card to display the last 5 terminals that made API requests, showing each terminal name, company name (tenant name), total request count in past 60m, last activity time in MVT, and latest activity summary.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - Current Hour Requests Card, GMT+5 (Maldives Time) Timestamps & Company Name in Top Terminals

### Overview & Rationale
Adds current hour live request tracking, GMT+5 timezone formatting, and company name context in terminal throughput:
- **Current Hour Live API Requests Card**: Added a live telemetry card displaying all API requests received during the current hour (within past 60 mins), including Terminal Name, Company Name (Tenant Name), Bank/Account Number, Event Summary, and MVT timestamp.
- **GMT+5 (Maldives Time `Indian/Maldives`) Alignment**: Converted all database queries, Carbon dates, and frontend timestamp displays to GMT+5 using `Indian/Maldives` timezone and `try...catch` safe formatters, adding `MVT` markers across telemetry spectrums, request feeds, and log traces. Also added null guards on event type strings.
- **Company Name in Top Terminals**: Updated `terminalThroughput` backend query and UI widget to include the company name `(Tenant Name)` alongside the terminal name for full multi-tenant visibility.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - Shift & Claim Report Toggle in Superadmin Portal (Registered Companies & Tiers)

### Overview & Rationale
Integrates the **Shift & Claim Report** feature control into the Superadmin Portal across both **Registered Companies** (Individual Feature Overrides) and **Tiers** (Subscription Plans):
- **Superadmin Portal Integration**: Added `Shift & Claim Report` (`shift_claim_report_enabled`) toggle to Registered Companies feature overrides and Subscription Plan Tiers in `AdminDashboard.tsx`.
- **Required Feature Governance**: Marked `shift_claim_report_enabled` as a **Required Feature in All Plans** (`required: true`), locking the toggle in checked/enabled state (`REQUIRED IN ALL PLANS` badge) so it cannot be disabled.
- **Backend & Cascade Alignment**: Enforced `shift_claim_report_enabled => true` across plan creation and tenant updates in `SuperadminController.php` and `routes/api.php`.

### Files Modified:
1. `pwa/src/pages/Dashboard/AdminDashboard.tsx`
2. `app/Http/Controllers/API/SuperadminController.php`

---

## [2026-08-03] - Combined 7-Day Trend Cards, 30-Day Monthly Activity Graph & 5-Min Active Terminal Threshold

### Overview & Rationale
Consolidates and expands telemetry trend charts based on user feedback:
- **Combined 7-Day Reliability Trend Card**: Merged Success Rate % (Emerald Green) and Error Rate % (Rose Red) into a single dual-line graph card with legends and daily data points.
- **Combined 7-Day Request Latency Trend Card**: Merged Overall Request Duration (Cyan Blue) and Real API Execution Time (Amber Yellow) into a single dual-line graph card with legends and daily data points.
- **30-Day Monthly Activity & Active Terminals Line Graph**: Added a 30-day monthly line graph displaying **Total Daily Requests** (Blue line & area fill) overlaid with **Active Terminals Per Day** (Purple dashed line).
- **5-Minute Active Terminal Threshold**: Updated real-time active terminals threshold in `SuperadminController.php` to count terminals with log activity within a 5-minute window (`subMinutes(5)`).

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - Average Request Duration & Real API Execution Time Telemetry & Trend Graphs

### Overview & Rationale
Updates the Session Activity & Telemetry Center with accurate request duration calculations and real API execution time measurements:
- **Average Request Duration Calculation**: Updated request duration to subtract `fetch_request_submitted` timestamp from `fetch_request_fulfilled` timestamp (`Fulfilled Time - Submitted Time = 7 seconds`). Fixed previous erroneous 48s duration calculation.
- **Real API Execution Time Measurement**: Measures execution time directly inside PWA debug trace console logs (`PWA Debug Trace end time - start time`).
- **7-Day Average Request Duration Trend Graph**: Added a Cyan Neon line graph plotting daily average overall request duration in seconds (`Mon`..`Sun`).
- **7-Day Average Real API Execution Time Trend Graph**: Added an Amber Neon line graph plotting daily average real API execution time in seconds (`Mon`..`Sun`).
- **Grouped Flow Cards Update**: Displays both `Req Time: X.Xs` and `Real API: Y.Ys` side-by-side on each transaction card header.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-03] - 7-Day Trend Graphs, Active Terminals Audit, Duration Calculation & Poll Slider Fixes

### Overview & Rationale
Updates the Session Activity & Telemetry Center based on auditing and user requirements:
- **7-Day Trend Line Graphs**: Added 7-day daily trend line graphs for **Success Rate %** (Emerald Neon) and **Error Rate %** (Rose Neon) with area gradient fills and daily breakdowns (`Mon`..`Sun`).
- **Active Terminals Calculation Audit**: Updated active terminals logic in `SuperadminController.php` to calculate online terminals with activity/heartbeats within the last 15 minutes (`subMinutes(15)`) instead of static database status configuration.
- **Session Duration Calculation Fix**: Updated `SuperadminController.php` to calculate session duration accurately using timestamp differences and fallback parsing of execution log timestamps (`[HH:MM:SS]`) inside terminal debug traces when DB timestamps occur within the same second.
- **Session Log Poll Interval Slider Fix**: Fixed `setSystemSettings` state handler in `AdminDashboard.tsx` to insert missing `session_log_poll_interval` setting keys when adjusting the slider.
- **Fixed 2-Digit Refresh Timer**: Formatted `logRefreshCountdown` as 2-digit string (`02s`, `09s`, `14s`) using `.padStart(2, '0')` to eliminate UI button layout jittering.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-02] - Raw Activity Stream Direct Page Selection & Jump Control

### Overview & Rationale
Allows superadmins to jump directly to any target page in the Raw Activity Log Stream without needing to click serially through pages.
- **Issue**: Pagination previously only had serial "Previous" and "Next" buttons, making navigating to distant log pages tedious.
- **Fix**: Added a dropdown `<select>` selector listing all `1..logsTotalPages` and a direct `Jump to page:` numerical input box in `AdminDashboard.tsx`.

### File: `pwa/src/pages/Dashboard/AdminDashboard.tsx`

#### CURRENT CODE (`AdminDashboard.tsx` lines 3120 - 3140):
```tsx
                {/* Pagination Footer */}
                <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-2">
                  <button
                    className="btn btn-outline text-xs px-3 py-1.5"
                    disabled={logsPage === 1}
                    onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
                  >
                    Previous
                  </button>
                  <span className="text-xs text-zinc-400 font-mono">
                    Page {logsPage} of {logsTotalPages}
                  </span>
                  <button
                    className="btn btn-outline text-xs px-3 py-1.5"
                    disabled={logsPage === logsTotalPages}
                    onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
                  >
                    Next
                  </button>
                </div>
```

#### NEW CODE (`AdminDashboard.tsx` lines 3120 - 3160):
```tsx
                {/* Interactive Multi-Option Pagination Controls */}
                <div className="flex flex-wrap items-center justify-between border-t border-zinc-800 pt-4 mt-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="btn btn-outline text-xs px-3 py-1.5 font-bold rounded-lg disabled:opacity-40 cursor-pointer"
                      disabled={logsPage === 1}
                      onClick={() => setLogsPage(prev => Math.max(prev - 1, 1))}
                    >
                      &larr; Previous
                    </button>

                    {/* Direct Page Select Dropdown */}
                    <div className="flex items-center gap-1.5 font-mono text-zinc-400">
                      <span>Page</span>
                      <select
                        value={logsPage}
                        onChange={(e) => setLogsPage(Number(e.target.value))}
                        className="bg-zinc-900 border border-zinc-800 text-yellow-400 font-bold font-mono rounded-lg px-2.5 py-1 text-xs outline-none focus:border-yellow-500/50 cursor-pointer"
                      >
                        {Array.from({ length: logsTotalPages }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <span>of <strong className="text-zinc-200">{logsTotalPages}</strong></span>
                    </div>

                    <button
                      className="btn btn-outline text-xs px-3 py-1.5 font-bold rounded-lg disabled:opacity-40 cursor-pointer"
                      disabled={logsPage === logsTotalPages}
                      onClick={() => setLogsPage(prev => Math.min(prev + 1, logsTotalPages))}
                    >
                      Next &rarr;
                    </button>
                  </div>

                  {/* Direct Jump Input */}
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-zinc-500 text-[11px]">Jump to page:</span>
                    <input
                      type="number"
                      min={1}
                      max={logsTotalPages}
                      value={logsPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= logsTotalPages) {
                          setLogsPage(val);
                        }
                      }}
                      className="w-16 bg-zinc-900 border border-zinc-800 text-yellow-400 font-mono font-bold text-center rounded-lg px-2 py-1 text-xs focus:border-yellow-500/50 outline-none"
                    />
                  </div>
                </div>
```

---

## [2026-08-02] - Session Analytics Telemetry Center & 3-Step Grouped Session Flow Cards

### Overview & Rationale
Redesigns the **Session Activity Log** tab in the Superadmin Portal (`AdminDashboard.tsx`) with a Maxton-inspired dark-mode telemetry dashboard and 3-step grouped request flow cards.
- **Features Introduced**:
  - **4 Top Graphical Telemetry Cards**: Active Terminals SVG donut ring gauge, Live Requests Per Hour (RPH) with animated SVG sparkline graph, 24h Error Ratio indicator badge, and Daily/Monthly Success Rate gauges.
  - **24-Hour API Activity Spectrum & Terminal Throughput**: Interactive 24-hour SVG hourly request distribution bar chart and top terminal throughput progress meters.
  - **3-Step Grouped Request Flow Cards**: Correlates the 3 log steps per request session (`Submitted` → `PWA Debug Trace` → `Result`) into interactive expandable cards with step-by-step tabbed JSON & console log viewers.
  - **View Mode Switcher**: Toggle between `Grouped Flows` and `Raw Stream` list view.

### Files Modified:
1. `app/Http/Controllers/API/SuperadminController.php`
2. `pwa/src/pages/Dashboard/AdminDashboard.tsx`

---

## [2026-08-02] - End-of-Day Shift Update Report Button Redesign

### Overview & Rationale
Redesigns the "Update" button in the Cashier PWA "End-of-Day Shift Closing & Claim Report" section to match the premium styling of the "Close & Seal Counter Shift" button.
- **Issue**: The Update button previously used generic `btn-primary py-1.5 px-3` styling, looking cramped and mismatched next to other shift action controls.
- **Fix**: Updated button to `btn-success text-xs px-4 py-2 flex items-center gap-1.5 font-bold shadow-lg shadow-emerald-500/20 rounded-xl transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]` with "Update Report" label.

### File: `pwa/src/pages/Cashier/CashierApp.tsx`

#### CURRENT CODE (`CashierApp.tsx` lines 6616 - 6623):
```tsx
                          <button
                            onClick={() => loadClaimedSalesAndShift(shiftIdFilter, shiftReportDateFilter)}
                            disabled={isReportLoading}
                            className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 font-bold"
                          >
                            {isReportLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            Update
                          </button>
```

#### NEW CODE (`CashierApp.tsx` lines 6616 - 6623):
```tsx
                          <button
                            onClick={() => loadClaimedSalesAndShift(shiftIdFilter, shiftReportDateFilter)}
                            disabled={isReportLoading}
                            className="btn btn-success text-xs px-4 py-2 flex items-center gap-1.5 font-bold shadow-lg shadow-emerald-500/20 rounded-xl transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isReportLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Update Report
                          </button>
```

---

## [2026-08-02] - Superadmin Portal Tab Scrollbar Elimination

### Overview & Rationale
Eliminates horizontal scrolling and visible scrollbars under navigation tabs in the Superadmin Portal.
- **Issue**: The navigation tab container previously used `overflow-x-auto`, which triggered native horizontal scrollbars on desktop browsers when tab titles expanded.
- **Fix**: Replaced `overflow-x-auto` on the tab bar with `hidden md:flex flex-wrap`. On small screens (`< md`), tabs are accessed via the dedicated mobile dropdown view selector. On medium and desktop screens (`>= md`), tabs render as a clean flex wrap row with zero horizontal scrollbars.

### File: `pwa/src/pages/Dashboard/AdminDashboard.tsx`

#### CURRENT CODE (`AdminDashboard.tsx` line 3437):
```tsx
        {/* Navigation Tabs (Swipeable Horizontal Pill Bar on Mobile, Full Tab Bar on Desktop) */}
        <div className="flex border-b border-zinc-800 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none gap-1.5 pb-2">
```

#### NEW CODE (`AdminDashboard.tsx` line 3437):
```tsx
        {/* Navigation Tabs (Responsive: Mobile Dropdown on < md, Clean Flex Wrap Row on Desktop without Scrollbar) */}
        <div className="hidden md:flex flex-wrap border-b border-zinc-800 mb-6 gap-1.5 pb-2">
```
