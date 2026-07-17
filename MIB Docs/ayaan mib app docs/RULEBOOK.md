# Rulebook — Project Governance

> **Binding document.** Every rule in this document must be followed by all agents,
> contributors, and automated systems interacting with this project. Violations are
> considered bugs and must be documented in `KNOWN_ISSUES.md`.

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md)

---

## Table of Contents

- [How to Read This Document](#how-to-read-this-document)
- [Authentication Rules (R1–R5)](#authentication-rules-r1r5)
- [Financial Action Rules (R6–R8)](#financial-action-rules-r6r8)
- [Documentation & Update Rules (R9–R11)](#documentation--update-rules-r9r11)
- [Development & Testing Rules (R12–R15)](#development--testing-rules-r12r15)
- [Emergency Rules (R16–R17)](#emergency-rules-r16r17)
- [R18 — OTP Is Optional; Default to A40 (Plaintext Login)](#r18--otp-is-optional-default-to-a40-plaintext-login)
- [R19 — Password Hash Storage Policy](#r19--password-hash-storage-policy)
- [Appendix: Rationale](#appendix-rationale)

---

## How to Read This Document

Rules are numbered **R1–R19** for unambiguous cross-referencing. Each rule has:

- **ID** – Short identifier
- **Statement** – The binding rule
- **Rationale** – Why this rule exists
- **Violation** – What happens if the rule is broken

---

## Authentication Rules (R1–R5)

### R1 — Auto-Login with Stored Credentials Is Restricted to Session Restoration

**Statement:** The aggregator may automatically re-authenticate using a stored
one-way password hash ONLY as part of the session restoration flow in
`_re_registration_fallback()` → `_authenticate_with_hash()`. The stored hash
is SHA-256(password).upper() — a one-way irreversible hash. It is captured
only after an initial successful user-initiated login.

**Prohibited uses:**
- Direct login attempts (A40/A41) with stored credentials outside the session
  restoration flow are forbidden.
- Scheduled or automated login attempts must NOT use stored credentials.
- The login form remains the only way to initiate a new session.

**Rationale:** The aggregator must survive long idle periods and power cycles
without user intervention ("set and forget"). The password hash is one-way
(SHA-256) and cannot be reversed to the plaintext password. It is stored in
`session.json` which resides on controlled infrastructure (RULEBOOK R18).

**Violation:** Any code path that calls A40/A41 with stored credentials outside
the explicit session restoration flow is a critical bug.

---

### R2 — On Authentication Failure, Stop and Notify

**Statement:** If any authentication request (A44, A40, A41, C42, or S40) returns
an error, all automated actions must cease immediately. The user must be notified
with the error code and message before any further action can be taken.

**Rationale:** Silent retries or continued operation after auth failure can:
- Trigger account lockout (402)
- Waste OTP credits
- Mask a credential change the user needs to know about

**Violation:** Catching an auth error and continuing to other endpoints without
notifying the user is a bug.

---

### R3 — Never Brute-Force, Retry, or Guess Credentials

**Statement:** The aggregator must never implement any form of credential guessing,
password spraying, brute-force attack, or automatic retry with different credentials.
There is exactly one login attempt per user trigger.

**Rationale:** Beyond being unethical and potentially illegal, the MIB server has
no client-side rate limiting but blocks accounts after a small number of failed
attempts (code 402). A single incorrect login attempt risks the account.

**Violation:** Any loop, retry mechanism, or fallback credential list is forbidden.

---

### R4 — OTP Must Be User-Entered

**Statement:** One-time passwords (OTPs) must never be automated, guessed, or
read programmatically. The OTP field in every API call must come from direct user
input. The aggregator must prompt the user for OTP and wait for manual entry.

**Rationale:** OTPs are the second factor in MIB's 2FA. Automating them defeats
the purpose of 2FA and is a security violation.

**Exception:** The resend-OTP endpoint (C43) may be called on user request to
trigger a new SMS. The OTP itself is never read or guessed programmatically.

**Violation:** Any code that reads OTP from a source other than direct user input
is a critical security bug.

---

### R5 — Allowed Automated Auth Operations

**Statement:** The following authentication operations may run automatically
without user intervention:

1. **S40 key exchange (sfunc='i')** — To refresh an expired session key.
   Triggered when a request receives error code 101 (cipher key not found).
2. **A41 salted login with stored password hash** — But ONLY as part of
   the session restoration flow (`_re_registration_fallback()` →
   `_authenticate_with_hash()`), after both A80 and S40 resurrection have
   failed and a fresh device registration was performed.

**Rationale:**
- S40 re-keying is a DH key exchange only — it does not involve credentials
  or OTPs. It cannot trigger account lockout.
- A41 hash-based auth uses a one-way password hash (SHA-256). It only runs
  after re-registration when the old session state is fully invalidated.
  The hash is re-usable only with the server's per-request userSalt, making
  it safe for automated use within the restoration flow.

**Violation:** Any automated authentication operation beyond these two
specific paths is forbidden.

---

## Financial Action Rules (R6–R8)

### R6 — Never Initiate, Approve, or Decline Financial Transactions Without Explicit User Consent

**Statement:** The aggregator must never call A48 (decline approval), A49 (approve
approval), or any endpoint that could move or block funds unless:
1. The code is explicitly designed and documented for that purpose, AND
2. Every individual action requires separate user consent (not a blanket approval)

**Rationale:** Financial endpoints have real-world consequences. An automated
approval or decline could result in financial loss, missed payments, or legal
liability.

**Violation:** Any call to A48 or A49 is a critical bug unless the user has
explicitly and recently confirmed that specific action.

---

### R7 — Fund-Moving Code Must Be Flagged `DOCUMENTATION_ONLY`

**Statement:** Any code that constructs or transmits a payload for A48 (decline),
A49 (approve), or any undiscovered endpoint that could move or commit funds must:
- Be clearly marked `DOCUMENTATION_ONLY` in its docstring
- Include a warning comment reading:
  `# WARNING: This payload affects financial state. See RULEBOOK.md R7.`
- Never be wired to an active route or scheduler without explicit user request

**Rationale:** Clear labeling prevents accidental execution. A developer searching
for "approve" should immediately see the warning before using the function.

**Violation:** An unmarked financial payload function is a documentation bug.

---

### R8 — Approval Payloads May Be Logged But Must Never Be Sent Without Per-Action Confirmation

**Statement:** The aggregator may decrypt and log A47 (list approvals) responses
for display purposes. But any call to A48 or A49 must require the user to
explicitly confirm each individual approval or decline action through the UI
or CLI — no batch operations.

**Rationale:** The approval list is read-only and safe. Actions on approvals are
write operations with financial effect and require per-item consent.

**Violation:** A function that iterates over A47 results and calls A48/A49 for
each without per-item user confirmation is a critical bug.

---

## Documentation & Update Rules (R9–R11)

### R9 — Every Code Change Must Update Relevant Documentation

**Statement:** Any change to source code must be accompanied by updates to the
relevant documentation files. Outdated documentation is considered a bug with the
same severity as the code change it describes.

**Rationale:** The `docs/` directory is a living documentation set. If the
documentation does not reflect the current code, it is misleading and dangerous
for future development. See `UPDATING.md` for the trigger-to-file mapping.

**Violation:** A code change that does not update at least one documentation file
is incomplete.

---

### R10 — Documentation Must Reflect the Current Codebase State

**Statement:** Before any release, commit, or deployment, verify that the
documentation matches the codebase. Specific checks:
- All endpoints in `endpoints.py` are listed in `API.md`
- All step functions in `mib_client.py` are listed in `API.md` and `FLOW.md`
- All route paths in the code are in the routePath catalog in `REVERSE_ENGINEERING.md`
- The rule count and document list in `NAVIGATION.md` is accurate

**Rationale:** Drift between code and docs erodes trust in the documentation and
leads to errors.

**Violation:** A commit that introduces a code-doc mismatch is rejected until
docs are updated.

---

### R11 — Cross-Reference Links Must Be Maintained

**Statement:** Every documentation file must have a working `[Back to Navigation](NAVIGATION.md)`
link at the top. All internal links between doc files must resolve to existing
sections. Dead links are documentation bugs.

**Rationale:** Cross-references make the documentation usable as a connected
knowledge base. Broken links fragment the reader's experience.

**Violation:** A pull request that introduces a dead link is rejected.

---

## Development & Testing Rules (R12–R15)

### R12 — All Tests Use Fresh Accounts

**Statement:** Automated tests and manual integration tests must use accounts
that are not the developer's primary personal account. A "fresh" account is one
that:
- Has never been used with this project before, OR
- Has been explicitly created for testing purposes by the bank

**Rationale:** The MIB server blocks accounts after repeated login attempts
(code 402). Using personal accounts risks losing access to real banking services.

**Violation:** Running integration tests against a personal primary account
is forbidden.

---

### R13 — Never Run Against Production Without Explicit User Consent

**Statement:** The aggregator must never make requests to the live MIB API
(`faisanet.mib.com.mv`) without the user being fully aware and having consented.
The mock app must display a clear warning before the first API call in a session.

**Rationale:** The API modifies server-side state (device registrations, session
keys, login attempts). Users must understand this before connecting.

**Violation:** Silent or background API calls without user awareness are forbidden.

---

### R14 — No Credentials in Source Code

**Statement:** Usernames, passwords, PINs, API keys, OTPs, or any secrets must
never appear in source code files. Use environment variables or a `.env` file
(not tracked by git) for all credentials.

**Rationale:** Hardcoded credentials are a security risk and make testing with
different accounts cumbersome.

**Violation:** Any source file containing a real credential is a security bug.

---

### R15 — Mock App Binds to Localhost Only

**Statement:** The Flask mock app (`mib-mock-app/app.py`) must bind to
`127.0.0.1` by default, never `0.0.0.0`. This prevents remote access to the
debug interface.

**Rationale:** The debug panel exposes encrypted request/response data and
session keys. Binding to all interfaces would expose this to the network.

**Violation:** Changing the host to `0.0.0.0` without a documented reason and
security review is forbidden.

---

## Emergency Rules (R16–R17)

### R16 — On Account Block (402), Stop All Actions and Notify

**Statement:** If any API response returns reason code `402` ("User is blocked"),
the aggregator must:
1. Immediately cease all API requests to the MIB server
2. Display a clear message to the user that the account is blocked
3. Provide instructions: "Please log in manually on the real MIB app to reset
   the attempt counter, then try again."
4. NOT retry, re-login, or attempt any workaround

**Rationale:** Code 402 indicates the account has been locked by the bank.
Further automated activity could worsen the situation. Only manual login on
the official app can reset the block counter.

**Violation:** Any automatic retry or bypass attempt after a 402 error is a
critical bug.

---

### R17 — On Unexpected Server Error, Fail Safe

**Statement:** If the MIB server returns an unexpected response (non-200 status,
malformed JSON, unknown error code, or network timeout), the aggregator must:
1. Log the full request and response context (URL, headers, body, status)
2. Display a generic error message to the user
3. NOT automatically retry the request
4. NOT proceed to dependent requests

**Rationale:** Silent failures or automatic retries can mask server-side issues,
consume OTP credits, or trigger rate limiting. Failing safe preserves the
account and makes debugging easier.

**Exception:** S40 key exchange may be retried once on error 101 (cipher key
not found) since this is explicitly a session expiry signal.

**Violation:** An automatic retry beyond the S40 exception is a bug.

---

### R18 — OTP Is Optional; Default to A40 (Plaintext Login)

**Statement:** The aggregator must default to **A40 (plaintext password login)** over **A41 (salted login)**. A41 is available only as a manual testing option, never as an automatic fallback. The user's selection on the login form must be respected exactly — the app must never auto-route to A41 based on the A44 response.

```python
# Correct: respect user selection
login_method = data.get('loginMethod', 'A40')
if login_method == 'A41':
    # only use A41 if the user explicitly chose it
    ...
else:
    # A40 is always the default
    ...
```

**Rationale:** The aggregator is a server-side service with persistent device keys (key1/key2) on controlled infrastructure. This is more secure than a consumer mobile device. OTP adds operational friction without increasing cryptographic security for the aggregator's use case. A40 allows the server to skip OTP when the session is trustworthy, enabling unattended "set and forget" operation. If the server explicitly demands OTP (reasonCode `414`/`415`), it is handled transparently via C42.

**Violation:** Auto-routing to A41 based on A44 response fields is a design error. Forcing OTP on every login defeats the aggregator's "set and forget" requirement.

## Appendix: Rationale

### Why 19 rules?

These 19 rules are the minimum set needed to prevent:

### R19 — Password Hash Storage Policy

**Statement:** The aggregator may store `password_hash = SHA-256(password).upper()` in
`session.json` to enable automated session restoration. This hash is:

1. **One-way** — SHA-256 cannot be reversed. The plaintext password cannot be recovered.
2. **Server-salted** — The hash alone is insufficient to authenticate. The server's
   `userSalt` (from A44) is required to compute the pgf03 value for A41. The hash
   changes each request because a random `clientSalt` is generated per A41 call.
3. **Stored only after initial login** — The hash is captured only after the user
   has successfully authenticated via the login form.
4. **Deleted on logout** — `api_logout()` calls `_reset_state()` which clears the
   hash. `session.json` is also deleted.

**Rationale:** This is a deliberate design choice to achieve the "set and forget"
goal. The same approach is used by production MIB API clients in the field
(e.g., the external Kotlin aggregator project stores password hashes for
automated re-authentication). The risk is acceptable because:

- The aggregator runs on controlled infrastructure with restricted access (R18).
- The hash is one-way — no credential material is exposed.
- The server's userSalt rotates per A44 call, so a stolen hash cannot be
  replayed without a live A44 response.

**Violation:** Storing the plaintext password is a critical security bug. The
hash must always be `SHA-256(password.encode('utf-8')).hexdigest().upper()`.

---
- Account lockout (402)
- Unauthorized financial actions
- Security breaches (credential leaks, OTP bypass)
- Documentation drift
- Test account contamination

### Who enforces these rules?

- **AI agents** — Must follow all rules during automated development
- **Human contributors** — Expected to follow all rules; PR reviewers check
  compliance
- **Automated systems** — Scheduler and CLI must not violate R1–R17

### How to add a new rule

1. Add the new rule with the next available number (R18, R19, ...)
2. Add a rationale explaining the motivation
3. Update `KNOWN_ISSUES.md` if existing code violates the new rule
4. Update `UPDATING.md` trigger table
5. Update `NAVIGATION.md` table of contents count
