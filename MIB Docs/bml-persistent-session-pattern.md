# BML Persistent Session Pattern — Replication Guide for AI Agents

- **Reverse-engineered from**: BML Android App (v1.0.23.2, package `mv.com.bml.mib`)  
- **Base URL**: `https://ebanking.bankofmaldives.com.mv`  
- **Purpose**: Explain how BML's mobile app stays authenticated for days across reboots, and how to replicate this pattern in a web app.

---

## 1. Core Architecture

BML uses a **three-layer session model**:

| Layer | What | Lifespan | Purpose |
|-------|------|----------|---------|
| **Credentials** | `username`, `password`, `pincode` | Permanent (encrypted at rest) | Re-authenticate silently |
| **OAuth2 Token** | `access_token` + `refresh_token` | Access: short (~10m), Refresh: long (days/weeks) | Primary auth for API |
| **Cookie Session** | `blaze_session`, `blaze_token`, `blaze_identity`, `XSRF-TOKEN`, `__cf_bm` | 600s (refreshed periodically) | Server-side session binding |

**Key insight**: The mobile app doesn't rely on cookies alone. Cookies are the *web* session layer. The mobile app uses **OAuth2 refresh tokens** as the durable credential. Cookies are a convenience layer on top.

---

## 2. How the App Survives Reboots & Days Offline

```
Phone off for days
        │
Phone powers on, user opens app
        │
        ▼
┌─────────────────────────┐
│ 1. Local PIN/Fingerprint │ ← No network needed
│    unlock                │
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│ 2. Read encrypted       │ ← PaperDB (Kryo serialized)
│    credentials +        │    from app's internal storage
│    refresh_token from   │
│    disk                 │
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│ 3. POST /oauth/token    │ ← Exchange refresh_token
│    grant_type=          │    for new access_token
│    refresh_token        │    (no username/password/OTP)
└─────────┬───────────────┘
          ▼
┌─────────────────────────┐
│ 4. Set new cookies      │ ← blaze_token, blaze_session,
│    from response         │    etc. from server
└─────────┬───────────────┘
          ▼
      Resume API calls ──→ GET /api/dashboard → 200 OK
```

---

## 3. Full Authentication Flow (with HTTP Traces)

### 3.1 Initial Login — Step by Step

Below is the complete flow with dummy data, showing every request and response.

---

**Step 1 — Submit credentials**

```
POST /internetbanking/web/login
Host: ebanking.bankofmaldives.com.mv
Content-Type: application/json
Accept: application/json
X-Inertia: true
X-Requested-With: XMLHttpRequest
X-Device-ID: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
X-Device-Platform: android
User-Agent: BML/2.0 (Android 16; SM-G998B)

{
    "username": "ahmed.mohamed",
    "password": "P@ssw0rd123",
    "code": ""
}
```

```
← 302 Redirect
Location: /internetbanking/web/login/2fa
Set-Cookie: XSRF-TOKEN=eyJpdiI6Im...; Max-Age=600
Set-Cookie: blaze_session=7b226c6f...; Max-Age=600; HttpOnly
```

---

**Step 2 — Request OTP via WhatsApp**

```
POST /internetbanking/web/login/2fa
Cookie: XSRF-TOKEN=eyJpdiI6Im...; blaze_session=7b226c6f...

{
    "code": "",
    "channel": "whatsapp"
}
```

```
← 200 OK (OTP sent to WhatsApp)
```

---

**Step 3 — Submit OTP**

```
POST /internetbanking/web/login/2fa
Cookie: XSRF-TOKEN=eyJpdiI6Im...; blaze_session=7b226c6f...

{
    "code": "844194",
    "channel": "whatsapp"
}
```

```
← 302 Redirect
Location: /internetbanking/web/profile
Set-Cookie: XSRF-TOKEN=eyJpdiI6Im...; Max-Age=600
Set-Cookie: blaze_session=7b226c6f...; Max-Age=600; HttpOnly
```

---

**Step 4 — Business profile 2FA (if applicable)**

```
POST /internetbanking/web/profile/2fa/business
Cookie: XSRF-TOKEN=...; blaze_session=...; blaze_token=...; blaze_identity=...; __cf_bm=...

{
    "code": "844195",
    "channel": "whatsapp"
}
```

