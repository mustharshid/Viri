const BASE_URL = "https://www.bankofmaldives.com.mv/internetbanking";
const MIB_BASE_URL = "https://faisanet.mib.com.mv";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

let globalInertiaVersion = "";

function maskString(str) {
  if (!str) return "undefined";
  if (str.length <= 2) return "*".repeat(str.length);
  return str[0] + "*".repeat(str.length - 2) + str[str.length - 1];
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function emitLog(port, msg) {
  const formattedMsg = `[${getTimestamp()}] ${msg}`;
  if (port) {
    try {
      port.postMessage({ type: "log", message: formattedMsg });
    } catch (e) {
      console.log(formattedMsg);
    }
  } else {
    console.log(formattedMsg);
  }
}

async function saveScrap(stepName, content) {
  try {
    await fetch('http://localhost:9999/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Step-Name': stepName
      },
      body: content
    });
  } catch (err) {
    console.log('Scrap server not running or failed to save scrap', err);
  }
}

async function enableBankLockdown() {
  const rules = [
    {
      id: 10,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: "bankofmaldives.com.mv",
        resourceTypes: ["main_frame", "sub_frame"]
      }
    },
    {
      id: 11,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: "mib.com.mv",
        resourceTypes: ["main_frame", "sub_frame"]
      }
    }
  ];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [10, 11],
      addRules: rules
    });
    console.log("[Viri Bridge] Bank lockdown rules activated.");
  } catch (err) {
    console.error("[Viri Bridge] Failed to activate lockdown rules:", err);
  }
}

async function disableBankLockdown() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [10, 11]
    });
    console.log("[Viri Bridge] Bank lockdown rules deactivated.");
  } catch (err) {
    console.error("[Viri Bridge] Failed to deactivate lockdown rules:", err);
  }
}

async function clearBankSessions() {
  const domains = ["bankofmaldives.com.mv", "mib.com.mv"];
  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const cookie of cookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    } catch (err) {
      console.error(`[Viri Bridge] Error clearing cookies for ${domain}:`, err);
    }
  }
  console.log("[Viri Bridge] All bank session cookies destroyed.");
}

// Clear any left-over lockdown rules or sessions on extension startup/reload
disableBankLockdown();
clearBankSessions();

// Global active port
let activePort = null;
let heldSession = null;
let heartbeatInterval = null;
let pollInterval = null;

// Restore session state on worker wake up
chrome.storage.local.get(['viri_held_session'], (result) => {
  if (result.viri_held_session) {
    heldSession = result.viri_held_session;
    startHeartbeat();
    startRequestPolling();
    console.log("[Viri Bridge] Restored heldSession from storage.");
  }
});

