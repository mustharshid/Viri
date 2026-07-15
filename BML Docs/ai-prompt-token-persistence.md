# AI Agent Prompt: Implement OAuth Token Persistence System for Viri

## Objective

Develop a detailed implementation plan for Viri's new OAuth token persistence system. This system allows cashiers to authorize bank accounts via a one-time popup login to BML, stores the resulting OAuth tokens on the Viri server, and enables the Chrome Extension to retrieve and use those tokens for direct API calls to BML on subsequent visits — without requiring the customer to log in again.

---

## Architecture Overview

```
[Admin Dashboard] ──→ Adds bank account (no credentials)
       │
       ▼
[PWA] ←──postMessage──→ [Popup: BML Login Page (direct)]
  │                          │
  │                    (Customer logs in on BML's actual page)
  │                          │
  │                    [Chrome Extension detects cookies]
  │                          │
  │                    [Extension: PKCE exchange → OAuth tokens]
  │                          │
  │                    [Extension: sends tokens to Viri server]
  │                          │
  │                    [Popup closes]
  │
  │  [Days later: PWA reopens, no tokens in cache]
  │
  ├──→ [Extension: checks local cache (chrome.storage.local)]
  ├──→ [If not found: requests tokens from Viri server]
  ├──→ [Extension: refreshes token if expired]
  ├──→ [Extension: calls BML API directly with Bearer token]
  └──→ [Extension: sends updated tokens to server]
```

---

## Key Design Decisions

1. **Chrome Extension**: Used for CORS bypass and direct PWA-to-BML API calls. Will be converted to `.crx` later.
2. **Popup opens BML directly**: The popup opens `https://www.bankofmaldives.com.mv/internetbanking/web/login` directly (not through a backend proxy). This gives customers confidence they're logging into BML's actual site.
3. **Same credentials detection**: When a new credential is added (not a new account), the system compares `bml_username` to detect shared credentials across accounts.
4. **Token refresh**: Handled by the Chrome Extension, not the backend.
5. **Device ID**: Each credential set holds the same persistent device ID. Multiple accounts sharing the same credentials use the same device ID.
6. **Chrome Extension**: Used for CORS bypass (`declarativeNetRequest`) and direct PWA-to-BML API calls. Will be converted to `.crx` later.

---

## Detailed Flow

### Phase 1: Initial Authorization (One-Time Per Credential Set)

**Step 1: Admin adds bank account (Admin Dashboard)**

The admin adds a bank account for a terminal in the admin dashboard. This creates the bank account record but does NOT include credentials (zero-knowledge architecture).

**Step 2: Cashier adds credentials (PWA)**

The cashier opens the PWA on their terminal. They see the bank account added by the admin but it shows "Not linked" status. The cashier clicks "Link Account" and enters their BML credentials (username, password, TOTP secret). The credentials are encrypted and stored locally in IndexedDB (never sent to the server).

The PWA sends a message to the Chrome Extension:

```javascript
// PWA → Extension
chrome.runtime.sendMessage(extensionId, {
    action: 'start-bml-auth',
    terminalId: 123,
    bankAccountId: 456,
    profileType: 'personal' // or 'business'
});
```

**Step 2: Extension checks for existing tokens**

The extension checks its local cache (`chrome.storage.local`) for existing OAuth tokens for this terminal's `bml_username` + `profile_type`. If not found locally, it checks the server via `GET /api/bml/oauth/tokens?terminal_id=123&bml_username=customer@bml.com&profile_type=personal`.

If tokens exist and are still valid, skip the popup and notify the PWA that authorization is already complete.

**Step 3: PWA opens popup to BML's login page**

The extension responds to the PWA with a signal to open the popup. The PWA opens a popup window directly to BML's login page:

```javascript
var popup = window.open(
    'https://www.bankofmaldives.com.mv/internetbanking/web/login',
    'bml-auth',
    'width=800,height=700'
);
```

The PWA sends the popup's window reference to the extension so it can close the right tab later:

