import { 
  generateNonce, blowfishEncrypt, blowfishDecrypt, computePgf03, 
  deriveSessionKey, generateSodium, generateXxid, generateAppId,
  generateClientSalt, DEFAULT_KEY, computeCmod
} from './utils/mib-crypto.js';

const BASE_URL = "https://www.bankofmaldives.com.mv/internetbanking";
const MIB_BASE_URL = "https://faisanet.mib.com.mv";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

let globalInertiaVersion = "";

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function computeSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeCredsHash(bank, username) {
  if (!username) return '';
  return await computeSha256(`${bank}_${username.trim().toLowerCase()}`);
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

function logApiDebug(port, data, tag = 'API') {
  chrome.storage.local.get(['viri_debug_log_mib_html'], (result) => {
    const enabled = result.viri_debug_log_mib_html || debugLogMibHtml;
    if (!enabled) {
      return;
    }
    try {
      let output;
      if (typeof data === 'object' && data !== null) {
        // JSON payload — pretty-print it
        output = JSON.stringify(data, null, 2);
      } else {
        // Legacy HTML string (MIB) — clean img tags
        output = String(data).replace(/<img[^>]*>/gi, '');
      }
      emitLog(port, `> [${tag}] DEBUG: Payload length: ${output.length}`);
      emitLog(port, `[${tag}-DEBUG-START]`);
      const chunkSize = 1000;
      for (let i = 0; i < output.length; i += chunkSize) {
        emitLog(port, `[${tag}-DEBUG] ${output.substring(i, i + chunkSize)}`);
      }
      emitLog(port, `[${tag}-DEBUG-END]`);
    } catch (e) {
      emitLog(port, `> [${tag}] DEBUG: failed to output payload: ${e.message}`);
    }
  });
}

// enableBankLockdown() — REMOVED. Legacy webscraping lockdown is no longer needed.
// All bank authentication now uses OAuth/API token flows, not browser automation.
async function enableBankLockdown() {
  // No-op: lockdown disabled system-wide
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

// Clear any left-over lockdown rules on extension startup/reload.
// NOTE: clearBankSessions() is intentionally NOT called here anymore.
// The legacy webscraping flow required a fresh cookie jar, but the new API token
// flow stores session state in chrome.storage — not browser cookies.
// Wiping cookies on startup was destroying valid persistent API sessions for MIB.
disableBankLockdown();

// Global active port
let activePort = null;
let heldSession = null;
let heartbeatInterval = null;
let pollInterval = null;
let debugLogMibHtml = false;

// Restore session state on worker wake up
chrome.storage.local.get(['viri_held_session', 'viri_debug_log_mib_html'], (result) => {
  if (result.viri_held_session) {
    heldSession = result.viri_held_session;
    startHeartbeat();
    console.log("[Viri Bridge] Restored heldSession from storage.");
  }
  if (result.viri_debug_log_mib_html !== undefined) {
    debugLogMibHtml = !!result.viri_debug_log_mib_html;
    console.log("[Viri Bridge] Restored debugLogMibHtml from storage:", debugLogMibHtml);
  }
});

async function logSessionEvent(event_type, detail = {}, pwa_logs = []) {
  if (!heldSession || !heldSession.backendUrl) return;
  await fetch(`${heldSession.backendUrl}/terminal/session/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hardware_id: heldSession.hardwareId,
      event_type,
      ...detail,
      pwa_logs
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
      console.warn("Heartbeat post failed:", e);
    }
  }, 20000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}



chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GET_VERSION') {
    sendResponse({ version: EXTENSION_VERSION });
    return true;
  }

  if (msg.action === 'START_BML_AUTH') {
    startBmlOAuthFlow(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.bmlUsername, msg.payload.profileType, msg.payload.sanctumToken)
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'START_MIB_AUTH') {
    startMibAuthFlow(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.mibUsername, msg.payload.sanctumToken, msg.payload.password, msg.payload.hardwareId)
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'SUBMIT_MIB_OTP') {
    submitMibOtp(msg.payload.otp, msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.mibUsername, msg.payload.sanctumToken)
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'CLEAR_MIB_CREDENTIALS') {
    (async () => {
      try {
        // Clear MIB device keys from local storage
        await chrome.storage.local.remove(['mib_key1', 'mib_key2', 'mib_appId', 'mib_profileId', 'mib_profileType']);
        // Clear cached session
        await chrome.storage.session.remove('mibSession');
        // Clear MIB cookies
        const mibCookies = await chrome.cookies.getAll({ domain: 'mib.com.mv' });
        for (const cookie of mibCookies) {
          const protocol = cookie.secure ? "https://" : "http://";
          const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          await chrome.cookies.remove({ url: `${protocol}${cleanDomain}${cookie.path}`, name: cookie.name });
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === 'CHECK_BML_TOKENS') {
    getValidBmlAccessToken(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.bmlUsername, msg.payload.profileType, msg.payload.sanctumToken)
      .then(token => sendResponse({ hasTokens: !!token }))
      .catch(() => sendResponse({ hasTokens: false }));
    return true;
  }

  if (msg.action === 'PING_BANK') {
    const doPing = (session) => {
      if (session) {
        if (activePort) emitLog(activePort, `> [Viri Bridge] Sending keep-alive ping for ${session.bankName}...`);
        const url = session.bankName === 'MIB' ? "https://faisanet.mib.com.mv/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
        fetch(url, { 
          headers: { 
            'User-Agent': USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest'
          }, 
          credentials: 'include' 
        }).catch((e) => {
          if (activePort) emitLog(activePort, `> [Viri Bridge] Keep-alive ping failed: ${e.message}`);
        });
      }
      sendResponse({ status: 'ok' });
    };

    if (heldSession) {
      doPing(heldSession);
    } else {
      chrome.storage.local.get(['viri_held_session'], (res) => {
        doPing(res.viri_held_session);
      });
    }
  }
  return true;
});

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log("[Viri Bridge] PWA Connected via Port:", port.name);
  if (port.name === "viri-verify" || port.name === "bml-auth") {
    activePort = port;

    port.onMessage.addListener(async (msg) => {
      if (msg.payload && msg.payload.debugLogMibHtml !== undefined) {
        debugLogMibHtml = !!msg.payload.debugLogMibHtml;
        chrome.storage.local.set({ viri_debug_log_mib_html: debugLogMibHtml });
      }

      if (msg.payload && msg.payload.bmlLoginProcedure) {
        chrome.storage.local.set({ viri_bml_login_procedure: msg.payload.bmlLoginProcedure });
      }

      if (msg.action === 'UPDATE_CONFIG') {
        return; // Already handled by the generic blocks above
      }

      // Handle the new frontend structure
      if (msg.action === 'VERIFY_TRANSFER') {
        const payload = msg.payload;
        const targetAcc = payload.accountNumber || payload.accountId || payload.account;
        const mode = payload.mode || 'search';
        const sessionMode = payload.sessionMode || 'fresh_login';
        // Store sanctumToken for backend-authenticated operations (e.g., MIB key fetch)
        if (payload.sanctumToken) {
          chrome.storage.local.set({ sanctumToken: payload.sanctumToken });
        }
        try {
          if (payload.bank === 'MIB') {
            await runMibApiFlow(payload.credentials, targetAcc, port, payload.amount, payload.mibProfileType || '0', mode, sessionMode, payload.hardwareId, payload.backendUrl);
          } else {
            await runBmlApiFlow(payload.credentials, targetAcc, payload.accountName, port, payload.amount, payload.bmlProfileType || '0', mode, sessionMode, payload.bmlAuthState, payload.hardwareId, payload.backendUrl);
          }
        } catch (error) {
          try { port.postMessage({ type: 'error', error: error.message }); } catch(e) {}
        }
      }
      else if (msg.action === 'FULFILL_DELEGATED_REQUEST') {
        const payload = msg.payload;
        const req = payload.req;
        const targetAcc = heldSession ? heldSession.accountId : req.bank_account_id;
        try {
          if (payload.bankName === 'MIB') {
            await runMibApiFlow(payload.credentials, targetAcc, port, req.target_amount || '1.00', req.mib_profile_type || '0', req.request_type, 'fetch_only', req.hardware_id || payload.hardwareId, req.backend_url || payload.backendUrl);
          } else {
            const bmlAuthState = heldSession ? heldSession.bmlAuthState : req.bml_auth_state;
            const bmlProfileType = heldSession ? (heldSession.bmlProfileType || '0') : (req.bml_profile_type || '0');
            await runBmlApiFlow(payload.credentials, targetAcc, req.account_name, port, req.target_amount || '1.00', bmlProfileType, req.request_type, 'fetch_only', bmlAuthState, req.hardware_id || payload.hardwareId, req.backend_url || payload.backendUrl);
          }
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
      else if (msg.action === 'FETCH_STATEMENT_RANGE') {
        const payload = msg.payload;
        const targetAcc = heldSession ? heldSession.accountId : payload.accountId;
        try {
          const bmlProfileType = heldSession ? (heldSession.bmlProfileType || '0') : (payload.bmlProfileType || '0');
          await fetchBmlStatementRange(payload.credentials, targetAcc, port, payload.fromDate, payload.toDate, bmlProfileType, payload.hardwareId, payload.backendUrl);
        } catch (error) {
          port.postMessage({ type: 'statement_error', error: error.message });
        }
      }
      else if (msg.action === 'FETCH_BML_HISTORY_PAGE') {
        const payload = msg.payload;
        const targetAcc = payload.accountNumber || (heldSession ? (heldSession.accountNumber || heldSession.accountId) : payload.accountId);
        const page = payload.page || 1;
        const bmlProfileType = heldSession ? (heldSession.bmlProfileType || '0') : (payload.bmlProfileType || '0');
        try {
          fetchBmlHistoryPage(payload.credentials, targetAcc, port, page, bmlProfileType, payload.hardwareId, payload.backendUrl)
            .then(res => {
              port.postMessage({
                type: 'history_page_success',
                page: page,
                transactions: res.transactions,
                totalPages: res.totalPages,
                balance: res.balance
              });
            })
            .catch(error => {
              port.postMessage({ type: 'history_page_error', page: page, error: error.message });
            });
        } catch (error) {
          port.postMessage({ type: 'history_page_error', page: page, error: error.message });
        }
      }
      else if (msg.action === 'CLAIM_SESSION') {
        heldSession = {
          accountId: msg.payload.accountId,
          accountNumber: msg.payload.accountNumber || null,
          bankName: msg.payload.bankName,
          backendUrl: msg.payload.backendUrl,
          hardwareId: msg.payload.hardwareId,
          credentials: msg.payload.credentials,
          bmlLoginProcedure: msg.payload.bmlLoginProcedure || 'legacy',
          bmlAuthState: msg.payload.bmlAuthState || null,
          bmlProfileType: msg.payload.bmlProfileType || '0'
        };
        chrome.storage.local.set({ viri_held_session: heldSession });
        startHeartbeat();
        emitLog(port, `> [Session] Session holder status activated.`);
      }
      else if (msg.action === 'RELEASE_SESSION') {
        stopHeartbeat();
        clearBankSessions();
        heldSession = null;
        chrome.storage.local.remove('viri_held_session');
        emitLog(port, `> [Session] Session holder status released.`);
      }
      else if (msg.action === 'CHECK_SESSION') {
        port.postMessage({
          type: 'session_status',
          hasSession: heldSession !== null
        });
      }
      else if (msg.action === 'PING_BANK') {
        if (heldSession) {
          const url = heldSession.bankName === 'MIB' ? "https://faisanet.mib.com.mv/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
          fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => {});
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

function parseBmlNarrativeDate(tx) {
  if (tx && tx.narrative1) {
    const match = tx.narrative1.match(/(\d{2}-\d{2}-\d{4} \d{2}-\d{2}-\d{2})/);
    if (match) {
      const parts = match[1].split(/[ -]/);
      if (parts.length === 6) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        const hour = parseInt(parts[3], 10);
        const minute = parseInt(parts[4], 10);
        const second = parseInt(parts[5], 10);
        const parsedDate = new Date(year, month - 1, day, hour, minute, second);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }
  }
  return null;
}

function normalizeTransactions(rawTxList, bankType, limit = 50) {
  if (!Array.isArray(rawTxList)) return [];
  const sliced = limit ? rawTxList.slice(0, limit) : rawTxList;
  return sliced.map(tx => {
    let date = tx.transactionDate || tx.valueDate || tx.trxDate || tx.bookingDate || tx.postDate || tx.date || '';
    if (bankType === 'BML') {
      const parsedDate = parseBmlNarrativeDate(tx);
      if (parsedDate) {
        date = parsedDate;
      }
    }
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

    // For MIB foreign-currency accounts (e.g. USD), the API returns:
    //   baseAmount = MVR equivalent (e.g. 207.83)
    //   foreignAmount = actual account currency amount (e.g. 13.5 USD)
    // We must use foreignAmount when it exists and the account is non-MVR.
    let amount;
    if (bankType === 'MIB' && tx.foreignAmount !== undefined && tx.foreignAmount !== null && tx.curCodeDesc && tx.curCodeDesc !== 'MVR') {
      amount = parseFloat(tx.foreignAmount) || 0;
    } else {
      amount = parseFloat(tx.amount || tx.baseAmount) || 0;
    }
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
    
    const narrative3Trimmed = tx.narrative3 ? String(tx.narrative3).trim() : '';
    return { date, details, amount: formattedAmount, runningBalance: formattedRunningBal, reference: refTrimmed || '', narrative3: narrative3Trimmed };
  });
}

// -------------------------------------------------------------
// The main BML background flow
// -------------------------------------------------------------


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
 * Parse profiles from MIB profiles HTML page
 */

/**
 * Parse account numbers from MIB accounts HTML page
 */



/**
 * Build form-urlencoded body string from an object
 */
function buildFormBody(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

let currentMibRTag = null;
chrome.storage.local.get(['viri_mib_rtag'], (res) => {
  if (res.viri_mib_rtag) currentMibRTag = res.viri_mib_rtag;
});

/**
 * The main MIB Faisanet background flow
 * @param {Object} credentials - {username, password, totpSeed}
 * @param {string} targetAccount - Account number to check
 * @param {Object} port - Chrome extension port for communication
 * @param {string} targetAmount - Amount to verify
 * @param {string} profileType - '0' for Personal, '1' for Business
 */






// -------------------------------------------------------------
// BML OAuth Persistence Helpers
// -------------------------------------------------------------
async function generatePKCE() {
    const verifier = new Uint8Array(72);
    crypto.getRandomValues(verifier);
    const codeVerifier = btoa(String.fromCharCode(...verifier))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const challengeBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(challengeBuf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const state = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    return { codeVerifier, codeChallenge, state, nonce, deviceId };
}

async function startBmlOAuthFlow(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken) {
    const port = activePort;
    const log = (msg) => {
        console.log('[BML-OAuth]', msg);
        if (port) emitLog(port, `> [BML-OAuth] ${msg}`);
    };

    log(`Starting OAuth flow. terminalId=${terminalId} bankAccountId=${bankAccountId} backendUrl=${backendUrl} bmlUsername=${bmlUsername} profileType=${profileType}`);
    
    // Clear any stale BML cookies first
    const oldCookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
    log(`Clearing ${oldCookies.length} old BML cookies...`);
    for (const cookie of oldCookies) {
      const protocol = cookie.secure ? "https://" : "http://";
      const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      await chrome.cookies.remove({ url: `${protocol}${cleanDomain}${cookie.path}`, name: cookie.name });
      await chrome.cookies.remove({ url: `${protocol}www.${cleanDomain}${cookie.path}`, name: cookie.name });
    }

    const tab = await chrome.tabs.create({
      url: 'https://www.bankofmaldives.com.mv/internetbanking/web/login',
      active: true
    });
    if (tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true });
    }
    log(`Opened BML login tab id=${tab.id}. Waiting for user to log in...`);

    return new Promise((resolve, reject) => {
        let isResolved = false;
        
        const tabUpdateListener = async (tabId, changeInfo, updatedTab) => {
            if (tabId !== tab.id) return;
            
            let isSuccessUrl = false;
            if (updatedTab.url) {
                try {
                    const u = new URL(updatedTab.url);
                    const fullPath = u.pathname + u.search + u.hash;
                    const isLoginFlow = fullPath.includes('/web/login') || fullPath.includes('/web/profile') || fullPath.includes('/web/redirect') || fullPath.includes('/oauth/');
                    
                    // Log all navigations for debugging
                    console.log(`[BML-OAuth] Tab ${tabId} nav: status=${changeInfo.status} path=${fullPath} isLoginFlow=${isLoginFlow}`);
                    
                    if (!isLoginFlow && (fullPath.includes('/accounts') || fullPath.includes('/dashboard') || fullPath.includes('/home') || fullPath.includes('/overview') || fullPath.includes('/vf/'))) {
                        isSuccessUrl = true;
                    }
                    
                    // Also accept any non-BML/non-login URL as success (catches future redirects)
                    if (!isSuccessUrl && !isLoginFlow && u.hostname !== 'www.bankofmaldives.com.mv') {
                        isSuccessUrl = true;
                        console.log(`[BML-OAuth] Non-BML URL detected as success: ${updatedTab.url}`);
                    }
                } catch(e) { console.error('[BML-OAuth] URL parse error:', e); }
            }
            
            if (changeInfo.status === 'complete' && isSuccessUrl) {
                if (!isResolved) {
                    isResolved = true;
                    chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                    chrome.tabs.onRemoved.removeListener(tabRemoveListener);
                    log('Login successful! Waiting 1s then performing PKCE exchange...');
                    
                    // Small delay to ensure cookies are fully committed after page load
                    await new Promise(r => setTimeout(r, 1000));
                    
                    try {
                        const pkce = await generatePKCE();
                        log(`PKCE generated. deviceId=${pkce.deviceId}`);
                        
                        const cookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
                        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
                        log(`Got ${cookies.length} BML cookies: ${cookies.map(c => c.name).join(', ')}`);

                        const authUrl = 'https://www.bankofmaldives.com.mv/internetbanking/oauth/authorize?' + new URLSearchParams({
                            redirect_uri: 'https://app.bankofmaldives.com.mv/oauth/mobile-callback',
                            client_id: '98C83590-513F-4716-B02B-EC68B7D9E7E7',
                            response_type: 'code',
                            state: pkce.state,
                            nonce: pkce.nonce,
                            code_challenge: pkce.codeChallenge,
                            code_challenge_method: 'S256',
                            'Device-ID': pkce.deviceId,
                            'User-Agent': 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
                            'x-app-version': '2.1.44.348'
                        }).toString();
                        
                        const ruleId = 9999;
                        await chrome.declarativeNetRequest.updateSessionRules({
                            removeRuleIds: [ruleId],
                            addRules: [{
                                id: ruleId,
                                priority: 100,
                                action: {
                                    type: "modifyHeaders",
                                    requestHeaders: [
                                        { header: "Cookie", operation: "set", value: cookieStr },
                                        { header: "Origin", operation: "set", value: "https://app.bankofmaldives.com.mv" },
                                        { header: "Referer", operation: "set", value: "https://app.bankofmaldives.com.mv/" }
                                    ]
                                },
                                condition: {
                                    urlFilter: "||bankofmaldives.com.mv/internetbanking/oauth/authorize*",
                                    resourceTypes: ["xmlhttprequest", "other"]
                                }
                            }]
                        });
                        
                        log(`Calling oauth/authorize: ${authUrl.substring(0, 120)}...`);
                        const authRes = await fetch(authUrl, {
                            redirect: 'follow',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
                                'Cookie': cookieStr
                            }
                        });
                        
                        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                        log(`oauth/authorize response: status=${authRes.status} finalUrl=${authRes.url}`);
                        
                        let authCode = null;
                        if (authRes.url && authRes.url.includes('/oauth/mobile-callback')) {
                            const finalUrl = new URL(authRes.url);
                            authCode = finalUrl.searchParams.get('code');
                        }
                        
                        if (!authCode) {
                            const body = await authRes.text().catch(() => '(unreadable)');
                            log(`FAILED to get auth code. Status=${authRes.status} URL=${authRes.url} Body(200)=${body.substring(0,300)}`);
                            throw new Error(`Failed to get auth code from BML. HTTP Status: ${authRes.status} Final URL: ${authRes.url}`);
                        }
                        
                        log(`Auth code obtained: ${authCode.substring(0, 20)}...`);
                        
                        const tokenBody = new URLSearchParams({
                            'grant_type': 'authorization_code',
                            'code': authCode,
                            'code_verifier': pkce.codeVerifier,
                            'client_id': '98C83590-513F-4716-B02B-EC68B7D9E7E7',
                            'redirect_uri': 'https://app.bankofmaldives.com.mv/oauth/mobile-callback',
                            'Device-ID': pkce.deviceId,
                            'User-Agent': 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
                            'x-app-version': '2.1.44.348'
                        });
                        
                        log('Exchanging auth code for tokens...');
                        const tokenRes = await fetch('https://www.bankofmaldives.com.mv/internetbanking/oauth/token', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
                                'Accept': 'application/json',
                                'X-Device-ID': pkce.deviceId
                            },
                            body: tokenBody.toString()
                        });
                        
                        const tokenRawText = await tokenRes.text();
                        log(`Token endpoint response: status=${tokenRes.status} body=${tokenRawText.substring(0, 200)}`);
                        let tokenData;
                        try { tokenData = JSON.parse(tokenRawText); } catch(e) { throw new Error('Token response was not JSON: ' + tokenRawText.substring(0, 200)); }
                        if (!tokenData.access_token) throw new Error(`Token response missing access_token: ${tokenRawText.substring(0, 200)}`);
                        
                        log('Tokens obtained! Saving to chrome.storage...');
                        const cacheKey = `bml_oauth_${bmlUsername}_${profileType}`;
                        await chrome.storage.local.set({
                            [cacheKey]: {
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token,
                                device_id: pkce.deviceId,
                                expires_in: tokenData.expires_in,
                                expires_at: Date.now() + (tokenData.expires_in * 1000)
                            }
                        });
                        
                        const credsHash = await computeCredsHash('BML', bmlUsername);
                        const storeUrl = `${backendUrl}/bml/oauth/store`;
                        log(`Saving tokens to backend: ${storeUrl}`);
                        const storeRes = await fetch(storeUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${sanctumToken}`
                            },
                            body: JSON.stringify({
                                hardware_id: terminalId,
                                bank_account_id: bankAccountId,
                                bml_username: bmlUsername,
                                profile_type: profileType === '1' ? 'business' : 'personal',
                                access_token: tokenData.access_token,
                                refresh_token: tokenData.refresh_token,
                                device_id: pkce.deviceId,
                                expires_in: tokenData.expires_in,
                                credentials_hash: credsHash
                            })
                        });
                        const storeBody = await storeRes.text();
                        log(`Backend store response: status=${storeRes.status} body=${storeBody}`);
                        
                        log('✅ BML OAuth complete! Tokens acquired and stored successfully.');
                        setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 1000);
                        resolve(true);
                    } catch (e) {
                        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [9999] }).catch(() => {});
                        console.error('[BML-OAuth] ❌ Error during PKCE exchange:', e);
                        log(`Error during PKCE exchange: ${e.message}`);
                        setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 1000);
                        reject(e);
                    }
                }
            }
        };
        
        const tabRemoveListener = (tabId) => {
            if (tabId === tab.id && !isResolved) {
                isResolved = true;
                chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                chrome.tabs.onRemoved.removeListener(tabRemoveListener);
                console.warn('[BML-OAuth] Tab was closed before completing authentication.');
                reject(new Error("Login tab was closed before completing authentication."));
            }
        };
        
        chrome.tabs.onUpdated.addListener(tabUpdateListener);
        chrome.tabs.onRemoved.addListener(tabRemoveListener);
    });
}

