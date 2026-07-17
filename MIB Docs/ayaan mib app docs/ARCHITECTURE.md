# Architecture & Design

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [System Architecture Overview](#system-architecture-overview)
- [Flask App (mib-mock-app)](#flask-app-mib-mock-app)
- [Aggregator (mib-aggregator)](#aggregator-mib-aggregator)
- [Module Descriptions](#module-descriptions)
- [Data Flow](#data-flow)
- [Session Management](#session-management)

## System Architecture Overview

> **All internal logic has been verified against the full Hermes v96 bytecode bundle
> (14,959 functions, 29,891 strings, 445,088 instructions, 23 routePaths).**
> See [`REVERSE_ENGINEERING.md#automated-bytecode-analysis`](REVERSE_ENGINEERING.md#automated-bytecode-analysis)
> for the complete analysis and [`VERIFICATION.md`](VERIFICATION.md) for the verification status.

```
┌─────────────────────────────────────────────────────────────────┐
│                      End User (Browser)                         │
│  http://127.0.0.1:5678                                          │
│  - Login form with username/password                            │
│  - OTP modal for second-factor verification                     │
│  - Account dashboard with balances                              │
│  - Debug panel with expandable request/response details         │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP (JSON API)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Flask Web App (app.py)                        │
│                                                                  │
│  Routes:                                                         │
│   GET  /               → index.html (SPA shell)                 │
│   GET  /api/session    → Session status (auth state, keys)      │
│   POST /api/login      → Full login flow (register→S40→A44→A40) │
│   POST /api/otp        → OTP verification (C42)                 │
│   POST /api/resend-otp → Resend OTP (C43)                       │
│   GET  /api/accounts   → Account list (A80)                     │
│   GET  /api/logs       → Debug log entries                      │
│   DEL  /api/logs       → Clear debug log                        │
│   POST /api/logout     → Reset state, clear session             │
│                                                                  │
│  State: in-memory _state dict (key1, key2, app_id, xxid,        │
│         nonce_generator, session_key, is_authenticated, etc.)   │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTPS (encrypted with Blowfish/ECB)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              MIB API Server (faisanet.mib.com.mv)               │
│              /faisamobilex_smvc/                                 │
│                                                                  │
│  sfunc='r': Device Registration (DEFAULT_KEY)                    │
│  sfunc='i': Key Exchange / Session Init (smod exchange)         │
│  sfunc='n': Normal operations (A44, A40, A41, A47-A49, A80,    │
│             B44, C40-C43, P40-P42, P45-P47, S43, S44)          │
│  WebView:    Transaction history, transfer details               │
│             (at faisamobilex-wv.mib.com.mv)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Flask App (mib-mock-app)

The mock app is a single-page Flask application that serves as an interactive debug tool for the MIB API. It maintains all session state in an in-memory dictionary (`_state`) and orchestrates the multi-step login flow.

### Route Map

| Route | Method | Description | Handler |
|-------|--------|-------------|---------|
| `/` | GET | Serves the SPA shell (`index.html`) | `index()` |
| `/api/session` | GET | Returns current session state summary | `api_session()` |
| `/api/login` | POST | Orchestrates full device registration + login flow | `api_login()` |
| `/api/otp` | POST | Submits OTP verification code | `api_otp()` |
| `/api/resend-otp` | POST | Resends OTP to registered device | `api_resend_otp()` |
| `/api/accounts` | GET | Returns cached or freshly fetched account list | `api_accounts()` |
| `/api/profile` | POST | Switch active user profile (P47) | `api_profile()` |
| `/api/logs` | GET | Returns all debug log entries | `api_logs()` |
| `/api/logs` | DELETE | Clears all debug log entries | `api_logs_delete()` |
| `/api/webview-session` | POST | Establishes or refreshes the WebView session for transaction history | `api_webview_session()` |
| `/api/transactions` | GET | Returns cached transaction history for a given account | `api_transactions()` |
| `/api/transactions/download` | GET | Downloads transaction history as CSV or PDF | `api_transactions_download()` |
| `/api/resurrect` | POST | Triggers session resurrection (S40 re-key) | `api_resurrect()` |
| `/api/logout` | POST | Resets all state and clears persisted session (client-side only) | `api_logout()` |

### Global State (`_state`)

The Flask app maintains a single global `_state` dictionary (`app.py:17-31`) that tracks:

```python
_state = {
    'key1': None,              # Device key 1 (from registration)
    'key2': None,              # Device key 2 (from registration)
    'app_id': None,            # Application identifier
    'xxid': None,              # Request correlation ID
    'nonce_generator': None,   # Nonce seed from server
    'session_key': None,       # Derived Blowfish encryption key
    'is_authenticated': False, # Whether login is complete
    'username': None,          # Logged-in username
    'password_hash': None,     # SHA-256(password).upper() for hash-based auth restoration
    'accounts': [],            # Cached account list
    'pending_otp': False,      # Whether OTP verification is needed
    'wv_session': None,        # WebView requests.Session for transaction history
    'wv_transactions': {},     # Cached WebView transaction data per account
}
```

## Aggregator (mib-aggregator)

The aggregator is a headless Python application designed for automated, recurring data sync. It uses a command-line interface and can optionally run as a background daemon.

### Module Architecture

```
mib-aggregator/
├── main.py                  # Entry point, delegates to cli.main()
├── cli.py                   # argparse CLI → command dispatch
├── config.py                # Environment variable configuration
├── scheduler.py             # APScheduler for recurring sync jobs
│
├── crypto/
│   ├── cipher.py            # Blowfish/ECB/PKCS5 encrypt/decrypt (bytes-level)
│   ├── key_derivation.py    # DH key derivation, password salting, hex-to-base64
│   ├── payload.py           # Request envelope builder / response parser
│   └── device.py            # Device key generation and JSON persistence
│
├── client/
│   ├── api.py               # ApiClient: HTTP wrapper with encrypted payloads
│   ├── auth.py              # AuthFlow: login + OTP flow
│   └── endpoints.py         # Sfunc constants and BASE_URL
│
├── db/
│   ├── models.py            # SQLAlchemy ORM: Session, DeviceKey, Account, Transaction, SyncLog
│   └── store.py             # Store classes: CRUD for each model
│
├── sync/
│   ├── accounts.py          # sync_accounts: fetch and upsert accounts
│   ├── transactions.py      # sync_transactions: fetch and upsert transactions
│   └── session.py           # refresh_session: token refresh / heartbeat
│
└── tools/
    ├── hbc_strings.py       # Extract strings from Hermes Bytecode bundles
    ├── analyze_memdump.py   # Search memory dumps for keys, tokens, JSON
    └── verify_crypto.py     # CLI tool to verify Blowfish key derivation
```

### Commands

| Command | Description |
|---------|-------------|
| `python main.py login` | Interactive login with OTP prompt |
| `python main.py sync-accounts` | One-shot account and balance sync |
| `python main.py sync-transactions` | One-shot transaction history sync |
| `python main.py status` | Show account summary and recent sync logs |
| `python main.py session-refresh` | Force session/token refresh |
| `python main.py daemon` | Run continuously with scheduled syncs |

## Module Descriptions

### `mib-mock-app/app.py` (1005 lines)

The Flask application controller. Key responsibilities:

- **Route definitions**: All API endpoints (see [API.md](API.md))
- **Login orchestration**: `api_login()` implements the full 5-step flow:
  1. Generate random device fingerprints
  2. Register device (`step_register_device` with `DEFAULT_KEY`)
  3. Session init / S40 (if nonceGenerator not already returned)
  4. A44 — Get auth type (checks if credentials are valid)
  5. A40 — Submit password (if A44 succeeds)
- **OTP handling**: `api_otp()` calls `step_c42` to verify 2FA
- **Session persistence**: `_persist_session()` / `_try_restore_session()` save/load state to `session.json`
- **Account fetching**: `_fetch_accounts()` calls `step_a80` and normalises the response

### `mib-mock-app/mib_client.py` (1128 lines)

The MIB API client library. This is the core of the project — it implements every protocol detail extracted from the bytecode.

**Low-level helpers:**
- `_gr(n)` — Generate `n` random bytes as a decimal string (used for `sodium`, `xxid`)
- `_encrypt(plaintext, key)` — Blowfish/ECB/PKCS5 encryption → base64
- `_decrypt(data_b64, key)` — Base64 → Blowfish/ECB/PKCS5 decryption
- `_compute_blowfish_key(smod_str)` — DH key derivation: `pow(smod, A, P)` → SHA-256 → base64
- `_gen_nonce(nonce_generator)` — Bytecode-verified nonce generation (see [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md))
- `_build_and_encrypt(inner, key, xxid)` — JSON → encrypt → URL-encoded body
- `_do_request(sfunc, body, is_init=False)` — HTTP POST with logging

**Constants extracted from bytecode:**
- `A_VALUE` — DH private exponent (big integer, ~128 bytes)
- `P_VALUE` — DH prime modulus (big integer, ~1024 bytes)
- `G_VALUE` — DH generator (2)
- `DEFAULT_KEY` — Bootstrap encryption key for device registration

**Step functions:**
- `step_register_device(app_id)` — sfunc='r', encrypted with DEFAULT_KEY
- `step_s40(key1, key2, app_id)` — sfunc='i', session init with key exchange
- `step_a44(username, ...)` — Get authentication type
- `step_a40(username, password, ...)` — Submit login credentials (plaintext)
- `step_c42(otp, username, otp_type, ...)` — OTP verification
- `step_c43(username, otp_type, ...)` — Resend OTP
- `step_a80(...)` — Get accounts
- `step_p47(profile_type, profile_id, ...)` — Switch user profile
- `_step_template(...)` — Shared template for all 'n' sfunc steps

### `mib-mock-app/logger.py` (32 lines)

Thread-safe structured debug log accumulator.

- `add_entry(level, source, method, endpoint, status, raw=None)` — Append a log entry
- `get_entries()` — Return all entries (thread-safe copy)
- `clear()` — Clear all entries
- `MAX_ENTRIES = 500` — Ring buffer limit

### `mib-mock-app/session_store.py` (24 lines)

JSON file persistence for sessions. Stores `session.json` alongside `app.py`.

- `save(data)` — Write session state to JSON
- `load()` — Read session state (returns `{}` if missing or corrupt)
- `clear()` — Delete the session file

**⚠️ Known limitation:** No file locking. Unlike `logger.py` (which uses `threading.Lock()`), concurrent `save()` calls can corrupt the session file. See [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md#9-session-store-concurrent-write-vulnerability) and [`PRE_INTEGRATION_CONCERNS.md`](PRE_INTEGRATION_CONCERNS.md#22-session-storage-single-json-file).

### `mib-aggregator/crypto/cipher.py` (51 lines)

Bytes-level Blowfish/ECB/PKCS5 encryption/decryption. Used by both the mock app and the aggregator.

- `encrypt(plaintext: bytes, key: bytes) -> bytes` — Base64-encoded ciphertext
- `decrypt(data: bytes, key: bytes) -> bytes` — Decrypt base64 to plaintext bytes
- `encrypt_data(data: dict, key: str) -> str` — Dict → JSON → Blowfish → base64 string
- `decrypt_data(data: str, key: str) -> dict` — String → decrypted → JSON → dict

### `mib-aggregator/crypto/key_derivation.py` (86 lines)

Key derivation functions extracted from Hermes bytecode at offset `0x0024d310`.

- `get_computed_key(password_bigint_str)` — DH-derived Blowfish key
- `get_salted_password(password, salt)` — Salted password hashing
- `compute_blowfish_key(smod_value)` — High-level DH key derivation
- `hex_to_base64(hex_str)` — Hex string → base64 (matching app's `hexToBase64`)

### `mib-aggregator/crypto/payload.py` (69 lines)

Request/response envelope construction.

- `build_request(payload, sfunc, key, xxid, mbnone)` — Build encrypted request envelope
- `parse_response(response_data, key)` — Parse and decrypt response

### `mib-aggregator/crypto/device.py` (35 lines)

Device key storage and JSON file persistence. Keys are server-assigned during `sfunc='r'` registration.

- `load_device_keys(keys_path)` — Load device keys from JSON file
- `save_device_keys(keys, keys_path)` — Save device keys to JSON file

### `mib-aggregator/client/endpoints.py` (46 lines)

Defines `Sfunc` class with operation code constants (`r`, `i`, `n`) and `BASE_URL`.

### `mib-aggregator/client/api.py` (185 lines)

`ApiClient` — HTTP client wrapper that handles encrypted request/response lifecycle.

### `mib-aggregator/client/auth.py` (65 lines)

`AuthFlow` — Interactive login flow (send credentials → OTP prompt → complete).

### `mib-aggregator/db/models.py` (94 lines)

SQLAlchemy ORM models for `Session`, `DeviceKey`, `Account`, `Transaction`, `SyncLog`.

### `mib-aggregator/db/store.py` (121 lines)

Store classes providing CRUD operations for each model: `SessionStore`, `DeviceKeyStore`, `AccountStore`, `TransactionStore`, `SyncLogStore`.

### Reverse Engineering Tools

- **`mib-aggregator/tools/hbc_strings.py`** — Extracts readable strings from Hermes Bytecode v96 bundles. Parses the HBC header, extracts overflow (function body) strings, and filters for crypto/network/API keywords.
- **`mib-aggregator/tools/analyze_memdump.py`** — Analyzes memory dumps from the MIB app process. Searches for JWT tokens, cookies, high-entropy key blocks, JSON strings, and known hex constants. **⚠️ Note:** Comment references "AES key + HMAC key" — this is outdated. The actual crypto is Blowfish/DH (see [`REVERSE_ENGINEERING.md`](REVERSE_ENGINEERING.md)).
- **`mib-aggregator/tools/verify_crypto.py`** — CLI tool to verify Blowfish key derivation against captured Proxyman traffic.
- **`mib-aggregator/FINDINGS.md`** — Supplementary raw reverse-engineering findings (Hermes module structure, Zoho Keys, retry config). Cross-reference: this file lives outside `docs/` and supplements [`REVERSE_ENGINEERING.md`](REVERSE_ENGINEERING.md).
- **`bytecode_analysis/`** — Automated 8-phase bytecode analysis pipeline. Processes the Hermes v96 bundle (14,959 functions, 445K instructions) into 16 output files (~36 MB total). Key outputs: `output/summary_report.md` (consolidated findings), `output/endpoints.json` (24 endpoints with payload fields), `output/bytecode.db` (25.7 MB SQLite instruction database). Full documentation at [`REVERSE_ENGINEERING.md#automated-bytecode-analysis`](REVERSE_ENGINEERING.md#automated-bytecode-analysis).

## Data Flow

### Login Flow (browser → Flask → MIB API)

```
Browser                  Flask App                    MIB API Server
   │                        │                              │
   │  POST /api/login       │                              │
   │  {username, password}  │                              │
   │───────────────────────>│                              │
   │                        │                              │
   │                        │  gen_fingerprints()          │
   │                        │  (random app_id)             │
   │                        │                              │
   │                        │  POST /faisamobilex_smvc/    │
   │                        │  sfunc=r  (DEFAULT_KEY)      │
   │                        │─────────────────────────────>│
   │                        │  {key1, key2, smod, xxid}    │
   │                        │<─────────────────────────────│
   │                        │                              │
   │                        │  compute_blowfish_key(smod)  │
   │                        │  → session_key               │
   │                        │                              │
   │                        │  POST /faisamobilex_smvc/    │
   │                        │  sfunc=i  (S40, key exchange)│
   │                        │─────────────────────────────>│
   │                        │  {smod, xxid, nonceGenerator}│
   │                        │<─────────────────────────────│
   │                        │                              │
   │                        │  compute_blowfish_key(smod)  │
   │                        │  gen_nonce(nonceGenerator)   │
   │                        │                              │
   │                        │  POST /faisamobilex_smvc/    │
   │                        │  sfunc=n, routePath=A44      │
   │                        │  (encrypted w/ session_key)  │
   │                        │─────────────────────────────>│
   │                        │  {success, reasonText, ...}  │
   │                        │<─────────────────────────────│
   │                        │                              │
   │                        │  POST /faisamobilex_smvc/    │
   │                        │  sfunc=n, routePath=A40      │
   │                        │  (encrypted w/ session_key)  │
   │                        │─────────────────────────────>│
   │                        │  {success, reasonCode, ...}  │
   │                        │<─────────────────────────────│
   │                        │                              │
   │  HTTP 200              │                              │
   │  {status: "otp_required" OR "success"}                │
   │<───────────────────────│                              │
```

### Debug Log Accumulation

Every significant operation in `mib_client.py` logs structured data via `logger.add_entry()`:

```
logger.add_entry(level, source, method, endpoint, status, raw={...})
```

The `raw` field contains the full request/response details:

```python
raw = {
    'type': 'http_request',
    'http_request': {
        'url': '...',
        'method': 'POST',
        'params': {...},
        'headers': {...},
        'body': 'xxid=...&data=...',
        'decrypted_inner': {'uname': '...', ...},
    },
    'http_response': {
        'status_code': 200,
        'headers': {...},
        'body_encrypted': '...',
        'body_decrypted': {'success': True, ...},
    },
    'session_key': '...',
    'nonce': '...',
}
```

## Session Management

> **Full detail:** See [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) for the comprehensive session lifecycle, resurrection flow, keepalive mechanisms, and failure modes. This section provides a summary.

### In-Memory State (`mib-mock-app`)

The Flask app uses an in-memory `_state` dict (see [app.py:17-31](#global-state-state)). This state is **not** shared between Flask workers. Only one session is supported at a time.

### JSON Persistence (`session_store.py`)

On successful login, the state is persisted to `session.json`:

```json
{
  "key1": "...",
  "key2": "...",
  "app_id": "...",
  "xxid": "...",
  "nonce_generator": "...",
  "session_key": "...",
  "is_authenticated": true,
  "username": "ayaanabdur",
  "password_hash": "E4B00A60E390BB8A0E0B7B4A8E5B1F2C...",
  "accounts": [...]
}
```

On startup, `app.py` calls `_try_restore_session()` which loads the saved state and verifies it by making an A80 (get accounts) call. If the server rejects the request (session expired), the state is cleared and the login form is shown.

### SQLAlchemy Sessions (`mib-aggregator`)

The aggregator uses a more robust session management system with SQLite persistence:

- **`Session` model** — stores `key1`, `key2`, `app_id` (permanent device keys) and `xxid`, `smod`, `session_key`, `nonce_generator` (ephemeral session data)
- **`SessionStore`** — `get_latest()`, `save()`, `update()`
- **Session refresh** — `sync/session.py` calls S40 key exchange (`sfunc='i'`) with stored device keys

### Session Expiry

- Device registration keys (`key1`, `key2`) are long-lived — they persist across app restarts and are the anchor for session resurrection
- The session key (derived Blowfish key) is ephemeral — it is refreshed on each S40 call
- When the server returns a 101 (cipher key not found) error, a new S40 key exchange is needed (see [SESSION_MANAGEMENT.md#session-resurrection](SESSION_MANAGEMENT.md#session-resurrection))
- After a successful resurrect + A80 call, the session is considered re-verified
- Only the WebView keepalive exists (90s interval, `/aProfile/keepAlive`) — no encrypted API keepalive
- **Logout is client-side only** — the `logout` function clears local AsyncStorage but does not invalidate the server session. The aggregator's `Sfunc.LOGOUT` is speculative/wrong

## Design Decisions

### OTP Philosophy — A40 is the Default

The aggregator defaults to **A40 (plaintext login)** rather than **A41 (salted login)** because:

1. **Security model** — The aggregator runs on controlled infrastructure with persistent device keys (key1/key2) stored on the server. This is inherently more secure than a consumer mobile device where the app binary and key storage are exposed to the user. OTP adds operational friction (someone must manually enter the code) without increasing cryptographic security for the aggregator's use case.

2. **Unattended operation** — The aggregator must run without human intervention ("set and forget"). If every restart required OTP entry, the aggregator would fail this requirement. A40 allows the server to skip OTP when it determines the session is trustworthy, while gracefully handling OTP when the server demands it (reasonCode `414`/`415`).

3. **A41 is available for testing** — The salted login path exists as a manual option for exercising the full OTP flow. It is never used automatically; the app always respects the user's selection on the login form.

4. **The official app's behavior is not a requirement** — The official MIB app (consumer mobile application) always uses A41 and requires OTP for every login. This is appropriate for a consumer app where the device is untrusted. The aggregator serves a different purpose and correctly defaults to the lower-friction path.