```javascript
chrome.runtime.sendMessage(extensionId, {
    action: 'popup-opened',
    popupRef: popup  // window reference
});
```

The popup opens BML's actual login page directly (not through a proxy). This gives customers confidence they are logging into BML's real site.

**Step 4: Customer logs in on BML's actual page**

The customer enters their BML credentials and completes 2FA (TOTP) on BML's real login page. After successful login, BML redirects to the dashboard.

**Step 5: Extension detects the session cookies**

The Chrome Extension listens for `chrome.cookies.onChanged` events for BML cookies. When it detects valid session cookies (`blaze_session`, `blaze_identity`, `blaze_token`, `XSRF-TOKEN`, `__cf_bm`), it knows the login is complete. This is the most efficient method — no polling needed.

**Step 6: Extension performs PKCE exchange**

Using the captured web session cookies, the extension performs the PKCE OAuth exchange:

1. Generate PKCE parameters: `code_verifier`, `code_challenge` (S256), `state`, `device_id`
2. GET `/internetbanking/oauth/authorize` with the session cookies → get auth code from 302 redirect
3. POST `/internetbanking/oauth/token` with the auth code + verifier → get `access_token` + `refresh_token`

**Step 7: Extension stores tokens locally and on server**

The extension caches tokens locally in `chrome.storage.local` for fast access, and also sends them to the Viri server:

```
POST /api/bml/oauth/store
{
    "terminal_id": 123,
    "bank_account_id": 456,
    "profile_type": "personal",
    "bml_username": "customer@bml.com",
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "device_id": "a1b2c3d4e5f6g7h8",
    "expires_in": 604800
}
```

**Step 8: Extension closes the popup**

The PWA sent the popup's window reference to the extension. The extension uses this reference to close the popup tab and notifies the PWA that authorization is complete.

---

## 3. Token Storage (Viri Server)

### Database Schema

```sql
CREATE TABLE bml_oauth_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    terminal_id BIGINT UNSIGNED NOT NULL,
    bank_account_id BIGINT UNSIGNED NOT NULL,
    bml_username VARCHAR(255) NOT NULL,
    profile_type ENUM('personal', 'business') NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type VARCHAR(20) DEFAULT 'Bearer',
    expires_in INT DEFAULT 0,
    device_id VARCHAR(64) NOT NULL,
    last_grant VARCHAR(32) DEFAULT 'authorization_code',
    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_credential_set (terminal_id, bml_username(100), profile_type)
);
```

**Key design**: The `UNIQUE KEY` on `(terminal_id, bml_username, profile_type)` ensures that accounts sharing the same credentials also share the same OAuth tokens. When a new credential is added with the same `bml_username`, the system reuses the existing tokens.

### API Endpoints

**POST /api/bml/oauth/store** — Save OAuth tokens after initial authorization
```json
{
    "terminal_id": 123,
    "bank_account_id": 456,
    "bml_username": "customer@bml.com",
    "profile_type": "personal",
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "device_id": "a1b2c3d4e5f6g7h8",
    "expires_in": 604800
}
```

**GET /api/bml/oauth/tokens** — Retrieve tokens for a bank account
```
GET /api/bml/oauth/tokens?terminal_id=123&bank_account_id=456
```
Response:
```json
{
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "device_id": "a1b2c3d4e5f6g7h8",
    "expires_in": 604800,
    "expires_at": "2026-07-22T15:51:29Z"
}
```

**POST /api/bml/oauth/update** — Update tokens after refresh
```json
{
    "terminal_id": 123,
    "bank_account_id": 456,
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "expires_in": 604800
}
```

---

## 4. Token Retrieval (Days Later)

When the PWA reopens and the cashier wants to verify a transfer:

1. PWA checks if tokens are in local cache (IndexedDB or extension storage)
2. If not found, PWA sends message to extension: `{ action: "get-tokens", terminalId, bankAccountId }`
3. Extension checks its local cache (`chrome.storage.local`) first
4. If not found locally, extension calls `GET /api/bml/oauth/tokens?terminal_id=X&bank_account_id=Y`
5. Server returns the stored tokens (or 404 if none exist)
6. Extension caches the tokens locally in `chrome.storage.local`
7. Extension checks if `access_token` is expired (with 5-minute buffer)
8. If expired, extension performs token refresh:
   ```
   POST /internetbanking/oauth/token
   grant_type=refresh_token
   refresh_token=<stored refresh_token>
   client_id=98C83590-513F-4716-B02B-EC68B7D9E7E7
   Device-ID=<stored device_id>
   User-Agent=bml-mobile-banking/348 (samsung; Android 14; SM-G998B)
   x-app-version=2.1.44.348
   ```
9. If refresh succeeds: save new tokens locally, send updated tokens to server via `POST /api/bml/oauth/update`
10. If refresh fails (refresh_token expired/revoked): prompt the user to re-link the account via the popup flow
11. Extension uses the valid access_token for BML API calls

---

## 4. Direct API Calls (PWA → BML via Extension)

The PWA never calls BML directly. All BML API calls go through the Chrome Extension:

1. PWA sends message to extension: `{ action: "call-bml-api", endpoint: "/api/mobile/dashboard", bankAccountId: 456 }`
2. Extension retrieves the valid access_token (from local cache or server, refreshes if needed)
3. Extension makes the API call to BML:
   ```
   GET https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard
   Authorization: Bearer <access_token>
   User-Agent: bml-mobile-banking/348 (samsung; Android 14; SM-G998B)
   x-app-version: 2.1.44.348
   ```
4. Extension uses `declarativeNetRequest` to bypass CORS
5. Extension returns the response to the PWA

---

## 5. Multi-Account Handling

### Same Credentials, Multiple Accounts

When a cashier adds a new credential (not a new account) in the PWA:

1. PWA sends to extension: `{ action: "add-credential", terminalId, bmlUsername, profileType: "personal"|"business" }`
2. Extension checks its local cache (`chrome.storage.local`) for existing tokens for this `bml_username` + `profile_type`
3. If not found locally, extension checks the server via `GET /api/bml/oauth/tokens?terminal_id=X&bml_username=Y&profile_type=Z`
4. If tokens exist on the server: retrieve them, cache locally, reuse them
5. If tokens don't exist anywhere: initiate the popup authorization flow

The server stores tokens keyed by `(terminal_id, bml_username, profile_type)`. When a new credential is added with the same `bml_username` and `profile_type`, the server returns the existing tokens.

### Personal vs Business Accounts

Personal and business accounts are treated as separate credential sets. Even if the same `bml_username` is used, the system treats them separately because BML may issue different tokens for personal vs business profiles.

When a cashier adds credentials in the PWA, they select "Personal" or "Business" profile type. The system uses `(terminal_id, bml_username, profile_type)` as the unique key for tokens.

---

## 5. Device ID

Each credential set holds the same persistent device ID. When the PKCE exchange is performed for the first time, a device ID is generated. All subsequent token refreshes and API calls for that credential set use the same device ID.

- Device ID is generated once during the initial PKCE exchange
- Stored on the server with the tokens
- Cached locally in `chrome.storage.local`
- Used for all token refreshes and API calls

---

## 6. Token Refresh Flow

The Chrome Extension handles token refresh:

1. Before making a BML API call, extension checks if `access_token` is expired
2. If expired (or within 5-minute buffer), extension performs refresh:
   ```
   POST /internetbanking/oauth/token
   grant_type=refresh_token
   refresh_token=<stored refresh_token>
   client_id=98C83590-513F-4716-B02B-EC68B7D9E7E7
   Device-ID=<stored device_id>
   User-Agent=bml-mobile-banking/348 (samsung; Android 14; SM-G998B)
   x-app-version=2.1.44.348
   ```