async function getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken) {
    const cacheKey = `bml_oauth_${bmlUsername}_${profileType}`;
    let tokens = null;
    
    // Check local cache
    const data = await chrome.storage.local.get(cacheKey);
    if (data[cacheKey]) {
        tokens = data[cacheKey];
    } else {
        // Fetch from server
        try {
            const profileTypeParam = profileType === '1' ? 'business' : 'personal';
            const res = await fetch(`${backendUrl}/api/bml/oauth/tokens?hardware_id=${terminalId}&bank_account_id=${bankAccountId}&profile_type=${profileTypeParam}`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${sanctumToken}`
                }
            });
            if (res.status === 200) {
                tokens = await res.json();
                tokens.expires_at = new Date(tokens.expires_at).getTime();
                await chrome.storage.local.set({ [cacheKey]: tokens });
            }
        } catch(e) { console.error('Failed to fetch tokens from server', e); }
    }

    if (!tokens) return null;

    // Check expiry (5 min buffer)
    if (tokens.expires_at < Date.now() + 5 * 60 * 1000) {
        // Refresh
        const tokenBody = new URLSearchParams({
            'grant_type': 'refresh_token',
            'refresh_token': tokens.refresh_token,
            'client_id': '98C83590-513F-4716-B02B-EC68B7D9E7E7',
            'Device-ID': tokens.device_id,
            'User-Agent': 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
            'x-app-version': '2.1.44.348'
        });
        
        try {
            const tokenRes = await fetch('https://www.bankofmaldives.com.mv/internetbanking/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
                    'Accept': 'application/json',
                    'X-Device-ID': tokens.device_id
                },
                body: tokenBody.toString()
            });
            
            if (tokenRes.status !== 200) throw new Error('Refresh failed');
            const tokenData = await tokenRes.json();
            
            tokens.access_token = tokenData.access_token;
            tokens.refresh_token = tokenData.refresh_token || tokens.refresh_token; // rotation
            tokens.expires_in = tokenData.expires_in;
            tokens.expires_at = Date.now() + (tokenData.expires_in * 1000);
            
            await chrome.storage.local.set({ [cacheKey]: tokens });
            
            // Sync to server
            fetch(`${backendUrl}/api/bml/oauth/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sanctumToken}`
                },
                body: JSON.stringify({
                    hardware_id: terminalId,
                    bank_account_id: bankAccountId,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expires_in
                })
            }).catch(()=>{});
        } catch(e) {
            console.error('Refresh failed', e);
            await chrome.storage.local.remove(cacheKey);
            return null; // Force re-link
        }
    }
    return tokens.access_token;
}

// -------------------------------------------------------------
// BML API Background Flow (Browser OTP + Persistent Session)
// -------------------------------------------------------------
async function runBmlApiFlow(credentials, targetAccount, accountName, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login', bmlAuthState = null, payloadHardwareId = '', payloadBackendUrl = '') {
  emitLog(port, `> [BML-API] Starting API auth flow (sessionMode: ${sessionMode}, profileType: ${profileType})...`);
  let last3Txs = [];
  let loginSuccess = false;
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';

  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bankAccountId = heldSession ? heldSession.accountId : (credentials.bankAccountId || '');
    const bmlUsername = credentials.username || '';
    const sanctumToken = credentials.token || ''; // Assuming the PWA passes sanctum token in credentials if needed

    emitLog(port, `> [BML-API] Fetching valid OAuth token...`);
    const accessToken = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);

    if (!accessToken) {
        if (sessionMode === 'fetch_only') {
            heldSession = null;
            chrome.storage.local.remove('viri_held_session');
            throw new Error("Session expired. Please click Sync again to re-link your BML account.");
        }
        emitLog(port, `> [BML-API] Token expired or not present. Initiating OAuth flow...`);
        // We can't pass a port easily here, but we can pass null or dummy port to startBmlOAuthFlow
        await startBmlOAuthFlow(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        // Retry fetching token
        const newAccessToken = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        if (!newAccessToken) {
            throw new Error("Failed to acquire OAuth token after login.");
        }
    } else {
        emitLog(port, `> [BML-API] Valid OAuth token acquired.`);
    }

    loginSuccess = true;

    if (sessionMode === 'claim_and_login') {
      emitLog(port, `> [BML-API] Session claimed. Auth sequence complete.`);
      port.postMessage({ type: 'success', match: null, login_success: true, transactions: [] });
      return;
    }

    // Helper for authenticated requests
    const authFetch = async (url, options = {}) => {
        const token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${token}`;
        headers['Accept'] = 'application/json';
        // For mobile API endpoints, we need this specific UA
        headers['User-Agent'] = 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)';
        headers['x-app-version'] = '2.1.44.348';
        
        return await fetch(url, {
            ...options,
            headers
        });
    };

    // --- FETCH DATA ---

    // Always fetch dashboard to resolve account UUID and balance
    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/dashboard`);
    const dashRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashRes.status !== 200) {
      throw new Error(`Failed to load dashboard (HTTP ${dashRes.status}). Maybe token expired.`);
    }
    
    const dashData = await dashRes.json();
    logApiDebug(port, dashData, 'BML-DASHBOARD');
    if (!dashData.success || !dashData.payload || !dashData.payload.dashboard) {
      throw new Error("Invalid dashboard response format.");
    }
    
    let accountObj = null;
    if (Array.isArray(dashData.payload.dashboard)) {
      accountObj = dashData.payload.dashboard.find(a => 
        a.account && a.account.replace(/[^0-9]/g, '') === targetAccount.replace(/[^0-9]/g, '')
      );
    }
    if (!accountObj) {
      throw new Error(`Account ${targetAccount} not found on this BML profile.`);
    }
    const accountInternalId = accountObj.id;
    const dashboardBalance = accountObj.balance || accountObj.available_balance || accountObj.availableBalance || accountObj.working_balance || accountObj.current_balance || null;
    emitLog(port, `> [BML-API] Resolved account UUID: ${accountInternalId}${dashboardBalance !== null ? `, dashboard balance: ${dashboardBalance}` : ''}`);

    // Fetch history
    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
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

    // Format txs using the robust legacy normalizer
    const formattedTxs = normalizeTransactions(allTxs, 'BML', null);

    last3Txs = formattedTxs.slice(0, 3);
    emitLog(port, `> [BML-API] Found ${formattedTxs.length} transactions today.`);

    const currentBalance = dashboardBalance || (formattedTxs.length > 0 && formattedTxs[0].runningBalance 
      ? formattedTxs[0].runningBalance 
      : '0.00');

    if (mode === 'ledger' || mode === 'history') {
      port.postMessage({
        type: 'success',
        match: null,
        transactions: formattedTxs,
        balance: currentBalance,
        login_success: true
      });
      return;
    }

    // Find match for search mode
    let match = null;
    const targetAmtClean = targetAmount.replace(/,/g, '');
    for (const tx of formattedTxs) {
      if (tx.amount.replace(/,/g, '') === targetAmtClean && !tx.amount.startsWith('-')) {
        match = tx;
        break;
      }
    }

    if (match) {
      emitLog(port, `> [BML-API] MATCH FOUND! Amount: ${match.amount}, Ref: ${match.reference}`);
      port.postMessage({
        type: 'success',
        match: match,
        transactions: formattedTxs,
        balance: currentBalance,
        internal_id: accountInternalId,
        login_success: true
      });
    } else {
      emitLog(port, `> [BML-API] No exact match found for amount ${targetAmount}.`);
      throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR.`);
    }
  } catch (error) {
    emitLog(port, `> [BML-API] ERROR: ${error.message}`);
    if (port) {
      try {
        const isAuth = /login window was closed|invalid payload|401/i.test(error.message);
        port.postMessage({ 
          type: 'error', 
          error: error.message, 
          transactions: last3Txs || [],
          login_success: loginSuccess,
          auth_failed: isAuth
        });
      } catch (e) { }
    }
  }
}