```
← 302 Redirect
Location: /internetbanking/vf/accounts/overview
Set-Cookie: blaze_token=eyJ0eXAiOiJKV1QiLCJ...; Max-Age=600; HttpOnly
Set-Cookie: blaze_identity=def123...; Expires=Session; HttpOnly
Set-Cookie: XSRF-TOKEN=eyJpdiI6Im...; Max-Age=600
Set-Cookie: blaze_session=7b226c6f...; Max-Age=600; HttpOnly
Set-Cookie: __cf_bm=abc123...; Max-Age=1800; HttpOnly
```

---

**Step 5 — OAuth2 token exchange (SPA → BML)**

The SPA receives an `authorization_code` and exchanges it for tokens:

```
POST /internetbanking/oauth/token
Content-Type: application/x-www-form-urlencoded
Cookie: XSRF-TOKEN=...; blaze_session=...; blaze_token=...; blaze_identity=...; __cf_bm=...

grant_type=authorization_code
&client_id=992A03D8-AF29-4C6D-ACB8-C95360F2DB40
&code=def456
&redirect_uri=com.bml.mib://oauth/callback
```

```
← 200 OK

{
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI5OTJBMDNEOC1BRjI5LTRDNkQtQUNCOC1DOTUzNjBGMkRCNDAiLCJqdGkiOiI1YzI5Y...",
    "refresh_token": "def50200a5b7e8c9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
    "token_type": "Bearer",
    "expires_in": 600
}
```

---

### 3.2 What Gets Stored After Login

In database (encrypted at rest):

```json
{
    "user": { "username": "ahmed.mohamed" },
    "device": {
        "device_id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        "platform": "android"
    },
    "session": {
        "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
        "type": "proxy-captured"
    },
    "cookies": {
        "XSRF-TOKEN": "eyJpdiI6Im...",
        "blaze_session": "7b226c6f...",
        "blaze_token": "eyJ0eXAiOiJKV1QiLCJ...",
        "blaze_identity": "def123...",
        "__cf_bm": "abc123..."
    },
    "oauth": {
        "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
        "refresh_token": "def50200a5b7e8c9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4...",
        "token_type": "Bearer",
        "expires_in": 600,
        "last_grant": "authorization_code"
    },
    "captured_at": "2026-07-14T10:30:00+05:00"
}
```

Credentials encrypted separately with AES-256-GCM:

```json
{
    "username": "ahmed.mohamed",
    "password": "P@ssw0rd123"
}
```

---

### 3.3 Session Revival — Days Later, Phone Was Off

**Step 1 — PIN unlock (local only, no network call)**

```
No HTTP call. PIN verified against stored hash on device.
```

**Step 2 — OAuth2 refresh token exchange**

```
POST /internetbanking/oauth/token
Host: ebanking.bankofmaldives.com.mv
Content-Type: application/x-www-form-urlencoded
Accept: application/json
X-Device-ID: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
X-Device-Platform: android
User-Agent: BML/2.0 (Android 16; SM-G998B)
Cookie: XSRF-TOKEN=eyJpdiI6Im...; blaze_session=7b226c6f...;  __cf_bm=abc123...
        ↑ These may be stale/expired — the refresh grant doesn't depend on them

grant_type=refresh_token
&client_id=992A03D8-AF29-4C6D-ACB8-C95360F2DB40
&refresh_token=def50200a5b7e8c9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4...
&scope=*
```

```
← 200 OK

{
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.NEWTOKEN...",
    "refresh_token": "ghijklmnopqr...",  ← rotated (old one invalidated)
    "token_type": "Bearer",
    "expires_in": 600
}
```

The server may also set fresh cookies:

```
Set-Cookie: blaze_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.NEWTOKEN...; Max-Age=600; HttpOnly
Set-Cookie: XSRF-TOKEN=neweyJpdiI6Im...; Max-Age=600
Set-Cookie: blaze_session=new7b226c6f...; Max-Age=600; HttpOnly
```

**Step 3 — Call API with fresh credentials**

```
GET /internetbanking/api/dashboard
Host: ebanking.bankofmaldives.com.mv
Accept: application/json
X-Device-ID: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
X-Device-Platform: android
User-Agent: BML/2.0 (Android 16; SM-G998B)
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.NEWTOKEN...
Cookie: XSRF-TOKEN=neweyJpdiI6Im...; blaze_session=new7b226c6f...;
        blaze_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.NEWTOKEN...;
        blaze_identity=def123...; __cf_bm=abc123...
```

