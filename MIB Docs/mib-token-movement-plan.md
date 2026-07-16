# MIB Token Movement — Implementation Plan

Follows the same methodology as BML: PWA does the login, saves tokens locally and on the server, then uses them for API calls via the extension.

---

## The Pattern (BML → MIB Mapping)

| # | Step | BML | MIB |
|---|---|---|---|
| 1 | Login | PKCE popup → tokens | Extension login flow → key1/key2 |
| 2 | Save local | Extension caches tokens | Extension caches key1/key2 |
| 3 | Save server | `POST /api/bml/oauth/store` | `POST /api/mib/keys/store` |
| 4 | API call | PWA → Extension → BML (Bearer token) | PWA → Extension → MIB (Blowfish-encrypted) |
| 5 | Local miss | Extension checks local → not found | Extension checks local → not found |
| 6 | Fetch from server | `GET /api/bml/oauth/tokens` | `GET /api/mib/keys` |
| 7 | Token refresh | `grant_type=refresh_token` → new access_token | `sfunc=i` with key1/key2 → new sessionKey |
| 8 | Valid → call | Use access_token for API | Use sessionKey to encrypt API call |

---

## Token Model

| BML Concept | MIB Equivalent | Persistence |
|---|---|---|
| `refresh_token` | `key1` / `key2` | Long-lived device credentials |
| `access_token` | `sessionKey` | Short-lived session key |
| `expires_in` | Session validity (~15-30 min) | Server returns 419 / 505 when expired |
| Token refresh | `authenticatedKeyExchange(sfunc=i)` | Exchange key1/key2 for new sessionKey + xxid + nonceGenerator |
| `device_id` | `appId` | Random device identifier |

### Stored State Shape

```json
{
  "mib": {
    "key1": "3F7A...",
    "key2": "8B2C...",
    "appId": "IOS17.2-aB3xK9mQ2rL5pN1",
    "mib_username": "user@example.com"
  }
}
```

The current `sessionKey`, `xxid`, and `nonceGenerator` are ephemeral — regenerated on each resume and never stored long-term.

---

## Flow: Initial Login

```
Extension/PWA: user enters MIB credentials
  ↓
sfunc=r (DH exchange with defaultKey) → {smod, xxid, nonceGenerator, key1?, key2?}
  ↓
Derive sessionKey = base64(sha256(smod))
  ↓
sfunc=n routePath=A44 → get userSalt
  ↓
sfunc=n routePath=C41 (device registration) or A41 (regular login)
  → compute pgf03 = SHA256(clientSalt + SHA256(SHA256(password) + userSalt))
  ↓
If OTP required → user enters OTP → sfunc=n routePath=C42 or A42
  ↓
Response contains key1/key2 in data[0]
  ↓
Extension saves key1/key2 in chrome.storage.local
Extension POSTs to server:  POST /api/mib/keys/store {key1, key2, mib_username}
```

---

## Flow: API Call (PWA → Extension → MIB)

```
PWA sends to extension:  {action: "mib-api-call", routePath: "A80", payload: {...}}
  ↓
Extension checks: sessionKey exists? xxid set?
  ↓
If YES (valid session):
  → Generate fresh nonce from nonceGenerator
  → Build inner payload {nonce, appId, sodium, routePath, xxid, ...}
  → Blowfish-encrypt with sessionKey
  → POST to https://faisanet.mib.com.mv/faisamobilex_smvc/
  → Decrypt response with sessionKey
  → Check for 419/505 → if expired, go to refresh flow
  → Return decrypted JSON to PWA
  ↓
If NO (no session):
  → Check chrome.storage.local for key1/key2
  → If found locally → use them
  → If NOT found → GET /api/mib/keys?mib_username=... → server returns {key1, key2}
  → Run authenticatedKeyExchange(sfunc=i) with key1/key2 → new sessionKey + xxid + nonceGenerator
  → Retry the API call with new sessionKey
```

---

## Flow: Session Expiry Mid-Call (419 / 505 Catch)