async function fetchBmlStatementRange(credentials, bankAccountId, port, fromDate, toDate, profileType, payloadHardwareId, payloadBackendUrl) {
  emitLog(port, `> [BML-API] Starting statement fetch for ${bankAccountId} from ${fromDate} to ${toDate}...`);
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';
  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bmlUsername = credentials?.username || '';
    const sanctumToken = credentials?.token || '';

    const authFetch = async (url, options = {}) => {
        const token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${token}`;
        headers['Accept'] = 'application/json';
        headers['User-Agent'] = 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)';
        headers['x-app-version'] = '2.1.44.348';
        return await fetch(url, { ...options, headers });
    };

    const dashboardRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashboardRes.status !== 200) throw new Error("Dashboard fetch failed.");
    const dashboardData = await dashboardRes.json();
    
    // Find account by looking for account property ending with the last 4 digits of bankAccountId or matching it
    const accountObj = dashboardData.payload?.dashboard?.find(a => 
      a.account === bankAccountId || 
      a.account.replace(/X/g, '').endsWith(bankAccountId.slice(-4)) || 
      (a.id === bankAccountId)
    );
    if (!accountObj) throw new Error(`Target account ${bankAccountId} not found.`);
    const accountInternalId = accountObj.id;

    let page = 1;
    let allTransactions = [];
    let keepFetching = true;
    
    const fromStr = fromDate.replace(/-/g, '');
    const toStr = toDate.replace(/-/g, '');

    let pendingData = null;
    try {
      emitLog(port, `> [BML-API] Fetching pending history for statement...`);
      const pendingRes = await authFetch(`${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
      if (pendingRes.status === 200) {
        pendingData = await pendingRes.json();
      }
    } catch(e) {}

    if (pendingData && pendingData.payload && Array.isArray(pendingData.payload.history)) {
      for (const tx of pendingData.payload.history) {
        if (!tx.date || tx.date <= toStr && tx.date >= fromStr) {
          allTransactions.push(tx);
        }
      }
    }

    while (keepFetching) {
      emitLog(port, `> [BML-API] Fetching history page ${page}...`);
      const pageRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
      if (pageRes.status !== 200) throw new Error(`History page ${page} failed.`);
      const pageData = await pageRes.json();
      
      const txs = pageData.payload?.history;
      if (!txs || txs.length === 0) {
        break; 
      }
      
      for (const tx of txs) {
        if (tx.date < fromStr) {
          keepFetching = false;
        } else if (tx.date <= toStr && tx.date >= fromStr) {
          allTransactions.push(tx);
        }
      }
      
      if (!keepFetching) break;
      
      page++;
      if (page > 50) {
        emitLog(port, `> [BML-API] Reached 50 pages limit, stopping fetch.`);
        break; 
      }
    }

    emitLog(port, `> [BML-API] Statement fetch complete. Found ${allTransactions.length} raw transactions.`);
    
    // Normalize transactions before returning
    const formattedTxs = normalizeTransactions(allTransactions, 'BML', null);

    port.postMessage({
      type: 'statement_success',
      transactions: formattedTxs
    });

  } catch (error) {
    emitLog(port, `> [BML-API] Statement ERROR: ${error.message}`);
    port.postMessage({
      type: 'statement_error',
      error: error.message
    });
  }
}

