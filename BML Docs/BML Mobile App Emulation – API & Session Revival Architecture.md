# BML Mobile App Emulation – API & Session Revival Architecture  
## Document Version: 1.0 Target: PWA + Backend (Laravel + Node.js) Goal: Emulate the Bank of Maldives (BML) mobile app's persistent session behavior, allowing users to revisit the PWA and instantly access their accounts without re-entering any OTP (Authenticator or SMS), using server-side persistent cookies.  
##   
## 1. Architectural Overview  
## We will build a Node.js Proxy Service that:  
* **Maintains a persistent cookie jar** per user in Redis.  
* **Simulates a trusted mobile device** using a static X-Device-ID header.  
* **Revives expired sessions** automatically using stored credentials.  
* **Keeps sessions alive** with a background heartbeat.  
* **Exposes a clean REST API** to the frontend.  
```
text
┌────────────┐          ┌─────────────────────────────────────────────────────────────┐
│   PWA      │          │           BML Mobile Emulation Proxy (Node.js)              │
│            │          │  - Redis-backed Cookie Jar per user                        │
│            │──────────│  - Background Heartbeat (every 4 min)                      │
│ (PIN/Token)│          │  - Device ID emulation (X-Device-ID)                      │
└────────────┘          │  - Silent Re-authentication logic                         │
                        └──────────────────────┬──────────────────────────────────────┘
                                               │ (HTTPS)
                                               ▼
                              ┌─────────────────────────────────────┐
                              │   Bank of Maldives Legacy/Mobile    │
                              │   API (www.bankofmaldives.com.mv)   │
                              └─────────────────────────────────────┘
```
```


```
##   
## 2. Session Persistence (The Core)  
## The key to "no OTP on revisit" is storing the session state outside the application memory.  
## 2.1. Redis Storage Schema  
##   
##   

| Redis Key | Type | Content |
| ------------------------ | ---------------- | ------------------------------------------- |
| bml:session:{userId} | JSON (String) | Serialized CookieJar (all cookies) |
| bml:metadata:{userId} | JSON (Hash) | { deviceId, username, lastPing, profileId } |
| bml:credentials:{userId} | JSON (Encrypted) | { username, password } (AES‑256 encrypted) |
  
