# BML Internet Banking API — Persistent Session Integration

**Package**: `viri/bml`  
**Base domain**: `www.bankofmaldives.com.mv`  
**API base**: `https://www.bankofmaldives.com.mv/internetbanking/api/`  
**Web base**: `https://www.bankofmaldives.com.mv/internetbanking/web/`  
**Last updated**: 2026-07-13 — reverse-engineered from live BML traffic

---

## Overview

BML internet banking uses **cookie-based session authentication** with mandatory **two-factor authentication (2FA)** on every fresh login. The SPA frontend is built with Inertia.js / Laravel. The mobile banking app uses a **device trust** mechanism (hardware ID + remember-me cookie) to bypass 2FA on subsequent logins.

The session is split into two layers:

- **Web session** (`blaze_session`): manages the Inertia.js SPA. Can be auto-restored via the `blaze_identity` remember-me cookie.
- **API session** (`blaze_token`): required for `/api/*` endpoint access. Only issued during the full login flow (credentials → 2FA). Cannot be restored by web auto-auth alone.

---

## Session Architecture

```
                          POST /web/login         POST /web/login/2fa
Browser / App ──→ Login ──→{credentials}──→ 302 ──→{OTP code}──→ 302 ──→ Dashboard
                                    │                                    │
                              Server sets:                          Server sets:
                              blaze_session                         blaze_token ★
                              XSRF-TOKEN                            blaze_identity ★
                                                                     blaze_session (refreshed)
                                                                     
★ = only issued after FULL 2FA chain completes
```

| Layer | Cookie | Set by | Lifespan | Purpose |
|---|---|---|---|---|
| **API** | `blaze_token` | Full login (after 2FA) | Max-Age 600s from Set-Cookie, server-side TTL hours/days | Authenticates `/api/*` endpoints |
| **Web** | `blaze_session` | Login, keep-alive, page loads | Max-Age 600s, refreshed on every page load | Encrypted web session data |
| **Identity** | `blaze_identity` | After successful 2FA | Expires=0 (session cookie; persisted by native apps) | Remember-me / device trust token |
| **CSRF** | `XSRF-TOKEN` | Login, keep-alive, page loads | Max-Age 600s | CSRF protection for POST requests |
| **CDN** | `__cf_bm` | Cloudflare | ~30 min | Bot management |

**Critical insight**: The API and web sessions are separate. Auto-auth via `blaze_identity` restores the web session but does **not** issue a new `blaze_token`. API routes (`/api/*`) return `401 {"error":"Unauthenticated."}` when `blaze_token` is expired, even if the web session is valid.

---

## Hardware / Device Identity

BML identifies devices via custom HTTP headers. The mobile banking app sends a persistent device identifier that BML uses to recognize trusted devices and potentially bypass 2FA.

### Device ID Header

Every request to BML should include:

```
X-Device-ID: <32-char hex string>
X-Device-Platform: proxy  (or android, ios)
```

**Generating a device ID**:
```php
// Generate once, persist forever
$devIdFile = __DIR__ . '/device_id.txt';
if (!file_exists($devIdFile)) {
    file_put_contents($devIdFile, bin2hex(random_bytes(16)));
}
$deviceId = trim(file_get_contents($devIdFile));
```

**Sending with every request**:
```php
$headers = [
    "X-Device-ID: $deviceId",
    'X-Device-Platform: proxy',
    // ... other headers
];
```

The device ID is **persistent** — generated once and reused across all sessions. BML's device management page (`/web/settings`) lists this as "proxy" platform. This device identity is critical for the 2FA bypass mechanism.

---

## Cookies Reference

