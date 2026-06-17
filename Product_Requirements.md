# Product Requirements Document (PRD) & Engineering Specification
## Project Title: Viri - Decentralized Live Bank Transfer Verification SaaS (BML & MIB Platform)
**Target Engineering Team:** Antigravity AI  
**Deployment Model:** Private SaaS (Controlled Subscribers)  
**Document Purpose:** Complete Production Blueprint for AI-Driven Code Generation & Software Engineering  

---

## 1. Executive Summary & Objective

### 1.1 Context & Problem Statement
In the Maldivian retail ecosystem, customers pay via instant manual mobile bank transfers (Bank of Maldives - BML, and Maldives Islamic Bank - MIB) at physical retail cash counters. Upon transferring, the customer presents a digital screenshot receipt to the cashier. Cashiers currently lack an immediate, programmatic method to safely confirm fund arrival without calling account owners, passing physical corporate tokens, or manually browsing banking portals. This operational vulnerability leads to checkout bottlenecks and high risks of fraud via falsified screenshots.

### 1.2 The Solution
**Viri** is a secure, private, multi-tenant Web Software-as-a-Service (SaaS) platform that allows counter cashiers to verify incoming manual bank transfers on-demand within 3–5 seconds. 

To eliminate systemic risks such as bank firewalls, corporate liability, centralized IP blacklisting, and strict multi-factor authentication constraints, **Viri** utilizes a **Decentralized Hybrid Architecture**. This combines a frontend Progressive Web App (PWA) container with an elevated Local Browser Extension Bridge running locally at each terminal counter.

---

## 2. Technical Reference Materials & Dependencies

To implement the payment and structural verification components, the engineering team must incorporate guidelines and architectural references from the following endpoints:

1. **Official BML Gateway Sandbox Reference:** [Bank of Maldives API Portal](https://bankofmaldives.stoplight.io/)
   * Used strictly for tracking transaction payload layouts, schema structures, verification parameters, and structural merchant metadata validation patterns.
2. **Community Automation Prototype Engine:** [gateway-mv-js (Umran)](https://github.com/umran/gateway-mv-js)
   * Used as an architectural reference for executing custom programmatic network handling, handling local Maldivian payment parsing states, matching request signatures, and managing programmatic validation structures on the local client machine.
3. **Admin UI Layout & Visual Identity System:** [Dribbble Core Dashboard System](https://cdn.dribbble.com/userupload/40644054/file/original-1472a374645d94ed15a66cb94ff630bf.png?resize=3810x2858&vertical=center)
   * UI design benchmark for the Viri Super-Admin dashboard layout, mobile responsive spacing constraints, navigation mechanics, and telemetry display.

---

## 3. System Architecture & Components

```
[Viri Cashier Dashboard (PWA)] <--------------------> [IndexedDB + Web Crypto API]
       |                                                    (Local Sandboxed Storage)
       | (Internal Chrome Runtime Long-Lived Messages)
       v
[Viri Browser Extension Bridge] ---------------------> [Bank Endpoints (BML / MIB)]
                                                        (Uses Local Counter IP)
```

### 3.1 Central Cloud Web Server / Viri Backend & Admin Panel
* **Tenant & Customer Management Hub:** A secure backend portal accessible only to system administrators (our internal team) to provision, monitor, and configure merchant business registrations.
* **Per-Terminal Licensing & Subscription Engine:**
  * **Metered Billing Base:** Subscriptions are strictly calculated and enforced based on the total number of physical **terminals** (software instances) deployed by the customer. Each cash counter utilizing a localized phone/web instance running Viri counts as an active terminal.
  * **Invoicing System:** Admin portal features an integrated invoicing panel allowing the system admin to programmatically generate and track **Monthly** and **Annual** invoices for each customer.
  * **Automatic Lifecycle Expiration:** The system must actively track contract end dates. The moment the subscription period expires, Viri **must automatically stop** and suspend all verification access for that customer's terminals.
  * **Manual Admin Resumption:** Suspended subscriptions cannot auto-renew via client-side switches. A suspended subscription will **only resume** once a system administrator manually reviews the account and clicks "Re-enable Subscription" inside the admin backend panel.
* **Centralized Security Audit Log System:**
  * **System Integrity Tracking:** The server must maintain a read-only, append-only security audit log accessible strictly by the Viri system software administrators (our team).
  * **Captured Telemetry:** The log must document structural administrative changes, including: subscription activation/suspension timestamps, invoice generation/payment logs, user credential resets, changes to terminal allocations per merchant, and anomalous terminal connection attempts.
* **CRITICAL SECURITY REQUIREMENT:** The cloud backend database must **never** store, transmit, process, or see the plaintext or ciphertext banking credentials, usernames, passwords, or TOTP secret seeds of the subscribers. Viri operates as a strict zero-knowledge architecture regarding financial authentication data.

### 3.2 Progressive Web App (PWA) Container
* **Interface Layer:** Serves as the high-speed frontend dashboard operated by cashiers on their phones or PCs at their respective counter slots. Can be run inside any standard browser tab or installed locally as a standalone container app.
* **Operations:** Handles sales parameter initialization (Bank selection, Target Amount, Timestamp) and delivers immediate success/failure states.

### 3.3 Viri Browser Extension Bridge (The Scraping Core)
* **Privileged Engine:** An unlisted, side-loaded background browser extension running in tandem with the Viri PWA UI.
* **Capabilities:** Configured with elevated permissions (`declarativeNetRequest`, `cookies`, `<all_urls>`) to intentionally bypass browser Cross-Origin Resource Sharing (CORS) and Content Security Policies (CSP). This allows direct, headless API polling to bank infrastructure.
* **IP Localization:** Executes all network sessions using the cashier counter’s native residential/commercial IP address, naturally evading centralized server-side fingerprinting blocks.

---

## 4. Design & User Interface (UI) Architecture

The interface philosophy relies on a **high-end minimalist, sleek, and high-contrast styling approach**. It balances dense technical data representation with clean, micro-interaction whitespace patterns.

### 4.1 Global Visual System & Palette
* **Theme Archetype:** Premium dark mode base option layered over a stark, highly scannable high-contrast daylight setup. 
* **Core Palette:** Deep charcoal background canvas, off-white container tiles, crisp steel accent borders, and dynamic glowing telemetry blocks (Emerald green for verified entries, deep amber for pending executions, and soft slate gray for default variables).
* **Typography Hierarchy:** Bold, geometric sans-serif type scaling built strictly around high structural legibility on tiny responsive screens.

### 4.2 Cashier Mobile & Web Container Layout
* **Multi-Account Selector Dropdown:** Placed at the highest layout index of the screen. Cashiers can toggle between multiple linked bank checking or savings accounts. The settings module must feature a permanent **"Set as Default Account"** toggle switch, ensuring the primary business account is pre-selected upon every viewport initialization loop.
* **On-Demand Transaction Matrix:** Centered primary operational panel. Features an uncluttered numeric currency input line, clear bank option badges (BML / MIB), and a prominent **"Verify Transfer"** action element.
* **Real-Time Analytics Node (Daily Totals):** A distinct, stylized secondary visual node. This displays a running sum of the **Total Daily Transfer Amount** collected since midnight. The logic partitions this value cleanly, displaying a **separate total metrics counter for each individual linked bank account**. Cashiers or managers can touch/click a "Sync Aggregates" trigger at any point of the day to process a background total recalculation.

### 4.3 Mobile-Responsive Viri Super-Admin Panel
Following layout indicators found inside the Dribbble Core layout, the internal team administration view must scale perfectly into a compact smartphone view framework:
* **The Telemetry Grid:** Arranged in stacked, sleek horizontal cards. Each card represents a tenant merchant, detailing their name, active terminal metrics count, billing tier, and exact license status.
* **Inline Action Framework:** Admin actions—such as raising invoices, inspecting append-only security logs, or clicking the manual "Re-enable Subscription" command element—must be fully optimized for touch interactions using modern edge-swipes and clean sliding modal windows.

---

## 5. Core Technical Workflows & Specifications

### 5.1 Zero-Knowledge Local Credential Provisioning
1. The Merchant Admin logs into the installed Viri PWA and opens the local hardware settings node on their specific terminal device.
2. The Admin inputs bank credentials (Username, Password) and the **TOTP Secret Text Key (Seed)** obtained by turning on the "Authenticator App" 2FA setting within BML Internet Banking or MIB FaisaNet.
3. The PWA executes local-only client-side encryption via the browser's native `crypto.subtle` (**AES-256-GCM**).
4. The resulting cipher payload is persisted inside the browser's sandboxed local **IndexedDB**. **Zero bytes of authentication data touch the external Viri cloud backend.**

### 5.2 Multi-Account and Daily Aggregation Scopes
* **Multi-Account Index Engine:** During background initialization, the Viri extension loops through the customer’s active account profiles. The script caches the structural internal IDs for each validated checking line, binding them to the local frontend account selectors.
* **Daily Summary Calculator:** When an aggregation recalculation is requested by the interface, the script opens a silent banking stream, parses the full ledger statement bounds matching the current local calendar date string, tallies the `CREDIT` entries independently per account index, and returns the absolute sum value securely to the local UI.

### 5.3 Automated 2FA Bypass (TOTP Generation)
* To allow seamless background verification without human intervention for SMS verification, the Viri Browser Extension contains an isolated TOTP parsing library.
* Upon a check trigger, the extension pulls the encrypted string from IndexedDB, decrypts it in-memory, and calculates the live 6-digit verification code at that exact timestamp using standard RFC 6238 parameters.

### 5.4 On-Demand "Verify Transfer" Step-by-Step Flow
1. **Trigger:** Customer initiates a manual transfer. Cashier enters the exact amount (e.g., `MVR 450.00`), confirms the targeted account selector (defaults automatically if unadjusted), and clicks **"Verify Transfer"**.
2. **License Guard:** The PWA verifies with the cloud backend that the current terminal ID is explicitly authorized and that the root subscription has not been stopped or expired.
3. **IPC Bridging:** The PWA dispatches a localized `chrome.runtime.sendMessage` event to the Viri Extension Bridge containing target transaction metadata.
4. **Authentication:** The extension generates the real-time TOTP token, launches a headless HTTP connection, and authenticates the user directly session-side with BML or MIB endpoints.
5. **Data Pull:** The extension targets the raw internal transaction statement JSON endpoints, extracting the 5 most recent activities using the local ISP network route.
6. **Matching Engine:** The script executes an immediate validation match filtering for:
   * `Transaction Type == CREDIT`
   * `Amount == Target Amount`
   * `Timestamp == Windowed Range (Current Time minus X minutes)`
7. **Resolution:** The extension returns an instant structural object back to the PWA UI: `{status: "CREDITED", reference: "BML-XXXXXX"}`. The session terminates immediately.

---

## 6. Integration Targets (Bank Specifics)

### 6.1 Bank of Maldives (BML)
* **Target Interface:** Mobile Banking API Endpoint emulation.
* **Data Context:** Must parse standard financial statement payloads and accurately isolate specific checking accounts or business sub-accounts configured by the administrator. Implement tracking checks in strict accordance with structure examples located in the official documentation mapping arrays (`bankofmaldives.stoplight.io`).

### 6.2 Maldives Islamic Bank (MIB)
* **Target Interface:** FaisaNet/FaisaMobile Gateway emulation (`auth.mib.com.mv`).
* **Profile Routing:** The automation parser must explicitly handle profile switching vectors if the master user credentials contain multiple associated corporate or merchant sub-profiles.

---

## 7. Security, Risk Compliance, & UX Guidelines

### 7.1 Strict Security Controls
* **Anti-Lockout Throttle:** **DO NOT** implement automated background loops or constant cron checks every 60 seconds. Queries must run purely **on-demand** upon manual cashier button execution to prevent threshold lockout blocks.
* **Volatile Memory:** Session cookies and authenticated states must reside solely within short-lived extension background memory variables and must be completely purged upon confirmation delivery.
* **Strict Non-Storage of Authentication Data:** Reiterate throughout the software's documentation and code architecture that *zero* customer banking passwords or 2FA secret seeds are transmitted to, handled by, or stored on the cloud server. All sensitive data must remain localized inside the user's encrypted local database.

### 7.2 User Experience & Trust Visibility
The Viri interface must proactively reinforce system security to the end-user through explicitly visible cues:
* **The "Zero-Knowledge" Trust Badge:** A persistent graphic element displayed across the header stating: `"Viri Zero-Knowledge Architecture: Financial passwords are fully encrypted and stored strictly on this local terminal machine."`
* **Local Crypto Metrics:** When modifying setups, display explicit notifications detailing cryptographic isolation: `"Viri: Encrypting fields using local hardware parameters via AES-256 GCM..."`
* **Encrypted State Feedback:** During validation, display status messages tracking data insulation: `"Viri: Opening Direct, Local-to-Bank Secured Connection..."`

---

## 8. Implementation Deliverables

1. **Central Portal Application & Back-End Admin Management:** Mobile-first responsive admin dashboard (following modern clean grid layouts), handling customer management nodes, custom invoice engines, audit log tables, terminal allocation tracking, and subscription freeze mechanisms.
2. **Viri Progressive Web App Dashboard:** Frontend POS mobile/desktop interface utilizing a modern, sleek minimalist palette, account toggles, default account parameters, and a segregated daily total accumulation viewer.
3. **Companion Browser Extension:** Manifest V3 extension managing cross-origin background execution scripts, real-time TOTP computation, and statement JSON extraction utilities for BML and MIB using custom script wrappers built using `gateway-mv-js` functional mechanics.