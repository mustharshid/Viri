# BML Internet Banking API — Persistent Session Integration

**Base domain**: `www.bankofmaldives.com.mv`  
**API base**: `https://www.bankofmaldives.com.mv/internetbanking/api/`  
**Web base**: `https://www.bankofmaldives.com.mv/internetbanking/web/`  

---

## Overview

BML internet banking uses **cookie-based session authentication**. After a successful login, the server issues several cookies that must be sent with every subsequent request. Sessions have a limited TTL and must be kept alive via periodic pings. When a session expires, the library automatically re-authenticates using stored encrypted credentials.

---

## Session Lifecycle

```
Login ──→ cookies stored ──→ profile check ──→ keep-alive (every 5 min)
               │                                      │
               │                                session expired?
               │                                      │
               │                                  yes └──→ re-login
               │                                      │
               └──→ on any API call: check last_activity
                    if > 300s ago → ping profile first
```

---

## Cookies That Matter

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `blaze_token` | Yes | Primary auth token (encrypted session ID) |
| `blaze_session` | Yes | Encrypted session data |
| `XSRF-TOKEN` | No | CSRF token (needed for POST endpoints) |
| `blaze_identity` | Yes | Identity / remember-me |
| `__cf_bm` | Yes | Cloudflare bot management |

All cookies must be sent together. The library treats them as an opaque auth state.

---

## API Endpoints

### POST `/internetbanking/api/login`

Authenticate and receive session cookies.

**Headers:**
```
User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)
Accept: application/json, text/plain, */*
Accept-Language: en-US,en;q=0.9
```

**Body** (form-urlencoded):
```
username=myuser
password=mypassword
```

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/login' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -d 'username=myuser&password=mypassword' \
  -c cookies.txt
```

**Response (200):**
```json
{
    "message": "Success",
    "payload": {}
}
```

**Cookies returned** (`Set-Cookie`): `blaze_token`, `blaze_session`, `XSRF-TOKEN`, `blaze_identity`, `__cf_bm`

**Response (401 — invalid credentials):**
```json
{
    "message": "Invalid username and/or password",
    "payload": null
}
```

---

### GET `/internetbanking/api/profile`

Check whether the current session is still valid. Used as the health-check endpoint.

**Cookies:** All session cookies required.

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/profile' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -b cookies.txt
```

**Response (200 — authenticated):**
```json
{
    "message": "Success",
    "payload": {
        "user": "myuser"
    }
}
```

**Response (401 — expired / not logged in):**
```json
{
    "message": "Please login",
    "payload": null
}
```

---

### GET `/internetbanking/api/dashboard`

Fetch all accounts and user info.

**Cookies:** All session cookies required.

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/dashboard' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -b cookies.txt
```

**Response (200):**
```json
{
    "message": "Success",
    "payload": {
        "userInfo": {
            "user": {
                "fullname": "Ahmed Mohamed"
            }
        },
        "dashboard": [
            {
                "id": 1,
                "account": "7730000123456",
                "product_name": "BML Savings Account",
                "product": "Savings",
                "alias": "My Savings",
                "workingBalance": "25000.50",
                "ledgerBalance": "25000.50",
                "current_balance": "25000.50",
                "currency": "MVR",
                "account_type": "SAVINGS",
                "account_status": "ACTIVE"
            },
            {
                "id": 2,
                "account": "7730000654321",
                "product_name": "BML Current Account",
                "current_balance": "10500.00",
                "currency": "USD",
                "account_type": "CURRENT"
            }
        ]
    }
}
```

---

### GET `/internetbanking/api/account/{accountId}/history/today`

Fetch today's transactions for a specific account.

**Path parameters:** `accountId` — numeric `id` from the dashboard response (not the account number).

**Cookies:** All session cookies required.

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/account/1/history/today' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -b cookies.txt
```

**Response (200):**
```json
{
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

**Cookies:** All session cookies required.

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -b cookies.txt
```