```
Extension receives HTTP 419 or decrypted response with reasonCode: 505
  ↓
Auto-re-authenticate: sfunc=i with stored key1/key2 → new sessionKey + xxid + nonceGenerator
  ↓
Re-encrypt the failed request with new sessionKey
  ↓
Retry the POST to MIB
  ↓
Return result to PWA (transparent — user sees no error)
```

---

## Server API Endpoints

**POST /api/mib/keys/store** — Save tokens after initial login
```json
{
  "mib_username": "user@example.com",
  "key1": "3F7A8B2C...",
  "key2": "9D1E4F5A..."
}
```
Response: `{ "success": true }`

**GET /api/mib/keys?mib_username=user@example.com** — Retrieve tokens for resume
```json
{
  "key1": "3F7A8B2C...",
  "key2": "9D1E4F5A...",
  "appId": "IOS17.2-aB3xK9mQ2rL5pN1",
  "mib_username": "user@example.com"
}
```

---

## Crypto Components (Extension — Ported from `mib_api.php`)

All verified with `egoroof-blowfish` against PHP output.

| Function | PHP Source | JS Implementation |
|---|---|---|
| `blowfishEncrypt(plain, key)` | `mib_api.php:46` | `egoroof-blowfish.encode()` + base64 |
| `blowfishDecrypt(cipherB64, key)` | `mib_api.php:53` | base64 decode + `egoroof-blowfish.decode()` |
| `deriveSessionKey(smod)` | `mib_api.php:78` | `BigInt` powm + SHA-256 + base64 |
| `generateNonce(nonceGenerator)` | `mib_api.php:91` | String parsing with M/A/S/X/C operations |
| `computePgf03(pwd, userSalt, clientSalt)` | `mib_api.php:152` | 3x SHA-256 via Web Crypto API |
| `generateSodium()` | `mib_api.php:179` | `mt_rand(1000000, 15999999)` |
| `generateAppId()` | `mib_api.php:169` | `IOS17.2-` + 15 random alphanumeric chars |
| `generateXxid()` | `mib_api.php:184` | Random up to 2^40 |
| `generateClientSalt()` | `mib_api.php:159` | 32 random alphanumeric chars |

---

## Methodology from Test App (Proven Working)

**Session resume with stored key1/key2** (`mib_api.php:337`):
```php
$mib->loadState(['key1' => $storedKey1, 'key2' => $storedKey2]);
$mib->authenticatedKeyExchange();  // sfunc=i → new sessionKey + xxid + nonceGenerator
// Now all API calls work without credentials or OTP
```

**Key extraction from C42 response** (`mib_api.php:433`):
```php
$src = $data['data'][0] ?? $data;
$key1 = $src['key1'];  // "3F7A..."
$key2 = $src['key2'];  // "8B2C..."
```

**Nonce is per-request**: Every `sfunc=n` call needs a fresh nonce generated from `nonceGenerator`. The generator itself changes after each key exchange (`sfunc=r` or `sfunc=i`).

**Session expiry signals**: HTTP 419 status code, or `reasonCode: "505"` inside the decrypted response.

---

## Implementation Order

```
Phase 1: JS crypto library (mib-crypto.js)
  → Port all crypto from mib_api.php to JavaScript
  → Test against known PHP vectors (verified: blowfish matches)

Phase 2: Server endpoints (PHP — minimal)
  → POST /api/mib/keys/store
  → GET /api/mib/keys
  → Database migration (mib_keys table)

Phase 3: Extension — login flow
  → Credential form UI
  → Full login sequence (sfunc=r → A44 → C41/A41 → C42/A42)
  → Store key1/key2 in chrome.storage.local
  → POST key1/key2 to server

Phase 4: Extension — API call handler
  → Handle "mib-api-call" message from PWA
  → Session check + auto-refresh on 419/505
  → Blowfish encrypt → POST to MIB → decrypt → return

Phase 5: PWA integration
  → PWA sends API requests to extension
  → Dashboard, accounts, transactions UI
```
