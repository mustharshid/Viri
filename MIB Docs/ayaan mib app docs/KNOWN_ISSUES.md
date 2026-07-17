# Known Issues & Future Work

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Current Status](#current-status)
- [Known Issues](#known-issues)
- [Missing Endpoints](#missing-endpoints)
- [Future Improvements](#future-improvements)
- [Cross-Reference](#cross-reference)

**Note**: Issues #3 (checksum server-sourced), #5 (transaction history via WebView), and #21 (registration format mismatch) have been resolved. See the detailed entries below.

## Current Status

- **Account (ayaanabdur)**: Active — the account was unblocked after login on the real MIB app and the full end-to-end flow has been verified: registration → S40 → A44 → A40 → A80 → dashboard with accounts and balances. Transaction history via WebView AJAX API is functional.
- **Aggregator**: The mock app implements a complete, verified client for the MIB FaisaMobile X API. All step functions use correct sfunc values (`r`, `i`, `n`) and routePath values (`A40`, `A41`, `A44`, `A80`, `C42`, `C43`, `P47`, etc.).
- **Session restoration**: Three-level chain implemented (A80 → S40 → re-registration + hash-based A41 auth). Password hash stored for seamless recovery after key expiry.
- **Pre-integration review**: A full architectural gap analysis was performed on 2026-07-13. See [`PRE_INTEGRATION_CONCERNS.md`](PRE_INTEGRATION_CONCERNS.md) for the complete report.

## Known Issues

### 1. 501 Invalid Data Error

**Symptom**: The server returns error code 501 ("Invalid data") for some requests.

**Suspected cause**: The nonce generator is producing a nonce that the server rejects. This could be:
- NonceGenerator format not fully understood (there may be multiple formats)
- The random factor range [1,99] needs verification against more examples
- Timing or sequence number issues (the server may track nonce usage)

**Status**: Under investigation. The nonce algorithm was extracted from a single bytecode trace and may have edge cases not yet tested.

### 2. rf Off-by-One Bug

**Issue**: The random factor `rf` in nonce generation was initially implemented with range `[1, 98]`:

```python
# Bug (old):
rf = secrets.randbelow(98) + 1  # Produces values 1-98

# Fixed:
rf = secrets.randbelow(99) + 1  # Produces values 1-99
```

**Impact**: Nonces generated with the old range `[1, 98]` would be incorrect, potentially causing 501 errors.

**Resolution**: Fixed in `mib_client.py:103`. Verified by comparing against the bytecode disassembly which uses `% 99` in the random function.

### 3. checksum Field — Server-Sourced (Resolved)

**Issue (resolved)**: The `checksum` field in A48/A49 approval action endpoints was initially unclear — it was unknown whether the client computed it or received it from the server.

**Finding**: Bytecode analysis confirmed that `checksum` is a **server-returned field** from the A47 (list approvals) response (bytecode lines 542781-542784, 561025-561029). The app reads `approval.checksum` and passes it unchanged to A48/A49. No hash/checksum computation exists on the client for this field.

**Status**: **RESOLVED** — No client-side implementation needed. The aggregator simply reads `checksum` from the A47 response and includes it in A48/A49 payloads.

### 4. Default Handler in Nonce Generator

**Issue**: The inner loop's `else` branch (for unknown operation letters) returns `0`:

```python
else:
    r = 0
```

This was verified in the bytecode — there is no exception thrown, just a silent return of 0. However, if the server introduces new operation types, the nonce generator would silently produce incorrect results.

**Impact**: If the app's bytecode is updated with new operations, the nonce generation would need to be updated correspondingly.

### 5. Transaction History is WebView-Based (Not an Encrypted API)

**Issue**: The transaction history does NOT exist as an encrypted API endpoint. The real app renders it via an in-app **WebView** at:
```
https://faisamobilex-wv.mib.com.mv/accountDetails?aiv=1&dashurl=1&accountNo={no}#page=1&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=
```
(Discovered at bytecode lines 494746-494775)

**Resolution**: The WebView session mechanism has been fully reversed (bytecode lines 452260-452274, 361480-361508):
- Three cookies are set programmatically: `xxid`, `mbmodel` (`'IOS-1.0'`), and `mbnonce` (= `generateNonce(nonceGenerator)`)
- The `mbnonce` generation uses the exact same `generateNonce` function (Function #10141) as the encrypted API nonces
- `nonceInput` is populated from the API response's `nonceGenerator` (bytecode lines 444666-444667)
- A keepAlive POST to `/aProfile/keepAlive` establishes `JSESSIONID`
- The WebView loads with `sharedCookiesEnabled={true}` sharing the native cookie jar

**Status**: **RESOLVED** — Transaction history is fetched via the internal WebView AJAX API (`POST /ajaxAccounts/trxHistory`) which returns JSON. The mock app calls this endpoint server-side from Flask and renders a clean HTML table inline under each account card. No iframe or WebView proxying is used. See `fetch_trx_history()` in `mib_client.py` and `api_transactions()` in `app.py`.

### 6. A41 Endpoint — Salted / Biometric Login

**Issue**: The **A41** endpoint (`regularSaltedAuthenticate`) was found at bytecode line 446008. It accepts `pgf03` (salted hash) + `clientSalt` instead of `pgf02` (plaintext).

**Status**: **IMPLEMENTED** — `mib_client.py` now has `step_a41()` which calls `_get_salted_password()` to derive the salted hash, generates a random `clientSalt`, and sends the A41 payload. The mock app's login screen has a radio button selector to choose between A40 (default) and A41. See `FLOW.md` for the salting algorithm and API documentation.

### 7. Single-User State

**Issue**: The Flask app maintains a single global `_state` dictionary. This means:
- Only one user session at a time
- Session state is lost on server restart
- No isolation between concurrent requests (potential race condition)

**Resolution for now**: The app is designed for personal/debug use. Multi-user support is not planned.

### 8. Aggregator Crypto Mismatch

**Issue**: The `mib-aggregator` uses a different crypto model than the mock app:
- The mock app uses Blowfish with DH-derived keys (verified working)
- The aggregator's `ApiClient` passes `aes_key` and `hmac_key` parameters
- The aggregator's `KeyDerivation` module includes `get_salted_password` which has not been verified against live traffic

**Status**: The aggregator's crypto implementation needs verification. The `endpoints.py` sfunc constants are speculative and likely incorrect.

### 9. No Rate Limiting

The app does not implement rate limiting. Multiple rapid login attempts could trigger MIB's anti-abuse protections and block the account.

### 10. Session Store Concurrent Write Vulnerability

**Issue**: `session_store.py` does not use file locking, unlike `logger.py` which uses `threading.Lock()`.

```python
def save(data):
    with open(SESSION_FILE, 'w') as f:    # Truncates on open, no lock
        json.dump(data, f, indent=2)
```

**Impact**: Concurrent `save()` calls can corrupt the session file. A `load()` during an active `save()` returns `{}` (silent data loss). No atomic write pattern.

**Status**: Low severity for single-user debug use. Fix by adding `threading.Lock()` or switching to SQLite.

### 11. Fragile Registration Response Parsing

**Issue**: `mib_client.py:351-358` uses bare bracket access (`result['key1']`) for 4 of 6 response fields. Missing fields crash with `KeyError` caught by a generic `except Exception`, producing a misleading "Registration decryption failed" error.

```python
return {
    'key1': result['key1'],          # KeyError if missing — no fallback
    'key2': result['key2'],          # KeyError if missing — no fallback
    'app_id': result.get('appId', app_id),  # Safe (inconsistent pattern)
    'xxid': result['xxid'],          # KeyError if missing — no fallback
    'smod': result['smod'],          # KeyError if missing — no fallback
    'session_key': session_key,
    'nonce_generator': result.get('nonceGenerator'),  # Safe, optional
}
```

**Status**: Fix by using `.get()` with clear error messages or adding a `validate_response()` helper.

### 12. `_gen_nonce` Called as Private Function

**Issue**: `app.py:248` calls `mib_client._gen_nonce(...)` — the underscore prefix conventionally indicates a private function. Would break if `mib_client.py` is refactored into a class.

```python
nonce = mib_client._gen_nonce(_state['nonce_generator'])
```

**Status**: Minor. Should be exposed as a public method or moved to a utility module.

### 13. C43 Resend OTP Logic Duplicated in `app.py` (Resolved)

**Issue**: `api_resend_otp()` manually implements encryption, request, and decryption inline instead of using the `_step_template` pattern.

**Resolution**: `step_c43()` was added to `mib_client.py:754`. The `api_resend_otp()` route now calls `mib_client.step_c43()`, eliminating the duplicate boilerplate.

**Status**: **RESOLVED** — `step_c43()` exists and is used by `app.py`.

### 14. Silent Skip on Non-8-Token Groups

**Issue**: `mib_client.py:100` — `if len(t) != 8: continue` silently skips malformed nonce groups with no warning log.

```python
if len(t) != 8:
    continue   # No log, no warning
```

**Status**: Add a warning-level log entry for skipped malformed groups.

### 15. `getSaltedPw` Used — Password Hash Stored

**Issue**: The aggregator now stores `password_hash = SHA-256(password).upper()` in `session.json` after successful login. This hash is used in `_authenticate_with_hash()` to call A44 → A41 with the stored hash, enabling fully seamless session restoration after device key expiry.

**Resolution**: `mib_client.py` now has `step_a41_with_hash()` which accepts a pre-computed password hash instead of the raw password. This is the production path for automated session restoration. See `RULEBOOK.md R19` for the storage policy.

**Status**: **RESOLVED** — Implemented in commit.

### 16. Aggregator `endpoints.py` Uses Wrong sfunc Values (Resolved)

**Issue**: The `mib-aggregator/client/endpoints.py` defined sfunc constants like `LOGIN = 'LOGIN'`, `GET_ACCOUNTS = 'GET_ACCOUNTS'`, `REGISTER_DEVICE = 'REGISTER_DEVICE'`, etc. These were **wrong** — the real sfunc values are exactly `'r'`, `'i'`, `'n'`.

**Resolution**: The `Sfunc` class now uses `REGISTER = 'r'`, `INIT = 'i'`, `NORMAL = 'n'` with correct values.

**Status**: **RESOLVED** — `endpoints.py` now uses verified sfunc values.

### 17. Aggregator `device.py` Generates Keys Locally (Should Be Server-Assigned) (Resolved)

**Issue**: `mib-aggregator/crypto/device.py:generate_device_keys()` used to generate `key1`, `key2`, and `appId` locally using `os.urandom` and `uuid`. In reality, these are **assigned by the server** during device registration (`sfunc='r'`).

**Resolution**: `generate_device_keys()` has been removed. `device.py` now only has `load_device_keys()` and `save_device_keys()` for persisting server-assigned keys.

**Status**: **RESOLVED** — Keys are now server-assigned; no local generation exists.

### 18. No Play Integrity / SafetyNet / Device Attestation

**Issue**: The MIB app does not use any device attestation mechanism. Searches across the full 565K-line disassembly found zero matches for SafetyNet, Play Integrity, root detection, or keystore usage.

**Impact**: Low for the aggregator (doesn't affect API calls). Notable as a security observation about the real app.

### 19. Logout is Client-Side Only

**Issue**: There is no server-side logout endpoint. The `logout` function (bytecode line 394526) only clears local AsyncStorage. The aggregator's `Sfunc.LOGOUT` constant is speculative.

**Impact**: Sessions cannot be explicitly invalidated from the aggregator. They expire naturally on the server side.

### 20. WebView Session Cookie Mechanism

**Issue**: The WebView session requires programmatic cookie injection (`xxid`, `mbmodel`, `mbnonce`) plus a keepAlive POST to establish `JSESSIONID`. This has been reversed and is replicable in Python.

**Current state**: Implemented in `mib_client.py:setup_webview_session()`. The function:
1. Creates a `requests.Session()`
2. Sets `xxid`, `mbmodel` (`'IOS-1.0'`), and `mbnonce` cookies with `.mib.com.mv` domain
3. POSTs to `/aProfile/keepAlive` to get `JSESSIONID`
4. Returns the session for use with any WebView URL

**Caveats**:
- The WebView server may validate `mbnonce` against `xxid` — if so, nonces must be regenerated per-request (not cached)
- If the keepAlive response includes a `Set-Cookie` for `JSESSIONID` with different domain/path, the session may need per-request cookie management
- The WebView HTML may include assets (CSS, JS, images) loaded from relative paths — these may not render correctly outside the WebView

### 21. Registration Format Mismatch — Fixed

**Issue (resolved)**: The mock app was sending registration (`sfunc='r'`) requests using form-urlencoded format with only the inner payload encrypted:
```
POST /faisamobilex_smvc/
data=<encrypted inner payload>  # WRONG
```

**Root cause**: The bytecode's `encryptAndEncode` function builds a full outer envelope `{sfunc, data: inner}`, JSON-stringifies the entire envelope, encrypts that, then URI-encodes and sends as a JSON POST body:
```
POST /faisamobilex_smvc/?sfunc=r
Content-Type: application/json
{"data": "<URI_ENCODED_CIPHERTEXT>"}  # ciphertext = Blowfish({sfunc:'r', data:{...}})
```

**Symptom**: Server returned 201 "sFunc is required" because `sfunc` was missing from the encrypted blob.

**Resolution**: `mib_client.py` now uses `_encrypt_envelope()` helper which builds the correct `{sfunc, data: inner}` envelope, encrypts, URI-encodes, and sends as JSON. The same fix applies to `sfunc='i'` (S40) which also uses the JSON envelope format with `key2` inside the envelope.

### 22. Transfer Initiation is WebView-Only

**Issue**: There is no encrypted API for initiating transfers or creating pending approvals. The entire flow is handled by the MIB web application inside the app's WebView at `/transferIps/quick?dashurl=1`.

**Implication**: To programmatically initiate transfers, one must either:
- Submit the form via the WebView (reverse the web app's form POST — fragile, likely anti-CSRF protected)
- Scrape the WebView form, fill it, and submit it (session-dependent, fragile)
- Neither approach is reliable for production use

**Status**: Documented in `API.md` and `FLOW.md`. The mock app does not implement transfer initiation. For production, the partner bank would need to use MIB's direct banking API (not the FaisaMobile X mobile API) for transfer initiation.

### 23. A42 Endpoint Confirmed Absent in Bytecode (Resolved)

**Issue**: The A42 routePath (used in the mock app for login OTP verification after A41) does **not exist** in the Hermes bytecode bundle. The automated bytecode analysis (Phase 5 — endpoint extraction) searched all 14,959 functions and 29,891 strings for any reference to `"A42"` as a routePath, payload field, or function name — zero matches.

**Impact**: This confirms the "unknown route error" (501) observed when the mock app calls `step_a42()`. The endpoint does not exist on the server either, matching the bytecode analysis. Login OTP verification after A41 must use C42 instead, or the server's A41 response may include accounts directly (when `profileSelected: true` and `accountBalance` is non-empty, OTP is skipped entirely).

**Resolution**: The bytecode confirmed that C42 is the only OTP endpoint. A42 was a speculative endpoint that does not exist in the API. Both A40 and A41 paths now route to C42 for OTP verification.

**Status**: **RESOLVED** — confirmed by bytecode analysis; C42 is the correct OTP endpoint for all paths.

### 24. C42 SMS OTP (otpType: '2') — Server-Side PHP Bug

**Issue**: The C42 endpoint with `otpType: "2"` (SMS OTP) triggers a server-side PHP error at `IndexController.php:423`: `Undefined index: decodedbody`. This is a bug in the MIB server code, not the client.

**Symptoms**: The server returns a 501 error or unexpected response when C42 is called with `otpType: "2"`. The `otpType: "3"` (TOTP/authenticator) path works correctly but requires a TOTP seed that is not available to the aggregator.

**Impact**: OTP verification via SMS (the only OTP type available to the aggregator) is broken. The aggregator must alternatively rely on:
- A40 returning `success: true` without OTP (reasonCode `"104"`) — the normal path for trusted sessions
- A41 returning accounts directly in the response when `profileSelected: true` and `accountBalance` is non-empty
- If OTP is absolutely required, the session must be restarted (new registration)

**Status**: **UNRESOLVED** — Server-side bug, no client fix possible. The aggregator's OTP handling treats C42 failures as non-fatal and attempts direct A80 account fetching as a fallback.

### 25. OTP is Optional (Not Mandatory)

**Issue**: The aggregator was initially designed assuming OTP was mandatory for every login. The bytecode analysis (Plans 1+2) confirmed that OTP is **not mandatory** — the server returns `profileSelected: true` + `accountBalance` as the authentication signal.

**Bytecode confirmation**: Function #11796 (auth handler, offset 642) checks `data.profileSelected`. When truthy, the user already has a selected profile — OTP is skipped and the flow proceeds directly to session creation. The `accountBalance` field (string_id 21635) is read alongside it. This matches the aggregator's behaviour.

**Clarification**: `primaryOTPType` and `otpTypes` in the A41 response are informational lists of available methods, not a requirement. The bytecode shows `primaryOTPType !== "2"` simply skips the SMS-OTP handler (#11268/#14705) without error.

**Status**: **CORRECT** — The aggregator already handles this correctly. No code change needed.

### 26. Approval OTP is Server-Mandated (Unlike Login OTP)

**Issue**: Unlike login OTP (which can be skipped when the server returns `profileSelected: true`), the OTP for approvals (A48/A49) is **server‑mandated** and cannot be bypassed.

**Bytecode confirmation** (Plan 3 — Approval OTP Analysis):
- A48 (#12204) and A49 (#12200) build their payloads with **zero conditional branches** — every field including `otp` and `otpType` is unconditionally included.
- The only two branches in each function are the Hermes generator error guard (offset 10) and the response error check after the `await` (offset ~230).
- `profileSelected`, `primaryOTPType`, and `transferType` are NOT referenced by any approval-related function — those OTP-skip conditions are login-only.
- No alternative approval routePaths exist (no A45, A46, A50, etc.).

**Implication for aggregator**: The aggregator must always collect OTP from the user and include it in A48/A49 payloads. Use C43 to deliver the OTP, then submit with `otp`, `otpType`, `approvalId`, `checksum`, and `approvalLevel`.

**Status**: **DOCUMENTED** — Approval OTP is correctly understood as server-mandated. No code change needed.

## Cross-Reference

For a complete architectural gap analysis, including detailed code evidence, refactoring impact analysis, and prioritized fix roadmap, see [`PRE_INTEGRATION_CONCERNS.md`](PRE_INTEGRATION_CONCERNS.md).

## Missing Endpoints

| Endpoint | Purpose | Status |
|----------|---------|--------|
| A41 | Salted/biometric login (pgf03+clientSalt) | **IMPLEMENTED** — `step_a41()` in `mib_client.py` |
| P41 | Get user profile image | **Found at bytecode ~line 360950** — implemented in `mib_client.py` |
| P47 | Profile switching | **Found at bytecode line 507932** — implemented in `mib_client.py` |
| A47 | Get pending approvals (paginated) | **Found at bytecode line 461697** — implemented in `mib_client.py` |
| A48 | Decline approval (needs OTP) | **Found at bytecode line 461953** — implemented in `mib_client.py` (needs OTP) |
| A49 | Approve approval (needs OTP) | **Found at bytecode line 461836** — implemented in `mib_client.py` (needs OTP) |
| C40 | Change PIN/password | **Found at bytecode line 445442** — not yet implemented |
| C41 | Salted change PIN step | **Found at bytecode line 445574** — not yet implemented |
| L40 | Get ATM/branch locations (sfunc='i') | **Found at bytecode line 524525** — not yet implemented |
| P80 | Get promotional offers (sfunc='i') | **Found at bytecode line 493645** — not yet implemented |
| Transaction History | Get past transactions | **WebView-based** — resolved via cookie injection, implemented in `mib_client.py` |
| Transfer Initiation | Create pending transfer | **WebView-only** — no encrypted API exists |
| Bill Payment | Pay bills | Not found in bytecode |
| Card Management | Manage cards | Not found in bytecode |
| Notifications | Push notification history | Client-side only in bytecode |
| Statement Download | Download account statements | Not found in bytecode |

## Future Improvements

### Short-Term

1. **Test with a fresh MIB account** — Verify the end-to-end flow works with an active account.

2. **Fix 501 errors** — Debug the nonce generation to eliminate "Invalid data" responses:
   - Capture more nonceGenerator examples from live traffic
   - Compare generated nonces against the real app's nonces
   - Verify the random seed vs. deterministic components

3. **Transaction history — inline table format** — The transaction history now renders as an inline HTML table below account cards (no WebView/iframe). Filter panel and download (CSV/PDF) buttons are implemented. Further polish: pagination caching, better empty-state messaging.

4. **Aggregator crypto alignment** — Update the aggregator's crypto modules to use the same verified Blowfish/DH model as the mock app.

### Medium-Term

5. **Multiple device profiles** — Allow the user to save/manage multiple device registration profiles:
   - Each profile has its own key1, key2, appId
   - Useful for testing different registration scenarios
   - Stored in a local database (SQLite)

6. **Automated test suite** — Build a pytest-based test suite:
   - Unit tests for nonce generation (deterministic with mocked random)
   - Unit tests for encryption/decryption round-trips
   - Integration tests with a mock MIB server
   - Regression tests for known API responses

7. **WebSocket for real-time updates** — Replace HTTP polling with WebSocket:
   - Real-time debug log updates
   - Live session status changes
   - Reduced overhead vs. 1.5s polling

8. **Integration into main aggregator sync loop** — *Not yet implemented.*
   The WebView session and transaction history fetching logic currently lives in the mock app
   (`mib_client.py`). For production use, migrate this into the main aggregator's
   `sync/transactions.py` module so that transaction sync runs alongside balance and account sync
   in the scheduling loop.
   - **Agent note:** When this becomes a priority, the agent can request to implement it by
     porting `setup_webview_session()` and `fetch_trx_history()` to the aggregator
     (likely as methods on `ApiClient` or a new `WebViewClient`).
     2. Updating `sync/transactions.py` to use the WebView-based fetch for each account.
     3. Adding a WebView session refresh step to the scheduler if the session expires.
     4. Wiring the parsed transaction records into `TransactionStore`.

### Long-Term

10. **Docker deployment** — Containerise both apps:
    ```dockerfile
    FROM python:3.13-slim
    WORKDIR /app
    COPY mib-mock-app/ .
    RUN pip install -r requirements.txt
    CMD ["python", "app.py"]
    ```
    - Single `docker-compose.yml` for mock app + aggregator
    - Environment variable configuration
    - Volume mounts for persistent data

11. **CI/CD pipeline** — Automated testing and deployment:
    - GitHub Actions for PR checks (lint, type-check, test)
    - Automated Docker image builds
    - Optional: scheduled sync of live MIB data

12. **Additional endpoints** — Reverse engineer and implement:
    - Money transfer (internal and external)
    - Bill payment (utilities, phone credit, etc.)
    - Card management (block, PIN change, limits)
    - Account statement PDF download
    - Push notification handling

13. **Password hash storage for session restoration** — **RESOLVED**:
    - The aggregator now stores `SHA-256(password).upper()` in `session.json`
    - Used by `_authenticate_with_hash()` to re-authenticate via A44 → A41
    - See `RULEBOOK.md R19` for policy and `app.py:_authenticate_with_hash()` for implementation

14. **Session resurrection not yet integrated into aggregator** — *Not yet implemented.*
    The session resurrection flow (S40 re-key on error detection) has been fully documented in
    [`SESSION_MANAGEMENT.md`](SESSION_MANAGEMENT.md) and implemented in the mock app
    (`resurrect_session()` in `mib_client.py`), but:
    - The aggregator's `sync/session.py` still has a TODO placeholder instead of the actual S40 call
    - The aggregator's `client/api.py` does not detect session expiry errors and auto-trigger resurrection
    - The WebView keepalive (90s interval) is not running in the aggregator's sync loop
    - **Agent note:** When this becomes a priority, the agent can request to implement it by:
      1. Updating `sync/session.py` with the actual `call_s40_init()` logic from `step_s40()`
      2. Adding error detection + auto-resurrection to `client/api.py`
      3. Running WebView keepalive on a 90s timer alongside the main sync loop
      4. Updating `KNOWN_ISSUES.md` to mark this issue as resolved