****2.2. Cookie Jar Serialization****  
## Using tough-cookie in Node.js:  
```
javascript
const { CookieJar } = require('tough-cookie');
const redis = require('redis');
const
```
```
 client = redis.createClient();

```
```

async
```
```
 function saveJar(userId, jar) {

```
```
    
```
```
const serialized = await jar.serialize();

```
```
    await client.set(`bml:session:${userId}`, JSON.stringify(serialized), 'EX', 86400 * 30); // 30 days TTL
}

async
```
```
 function loadJar(userId) {

```
```
    const data = await client.get(`bml:session:${userId}`);
    
```
```
if (!data) return null;

```
```
    const jar = new CookieJar();
    await jar.deserialize(JSON.parse(data));
    
```
```
return jar;

```
```
}
```
```


```
##   
## 3. Device Emulation (Mobile App Spoofing)  
## The official BML mobile app identifies itself to the server via headers. We replicate this to gain the same "trusted device" privileges.  
## 3.1. Static Device ID  
## Generate a static UUID for each user upon first registration and store it in bml:metadata:{userId}.  
```
javascript
const deviceId = crypto.randomUUID(); // Store this permanently

```
## 3.2. Required Headers (Emulated)  
## Every request to the BML API must include:  
```
javascript
const
```
```
 BML_HEADERS = {

```
```
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'application/json, text/plain, */*',
    
```
```
'Accept-Language': 'en-US,en;q=0.9',

```
```
    
```
```
'X-Device-Id': deviceId,          // THE KEY TO TRUST

```
```
    'X-Platform': 'iOS',
    
```
```
'X-App-Version': '5.2.1'

```
```
};
```
```


```
##   
## 4. Silent Re‑authentication (Reviving a Session)  
## When the PWA is reopened, the Node.js proxy must revive the BML session without user interaction.  
## 4.1. Revival Flow (Node.js)  
```
javascript
async
```
```
 function reviveSession(userId) {

```
```
    // 1. Load the saved cookie jar
    
```
```
let jar = await loadJar(userId);

```
```
    
```
```
const metadata = await getMetadata(userId);

```
```
    
```
```
const credentials = await getCredentials(userId);

```
```
    
    // 2. Create a new axios instance with the jar
    const client = createClient(jar, metadata.deviceId);
    
    
```
```
// 3. Test if the session is still valid (health check)

```
```
    
```
```
try {

```
```
        
```
```
const res = await client.get('https://www.bankofmaldives.com.mv/internetbanking/api/profile');

```
```
        if (res.status === 200) {
            
```
```
// Session is alive!

```
```
            await saveJar(userId, jar); // Refresh TTL in Redis
            
```
```
return { status: 'alive', jar };

```
```
        }
    } catch (error) {
        // 4. Session expired (401/403) – attempt silent re-login
        
```
```
if (error.response?.status === 401 || error.response?.status === 403) {

```
```
            
```
```
// Perform fresh login using stored credentials

```
```
            
```
```
const loginResult = await performSilentLogin(client, credentials, metadata);

```
```
            if (loginResult.success) {
                await saveJar(userId, client.jar);
                
```
```
return { status: 'revived', jar: client.jar };

```
```
            }
        
```
```
}

```
```
    
```
```
}

```
```
    
```
```
return { status: 'failed' };

```
```
}
```
```


```
## 4.2. Silent Login (No OTP)  
```
javascript
async function performSilentLogin(client, credentials, metadata) {
    
```
```
// Step 1: Login with username/password

```
```
    const loginRes = await client.post('/internetbanking/api/login', {
        
```
```
username: credentials.username,

```
```
        
```
```
password: credentials.password

```
```
    
```
```
});

```
```
    
    
```
```
if (loginRes.data.message === 'Success') {

```
```
        
```
```
// Step 2: If the server still asks for OTP (rare), we cannot bypass it silently.

```
```
        // But we assume the X-Device-ID header (set in client) makes the server trust this device.
        // The mobile app uses the same logic – after initial registration, OTP is skipped.
        
```
```
return { success: true };

```
```
    
```
```
}

```
```
    
    return { success: false, requiresOtp: true };
}
```
```


```
## Important: The X-Device-ID header is the key to skipping OTP. If the server still demands OTP, the performSilentLogin will fail. In that case, the PWA must prompt the user for the 6‑digit TOTP *exactly once* to re‑establish trust.  
##   
## 5. Background Heartbeat (Preventing Expiry)  
## The BML server invalidates sessions after ~30 minutes of inactivity. To prevent this, Node.js runs a background heartbeat for each active user.  
## 5.1. Heartbeat Worker  
```
javascript
const activeHeartbeats = new Map();

function
```
```
 startHeartbeat(userId) {

```
```
    if (activeHeartbeats.has(userId)) return;
    
    const interval = setInterval(async () => {
        
```
```
const status = await reviveSession(userId);

```
```
        if (status.status === 'failed') {
            // If revival fails, notify the frontend via WebSocket that re-authentication is needed
            
```
```
notifyFrontend(userId, 'BML_SESSION_EXPIRED');

```
```
            
```
```
stopHeartbeat(userId);

```
```
        
```
```
}

```
```
    
```
```
}, 240000); // 4 minutes

```
```
    
    activeHeartbeats
```
```
.set(userId, interval);

```
```
}

function stopHeartbeat(userId) {
    
```
```
clearInterval(activeHeartbeats.get(userId));

```
```
    activeHeartbeats.delete(userId);
}
```
```


```
##   
## 6. Internal API Endpoints (Node.js → BML)  
## Based on the reverse-engineered BML API, these are the endpoints needed to fetch account statements and manage sessions.  
##   
##   

| Endpoint (BML) | Method | Used For |
| -------------------------------------------------- | ------ | ----------------------------------------------- |
| /internetbanking/api/login | POST | Primary authentication (returns session cookie) |
| /internetbanking/api/profile | GET | Health check & user info |
| /internetbanking/api/dashboard | GET | Retrieve all accounts & balances |
| /internetbanking/api/account/{id}/history/today | GET | Fetch today's transactions |
| /internetbanking/api/contacts | GET | Fetch saved contacts |
| (Future) /internetbanking/api/account/{id}/history | GET | Date‑range history (if needed) |
  
