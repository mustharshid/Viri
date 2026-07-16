# API Endpoints Reference

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Overview](#overview)
- [Base URL & Headers](#base-url--headers)
- [sfunc Values](#sfunc-values)
- [Endpoints Table](#endpoints-table)
- [Device Registration (sfunc='r')](#device-registration-sfuncr)
- [Session Init / S40 (sfunc='i')](#session-init--s40-sfunci)
- [Normal Operations (sfunc='n')](#normal-operations-sfuncn)
- [WebView Endpoints (Non-Encrypted)](#webview-endpoints-non-encrypted)
- [Error Codes](#error-codes)
- [Encoding Conventions](#encoding-conventions)

## Overview

The MIB FaisaMobile X API is a REST-style API that uses a single endpoint with an `sfunc` (session function) parameter to route requests. All sensitive payloads are encrypted with Blowfish/ECB/PKCS5.

The API is divided into three sfunc modes:

- **`sfunc='r'`** — Device registration (bootstraps device keys)
- **`sfunc='i'`** — Key exchange / session init
- **`sfunc='n'`** — Normal operations (authenticated requests)

**Note:** These three values (`r`, `i`, `n`) are the **complete** sfunc universe. No other sfunc values exist in the bytecode. The aggregator's previous `Sfunc` class with `LOGIN`, `GET_ACCOUNTS`, etc. was speculative and incorrect.

**Endpoint grouping by category:**

| Category | Endpoints (routePath) |
|----------|----------------------|
| Authentication (7) | A40, A41, A44, A47, A48, A49, A80 |
| OTP/Challenge (4) | C40, C41, C42, C43 |
| Profile (6) | P40†, P41, P42†, P45†, P46†, P47 |
| Session (4) | S40 (`r`/`i`), S43†, S44† |
| Banking (1) | B44† |
| Info (2) | L40 (`i`), P80 (`i`) |

† `DOCUMENTATION_ONLY` — confirmed in bytecode, no step function implemented.

## Base URL & Headers

```
https://faisanet.mib.com.mv/faisamobilex_smvc/
```

**HTTP headers** sent by the real app (bytecode line 361561):
```
Content-Type: application/x-www-form-urlencoded; charset=utf-8
User-Agent: android/1.0
```

No custom `X-Device-ID`, `X-Client-Version`, `Authorization`, `Accept-Encoding`, or `Accept-Language` headers are sent. The mock app additionally sends `accept: application/json` which is harmless.

There is no path-based routing — all API requests go to the same URL differentiated by the `sfunc` parameter.

## sfunc Values

| sfunc | Name | Description |
|-------|------|-------------|
| `'r'` | Register | Device registration (first-launch bootstrap) |
| `'i'` | Init | Key exchange / session initialisation |
| `'n'` | Normal | Authenticated operations (routePath specifies the endpoint) |

## Endpoints Table

| sfunc | routePath | Name | Description | Encryption Key | Auth Required |
|-------|-----------|------|-------------|----------------|---------------|
| `'r'` | S40 | Device Registration | Register device, get key1/key2 | DEFAULT_KEY | No |
| `'i'` | S40 | Session Init | DH key exchange, get smod | key1 | No |
| `'n'` | A44 | getRegularAuthType | Check auth method | session_key | Yes |
| `'n'` | A40 | Login with Password | Submit credentials (plaintext) | session_key | Yes |
| `'n'` | A41 | Salted/Biometric Login | Submit salted hash (biometric/PIN) | session_key | Yes |
| `'n'` | C40 | Change PIN/Password | Submit new PIN or password | session_key | Yes |
| `'n'` | C41 | Salted Change Step | Salted variant of PIN change | session_key | Yes |
| `'n'` | C42 | OTP Verification | Verify OTP code | session_key | Yes |
| `'n'` | C43 | Resend OTP | Resend OTP code | session_key | Yes |
| `'n'` | A80 | Get Accounts | Fetch account list | session_key | Yes |
| `'n'` | A47 | Get Approvals | List pending approvals (paginated) | session_key | Yes |
| `'n'` | A48 | Decline Approval | Decline a pending approval (needs OTP) | session_key | Yes |
| `'n'` | A49 | Approve Approval | Approve a pending approval (needs OTP) | session_key | Yes |
| `'n'` | P41 | Get Profile Image | Get user profile image | session_key | Yes |
| `'n'` | P47 | Select Profile | Switch user profile | session_key | Yes |
| `'i'` | L40 | Get Locations | Get ATM/branch locations | key1 | No |
| `'i'` | P80 | Get Promos | Get promotional offers | key1 | No |
| `'n'` | B44 | Banking (DOCUMENTATION_ONLY) | Banking operations — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | P40 | Profile (DOCUMENTATION_ONLY) | Profile operations — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | P42 | Profile (DOCUMENTATION_ONLY) | Profile image upload/delete — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | P45 | Profile (DOCUMENTATION_ONLY) | Profile operations — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | P46 | Profile (DOCUMENTATION_ONLY) | Profile operations — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | S43 | Session (DOCUMENTATION_ONLY) | Session refresh/status — confirmed in bytecode, not implemented | session_key | Yes |
| `'n'` | S44 | Session (DOCUMENTATION_ONLY) | Session refresh/status — confirmed in bytecode, not implemented | session_key | Yes |

**Note:** Endpoints marked `DOCUMENTATION_ONLY` are confirmed in the bytecode payload/function analysis but have no `step_*()` implementation in `mib_client.py` or route in `app.py`. They are catalogued here for completeness.

## Device Registration (sfunc='r')

**Description**: Called on first launch (no stored key1/key2). The server assigns key1, key2, appId, xxid, and smod which must be persisted and used for all subsequent requests.

**HTTP Method**: POST

**Content-Type**: `application/json`

**Request**:

| Field | Value |
|-------|-------|
| URL | `https://faisanet.mib.com.mv/faisamobilex_smvc/?sfunc=r` |
| Body | `{"data": "<URI_ENCODED_CIPHERTEXT>"}` |
| Encryption Key | `DEFAULT_KEY` (`8M3L9SBF1AC4FRE56788M3L9SBF1AC4FRE5678`) |

**Outer Envelope (what gets encrypted — bytecode `encryptAndEncode` format)**:

The full outer envelope is JSON-stringified, encrypted with `DEFAULT_KEY`, then URI-encoded:

```json
{
    "sfunc": "r",
    "data": {
        "cmod": "<DH public value: G^A mod P>",
        "appId": "IOS17.2-<15_random_alphanumeric>",
        "routePath": "S40",
        "sodium": "<20_random_bytes_as_decimal_string>",
        "xxid": "<40_random_bytes_as_decimal_string>"
    }
}
```

**Encryption flow**:
1. `outer = {"sfunc": "r", "data": inner}`
2. `plaintext = JSON.stringify(outer)` — no spaces (`separators=(',',':')`)
3. `ciphertext = Blowfish/ECB/PKCS5(plaintext, DEFAULT_KEY)`
4. `uriEncoded = encodeURIComponent(base64(ciphertext))`
5. `httpBody = {"data": uriEncoded}`
6. `POST /faisamobilex_smvc/?sfunc=r` with `Content-Type: application/json`

**Response (encrypted with DEFAULT_KEY)**:

```json
{
    "success": true,
    "key1": "<device_key_1>",
    "key2": "<device_key_2>",
    "appId": "<assigned_app_id>",
    "xxid": "<assigned_xxid>",
    "smod": "<server_DH_public_value>",
    "nonceGenerator": "<nonce_seed_string (may be absent)>"
}
```

**Key Derivation from Response**:

```python
session_key = compute_blowfish_key(smod)  # pow(smod, A, P) → SHA-256 → base64
```

**Notes**:
- The `sfunc` is **inside** the encrypted envelope as well as in the URL — this is the bytecode-verified format. Previously thought to be form-urlencoded (`data=<ciphertext>`), but the server expects the JSON envelope format.
- Uses `DEFAULT_KEY` as the encryption key
- The nonceGenerator may be absent in the registration response; if so, S40 must be called separately

## Session Init / S40 (sfunc='i')

**Description**: DH key exchange to establish session key. Should be called if registration didn't return a nonceGenerator, or if the session has expired.

**HTTP Method**: POST

**Content-Type**: `application/json`

**Request**:

| Field | Value |
|-------|-------|
| URL | `https://faisanet.mib.com.mv/faisamobilex_smvc/?sfunc=i&key2=<key2>` |
| Body | `{"data": "<URI_ENCODED_CIPHERTEXT>"}` |
| Encryption Key | key1 (from registration) |

**Outer Envelope (what gets encrypted)**:

```json
{
    "sfunc": "i",
    "key2": "<key2>",
    "data": {
        "cmod": "<DH public value: G^A mod P>",
        "appId": "<app_id>",
        "routePath": "S40",
        "sodium": "<20_random_bytes_as_decimal_string>",
        "xxid": "<40_random_bytes_as_decimal_string>"
    }
}
```

**Encryption flow**: Same as registration — `encryptAndEncode(outer, key1)` → URI-encode → `{"data": ...}` JSON POST.

**Notes**:
- `key2` appears **both** inside the encrypted envelope (bytecode requirement) and as a URL query parameter (belt-and-suspenders — helps the server find the right `key1` for decryption without iterating through all known keys).
- Uses `key1` (from registration) as the encryption key.

**Response (encrypted with key1)**:

```json
{
    "success": true,
    "smod": "<server_DH_public_value>",
    "xxid": "<assigned_xxid>",
    "nonceGenerator": "<nonce_seed_string>"
}
```

## Normal Operations (sfunc='n')

All authenticated requests use `sfunc='n'` and differentiate by `routePath`. The flow is:

1. Generate nonce from nonceGenerator (`_gen_nonce`)
2. Build inner payload with routePath, nonce, appId, sodium, xxid
3. Encrypt with session_key
4. POST with `sfunc=n`

**Standard HTTP Request**:

```
POST /faisamobilex_smvc/?sfunc=n
Content-Type: application/x-www-form-urlencoded

xxid=<xxid>&data=<URL_ENCODED_BASE64_CIPHERTEXT>
```

### A44 — Get Regular Auth Type

**routePath**: `A44`

**Purpose**: Check if the username exists and determine authentication method.

**Inner Payload**:

```json
{
    "uname": "<username>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A44",
    "xxid": "<xxid>"
}
```

**Response (success)**:

```json
{
    "success": true,
    "reasonCode": "108",
    "reasonText": "Auth type retrieved!",
    "data": [
        {
            "loginType": "1",
            "userSalt": "<server_assigned_salt_string>"
        }
    ]
}
```

- `data[0].userSalt` — Server-assigned salt for A41 salted authentication. Required when using `routePath: "A41"`.
- `data[0].loginType` — Authentication type indicator. `"1"` observed in testing; meaning not fully confirmed.

If the account is blocked or invalid:
```json
{
    "success": false,
    "reasonCode": "402",
    "reasonText": "User is blocked. Please contact call center"
}
```

### A40 — Login with Password (Plaintext) — Default Path

**routePath**: `A40`

**Purpose**: Submit username and plaintext password for authentication.

> **Aggregator note**: A40 is the **default login path** for the aggregator. When the server permits it, A40 returns `success: true` without OTP (`reasonCode: "104"`), enabling unattended login — the core "set and forget" requirement. The aggregator's security is provided by the permanent device keys (key1/key2), not OTP. If the server explicitly requires OTP (reasonCode `414`/`415`), the aggregator handles it transparently via C42.

**Inner Payload**:

```json
{
    "uname": "<username>",
    "pgf02": "<password (plaintext)>",
    "pmodTime": 0,
    "requireBankData": 0,
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A40",
    "xxid": "<xxid>"
}
```

**Response (success, OTP required)**:

```json
{
    "success": false,
    "reasonCode": "414",
    "reasonText": "OTP verification required"
}
```

**Response (success, immediate login)**:

```json
{
    "success": true,
    "data": {
        "accounts": [...]
    }
}
```

**Response (invalid)**:

```json
{
    "success": false,
    "reasonCode": "407",
    "reasonText": "Invalid credentials"
}
```

### A41 — Login (Primary Real App Endpoint)

**routePath**: `A41`

**Purpose**: Submit credentials for regular login. The password is never sent in plaintext — `pgf03` is a salted hash computed from the password and the `userSalt` returned by A44.

**This is the real login endpoint** used by the official MIB app. A40 (plaintext password) is a legacy/deprecated endpoint. In the aggregator, A41 is available as a **testing/manual path** (selected via the login form's radio button). The aggregator defaults to A40 for seamless operation, but A41 is the correct production endpoint.

**Discovered at**: Bytecode line 446008 (`regularSaltedAuthenticate`)

**Inner Payload**:

```json
{
    "uname": "<username>",
    "pgf03": "<salted_password_hash>",
    "clientSalt": "<client_generated_salt_hex>",
    "pmodTime": 0,
    "requireBankData": 1,
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<random_int_in_[1000000_16000000)>",
    "routePath": "A41",
    "xxid": "<xxid>"
}
```

**Response (success, OTP required)**:

```json
{
    "success": true,
    "reasonCode": "104",
    "primaryOTPType": "3",
    "otpTypes": [2, 3],
    "email": "<masked_email>",
    "uuid": "<uuid>",
    "operatingProfiles": [...],
    "accountBalance": []
}
```

The `primaryOTPType` and `otpTypes` fields signal that OTP verification is required via A42, even though `success: true`.

**Response (single-profile fast-path)** — if the account has exactly one operating profile, the server returns `profileSelected: true` and includes a non-empty `accountBalance` array directly in the A41 response, skipping the P47 call.

**Notes**:
- `pgf03` = `SHA-256(clientSalt + SHA-256(SHA-256(password).upper() + userSalt).upper()).upper()`
- `clientSalt` is a fresh random 32-character hex string per request, matching the `salt_rand` used inside the pgf03 computation
- A41 requires a `userSalt` from the A44 response (`data[0].userSalt`). If A44 does not include it, A41 is unavailable.
- **Mock app implementation**: `mib_client.py:step_a41()` (line 630)
- **Hash-based variant**: `mib_client.py:step_a41_with_hash()` accepts a pre-computed `SHA-256(password).upper()` hash instead of the raw password. Used for automated session restoration in `_authenticate_with_hash()`.
- OTP is verified via **C42** (A42 is confirmed absent from the bytecode; see Archived A42 section below)
- `requireBankData: 1` tells the server to return account data inline (single-profile fast-path)

### Archived: A42 — OTP Verification (Login — Confirmed Absent)

**routePath**: `A42` (hypothesised, confirmed absent)

**Purpose**: Initially believed to verify OTP code during regular login. The automated bytecode analysis (14,959 functions, 29,891 strings) found zero references to `"A42"` as a routePath, payload field, or function name — it does not exist.

**Important**: Login OTP verification must use **C42** instead (see below). The server's A41 response may include accounts directly when `profileSelected: true` and `accountBalance` is non-empty (skipping OTP entirely). The mock app previously routed to A42 when the user selected "A41" on the login form, but both paths now use C42.

**Implementation**: `mib_client.py:step_a42()` (line 716) — retained for backward compatibility, routes to C42 at the API level.

---

### C40 — Change PIN/Password

**routePath**: `C40`

**Purpose**: Submit a new PIN or password.

**Discovered at**: Bytecode line 445442

**Inner Payload**:

```json
{
    "uname": "<username>",
    "pgf02": "<new_password_plaintext>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "C40",
    "xxid": "<xxid>"
}
```

### C41 — Salted Change Step

**routePath**: `C41`

**Purpose**: Salted variant of PIN/password change.

**Discovered at**: Bytecode line 445574

**Inner Payload**:

```json
{
    "uname": "<username>",
    "pgf03": "<salted_new_password>",
    "clientSalt": "<client_salt>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "C41",
    "xxid": "<xxid>"
}
```

### C42 — OTP Verification

**routePath**: `C42`

**Purpose**: Verify the one-time password sent to the user's registered device.

**Inner Payload**:

```json
{
    "otp": "<OTP_code>",
    "uname": "<username>",
    "otpType": "2",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "C42",
    "xxid": "<xxid>"
}
```

**Response (success)**:

```json
{
    "success": true,
    "data": {
        "accounts": [...]
    }
}
```

**Notes**:
- `otpType` = `'2'` — SMS OTP. `otpType` = `'3'` — TOTP (requires seed). C42 is the **only** OTP verification endpoint in the bytecode.
- OTP is 6 digits (bytecode line 424538: `numberOfDigits: 6`)
- The app uses `react-native-otp-verify` for automatic SMS detection
- The response may include account data directly

> **Server-side PHP bug (SMS OTP):** C42 with `otpType: "2"` triggers a PHP error at `IndexController.php:423` (`Undefined index: decodedbody`). This is a server-side bug, not fixable from the client. `otpType: "3"` (TOTP) works but requires a TOTP seed not available to the aggregator. As a result, OTP verification via SMS is effectively broken. The aggregator handles this by treating C42 failures as non-fatal and falling back to direct A80 account fetching.
>
> **`primaryOTPType` and `otpTypes` are informational** — they list available OTP methods from the server but do not mandate which must be used. The bytecode shows that `primaryOTPType !== "2"` skips the SMS-OTP handler entirely (#11268/#14705 at offset 37), and `profileSelected: true` + non-empty `accountBalance` gates OTP skip in #11796 (offset 642). The aggregator correctly uses these signals.

### C43 — Resend OTP

**routePath**: `C43`

**Purpose**: Request a new OTP to be sent.

**Inner Payload**:

```json
{
    "uname": "<username>",
    "otpType": "2",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "C43",
    "xxid": "<xxid>"
}
```

**Response**:

```json
{
    "success": true,
    "reasonText": "OTP resent"
}
```

### A80 — Get Accounts

**routePath**: `A80`

**Purpose**: Retrieve the list of accounts and balances for the authenticated user.

**Inner Payload**:

```json
{
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A80",
    "xxid": "<xxid>"
}
```

**Response**:

```json
{
    "success": true,
    "data": {
        "accounts": [
            {
                "accountNumber": "7701001000458",
                "availableBalance": "1234.56",
                "currencyName": "MVR",
                "accountTypeName": "Savings Account",
                "accountBriefName": "MIB Savings"
            }
        ]
    }
}
```

**Notes**:
- No `routePath` field in the inner payload for A80 (unlike A44/A40/C42)
- No pagination — all accounts returned in a single array
- Verified from AccountCard component (bytecode #13087, line 494151)

### A47 — Get Approvals (Pending Transactions)

**routePath**: `A47`

**Purpose**: Fetch a paginated list of pending approvals (transactions awaiting secondary authorization).

**Discovered at**: Bytecode line 461697

**Inner Payload**:

```json
{
    "start": "<start_index>",
    "end": "<end_index>",
    "includeCount": "<bool>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A47",
    "xxid": "<xxid>"
}
```

**Response (per approval record)**:

```json
{
    "approvalId": "<id>",
    "checksum": "<server_generated_checksum>",
    "fromAccount": "<source_account>",
    "toAccount": "<destination_account>",
    "amount": "<amount>",
    "transferType": "<type>",
    "...": "..."
}
```

**Notes**:
- `checksum` is a field **returned by the server** in the A47 response. It is NOT computed by the client. The app reads `approval.checksum` and passes it unchanged to A48/A49 (bytecode lines 542781-542784, 561025-561029).
- Paginated: controlled by `start`/`end` indices and `includeCount` flag.

### A48 — Decline Approval

**routePath**: `A48`

**Purpose**: Decline a pending approval transaction. Requires OTP confirmation.

**Discovered at**: Bytecode line 461953

**Inner Payload**:

```json
{
    "approvalId": "<approval_id>",
    "checksum": "<server_generated_checksum_from_A47>",
    "comment": "<rejection_reason>",
    "otp": "<OTP_code>",
    "otpType": "2",
    "approvalLevel": "<level>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A48",
    "xxid": "<xxid>"
}
```

**Notes**:
- `checksum` is the value returned by A47 — the client passes it through without modification.
- `comment` is required for decline but not for approve.
- **OTP is server‑mandated.** `otp` and `otpType` are unconditionally included in every encrypted payload (bytecode‑confirmed: zero conditional branches during construction at function #12204). The server validates the OTP before processing the decline. Unlike login OTP (which can be skipped via `profileSelected`), approval OTP cannot be bypassed.

### A49 — Approve Approval

**routePath**: `A49`

**Purpose**: Approve a pending approval transaction. Requires OTP confirmation.

**Discovered at**: Bytecode line 461836

**Inner Payload**:

```json
{
    "approvalId": "<approval_id>",
    "checksum": "<server_generated_checksum_from_A47>",
    "otp": "<OTP_code>",
    "otpType": "2",
    "approvalLevel": "<level>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "A49",
    "xxid": "<xxid>"
}
```

**Notes**:
- `checksum` is the value returned by A47 — the client passes it through without modification.
- **OTP is server‑mandated.** `otp` and `otpType` are unconditionally included in every encrypted payload (bytecode‑confirmed: zero conditional branches during construction at function #12200). Unlike login OTP, approval OTP cannot be bypassed.

### P41 — Get Profile Image

**routePath**: `P41`

**Purpose**: Fetch the authenticated user's profile image.

**Discovered at**: Bytecode (in the `deleteProfileImage`/`getImage`/`updateImage` module at line 360950)

**Inner Payload**:

```json
{
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "P41",
    "xxid": "<xxid>"
}
```

**Notes**:
- Response contains image data (base64-encoded or binary)
- Used by the `getImage` function in the profile module (#9642)

### P47 — Select Profile

**routePath**: `P47`

**Purpose**: Switch the active user profile (e.g., personal vs. business). Profiles scope which accounts and services are visible.

**Discovered at**: Bytecode function #13496 (line 507900), `selectProfile` #13497 (line 507963)

**Inner Payload**:

```json
{
    "profileType": "<profile_type>",
    "profileId": "<profile_id>",
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "routePath": "P47",
    "xxid": "<xxid>"
}
```

**Profile System Details**:

| Function | Bytecode Line | Description |
|----------|---------------|-------------|
| `ownProfile` | #10223 (382381) | Finds profile with `profileType === '0'` (personal) |
| `selectedP` | #10225 (382412) | Finds profile matching `selectedProfileId` |
| `selectProfile` | #10230 (382493) | Sets selected profile in state |
| `loadProfiles` | #10241 (382751) | Async profile list loader |
| `clearSelectedProfile` | #10228 (382463) | Resets profile to null |
| `clearAllProfiles` | #10229 (382477) | Clears all profiles |

**Profile fields**: `profileId`, `profileType` (`'0'` = primary/own), `services`, `selectedProfileData`.

### L40 — Get Locations

**routePath**: `L40`

**Purpose**: Fetch ATM/branch locations.

**Discovered at**: Bytecode line 524525. Uses `sfunc='i'` (not `'n'`), encrypted with `key1`.

**Inner Payload**:

```json
{
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "xxid": "<xxid>"
}
```

### P80 — Get Promos

**routePath**: `P80`

**Purpose**: Fetch promotional offers.

**Discovered at**: Bytecode line 493645. Uses `sfunc='i'` (not `'n'`), encrypted with `key1`.

**Inner Payload**:

```json
{
    "nonce": "<generated_nonce>",
    "appId": "<app_id>",
    "sodium": "<20_random_bytes_as_decimal_string>",
    "updateId": "<update_tracking_id>",
    "xxid": "<xxid>"
}
```

### B44 — Banking (DOCUMENTATION_ONLY)

**routePath**: `B44`

**Purpose**: Banking operations. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### P40 — Profile (DOCUMENTATION_ONLY)

**routePath**: `P40`

**Purpose**: Profile operations. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### P42 — Profile Image Upload/Delete (DOCUMENTATION_ONLY)

**routePath**: `P42`

**Purpose**: Profile image upload/delete operations. Shares the profile image module at bytecode ~line 360950 with P41 (get image).

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction). Uses the same `deleteProfileImage`/`getImage`/`updateImage` module as P41.

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### P45 — Profile (DOCUMENTATION_ONLY)

**routePath**: `P45`

**Purpose**: Profile operations. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### P46 — Profile (DOCUMENTATION_ONLY)

**routePath**: `P46`

**Purpose**: Profile operations. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### S43 — Session (DOCUMENTATION_ONLY)

**routePath**: `S43`

**Purpose**: Session refresh or status check. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

### S44 — Session (DOCUMENTATION_ONLY)

**routePath**: `S44`

**Purpose**: Session refresh or status check. Confirmed in bytecode; payload structure not yet documented.

**Discovered at**: Automated bytecode analysis (Phase 5 — endpoint extraction).

**Status**: `DOCUMENTATION_ONLY` — no step function implemented.

## WebView Session Establishment

Before accessing WebView endpoints, the app must establish a session on the `faisamobilex-wv.mib.com.mv` subdomain. This is done by programmatically setting three cookies via `@react-native-community/cookies` `CookieManager.set()` (bytecode lines 452154-452290):

| Cookie | Value | Source |
|--------|-------|--------|
| `xxid` | `session.xxid` | From encrypted API session (same xxid used for sfunc='n' requests) |
| `mbmodel` | `'IOS-1.0'` | Hardcoded constant |
| `mbnonce` | `generateNonce(session.nonceInput)` | Generated from `nonceGenerator` (same `_gen_nonce` function used for API nonces) |

All cookies are set with `path: '/'`, `domain: '.mib.com.mv'`, `secure: true`. Then the WebView loads with `sharedCookiesEnabled={true}` (React Native WebView prop) so it shares the native app's cookie jar.

### keepAlive

The app runs a periodic POST to keep the WebView session alive (bytecode lines 361480-361508):

```
POST https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive
```

This establishes and refreshes the `JSESSIONID` cookie.

### switchTheme

On load, the app also POSTs the current theme:

```
POST https://faisamobilex-wv.mib.com.mv/aProfile/switchTheme
Body: theme=<theme_value>
```

### Replication in Python

The entire WebView session is replicable with Python's `requests.Session()`:

```python
import requests
from mib_client import _gen_nonce

session = requests.Session()
session.cookies.set('xxid', xxid, domain='.mib.com.mv', path='/', secure=True)
session.cookies.set('mbmodel', 'IOS-1.0', domain='.mib.com.mv', path='/', secure=True)
session.cookies.set('mbnonce', _gen_nonce(nonce_generator),
                    domain='.mib.com.mv', path='/', secure=True)
# Establish JSESSIONID
session.post('https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive')
# Now access any WebView URL
resp = session.get('https://faisamobilex-wv.mib.com.mv/accountDetails?...')
```

**Note:** `mbnonce` uses the exact same `generateNonce` function (Function #10141 at bytecode line 378746) as the encrypted API nonces. The `nonceInput` is just `session.nonceGenerator` stored on the session object (bytecode lines 444666-444667, 444902-444903).

## WebView Endpoints (Non-Encrypted)

Some features are rendered via an in-app WebView rather than encrypted API calls. These use URLs on a separate subdomain. The WebView base URL is configured in the bytecode at line 378005:

```javascript
{
  'backend': 'https://faisanet.mib.com.mv/faisamobilex_smvc/',
  'webViewUrl': 'https://faisamobilex-wv.mib.com.mv',
  'webViewBasePath': '/'
}
```

### Transaction History

**Does NOT exist as an encrypted API call.** Transaction history is served via WebView at:

```
https://faisamobilex-wv.mib.com.mv/accountDetails?aiv=1&dashurl=1&accountNo=<accountNo>#page=1&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=
```

(Discovered at bytecode lines 494746-494775)

An alternate format uses `trxh=1` instead of `aiv=1`:
```
https://faisamobilex-wv.mib.com.mv/accountDetails?trxh=1&dashurl=1&accountNo=<accountNo>
```

**Parameters**:
| Parameter | Description |
|-----------|-------------|
| `accountNo` | Account number |
| `page` | Page number for pagination |
| `trxNo` | Transaction number filter |
| `trxType` | Transaction type filter |
| `sortTrx` | Sort field (`date`) |
| `sortDir` | Sort direction (`desc` or `asc`) |
| `fromDate` | Start date filter |
| `toDate` | End date filter |

### Complete WebView URL Catalog

All WebView paths discovered in the bytecode:

| Path | Purpose | Bytecode Location |
|------|---------|-------------------|
| `/accountDetails?aiv=1&dashurl=1&accountNo=` | Transaction history (primary) | 494746 |
| `/accountDetails?trxh=1&dashurl=1&accountNo=` | Transaction history (alt format) | 494774 / 543361 |
| `/transferIps/quick?dashurl=1` | **Favara Transfer initiation** | 504589 |
| `/transferIps/quick?dashurl=1#:~:text=...` | Favara Transfer (with text anchor) | 505618 |
| `/transferIps/req2pay?dashurl=1` | Favara Request (request money) | 505620 |
| `/favara/transfer` | Favara Transfer (legacy path) | 504203 |
| `/favara/request` | Favara Request (legacy path) | 504205 |
| `/favara/id` | Favara ID management | 504207 |
| `/Alias/Alias?dashurl=1#...` | Favara ID alias management | 505622 |
| `IPSTransferDetails?dashurl=1#...` | IPS transfer history | 505624 |
| `/IPSPayRequests/outgoing?dashurl=1#...` | Outgoing payment requests | 505626 |
| `/IPSPayRequests/incoming?dashurl=1#...` | Incoming payment requests | 505628 |
| `/IPSPayRequests/inrecall?dashurl=1#...` | Incoming recall requests | 505630 |
| `/approvals?dashurl=1` | Approvals list | 504601 |
| `/approvals/getApproval?approvalId=` | Approval detail view | 461081 |
| `/activityHistory?dashurl=1` | Activity history | 504773 |
| `/financing?dashurl=1` | Financing services | 504580 |
| `/debitCards?dashurl=1` | Card management | 504585 |
| `/cheques?dashurl=1` | Cheque services | 504593 |
| `/beneficiary?dashurl=1` | Beneficiary management | 504597 |
| `/bulkTransfers?dashurl=1` | Bulk transfers | 543535 |
| `/charity/pay?rt=Fitr%20Zakat&campaignId=1&dashurl=1` | Charity / Zakat payment | 508246 |
| `/notifications?dashurl=1` | Notifications | 521399 |
| `/terms?dashurl=1` | Terms & conditions | 443232 |
| `/terms?dashurl=1#privacy` | Privacy policy | 534109 |
| `/aProfile/keepAlive` | Session keep-alive POST | 361492 |
| `/aProfile/switchTheme` | Theme switch POST | 361397 |

**Note on transfer initiation:** The transfer form, field validation, and OTP submission are handled entirely by the MIB web application inside the WebView. The native app does not make encrypted API calls for creating pending approvals. See `FLOW.md` for the complete approval workflow. A pending approval is created when the WebView form is submitted; the native app discovers it via A47 polling.

## Error Codes

| Code | Meaning | Description | Retry? | Bank Contact? |
|------|---------|-------------|--------|---------------|
| 101 | Cipher Key Not Found | Session key invalid or expired. Re-run S40 key exchange | Yes — re-key | No |
| 402 | User Blocked | Account has been blocked. User must contact call center or log in on the real app to reset | No | **Yes** |
| 407 | Invalid Credentials | Username or password incorrect | Retry with correct credentials | No (repeated -> 402) |
| 414 | OTP Required | Credentials accepted but OTP verification is needed | Yes — proceed to C42 | No |
| 415 | OTP Required (alt) | Alternative OTP-required code | Yes — proceed to C42 | No |
| 501 | Invalid Data | Request payload malformed or nonce was rejected | Investigate nonce generation | No |

**These six codes (101, 402, 407, 414, 415, 501) are the complete set of MIB API error codes.** No 420, 511, 403, 404, 500, or 503 codes exist in the API protocol.

### Client-Side Crypto Errors

| Error | Source | Context |
|-------|--------|---------|
| "Invalid byte array string" | decryptBlowfish | Base64 input not valid |
| "Invalid decoded data" | decryptBlowfish | Empty decryption output |
| "Unknown Error" | parseApiResponse | No `data` field in response |
| "An error occurred" | parseApiResponse | Fallback when `success=false` with no reasonText |
| "Failed to process server response" | parseApiResponse | Invalid JSON or corrupt data |

## Encoding Conventions

### JSON Envelope (sfunc='r' and sfunc='i') vs Form-URL-encoded (sfunc='n')

The API uses two different HTTP transport formats depending on the sfunc:

**sfunc='r' (device registration) and sfunc='i' (key exchange)**:

Both use the JSON envelope format (bytecode-verified `encryptAndEncode`):

```
POST /faisamobilex_smvc/?sfunc=r
Content-Type: application/json

{"data": "<URI_ENCODED_CIPHERTEXT>"}
```

The ciphertext is the full outer envelope `{sfunc, key2?, data: inner}` blowfish-encrypted, base64'd, then URI-encoded.

For sfunc='i', `key2=<key2>` is also added as a URL query parameter.

**sfunc='n' (normal operations)**:

```
POST /faisamobilex_smvc/?sfunc=n
Content-Type: application/x-www-form-urlencoded

xxid=<xxid>&data=<url_encode(base64(ciphertext))>
```
- `sfunc` in URL query string
- `xxid` and `data` in form-encoded body
- The ciphertext is just the inner payload (no sfunc wrapper) encrypted with session_key

### Encryption Flow

```
sfunc='r'/'i' (JSON envelope):
  outer = {sfunc, key2?, data: inner}
  → JSON.stringify(outer, separators=(',',':'))
  → UTF-8 bytes → PKCS5 pad → Blowfish/ECB encrypt
  → base64 encode → encodeURIComponent
  → HTTP body: {"data": "<result>"}
  → Content-Type: application/json

sfunc='n' (form-urlencoded):
  inner = {uname, pgf02, nonce, ...}
  → JSON.stringify(inner, separators=(',',':'))
  → UTF-8 bytes → PKCS5 pad → Blowfish/ECB encrypt
  → base64 encode → requests.utils.quote (URL encode)
  → HTTP body: xxid=<xxid>&data=<result>
  → Content-Type: application/x-www-form-urlencoded

Decryption (all sfunc types):
  URL decode (if applicable) → base64 decode
  → Blowfish/ECB decrypt → PKCS5 unpad → UTF-8 bytes
  → JSON.parse → dict
```

### Logout

**Logout is client-side only — no server-side logout endpoint exists.** The app:
1. Confirms logout via PIN/biometric prompt
2. Calls the store's `logout` function to clear AsyncStorage
3. Resets `selectedProfile`, `user`, `pin`, `biometricsEnabled` state
4. The server session eventually expires naturally or on next request
