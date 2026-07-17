# MIB Emulation — Project Overview

**Navigation:** [Documentation Index](NAVIGATION.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [What is MIB Emulation?](#what-is-mib-emulation)
- [The Problem](#the-problem)
- [High-Level Architecture](#high-level-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Further Reading](#further-reading)

## What is MIB Emulation?

MIB Emulation is a reverse-engineering and automation project targeting **FaisaMobile X**, the Android mobile banking application of **Maldives Islamic Bank (MIB)**. The project consists of two major components:

1. **`mib-aggregator/`** — A headless Python aggregator that can sync account balances, transaction history, and other banking data via the MIB API. Designed to run as a daemon or CLI tool.

2. **`mib-mock-app/`** — A Flask-based debug web application that provides an interactive UI for exercising the MIB API endpoints step by step, with full visibility into the encrypted request/response lifecycle. The debug panel shows every encryption, decryption, key derivation, and nonce generation operation in detail.

The ultimate goal is to build a reliable, well-documented banking API client that can be used for personal finance aggregation, automated reconciliation, and financial analytics — all without relying on screen-scraping or unofficial proxy services.

## The Problem

MIB's FaisaMobile X Android app communicates with its backend via a REST API at `https://faisanet.mib.com.mv/faisamobilex_smvc/`. The API uses:

- **Blowfish/ECB/PKCS5** encryption (not AES or 3DES, as initially suspected)
- **Diffie-Hellman key exchange** using large 1024-bit primes
- **HMAC authentication** with derived keys
- A custom **nonce generation algorithm** embedded in the Hermes JS bytecode

The app is built with **React Native**, which compiles JavaScript to **Hermes Bytecode** (v96). The bytecode is bundled into `index.android.bundle` — a ~565K line disassembly after decompilation. Reverse-engineering this bundle was necessary to extract the encryption constants, algorithm details, and API endpoint patterns.

An automated 8-phase bytecode analysis pipeline (`bytecode_analysis/`) was subsequently built to validate every finding against the full 3MB bundle. It analysed all 14,959 functions and 29,891 strings, confirming 23 routePaths, 20+ crypto functions, and producing 16 output files (~36 MB total). A second pass (Plan 2) added 8 targeted deep-dives, producing 18 additional files (~12 MB). The full analysis confirmed the aggregator implementation is correct — see [`VERIFICATION.md`](VERIFICATION.md), [`REVERSE_ENGINEERING.md#automated-bytecode-analysis`](REVERSE_ENGINEERING.md#automated-bytecode-analysis), and [`bytecode_analysis/output/summary_report.md`](../bytecode_analysis/output/summary_report.md).

Because the official API is not publicly documented, every endpoint, parameter, and encryption detail had to be inferred from:

- Hermes bytecode disassembly and string extraction
- Runtime memory dumps of the app process
- Proxyman/HTTP debugger captures of live traffic
- Iterative trial-and-error with the mock app

## High-Level Architecture

```
User/Browser
    │
    ▼
┌─────────────────────┐     ┌──────────────────────────────┐
│   mib-mock-app      │     │   mib-aggregator             │
│   (Flask Web UI)    │     │   (Headless CLI/Daemon)      │
│                     │     │                              │
│  Routes:            │     │  Commands:                   │
│   /login            │     │   sync-accounts              │
│   /otp              │     │   sync-transactions          │
│   /dashboard        │     │   session-refresh            │
│   /api/logs         │     │   daemon                     │
│   /api/session      │     │                              │
└─────────┬───────────┘     └──────────────┬───────────────┘
          │                                │
          │     HTTPS (encrypted)          │
          ▼                                ▼
┌──────────────────────────────────────────────┐
│     faisanet.mib.com.mv                      │
│     /faisamobilex_smvc/                      │
│                                              │
│     Endpoints:                               │
│      sfunc=r  — Device Registration          │
│      sfunc=i  — Key Exchange / Session Init  │
│      sfunc=n  — Normal (encrypted) requests  │
│       routePath=A44 — Get Auth Type          │
│       routePath=A40 — Login with Password    │
│       routePath=C42 — OTP Verification       │
│       routePath=A80 — Get Account List       │
│       routePath=C43 — Resend OTP             │
└──────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend (mock app)** | Python 3, Flask |
| **Backend (aggregator)** | Python 3, httpx, SQLAlchemy, APScheduler |
| **Encryption** | PyCryptodome (Blowfish/ECB/PKCS5) |
| **Database** | SQLite (aggregator) / JSON file (mock app sessions) |
| **Frontend** | HTML5, Bootstrap 5, vanilla JavaScript |
| **Reverse Engineering** | Hermes-dec disassembler, custom bytecode string extractor, memory dump analyzer |
| **HTTP Debugging** | Proxyman |

## Project Structure

```
mibemulation/
├── mib-mock-app/                    # Flask debug web app
│   ├── app.py                       # Flask routes and login orchestration
│   ├── mib_client.py                # MIB API client library
│   ├── logger.py                    # Structured debug log accumulator
│   ├── session_store.py             # Session persistence (JSON file)
│   ├── requirements.txt             # Python dependencies
│   ├── session.json                 # Persisted session (auto-generated)
│   ├── templates/
│   │   └── index.html               # Single-page app frontend
│   └── static/
│       └── app.js                   # Frontend JavaScript
│
├── mib-aggregator/                  # Headless banking aggregator
│   ├── main.py                      # Entry point
│   ├── cli.py                       # CLI argument parser and command dispatch
│   ├── config.py                    # Environment-based configuration
│   ├── scheduler.py                 # APScheduler job definitions
│   ├── crypto/
│   │   ├── __init__.py
│   │   ├── cipher.py                # Blowfish/ECB/PKCS5 encrypt/decrypt
│   │   ├── key_derivation.py        # DH key derivation, password salting
│   │   ├── payload.py               # Request/response envelope construction
│   │   └── device.py                # Device key generation and storage
│   ├── client/
│   │   ├── __init__.py
│   │   ├── api.py                   # HTTP client with encrypted payloads
│   │   ├── auth.py                  # Authentication flow (login + OTP)
│   │   └── endpoints.py             # API endpoint operation codes
│   ├── db/
│   │   ├── __init__.py
│   │   ├── models.py                # SQLAlchemy ORM models
│   │   └── store.py                 # Database CRUD operations
│   ├── sync/
│   │   ├── __init__.py
│   │   ├── accounts.py              # Account sync logic
│   │   ├── transactions.py          # Transaction sync logic
│   │   └── session.py               # Session heartbeat and token refresh
│   └── tools/
│       ├── hbc_strings.py           # Hermes Bytecode string extractor
│       ├── analyze_memdump.py       # Memory dump analysis
│       └── verify_crypto.py         # Crypto verification CLI
│
└── docs/                            # Living documentation
    ├── README.md                    # This file
    ├── ARCHITECTURE.md              # Architecture & design
    ├── REVERSE_ENGINEERING.md       # Hermes bytecode & crypto analysis
    ├── API.md                       # API endpoint reference
    ├── FLOW.md                      # Authentication & session flow
    ├── SESSION_MANAGEMENT.md        # Session lifecycle, resurrection, keepalive
    ├── DEPLOYMENT.md                # Setup & usage
    ├── KNOWN_ISSUES.md              # Known issues & future work
    ├── VERIFICATION.md              # Bytecode verification status
    └── UPDATING.md                  # How to update documentation
```

## Quick Start

For detailed setup instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

```bash
# Clone the repository
git clone <repo-url> mibemulation
cd mibemulation/mib-mock-app

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the app
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000), enter your MIB credentials, and click **Login**. Use the **Debug** panel to inspect every encrypted request and response.

## Further Reading

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, module descriptions, data flow |
| [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) | Hermes bytecode disassembly, crypto analysis, nonce algorithm |
| [API.md](API.md) | Complete API endpoint reference with sfunc values and payloads |
| [FLOW.md](FLOW.md) | Step-by-step authentication and session flow |
| [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) | Session lifecycle, resurrection, keepalive, and aggregator integration |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Setup, configuration, and usage guide |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Current limitations, bugs, and future work |
| [VERIFICATION.md](VERIFICATION.md) | Bytecode verification status, discrepancy table, alignment summary |
| [NAVIGATION.md](NAVIGATION.md) | Documentation index and project structure map |
| [RULEBOOK.md](RULEBOOK.md) | 19 binding rules for project governance |
| [UPDATING.md](UPDATING.md) | Guidelines for keeping docs up to date |