async function logSessionEvent(event_type, detail = {}) {
  if (!heldSession || !heldSession.backendUrl) return;
  await fetch(`${heldSession.backendUrl}/terminal/session/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hardware_id: heldSession.hardwareId,
      event_type,
      ...detail
    })
  }).catch(() => {});
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!heldSession || !heldSession.backendUrl) return;
    try {
      await fetch(`${heldSession.backendUrl}/terminal/session/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: heldSession.hardwareId,
          bank_account_id: parseInt(heldSession.accountId)
        })
      });
    } catch (e) {
      console.error("Heartbeat post failed:", e);
    }
  }, 10000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startRequestPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!heldSession || !heldSession.backendUrl) return;
    try {
      const res = await fetch(`${heldSession.backendUrl}/terminal/session/pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hardware_id: heldSession.hardwareId,
          bank_account_id: parseInt(heldSession.accountId)
        })
      });
      if (!res.ok) return;
      const requests = await res.json();
      if (Array.isArray(requests) && requests.length > 0) {
        for (const req of requests) {
          await fulfillPendingRequest(req);
        }
      }
    } catch (e) {
      console.error("Error polling pending requests:", e);
    }
  }, 3000);
}

function stopRequestPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function fulfillPendingRequest(req) {
  if (!heldSession) return;
  emitLog(activePort, `> [Session] Fulfilling pending request ID ${req.id} (${req.request_type})...`);
  try {
    const fakePort = {
      postMessage: (msg) => {
        if (msg.type === 'log' && activePort) {
          activePort.postMessage(msg);
        }
      }
    };

    let result;
    if (heldSession.bankName === 'MIB') {
      result = await runMibFlow(heldSession.credentials, heldSession.accountId, fakePort, req.target_amount || '1.00', '0', req.request_type, 'fetch_only');
    } else {
      result = await runBmlFlow(heldSession.credentials, heldSession.accountId, fakePort, req.target_amount || '1.00', req.request_type, 'fetch_only');
    }

    await fetch(`${heldSession.backendUrl}/terminal/session/fulfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hardware_id: heldSession.hardwareId,
        request_id: req.id,
        status: 'fulfilled',
        result_json: result
      })
    });
    
    await logSessionEvent('fetch_request_fulfilled', {
      bank_name: heldSession.bankName,
      account_number_masked: maskString(heldSession.accountId),
      event_summary: `Fulfilled request ID ${req.id} (${req.request_type})`
    });
  } catch (err) {
    console.error("Failed to fulfill request:", err);
    await fetch(`${heldSession.backendUrl}/terminal/session/fulfill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hardware_id: heldSession.hardwareId,
        request_id: req.id,
        status: 'failed',
        error_message: err.message
      })
    }).catch(() => {});

    await logSessionEvent('fetch_request_failed', {
      bank_name: heldSession.bankName,
      account_number_masked: maskString(heldSession.accountId),
      event_summary: `Failed request ID ${req.id}: ${err.message}`
    });
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'PING_BANK') {
    if (heldSession) {
      const url = heldSession.bankName === 'MIB' ? "https://faisanet.mib.com.mv/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
      fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, credentials: 'include' }).catch(() => {});
    }
    sendResponse({ status: 'ok' });
  }
  return true;
});

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log("[Viri Bridge] PWA Connected via Port:", port.name);
  if (port.name === "viri-verify" || port.name === "bml-auth") {
    activePort = port;
    enableBankLockdown();

    port.onMessage.addListener(async (msg) => {
      // Handle the new frontend structure
      if (msg.action === 'VERIFY_TRANSFER') {
        const payload = msg.payload;
        const targetAcc = payload.accountNumber || payload.accountId || payload.account;
        const mode = payload.mode || 'search';
        const sessionMode = payload.sessionMode || 'fresh_login';
        try {
          if (payload.bank === 'MIB') {
            await runMibFlow(payload.credentials, targetAcc, port, payload.amount, payload.mibProfileType || '0', mode, sessionMode);
          } else {
            await runBmlFlow(payload.credentials, targetAcc, port, payload.amount, mode, sessionMode);
          }
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
      else if (msg.action === 'CLAIM_SESSION') {
        heldSession = {
          accountId: msg.payload.accountId,
          bankName: msg.payload.bankName,
          backendUrl: msg.payload.backendUrl,
          hardwareId: msg.payload.hardwareId,
          credentials: msg.payload.credentials
        };
        chrome.storage.local.set({ viri_held_session: heldSession });
        startHeartbeat();
        startRequestPolling();
        emitLog(port, `> [Session] Session holder status activated.`);
      }
      else if (msg.action === 'RELEASE_SESSION') {
        stopHeartbeat();
        stopRequestPolling();
        clearBankSessions();
        heldSession = null;
        chrome.storage.local.remove('viri_held_session');
        emitLog(port, `> [Session] Session holder status released.`);
      }
      else if (msg.action === 'PING_BANK') {
        if (heldSession) {
          const url = heldSession.bankName === 'MIB' ? "https://faisanet.mib.com.mv/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
          fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => {});
        }
      }
      // Handle legacy test format
      else if (msg.type === "start_bml_flow") {
        try {
          await runBmlFlow(msg.credentials, msg.targetAccount, port, "1.00");
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePort === port) {
        activePort = null;
      }
      disableBankLockdown();
      if (!heldSession) {
        clearBankSessions();
      }
    });
  }
});

// A wrapper around fetch to log requests/responses to the UI
async function loggedFetch(url, options = {}) {
  const method = options.method || 'GET';
  const port = activePort;
  let bodyLog = "";
  if (options.body && typeof options.body === 'string') {
    let sanitizedBody = options.body;
    try {
      const parsedBody = JSON.parse(options.body);
      if (parsedBody.username) parsedBody.username = maskString(parsedBody.username);
      if (parsedBody.password) parsedBody.password = maskString(parsedBody.password);
      if (parsedBody.totpSeed) parsedBody.totpSeed = maskString(parsedBody.totpSeed);
      sanitizedBody = JSON.stringify(parsedBody);
    } catch (e) {
      sanitizedBody = options.body.replace(/"password"\s*:\s*"[^"]*"/g, '"password":"[REDACTED]"');
    }
    bodyLog = `\n    Body: ${sanitizedBody.substring(0, 100)}...`;
  }
  emitLog(port, `> [BML] Request: ${method} ${url}${bodyLog}`);

  options.credentials = 'include';

  // Automatically inject X-Inertia-Version header if it's an Inertia request and version is set
  if (options.headers) {
    const hasInertia = Object.keys(options.headers).some(k => k.toLowerCase() === 'x-inertia' && options.headers[k] === 'true');
    if (hasInertia && globalInertiaVersion) {
      const versionKey = Object.keys(options.headers).find(k => k.toLowerCase() === 'x-inertia-version') || 'X-Inertia-Version';
      options.headers[versionKey] = globalInertiaVersion;
    }
  }

  try {
    const res = await fetch(url, options);
    emitLog(port, `> [BML] Response: HTTP ${res.status} from ${url}`);
    return res;
  } catch (error) {
    emitLog(port, `> [BML] Fetch failed: ${error.message} for ${url}`);
    throw error;
  }
}

// Simple function to get a TOTP token natively with optional server clock offset (in ms)
async function generateTOTP(secret, clockOffset = 0) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32chars.indexOf(secret.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const hex = bits.match(/.{1,8}/g).map(b => parseInt(b, 2).toString(16).padStart(2, '0')).join('');
  const keyBytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const epoch = Math.floor((Date.now() + clockOffset) / 1000);
  const time = Math.floor(epoch / 30);

  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmacArray = new Uint8Array(signature);

  const offset = hmacArray[hmacArray.length - 1] & 0xf;
  const binary =
    ((hmacArray[offset] & 0x7f) << 24) |
    ((hmacArray[offset + 1] & 0xff) << 16) |
    ((hmacArray[offset + 2] & 0xff) << 8) |
    (hmacArray[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

function normalizeTransactions(rawTxList, bankType, limit = 50) {
  if (!Array.isArray(rawTxList)) return [];
  const sliced = limit ? rawTxList.slice(0, limit) : rawTxList;
  return sliced.map(tx => {
    let date = tx.transactionDate || tx.valueDate || tx.trxDate || tx.bookingDate || tx.postDate || tx.date || '';
    if (date) {
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          date = d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        }
      } catch (e) {}
    }
    
    // Extract base description/remarks
    let details = 'Transaction';
    if (bankType === 'MIB') {
      let mibDescParts = [];
      if (tx.descr1) mibDescParts.push(tx.descr1.trim());
      if (tx.descr2) mibDescParts.push(tx.descr2.trim());
      if (tx.descr3) mibDescParts.push(tx.descr3.trim());
      if (mibDescParts.length > 0) {
        details = mibDescParts.join('\n');
      } else {
        details = tx.description || tx.remarks || tx.narrative || tx.particulars || 'Transaction';
      }
    } else {
      details = tx.description || tx.remarks || tx.narrative || tx.particulars || 'Transaction';
    }

    if (typeof details === 'string') {
      // Clean up multiple spaces/tabs within each line, preserving line breaks
      details = details.split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    }

    // Append other descriptive fields if they contain new information (for BML/MIB details support)
    const detailFields = [
      tx.descr1, tx.descr2, tx.descr3,
      tx.remarks, tx.remarks1, tx.remarks2, tx.remarks3,
      tx.narrative, tx.narrative1, tx.narrative2, tx.narration,
      tx.particulars,
      tx.senderName, tx.sender_name, tx.sender,
      tx.remitterName, tx.remitter_name, tx.remitter,
      tx.name, tx.partyName, tx.party_name, tx.party,
      tx.opponentName, tx.opponent_name, tx.opponent,
      tx.alias,
      tx.description2, tx.description3
    ];
    for (const field of detailFields) {
      if (field && typeof field === 'string') {
        const val = field.trim().replace(/[ \t]+/g, ' ');
        if (val && val !== tx.description?.trim() && !details.includes(val)) {
          details += `\n${val}`;
        }
      }
    }

    // Append Reference (Ref: ...) if present and not already in details
    const ref = tx.reference || tx.trxNumber2 || tx.refNo || tx.ref;
    const refTrimmed = ref ? String(ref).trim() : '';
    if (refTrimmed && !details.includes(refTrimmed)) {
      details += `\nRef: ${refTrimmed}`;
    }

    // Append Transaction ID (ID: ...) if present and not already in details
    // Prioritize user-facing readable IDs over internal API UUIDs (like tx.id)
    const txId = tx.journalNo || tx.journalNumber || tx.receiptNo || tx.referenceNo || tx.referenceNumber || tx.trxNumber || tx.trxId || tx.id || tx.transactionId || tx.uuid || tx.paymentId || tx.journal;
    const idTrimmed = txId ? String(txId).trim() : '';
    if (idTrimmed && idTrimmed !== refTrimmed && !details.includes(idTrimmed) && !idTrimmed.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
      // Exclude UUIDs from being shown as the transaction ID if possible
      details += `\nID: ${idTrimmed}`;
    } else if (idTrimmed && idTrimmed !== refTrimmed && !details.includes(idTrimmed)) {
      // Fallback to UUID only if no other user-facing ID was found
      details += `\nID: ${idTrimmed}`;
    }

    let amount = parseFloat(tx.amount || tx.baseAmount) || 0;
    let formattedAmount = '';
    if (bankType === 'MIB') {
      formattedAmount = `${amount >= 0 ? '+' : ''}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      const isCredit = tx.type === 'credit' || amount > 0;
      formattedAmount = `${isCredit ? '+' : '-'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    const runningBal = tx.runningBalance || tx.balance || tx.closingBalance || tx.endingBalance;
    let formattedRunningBal = '';
    if (runningBal !== undefined && runningBal !== null) {
      const balNum = parseFloat(runningBal);
      if (!isNaN(balNum)) {
        formattedRunningBal = balNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
    
    return { date, details, amount: formattedAmount, runningBalance: formattedRunningBal };
  });
}

// -------------------------------------------------------------
// The main BML background flow
// -------------------------------------------------------------
async function runBmlFlow(credentials, targetAccount, port, targetAmount, mode = 'search', sessionMode = 'fresh_login') {
  emitLog(port, `> [BML] Starting background auth flow (sessionMode: ${sessionMode})...`);
  let last3Txs = [];

  let xsrfToken = null;
  globalInertiaVersion = "";
  let bmlClockOffset = 0;

  async function getXsrfToken() {
    return new Promise((resolve) => {
      chrome.cookies.get({ url: "https://www.bankofmaldives.com.mv", name: "XSRF-TOKEN" }, (cookie) => {
        resolve(cookie ? decodeURIComponent(cookie.value) : null);
      });
    });
  }

  // --- TESTING ONLY LOGS: WILL BE REMOVED BEFORE DEPLOYMENT ---
  const currentOtp = await generateTOTP(credentials.totpSeed);
  emitLog(port, `> [TESTING] BML Username: ${maskString(credentials.username)}`);
  emitLog(port, `> [TESTING] BML Password: ${maskString(credentials.password)}`);
  emitLog(port, `> [TESTING] BML TOTP Seed: ${maskString(credentials.totpSeed)}`);
  emitLog(port, `> [TESTING] Target Account: ${targetAccount}`);
  emitLog(port, `> [TESTING] Target Amount: ${targetAmount}`);
  emitLog(port, `> [TESTING] LIVE OTP CODE: ${maskString(currentOtp)}`);
  // -------------------------------------------------------------

  // -- Helper: Follow Inertia 409 redirect chain (matching Python _handle_inertia_response) --
  async function handleInertiaRedirects(initialRes, currentVersion = '') {
    let currentRes = initialRes;
    let version = currentVersion || initialRes.headers.get('X-Inertia-Version') || '';
    
    while (currentRes.status === 409) {
      const redirectUrl = currentRes.headers.get('X-Inertia-Location');
      if (!redirectUrl) break;
      
      const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `${BASE_URL}${redirectUrl}`;
      emitLog(port, `> [BML] Following Inertia redirect to: ${fullUrl}`);
      
      let token = await getXsrfToken();
      // Load the page as a regular GET page load (no X-Inertia header) to bypass the version mismatch 409 Conflict
      const redirectHeaders = {
        'Accept': 'text/html, application/xhtml+xml',
        'X-XSRF-TOKEN': token,
        'User-Agent': USER_AGENT
      };
      
      currentRes = await loggedFetch(fullUrl, {
        headers: redirectHeaders
      });
      
      if (currentRes.status === 200) {
        // Parse the version from the HTML data-page attribute
        try {
          const html = await currentRes.clone().text();
          const match = html.match(/data-page="([^"]+)"/);
          if (match && match[1]) {
            const dataPage = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            if (dataPage.version) {
              version = dataPage.version;
              globalInertiaVersion = version;
              emitLog(port, `> [BML] Updated Inertia Version from redirect HTML: ${globalInertiaVersion}`);
            }
          }
        } catch (e) {
          emitLog(port, `> [BML] Could not parse version from redirect HTML: ${e.message}`);
        }
        break;
      }
    }
    return currentRes;
  }

  // -- Helper: Get fresh XSRF token and Inertia Version from a page --
  async function getFreshXsrfToken(path, isInitialLoad = false) {
    emitLog(port, `> [BML] Refreshing XSRF token from ${path}...`);
    
    const headers = {
      'Accept': 'text/html, application/xhtml+xml',
      'User-Agent': USER_AGENT
    };
    
    if (!isInitialLoad) {
      headers['X-Inertia'] = 'true';
      headers['X-Requested-With'] = 'XMLHttpRequest';
      if (globalInertiaVersion) {
        headers['X-Inertia-Version'] = globalInertiaVersion;
      }
    }

    let res = await loggedFetch(`${BASE_URL}${path}`, {
      cache: 'no-store',
      headers: headers
    });

    if (res.status === 409) {
      emitLog(port, `> [BML] Token refresh returned 409. Following redirects...`);
      res = await handleInertiaRedirects(res, globalInertiaVersion);
    }
    
    let version = res.headers.get('X-Inertia-Version') || '';
    if (!version && !isInitialLoad) {
      try {
        const data = await res.clone().json();
        if (data && data.version) {
          version = data.version;
        }
      } catch (e) {
        emitLog(port, `> [BML] Could not parse Inertia version from body: ${e.message}`);
      }
    } else if (isInitialLoad) {
      // On initial HTML load, extract version from the data-page attribute
      try {
        const html = await res.clone().text();
        const match = html.match(/data-page="([^"]+)"/);
        if (match && match[1]) {
          const dataPage = JSON.parse(match[1].replace(/&quot;/g, '"'));
          if (dataPage.version) version = dataPage.version;
        }
      } catch (e) {
        emitLog(port, `> [BML] Could not parse Inertia version from HTML: ${e.message}`);
      }
    }

    // Wait 10ms to ensure Chrome's cookie store reflects any Set-Cookie headers
    await new Promise(r => setTimeout(r, 10));
    const token = await getXsrfToken();
    
    // Calculate BML server clock offset dynamically from the response Date header
    const serverDateHeader = res.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const clientTime = Date.now();
      bmlClockOffset = serverTime - clientTime;
    }

    xsrfToken = token;
    if (version) {
      globalInertiaVersion = version;
    }
    return token;
  }

  try {
    if (sessionMode === 'fresh_login' || sessionMode === 'claim_and_login') {
    // ═══════════════════════════════════════════════════════════════
    // STEP 0: Clear Previous Session State
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 0: Clearing previous session cookies...`);
    const cookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
    for (const cookie of cookies) {
      const protocol = cookie.secure ? "https://" : "http://";
      const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
      await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Initialize Session
    // ═══════════════════════════════════════════════════════════════
    await getFreshXsrfToken('/web/login', true);

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Submit Username/Password
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 2: Submitting Primary Credentials...`);
    const headers = {
      'Accept': 'text/html, application/xhtml+xml',
      'Content-Type': 'application/json',
      'X-Inertia': 'true',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrfToken,
      'Referer': `${BASE_URL}/web/login`,
      'User-Agent': USER_AGENT
    };
    if (globalInertiaVersion) {
      headers['X-Inertia-Version'] = globalInertiaVersion;
    }

    const loginRes = await loggedFetch(`${BASE_URL}/web/login`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        code: ""
      })
    });

    let finalLoginRes = loginRes;
    if (loginRes.status === 409) {
      emitLog(port, `> [BML] Login returned 409. Following Inertia redirects...`);
      finalLoginRes = await handleInertiaRedirects(loginRes, globalInertiaVersion);
    }

    if (finalLoginRes.status === 200) {
      const loginBody = await finalLoginRes.clone().text();
      let is2faPage = false;
      let parsed = null;
      try {
        parsed = JSON.parse(loginBody);
        if (parsed.component === 'Auth/2FA') {
          is2faPage = true;
          if (parsed.version) {
            globalInertiaVersion = parsed.version;
          }
        }
      } catch (err) {
        emitLog(port, `> [BML] WARNING: Login response not valid JSON: ${err.message}`);
      }

      if (is2faPage) {
        emitLog(port, `> [BML] Login credentials accepted. Transitioning to 2FA stage...`);
        // Wait 10ms and refresh XSRF token from cookies (which might have changed on successful login)
        await new Promise(r => setTimeout(r, 10));
        xsrfToken = await getXsrfToken();
      } else {
        await saveScrap('login_failed_200', loginBody);
        let errorMsg = "Login failed: Invalid credentials or server rejected login. HTTP 200 re-render.";
        if (parsed && parsed.props && parsed.props.errors) {
          const errs = JSON.stringify(parsed.props.errors);
          errorMsg = `Login failed: ${errs}`;
        }
        emitLog(port, `> [BML] WARNING: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } else if (!finalLoginRes.ok) {
      const loginBody = await finalLoginRes.clone().text();
      await saveScrap(`login_failed_${finalLoginRes.status}`, loginBody);
      throw new Error(`HTTP ${finalLoginRes.status} on login POST.`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Verify OTP
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 3: Loading 2FA Stage...`);
    
    // Load the 2FA page as an Inertia request to initialize/sync state
    const mfaHeaders = {
      'Accept': 'text/html, application/xhtml+xml',
      'X-Inertia': 'true',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrfToken,
      'Referer': `${BASE_URL}/web/login`,
      'User-Agent': USER_AGENT
    };
    if (globalInertiaVersion) {
      mfaHeaders['X-Inertia-Version'] = globalInertiaVersion;
    }

    let mfaPageRes = await loggedFetch(`${BASE_URL}/web/login/2fa`, {
      headers: mfaHeaders
    });

    if (mfaPageRes.status === 409) {
      emitLog(port, `> [BML] 2FA page returned 409. Following redirects...`);
      mfaPageRes = await handleInertiaRedirects(mfaPageRes, globalInertiaVersion);
    }

    if (mfaPageRes.status === 200) {
      const mfaPageBody = await mfaPageRes.clone().text();
      try {
        const parsed = JSON.parse(mfaPageBody);
        if (parsed.version) {
          globalInertiaVersion = parsed.version;
        }
      } catch (err) {
        emitLog(port, `> [BML] WARNING: 2FA page response not valid JSON: ${err.message}`);
      }
    }

    await new Promise(r => setTimeout(r, 10));
    xsrfToken = await getXsrfToken();

    // Boundary Safety Delay: check if current epoch has less than 4 seconds remaining
    const msInWindow = (Date.now() + bmlClockOffset) % 30000;
    const msRemaining = 30000 - msInWindow;
    if (msRemaining < 4000) {
      emitLog(port, `> [BML] OTP window boundary safety: only ${Math.round(msRemaining / 100) / 10}s remaining in epoch. Waiting for next window...`);
      await new Promise(resolve => setTimeout(resolve, msRemaining + 500));
    }

    // Step 3B: Submit OTP with Authenticator channel selection in a single request
    emitLog(port, `> [BML] Step 3B: Submitting TOTP code...`);
    const otpCode = await generateTOTP(credentials.totpSeed, bmlClockOffset);
    emitLog(port, `> [TESTING] Submitting OTP: ${maskString(otpCode)}`);

    const verifyHeaders = {
      'Accept': 'text/html, application/xhtml+xml',
      'Content-Type': 'application/json',
      'X-Inertia': 'true',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrfToken,
      'Referer': `${BASE_URL}/web/login/2fa`,
      'User-Agent': USER_AGENT
    };
    if (globalInertiaVersion) {
      verifyHeaders['X-Inertia-Version'] = globalInertiaVersion;
    }

    let mfaRes = await loggedFetch(`${BASE_URL}/web/login/2fa`, {
      method: 'POST',
      headers: verifyHeaders,
      body: JSON.stringify({
        code: otpCode,
        channel: 'authenticator'
      })
    });

    if (mfaRes.status === 409) {
      emitLog(port, `> [BML] MFA response returned 409. Following redirects...`);
      mfaRes = await handleInertiaRedirects(mfaRes, globalInertiaVersion);
    }

    if (mfaRes.status === 200) {
      const mfaBody = await mfaRes.clone().text();
      let is2faPage = false;
      let parsed = null;
      try {
        parsed = JSON.parse(mfaBody);
        if (parsed.component === 'Auth/2FA') {
          is2faPage = true;
        }
      } catch (err) {
        emitLog(port, `> [BML] WARNING: MFA response not valid JSON: ${err.message}`);
      }

      if (is2faPage) {
        await saveScrap('mfa_failed_200', mfaBody);
        let errorMsg = "MFA failed: Server re-rendered 2FA form.";
        if (parsed && parsed.props && parsed.props.errors) {
          const errs = JSON.stringify(parsed.props.errors);
          errorMsg = `MFA failed: ${errs}`;
        }
        emitLog(port, `> [BML] WARNING: ${errorMsg}`);
        throw new Error(errorMsg);
      } else {
        emitLog(port, `> [BML] MFA OTP accepted.`);
        if (parsed && parsed.version) {
          globalInertiaVersion = parsed.version;
        }
      }
    } else if (mfaRes.status === 302 || mfaRes.status === 303) {
      // If it returns a standard HTTP redirect (e.g. to /web/profile), follow it
      const redirectUrl = mfaRes.headers.get('Location');
      emitLog(port, `> [BML] MFA OTP accepted (HTTP ${mfaRes.status}). Redirecting to ${redirectUrl}...`);
      // Update our token and continue
      await new Promise(r => setTimeout(r, 10));
      xsrfToken = await getXsrfToken();
    } else if (!mfaRes.ok) {
      const mfaBody = await mfaRes.clone().text();
      await saveScrap(`mfa_failed_${mfaRes.status}`, mfaBody);
      throw new Error(`MFA failed with HTTP ${mfaRes.status}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Fetch and Select Profile
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 4: Fetching Profiles...`);
    await getFreshXsrfToken('/web/profile');

    let profileRes = await loggedFetch(`${BASE_URL}/web/profile`, {
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/web/login/2fa`,
        'User-Agent': USER_AGENT
      }
    });

    if (profileRes.status === 409) {
      emitLog(port, `> [BML] Profile page returned 409. Following redirects...`);
      profileRes = await handleInertiaRedirects(profileRes);
    }

    const responseText = await profileRes.clone().text();
    let profiles = [];

    // Extract profiles helper function to check multiple locations
    function extractProfilesFromObject(obj) {
      if (!obj) return null;
      // Possible locations for profiles list
      const candidates = [
        obj.props?.user_profiles,
        obj.props?.profiles,
        obj.props?.profile,
        obj.payload?.user_profiles,
        obj.payload?.profiles,
        obj.payload?.profile,
        obj.user_profiles,
        obj.profiles,
        obj.profile
      ];
      for (const cand of candidates) {
        if (cand && Array.isArray(cand) && cand.length > 0) return cand;
        if (cand && typeof cand === 'object' && !Array.isArray(cand)) return [cand];
      }
      return null;
    }

    try {
      const profileData = JSON.parse(responseText);
      profiles = extractProfilesFromObject(profileData) || [];
    } catch (err) {
      const dataPageMatch = /data-page=(['"])(.*?)\1/.exec(responseText);
      if (dataPageMatch) {
        try {
          const decoded = dataPageMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const pageData = JSON.parse(decoded);
          profiles = extractProfilesFromObject(pageData) || [];
        } catch (e) { }
      }
    }

    if (profiles.length === 0) {
      const patterns = [
        /\/internetbanking\/web\/profile\/([a-fA-F0-9\-]{36})/gi,
        /"profileId":\s*"([a-fA-F0-9\-]{36})"/gi,
        /data-profile-id="([a-fA-F0-9\-]{36})"/gi,
        /"profile":\s*"([a-fA-F0-9\-]{36})"/gi,
        /"guid":\s*"([a-fA-F0-9\-]{36})"/gi
      ];
      const uniqueIds = new Set();
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(responseText)) !== null) { uniqueIds.add(match[1]); }
      }
      profiles = Array.from(uniqueIds).map(id => ({ id, name: id }));
    }

    let selectedProfileId = null;
    if (profiles.length > 0) {
      const selectedProfile = profiles[0];
      const profStr = typeof selectedProfile === 'string' ? selectedProfile : JSON.stringify(selectedProfile);
      const uuidMatch = profStr.match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/);
      if (uuidMatch) {
        selectedProfileId = uuidMatch[0];
      }
    }

    if (!selectedProfileId) {
      emitLog(port, `> [BML] Profiles not found in /web/profile. Fetching from /api/profile...`);
      try {
        const apiProfileRes = await loggedFetch(`${BASE_URL}/api/profile`, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': 'Bearer',
            'X-XSRF-TOKEN': xsrfToken,
            'Referer': `${BASE_URL}/web/profile`,
            'User-Agent': USER_AGENT
          }
        });
        if (apiProfileRes.ok) {
          const apiProfileData = await apiProfileRes.json();
          // Extract from api response
          const profileList = apiProfileData.payload?.profile || apiProfileData.profile || [];
          if (Array.isArray(profileList) && profileList.length > 0) {
            const firstProf = profileList[0];
            selectedProfileId = firstProf.profile || firstProf.guid || firstProf.id || firstProf.profileId;
          }
          if (!selectedProfileId && apiProfileData.payload?.userInfo?.profile) {
            const up = apiProfileData.payload.userInfo.profile;
            selectedProfileId = up.guid || up.profile || up.id || up.profileId;
          }
          if (!selectedProfileId && apiProfileData.payload?.userInfo?.user_profiles) {
            const upList = apiProfileData.payload.userInfo.user_profiles;
            if (Array.isArray(upList) && upList.length > 0) {
              selectedProfileId = upList[0].profile || upList[0].guid || upList[0].id || upList[0].profileId;
            }
          }
          emitLog(port, `> [BML] Found profile ID from API fallback: ${selectedProfileId}`);
        }
      } catch (err) {
        emitLog(port, `> [BML] API profile fallback failed: ${err.message}`);
      }
    }

    if (selectedProfileId) {
      emitLog(port, `> [BML] Selected Profile: ${selectedProfileId}`);
      await getFreshXsrfToken('/web/profile');

      let selectProfileRes = await loggedFetch(`${BASE_URL}/web/profile/${selectedProfileId}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/html, application/xhtml+xml',
          'X-Inertia': 'true',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': xsrfToken,
          'Referer': `${BASE_URL}/web/profile`,
          'User-Agent': USER_AGENT
        }
      });

      if (selectProfileRes.status === 409) {
        emitLog(port, `> [BML] Profile selection returned 409. Following redirects...`);
        await handleInertiaRedirects(selectProfileRes);
      } else if (!selectProfileRes.ok) {
        throw new Error(`Profile selection failed: HTTP ${selectProfileRes.status}`);
      }
    } else {
      emitLog(port, `> [BML] No profiles found. Proceeding with single-profile assumption...`);
    }

    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Navigate to accounts overview  
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 5: Loading Accounts Overview...`);
    await getFreshXsrfToken('/vf/accounts/overview');

    const accountsOverviewRes = await loggedFetch(`${BASE_URL}/vf/accounts/overview`, {
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/web/redirect`,
        'User-Agent': USER_AGENT
      }
    });

    if (accountsOverviewRes.status === 409) {
      emitLog(port, `> [BML] Accounts overview returned 409. Following redirects...`);
      await handleInertiaRedirects(accountsOverviewRes);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Fetch Dashboard
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 6: Loading Dashboard...`);
    xsrfToken = await getXsrfToken() || xsrfToken;
    const dashboardRes = await loggedFetch(`${BASE_URL}/api/dashboard`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/vf/accounts/overview`,
        'User-Agent': USER_AGENT
      }
    });

    const dashText = await dashboardRes.text();
    if (!dashboardRes.ok) {
      throw new Error(`Dashboard retrieval failed: HTTP ${dashboardRes.status}`);
    }

    let dashboardData;
    try {
      dashboardData = JSON.parse(dashText);
    } catch (e) {
      throw new Error(`Failed to parse Dashboard JSON.`);
    }

    const accounts = dashboardData.payload?.dashboard || dashboardData.accounts || [];
    
    // If fetch_only mode returned 0 accounts, the session has expired — fall back to fresh login
    if (sessionMode === 'fetch_only' && accounts.length === 0) {
      emitLog(port, `> [BML] ⚠ Session appears expired (0 accounts in fetch_only mode). Falling back to fresh_login...`);
      return await runBmlFlow(credentials, targetAccount, port, targetAmount, mode, 'fresh_login');
    }

    let bmlAccountId = null;
    let balance = "Not found";

    for (const group of accounts) {
      const accList = group.accounts || [group]; // handle both nested and flat structures
      for (const acc of accList) {
        const accNo = String(acc.account || acc.account_number || acc.id || '').replace(/\s+/g, '');
        const targetNo = String(targetAccount || '').replace(/\s+/g, '');
        if (accNo === targetNo || accNo.includes(targetNo) || targetNo.includes(accNo)) {
          bmlAccountId = acc.id || acc.account;
          balance = acc.available_balance || acc.availableBalance || acc.working_balance || acc.balance || acc.current_balance || "Found";
          break;
        }
      }
      if (bmlAccountId) break;
    }

    if (!bmlAccountId) {
      bmlAccountId = targetAccount;
    }

    emitLog(port, `> [BML] 💰 Balance for ${targetAccount}: ${balance} MVR`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: Scrape History for the amount
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 7: Scraping recent transaction history...`);
    // Fetch today's transactions
    const historyUrl = `${BASE_URL}/api/account/${bmlAccountId}/history/today`;
    const histRes = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/vf/accounts/${bmlAccountId}`,
        'User-Agent': USER_AGENT
      }
    });

    // Fetch pending transactions
    const pendingUrl = `${BASE_URL}/api/history/pending/${bmlAccountId}`;
    const pendingRes = await fetch(pendingUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/vf/accounts/${bmlAccountId}`,
        'User-Agent': USER_AGENT
      }
    });

    if (!histRes.ok && !pendingRes.ok) {
      const errText = await histRes.clone().text().catch(() => "");
      emitLog(port, `> [BML] History & Pending fetch failed: HTTP ${histRes.status} / ${pendingRes.status} - ${errText.substring(0, 200)}`);
      throw new Error(`Failed to fetch BML account history: HTTP ${histRes.status}`);
    }

    let history = [];
    if (histRes.ok) {
      const histData = await histRes.json();
      emitLog(port, `> [BML] Raw history response: ${JSON.stringify(histData)}`);
      history = histData.transactions || histData.payload?.history || [];
    }

    let pendingTxs = [];
    if (pendingRes.ok) {
      const pendingData = await pendingRes.json();
      emitLog(port, `> [BML] Raw pending response: ${JSON.stringify(pendingData)}`);
      pendingTxs = pendingData.transactions || pendingData.payload?.history || pendingData.payload?.pending || pendingData.payload?.transactions || [];
    }

    const mergedHistory = [...pendingTxs, ...history];
    if (mergedHistory.length > 0) {
      emitLog(port, `> [BML] Diagnostic - First transaction keys: ${Object.keys(mergedHistory[0]).join(', ')}`);
      emitLog(port, `> [BML] Diagnostic - First transaction raw: ${JSON.stringify(mergedHistory[0])}`);
    }
    const targetAmtNum = parseFloat(targetAmount) || 0;

    let matchFound = null;
    if (mode === 'search') {
      const matchingTxs = mergedHistory.filter(tx => {
        const isCredit = tx.type === 'credit' || !tx.minus || parseFloat(tx.amount) > 0;
        return targetAmtNum > 0 && Math.abs(parseFloat(tx.amount) - targetAmtNum) < 0.01 && isCredit;
      });
      last3Txs = normalizeTransactions(matchingTxs, 'BML', 3);
      if (matchingTxs.length > 0) {
        matchFound = matchingTxs[0];
      }
    } else if (mode === 'ledger') {
      last3Txs = normalizeTransactions(mergedHistory, 'BML', 50);
    } else {
      // mode === 'history'
      last3Txs = normalizeTransactions(mergedHistory, 'BML', 3);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: Cleanup and Report
    // ═══════════════════════════════════════════════════════════════
    if (!heldSession && sessionMode !== 'claim_and_login') {
      try {
        await loggedFetch(`${BASE_URL}/web/2fa/logout`, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'X-XSRF-TOKEN': xsrfToken,
            'Referer': `${BASE_URL}/vf/accounts/overview`,
            'User-Agent': USER_AGENT
          }
        });
        emitLog(port, `> [BML] Session destroyed.`);
      } catch (e) {
        emitLog(port, `> [BML] Session destruction failed or skipped: ${e.message}`);
      }
    } else {
      emitLog(port, `> [BML] Session holder mode active: keeping BML session alive.`);
    }

    if (mode === 'history' || mode === 'ledger') {
      emitLog(port, `> [Viri Bridge] BML ${mode.toUpperCase()} FETCH SUCCESS.`);
      port.postMessage({
        type: 'success',
        data: null,
        balance: balance,
        transactions: last3Txs
      });
    } else {
      if (matchFound) {
        emitLog(port, `> [Viri Bridge] EXACT MATCH: Ref ${matchFound.reference || matchFound.id}`);
        port.postMessage({
          type: 'success',
          data: {
            status: 'CREDITED',
            reference: matchFound.reference || matchFound.id || "BML-MATCH",
            amount: Math.abs(matchFound.amount).toFixed(2),
            timestamp: matchFound.date || matchFound.bookingDate || new Date().toISOString()
          },
          balance: balance,
          transactions: last3Txs
        });
      } else {
        throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR.`);
      }
    }

  } catch (error) {
    emitLog(port, `> [BML] FATAL ERROR: ${error.message}`);
    port.postMessage({ type: "error", error: error.message, transactions: last3Txs || [] });
  }
}

// ─── CORS Header Rules ─────────────────────────────────────────────────────────
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2, 3],
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Origin", operation: "remove" },
          { header: "Referer", operation: "remove" }
        ],
        responseHeaders: [
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" }
        ]
      },
      condition: {
        urlFilter: "*bankofmaldives*",
        resourceTypes: ["xmlhttprequest"]
      }
    },
    {
      id: 3,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Origin", operation: "set", value: "https://faisanet.mib.com.mv" }
        ],
        responseHeaders: [
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" }
        ]
      },
      condition: {
        urlFilter: "*faisanet.mib.com.mv*",
        resourceTypes: ["xmlhttprequest"]
      }
    }
  ]
});

// =============================================================================
// MIB FAISANET ROBOT FLOW
// =============================================================================

/**
 * Extract rTag CSRF token from MIB HTML page
 */
function extractRTag(html) {
  // Try multiple patterns for rTag extraction
  const patterns = [
    /rTag\s*=\s*["']([^"']+)["']/,
    /name=["']rTag["']\s+value=["']([^"']+)["']/,
    /value=["']([^"']+)["']\s+name=["']rTag["']/,
    /"rTag"\s*:\s*["']([^"']+)["']/,
    /data-rt=["']([^"']+)["']/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  throw new Error('Failed to extract rTag from MIB page');
}

/**
 * SHA-256 hash a password using Web Crypto API (available in service workers)
 */
async function hashPasswordSHA256(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Generate a random client salt of specified length
 */
function generateClientSalt(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}

/**
 * Parse profiles from MIB profiles HTML page
 */
function parseProfilesFromHtml(html) {
  const profiles = [];
  
  // 1. Parse profile cards from elements with class="profile-card"
  const cardPattern = /<[^>]+class="[^"]*profile-card[^"]*"[^>]*>/gi;
  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const cardHtml = match[0];
    const rtMatch = /data-rt=["']([^"']+)["']/i.exec(cardHtml);
    const typeMatch = /data-profiletype\s*=\s*["']([^"']+)["']/i.exec(cardHtml);
    const idMatch = /data-profileid=["']([^"']+)["']/i.exec(cardHtml);
    
    if (idMatch) {
      profiles.push({
        id: idMatch[1],
        type: typeMatch ? typeMatch[1] : '0',
        rTag: rtMatch ? rtMatch[1] : null
      });
    }
  }
  
  // 2. Fallback for other structures
  if (profiles.length === 0) {
    const patterns = [
      /profileId["']?\s*[:=]\s*["']?(\d+)["']?/gi,
      /switchProfile\s*\(\s*["']?(\d+)["']?/gi,
      /data-profile-id=["'](\d+)["']/gi,
      /data-profileid=["'](\d+)["']/gi,
      /name=["']profileId["']\s+value=["'](\d+)["']/gi
    ];
    const uniqueIds = new Set();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        uniqueIds.add(match[1]);
      }
    }
    for (const id of uniqueIds) {
      profiles.push({ id, type: 'unknown', rTag: null });
    }
  }
  
  return profiles;
}

/**
 * Parse account numbers from MIB accounts HTML page
 */
function parseAccountsFromHtml(html) {
  const accounts = [];
  // Look for account numbers (long numeric strings typical of MIB)
  const patterns = [
    /accountNo["']?\s*[:=]\s*["']?(\d{10,20})["']?/gi,
    /data-account-no=["'](\d{10,20})["']/gi,
    /account_number["']?\s*[:=]\s*["']?(\d{10,20})["']?/gi,
    /accountDetails\?accountNo=(\d{10,20})/gi
  ];
  const uniqueNos = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      uniqueNos.add(match[1]);
    }
  }
  for (const no of uniqueNos) {
    accounts.push({ accountNo: no });
  }
  return accounts;
}

/**
 * MIB-specific logged fetch with form-urlencoded support
 */
async function mibFetch(url, options = {}, port) {
  const method = options.method || 'GET';
  let bodyLog = '';
  if (options.body && typeof options.body === 'string') {
    let sanitizedBody = options.body;
    try {
      const urlParams = new URLSearchParams(options.body);
      if (urlParams.has('pgf01')) {
        urlParams.set('pgf01', maskString(urlParams.get('pgf01')));
      }
      if (urlParams.has('pgf02')) {
        urlParams.set('pgf02', maskString(urlParams.get('pgf02')));
      }
      if (urlParams.has('otp')) {
        urlParams.set('otp', maskString(urlParams.get('otp')));
      }
      sanitizedBody = urlParams.toString();
    } catch (e) {
      sanitizedBody = options.body.replace(/(pgf02|otp)=([^&]*)/gi, '$1=[REDACTED]');
    }
    bodyLog = `\n    Body: ${sanitizedBody}`;
  }
  emitLog(port, `> [MIB] Request: ${method} ${url}${bodyLog}`);

  options.credentials = 'include';

  try {
    const res = await fetch(url, options);
    emitLog(port, `> [MIB] Response: HTTP ${res.status} from ${url}`);
    return res;
  } catch (error) {
    emitLog(port, `> [MIB] Fetch failed: ${error.message} for ${url}`);
    throw error;
  }
}

/**
 * Build form-urlencoded body string from an object
 */
function buildFormBody(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * The main MIB Faisanet background flow
 * @param {Object} credentials - {username, password, totpSeed}
 * @param {string} targetAccount - Account number to check
 * @param {Object} port - Chrome extension port for communication
 * @param {string} targetAmount - Amount to verify
 * @param {string} profileType - '0' for Personal, '1' for Business
 */
async function runMibFlow(credentials, targetAccount, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login') {
  emitLog(port, `> [MIB] Starting MIB Faisanet auth flow (sessionMode: ${sessionMode})...`);
  let last3Txs = [];

  const mibHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': USER_AGENT
  };

  // MIB uses HTTP 203 for "success with redirect" (observed in HAR)
  function isMibSuccess(status) { return status === 200 || status === 203; }

  let rTag = null;
  let mibClockOffset = 0;

  try {
    if (sessionMode === 'fresh_login' || sessionMode === 'claim_and_login') {
    // ═══════════════════════════════════════════════════════════════
    // STEP 0: Clear Previous MIB Session Cookies
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 0: Clearing previous MIB session cookies...`);
    const mibCookies = await chrome.cookies.getAll({ domain: "mib.com.mv" });
    for (const cookie of mibCookies) {
      const protocol = cookie.secure ? "https://" : "http://";
      const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
      await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
    }
    emitLog(port, `> [MIB] Cleared ${mibCookies.length} MIB cookies.`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Initialize Session — GET /auth
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 1: Initializing session...`);
    const authPageRes = await mibFetch(`${MIB_BASE_URL}/auth`, {
      headers: { 'User-Agent': USER_AGENT }
    }, port);

    if (!authPageRes.ok) {
      throw new Error(`MIB auth page load failed: HTTP ${authPageRes.status}`);
    }

    // Calculate MIB server clock offset dynamically from the response Date header
    mibClockOffset = 0;
    const serverDateHeader = authPageRes.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const clientTime = Date.now();
      mibClockOffset = serverTime - clientTime;
      emitLog(port, `> [MIB] Calculated MIB server clock offset: ${mibClockOffset}ms (${Math.round(mibClockOffset / 1000)}s)`);
    }

    const authPageHtml = await authPageRes.text();
    rTag = extractRTag(authPageHtml);
    emitLog(port, `> [MIB] ✓ Session initialized. rTag: ${rTag.substring(0, 8)}...`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Get Auth Type — POST /aAuth/getAuthType
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 2: Checking auth type for user...`);
    const authTypeRes = await mibFetch(`${MIB_BASE_URL}/aAuth/getAuthType`, {
      method: 'POST',
      headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/auth` },
      body: buildFormBody({ rTag, pgf01: credentials.username, retain: '1' })
    }, port);

    if (!authTypeRes.ok) {
      const errText = await authTypeRes.text().catch(() => "");
      emitLog(port, `> [MIB] getAuthType error body: ${errText}`);
      throw new Error(`MIB getAuthType failed: HTTP ${authTypeRes.status}. Details: ${errText.substring(0, 200)}`);
    }

    let authTypeData;
    try {
      authTypeData = await authTypeRes.json();
    } catch (e) {
      // Some responses may not be JSON, try to read as text
      const text = await authTypeRes.clone().text();
      emitLog(port, `> [MIB] Auth type response (non-JSON): ${text.substring(0, 200)}`);
      // Continue anyway — older versions may not return JSON here
      authTypeData = { status: 'success' };
    }

    if (authTypeData.status === 'error') {
      throw new Error(`MIB auth type error: ${authTypeData.message || 'Unknown error'}`);
    }
    emitLog(port, `> [MIB] ✓ Auth type confirmed: ${JSON.stringify(authTypeData)}`);

    const loginTypeParams = authTypeData?.data?.[0] || {};
    const loginType = loginTypeParams.loginType;
    const userSalt = loginTypeParams.userSalt;

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Primary Auth — POST /aAuth (Simple) or /aAuth/xAuth (Salted)
    // ═══════════════════════════════════════════════════════════════
    let xAuthRes;
    if (loginType === 0) {
      emitLog(port, `> [MIB] Step 3: Submitting primary credentials (simple auth)...`);
      xAuthRes = await mibFetch(`${MIB_BASE_URL}/aAuth`, {
        method: 'POST',
        headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/auth` },
        body: buildFormBody({
          rTag,
          pgf01: credentials.username,
          pgf02: credentials.password,
          retain: '1'
        })
      }, port);
    } else {
      emitLog(port, `> [MIB] Step 3: Submitting primary credentials (salted auth)...`);
      emitLog(port, `> [MIB] Plain credentials validation: username="${maskString(credentials.username)}", password="${maskString(credentials.password)}"`);
      const clientSalt = generateClientSalt(32);
      
      // Hashing formula:
      // h1 = sha256(password)
      // h2 = sha256(h1 + userSalt)
      // pgf03 = sha256(clientSalt + h2)
      const passHash = await hashPasswordSHA256(credentials.password);
      const saltedHash = await hashPasswordSHA256(passHash + (userSalt || ""));
      const clientSaltedHash = await hashPasswordSHA256(clientSalt + saltedHash);
      
      emitLog(port, `> [MIB] Computed Client Salt: "${clientSalt}"`);
      emitLog(port, `> [MIB] Computed SHA-256 Pass Hash: "${passHash}"`);
      emitLog(port, `> [MIB] Computed Salted Hash: "${saltedHash}"`);
      emitLog(port, `> [MIB] Computed pgf03 Hash: "${clientSaltedHash}"`);

      xAuthRes = await mibFetch(`${MIB_BASE_URL}/aAuth/xAuth`, {
        method: 'POST',
        headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/auth` },
        body: buildFormBody({
          rTag,
          pgf01: credentials.username,
          retain: '1',
          pgf03: clientSaltedHash,
          clientSalt: clientSalt
        })
      }, port);
    }

    if (!xAuthRes.ok) {
      const errText = await xAuthRes.text().catch(() => "");
      emitLog(port, `> [MIB] xAuth failed: HTTP ${xAuthRes.status}. Details: ${errText}`);
      throw new Error(`MIB xAuth failed: HTTP ${xAuthRes.status}. Details: ${errText.substring(0, 200)}`);
    }

    let xAuthData;
    try {
      xAuthData = await xAuthRes.json();
    } catch (e) {
      const text = await xAuthRes.clone().text();
      emitLog(port, `> [MIB] xAuth response (non-JSON): ${text.substring(0, 200)}`);
      // HAR: after xAuth, browser goes to /dashboard (not /auth2FA as old doc said)
      if (text.includes('dashboard') || text.includes('2FA') || text.includes('redirect') || text.includes('success')) {
        xAuthData = { status: 'success', redirect: '/dashboard' };
      } else {
        throw new Error(`MIB xAuth response not parseable: ${text.substring(0, 100)}`);
      }
    }

    if (xAuthData && (xAuthData.success === false || xAuthData.status === 'error')) {
      throw new Error(`MIB authentication failed: ${xAuthData.reasonText || xAuthData.message || 'Invalid credentials'}`);
    }
    emitLog(port, `> [MIB] ✓ Primary authentication successful.`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Load Dashboard — GET /dashboard
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 4: Loading dashboard...`);
    const dashboardPageRes = await mibFetch(`${MIB_BASE_URL}/dashboard`, {
      headers: {
        'Referer': `${MIB_BASE_URL}/auth`,
        'User-Agent': USER_AGENT
      }
    }, port);

    if (!dashboardPageRes.ok) {
      throw new Error(`MIB dashboard page load failed: HTTP ${dashboardPageRes.status}`);
    }

    const dashHtml = await dashboardPageRes.text();
    try { rTag = extractRTag(dashHtml); } catch (e) {
      emitLog(port, `> [MIB] Could not extract rTag from dashboard — keeping previous.`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4.5: Load 2FA Page — GET /auth2FA
    // HAR: The browser is redirected or navigates to /auth2FA.
    // We must load /auth2FA to initialize the 2FA state on the server and get the correct rTag.
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 4.5: Loading 2FA page...`);
    const auth2faRes = await mibFetch(`${MIB_BASE_URL}/auth2FA`, {
      headers: {
        'Referer': `${MIB_BASE_URL}/dashboard`,
        'User-Agent': USER_AGENT
      }
    }, port);

    if (!auth2faRes.ok) {
      throw new Error(`MIB 2FA page load failed: HTTP ${auth2faRes.status}`);
    }

    const auth2faHtml = await auth2faRes.text();
    try { rTag = extractRTag(auth2faHtml); } catch (e) {
      emitLog(port, `> [MIB] Could not extract rTag from auth2FA — keeping previous.`);
    }
    emitLog(port, `> [MIB] ✓ 2FA page loaded. rTag: ${rTag ? rTag.substring(0, 8) + '...' : 'none'}`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Verify OTP — POST /aAuth2FA/verifyOTP
    // HAR: Returns HTTP 203 (success with redirect). Referer: /auth2FA
    // ═══════════════════════════════════════════════════════════════
    // Boundary Safety Delay: check if current epoch has less than 4 seconds remaining
    const msInWindow = (Date.now() + mibClockOffset) % 30000;
    const msRemaining = 30000 - msInWindow;
    if (msRemaining < 4000) {
      emitLog(port, `> [MIB] OTP window boundary safety: only ${Math.round(msRemaining / 100) / 10}s remaining in epoch. Waiting for next window...`);
      await new Promise(resolve => setTimeout(resolve, msRemaining + 500));
    }

    emitLog(port, `> [MIB] Step 5: Generating and submitting TOTP...`);
    emitLog(port, `> [MIB] TOTP generation using Seed: "${maskString(credentials.totpSeed)}"`);
    const otpCode = await generateTOTP(credentials.totpSeed, mibClockOffset);
    emitLog(port, `> [MIB] Generated OTP Code: "${maskString(otpCode)}"`);

    const otpRes = await mibFetch(`${MIB_BASE_URL}/aAuth2FA/verifyOTP`, {
      method: 'POST',
      headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/auth2FA` },
      body: buildFormBody({ otpType: '3', otp: otpCode })
    }, port);

    // HAR shows HTTP 203 = success with redirect to /profiles
    if (!isMibSuccess(otpRes.status)) {
      throw new Error(`MIB OTP verification request failed: HTTP ${otpRes.status}`);
    }

    let otpData;
    try {
      otpData = await otpRes.json();
    } catch (e) {
      // HTTP 203 may have empty body — treat as success
      if (otpRes.status === 203) {
        otpData = { status: 'success', redirect: '/profiles' };
      } else {
        const text = await otpRes.clone().text();
        if (text.includes('/profiles') || text.includes('success')) {
          otpData = { status: 'success', redirect: '/profiles' };
        } else {
          throw new Error(`MIB OTP response not parseable (HTTP ${otpRes.status}): ${text.substring(0, 100)}`);
        }
      }
    }

    if (otpData.status === 'error') {
      throw new Error(`MIB OTP verification failed: ${otpData.message || 'Invalid OTP'}`);
    }
    emitLog(port, `> [MIB] ✓ OTP verified successfully (HTTP ${otpRes.status}).`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Load Profiles — GET /profiles
    // HAR: Referer: /auth2FA
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 6: Loading profiles page...`);
    const profilesRes = await mibFetch(`${MIB_BASE_URL}/profiles`, {
      headers: {
        'Referer': `${MIB_BASE_URL}/auth2FA`,
        'User-Agent': USER_AGENT
      }
    }, port);

    if (!profilesRes.ok) {
      throw new Error(`MIB profiles page load failed: HTTP ${profilesRes.status}`);
    }

    const profilesHtml = await profilesRes.text();
    await saveScrap('profiles_page', profilesHtml);
    try {
      rTag = extractRTag(profilesHtml);
    } catch (e) {
      emitLog(port, `> [MIB] DEBUG: profilesHtml content snippet: ${profilesHtml.substring(0, 1000)}`);
      throw e;
    }
    const profiles = parseProfilesFromHtml(profilesHtml);
    emitLog(port, `> [MIB] Found ${profiles.length} profile(s).`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: Switch Profile — POST /aProfileHandler/switchProfile
    // ═══════════════════════════════════════════════════════════════
    if (profiles.length > 0) {
      // Find matching profile type if possible, otherwise default to first
      const selectedProfile = profiles.find(p => p.type === profileType) || profiles[0];
      const activeRTag = selectedProfile.rTag || rTag;
      emitLog(port, `> [MIB] Step 7: Switching to profile ${selectedProfile.id} (type: ${selectedProfile.type}, payload profileType requested: ${profileType})...`);

      const switchRes = await mibFetch(`${MIB_BASE_URL}/aProfileHandler/switchProfile`, {
        method: 'POST',
        headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/profiles` },
        body: buildFormBody({
          rTag: activeRTag,
          profileId: selectedProfile.id,
          profileType: profileType
        })
      }, port);

      // HAR shows HTTP 203 = success with redirect to /accounts
      if (!isMibSuccess(switchRes.status)) {
        throw new Error(`MIB profile switch failed: HTTP ${switchRes.status}`);
      }

      let switchData;
      try {
        switchData = await switchRes.json();
      } catch (e) {
        // HTTP 203 may have empty body — treat as success
        if (switchRes.status === 203) {
          switchData = { status: 'success', redirect: '/accounts' };
        } else {
          switchData = { status: 'success' };
        }
      }

      if (switchData.status === 'error') {
        throw new Error(`MIB profile switch failed: ${switchData.message || 'Unknown error'}`);
      }
      emitLog(port, `> [MIB] ✓ Profile switched successfully (HTTP ${switchRes.status}).`);
    } else {
      emitLog(port, `> [MIB] No profiles found. Proceeding with default profile...`);
    }

    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: Load Accounts — GET /accounts
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 8: Loading accounts dashboard...`);
    const accountsRes = await mibFetch(`${MIB_BASE_URL}/accounts`, {
      headers: {
        'Referer': `${MIB_BASE_URL}/profiles`,
        'User-Agent': USER_AGENT
      }
    }, port);

    if (!accountsRes.ok) {
      throw new Error(`MIB accounts page load failed: HTTP ${accountsRes.status}`);
    }

    const accountsHtml = await accountsRes.text();
    const parsedAccounts = parseAccountsFromHtml(accountsHtml);
    emitLog(port, `> [MIB] Found ${parsedAccounts.length} account(s) in dashboard.`);

    // If fetch_only mode returned 0 accounts, the session has expired — fall back to fresh login
    if (sessionMode === 'fetch_only' && parsedAccounts.length === 0) {
      emitLog(port, `> [MIB] ⚠ Session appears expired (0 accounts in fetch_only mode). Falling back to fresh_login...`);
      return await runMibFlow(credentials, targetAccount, port, targetAmount, profileType, mode, 'fresh_login');
    }

    // Extract rTag from accounts page if we don't have one yet (e.g. fetch_only mode)
    if (!rTag) {
      try {
        rTag = extractRTag(accountsHtml);
        emitLog(port, `> [MIB] ✓ Extracted rTag from accounts page: ${rTag.substring(0, 8)}...`);
      } catch (e) {
        emitLog(port, `> [MIB] ⚠ Could not extract rTag from accounts page.`);
      }
    }

    // Find the target account
    let matchedAccountNo = null;
    for (const acc of parsedAccounts) {
      if (acc.accountNo === targetAccount || acc.accountNo.includes(targetAccount) || targetAccount.includes(acc.accountNo)) {
        matchedAccountNo = acc.accountNo;
        break;
      }
    }

    // If no match found in parsed accounts, use the target directly
    if (!matchedAccountNo) {
      emitLog(port, `> [MIB] Target account ${targetAccount} not found in parsed accounts. Using directly...`);
      matchedAccountNo = targetAccount;
    } else {
      emitLog(port, `> [MIB] ✓ Matched account: ${matchedAccountNo}`);
    }

    // Attempt parsing balance directly from dashboard overview card first
    let dashboardBalance = null;
    try {
      const accountIndex = accountsHtml.indexOf(matchedAccountNo);
      if (accountIndex !== -1) {
        const start = Math.max(0, accountIndex - 800);
        const end = Math.min(accountsHtml.length, accountIndex + 800);
        const section = accountsHtml.substring(start, end);
        const balMatch = section.match(/Available\s+Balance[^]*?(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                      || section.match(/Balance[^]*?(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                      || section.match(/(?:MVR|USD)\s*(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                      || section.match(/(\b\d+(?:,\d{3})*\.\d{2}\b)/);
        if (balMatch) {
          dashboardBalance = balMatch[1];
          emitLog(port, `> [MIB] ✓ Extracted balance from dashboard card for ${matchedAccountNo}: ${dashboardBalance} MVR`);
        }
      }
    } catch (err) {
      emitLog(port, `> [MIB] Error extracting balance from dashboard HTML: ${err.message}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 8B: Load Account Details — GET /accountDetails
    // HAR: trxHistory was called from /accountDetails page context
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 8B: Loading account details page...`);
    const accDetailsRes = await mibFetch(`${MIB_BASE_URL}/accountDetails?accountNo=${matchedAccountNo}`, {
      headers: {
        'Referer': `${MIB_BASE_URL}/accounts`,
        'User-Agent': USER_AGENT
      }
    }, port);

    let mibBalance = dashboardBalance || "Not found";
    if (!accDetailsRes.ok) {
      emitLog(port, `> [MIB] Account details returned ${accDetailsRes.status}. Continuing anyway...`);
    } else {
      emitLog(port, `> [MIB] ✓ Account details page loaded.`);
      try {
        const detailsHtml = await accDetailsRes.clone().text();
        const balanceMatch = detailsHtml.match(/Available\s+Balance[^]*?(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                          || detailsHtml.match(/Balance[^]*?(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                          || detailsHtml.match(/(?:MVR|USD)\s*(\b\d+(?:,\d{3})*\.\d{2}\b)/i)
                          || detailsHtml.match(/(\b\d+(?:,\d{3})*\.\d{2}\b)/);
        if (balanceMatch) {
          mibBalance = balanceMatch[1];
          emitLog(port, `> [MIB] 💰 Balance parsed from details page: ${mibBalance} MVR`);
        } else {
          emitLog(port, `> [MIB] No balance parsed from details page. Available fallback: ${mibBalance}`);
        }
        // Extract rTag from details page for the trxHistory POST
        try {
          rTag = extractRTag(detailsHtml);
          emitLog(port, `> [MIB] ✓ Refreshed rTag from details page: ${rTag.substring(0, 8)}...`);
        } catch (e) {
          emitLog(port, `> [MIB] Could not extract rTag from details page — keeping previous.`);
        }
      } catch (err) {
        emitLog(port, `> [MIB] Error parsing balance: ${err.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 9: Fetch Transaction History — POST /ajaxAccounts/trxHistory
    // HAR: Status 200, empty fromDate/toDate (no date filtering)
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 9: Fetching transaction history for ${matchedAccountNo}...`);

    const historyRes = await mibFetch(`${MIB_BASE_URL}/ajaxAccounts/trxHistory`, {
      method: 'POST',
      headers: {
        ...mibHeaders,
        'Referer': `${MIB_BASE_URL}/accountDetails?accountNo=${matchedAccountNo}`
      },
      body: buildFormBody({
        accountNo: matchedAccountNo,
        trxNo: '',
        trxType: '0',
        sortTrx: 'date',
        sortDir: 'desc',
        fromDate: '',
        toDate: '',
        start: '1',
        end: '10',
        includeCount: '1'
      })
    }, port);

    if (!historyRes.ok) {
      throw new Error(`MIB transaction history failed: HTTP ${historyRes.status}`);
    }

    // Parse the transaction history response
    let historyData;
    try {
      historyData = await historyRes.json();
    } catch (e) {
      const text = await historyRes.clone().text();
      emitLog(port, `> [MIB] Transaction history response (non-JSON): ${text.substring(0, 300)}`);
      throw new Error('MIB transaction history response was not valid JSON');
    }

    emitLog(port, `> [MIB] Raw history response: ${JSON.stringify(historyData)}`);

    let transactions = [];
    if (historyData) {
      if (Array.isArray(historyData.data)) {
        transactions = historyData.data;
      } else if (historyData.data && Array.isArray(historyData.data.transactions)) {
        transactions = historyData.data.transactions;
      } else if (Array.isArray(historyData.transactions)) {
        transactions = historyData.transactions;
      } else if (Array.isArray(historyData)) {
        transactions = historyData;
      }
    }

    const targetAmtNum = parseFloat(targetAmount) || 0;

    let matchFound = null;
    if (mode === 'search') {
      emitLog(port, `> [MIB] Found ${transactions.length} transaction(s). Searching for ${targetAmount} MVR credit...`);
      const matchingTxs = transactions.filter(tx => {
        const txAmount = Math.abs(parseFloat(tx.amount || tx.baseAmount) || 0);
        const isCredit = parseFloat(tx.amount || tx.baseAmount) > 0 || tx.type === 'credit' || tx.credit || tx.trxType === 'credit';
        return targetAmtNum > 0 && Math.abs(txAmount - targetAmtNum) < 0.01 && isCredit;
      });
      last3Txs = normalizeTransactions(matchingTxs, 'MIB', 3);
      if (matchingTxs.length > 0) {
        matchFound = matchingTxs[0];
        emitLog(port, `> [MIB] ✓ MATCH FOUND: ${matchFound.description || matchFound.descr1 || matchFound.reference || 'Transaction'} — ${matchFound.amount || matchFound.baseAmount}`);
      }
    } else if (mode === 'ledger') {
      emitLog(port, `> [MIB] Found ${transactions.length} transaction(s). Fetching ledger history...`);
      last3Txs = normalizeTransactions(transactions, 'MIB', 50);
    } else {
      // mode === 'history'
      emitLog(port, `> [MIB] Found ${transactions.length} transaction(s). Fetching recent history...`);
      last3Txs = normalizeTransactions(transactions, 'MIB', 3);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 10: Logout and Report
    // ═══════════════════════════════════════════════════════════════
    if (!heldSession && sessionMode !== 'claim_and_login') {
      emitLog(port, `> [MIB] Step 10: Logging out and cleaning up...`);
      try {
        await mibFetch(`${MIB_BASE_URL}/aAuth/logout`, {
          method: 'POST',
          headers: {
            ...mibHeaders,
            'Referer': `${MIB_BASE_URL}/accountDetails?accountNo=${matchedAccountNo}`
          },
          body: ''
        }, port);
        emitLog(port, `> [MIB] ✓ Session destroyed.`);
      } catch (e) {
        emitLog(port, `> [MIB] Session destruction failed: ${e.message}`);
      }

      // Clear MIB cookies after logout
      const postLogoutCookies = await chrome.cookies.getAll({ domain: "mib.com.mv" });
      for (const cookie of postLogoutCookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    } else {
      emitLog(port, `> [MIB] Session holder mode active: keeping MIB session alive.`);
    }

    // Report result
    if (mode === 'history' || mode === 'ledger') {
      emitLog(port, `> [Viri Bridge] MIB ${mode.toUpperCase()} FETCH SUCCESS.`);
      port.postMessage({
        type: 'success',
        data: null,
        balance: mibBalance,
        transactions: last3Txs
      });
    } else {
      if (matchFound) {
        emitLog(port, `> [Viri Bridge] MIB VERIFICATION SUCCESS: ${matchFound.reference || matchFound.description || 'Transaction matched'}`);
        port.postMessage({
          type: 'success',
          data: {
            status: 'CREDITED',
            reference: matchFound.reference || matchFound.descr1 || matchFound.description || 'MIB-MATCH',
            amount: Math.abs(parseFloat(matchFound.amount || matchFound.baseAmount)).toFixed(2),
            timestamp: matchFound.date || matchFound.bookingDate || new Date().toISOString()
          },
          balance: mibBalance,
          transactions: last3Txs
        });
      } else {
        throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR on MIB account ${targetAccount}.`);
      }
    }

  } catch (error) {
    if (port) {
      emitLog(port, `> [MIB] FATAL ERROR: ${error.message}`);
    }

    // Attempt cleanup on error
    try {
      await fetch(`${MIB_BASE_URL}/aAuth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': USER_AGENT
        },
        body: '',
        credentials: 'include'
      });
    } catch (e) { /* ignore cleanup errors */ }

    // Clear MIB cookies
    try {
      const errorCookies = await chrome.cookies.getAll({ domain: "mib.com.mv" });
      for (const cookie of errorCookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    } catch (e) { /* ignore cleanup errors */ }

    if (port) {
      try {
        port.postMessage({ type: 'error', error: error.message, transactions: last3Txs || [] });
      } catch (e) { /* port might already be dead */ }
    }
  }
}
