// Extension Version: 1.4.0
import { 
  generateNonce, blowfishEncrypt, blowfishDecrypt, computePgf03, 
  deriveSessionKey, generateSodium, generateXxid, generateAppId,
  generateClientSalt, generateKey, DEFAULT_KEY, computeCmod,
  MIB_API_URL, MIB_WEBVIEW_URL, MIB_MODEL
} from './utils/mib-crypto.js';
import { mibAccountKey, clearMibCredentials } from './utils/mib-storage.js';

const BASE_URL = "https://www.bankofmaldives.com.mv/internetbanking";
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
      // Buffer chunks for session log upload when payload toggle is ON
      const bufTag = `[${tag}-DEBUG]`;
      if (debugPayloadBuffer.length >= MAX_DEBUG_BUFFER) {
        debugPayloadBuffer.splice(0, 1000); // drop oldest 1000 lines to prevent unbounded growth
      }
      debugPayloadBuffer.push(`> [${tag}] DEBUG: Payload length: ${output.length}`);
      debugPayloadBuffer.push(`[${tag}-DEBUG-START]`);
      const chunkSize = 1000;
      for (let i = 0; i < output.length; i += chunkSize) {
        const chunk = `${bufTag} ${output.substring(i, i + chunkSize)}`;
        debugPayloadBuffer.push(chunk);
        emitLog(port, chunk);
      }
      debugPayloadBuffer.push(`[${tag}-DEBUG-END]`);
      // Also emit to PWA terminal console
      emitLog(port, `> [${tag}] DEBUG: Payload length: ${output.length}`);
      emitLog(port, `[${tag}-DEBUG-START]`);
      for (let i = 0; i < output.length; i += chunkSize) {
        emitLog(port, `${bufTag} ${output.substring(i, i + chunkSize)}`);
      }
      emitLog(port, `[${tag}-DEBUG-END]`);
    } catch (e) {
      debugPayloadBuffer.push(`> [${tag}] DEBUG: failed to output payload: ${e.message}`);
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

async function safeFetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Bank request timed out after ${timeoutMs / 1000}s.`);
    }
    throw err;
  }
}

async function withFlowWatchdog(flowPromise, maxDurationMs = 45000, context = {}) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const stage = activeFlowStage || '';
      logSessionEvent('flow_watchdog_timeout', {
        account: context.targetAccount,
        bank: context.bank,
        mode: context.mode,
        stage,
        max_duration_ms: maxDurationMs
      });
      reject(new Error(`Bank flow exceeded maximum duration of ${maxDurationMs / 1000}s.` + (stage ? ` (stuck at: ${stage})` : '')));
    }, maxDurationMs);
  });
  try {
    return await Promise.race([flowPromise, timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

let lastActiveAccount = null;
let lastActiveBank = null;

async function sanitizeAccountSession(targetAccount, bank) {
  if (lastActiveAccount && (lastActiveAccount !== targetAccount || lastActiveBank !== bank)) {
    console.log(`[Viri Bridge] Switching account: ${lastActiveAccount} (${lastActiveBank}) -> ${targetAccount} (${bank})`);
    const domain = bank === 'MIB' ? MIB_WEBVIEW_URL.replace('https://', '') : 'bankofmaldives.com.mv';
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const cookie of cookies) {
        const protocol = cookie.secure ? "https://" : "http://";
        const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const cookieUrl = `${protocol}${cleanDomain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
      }
    } catch (e) {}

    logSessionEvent('session_sanitized', {
      previous_account: lastActiveAccount,
      new_account: targetAccount,
      bank: bank,
      action: 'cookies_and_keys_cleared'
    });
  }
  lastActiveAccount = targetAccount;
  lastActiveBank = bank;
}

// Clear any left-over lockdown rules on extension startup/reload.
// NOTE: clearBankSessions() is intentionally NOT called here anymore.
// The legacy webscraping flow required a fresh cookie jar, but the new API token
// flow stores session state in chrome.storage — not browser cookies.
// Wiping cookies on startup was destroying valid persistent API sessions for MIB.
disableBankLockdown();

// ── SW lifecycle diagnostics (v1.3.14) ──
// MV3 service workers idle-stop every ~30s, so this counter counts SW
// instantiations. Correlated with failure bursts it reveals eviction/crash loops.
// Callback style (no top-level await) so module evaluation is never blocked.
chrome.storage.local.get('viri_sw_restart_count', (res) => {
  const count = (res.viri_sw_restart_count || 0) + 1;
  const now = new Date().toISOString();
  chrome.storage.local.set({ viri_sw_restart_count: count, viri_sw_last_restart_ts: now });
});

// Persist the last uncaught error/unhandled rejection so a stuck/crashing SW
// leaves evidence. Note: OOM/OS kills do NOT fire these — restart counter remains
// the primary crash signal.
self.addEventListener('error', (e) => {
  chrome.storage.local.set({
    viri_sw_last_error: { msg: String(e.message || e.error || 'uncaught error'), stack: e.error?.stack || '', ts: new Date().toISOString() }
  });
});
self.addEventListener('unhandledrejection', (e) => {
  chrome.storage.local.set({
    viri_sw_last_error: { msg: String(e.reason?.message || e.reason || 'unhandled rejection'), stack: e.reason?.stack || '', ts: new Date().toISOString() }
  });
});

// Global active port
let activePort = null;
let heldSession = null;
let heartbeatInterval = null;
let pollInterval = null;
let debugLogMibHtml = false;
let debugPayloadBuffer = [];
let _flushingBuffer = false;
const _pendingBufferFlush = [];
const MAX_DEBUG_BUFFER = 5000;
const _bmlRefreshLocks = {};
// Tracks the in-flight bank-flow stage so a 45s watchdog timeout can say WHAT hung.
let activeFlowStage = '';

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
  let sess = heldSession;
  if (!sess || !sess.backendUrl) {
    const storageRes = await new Promise(r => chrome.storage.local.get(['viri_held_session'], r));
    sess = storageRes?.viri_held_session;
  }
  
  if (!sess || !sess.backendUrl) {
    if (detail.backendUrl && (detail.hardwareId || detail.terminalId)) {
      sess = {
        backendUrl: detail.backendUrl,
        hardwareId: detail.hardwareId || detail.terminalId,
        accountId: detail.accountId || detail.bankAccountId || null,
        bankName: detail.bankName || detail.bank || null
      };
    }
  }

  if (!sess || !sess.backendUrl) return;
  _postSessionEvent(sess, event_type, detail, pwa_logs);
}

