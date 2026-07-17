# Documentation Navigation

> **Entry point.** Start here to understand the project structure and find the
> right document for your task.

---

## Project Overview

MIB Emulation is a reverse-engineering and automation project targeting
**FaisaMobile X**, the Android mobile banking application of **Maldives Islamic
Bank (MIB)**. It consists of two components:

1. **`mib-mock-app/`** — A Flask-based debug web app that exercises the MIB API
   step by step with full visibility into the encrypted request/response lifecycle.
2. **`mib-aggregator/`** — A headless Python aggregator for syncing account data,
   balances, and transaction history via the MIB API.

The API uses Blowfish/ECB/PKCS5 encryption with Diffie-Hellman key exchange and
a custom nonce generation algorithm — all extracted from the app's Hermes
bytecode bundle.

---

## Directory Structure

```
mibemulation/
├── mib-mock-app/                    # Flask debug web application
│   ├── app.py                       # Flask routes and login orchestration
│   ├── mib_client.py                # MIB API client library (all step functions)
│   ├── logger.py                    # Structured debug log accumulator
│   ├── session_store.py             # Session persistence (JSON file)
│   ├── requirements.txt             # Python dependencies
│   ├── session.json                 # Persisted session (auto-generated)
│   ├── templates/
│   │   └── index.html               # Single-page app frontend
│   └── static/
│       └── app.js                   # Frontend JavaScript
│
├── mib-aggregator/                  # Headless banking data aggregator
│   ├── main.py                      # Entry point
│   ├── cli.py                       # CLI argument parser and command dispatch
│   ├── config.py                    # Environment-based configuration
│   ├── scheduler.py                 # APScheduler job definitions
│   ├── crypto/                      # Encryption and key derivation modules
│   │   ├── cipher.py                #   Blowfish/ECB/PKCS5 encrypt/decrypt
│   │   ├── key_derivation.py        #   DH key derivation, password salting
│   │   ├── payload.py               #   Request/response envelope construction
│   │   └── device.py                #   Device key storage (server-assigned)
│   ├── client/                      # API client and endpoint definitions
│   │   ├── api.py                   #   HTTP client with encrypted payloads
│   │   ├── auth.py                  #   Authentication flow (login + OTP)
│   │   └── endpoints.py             #   sfunc values and routePath catalog
│   ├── db/                          # Database layer (SQLAlchemy + SQLite)
│   │   ├── models.py                #   ORM models (Account, Transaction, Session)
│   │   └── store.py                 #   CRUD operations
│   ├── sync/                        # Data synchronization modules
│   │   ├── accounts.py              #   Account sync (A80)
│   │   ├── transactions.py          #   Transaction sync (WebView-based)
│   │   └── session.py               #   Session refresh (S40 re-key)
│   └── tools/                       # Reverse-engineering utilities
│       ├── hbc_strings.py           #   Hermes Bytecode string extractor
│       ├── analyze_memdump.py       #   Process memory dump analysis
│       └── verify_crypto.py         #   Crypto verification CLI
│
├── bytecode_analysis/               # Automated bytecode analysis pipeline
│   ├── scripts/                     #   Plan 2 deep-dive analysis scripts
│   │   └── plan2/                   #   8 scripts (p2_1 through p2_8)
│   └── output/                      #   34 output files (~48 MB total)
│       ├── summary_report.md        #   Consolidated findings and validation
│       ├── endpoints.json           #   24 endpoints with payload contexts
│       ├── bytecode.db              #   25.7 MB SQLite instruction database
│       ├── plan2/                   #   Plan 2 output (18 files, ~12 MB)
│       │   ├── PLAN2_SUMMARY.md     #   566-line consolidated summary
│       │   ├── discoveries.md       #   Notable findings log
│       │   ├── validation_report.md #   Gap analysis (10 discrepancies)
│       │   └── ...                  #   (variable flow, conditionals, subgraphs)
│       └── ...                      #   (call graph, variable flow, etc.)
│
├── docs/                            # Living documentation (this directory)
│   ├── NAVIGATION.md                #   You are here
│   ├── README.md                    #   Project overview and quick start
│   ├── RULEBOOK.md                  #   Binding project governance rules
│   ├── ARCHITECTURE.md              #   System design and module interactions
│   ├── REVERSE_ENGINEERING.md       #   Hermes bytecode and crypto analysis
│   ├── API.md                       #   API endpoint reference
│   ├── FLOW.md                      #   Authentication and session flows
│   ├── SESSION_MANAGEMENT.md        #   Session lifecycle, resurrection, keepalive
│   ├── KNOWN_ISSUES.md              #   Known limitations and future work
│   ├── DEPLOYMENT.md                #   Setup, configuration, and usage
│   ├── PRE_INTEGRATION_CONCERNS.md  #   Architectural gaps for production
│   └── UPDATING.md                  #   Documentation maintenance guide
│
└── (other project-level files)
```

---

## Documentation Table of Contents