3. BML returns new `access_token` and possibly a new `refresh_token` (rotation)
4. Extension saves the new tokens locally in `chrome.storage.local`
5. Extension sends updated tokens to server: `POST /api/bml/oauth/update`
6. Extension uses the new access_token for the API call
7. If refresh fails (refresh_token expired/revoked): prompt the user to re-link the account via the popup authorization flow

---

## 4. Direct API Calls (PWA → BML via Extension)

The PWA never calls BML directly. All BML API calls go through the Chrome Extension:

1. PWA sends message to extension: `{ action: "call-bml-api", endpoint: "/api/mobile/dashboard", bankAccountId: 456 }`
2. Extension checks its local cache (`chrome.storage.local`) for a valid access_token
3. If not found locally, extension requests from server: `GET /api/bml/oauth/tokens?terminal_id=X&bank_account_id=Y`
4. Extension caches the retrieved tokens locally
5. If access_token is expired, extension performs token refresh
6. If refresh fails (refresh_token expired/revoked): prompt the user to re-link the account via the popup authorization flow
7. Extension makes the API call to BML:
   ```
   GET https://www.bankofmaldives.com.mv/internetbanking/api/mobile/dashboard
   Authorization: Bearer <access_token>
   User-Agent: bml-mobile-banking/348 (samsung; Android 14; SM-G998B)
   x-app-version: 2.1.44.348
   ```
8. Extension uses `declarativeNetRequest` to bypass CORS
9. Extension returns the response to the PWA

---

## 5. Multi-Account Handling

### Same Credentials, Multiple Accounts

When a cashier adds a new credential (not a new account) in the PWA:

1. PWA sends to extension: `{ action: "add-credential", terminalId, bmlUsername, profileType: "personal"|"business" }`
2. Extension checks its local cache (`chrome.storage.local`) for existing tokens for this `bml_username` + `profile_type`
3. If not found locally, extension checks the server via `GET /api/bml/oauth/tokens?terminal_id=X&bml_username=Y&profile_type=Z`
4. If tokens exist on the server: retrieve them, cache locally, reuse them (same device ID, same refresh_token)
5. If tokens don't exist anywhere: initiate the popup authorization flow

The server stores tokens keyed by `(terminal_id, bml_username, profile_type)`. When a new credential is added with the same `bml_username` and `profile_type`, the server returns the existing tokens.

### Personal vs Business Accounts

Personal and business accounts are treated as separate credential sets. Even if the same `bml_username` is used, the system treats them separately because BML may issue different tokens for personal vs business profiles.

When a cashier adds credentials in the PWA, they select "Personal" or "Business" profile type. The system uses `(terminal_id, bml_username, profile_type)` as the unique key for tokens.

---

## 5. Device ID

Each credential set holds the same persistent device ID. When the PKCE exchange is performed for the first time, a device ID is generated. All subsequent token refreshes and API calls for that credential set use the same device ID.

- Device ID is generated once during the initial PKCE exchange
- Stored on the server with the tokens
- Cached locally in `chrome.storage.local`
- Used for all token refreshes and API calls

---

## 6. Token Refresh Flow

The Chrome Extension handles token refresh:

1. Before making a BML API call, extension checks if `access_token` is expired
2. If expired (or within 5-minute buffer), extension performs refresh:
   ```
   POST /internetbanking/oauth/token
   grant_type=refresh_token
   refresh_token=<stored refresh_token>
   client_id=98C83590-513F-4716-B02B-EC68B7D9E7E7
   Device-ID=<stored device_id>
   User-Agent=bml-mobile-banking/348 (samsung; Android 14; SM-G998B)
   x-app-version=2.1.44.348
   ```
3. BML returns new `access_token` and possibly a new `refresh_token` (rotation)
4. Extension saves the new tokens locally in `chrome.storage.local`
5. Extension sends updated tokens to server: `POST /api/bml/oauth/update`
6. Extension uses the new access_token for the API call
7. If refresh fails (refresh_token expired/revoked): prompt the user to re-link the account via the popup authorization flow