```
← 200 OK

{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "userInfo": { "user": { "fullname": "Ahmed Mohamed", "guid": "9B087717-...", "cif": "111524" } },
        "dashboard": [
            {
                "id": 1,
                "account": "7730000123456",
                "product_name": "BML Savings Account",
                "alias": "My Savings",
                "workingBalance": "25000.50",
                "ledgerBalance": "25000.50",
                "currency": "MVR",
                "account_type": "SAVINGS"
            }
        ]
    }
}
```

---

### 3.4 What Makes Revival Work Without User Interaction

| Aspect | Login | Revival |
|--------|-------|---------|
| **Credentials sent** | `username` + `password` | None (only `refresh_token`) |
| **2FA required** | Yes (OTP via WhatsApp) | No |
| **What's stored** | All cookies + `refresh_token` + encrypted credentials | Only `refresh_token` used |
| **Number of HTTP calls** | 4-5 (login, 2FA, business 2FA, OAuth exchange, dashboard) | 2 (OAuth refresh, dashboard) |
| **User interaction** | Full credentials + OTP input | PIN only (local) |

The `refresh_token` is the key — it's a long-lived credential that acts like a "remember this device forever" token. BML's OAuth2 server issues it after the initial full 2FA flow, and it can be exchanged for a new `access_token` at any time without re-authentication.

---

## 4. OAuth2 Token Model (Summary)

```
access_token  (short-lived, ~10 min)  ↔  Sent as blaze_token cookie
                                          Used for /api/* endpoints

refresh_token (long-lived, days/weeks)  ↔  Stored in encrypted device storage
                                          Used to get new access_token
                                          Survives reboots and offline periods
```

### ⚠️ Critical: The refresh grant requires NO user interaction

- No username needed
- No password needed
- No OTP/2FA needed
- Device can be off for days

---

## 5. Replicating This in a Web App

### 5.1 Layered Session Store

```
┌──────────────────────────────────┐
│         Layer 3: Cookies         │ ← In-memory + DB (current server session)
│   (blaze_session, blaze_token,   │
│    XSRF-TOKEN, blaze_identity)   │
├──────────────────────────────────┤
│         Layer 2: OAuth2          │ ← DB (encrypted at rest)
│   (access_token, refresh_token)  │
├──────────────────────────────────┤
│         Layer 1: Credentials     │ ← DB (AES-256 encrypted)
│   (username, password, device)   │
└──────────────────────────────────┘
```

## 5. Replicating This in a Web App

### 5.1 Layered Session Store

```
┌──────────────────────────────────┐
│         Layer 3: Cookies         │ ← In-memory + DB (current server session)
│   (blaze_session, blaze_token,   │
│    XSRF-TOKEN, blaze_identity)   │
├──────────────────────────────────┤
│         Layer 2: OAuth2          │ ← DB (encrypted at rest)
│   (access_token, refresh_token)  │
├──────────────────────────────────┤
│         Layer 1: Credentials     │ ← DB (AES-256 encrypted)
│   (username, password, device)   │
└──────────────────────────────────┘
```

### 5.2 Credential Storage (Encrypted)

```php
class CredentialStore
{
    public static function encrypt(array $credentials): string
    {
        $json = json_encode($credentials);
        $cipher = 'aes-256-gcm';
        $key = hex2bin(env('CREDENTIAL_ENCRYPTION_KEY'));
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($json, $cipher, $key, OPENSSL_RAW_DATA, $iv, $tag);
        return base64_encode($iv . $tag . $ciphertext);
    }

    public static function decrypt(string $payload): array
    {
        $data = base64_decode($payload);
        $cipher = 'aes-256-gcm';
        $key = hex2bin(env('CREDENTIAL_ENCRYPTION_KEY'));
        $iv = substr($data, 0, 12);
        $tag = substr($data, 12, 16);
        $ciphertext = substr($data, 28);
        $json = openssl_decrypt($ciphertext, $cipher, $key, OPENSSL_RAW_DATA, $iv, $tag);
        return json_decode($json, true);
    }
}
```

### 5.3 Device Identity

The app uses a persistent device ID (`X-Device-ID`) sent with every request. BML's server uses this to recognize trusted devices.

