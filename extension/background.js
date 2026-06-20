const BASE_URL = "https://www.bankofmaldives.com.mv/internetbanking";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function emitLog(port, msg) {
  if (port) {
    try {
      port.postMessage({ type: "log", message: msg });
    } catch (e) {
      console.log(msg);
    }
  } else {
    console.log(msg);
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

// Global active port
let activePort = null;

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log("[Viri Bridge] PWA Connected via Port:", port.name);
  if (port.name === "viri-verify" || port.name === "bml-auth") {
    activePort = port;

    port.onMessage.addListener(async (msg) => {
      // Handle the new frontend structure
      if (msg.action === 'VERIFY_TRANSFER') {
        const payload = msg.payload;
        // payload has targetAmount, targetAccount, credentials
        try {
          await runBmlFlow(payload.credentials, payload.account, port, payload.amount);
        } catch (error) {
          port.postMessage({ type: 'error', error: error.message });
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
    });
  }
});

// A wrapper around fetch to log requests/responses to the UI
async function loggedFetch(url, options = {}) {
  const method = options.method || 'GET';
  const port = activePort;
  let bodyLog = "";
  if (options.body && typeof options.body === 'string') {
    bodyLog = `\n    Body: ${options.body.substring(0, 100)}...`;
  }
  emitLog(port, `> [BML] Request: ${method} ${url}${bodyLog}`);

  options.credentials = 'include';

  try {
    const res = await fetch(url, options);
    emitLog(port, `> [BML] Response: HTTP ${res.status} from ${url}`);
    return res;
  } catch (error) {
    emitLog(port, `> [BML] Fetch failed: ${error.message} for ${url}`);
    throw error;
  }
}

// Simple function to get a TOTP token natively
async function generateTOTP(secret) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32chars.indexOf(secret.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const hex = bits.match(/.{1,8}/g).map(b => parseInt(b, 2).toString(16).padStart(2, '0')).join('');
  const keyBytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const epoch = Math.floor(Date.now() / 1000);
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

// -------------------------------------------------------------
// The main BML background flow
// -------------------------------------------------------------
async function runBmlFlow(credentials, targetAccount, port, targetAmount) {
  emitLog(port, `> [BML] Starting background auth flow...`);

  async function getXsrfToken() {
    return new Promise((resolve) => {
      chrome.cookies.get({ url: "https://www.bankofmaldives.com.mv", name: "XSRF-TOKEN" }, (cookie) => {
        resolve(cookie ? decodeURIComponent(cookie.value) : null);
      });
    });
  }

  // --- TESTING ONLY LOGS: WILL BE REMOVED BEFORE DEPLOYMENT ---
  const currentOtp = await generateTOTP(credentials.totpSeed);
  emitLog(port, `> [TESTING] BML Username: ${credentials.username}`);
  emitLog(port, `> [TESTING] BML Password: ${credentials.password}`);
  emitLog(port, `> [TESTING] BML TOTP Seed: ${credentials.totpSeed}`);
  emitLog(port, `> [TESTING] Target Account: ${targetAccount}`);
  emitLog(port, `> [TESTING] Target Amount: ${targetAmount}`);
  emitLog(port, `> [TESTING] LIVE OTP CODE: ${currentOtp}`);
  // -------------------------------------------------------------

  // -- Helper: Follow Inertia 409 redirect chain (matching Python _handle_inertia_response) --
  async function handleInertiaRedirects(response, maxRedirects = 5) {
    let redirectCount = 0;
    let currentRes = response;
    while (currentRes.status === 409 && redirectCount < maxRedirects) {
      const redirectUrl = currentRes.headers.get('X-Inertia-Location');
      if (!redirectUrl) {
        emitLog(port, `> [BML] Warning: 409 without X-Inertia-Location header`);
        break;
      }
      redirectCount++;
      const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `${BASE_URL}${redirectUrl}`;
      emitLog(port, `> [BML] Following Inertia redirect #${redirectCount} to: ${fullUrl}`);

      // CRITICAL: Must include X-Requested-With for Laravel to process X-Inertia correctly
      let token = await getXsrfToken();
      currentRes = await loggedFetch(fullUrl, {
        headers: {
          'Accept': 'text/html, application/xhtml+xml',
          'X-Inertia': 'true',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': token,
          'User-Agent': USER_AGENT
        }
      });
      if (currentRes.status === 200) break;
    }
    return currentRes;
  }

  // -- Helper: Get fresh XSRF token from a page (matching Python _get_fresh_xsrf_token) --
  async function getFreshXsrfToken(path) {
    emitLog(port, `> [BML] Refreshing XSRF token from ${path}...`);
    await loggedFetch(`${BASE_URL}${path}`, {
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'User-Agent': USER_AGENT,
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    return await getXsrfToken();
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 0: Clear Previous Session State
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 0: Clearing previous session cookies...`);
    const cookies = await chrome.cookies.getAll({ domain: "bankofmaldives.com.mv" });
    for (const cookie of cookies) {
      const protocol = cookie.secure ? "https://" : "http://";
      const cookieUrl = `${protocol}${cookie.domain}${cookie.path}`;
      await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Initialize Session
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 1: Initializing session to get XSRF token...`);
    await loggedFetch(`${BASE_URL}/web/login`, {
      headers: { 'Accept': 'text/html, application/xhtml+xml', 'User-Agent': USER_AGENT }
    });

    let xsrfToken = await getXsrfToken();
    if (!xsrfToken) throw new Error("Failed to extract initial XSRF token");

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Submit Username/Password
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 2: Submitting Primary Credentials...`);
    const loginRes = await loggedFetch(`${BASE_URL}/web/login`, {
      method: 'POST',
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'Content-Type': 'application/json',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/web/login`,
        'User-Agent': USER_AGENT
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password
      })
    });

    if (loginRes.status === 409) {
      emitLog(port, `> [BML] Login returned 409. Following Inertia redirects...`);
      await handleInertiaRedirects(loginRes);
    } else if (loginRes.status === 200) {
      const loginBody = await loginRes.clone().text();
      await saveScrap('login_failed_200', loginBody);
      emitLog(port, `> [BML] WARNING: Login returned HTTP 200. Response: ${loginBody.substring(0, 300).replace(/\n/g, ' ')}`);
      throw new Error(`Login failed: Invalid credentials or server rejected login. HTTP 200 re-render.`);
    } else if (!loginRes.ok) {
      const loginBody = await loginRes.clone().text();
      await saveScrap(`login_failed_${loginRes.status}`, loginBody);
      throw new Error(`HTTP ${loginRes.status} on login POST.`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Verify OTP
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 3B: Submitting TOTP code...`);
    xsrfToken = await getFreshXsrfToken('/web/login/2fa');

    const otpCode = await generateTOTP(credentials.totpSeed);
    emitLog(port, `> [TESTING] Submitting OTP: ${otpCode}`);

    const mfaRes = await loggedFetch(`${BASE_URL}/web/login/2fa`, {
      method: 'POST',
      headers: {
        'Accept': 'text/html, application/xhtml+xml',
        'Content-Type': 'application/json',
        'X-Inertia': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/web/login/2fa`,
        'User-Agent': USER_AGENT
      },
      body: JSON.stringify({ otp: otpCode })
    });

    if (mfaRes.status === 409) {
      const mfaRedirectUrl = mfaRes.headers.get('X-Inertia-Location');
      emitLog(port, `> [BML] MFA returned 409 Redirect to ${mfaRedirectUrl}.`);
      await handleInertiaRedirects(mfaRes);
    } else if (mfaRes.status === 200) {
      const mfaBody = await mfaRes.clone().text();
      await saveScrap('mfa_failed_200', mfaBody);
      emitLog(port, `> [BML] WARNING: MFA returned HTTP 200. Response: ${mfaBody.substring(0, 300).replace(/\n/g, ' ')}`);
      throw new Error(`MFA failed: Server re-rendered 2FA form.`);
    } else {
      const mfaBody = await mfaRes.clone().text();
      await saveScrap(`mfa_failed_${mfaRes.status}`, mfaBody);
      throw new Error(`MFA failed with HTTP ${mfaRes.status}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Fetch and Select Profile
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 4: Fetching Profiles...`);
    xsrfToken = await getFreshXsrfToken('/web/profile');

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

    try {
      const profileData = JSON.parse(responseText);
      profiles = profileData.props?.profiles || [];
    } catch (err) {
      const dataPageMatch = /data-page=(['"])(.*?)\1/.exec(responseText);
      if (dataPageMatch) {
        try {
          const decoded = dataPageMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          const pageData = JSON.parse(decoded);
          profiles = pageData.props?.profiles || [];
        } catch (e) { }
      }
      if (profiles.length === 0) {
        const patterns = [
          /\/internetbanking\/web\/profile\/([a-fA-F0-9\-]{36})/gi,
          /"profileId":\s*"([a-fA-F0-9\-]{36})"/gi,
          /data-profile-id="([a-fA-F0-9\-]{36})"/gi
        ];
        const uniqueIds = new Set();
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(responseText)) !== null) { uniqueIds.add(match[1]); }
        }
        profiles = Array.from(uniqueIds).map(id => ({ id, name: id }));
      }
    }

    if (profiles.length > 0) {
      const selectedProfile = profiles[0];
      emitLog(port, `> [BML] Selected Profile: ${selectedProfile.id}`);
      xsrfToken = await getFreshXsrfToken('/web/profile');

      let selectProfileRes = await loggedFetch(`${BASE_URL}/web/profile/${selectedProfile.id}`, {
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

    // Add delay to let backend sync
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Navigate to accounts overview  
    // ═══════════════════════════════════════════════════════════════
    emitLog(port, `> [BML] Step 5: Loading Accounts Overview...`);
    xsrfToken = await getFreshXsrfToken('/vf/accounts/overview');

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
    let bmlAccountId = null;
    let balance = "Not found";

    for (const group of accounts) {
      const accList = group.accounts || [group]; // handle both nested and flat structures
      for (const acc of accList) {
        if (acc.account === targetAccount || acc.account_number === targetAccount || acc.id === targetAccount) {
          bmlAccountId = acc.id || acc.account;
          balance = acc.available_balance || "Found";
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

    if (!histRes.ok) {
      // Just finish early with success type but we couldn't fetch history. 
      // Some old clients expect just `bml_success`
      port.postMessage({ type: "bml_success", balance: balance });
      return;
    }

    const histData = await histRes.json();
    const history = histData.transactions || histData.payload?.history || [];
    const targetAmtNum = parseFloat(targetAmount) || 0;

    let matchFound = null;
    for (const tx of history) {
      const isCredit = tx.type === 'credit' || !tx.minus || parseFloat(tx.amount) > 0;
      if (targetAmtNum > 0 && Math.abs(parseFloat(tx.amount) - targetAmtNum) < 0.01 && isCredit) {
        matchFound = tx;
        break;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: Cleanup and Report
    // ═══════════════════════════════════════════════════════════════
    try {
      await loggedFetch(`${BASE_URL}/logout`, {
        method: 'POST',
        headers: {
          'Accept': 'text/html, application/xhtml+xml',
          'X-Inertia': 'true',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': xsrfToken,
          'Referer': `${BASE_URL}/vf/accounts/overview`,
          'User-Agent': USER_AGENT
        }
      });
      emitLog(port, `> [BML] Session destroyed.`);
    } catch (e) {
      emitLog(port, `> [BML] Session destruction failed or skipped: ${e.message}`);
    }

    if (matchFound) {
      emitLog(port, `> [Viri Bridge] EXACT MATCH: Ref ${matchFound.reference || matchFound.id}`);
      port.postMessage({
        type: 'success',
        data: {
          status: 'CREDITED',
          reference: matchFound.reference || matchFound.id || "BML-MATCH",
          amount: Math.abs(matchFound.amount).toFixed(2),
          timestamp: matchFound.date || matchFound.bookingDate || new Date().toISOString()
        }
      });
    } else {
      // Fallback for old implementations
      port.postMessage({ type: "bml_success", balance: balance });
    }

  } catch (error) {
    emitLog(port, `> [BML] FATAL ERROR: ${error.message}`);
    port.postMessage({ type: "error", error: error.message });
  }
}

// ─── CORS Header Rules ─────────────────────────────────────────────────────────
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2],
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
    }
  ]
});