| Document | Description |
|----------|-------------|
| [NAVIGATION.md](NAVIGATION.md) | **This file** — directory map and documentation index |
| [README.md](README.md) | Project overview, problem statement, high-level architecture, tech stack, quick start |
| [RULEBOOK.md](RULEBOOK.md) | **19 binding rules** for authentication, financial actions, documentation, testing, emergencies, and password hash policy |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture diagrams, module descriptions, data flow diagrams, session management |
| [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md) | Hermes bytecode disassembly methodology, crypto functions (Blowfish/DH/nonce), constants, tools |
| [API.md](API.md) | Complete endpoint catalog: sfunc values, routePath values, payload formats, error codes, WebView session, all WebView URLs |
| [FLOW.md](FLOW.md) | Step-by-step authentication flow, key exchange, nonce generation, session persistence, approval workflow, transfer initiation |
| [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) | Session lifecycle (create, init, active, expiry, death, resurrection), keepalive mechanisms, stored data requirements, failure modes, aggregator integration guide |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Current limitations, bug statuses, missing endpoints, future improvement roadmap |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Setup instructions, configuration reference, troubleshooting |
| [PRE_INTEGRATION_CONCERNS.md](PRE_INTEGRATION_CONCERNS.md) | Architectural gap analysis from the pre-integration review, prioritized fix roadmap |
| [VERIFICATION.md](VERIFICATION.md) | Comprehensive verification status against bytecode, discrepancy table, alignment summary |
| [UPDATING.md](UPDATING.md) | Living documentation philosophy, trigger-to-file mapping, update template |

---

## Quick Links

### Running the Project

- **Start the mock app:** `cd mib-mock-app && python app.py` → http://127.0.0.1:5678
- **Run the aggregator CLI:** `cd mib-aggregator && python main.py --help`
- **Full setup guide:** [DEPLOYMENT.md](DEPLOYMENT.md)

### Key Reference Sections

- **Session lifecycle (full):** [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md)
- **Session resurrection guide:** [SESSION_MANAGEMENT.md#session-resurrection](SESSION_MANAGEMENT.md#session-resurrection)
- **Encryption overview:** [REVERSE_ENGINEERING.md#encryption-algorithms-discovered](REVERSE_ENGINEERING.md#encryption-algorithms-discovered)
- **Nonce generation algorithm:** [REVERSE_ENGINEERING.md#nonce-generation-algorithm](REVERSE_ENGINEERING.md#nonce-generation-algorithm)
- **Error code catalog:** [API.md#error-codes](API.md#error-codes)
- **All 23 routePath values:** [REVERSE_ENGINEERING.md#complete-routepath-catalog](REVERSE_ENGINEERING.md#complete-routepath-catalog)
- **Automated bytecode analysis summary:** `bytecode_analysis/output/summary_report.md`
- **Full bytecode verification status:** [VERIFICATION.md](VERIFICATION.md)
- **Gap analysis (10 discrepancies):** `bytecode_analysis/output/plan2/validation_report.md`
- **Plan 2 comprehensive summary:** `bytecode_analysis/output/plan2/PLAN2_SUMMARY.md`
- **WebView session setup:** [API.md#webview-session-establishment](API.md#webview-session-establishment)
- **Transaction history via WebView:** [FLOW.md#transaction-history-via-webview](FLOW.md#transaction-history-via-webview)

### Governance

- **All rules:** [RULEBOOK.md](RULEBOOK.md)
- **Authentication rules:** [RULEBOOK.md#authentication-rules-r1r5](RULEBOOK.md#authentication-rules-r1r5)
- **Financial action rules:** [RULEBOOK.md#financial-action-rules-r6r8](RULEBOOK.md#financial-action-rules-r6r8)

---

## How to Use This Documentation

### If you are debugging a login failure:

1. Read [FLOW.md](FLOW.md) — understand the 6-step login flow
2. Check [API.md](API.md#error-codes) — identify the error code
3. Check [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — see if the issue is already documented
4. Read [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md#nonce-generation-algorithm) — verify nonce generation if the error is 501

### If you are adding a new endpoint:

1. Add the routePath to [endpoints.py](../mib-aggregator/client/endpoints.py)
2. Add the step function to [mib_client.py](../mib-mock-app/mib_client.py)
3. Update [API.md](API.md) — add to endpoints table with payload/response format
4. Update [FLOW.md](FLOW.md) — add a flow section if it's part of a multi-step process
5. Verify against [RULEBOOK.md](RULEBOOK.md) — ensure no rule violations (especially R6–R8 for financial endpoints)

### If you are fixing a bug related to session management:

1. Read [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) — understand the session lifecycle
2. Check [SESSION_MANAGEMENT.md#failure-modes](SESSION_MANAGEMENT.md#failure-modes) — identify which failure mode applies
3. Update [mib_client.py](../mib-mock-app/mib_client.py) or aggregator code
4. Update [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — mark the issue as resolved
5. Run syntax check: `python3 -m py_compile <file>`

### If you are implementing session resurrection in the aggregator:

1. Read [SESSION_MANAGEMENT.md#session-resurrection](SESSION_MANAGEMENT.md#session-resurrection) — understand the flow
2. Read [SESSION_MANAGEMENT.md#aggregator-integration-guide](SESSION_MANAGEMENT.md#aggregator-integration-guide) — implementation patterns
3. Update `sync/session.py` — implement `refresh_session()` with actual S40 calls
4. Update `client/api.py` — add error detection that triggers resurrection
5. Update [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — mark related issues as resolved

### If you are fixing a bug:

1. Update the code
2. Update the relevant documentation (see [UPDATING.md](UPDATING.md) for the trigger table)
3. Update [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — mark the issue as resolved
4. Run syntax check: `python3 -m py_compile <file>`

### If you are reverse-engineering a new feature:

1. Search the Hermes bytecode disassembly at `/tmp/full_disas.hasm`
2. Use tools in `mib-aggregator/tools/` for string extraction and memory analysis
3. Document findings in [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md)
4. Add discovered endpoints to [API.md](API.md)

### If you are preparing for production deployment:

1. Read [PRE_INTEGRATION_CONCERNS.md](PRE_INTEGRATION_CONCERNS.md) — understand the gaps
2. Read [RULEBOOK.md](RULEBOOK.md) — ensure compliance with all rules
3. Read [DEPLOYMENT.md](DEPLOYMENT.md) — configure the aggregator