```php
class DeviceIdentity
{
    public static function getId(): string
    {
        $file = storage_path('app/device_id.txt');
        if (!file_exists($file)) {
            file_put_contents($file, bin2hex(random_bytes(16)));
        }
        return trim(file_get_contents($file));
    }

    public static function getHeaders(): array
    {
        return [
            'X-Device-ID'       => self::getId(),
            'X-Device-Platform' => 'proxy',    // or 'android', 'ios'
            'User-Agent'        => 'BML/2.0 (Android 16; SM-G998B)',
        ];
    }
}
```

### 5.4 Session Resume Flow

```
function resumeSession(userId) {
    1.  Load encrypted credentials + refresh_token from DB

    2.  If refresh_token exists:
        POST /oauth/token { grant_type: "refresh_token", refresh_token }
        
        If 200:
            Update stored access_token + refresh_token
            Update cookies from response
            Return session is active ✓

        If 401 (refresh_token expired):
            Fall through to credential re-auth

    3.  If no refresh_token or it expired:
        POST /web/login { username, password, code: "" }
        Include X-Device-ID + X-Device-Platform + stored cookies
        
        If 302 → /vf/accounts/overview:
            Device trust bypass succeeded
            Follow redirects, capture new cookies
            Try API again
        
        If 302 → /web/login/2fa:
            OTP required — user interaction needed
            Return "session_expired"

    4.  If all fail:
        Return "session_expired — full re-login required"
}
```

### 5.5 Cookie Management

```php
class CookieJar
{
    private array $cookies = [];

    public function parseFromResponse(array $responseHeaders): void
    {
        foreach ($responseHeaders as $name => $values) {
            if (strtolower($name) === 'set-cookie') {
                foreach ((array) $values as $header) {
                    $parsed = $this->parseSetCookie($header);
                    if ($parsed) {
                        $this->cookies[$parsed['name']] = $parsed['value'];
                    }
                }
            }
        }
    }

    public function toHeaderString(): string
    {
        return implode('; ', array_map(
            fn($k, $v) => "$k=$v",
            array_keys($this->cookies),
            $this->cookies
        ));
    }

    private function parseSetCookie(string $header): ?array
    {
        $parts = explode(';', $header);
        $first = explode('=', trim($parts[0]), 2);
        if (count($first) !== 2) return null;
        return ['name' => $first[0], 'value' => $first[1]];
    }
}
```

### 5.6 Background Keepalive

The Android app runs a background `BMLDataRefreshService`. For a web app, use a cron job/scheduler:

```php
// Every 5 minutes — runs while the app is "active"
function sessionKeepalive(User $user): void
{
    $session = $user->activeBmlSession();
    if (!$session || $session->isExpired()) return;

    $cookies = $session->getCookies();
    $device = DeviceIdentity::getHeaders();

    // Ping the auxiliary endpoints (these carry the session cookie)
    $response = httpGet(
        'https://ebanking.bankofmaldives.com.mv/bms/auxiliary/v2/service/rates',
        array_merge($device, ['Cookie' => $cookies->toHeaderString()])
    );

    // Capture any refreshed cookies
    $cookies->parseFromResponse($response->headers);
    $session->saveCookies($cookies);
}
```

### 5.7 Session Health Check

```php
function checkSession(User $user): string
{
    // Returns: 'active' | 'expired' | 'needs_reauth'

    $session = $user->activeBmlSession();
    if (!$session) return 'needs_reauth';

    $response = httpGet(
        'https://ebanking.bankofmaldives.com.mv/resources/sessionparameters',
        array_merge(
            DeviceIdentity::getHeaders(),
            ['Cookie' => $session->getCookies()->toHeaderString()]
        )
    );

    if ($response->status === 200) {
        $session->touch(); // update last_used_at
        return 'active';
    }

    // Attempt refresh-token re-auth
    return attemptOAuthRefresh($user)
        ? 'active'
        : 'expired';
}
```

### 5.8 Pin/Biometric Lock (Local Auth)

The app stores credentials encrypted at rest, gated by a local PIN. In a web app:

```php
class LocalAuth
{
    // On first login:
    public static function setupPin(User $user, string $pin): void
    {
        $hash = password_hash($pin, PASSWORD_BCRYPT);
        $credentials = [
            'username' => $user->bml_username,
            'password' => decrypt($user->bml_password),  // from your own encrypted store
        ];
        $encrypted = CredentialStore::encrypt($credentials);
        
        $user->update([
            'pin_hash'        => $hash,
            'encrypted_bml'   => $encrypted,
            'encrypted_at'    => now(),
        ]);
    }

    // On resume:
    public static function verifyPin(User $user, string $pin): ?array
    {
        if (!password_verify($pin, $user->pin_hash)) return null;
        return CredentialStore::decrypt($user->encrypted_bml);
    }
}
```

---

## 6. Database Schema

```sql
CREATE TABLE bml_sessions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,          -- references your users table
    status          ENUM('active','expired','revoked') DEFAULT 'active',
    
    -- OAuth2 tokens (encrypted)
    access_token    TEXT NULL,
    refresh_token   TEXT NULL,
    token_expires_at DATETIME NULL,
    token_type      VARCHAR(20) DEFAULT 'Bearer',
    
    -- Credentials (AES-256 encrypted JSON blob)
    encrypted_credentials TEXT NULL,
    credentials_meta      JSON NULL,                 -- {encryption_key_id, iv, tag, algo}
    
    -- Cookies (serialized JSON)
    cookies         JSON NULL,                        -- {xsrf_token, blaze_session, blaze_token, ...}
    
    -- Device identity
    device_id       VARCHAR(64) NOT NULL,
    device_platform VARCHAR(20) DEFAULT 'web',
    
    -- Timing
    last_used_at    DATETIME NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uniq_user_device (user_id, device_id)
);
```

---

## 7. Full Session Lifecycle Summary

```
                    FIRST TIME SETUP
                    ───────────────
                    Full login via browser
                    (credentials + 2FA)
                           │
                           ▼
                    OAuth2 authorization_code
                    exchange → access_token + refresh_token
                           │
                           ▼
                    Store refresh_token (encrypted)
                    Store credentials (encrypted)
                    Store cookies
                    Store device_id
                    ─────────────────────

                    DAILY RESUME
                    ────────────
                    PIN/biometric unlock (local)
                           │
                           ▼
                    Exchange refresh_token → new access_token
                           │
                           ▼
                    Set cookies from response
                           │
                           ▼
                    Call API → success
                    ─────────────────

                    SESSION EXPIRED
                    ───────────────
                    API returns 401
                           │
                           ▼
                    Try refresh_token
                      ├── OK → resume
                      └── Fail →
                           Try device trust re-auth
                             ├── OK → resume (limited)
                             └── Fail → full login required
                    ─────────────────────
```

---

## 8. Key Differences: Mobile App vs Web Proxy

| Aspect | Mobile App | Web Proxy / AI Agent |
|--------|-----------|---------------------|
| Token storage | Device Keychain / Keystore (OS-level encrypted) | Database (encrypted at application level) |
| Local unlock | Biometric + PIN (OS-level) | PIN/hash check (application-level) |
| Background keepalive | Android Service (while app is backgrounded) | Cron job / queue worker (while session is "active") |
| Device ID | ANDROID_ID / hardware UUID | Generated UUID stored in file or DB |
| OTP delivery | SMS broadcast receiver (auto-fill) | User must input manually |
| Long offline | Works (refresh_token survives) | Works if refresh_token is stored and unexpired |

---

## 9. Implementation Checklist for AI Agents

- [ ] Implement AES-256-GCM credential encryption/decryption
- [ ] Create `bml_sessions` database table
- [ ] Build `DeviceIdentity` class (persistent device ID + headers)
- [ ] Build `CookieJar` class (parse, merge, serialize cookies)
- [ ] Implement OAuth2 refresh token flow (`POST /oauth/token`)
- [ ] Implement device trust re-auth (`POST /web/login`)
- [ ] Implement full 2FA login flow (credentials → OTP → business OTP)
- [ ] Add session health check (poll `/resources/sessionparameters` or `/api/profile`)
- [ ] Build PIN/local-auth gate before using stored credentials
- [ ] Add periodic keepalive (cron job pinging auxiliary endpoints)
- [ ] Add session expiry detection and automatic re-auth chain
- [ ] Document the triple-union cookie merge rule: `existing DB ∪ browser ∪ Set-Cookie`