---

## 7. API Endpoints (Viri Server)

### POST /api/bml/oauth/store

Store OAuth tokens after initial authorization.

```json
{
    "terminal_id": 123,
    "bank_account_id": 456,
    "bml_username": "customer@bml.com",
    "profile_type": "personal",
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "device_id": "a1b2c3d4e5f6g7h8",
    "expires_in": 604800
}
```

Response: `{ "success": true }`

### GET /api/bml/oauth/tokens

Retrieve stored tokens for a bank account.

```
GET /api/bml/oauth/tokens?terminal_id=123&bank_account_id=456
```

Response:
```json
{
    "access_token": "eyJ...",
    "refresh_token": "def5...",
    "device_id": "a1b2c3d4e5f6g7h8",
    "expires_in": 604800,
    "expires_at": "2026-07-22T15:51:29Z"
}
```

### POST /api/bml/oauth/update

Update tokens after refresh (token rotation).

```json
{
    "terminal_id": 123,
    "bank_account_id": 456,
    "access_token": "eyJ...",
    "refresh_token": "def5..."
}
```

Response: `{ "success": true }`

---

## 7. Implementation Plan

### Phase 1: Backend (Laravel)

1. Create migration for `bml_oauth_tokens` table
2. Create `BmlOAuthController` with endpoints:
   - `POST /api/bml/oauth/store`
   - `GET /api/bml/oauth/tokens`
   - `POST /api/bml/oauth/update`
3. Add routes to `routes/api.php`
4. Add authentication middleware (Sanctum) to protect endpoints
5. Add token encryption (encrypt `access_token` and `refresh_token` at rest)

### Phase 2: Chrome Extension

1. Add `runBmlOAuthFlow()` function:
   - Generate PKCE parameters (code_verifier, code_challenge, state, device_id)
   - GET `/internetbanking/oauth/authorize` with web session cookies → get auth code
   - POST `/internetbanking/oauth/token` with auth code → get tokens
   - Send tokens to server via `POST /api/bml/oauth/store`

2. Add cookie detection logic:
   - Listen for `chrome.cookies.onChanged` events for BML cookies
   - When valid session cookies are detected, trigger PKCE exchange

3. Add `refreshBmlToken()` function:
   - Check if access_token is expired
   - POST `/internetbanking/oauth/token` with `grant_type=refresh_token`
   - Save new tokens locally in `chrome.storage.local`
   - Send updated tokens to server

4. Add `getValidAccessToken()` function:
   - Check local cache (`chrome.storage.local`) for valid access_token
   - If not found, request from server via `GET /api/bml/oauth/tokens`
   - If expired, refresh
   - If refresh fails, prompt user to re-link account
   - Return valid access_token

5. Add message handlers for PWA communication:
   - `start-bml-auth` — initiate popup authorization
   - `get-tokens` — retrieve tokens for a bank account
   - `call-bml-api` — make a BML API call with Bearer token

6. Add `declarativeNetRequest` rules for CORS bypass on BML domains

### Phase 3: PWA

1. Add "Link Account" button in PWA settings (credentials are added from PWA, not admin dashboard)
2. On click, send message to extension to start authorization
3. Open popup to BML's login page
4. Send popup's window reference to the extension so it can close the right tab
5. Listen for `postMessage` from extension when authorization is complete
6. Add token retrieval flow: when PWA reopens, request tokens from extension
7. Display account status (linked/not linked) in settings

### Phase 4: Integration

1. Update existing `runBmlFlow()` to also perform PKCE exchange after login
2. Add token refresh before any BML API call
3. Add fallback: if refresh_token is expired, prompt user to re-link the account via the popup authorization flow
4. Test with multiple accounts sharing the same credentials
5. Test with personal and business accounts

---

## 8. Key Implementation Details

### PKCE Parameters

```javascript
function generatePKCE() {
    const codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const codeChallenge = btoa(
        String.fromCharCode(...new Uint8Array(
            crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
        ))
    ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const state = crypto.randomUUID();
    const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    return { codeVerifier, codeChallenge, state, deviceId };
}
```

