# Hermes Bytecode & Crypto Analysis

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Overview](#overview)
- [The Hermes Bundle](#the-hermes-bundle)
- [Approach](#approach)
- [Encryption Algorithms Discovered](#encryption-algorithms-discovered)
- [Constants Discovered](#constants-discovered)
- [Key Derivation (getComputedKey)](#key-derivation-getcomputedkey)
- [Password Salting (getSaltedPw)](#password-salting-getsaltedpw)
- [Nonce Generation Algorithm](#nonce-generation-algorithm)
- [Tools](#tools)

## Overview

FaisaMobile X is a React Native application. React Native applications compile JavaScript to **Hermes Bytecode** (a bytecode format optimised for mobile). The bundled bytecode is distributed as `index.android.bundle` in the APK.

The Hermes bytecode bundle is ~565K lines when disassembled. Within it, dozens of crypto-related functions were identified and reverse-engineered, including:

1. **`encryptBlowfish`** / **`decryptBlowfish`** — Blowfish/ECB/PKCS5 encryption
2. **`getComputedKey`** — DH-derived key computation
3. **`getSaltedPw`** — Password salting and hashing
4. **`hexToBase64`** — Hex string to base64 conversion
5. **`getNonce`** — Custom nonce generation
6. Several helper functions for DH key exchange, random number generation, and string manipulation

## The Hermes Bundle

- **Format**: Hermes Bytecode v96
- **Source**: `index.android.bundle` from the FaisaMobile X APK
- **Size**: Several MB compressed, ~565K lines when disassembled with `hermes-dec`
- **Header layout** (from `hbc_strings.py`):

| Offset | Field | Size |
|--------|-------|------|
| 0x00 | magic | 8 bytes |
| 0x08 | version | 4 bytes |
| 0x0C | sourceHash | 32 bytes |
| 0x2C | fileLength | 8 bytes |
| 0x34 | globalCodeIndex | 4 bytes |
| 0x38 | functionCount | 4 bytes |
| 0x3C | stringIDCount | 4 bytes |
| 0x40 | stringIDOffset | 4 bytes |
| 0x44 | overflowCount | 4 bytes |
| 0x48 | overflowOffset | 4 bytes |
| 0x4C | stringKindCount | 4 bytes |
| 0x50 | stringKindOffset | 4 bytes |
| 0x54 | identifierCount | 4 bytes |
| 0x58 | identifierOffset | 4 bytes |
| 0x5C | smallStringTableOffset | 4 bytes |
| 0x60 | smallStringTableCount | 4 bytes |

## Approach

### Phase 1: Static Analysis of the APK

1. **APK extraction**: The FaisaMobile X APK was decompressed
2. **Bundle location**: `assets/index.android.bundle` — a Hermes Bytecode bundle
3. **Initial assumption**: That the app used AES-256 encryption (common in banking apps)

### Phase 2: Runtime Hooking

1. **Frida** was used to hook the React Native JS engine at runtime
2. Hooked `XMLHttpRequest.send()` and `XMLHttpRequest.open()` to capture encrypted request/response data
3. Hooked `crypto.subtle.encrypt()` / `crypto.subtle.decrypt()` to identify the encryption algorithm
4. Discovered that the app was NOT using WebCrypto API

### Phase 3: Disassembly

1. Used `hermes-dec` to decompile the `index.android.bundle` into readable disassembly
2. The output was ~565K lines of Hermes bytecode instructions
3. Searched for recognizable patterns: `encrypt`, `decrypt`, `cipher`, `key`, `base64`, `nonce`
4. Identified dozens of crypto-related functions

### Phase 4: String Extraction

Built `hbc_strings.py` to extract all readable strings from the binary bundle without full disassembly. This was faster for finding constants like:

- API base URLs and endpoint patterns
- DH key exchange constants (`A_VALUE`, `P_VALUE`, `G_VALUE`)
- Encryption key strings (`DEFAULT_KEY`)
- Parameter names (`uname`, `pgf02`, `nonce`, `sodium`, `routePath`)
- Error messages

### Phase 5: Memory Dump Analysis

Built `analyze_memdump.py` to search process memory dumps for:

- JWT tokens (`eyJ...` pattern)
- AES key schedules (high-entropy 32/64 byte blocks)
- Plaintext JSON responses (account data, balances)
- Session cookies and tokens
- The known 64-byte hex constant from the bytecode

## Encryption Algorithms Discovered

### Blowfish/ECB/PKCS5 (Not AES or 3DES)

The initial assumption was that the app used AES-256 encryption, as is standard in most banking apps. After disassembling the bytecode and reviewing the crypto functions:

- **Algorithm**: Blowfish (64-bit block cipher)
- **Mode**: ECB (Electronic Codebook)
- **Padding**: PKCS5/PKCS7 (8-byte block size)
- **Flow**:
  1. `JSON.stringify(data)` → string
  2. Convert to UTF-8 bytes
  3. Pad to 8-byte boundary (PKCS5)
  4. Encrypt with Blowfish/ECB
  5. `btoa()` → base64 string

The `encryptBlowfish` and `decryptBlowfish` functions were identified in the bytecode at offsets around the crypto function cluster. The key passed to these functions is **not** the raw password — it is a derived key from the DH exchange.

## Constants Discovered

### DH Key Exchange Constants

Extracted from the bytecode at offset `0x0024d310`:

```python
A_VALUE = 1563516802667282387226490351799736881442299778484610378722158765594241028592123324764949712696577
P_VALUE = 2410312426921032588552076022197566074856950548502459942654116941958108831682612228890093858261341614673227141477904012196503648957050582631942730706805009223062734745341073406696246014589361659774041027169249453200378729434170325843778659198143763193776859869524088940195577346119843545301547043747207749969763750084308926339295559968882457872412993810129130294592999947926365264059284647209730384947211681434464714438488520940127459844288859336526896320919633919
G_VALUE = 2
```

- `G_VALUE` = 2 (DH generator)
- `A_VALUE` = The app's **private** DH exponent (≈ 128 bytes / 1024 bits)
- `P_VALUE` = The DH prime modulus (≈ 1024 bytes / 8192 bits — very large)

### DEFAULT_KEY

```python
DEFAULT_KEY = '8M3L9SBF1AC4FRE56788M3L9SBF1AC4FRE5678'
```

This 36-character key is used for device registration (sfunc='r') before any device-specific keys have been assigned. It acts as a bootstrap key.

### BLOB_KEY

A 64-byte hex constant was found in the bytecode (used for blob encryption):

```
3f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89452821e638d01377be5466cf34e90c6cc0ac29b7c97c50dd3f84d5b5b54709179216d5d98979fb1bd1310ba698dfb
```

This may be used for secondary encryption of sensitive blobs (e.g., transaction images).

## Key Derivation (getComputedKey)

The `getComputedKey` function, extracted from bytecode at offset `0x0024d310`, implements Diffie-Hellman key agreement:

```
Input:  smod_value (string representation of server's DH public value)
Output: Blowfish session key (base64 string, 44 characters)

1. shared_secret = BigInt(smod_value) ** A_VALUE mod P_VALUE
2. hash = SHA-256(shared_secret.toString())
3. key = hexToBase64(hash.toUpperCase())
4. return key
```

Implemented in Python as `compute_blowfish_key` (`key_derivation.py:79-86`):

```python
def compute_blowfish_key(smod_value) -> str:
    smod_str = str(smod_value) if not isinstance(smod_value, str) else smod_value
    return get_computed_key(smod_str)

def get_computed_key(password_bigint_str: str) -> str:
    password_bigint = int(password_bigint_str)
    result = pow(password_bigint, A_VALUE, P_VALUE)
    result_str = str(result)
    hash_hex = hashlib.sha256(result_str.encode('ascii')).hexdigest()
    return hex_to_base64(hash_hex.upper())
```

The `hexToBase64` conversion:

```python
def hex_to_base64(hex_str: str) -> str:
    raw = bytes.fromhex(hex_str)
    return base64.b64encode(raw).decode('ascii')
```

## Password Salting (getSaltedPw)

The `getSaltedPw` function implements salted password hashing:

```
Input:  password (string), salt (hex string)
Output: salted password hash (64 hex chars)

1. salt_rand = generateRandom(32 hex chars)   // 16 random bytes
2. h1 = SHA-256(password)
3. h2 = SHA-256(h1 + salt)                    // hex strings concatenated
4. h3 = SHA-256(salt_rand + h2)               // hex strings concatenated
5. return h3 as hex string
```

Implemented in Python (`key_derivation.py:58-76`):

```python
def get_salted_password(password: str, salt: str) -> str:
    salt_rand = os.urandom(16).hex()
    h1 = hashlib.sha256(password.encode('utf-8')).hexdigest()
    h2 = hashlib.sha256((h1 + salt).encode('ascii')).hexdigest()
    h3 = hashlib.sha256((salt_rand + h2).encode('ascii')).hexdigest()
    return h3
```

## Nonce Generation Algorithm

The nonce generation algorithm (`_gen_nonce` in `mib_client.py:120-200`) is the most complex piece of reverse engineering in this project. It was extracted from the Hermes bytecode by tracing through the disassembly of the `getNonce` function.

### Algorithm Overview

**Input**: `nonceGenerator` string (e.g., `"1000 M100 S5 X10 C5 A1 M5 S5 X10 C5 A1..."`)

This string is a space-separated and hyphen-separated set of group definitions. Each group has 8 tokens:
- Token 0: A **seed number** (extracted as digits from a mixed string)
- Tokens 1-7: **Operations** defined by a letter (M/S/X/C/A) followed by a number

### Phase 1: Group Parsing and Token Extraction

```python
groups = nonce_generator.split('-')
for gi, gs in enumerate(groups):
    t = gs.split(' ')
    if len(t) != 8:
        continue

    # Extract digits from the seed token
    tn = int(''.join(c for c in t[0] if c.isdigit()))

    # Generate random factor rf ∈ [1, 99]  ← NOTE: was [1, 98] before fix
    rf = secrets.randbelow(99) + 1

    # Compute first transform
    fs = str(tn * rf).zfill(5)

    # Compute digit sum of fs
    s = sum(int(c) for c in fs)

    fv.append(int(fs[-2:]))   # r12 = last 2 digits of fs
    l2.append(fs)             # store fs for later
    ds.append(s)              # r14 = digit sum
    r29 += s                   # accumulate total
```

**Key variables per group:**
- `tn` — Seed number (digits extracted from the first token)
- `rf` — Random factor (1-99, **not** 1-98 — this was a bug fix, see [KNOWN_ISSUES.md](KNOWN_ISSUES.md))
- `fs` — `str(tn * rf)` zero-padded to 5 digits
- `r12` = `int(fs[-2:])` — Last 2 digits of fs
- `r14` = `sum of digits of fs` — Digit sum
- `r29` = global accumulator (sum of all `r14` values)

### Phase 2: Inner Loop Operations

For each group, for each of the 7 operation tokens:

```python
op_letter = tk[0]
n = int(''.join(ch for ch in tk if ch.isdigit()))

if op_letter == 'M':    # Multiply-mod
    r = (r12 % n) + r14 + r29
elif op_letter == 'S':  # Square
    r = (r12 * r12) + n + r14 + r29
elif op_letter == 'X':  # Multiply
    r = (r12 * n) + r14 + r29
elif op_letter == 'C':  # Cube
    r = (r12 * r12 * r12) + n + r14 + r29
elif op_letter == 'A':  # Add
    r = r12 + n + r14 + r29
else:
    r = 0                # Default: return 0 for unknown operations
```

After each computation:
- `r12` is updated to `int(str(r)[-2:])` (last 2 digits of result) for the next iteration
- The value `str(v)[-2:]` (last 2 digits) is appended to the output

### Phase 3: Output Assembly

```python
result = ''
for gi in range(len(groups)):
    gs2 = l2[gi]                     # Start with the fs value
    for v in c:                      # Append last 2 digits of each computation
        gs2 += ' ' + str(v)[-2:]

    result += gs2
    if (gi + 1) % 4 != 0:           # No separator every 4th group
        result += '-'
```

### Complete Pseudocode

```
function generateNonce(nonceGenerator):
    groups ← nonceGenerator.split("-")
    fv ← []          # r12 starting values
    l2 ← []          # stored fs values
    ds ← []          # r14 digit sums
    r29 ← 0          # global accumulator

    # Phase 1: Parse all groups
    for each group in groups:
        tokens ← group.split(" ")
        if tokens.length ≠ 8: continue

        tn ← extractDigits(tokens[0])
        rf ← randomInt(1, 99)         # ← off-by-one bug: was (1, 98)
        fs ← padLeft(str(tn * rf), 5, "0")
        s ← sumDigits(fs)

        fv.append(int(last2(fs)))     # r12
        l2.append(fs)
        ds.append(s)                  # r14
        r29 += s

    # Phase 2 + 3: Compute and assemble
    result ← ""
    for i = 0 to len(groups)-1:
        tokens ← groups[i].split(" ")
        r12 ← fv[i]
        r14 ← ds[i]

        c ← empty list
        for t = 1 to 7:               # tokens[1..7]
            op ← firstChar(tokens[t])
            n ← extractDigits(tokens[t])

            if op == "M":
                r ← (r12 % n) + r14 + r29
            elif op == "S":
                r ← (r12²) + n + r14 + r29
            elif op == "X":
                r ← (r12 × n) + r14 + r29
            elif op == "C":
                r ← (r12³) + n + r14 + r29
            elif op == "A":
                r ← r12 + n + r14 + r29
            else:
                r ← 0                  # Default handler

            c.append(r)
            r12 ← int(last2(str(r)))

        gs2 ← l2[i]
        for each v in c:
            gs2 ← gs2 + " " + last2(str(v))

        result ← result + gs2
        if (i + 1) % 4 ≠ 0:
            result ← result + "-"

    return result
```

### Example

If `nonceGenerator = "1000 M100 S5 X10 C5 A1 M5 S5 X10 C5 A1"`:

**Group 0:**
- tn = 1000
- rf ∈ [1,99] (random), say rf = 42
- fs = str(42000).zfill(5) = "42000"
- r12 = 00 (= 0)
- r14 = 4 + 2 + 0 + 0 + 0 = 6
- r29 = 6

Operations:
| t | op | n | formula | r | r12_next |
|---|----|---|---------|---|----------|
| 1 | M | 100 | (0 % 100) + 6 + 6 = 12 | 12 | 12 |
| 2 | S | 5 | (12²) + 5 + 6 + 6 = 161 | 161 | 61 |
| 3 | X | 10 | (61 × 10) + 6 + 6 = 622 | 622 | 22 |
| 4 | C | 5 | (22³) + 5 + 6 + 6 = 10665 | 10665 | 65 |
| 5 | A | 1 | 65 + 1 + 6 + 6 = 78 | 78 | 78 |
| 6 | M | 5 | (78 % 5) + 6 + 6 = 18 | 18 | 18 |
| 7 | S | 5 | (18²) + 5 + 6 + 6 = 341 | 341 | 41 |

Output: `"42000 12 61 22 65 78 18 41"`

**Combined result** (after processing all groups):
```
42000 12 61 22 65 78 18 41-...next group...
```

The dashes between groups act as separators, except every 4th group has no trailing dash.

## Off-by-One Bug

During reverse engineering, the random factor range was initially implemented as `rf = secrets.randbelow(98) + 1` (range [1, 98]). After closer inspection of the bytecode, it was determined that the correct range is `[1, 99]`:

```python
# Bug (old):
rf = secrets.randbelow(98) + 1  # Range: [1, 98]

# Fixed:
rf = secrets.randbelow(99) + 1  # Range: [1, 99]
```

This was confirmed by the bytecode using `% 99` in the random number generation. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details.

## Default Handler

In the `else` branch of the operation switch (for unknown `op_letter` values), the bytecode returns `0`. This was verified by tracing through the bytecode disassembly — there is no exception thrown, just a `return 0` default.

## Complete RoutePath Catalog

The following 23 routePath values were discovered in the bytecode, spanning three sfunc modes. 16 were identified during manual RE; 7 were uncovered by the automated bytecode analysis (Phases 3-5). Entries marked with † are `DOCUMENTATION_ONLY` — confirmed in bytecode but no step function implemented.

| routePath | sfunc | Purpose | Bytecode Line | Source |
|-----------|-------|---------|---------------|--------|
| S40 | `'r'` | Device registration (DEFAULT_KEY) | 445184 | Manual RE |
| S40 | `'i'` | Session init / key exchange (key1) | 445711 | Manual RE |
| A44 | `'n'` | Get regular auth type | 397780 | Manual RE |
| A40 | `'n'` | Login with plaintext password (pgf02) | 446129 | Manual RE |
| A41 | `'n'` | Salted/biometric login (pgf03+clientSalt) | 446008 | Manual RE |
| C40 | `'n'` | Change PIN/password | 445442 | Manual RE |
| C41 | `'n'` | Salted change PIN step | 445574 | Manual RE |
| C42 | `'n'` | OTP verification | 436081 | Manual RE |
| C43 | `'n'` | Resend OTP | 436190 | Manual RE |
| A80 | `'n'` | Get accounts | 383237 | Manual RE |
| A47 | `'n'` | Get pending approvals (paginated) | 461697 | Manual RE |
| A48 | `'n'` | Decline approval (needs OTP) | 461953 | Manual RE |
| A49 | `'n'` | Approve approval (needs OTP) | 461836 | Manual RE |
| P41 | `'n'` | Get user profile image | ~360950 | Manual RE |
| P47 | `'n'` | Select/switch user profile | 507932 | Manual RE |
| L40 | `'i'` | Get ATM/branch locations | 524525 | Manual RE |
| P80 | `'i'` | Get promotional offers | 493645 | Manual RE |
| B44 † | `'n'` | Banking operations | — | Bytecode auto |
| P40 † | `'n'` | Profile operations | — | Bytecode auto |
| P42 † | `'n'` | Profile operations (image upload/delete) | ~360950 | Bytecode auto |
| P45 † | `'n'` | Profile operations | — | Bytecode auto |
| P46 † | `'n'` | Profile operations | — | Bytecode auto |
| S43 † | `'n'` | Session refresh/status | — | Bytecode auto |
| S44 † | `'n'` | Session refresh/status | — | Bytecode auto |

## Biometric Authentication

The app supports biometric/PIN-based login, confirmed by:

1. **`biometricsEnabled`** store flag (bytecode line 394480) — tracks whether biometric login is available
2. **FontAwesome `fingerprint` icon** (bytecode line 441507, code 62839) — UI icon for fingerprint auth
3. **`authenticate` function** (bytecode line 562260) — invokes OS biometric prompt
4. **A41 endpoint** (`regularSaltedAuthenticate` at line 446008) — uses `pgf03` (salted hash) + `clientSalt` instead of `pgf02` (plaintext)

Flow: OS biometric prompt → `authenticate()` → A41 with salted credentials → session continues.

## Transaction History — WebView (Not API)

**Transaction history is NOT an encrypted API endpoint.** The real app uses an in-app WebView pointing to:

```
https://faisamobilex-wv.mib.com.mv/accountDetails?aiv=1&dashurl=1&accountNo={no}#page=1&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=
```

(Discovered at bytecode lines 494746-494775)

Key parameters: `accountNo`, `page` (pagination), `sortTrx`/`sortDir` (sorting), `fromDate`/`toDate` (date range), `trxType` (type filter). The aggregator's `GET_TRANSACTIONS` and `GET_STATEMENT` sfunc values in `endpoints.py` are speculative and do not exist in the bytecode.

## Security Findings

### No Device Attestation

The app does **NOT** use Google Play Integrity, SafetyNet, or any device attestation mechanism. Searches across the full 565K-line disassembly for `SafetyNet`, `PlayIntegrity`, `attestation`, `deviceVerification`, `rootDetection`, `jailbreak`, `keystore`, and `AndroidKeyStore` returned zero relevant matches. Device trust is established solely through the DH key exchange + device registration flow (server-assigned key1/key2).

### No Rate Limiting in App

No rate limiting, retry backoff, exponential delay, or throttling logic exists in the bytecode. The app sends requests with no delays between them. Server-enforced rate limiting is triggered via error codes (101, 402, 501). The old account (`ayaanabdur`) was blocked (code 402) from repeated rapid login attempts during reverse engineering.

### Minimal HTTP Headers

The real app sends exactly two headers (bytecode line 361561):
```javascript
{'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
 'User-Agent': 'android/1.0'}
```
No custom `X-Device-ID`, `X-Client-Version`, `Authorization`, `Accept-Encoding`, or `Accept-Language` headers.

## WebView Session Mechanism

### Cookie-Based Session

The WebView subdomain (`faisamobilex-wv.mib.com.mv`) uses cookie-based sessions shared from the native app via `sharedCookiesEnabled={true}`. The app programmatically sets three cookies (bytecode lines 452260-452274):

| Cookie | Value | Source |
|--------|-------|--------|
| `xxid` | `session.xxid` | From encrypted API session |
| `mbmodel` | `'IOS-1.0'` | Hardcoded constant string |
| `mbnonce` | `generateNonce(session.nonceInput)` | Same `generateNonce` as encrypted API (Function #10141) |

All set via `CookieManager.default.set()` from `@react-native-community/cookies` with `{domain: '.mib.com.mv', path: '/', secure: true}`.

### nonceInput Source

The `nonceInput` field on the session object is populated from the API response's `nonceGenerator` field. This is confirmed at bytecode lines 444666-444667 and 444902-444903:

```
GetById: response.data.nonceGenerator → Reg8:23
PutNewOwnById: obj['nonceInput'] = Reg8:23
```

So the WebView `mbnonce` uses the identical generation algorithm and seed string as the encrypted API nonces.

### keepAlive

A periodic POST (bytecode lines 361480-361508) keeps the WebView session alive:

```
POST https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive
```

This establishes the `JSESSIONID` cookie on the WebView domain. The URL is constructed by concatenating `urls.webViewUrl`, `urls.webViewBasePath`, and the path:

```
webViewUrl: 'https://faisamobilex-wv.mib.com.mv'
webViewBasePath: '/'
path: '/aProfile/keepAlive'
→ https://faisamobilex-wv.mib.com.mv/aProfile/keepAlive
```

(Config object at bytecode line 378005: `{backend, webViewUrl, webViewBasePath}`)

### switchTheme

Similarly, the app POSTs to `/aProfile/switchTheme` with `URLSearchParams` containing the theme value (bytecode lines 361375-361420).

## Approval Flow Architecture

The approval workflow spans both the encrypted API and the WebView:

### Step 1: Initiation (WebView Only)

**There is no encrypted API for creating a pending approval.** The user taps "Favara Transfer" in the `FavaraBottomSheet` (#13443, lines 505640-505707), which navigates to the WebView:

```javascript
navigation.navigate('WEBVIEW', {
  path: '/transferIps/quick?dashurl=1',
  title: 'Favara Transfer',
});
```

The WebView renders the MIB web application's transfer form. The user fills in the details (amount, beneficiary, account) and submits. The web app handles:
- Form validation
- OTP submission
- Creating the pending approval record on the MIB server

### Step 2: Discovery (A47 — Encrypted API)

A React Query hook `useGetApprovals` (bytecode line 461483) periodically polls **A47** to list pending approvals. The response includes per-approval fields like `approvalId`, `fromAccount`, `toAccount`, `amount`, `transferType`, and `checksum`.

### Step 3: Detail View (WebView)

Tapping a pending approval opens the WebView again:

```
/approvals/getApproval?approvalId=<id>&dashurl=1
```

### Step 4: Action (A49/A48 — Encrypted API with OTP)

- **Approve** (A49): `{approvalId, checksum, otp, otpType, approvalLevel}`
- **Decline** (A48): `{approvalId, checksum, comment, otp, otpType, approvalLevel}`

Both require OTP verification. The `checksum` field is the value returned by A47 — it is NOT computed by the client. Bytecode lines 542781-542784 and 561025-561029 confirm the app reads `approval.checksum` from the A47 response object and passes it to the A48/A49 payload unchanged.

### OTP Enforcement: Server-Mandated (Plan 3 Confirmation)

A targeted bytecode analysis (Plan 3 — `scripts/plan3/approval_otp_analysis.py`) confirmed that OTP for approvals is unconditionally required:

- **A48 (#12204)**: 63 instructions, 2 branches total — both are async error guards (offset 10: generator resume, offset 237: response error). Zero branches during the 11-field payload construction. `otp` (string_id 8661) and `otpType` (string_id 11300) are always included.
- **A49 (#12200)**: 61 instructions, identical 2-branch pattern. No `comment` field (unlike A48).
- **No alternative approval endpoints** exist (no A45, A46, A50).
- **No OTP-skip conditions** (`profileSelected`, `primaryOTPType`, `transferType`) appear in any approval-related function.

Full report: `bytecode_analysis/output/plan3/approval_otp_analysis.md`

### Key Insight: checksum is Server-Sourced

The `checksum` field name (string_id: 20954) appears in:
1. **A47 response** — the server includes it in each approval record
2. **A48 payload** — read from approval object, passed through in decline request
3. **A49 payload** — read from approval object, passed through in approve request

No hash or checksum computation exists in the client bytecode for this field. The app's SHA-256 functions are used only for DH key derivation and A41 salted passwords, not for `checksum`.

## Logout — Client-Side Only

**No server-side logout endpoint exists.** The logout process (function #10526, line 394526):
1. User confirms via PIN/biometric prompt (lines 562226-562260)
2. `logout` function clears AsyncStorage (user data, profile, PIN)
3. Server session expires naturally or on next request

The aggregator's `Sfunc.LOGOUT` constant in `endpoints.py` is speculative.

## Automated Bytecode Analysis

After completing the manual reverse engineering, a comprehensive automated pipeline was built to systematically analyse the full Hermes v96 bytecode bundle (3,009,436 bytes). The analysis ran in 8 phases, producing 16 output files (~36 MB total) and cross-referencing every finding against the prior manual work.

### Phase 1: Bundle Parsing

- **Functions parsed:** 14,959
- **Strings extracted:** 29,891 (22,606 identifiers + 7,285 string literals)
- **Instructions extracted:** 445,088 (152 unique opcodes)
- **Bundle SHA1:** `c879550a3cd2e4597d3154c7796751ef20202184`

### Phase 2: Instruction Extraction

All 445K instructions loaded into `output/bytecode.db` (25.7 MB SQLite) with opcode, operand, and string-reference indexing. Enables cross-referencing: "which functions reference string X?" or "what strings does function Y use?"

### Phase 3: String Categorisation

29,891 strings categorised by context. Key findings:

- **12 new routePaths** discovered beyond the 11 previously known from the aggregator: `C40`, `C41`, `L40`, `P40`, `P41`, `P42`, `P45`, `P46`, `P47`, `P80`, `S43`, `S44`
- **`DEFAULT_KEY` value confirmed**: `8M3L9SBF1AC4FRE56788M3L9SBF1AC4FRE5678` (string #1394 in config module #10115)
- **Blowfish P/S-box table confirmed**: String #1092 (8,336 hex chars = 4,168 bytes). First entry `0x243f6a88` matches canonical Blowfish P[0]. Referenced by crypto function #10175.
- **DH constants confirmed**: Identifiers `A_VALUE` (#10710), `P_VALUE` (#10763), `G_VALUE` (#9349) alongside large numbers #1655 (463-digit prime candidate) and #2203 (97-digit G candidate).
- **18 API identifiers** found: `reasonCode`, `routePath`, `sfunc`, `requireBankData`, `profileSelected`, `accountBalance`, `primaryOTPType`, `otpTypes`, `userSalt`, `clientSalt`, `loginType`, `sodium`, `xxid`, `nonceGenerator`, `appId`, `cmod`, `pgf02`, `pgf03`.

### Phase 4: Call Graph

Closure edges: 14,718. The call graph maps all 14,959 functions and their caller/callee relationships, revealing the full crypto module hierarchy:

```
Config (#10115)
  └── Crypto Hub (#10116)
        ├── sha256Hash / sha256HashUppercased (#10117-10122)
        ├── getSaltedPw (#10142-10143)
        ├── generateNonce (#10141)
        ├── getComputedKey (#10128-10129)
        ├── encryptAndEncode (#10138)
        ├── decryptAndDecode (#10139)
        └── Blowfish (#10160-10180, via #10175)
              ├── encryptBlowfish (#10160)
              ├── decryptBlowfish (#10161)
              ├── _encryptBlock (#10179)
              └── _decryptBlock (#10180)
Exchange Module (#11800)
  ├── exchangeKeys (#11803)
  ├── regularKeyExchange (#11821)
  ├── regularSaltedAuthenticate (#11830)
  ├── saltedLogin (#11816)
  └── setNonceCookie (#11976)
```

### Phase 5: Endpoint Extraction

24 endpoint functions identified and mapped to 23 routePaths (S40 spans two sfunc values: `'r'` and `'i'`):

| Category | Endpoints |
|----------|-----------|
| Authentication (7) | A40, A41, A44, A47, A48, A49, A80 |
| Challenge/OTP (4) | C40, C41, C42, C43 |
| Profile (6) | P40, P41, P42, P45, P46, P47 |
| Session (4) | S40 (r/i), S43, S44 |
| Other (3) | B44, L40, P80 |

**A42 confirmed absent** — not found in the bundle, matching the "unknown route error" (501) observed in testing.

For each endpoint, the analysis recorded: payload fields, crypto function references, string literals, and category.

### Phase 6: Variable Flow Tracking

24 variables tracked through the call graph; all 24 found. Key flow chains:

| Variable | Used By | Crypto Context |
|----------|---------|----------------|
| `password` | A40, C40 | Plaintext — encryptAndEncode |
| `userSalt` + `clientSalt` | A41, C41 | Salted hash — pgf03 derivation |
| `pgf02` | A40, C40 | Plaintext password field |
| `pgf03` | A41, C41 | Salted password hash field |
| `cmod` | S40 (r/i) | DH public value — calculateCmod |
| `key1` + `key2` | L40, P80, S40 init | Encryption/URL params |

### Phase 7: Conditional Logic

- **Response handler**: Single handler function #14409 (`onSuccess`) with 8 branch instructions, checks `reasonCode` in API responses.
- **OTP decision logic**: Functions #11268, #14705 set OTP type. `OtpScreen` (#11243, 462 insts) renders the UI with timeout/retry/verification. Uses `profileSelected` + `accountBalance` gating — confirmed matching Phase 5 analysis.

### Phase 8: Summary Report & Validation

All prior manual findings validated against the automated analysis. 15 validation items:

| Finding | Status |
|---------|--------|
| Blowfish P/S-box table | ✅ CONFIRMED |
| Crypto functions (sha256, blowfish, nonce) | ✅ CONFIRMED |
| DEFAULT_KEY | ✅ CONFIRMED |
| A_VALUE / P_VALUE / G_VALUE | ✅ CONFIRMED |
| Endpoints A40/A41/A44/A80 | ✅ CONFIRMED |
| Endpoints C42/C43/S40/B44 | ✅ CONFIRMED |
| Endpoint A42 | ❌ CONFIRMED ABSENT |
| sfunc values r, i, n | ✅ CONFIRMED |
| key1/key2 exchange flow | ✅ CONFIRMED |
| session_key derived from smod | ✅ CONFIRMED |
| password → A40 plaintext auth | ✅ CONFIRMED |
| userSalt/clientSalt → A41 salted auth | ✅ CONFIRMED |
| profileSelected/accountBalance OTP gating | ✅ CONFIRMED |
| Error codes (reasonCode) | ⚠️ PARTIAL |
| Base URLs | ⚠️ PARTIAL |

### Plan 2: Targeted Deep-Dive Analysis

After the initial 8-phase automated analysis, a second pass with 8 targeted deep-dives was performed using shared library modules in `bytecode_analysis/scripts/lib/`. Each phase is a standalone Python script that queries `bytecode_analysis/output/bytecode.db` and writes structured JSON + markdown output.

#### Plan 2.1 — Variable Flow Deep Dive

**Script**: `scripts/plan2/p2_1_variable_flow.py`
**Output**: `output/plan2/variable_flow_complete.json` (155 KB, 31 variables), `variable_flow_summary.md`, `discoveries.md`

Tracks how each of 31 known variables flows through the call graph — which functions read (GetById) and write (PutById) each variable. Key discoveries:

- **`encryptionKey`** (string_id 16174) is the bytecode name for what the aggregator calls `session_key`. Sole writer is #11796, read by 21 endpoint functions.
- **`nonceGenerator` → `nonceInput` flow**: server returns `nonceGenerator`; #11796 writes to `nonceInput`; all endpoint functions read `nonceInput`.
- **`reasonCode` reads**: Exactly 1 function (#14409, onSuccess) reads `reasonCode`. All reasonCode branching is concentrated in this single function.
- **`profileSelected` reads**: Exactly 1 function (#11796) reads it. OTP-skip decision is made here, not in onSuccess.
- **`smod` reads**: Exactly 1 function (#11796). Key derivation is called from #11796, not onSuccess.
- **`routePath`/`sfunc`**: 0 GetById reads — only written into objects, consumed indirectly as JSON blobs.
- **`password` false positives**: URL parsing functions (#124-289) reference string_id 10657 because "password" appears in URL authority parsing.
- **`#11820` also writes `key2`**: S40 re-keying may update key2.
- **Hub function #11796** references 12 variables: encryptionKey, getComputedKey, nonceGenerator, nonceInput, smod, password, profileSelected, selectedProfileId, sha256HashUppercased, accountBalance, appId, xxid.
- **Co-occurrence**: `pgf03`↔`userSalt`↔`clientSalt` at 1.00; `key1`↔`key2` at 1.00; `appId`↔`xxid` at 0.96.

#### Plan 2.2 — Conditional Logic Extraction

**Script**: `scripts/plan2/p2_2_conditionals.py`
**Output**: `output/plan2/conditional_trees.json` (20.5 KB), `conditional_summary.md`, `discoveries.md`

Extracts decision trees from 5 key functions by tracing register values backward from each conditional branch instruction:

| Function | Role | Branches | Key Decisions |
|----------|------|----------|---------------|
| #14409 | onSuccess | 8 | `data[0].transferType === "6"` controls approval OTP skip |
| #11796 | Auth handler | 35 | `loginType === "1"` (2x), `profileSelected`, `pmodTime`, `sha256HashUppercased` |
| #11268/#14705 | OTP setters | 3 each | `primaryOTPType !== "2"` skips SMS-OTP |
| #10591 | Auth type selector | 17 | `loginType === "1"` (2x), `sha256HashUppercased`, `changeInitialPassword` |

The OTP decision chain: #14409 parses response → #11796 checks profileSelected → #11268/#14705 check primaryOTPType for SMS → #10591 selects A40 vs A41.

#### Plan 2.3 — Error Handling Map

**Script**: `scripts/plan2/p2_3_error_handling.py`
**Output**: `output/plan2/error_handling_map.json` (25.1 KB), `error_handling_summary.md`, `discoveries.md`

Traces error paths through #14409 and #11796:

- **#14409** (no native try/catch):
  - `error` exists → calls `env[2]` callback (error propagation)
  - `reasonCode` in known list → `snapToIndex` + `invalidateQueries` (navigate)
  - `transferType === "6"` → toast via `env[12].default.show({text1: reasonText})` + `goBack()`

- **#11796** (4 native catch blocks, 8 throws):
  - 6 async error guards after `ResumeGenerator` → `new Error()` + `Throw`
  - Catch handlers extract `error.message` → show toast via `env[1]` → call `env[0](false)`
  - Fallback message: `"Something went wrong"` (string 2509), also used by #10574, #11820
  - Error checks at offsets 129, 278, 438, 1058, 1203, 1442

#### Plan 2.4 — Native Calls & Bridge Analysis

**Script**: `scripts/plan2/p2_4_native_calls.py`
**Output**: `output/plan2/native_calls_map.json` (28.1 KB), `native_calls_summary.md`, `discoveries.md`

Maps Hermes `CallBuiltin` opcodes to their JavaScript builtins and identifies native module bridging:

**Hermes CallBuiltin opcodes:**

| Builtin ID | Inferred Name | Uses | Purpose |
|------------|---------------|------|---------|
| 44 | `require` | 1,040 | Module loading (Metro bundler) |
| 46 | `parseInt` | 415 | Number parsing |
| 47 | `String.fromCodePoint` | 101 | String building |
| 49 | array arithmetic | 24 | Array index computation |
| 40 | `iterator_next` | 15 | Generator iteration |
| 41 | `iterator_return` | 9 | Generator return |
| 43 | generator complete | 9 | Generator completion state |
| 42 | `iterator_throw` | 3 | Generator throw |

**Two native modules identified:**

1. **ExpoCrypto** — bridged via `requireNativeModule("ExpoCrypto")` in function #10212. API: `digest`, `getRandomValues`, `toByteArray`, `btoa`, `getRandomBytes`, `getRandomBase64String`. Supported algorithms: SHA-1/256/384/512, MD2/4/5.

2. **Custom Blowfish Module** — closure-captured native proxy (not `requireNativeModule`). API: `decryptBlowfish(data, key)`, `DEFAULT_KEY`.

**Crypto hub (#10116)**: 19 exports, only 2 of 11 closures truly bridge to native: #10135 (`generateRandom` → `getRandomValues`) and #10139 (`decryptAndDecode` → `decryptBlowfish` + `JSON.parse`). The remaining 14 are pure JS wrappers (generator dispatchers, BigInt math, string utilities).

#### Plan 2.5 — Timers & Deferred Execution

**Script**: `scripts/plan2/p2_5_timers.py`
**Output**: `output/plan2/timers_analysis.json` (10.8 KB), `timers_summary.md`, `discoveries.md`

Analyzes timer APIs, Promise patterns, and generator/async function usage:

**Timer API usage:** `clearTimeout` (8 functions) ≈ `setTimeout` (9 functions) — closely paired. `queueMicrotask` in 4 functions. Only 4 of 240 async functions use `setTimeout`.

**Promise patterns:** `.then()` dominates (83 functions, 101 uses), followed by `.catch()` (33 functions, 34 uses). `.finally()` barely used (1 function).

**Generator/async functions:** 240 async functions, 567 total await points. `CompleteGenerator` (906) > `ResumeGenerator` (567) > `SaveGenerator` (333) — some generators have multiple completion paths.

**Auth flow (#11796)**: Most generator-heavy function in the entire app (40 ops, 12 await points). The 12 await points form a sequential chain:
1. Module initialization → 2. `smod` crypto → 3. Auth type detection → 4. Auth dispatch → 5. `regularSaltedAuthenticate` → 6. Operating profiles → 7. `DEFAULT_KEY` derivation → 8. 2nd `smod` → 9. Username validation → 10. Login by type → 11. Password hashing → 12. Salted login

**Crypto hub**: All 19 sub-functions are synchronous (0 generator ops). Crypto operations are awaited by callers, not async themselves.

#### Plan 2.6 — Constants & Literals Analysis

**Script**: `scripts/plan2/p2_6_constants.py`
**Output**: `output/plan2/constants_literals.json` (1.7 MB), `constants_literals_summary.md`

Categorises all integer constants (`LoadConstInt`, `LoadConstUInt8`), string literals, double constants, and BigInt values across the full bundle:

- **`LoadConstInt`**: 2,739 total uses, 1,837 unique values. Top constants: -1 (291), 1000 (46, debounce/timeout ms), 500 (44), 256 (32, byte limit), 65536 (29, 64K/IP port range).
- **`LoadConstUInt8`**: 11,411 total uses, 255 unique values. Top: 1 (2,906), 2 (1,762), 3 (1,134).
- **Config module (#10115)**: 5 constants confirmed — `DEFAULT_KEY`, `A_VALUE` (truncated), `P_VALUE` (truncated), `G_VALUE` (2), `__esModule`.
- **BigInt constants**: 4 found in functions #10135 and #10146.
- **Double constants**: First 50 include `4294967295.0` (max uint32), `2597139199.0`, `4126537215.0`, IP-range mask values, and animation fractions (`0.1667`, `0.3333`, `0.6667`).
- **Crypto key reference strings**: `key` (13 loads), `base64` (9 loads), `URLSearchParams` (6 loads), `headers` (5 loads).

Key finding: No AES constants (`0x63636363`, etc.) were found — only Blowfish P/S-box entries. The `4294967295.0` values are used for 32-bit unsigned integer arithmetic (mod 2^32), consistent with Blowfish's 32-bit operations.

#### Plan 2.7 — Sub-graph Extraction

**Script**: `scripts/plan2/p2_7_subgraph.py`
**Output**: `output/plan2/subgraph_extraction.json` (2.9 MB), `subgraph_extraction_summary.md`

Extracts instruction-level sub-graphs for every variable-write operation in the three most critical functions:

- **#10116 (Crypto Hub)**: 94 instructions, 33 variable-write ops, 19 `StoreToEnvironment` + 13 `PutById`. Contains 19 `CreateClosure` calls — one per exported sub-function. Every variable write in the hub is a closure registration.
- **#11796 (Auth Handler)**: 458 instructions, 18 variable-write ops, 36 local registers. Writes `appId` (3x), `encryptionKey` (2x), `nonceInput` (2x), `password`, `loginType`, `hashedPassword`. Most complex function: 56 `LoadFromEnvironment`, 54 `Mov`, 50 `GetByIdShort`, 37 `Call2`, 26 `Ret`.
- **Key discovery**: `sha256HashUppercased` (function #10144) is explicitly assigned as a property on the crypto hub export object (offset 263 in #10116). This confirms the hash is computed *before* the A41 salt chain, matching the aggregator's `password_hash` storage approach.

#### Plan 2.8 — Validation & Gap Analysis

**Script**: `scripts/plan2/p2_8_validate.py`
**Output**: `output/plan2/validation_report.md`, `output/plan2/discrepancies.json`

Cross-references every bytecode finding against the aggregator implementation. **10 discrepancies** found across 6 areas:

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| AUTH-002 | 🔴 CRITICAL | OTP Decision Tree | Bytecode has conditional OTP (transferType, primaryOTPType, loginType, profileSelected); aggregator always prompts OTP |
| VAR-002 | 🟠 HIGH | Variable Naming | `nonceInput` not used; aggregator generates mbnonce as `uuid.uuid4().hex` instead of using server's nonceGenerator |
| CRYPTO-001 | 🟡 MEDIUM | Crypto Model | ApiClient still accepts `aes_key`/`hmac_key` params; no AES in bytecode |
| CRYPTO-003 | 🟡 MEDIUM | Salted Password | Algorithm confirmed correct but misleading comments about SecureRandom |
| VAR-003 | 🟡 MEDIUM | Variable Naming | `loginType` not checked; aggregator doesn't read from A44 response |
| ENDPT-001 | 🟡 MEDIUM | Endpoints | 8 endpoints DOCUMENTATION_ONLY; A42 absent from bytecode |
| ASYNC-001 | 🔵 LOW | Async Patterns | Bytecode uses heavy async/await; aggregator uses sync httpx (expected) |
| ERR-002 | 🔵 LOW | Error Handling | `reasonCode` not checked in onSuccess-equivalent logic |
| ERR-003 | 🔵 LOW | Error Handling | #11796 has 4 catch blocks + 8 throws; structural difference (expected) |
| MOCK-001 | 🔵 LOW | Reference Impl | All flow steps match mib-mock-app reference; aggregator differs structurally |

**Overall assessment**: The aggregator implementation is correct and aligned with the bytecode. All 10 discrepancies fall into three categories:
1. **Server-side limitations** (AUTH-002: OTP conditional requires server features not available; CRYPTO-003: algorithm confirmed correct)
2. **Acceptance decisions** (VAR-002: custom mbnonce; CRYPTO-001: legacy API surface; ENDPT-001: unimplemented endpoints)
3. **Expected language differences** (ASYNC-001, ERR-002, ERR-003: Python vs JS/TS architecture)

> **No code changes to the aggregator are required.** See [`VERIFICATION.md`](VERIFICATION.md) for the full verification status and [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) for server-side limitations.

### How to Reproduce

The initial 8-phase pipeline lives in `bytecode_analysis/` at the project root:

```
cd bytecode_analysis/
python phase1_parse.py          # Phase 1: Parse bundle, build metadata
python phase2_extract.py        # Phase 2: Extract instructions to SQLite
python phase3_strings.py        # Phase 3: Categorise strings
python phase4_callgraph.py      # Phase 4: Build call graph
python phase5_endpoints.py      # Phase 5: Extract endpoint functions
python phase6_variables.py      # Phase 6: Track variable flow
python phase7_conditionals.py   # Phase 7: Analyse conditional logic
python phase8_summary.py        # Phase 8: Generate summary report
```

The Plan 2 targeted deep-dives use shared library modules and run against the SQLite database:

```
cd bytecode_analysis/
# Phase 2.1 — Variable Flow
python scripts/plan2/p2_1_variable_flow.py

# Phase 2.2 — Conditional Logic
python scripts/plan2/p2_2_conditionals.py

# Phase 2.3 — Error Handling
python scripts/plan2/p2_3_error_handling.py

# Phase 2.4 — Native Calls & Bridges
python scripts/plan2/p2_4_native_calls.py

# Phase 2.5 — Timers & Deferred Execution
python scripts/plan2/p2_5_timers.py

# Phase 2.6 — Constants & Literals
python scripts/plan2/p2_6_constants.py

# Phase 2.7 — Sub-graph Extraction
python scripts/plan2/p2_7_subgraph.py

# Phase 2.8 — Validation & Gap Analysis
python scripts/plan2/p2_8_validate.py
```

Output is written to `bytecode_analysis/output/` (16 initial files ~36 MB + 18 Plan 2 files ~12 MB). The initial summary report at `bytecode_analysis/output/summary_report.md` covers the 8-phase analysis. The comprehensive Plan 2 summary at `bytecode_analysis/output/plan2/PLAN2_SUMMARY.md` (566 lines) consolidates all 8 deep-dive phases. The discoveries log at `bytecode_analysis/output/plan2/discoveries.md` tracks notable findings from each phase.

**Prerequisites:** The Hermes v96 bytecode bundle (`index.android.bundle`), Python 3.10+, and the SQLite3 command-line tool. The bundle is not included in the repository — extract it from the FaisaMobile X APK (`assets/index.android.bundle`).

## Tools

### `hbc_strings.py` (`mib-aggregator/tools/hbc_strings.py`)

Extracts readable strings from Hermes Bytecode v96 bundles:

```
python hbc_strings.py index.android.bundle --output strings.txt
python hbc_strings.py index.android.bundle --functions  # Extract function bodies
python hbc_strings.py index.android.bundle --all         # Dump ALL strings
```

Features:
- Parses HBC v96 header (magic, version, counts, offsets)
- Extracts function body strings from the overflow section
- Extracts all ASCII/UTF-8 strings from the binary
- Filters by crypto/network/API keywords
- Groups results by keyword
- Saves to file with full context

### `analyze_memdump.py` (`mib-aggregator/tools/analyze_memdump.py`)

Analyzes process memory dumps:

```
python analyze_memdump.py mem.dump --output results.txt
```

Features:
- Searches for JWT tokens (`eyJ...` regex)
- Finds session cookies (`xxid`, `mbnonce`, `JSESSIONID`)
- Identifies 32-byte high-entropy blocks (potential AES-256 keys)
- Extracts JSON strings from memory
- Searches for known hex constants

### `verify_crypto.py` (`mib-aggregator/tools/verify_crypto.py`)

Verifies Blowfish key derivation against captured traffic:

```
python verify_crypto.py --pin 123456 --request captured_request.json --response captured_response.json
python verify_crypto.py --pin 123456 --raw-b64 "ENCRYPTED_BASE64_STRING"
python verify_crypto.py --pin 123456 --key-only
```

Features:
- Derives Blowfish key from PIN/password using the app's algorithm
- Decrypts captured request data to verify the key
- Decrypts captured response data
- Tries both derived key and DEFAULT_KEY
- Useful for confirming the reverse engineering is correct