| Cookie | HttpOnly | Max-Age | Set by | Purpose |
|---|---|---|---|---|
| `blaze_token` | Yes | 600s | Full login (after 2FA) | API session token. **Only** issued during complete login flow. NOT refreshed by keep-alive or auto-auth. Required for all `/api/*` calls. |
| `blaze_session` | Yes | 600s | Login, keep-alive, page loads, auto-auth | Encrypted web session data. Refreshed frequently. |
| `blaze_identity` | Yes | 0 (session) | After successful 2FA | Remember-me / device trust token. Persists across browser sessions (stored by native apps). Required for auto-auth and 2FA bypass. |
| `XSRF-TOKEN` | No | 600s | Login, keep-alive, page loads | CSRF token. Must match server-stored value for POST requests. |
| `__cf_bm` | Yes | ~30 min | Cloudflare | Bot management. Must be included but value is opaque. |

**All five cookies must be sent together.** The library/app should treat them as an opaque auth state, never selectively omitting any.

---

## Login & Authentication Flow

### Endpoint: `POST /internetbanking/web/login`

> **Note**: The old `/api/login` endpoint no longer exists (returns 404). BML migrated to the Inertia.js SPA endpoint at `/web/login`.

Authenticate with credentials. If 2FA is required, the server redirects to the 2FA page.

**Headers:**
```
Content-Type: application/json
Accept: application/json
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-Device-ID: <persistent device id>
X-Device-Platform: proxy
User-Agent: BML/2.0 (Android 16; SM-G998B)
```

**Body** (JSON):
```json
{
    "username": "myuser",
    "password": "mypassword",
    "code": ""
}
```

The `code` field is optional. When empty or invalid:
- Server validates credentials → **302 redirect to `/web/login/2fa`** (2FA required)
- Sets `XSRF-TOKEN` and `blaze_session` cookies (10-min Max-Age)

When `code` contains a valid OTP or device token (combined with device headers + existing cookies):
- Server may **bypass 2FA** → 302 redirect to `/vf/accounts/overview` (dashboard)

**Example (raw curl — will redirect to 2FA):**
```bash
DEVICE_ID=$(cat device_id.txt)

curl -s -D - 'https://www.bankofmaldives.com.mv/internetbanking/web/login' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H 'X-Inertia: true' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'User-Agent: BML/2.0 (Android 16; SM-G998B)' \
  -H "X-Device-ID: $DEVICE_ID" \
  -H 'X-Device-Platform: proxy' \
  -d '{"username":"myuser","password":"mypassword","code":""}'
```

**Response (302 — credentials valid, 2FA required):**
```
HTTP/2 302
Location: https://www.bankofmaldives.com.mv/internetbanking/web/login/2fa
Set-Cookie: XSRF-TOKEN=...; Max-Age=600
Set-Cookie: blaze_session=...; Max-Age=600; HttpOnly
```

---

### Endpoint: `POST /internetbanking/web/login/2fa`

Submit the OTP code received via WhatsApp/SMS/Email.

**Body** (JSON):
```json
{
    "code": "844194",
    "channel": "whatsapp"
}
```

**Available channels**: `whatsapp`, `sms`, `email`

**Flow (Login Process for BML API Service)**:

1. `POST /web/login` → 302 to `/web/login/2fa` (expected)
2. `POST /web/login/2fa` → 302 to `/web/login/2fa` again (selecting WhatsApp channel)
3. `POST /web/login/2fa` → 302 to `/web/profile` (2FA completed for non-business profile - **close browser window here for personal profiles!**)
4. `GET /web/profile` → 200 (Inertia JSON) [end if it's a personal profile]

If the account has a **business profile**, an additional 2FA step is required:

### Business Profile 2FA: `POST /internetbanking/web/profile/2fa/business`

5. `POST /web/profile/2fa/business` → 302 (business 2FA)
6. `POST /web/profile/2fa/business` → 200 (business 2FA completed)

The business profile login ends at `internetbanking/vf/accounts/overview` — **browser window should close here.**

After 2FA completes, the server issues `blaze_token` and `blaze_identity` cookies (the full API session).

---

## 2FA Bypass via Device Trust

The mobile banking app re-authenticates without OTP by leveraging device trust. This mechanism can be replicated programmatically.

### How it works

BML recognizes a device as "trusted" when the login request includes:
1. A previously-issued `blaze_identity` cookie (remember-me token)
2. `X-Device-ID` and `X-Device-Platform` headers (consistent device identity)
3. A mobile app User-Agent (signals non-browser client)

### Bypass conditions

When these conditions are met, `POST /web/login` with valid credentials returns **302 → `/vf/accounts/overview`** (dashboard) instead of **302 → `/web/login/2fa`** (2FA page).

**Required headers for bypass:**
```
User-Agent: BML/2.0 (Android 16; SM-G998B)
X-Device-ID: <persistent device id>
X-Device-Platform: proxy
Cookie: ... (must include blaze_identity)
Content-Type: application/json
X-Inertia: true
```

### Bypass example

```php
$deviceId = trim(file_get_contents('/path/to/device_id.txt'));

// Load stored cookies (must include blaze_identity)
$cookies = loadFromDatabase();
$cookieStr = buildCookieHeader($cookies);

$ch = curl_init('https://www.bankofmaldives.com.mv/internetbanking/web/login');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'username' => $username,
        'password' => $password,
        'code'     => '',  // empty — bypass occurs without OTP
    ]),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
        'X-Inertia: true',
        'X-Requested-With: XMLHttpRequest',
        'User-Agent: BML/2.0 (Android 16; SM-G998B)',
        "X-Device-ID: $deviceId",
        'X-Device-Platform: proxy',
        "Cookie: $cookieStr",
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
]);
$response = curl_exec($ch);

// If 302 to /vf/accounts/overview → bypass succeeded
// If 302 to /web/login/2fa → 2FA required (blaze_identity missing/invalid)
```

### Important caveat

The 2FA bypass skips the login 2FA but does **not** guarantee a new `blaze_token`. The `blaze_token` (API session token) is only issued during the **full** login flow including business profile 2FA. After a bypass login, the API session may still be inaccessible until a new `blaze_token` is issued. This requires further testing with truly expired sessions.

---

## API Endpoints

All API endpoints require a valid `blaze_token` cookie. Responses return JSON.

### Cookie requirement

All five cookies must be sent with every API request:

```
Cookie: XSRF-TOKEN=...; blaze_session=...; __cf_bm=...; blaze_identity=...; blaze_token=...
```

Additionally, include device identity headers on every request:

```
X-Device-ID: <persistent hex>
X-Device-Platform: proxy
```

---

### GET `/internetbanking/api/dashboard`

Fetch all accounts and user info.

**Example (raw curl):**
```bash
DEVICE_ID=$(cat device_id.txt)

curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/dashboard' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -H 'X-Device-Platform: proxy' \
  -b cookies.txt
```

**Response (200):**
```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "userInfo": {
            "user": {
                "fullname": "Ahmed Mohamed",
                "guid": "9B087717-DA63-E511-80C4-00155D020F0A",
                "cif": "111524"
            }
        },
        "dashboard": [
            {
                "id": 1,
                "account": "7730000123456",
                "product_name": "BML Savings Account",
                "alias": "My Savings",
                "workingBalance": "25000.50",
                "ledgerBalance": "25000.50",
                "current_balance": "25000.50",
                "currency": "MVR",
                "account_type": "SAVINGS"
            }
        ]
    }
}
```

Note: The response uses both `"success"` and `"message"` top-level fields. Use `"success"` to check for authorization failures.

---

### GET `/internetbanking/api/profile`

Check whether the current session is still valid. Used as the health-check endpoint.

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/profile' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt
```

**Response (200 — authenticated):**
```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "userInfo": {
            "user": {
                "fullname": "Ahmed Mohamed",
                "guid": "9B087717-DA63-E511-80C4-00155D020F0A"
            }
        }
    }
}
```

---

### GET `/internetbanking/api/account/{accountId}/history/today`

Fetch today's transactions for a specific account.

**Path parameters:** `accountId` — the GUID or numeric `id` from the dashboard response.

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/account/1/history/today' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt
```