function _postSessionEvent(session, event_type, detail, pwa_logs) {
  const body = {
    hardware_id: session.hardwareId,
    event_type: event_type
  };
  if (session.accountId) body.bank_account_id = parseInt(session.accountId);
  if (session.bankName) body.bank_name = session.bankName;
  if (detail && Object.keys(detail).length > 0) body.event_detail = detail;
  body.extension_version = EXTENSION_VERSION || 'unknown';
  
  // Drain the debug payload buffer under a mutex to prevent concurrent corruption
  const logs = pwa_logs && pwa_logs.length > 0 ? pwa_logs : [];
  _flushPayloadBuffer(session, logs, (finalLogs) => {
    if (finalLogs.length > 0) body.pwa_logs = finalLogs;

    fetchWithBlockedDiagnostics(`Viri backend ${session.backendUrl}/terminal/session/log`, `${session.backendUrl}/terminal/session/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(err => console.warn("[Viri Bridge] Failed to post session event:", err));
  });
}

function _flushPayloadBuffer(session, logs, callback) {
  if (_flushingBuffer) {
    _pendingBufferFlush.push({ logs, callback });
    return;
  }
  _flushingBuffer = true;
  try {
    if (debugLogMibHtml && debugPayloadBuffer.length > 0) {
      logs.unshift('[API-PAYLOAD-DEBUG-START]');
      logs.unshift(`> [System] API Payload Debug mode enabled (v${EXTENSION_VERSION}). ${debugPayloadBuffer.length} lines follow.`);
      while (debugPayloadBuffer.length > 0) {
        logs.push(debugPayloadBuffer.shift());
      }
      logs.push('[API-PAYLOAD-DEBUG-END]');
      debugPayloadBuffer = [];
    } else {
      debugPayloadBuffer = []; // toggle off: discard any stale buffer content
    }
    callback(logs);
  } finally {
    _flushingBuffer = false;
    // Drain any queued flushes that arrived while we were busy
    if (_pendingBufferFlush.length > 0) {
      const next = _pendingBufferFlush.shift();
      _flushPayloadBuffer(session, next.logs, next.callback);
    }
  }
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
  if (msg.action === 'RESET_EXTENSION_WORKER' || msg.action === 'FORCE_RELOAD_EXTENSION') {
    sendResponse({ success: true, message: 'Reloading extension worker...' });
    setTimeout(() => {
      chrome.runtime.reload();
    }, 100);
    return true;
  }

  if (msg.action === 'GET_VERSION') {
    // v1.3.14+: also returns SW restart/crash telemetry used by the PWA liveness probe.
    chrome.storage.local.get(['viri_sw_restart_count', 'viri_sw_last_restart_ts', 'viri_sw_last_error'], (res) => {
      sendResponse({
        version: EXTENSION_VERSION,
        restartCount: res.viri_sw_restart_count || 0,
        swStartedAt: res.viri_sw_last_restart_ts || null,
        lastError: res.viri_sw_last_error || null,
      });
    });
    return true;
  }

  if (msg.action === 'PING') {
    chrome.storage.local.get(['viri_sw_restart_count', 'viri_sw_last_restart_ts', 'viri_sw_last_error'], (res) => {
      sendResponse({
        pong: true,
        version: EXTENSION_VERSION,
        restartCount: res.viri_sw_restart_count || 0,
        swStartedAt: res.viri_sw_last_restart_ts || null,
        lastError: res.viri_sw_last_error || null,
      });
    });
    return true;
  }

  if (msg.action === 'START_BML_AUTH') {
    startBmlOAuthFlow(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.bmlUsername, msg.payload.profileType, msg.payload.sanctumToken)
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'START_MIB_AUTH') {
    (async () => {
      try {
        // Recover server-side device keys into the local cache BEFORE the login flow
        // decides between returning-device (A41, OTP-free) and fresh registration
        // (C41/C42 + OTP). Prevents the "MIB transient: HTTP 500" when re-registering
        // an already-registered account after local keys were cleared.
        await seedServerKeysIfCacheMissing(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.sanctumToken, msg.payload.mibUsername);
      } catch (e) {
        // Best-effort: any failure falls through to the normal auth flow.
      }
      startMibAuthFlow(msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.mibUsername, msg.payload.sanctumToken, msg.payload.password, msg.payload.hardwareId, msg.payload.accountNumber || '')
        .then(res => sendResponse(res))
        .catch(e => sendResponse({ success: false, error: e.message }));
    })();
    return true;
  }

  if (msg.action === 'SUBMIT_MIB_OTP') {
    submitMibOtp(msg.payload.otp, msg.payload.terminalId, msg.payload.bankAccountId, msg.payload.backendUrl, msg.payload.mibUsername, msg.payload.sanctumToken, msg.payload.otpType, msg.payload.accountNumber || '')
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'SUBMIT_MIB_RESEND') {
    (async () => {
      try {
        const { mibAuthTemp } = await chrome.storage.session.get('mibAuthTemp');
        const username = msg.payload.mibUsername || mibAuthTemp?.mibUsername;
        const otpType = msg.payload.otpType || '2'; // send on the selected channel (default SMS)
        if (!username) throw new Error('No MIB username for OTP resend.');
        await sendMibOtpResend(username, otpType);
        if (activePort) emitLog(activePort, `> [MIB-API] Resent OTP via C43 (otpType ${otpType}).`);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (msg.action === 'SELECT_MIB_PROFILE') {
    selectMibProfile(msg.payload.profileId, msg.payload.profileType)
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'GET_MIB_PROFILES') {
    const { terminalId, backendUrl, accountId, accountNumber, sanctumToken } = msg.payload || {};
    fetchMibGroupForProfile(null, terminalId, backendUrl, accountNumber || accountId, sanctumToken, accountId)
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ ok: false, needsLogin: true, error: e.message }));
    return true;
  }

  if (msg.action === 'SELECT_MIB_PROFILE_ON_SESSION') {
    const p = msg.payload || {};
    const credentials = (p.mibUsername && p.mibPassword) ? { username: p.mibUsername, password: p.mibPassword } : {};
    selectMibProfileOnSession(null, p.accountNumber || p.accountId, p.terminalId, p.backendUrl, credentials, p.profileId, p.profileType || '0', p.sanctumToken || '', p.accountId || '')
      .then(res => sendResponse(res))
      .catch(e => sendResponse({
        success: false,
        error: e.message,
        needsLogin: /no credentials available|not found|Missing MIB device credentials|session expired/i.test(String(e.message)) || undefined
      }));
    return true;
  }

  if (msg.action === 'CLEAR_MIB_CREDENTIALS') {
    (async () => {
      try {
        // Scoped clear: removes the account's device keys, per-account session /
        // profile / balance keys and its credential-map entries (full clear when
        // no account context is provided).
        const p = msg.payload || {};
        await clearMibCredentials({
          accountNumber: p.accountNumber || '',
          bankAccountId: p.accountId || p.bankAccountId || ''
        });
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
        const url = session.bankName === 'MIB' ? MIB_WEBVIEW_URL + "/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
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
  if (port.name === "viri-verify" || port.name === "bml-auth" || port.name === "viri-auto-sync" || port.name === "viri-statements") {
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
        if (!payload) {
          console.warn('[Viri Bridge] VERIFY_TRANSFER received without payload');
          try { port.postMessage({ type: 'error', error: 'VERIFY_TRANSFER: payload is required' }); } catch(e) {}
          return;
        }
        const targetAcc = payload.accountNumber || payload.accountId || payload.account;
        const mode = payload.mode || 'search';
        const sessionMode = payload.sessionMode || 'fresh_login';
        if (!payload.hardwareId || !payload.backendUrl) {
          console.warn('[Viri Bridge] VERIFY_TRANSFER payload missing backendUrl/hardwareId', { mode, bank: payload.bank, hasBackendUrl: !!payload.backendUrl, hasHardwareId: !!payload.hardwareId, hasSanctumToken: !!payload.sanctumToken });
        }
        // Store sanctumToken for backend-authenticated operations (e.g., MIB key fetch)
        if (payload.sanctumToken) {
          chrome.storage.local.set({ sanctumToken: payload.sanctumToken });
        }
        try {
          await sanitizeAccountSession(targetAcc, payload.bank || 'BML');
          const flowPromise = (async () => {
            if (payload.bank === 'MIB') {
              await runMibApiFlow(payload.credentials, targetAcc, port, payload.amount, payload.mibProfileType || '0', mode, sessionMode, payload.hardwareId, payload.backendUrl, payload.accountId, payload.isAutoSync || false, payload.sanctumToken || '');
            } else {
              await runBmlApiFlow(payload.credentials, targetAcc, payload.accountName, port, payload.amount, payload.bmlProfileType || '0', mode, sessionMode, payload.bmlAuthState, payload.hardwareId, payload.backendUrl, payload.accountId);
            }
          })();
          await withFlowWatchdog(flowPromise, 45000, { targetAccount: targetAcc, bank: payload.bank || 'BML', mode });
        } catch (error) {
          try { port.postMessage({ type: 'error', error: error.message }); } catch(e) {}
        }
      }
      else if (msg.action === 'FULFILL_DELEGATED_REQUEST') {
        const payload = msg.payload;
        const req = payload.req;
        const targetAcc = req.account_number || req.bank_account_id || (heldSession ? heldSession.accountId : '');
        try {
          await sanitizeAccountSession(targetAcc, payload.bankName || 'BML');
          const flowPromise = (async () => {
            if (payload.bankName === 'MIB') {
              await runMibApiFlow(payload.credentials, targetAcc, port, req.target_amount || '1.00', req.mib_profile_type || '0', req.request_type, 'fetch_only', req.hardware_id || payload.hardwareId, req.backend_url || payload.backendUrl, req.bank_account_id);
            } else {
              const bmlAuthState = heldSession ? heldSession.bmlAuthState : req.bml_auth_state;
              const bmlProfileType = payload.bmlProfileType || req.bml_profile_type || (heldSession ? heldSession.bmlProfileType : '0') || '0';
              await runBmlApiFlow(payload.credentials, targetAcc, req.account_name, port, req.target_amount || '1.00', bmlProfileType, req.request_type, 'fetch_only', bmlAuthState, req.hardware_id || payload.hardwareId, req.backend_url || payload.backendUrl, req.bank_account_id);
            }
          })();
          await withFlowWatchdog(flowPromise, 45000, { targetAccount: targetAcc, bank: payload.bankName || 'BML', mode: req.request_type });
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
        }
      }
      else if (msg.action === 'FETCH_STATEMENT_RANGE') {
        const payload = msg.payload;
        const targetAccId = payload.accountId || (heldSession ? heldSession.accountId : '');
        const targetAccNum = payload.accountNumber || (heldSession ? heldSession.accountNumber : null) || targetAccId;
        try {
          const bmlProfileType = payload.bmlProfileType || (heldSession ? heldSession.bmlProfileType : '0') || '0';
          await fetchBmlStatementRange(payload.credentials, targetAccId, targetAccNum, port, payload.fromDate, payload.toDate, bmlProfileType, payload.hardwareId, payload.backendUrl);
        } catch (error) {
          port.postMessage({ type: 'statement_error', error: error.message });
        }
      }
      else if (msg.action === 'FETCH_BML_HISTORY_PAGE') {
        const payload = msg.payload;
        emitLog(port, '> [Viri Bridge] FETCH_BML_HISTORY_PAGE received');
        if (payload.sanctumToken) {
          chrome.storage.local.set({ sanctumToken: payload.sanctumToken });
        }
        const targetAccId = payload.accountId || '';
        const targetAccNum = payload.accountNumber || targetAccId || (heldSession ? heldSession.accountNumber : '');
        const page = payload.page || 1;
        const bmlProfileType = payload.bmlProfileType || (heldSession ? heldSession.bmlProfileType : '0') || '0';
        const bmlCombinedLedger = payload.bmlCombinedLedger ?? false;
        const isAutoSync = payload.isAutoSync ?? false;
        try {
          fetchBmlHistoryPage(payload.credentials, targetAccId, targetAccNum, port, page, bmlProfileType, payload.hardwareId, payload.backendUrl, bmlCombinedLedger, isAutoSync)
            .then(res => {
              const apiEndpoints = bmlCombinedLedger ? [
                "GET /api/mobile/dashboard",
                `GET /api/mobile/account/${targetAccNum}/history/today`,
                `GET /api/mobile/history/pending/${targetAccNum}`,
                `GET /api/mobile/account/${targetAccNum}/history/${page}`
              ] : [
                "GET /api/mobile/dashboard",
                `GET /api/mobile/account/${targetAccNum}/history/${page}`
              ];

              port.postMessage({
                type: 'history_page_success',
                page: page,
                transactions: res.transactions,
                totalPages: res.totalPages,
                balance: res.balance,
                reservedBalance: res.reservedBalance,
                availableBalance: res.availableBalance,
                bank_api_endpoints: apiEndpoints,
                raw_bank_response: res.raw_bank_response
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
        logSessionEvent('session_released', { account: heldSession?.accountId });
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
          const url = heldSession.bankName === 'MIB' ? MIB_WEBVIEW_URL + "/accounts" : "https://www.bankofmaldives.com.mv/internetbanking/api/dashboard";
          fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => {});
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePort === port) {
        activePort = null;
      }
      disableBankLockdown();
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
    const res = await safeFetchWithTimeout(url, options, 20000);
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
      formattedAmount = `${amount >= 0 ? '+' : '-'}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    
function isPersonOrCompanyName(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim().replace(/^\/+\s*/, '');
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return false;
  if (/^(?:BLZ|BLAZ|FT)[A-Za-z0-9\\]+/i.test(s)) return false;
  if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/.test(s)) return false;
  if (/^(internet banking|mobile banking|atm|pos|over the counter|standing instruction|transfer credit|transfer debit)$/i.test(s)) return false;
  if (/^[A-Z0-9]{10,}$/i.test(s) && !/\s/.test(s)) return false;
  return true;
}

    const narrative3Trimmed = tx.narrative3 ? String(tx.narrative3).trim() : '';
    
    const extractPayeeName = (t) => {
      const fields = [t.senderName, t.sender_name, t.sender, t.benefName, t.benef_name, t.remitterName, t.remitter, t.partyName, t.opponentName];
      for (const f of fields) {
        if (isPersonOrCompanyName(f)) return String(f).trim().replace(/^\/+\s*/, '');
      }
      if (isPersonOrCompanyName(t.narrative2)) return String(t.narrative2).trim().replace(/^\/+\s*/, '');
      if (isPersonOrCompanyName(t.narrative3)) return String(t.narrative3).trim().replace(/^\/+\s*/, '');
      if (isPersonOrCompanyName(t.narrative4)) return String(t.narrative4).trim().replace(/^\/+\s*/, '');
      return '';
    };

    const senderTrimmed = extractPayeeName(tx);
    return { date, details, amount: formattedAmount, runningBalance: formattedRunningBal, reference: refTrimmed || '', narrative3: narrative3Trimmed, sender: senderTrimmed };
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
          { header: "User-Agent", operation: "set", value: "android/1.0" }
        ],
        responseHeaders: [
          { header: "Access-Control-Allow-Origin", operation: "set", value: "*" }
        ]
      },
      condition: {
        urlFilter: "*faisamobilex-smvc-v2.mib.com.mv*",
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
    const cacheKey = (bmlUsername && bmlUsername.length > 0)
        ? `bml_oauth_${bmlUsername}_${profileType}`       // known username → shared across sibling accounts
        : `bml_oauth_acct_${bankAccountId}_${profileType}`; // null username → scoped per account
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
                        if (!storeRes.ok) {
                            throw new Error(`Backend rejected token store (HTTP ${storeRes.status}): ${storeBody.substring(0, 300)}`);
                        }
                        
                        log('\u2705 BML OAuth complete! Tokens acquired and stored successfully.');
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
    const cacheKey = (bmlUsername && bmlUsername.length > 0)
        ? `bml_oauth_${bmlUsername}_${profileType}`       // known username → shared across sibling accounts
        : `bml_oauth_acct_${bankAccountId}_${profileType}`; // null username → scoped per account
    let tokens = null;
    
    // Check local cache
    const data = await chrome.storage.local.get(cacheKey);
    if (data[cacheKey]) {
        tokens = data[cacheKey];
    } else {
        // Fetch from server
        try {
            const profileTypeParam = profileType === '1' ? 'business' : 'personal';
            let queryUrl = `${backendUrl}/bml/oauth/tokens?hardware_id=${terminalId}&bank_account_id=${bankAccountId}&profile_type=${profileTypeParam}`;
            if (bmlUsername && bmlUsername.length > 0) {
                queryUrl += `&bml_username=${encodeURIComponent(bmlUsername)}`;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(queryUrl, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${sanctumToken}`
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.status === 200) {
                tokens = await res.json();
                if (!tokens || !tokens.access_token) {
                    console.warn('[Viri Bridge] Server returned tokens without access_token for', cacheKey,
                        '— keys:', tokens ? Object.keys(tokens).join(',') : 'null');
                    tokens = null;
                } else {
                    tokens.expires_at = new Date(tokens.expires_at).getTime();
                    await chrome.storage.local.set({ [cacheKey]: tokens });
                }
            } else {
                let errBody = '';
                try { errBody = (await res.text()).substring(0, 200); } catch(_) {}
                console.warn('[Viri Bridge] Server returned HTTP', res.status, 'for', cacheKey,
                    errBody ? `— ${errBody}` : '');
            }
        } catch(e) { console.error('Failed to fetch tokens from server', e); }
    }

    if (!tokens) return null;

    // Check expiry (5 min buffer)
    if (tokens.expires_at < Date.now() + 5 * 60 * 1000) {
        // === Thundering-herd protection ===
        // If another call is already refreshing the same cacheKey, wait for it to finish,
        // then check if it put fresh tokens in the cache.
        if (_bmlRefreshLocks[cacheKey]) {
            try { await _bmlRefreshLocks[cacheKey]; } catch(e) {}
            const data = await chrome.storage.local.get(cacheKey);
            if (data[cacheKey] && data[cacheKey].expires_at >= Date.now() + 5 * 60 * 1000) {
                return data[cacheKey].access_token;
            }
            // In-flight refresh must have failed — fall through to try our own
            tokens = data[cacheKey] || tokens;
        }

        // Perform the full refresh under a lock to prevent concurrent BML OAuth calls
        const doRefresh = async () => {
            // === Check OUR server first before trying BML OAuth directly ===
            // The superadmin may have renewed tokens on the server via the Credential Inspector.
            // If the cached copy is stale, the server might have fresh tokens from another
            // terminal's renewal. Always check the server as the source of truth.
            let serverTokens = null;
            try {
                const profileTypeParam = profileType === '1' ? 'business' : 'personal';
                let chkUrl = `${backendUrl}/bml/oauth/tokens?hardware_id=${terminalId}&bank_account_id=${bankAccountId}&profile_type=${profileTypeParam}`;
                if (bmlUsername && bmlUsername.length > 0) {
                    chkUrl += `&bml_username=${encodeURIComponent(bmlUsername)}`;
                }
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const checkRes = await fetch(chkUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${sanctumToken}`
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (checkRes.status === 200) {
                    serverTokens = await checkRes.json();
                    if (!serverTokens || !serverTokens.access_token) {
                        console.warn('[Viri Bridge] Refresh check: server returned 200 without access_token');
                        serverTokens = null;
                    } else {
                        serverTokens.expires_at = new Date(serverTokens.expires_at).getTime();
                    }
                } else {
                    let errBody = '';
                    try { errBody = (await checkRes.text()).substring(0, 200); } catch(_) {}
                    console.warn('[Viri Bridge] Refresh check: server HTTP', checkRes.status,
                        errBody ? `— ${errBody}` : '');
                }
            } catch(e) { console.warn('[Viri Bridge] Server token check failed, falling back to BML OAuth:', e.message); }

            // If server has a token that is NOT expired (with 5 min buffer), use it
            if (serverTokens && serverTokens.expires_at >= Date.now() + 5 * 60 * 1000) {
                const resultTokens = { ...serverTokens };
                await chrome.storage.local.set({ [cacheKey]: resultTokens });
                console.log('[Viri Bridge] Using fresh token from server — skipped BML OAuth refresh.');
                return resultTokens.access_token;
            }

            // Server token is also stale (or unreachable). Use the best available refresh_token.
            // Keep refresh_token + device_id as a set from the same source — they were
            // issued together by BML and must match for the OAuth refresh to succeed.
            const useServerSet = serverTokens && serverTokens.refresh_token && serverTokens.device_id;
            const bestRefresh = useServerSet ? serverTokens.refresh_token : tokens.refresh_token;
            const bestDeviceId = useServerSet ? serverTokens.device_id : tokens.device_id;

            const tokenBody = new URLSearchParams({
                'grant_type': 'refresh_token',
                'refresh_token': bestRefresh,
                'client_id': '98C83590-513F-4716-B02B-EC68B7D9E7E7',
                'Device-ID': bestDeviceId,
                'User-Agent': 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
                'x-app-version': '2.1.44.348'
            });

            // Retry BML OAuth on transient errors (5xx, network) up to 2 times.
            // 400/401 = token truly expired/revoked — do NOT retry.
            let tokenRes, tokenData;
            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt > 0) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`[Viri Bridge] BML OAuth retry ${attempt}/2 in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                }
                try {
                    const controller2 = new AbortController();
                    const timeoutId2 = setTimeout(() => controller2.abort(), 15000);
                    tokenRes = await fetch('https://www.bankofmaldives.com.mv/internetbanking/oauth/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
                            'Accept': 'application/json',
                            'X-Device-ID': bestDeviceId
                        },
                        body: tokenBody.toString(),
                        signal: controller2.signal
                    });
                    clearTimeout(timeoutId2);

                    if (tokenRes.status === 200) {
                        tokenData = await tokenRes.json();
                        break;
                    }
                    if (tokenRes.status === 400 || tokenRes.status === 401) {
                        // Permanent: token revoked or expired — no retry
                        throw new Error('Refresh failed: token expired or revoked');
                    }
                    // 5xx — transient, will retry
                    if (attempt === 2) {
                        throw new Error(`BML OAuth unreachable (HTTP ${tokenRes.status} after 3 attempts)`);
                    }
                } catch (e) {
                    if (e.message && e.message.startsWith('Refresh failed:')) throw e;
                    if (e.name === 'AbortError' || (e.message && e.message.includes('fetch'))) {
                        // Network / timeout — transient
                        if (attempt === 2) throw new Error('BML OAuth unreachable (network error after 3 attempts)');
                        continue;
                    }
                    if (e.message && e.message.includes('BML OAuth unreachable')) throw e;
                    throw e;
                }
            }

            if (!tokenData || !tokenData.access_token) throw new Error('Refresh failed');

            const resultTokens = { ...tokens };
            resultTokens.access_token = tokenData.access_token;
            resultTokens.refresh_token = tokenData.refresh_token || bestRefresh; // rotation
            resultTokens.expires_in = tokenData.expires_in;
            resultTokens.expires_at = Date.now() + (tokenData.expires_in * 1000);

            await chrome.storage.local.set({ [cacheKey]: resultTokens });

            // Sync to server (fire-and-forget)
            fetch(`${backendUrl}/bml/oauth/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sanctumToken}`
                },
                body: JSON.stringify({
                    hardware_id: terminalId,
                    bank_account_id: bankAccountId,
                    access_token: resultTokens.access_token,
                    refresh_token: resultTokens.refresh_token,
                    expires_in: resultTokens.expires_in
                })
            }).catch(()=>{});

            return resultTokens.access_token;
        };

        const refreshPromise = doRefresh();
        _bmlRefreshLocks[cacheKey] = refreshPromise;
        try {
            const accessToken = await refreshPromise;
            if (!accessToken) {
                await chrome.storage.local.remove(cacheKey);
                return null;
            }
            return accessToken;
        } catch(e) {
            console.error('Refresh failed', e);
            return null;
        } finally {
            delete _bmlRefreshLocks[cacheKey];
        }
    }
    return tokens.access_token;
}

// -------------------------------------------------------------
// BML API Background Flow (Browser OTP + Persistent Session)
// -------------------------------------------------------------
async function runBmlApiFlow(credentials, targetAccount, accountName, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login', bmlAuthState = null, payloadHardwareId = '', payloadBackendUrl = '', payloadAccountId = '') {
  emitLog(port, `> [BML-API] Starting API auth flow (sessionMode: ${sessionMode}, profileType: ${profileType})...`);
  logSessionEvent('session_login_started', { account: targetAccount, mode: mode, bank: 'BML', session_mode: sessionMode });
  let last3Txs = [];
  let loginSuccess = false;
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';

  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bankAccountId = heldSession ? heldSession.accountId : (payloadAccountId || credentials.bankAccountId || '');
    const bmlUsername = credentials.username || '';
    const sanctumToken = credentials.token || ''; // Assuming the PWA passes sanctum token in credentials if needed

    emitLog(port, `> [BML-API] Fetching valid OAuth token...`);
    activeFlowStage = 'bml_token';
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
    logSessionEvent('session_login_success', { account: targetAccount, mode: mode, bank: 'BML' });

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
        
        return await safeFetchWithTimeout(url, {
            ...options,
            headers
        }, 20000);
    };

    // --- FETCH DATA ---

    // Always fetch dashboard to resolve account UUID and balance
    activeFlowStage = 'bml_dashboard';
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
    
    // Safely match target account: exact match, internal ID match, or CASA fallback matching for masked account numbers
    const cleanNum = String(targetAccount || '').trim();
    const cleanDbId = String(bankAccountId || '').trim();

    let accountObj = Array.isArray(dashData.payload.dashboard)
      ? dashData.payload.dashboard.find(a => 
          a.account === cleanNum || 
          a.id === cleanNum || 
          a.id === cleanDbId ||
          (a.account && a.account.replace(/[^0-9]/g, '') === cleanNum.replace(/[^0-9]/g, ''))
        )
      : null;

    if (!accountObj && cleanNum.length >= 4 && Array.isArray(dashData.payload.dashboard)) {
      accountObj = dashData.payload.dashboard.find(a => 
        (a.category === 'currentAndSavingAccounts' || a.account_type === 'CASA') &&
        a.account && a.account.replace(/X/g, '').endsWith(cleanNum.slice(-4))
      );
    }

    if (!accountObj) {
      throw new Error(`Account ${targetAccount} not found on this BML profile.`);
    }
    const accountInternalId = accountObj.id;
    const clearedBalanceVal = accountObj.clearedBalance !== undefined && accountObj.clearedBalance !== null ? accountObj.clearedBalance : (accountObj.balance || accountObj.available_balance || accountObj.availableBalance || accountObj.working_balance || accountObj.current_balance || '0.00');
    const availableBalanceVal = accountObj.availableBalance !== undefined && accountObj.availableBalance !== null ? accountObj.availableBalance : clearedBalanceVal;

    const clearedBalanceNum = typeof clearedBalanceVal === 'string' ? parseFloat(clearedBalanceVal.replace(/,/g, '')) : (parseFloat(clearedBalanceVal) || 0);
    const availableBalanceNum = typeof availableBalanceVal === 'string' ? parseFloat(availableBalanceVal.replace(/,/g, '')) : (parseFloat(availableBalanceVal) || 0);
    const reservedBalanceNum = Math.max(0, clearedBalanceNum - availableBalanceNum);

    const dashboardBalance = clearedBalanceNum.toFixed(2);
    const dashboardReservedBalance = reservedBalanceNum.toFixed(2);
    const dashboardAvailableBalance = availableBalanceNum.toFixed(2);

    emitLog(port, `> [BML-API] Resolved account UUID: ${accountInternalId}, cleared: ${dashboardBalance}, reserved: ${dashboardReservedBalance}`);

    // Fetch history
    activeFlowStage = 'bml_history';
    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
    logSessionEvent('fetch_request_submitted', { account: targetAccount, mode: mode, bank: 'BML' });
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

    // Format txs using the robust legacy normalizer
    const formattedTxs = normalizeTransactions(allTxs, 'BML', null);

    last3Txs = formattedTxs.slice(0, 3);
    emitLog(port, `> [BML-API] Found ${formattedTxs.length} transactions today.`);

    const currentBalance = dashboardBalance;
    const reservedBalance = dashboardReservedBalance;
    const availableBalance = dashboardAvailableBalance;

    if (mode === 'ledger' || mode === 'history') {
      logSessionEvent('fetch_request_fulfilled', { account: targetAccount, tx_count: formattedTxs.length, mode: mode, bank: 'BML' });
      port.postMessage({
        type: 'success',
        match: null,
        transactions: formattedTxs,
        balance: currentBalance,
        reservedBalance,
        availableBalance,
        login_success: true
      });
      return;
    }

    // Find match for search mode
    let match = null;
    for (const tx of formattedTxs) {
      if (parseFloat(tx.amount.replace(/,/g, '')) === parseFloat(targetAmount) && !tx.amount.startsWith('-')) {
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
        reservedBalance,
        availableBalance,
        internal_id: accountInternalId,
        login_success: true
      });
    } else {
      emitLog(port, `> [BML-API] No exact match found for amount ${targetAmount}.`);
      throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount} MVR.`);
    }
  } catch (error) {
    emitLog(port, `> [BML-API] ERROR: ${error.message}`);
    const isAuth = /login|invalid payload|401|credential/i.test(error.message);
    logSessionEvent(isAuth ? 'session_login_failed' : 'fetch_request_failed', { account: targetAccount, error: error.message, bank: 'BML' });
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

async function fetchBmlStatementRange(credentials, bankAccountId, accountNumber, port, fromDate, toDate, profileType, payloadHardwareId, payloadBackendUrl) {
  emitLog(port, `> [BML-API] Starting statement fetch for ${accountNumber} from ${fromDate} to ${toDate}...`);
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';
  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bmlUsername = credentials?.username || '';
    const sanctumToken = credentials?.token || '';

    // Verify token exists and is valid. Trigger OAuth fallback if needed.
    let token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
    if (!token) {
        emitLog(port, `> [BML-API] Token expired or not present. Initiating OAuth flow...`);
        await startBmlOAuthFlow(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        if (!token) {
            throw new Error("Failed to acquire OAuth token after login.");
        }
    }

    const authFetch = async (url, options = {}) => {
        const currentToken = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken) || token;
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${currentToken}`;
        headers['Accept'] = 'application/json';
        headers['User-Agent'] = 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)';
        headers['x-app-version'] = '2.1.44.348';
        return await safeFetchWithTimeout(url, { ...options, headers }, 20000);
    };

    const dashboardRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashboardRes.status !== 200) throw new Error("Dashboard fetch failed.");
    const dashboardData = await dashboardRes.json();
    
    // Safely match target account: exact match first, or CASA fallback matching only for valid 4+ digit numbers
    const cleanNum = String(accountNumber || '').trim();
    const cleanDbId = String(bankAccountId || '').trim();
    
    let accountObj = dashboardData.payload?.dashboard?.find(a => 
      a.account === cleanNum || a.id === cleanNum || a.id === cleanDbId
    );

    if (!accountObj && cleanNum.length >= 4) {
      accountObj = dashboardData.payload?.dashboard?.find(a => 
        (a.category === 'currentAndSavingAccounts' || a.account_type === 'CASA') &&
        a.account && a.account.replace(/X/g, '').endsWith(cleanNum.slice(-4))
      );
    }
    if (!accountObj) throw new Error(`Target account ${accountNumber} not found.`);
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

async function fetchBmlHistoryPage(credentials, bankAccountId, accountNumber, port, page = 1, profileType = '0', payloadHardwareId = '', payloadBackendUrl = '', bmlCombinedLedger = false, isAutoSync = false) {
  emitLog(port, `> [BML-API] Starting page fetch for account ${accountNumber}, page ${page} (Combined: ${bmlCombinedLedger})...`);
  const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';
  try {
    const backendUrl = heldSession ? heldSession.backendUrl : (payloadBackendUrl || credentials.backendUrl || '');
    const terminalId = heldSession ? heldSession.hardwareId : (payloadHardwareId || credentials.terminalId || '');
    const bmlUsername = credentials?.username || '';
    const sanctumToken = credentials?.token || '';

    if (!isAutoSync) {
      logSessionEvent('fetch_request_submitted', { account: accountNumber, mode: 'history', page, bank: 'BML', backendUrl, hardwareId: terminalId, accountId: bankAccountId });
    }

    let token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
    if (!token) {
        emitLog(port, `> [BML-API] Token expired or not present. Initiating OAuth flow...`);
        await startBmlOAuthFlow(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        token = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken);
        if (!token) {
            throw new Error("Failed to acquire OAuth token after login.");
        }
    }

    const authFetch = async (url, options = {}) => {
        const currentToken = await getValidBmlAccessToken(terminalId, bankAccountId, backendUrl, bmlUsername, profileType, sanctumToken) || token;
        const headers = options.headers || {};
        headers['Authorization'] = `Bearer ${currentToken}`;
        headers['Accept'] = 'application/json';
        headers['User-Agent'] = 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)';
        headers['x-app-version'] = '2.1.44.348';
        return await safeFetchWithTimeout(url, { ...options, headers }, 20000);
    };

    // Step 1: GET /dashboard
    emitLog(port, `> [BML-API] GET ${BASE_URL}/api/mobile/dashboard`);
    const dashboardRes = await authFetch(`${BASE_URL}/api/mobile/dashboard`);
    if (dashboardRes.status !== 200) throw new Error("Dashboard fetch failed.");
    const dashboardData = await dashboardRes.json();
    logApiDebug(port, dashboardData, 'BML-DASHBOARD');
    
    const cleanNum = String(accountNumber || '').trim();
    const cleanDbId = String(bankAccountId || '').trim();
    
    let accountObj = dashboardData.payload?.dashboard?.find(a => 
      a.account === cleanNum || a.id === cleanNum || a.id === cleanDbId
    );

    if (!accountObj && cleanNum.length >= 4) {
      accountObj = dashboardData.payload?.dashboard?.find(a => 
        (a.category === 'currentAndSavingAccounts' || a.account_type === 'CASA') &&
        a.account && a.account.replace(/X/g, '').endsWith(cleanNum.slice(-4))
      );
    }
    if (!accountObj) throw new Error(`Target account ${accountNumber} not found.`);
    const accountInternalId = accountObj.id;
    const clearedBalanceVal = accountObj.clearedBalance !== undefined && accountObj.clearedBalance !== null ? accountObj.clearedBalance : (accountObj.balance || accountObj.availableBalance || '0.00');
    const availableBalanceVal = accountObj.availableBalance !== undefined && accountObj.availableBalance !== null ? accountObj.availableBalance : clearedBalanceVal;

    const clearedBalanceNum = typeof clearedBalanceVal === 'string' ? parseFloat(clearedBalanceVal.replace(/,/g, '')) : (parseFloat(clearedBalanceVal) || 0);
    const availableBalanceNum = typeof availableBalanceVal === 'string' ? parseFloat(availableBalanceVal.replace(/,/g, '')) : (parseFloat(availableBalanceVal) || 0);
    const reservedBalanceNum = Math.max(0, clearedBalanceNum - availableBalanceNum);

    const balance = clearedBalanceNum.toFixed(2);
    const reservedBalance = reservedBalanceNum.toFixed(2);
    const availableBalance = availableBalanceNum.toFixed(2);

    let allRawTxs = [];
    let totalPages = 1;

    let rawBankResponse = null;

    if (!bmlCombinedLedger) {
      // Branch A: Combined View OFF
      // Step 2: GET /history/1
      emitLog(port, `> [BML-API] [Branch A: Combined OFF] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
      const pageRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
      if (pageRes.status !== 200) throw new Error(`History page ${page} failed with status: ${pageRes.status}`);
      const pageData = await pageRes.json();
      rawBankResponse = pageData;
      logApiDebug(port, pageData, 'BML-PAGE-HISTORY');
      if (!pageData.success || !pageData.payload) throw new Error("Invalid response payload from BML API.");
      allRawTxs = pageData.payload.history || [];
      totalPages = pageData.payload.totalPages || 1;
    } else {
      // Branch B: Combined View ON
      // Step 2: GET /today
      let todayTxs = [];
      try {
        emitLog(port, `> [BML-API] [Branch B: Combined ON] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
        const todayRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/today`);
        if (todayRes.status === 200) {
          const todayData = await todayRes.json();
          todayTxs = todayData.payload?.history || todayData.payload || [];
        }
      } catch (e) {}

      // Step 3: GET /pending
      let pendingTxs = [];
      try {
        emitLog(port, `> [BML-API] [Branch B: Combined ON] GET ${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
        const pendingRes = await authFetch(`${BASE_URL}/api/mobile/history/pending/${accountInternalId}`);
        if (pendingRes.status === 200) {
          const pendingData = await pendingRes.json();
          pendingTxs = pendingData.payload?.history || pendingData.payload || [];
        }
      } catch (e) {}

      // Step 4: GET /history/1
      emitLog(port, `> [BML-API] [Branch B: Combined ON] GET ${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
      const pageRes = await authFetch(`${BASE_URL}/api/mobile/account/${accountInternalId}/history/${page}`);
      if (pageRes.status !== 200) throw new Error(`History page ${page} failed with status: ${pageRes.status}`);
      const pageData = await pageRes.json();
      rawBankResponse = pageData;
      totalPages = pageData.payload?.totalPages || 1;
      const page1Txs = pageData.payload?.history || [];

      // Step 5: Combine & deduplicate
      const rawCombined = [...pendingTxs, ...todayTxs, ...page1Txs];
      const seen = new Set();
      allRawTxs = rawCombined.filter(tx => {
        const k = `${tx.id || tx.reference || ''}-${tx.date || tx.transactionDate || ''}-${tx.amount || ''}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    const formattedTxs = normalizeTransactions(allRawTxs, 'BML', null);
    emitLog(port, `> [BML-API] Page ${page} fetched successfully. Total pages: ${totalPages}. Transactions found: ${formattedTxs.length}`);

    logSessionEvent('fetch_request_fulfilled', { account: accountNumber, tx_count: formattedTxs.length, mode: 'history', page, totalPages, bank: 'BML', backendUrl, hardwareId: terminalId, accountId: bankAccountId });

    return {
      transactions: formattedTxs,
      totalPages: totalPages,
      balance: balance,
      reservedBalance: reservedBalance,
      availableBalance: availableBalance,
      raw_bank_response: rawBankResponse
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

class MibTransientError extends Error {
  constructor(message) { super(message); this.name = 'MibTransientError'; }
}

class MibNetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MibNetworkError';
    if (cause !== undefined) this.cause = cause;
  }
}

// Transport-level failures that are safe to retry: MIB timeouts/5xx/429
// (MibTransientError), blocked/unreachable requests (MibNetworkError), and the
// raw AbortError/TypeError names produced by the fetch API before classification.
function isMibTransientError(err) {
  return !!err && (
    err instanceof MibTransientError ||
    err instanceof MibNetworkError ||
    err.name === 'AbortError' ||
    err.name === 'TypeError'
  );
}

// "Failed to fetch" is a transport-level rejection: the request never completed.
// In an MV3 service worker this is almost always a missing host-permission grant
// (extension "Site access" ≠ "On all sites") or a dead network. Turn the cryptic
// message into actionable guidance instead of surfacing the raw TypeError.
function mibFetchBlockedMessage(target, err) {
  const reason = (err && err.message) || 'Failed to fetch';
  return `${target} — network request failed: ${reason}. ` +
    'Verify the Viri Bridge extension has site access (chrome://extensions → Viri Bridge → Details → Site access = "On all sites") and that this device is online.';
}

// fetch wrapper that converts transport rejections into a MibNetworkError with
// actionable guidance. HTTP-level responses (even 4xx/5xx) pass through untouched.
async function fetchWithBlockedDiagnostics(label, url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new MibNetworkError(mibFetchBlockedMessage(label, err), err);
  }
}

// Default per-sfunc request timeout. Heavy first-of-session calls (A84 history)
// may override to a longer budget via the `options` argument of executeMibSfunc.
const MIB_SFUNC_TIMEOUT_MS = 10000;

// Yield control back to the event loop to prevent service worker blockage
// during synchronous crypto operations (Blowfish, BigInt modPow)
const yieldToEventLoop = () => new Promise(r => setTimeout(r, 0));

/**
 * Recover base64 ciphertext when the server prepends PHP display_errors HTML to
 * the response (reference _strip_php_notices, mib_client.py:51).
 */
function stripMibNotices(text) {
  if (!text.includes('<br')) return text.trim();
  const idx = text.lastIndexOf('<b>');
  if (idx >= 0) {
    const end = text.indexOf('<br />', idx);
    if (end >= 0) text = text.substring(end + 6);
  }
  return text.trim();
}

async function executeMibSfunc(sfunc, dataPayload, encryptKey, extraFormFields = {}, options = {}) {
  const { timeoutMs = MIB_SFUNC_TIMEOUT_MS } = options;
  // Yield before synchronous encryption to keep service worker responsive
  await yieldToEventLoop();

  // August-2026 transport: sfunc (and key2 for sfunc=i) must live at the TOP level
  // of the decrypted payload AND in the URL query string. Inject them here so the
  // 15 sfunc=n + 5 sfunc=i callers keep passing plain inner fields unchanged.
  const payload = { ...dataPayload };
  if (sfunc === 'r' || sfunc === 'i') {
    payload.sfunc = sfunc;
    if (sfunc === 'i' && extraFormFields.key2) payload.key2 = extraFormFields.key2;
  }

  const encrypted = blowfishEncrypt(JSON.stringify(payload), encryptKey);
  const uriEncoded = encodeURIComponent(encrypted);

  // sfunc/key2 go on the URL query string; everything else (xxid) stays in the body.
  const queryParts = [`sfunc=${sfunc}`];
  const formParts = [];
  for (const [k, v] of Object.entries(extraFormFields)) {
    if (k === 'sfunc' || k === 'key2') {
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    } else {
      formParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  formParts.push(`data=${uriEncoded}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(`${MIB_API_URL}?${queryParts.join('&')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': 'android/1.0',
      },
      body: formParts.join('&'),
      credentials: 'include',
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err && err.name === 'AbortError') {
      throw new MibTransientError(`MIB request timed out after ${timeoutMs}ms (sfunc=${sfunc}).`);
    }
    throw new MibNetworkError(mibFetchBlockedMessage(`MIB API (sfunc=${sfunc})`, err), err);
  }
  clearTimeout(timeoutId);

  // HTTP 419 = session expired (server signal)
  if (resp.status === 419) {
    throw new MibSessionExpiredError('HTTP 419 — session expired');
  }

  const rawBody = await resp.text();
  if (!rawBody) throw new Error("Empty response from MIB API");

  // Transient errors: server 5xx, rate limiting — NOT stale keys. Include the
  // response body so a server-side error (e.g. a C42 PHP bug) is visible.
  if (resp.status >= 500 || resp.status === 429) {
    const detail = rawBody ? rawBody.substring(0, 300) : '(empty)';
    throw new MibTransientError(`MIB transient: HTTP ${resp.status} — ${detail}`);
  }

  // Non-2xx errors. The body may be PLAINTEXT (e.g. 400 "route path is required",
  // 421 "Invalid session") OR ENCRYPTED — when the server finds the cipher key it
  // encrypts its error response (observed: HTTP 401 with a Blowfish body). Try
  // plaintext JSON first, then decrypt with the request key (reference _do_request).
  if (resp.status >= 400) {
    let msg = rawBody;
    let reasonCode = '';
    try {
      const j = JSON.parse(rawBody);
      if (j.reasonText) msg = j.reasonText;
      else if (j.message) msg = j.message;
      reasonCode = j.reasonCode || '';
    } catch (e) {
      try {
        await yieldToEventLoop();
        const decrypted = JSON.parse(blowfishDecrypt(stripMibNotices(rawBody), encryptKey));
        if (decrypted.reasonText) msg = decrypted.reasonText;
        else if (decrypted.message) msg = decrypted.message;
        reasonCode = decrypted.reasonCode || '';
        console.log(`[MIB] sfunc=${sfunc} HTTP ${resp.status} encrypted error reason=${decrypted.reasonText} code=${decrypted.reasonCode}`);
      } catch (decErr) {
        // keep raw body as message — not decryptable
      }
    }
    if (/session|invalid|expired/i.test(msg)) {
      throw new MibSessionExpiredError(`Session invalid: ${msg}${reasonCode ? ` (${reasonCode})` : ''}`);
    }
    throw new Error(`MIB HTTP ${resp.status} — ${msg}${reasonCode ? ` (code ${reasonCode})` : ''}`);
  }

  // Detect HTML / WebView error pages (start with '<').
  if (rawBody.charCodeAt(0) === 0x3C) {
    throw new MibTransientError(`MIB returned HTML/WebView error page (HTTP ${resp.status})`);
  }

  // Detect plaintext JSON error responses (MIB may return plaintext
  // on HTTP 500, 400, etc. — e.g. "internal Token/Digest fail").
  if (rawBody.charCodeAt(0) === 0x7B) {
    try {
      const plainErr = JSON.parse(rawBody);
      if (plainErr.reasonText) {
        throw new Error(`MIB API error: ${plainErr.reasonText} (HTTP ${resp.status}, code ${plainErr.reasonCode})`);
      }
      throw new MibTransientError(`MIB returned plaintext JSON without reasonText (HTTP ${resp.status})`);
    } catch (e) {
      if (e.message.startsWith('MIB API error') || e.message.includes('without reasonText')) throw e;
    }
  }

  try {
    // Yield before synchronous decryption
    await yieldToEventLoop();
    const decrypted = JSON.parse(blowfishDecrypt(stripMibNotices(rawBody), encryptKey));
    console.log(`[MIB] sfunc=${sfunc} HTTP ${resp.status} OK success=${decrypted.success} code=${decrypted.responseCode} reason=${decrypted.reasonText} keys=${Object.keys(decrypted).join(',')}`);
    
    // reasonCode 505 or error 101 = session expired (within encrypted response)
    if (!decrypted.success && (decrypted.reasonCode === '505' || decrypted.reasonText?.includes('Cipher key not found'))) {
      throw new MibSessionExpiredError(`Session expired: ${decrypted.reasonText} (${decrypted.reasonCode})`);
    }
    
    return decrypted;
  } catch (e) {
    if (e instanceof MibSessionExpiredError) throw e;
    console.error(`[MIB] sfunc=${sfunc} HTTP ${resp.status} body(200): "${rawBody.substring(0, 200)}" err=${e.message}`);
    throw new Error("Failed to decrypt MIB response. Possible stale keys.");
  }
}

/**
 * Run executeMibSfunc with bounded retries for transient failures (timeouts,
 * HTTP 5xx/429, transport/network rejections). Permanent errors — session
 * expiry / stale keys, HTTP 4xx, decryption failures — abort immediately.
 *
 * Callers that already implement their own retry loop (e.g. the sfunc=i resume
 * path) should keep calling executeMibSfunc directly to avoid double retries.
 */
async function executeMibSfuncWithRetry(sfunc, dataPayload, encryptKey, extraFormFields = {}, options = {}) {
  const attempts = Math.max(1, options.attempts || 1);
  const baseDelayMs = options.baseDelayMs || 1000;
  const port = options.port || null;
  const label = options.label ? ` (${options.label})` : '';
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      if (port) emitLog(port, `> [MIB-API] Retrying sfunc=${sfunc}${label} (attempt ${attempt + 1}/${attempts}, ${delay}ms)...`);
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      return await executeMibSfunc(sfunc, dataPayload, encryptKey, extraFormFields, { timeoutMs: options.timeoutMs });
    } catch (err) {
      lastErr = err;
      if (err instanceof MibSessionExpiredError || /stale keys/i.test(err.message)) {
        throw err; // permanent — retrying cannot help
      }
      if (!isMibTransientError(err)) {
        throw err; // unexpected — don't retry
      }
      // transient — loop again unless attempts are exhausted
    }
  }
  if (port && attempts > 1) emitLog(port, `> [MIB-API] sfunc=${sfunc}${label} failed after ${attempts} attempt(s): ${lastErr ? lastErr.message : 'unknown error'}`);
  throw lastErr;
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
  };
  const resp = await executeMibSfunc('n', payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
  if (resp.data && resp.data[0] && resp.data[0].userSalt) {
    return resp.data[0].userSalt;
  }
  throw new Error("Failed to fetch userSalt");
}

/**
 * FLAT S40 payload for sfunc=r / sfunc=i (August-2026 protocol). The new server
 * reads routePath (and key2/sfunc for sfunc=i) at the TOP level of the decrypted
 * payload — the old nested envelope is rejected with "route path is required".
 * executeMibSfunc injects sfunc (and key2 for 'i') before encrypting.
 */
function buildS40Payload(sfunc, appId, key2) {
  const payload = {
    cmod: computeCmod().toString(),
    appId,
    routePath: 'S40',
    sodium: generateSodium(),
    xxid: generateXxid(),
  };
  if (sfunc === 'r' || sfunc === 'i') {
    payload.sfunc = sfunc;
    if (sfunc === 'i' && key2) payload.key2 = key2;
  }
  return payload;
}

/**
 * (Re)send OTP via C43 (August-2026 route; the new app auto-sends on SMS).
 * Send on the channel's own code (SMS = '2'). Passes session state directly to
 * avoid re-reading chrome.storage (which could race with the just-stored temp).
 */
async function sendMibOtpResend(username, otpType, sessionState = null) {
  const ss = sessionState || (await chrome.storage.session.get('mibAuthTemp')).mibAuthTemp?.sessionState;
  if (!ss || !ss.xxid || !ss.sessionKey || !ss.nonceGenerator) {
    throw new Error('No MIB session state for C43 resend.');
  }
  const nonce = generateNonce(ss.nonceGenerator);
  const payload = {
    uname: username,
    otpType: otpType,
    nonce: nonce,
    appId: ss.appId,
    sodium: generateSodium(),
    routePath: 'C43',
    xxid: ss.xxid,
  };
  const resp = await executeMibSfunc('n', payload, ss.sessionKey, { xxid: ss.xxid, sfunc: 'n' });
  if (!resp.success) {
    throw new Error(`C43 failed: ${resp.reasonText || JSON.stringify(resp)}`);
  }
  return resp;
}

/**
 * If the terminal's local device-key cache is empty, restore it from the server
 * BEFORE the (untouched) startMibAuthFlow decides which flow to run. With keys
 * seeded, the next startMibAuthFlow picks the returning-device A41 path instead
 * of a fresh sfunc=r/C41/C42 registration — avoiding the "MIB transient: HTTP
 * 500" on re-registering an already-registered account. Additive only.
 *
 * @returns {Promise<boolean>} true if keys were seeded from the server.
 */
async function seedServerKeysIfCacheMissing(terminalId, bankAccountId, backendUrl, sanctumToken, mibUsername) {
  const cached = await chrome.storage.local.get(['mib_key1', 'mib_key2', 'mib_appId']);
  if (cached.mib_key1 && cached.mib_key2 && cached.mib_appId) {
    return false;
  }
  if (!sanctumToken || !backendUrl) return false;
  const params = new URLSearchParams({
    hardware_id: terminalId,
    bank_account_id: bankAccountId,
    mib_username: mibUsername || '',
  });
  const resp = await fetch(`${backendUrl}/mib/keys?${params}`, {
    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sanctumToken}` }
  });
  if (!resp.ok) return false;
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return false;
  }
  if (!data.key1 || !data.key2) return false;
  await chrome.storage.local.set({
    mib_key1: data.key1,
    mib_key2: data.key2,
    mib_appId: data.appId || cached.mib_appId,
  });
  if (data.profileId) {
    await chrome.storage.local.set({ mib_profileId: data.profileId, mib_profileType: data.profileType || '0' });
  }
  return true;
}

async function startMibAuthFlow(terminalId, bankAccountId, backendUrl, mibUsername, sanctumToken, password, hardwareId, accountNumber = '') {
  return Promise.race([
    new Promise((_, reject) => setTimeout(() => reject(new Error("Extension Auth Flow internal timeout after 20s")), 20000)),
    (async () => {
      const port = activePort;
      if(port) emitLog(port, '> [MIB-API] Starting MIB API auth flow...');

  // Canonical session key — account number preferred, DB id fallback. Must match
  // ensureMibSession/runMibApiFlow so a session created here is found on sync.
  const authSessionKey = 'mibSession_' + mibAccountKey(accountNumber, bankAccountId);
  const authProfileIdKey = 'mib_profileId_' + mibAccountKey(accountNumber, bankAccountId);
  const authProfileTypeKey = 'mib_profileType_' + mibAccountKey(accountNumber, bankAccountId);

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

    // August-2026 protocol: device keys (key1/key2) are generated CLIENT-SIDE and
    // sent in a FLAT sfunc=r payload; the server issues the real keys only after
    // C42. Always use a FRESH appId — reusing a stored IOS-era id is invalid.
    const clientKey1 = generateKey(40);
    const clientKey2 = generateKey(40);
    storedAppId = generateAppId();
    await chrome.storage.local.set({ mib_appId: storedAppId });
    sessionState.appId = storedAppId;
    sessionState.key1 = clientKey1;
    sessionState.key2 = clientKey2;

    // sfunc=r (flat payload, client keys, encrypted with DEFAULT_KEY)
    const rPayload = {
      sfunc: 'r',
      key1: clientKey1,
      key2: clientKey2,
      cmod: computeCmod().toString(),
      appId: storedAppId,
      routePath: 'S40',
      sodium: generateSodium(),
      xxid: generateXxid(),
    };
    const rResp = await executeMibSfunc('r', rPayload, DEFAULT_KEY);
    console.log(`[MIB] sfunc=r response success=${rResp.success} code=${rResp.responseCode} reason=${rResp.reasonText} xxid=${rResp.xxid}`);
    if (!rResp.success) {
      throw new Error(`sfunc=r failed: ${rResp.reasonText} (${rResp.reasonCode})`);
    }
    sessionState.xxid = String(rResp.xxid);
    sessionState.nonceGenerator = rResp.nonceGenerator;
    sessionState.sessionKey = await deriveSessionKey(rResp.smod);

    // Some backends return keys directly from sfunc=r (fast-path optimization).
    // The new server does NOT — the C42 response carries the authoritative keys.
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
        const iResp = await executeMibSfunc('i', buildS40Payload('i', storedAppId, sessionState.key2), sessionState.key1, { key2: sessionState.key2 });

        // Save new session data
        sessionState.sessionKey = await deriveSessionKey(iResp.smod);
        sessionState.xxid = String(iResp.xxid);
        sessionState.nonceGenerator = iResp.nonceGenerator;

        sessionState.username = mibUsername;
        await chrome.storage.session.set({ [authSessionKey]: sessionState });
        if(port) emitLog(port, '> [MIB-API] Fast-path successful. Keys were valid.');
        return { success: true, skipOtp: true };
      } catch (e) {
        if (e instanceof MibTransientError) throw e;
        if(port) emitLog(port, '> [MIB-API] Fast-path keys were stale. Falling back to C41...');
        sessionState.key1 = clientKey1;
        sessionState.key2 = clientKey2;
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
      otpType: '3',
    };

    console.log(`[MIB] A44/C41 payload xxid="${sessionState.xxid}" nonceGen="${sessionState.nonceGenerator?.substring(0, 30)}" sessionKey="${sessionState.sessionKey?.substring(0, 16)}"`);
    const c41Resp = await executeMibSfunc('n', c41Payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
    console.log(`[MIB] C41 success=${c41Resp.success} primaryOTPType=${c41Resp.primaryOTPType} otpTypes=${JSON.stringify(c41Resp.otpTypes)} reason=${c41Resp.reasonText}`);
    if (c41Resp.success) {
      if(port) emitLog(port, '> [MIB-API] C41 successful. OTP required.');
      await chrome.storage.session.set({ mibAuthTemp: { sessionState, clientSalt, userSalt, pgf03, flow: 'C42', primaryOTPType: c41Resp.primaryOTPType, otpTypes: c41Resp.otpTypes, resendGap: c41Resp.resendGap, mibPassword: password, mibUsername, accountNumber } });

      // Mirror the new app's auto-send (useSmsOtpResend): it only fires when the
      // PRIMARY OTP type is SMS (isSmsOtpType), NOT merely when SMS is in the channel
      // list. For a primaryOTPType of '3' (Authenticator) the app shows the TOTP sheet
      // and sends no SMS — auto-sending here would deliver a code that never verifies.
      try {
        const primaryChannel = String(c41Resp.primaryOTPType || '');
        if (primaryChannel === '2') {
          await sendMibOtpResend(mibUsername, '2', sessionState);
          console.log('[MIB] Auto-sent SMS OTP via C43 (SMS primary).');
          if(port) emitLog(port, '> [MIB-API] Auto-sent SMS OTP via C43.');
        }
      } catch (e) {
        console.log(`[MIB] C43 auto-send skipped: ${e.message}`);
        if(port) emitLog(port, `> [MIB-API] C43 auto-send skipped: ${e.message}`);
      }

      return { success: true, requiresOtp: true, otpTypes: c41Resp.otpTypes, primaryOtpType: c41Resp.primaryOTPType };
    } else {
      throw new Error(`C41 failed: ${c41Resp.reasonText || JSON.stringify(c41Resp)}`);
    }
  };

  if (storedKey1 && storedKey2) {
    if(port) emitLog(port, '> [MIB-API] Found stored keys. Attempting returning device login (A41)...');
    sessionState.key1 = storedKey1;
    sessionState.key2 = storedKey2;

    try {
      const iResp = await executeMibSfunc('i', buildS40Payload('i', storedAppId, sessionState.key2), sessionState.key1, { key2: sessionState.key2 });
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
        otpType: '3',
      };

      const a41Resp = await executeMibSfunc('n', a41Payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
      if (a41Resp.success) {
        // Extract profile info from A41 response
        const a41Profiles = a41Resp.operatingProfiles || a41Resp.payload?.login?.operatingProfiles || [];
        const firstProfile = a41Profiles[0] || {};
        // Single-profile fast-path: A41 may set selectedProfileId without operatingProfiles
        const a41ProfileId = firstProfile.profileId || a41Resp.selectedProfileId || a41Resp.payload?.login?.selectedProfileId;
        const a41ProfileType = firstProfile.profileType || '0';

        // ── Multi-profile detection ──
        if (!a41Resp.profileSelected && Array.isArray(a41Profiles) && a41Profiles.length > 1) {
          if(port) emitLog(port, `> [MIB-API] Multi-profile detected: ${a41Profiles.length} profiles.`);

          await chrome.storage.session.set({
            mibAuthTemp: {
              sessionState,
              profiles: a41Profiles,
              key1ToSave: sessionState.key1,
              key2ToSave: sessionState.key2,
              mibPassword: password,
              mibUsername,
              terminalId,
              bankAccountId,
              backendUrl,
              sanctumToken,
              accountNumber
            }
          });

          return { success: true, needProfile: true, profiles: a41Profiles };
        }
        // ── End multi-profile code ──

        // Per FLOW.md: OTP is signaled by primaryOTPType/otpTypes at the A41 response root.
        // But if profileSelected is true (single-profile fast-path), OTP is always skipped.
        if (a41Resp.profileSelected) {
          if(port) emitLog(port, '> [MIB-API] A41 single-profile fast-path. No OTP required.');
          const spProfileId = a41Resp.selectedProfileId || a41ProfileId || 'default_profile';
          const spProfileType = a41Resp.selectedProfileType || a41ProfileType || '0';
          const spProfileName = firstProfile.profileName || a41Resp.selectedProfileName || 'Legacy Profile';
          const credsHash = await computeCredsHash('MIB', mibUsername);
          if (spProfileId) {
            await chrome.storage.local.set({ [authProfileIdKey]: spProfileId, [authProfileTypeKey]: spProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${spProfileId} (type ${spProfileType}).`);
          }
          sessionState.username = mibUsername;
          await chrome.storage.session.set({ [authSessionKey]: sessionState });
          
          try {
            if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
            const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
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
                mib_password: password,
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
          await chrome.storage.session.set({ mibAuthTemp: { sessionState, clientSalt, userSalt, pgf03, flow: 'C42', primaryOTPType: a41Resp.primaryOTPType || '3', mibPassword: password, mibUsername, mibProfileId: a41ProfileId, mibProfileType: a41ProfileType, mibProfileName: spProfileName, accountNumber } });
          return { success: true, requiresOtp: true };
        } else {
          // Fast path, no OTP needed. Save profile and session.
          const spProfileId = a41ProfileId || 'default_profile';
          const spProfileType = a41ProfileType || '0';
          const spProfileName = firstProfile.profileName || 'Legacy Profile';
          const credsHash = await computeCredsHash('MIB', mibUsername);
          if (a41ProfileId) {
            await chrome.storage.local.set({ [authProfileIdKey]: a41ProfileId, [authProfileTypeKey]: a41ProfileType });
            if(port) emitLog(port, `> [MIB-API] Saved profile ${a41ProfileId} (type ${a41ProfileType}).`);
          }
          sessionState.username = mibUsername;
          await chrome.storage.session.set({ [authSessionKey]: sessionState });
          
          try {
            if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
            const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
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
                mib_password: password,
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

async function submitMibOtp(otp, terminalId, bankAccountId, backendUrl, mibUsername, sanctumToken, otpType = '3', accountNumber = '') {
  const port = activePort;
  const { mibAuthTemp } = await chrome.storage.session.get('mibAuthTemp');
  if (!mibAuthTemp) throw new Error("No MIB auth session found in storage.");

  // Resolve the backend auth token the same way the resume path does, so a store
  // that runs with an empty popup localStorage token still authenticates.
  if (!sanctumToken) {
    const t = await chrome.storage.local.get('sanctumToken');
    sanctumToken = t.sanctumToken || '';
  }

  // Canonical session key — same precedence as startMibAuthFlow/ensureMibSession.
  const acctKey = mibAccountKey(accountNumber || mibAuthTemp?.accountNumber || '', bankAccountId);
  const authSessionKey = 'mibSession_' + acctKey;
  const authProfileIdKey = 'mib_profileId_' + acctKey;
  const authProfileTypeKey = 'mib_profileType_' + acctKey;

  const { sessionState, flow, primaryOTPType, mibPassword } = mibAuthTemp;

  // Verify with the SELECTED channel's own code. The old server 500'd on SMS otpType
  // '2' (PHP bug, HANDOFF §7.4) — so if the '2' attempt hits a 5xx, retry once with '3'
  // (the established workaround). Authenticator/other channels use their own code.
  const selectedCode = String(otpType || primaryOTPType || '3');
  const attempts = selectedCode === '2' ? ['2', '3'] : [selectedCode];

  let resp = null;
  let lastErr = null;
  for (const code of attempts) {
    const sodium = generateSodium();
    const nonce = generateNonce(sessionState.nonceGenerator);
    if(port) emitLog(port, `> [MIB-API] Submitting OTP via ${flow} (otpType ${code})...`);
    const payload = {
      sodium: sodium,
      routePath: flow,
      xxid: sessionState.xxid,
      otp: otp,
      uname: mibUsername,
      otpType: code,
      appId: sessionState.appId,
      nonce: nonce,
    };
    try {
      resp = await executeMibSfunc('n', payload, sessionState.sessionKey, { xxid: sessionState.xxid, sfunc: 'n' });
      lastErr = null;
      break;
    } catch (e) {
      if (e instanceof MibSessionExpiredError) throw e;
      lastErr = e;
      const is5xx = e instanceof MibTransientError && /HTTP 5\d\d/.test(e.message);
      if (!is5xx || code === attempts[attempts.length - 1]) break; // 401/4xx → don't retry same code
    }
  }
  if (!resp) {
    throw new Error(`OTP verification failed (${lastErr?.message || 'unknown error'}). Check the code is current and from the selected method, resend if needed, then try again.`);
  }
  
  if (resp.success) {
    if(port) emitLog(port, '> [MIB-API] OTP Verified successfully.');
    
    // Resolve key1/key2 (from C42/A42 response data or fallback to cached sessionState keys)
    const key1ToSave = (resp.data && resp.data[0] && resp.data[0].key1) ? resp.data[0].key1 : sessionState.key1;
    const key2ToSave = (resp.data && resp.data[0] && resp.data[0].key2) ? resp.data[0].key2 : sessionState.key2;

    if (key1ToSave && key2ToSave) {
      sessionState.key1 = key1ToSave;
      sessionState.key2 = key2ToSave;
      await chrome.storage.local.set({ mib_key1: key1ToSave, mib_key2: key2ToSave });

      // ── Only store profile if not multi-profile ──
      const isMultiProfile = Array.isArray(mibAuthTemp.profiles) && mibAuthTemp.profiles.length > 1;
      if (!isMultiProfile) {
        const { mibProfileId, mibProfileType, mibProfileName } = mibAuthTemp;
        const spProfileId = mibProfileId || 'default_profile';
        const spProfileType = mibProfileType || '0';
        const spProfileName = mibProfileName || 'Legacy Profile';
        const credsHash = await computeCredsHash('MIB', mibUsername);
            if (mibProfileId) {
              await chrome.storage.local.set({ [authProfileIdKey]: mibProfileId, [authProfileTypeKey]: mibProfileType || '0' });
            }
        // Store in backend
        if(port) emitLog(port, '> [MIB-API] Storing device keys in backend...');
        const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
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
            mib_password: mibPassword,
            credentials_hash: credsHash
          })
        });
        if (!storeResp.ok) {
          const errText = await storeResp.text();
          throw new Error(`Server failed to store keys: Status ${storeResp.status} - ${errText}`);
        }
      }
    }

    // After C42, use password (still in mibAuthTemp) to establish authenticated web session via A41
    if ((flow === 'C42' || flow === 'A42') && mibPassword && key1ToSave && key2ToSave) {
      try {
        if(port) emitLog(port, '> [MIB-API] Establishing web session via A41...');
        // sfunc=i resume with new keys
        const iResp = await executeMibSfunc('i', buildS40Payload('i', sessionState.appId, key2ToSave), key1ToSave, { key2: key2ToSave });
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
              if(port) emitLog(port, `> [MIB-API] A41 web login successful.`);

              // Update session state with web session
              sessionState.xxid = webXxid;
              sessionState.nonceGenerator = webNonceGen;
              sessionState.sessionKey = webSessionKey;

              const c42Profiles = a41Resp.operatingProfiles || a41Resp.payload?.login?.operatingProfiles || [];

              // ── NEW: Multi-profile detected after OTP ──
              if (!a41Resp.profileSelected && Array.isArray(c42Profiles) && c42Profiles.length > 1) {
                if(port) emitLog(port, `> [MIB-API] Multi-profile after OTP: ${c42Profiles.length} profiles.`);
                await chrome.storage.session.set({
                  mibAuthTemp: {
                    sessionState,
                    profiles: c42Profiles,
                    key1ToSave,
                    key2ToSave,
                    mibPassword,
                    mibUsername,
                    terminalId,
                    bankAccountId,
                    backendUrl,
                    sanctumToken,
                    accountNumber
                  }
                });
                sessionState.username = mibUsername;
                await chrome.storage.session.set({ [authSessionKey]: sessionState });
                return { success: true, needProfile: true, profiles: c42Profiles };
              }

              // Single-profile: save as before
              const c42First = c42Profiles[0] || {};
              if (c42First.profileId) {
                await chrome.storage.local.set({ [authProfileIdKey]: c42First.profileId, [authProfileTypeKey]: c42First.profileType || '0' });
              }
            }
          }
        }
      } catch (e) {
        if(port) emitLog(port, `> [MIB-API] Web session setup failed (non-fatal): ${e.message}`);
      }
    }

    sessionState.username = mibUsername;
    await chrome.storage.session.set({ [authSessionKey]: sessionState });
    await chrome.storage.session.remove('mibAuthTemp');
    return { success: true };
  } else {
    throw new Error(`OTP Verification failed: ${resp.reasonText || resp.message || JSON.stringify(resp)}`);
  }
}

async function ensureMibSession(port, terminalId, backendUrl, credentials, targetAccount, sanctumTokenParam = '') {
  // Canonical keys — same helper/precedence as the auth flow writers, so a
  // session created during re-authentication is found here on sync.
  const acctKey = mibAccountKey(targetAccount, '');
  const mibSessionKey = 'mibSession_' + acctKey;
  const mibProfileIdKey = 'mib_profileId_' + acctKey;
  const mibProfileTypeKey = 'mib_profileType_' + acctKey;
  // ── Hoisted server identity fetch (single round-trip, throw-proof) ──
  // Replaces the two downstream server-fetch blocks. It (a) resolves the token via
  // the full sanctumToken -> sanctumTokenParam -> credentials.token chain, (b) keeps
  // local device keys in sync so a stale local key can never trigger an unnecessary
  // sfunc=r re-registration, and (c) provisions the shared group's credentials so a
  // linked-but-unpaired account can authenticate without a fresh sign-in. Any failure
  // falls back to local cache with today's behavior (never breaks the cached path).
  let serverIdentity = null;
  try {
    const tokenRes = await chrome.storage.local.get('sanctumToken');
    const token = tokenRes.sanctumToken || sanctumTokenParam || credentials?.token || '';
    if (token) {
      const params = new URLSearchParams({ hardware_id: terminalId });
      if (targetAccount) params.append('account_number', targetAccount);
      const keysResp = await fetchWithBlockedDiagnostics(`Viri backend ${backendUrl}/mib/keys`, `${backendUrl}/mib/keys?${params}`, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (keysResp.ok) {
        const keysData = await keysResp.json();
        if (keysData.key1 && keysData.key2) {
          serverIdentity = {
            appId: keysData.appId || '',
            username: keysData.mib_username || '',
            password: keysData.mib_password || '',
            key1: keysData.key1,
            key2: keysData.key2,
            profileId: keysData.profileId || null,
            profileType: keysData.profileType || null,
          };
        }
      }
    }
  } catch (e) {
    // best-effort — continue with local cache
    if(port) emitLog(port, `> [MIB-API] Server identity fetch skipped: ${e.message}`);
  }

  // Sync server device keys into local cache when missing or different, and persist
  // the server's profile selection (same semantics as the previous always-check block).
  let localRes = await chrome.storage.local.get(['mib_appId', 'mib_key1', 'mib_key2']);
  if (serverIdentity && serverIdentity.key1 && serverIdentity.key2) {
    const keysDiffer = serverIdentity.key1 !== localRes.mib_key1 || serverIdentity.key2 !== localRes.mib_key2;
    if (!localRes.mib_key1 || !localRes.mib_key2 || keysDiffer) {
      const appId = serverIdentity.appId || localRes.mib_appId || '';
      await chrome.storage.local.set({ mib_key1: serverIdentity.key1, mib_key2: serverIdentity.key2, mib_appId: appId });
      localRes = { mib_appId: appId, mib_key1: serverIdentity.key1, mib_key2: serverIdentity.key2 };
      if(port) emitLog(port, '> [MIB-API] Synced server device keys to local cache.');
    }
    const profUpdate = {};
    if (serverIdentity.profileId) profUpdate[mibProfileIdKey] = serverIdentity.profileId;
    if (serverIdentity.profileType) profUpdate[mibProfileTypeKey] = serverIdentity.profileType;
    if (Object.keys(profUpdate).length) await chrome.storage.local.set(profUpdate);
  }

  // Provision the shared group's credentials (chrome.storage.session — non-persistent,
  // same medium as the existing seedMibKeysFromServer). The A40/A41 fallback reads
  // mib_stored_creds_map[targetAccount], so a linked-but-unpaired account now authenticates.
  if (serverIdentity && serverIdentity.username && serverIdentity.password) {
    const { mib_stored_creds_map = {} } = await chrome.storage.session.get('mib_stored_creds_map');
    mib_stored_creds_map[targetAccount] = { username: serverIdentity.username, password: serverIdentity.password };
    mib_stored_creds_map['__username_' + serverIdentity.username] = { username: serverIdentity.username, password: serverIdentity.password };
    await chrome.storage.session.set({ mib_stored_creds_map });
    if(port) emitLog(port, `> [MIB-API] Provisioned shared credentials for account ${targetAccount}.`);
  }

  let { [mibSessionKey]: mibSession } = await chrome.storage.session.get(mibSessionKey);
  if (mibSession && mibSession.sessionKey) {
    // Discard a cached session only when the account was re-linked to a DIFFERENT
    // user's credential group. Identity = group username. NEVER discard on appId:
    // the appId legitimately changes for the same user when another terminal
    // re-registers or a stale per-account device row wins in getKeys. Sessions that
    // predate this version carry no recorded username and were never reusable anyway
    // (the old A80 always failed), so discarding them just reproduces today's resume.
    if (serverIdentity?.username && (!mibSession.username || serverIdentity.username !== mibSession.username)) {
      if(port) emitLog(port, `> [MIB-API] Cached session cannot be verified for user (${serverIdentity.username}); discarding.`);
      await chrome.storage.session.remove(mibSessionKey);
      await chrome.storage.local.remove([mibProfileIdKey, mibProfileTypeKey]);
      mibSession = null;
    }
  }
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
        logSessionEvent('session_reused', { account: targetAccount || 'unknown' });
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
  if (!localRes.mib_appId || !localRes.mib_key1 || !localRes.mib_key2) {
    throw new Error("Missing MIB device credentials. Please link account again.");
  }

  try {
    // sfunc=i resume with retry for transient server errors.
    // MibSessionExpiredError / stale keys are permanent — propagate to outer catch → sfunc=r.
    let iResp;
    let retryCount = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        if(port) emitLog(port, `> [MIB-API] Retrying sfunc=i (attempt ${attempt + 1}/3, ${delay}ms)...`);
        await new Promise(r => setTimeout(r, delay));
      }
      const freshPayload = buildS40Payload('i', localRes.mib_appId, localRes.mib_key2);
      try {
        iResp = await executeMibSfunc('i', freshPayload, localRes.mib_key1, { key2: localRes.mib_key2 });
        retryCount = attempt;
        break;
      } catch (err) {
        if (err instanceof MibSessionExpiredError || /stale keys/i.test(err.message)) {
          throw err; // permanent — let outer catch handle with sfunc=r
        }
        if (isMibTransientError(err)) {
          if (attempt === 2) throw err; // exhausted retries
          continue;
        }
        throw err; // unexpected — don't retry
      }
    }
    if (!iResp) throw new Error('sfunc=i failed after retries');
    if (retryCount > 0) {
      if(port) emitLog(port, `> [MIB-API] sfunc=i succeeded after ${retryCount + 1} attempt(s).`);
    }
    mibSession = {
      appId: localRes.mib_appId,
      key1: localRes.mib_key1,
      key2: localRes.mib_key2,
      username: serverIdentity?.username || credentials?.username || '',
      sessionKey: await deriveSessionKey(iResp.smod),
      xxid: String(iResp.xxid),
      nonceGenerator: iResp.nonceGenerator
    };
    await chrome.storage.session.set({ [mibSessionKey]: mibSession });
    if(port) emitLog(port, '> [MIB-API] Session resumed successfully.');
    logSessionEvent('session_created', { account: targetAccount || 'unknown' });

    // Get stored profile (if any) for later use (per-account)
    const { [mibProfileIdKey]: mib_profileId, [mibProfileTypeKey]: mib_profileType } = await chrome.storage.local.get([mibProfileIdKey, mibProfileTypeKey]);

    // A44 → A41: Authenticate session so P47 recognizes it
    // (matching test app's regularLogin() flow)
    let profileSelected = false;
    const hasCreds = credentials?.username?.length > 0 && credentials?.password?.length > 0;

    if (hasCreds) {
      try {
        const a44Sodium = generateSodium();
        const a44Nonce = generateNonce(mibSession.nonceGenerator);
        const a44Payload = {
          sodium: a44Sodium, routePath: 'A44', xxid: mibSession.xxid,
          uname: credentials.username, nonce: a44Nonce, appId: mibSession.appId,
        };
        const a44Resp = await executeMibSfunc('n', a44Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
        const userSalt = a44Resp.success ? (a44Resp.data?.[0]?.userSalt || null) : null;

        if (userSalt) {
          const a41Sodium = generateSodium();
          const a41Nonce = generateNonce(mibSession.nonceGenerator);
          const clientSalt = generateClientSalt();
          const pgf03 = await computePgf03(credentials.password, userSalt, clientSalt);
          const a41Payload = {
            sodium: a41Sodium, routePath: 'A41', xxid: mibSession.xxid,
            uname: credentials.username, clientSalt, pgf03, nonce: a41Nonce,
            appId: mibSession.appId, pmodTime: 0, requireBankData: 1,
          };
          const a41Resp = await executeMibSfunc('n', a41Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' });
          if (a41Resp.success) {
            const a41Profiles = a41Resp.operatingProfiles || [];
            const sp = a41Resp.profileSelected;
            // Resume mirrors the auth fast-path (:2467): profileSelected alone is
            // enough to consider the profile selected. accountBalance is only needed
            // to cache balances, and we persist the selected profile so the P47
            // balance fallback still works when the resumed session returns none.
            if (sp) {
              profileSelected = true;
              const resumeProfileId = a41Resp.selectedProfileId || (a41Profiles[0] && (a41Profiles[0].profileId || a41Profiles[0].customerProfileId)) || mib_profileId;
              const resumeProfileType = a41Resp.selectedProfileType || (a41Profiles[0] && a41Profiles[0].profileType) || mib_profileType || '0';
              if (resumeProfileId) {
                await chrome.storage.local.set({ [mibProfileIdKey]: resumeProfileId, [mibProfileTypeKey]: resumeProfileType });
              }
              if (Array.isArray(a41Resp.accountBalance) && a41Resp.accountBalance.length > 0) {
                await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: a41Resp.accountBalance });
                if(port) emitLog(port, `> [MIB-API] A41 fast-path: ${a41Resp.accountBalance.length} accounts.`);
              } else if (resumeProfileId) {
                const p47Result = await attemptP47(port, mibSession, resumeProfileId, resumeProfileType);
                if (p47Result.accountBalance.length > 0) {
                  await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
                  if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
                }
              }
            } else if (mib_profileId) {
              const p47Result = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
              profileSelected = p47Result.selected;
              if (p47Result.accountBalance.length > 0) {
                await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
                if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
              }
            } else if (a41Profiles.length > 0) {
              if(port) emitLog(port, `> [MIB-API] Multi-profile (${a41Profiles.length}) in resume — will re-enter login flow.`);
            }
          }
        }
      } catch (e) {
        if(port) emitLog(port, `> [MIB-API] A41 login in resume failed: ${e.message}`);
      }
    }

    if (!profileSelected) {
      // Fallback: check chrome.storage.session for cached credentials (per-account)
      if (!hasCreds) {
        try {
          const { mib_stored_creds_map = {} } = await chrome.storage.session.get('mib_stored_creds_map');
          const storedCreds = mib_stored_creds_map[targetAccount];
          if (storedCreds?.username?.length > 0 && storedCreds?.password?.length > 0) {
            credentials = storedCreds;
            if(port) emitLog(port, `> [MIB-API] Using stored fallback credentials for account ${targetAccount}.`);
          }
        } catch(e) {}
      }
      const uname = credentials?.username?.length > 0 ? credentials.username : '';
      const pwd = credentials?.password?.length > 0 ? credentials.password : '';
      if (!uname && port) emitLog(port, '> [MIB-API] WARNING: No MIB credentials available. A40 will be skipped.');

      if (uname && pwd) {
        if(port) emitLog(port, '> [MIB-API] Attempting A40 authentication fallback...');
        try {
          const a40Sodium = generateSodium();
          const a40Nonce = generateNonce(mibSession.nonceGenerator);
          const a40Payload = {
            sodium: a40Sodium, routePath: 'A40', xxid: mibSession.xxid,
            uname, pgf02: pwd, pmodTime: 0, requireBankData: 1,
            nonce: a40Nonce, appId: mibSession.appId,
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
              await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: a40Resp.accountBalance });
              if(port) emitLog(port, `> [MIB-API] A40 fast-path: cached ${a40Resp.accountBalance.length} account balance(s).`);
            }
            // Also save the selectedProfileId so future P47 calls use the right profile
            if (a40Resp.selectedProfileId) {
              await chrome.storage.local.set({
                [mibProfileIdKey]: a40Resp.selectedProfileId,
                [mibProfileTypeKey]: a40Resp.selectedProfileType || '0'
              });
            }

          } else {
            const a40Profiles = a40Resp.operatingProfiles || [];
            if (a40Profiles.length > 0) {
              // FIX 4: Always use customerProfileId (P47 payload field) — fall back to profileId only if missing
              const prof = a40Profiles[0];
              const profileId = prof.customerProfileId || prof.profileId;
              const profileType = prof.profileType || '0';
              await chrome.storage.local.set({ [mibProfileIdKey]: profileId, [mibProfileTypeKey]: profileType });
              if(port) emitLog(port, `> [MIB-API] Saved profile from A40: customerProfileId=${profileId} (type ${profileType}).`);
              // Retry P47 with the saved profile; capture and store the returned balance
              const p47Result = await attemptP47(port, mibSession, profileId, profileType);
              profileSelected = p47Result.selected;
              if (p47Result.accountBalance.length > 0) {
                await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
                if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} account balance(s) from P47.`);
              }
            } else {
              // Single-profile fast-path — A40 may return accountBalance directly
              if (a40Resp.selectedProfileId) {
                await chrome.storage.local.set({
                  [mibProfileIdKey]: a40Resp.selectedProfileId,
                  [mibProfileTypeKey]: a40Resp.selectedProfileType || '0'
                });
                const p47Result = await attemptP47(port, mibSession, a40Resp.selectedProfileId, a40Resp.selectedProfileType || '0');
                profileSelected = p47Result.selected;
                if (p47Result.accountBalance.length > 0) {
                  await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
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
          }
        } else {
          if(port) emitLog(port, `> [MIB-API] A40 authentication failed: ${a40Resp.reasonText}`);
        }
      } catch (a40e) {
        if(port) emitLog(port, `> [MIB-API] A40 fallback error: ${a40e.message}`);
      }
      }  // close if (uname && pwd)
    }

    // A80 safety-net: when the freshly resumed sfunc=i session is a live, authenticated
    // shared bank session and this account's profile is already known (confirmed link),
    // validate it with A80 and proceed WITHOUT credentials. Gated on a known profileId
    // so it can never claim a profile-selected state it cannot map to a real profile.
    if (!profileSelected && serverIdentity?.profileId) {
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
          await chrome.storage.local.set({
            [mibProfileIdKey]: serverIdentity.profileId,
            [mibProfileTypeKey]: serverIdentity.profileType || '0'
          });
          if(port) emitLog(port, `> [MIB-API] A80 confirmed live shared session (profile ${serverIdentity.profileId}). Proceeding without credentials.`);
          profileSelected = true;
        }
      } catch (a80e) {
        if(port) emitLog(port, `> [MIB-API] A80 safety-net failed: ${a80e.message}`);
      }
    }

    if (!profileSelected) {
      throw new Error("MIB authentication failed: no credentials available or profile could not be selected. Please re-pair the account.");
    }

    // Log cookies after session setup
    chrome.cookies.getAll({ domain: 'mib.com.mv' }, (cookies) => {
      if(port) emitLog(port, `> [MIB-API] Cookies after session setup: ${cookies.map(c => `${c.name}=${c.value.substring(0,30)}`).join(', ')}`);
    });
    return mibSession;
  } catch(e) {
    if (e instanceof MibSessionExpiredError || /stale keys/i.test(e.message)) {
      // August-2026 protocol: a stale device can no longer be re-registered inline —
      // sfunc=r returns no keys and the new-bundle device registration requires the
      // C41→C42 OTP gate, which needs the PWA login screen. Clear the invalid local
      // device state and surface a clear expiry error so the cashier is routed to the
      // normal MIB login page (existing valid sessions resume above and never reach
      // this point).
      if(port) emitLog(port, '> [MIB-API] Session keys expired. Clearing local device state...');
      await chrome.storage.local.remove(['mib_key1', 'mib_key2']);
      await chrome.storage.session.remove(mibSessionKey);
      logSessionEvent('session_expired', { account: targetAccount || 'unknown' });
      throw new Error('MIB session expired — no credentials available, please log in again on the MIB connection page.');
    }
    throw e;
  }
}

async function attemptP47(port, mibSession, profileId, profileType) {
  const p47Sodium = generateSodium();
  const p47Nonce = generateNonce(mibSession.nonceGenerator);
  const p47Payload = {
    profileType: profileType || '0',
    profileId: profileId,
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

async function selectMibProfile(profileId, profileType) {
  const port = activePort;
  const { mibAuthTemp } = await chrome.storage.session.get('mibAuthTemp');
  if (!mibAuthTemp || !mibAuthTemp.sessionState) {
    throw new Error("No pending MIB auth session for profile selection.");
  }

  const { sessionState, profiles, mibUsername, key1ToSave, key2ToSave, terminalId, bankAccountId, backendUrl, sanctumToken, accountNumber } = mibAuthTemp;

  // Resolve the backend auth token the same way the resume path does.
  let effectiveSanctumToken = sanctumToken;
  if (!effectiveSanctumToken) {
    const t = await chrome.storage.local.get('sanctumToken');
    effectiveSanctumToken = t.sanctumToken || '';
  }

  // Canonical per-account keys — must match the resume flow (account number
  // preferred, DB id fallback).
  const acctKey = mibAccountKey(accountNumber || '', bankAccountId);
  const authSessionKey = 'mibSession_' + acctKey;
  const authProfileIdKey = 'mib_profileId_' + acctKey;
  const authProfileTypeKey = 'mib_profileType_' + acctKey;

  // Find selected profile name from profiles list
  const selectedProfile = (profiles || []).find(p =>
    (p.profileId || p.customerProfileId) === profileId
  );
  const profileName = selectedProfile?.profileName || selectedProfile?.name || 'Profile';

  if(port) emitLog(port, `> [MIB-API] Selecting MIB profile via P47: ${profileId} (${profileType})`);

  // Call P47
  const p47Result = await attemptP47(port, sessionState, profileId, profileType);
  if (!p47Result.selected) {
    throw new Error("P47 profile selection failed.");
  }

  // Save profile to storage (global + per-account)
  await chrome.storage.local.set({
    mib_profileId: profileId,
    mib_profileType: profileType,
    [authProfileIdKey]: profileId,
    [authProfileTypeKey]: profileType,
  });
  // Persist the live session so the next sync reuses it (A80) instead of a
  // full resume. The username field is required by ensureMibSession's identity
  // guard; P47 on the resumed session is the profile-selected session.
  sessionState.username = sessionState.username || mibUsername;
  await chrome.storage.session.set({ [authSessionKey]: sessionState });

  // Save keys and profile to backend
  const credsHash = await computeCredsHash('MIB', mibUsername);
  const storeBody = {
    hardware_id: terminalId,
    bank_account_id: bankAccountId,
    mib_username: mibUsername,
    key1: key1ToSave,
    key2: key2ToSave,
    app_id: sessionState.appId,
    profile_id: profileId,
    profile_type: profileType,
    profile_name: profileName,
    credentials_hash: credsHash,
  };
  if (mibAuthTemp?.mibPassword) {
    storeBody.mib_password = mibAuthTemp.mibPassword;
  }
  // Persist the full captured profile list so every terminal/admin sees the
  // same "Choose Profile" set for this username (bulk-capture from first sign-in).
  if (Array.isArray(profiles) && profiles.length > 0) {
    storeBody.profiles = profiles.map(p => ({
      profile_id: String(p.profileId || p.customerProfileId || p.profile_id || ''),
      profile_type: String(p.profileType || p.profile_type || '0'),
      profile_name: String(p.profileName || p.name || p.profile_name || ''),
    })).filter(p => !!p.profile_id);
  }
  const storeResp = await fetch(`${backendUrl}/mib/keys/store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${effectiveSanctumToken}`
    },
    body: JSON.stringify(storeBody)
  });
  if (!storeResp.ok) {
    const errText = await storeResp.text();
    throw new Error(`Server failed to store keys: Status ${storeResp.status} - ${errText}`);
  }

  await chrome.storage.session.remove('mibAuthTemp');
  if(port) emitLog(port, '> [MIB-API] Profile selected and keys saved.');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank-app-style MIB session helpers (ADDITIVE — only net-new functions; the
// existing startMibAuthFlow / ensureMibSession / submitMibOtp bodies are
// untouched).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the shared profile list for a (tenant, username) group plus the stored
 * device keys / credentials so a terminal can show the "Choose Profile" screen
 * without performing a fresh login. Only succeeds when the server already has
 * keys for the group; a full login is needed otherwise.
 *
 * @returns {Promise<{ok: boolean, needsLogin: boolean, profiles: Array, profileId: string|null, profileType: string|null, mibUsername: string|null, mibPassword: string|null}>}
 */
async function fetchMibGroupForProfile(port, terminalId, backendUrl, targetAccount, sanctumTokenParam, bankAccountId = '') {
  const tokenRes = await chrome.storage.local.get('sanctumToken');
  const token = tokenRes.sanctumToken || sanctumTokenParam;
  if (!token) return { ok: false, needsLogin: true, error: 'Missing auth token.' };

  const params = new URLSearchParams({ hardware_id: terminalId });
  if (bankAccountId) params.append('bank_account_id', bankAccountId);
  else if (targetAccount) params.append('account_number', targetAccount);

  try {
    const resp = await fetchWithBlockedDiagnostics(`Viri backend ${backendUrl}/mib/keys`, `${backendUrl}/mib/keys?${params}`, {
      headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      if (resp.status === 404) return { ok: false, needsLogin: true };
      const errText = await resp.text();
      if(port) emitLog(port, `> [MIB-API] Profile fetch failed (${resp.status}): ${errText.substring(0, 200)}`);
      return { ok: false, needsLogin: true, error: errText };
    }
    const data = await resp.json();
    if (!data.key1 || !data.key2) {
      return { ok: false, needsLogin: true, profiles: data.profiles || [], error: 'No registered device keys on server.' };
    }

    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    const profileId = data.profileId || (profiles.length === 1 ? (profiles[0].profile_id || profiles[0].customerProfileId) : null);
    const profileType = data.profileType || (profiles.length === 1 ? (profiles[0].profile_type || '0') : '0');

    return {
      ok: true,
      needsLogin: false,
      profiles,
      profileId,
      profileType,
      mibUsername: data.mib_username || '',
      mibPassword: data.mib_password || '',
      key1: data.key1,
      key2: data.key2,
      appId: data.appId,
      obtainedAt: data.obtained_at || null,
    };
  } catch (e) {
    if(port) emitLog(port, `> [MIB-API] Group fetch error: ${e.message}`);
    return { ok: false, needsLogin: true, error: e.message };
  }
}

/**
 * Seed the terminal's key cache from the server before a resume, so a terminal
 * that lost its local storage can rebuild its device identity without the
 * cashier re-entering anything. Deletes nothing; only writes valid values.
 */
async function seedMibKeysFromServer(port, groupInfo, targetAccount) {
  if (!groupInfo?.key1 || !groupInfo?.key2 || !groupInfo?.appId) return false;
  await chrome.storage.local.set({
    mib_key1: groupInfo.key1,
    mib_key2: groupInfo.key2,
    mib_appId: groupInfo.appId,
  });
  if (groupInfo.mibUsername) {
    const { mib_stored_creds_map = {} } = await chrome.storage.session.get('mib_stored_creds_map');
    if (groupInfo.mibPassword) {
      mib_stored_creds_map[targetAccount] = { username: groupInfo.mibUsername, password: groupInfo.mibPassword };
      // Persist for this username too so any sibling account on this terminal
      // inherits the same credentials.
      mib_stored_creds_map['__username_' + groupInfo.mibUsername] = { username: groupInfo.mibUsername, password: groupInfo.mibPassword };
    }
    await chrome.storage.session.set({ mib_stored_creds_map });
  }
  if(port) emitLog(port, `> [MIB-API] Seeded terminal keys/credentials from server for ${groupInfo.mibUsername || targetAccount}.`);
  return true;
}

/**
 * "Choose Profile" flow for an account whose group is already authenticated on
 * the server: resume the session via the existing ensureMibSession, then select
 * the requested profile with P47. Falls back to a fresh login only if the
 * server has no registered device keys.
 */
async function selectMibProfileOnSession(port, targetAccount, hardwareId, backendUrl, credentials, profileId, profileType, sanctumTokenParam = '', bankAccountId = '') {
  if(port) emitLog(port, `> [MIB-API] Selecting MIB profile on session: ${profileId} (type ${profileType})`);

  // If the caller did not supply credentials (e.g. a terminal that lost its local
  // key state), pull the account-scoped group from the server (device keys +
  // encrypted password) and seed local storage so the resume below "just works".
  if (!credentials || !credentials.username || !credentials.password) {
    const groupInfo = await fetchMibGroupForProfile(port, hardwareId, backendUrl, targetAccount, sanctumTokenParam, bankAccountId);
    if (groupInfo.ok) {
      await seedMibKeysFromServer(port, groupInfo, targetAccount);
      credentials = {
        username: groupInfo.mibUsername,
        password: groupInfo.mibPassword,
        token: sanctumTokenParam,
      };
    }
  }

  // Ensure a live session exists without a fresh login.
  const mibSession = await ensureMibSession(port, hardwareId, backendUrl, credentials || {}, targetAccount, sanctumTokenParam);

  const p47Result = await attemptP47(port, mibSession, profileId, profileType);
  if (!p47Result.selected) {
    throw new Error("P47 profile selection failed on existing session.");
  }

  const profileKeyId = 'mib_profileId_' + targetAccount;
  const profileKeyType = 'mib_profileType_' + targetAccount;
  await chrome.storage.local.set({
    [profileKeyId]: profileId,
    [profileKeyType]: profileType,
  });

  if (p47Result.accountBalance.length > 0) {
    await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
    if(port) emitLog(port, `> [MIB-API] Cached ${p47Result.accountBalance.length} balance(s) after profile selection.`);
  }

  if(port) emitLog(port, '> [MIB-API] Profile selected on resumed session.');
  return { success: true, accountBalance: p47Result.accountBalance };
}

async function runMibApiFlow(credentials, targetAccount, port, targetAmount, profileType = '0', mode = 'search', sessionMode = 'fresh_login', hardwareId = '', backendUrl = '', payloadAccountId = '', isAutoSync = false, sanctumTokenParam = '') {
  emitLog(port, `> [MIB-API] Starting API ledger flow (mode: ${mode}, autoSync: ${isAutoSync})...`);
  if (!isAutoSync) {
    logSessionEvent('session_login_started', { account: targetAccount, mode: mode, session_mode: sessionMode, backendUrl, hardwareId, accountId: payloadAccountId });
  }
  let last3Txs = [];
  
  try {
    // Cache valid credentials from PWA for A40 fallback on subsequent calls (per-account)
    if (credentials?.username?.length > 0 && credentials?.password?.length > 0) {
      const { mib_stored_creds_map = {} } = await chrome.storage.session.get('mib_stored_creds_map');
      mib_stored_creds_map[targetAccount] = credentials;
      await chrome.storage.session.set({ mib_stored_creds_map });
      if(port) emitLog(port, `> [MIB-API] Cached credentials for account ${targetAccount}.`);
    }
    
    const mibSession = await ensureMibSession(port, hardwareId, backendUrl, credentials, targetAccount, sanctumTokenParam);
    activeFlowStage = 'mib_session';
    if (!isAutoSync) {
      logSessionEvent('session_login_success', { account: targetAccount, mode: mode, backendUrl, hardwareId, accountId: payloadAccountId });
    }

    // Check if ensureMibSession saved a balance from A40 into session storage
    let accountBalance = null;
    let accountReservedBalance = '0.00';
    let accountAvailableBalance = '0.00';

    if (sessionMode === 'claim_and_login') {
      emitLog(port, `> [MIB-API] Session claimed. Auth sequence complete.`);
      port.postMessage({ type: 'success', match: null, login_success: true, transactions: [] });
      return;
    }

    // The encrypted API (with credentials:'include') should have set session cookies.
    // Set explicit cookies for the WebView subdomain so any WebView surface recognizes
    // the session. Transactions now go through the encrypted A84 route, so this is
    // kept only for legacy WebView surfaces.
    const wvDomain = MIB_WEBVIEW_URL.replace('https://', '');
    const setMibCookies = (domain) => new Promise((resolve) => {
      let done = 0;
      const cb = () => { if (++done === 5) resolve(); };
      chrome.cookies.set({ url: `https://${domain}/`, name: 'xxid', value: mibSession.xxid, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'IBSID', value: mibSession.xxid, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'mbnonce', value: generateNonce(mibSession.nonceGenerator), domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'mbmodel', value: MIB_MODEL, domain, path: '/' }, cb);
      chrome.cookies.set({ url: `https://${domain}/`, name: 'time-tracker', value: '597', domain, path: '/' }, cb);
    });
    await setMibCookies(wvDomain);

    try {
      emitLog(port, `> [MIB-API] Pre-warming WebView session...`);
      await fetch(`https://${wvDomain}/aProfile/keepAlive`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'User-Agent': 'android/1.0' }
      });
      emitLog(port, `> [MIB-API] WebView session pre-warmed.`);
    } catch (e) {
      emitLog(port, `> [MIB-API] KeepAlive pre-warm failed (${e.message}). Will establish on first data call.`);
    }

    // Check cached account balance from session setup (A41 fast-path or P47 inside ensureMibSession)
    {
      const { ['mib_accountBalance_' + targetAccount]: mib_accountBalance } = await chrome.storage.session.get('mib_accountBalance_' + targetAccount);
      if (Array.isArray(mib_accountBalance) && mib_accountBalance.length > 0) {
        const match = mib_accountBalance.find(a => String(a.accountNumber).trim() === String(targetAccount).trim());
        if (match) {
          const currentBalVal = match.currentBalance !== undefined && match.currentBalance !== null ? match.currentBalance : (match.availableBalance || '0.00');
          const availableBalVal = match.availableBalance !== undefined && match.availableBalance !== null ? match.availableBalance : currentBalVal;

          const currentBal = typeof currentBalVal === 'string' ? parseFloat(currentBalVal.replace(/,/g, '')) : (parseFloat(currentBalVal) || 0);
          const availableBal = typeof availableBalVal === 'string' ? parseFloat(availableBalVal.replace(/,/g, '')) : (parseFloat(availableBalVal) || 0);
          const reservedBal = Math.max(0, currentBal - availableBal);

          accountBalance = currentBal.toFixed(2);
          accountReservedBalance = reservedBal.toFixed(2);
          accountAvailableBalance = availableBal.toFixed(2);
          if (port) emitLog(port, `> [MIB-API] 💰 Balance from session cache: Cleared=${accountBalance}, Reserved=${accountReservedBalance}`);
        } else {
          const accts = mib_accountBalance.map(a => a.accountNumber).join(', ');
          if (port) emitLog(port, `> [MIB-API] Session cache has ${mib_accountBalance.length} account(s) but none matched ${targetAccount}. Accounts: ${accts}`);
          if (port) emitLog(port, `> [MIB-API] Account not in cached profile. Checking other profiles...`);
          let fallbackFound = false;
          try {
            const tokenRes = await chrome.storage.local.get('sanctumToken');
            if (tokenRes.sanctumToken && hardwareId && backendUrl) {
              const params = new URLSearchParams({ hardware_id: hardwareId, account_number: targetAccount });
              const keysResp = await fetchWithBlockedDiagnostics(`Viri backend ${backendUrl}/mib/keys`, `${backendUrl}/mib/keys?${params}`, {
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${tokenRes.sanctumToken}` }
              });
              if (keysResp.ok) {
                const keysData = await keysResp.json();
                const profiles = keysData.profiles || [];
                const targetProfileId = keysData.profileId;
                const targetProfileType = keysData.profileType || '0';
                const tried = new Set();
                const tryList = [];
                if (targetProfileId) {
                  tryList.push({ pid: targetProfileId, pt: targetProfileType });
                  tried.add(targetProfileId);
                }
                for (const prof of profiles) {
                  const pid = prof.profile_id || prof.customerProfileId;
                  if (pid && !tried.has(pid)) {
                    tryList.push({ pid, pt: prof.profile_type || '0' });
                    tried.add(pid);
                  }
                }
                for (const { pid, pt } of tryList) {
                  if (port) emitLog(port, `> [MIB-API] Trying profile ${pid}...`);
                  const p47Result = await attemptP47(port, mibSession, pid, pt);
                  if (p47Result.selected && p47Result.accountBalance.length > 0) {
                    const match = p47Result.accountBalance.find(a => String(a.accountNumber).trim() === String(targetAccount).trim());
                    if (match) {
                      await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
                      await chrome.storage.local.set({ ['mib_profileId_' + targetAccount]: pid, ['mib_profileType_' + targetAccount]: pt });
                      const currentBalVal = match.currentBalance !== undefined && match.currentBalance !== null ? match.currentBalance : (match.availableBalance || '0.00');
                      const availableBalVal = match.availableBalance !== undefined && match.availableBalance !== null ? match.availableBalance : currentBalVal;
                      const currentBal = typeof currentBalVal === 'string' ? parseFloat(currentBalVal.replace(/,/g, '')) : (parseFloat(currentBalVal) || 0);
                      const availableBal = typeof availableBalVal === 'string' ? parseFloat(availableBalVal.replace(/,/g, '')) : (parseFloat(availableBalVal) || 0);
                      const reservedBal = Math.max(0, currentBal - availableBal);
                      accountBalance = currentBal.toFixed(2);
                      accountReservedBalance = reservedBal.toFixed(2);
                      accountAvailableBalance = availableBal.toFixed(2);
                      fallbackFound = true;
                      if (port) emitLog(port, `> [MIB-API] Found account under profile ${pid}. Cached for future calls.`);
                      break;
                    } else {
                      if (port) emitLog(port, `> [MIB-API] Profile ${pid} has accounts: ${p47Result.accountBalance.map(a => a.accountNumber).join(', ')}`);
                    }
                  }
                }
              }
            }
          } catch (e) {
            if (port) emitLog(port, `> [MIB-API] Profile fallback error: ${e.message}`);
          }
          if (!fallbackFound) {
            throw new Error(`The account ${targetAccount} was not found in your MIB profile. Available accounts under this profile: ${accts}`);
          }
        }
      }
    }

    // If still no balance, try P47 directly (no cached balance from session setup)
    if (!accountBalance) {
      try {
        const mibPidKey = 'mib_profileId_' + targetAccount;
        const mibPtypeKey = 'mib_profileType_' + targetAccount;
        const { [mibPidKey]: mib_profileId, [mibPtypeKey]: mib_profileType } = await chrome.storage.local.get([mibPidKey, mibPtypeKey]);
        if (mib_profileId) {
          if (port) emitLog(port, `> [MIB-API] Querying live bank balance via P47 (no cached balance)...`);
          const p47Result = await attemptP47(port, mibSession, mib_profileId, mib_profileType || '0');
          if (p47Result.selected && p47Result.accountBalance.length > 0) {
            await chrome.storage.session.set({ ['mib_accountBalance_' + targetAccount]: p47Result.accountBalance });
            const match = p47Result.accountBalance.find(a => String(a.accountNumber).trim() === String(targetAccount).trim());
            if (match) {
              const currentBalVal = match.currentBalance !== undefined && match.currentBalance !== null ? match.currentBalance : (match.availableBalance || '0.00');
              const availableBalVal = match.availableBalance !== undefined && match.availableBalance !== null ? match.availableBalance : currentBalVal;

              const currentBal = typeof currentBalVal === 'string' ? parseFloat(currentBalVal.replace(/,/g, '')) : (parseFloat(currentBalVal) || 0);
              const availableBal = typeof availableBalVal === 'string' ? parseFloat(availableBalVal.replace(/,/g, '')) : (parseFloat(availableBalVal) || 0);
              const reservedBal = Math.max(0, currentBal - availableBal);

              accountBalance = currentBal.toFixed(2);
              accountReservedBalance = reservedBal.toFixed(2);
              accountAvailableBalance = availableBal.toFixed(2);
              if (port) emitLog(port, `> [MIB-API] 💰 Live balance from bank: Cleared=${accountBalance}, Reserved=${accountReservedBalance}`);
            } else {
              const accts = p47Result.accountBalance.map(a => a.accountNumber).join(', ');
              if (port) emitLog(port, `> [MIB-API] ⚠️ P47 returned ${p47Result.accountBalance.length} account(s) but none matched ${targetAccount}. Accounts: ${accts}`);
              throw new Error(`The account ${targetAccount} was not found in your MIB profile. Available accounts under this profile: ${accts}`);
            }
          } else {
            if (port) emitLog(port, `> [MIB-API] P47 returned no accounts (profile already selected). Can't verify target account.`);
          }
        }
      } catch (e) {
        if (port) emitLog(port, `> [MIB-API] P47 balance query failed: ${e.message}`);
        if (e.message.includes('not found in your MIB profile')) throw e;
      }
    }

    if (accountBalance) {
      emitLog(port, `> [MIB-API] Final resolved balance: ${accountBalance}`);
    }

    // Transactions now come from the encrypted A84 route (the WebView
    // /ajaxAccounts/trxHistory endpoint is gone in the August-2026 bundle).
    emitLog(port, `> [MIB-API] Fetching transaction history via encrypted A84...`);
    activeFlowStage = 'mib_history';
    logSessionEvent('fetch_request_submitted', { account: targetAccount, mode: mode });
    const a84Nonce = generateNonce(mibSession.nonceGenerator);
    const a84Payload = {
      accountNo: targetAccount,
      start: '0',
      end: '19',           // inclusive: 20 items (preserves the old 20-item window)
      includeCount: true,
      appId: mibSession.appId,
      sodium: generateSodium(),
      routePath: 'A84',
      xxid: mibSession.xxid,
      nonce: a84Nonce,
    };
    // A84 is the first heavy encrypted call after a fresh session resume; MIB can
    // take well over the default 10s to answer a cold call (observed: 10s abort
    // on the first attempt, success on a warm retry). Give it a longer first
    // timeout plus one retry. The 45s flow watchdog still bounds total time.
    const a84Resp = await executeMibSfuncWithRetry('n', a84Payload, mibSession.sessionKey, { xxid: mibSession.xxid, sfunc: 'n' }, {
      attempts: 2,
      timeoutMs: 20000,
      label: 'A84 history',
      port
    });

    if (!a84Resp.success) {
      throw new Error(`MIB history failed: ${a84Resp.reasonText || 'unknown error'}`);
    }

    // Tolerate both containers: live server returns {data: [...], total_count};
    // older shapes nest as {data: {data: [...]}}.
    let allTxs = Array.isArray(a84Resp.data) ? a84Resp.data : (a84Resp.data?.data || []);
    emitLog(port, `> [MIB-API] Found ${allTxs.length} transactions.`);

    // Normalize MIB WebView transactions
    const formattedTxs = allTxs.map(t => {
      let isCredit, amt;
      if (t.curCodeDesc && t.curCodeDesc !== 'MVR' && t.foreignAmount !== undefined && t.foreignAmount !== null) {
        let fa = parseFloat(t.foreignAmount) || 0;
        isCredit = fa >= 0;
        amt = Math.abs(fa);
      } else {
        isCredit = parseFloat(t.baseAmount || 0) >= 0;
        amt = parseFloat(t.absAmount || 0);
      }
      let dt = t.trxDate;
      let descRaw = t.descr1 || "";
      let desc2 = t.descr2 || "";
      let desc3 = t.descr3 || "";
      let fromAcc = t.fromAcc || "";
      let benefName = t.benefName || "";
      let otherAcc = t.otherAccountNo && t.otherAccountNo !== "-" ? t.otherAccountNo : "";

      const extraLines = [
        fromAcc ? `From: ${fromAcc}` : "",
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
        sender: benefName,
        is_pending: false,
        raw: t
      };
    });

    if (mode === 'fetch_only') {
      port.postMessage({ 
        type: 'statement_success', 
        transactions: formattedTxs, 
        balance: accountBalance || '0.00',
        reservedBalance: accountReservedBalance || '0.00',
        availableBalance: accountAvailableBalance || '0.00',
        bank_api_endpoints: ['POST https://faisamobilex-smvc-v2.mib.com.mv/index/?sfunc=n (A84)']
      });
      return;
    }

    if (mode === 'ledger' || mode === 'history') {
      if (!isAutoSync) {
        logSessionEvent('fetch_request_fulfilled', { account: targetAccount, tx_count: formattedTxs.length, mode: mode, backendUrl, hardwareId, accountId: payloadAccountId });
      }
      port.postMessage({
        type: 'success',
        match: null,
        transactions: formattedTxs,
        balance: accountBalance || '0.00',
        reservedBalance: accountReservedBalance || '0.00',
        availableBalance: accountAvailableBalance || '0.00',
        login_success: true,
        bank_api_endpoints: ['POST https://faisamobilex-smvc-v2.mib.com.mv/index/?sfunc=n (A84)'],
        raw_bank_response: a84Resp
      });
      return;
    }

    // Match logic for 'search' mode
    const searchAmt = parseFloat(targetAmount);
    let matchedTx = null;

    for (const tx of formattedTxs) {
      if (!tx.minus && parseFloat(tx.amount) === searchAmt) {
        matchedTx = tx;
        break;
      }
    }

    if (matchedTx) {
      emitLog(port, `> [MIB-API] Match FOUND for ${targetAmount}.`);
      logSessionEvent('fetch_request_fulfilled', { account: targetAccount, matched: true, amount: targetAmount });
      port.postMessage({ 
        type: 'success', 
        match: matchedTx, 
        login_success: true, 
        transactions: formattedTxs.slice(0, 3), 
        balance: accountBalance || '0.00',
        reservedBalance: accountReservedBalance || '0.00',
        availableBalance: accountAvailableBalance || '0.00'
      });
    } else {
      emitLog(port, `> [MIB-API] No match found for ${targetAmount}.`);
      throw new Error(`Verification Failed: No recent credit transaction found for ${targetAmount}.`);
    }

  } catch (error) {
    try {
      emitLog(port, `> [MIB-API] ERROR: ${error.message}`);
      const isAuth = /auth|login|credential|password/i.test(error.message);
      logSessionEvent(isAuth ? 'session_login_failed' : 'fetch_request_failed', { account: targetAccount, error: error.message });
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


