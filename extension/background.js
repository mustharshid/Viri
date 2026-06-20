// Viri Browser Extension Bridge – Background Service Worker
// Zero-knowledge architecture: No credentials leave this machine.

// ─── Port Listener for PWA Streaming ────────────────────────────────────────────

chrome.runtime.onConnectExternal.addListener((port) => {
  console.log("[Viri Bridge] PWA Connected via Port:", port.name);
  
  port.onMessage.addListener(async (msg) => {
    if (msg.action === 'VERIFY_TRANSFER') {
      try {
        await handleVerification(msg.payload, port);
      } catch (error) {
        port.postMessage({ type: 'error', error: error.message });
      }
    }
  });
});

// Helper to stream logs to PWA
function emitLog(port, message) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const timedMessage = `[${time}] ${message}`;
  console.log(timedMessage);
  port.postMessage({ type: 'log', message: timedMessage });
}

// ─── Bank Verification Logic ────────────────────────────────────────────────────

async function handleVerification(payload, port) {
  const { amount, bank, accountId, accountNumber, credentials } = payload;
  
  emitLog(port, `> [Viri Bridge] Initializing decentralized verification...`);
  emitLog(port, `> Target Bank: ${bank}`);
  emitLog(port, `> Target Amount: MVR ${amount}`);
  emitLog(port, `> Account ID/Number: ${accountNumber || accountId}`);

  if (bank === 'BML') {
    await verifyBML(amount, accountNumber || accountId, credentials, port);
  } else if (bank === 'MIB') {
    emitLog(port, `> [!] MIB integration is pending. Falling back to simulation.`);
    await simulateVerification(amount, bank, port);
  } else {
    throw new Error(`Unsupported bank: ${bank}`);
  }
}

// ─── TOTP Generator (RFC 6238) ────────────────────────────────────────────────

// Base32 decoder
function base32ToBuffer(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) continue; // skip padding or invalid chars
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substring(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

async function generateTOTP(secretBase32) {
  const keyBuffer = base32ToBuffer(secretBase32);
  const timeStep = Math.floor(Date.now() / 30000);
  
  // Create 8 byte buffer from timestep
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, timeStep, false);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmacArray = new Uint8Array(signature);
  
  const offset = hmacArray[hmacArray.length - 1] & 0xf;
  const binary =
    ((hmacArray[offset] & 0x7f) << 24) |
    ((hmacArray[offset + 1] & 0xff) << 16) |
    ((hmacArray[offset + 2] & 0xff) << 8) |
    (hmacArray[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

// ─── BML Client Implementation ──────────────────────────────────────────────────

const BASE_URL = 'https://www.bankofmaldives.com.mv/internetbanking';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function getXsrfToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://www.bankofmaldives.com.mv', name: 'XSRF-TOKEN' }, (cookie) => {
      resolve(cookie ? decodeURIComponent(cookie.value) : null);
    });
  });
}

