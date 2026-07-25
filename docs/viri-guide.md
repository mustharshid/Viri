# Vir i — Comprehensive Guide

> *Decentralized Live Bank Transfer Verification for the Maldivian Retail Ecosystem*

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem & Why You Need It](#2-problem--why-you-need-it)
3. [Architecture Overview](#3-architecture-overview)
4. [Features](#4-features)
5. [Benefits](#5-benefits)
6. [Quick-Start Checklist](#6-quick-start-checklist)
7. [How-To Guide](#7-how-to-guide)
8. [FAQ](#8-faq)
9. [Glossary](#9-glossary)

---

## 1. Overview

### What is Viri?

Viri is a decentralized, real-time bank transfer verification platform purpose-built for retail businesses in the Maldives. It replaces slow, manual receipt checking with instant, cryptographically verified transfer confirmations from Bank of Maldives (BML) and Maldives Islamic Bank (MIB) — without ever storing your banking credentials on any server.

Viri consists of three components that work together:

| Component | Role |
|-----------|------|
| **PWA (Progressive Web App)** | The cashier and admin interface — runs in any browser or as a standalone app |
| **Chrome Extension** | Sits on the bank portal, manages logins, verifies transactions, extracts statements |
| **Laravel API** | Secure orchestration layer — manages companies, terminals, subscriptions, and routes encrypted data |

### How It Works in One Flow

1. A customer pays via bank transfer at checkout
2. The cashier enters the transaction reference number in the Viri PWA
3. Viri signals the Chrome Extension to check the bank portal
4. The extension logs into the bank (via the company's existing credentials), verifies the transfer in real time
5. The result (confirmed / pending / not found) appears on the cashier's screen within seconds
6. The transaction is logged with a full audit trail

### Supported Banks

| Bank | Portal Type | Authentication |
|------|-------------|----------------|
| **Bank of Maldives (BML)** | Corporate Internet Banking | OAuth 2.0 + TOTP |
| **Maldives Islamic Bank (MIB)** | Corporate Internet Banking | Device Key (DH) + OTP |

---

## 2. Problem & Why You Need It

### The Problem

Retail businesses in the Maldives that accept bank transfers face a daily challenge:

```
Customer pays → Shows screenshot → Cashier checks phone → 
Checks bank app → Nods or shakes head → Next customer waits
```

**Manual verification is broken:**
- **Slow** — Each check takes 1-3 minutes of a cashier's time
- **Unreliable** — Screenshots can be doctored, old receipts reused
- **No audit trail** — Disputed payments are cashier's word vs customer's word
- **Multi-branch chaos** — No way to know if a payment was already verified at another branch
- **Customer frustration** — Long wait times at checkout

**The cost adds up:**
- Each wasted minute per transaction × hundreds of transactions per day
- Lost revenue from disputed chargebacks
- Staff overtime spent reconciling payments
- Fraught customer relationships over false dispute claims

### Why You Need Viri

| Without Viri | With Viri |
|--------------|-----------|
| Cashier checks personal phone banking | Cashier uses Viri PWA on any device |
| Verification takes 1-3 minutes | Verification takes 3-10 seconds |
| No proof of verification | Full audit trail with timestamps |
| Each branch operates in isolation | All branches share real-time visibility |
| Screenshots can be faked | Bank portal confirms directly |
| Credentials entered manually every login | Secure automated session management |
| OTPs delay every login | TOTP seeds enable seamless authentication |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Customer                              │
│              Pays via bank transfer at POS                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cashier PWA (Browser/App)                  │
│  - Enters reference number                                   │
│  - Sees verification result (confirmed / pending / failed)   │
│  - Views transaction ledger, reports                         │
└────────────────────────┬────────────────────────────────────┘
                         │ Encrypted signaling
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Laravel API (Backend)                      │
│  - Routes requests (zero-knowledge — never decrypts)         │
│  - Manages companies, terminals, subscriptions               │
│  - Maintains audit logs, session state                       │
│  - SSE real-time push to PWA                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ Encrypted relay
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Chrome Extension (Bank Portal Side)              │
│  - Manages bank sessions (BML / MIB)                         │
│  - Verifies transfers in real time                           │
│  - Extracts statements, captures OTP/TOTP                    │
│  - Credentials never leave the extension                     │
└───────┬──────────────────────────────────┬──────────────────┘
         │                                  │
         ▼                                  ▼
┌──────────────────┐            ┌──────────────────┐
│  BML Corporate   │            │  MIB Corporate   │
│  Internet        │            │  Internet        │
│  Banking Portal  │            │  Banking Portal  │
└──────────────────┘            └──────────────────┘
```

---

## 4. Features

### 4.1 Live Transfer Verification

The core feature. Cashiers enter a transaction reference and receive real-time confirmation from the bank's systems.

- Supports both BML and MIB transfers
- Result returned in 3-10 seconds
- Clear status indicators: Confirmed, Pending, Not Found, Failed
- Full transaction details captured (amount, date, sender, reference)
- Verification credits tracked per billing cycle

### 4.2 Transaction Ledger

A complete, unalterable log of all verified transfers across your entire company.

- Real-time updates as transactions are verified
- Filter by date, bank, terminal, status
- Export for reconciliation
- 30-day activity retention
- Search by reference number, amount, or customer name

### 4.3 Dual Bank Support

One platform, two banks — identical workflow for both.

| Bank | Integration Method | Features |
|------|-------------------|----------|
| **BML** | Corporate Internet Banking OAuth 2.0 | Transfer verification, statement extraction, historical data |
| **MIB** | Corporate Internet Banking Device Key (DH) | Transfer verification, statement extraction, real-time balance |

### 4.4 Smart Bank Session Management

Viri's Chrome Extension intelligently manages banking sessions so cashiers never need to log in manually.

- **Automatic login** — Extension logs into the bank portal using stored credentials
- **TOTP auto-injection** — Time-based one-time passwords are automatically read from the authenticator and submitted
- **OTP capture** — SMS OTPs are detected and injected automatically
- **Session persistence** — Bank sessions remain active for the configured timeout
- **Session sharing** — One bank login powers verification requests from all terminals
- **Heartbeat monitoring** — Active sessions are kept alive and monitored

### 4.5 Statement Extraction & Archive

Automatically extract and archive bank statements without manual CSV downloads.

- One-click statement extraction from both BML and MIB portals
- Configurable date ranges
- Archive format: structured JSON with full transaction details
- Ideal for accounting reconciliation

### 4.6 Multi-Terminal Support

A single Viri company can register multiple cashier terminals.

- Each terminal has its own pairing code and identity
- Terminals share bank credentials securely (encrypted sync)
- Role-based control: enable/disable specific features per terminal
- Debug mode for troubleshooting individual terminals
- Real-time terminal status monitoring

### 4.7 Secure Credential Sync

When a company has multiple terminals, credentials need to be shared. Viri does this securely.

- Administrator initiates a credential sync from the dashboard
- Credentials are encrypted on the source terminal
- Encrypted blob is transmitted through the API (server never sees plaintext)
- Target terminal decrypts and stores the credentials locally
- Sync request expires if not claimed within 5 minutes
- Full audit trail of all sync events

### 4.8 Bank Account Locking

Prevent two cashiers from verifying against the same bank account simultaneously.

- Locking system ensures exclusive access during verification
- Heartbeat mechanism detects stale locks (e.g., cashier walks away)
- Automatic unlock after heartbeat timeout
- Superadmin can force-clear stuck locks
- Prevents double-verification race conditions

### 4.9 Company & Subscription Management

| Tier | Price | Monthly Verifications | Max Terminals | Max Bank Accounts | Features |
|------|-------|----------------------|---------------|-------------------|----------|
| **Free** | MVR 0 | 20 | 1 | 2 | Basic verification |
| **499** | MVR 499 | 300 | 3 | 4 | Ledger, basic reports |
| **999** | MVR 999 | Unlimited | 10 | 8 | Full reports, priority support |
| **1999** | MVR 1,999 | Unlimited | Unlimited | 20 | All features, dedicated support |

### 4.10 Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Superadmin** | Access all companies, manage subscriptions, view system settings, approve/reject payments, clear stuck locks |
| **Company Admin** | Manage terminals, bank accounts, users within their company; view audit logs; manage credential sync |
| **Cashier** | Verify transfers, view ledger, generate reports — no management capabilities |

### 4.11 Audit Logging

Every action across the platform is logged with full details.

- Event type, timestamp, actor, terminal, IP address
- Session activity logs with filtering
- Company-level audit trail
- 500-entry visible history
- Export compatible with external audit tools

### 4.12 Real-Time Updates (SSE)

Server-Sent Events push updates to the PWA without polling.

- Transfer verification results appear instantly
- Session status changes propagated immediately
- Credential sync requests and acknowledgements
- Configurable polling intervals for network efficiency

### 4.13 In-App Help & Support

Viri includes comprehensive help resources directly in the application.

- Context-sensitive tooltips on every feature
- Searchable FAQ with 20+ topics
- Step-by-step setup guides for BML and MIB credentials
- Superadmin contact information
- Direct support hotline

### 4.14 Dark Mode Design

Full dark-mode-first design system optimized for retail environments.

- High-contrast, low-glare interface for bright retail floors
- Emerald-accented design language (trust and verification)
- Glassmorphism UI elements
- JetBrains Mono monospace font for transaction data

---

## 5. Benefits

### For Business Owners

| Benefit | Impact |
|---------|--------|
| **Eliminate payment fraud** | Real-time bank-verified confirmation — screenshots can't be doctored |
| **Speed up checkout** | Verification drops from 1-3 minutes to 3-10 seconds |
| **Centralize oversight** | All branches, all banks, all transactions — one dashboard |
| **Reduce disputes** | Complete audit trail for every transaction |
| **No upfront hardware** | Works on existing desktops, tablets, and laptops |
| **Bank-agnostic workflow** | Single interface for BML and MIB |

### For Cashiers

- **One-click verification** — enter reference, see result, move to next customer
- **No more app-switching** — Viri handles bank logins automatically
- **Clear status indicators** — green (confirmed), yellow (pending), red (failed)
- **Works on any device** — PWA runs in the browser, no installation required

### For IT and Operations

- **Zero-knowledge security** — no banking credentials on servers, no PCI-DSS scope expansion
- **No complex infrastructure** — just a Chrome extension and a browser
- **Simple deployment** — pair a terminal with a 6-digit code, done
- **Audit-ready** — every transaction logged with actor, timestamp, and result

### For Accountants

- **Automated ledger** — all verified transactions in one place
- **Statement export** — structured data ready for reconciliation
- **Searchable history** — find any transaction by reference, amount, or date
- **Audit trail** — independent verification for every recorded transaction

---

## 6. Quick-Start Checklist

### First-Time Setup

- [ ] **Step 1: Register your company** at the Viri PWA
- [ ] **Step 2: Add terminals** (one for each cashier station)
- [ ] **Step 3: Add bank accounts** (BML, MIB, or both)
- [ ] **Step 4: Install the Chrome Extension** from the Chrome Web Store
- [ ] **Step 5: Pair the extension** using the 6-digit pairing code from each terminal
- [ ] **Step 6: Set up bank credentials** inside the extension:
      - [ ] BML: Log in to BML Corporate IB, authorize OAuth
      - [ ] MIB: Generate and upload device keys
- [ ] **Step 7: Configure TOTP seeds** in the extension for each bank account
- [ ] **Step 8: Verify a test transfer**

### Daily Operations

- [ ] Cashier logs into Viri PWA
- [ ] Customer pays via bank transfer
- [ ] Cashier enters transaction reference in the Verify tab
- [ ] Result appears in 3-10 seconds
- [ ] Transaction is logged in the ledger

### Weekly / Monthly

- [ ] Review audit logs for any issues
- [ ] Check verification credit usage
- [ ] Export ledger for accounting reconciliation
- [ ] Verify subscription renewal if on a paid plan

---

## 7. How-To Guide

### 7.1 Company Registration

1. Navigate to the Viri PWA login page
2. Click "Register"
3. Enter your company name, your name, email, phone number, and password
4. Submit the registration
5. Your account status will be "Pending" — a superadmin will approve it
6. Once approved, log in and start configuring

### 7.2 Adding a Terminal

1. Log in to the Viri PWA as a company admin
2. Navigate to the Terminals section
3. Click "Add Terminal"
4. Enter a terminal name (e.g., "Checkout 1", "Front Desk")
5. Set a 6-digit settings PIN (for accessing terminal configurations)
6. The terminal will be created with a status of "Active"
7. A 6-digit pairing code is automatically generated for the terminal

### 7.3 Adding a Bank Account

1. In the admin dashboard, go to Bank Accounts
2. Click "Add Bank Account"
3. Select the bank (BML or MIB)
4. Select the terminal that will hold the credentials for this account
5. Configure account details:
   - **BML**: Enter BML username, select OAuth grant type
   - **MIB**: Enter MIB username and app ID
6. Save. The terminal's extension will receive a credential sync request.

### 7.4 Installing the Chrome Extension

1. Make sure you have Google Chrome installed
2. Visit the Chrome Web Store listing for Viri (or load the extension manually)
3. Click "Add to Chrome"
4. The Viri icon will appear in your browser toolbar
5. Pin the extension for easy access

### 7.5 Pairing the Extension

The pairing process links a Chrome Extension instance to a specific terminal.

1. On the terminal computer, open Chrome and click the Viri extension icon
2. Click "Pair Terminal"
3. A 6-digit pairing code will be displayed
4. On the company admin dashboard, navigate to Terminals
5. Copy the 6-digit pairing code for the terminal you want to pair
6. Enter the code in the extension's pairing prompt
7. The extension will now be linked to that terminal

**Troubleshooting:**
- Pairing codes expire after 10 minutes — regenerate if expired
- Codes are single-use
- If the pairing fails, verify the terminal is in "Active" status in the admin panel

### 7.6 Setting Up BML Bank Credentials

#### Step 1: OAuth Authorization
1. Click the Viri extension icon in Chrome
2. Navigate to Settings → Banks → BML
3. Click "Authorize with BML"
4. Log in to BML Corporate Internet Banking when prompted
5. Complete the TOTP verification
6. The extension will capture the OAuth tokens

#### Step 2: TOTP Seed Configuration
1. In the extension settings, go to BML → TOTP Setup
2. Open your authenticator app (Google Authenticator, etc.)
3. Locate the BML Corporate Internet Banking entry
4. Enter the TOTP seed/secret key in the extension
5. Verify that the TOTP code generated by the extension matches your authenticator app

### 7.7 Setting Up MIB Bank Credentials

#### Step 1: Device Key Generation
1. Click the Viri extension icon in Chrome
2. Navigate to Settings → Banks → MIB
3. Click "Generate Device Keys"
4. The extension will generate Diffie-Hellman key pairs
5. The public keys are automatically registered with MIB

#### Step 2: TOTP Seed Configuration
1. In the extension settings, go to MIB → TOTP Setup
2. Open your authenticator app
3. Locate the MIB Corporate Internet Banking entry
4. Enter the TOTP seed/secret key in the extension
5. Verify the generated TOTP code

### 7.8 Credential Sync (Multi-Terminal)

When you have multiple terminals and want them all to use the same bank credentials:

1. Ensure the source terminal (that has the credentials) is online and paired
2. In the admin dashboard, go to Credential Sync
3. Select the bank account to sync
4. Select the target terminal(s)
5. Click "Initiate Sync"
6. The source terminal's extension will encrypt its credentials
7. The encrypted blob is uploaded to the API
8. Each target terminal downloads and decrypts the blob when online
9. The sync request expires after 5 minutes if not claimed

### 7.9 Verifying a Transfer (Cashier)

1. Log in to the Viri PWA as a cashier
2. The default view is the Verify tab
3. Enter the customer's transaction reference number
4. Press Enter or click Verify
5. Viri will:
   - Signal the Chrome Extension to check the relevant bank portal
   - The extension navigates to the transaction history
   - Looks up the reference number
   - Returns the result
6. The result is displayed:
   - **Confirmed (Green)** — Transfer verified with matching details
   - **Pending (Yellow)** — Transfer exists but not yet cleared
   - **Not Found (Red)** — No matching transaction found
   - **Failed (Red)** — Extension error or bank connection issue

### 7.10 Viewing the Transaction Ledger

1. Navigate to the Ledger tab in the PWA
2. All verified transactions are displayed in reverse chronological order
3. Each entry shows: date/time, bank, reference number, amount, verification result, terminal
4. Use the search bar to find specific transactions
5. Use date filters to narrow the time range
6. Results can be exported for reconciliation

### 7.11 Generating Reports

1. Navigate to the Reports tab
2. Select the report type:
   - **Verification Summary** — total verifications, success rate, average time
   - **Terminal Activity** — per-terminal breakdown
   - **Bank Activity** — per-bank breakdown
3. Set the date range
4. Click Generate
5. View or export the report

### 7.12 Managing Users (Company Admin)

1. Go to Company → Profile
2. View all users associated with your company
3. To add a new user:
   - Currently handled through registration pending approval
4. Users have the `company_admin` role by default
5. Cashier access is managed through terminal assignment

### 7.13 Superadmin Functions

Superadmins have access to a dedicated admin panel:

**Company Management:**
- View all registered companies with status, tier, and usage
- Approve or reject new company registrations
- Suspend or archive non-compliant companies
- Update subscription tiers and feature flags

**Payment Management:**
- View payment history and receipts
- Approve or reject payment confirmations
- Extend licenses upon payment approval

**System Configuration:**
- Configure polling intervals for various features
- Enable/disable debug logging
- View system settings including PHP and MySQL versions

**Monitoring & Debug:**
- View session activity logs with filters
- Check terminal debug logs with one-time codes
- View stored credential metadata (prefixes only)
- Clear stuck bank account locks

### 7.14 Using the Checklist Feature

The checklist tab provides a configurable checklist for cashier operations. Useful for:
- End-of-day reconciliation procedures
- Opening checklists (verify terminal status, test verification)
- Compliance checklists for regulatory requirements

### 7.15 Updating Subscription & Billing

1. Company admins can upgrade their subscription from the dashboard
2. Select a new plan tier
3. Upload payment receipt
4. A superadmin reviews and approves the payment
5. Upon approval, the subscription tier and features are updated
6. License expiry is extended based on the payment terms

---

## 8. FAQ

### General

**Q: What banks does Viri support?**
A: Viri currently supports Bank of Maldives (BML) Corporate Internet Banking and Maldives Islamic Bank (MIB) Corporate Internet Banking.

**Q: Is Viri a bank?**
A: No. Viri is a verification platform that works alongside your existing bank accounts. You keep your bank accounts at BML or MIB — Viri simply helps you verify transfers faster.

**Q: Does Viri store my banking credentials?**
A: No. Banking credentials are encrypted and stored only inside the Chrome Extension on your computer. Viri's servers never have access to your plaintext passwords, PINs, or session tokens. This is called a zero-knowledge architecture.

**Q: Is Viri a mobile app or web app?**
A: Viri is a Progressive Web App (PWA), which runs in your browser but can be installed on your device's home screen like a native app. It works on Windows, Mac, Android, and iOS (browser-based on iOS).

**Q: What devices do I need?**
A: You need:
- A computer with Google Chrome (for the extension)
- Any device with a modern browser (for the PWA cashier interface)
- Internet connectivity

**Q: Can I use Viri on a tablet?**
A: Yes, the PWA works on any device with a modern browser, including tablets. However, the Chrome Extension requires a desktop computer.

**Q: How is this different from checking my bank app?**
A: Checking a bank app is manual, slow, leaves no audit trail, and can't be verified by a second person. Viri automates the verification, logs every check, and provides real-time confirmation across all your branches.

### Setup & Configuration

**Q: How do I register my company?**
A: Visit the Viri PWA, click Register, and fill in your company details. A superadmin will approve your registration.

**Q: How do I install the Chrome Extension?**
A: Search for "Viri" in the Chrome Web Store and click "Add to Chrome." Pin the extension icon to your toolbar for easy access.

**Q: What is a pairing code?**
A: A 6-digit, single-use code that links a Chrome Extension to a specific terminal. Pairing codes expire after 10 minutes.

**Q: How do I pair my terminal?**
A: Open the Viri extension on the terminal computer, click "Pair Terminal," and enter the 6-digit code from the admin dashboard.

**Q: How do I set up BML credentials?**
A: In the extension, go to Settings → Banks → BML, click "Authorize with BML," log in to BML Corporate IB, and complete TOTP verification.

**Q: How do I set up MIB credentials?**
A: In the extension, go to Settings → Banks → MIB, click "Generate Device Keys," and register the public keys with MIB.

**Q: What is a TOTP seed and where do I find it?**
A: A TOTP seed is the secret key used to generate time-based one-time passwords. It's the same key you've configured in your authenticator app (Google Authenticator, Microsoft Authenticator, etc.) when setting up bank login. You may need to set up a new authenticator enrollment to export the seed.

**Q: Can I use the same bank login on multiple terminals?**
A: Yes. Use the Credential Sync feature in the admin dashboard to securely share bank credentials between terminals.

**Q: What happens if a terminal is lost or stolen?**
A: Company admins can revoke terminal access from the dashboard. The terminal's pairing code is invalidated, and any stored credentials are isolated to that device.

### Billing & Subscriptions

**Q: What subscription plans are available?**
A: Viri offers four tiers: Free (20 verifications/month), 499 (300 verifications/month), 999 (unlimited verifications), and 1999 (unlimited + all features).

**Q: What is a verification credit?**
A: Each successful transfer verification consumes one credit. Failed or error verifications do not consume credits. Credits reset at the start of each billing cycle.

**Q: What happens when I run out of credits?**
A: Once you reach your plan's limit, verification requests will be blocked until the next billing cycle or until you upgrade to a higher tier. The ledger and reports remain accessible.

**Q: How do I renew my subscription?**
A: Log in as a company admin, go to the subscription section, select your plan, upload the payment receipt, and wait for superadmin approval.

**Q: Can I upgrade or downgrade my plan?**
A: Yes. Upgrade at any time — credits are pro-rated. Downgrades take effect at the next billing cycle.

**Q: How do I pay?**
A: Bank transfer to the Viri account. Upload your payment receipt through the PWA, and a superadmin will approve it.

### Security

**Q: How are my banking credentials protected?**
A: Credentials are encrypted using AES-256-GCM with a unique key per credential. Keys are derived using PBKDF2. The encrypted data is stored only in the Chrome Extension's local storage. The API never receives plaintext credentials.

**Q: Can Viri see my bank account passwords?**
A: No. Passwords are entered in the extension and encrypted before transmission. The API only handles encrypted blobs that it cannot decrypt.

**Q: What happens during credential sync between terminals?**
A: The source terminal encrypts the credentials, uploads the encrypted blob to the API, and the target terminal downloads and decrypts it locally. The API never has the decryption keys.

**Q: How are OTPs and TOTP codes protected?**
A: TOTP seeds are stored in the extension's encrypted storage and used locally to generate codes. OTPs are captured from the browser page and injected directly into bank login forms — they are never transmitted to any external server.

**Q: Are all communications encrypted?**
A: Yes. All API communications are over HTTPS (TLS). The PWA and extension only communicate with the Viri API over encrypted connections.

**Q: What happens if my internet goes down?**
A: The PWA requires an internet connection to verify transfers. The extension stores credentials locally and will attempt to reconnect automatically.

### Troubleshooting

**Q: The extension won't connect to the API.**
A: Check that:
- The terminal is paired and active
- The computer has internet access
- The Viri API URL is correctly configured in the extension
- Try restarting Chrome

**Q: Transfer verification is stuck on "Pending."**
A: This usually means the extension is still processing the request. Try:
- Refreshing the PWA page
- Checking that the extension is running (green icon)
- Verifying that the bank session is still active (the extension may need to re-login)
- If stuck for more than 30 seconds, cancel and try again

**Q: I see "Terminal unauthorized" when trying to verify.**
A: This means the terminal is either not paired, has been revoked, or is suspended. Check the terminal status in the admin dashboard.

**Q: Bank login keeps failing.**
A: Possible causes:
- The stored credentials are incorrect — update them in the extension
- The TOTP seed is out of sync — regenerate and re-enter
- The bank portal is down for maintenance
- MIB device keys may have expired — regenerate them

**Q: Statement extraction is not working.**
A: Try:
- Ensure you are logged into the bank portal in Chrome
- Check that the extension has the correct bank page open
- The bank portal may have updated its layout — report to support
- Try manual extraction

**Q: OTP is not being captured automatically.**
A: Check that:
- The extension has permission to access the bank portal page
- The OTP is being sent via SMS (the extension looks for OTP fields on the page)
- For MIB, the OTP may need manual entry in some cases

**Q: The extension icon shows red / error.**
A: This means the extension cannot connect to the paired terminal or the API. Open the extension popup for details.

**Q: How do I get help?**
A: Use the Help tab in the PWA for searchable FAQ and setup guides. Contact support via the phone number listed in the application for urgent issues.

---

## 9. Glossary

| Term | Definition |
|------|------------|
| **Terminal** | A cashier station running the Viri Chrome Extension, linked to a company via a pairing code |
| **Pairing Code** | A 6-digit, single-use, time-limited code that links a Chrome Extension to a terminal |
| **TOTP Seed** | The secret key used to generate Time-based One-Time Passwords for bank login authentication |
| **OTP** | One-Time Password — a temporary code sent via SMS for bank login verification |
| **Credential Sync** | The secure process of sharing encrypted bank credentials between terminals |
| **Verification Credit** | A unit representing one successful bank transfer verification |
| **Zero-Knowledge** | An architecture where the server never has access to plaintext secrets — credentials are encrypted and decrypted only on client devices |
| **Ledger** | A chronological record of all verified bank transfers |
| **Session Holder** | The terminal currently holding an active bank session for a specific account |
| **Heartbeat** | A periodic signal from the extension to confirm the bank session is still active |
| **SSE** | Server-Sent Events — a technology for real-time push notifications from server to client |
| **PWA** | Progressive Web App — a web application that can be installed on a device like a native app |
| **DH Key** | Diffie-Hellman key pair used for MIB device authentication |
| **PBKDF2** | Password-Based Key Derivation Function 2 — used to derive encryption keys from passphrases |
| **DEK** | Data Encryption Key — the key used to encrypt credential data, itself wrapped (encrypted) by a key derived from the user's passphrase |
| **GCM IV** | Galois/Counter Mode Initialization Vector — a cryptographic nonce used with AES-GCM encryption |
| **ECB** | Electronic Codebook — a block cipher mode (used in MIB's protocol for compatibility) |

---

*This document was prepared for Viri Platform. For the latest information, visit the Viri PWA or contact your system administrator.*

*Last updated: July 2026*
