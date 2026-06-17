// Viri Browser Extension Bridge – Background Service Worker
// Zero-knowledge architecture: No credentials leave this machine.

// ─── Crypto Utility (inline to avoid ES module issues in MV3 service workers) ───

async function decryptData(encryptedData, key, iv) {
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedData
    );
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error("[Viri Crypto] Decryption failed:", err);
    throw new Error("Local credential decryption failed.");
  }
}

function generateTOTP(seed) {
  // RFC 6238 compliant stub – will be replaced with full implementation
  return "123456";
}

// ─── IPC Listener for PWA ───────────────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === 'VERIFY_TRANSFER') {
    handleVerification(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    // Return true to indicate we wish to send a response asynchronously
    return true;
  }
});

// ─── Bank Verification Logic ────────────────────────────────────────────────────

async function handleVerification(payload) {
  const { amount, bank, accountId } = payload;

  console.log(`[Viri Bridge] Starting verification for ${bank} on account ${accountId} for amount ${amount}`);

  // Simulate network delay and Bank API Call
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulated match (on-demand only – no background polling)
  return {
    status: 'CREDITED',
    reference: `${bank}-${Math.floor(Math.random() * 1000000)}`,
    amount: amount,
    timestamp: new Date().toISOString()
  };
}

// ─── CORS Header Rules (declarativeNetRequest) ─────────────────────────────────
// Remove Origin/Referer on outgoing requests and inject permissive CORS header
// on responses from bank endpoints so the extension can read the JSON payloads.

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
    },
    {
      id: 2,
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
        urlFilter: "*mib.com.mv*",
        resourceTypes: ["xmlhttprequest"]
      }
    }
  ]
});

console.log("[Viri Bridge] Service worker initialized successfully.");
