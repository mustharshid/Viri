# MIB API Protocol Fixes

> Changes applied to `extension/background.js` (July 2026) after comparing against the working extension at `working-extension/` and the bytecode-verified MIB API documentation at `MIB Docs/API.md`.

---

## Root Cause

The MIB server was returning **plaintext JSON errors** (e.g., `reasonCode: "501"` / `"internal Token/Digest fail"`) instead of Blowfish-encrypted responses for `sfunc='n'` operations. The response handler in `executeMibSfunc()` called `atob()` on plaintext JSON → `"Failed to execute 'atob'"` → caught as `"Failed to decrypt MIB response. Possible stale keys."`.

The `User-Agent: android/1.0` header (added in the first round of fixes) was the trigger — the MIB server appears to include the User-Agent in its token/digest validation, and an unexpected value caused nonce/digest mismatches.

---

## Changes from Working Extension

| # | What | Working | Current | Type |
|---|------|---------|---------|------|
| 1 | `executeMibSfunc()` structure | Inline `formParts` construction, hardcoded `fetch()` params | Branches `sfunc='r'/'i'` vs `'n'`; uses dynamic `url`/`method`/`headers`/`body` variables | **Refactor** — identical HTTP output |
| 2 | `executeMibSfunc()` headers | `Content-Type: application/x-www-form-urlencoded; charset=utf-8` only | Same — **no** custom `User-Agent` | **Same as working** |
| 3 | Plaintext JSON error detection | None — `atob()` crashes on `{`-prefixed response | Detects `0x7B` (`{`) as first byte, parses as JSON, throws descriptive `"MIB API error: ..."` message | **New** — fixes misleading "stale keys" error |
| 4 | `sfunc` in call-site `extraFormFields` | `{ sfunc: 'r' }` / `{ sfunc: 'i', key2 }` passed explicitly | Removed from all 7 call sites; injected inside `executeMibSfunc()` via `formParts.push(\`sfunc=\${sfunc}\`)` | **Refactor** — identical form body |
| 5 | Re-registration `sfunc='i'` retry | Reused stale `iPayload` (old `appId`, old `cmod`/`sodium`/`xxid`) | Fresh `iPayloadRe` with `freshAppId`, new `cmod`/`sodium`/`xxid` | **Bug fix** — uses correct post-re-registration values |
| 6 | `mbnonce` cookie | Raw `nonceGenerator` string | `generateNonce(mibSession.nonceGenerator)` | **Bug fix** — matches real MIB app |
| 7 | WebView keepAlive pre-warm | None — first data call pays JSESSIONID creation combined with complex query (~13s) | `POST /aProfile/keepAlive` after cookies set, before first data fetch | **New** — reduces first-call latency by ~10s |

---

## Implementation Details

### 1. `executeMibSfunc()` — Refactored into branches

```javascript
// Line 1468 — sfunc='r' and sfunc='i'
if (sfunc === 'r' || sfunc === 'i') {
  // Builds: key2=<key2>&sfunc=r/i&data=<enc>  — no User-Agent
} else {
  // sfunc='n': builds xxid=<xxid>&sfunc=n&data=<enc>  — no User-Agent
}
```

Key rule: `sfunc` is filtered out of `extraFormFields` entries in the `r/i` branch (`if (k === 'sfunc') continue`) and then added back explicitly via `formParts.push(\`sfunc=\${sfunc}\`)`. The resulting form body is byte-for-byte identical to the original code.

### 2. Plaintext JSON detection

Inserted at line 1516, before the try block that calls `blowfishDecrypt`:

```javascript
if (cipherBody.charCodeAt(0) === 0x7B) {  // '{'
  try {
    const plainErr = JSON.parse(cipherBody);
    if (plainErr.reasonText) {
      throw new Error(`MIB API error: ${plainErr.reasonText} (HTTP ${resp.status}, code ${plainErr.reasonCode})`);
    }
  } catch (e) {
    if (e.message.startsWith('MIB API error')) throw e;
  }
}
```

This prevents `atob()` crashes on plaintext error responses. The error now reads e.g. `"MIB API error: internal Token/Digest fail (HTTP 500, code 501)"` instead of `"Failed to decrypt MIB response. Possible stale keys."`

### 3. Re-registration `sfunc='i'` retry

After `sfunc='r'` re-registration succeeds and returns fresh `rResp.key1` / `rResp.key2`, the `sfunc='i'` retry uses a fresh payload:

```javascript
// Line 2279 — before (reused pre-registration iPayload with stale appId):
const iResp = await executeMibSfunc('i', iPayload, rResp.key1, { key2: rResp.key2, sfunc: 'i' });

// Line 2279-2280 — after (fresh payload with freshAppId from sfunc=r response):
const iPayloadRe = { cmod: computeCmod().toString(), appId: freshAppId, routePath: 'S40', sodium: generateSodium(), xxid: generateXxid() };
const iResp = await executeMibSfunc('i', iPayloadRe, rResp.key1, { key2: rResp.key2 });
```

### 4. `mbnonce` cookie

```javascript
// Line 2469 — before:
value: mibSession.nonceGenerator

// Line 2469 — after:
value: generateNonce(mibSession.nonceGenerator)
```

The raw `nonceGenerator` is a seed string like `"M85 A87 A82 M82 M60 M31 A46 C95-M14 ..."`. The real MIB app passes the **generated nonce** (the output of `_gen_nonce()`), not the raw seed.

### 5. WebView keepAlive pre-warm

Inserted after cookie setting (line 2473):

```javascript
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
```

This matches the reference MIB app's behavior (`SESSION_MANAGEMENT.md`): `POST /aProfile/keepAlive` establishes the `JSESSIONID` cookie. Without this, the first `trxHistory` call bundles JSESSIONID creation (~8-10s) + complex query (~3s) into one slow request.

---

## Verified Compatibility

- **Existing tokens/keys untouched** — no DB changes, no storage format changes
- **Form body identical** to working code for all 3 sfunc types
- **No `User-Agent`** on encrypted API requests (MIB server runs digest validation that includes it)
- **keepAlive only** on the WebView subdomain (`faisamobilex-wv.mib.com.mv`), not the encrypted API
- **Plaintext detection only** catches `{`-prefixed responses — legitimate base64 ciphertext (which never starts with `{`) passes through to `blowfishDecrypt` unchanged