async function fetchBmlHistoryPage(credentials, bankAccountId, port, page, profileType, payloadHardwareId, payloadBackendUrl) {
  emitLog(port, `> [BML-API] Starting page fetch for account ${bankAccountId}, page ${page}...`);
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';
  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bmlUsername = credentials?.username || '';
    const sanctumToken = credentials?.token || '';

    const authFetch = async (url, options = {}) => {
        const token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${token}`;
        headers['Accept'] = 'application/json';
        headers['User-Agent'] = 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)';
        headers['x-app-version'] = '2.1.44.348';
        return await fetch(url, { ...options, headers });
    };

    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/dashboard`);
    const dashboardRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashboardRes.status !== 200) throw new Error("Dashboard fetch failed.");
    const dashboardData = await dashboardRes.json();
    logApiDebug(port, dashboardData, 'BML-DASHBOARD');
    
    // Find account by matching account or endsWith or matching database id
    const accountObj = dashboardData.payload?.dashboard?.find(a => 
      a.account === bankAccountId || 
      a.account.replace(/X/g, '').endsWith(bankAccountId.slice(-4)) || 
      (a.id === bankAccountId)
    );
    if (!accountObj) throw new Error(`Target account ${bankAccountId} not found.`);
    const accountInternalId = accountObj.id;
    const balance = accountObj.balance || accountObj.availableBalance || '0.00';

    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
    const pageRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
    if (pageRes.status !== 200) throw new Error(`History page ${page} failed with status: ${pageRes.status}`);
    const pageData = await pageRes.json();
    logApiDebug(port, pageData, 'BML-PAGE-HISTORY');

    if (!pageData.success || !pageData.payload) {
      throw new Error("Invalid response payload from BML API.");
    }

    const rawTxs = pageData.payload.history || [];
    const formattedTxs = normalizeTransactions(rawTxs, 'BML', null);
    const totalPages = pageData.payload.totalPages || 1;

    emitLog(port, `> [BML-API] Page ${page} fetched successfully. Total pages: ${totalPages}. Transactions found: ${formattedTxs.length}`);

    return {
      transactions: formattedTxs,
      totalPages: totalPages,
      balance: balance
    };
  } catch (error) {
    emitLog(port, `> [BML-API] Error during page fetch: ${error.message}`);
    throw error;
  }
}

// -------------------------------------------------------------
// MIB API Integration Implementation
// -------------------------------------------------------------

class MibSessionExpiredError extends Error {
  constructor(message) { super(message); this.name = 'MibSessionExpiredError'; }
}

// Yield control back to the event loop to prevent service worker blockage
// during synchronous crypto operations (Blowfish, BigInt modPow)
const yieldToEventLoop = () => new Promise(r => setTimeout(r, 0));

async function executeMibSfunc(sfunc, dataPayload, encryptKey, extraFormFields = {}) {
  // Yield before synchronous encryption to keep service worker responsive
  await yieldToEventLoop();
  const encrypted = blowfishEncrypt(JSON.stringify(dataPayload), encryptKey);
  const formParts = [];
  for (const [k, v] of Object.entries(extraFormFields)) {
    formParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  formParts.push(`data=${encodeURIComponent(encrypted)}`);
  const formBody = formParts.join('&');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const resp = await fetch('https://faisanet.mib.com.mv/faisamobilex_smvc/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: formBody,
    credentials: 'include',
    signal: controller.signal
  });
  
  clearTimeout(timeoutId);

  // HTTP 419 = session expired (server signal)
  if (resp.status === 419) {
    throw new MibSessionExpiredError('HTTP 419 — session expired');
  }

  const cipherBody = await resp.text();
  if (!cipherBody) throw new Error("Empty response from MIB API");

  try {
    // Yield before synchronous decryption
    await yieldToEventLoop();
    const decrypted = JSON.parse(blowfishDecrypt(cipherBody, encryptKey));
    console.log(`[MIB] sfunc=${sfunc} HTTP ${resp.status} OK success=${decrypted.success} code=${decrypted.responseCode} reason=${decrypted.reasonText} keys=${Object.keys(decrypted).join(',')}`);
    
    // reasonCode 505 or error 101 = session expired (within encrypted response)
    if (!decrypted.success && (decrypted.reasonCode === '505' || decrypted.reasonText?.includes('Cipher key not found'))) {
      throw new MibSessionExpiredError(`Session expired: ${decrypted.reasonText} (${decrypted.reasonCode})`);
    }
    
    return decrypted;
  } catch (e) {
    if (e instanceof MibSessionExpiredError) throw e;
    console.error(`[MIB] sfunc=${sfunc} HTTP ${resp.status} body(200): "${cipherBody.substring(0, 200)}" err=${e.message}`);
    throw new Error("Failed to decrypt MIB response. Possible stale keys.");
  }
}