**Response (200):**
```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "history": [
            {
                "id": "txn_001",
                "date": "2026-07-12T17:19:06",
                "amount": "500.00",
                "minus": false,
                "balance": "25500.50",
                "narrative3": "Salary Transfer"
            },
            {
                "id": "txn_002",
                "date": "2026-07-12T15:19:06",
                "amount": "250.00",
                "minus": true,
                "balance": "25000.50",
                "narrative3": "Utility Payment"
            }
        ]
    }
}
```

**Fields:**
- `minus`: `false` = credit (money in), `true` = debit (money out)
- `narrative3`: transaction description
- `balance`: running balance after this transaction

---

### GET `/internetbanking/api/contacts`

Fetch all saved payees/contacts.

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt
```

**Response (200):**
```json
{
    "success": true,
    "message": "Success",
    "payload": [
        {
            "id": 101,
            "alias": "Ahmed",
            "account": "7730000999999"
        }
    ]
}
```

---

### POST `/internetbanking/api/contacts`

Add a new contact/payee.

**Body** (form-urlencoded):
```
contact_type=IAT
account=7730000777777
alias=Hassan
```

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt \
  -d 'contact_type=IAT&account=7730000777777&alias=Hassan'
```

**Response (200):**
```json
{
    "message": "Success",
    "payload": {
        "id": 200,
        "alias": "Hassan",
        "account": "7730000777777"
    }
}
```

---

### POST `/internetbanking/api/contacts/{contactId}` (Delete)

Delete a contact. Uses `_method=delete` for method spoofing.

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts/101' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt \
  -d '_method=delete'
```

---

### GET `/internetbanking/web/keep-alive`

> **Warning**: This endpoint is a no-op. It returns HTTP 200 for **any** input — invalid cookies, no cookies, random values. It does NOT validate sessions and should NOT be relied upon for health checks or session TTL extension.

**Do not use this endpoint for session validation.** Use `GET /api/profile` instead.

```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/web/keep-alive' \
  -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' \
  -H 'Accept: application/json' \
  -H "X-Device-ID: $DEVICE_ID" \
  -b cookies.txt -c cookies.txt
```

**Response:**
- Always HTTP 200 with empty body
- May return refreshed `XSRF-TOKEN` and `blaze_session` cookies (10-min Max-Age)
- Never returns `blaze_token`

---

## Re-authentication on Expiry

When `/api/dashboard` returns:

```json
{"error": "Unauthenticated.", "url": "https://www.bankofmaldives.com.mv/internetbanking/web/login"}
```

...the `blaze_token` (API session) has expired. Recovery options:

### Option A: Device Trust Bypass (no OTP needed)

If `blaze_identity` cookie is still valid and device headers are included:

1. `POST /web/login` with stored credentials + device headers + existing cookies
2. If credentials valid and device trusted: **302 → `/vf/accounts/overview`** (2FA bypassed)
3. Follow redirects to establish new web session
4. Check `/api/dashboard` — may work if server issues new `blaze_token` during re-auth
5. If API still 401: **blaze_token was not reissued** — full 2FA login required

### Option B: Full Login with 2FA (OTP required)

When device trust is insufficient (no `blaze_identity`, expired trust, or business profile requires additional 2FA):

1. `POST /web/login` with credentials → 302 to `/web/login/2fa`
2. Prompt user for OTP (received via WhatsApp/SMS)
3. `POST /web/login/2fa` with OTP → 302 to `/web/profile`
4. If business profile: `POST /web/profile/2fa/business` with OTP
5. Server issues new `blaze_token` and `blaze_identity` cookies
6. Persist all new cookies

### Option C: Re-login via Web Proxy (browser-based)

The recommended approach for development/testing:

1. User visits the proxy URL in their browser
2. Proxy forwards to BML's login page (Inertia.js SPA)
3. User completes full login flow (credentials + 2FA) in the browser
4. Proxy captures **all** cookies (triple-union: DB + browser + Set-Cookie)
5. Store cookies in persistent database
6. Subsequent API calls use stored cookies directly (no browser needed)

The proxy handles the triple-union merge:
```php
// Union capture — no cookie ever lost
$allCookies = array_merge($existingFromDB, $browserCookies, $newSetCookieHeaders);
```

---

## Persistent Session Flow (Proxy-Based)

### Architecture

```
Browser ──→ proxy.php ──→ BML Server
   │             │
   │        Captures all cookies
   │        into SQLite database
   │             │
   │        test_app (PHP)
   │        Loads cookies from DB
   │        Makes direct curl calls to BML
   │        Includes X-Device-ID header
