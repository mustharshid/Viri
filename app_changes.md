# PWA / Application Code Modification Changelog (`app_changes.md`)

This document maintains a chronological record of code modifications made to the application frontend (`pwa/` directory) and backend, including exact before-and-after code snippets.

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