**Response (200):**
```json
{
    "message": "Success",
    "payload": [
        {
            "id": 101,
            "alias": "Ahmed",
            "account": "7730000999999"
        },
        {
            "id": 102,
            "alias": "Fathimath",
            "account": "7730000888888"
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

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
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

**Body** (form-urlencoded):
```
_method=delete
```

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/api/contacts/101' \
  -H 'User-Agent: BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)' \
  -H 'Accept: application/json' \
  -b cookies.txt \
  -d '_method=delete'
```

**Response (200):**
```json
{
    "message": "Success",
    "payload": "Contact removed"
}
```

---

### GET `/internetbanking/web/keep-alive`

Session keepalive endpoint. Refreshes cookie TTL. Called periodically (every 5 minutes) to keep the session alive without user interaction.

**Headers:**
```
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15
Accept: application/json
```

**Example (raw curl):**
```bash
curl -s 'https://www.bankofmaldives.com.mv/internetbanking/web/keep-alive' \
  -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' \
  -H 'Accept: application/json' \
  -b cookies.txt -c cookies.txt
```

**Response:**
- HTTP 200 with empty or minimal body
- May return refreshed `Set-Cookie` headers with updated cookie values

---

## Persistent Session Flow (Complete Example)

Below is a complete PHP script that logs in, persists the session, resumes later without re-entering credentials, and fetches data.

### Step 1: Login and persist cookies

```php
<?php
$base = 'https://www.bankofmaldives.com.mv/internetbanking';
$ua   = 'BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)';

$ch = curl_init("$base/api/login");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query([
        'username' => 'myuser',
        'password' => 'mypassword',
    ]),
    CURLOPT_HTTPHEADER => [
        "User-Agent: $ua",
        'Accept: application/json',
    ],
    CURLOPT_COOKIEJAR => '/tmp/bml_cookies.json',
    CURLOPT_COOKIEFILE => '/tmp/bml_cookies.json',
    CURLOPT_HEADER => true,
]);
$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "Login HTTP $httpCode\n";

// Extract cookies from Set-Cookie headers
preg_match_all('/Set-Cookie: ([^;]+)/i', $raw, $matches);
$cookies = [];
foreach ($matches[1] as $c) {
    if (str_contains($c, '=')) {
        [$k, $v] = explode('=', trim($c), 2);
        $cookies[trim($k)] = trim($v);
    }
}

// Persist cookies to database (JSON)
$authState = json_encode([
    'cookies' => $cookies,
    'authenticated_at' => date('c'),
]);

// Store $authState in your DB for this user
file_put_contents('/tmp/bml_session.json', $authState);
```

### Step 2: Resume session (any time later)

```php
<?php
$base = 'https://www.bankofmaldives.com.mv/internetbanking';
$ua   = 'BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)';

// Load persisted cookies
$authState = json_decode(file_get_contents('/tmp/bml_session.json'), true);
$cookies = $authState['cookies'];
$cookieStr = implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($cookies), $cookies));

// Check if session is still valid
$ch = curl_init("$base/api/profile");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "User-Agent: $ua",
        'Accept: application/json',
        "Cookie: $cookieStr",
    ],
    CURLOPT_HEADER => true,
]);
$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 401) {
    echo "Session expired — need to re-login\n";
    // Re-login with stored encrypted credentials
    exit;
}

echo "Session valid\n";

// Fetch dashboard
$ch = curl_init("$base/api/dashboard");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "User-Agent: $ua",
        'Accept: application/json',
        "Cookie: $cookieStr",
    ],
]);
$dash = json_decode(curl_exec($ch), true);
curl_close($ch);

$accounts = $dash['payload']['dashboard'] ?? [];
foreach ($accounts as $a) {
    echo $a['account'] . ' — ' . ($a['workingBalance'] ?? $a['ledgerBalance']) . " {$a['currency']}\n";
}
```

### Step 3: Keep-alive (run every 5 minutes)

