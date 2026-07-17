# Pre-Integration Concerns & Architectural Gaps

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

**Document Version:** 2.0  
**Date:** 2026-07-13  
**Status:** Active — Reviewed Against Codebase

## Table of Contents

- [Overview](#overview)
- [Critical Issues (Must Resolve Before Production)](#critical-issues-must-resolve-before-production)
- [Medium Priority Issues (Address During Integration)](#medium-priority-issues-address-during-integration)
- [Low Priority / Nice-to-Have](#low-priority--nice-to-have)
- [Additional Issues Found During Analysis](#additional-issues-found-during-analysis)
- [Code Health & Refactoring Roadmap](#code-health--refactoring-roadmap)
- [Action Items Before Integration](#action-items-before-integration)
- [Cross-References](#cross-references)

---

## 1. Overview

This document catalogs all known architectural gaps, implementation caveats, and unresolved concerns identified before the MIB integration can be merged into a production aggregator. Each concern has been verified against the actual codebase (as of 2026-07-13).

**Status key:**
- ✅ **Resolved** — Fixed in code or already documented
- 🟡 **Confirmed** — Issue exists, documented below
- ❓ **Missing** — Concern does not apply to current codebase
- 🔴 **Critical** — Must fix before production

---

## 2. Critical Issues (Must Resolve Before Production)

### 2.1 Global State / Singleton Client

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed** |
| **Location** | `mib-mock-app/app.py:16-27` — global `_state` dict |
| **Risk** | Single-user only. Thread-unsafe — concurrent requests race on `_state`. A second user's login overwrites the first via `_reset_state()` at line 86. |

**Evidence:**
```python
# app.py:16-27
_state = {
    'key1': None,
    'key2': None,
    'app_id': None,
    'xxid': None,
    'nonce_generator': None,
    'session_key': None,
    'is_authenticated': False,
    'username': None,
    'accounts': [],
    'pending_otp': False,
}
```

Every route handler reads and mutates `_state` directly (lines 89, 104-108, 122-124, 167, 222-223, 349, 363-364, 395). No threading lock. Flask's default threaded mode (`debug=True` at line 419) allows concurrent request interleaving.

**Resolution path:** Refactor `mib_client.py` into a class-based `MIBClient` where each user gets a dedicated instance with its own state. Merge `_state` dict into the client instance to reduce duplication. See [Code Health & Refactoring Roadmap](#code-health--refactoring-roadmap).

**Docs cross-ref:** Already documented in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#6-single-user-state) and [`ARCHITECTURE.md`](ARCHITECTURE.md#global-state-state) (line 348).

---

### 2.2 Session Storage (Single JSON File)

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed** |
| **Location** | `mib-mock-app/session_store.py` (24 lines) |
| **Risk** | No file locking. Concurrent `save()` calls corrupt the file. Read-write races produce partial JSON. No atomic write pattern (write-temp-then-rename). |

**Evidence:**
```python
# session_store.py
def save(data):
    with open(SESSION_FILE, 'w') as f:    # Truncates on open, no lock
        json.dump(data, f, indent=2)

def load():
    try:
        with open(SESSION_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}                          # Silent corruption recovery
```

`logger.py` *does* use `threading.Lock()` (line 5), showing concurrency awareness exists in the project — but `session_store.py` does not follow the same pattern.

**Resolution path:**
- Add `threading.Lock()` to `session_store.py` (consistent with `logger.py`)
- Use write-to-temp-then-rename for atomicity
- For production: replace with SQLite (see section 2.2 of user's original document)

**Docs cross-ref:** Not currently documented in `KNOWN_ISSUES.md`. Update needed.

---

### 2.3 Nonce Generation Verification

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — code is bytecode-consistent but untested against live API** |
| **Location** | `mib-mock-app/mib_client.py:83-163` |
| **Risk** | If the nonce is still incorrect, login fails with `501 invalid data`. The algorithm is bytecode-verified but has only been tested against the emulator's blocked account. |

**Evidence — bytecode consistency check (PASS):**

| Aspect | Code vs Bytecode | Result |
|--------|-----------------|--------|
| Group splitting by `-` | `split('-')` (line 91) vs `split("-")` | ✅ |
| 8-token check | `if len(t) != 8: continue` (line 100) | ✅ |
| rf range | `secrets.randbelow(99) + 1` (line 103) → [1,99] | ✅ (fixed from off-by-one) |
| M operation | `(r12 % n) + r14 + r29` (line 126) | ✅ |
| S operation | `(r12^2) + n + r14 + r29` (line 128) | ✅ |
| X operation | `(r12 * n) + r14 + r29` (line 130) | ✅ |
| C operation | `(r12^3) + n + r14 + r29` (line 132) | ✅ |
| A operation | `r12 + n + r14 + r29` (line 134) | ✅ |
| Default handler | `r = 0` (line 136) | ✅ (silent) |
| r12 update | `int(str(r)[-2:])` (line 139) | ✅ |
| Group separator | `if (gi + 1) % 4 != 0` (line 147) — no dash every 4th group | ✅ |

**Remaining unknowns:**
- NonceGenerator format variations (only one format seen in bytecode)
- Server-side nonce validity window (timing, sequence tracking)
- Whether the random factor `rf` is tolerated by the server on replayed requests

**Resolution path:** Perform a full end-to-end test with a fresh MIB account. Compare Python-generated nonce against the real app's output for the same `nonceGenerator` string.

**Docs cross-ref:** Fully documented in [`REVERSE_ENGINEERING.md`](REVERSE_ENGINEERING.md#nonce-generation-algorithm) (lines 213-360), [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#1-501-invalid-data-error) (lines 18-27), and [`FLOW.md`](FLOW.md#nonce-generation-step-by-step) (lines 271-360).

---

### 2.4 Registration Flow — Key Parsing

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — parsing is fragile** |
| **Location** | `mib-mock-app/mib_client.py:298-358` |
| **Risk** | Four dictionary accesses use bracket notation (`result['key1']`, `result['key2']`, `result['xxid']`, `result['smod']`). If any field is missing, a `KeyError` is raised, caught by a generic `except Exception` in `app.py:101-102`, producing a misleading "Registration decryption failed" error. |

**Evidence:**
```python
# mib_client.py:351-358
return {
    'key1': result['key1'],          # Bracket access — KeyError if missing
    'key2': result['key2'],          # Bracket access — KeyError if missing
    'app_id': result.get('appId', app_id),  # Safe access (inconsistent)
    'xxid': result['xxid'],          # Bracket access — KeyError if missing
    'smod': result['smod'],          # Bracket access — KeyError if missing
    'session_key': session_key,
    'nonce_generator': result.get('nonceGenerator'),  # Safe, optional
}
```

Only `appId` and `nonceGenerator` use `.get()` with fallbacks — the other four fields will crash on missing keys. No schema validation exists.

**Resolution path:** Use `.get()` with explicit error messages, or add a `validate_response()` helper that checks all required fields.

**Docs cross-ref:** [`API.md`](API.md#device-registration-sfuncr) documents expected response format (lines 83-92). No existing doc mentions the fragile parsing.

---

### 2.5 Aggregator Crypto Mismatch

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — critical architectural gap** |
| **Location** | `mib-aggregator/client/api.py`, `mib-aggregator/client/endpoints.py`, `mib-aggregator/crypto/device.py` |
| **Risk** | The aggregator uses a completely different crypto model (AES-256-CTR + HMAC) than the working mock app (Blowfish/ECB/PKCS5 + DH). sfunc constants are speculative strings like `'LOGIN'` instead of actual values `'n'`, `'r'`, `'i'`. Device key generation is wrong (random bytes instead of server-assigned). |

**Evidence:**

1. **`client/api.py:17-18`** — Constructor expects `aes_key: bytes` and `hmac_key: bytes`:
   ```python
   def __init__(self, aes_key: bytes, hmac_key: bytes, ...):
   ```

2. **`client/endpoints.py`** — sfunc constants are wrong:
   ```python
   class Sfunc:
       LOGIN = 'LOGIN'           # Should be 'n' (with routePath=A40)
       LOGIN_OTP = 'LOGIN_OTP'   # Should be 'n' (with routePath=C42)
       REGISTER_DEVICE = 'REGISTER_DEVICE'  # Should be 'r'
   ```

3. **`crypto/device.py:20-25`** — Local key generation (should be server-assigned):
   ```python
   def generate_device_keys() -> dict:
       return {
           'appId': str(uuid.uuid4()).replace('-', ''),
           'key1': os.urandom(32).hex(),
           'key2': os.urandom(32).hex(),
       }
   ```

4. **`crypto/payload.py:30-55`** — Sends JSON body with `Content-Type: application/json`. MIB API uses `application/x-www-form-urlencoded`.

5. **`tools/analyze_memdump.py:8`** — Comment references AES assumption:
   ```
   #   - 64-byte key material (AES key + HMAC key)
   ```

**Resolution path:** The aggregator needs a full rewrite of its crypto/client layer to match the verified Blowfish/DH model from `mib-mock-app/mib_client.py`. The `cipher.py` and `key_derivation.py` modules are already correct (they export stateless utility functions); only the higher-level `client/` and `crypto/device.py` modules need changes.

**Docs cross-ref:** Documented in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#7-aggregator-crypto-mismatch) (lines 91-98) and [`FINDINGS.md`](../mib-aggregator/FINDINGS.md) (lines 171-175).

**New findings (2026-07-13):**
- The `Sfunc` class in `endpoints.py` defined `LOGIN`, `GET_ACCOUNTS`, `REGISTER_DEVICE`, `REFRESH_TOKEN`, `LOGOUT`, `HEARTBEAT`, etc. — **all were wrong**. The real sfunc values are exactly `{'r', 'i', 'n'}`. See `KNOWN_ISSUES.md` issue #16 (now resolved).
- `crypto/device.py` generated keys locally — they should be server-assigned via `sfunc='r'`. See `KNOWN_ISSUES.md` issue #17 (now resolved — `generate_device_keys()` removed).
- Logout is client-side only — no server endpoint. See `KNOWN_ISSUES.md` issue #19.

### 2.6 Aggregator `endpoints.py` — Wrong sfunc Values (Resolved)

| Aspect | Detail |
| :--- | :--- |
| **Status** | ✅ **Resolved — `Sfunc` class now uses verified values `'r'`, `'i'`, `'n'`** |
| **Location** | `mib-aggregator/client/endpoints.py` |

The `Sfunc` class previously used speculative strings like `LOGIN = 'LOGIN'`. It now correctly uses `REGISTER = 'r'`, `INIT = 'i'`, `NORMAL = 'n'`.

**Resolution:** Completed — sfunc values are now `'r'`, `'i'`, `'n'`.

**Docs cross-ref:** [`API.md`](API.md#sfunc-values), [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#15-aggregator-endpointspy-uses-wrong-sfunc-values).

### 2.7 Aggregator `device.py` — Local Key Generation (Resolved)

| Aspect | Detail |
| :--- | :--- |
| **Status** | ✅ **Resolved — `generate_device_keys()` removed; keys are server-assigned** |
| **Location** | `mib-aggregator/crypto/device.py` |

Previously `generate_device_keys()` created random `appId`, `key1`, `key2` locally. This function has been removed. `device.py` now only persists server-assigned keys via `load_device_keys()` and `save_device_keys()`.

**Resolution:** Completed — keys are server-assigned via `sfunc='r'` registration.

---



## 3. Medium Priority Issues (Address During Integration)

### 3.1 FCM Token Handling

| Aspect | Detail |
| :--- | :--- |
| **Status** | ❓ **Not present in codebase — keyword only exists in string extractor** |
| **Location** | `mib-aggregator/tools/hbc_strings.py:171` — keyword filter list |

**Evidence:** Searched all `.py` files. `fcm_token` appears only as a **search keyword** in the Hermes Bytecode string extractor's filter list:
```python
# hbc_strings.py:171
'refresh', 'device', 'fcm_token', 'push',
```

No code registers, stores, or sends an FCM token. It is unknown whether the MIB API requires one during registration or login.

**Recommendation:** Investigate via captured traffic or bytecode search whether `fcm_token` appears in the disassembly. If required, add a dummy token or null field to the registration payload.

**Docs cross-ref:** Not documented. Update `KNOWN_ISSUES.md` to add this item.

---

### 3.2 Concurrent Refresh / Session Race Conditions

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — no mutual exclusion on session operations** |
| **Location** | `mib-mock-app/app.py` — `_persist_session()`, `_reset_state()`, `_fetch_accounts()` |

**Evidence:**
- `_persist_session()` (lines 372-383): Called from `/api/otp` (line 232), `_fetch_accounts()` (line 359), and `_complete_login()` (line 369). No lock.
- `_reset_state()` (lines 30-42): Called from `api_login()` (line 86) and `api_logout()` (line 327). No lock.
- `_fetch_accounts()` (lines 335-359): Reads and writes `_state['accounts']`, calls `_persist_session()`. No lock.

**Race scenario:** Rapid "Refresh Accounts" clicks while OTP submission is in flight → session file corruption or partial account list.

**Resolution path:**
- Add `threading.Lock()` protecting `_state` (or each critical section)
- Per-user `MIBClient` instance eliminates shared-state races entirely

**Docs cross-ref:** Partially documented in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#6-single-user-state) (line 87: "No isolation between concurrent requests").

---

### 3.3 Rate Limiting / IP Anti-Abuse

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — no rate limiting exists** |
| **Location** | `mib-mock-app/mib_client.py` — all `step_*` functions |

**Evidence:** No delays, retry backoff, or rate limiting anywhere. Repeated failed login attempts likely caused the old account (`ayaanabdur`) to be blocked with error code 402.

**Resolution path:** Add `time.sleep()` with exponential backoff on non-200 responses. Consider proxy IP pools for production scaling.

**Docs cross-ref:** Documented in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#8-no-rate-limiting) (lines 100-102).

---

## 4. Low Priority / Nice-to-Have

### 4.1 IP Address / Server-Side Rate Limiting

Same as section 3.3 — low priority for personal debug use. Revisit for production.

### 4.2 Missing `requirements.txt` for Aggregator

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — no requirements.txt in `mib-aggregator/`** |
| **Location** | `mib-aggregator/` |

Dependencies are listed inline in `DEPLOYMENT.md` line 91 but not formalized into a `requirements.txt`.

### 4.3 `FINDINGS.md` Outside `docs/`

| Aspect | Detail |
| :--- | :--- |
| **Status** | 🟡 **Confirmed — `FINDINGS.md` exists in `mib-aggregator/` root, not cross-referenced from docs** |

**Recommendation:** Add cross-reference note at top of `FINDINGS.md` pointing to `docs/`. Update `ARCHITECTURE.md` to reference it.

---

## 5. Additional Issues Found During Analysis

### 5.1 `_gen_nonce` Called as Private Function

| Aspect | Detail |
| :--- | :--- |
| **Location** | `mib-mock-app/app.py:248` |
| **Issue** | `mib_client._gen_nonce(...)` — underscore prefix conventionally indicates private, but `app.py` calls it directly. Would break on class refactor. |

```python
# app.py:248
nonce = mib_client._gen_nonce(_state['nonce_generator'])
```

### 5.2 C43 Resend OTP Logic Duplicated in `app.py`

| Aspect | Detail |
| :--- | :--- |
| **Location** | `mib-mock-app/app.py:240-302` — `api_resend_otp()` |
| **Issue** | Manually implements encryption, request, decryption inline instead of using `_step_template` pattern. No `step_c43()` exists in `mib_client.py`. |

This duplicates ~60 lines of boilerplate that the `_step_template` pattern was designed to avoid.

### 5.3 Silent Skip on Non-8-Token Groups

| Aspect | Detail |
| :--- | :--- |
| **Location** | `mib-mock-app/mib_client.py:100` |
| **Issue** | `if len(t) != 8: continue` — silently skips malformed groups with no warning log. |

```python
if len(t) != 8:
    continue   # Silent skip — produces no log entry
```

### 5.4 `getSaltedPw` Not Integrated

| Aspect | Detail |
| :--- | :--- |
| **Location** | `mib-aggregator/crypto/key_derivation.py` — `get_salted_password()` exists but is unused |
| **Issue** | The bytecode contains a salted password function, but the mock app always sends plaintext (`pgf02`). The `pmodTime` parameter may indicate which mode to use. |

---

## 6. Code Health & Refactoring Roadmap

### 6.1 Class-Based `MIBClient` — Impact Analysis

Refactoring `mib_client.py` from module-level functions to a class would affect:

**Files that change (`mib_client.py` → `MibClient` class):**
- All `step_*` functions become methods (store `key1`, `key2`, `session_key`, `xxid` as instance attributes)
- `generate_fingerprints()` → `@staticmethod`
- `_gen_nonce()`, `_encrypt()`, `_decrypt()` → `@staticmethod` or move to `cipher.py`
- `_compute_blowfish_key()` → `@staticmethod` or move to `key_derivation.py`

**Files that do NOT change:**
- `cipher.py` — already stateless utility functions
- `key_derivation.py` — already stateless utility functions

**Files that do change (`app.py`):**
- Import: `import mib_client` → `from mib_client import MibClient`
- Instantiation: `client = MibClient()` per user session
- All calls: `mib_client.step_s40(...)` → `client.step_s40(...)`
- `_state` dict can be partially merged into `client.state`

### 6.2 Prioritized Fix Order

| Priority | Fix | Effort | Depends On |
|----------|-----|--------|------------|
| 🔴 P0 | Fresh account end-to-end test | 1 day | Nothing |
| 🔴 P1 | Aggregator crypto rewrite | 3-5 days | P0 |
| 🟡 P2 | `mib_client.py` class refactor | 1-2 days | Nothing (independent) |
| 🟡 P3 | `session_store.py` file locking | 0.5 days | Nothing |
| 🟡 P4 | Registration response validation | 0.5 days | Nothing |
| 🟢 P5 | Formalize aggregator `requirements.txt` | 0.25 days | Nothing |
| 🟢 P6 | Cross-reference `FINDINGS.md` | 0.25 days | Nothing |
| 🟢 P7 | Fix `analyze_memdump.py` comments | 0.1 days | Nothing |

### Changes Made Since 2026-07-13 Review

| Concern | Previous Status | Current Status | Change |
|---------|----------------|----------------|--------|
| 2.5 Aggregator Crypto Mismatch | 🟡 Confirmed | 🟡 Confirmed | Device key section updated — `generate_device_keys()` removed |
| 2.6 `endpoints.py` sfunc Values | 🟡 Confirmed | ✅ Resolved | `Sfunc` class now uses verified values |
| 2.7 `device.py` Local Key Gen | 🟡 Confirmed | ✅ Resolved | `generate_device_keys()` removed; keys server-assigned |

---

## 7. Action Items Before Integration

1. **Test registration** with a fresh account — *mandatory*.
2. **Verify nonce generation** — compare Python output against real app.
3. **Refactor to class-based client** — separate state per user.
4. **Replace JSON storage with a database** — SQLite for MVP, PostgreSQL for production.
5. **Fix aggregator crypto** — rewrite `client/` and `crypto/device.py` to match Blowfish/DH model.
6. **Add registration response validation** — use `.get()` with error messages instead of bare bracket access.
7. **Add file locking to `session_store.py`** — or switch to SQLite.
8. **Investigate FCM token requirement** — check bytecode and live traffic.

---

## 8. Cross-References

| File | Relevant Sections |
|------|-------------------|
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | All known issues including 501 errors, rf off-by-one (resolved), single-user state, crypto mismatch, rate limiting |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Module descriptions, data flow, session management |
| [`FLOW.md`](FLOW.md) | Step-by-step login flow, DH exchange, nonce generation example |
| [`REVERSE_ENGINEERING.md`](REVERSE_ENGINEERING.md) | Bytecode analysis, crypto algorithm details, nonce pseudocode |
| [`API.md`](API.md) | Endpoint reference, payload formats, error codes |
| [`FINDINGS.md`](../mib-aggregator/FINDINGS.md) | Raw reverse-engineering findings, Hermes module structure, Zoho Keys |

---

*This document is a living document. Update it whenever a concern is resolved, a new gap is discovered, or the architecture changes.*