****Note: The legacy ****/internetbanking/api/**** endpoints rely solely on username/password + session cookies, and do not require TOTP after the initial device trust is established.****  
##   
## 7. External API Endpoints (PWA → Node.js)  
## These are the endpoints the frontend will call.  
## 7.1. POST /bml/register  
## Purpose: First‑time device registration (requires OTP). Request:  
```
json
{
  "userId": "123",
  
```
```
"username": "john_doe",

```
```
  
```
```
"password": "plaintext_or_hashed",

```
```
  
```
```
"otp": "123456"  // 6‑digit TOTP

```
```
}
```
```


```
**Response:**  
```
json
{
  
```
```
"success": true,

```
```
  
```
```
"deviceId": "550e8400-e29b-41d4-a716-446655440000",

```
```
  "message": "Device registered successfully. No OTP needed on future visits."
}

```
## 7.2. GET /bml/status  
## Purpose: Check if the BML session is alive. Called when PWA loads. Response:  
```
json
{
```
```


```
```
  "status": "alive",
  "profile": { "name": "John Doe", "accounts": [...] }
}
```
```


```
## or  
```
json
{
```
```


```
```
  
```
```
"status": "revived",

```
```
  
```
```
"message": "Session was automatically restored."

```
```
}

```
## or  
```
json
{
```
```


```
```
  "status": "expired",
  "message": "Please re-enter your OTP."
}
```
```


```
## 7.3. GET /bml/accounts  
## Purpose: Fetch all accounts for the logged‑in user. Response:  
```
json
{
```
```


```
```
  
```
```
"accounts": [

```
```
    { "id": "12345", "account": "90101480038562000", "currency": "USD", "balance": "15390.00" },
    { "id": "12346", "account": "90101480038563000", "currency": "MVR", "balance": "45200.00" }
  
```
```
]

```
```
}
```
```


```
## 7.4. GET /bml/transactions?accountId={id}  
## Purpose: Fetch transaction history for a specific account. Response:  
```
json
{
  
```
```
"transactions": [

```
```
    
```
```
{

```
```
      "date": "2026-07-01 15:36:45",
      
```
```
"amount": "-10000",

```
```
      
```
```
"currency": "USD",

```
```
      
```
```
"description": "IB Acc to Acc",

```
```
      "beneficiary": "MU Store"
    
```
```
}

```
```
  ]
}
```
```


```
## 7.5. POST /bml/heartbeat/stop  
## Purpose: Stop the background heartbeat (called when the user logs out). Response:  
```
json
{ "success": true }

```
##   
## 8. Implementation Checklist  
##   
##   

| Task | Description |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. | Node.js Setup – Create a separate Node.js microservice with Express/Fastify. |
| 2. | Redis Connection – Configure Redis for cookie jar storage. |
| 3. | BML Client Class – Build a class that manages axios + tough-cookie + device headers. |
| 4. | Registration Logic – Implement POST /bml/register that logs in, captures the cookie jar, generates a device ID, and stores everything in Redis. |
| 5. | Revival Logic – Implement reviveSession() that loads the jar, tests the session, and re‑logs in if expired. |
| 6. | Heartbeat Manager – Implement startHeartbeat() and stopHeartbeat(). |
| 7. | API Endpoints – Expose /status, /accounts, /transactions to the PWA. |
| 8. | Backend Integration – Modify the backend to call Node.js internally (via HTTP) when a user authenticates. |
| 9. | Testing – Test the full flow: register → close PWA → reopen → see revived session. |
  
## 9. Security Considerations  
##   
##   

| Concern | Mitigation |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Credentials stored in Redis | Encrypt using AES‑256 (e.g., crypto-js or Node's crypto). The decryption key should be an environment variable, never hardcoded. |
| Cookie jar persistence | Redis TTL of 30 days. If the user doesn't return for 30 days, they must re‑register. |
| Man‑in‑the‑middle (MITM) | Use HTTPS for all communication between Node.js and BML, and between the PWA and Node.js. |
| Device ID spoofing | The deviceId is only as secure as your user authentication system. Ensure only authenticated users can trigger /bml/register. |
  
## 10. Conclusion  
## By implementing this BML Mobile Emulation Proxy, you will:  
* **Store persistent session cookies** server‑side (Redis), eliminating the need for the user to re‑enter OTPs on every visit.  
* **Revive sessions automatically** – when the PWA is reopened, the Node.js service silently restores the BML session without user intervention.  
* **Simulate a trusted mobile device** – the X-Device-ID header mimics the official mobile app, convincing the BML server that this is the same registered device.  
* **Keep the session alive** – the background heartbeat ensures the session never expires while the user is actively using the application.  
## This architecture successfully replicates the official BML mobile app experience, where PIN/biometrics are the only authentication step, and BML OTPs are required exactly once per device registration.  