async function verifyBML(targetAmount, targetAccount, credentials, port) {
  // Shadow fetch to ensure cookies are sent and all responses are logged
  const originalFetch = globalThis.fetch.bind(globalThis);
  const loggedFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const res = await originalFetch(url, { ...options, credentials: 'include' });
    try {
      const clone = res.clone();
      const text = await clone.text();
      const snippet = text.length > 2000 ? text.substring(0, 2000).replace(/\n/g, ' ') + '...' : text.replace(/\n/g, ' ');
      const inertiaLoc = res.headers.get('X-Inertia-Location');
      const locStr = inertiaLoc ? ` [Redirects to: ${inertiaLoc}]` : '';
      emitLog(port, `> [SERVER REPLY] ${method} ${url} -> HTTP ${res.status}${locStr}: ${snippet}`);
    } catch(e) {}
    return res;
  };
  emitLog(port, `> [BML] Initiating Headless Auto-Login Sequence...`);
  
  if (!credentials || !credentials.username || !credentials.password || !credentials.totpSeed) {
    throw new Error("Terminal missing BML robot credentials. Please configure them in settings.");
  }

  // --- TESTING ONLY LOGS: WILL BE REMOVED BEFORE DEPLOYMENT ---
  const currentOtp = await generateTOTP(credentials.totpSeed);
  emitLog(port, `> [TESTING] BML Username: ${credentials.username}`);
  emitLog(port, `> [TESTING] BML Password: ${credentials.password}`);
  emitLog(port, `> [TESTING] BML TOTP Seed: ${credentials.totpSeed}`);
  emitLog(port, `> [TESTING] Target Account: ${targetAccount}`);
  emitLog(port, `> [TESTING] LIVE OTP CODE: ${currentOtp}`);
  // -------------------------------------------------------------

  try {
    // 1. Initialize Session
    emitLog(port, `> [BML] Step 1: Initializing session to get XSRF token...`);
    await loggedFetch(`${BASE_URL}/web/login`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    let xsrfToken = await getXsrfToken();
    if (!xsrfToken) throw new Error("Failed to extract initial XSRF token");

    // 2. Submit Username/Password
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
      const redirectUrl = loginRes.headers.get('X-Inertia-Location');
      emitLog(port, `> [BML] Primary login returned 409 Redirect to ${redirectUrl}. Proceeding to MFA...`);
      if (redirectUrl) {
         await loggedFetch(redirectUrl, {
           headers: { 'X-Inertia': 'true', 'X-XSRF-TOKEN': xsrfToken, 'User-Agent': USER_AGENT }
         });
      }
    } else if (!loginRes.ok) {
      throw new Error(`HTTP ${loginRes.status} on login POST.`);
    } else {
      emitLog(port, `> [BML] Primary login complete (HTTP ${loginRes.status}). Proceeding to MFA...`);
    }

    // 3. Generate and Submit TOTP
    emitLog(port, `> [BML] Step 3: Submitting TOTP code...`);
    xsrfToken = await getXsrfToken() || xsrfToken;

    // Use the already generated OTP
    const otpCode = await generateTOTP(credentials.totpSeed);

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
      body: JSON.stringify({ otp: otpCode, channel: 'authenticator' })
    });
    
    if (mfaRes.status === 409) {
      const redirectUrl = mfaRes.headers.get('X-Inertia-Location');
      emitLog(port, `> [BML] MFA returned 409 Redirect to ${redirectUrl}. Processing profiles...`);
      if (redirectUrl) {
         await loggedFetch(redirectUrl, {
           headers: { 'X-Inertia': 'true', 'X-XSRF-TOKEN': xsrfToken, 'User-Agent': USER_AGENT }
         });
      }
    } else {
      throw new Error(`MFA failed. Server did not redirect. HTTP ${mfaRes.status}`);
    }

    // 4. Fetch and Select Profile (Mimicking the user click from HAR file)
    emitLog(port, `> [BML] Step 4: Fetching Profiles...`);
    xsrfToken = await getXsrfToken() || xsrfToken;
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
      const redirectUrl = profileRes.headers.get('X-Inertia-Location');
      if (redirectUrl && redirectUrl.includes('/web/redirect')) {
         // Single profile account automatically redirects
         emitLog(port, `> [BML] Single profile detected. Following redirect to: ${redirectUrl}`);
         xsrfToken = await getXsrfToken() || xsrfToken;
         profileRes = await loggedFetch(redirectUrl, {
           headers: { 
             'Accept': 'text/html, application/xhtml+xml', 
             'X-Inertia': 'true', 
             'X-XSRF-TOKEN': xsrfToken, 
             'User-Agent': USER_AGENT 
           }
         });
      } else if (redirectUrl) {
         emitLog(port, `> [BML] Following profile list redirect to: ${redirectUrl}`);
         xsrfToken = await getXsrfToken() || xsrfToken;
         profileRes = await loggedFetch(redirectUrl, {
           headers: { 
             'Accept': 'text/html, application/xhtml+xml', 
             'X-Inertia': 'true', 
             'X-Requested-With': 'XMLHttpRequest', 
             'X-XSRF-TOKEN': xsrfToken, 
             'User-Agent': USER_AGENT 
           }
         });
      }
    }

    const responseText = await profileRes.text();
    // Dump response snippet for debugging
    emitLog(port, `> [TESTING] Profile Response Snippet: ${responseText.substring(0, 800).replace(/\n/g, '')}...`);

    let profiles = [];
    
    try {
      // First try direct JSON parsing (if server returned JSON)
      const profileData = JSON.parse(responseText);
      profiles = profileData.props?.profiles || [];
    } catch (err) {
      // It's HTML, try to extract Inertia data-page attribute
      const dataPageMatch = /data-page=(['"])(.*?)\1/.exec(responseText);
      if (dataPageMatch) {
         try {
           const decoded = dataPageMatch[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
           const pageData = JSON.parse(decoded);
           profiles = pageData.props?.profiles || [];
           if (profiles.length > 0) {
             emitLog(port, `> [BML] Successfully extracted profiles from Inertia HTML data-page attribute.`);
           }
         } catch(e) {
           emitLog(port, `> [BML] Error parsing data-page JSON: ${e.message}`);
         }
      }
      
      if (profiles.length === 0) {
        emitLog(port, `> [BML] Notice: Profiles response is HTML and data-page extraction failed, falling back to regex...`);
      }
    }

    if (profiles.length === 0) {
       const patterns = [
         /\/internetbanking\/web\/profile\/([a-fA-F0-9\-]{36})/gi,
         /"profileId":\s*"([a-fA-F0-9\-]{36})"/gi,
         /profileId:\s*'([a-fA-F0-9\-]{36})'/gi,
         /data-profile-id="([a-fA-F0-9\-]{36})"/gi,
         /profile(?:Id|Id&quot;|Id\\"|Id%22|Id%27)[^a-zA-Z0-9]*([a-fA-F0-9]{36})/gi
       ];
       const uniqueIds = new Set();
       for (const pattern of patterns) {
           let match;
           while ((match = pattern.exec(responseText)) !== null) {
               uniqueIds.add(match[1]);
           }
       }
       profiles = Array.from(uniqueIds).map(id => ({ id, name: id }));
    }

    if (profiles.length > 0) {
       const selectedProfile = profiles[0];
       emitLog(port, `> [BML] Selected Profile: ${selectedProfile.id}`);
       xsrfToken = await getXsrfToken() || xsrfToken;
       
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

       // This is the CRITICAL redirect that sets up the session!
       if (selectProfileRes.status === 409) {
          const redirectUrl = selectProfileRes.headers.get('X-Inertia-Location');
          emitLog(port, `> [BML] Profile selection returned 409 Redirect to ${redirectUrl}. Following...`);
          if (redirectUrl) {
            xsrfToken = await getXsrfToken() || xsrfToken;
            // Notice: X-Requested-With removed for the hard redirect fetch, as advised by tech!
            await loggedFetch(redirectUrl, {
              headers: { 
                'Accept': 'text/html, application/xhtml+xml', 
                'X-Inertia': 'true', 
                'X-XSRF-TOKEN': xsrfToken, 
                'User-Agent': USER_AGENT 
              }
            });
          }
       } else if (!selectProfileRes.ok) {
          throw new Error(`Profile selection failed: HTTP ${selectProfileRes.status}`);
       }
    } else {
       emitLog(port, `> [BML] No profiles found. Proceeding with single-profile assumption...`);
    }

    // Add 1 second delay to give server time to establish session
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Then hit accounts overview (must be standard page load like HAR)
    emitLog(port, `> [BML] Step 5: Loading Accounts Overview...`);
    const accountsOverviewRes = await loggedFetch(`${BASE_URL}/vf/accounts/overview`, {
      headers: {
        'Referer': `${BASE_URL}/web/redirect`,
        'Accept': 'text/html, application/xhtml+xml',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': USER_AGENT
      }
    });
    
    if (accountsOverviewRes.status === 409) {
       const redirectUrl3 = accountsOverviewRes.headers.get('X-Inertia-Location');
       if (redirectUrl3) {
          emitLog(port, `> [BML] Accounts overview returned 409. Following...`);
          xsrfToken = await getXsrfToken() || xsrfToken;
          await loggedFetch(redirectUrl3, {
            headers: { 
              'Accept': 'text/html, application/xhtml+xml', 
              'X-Inertia': 'true', 
              'X-XSRF-TOKEN': xsrfToken, 
              'Referer': `${BASE_URL}/web/redirect`,
              'User-Agent': USER_AGENT 
            }
          });
       }
    }

    // 6. Fetch Dashboard
    emitLog(port, `> [BML] Step 6: Loading Dashboard...`);
    xsrfToken = await getXsrfToken() || xsrfToken;
    const dashboardRes = await loggedFetch(`${BASE_URL}/api/dashboard`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-XSRF-TOKEN': xsrfToken,
        'Referer': `${BASE_URL}/vf/accounts/overview`,
        'User-Agent': USER_AGENT
      }
    });

    const dashText = await dashboardRes.text();
    emitLog(port, `> [TESTING] Dashboard Response Summary: HTTP ${dashboardRes.status}`);
    emitLog(port, `> [TESTING] Dashboard Response Payload: ${dashText.substring(0, 800).replace(/\n/g, '')}...`);

    if (!dashboardRes.ok) {
       throw new Error(`Dashboard retrieval failed: HTTP ${dashboardRes.status}. Server replied: ${dashText.substring(0, 200)}`);
    }

    let dashboardData;
    try {
       dashboardData = JSON.parse(dashText);
    } catch (e) {
       throw new Error(`Failed to parse Dashboard JSON. Response: ${dashText.substring(0, 200)}`);
    }

    const accounts = dashboardData.accounts || [];
    let bmlAccountId = null;
    
    for (const acc of accounts) {
       if (acc.account_number === targetAccount || acc.id === targetAccount) {
         bmlAccountId = acc.id;
         break;
       }
    }
    
    if (!bmlAccountId) {
       // fallback if not found directly
       bmlAccountId = accounts.length > 0 ? accounts[0].id : targetAccount;
       emitLog(port, `> [BML] Warning: Could not explicitly map account ${targetAccount}. Using fallback ${bmlAccountId}`);
    }

    // 6. Perform the History Scrape
    emitLog(port, `> [BML] Step 6: Scraping recent transaction history...`);
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

    if (!histRes.ok) throw new Error(`History Endpoint returned HTTP ${histRes.status}`);

    const histData = await histRes.json();
    // BML API transactions might be in .transactions or .payload.history
    const history = histData.transactions || histData.payload?.history || [];
    const targetAmtNum = parseFloat(targetAmount);

    emitLog(port, `> [BML] Processing ${history.length} recent transactions...`);

    let matchFound = null;
    for (const tx of history) {
      const isCredit = tx.type === 'credit' || !tx.minus || parseFloat(tx.amount) > 0;
      if (Math.abs(parseFloat(tx.amount) - targetAmtNum) < 0.01 && isCredit) {
        matchFound = tx;
        break;
      }
    }

    // 7. Force Sign Out
    emitLog(port, `> [BML] Step 7: Terminating Session (Zero-Trace)...`);
    try {
      await fetch(`${BASE_URL}/logout`, { method: 'POST' });
      emitLog(port, `> [BML] Session destroyed.`);
    } catch (e) {
      emitLog(port, `> [BML] Warning: Background logout request failed.`);
    }

    // 8. Return Results
    if (matchFound) {
      emitLog(port, `> [Viri Bridge] EXACT MATCH: Ref ${matchFound.reference || matchFound.id} at ${matchFound.date || matchFound.bookingDate}`);
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
      emitLog(port, `> [Viri Bridge] No exact match found for MVR ${targetAmount}.`);
      port.postMessage({ type: 'error', error: `Transfer of MVR ${targetAmount} not found.` });
    }

  } catch (error) {
    emitLog(port, `> [BML] FATAL ERROR: ${error.message}`);
    // Attempt logout on error just in case
    try { await fetch(`${BASE_URL}/logout`, { method: 'POST' }); } catch (e) {}
    throw error; // Let the caller catch it and send error postMessage
  }
}

async function simulateVerification(amount, bank, port) {
  emitLog(port, `> [Simulator] Simulating network delay...`);
  await new Promise(r => setTimeout(r, 2000));
  emitLog(port, `> [Simulator] Match generated internally.`);
  
  port.postMessage({
    type: 'success',
    data: {
      status: 'CREDITED',
      reference: `${bank}-SIM-${Math.floor(Math.random() * 100000)}`,
      amount: amount,
      timestamp: new Date().toISOString()
    }
  });
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

console.log("[Viri Bridge] Service worker initialized with Streaming Ports.");