```

### Step 1: Browser login through proxy

The user navigates to the proxy URL. The proxy (`proxy.php`) forwards all requests to BML and captures cookies:

```php
// proxy.php — cookie capture
$browserCookies = parse_cookies($_SERVER['HTTP_COOKIE']);
$setCookies = parse_set_cookie_headers($responseHeaders);

// Triple-union: never lose a cookie
$allCookies = array_merge($existingFromDB, $browserCookies, $setCookies);

// Store in database
$authState = [
    'user'    => ['username' => 'bml_user'],
    'device'  => ['device_id' => $deviceId, 'platform' => 'proxy'],
    'session' => ['access_token' => $allCookies['blaze_token'] ?? null],
    'cookies' => $allCookies,
    'captured_at' => now()->toIso8601String(),
];
```

### Step 2: Direct API access using stored cookies

Once cookies are stored, the application makes direct curl calls to BML:

```php
<?php
// test_app — resume with stored cookies
$deviceId = trim(file_get_contents(__DIR__ . '/device_id.txt'));

$session = BmlSession::query()
    ->where('viri_user_id', 1)
    ->where('status', 'active')
    ->orderBy('id', 'desc')
    ->first();

$state = json_decode($session->auth_state, true);
$cookies = $state['cookies'];
unset($cookies['PHPSESSID']); // Remove local session cookie

$cookieStr = implode('; ', array_map(
    fn($k, $v) => "$k=$v",
    array_keys($cookies),
    $cookies
));

// Call BML API with stored cookies + device headers
$ch = curl_init('https://www.bankofmaldives.com.mv/internetbanking/api/dashboard');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)',
        'Accept: application/json',
        "X-Device-ID: $deviceId",
        'X-Device-Platform: proxy',
        "Cookie: $cookieStr",
    ],
    CURLOPT_HEADER => true,
]);
$raw = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status === 200) {
    // Parse dashboard data
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $body = substr($raw, $headerSize);
    $data = json_decode($body, true);
    $accounts = $data['payload']['dashboard'] ?? [];
} elseif ($status === 401) {
    // Session expired — attempt re-auth (see Re-authentication section)
}
```

### Step 3: Transaction history

```php
// For each account from the dashboard response:
foreach ($accounts as $account) {
    $accountId = $account['id'];
    $url = "https://www.bankofmaldives.com.mv/internetbanking/api/account/{$accountId}/history/today";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)',
            'Accept: application/json',
            "X-Device-ID: $deviceId",
            'X-Device-Platform: proxy',
            "Cookie: $cookieStr",
        ],
        CURLOPT_HEADER => true,
    ]);
    $raw = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $body = json_decode(substr($raw, $headerSize), true);
    $transactions = $body['payload']['history'] ?? [];
    curl_close($ch);
}
```

---

## Operation Without Browser (Direct API Flow)

For server-side or automated access without a browser:

### Setup (one-time)

1. Generate a persistent device ID:
```php
$deviceId = bin2hex(random_bytes(16));
file_put_contents('device_id.txt', $deviceId);
```

2. Store encrypted credentials in a database:
```php
$encrypted = encrypt(json_encode([
    'username'  => 'myuser',
    'password'  => 'mypassword',
    'device_id' => $deviceId,
]));
```

3. Complete a login through any method to obtain initial session cookies. Store ALL cookies (the five BML cookies plus `blaze_identity`).

### Runtime flow

```
1. Load cookies from database
2. Call GET /api/dashboard with cookies + device headers
   │
   ├── HTTP 200 → session alive, use the data
   │
   └── HTTP 401 → session expired
        │
        ├── Attempt device trust bypass (POST /web/login)
        │   │
        │   ├── 302 → /vf/accounts/overview → bypass succeeded
        │   │   └── Try /api/dashboard again
        │   │       ├── 200 → works! ✓
        │   │       └── 401 → blaze_token not reissued, need full login ✗
        │   │
        │   └── 302 → /web/login/2fa → 2FA required
        │       └── User interaction needed (OTP input)
