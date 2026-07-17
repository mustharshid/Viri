# Session Management

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

**Document Version:** 1.0  
**Date:** 2026-07-13  
**Status:** Active — Based on Hermes Bytecode Analysis (commit: `full_disas.hasm` 565K lines)

## Table of Contents

- [Session Lifecycle Overview](#session-lifecycle-overview)
- [Session Creation](#session-creation)
- [Session Init (Re-key)](#session-init-re-key)
- [Session Active State](#session-active-state)
- [Session Expiry & Death](#session-expiry--death)
- [Session Resurrection](#session-resurrection)
- [Keepalive Mechanisms](#keepalive-mechanisms)
- [Stored Data Requirements](#stored-data-requirements)
- [Failure Modes](#failure-modes)
- [Aggregator Integration Guide](#aggregator-integration-guide)
- [Bytecode References](#bytecode-references)

---

## Session Lifecycle Overview

The MIB API has a **two-layer session model**:

```
Layer 1: Encrypted API (Blowfish/DH)
  ─────────────────────────────────
  Permanent:  key1, key2, appId (assigned once at device registration)
  Ephemeral:  smod, xxid, nonceGenerator, session_key (refreshed per session)

Layer 2: WebView (Cookie-based)
  ─────────────────────────────────
  Cookies:    xxid, mbmodel, mbnonce
  Session:    JSESSIONID (established via keepAlive)
```

**State machine:**

```
                    ┌──────────────────────────┐
                    │    NOT REGISTERED         │
                    │  (no key1/key2/appId)     │
                    └───────────┬──────────────┘
                                │ sfunc='r' (DEFAULT_KEY)
                                ▼
                    ┌──────────────────────────┐
                    │    REGISTERED             │
                    │  key1, key2, appId saved  │
                    └───────────┬──────────────┘
                                │ sfunc='i' (key1/key2)
                                ▼
                    ┌──────────────────────────┐
                    │    SESSION INITIALIZED    │
                    │  smod, xxid, nonceGen,   │
                    │  session_key derived      │
                    └───────────┬──────────────┘
                                │ sfunc='n' (encrypted requests)
                                ▼
                    ┌──────────────────────────┐
                    │    ACTIVE                 │
                    │  Periodic WebView         │
                    │  keepAlive every 90s      │
                    └───────────┬──────────────┘
                                │ Session expires / server rejects
                                ▼
                    ┌──────────────────────────┐
                    │    EXPIRED (error 101)    │
                    │  smod/xxid invalid       │
                    └───────────┬──────────────┘
                                │ sfunc='i' (resurrection)
                                ▼
                    ┌──────────────────────────┐
                    │    SESSION INITIALIZED    │
                    │  New smod, xxid, nonceGen │
                    └──────────────────────────┘

  If sfunc='i' also fails → PERMANENT FAILURE → need sfunc='r' (re-register)
```

---

## Session Creation

### Device Registration (`sfunc='r'`)

**Called once per device lifetime.** Bootstraps the device identity on first launch.

**Bytecode reference:** Function `exchangeKeys` (#11803, line 445150), generator #11802 (line 445175).

**Payload:**
```
URL params:  (none — encrypted with DEFAULT_KEY)
Body:        data=<URL_ENCODED_BASE64>
```

**Inner (encrypted with DEFAULT_KEY):**
```json
{
  "cmod": "<DH public key: G^A mod P>",
  "appId": "<random app identifier, e.g. IOS17.2-xxxx>",
  "routePath": "S40",
  "sodium": "<20 random bytes as decimal string>",
  "xxid": "<40 random bytes as decimal string>"
}
```

**Response (decrypted with DEFAULT_KEY):**
```json
{
  "success": true,
  "key1": "<device key 1 — 40 chars>",
  "key2": "<device key 2 — 40 chars>",
  "appId": "<assigned app ID>",
  "xxid": "<new xxid — 40 random bytes as decimal string>",
  "smod": "<server DH public key — large integer>",
  "nonceGenerator": "<nonce generation pattern string>"
}
```

**Key properties:**
- `key1` and `key2` are **permanent device keys** — assigned once and never change
- The server maintains a mapping of `key2` → device identity for the device's lifetime
- `smod`, `xxid`, `nonceGenerator` change on every exchange — they are **ephemeral**
- The session key is derived client-side: `session_key = base64(SHA-256(pow(smod, A, P)))`

### Registration Failure Modes

- **Error 501**: Invalid data — likely a nonce or encryption issue
- **Network error**: Server unreachable — retry with exponential backoff

---

## Session Init (Re-key)

### Regular Key Exchange (`sfunc='i'`)

**Called to establish or re-establish a session using stored device keys.** Does NOT require user credentials or OTP.

**Bytecode reference:** Function `regularKeyExchange` (#11821, line 445770), generator #11820 (line 445700).

**Payload:**
```
URL params:  key2=<stored_key2>&sfunc=i
Body:        data=<URL_ENCODED_BASE64>
```

**Inner (encrypted with stored `key1`):**
```json
{
  "cmod": "<fresh DH public key: G^A mod P>",
  "appId": "<stored appId>",
  "routePath": "S40",
  "sodium": "<20 fresh random bytes as decimal string>",
  "xxid": "<40 fresh random bytes as decimal string>"
}
```

**Response (decrypted with stored `key1`):**
```json
{
  "success": true,
  "smod": "<new server DH public key>",
  "xxid": "<new xxid>",
  "nonceGenerator": "<new nonce generation pattern>"
}
```

**Post-processing:**
```
session_key = base64(SHA-256(pow(new_smod, A_VALUE, P_VALUE)))
```

**Key properties:**
- `key2` identifies the device to the server (URL param, not encrypted)
- The inner payload is encrypted with `key1` (not `DEFAULT_KEY`)
- A fresh `cmod` is generated for each call (DH guarantees forward secrecy)
- All fields in the response are **ephemeral** — stored keys remain unchanged

### Why This Works Without User Auth

The device keys (`key1`, `key2`) act as a **long-lived bearer credential**:
- They are established during device registration (which requires possession of the mobile app)
- They are stored securely on the device (iOS Keychain / Android Keystore)
- The server trusts that possession of `key1`/`key2` implies a previously-authenticated device
- No username, password, or OTP is needed for re-key — this is by design

### Important Security Note

`key1` and `key2` must be stored with care (encrypted at rest). If an attacker gains access to these keys, they can:
1. Initiate unlimited sessions without user credentials
2. Maintain access indefinitely (until the device is re-registered)
3. Bypass all authentication controls

See RULEBOOK.md R14 ("No credentials in source code") — device keys should be stored in a secure credential store, not hardcoded.

---

## Session Active State

While the session is active (`sfunc='n'` calls succeed), the aggregator can:

1. **Call encrypted API endpoints** using the current `session_key` and `xxid`:
   - A44 (auth type), A40 (login), C42/C43 (OTP) — during authentication
   - A80 (accounts), P47 (profile switch) — after authentication
   - A47/A48/A49 (approvals) — after authentication
   - P41 (profile image), etc.

2. **Maintain WebView session** via periodic `/aProfile/keepAlive` (every 90s):
   - Enables transaction history retrieval
   - Enables approval detail viewing
   - Enables transfer initiation (user-interactive only)

### Session State on the Client

The client maintains this state in memory:

| Field | Source | Used For |
|-------|--------|----------|
| `key1` | Registration response | Encrypting S40 init requests; decrypting S40 responses |
| `key2` | Registration response | URL parameter for S40 (identifies device) |
| `appId` | Registration response | Included in all encrypted payloads |
| `xxid` | Latest S40 response | Included in all encrypted `sfunc='n'` requests |
| `smod` | Latest S40 response | Server's DH public key; used to derive `session_key` |
| `session_key` | Derived from `smod` | Blowfish/ECB key for all `sfunc='n'` requests |
| `nonceGenerator` | Latest S40 response | Pattern string for `_gen_nonce()` |
| DH `A_VALUE` | Hardcoded constant | Client's DH private key (constant) |
| DH `P_VALUE` | Hardcoded constant | DH prime modulus (constant) |
| DH `G_VALUE` | Hardcoded constant (`2`) | DH generator (constant) |

---

## Session Expiry & Death

### What Causes Session Death

1. **Server-side timeout** — The server invalidates the `smod`/`xxid` mapping after a period of inactivity (exact TTL unknown — server-controlled, not in bytecode)
2. **Server restart** — All in-memory session state is lost on the server
3. **Key rotation** — The server may rotate its DH parameters or session table
4. **Concurrent sessions** — Multiple devices using the same keys may invalidate each other's sessions

### How Session Death Manifests

An encrypted API call (`sfunc='n'`) returns:

```json
{
  "success": false,
  "reasonText": "Error 101: Cipher key not found"
}
```

Error code 101 (`SwitchingProtocols`) is the HTTP status code used to signal "cipher key not found" — the server's session table no longer has a matching `smod`/`xxid` pair.

### What the Real App Does

The error 101 → re-key flow is **not in the JavaScript bytecode**. The `regularKeyExchange` function is exported from module 1502 but **never called** from any JS code in the Hermes bundle. The re-key trigger is implemented in the **React Native native networking layer** (iOS/Android):

1. Native XHR interceptor detects the response (via `_interceptor` hooks at the native level)
2. Native code calls into JavaScript via the bridge to trigger `regularKeyExchange`
3. JavaScript returns fresh session data to the native layer
4. Native code retries the original request transparently

Since the aggregator runs in Python, **we must implement this detection ourselves**.

### Session Death vs. Account Block

| Scenario | Error | Can Auto-Resurrect? |
|----------|-------|---------------------|
| Session expired (smod/xxid invalid) | 101 (cipher key) | **Yes** — call `sfunc='i'` |
| Account blocked (too many attempts) | 402 (blocked) | **No** — user must reset via real app |
| Invalid credentials | 407 (invalid) | **No** — user must re-authenticate |
| OTP required (stale session) | 414/415 (OTP) | **No** — user must enter OTP |
| Invalid request data | 501 (invalid) | **Maybe** — fix request and retry |

---

## Session Resurrection

### Resurrection Flow (Encrypted API)

```
1. Encrypted API call (sfunc='n') fails:
     → Any error: timeout, connection error, non-200 status, or
       {success: false} response

2. Call S40 key exchange (sfunc='i') with STORED key1/key2/appId:
     → step_s40(key1, key2, app_id)  [see mib_client.py:392]
     → Returns: {smod, xxid, nonce_generator, session_key}

3. Update session state:
     → Replace: xxid, smod, nonce_generator, session_key
     → KEEP:   key1, key2, appId (unchanged — permanent device keys)

4. Retry the original failed request with new session data

5. If step_s40 also fails with error 501:
     → Device keys may be invalid
     → Try full re-registration (sfunc='r') with DEFAULT_KEY
     → If that succeeds: we have fresh key1/key2 — resume normally
     → If that fails too: PERMANENT FAILURE — user must reinstall app
```

### Resurrection Flow (WebView)

After the encrypted API session is resurrected:

```
1. Generate new mbnonce from new nonceGenerator:
     → mbnonce = _gen_nonce(new_nonce_generator)

2. Update cookies on WebView session:
     → xxid = new_xxid
     → mbnonce = new_mbnonce
     → mbmodel = 'IOS-1.0' (unchanged)

3. POST keepAlive to /aProfile/keepAlive:
     → Establishes new JSESSIONID
     → Session is now fully restored

4. If keepAlive fails:
     → Create a fresh WebView session (setup_webview_session)
     → Retry keepAlive
```

### Python Implementation (Reference)

```python
def resurrect_session(key1, key2, app_id):
    """
    Resurrect a dead session using stored device keys.
    
    Returns:
        dict with keys: smod, xxid, nonce_generator, session_key
    
    Raises:
        RuntimeError if re-key fails (try re-registration)
    """
    # Step 1: Call S40 with sfunc='i'
    s40_result = step_s40(key1, key2, app_id)
    
    # Step 2: Return new ephemeral session data
    return {
        'smod': s40_result['smod'],
        'xxid': s40_result['xxid'],
        'nonce_generator': s40_result['nonce_generator'],
        'session_key': s40_result['session_key'],
    }


def resurrect_webview_session(new_xxid, new_nonce_generator):
    """
    Re-establish WebView session after encrypted API resurrection.
    
    Returns:
        requests.Session with cookies set and keepAlive posted
    """
    return setup_webview_session(new_xxid, new_nonce_generator)
```

### When Resurrection is NOT Possible

| Condition | Action |
|-----------|--------|
| `key1`/`key2` are missing or corrupted | Cannot resurrect — must re-register (`sfunc='r'`) |
| `sfunc='i'` returns error 501 | Device keys invalid — try `sfunc='r'` |
| `sfunc='r'` also fails | Server-side issue — user must reinstall app |
| Error 402 (blocked) | User must contact bank to unblock |
| Error 407 (invalid credentials) | User must provide correct credentials |
| Error 414/415 (OTP required) | User must enter OTP (cannot auto-resurrect past auth) |

---

## Keepalive Mechanisms

### WebView Keepalive (`/aProfile/keepAlive`)

**Bytecode reference:** Function #9661 (line 361471), `useKeepAlive` hook #12163 (line 460418).

**Purpose:** Maintains the WebView `JSESSIONID` cookie so that WebView-based features (transaction history, approval details, transfer initiation) remain available.

**Mechanism:**
```
Endpoint: POST https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive
Headers:  User-Agent: android/1.0
Cookies:  xxid=<current_xxid>
          mbmodel=IOS-1.0
          mbnonce=<current_nonce>
Body:     (none)
```

**Timing:** Every **90,000 ms (90 seconds)** — hardcoded in bytecode at line 460428 (`Imm32: 90000`).

**Behavior:**
- If the session is alive: returns 200 OK, refreshes JSESSIONID expiry
- If the session is dead: returns error (the WebView session setup must be re-run)
- No encryption, no sfunc, no routePath — this is a plain HTTP POST

### Encrypted API Keepalive

**There is NO encrypted API keepalive.** The native app does not send periodic encrypted requests to maintain the session. Instead:

- The encrypted API session is **stateless from the client's perspective** — each request carries its own `xxid` and encrypted payload
- When the session expires, the **next request fails** and triggers re-key
- No proactive keepalive is needed — the aggregator should detect failure and re-key on demand

### Why No Encrypted API Keepalive

The encrypted API uses Diffie-Hellman key exchange with forward secrecy. The `session_key` is derived from `smod` (server's DH public key). The server maintains a mapping of `xxid → smod` for active sessions. This is inherently ephemeral by design:
- No persistent server-side session state beyond the `xxid → smod` mapping
- The mapping has a TTL (unknown, server-controlled)
- Re-key generates fresh DH keys with forward secrecy

This is different from cookie-based sessions which require periodic keepalive to prevent expiry.

---

## Stored Data Requirements

### What the Aggregator Must Persist

| Field | Type | Permanence | Source | Purpose |
|-------|------|------------|--------|---------|
| `key1` | string (40 chars) | **Permanent** | Registration response | Encrypts S40 requests; decrypts S40 responses |
| `key2` | string (40 chars) | **Permanent** | Registration response | URL param for S40 (device identifier) |
| `appId` | string | **Permanent** | Registration response | Included in all encrypted payloads |
| `xxid` | string (decimal) | **Ephemeral** | Latest S40 response | Per-request identifier |
| `smod` | string (big int) | **Ephemeral** | Latest S40 response | Server DH public key |
| `nonceGenerator` | string | **Ephemeral** | Latest S40 response | Nonce pattern |
| `session_key` | string (base64) | **Ephemeral** | Derived from smod | Blowfish key |
| `password_hash` | string (64 hex) | **Persistent** | Computed at login | SHA-256(password).upper() for hash-based auth restoration |
| DH_A_VALUE | big integer | **Constant** | Bytecode (line 378011) | DH private key |
| DH_P_VALUE | big integer | **Constant** | Bytecode (line 378012) | DH prime |
| DH_G_VALUE | integer (2) | **Constant** | Bytecode (line 378013) | DH generator |

### What Must NOT Be Stored

- **Plaintext password** — Must never be stored. The `password_hash` is SHA-256(password).upper(), a one-way irreversible hash (see RULEBOOK R19).
- **OTP** — Must never be stored or reused (RULEBOOK R4)

### Persistence Strategy

```
┌──────────────────────────────────────────────────────┐
│                   Secure Storage                       │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  PERMANENT SECTION (never cleared)                │  │
│  │  - key1, key2, appId                             │  │
│  │  - Encrypted at rest (e.g., Django SECRET_KEY)   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  EPHEMERAL SECTION (cleared on session death)     │  │
│  │  - xxid, smod, nonceGenerator, session_key        │  │
│  │  - Updated after each S40 or successful request   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  USER STATE SECTION (cleared on logout)           │  │
│  │  - username (for re-auth prompts)                │  │
│  │  - account list (cache)                          │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Full System Shutdown Recovery

The mock app supports the "set and forget" requirement: a session survives a complete power cycle (shutdown → reboot → restart) without requiring the user to re-enter credentials or OTP.

### What Survives a Shutdown

| Data | Survives? | Why |
|------|-----------|-----|
| `key1`, `key2`, `app_id` | **Yes** | Written to `session.json` by `_persist_session()` |
| `xxid`, `nonce_generator`, `session_key` | **Yes** | Same (ephemeral fields are also persisted) |
| `is_authenticated`, `username`, `accounts` | **Yes** | Same |
| `smod` | **No** | Not persisted — only used transiently during DH exchange to derive `session_key` |
| `wv_session` (requests.Session) | **No** | Cannot be serialized — re-created on restore via `_prewarm_webview()` |
| In-memory `_state` | **No** | Lost when Flask process terminates |

### Recovery Sequence (on startup)

```
app.py startup
  │
  ▼
_try_restore_session():
  ├── 1. Load session.json from disk
  ├── 2. Check is_authenticated == True + all required keys present
  ├── 3. _state.update(saved) — restore all fields to memory
  │
  ├── 4. Try _fetch_accounts() (A80 call):
  │   ├── A80 SUCCEEDS → _persist_session() → _prewarm_webview() → DASHBOARD
  │   └── A80 FAILS (session expired on server) →
  │       ├── 5. resurrect_session(key1, key2, app_id) → step_s40
  │       │   ├── SUCCEEDS → new xxid, nonce_generator, session_key
  │       │   │   ├── A80 SUCCEEDS → _persist_session() → _prewarm_webview()
  │       │   │   │   → DASHBOARD (session.json now has updated values)
  │       │   │   └── A80 FAILS → _reset_state() → LOGIN FORM
  │       │   └── FAILS (key1/key2 invalidated) →
   │       │       └── 6. Re-register (sfunc='r') with stored app_id:
   │       │           ├── SUCCEEDS → new key1, key2, app_id, xxid, session_key
   │       │           │   ├── nonce_generator present?
   │       │           │   │   ├── YES → ready for auth
   │       │           │   │   └── NO  → call S40 with new keys
   │       │           │   ├── password_hash stored?
   │       │           │   │   ├── YES → _authenticate_with_hash() (A44→A41)
   │       │           │   │   │   ├── SUCCEEDS → _persist_session() → _prewarm_webview()
   │       │           │   │   │   │   → DASHBOARD
   │       │           │   │   │   └── FAILS → fall through to A80
   │       │           │   │   └── NO  → try A80
   │       │           │   ├── A80 SUCCEEDS → _persist_session() → _prewarm_webview()
   │       │           │   │   → DASHBOARD
   │       │           │   └── A80 FAILS → _reset_state() → LOGIN FORM
   │       │           └── FAILS → _reset_state() → LOGIN FORM
  │
  └── 7. If anything fails → _reset_state() → LOGIN FORM
```

### Key Design Points

1. **Permanent vs. ephemeral separation:** `key1`/`key2`/`app_id` are permanent device credentials that survive indefinitely. `xxid`/`nonce_generator`/`session_key` are ephemeral — they expire server-side after a TTL and get refreshed via S40 re-key.

2. **Persist after resurrection (`_persist_session()`):** After a successful S40 re-key, the new ephemeral values are written back to `session.json`. This prevents redundant S40 calls on subsequent restarts.

3. **WebView pre-warm (`_prewarm_webview()`):** After a successful restore, a WebView session is established proactively so the first transaction fetch has no lazy-init delay. If the pre-warm fails (e.g., nonce generation issue), it's non-critical — the transaction endpoint handles stale WebView sessions via automatic 419 detection and refresh.

4. **RACE condition on `session.json`:** If the server is killed during `_persist_session()` writing to disk, the file may be truncated or corrupted. On next startup, `session_store.load()` catches `FileNotFoundError`/`JSONDecodeError` and returns `{}` → restoration fails → login form shown. In this case, the user must re-authenticate.

5. **Re-registration fallback (sfunc='r'):** When both A80 and S40 resurrection fail (device keys invalidated server-side), the system attempts a fresh device registration using the **stored `app_id`**. If a stored `password_hash` is available, the system then calls `_authenticate_with_hash()` which performs A44 → A41 to re-establish authentication. If no hash is available, A80 is attempted as a fallback. This is the native layer's three-step retry chain that the official MIB app uses: request fails → S40 re-key → if that fails → re-register silently → retry. The hash-based auth extends this chain with a fourth step that the official app cannot perform (it does not store credentials).

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Dashboard shows "Not logged in" after restart | session.json missing or corrupted (invalid JSON or missing `is_authenticated` flag) | Re‑authenticate via the login form |
| Dashboard loads but accounts are stale | A80 succeeded but accounts changed while server was down; `_persist_session()` wrote stale accounts before shutdown | Click "Refresh" button in dashboard header |
| Transaction history shows 419 error | WebView JSESSIONID expired during idle | Fixed automatically — `refresh_webview_session()` + retry (since the recent 419-handling update) |
| Transaction history shows "WebView session failed" | `setup_webview_session()` failed (likely xxid/nonce_generator mismatch from resurrection) | Non-critical — the first successful transaction fetch will re-establish it |
| Dashboard loads but all endpoints return errors | `key1`/`key2` were invalidated server-side (device registration purged) | **Fixed automatically** — `_try_restore_session()` re-registers (sfunc='r') with stored `app_id`, then retries A80. If re-registration also fails, the login form is shown. |
| "S40 decryption failed: Incorrect padding" | The stored `key1`/`key2` no longer match the server's records | **Fixed automatically** — re-registration fallback generates new device keys and re-establishes the session. No user action needed unless re-registration also fails. |

### Implementation Reference

The recovery logic is implemented in:

- **`app.py`** — `_try_restore_session()`: Loads session.json, verifies with A80, falls back to S40 resurrection, falls back to full re-registration (sfunc='r') with stored `app_id`, then hash-based auth via `_authenticate_with_hash()`, persists updated state, pre-warms WebView.
- **`app.py`** — `_prewarm_webview()`: Best-effort WebView session setup after restore.
- **`app.py`** — `_re_registration_fallback()`: Re-registers device (sfunc='r') with stored `app_id`, updates keys, then calls `_authenticate_with_hash()` if password_hash is stored, or falls back to A80.
- **`mib_client.py:874`** — `resurrect_session()`: Calls S40 `sfunc='i'` with stored key1/key2 to get fresh ephemeral session data.
- **`mib_client.py:924`** — `resurrect_webview_session()`: Re-establishes WebView session after encrypted API resurrection.

---

## Failure Modes

### Mode 1: Session Expired (Error 101)

**Detection:** Encrypted API call returns `{success: false, reasonText: "..."}` with error 101, or any HTTP-level failure on an encrypted request.

**Action:** Call `resurrect_session()` (S40 sfunc='i') with stored keys.

**Expected outcome:** Success — new session established. Retry original request.

**If resurrection fails:** Try full re-registration (`sfunc='r'`).

### Mode 2: Device Keys Invalid (S40 Error 501 or Incorrect Padding)

**Detection:** `step_s40(key1, key2, app_id)` returns error 501, or raises `"S40 decryption failed: Incorrect padding"`.

The "Incorrect padding" error means the server responded to our S40 request but the response could not be decrypted with the stored `key1`. This happens when:
- The device registration (key1/key2) was purged server-side (periodic cleanup of old registrations)
- The server rotated its internal key table
- A different client registered with the same device fingerprint (unlikely)

In this case, `resurrect_session()` cannot recover the session because the foundation (key1/key2) is gone.

**Terminal output when this occurs:**
```
  [restore] S40 resurrection FAILED: S40 decryption failed: Incorrect padding
  [restore] Device keys (key1/key2) are no longer valid on the server.
  [restore] Full login (username + password) is required.
```

**Action:** The user must log in again through the web form. The login flow automatically performs a fresh `sfunc='r'` registration (new key1/key2), followed by S40 → A44 → A40/A41 → dashboard. No OTP is needed unless the server requests it.

**Expected outcome:** Full re-registration and re-authentication succeeds. The user is taken to the dashboard without any manual registration steps.

### Mode 3: Account Blocked (Error 402)

**Detection:** A44 or A40 returns error 402 ("User is blocked. Please contact call center.").

**Action:** Cannot auto-resolve. User must:
1. Open the real MIB app on their phone
2. Log in manually (this resets the block counter)
3. Wait 5 minutes
4. Try again

**Expected outcome:** Account is unblocked after manual login on real device.

### Mode 4: Invalid Credentials (Error 407)

**Detection:** A44 or A40 returns error 407.

**Action:** Cannot auto-resolve. Prompt user for correct credentials.

### Mode 5: OTP Required (Errors 414/415)

**Detection:** A40 returns errors 414 or 415, or `success: false` with OTP-related reasonText.

**Action:** Cannot auto-resolve. Prompt user for OTP.

### Mode 6: Nonce Generation Failure (Error 501 on any endpoint)

**Detection:** Any encrypted request returns error 501 with no actionable context.

**Action:**
1. Verify the nonceGenerator is correctly parsed and stored
2. Verify `_gen_nonce()` produces the correct format
3. Try regenerating nonce (it's randomized)
4. If persistent: re-key via S40 to get a fresh nonceGenerator

### Mode 7: WebView Session Expired

**Detection:** WebView request (transaction history, approval detail) returns non-200 or unexpected HTML.

**Action:**
1. Generate new `mbnonce` from current `nonceGenerator`
2. Update cookies on WebView session (`xxid`, `mbnonce`)
3. POST `/aProfile/keepAlive` to establish new `JSESSIONID`
4. If keepAlive fails → recreate entire WebView session

### Mode 8: Network Error

**Detection:** HTTP request times out or returns connection error.

**Action:** Retry with exponential backoff:
- Base delay: 1 second
- Backoff multiplier: 1.5x
- Max attempts: 5
- Note: This matches the `RETRY_CONFIG` in the bytecode (lines 378017-378018), though the bytecode uses it only for image downloads, not API calls

### Mode 9: Concurrent Session Invalidation

**Detection:** Session dies unexpectedly after a successful `sfunc='i'` re-key.

**Action:** Check if multiple aggregator instances are using the same device keys. Each `sfunc='i'` call generates a new `cmod` — if two instances call `sfunc='i'` concurrently, the second call may invalidate the first's session.

**Mitigation:** Use one set of device keys per aggregator instance.

---

## Aggregator Integration Guide

### Integration Into `sync/session.py`

```python
def refresh_session(api_client, db_session):
    """Refresh the encrypted API session via S40 key exchange.
    
    Called when:
    1. A previous encrypted request failed (error 101)
    2. The aggregator starts up and has stored keys
    3. A periodic refresh (e.g., every 30 min) is configured
    """
    session_store = SessionStore(db_session)
    sync_log = SyncLogStore(db_session)
    
    session = session_store.get_latest()
    if not session:
        logger.warning("No session to refresh")
        return False
    
    key1 = session.key1
    key2 = session.key2
    app_id = session.app_id
    
    if not all([key1, key2, app_id]):
        logger.error("Missing device keys — cannot refresh")
        return False
    
    logger.info("Refreshing session via S40 key exchange...")
    try:
        # Call S40 with sfunc='i'
        resp = call_s40_init(key1, key2, app_id)
        
        # Update stored session data
        session_store.update(
            session.id,
            xxid=resp['xxid'],
            smod=resp['smod'],
            session_key=resp['session_key'],
            nonce_generator=resp['nonce_generator'],
        )
        
        # Re-establish WebView session
        try:
            setup_webview_session(resp['xxid'], resp['nonce_generator'])
        except Exception:
            logger.warning("WebView session re-establishment failed (non-critical)")
        
        sync_log.log('refresh', 'success', 'Session refreshed via S40')
        logger.info("Session refreshed successfully")
        return True
    except Exception as e:
        sync_log.log('refresh', 'failed', str(e))
        logger.error(f"Session refresh failed: {e}")
        return False
```

### Integration Into Encrypted API Client

Every encrypted API call should follow this pattern:

```python
def encrypted_request(sfunc, route_path, payload, max_resurrection_attempts=1):
    for attempt in range(max_resurrection_attempts + 1):
        try:
            response = _do_encrypted_request(sfunc, payload)
            
            # Check for session expiry
            if not response.get('success', False):
                reason = response.get('reasonText', '')
                if '101' in reason or 'cipher' in reason.lower():
                    # Session expired — resurrect
                    resurrect_session()
                    continue  # Retry with new session
                else:
                    # Other error — don't retry
                    return response
            
            return response
        except (ConnectionError, TimeoutError):
            if attempt == 0:
                # Network error — try resurrecting (session may have timed out)
                resurrect_session()
                continue
            raise
        except Exception:
            raise  # Don't retry on unexpected errors
    
    raise RuntimeError("Request failed after resurrection attempt")
```

### Integration Into Sync Loop

```python
def sync_all(api_client, db_session):
    """Full sync cycle with automatic session management."""
    
    # Step 1: Ensure session is alive
    session_valid = verify_session(api_client)
    if not session_valid:
        logger.info("Session expired — attempting resurrection...")
        success = refresh_session(api_client, db_session)
        if not success:
            logger.error("Cannot sync — session resurrection failed")
            return
    
    # Step 2: Perform sync operations
    try:
        sync_accounts(api_client, db_session)
        sync_transactions(api_client, db_session)
    except SessionExpiredError:
        # Session died during sync — resurrect and retry once
        success = refresh_session(api_client, db_session)
        if success:
            sync_accounts(api_client, db_session)
            sync_transactions(api_client, db_session)
        else:
            logger.error("Session died during sync and resurrection failed")
```

---

## Bytecode References

| Function | ID | Line | Purpose |
|----------|----|------|---------|
| `exchangeKeys` | #11803 | 445150 | Device registration (`sfunc='r'`) |
| `exchangeKeys` generator | #11802 | 445175 | Payload builder for registration |
| `regularKeyExchange` | #11821 | 445770 | Session init / re-key (`sfunc='i'`) |
| `regularKeyExchange` generator | #11820 | 445700 | Payload builder for re-key |
| `parseApiResponse` | #10140 | 378705 | Decrypt + parse API response |
| `keepAlive` wrapper | #9662 | 361513 | 29-byte `.apply` wrapper |
| `keepAlive` generator | #9661 | 361471 | POST to `/aProfile/keepAlive` |
| `useKeepAlive` hook | #12163 | 460418 | React hook with 90s interval |
| `setInterval` in hook | #12164 | 460455 | Creates 90s keepalive timer |
| `sendKeepAliveRequest` | #12168 | 460531 | Calls keepAlive periodically |
| `resetTimeout` | #11785 | 444253 | 10-min inactivity PIN timeout |
| `UseAppStateChange` | #14931 | 564380 | App foreground/background handler |
| `calculateCmod` | (env) | N/A | DH public key: `G^A mod P` |
| `generateRandom` | (env) | N/A | Random bytes as decimal string |
| `encryptAndEncode` | (env) | N/A | Blowfish encrypt + base64 + URL encode |
| Config module | #10113 | 377990 | Constants: DEFAULT_KEY, A_VALUE, P_VALUE, G_VALUE |
| RETRY_CONFIG | N/A | 378017 | `{MAX_ATTEMPTS: 5, DELAY: 1000, BACKOFF: 1.5}` |
| HTTP status codes | N/A | 377945 | `SwitchingProtocols: 101` |
| `reasonText` string_id | 11484 | Multiple | Error description field in responses |

## Related Documentation

- [FLOW.md](FLOW.md) — Authentication flow, session persistence, sequence diagrams
- [API.md](API.md) — Complete endpoint catalog with payload formats
- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and data flow
- [RULEBOOK.md](RULEBOOK.md) — Governance rules (especially R1, R3, R4, R10, R14)
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — Known limitations and implementation gaps