async function fetchMibUserSalt(sessionState, username) {
  const sodium = generateSodium();
  const nonce = generateNonce(sessionState.nonceGenerator);
  const payload = {
    sodium: sodium,
    routePath: 'A44',
    xxid: sessionState.xxid,
    uname: username,
    appId: sessionState.appId,
    nonce: nonce,
    p_dev_typ: 'A',
    p_dev_tok: 'test',
  };
  const resp = await executeMibSfunc('n', payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
  if (resp.data && resp.data[0] && resp.data[0].userSalt) {
    return resp.data[0].userSalt;
  }
  throw new Error("Failed to fetch userSalt");
}

async function startMibAuthFlow(terminalId, bankAccountId, backendUrl, mibUsername, sanctumToken, password, hardwareId) {
  return Promise.race([
    new Promise((_, reject) => setTimeout(() => reject(new Error("Extension Auth Flow internal timeout after 20s")), 20000)),
    (async () => {
      const port = activePort;
      if(port) emitLog(port, '> [MIB-API] Starting MIB API auth flow...');
  
  // 1. Get or Generate AppId
  let storedAppId = null;
  let storedKey1 = null;
  let storedKey2 = null;

  const localRes = await chrome.storage.local.get(['mib_appId', 'mib_key1', 'mib_key2']);
  if (localRes.mib_appId) {
    storedAppId = localRes.mib_appId;
    storedKey1 = localRes.mib_key1;
    storedKey2 = localRes.mib_key2;
  } else {
    storedAppId = generateAppId();
    await chrome.storage.local.set({ mib_appId: storedAppId });
  }

  let sessionState = { appId: storedAppId, key1: DEFAULT_KEY, key2: DEFAULT_KEY, xxid: '', nonceGenerator: '', sessionKey: '' };

  const doRegistrationFlow = async () => {
    if(port) emitLog(port, '> [MIB-API] Executing first-time device registration (C41)...');
    sessionState.key1 = DEFAULT_KEY;
    sessionState.key2 = DEFAULT_KEY;

    // sfunc=r
    const rSodium = generateSodium();
    const rXxid = generateXxid();
    const rPayload = { cmod: computeCmod().toString(), appId: storedAppId, routePath: 'S40', sodium: rSodium, xxid: rXxid };
    const rResp = await executeMibSfunc('r', rPayload, DEFAULT_KEY, { sfunc: 'r' });
    console.log(`[MIB] sfunc=r response success=${rResp.success} code=${rResp.responseCode} reason=${rResp.reasonText} xxid=${rResp.xxid}`);
    if (!rResp.success) {
      throw new Error(`sfunc=r failed: ${rResp.reasonText} (${rResp.reasonCode})`);
    }
    sessionState.xxid = String(rResp.xxid);
    sessionState.nonceGenerator = rResp.nonceGenerator;
    sessionState.sessionKey = await deriveSessionKey(rResp.smod);

    // If sfunc=r directly returns keys (fast-path optimization for recognized appId)
    if (rResp.key1 && rResp.key2) {
      if(port) emitLog(port, '> [MIB-API] Found existing keys via sfunc=r. Checking if valid...');
      if (rResp.appId) {
        storedAppId = rResp.appId;
        await chrome.storage.local.set({ mib_appId: storedAppId });
      }
      await chrome.storage.local.set({ mib_key1: rResp.key1, mib_key2: rResp.key2 });
      sessionState.key1 = rResp.key1;
      sessionState.key2 = rResp.key2;
      if (rResp.appId) sessionState.appId = rResp.appId;
      
      try {
        const iPayload = { cmod: computeCmod().toString(), appId: storedAppId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
        const iResp = await executeMibSfunc('i', iPayload, sessionState.key1, { key2: sessionState.key2, sfunc: 'i' });
        
        // Save new session data
        sessionState.sessionKey = await deriveSessionKey(iResp.smod);
        sessionState.xxid = String(iResp.xxid);
        sessionState.nonceGenerator = iResp.nonceGenerator;
        
        await chrome.storage.session.set({ mibSession: sessionState });
        if(port) emitLog(port, '> [MIB-API] Fast-path successful. Keys were valid.');
        return { success: true, skipOtp: true };
      } catch (e) {
        if(port) emitLog(port, '> [MIB-API] Fast-path keys were stale. Falling back to C41...');
        sessionState.key1 = DEFAULT_KEY;
        sessionState.key2 = DEFAULT_KEY;
      }
    }

    const userSalt = await fetchMibUserSalt(sessionState, mibUsername);
    const clientSalt = generateClientSalt();
    const pgf03 = await computePgf03(password, userSalt, clientSalt);

    const sodium = generateSodium();
    const nonce = generateNonce(sessionState.nonceGenerator);
    const c41Payload = {
      sodium: sodium,
      routePath: 'C41',
      xxid: sessionState.xxid,
      uname: mibUsername,
      clientSalt: clientSalt,
      pgf03: pgf03,
      nonce: nonce,
      appId: sessionState.appId,
      p_dev_typ: 'A',
      p_dev_tok: 'test',
    };
    
    console.log(`[MIB] A44/C41 payload xxid="${sessionState.xxid}" nonceGen="${sessionState.nonceGenerator?.substring(0, 30)}" sessionKey="${sessionState.sessionKey?.substring(0, 16)}"`);
    const c41Resp = await executeMibSfunc('n', c41Payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
    console.log(`[MIB] C41 success=${c41Resp.success} primaryOTPType=${c41Resp.primaryOTPType} otpTypes=${JSON.stringify(c41Resp.otpTypes)} reason=${c41Resp.reasonText}`);
    if (c41Resp.success) {
      if(port) emitLog(port, '> [MIB-API] C41 successful. OTP required.');
      await chrome.storage.session.set({ mibAuthTemp: { sessionState, clientSalt, userSalt, pgf03, flow: 'C42', primaryOTPType: c41Resp.primaryOTPType, mibPassword: password, mibUsername } });
      return { success: true, requiresOtp: true };
    } else {
      throw new Error(`C41 failed: ${c41Resp.reasonText || JSON.stringify(c41Resp)}`);
    }
  };

  if (storedKey1 && storedKey2) {
    if(port) emitLog(port, '> [MIB-API] Found stored keys. Attempting returning device login (A41)...');
    sessionState.key1 = storedKey1;
    sessionState.key2 = storedKey2;

    try {
      const iPayload = { cmod: computeCmod().toString(), appId: storedAppId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
      const iResp = await executeMibSfunc('i', iPayload, sessionState.key1, { key2: sessionState.key2, sfunc: 'i' });
      sessionState.sessionKey = await deriveSessionKey(iResp.smod);
      sessionState.xxid = String(iResp.xxid);
      sessionState.nonceGenerator = iResp.nonceGenerator;

      const userSalt = await fetchMibUserSalt(sessionState, mibUsername);
      const clientSalt = generateClientSalt();
      const pgf03 = await computePgf03(password, userSalt, clientSalt);

      const sodium = generateSodium();
      const nonce = generateNonce(sessionState.nonceGenerator);
      const a41Payload = {
        sodium: sodium,
        routePath: 'A41',
        xxid: sessionState.xxid,
        uname: mibUsername,
        clientSalt: clientSalt,
        pgf03: pgf03,
        nonce: nonce,
        appId: sessionState.appId,
        pmodTime: 0,
        requireBankData: 1,
      };

      const a41Resp = await executeMibSfunc('n', a41Payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
      if (a41Resp.success) {
        // Extract profile info from A41 response
        const a41Profiles = a41Resp.operatingProfiles || a41Resp.payload?.login?.operatingProfiles || [];
        const firstProfile = a41Profiles[0] || {};
        // Single-profile fast-path: A41 may set selectedProfileId without operatingProfiles
        const a41ProfileId = firstProfile.profileId || a41Resp.selectedProfileId || a41Resp.payload?.login?.selectedProfileId;
        const a41ProfileType = firstProfile.profileType || '0';

        // Per FLOW.md: OTP is signaled by primaryOTPType/otpTypes at the A41 response root.
        // But if profileSelected is true (single-profile fast-path), OTP is always skipped.
        if (a41Resp.profileSelected) {
          if(port) emitLog(port, '> [MIB-API] A41 single-profile fast-path. No OTP required.');
          const spProfileId = a41Resp.selectedProfileId || a41ProfileId || 'default_profile';
          const spProfileType = a41Resp.selectedProfileType || a41ProfileType || '0';
          const spProfileName = firstProfile.profileName || a41Resp.selectedProfileName || 'Legacy Profile';
          const credsHash = await computeCredsHash('MIB', mibUsername);
          if (spProfileId) {
            await chrome.storage.local.set({ mib_profileId: spProfileId, mib_profileType: spProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${spProfileId} (type ${spProfileType}).`);
          }
          await chrome.storage.session.set({ mibSession: sessionState });
          
          try {
            if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
            const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sanctumToken}`
              },
              body: JSON.stringify({
                hardware_id: terminalId,
                bank_account_id: bankAccountId,
                mib_username: mibUsername,
                key1: sessionState.key1,
                key2: sessionState.key2,
                app_id: sessionState.appId,
                profile_id: spProfileId,
                profile_type: spProfileType,
                profile_name: spProfileName,
                credentials_hash: credsHash
              })
            });
            if (!storeResp.ok) {
              const errText = await storeResp.text();
              throw new Error(`Server failed to store keys: Status ${storeResp.status} - ${errText}`);
            }
          } catch (err) {
            if(port) emitLog(port, `> [MIB-API] Failed to store keys on fast-path: ${err.message}`);
            throw err;
          }

          return { success: true, skipOtp: true };
        }
        const needsOtp = a41Resp.primaryOTPType || (a41Resp.otpTypes && a41Resp.otpTypes.length > 0);
        if (needsOtp) {
          if(port) emitLog(port, '> [MIB-API] A41 successful. OTP required.');
          const spProfileName = firstProfile.profileName || 'Legacy Profile';
          await chrome.storage.session.set({ mibAuthTemp: { sessionState, clientSalt, userSalt, pgf03, flow: 'C42', primaryOTPType: a41Resp.primaryOTPType || '3', mibPassword: password, mibUsername, mibProfileId: a41ProfileId, mibProfileType: a41ProfileType, mibProfileName: spProfileName } });
          return { success: true, requiresOtp: true };
        } else {
          // Fast path, no OTP needed. Save profile and session.
          const spProfileId = a41ProfileId || 'default_profile';
          const spProfileType = a41ProfileType || '0';
          const spProfileName = firstProfile.profileName || 'Legacy Profile';
          const credsHash = await computeCredsHash('MIB', mibUsername);
          if (a41ProfileId) {
            await chrome.storage.local.set({ mib_profileId: a41ProfileId, mib_profileType: a41ProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${a41ProfileId} (type ${a41ProfileType}).`);
          }
          await chrome.storage.session.set({ mibSession: sessionState });
          
          try {
            if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
            const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sanctumToken}`
              },
              body: JSON.stringify({
                hardware_id: terminalId,
                bank_account_id: bankAccountId,
                mib_username: mibUsername,
                key1: sessionState.key1,
                key2: sessionState.key2,
                app_id: sessionState.appId,
                profile_id: spProfileId,
                profile_type: spProfileType,
                profile_name: spProfileName,
                credentials_hash: credsHash
              })
            });
            if (!storeResp.ok) {
              const errText = await storeResp.text();
              throw new Error(`Server failed to store keys: Status ${storeResp.status} - ${errText}`);
            }
          } catch (err) {
            if(port) emitLog(port, `> [MIB-API] Failed to store keys on fast-path: ${err.message}`);
            throw err;
          }

          if(port) emitLog(port, '> [MIB-API] A41 successful. No OTP required.');
          return { success: true, skipOtp: true };
        }
      } else {
         if(port) emitLog(port, `> [MIB-API] A41 failed: ${a41Resp.message}. Falling back to Registration...`);
         return await doRegistrationFlow();
      }
    } catch (e) {
      if(port) emitLog(port, `> [MIB-API] Returning device flow failed (${e.message}). Falling back to Registration...`);
      return await doRegistrationFlow();
    }
  } else {
    return await doRegistrationFlow();
  }
    })()
  ]);
}

async function submitMibOtp(otp, terminalId, bankAccountId, backendUrl, mibUsername, sanctumToken) {
  const port = activePort;
  const { mibAuthTemp } = await chrome.storage.session.get('mibAuthTemp');
  if (!mibAuthTemp) throw new Error("No MIB auth session found in storage.");
  
  const { sessionState, flow, primaryOTPType, mibPassword } = mibAuthTemp;
  const sodium = generateSodium();
  const nonce = generateNonce(sessionState.nonceGenerator);
  
  if(port) emitLog(port, `> [MIB-API] Submitting OTP via ${flow}...`);
  
  const payload = {
    sodium: sodium,
    routePath: flow,
    xxid: sessionState.xxid,
    otp: otp,
    uname: mibUsername,
    otpType: '3', // otpType "2" (SMS) triggers server-side PHP bug at IndexController.php:423 — use TOTP type "3" always
    appId: sessionState.appId,
    nonce: nonce,
  };
  
  const resp = await executeMibSfunc('n', payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
  
  if (resp.success) {
    if(port) emitLog(port, '> [MIB-API] OTP Verified successfully.');
    
    // Resolve key1/key2 (from C42/A42 response data or fallback to cached sessionState keys)
    const key1ToSave = (resp.data && resp.data[0] && resp.data[0].key1) ? resp.data[0].key1 : sessionState.key1;
    const key2ToSave = (resp.data && resp.data[0] && resp.data[0].key2) ? resp.data[0].key2 : sessionState.key2;

    if (key1ToSave && key2ToSave) {
      sessionState.key1 = key1ToSave;
      sessionState.key2 = key2ToSave;
      await chrome.storage.local.set({ mib_key1: key1ToSave, mib_key2: key2ToSave });
      
      // Save profile info from A41 (available in mibAuthTemp for A42 path)
      const { mibProfileId, mibProfileType, mibProfileName } = mibAuthTemp;
      const spProfileId = mibProfileId || 'default_profile';
      const spProfileType = mibProfileType || '0';
      const spProfileName = mibProfileName || 'Legacy Profile';
      const credsHash = await computeCredsHash('MIB', mibUsername);
      if (mibProfileId) {
        await chrome.storage.local.set({ mib_profileId: mibProfileId, mib_profileType: mibProfileType || '0' });
      }
      
      // Store in backend
      if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
      const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanctumToken}`
        },
        body: JSON.stringify({
          hardware_id: terminalId,
          bank_account_id: bankAccountId,
          mib_username: mibUsername,
          key1: key1ToSave,
          key2: key2ToSave,
          app_id: sessionState.appId,
          profile_id: spProfileId,
          profile_type: spProfileType,
          profile_name: spProfileName,
          credentials_hash: credsHash
        })
      });
      if (!storeResp.ok) {
        const errText = await storeResp.text();
        throw new Error(`Server failed to store keys: Status ${storeResp.status} - ${errText}`);
      }
    }

    // After C42, use password (still in mibAuthTemp) to establish authenticated web session via A41
    if (flow === 'C42' && mibPassword && key1ToSave && key2ToSave) {
      try {
        if(port) emitLog(port, '> [MIB-API] Establishing web session via A41...');
        // sfunc=i resume with new keys
        const iPayload = { cmod: computeCmod().toString(), appId: sessionState.appId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
        const iResp = await executeMibSfunc('i', iPayload, key1ToSave, { key2: key2ToSave, sfunc: 'i' });
        const webSessionKey = await deriveSessionKey(iResp.smod);
        const webXxid = String(iResp.xxid);
        const webNonceGen = iResp.nonceGenerator;
        // A44 — get userSalt
        const a44Sodium = generateSodium();
        const a44Nonce = generateNonce(webNonceGen);
        const a44Payload = { sodium: a44Sodium, routePath: 'A44', xxid: webXxid, uname: mibUsername, nonce: a44Nonce, appId: sessionState.appId };
        const a44Resp = await executeMibSfunc('n', a44Payload, webSessionKey, { xxid: webXxid, sfunc: 'n' });
        if (a44Resp.success) {
          const userSalt = a44Resp.data?.[0]?.userSalt;
          if (userSalt) {
            // A41 — login init
            const a41Sodium = generateSodium();
            const a41Nonce = generateNonce(webNonceGen);
            const webClientSalt = generateClientSalt();
            const pgf03 = await computePgf03(mibPassword, userSalt, webClientSalt);
            const a41Payload = {
              sodium: a41Sodium, routePath: 'A41', xxid: webXxid, uname: mibUsername, clientSalt: webClientSalt, pgf03,
              nonce: a41Nonce, appId: sessionState.appId, pmodTime: 0,
              requireBankData: 1,
            };
            const a41Resp = await executeMibSfunc('n', a41Payload, webSessionKey, { xxid: webXxid, sfunc: 'n' });
            if (a41Resp.success) {
              if(port) emitLog(port, `> [MIB-API] A41 web login successful. Updating session with web xxid.`);
              sessionState.xxid = webXxid;
              sessionState.nonceGenerator = webNonceGen;
              sessionState.sessionKey = webSessionKey;
              // Save profile info from this A41 response
              const c42Profiles = a41Resp.operatingProfiles || a41Resp.payload?.login?.operatingProfiles || [];
              const c42First = c42Profiles[0] || {};
              if (c42First.profileId) {
                await chrome.storage.local.set({ mib_profileId: c42First.profileId, mib_profileType: c42First.profileType || '0' });
              }
            }
          }
        }
      } catch (e) {
        if(port) emitLog(port, `> [MIB-API] Web session setup failed (non-fatal): ${e.message}`);
      }
    }

    await chrome.storage.session.set({ mibSession: sessionState });
    await chrome.storage.session.remove('mibAuthTemp');
    return { success: true };
  } else {
    throw new Error(`OTP Verification failed: ${resp.reasonText || resp.message || JSON.stringify(resp)}`);
  }
}

async function ensureMibSession(port, terminalId, backendUrl, credentials, targetAccount) {
  let { mibSession } = await chrome.storage.session.get('mibSession');
  if (mibSession && mibSession.sessionKey) {
    // Validate cached session is still alive via lightweight A80 call
    try {
      const a80Payload = {
        nonce: generateNonce(mibSession.nonceGenerator),
        appId: mibSession.appId,
        sodium: generateSodium(),
        xxid: mibSession.xxid
      };
      const a80Resp = await executeMibSfunc('n', a80Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
      if (a80Resp.success) {
        return mibSession;
      }
      if(port) emitLog(port, '> [MIB-API] Cached session invalid, re-establishing...');
    } catch(e) {
      if (e instanceof MibSessionExpiredError) {
        if(port) emitLog(port, '> [MIB-API] Cached session expired, re-establishing...');
      } else {
        if(port) emitLog(port, `> [MIB-API] Cached session validation failed: ${e.message}`);
      }
    }
  }

  // Need to resume via sfunc=i
  if(port) emitLog(port, '> [MIB-API] No active session in memory. Attempting sfunc=i resume...');
  let localRes = await chrome.storage.local.get(['mib_appId', 'mib_key1', 'mib_key2']);
  if (!localRes.mib_appId || !localRes.mib_key1 || !localRes.mib_key2) {
    if(port) emitLog(port, '> [MIB-API] Local keys not found. Attempting server fetch...');
    const tokenRes = await chrome.storage.local.get('sanctumToken');
    if (!tokenRes.sanctumToken) throw new Error("Missing MIB device credentials and no auth token.");
    const params = new URLSearchParams({ hardware_id: terminalId });
    if (targetAccount) {
      params.append('account_number', targetAccount);
    }
    const keysResp = await fetch(`${backendUrl}/mib/keys?${params}`, {
      headers: { 'Authorization': `Bearer ${tokenRes.sanctumToken}` }
    });
    if (!keysResp.ok) throw new Error("Missing MIB device credentials. Please link account again.");
    const keysData = await keysResp.json();
    if (!keysData.key1 || !keysData.key2) throw new Error("Server has no MIB keys. Please link account again.");
    await chrome.storage.local.set({
      mib_key1: keysData.key1,
      mib_key2: keysData.key2,
      mib_appId: keysData.appId,
      mib_profileId: keysData.profileId || '',
      mib_profileType: keysData.profileType || '0'
    });
    localRes = { mib_appId: keysData.appId, mib_key1: keysData.key1, mib_key2: keysData.key2 };
  }

  const iPayload = { cmod: computeCmod().toString(), appId: localRes.mib_appId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
  try {
    const iResp = await executeMibSfunc('i', iPayload, localRes.mib_key1, { key2: localRes.mib_key2, sfunc: 'i' });
    mibSession = {
      appId: localRes.mib_appId,
      key1: localRes.mib_key1,
      key2: localRes.mib_key2,
      sessionKey: await deriveSessionKey(iResp.smod),
      xxid: String(iResp.xxid),
      nonceGenerator: iResp.nonceGenerator
    };
    await chrome.storage.session.set({ mibSession });
    if(port) emitLog(port, '> [MIB-API] Session resumed successfully.');

    // Select profile via P47 so WebView recognizes the session
    let profileSelected = false;
    try {
      const { mib_profileId, mib_profileType } = await chrome.storage.local.get(['mib_profileId', 'mib_profileType']);
      if (mib_profileId) {
        // FIX 2: Use the returned object to capture accountBalance from the P47 call
        const p47Result = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
        profileSelected = p47Result.selected;
        if (p47Result.accountBalance.length > 0) {
          await chrome.storage.session.set({ mib_accountBalance: p47Result.accountBalance });
          if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
        }
      } else {
        if(port) emitLog(port, '> [MIB-API] No saved profile. Skipping P47.');
      }
    } catch (e) {
      if(port) emitLog(port, `> [MIB-API] P47 failed (non-fatal): ${e.message}`);
    }

    // If P47 failed (None Authenticated Session) and credentials available, try A40 fallback
    const hasCreds = credentials?.username?.length > 0 && credentials?.password?.length > 0;

    // Fallback: check chrome.storage.session for cached credentials from a prior flow
    if (!hasCreds) {
      try {
        const { mib_stored_creds } = await chrome.storage.session.get('mib_stored_creds');
        if (mib_stored_creds?.username?.length > 0 && mib_stored_creds?.password?.length > 0) {
          credentials = mib_stored_creds;
          if(port) emitLog(port, '> [MIB-API] Using stored fallback credentials for A40.');
        } else {
          if(port) emitLog(port, `> [MIB-API] No stored credentials found for A40 fallback.`);
        }
      } catch(e) {}
    }
    const username = credentials?.username?.length > 0 ? credentials.username : '';
    const password = credentials?.password?.length > 0 ? credentials.password : '';
    if(port && !hasCreds && !username) emitLog(port, '> [MIB-API] WARNING: No MIB credentials available. A40 authentication will be skipped.');

    if (!profileSelected && username && password) {
      if(port) emitLog(port, '> [MIB-API] Attempting A40 authentication fallback...');
      try {
        const a40Sodium = generateSodium();
        const a40Nonce = generateNonce(mibSession.nonceGenerator);
        const a40Payload = {
          sodium: a40Sodium,
          routePath: 'A40',
          xxid: mibSession.xxid,
          uname: credentials.username,
          pgf02: credentials.password,
          pmodTime: 0,
          requireBankData: 1,
          nonce: a40Nonce,
          appId: mibSession.appId,
        };
        const a40Resp = await executeMibSfunc('n', a40Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
        if (a40Resp.success) {
          if(port) emitLog(port, '> [MIB-API] A40 authentication successful.');

          // Extract and save profile from A40 response
          // If profileSelected is true (single-profile fast-path), skip P47 and use accountBalance directly
          if (a40Resp.profileSelected) {
            if(port) emitLog(port, '> [MIB-API] A40 single-profile fast-path. Profile already selected.');
            profileSelected = true;
            // FIX 3: Capture the accountBalance returned directly by A40 on the single-profile fast-path
            if (Array.isArray(a40Resp.accountBalance) && a40Resp.accountBalance.length > 0) {
              await chrome.storage.session.set({ mib_accountBalance: a40Resp.accountBalance });
              if(port) emitLog(port, `> [MIB-API] A40 fast-path: cached ${a40Resp.accountBalance.length} account balance(s).`);
            }
            // Also save the selectedProfileId so future P47 calls use the right profile
            if (a40Resp.selectedProfileId) {
              await chrome.storage.local.set({
                mib_profileId: a40Resp.selectedProfileId,
                mib_profileType: a40Resp.selectedProfileType || '0'
              });
            }

          } else {
            const a40Profiles = a40Resp.operatingProfiles || [];
            if (a40Profiles.length > 0) {
              // FIX 4: Always use customerProfileId (P47 payload field) — fall back to profileId only if missing
              const prof = a40Profiles[0];
              const profileId = prof.customerProfileId || prof.profileId;
              const profileType = prof.profileType || '0';
              await chrome.storage.local.set({ mib_profileId: profileId, mib_profileType: profileType });
              if(port) emitLog(port, `> [MIB-API] Saved profile from A40: customerProfileId=${profileId} (type ${profileType}).`);
              // Retry P47 with the saved profile; capture and store the returned balance
              const p47Result = await attemptP47(port, mibSession, profileId, profileType);
              profileSelected = p47Result.selected;
              if (p47Result.accountBalance.length > 0) {
                await chrome.storage.session.set({ mib_accountBalance: p47Result.accountBalance });
                if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
              }
            } else {
              // Single-profile fast-path — A40 may return accountBalance directly
              if (a40Resp.selectedProfileId) {
                await chrome.storage.local.set({
                  mib_profileId: a40Resp.selectedProfileId,
                  mib_profileType: a40Resp.selectedProfileType || '0'
                });
                const p47Result = await attemptP47(port, mibSession, a40Resp.selectedProfileId, a40Resp.selectedProfileType || '0');
                profileSelected = p47Result.selected;
                if (p47Result.accountBalance.length > 0) {
                  await chrome.storage.session.set({ mib_accountBalance: p47Result.accountBalance });
                  if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
                }
              } else {
                if(port) emitLog(port, '> [MIB-API] A40 returned no profiles. Trying A80...');
                // Try A80 fallback to see if session is usable
                try {
                  const a80Payload = {
                    nonce: generateNonce(mibSession.nonceGenerator),
                    appId: mibSession.appId,
                    sodium: generateSodium(),
                    xxid: mibSession.xxid
                  };
                  const a80Resp = await executeMibSfunc('n', a80Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
                  if (a80Resp.success) {
                    if(port) emitLog(port, '> [MIB-API] A80 fallback succeeded.');
                    profileSelected = true; // session is authenticated even without explicit profile
                  }
                } catch (a80e) {
                  if(port) emitLog(port, `> [MIB-API] A80 fallback also failed: ${a80e.message}`);
                }
              }
            }
          }
        } else {
          if(port) emitLog(port, `> [MIB-API] A40 authentication failed: ${a40Resp.reasonText}`);
        }
      } catch (a40e) {
        if(port) emitLog(port, `> [MIB-API] A40 fallback error: ${a40e.message}`);
      }
    }

    // Log cookies after session setup
    chrome.cookies.getAll({ domain: 'mib.com.mv' }, (cookies) => {
      if(port) emitLog(port, `> [MIB-API] Cookies after session setup: ${cookies.map(c => `${c.name}=${c.value.substring(0,30)}`).join(', ')}`);
    });
    return mibSession;
  } catch(e) {
    if (e instanceof MibSessionExpiredError || /stale keys/i.test(e.message)) {
      if(port) emitLog(port, '> [MIB-API] Keys expired. Attempting sfunc=r re-registration...');
      try {
        const rSodium = generateSodium();
        const rXxid = generateXxid();
        const rAppId = localRes.mib_appId || generateAppId();
        const rPayload = { cmod: computeCmod().toString(), appId: rAppId, routePath: 'S40', sodium: rSodium, xxid: rXxid };
        const rResp = await executeMibSfunc('r', rPayload, DEFAULT_KEY, { sfunc: 'r' });
        if (!rResp.success || !rResp.key1 || !rResp.key2) {
          throw new Error(`sfunc=r re-registration failed: ${rResp?.reasonText || 'no keys returned'}`);
        }
        if(port) emitLog(port, '> [MIB-API] sfunc=r re-registration succeeded. Got fresh keys.');
        const freshAppId = rResp.appId || rAppId;
        await chrome.storage.local.set({ mib_key1: rResp.key1, mib_key2: rResp.key2, mib_appId: freshAppId });
        // Upload fresh keys to server
        try {
          const { sanctumToken, mib_profileId, mib_profileType } = await chrome.storage.local.get(['sanctumToken', 'mib_profileId', 'mib_profileType']);
          if (sanctumToken) {
            const mibUsername = credentials?.username || '';
            const credsHash = await computeCredsHash('MIB', mibUsername);
            await fetch(`${backendUrl}/mib/keys/store`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${sanctumToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hardware_id: terminalId,
                bank_account_id: 0,
                mib_username: mibUsername,
                key1: rResp.key1,
                key2: rResp.key2,
                app_id: freshAppId,
                profile_id: mib_profileId || 'default_profile',
                profile_type: mib_profileType || '0',
                profile_name: 'Re-registered Profile',
                credentials_hash: credsHash
              })
            });
          }
        } catch (uploadErr) {
          if(port) emitLog(port, `> [MIB-API] Warning: failed to upload fresh keys to server: ${uploadErr.message}`);
        }
        // Retry with new keys
        const iResp = await executeMibSfunc('i', iPayload, rResp.key1, { key2: rResp.key2, sfunc: 'i' });
        mibSession = {
          appId: freshAppId, key1: rResp.key1, key2: rResp.key2,
          sessionKey: await deriveSessionKey(iResp.smod),
          xxid: String(iResp.xxid), nonceGenerator: iResp.nonceGenerator
        };
        await chrome.storage.session.set({ mibSession });
        if(port) emitLog(port, '> [MIB-API] Session re-established with fresh keys.');
        // Retry profile selection + A40 fallback
        let profileSelected = false;
        try {
          const { mib_profileId, mib_profileType } = await chrome.storage.local.get(['mib_profileId', 'mib_profileType']);
          if (mib_profileId) profileSelected = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
        } catch (pe) { /* ignore */ }
        // Try fallback credentials from session storage if PWA didn't provide them
        if (!profileSelected && (!credentials?.username?.length || !credentials?.password?.length)) {
          try {
            const { mib_stored_creds } = await chrome.storage.session.get('mib_stored_creds');
            if (mib_stored_creds?.username?.length > 0 && mib_stored_creds?.password?.length > 0) {
              if(port) emitLog(port, '> [MIB-API] Using stored fallback credentials for A40 (re-registration path).');
              credentials = mib_stored_creds;
            }
          } catch(e) {}
        }
        if (!profileSelected && credentials?.username?.length > 0 && credentials?.password?.length > 0) {
          try {
            const a40Sodium = generateSodium();
            const a40Nonce = generateNonce(mibSession.nonceGenerator);
            const a40Payload = {
              sodium: a40Sodium, routePath: 'A40', xxid: mibSession.xxid,
              uname: credentials.username, pgf02: credentials.password,
              pmodTime: 0, requireBankData: 1, nonce: a40Nonce, appId: mibSession.appId,
            };
            const a40Resp = await executeMibSfunc('n', a40Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
            if (a40Resp.success) {

              if (a40Resp.profileSelected) {
                if(port) emitLog(port, '> [MIB-API] Re-auth A40 fast-path. Profile already selected.');
                profileSelected = true;
              // Extract balance for current targetAccount from A40 (removed in favor of dynamic A80 fetch)
              } else {
                const a40Profiles = a40Resp.operatingProfiles || [];
                if (a40Profiles.length > 0) {
                  const pid = a40Profiles[0].profileId || a40Profiles[0].customerProfileId;
                  const pt = a40Profiles[0].profileType || '0';
                  await chrome.storage.local.set({ mib_profileId: pid, mib_profileType: pt });
                  profileSelected = await attemptP47(port, mibSession, pid, pt);
                } else if (a40Resp.selectedProfileId) {
                  await chrome.storage.local.set({ mib_profileId: a40Resp.selectedProfileId, mib_profileType: a40Resp.selectedProfileType || '0' });
                  profileSelected = await attemptP47(port, mibSession, a40Resp.selectedProfileId, a40Resp.selectedProfileType || '0');
                } else {
                  const a80Payload = { nonce: generateNonce(mibSession.nonceGenerator), appId: mibSession.appId, sodium: generateSodium(), xxid: mibSession.xxid };
                  const a80Resp = await executeMibSfunc('n', a80Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
                  if (a80Resp.success) profileSelected = true;
                }
              }
            }
          } catch (a40e) { if(port) emitLog(port, `> [MIB-API] Re-auth A40 failed: ${a40e.message}`); }
        }
        chrome.cookies.getAll({ domain: 'mib.com.mv' }, (cookies) => {
          if(port) emitLog(port, `> [MIB-API] Cookies after re-session: ${cookies.map(c => `${c.name}=${c.value.substring(0,30)}`).join(', ')}`);
        });
        return mibSession;
      } catch (rE) {
        if(port) emitLog(port, `> [MIB-API] Re-registration failed: ${rE.message}`);
        throw new Error("Missing MIB device credentials. Please link account again.");
      }
    }
    throw new Error("Failed to resume MIB session. Keys may be stale.");
  }
}

async function attemptP47(port, mibSession, profileId, profileType) {
  const p47Sodium = generateSodium();
  const p47Nonce = generateNonce(mibSession.nonceGenerator);
  const p47Payload = {
    profileType: profileType || '0',
    customerProfileId: profileId,
    nonce: p47Nonce,
    appId: mibSession.appId,
    sodium: p47Sodium,
    routePath: 'P47',
    xxid: mibSession.xxid
  };
  try {
    const p47Resp = await executeMibSfunc('n', p47Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
    if (p47Resp.success) {
      if(port) emitLog(port, '> [MIB-API] P47 profile selected successfully.');
      // FIX 1: Return the full accountBalance array instead of a bare boolean
      return { selected: true, accountBalance: Array.isArray(p47Resp.accountBalance) ? p47Resp.accountBalance : [] };
    } else {
      if(port) emitLog(port, `> [MIB-API] P47 failed: ${p47Resp.reasonText}`);
      return { selected: false, accountBalance: [] };
    }
  } catch (e) {
    if(port) emitLog(port, `> [MIB-API] P47 error: ${e.message}`);
    return { selected: false, accountBalance: [] };
  }
}

async function runMibApiFlow(credentials, targetAccount, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login', hardwareId = '', backendUrl = '') {
  emitLog(port, `> [MIB-API] Starting API ledger flow (mode: ${mode})...`);
  let last3Txs = [];
  
  try {
    // Cache valid credentials from PWA for A40 fallback on subsequent calls
    if (credentials?.username?.length > 0 && credentials?.password?.length > 0) {
      await chrome.storage.session.set({ mib_stored_creds: credentials });
      if(port) emitLog(port, `> [MIB-API] Cached credentials for A40 fallback.`);
    }
    
    const mibSession = await ensureMibSession(port, hardwareId, backendUrl, credentials, targetAccount);
    
    // Check if ensureMibSession saved a balance from A40 into session storage
    let accountBalance = null;

    if (sessionMode === 'claim_and_login') {
      emitLog(port, `> [MIB-API] Session claimed. Auth sequence complete.`);
      port.postMessage({ type: 'success', match: null, login_success: true, transactions: [] });
      return;
    }

    // The encrypted API (with credentials:'include') should have set session cookies.
    // Set explicit cookies for the WebView subdomain so the WebView recognizes the session.
    const wvDomain = 'faisamobilex-wv.mib.com.mv';
    const setMibCookies = (domain) => new Promise((resolve) => {
      let done = 0;
      const cb = () => { if (++done === 5) resolve(); };
      chrome.cookies.set({ url: `https://${domain}/`, name: 'xxid', value: mibSession.xxid, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'IBSID', value: mibSession.xxid, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'mbnonce', value: mibSession.nonceGenerator, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'mbmodel', value: 'IOS-1.0', domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'time-tracker', value: '597', domain, path: '/' }, cb);
    });
    await setMibCookies(wvDomain);

    // FIX 5: Read the balance cached during session setup (from A40 fast-path or P47 inside ensureMibSession)
    // This avoids a redundant P47 call and ensures we use the balance already fetched.
    {
      const { mib_accountBalance } = await chrome.storage.session.get('mib_accountBalance');
      if (Array.isArray(mib_accountBalance) && mib_accountBalance.length > 0) {
        const match = mib_accountBalance.find(a => String(a.accountNumber).trim() === String(targetAccount).trim());
        if (match) {
          accountBalance = match.availableBalance || match.currentBalance || null;
          if (port) emitLog(port, `> [MIB-API] 💰 Balance from session cache: ${accountBalance}`);
        } else {
          if (port) emitLog(port, `> [MIB-API] Session cache has ${mib_accountBalance.length} account(s) but none matched ${targetAccount}. Accounts: ${mib_accountBalance.map(a => a.accountNumber).join(', ')}`);
        }
      }
    }

    // If still no balance, make a fresh P47 call (e.g. session was restored from a previous flow that didn't cache balance)
    if (!accountBalance) {
      try {
        const { mib_profileId, mib_profileType } = await chrome.storage.local.get(['mib_profileId', 'mib_profileType']);
        if (mib_profileId) {
          if (port) emitLog(port, `> [MIB-API] Querying live bank balance via P47 (no cached balance)...`);
          const p47Result = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
          if (p47Result.selected && p47Result.accountBalance.length > 0) {
            // Store for future use
            await chrome.storage.session.set({ mib_accountBalance: p47Result.accountBalance });
            const match = p47Result.accountBalance.find(a => String(a.accountNumber).trim() === String(targetAccount).trim());
            if (match) {
              accountBalance = match.availableBalance || match.currentBalance || null;
              if (port) emitLog(port, `> [MIB-API] 💰 Live balance from bank: ${accountBalance}`);
            } else {
              if (port) emitLog(port, `> [MIB-API] ⚠️ P47 returned ${p47Result.accountBalance.length} account(s) but none matched ${targetAccount}. Accounts in response: ${p47Result.accountBalance.map(a => a.accountNumber).join(', ')}`);
            }
          }
        }
      } catch (e) {
        if (port) emitLog(port, `> [MIB-API] P47 balance query failed: ${e.message}`);
      }
    }

    if (accountBalance) {
      emitLog(port, `> [MIB-API] Final resolved balance: ${accountBalance}`);
    }

    const detailsUrl = `https://${wvDomain}//accountDetails?trxh=1&dashurl=1&accountNo=${targetAccount}`;
    emitLog(port, `> [MIB-API] Fetching transactions from ${wvDomain}/ajaxAccounts/trxHistory...`);
    const trxRes = await fetch(`https://${wvDomain}/ajaxAccounts/trxHistory`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': detailsUrl
      },
      body: buildFormBody({
        accountNo: targetAccount,
        trxNo: '',
        trxType: '0',
        sortTrx: 'date',
        sortDir: 'desc',
        fromDate: '',
        toDate: '',
        start: '0',
        end: '20',
        includeCount: '1'
      })
    });

    if (trxRes.status !== 200) {
      const errBody = await trxRes.text().catch(() => '');
      emitLog(port, `> [MIB-API] WebView API error body: ${errBody.substring(0, 500)}`);
      throw new Error(`WebView API returned HTTP ${trxRes.status}`);
    }

    const data = await trxRes.json();
    logApiDebug(port, data, 'MIB-HISTORY');

    if (!data.success) {
      throw new Error("WebView API response indicated failure.");
    }

    const allTxs = data.data || [];
    emitLog(port, `> [MIB-API] Found ${allTxs.length} transactions.`);

    // Normalize MIB WebView transactions
    const formattedTxs = allTxs.map(t => {
      let isCredit = parseFloat(t.baseAmount || 0) >= 0;
      let dt = t.trxDate;
      let amt = parseFloat(t.absAmount || 0);
      let descRaw = t.descr1 || "";
      let desc2 = t.descr2 || "";
      let desc3 = t.descr3 || "";
      let fromAcc = t.fromAcc || "";
      let benefName = t.benefName || "";
      let otherAcc = t.otherAccountNo && t.otherAccountNo !== "-" ? t.otherAccountNo : "";

      // Build multi-line details: descr1 as title (first line), then extra fields
      // - fromAcc: sender name
      // - otherAcc: counterparty account number  
      // - desc2: transaction reference code
      // Note: descr3 is already shown as narrative3 below title in Column 3
      // Note: trxNumber is shown as a copiable chip via reference field
      const extraLines = [
        fromAcc ? `From: ${fromAcc}` : "",
        benefName && benefName !== desc3 ? `Beneficiary: ${benefName}` : "",
        otherAcc ? `Account: ${otherAcc}` : "",
        desc2 ? `Ref: ${desc2}` : "",
      ].filter(Boolean).join('\n');
      const details = extraLines ? `${descRaw}\n\n${extraLines}` : descRaw;

      return {
        id: String(t.trxNumber || t.trxNumber2 || Math.random()),
        date: dt,
        details: details,
        reference: t.trxNumber || t.trxNumber2 || "",
        amount: (isCredit ? '+' : '-') + amt.toFixed(2),
        balance: 0,
        minus: !isCredit,
        narrative1: desc3,
        narrative2: desc2,
        narrative3: desc3,
        is_pending: false,
        raw: t
      };
    });

    if (mode === 'fetch_only') {
      port.postMessage({ type: 'statement_success', transactions: formattedTxs, balance: accountBalance || '0.00' });
      return;
    }

    if (mode === 'ledger' || mode === 'history') {
      port.postMessage({
        type: 'success',
        match: null,
        transactions: formattedTxs,
        balance: accountBalance || '0.00',
        login_success: true
      });
      return;
    }

    // Match logic for 'search' mode
    const searchAmt = parseFloat(targetAmount);
    let matchedTx = null;

    for (const tx of formattedTxs) {
      if (!tx.minus && tx.amount === searchAmt) {
        matchedTx = tx;
        break;
      }
    }

    if (matchedTx) {
      emitLog(port, `> [MIB-API] Match FOUND for ${targetAmount}.`);
      port.postMessage({ type: 'success', match: matchedTx, login_success: true, transactions: formattedTxs.slice(0, 3), balance: accountBalance || '0.00' });
    } else {
      emitLog(port, `> [MIB-API] No match found for ${targetAmount}.`);
      port.postMessage({ type: 'not_found', transactions: formattedTxs.slice(0, 3), login_success: true });
    }

  } catch (error) {
    try {
      emitLog(port, `> [MIB-API] ERROR: ${error.message}`);
      if (mode === 'fetch_only') {
        port.postMessage({ type: 'statement_error', error: error.message });
      } else {
        port.postMessage({ type: 'error', error: error.message });
      }
    } catch(e) {
      // port may be disconnected
    }
  }
}