```

### Known limitations

- **Blaze token regeneration**: After the device trust bypass, `blaze_token` may not be reissued. The full 2FA chain (including business profile 2FA) might be necessary for API access.
- **Session TTL**: When properly captured and stored (triple-union merge, no keep-alive contamination), sessions last multiple hours. Earlier short TTL issues (~20 min) were caused by cookie corruption from keep-alive Set-Cookie overwrites.
- **Business profiles**: Accounts with business profiles require an additional 2FA step after login 2FA. Device trust may not bypass this second layer.

---

## Error Responses

### API endpoints (`/api/*`)

```json
// Session / blaze_token expired
{"error": "Unauthenticated.", "url": "https://www.bankofmaldives.com.mv/internetbanking/web/login"}

// Invalid credentials
{"message": "Invalid username and/or password", "payload": null}

// Not logged in
{"message": "Please login", "payload": null}
{"message": "Required to set Profile", "payload": null}
```

### Web endpoints (`/web/*`)

```json
// 2FA page channels (Inertia JSON)
{"component": "login/2fa", "props": {"channels": [{"id": 1, "name": "WhatsApp"}, ...]}}

// Login error
{"component": "login/login", "props": {"errors": {"username": ["..."], "password": ["..."]}}}
```

> **Note**: API error responses use the `"error"` key (e.g., `{"error": "Unauthenticated."}`), while older API endpoints use `"message"` (e.g., `{"message": "Please login"}`). Check both keys when detecting auth failures.

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `BML_API_BASE_URL` | `https://www.bankofmaldives.com.mv/internetbanking/api/` | API base URL |
| `BML_API_TIMEOUT` | `30` | Request timeout (seconds) |
| `BML_API_CONNECT_TIMEOUT` | `10` | Connection timeout (seconds) |
| `BML_AUTH_MODE` | `web` | `web` (cookie-based) — `mobile` token mode not supported by current API |
| `BML_USER_AGENT` | `BML/2.0 (Android 16; SM-G998B)` | User-Agent header. Use Android UA for 2FA bypass |
| `BML_DEVICE_ID` | `(generated)` | Persistent 32-char hex string identifying the device |
| `BML_DEVICE_PLATFORM` | `proxy` | Platform identifier sent as `X-Device-Platform` header |
| `BML_BACKOFF_MAX_RETRIES` | `3` | Max retry attempts for network errors |
| `BML_BACKOFF_BASE_DELAY` | `2` | Base backoff delay (seconds) |
| `BML_BACKOFF_MAX_DELAY` | `60` | Max backoff delay (seconds) |
| `BML_DEBUG_ENABLED` | `false` | Enable request logging to file |
| `BML_DEBUG_LOG_FILE` | `proxy_debug.log` | Path to verbose debug log |
| `BML_SESSION_TABLE` | `bml_sessions` | Database table for session storage |

---

## Key Implementation Notes

1. **Never omit cookies**: All five BML cookies must be sent together. Omitting any (especially `blaze_identity` or `blaze_token`) will cause auth failures.
2. **Device ID is permanent**: Generate once, store permanently. Changing the device ID may require re-establishing device trust via full 2FA login.
3. **Keep-alive is a trap**: Do not use keep-alive responses to update cookies. Its Set-Cookie values have 10-min Max-Age and contaminate the state.
4. **Triple-union cookie storage**: Always merge (existing DB + browser current + new Set-Cookie) when capturing cookies. Never replace, always union.
5. **Strip local cookies**: The `PHPSESSID` from the test server should never be sent to BML. Filter it out before building the Cookie header.
6. **API vs Web session separation**: After web auto-auth (302 to SPA instead of login), verify API access separately. They are independent.
