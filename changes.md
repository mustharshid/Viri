# Extension Modification Changelog (`changes.md`)

This document maintains a chronological record of code modifications made to the Chrome Extension (`extension/background.js` and extension components), including exact before-and-after code snippets.

---

## [1.2.95] - 2026-08-02

### MIB Multi-Profile Initial Query Latency & WebView Account Shell Pre-Initialization

#### Overview & Root Cause
Resolves the 16-20 second initial query latency observed when fetching transaction history on multi-profile MIB accounts immediately following a P47 profile switch.
- **Issue**: MIB's WebView architecture requires a preliminary GET request to `/accountDetails?trxh=1&dashurl=1&accountNo=<targetAccount>` to bind the active P47 profile to the `JSESSIONID` web session and pre-index transaction history. Calling `POST /ajaxAccounts/trxHistory` directly caused MIB's backend to synchronously initialize the account shell on the first request (16s delay).
- **Fix**: Perform an explicit preliminary GET to `https://${wvDomain}/accountDetails?trxh=1&dashurl=1&accountNo=${targetAccount}` before calling `trxHistory`, pre-warming MIB's WebView account shell and fixing the double-slash in `detailsUrl`.

#### File: `extension/background.js`

##### CURRENT CODE (`background.js` lines 3031 - 3034):
```javascript
    const detailsUrl = `https://${wvDomain}//accountDetails?trxh=1&dashurl=1&accountNo=${targetAccount}`;
    emitLog(port, `> [MIB-API] Fetching transactions from ${wvDomain}/ajaxAccounts/trxHistory...`);
```

##### NEW CODE (`background.js` lines 3031 - 3048):
```javascript
    const detailsUrl = `https://${wvDomain}/accountDetails?trxh=1&dashurl=1&accountNo=${targetAccount}`;

    // Pre-warm account-specific WebView shell to initialize session index
    try {
      emitLog(port, `> [MIB-API] Pre-initializing WebView account shell for ${targetAccount}...`);
      await fetch(detailsUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'User-Agent': 'android/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      emitLog(port, `> [MIB-API] WebView account shell initialized.`);
    } catch (e) {
      emitLog(port, `> [MIB-API] Account shell pre-init warning: ${e.message}`);
    }

    emitLog(port, `> [MIB-API] Fetching transactions from ${wvDomain}/ajaxAccounts/trxHistory...`);
```

---

## [1.2.94] - 2026-08-01

### BML Account History Payload & Resilient USD Business Account Fetching Fix

#### Overview & Root Cause
Fixes `Invalid history payload from BML API.` errors occurring frequently on USD Business accounts (and accounts with 0 transactions today).
- **Issue 1**: Line 1428 threw a fatal error `Invalid history payload from BML API.` if `historyData.payload` was `null` or missing the `history` key (common when a USD business account has no transactions today, or when BML returns a non-200 HTTP status).
- **Issue 2**: `historyRes` did not validate HTTP status (`historyRes.status === 200`), swallowing BML's HTTP status and masking the underlying API response.
- **Issue 3**: `pendingRes` fetch lacked a timeout, causing execution to block for 10 seconds on endpoints returning 404 or timing out for USD accounts.

#### File: `extension/background.js`

##### CURRENT CODE (`background.js` lines 1414 - 1438):
```javascript
    const historyRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
    
    let pendingData = null;
    try {
      // Also fetch pending if available (not strictly in API doc, but good practice)
      emitLog(port, `> [BML-API] Fetching pending history from: ${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
      const pendingRes = await authFetch(`${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
      if (pendingRes.status === 200) {
        pendingData = await pendingRes.json();
      }
    } catch(e) {}

    const historyData = await historyRes.json();
    logApiDebug(port, historyData, 'BML-HISTORY');
    if (!historyData.payload || !historyData.payload.history) {
      throw new Error("Invalid history payload from BML API.");
    }
    
    let allTxs = [];
    if (pendingData && pendingData.payload && Array.isArray(pendingData.payload.history)) {
      allTxs = allTxs.concat(pendingData.payload.history);
    }
    if (Array.isArray(historyData.payload.history)) {
      allTxs = allTxs.concat(historyData.payload.history);
    }
```

##### NEW CODE (`background.js` lines 1414 - 1460):
```javascript
    const historyRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
    
    let pendingData = null;
    try {
      // Fetch pending history with a 3-second timeout signal to avoid 10s stalling
      emitLog(port, `> [BML-API] Fetching pending history from: ${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const pendingRes = await authFetch(`${BASE_URL}/api/mobile/history/pending/${accountInternalId}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (pendingRes && pendingRes.status === 200) {
        pendingData = await pendingRes.json();
      }
    } catch(e) {}

    let historyData = null;
    if (historyRes && historyRes.status === 200) {
      try {
        historyData = await historyRes.json();
        logApiDebug(port, historyData, 'BML-HISTORY');
      } catch(e) {}
    } else if (historyRes) {
      emitLog(port, `> [BML-API] /history/today returned HTTP status ${historyRes.status}`);
    }

    let historyTxs = [];
    if (historyData && historyData.payload && Array.isArray(historyData.payload.history)) {
      historyTxs = historyData.payload.history;
    } else if (historyData && historyData.payload && Array.isArray(historyData.payload)) {
      historyTxs = historyData.payload;
    }

    // Graceful fallback to page 1 history if today's history payload is empty or failed
    if (historyTxs.length === 0) {
      emitLog(port, `> [BML-API] No transactions found in /history/today. Attempting fallback to /history/1...`);
      try {
        const page1Res = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/1`);
        if (page1Res && page1Res.status === 200) {
          const page1Data = await page1Res.json();
          logApiDebug(port, page1Data, 'BML-HISTORY-PAGE1');
          if (page1Data && page1Data.payload && Array.isArray(page1Data.payload.history)) {
            historyTxs = page1Data.payload.history;
          } else if (page1Data && page1Data.payload && Array.isArray(page1Data.payload)) {
            historyTxs = page1Data.payload;
          }
        }
      } catch(e) {
        emitLog(port, `> [BML-API] Fallback /history/1 failed: ${e.message}`);
      }
    }

    let allTxs = [];
    if (pendingData && pendingData.payload && Array.isArray(pendingData.payload.history)) {
      allTxs = allTxs.concat(pendingData.payload.history);
    }
    allTxs = allTxs.concat(historyTxs);
```
