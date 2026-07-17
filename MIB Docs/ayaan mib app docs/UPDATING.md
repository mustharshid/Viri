# How to Update the Documentation

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Living Documentation Philosophy](#living-documentation-philosophy)
- [When to Update](#when-to-update)
- [What to Update](#what-to-update)
- [Template for Updates](#template-for-updates)
- [Cross-Referencing](#cross-referencing)
- [Contact](#contact)

## Living Documentation Philosophy

The `docs/` directory is a **living documentation** set. It should evolve alongside the codebase. Every time you:

- Add a new endpoint
- Fix a bug in the crypto or nonce logic
- Change the architecture
- Discover new API details
- Modify the deployment process

...you should update the relevant documentation file(s).

**Rule of thumb**: If another developer (or you in 6 months) would benefit from the information, write it down.

## When to Update

| Trigger | Files to Update |
|---------|-----------------|
| New API endpoint discovered | `API.md`, `FLOW.md`, `ARCHITECTURE.md` |
| Bug fix (e.g., nonce generator) | `REVERSE_ENGINEERING.md`, `KNOWN_ISSUES.md` |
| Architecture change | `ARCHITECTURE.md`, `README.md` |
| New crypto detail discovered | `REVERSE_ENGINEERING.md` |
| New dependency or requirement | `DEPLOYMENT.md`, `README.md` |
| Issue resolved | `KNOWN_ISSUES.md` — update status |
| New UI feature | `DEPLOYMENT.md` — update usage section |
| New environment variable | `DEPLOYMENT.md` — update config table |
| New tool or script | `ARCHITECTURE.md` — add to module list |
| New security finding | `REVERSE_ENGINEERING.md` — update security section |
| New pre-integration concern | `PRE_INTEGRATION_CONCERNS.md` — add section |
| Aggregator code fix (sfunc/device) | `KNOWN_ISSUES.md` — update status; `endpoints.py`/`device.py` |
| New routePath discovered | `API.md` — add to endpoints table; `FLOW.md` — add flow step |
| WebView endpoint discovered | `API.md` — add to WebView section |
| New governance rule added | `RULEBOOK.md` — add numbered rule with rationale |
| Session management detail discovered | `SESSION_MANAGEMENT.md` — update relevant section (lifecycle, resurrection, keepalive, failure modes) |
| Session resurrection logic changed | `SESSION_MANAGEMENT.md` — update resurrection flow and integration guide; `mib-mock-app/mib_client.py` — update `resurrect_session()`; `mib-aggregator/sync/session.py` — update `refresh_session()` |
| Document structure changes | `NAVIGATION.md` — update ToC, directory map, quick links |
| New documentation file added | `NAVIGATION.md` — add to ToC; `UPDATING.md` — add trigger row |
| Rulebook violation discovered | `KNOWN_ISSUES.md` — document the violation; `RULEBOOK.md` — if new rule needed |
| Password hash storage added | `RULEBOOK.md` — add R19 policy; `app.py` — store hash in `_persist_session()`, add `_authenticate_with_hash()`; `mib_client.py` — add `step_a41_with_hash()`; `KNOWN_ISSUES.md` — mark getSaltedPw issue resolved |
| New Plan (e.g., Plan 3) output | `REVERSE_ENGINEERING.md`, `VERIFICATION.md` — add Plan section and results |
| Aggregator module restructure | `ARCHITECTURE.md` — update module descriptions and line counts |
| Port/host change | `DEPLOYMENT.md` — update config table; `NAVIGATION.md` — update quick links |
| Route map change | `ARCHITECTURE.md` — add/remove routes in route map table |

## What to Update

### `README.md` — Project Overview

Keep this file high-level. Update when:
- The project's goals change
- The repo structure changes
- A major new component is added

### `ARCHITECTURE.md` — Architecture & Design

Update when:
- New modules or files are added
- The data flow changes
- State management changes
- Module interfaces change

### `REVERSE_ENGINEERING.md` — Hermes Bytecode & Crypto

Update when:
- New crypto algorithms are discovered
- Constants are added or changed
- The nonce algorithm is refined
- New bytecode analysis tools are created
- Memory dump analysis reveals new insights

### `API.md` — API Endpoints Reference

Update when:
- New endpoints are discovered or implemented
- Payload fields change
- Error codes are updated
- Endpoint parameters change
- Encoding conventions are refined

### `FLOW.md` — Authentication & Session Flow

Update when:
- The login flow changes (steps added/removed)
- Session management changes
- Key exchange logic is modified
- Nonce generation is updated

### `SESSION_MANAGEMENT.md` — Session Lifecycle

Update when:
- New session lifecycle details are discovered (TTL, expiry behavior)
- The resurrection flow changes
- Keepalive mechanisms change
- Stored data requirements change
- New failure modes are discovered
- The aggregator integration guide needs updating

### `PRE_INTEGRATION_CONCERNS.md` — Pre-Integration Concerns

Update when:
- A concern is resolved (update status to "Resolved")
- A new concern is identified
- The aggregator code is rewritten to match the verified protocol
- New findings change the risk assessment of existing concerns

### `UPDATING.md` — This File

Update when:
- A new documentation file is added
- New triggers or patterns are established
- The cross-reference structure changes

### `DEPLOYMENT.md` — Setup & Usage

Update when:
- Dependencies change
- Configuration options change
- Setup steps change
- New commands or features are added
- Troubleshooting tips are discovered

### `KNOWN_ISSUES.md` — Known Issues & Future Work

Update when:
- An issue is resolved (move to a "Resolved" section or remove)
- A new issue is discovered
- Future plans change
- Missing endpoints are found

## Template for Updates

When making a code change that affects documentation, use this pattern:

```markdown
## Update: [DATE] — [BRIEF DESCRIPTION]

### What Changed
[A clear, concise description of the code change]

### Why
[The reasoning behind the change — bug fix, new feature, optimisation, etc.]

### Files Affected
- [Path to file 1]: [What changed]
- [Path to file 2]: [What changed]

### Documentation Updated
- [docs/FILE.md]: [What was added/changed]

### Verification
[How to verify the change works correctly]
```

### Example

```markdown
## Update: 2026-07-13 — Fixed nonce rf range

### What Changed
Changed the random factor range in \`_gen_nonce\` from [1, 98] to [1, 99].

### Why
The bytecode uses \`% 99\` in random generation, meaning the correct range
includes 99. The old range [1, 98] produced invalid nonces.

### Files Affected
- \`mib-mock-app/mib_client.py:103\`: Changed \`randbelow(98) + 1\` to
  \`randbelow(99) + 1\`

### Documentation Updated
- \`docs/REVERSE_ENGINEERING.md\`: Updated off-by-one section in nonce algorithm
- \`docs/KNOWN_ISSUES.md\`: Marked rf bug as resolved, updated status

### Verification
Run \`_gen_nonce\` with a known nonceGenerator 10,000 times and confirm
all rf values are in [1, 99].
```

## Cross-Referencing

Each documentation file should cross-reference related files:

- **README.md** → Points to all other docs
- **NAVIGATION.md** → Entry point; links to all docs
- **RULEBOOK.md** → References RULEBOOK.md in all code comments; links to KNOWN_ISSUES.md for violations
- **ARCHITECTURE.md** → Links to specific source files with line numbers
- **REVERSE_ENGINEERING.md** → Links to bytecode analysis tools, crypto modules
- **API.md** → References FLOW.md for the order of calls, RULEBOOK.md for financial endpoint warnings
- **FLOW.md** → References API.md for payload details, REVERSE_ENGINEERING.md for nonce details, SESSION_MANAGEMENT.md for session persistence details
- **SESSION_MANAGEMENT.md** → References FLOW.md, API.md, ARCHITECTURE.md, RULEBOOK.md, KNOWN_ISSUES.md
- **KNOWN_ISSUES.md** → References REVERSE_ENGINEERING.md for technical details, RULEBOOK.md for rule violations
- **DEPLOYMENT.md** → References to source code for configuration details
- **UPDATING.md** → References all other docs

**All docs** must have a `[Back to Navigation](NAVIGATION.md)` link at the top.

Use relative Markdown links:

```markdown
See [ARCHITECTURE.md](ARCHITECTURE.md#module-descriptions) for module details.
```

## Contact

For questions or clarifications about the documentation:

- **Project maintainer**: Ayaan Abdurraheem
- **Repository**: [https://github.com/anomalyco/mibemulation](https://github.com/anomalyco/mibemulation) (if applicable)
- **Report docs issues**: Open a GitHub issue or contact the maintainer directly

When adding a significant update, consider adding your name or initials to the changelog entry so others know who to ask about the change.
