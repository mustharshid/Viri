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

async function enableBankLockdown() {
  chrome.storage.local.get(['viri_bml_login_procedure'], async (res) => {
    const procedure = res.viri_bml_login_procedure || 'legacy';
    const rules = [];
    
    if (procedure !== 'api') {
      rules.push({
        id: 10,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "bankofmaldives.com.mv",
          resourceTypes: ["main_frame", "sub_frame"]
        }
      });
    }


    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [10, 11],
        addRules: rules
      });
      console.log("[Viri Bridge] Bank lockdown rules activated. BML procedure:", procedure);
    } catch (err) {
      console.error("[Viri Bridge] Failed to activate lockdown rules:", err);
    }
  });
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
    enableBankLockdown();

    port.onMessage.addListener(async (msg) => {
      if (msg.payload && msg.payload.debugLogMibHtml !== undefined) {
        debugLogMibHtml = !!msg.payload.debugLogMibHtml;
        chrome.storage.local.set({ viri_debug_log_mib_html: debugLogMibHtml });
      }

      if (msg.payload && msg.payload.bmlLoginProcedure) {
        chrome.storage.local.set({ viri_bml_login_procedure: msg.payload.bmlLoginProcedure }, () => {
          enableBankLockdown();
        });
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
            if (payload.mibLoginProcedure === 'api') {
              await runMibApiFlow(payload.credentials, targetAcc, port, payload.amount, payload.mibProfileType || '0', mode, sessionMode, payload.hardwareId, payload.backendUrl);
            } else if (payload.mibProfileType === '1') {
              await runMibMultiProfileFlow(payload.credentials, targetAcc, payload.accountName, port, payload.amount, mode, sessionMode);
            } else {
              await runMibFlow(payload.credentials, targetAcc, port, payload.amount, payload.mibProfileType || '0', mode, sessionMode);
            }
          } else {
            if (payload.bmlLoginProcedure === 'api') {
              await runBmlApiFlow(payload.credentials, targetAcc, payload.accountName, port, payload.amount, payload.bmlProfileType || '0', mode, sessionMode, payload.bmlAuthState, payload.hardwareId, payload.backendUrl);
            } else {
              await runBmlFlow(payload.credentials, targetAcc, port, payload.amount, mode, sessionMode);
            }
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
            if (req.mib_profile_type === '1') {
              await runMibMultiProfileFlow(payload.credentials, targetAcc, req.account_name, port, req.target_amount || '1.00', req.request_type, 'fetch_only');
            } else {
              await runMibFlow(payload.credentials, targetAcc, port, req.target_amount || '1.00', '0', req.request_type, 'fetch_only');
            }
          } else {
            const bmlLoginProcedure = heldSession ? (heldSession.bmlLoginProcedure || 'legacy') : (req.bmlLoginProcedure || 'legacy');
            if (bmlLoginProcedure === 'api') {
              const bmlAuthState = heldSession ? heldSession.bmlAuthState : req.bml_auth_state;
              const bmlProfileType = heldSession ? (heldSession.bmlProfileType || '0') : (req.bml_profile_type || '0');
              await runBmlApiFlow(payload.credentials, targetAcc, req.account_name, port, req.target_amount || '1.00', bmlProfileType, req.request_type, 'fetch_only', bmlAuthState, req.hardware_id || payload.hardwareId, req.backend_url || payload.backendUrl);
            } else {
              await runBmlFlow(payload.credentials, targetAcc, port, req.target_amount || '1.00', req.request_type, 'fetch_only');
            }
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
      else if (msg.action === 'CLAIM_SESSION') {
        heldSession = {
          accountId: msg.payload.accountId,
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
async function runBmlFlow(credentials, targetAccount, port, targetAmount, mode = 'search', sessionMode = 'fresh_login') {
  emitLog(port, `> [BML] Starting background auth flow (sessionMode: ${sessionMode})...`);
  let last3Txs = [];

  let xsrfToken = null;
  if (sessionMode !== 'fetch_only') {
    globalInertiaVersion = "";
  }
  let bmlClockOffset = 0;

  async function getXsrfToken() {
    return new Promise((resolve) => {
      chrome.cookies.get({ url: "https://www.bankofmaldives.com.mv", name: "XSRF-TOKEN" }, (cookie) => {
        resolve(cookie ? decodeURIComponent(cookie.value) : null);
      });
    });
  }

  // -- Helper: Follow Inertia 409 redirect chain (matching Python _handle_inertia_response) --
  async function handleInertiaRedirects(initialRes, currentVersion = '') {
    let currentRes = initialRes;
    let version = currentVersion || initialRes.headers.get('X-Inertia-Version') || '';
    
    while (currentRes.status === 409) {
      const redirectUrl = currentRes.headers.get('X-Inertia-Location');
      if (!redirectUrl) break;
      
      let fullUrl;
      if (redirectUrl.startsWith('http')) {
        fullUrl = redirectUrl;
      } else if (redirectUrl.startsWith('/internetbanking')) {
        fullUrl = `https://www.bankofmaldives.com.mv${redirectUrl}`;
      } else {
        fullUrl = `${BASE_URL}${redirectUrl}`;
      }
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

  let loginSuccess = sessionMode === 'fetch_only';
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

    loginSuccess = true;

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
    const preOverviewVersion = globalInertiaVersion;
    await getFreshXsrfToken('/vf/accounts/overview');

    // Detect session expiry in fetch_only mode: if the Inertia version is still blank after
    // the token refresh, BML served an HTML login redirect (200 + <!doctype>) instead of JSON.
    if (sessionMode === 'fetch_only' && !globalInertiaVersion && !preOverviewVersion) {
      emitLog(port, `> [BML] ⚠ Session appears expired (no Inertia version after overview refresh in fetch_only mode). Falling back to fresh_login...`);
      return await runBmlFlow(credentials, targetAccount, port, targetAmount, mode, 'fresh_login');
    }

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
      // In fetch_only mode a 401 means the bank session expired — fall back to a fresh login
      // rather than reporting failure, so the user's request still succeeds.
      if (sessionMode === 'fetch_only') {
        emitLog(port, `> [BML] ⚠ Dashboard returned HTTP ${dashboardRes.status} in fetch_only mode. Session expired — falling back to fresh_login...`);
        return await runBmlFlow(credentials, targetAccount, port, targetAmount, mode, 'fresh_login');
      }
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
    emitLog(port, `> [BML] Step 7: Scraping recent transaction history (Endpoint: ${BASE_URL}/api/account/${bmlAccountId}/history/today)...`);
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
        transactions: last3Txs,
        raw_history: mergedHistory
      });
    } else {
      if (matchFound) {
        emitLog(port, `> [Viri Bridge] EXACT MATCH: Ref ${matchFound.reference || matchFound.id}`);
        const normalizedMatch = normalizeTransactions([matchFound], 'BML', 1)[0];
        port.postMessage({
          type: 'success',
          data: {
            status: 'CREDITED',
            reference: matchFound.reference || matchFound.id || "BML-MATCH",
            amount: Math.abs(matchFound.amount).toFixed(2),
            timestamp: parseBmlNarrativeDate(matchFound)?.toISOString() || matchFound.date || matchFound.bookingDate || new Date().toISOString(),
            transaction: normalizedMatch
          },
          balance: balance,
          transactions: last3Txs,
          raw_history: mergedHistory
        });
      } else {
        throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR.`);
      }
    }

  } catch (error) {
    emitLog(port, `> [BML] FATAL ERROR: ${error.message}`);
    const isAuth = !!error.auth_failed || /invalid credentials|mfa failed|incorrect|unauthorized|auth/i.test(error.message);
    port.postMessage({ 
      type: "error", 
      error: error.message, 
      transactions: last3Txs || [],
      login_success: loginSuccess,
      auth_failed: isAuth
    });
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

function extractNameAroundId(html, id) {
  const index = html.indexOf(id);
  if (index === -1) return '';

  const start = Math.max(0, index - 300);
  const end = Math.min(html.length, index + 300);
  const snippet = html.substring(start, end);

  // 1. Try to find if it is inside a tag with text content:
  // e.g. <a ...onclick="...ID...">Name</a>
  const tagPattern = new RegExp(`<[^>]+(?:switchProfile|profileid|profile-id|value|id)[^>]*?${id}[^>]*>([^<]{2,100})<\/[a-z0-9]+>`, 'i');
  const tagMatch = tagPattern.exec(snippet);
  if (tagMatch && tagMatch[1]) {
    const text = tagMatch[1].trim();
    if (text && !/^(switch|select|go|click|here|view|details|active)$/i.test(text)) {
      return text;
    }
  }

  // 2. Try to find the closest text block of capitalized/alphanumeric words in the snippet
  const cleanText = snippet
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\s+/g, '\n');
  
  const lines = cleanText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 2);

  const candidateNames = lines.filter(line => {
    if (/^[0-9\s]+$/.test(line)) return false;
    if (/(?:function|switchProfile|javascript|void|null|true|false|return|var|const|let|document|window)/i.test(line)) return false;
    if (/^(switch|select|go|click|here|view|details|active|profile|type|id|rtag|tag)$/i.test(line)) return false;
    return /^[a-z0-9\s,&.\'-]{3,50}$/i.test(line);
  });

  if (candidateNames.length > 0) {
    let bestName = '';
    let minDist = 999999;
    for (const name of candidateNames) {
      const nameIndex = snippet.indexOf(name);
      if (nameIndex !== -1) {
        const dist = Math.abs(nameIndex - 300);
        if (dist < minDist) {
          minDist = dist;
          bestName = name;
        }
      }
    }
    if (bestName) return bestName;
  }

  return '';
}

/**
 * Parse profiles from MIB profiles HTML page
 */
function parseProfilesFromHtml(html) {
  // Strip img tags to remove massive base64 inline images that break regex lookaheads
  html = html.replace(/<img[^>]*>/gi, '');
  const profiles = [];
  
  // 1. Parse profile cards from elements with class="profile-card"
  const cardTagPattern = /<[^>]+class=["'][^"']*profile-card[^"']*["'][^>]*>/gi;
  let match;
  while ((match = cardTagPattern.exec(html)) !== null) {
    const startTag = match[0];
    const startIndex = match.index + startTag.length;
    
    const rtMatch = /data-rt=["']([^"']+)["']/i.exec(startTag);
    const typeMatch = /data-profiletype\s*=\s*["']([^"']+)["']/i.exec(startTag);
    const idMatch = /data-profileid=["']([^"']+)["']/i.exec(startTag);
    
    if (idMatch) {
      const windowContent = html.substring(startIndex, startIndex + 2000);
      const nameMatch = /class=["']profile-name["'][^>]*>([^<]+)/i.exec(windowContent);
      
      profiles.push({
        id: idMatch[1],
        type: typeMatch ? typeMatch[1].trim() : '0',
        rTag: rtMatch ? rtMatch[1] : null,
        name: nameMatch ? nameMatch[1].trim() : (typeMatch ? typeMatch[1].trim() : 'unknown')
      });
    }
  }
  
  // 1.5 Parse option elements (e.g. select dropdown options)
  if (profiles.length === 0) {
    const optionPattern = /<option[^>]+value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let optMatch;
    while ((optMatch = optionPattern.exec(html)) !== null) {
      const id = optMatch[1];
      const name = optMatch[2].replace(/<[^>]+>/g, '').trim();
      if (name && !name.toLowerCase().includes('select')) {
        profiles.push({
          id,
          type: '1',
          rTag: null,
          name
        });
      }
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
      const name = extractNameAroundId(html, id) || `ID: ${id}`;
      profiles.push({ id, type: '1', rTag: null, name });
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
  if (sessionMode !== 'fresh_login' && sessionMode !== 'claim_and_login') {
    if (currentMibRTag) {
      rTag = currentMibRTag;
    } else {
      const res = await chrome.storage.local.get(['viri_mib_rtag']);
      if (res.viri_mib_rtag) {
        currentMibRTag = res.viri_mib_rtag;
        rTag = currentMibRTag;
      }
    }
  }
  
  function updateRTag(newTag) {
    if (newTag) {
      rTag = newTag;
      currentMibRTag = newTag;
      chrome.storage.local.set({ viri_mib_rtag: newTag });
    }
  }

  let mibClockOffset = 0;
  let loginSuccess = sessionMode === 'fetch_only';

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
    const t0 = Date.now();
    const authPageRes = await mibFetch(`${MIB_BASE_URL}/auth`, {
      headers: { 'User-Agent': USER_AGENT }
    }, port);
    const t3 = Date.now();

    if (!authPageRes.ok) {
      throw new Error(`MIB auth page load failed: HTTP ${authPageRes.status}`);
    }

    // Calculate MIB server clock offset dynamically from the response Date header using RTT-aware NTP calculation
    mibClockOffset = 0;
    const serverDateHeader = authPageRes.headers.get('date');
    if (serverDateHeader) {
      const rtt = t3 - t0;
      const serverTime = new Date(serverDateHeader).getTime() + Math.round(rtt / 2);
      mibClockOffset = serverTime - t3;
      emitLog(port, `> [MIB] Calculated MIB server clock offset (RTT-aware): ${mibClockOffset}ms (RTT: ${rtt}ms)`);
    }

    const authPageHtml = await authPageRes.text();
    updateRTag(extractRTag(authPageHtml));
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
      emitLog(port, `> [MIB] Plain credentials validation: username provided, password provided`);
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
      const err = new Error(`MIB authentication failed: ${xAuthData.reasonText || xAuthData.message || 'Invalid credentials'}`);
      err.auth_failed = true;
      throw err;
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
    try { updateRTag(extractRTag(dashHtml)); } catch (e) {
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
    try { updateRTag(extractRTag(auth2faHtml)); } catch (e) {
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
    const otpCode = "000000";

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
      const err = new Error(`MIB OTP verification failed: ${otpData.message || 'Invalid OTP'}`);
      err.auth_failed = true;
      throw err;
    }
    emitLog(port, `> [MIB] ✓ OTP verified successfully (HTTP ${otpRes.status}).`);
    loginSuccess = true;

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
    logApiDebug(port, profilesHtml, 'MIB');
    try {
      rTag = extractRTag(profilesHtml);
    } catch (e) {
      emitLog(port, `> [MIB] DEBUG: profilesHtml content snippet: ${profilesHtml.substring(0, 1000)}`);
      throw e;
    }
    const profiles = parseProfilesFromHtml(profilesHtml);
    const profileNames = profiles.map(p => p.name || 'Unknown').join(', ');
    emitLog(port, `> [MIB] Found ${profiles.length} profile(s): [${profileNames}]`);

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
    const foundAccNos = parsedAccounts.map(a => a.accountNo).join(', ');
    emitLog(port, `> [MIB] Found ${parsedAccounts.length} account(s) in dashboard: [${foundAccNos}]`);

    // If fetch_only mode returned 0 accounts, the session has expired — fall back to fresh login
    if (sessionMode === 'fetch_only' && parsedAccounts.length === 0) {
      emitLog(port, `> [MIB] ⚠ Session appears expired (0 accounts in fetch_only mode). Falling back to fresh_login...`);
      return await runMibFlow(credentials, targetAccount, port, targetAmount, profileType, mode, 'fresh_login');
    }

    // Extract rTag from accounts page if we don't have one yet (e.g. fetch_only mode)
    if (!rTag) {
      try {
        updateRTag(extractRTag(accountsHtml));
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
        // Extract rTag from details page for the trxHistory POST only if missing
        if (!rTag) {
          try {
            updateRTag(extractRTag(detailsHtml));
            emitLog(port, `> [MIB] ✓ Refreshed rTag from details page: ${rTag.substring(0, 8)}...`);
          } catch (e) {
            emitLog(port, `> [MIB] Could not extract rTag from details page — keeping previous.`);
          }
        }
      } catch (err) {
        emitLog(port, `> [MIB] Error parsing balance: ${err.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 9: Fetch Transaction History — POST /ajaxAccounts/trxHistory
    // HAR: Status 200, empty fromDate/toDate (no date filtering)
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [MIB] Step 9: Fetching transaction history for ${matchedAccountNo} (Endpoint: ${MIB_BASE_URL}/ajaxAccounts/trxHistory)...`);

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
        // Use foreignAmount for non-MVR accounts (e.g. USD) to match against actual currency values
        const rawAmt = (tx.foreignAmount !== undefined && tx.foreignAmount !== null && tx.curCodeDesc && tx.curCodeDesc !== 'MVR')
          ? parseFloat(tx.foreignAmount) || 0
          : parseFloat(tx.amount || tx.baseAmount) || 0;
        const txAmount = Math.abs(rawAmt);
        const isCredit = rawAmt > 0 || tx.type === 'credit' || tx.credit || tx.trxType === 'credit';
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
        transactions: last3Txs,
        raw_history: transactions
      });
    } else {
      if (matchFound) {
        emitLog(port, `> [Viri Bridge] MIB VERIFICATION SUCCESS: ${matchFound.reference || matchFound.description || 'Transaction matched'}`);
        const normalizedMatch = normalizeTransactions([matchFound], 'MIB', 1)[0];
        port.postMessage({
          type: 'success',
          data: {
            status: 'CREDITED',
            reference: matchFound.reference || matchFound.descr1 || matchFound.description || 'MIB-MATCH',
            amount: Math.abs(parseFloat(
              (matchFound.foreignAmount !== undefined && matchFound.foreignAmount !== null && matchFound.curCodeDesc && matchFound.curCodeDesc !== 'MVR')
                ? matchFound.foreignAmount
                : (matchFound.amount || matchFound.baseAmount)
            )).toFixed(2),
            timestamp: matchFound.date || matchFound.bookingDate || new Date().toISOString(),
            transaction: normalizedMatch
          },
          balance: mibBalance,
          transactions: last3Txs,
          raw_history: transactions
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
        const isAuth = !!error.auth_failed || /auth failed|otp verification failed|invalid credentials/i.test(error.message);
        port.postMessage({ 
          type: 'error', 
          error: error.message, 
          transactions: last3Txs || [],
          login_success: loginSuccess,
          auth_failed: isAuth
        });
      } catch (e) { /* port might already be dead */ }
    }
  }
}

function findMostSimilarProfile(profiles, targetName) {
  if (!profiles || profiles.length === 0) return null;
  if (!targetName) return profiles[0];

  const normalize = (str) => {
    return str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\b(pvt|ltd|co|private|limited|investments|holdings|group|company)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normTarget = normalize(targetName);
  const targetTokens = normTarget.split(' ').filter(t => t.length > 0);

  let bestProfile = profiles[0];
  let maxScore = -1;

  for (const profile of profiles) {
    const profileName = profile.name || '';
    const normProfile = normalize(profileName);
    const profileTokens = normProfile.split(' ').filter(t => t.length > 0);

    let score = 0;
    for (const t of targetTokens) {
      if (profileTokens.includes(t)) {
        score += 2;
      } else if (profileTokens.some(pt => pt.includes(t) || t.includes(pt))) {
        score += 1;
      }
    }

    const lengthDiff = Math.abs(normTarget.length - normProfile.length);
    score -= lengthDiff * 0.05;

    if (score > maxScore) {
      maxScore = score;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

async function runMibMultiProfileFlow(credentials, targetAccount, targetAccountName, port, targetAmount, mode = 'search', sessionMode = 'fresh_login') {
  emitLog(port, `> [MIB] Starting MIB Faisanet Multi-Profile Auth Flow (sessionMode: ${sessionMode}, targetAccountName: "${targetAccountName}")...`);
  let last3Txs = [];
  let loginSuccess = sessionMode === 'fetch_only';

  const mibHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': USER_AGENT
  };

  function isMibSuccess(status) { return status === 200 || status === 203; }

  let rTag = null;
  if (sessionMode !== 'fresh_login' && sessionMode !== 'claim_and_login') {
    if (currentMibRTag) {
      rTag = currentMibRTag;
    } else {
      const res = await chrome.storage.local.get(['viri_mib_rtag']);
      if (res.viri_mib_rtag) {
        currentMibRTag = res.viri_mib_rtag;
        rTag = currentMibRTag;
      }
    }
  }
  
  function updateRTag(newTag) {
    if (newTag) {
      rTag = newTag;
      currentMibRTag = newTag;
      chrome.storage.local.set({ viri_mib_rtag: newTag });
    }
  }

  let mibClockOffset = 0;

  try {
    if (sessionMode === 'fresh_login' || sessionMode === 'claim_and_login') {
      emitLog(port, `> [MIB] Step 0: Clearing previous MIB session cookies...`);
      const mibCookies = await chrome.cookies.getAll({ domain: "mib.com.mv" });
      for (const cookie of mibCookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
      emitLog(port, `> [MIB] Cleared ${mibCookies.length} MIB cookies.`);

      emitLog(port, `> [MIB] Step 1: Initializing session...`);
      const t0 = Date.now();
      const authPageRes = await mibFetch(`${MIB_BASE_URL}/auth`, {
        headers: { 'User-Agent': USER_AGENT }
      }, port);
      const t3 = Date.now();

      if (!authPageRes.ok) {
        throw new Error(`MIB auth page load failed: HTTP ${authPageRes.status}`);
      }

      mibClockOffset = 0;
      const serverDateHeader = authPageRes.headers.get('date');
      if (serverDateHeader) {
        const rtt = t3 - t0;
        const serverTime = new Date(serverDateHeader).getTime() + Math.round(rtt / 2);
        mibClockOffset = serverTime - t3;
        emitLog(port, `> [MIB] Calculated MIB server clock offset (RTT-aware): ${mibClockOffset}ms (RTT: ${rtt}ms)`);
      }

      const authPageHtml = await authPageRes.text();
      updateRTag(extractRTag(authPageHtml));
      emitLog(port, `> [MIB] ✓ Session initialized. rTag: ${rTag.substring(0, 8)}...`);

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
        const text = await authTypeRes.clone().text();
        emitLog(port, `> [MIB] Auth type response (non-JSON): ${text.substring(0, 200)}`);
        authTypeData = { status: 'success' };
      }

      if (authTypeData.status === 'error') {
        throw new Error(`MIB auth type error: ${authTypeData.message || 'Unknown error'}`);
      }
      emitLog(port, `> [MIB] ✓ Auth type confirmed: ${JSON.stringify(authTypeData)}`);

      const loginTypeParams = authTypeData?.data?.[0] || {};
      const loginType = loginTypeParams.loginType;
      const userSalt = loginTypeParams.userSalt;

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
      emitLog(port, `> [MIB] Plain credentials validation: username provided, password provided`);
        const clientSalt = generateClientSalt(32);
        
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
        if (text.includes('dashboard') || text.includes('2FA') || text.includes('redirect') || text.includes('success')) {
          xAuthData = { status: 'success', redirect: '/dashboard' };
        } else {
          throw new Error(`MIB xAuth response not parseable: ${text.substring(0, 100)}`);
        }
      }

      if (xAuthData && (xAuthData.success === false || xAuthData.status === 'error')) {
        const err = new Error(`MIB authentication failed: ${xAuthData.reasonText || xAuthData.message || 'Invalid credentials'}`);
        err.auth_failed = true;
        throw err;
      }
      emitLog(port, `> [MIB] ✓ Primary authentication successful.`);

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
      try { updateRTag(extractRTag(dashHtml)); } catch (e) {
        emitLog(port, `> [MIB] Could not extract rTag from dashboard — keeping previous.`);
      }

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
      try { updateRTag(extractRTag(auth2faHtml)); } catch (e) {
        emitLog(port, `> [MIB] Could not extract rTag from auth2FA — keeping previous.`);
      }
      emitLog(port, `> [MIB] ✓ 2FA page loaded. rTag: ${rTag ? rTag.substring(0, 8) + '...' : 'none'}`);

      const msInWindow = (Date.now() + mibClockOffset) % 30000;
      const msRemaining = 30000 - msInWindow;
      if (msRemaining < 4000) {
        emitLog(port, `> [MIB] OTP window boundary safety: only ${Math.round(msRemaining / 100) / 10}s remaining in epoch. Waiting for next window...`);
        await new Promise(resolve => setTimeout(resolve, msRemaining + 500));
      }

      emitLog(port, `> [MIB] Step 5: Generating and submitting TOTP...`);
      const otpCode = "000000";
      emitLog(port, `> [MIB] Generated OTP Code submitted`);

      const otpRes = await mibFetch(`${MIB_BASE_URL}/aAuth2FA/verifyOTP`, {
        method: 'POST',
        headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/auth2FA` },
        body: buildFormBody({ otpType: '3', otp: otpCode })
      }, port);

      if (!isMibSuccess(otpRes.status)) {
        throw new Error(`MIB OTP verification request failed: HTTP ${otpRes.status}`);
      }

      let otpData;
      try {
        otpData = await otpRes.json();
      } catch (e) {
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
        const err = new Error(`MIB OTP verification failed: ${otpData.message || 'Invalid OTP'}`);
        err.auth_failed = true;
        throw err;
      }
      emitLog(port, `> [MIB] ✓ OTP verified successfully (HTTP ${otpRes.status}).`);
      loginSuccess = true;

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
      logApiDebug(port, profilesHtml, 'MIB');
      try {
        rTag = extractRTag(profilesHtml);
      } catch (e) {
        throw e;
      }
      const profiles = parseProfilesFromHtml(profilesHtml);
      const profileNames = profiles.map(p => p.name || 'Unknown').join(', ');
      emitLog(port, `> [MIB] Found ${profiles.length} profile(s): [${profileNames}]`);

      if (profiles.length > 0) {
        const selectedProfile = findMostSimilarProfile(profiles, targetAccountName) || profiles[0];
        const activeRTag = selectedProfile.rTag || rTag;
        emitLog(port, `> [MIB] Step 7: Selecting profile "${selectedProfile.name}" (ID: ${selectedProfile.id}, type: ${selectedProfile.type}) matching Viri account name "${targetAccountName}"...`);

        const switchRes = await mibFetch(`${MIB_BASE_URL}/aProfileHandler/switchProfile`, {
          method: 'POST',
          headers: { ...mibHeaders, 'Referer': `${MIB_BASE_URL}/profiles` },
          body: buildFormBody({
            rTag: activeRTag,
            profileId: selectedProfile.id,
            profileType: selectedProfile.type || '1'
          })
        }, port);

        if (!isMibSuccess(switchRes.status)) {
          throw new Error(`MIB profile switch failed: HTTP ${switchRes.status}`);
        }

        let switchData;
        try {
          switchData = await switchRes.json();
        } catch (e) {
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
    const foundAccNos = parsedAccounts.map(a => a.accountNo).join(', ');
    emitLog(port, `> [MIB] Found ${parsedAccounts.length} account(s) in dashboard: [${foundAccNos}]`);

    if (sessionMode === 'fetch_only' && parsedAccounts.length === 0) {
      emitLog(port, `> [MIB] ⚠ Session appears expired (0 accounts in fetch_only mode). Falling back to fresh_login...`);
      return await runMibMultiProfileFlow(credentials, targetAccount, targetAccountName, port, targetAmount, mode, 'fresh_login');
    }

    if (!rTag) {
      try {
        updateRTag(extractRTag(accountsHtml));
        emitLog(port, `> [MIB] ✓ Extracted rTag from accounts page: ${rTag.substring(0, 8)}...`);
      } catch (e) {
        emitLog(port, `> [MIB] ⚠ Could not extract rTag from accounts page.`);
      }
    }

    let matchedAccountNo = null;
    for (const acc of parsedAccounts) {
      if (acc.accountNo === targetAccount || acc.accountNo.includes(targetAccount) || targetAccount.includes(acc.accountNo)) {
        matchedAccountNo = acc.accountNo;
        break;
      }
    }

    if (!matchedAccountNo) {
      emitLog(port, `> [MIB] Target account ${targetAccount} not found in parsed accounts. Using directly...`);
      matchedAccountNo = targetAccount;
    } else {
      emitLog(port, `> [MIB] ✓ Matched account: ${matchedAccountNo}`);
    }

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
        if (!rTag) {
          try {
            updateRTag(extractRTag(detailsHtml));
            emitLog(port, `> [MIB] ✓ Refreshed rTag from details page: ${rTag.substring(0, 8)}...`);
          } catch (e) {
            emitLog(port, `> [MIB] Could not extract rTag from details page — keeping previous.`);
          }
        }
      } catch (err) {
        emitLog(port, `> [MIB] Error parsing balance: ${err.message}`);
      }
    }

    emitLog(port, `> [MIB] Step 9: Fetching transaction history for ${matchedAccountNo} (Endpoint: ${MIB_BASE_URL}/ajaxAccounts/trxHistory)...`);

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
        const rawAmt = (tx.foreignAmount !== undefined && tx.foreignAmount !== null && tx.curCodeDesc && tx.curCodeDesc !== 'MVR')
          ? parseFloat(tx.foreignAmount) || 0
          : parseFloat(tx.amount || tx.baseAmount) || 0;
        const txAmount = Math.abs(rawAmt);
        const isCredit = rawAmt > 0 || tx.type === 'credit' || tx.credit || tx.trxType === 'credit';
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
      emitLog(port, `> [MIB] Found ${transactions.length} transaction(s). Fetching recent history...`);
      last3Txs = normalizeTransactions(transactions, 'MIB', 3);
    }

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

    if (mode === 'history' || mode === 'ledger') {
      emitLog(port, `> [Viri Bridge] MIB ${mode.toUpperCase()} FETCH SUCCESS.`);
      port.postMessage({
        type: 'success',
        data: null,
        balance: mibBalance,
        transactions: last3Txs,
        raw_history: transactions
      });
    } else {
      if (matchFound) {
        emitLog(port, `> [Viri Bridge] MIB VERIFICATION SUCCESS: ${matchFound.reference || matchFound.description || 'Transaction matched'}`);
        const normalizedMatch = normalizeTransactions([matchFound], 'MIB', 1)[0];
        port.postMessage({
          type: 'success',
          data: {
            status: 'CREDITED',
            reference: matchFound.reference || matchFound.descr1 || matchFound.description || 'MIB-MATCH',
            amount: Math.abs(parseFloat(
              (matchFound.foreignAmount !== undefined && matchFound.foreignAmount !== null && matchFound.curCodeDesc && matchFound.curCodeDesc !== 'MVR')
                ? matchFound.foreignAmount
                : (matchFound.amount || matchFound.baseAmount)
            )).toFixed(2),
            timestamp: matchFound.date || matchFound.bookingDate || new Date().toISOString(),
            transaction: normalizedMatch
          },
          balance: mibBalance,
          transactions: last3Txs,
          raw_history: transactions
        });
      } else {
        throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR on MIB account ${targetAccount}.`);
      }
    }

  } catch (error) {
    if (port) {
      emitLog(port, `> [MIB] FATAL ERROR: ${error.message}`);
    }

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
    } catch (e) { }

    try {
      const errorCookies = await chrome.cookies.getAll({ domain: "mib.com.mv" });
      for (const cookie of errorCookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    } catch (e) { }

    if (port) {
      try {
        const isAuth = !!error.auth_failed || /auth failed|otp verification failed|invalid credentials/i.test(error.message);
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
    if(port) emitLog(port, '> [BML-OAuth] Initiating new tab login flow...');
    
    const oldCookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
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

    if(port) emitLog(port, '> [BML-OAuth] Please complete the login and OTP verification in the new tab.');

    return new Promise((resolve, reject) => {
        let isResolved = false;
        
        const tabUpdateListener = async (tabId, changeInfo, updatedTab) => {
            let isSuccessUrl = false;
            if (updatedTab.url) {
                if (port) emitLog(port, `> [BML-OAuth-Debug] Tab URL updated to: ${updatedTab.url}`);
                try {
                    const u = new URL(updatedTab.url);
                    const fullPath = u.pathname + u.search + u.hash;
                    const isLoginFlow = fullPath.includes('/web/login') || fullPath.includes('/web/profile') || fullPath.includes('/web/redirect') || fullPath.includes('/oauth/');
                    
                    if (port) emitLog(port, `> [BML-OAuth-Debug] fullPath: ${fullPath} | isLoginFlow: ${isLoginFlow}`);
                    
                    if (!isLoginFlow && (fullPath.includes('/accounts') || fullPath.includes('/dashboard') || fullPath.includes('/home') || fullPath.includes('/overview') || fullPath.includes('/vf/'))) {
                        isSuccessUrl = true;
                    }
                } catch(e) {}
            }
            
            if (tabId === tab.id && isSuccessUrl) {
                if (!isResolved) {
                    isResolved = true;
                    chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                    chrome.tabs.onRemoved.removeListener(tabRemoveListener);
                    if(port) emitLog(port, '> [BML-OAuth] Login successful! Performing PKCE exchange...');
                    
                    try {
                        const pkce = await generatePKCE();
                        
                        const cookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
                        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

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
                        
                        const authRes = await fetch(authUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0'
                            }
                        });
                        
                        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
                        
                        let authCode = null;
                        if (authRes.url && authRes.url.includes('/oauth/mobile-callback')) {
                            const finalUrl = new URL(authRes.url);
                            authCode = finalUrl.searchParams.get('code');
                        }
                        
                        if (!authCode) throw new Error("Failed to get auth code from BML. HTTP Status: " + authRes.status);
                        
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
                        
                        const tokenData = await tokenRes.json();
                        if (!tokenData.access_token) throw new Error("Failed to get access token");
                        
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
                        
                        await fetch(`${backendUrl}/api/bml/oauth/store`, {
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
                                expires_in: tokenData.expires_in
                            })
                        }).catch(e => console.error(e));
                        
                        if(port) emitLog(port, '> [BML-OAuth] Tokens acquired and stored successfully.');
                        setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 1000);
                        resolve(true);
                    } catch (e) {
                        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [9999] }).catch(() => {});
                        if(port) emitLog(port, '> [BML-OAuth] Error during PKCE exchange: ' + e.message);
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
    emitLog(port, `> [BML-API] Fetching dashboard to resolve account UUID and balance...`);
    const dashRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashRes.status !== 200) {
      throw new Error(`Failed to load dashboard (HTTP ${dashRes.status}). Maybe token expired.`);
    }
    
    const dashData = await dashRes.json();
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
    const dashboardBalance = accountObj.balance || null;
    emitLog(port, `> [BML-API] Resolved account UUID: ${accountInternalId}${dashboardBalance !== null ? `, dashboard balance: ${dashboardBalance}` : ''}`);

    // Fetch history
    emitLog(port, `> [BML-API] Fetching today's history from: ${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
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
          const spProfileId = a41Resp.selectedProfileId || a41ProfileId;
          const spProfileType = a41Resp.selectedProfileType || a41ProfileType || '0';
          if (spProfileId) {
            await chrome.storage.local.set({ mib_profileId: spProfileId, mib_profileType: spProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${spProfileId} (type ${spProfileType}).`);
          }
          await chrome.storage.session.set({ mibSession: sessionState });
          return { success: true, skipOtp: true };
        }
        const needsOtp = a41Resp.primaryOTPType || (a41Resp.otpTypes && a41Resp.otpTypes.length > 0);
        if (needsOtp) {
          if(port) emitLog(port, '> [MIB-API] A41 successful. OTP required.');
          await chrome.storage.session.set({ mibAuthTemp: { sessionState, clientSalt, userSalt, pgf03, flow: 'C42', primaryOTPType: a41Resp.primaryOTPType || '3', mibPassword: password, mibUsername, mibProfileId: a41ProfileId, mibProfileType: a41ProfileType } });
          return { success: true, requiresOtp: true };
        } else {
          // Fast path, no OTP needed. Save profile and session.
          if (a41ProfileId) {
            await chrome.storage.local.set({ mib_profileId: a41ProfileId, mib_profileType: a41ProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${a41ProfileId} (type ${a41ProfileType}).`);
          }
          await chrome.storage.session.set({ mibSession: sessionState });
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
    
    // C42/A42 returns key1/key2 in data[0]. We save them.
    if ((flow === 'C42' || flow === 'A42') && resp.data && resp.data[0] && resp.data[0].key1 && resp.data[0].key2) {
      sessionState.key1 = resp.data[0].key1;
      sessionState.key2 = resp.data[0].key2;
      await chrome.storage.local.set({ mib_key1: resp.data[0].key1, mib_key2: resp.data[0].key2 });
      
      // Save profile info from A41 (available in mibAuthTemp for A42 path)
      const { mibProfileId, mibProfileType } = mibAuthTemp;
      if (mibProfileId) {
        await chrome.storage.local.set({ mib_profileId: mibProfileId, mib_profileType: mibProfileType || '0' });
      }
      
      // Store in backend
      if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
      await fetch(`${backendUrl}/api/mib/keys/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanctumToken}`
        },
        body: JSON.stringify({
          hardware_id: terminalId,
          bank_account_id: bankAccountId,
          mib_username: mibUsername,
          key1: resp.data[0].key1,
          key2: resp.data[0].key2,
          app_id: sessionState.appId
        })
      });
    }

    // After C42, use password (still in mibAuthTemp) to establish authenticated web session via A41
    if (flow === 'C42' && mibPassword && resp.data && resp.data[0] && resp.data[0].key1 && resp.data[0].key2) {
      try {
        if(port) emitLog(port, '> [MIB-API] Establishing web session via A41...');
        // sfunc=i resume with new keys
        const iPayload = { cmod: computeCmod().toString(), appId: sessionState.appId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
        const iResp = await executeMibSfunc('i', iPayload, resp.data[0].key1, { key2: resp.data[0].key2, sfunc: 'i' });
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

async function ensureMibSession(port, terminalId, backendUrl, credentials) {
  let { mibSession } = await chrome.storage.session.get('mibSession');
  if (mibSession && mibSession.sessionKey) {
    // Validate cached session is still alive via lightweight A80 call
    try {
      const a80Payload = {
        nonce: generateNonce(mibSession.nonceGenerator),
        appId: mibSession.appId,
        sodium: generateSodium(),
        routePath: 'A80',
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
    const keysResp = await fetch(`${backendUrl}/api/mib/keys?${params}`, {
      headers: { 'Authorization': `Bearer ${tokenRes.sanctumToken}` }
    });
    if (!keysResp.ok) throw new Error("Missing MIB device credentials. Please link account again.");
    const keysData = await keysResp.json();
    if (!keysData.key1 || !keysData.key2) throw new Error("Server has no MIB keys. Please link account again.");
    await chrome.storage.local.set({ mib_key1: keysData.key1, mib_key2: keysData.key2, mib_appId: keysData.appId });
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
        profileSelected = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
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
        }
      } catch(e) {}
    }
    const username = credentials?.username?.length > 0 ? credentials.username : '';
    const password = credentials?.password?.length > 0 ? credentials.password : '';

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
          const a40Profiles = a40Resp.operatingProfiles || [];
          if (a40Profiles.length > 0) {
            const profileId = a40Profiles[0].profileId || a40Profiles[0].customerProfileId;
            const profileType = a40Profiles[0].profileType || '0';
            await chrome.storage.local.set({ mib_profileId: profileId, mib_profileType: profileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile from A40: ${profileId} (type ${profileType}).`);
            // Retry P47 with the saved profile
            profileSelected = await attemptP47(port, mibSession, profileId, profileType);
          } else {
            // Single-profile fast-path — A40 may return accountBalance directly
            if (a40Resp.selectedProfileId) {
              await chrome.storage.local.set({
                mib_profileId: a40Resp.selectedProfileId,
                mib_profileType: a40Resp.selectedProfileType || '0'
              });
              profileSelected = await attemptP47(port, mibSession, a40Resp.selectedProfileId, a40Resp.selectedProfileType || '0');
            } else {
              if(port) emitLog(port, '> [MIB-API] A40 returned no profiles. Trying A80...');
              // Try A80 fallback to see if session is usable
              try {
                const a80Payload = {
                  nonce: generateNonce(mibSession.nonceGenerator),
                  appId: mibSession.appId,
                  sodium: generateSodium(),
                  routePath: 'A80',
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
          const { sanctumToken } = await chrome.storage.local.get('sanctumToken');
          if (sanctumToken) {
            await fetch(`${backendUrl}/api/mib/keys/store`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${sanctumToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hardware_id: terminalId,
                bank_account_id: 0,
                mib_username: credentials?.username || '',
                key1: rResp.key1, key2: rResp.key2, app_id: freshAppId,
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
                const a80Payload = { nonce: generateNonce(mibSession.nonceGenerator), appId: mibSession.appId, sodium: generateSodium(), routePath: 'A80', xxid: mibSession.xxid };
                const a80Resp = await executeMibSfunc('n', a80Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
                if (a80Resp.success) profileSelected = true;
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
      return true;
    } else {
      if(port) emitLog(port, `> [MIB-API] P47 failed: ${p47Resp.reasonText}`);
      return false;
    }
  } catch (e) {
    if(port) emitLog(port, `> [MIB-API] P47 error: ${e.message}`);
    return false;
  }
}

async function runMibApiFlow(credentials, targetAccount, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login', hardwareId = '', backendUrl = '') {
  emitLog(port, `> [MIB-API] Starting API ledger flow (mode: ${mode})...`);
  let last3Txs = [];
  
  try {
    // Cache valid credentials from PWA for A40 fallback on subsequent calls
    if (credentials?.username?.length > 0 && credentials?.password?.length > 0) {
      chrome.storage.session.set({ mib_stored_creds: credentials });
    }
    
    const mibSession = await ensureMibSession(port, hardwareId, backendUrl, credentials);

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
      port.postMessage({ type: 'statement_success', transactions: formattedTxs });
      return;
    }

    if (mode === 'ledger' || mode === 'history') {
      port.postMessage({
        type: 'success',
        match: null,
        transactions: formattedTxs,
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
      port.postMessage({ type: 'success', match: matchedTx, login_success: true, transactions: formattedTxs.slice(0, 3) });
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