### User-Agent Headers

| Where | Value |
|---|---|
| HTTP header `User-Agent` | Browser UA (e.g., `Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0`) |
| Form body field `User-Agent` | App UA (e.g., `bml-mobile-banking/348 (samsung; Android 14; SM-G998B)`) |

Both must be present and correct, or BML rejects the request.

### Device ID

- Generated once during the initial PKCE exchange
- Persisted per credential set (same for all accounts sharing the same `bml_username` + `profile_type`)
- Stored on the server with the tokens
- Cached locally in `chrome.storage.local`
- Used for all token refreshes and API calls

### Token Refresh

```javascript
async function refreshToken(refreshToken, deviceId) {
    const body = new URLSearchParams({
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
        'client_id': '98C83590-513F-4716-B02B-EC68B7D9E7E7',
        'Device-ID': deviceId,
        'User-Agent': 'bml-mobile-banking/348 (samsung; Android 14; SM-G998B)',
        'x-app-version': '2.1.44.348',
    });

    const response = await fetch('https://www.bankofmaldives.com.mv/internetbanking/oauth/token', {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
    });

    return await response.json();
}
```

### CORS Bypass (declarativeNetRequest)

```json
{
    "id": 1,
    "priority": 1,
    "action": {
        "type": "modifyHeaders",
        "responseHeaders": [
            { "header": "Access-Control-Allow-Origin", "operation": "set", "value": "*" },
            { "header": "Access-Control-Allow-Methods", "operation": "set", "value": "GET, POST, OPTIONS" },
            { "header": "Access-Control-Allow-Headers", "operation": "set", "value": "*" }
        ]
    },
    "condition": {
        "urlFilter": "||bankofmaldives.com.mv/internetbanking/api/",
        "resourceTypes": ["xmlhttprequest"]
    }
}
```

---

## 9. Database Schema

```sql
CREATE TABLE bml_oauth_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    terminal_id BIGINT UNSIGNED NOT NULL,
    bank_account_id BIGINT UNSIGNED NOT NULL,
    bml_username VARCHAR(255) NOT NULL,
    profile_type ENUM('personal', 'business') NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type VARCHAR(20) DEFAULT 'Bearer',
    expires_in INT DEFAULT 0,
    device_id VARCHAR(64) NOT NULL,
    last_grant VARCHAR(32) DEFAULT 'authorization_code',
    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_credential_set (terminal_id, bml_username(100), profile_type)
);
```

---

## 10. Testing Checklist

- [ ] Popup opens BML's login page directly
- [ ] Customer can log in on BML's actual page
- [ ] Extension detects session cookies via `chrome.cookies.onChanged`
- [ ] Extension performs PKCE exchange successfully
- [ ] Tokens are cached locally in `chrome.storage.local`
- [ ] Tokens are stored on the server
- [ ] PWA can retrieve tokens from the server on reopen
- [ ] Extension refreshes expired tokens
- [ ] Updated tokens are sent to the server
- [ ] Multiple accounts sharing the same credentials reuse the same tokens
- [ ] Personal and business accounts have separate tokens
- [ ] Direct BML API calls work with Bearer token (CORS bypass via extension)
- [ ] Popup closes automatically after authorization
- [ ] PWA receives notification when authorization is complete
- [ ] If refresh fails, user is prompted to re-link the account

---

## 11. Answered Design Questions

1. **Login detection**: Use `chrome.cookies.onChanged` (most efficient — no polling needed)
2. **Popup tab reference**: PWA sends the popup's window reference to the extension so it can close the right tab
3. **Same credentials detection**: Extension checks local cache first, then server, before initiating popup
4. **Local caching**: Extension caches tokens in `chrome.storage.local` to avoid server round-trips
5. **Expired refresh_token**: If refresh fails, prompt the user to re-link the account via the popup authorization flow