```php
<?php
$base = 'https://www.bankofmaldives.com.mv/internetbanking';
$ua   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

$authState = json_decode(file_get_contents('/tmp/bml_session.json'), true);
$cookies = $authState['cookies'];
$cookieStr = implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($cookies), $cookies));

$ch = curl_init("$base/web/keep-alive");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "User-Agent: $ua",
        'Accept: application/json',
        "Cookie: $cookieStr",
    ],
    CURLOPT_HEADER => true,
]);
$raw = curl_exec($ch);
curl_close($ch);

// Extract any refreshed cookies
preg_match_all('/Set-Cookie: ([^;]+)/i', $raw, $matches);
foreach ($matches[1] as $c) {
    if (str_contains($c, '=')) {
        [$k, $v] = explode('=', trim($c), 2);
        $cookies[trim($k)] = trim($v);
    }
}

// Update persisted state with refreshed cookies
$authState['cookies'] = $cookies;
file_put_contents('/tmp/bml_session.json', json_encode($authState));
```

---

## Re-authentication on Expiry

When any API call returns `{"message": "Please login"}` or `{"message": "Required to set Profile"}`, the session has expired. The recovery procedure is:

1. Decrypt stored credentials (`username` + `password`)
2. Call `POST /internetbanking/api/login` again
3. Extract new cookies from the response
4. Update the persisted auth state
5. Retry the original API call with the new cookies

If re-login fails, the session is marked as permanently expired.

---

## Heartbeat Architecture

Two mechanisms keep sessions alive:

### 1. Lazy ping (on-demand)
Before every API call, check if `last_activity` is older than 300 seconds. If so, call `GET /api/profile` to verify the session is still valid:

```
api call requested
    │
    ├── last_activity < 300s ago → skip, proceed with call
    │
    └── last_activity ≥ 300s ago → GET /api/profile
         │
         ├── 200 → update last_activity, proceed
         │
         └── 401 → re-login, then proceed
```

### 2. Cron-based heartbeat
Run every 5 minutes. For all stale sessions (last_activity > 300s ago):
- `GET /api/profile` → valid → `touchActivity()`
- `GET /api/profile` → 401 → re-login with stored credentials
- Re-login fails → mark session expired

---

## Retry & Backoff Configuration

Network errors and 5xx responses are automatically retried:

```
attempt 1: immediate
attempt 2: 2s + random 0-1s jitter
attempt 3: 4s + random 0-1s jitter
attempt 4: 8s + random 0-1s jitter
```

4xx errors (client errors) are **never** retried — they fail immediately.

---

## Standard Error Responses

All endpoints return consistent JSON:

```json
// Session expired
{"message": "Please login", "payload": null}

// Profile not configured
{"message": "Required to set Profile", "payload": null}

// Not found
{"message": "Not found", "payload": null}

// Generic failure
{"message": "<error description>", "payload": null}
```

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `BML_API_BASE_URL` | `https://www.bankofmaldives.com.mv/internetbanking/api/` | API base URL |
| `BML_API_TIMEOUT` | `30` | Request timeout (seconds) |
| `BML_API_CONNECT_TIMEOUT` | `10` | Connection timeout (seconds) |
| `BML_AUTH_MODE` | `web` | `web` (cookie) or `mobile` (token) |
| `BML_HEARTBEAT_INTERVAL` | `300` | Keep-alive interval (seconds) |
| `BML_HEARTBEAT_ENABLED` | `true` | Enable cron heartbeat |
| `BML_USER_AGENT` | `BML/5.2.0 (iPhone; iOS 17.0; Scale/3.0)` | User-Agent header |
| `BML_BACKOFF_MAX_RETRIES` | `3` | Max retry attempts |
| `BML_BACKOFF_BASE_DELAY` | `2` | Base backoff delay (seconds) |
| `BML_BACKOFF_MAX_DELAY` | `60` | Max backoff delay (seconds) |
| `BML_DEBUG_ENABLED` | `false` | Enable request logging to DB |
| `BML_DEBUG_MAX_LOGS` | `5000` | Max stored log entries |
| `BML_DEBUG_LOG_RETENTION_DAYS` | `7` | Log retention in days |
