# Authentication & Session Flow

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Overview](#overview)
- [Step-by-Step Login Flow](#step-by-step-login-flow)
- [Key Exchange Flow](#key-exchange-flow)
- [Device Registration Flow](#device-registration-flow)
- [Nonce Generation Step by Step](#nonce-generation-step-by-step)
- [Session Persistence and Resumption](#session-persistence-and-resumption)
- [Sequence Diagram](#sequence-diagram)

## Overview

The MIB authentication flow involves a multi-step handshake that combines:

1. **Device registration** — Bootstraps device identity on first launch
2. **Diffie-Hellman key exchange** — Establishes shared encryption key
3. **Nonce generation** — App-side deterministic pseudo-random nonce
4. **Credential submission** — Username and password (A40) or salted hash (A41)
5. **Two-factor authentication** — OTP verification (C42) — *optional, see below*
6. **Account data retrieval** — Fetch accounts (A80)

Every step in this flow has been validated by an automated 8-phase bytecode analysis
([`REVERSE_ENGINEERING.md`](REVERSE_ENGINEERING.md#automated-bytecode-analysis)), which
confirmed all 23 routePaths, crypto constants, variable flows, and conditional logic
against the full 3MB Hermes v96 bundle (14,959 functions, 29,891 strings).

> **Bytecode verification status:** The aggregator's implementation is correct and aligned with the bytecode. The only remaining issues are server-side limitations (see [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#24-c42-sms-otp-otptype-2--server-side-php-bug)). See [`REVERSE_ENGINEERING.md#plan-2-targeted-deep-dive-analysis`](REVERSE_ENGINEERING.md#plan-2-targeted-deep-dive-analysis) for the complete validation report.

## Step-by-Step Login Flow

### Step 1: Device Registration (sfunc='r')

**Condition**: No stored key1/key2 (first launch or cleared data).

**Action**: Send encrypted outer envelope with `DEFAULT_KEY` to bootstrap device identity.

**Request**:
- URL: `POST https://faisanet.mib.com.mv/faisamobilex_smvc/?sfunc=r`
- Content-Type: `application/json`
- Body: `{"data": "<URI_ENCODED_CIPHERTEXT>"}`
- Encryption key: `DEFAULT_KEY`

**Outer envelope (what gets encrypted)**:
```json
{
    "sfunc": "r",
    "data": {
        "cmod": "<DH public value: G^A mod P>",
        "appId": "...",
        "routePath": "S40",
        "sodium": "...",
        "xxid": "..."
    }
}
```
The `sfunc` is **inside** the encrypted envelope, not just in the URL.

**Response** (decrypted with `DEFAULT_KEY`):
- `key1`, `key2` — Device-specific encryption keys
- `appId` — Assigned app identifier
- `xxid` — Request correlation identifier
- `smod` — Server's DH public value
- `nonceGenerator` (optional) — Nonce seed string

**Key Derivation**:
```python
session_key = compute_blowfish_key(smod)
# ≡ pow(int(smod), A_VALUE, P_VALUE) → SHA-256 → base64
```

**Implementation**: `mib_client.py:step_register_device()` (line 345)

### Step 2: S40 — Session Init (sfunc='i')

**Condition**: Registration did not return a nonceGenerator, or session has expired.

**Action**: Perform another DH key exchange with the device-specific key1.

**Request**:
- URL: `POST /faisamobilex_smvc/?sfunc=i&key2=<key2>`
- Content-Type: `application/json`
- Body: `{"data": "<URI_ENCODED_CIPHERTEXT>"}`
- Encryption key: `key1` (from registration)

**Outer envelope (what gets encrypted)**:
```json
{
    "sfunc": "i",
    "key2": "<key2>",
    "data": {
        "cmod": "...",
        "appId": "...",
        "routePath": "S40",
        "sodium": "...",
        "xxid": "..."
    }
}
```
- `key2` appears **both** inside the encrypted envelope and as a URL query parameter
- Uses `key1` (from registration) as the encryption key

**Response** (decrypted with key1):
- `smod` — Server's DH public value
- `xxid` — Updated correlation ID
- `nonceGenerator` — Nonce seed string (required for subsequent requests)

**Implementation**: `mib_client.py:step_s40()` (line 481)

### Step 3: A44 — Get Auth Type

**Condition**: Session key established, nonce generator available.

**Action**: Check if the username exists and get authentication requirements.

**Inner Payload**:
```json
{
    "uname": "<username>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "A44",
    "xxid": "<xxid>"
}
```

**Response handling**:
- If `success: true` → proceed to A40
- If `reasonCode: "402"` → user is blocked
- If `reasonCode: "407"` → invalid credentials

**Implementation**: `mib_client.py:step_a44()` (line 614)

### Step 4a: A40 — Login with Password (Plaintext)

**Condition**: A44 returned success, `loginMethod` is `"A40"` (default).

**Action**: Submit username and plaintext password.

**Inner Payload**:
```json
{
    "uname": "<username>",
    "pgf02": "<password (plaintext)>",
    "pmodTime": 0,
    "requireBankData": 0,
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "A40",
    "xxid": "<xxid>"
}
```

**Response handling**:
- If `reasonCode: "414"` / `"415"` → OTP required (proceed to Step 5)
- If `success: true` → login complete (skip OTP)
- If `success: false` with other codes → login failed

**Implementation**: `mib_client.py:step_a40()` (line 629)

### Step 4b: A41 — Login with Salted Password

**Condition**: A44 returned success, `loginMethod` is `"A41"`, and A44 response contains `userSalt` in `data[0].userSalt`.

**Action**: Submit salted password hash (`pgf03`) plus client-generated salt (`clientSalt`). This is the real MIB login endpoint — the official app never sends plaintext passwords.

**Inner Payload**:
```json
{
    "uname": "<username>",
    "pgf03": "<salted_password_hash>",
    "clientSalt": "<client_generated_hex_salt>",
    "pmodTime": 0,
    "requireBankData": 1,
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "A41",
    "xxid": "<xxid>"
}
```

**Salting algorithm** (from `mib_client.py:step_a41()`):
```
h1 = SHA-256(password).upper()           # uppercase hex string
h2 = SHA-256(h1 + userSalt).upper()      # hex strings concatenated
clientSalt = random 16 bytes (32 hex chars)
pgf03 = SHA-256(clientSalt + h2).upper() # clientSalt = salt_rand
```

Note: ALL intermediate SHA-256 digests are UPPERCASE hex. The `clientSalt` sent to the server must match the `salt_rand` used inside the hash computation.

**Response handling**:
- If `primaryOTPType` or `otpTypes` are present in the response → OTP required (proceed to Step 5, use A42 endpoint)
- If `reasonCode: "414"` / `"415"` → OTP required (proceed to Step 5)
- If `success: true` with no OTP indicators → login complete (skip OTP)
- If `success: false` with other codes → login failed

> **Note**: A41 returns `success: true` even when OTP is required. The presence of `primaryOTPType`/`otpTypes` fields signals that credentials are accepted but OTP verification must follow.

**Implementation**: `mib_client.py:step_a41()` (line 687)

> **Bytecode confirmation:** OTP is **not mandatory**. Function #11796 (auth handler, offset 642) checks `data.profileSelected`. When truthy — user already has a selected profile — OTP is skipped, proceeding directly to session creation. This is the aggregator's normal path. The bytecode also confirms (Plan 2.2, 2.4) that `primaryOTPType` and `otpTypes` are informational signals, not requirements. The aggregator correctly uses these signals.

### Step 5: C42 — OTP Verification

**Condition**: A40 or A41 returned OTP required.

**C42** is the **only** OTP verification endpoint confirmed in the bytecode. A42 was hypothesised during early RE but is absent from all 14,959 functions and 29,891 strings. Both A40 and A41 paths use C42 for OTP verification.

| Endpoint | Used When | Purpose |
|----------|-----------|---------|
| **C42** | After A40 or A41 | OTP verification (single endpoint, confirmed in bytecode) |

**Inner Payload (C42 — login OTP)**:

```json
{
    "otp": "<OTP_code>",
    "uname": "<username>",
    "otpType": "2",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "C42",
    "xxid": "<xxid>"
}
```

**Response handling (C42)**:
- If `success: true` → OTP verified, login complete
- If `success: false` → OTP verification failed

**Implementation**:
- `mib_client.py:step_a42()` (line 716) — login OTP (A42)
- `mib_client.py:step_c42()` (line 737) — registration/legacy OTP (C42)

### Step 6: A80 — Get Accounts

**Condition**: Login complete (with or without OTP).

**Action**: Fetch account list and balances.

**Inner Payload**:
```json
{
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "A80",
    "xxid": "<xxid>"
}
```

**Implementation**: `mib_client.py:step_a80()` (line 786)

### Optional: C43 — Resend OTP

**Condition**: User needs a new OTP code.

**Action**: Request the server to resend the OTP.

**Inner Payload**:
```json
{
    "uname": "<username>",
    "otpType": "2",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "C43",
    "xxid": "<xxid>"
}
```

**Implementation**: `mib_client.py:step_c43()` (line 754)

### Profile Switching (P47)

**Condition**: User has multiple profiles (e.g., personal and business).

**Action**: Switch the active profile, which scopes accounts and services.

**Inner Payload**:
```json
{
    "profileType": "<profile_type>",
    "profileId": "<profile_id>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random>",
    "routePath": "P47",
    "xxid": "<xxid>"
}
```

**Profile types**: `'0'` = primary/own profile, other values = linked/secondary profiles.

**Implementation**: Bytecode function #13496 (line 507900), `mib_client.py:step_p47()` (line 770)

### Login Method Selection (Mock App)

The mock app's login screen includes a radio button group allowing the user to choose between two login paths:

| Method | Description | Default? |
|--------|-------------|----------|
| `A40` (Regular) | Plaintext password via `pgf02`. Server may skip OTP for trusted sessions. | **Default** |
| `A41` (Salted) | Salted password hash via `pgf03` + `clientSalt`. Always triggers OTP. | No (testing only) |

- The selection is passed as `loginMethod: "A40"` or `loginMethod: "A41"` in the POST body to `/api/login`.
- If A41 is selected but the A44 response does not contain a `userSalt` field, the API returns an error advising the user to use A40 instead.
- Both paths share the same OTP check (reasonCode `414`/`415`) and the same C42 OTP verification endpoint.

**Design rationale — why A40 is the default:**

The aggregator is a server-side service running on a fixed infrastructure with persistent device keys (key1/key2). This is inherently more secure than a consumer mobile device:
- Device keys are stored on a controlled server, not a user's phone
- The aggregate environment has a fixed IP and controlled access
- OTP adds operational friction (manual intervention) without increasing security for the aggregator's use case

Therefore, **A40 (which allows OTP-skip when the server permits it) is the correct default**. A41 is available as a manual testing option to exercise the full OTP flow, but it is not the primary authentication path. If the server explicitly demands OTP (reasonCode `414`/`415`) on an A40 call, the aggregator handles it transparently via C42.

### Server-Side OTP Decision (Trust/Environment Investigation)

**Finding**: The decision to require OTP (`reasonCode: "414"`/`"415"`) vs. skip OTP (`success: true`, `reasonCode: "104"`) is **entirely server-side and opaque**. The client has no influence over it.

**What the client sends (and what could influence the decision)**:

| Client Signal | What Gets Sent | Influence on OTP? |
|---------------|----------------|-------------------|
| Device attestation (SafetyNet, PlayIntegrity) | **None** — confirmed absent from 565K-line bytecode disassembly | None |
| HTTP headers | Only `Content-Type` + `User-Agent: android/1.0` | None |
| Device fingerprint | Only `appId = "IOS17.2-<random>"` — locally generated, not persisted | None |
| Geo-IP / location | **None** — no location data sent | None |
| `deviceId` / `deviceIdentifier` | **None** — server identifies devices via key1/key2 pair | None |
| `pmodTime` | Always `0` in mock app | **Candidate** — may signal password modality or age |
| `loginMethod` | Either `A40` (plaintext) or `A41` (salted) | **Candidate** — server may treat A41 as lower-risk |

**Direct evidence from bytecode investigation** (see `REVERSE_ENGINEERING.md:465-467`):
- No device attestation (SafetyNet, PlayIntegrity, KeyStore) exists in the bytecode
- No root detection, jailbreak detection, or device integrity checks
- No custom device fingerprint headers
- Device trust is established **solely** through the DH key exchange + device registration flow (server-assigned key1/key2)

**Hypothesis**: The observed behavior (A40 returning `success: true` with no OTP) is likely due to one or more of:
1. **Server environment detection** — The server may skip OTP for specific IP ranges, test environments, or low-risk networks
2. **Fresh registration** — A brand-new device registration (key1/key2) may trigger different OTP policy than a long-established one
3. **Account-specific policy** — Certain account types or tiers may have relaxed OTP requirements
4. **Debug/testing path** — The `reasonCode: "104"` (Initialization Successful) response may be a leftover code path from development

Regardless of why, the client code correctly handles both outcomes: it checks the exhaustive OTP indicator list (11 fields) and proceeds accordingly.

## Key Exchange Flow

The key exchange uses Diffie-Hellman with hardcoded parameters:

### Parameters

```
G = 2
A = 15635168026672823872264903517997368814422997784846...  (~128 bytes)
P = 24103124269210325885520760221975660748569505485024...  (~1024 bytes)
```

### Flow for sfunc='i' (regular key exchange)

```
Client                                  Server
  │                                       │
  │  cmod = G^A mod P                     │
  │  (≈1024-byte decimal string)          │
  │                                       │
  │  outer = {sfunc:'i', key2,            │
  │           data:{cmod, appId,          │
  │                 sodium, xxid}}        │
  │  ciphertext = encryptAndEncode(       │
  │    outer, key1)                       │
  │                                       │
  │  POST /faisamobilex_smvc/             │
  │  ?sfunc=i&key2=<key2>                │
  │  Content-Type: application/json       │
  │  {"data": "<URI_ENCODED_CIPHERTEXT>"} │
  │ ─────────────────────────────────────>│
  │                                       │
  │                                       │  smod = G^server_secret mod P
  │                                       │
  │  Response: encrypt({                  │
  │    smod, xxid, nonceGenerator         │
  │  }, key1)                             │
  │ <─────────────────────────────────────│
  │                                       │
  │  shared_secret = smod^A mod P         │
  │  session_key = base64(SHA-256(        │
  │    shared_secret.toString()))         │
  │                                       │
```

### Flow for sfunc='r' (device registration)

Same DH math and JSON envelope format, but:
- Encryption uses `DEFAULT_KEY` instead of `key1`
- No `key2` in envelope or URL params
- Outer envelope is `{sfunc: 'r', data: {cmod, appId, routePath, sodium, xxid}}`
- Response includes `key1`, `key2`, `appId`, `xxid` alongside `smod`

## Device Registration Flow

```
┌─────────────────────────────────────────────┐
│  Device Registration (sfunc='r')            │
│  Encryption: DEFAULT_KEY                     │
├─────────────────────────────────────────────┤
│                                              │
│  1. Generate random fingerprints:            │
│     app_id = "IOS17.2-" + random(15 chars)   │
│     xxid = random_bytes(40) as decimal       │
│     cmod = G^A mod P                         │
│                                              │
│  2. Build outer envelope:                    │
│     outer = {sfunc:"r", data:{cmod, appId,  │
│              routePath:"S40", sodium, xxid}} │
│                                              │
│  3. encryptAndEncode(outer, DEFAULT_KEY):    │
│     JSON.stringify → Blowfish/ECB/PKCS5 →    │
│     base64 → encodeURIComponent               │
│                                              │
│  4. POST /faisamobilex_smvc/?sfunc=r         │
│     Content-Type: application/json           │
│     Body: {"data": "<URI_ENCODED_CIPHER>"}   │
│                                              │
│  5. Server response (decrypt w/ DEFAULT_KEY):│
│     {success:true, key1, key2, appId,        │
│      xxid, smod, ?nonceGenerator}            │
│                                              │
│  6. Derive session_key from smod:            │
│     shared_secret = smod^A mod P             │
│     session_key = base64(SHA-256(...))       │
│                                              │
│  7. Store key1, key2, appId, xxid,           │
│     session_key for subsequent requests      │
│                                              │
└─────────────────────────────────────────────┘
```

## Nonce Generation Step by Step

The nonce generation algorithm (`_gen_nonce` in `mib_client.py:83-163`) is the most critical piece for successful API calls.

### Input

A `nonceGenerator` string from the server, e.g.:
```
1000 M100 S5 X10 C5 A1 M5 S5 X10 C5 A1-2000 M10 S2 X3 C2 A2 M2 S4 X6 C8 A3-...
```

### Process

**Phase 1: Parse groups**

Split by `-` into groups. Each group has 8 space-separated tokens:
- Token 0: Seed (e.g., `"1000"` or `"1abc00"` — digits extracted)
- Tokens 1-7: Operations (letter + number, e.g., `"M100"`, `"S5"`)

**Phase 2: Compute per-group values**

For each group:
1. Extract digit `tn` from seed token
2. Generate `rf` = random integer in [1, 99]
3. `fs` = `str(tn * rf).zfill(5)`
4. `r12` = last 2 digits of `fs`
5. `r14` = sum of digits of `fs`
6. Accumulate `r29 += r14`

**Phase 3: Inner loop**

For each operation token in the group:
1. Extract operation letter and number `n`
2. Compute result `r` based on operation:

| Op | Formula |
|----|---------|
| M | `(r12 % n) + r14 + r29` |
| S | `(r12²) + n + r14 + r29` |
| X | `(r12 × n) + r14 + r29` |
| C | `(r12³) + n + r14 + r29` |
| A | `r12 + n + r14 + r29` |
| ? | `0` (default) |

3. Update `r12 = int(str(r)[-2:])` (last 2 digits of result)

**Phase 4: Assemble**

For each group:
1. Start with `fs` value
2. Append last 2 digits of each computation result
3. Add separator `-` after group (unless it's every 4th group)

### Example

```
nonceGenerator = "11216 M50 S3 X6 C5 M4 S6 X2 C3 A4 M60 S4 X9 C6 S8"
```

**Group 0 parsing:**
- tn = 11216
- rf (random) = 73
- fs = str(818768).zfill(5) = "818768"
- r12 = 68
- r14 = 8+1+8+7+6+8 = 38
- r29 = 38

**Group 0 operations:**
| t | op | n | formula | r | last2 |
|---|----|---|---------|---|-------|
| 1 | M | 50 | (68 % 50) + 38 + 38 = 78 | 78 | 78 |
| 2 | S | 3 | (78²) + 3 + 38 + 38 = 6165 | 6165 | 65 |
| 3 | X | 6 | (65 × 6) + 38 + 38 = 466 | 466 | 66 |
| 4 | C | 5 | (66³) + 5 + 38 + 38 = 287607 | 287607 | 07 |
| 5 | M | 4 | (7 % 4) + 38 + 38 = 79 | 79 | 79 |
| 6 | S | 6 | (79²) + 6 + 38 + 38 = 6323 | 6323 | 23 |
| 7 | X | 2 | (23 × 2) + 38 + 38 = 122 | 122 | 22 |
| 8 | C | 3 | (22³) + 3 + 38 + 38 = 10697 | 10697 | 97 |
| 9 | A | 4 | 97 + 4 + 38 + 38 = 177 | 177 | 77 |
| 10 | M | 60 | (77 % 60) + 38 + 38 = 93 | 93 | 93 |
| 11 | S | 4 | (93²) + 4 + 38 + 38 = 8729 | 8729 | 29 |
| 12 | X | 9 | (29 × 9) + 38 + 38 = 337 | 337 | 37 |
| 13 | C | 6 | (37³) + 6 + 38 + 38 = 50645 | 50645 | 45 |
| 14 | S | 8 | (45²) + 8 + 38 + 38 = 2109 | 2109 | 09 |

**Output for group 0:**
```
818768 78 65 66 07 79 23 22 97 77 93 29 37 45 09
```

## Session Persistence and Resumption

> **Full detail:** See [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) for the comprehensive session lifecycle, resurrection flow, keepalive mechanisms, and failure modes. This section provides a summary.

### In-Memory State

The Flask app maintains session state in the global `_state` dictionary. This state is **lost on server restart**.

### JSON Persistence (mib-mock-app)

On successful login (after OTP or immediate A40/A41 success), the state is persisted to `session.json`:

```python
def _persist_session():
    session_store.save({
        'key1': _state['key1'],
        'key2': _state['key2'],
        'app_id': _state['app_id'],
        'xxid': _state['xxid'],
        'nonce_generator': _state['nonce_generator'],
        'session_key': _state['session_key'],
        'is_authenticated': _state['is_authenticated'],
        'username': _state['username'],
        'password_hash': _state['password_hash'],
        'accounts': _state['accounts'],
    })
```

The `password_hash` field stores `SHA-256(password).upper()` — a one-way hash used
for automated session restoration via `_authenticate_with_hash()` when device keys
expire. See `RULEBOOK.md R19` for the storage policy.

> **Bytecode confirmation:** This 3-level fallback chain (A80 → S40 → re-registration + hash-based A41) matches the app's behaviour. Key findings from the bytecode analysis:
> - `key1`/`key2` are long-lived (written once by #11253 at registration, read by #11820 for S40 re-key). Confirmed by Plan 2.1 variable flow analysis.
> - S40 re-keying (`sfunc='i'`) uses `key1` as encryption key and passes `key2` as URL param and in the encrypted envelope — matches the aggregator's `step_s40()` implementation.
> - Power-cycle survival works because `key1`/`key2` persist across app restarts (they are stored in the app's AsyncStorage and persist until the user clears app data). The aggregator's `session.json` behaves identically.
> - The `password_hash` approach (storing `SHA-256(password).upper()` for hash-based A41 re-auth) is verified against the bytecode: `sha256HashUppercased` (function #10144) is exported from the crypto hub and used by #10591 and #11796 for the A41 salt chain.

### Session Restore

On startup, `app.py` calls `_try_restore_session()`:

1. Load `session.json` via `session_store.load()`
2. Check `is_authenticated == True`
3. Verify all required keys are present (`key1`, `key2`, `app_id`, `xxid`, `nonce_generator`, `session_key`)
4. Make an A80 (get accounts) call to verify the session is still valid
5. If A80 succeeds → session restored, show dashboard
6. If A80 fails → try S40 resurrection (sfunc='i') with stored key1/key2:
   a. If S40 succeeds → retry A80 → if OK, dashboard
   b. If S40 fails → try full re-registration (sfunc='r') with stored `app_id`:
      i. If re-registration succeeds → new key1/key2/xxid/session_key
         → If stored `password_hash` exists: authenticate via A44 → A41
           (hash-based) → extract accounts from A41 response → dashboard
         → If no hash: fall back to A80 (may fail with reasonCode 511
           if server doesn't preserve auth through re-registration)
      ii. If re-registration fails → login form shown
7. If all fallbacks fail → login form shown

> **Diagnostic output**: The startup sequence prints detailed diagnostics to the terminal,
> showing which step failed and why (e.g., `"S40 resurrection FAILED: S40 decryption failed:
> Incorrect padding"`). Check this output if the session does not restore.

### Session Expiry Scenarios

> See [SESSION_MANAGEMENT.md#failure-modes](SESSION_MANAGEMENT.md#failure-modes) for the complete guide to all 9 failure modes.

| Scenario | Detection | Resolution |
|----------|-----------|------------|
| Server restarted | A80 returns 101 error | Re-run S40 key exchange (`sfunc='i'`) — see [SESSION_MANAGEMENT.md#session-resurrection](SESSION_MANAGEMENT.md#session-resurrection) |
| Device keys cleared | Registration fails | Clear state, re-register |
| Long idle | A80 returns error | Re-key via S40 — no re-login required |
| Token expired (aggregator) | Refresh fails | Re-key via S40 — no re-authentication needed |
| Device registration expired | S40 returns "Incorrect padding" | **Automatic** — re-registration with stored app_id generates new device keys. Only falls through to login form if re-registration also fails. |

### Aggregator Session Management

The aggregator (`mib-aggregator`) uses an approach described in detail in [SESSION_MANAGEMENT.md#aggregator-integration-guide](SESSION_MANAGEMENT.md#aggregator-integration-guide):
- SQLAlchemy `Session` model stores `key1`, `key2`, `appId` (permanent) and `xxid`, `smod`, `session_key`, `nonce_generator` (ephemeral)
- `sync/session.py` calls S40 key exchange (`sfunc='i'`) to refresh the session
- No refresh token mechanism — resurrection is done via S40 with stored device keys
- See [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) for the full resurrection flow

## Transaction History via WebView

Transaction history is NOT available as an encrypted API call. It is served via the WebView subdomain.

### WebView Session Establishment

Before accessing any WebView URL, a session must be established on the `faisamobilex-wv.mib.com.mv` subdomain (bytecode lines 452260-452274):

1. **Set three cookies programmatically** via `CookieManager.set()`:
   - `xxid` = `session.xxid` (from encrypted API)
   - `mbmodel` = `'IOS-1.0'` (hardcoded constant)
   - `mbnonce` = `generateNonce(session.nonceInput)` — same `_gen_nonce` function as API nonces
2. **POST keepAlive** to `https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive` — establishes `JSESSIONID`
3. **Access any WebView URL** with cookies shared via `sharedCookiesEnabled={true}`

**Python implementation**:
```python
wv_session = mib_client.setup_webview_session(xxid, nonce_generator)
data = mib_client.fetch_trx_history(wv_session, account_no, page=1)
```

The AJAX endpoint (`/ajaxAccounts/trxHistory`) returns JSON. The mock app renders this data as an inline HTML table below each account card in the dashboard. No WebView proxying or iframe is used.

### Transaction History URL

```
https://faisamobilex-wv.mib.com.mv/accountDetails?aiv=1&dashurl=1&accountNo=<no>#page=1&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=
```

Parameters: `accountNo` (account number), `page` (pagination), `sortTrx/sortDir` (sorting), `fromDate/toDate` (date range), `trxNo` (tx reference filter), `trxType` (type filter).

## Approval Workflow

The approval workflow spans both encrypted API (A47/A48/A49) and WebView:

### Step 1: Initiation (WebView Only)

**There is no encrypted API for creating pending approvals.** The user taps "Favara Transfer" in the `FavaraBottomSheet` (#13443), which navigates:

```
navigation.navigate('WEBVIEW', {path: '/transferIps/quick?dashurl=1', title: 'Favara Transfer'})
```

The WebView renders the MIB web app's transfer form. The web server handles:
- Form validation (account, amount, beneficiary)
- OTP submission within the WebView
- Creating the pending approval record

### Step 2: Discovery (A47 — Encrypted API)

The native app polls via **A47** (`useGetApprovals` hook, bytecode line 461483):

```json
POST /faisamobilex_smvc/?sfunc=n
Body: {"start": 0, "end": 20, "includeCount": true, "nonce": "...",
       "appId": "...", "sodium": "...", "routePath": "A47", "xxid": "..."}
```

Response includes per-approval records: `approvalId`, `fromAccount`, `toAccount`, `amount`, `transferType`, `checksum`, etc.

### Step 3: Detail View (WebView)

Tapping a pending approval opens:
```
/approvals/getApproval?approvalId=<id>&dashurl=1
```

### Step 4: Action (A49/A48 — Encrypted API with OTP)

Both require OTP. The `checksum` field is from the A47 response (pass-through, not client-computed).

**OTP enforcement:** Unlike login (where OTP can be skipped via `profileSelected`), OTP for approvals is **server‑mandated**. Bytecode analysis of #12204 (A48) and #12200 (A49) confirms zero conditional branches during payload construction — `otp` and `otpType` are unconditionally included in every encrypted payload. The server validates the OTP and there is no bypass path.

**Approve (A49)**:
```json
{"approvalId": "<id>", "checksum": "<from_A47>", "otp": "<OTP>",
 "otpType": "2", "approvalLevel": "<level>", "routePath": "A49", ...}
```

**Decline (A48)**:
```json
{"approvalId": "<id>", "checksum": "<from_A47>", "comment": "<reason>",
 "otp": "<OTP>", "otpType": "2", "approvalLevel": "<level>", "routePath": "A48", ...}
```

## Transfer Initiation (WebView Only)

**There is no encrypted API for initiating transfers.** The entire transfer flow is the MIB web application inside the app's WebView:

```
User taps "Favara Transfer"
  ↓
FavaraBottomSheet → handleServicePress → navigate('WEBVIEW', {path: '/transferIps/quick?dashurl=1'})
  ↓
WebView loads https://faisamobilex-wv.mib.com.mv/transferIps/quick?dashurl=1
(with shared cookies: xxid, mbmodel, mbnonce, JSESSIONID)
  ↓
MIB web app renders transfer form (fromAccount, toAccount, amount, remarks)
  ↓
Form submission → optional OTP within WebView → pending approval created on server
  ↓
Native app discovers pending via A47 polling
```

## Sequence Diagram

```
User              Flask App                         MIB Server
 │                    │                                │
 │  POST /api/login   │                                │
 │  {user, pass}      │                                │
 │───────────────────>│                                │
 │                    │  generate_fingerprints()       │
 │                    │  app_id = IOS17.2-<random>    │
 │                    │                                │
 │                    │  ── Device Registration ──     │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  ?sfunc=r                      │
 │                    │  JSON {"data":"<enc_blob>"}    │
 │                    │  (envelope: {sfunc:r,          │
 │                    │   data:{cmod,...}} w/ DFLT_KEY)│
 │                    │───────────────────────────────>│
 │                    │  {key1, key2, smod, appId,     │
 │                    │   xxid, nonceGenerator?}       │
 │                    │<───────────────────────────────│
 │                    │                                │
 │                    │  session_key = f(smod)         │
 │                    │                                │
 │                    │  ── S40 (if needed) ──         │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  ?sfunc=i&key2=<key2>          │
 │                    │  JSON {"data":"<enc_blob>"}    │
 │                    │  (envelope: {sfunc:i,key2,     │
 │                    │   data:{cmod,...}} w/ key1)    │
 │                    │───────────────────────────────>│
 │                    │  {smod, xxid, nonceGenerator}  │
 │                    │<───────────────────────────────│
 │                    │                                │
 │                    │  session_key = f(smod)         │
 │                    │                                │
 │                    │  ── A44: Get Auth Type ──      │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  (sfunc=n, routePath=A44)      │
 │                    │───────────────────────────────>│
 │                    │  {success, reasonText, ...}    │
 │                    │<───────────────────────────────│
 │                    │                                │
 │                    │  ── A40: Submit Credentials ── │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  (sfunc=n, routePath=A40)      │
 │                    │───────────────────────────────>│
 │                    │  {success/414/407, ...}        │
 │                    │<───────────────────────────────│
 │                    │                                │
 │  {status:          │                                │
 │   "otp_required"   │                                │
 │   or "success"}    │                                │
 │<───────────────────│                                │
 │                    │                                │
 │  [If OTP]          │                                │
 │  POST /api/otp     │                                │
 │  {otp: "123456"}   │                                │
 │───────────────────>│                                │
 │                    │  ── C42: Verify OTP ──         │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  (sfunc=n, routePath=C42)      │
 │                    │───────────────────────────────>│
 │                    │  {success, data.accounts?}    │
 │                    │<───────────────────────────────│
 │                    │                                │
 │                    │  ── A80: Get Accounts ──       │
 │                    │  POST /faisamobilex_smvc/      │
 │                    │  (sfunc=n, routePath=A80)      │
 │                    │───────────────────────────────>│
 │                    │  {success, data.accounts}     │
 │                    │<───────────────────────────────│
 │                    │                                │
 │  {status:          │                                │
 │   "success",       │                                │
 │   accounts: [...]} │                                │
 │<───────────────────│                                │
```
