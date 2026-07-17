# Setup & Usage Guide

**Navigation:** [Back to Navigation](NAVIGATION.md) · [Project Overview](README.md) · [Governance Rules](RULEBOOK.md)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup (mib-mock-app)](#setup-mib-mock-app)
- [Setup (mib-aggregator)](#setup-mib-aggregator)
- [Configuration](#configuration)
- [Usage: Mock App](#usage-mock-app)
- [Usage: Aggregator](#usage-aggregator)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- **Python 3.10+** (tested with 3.13)
- **pip** (Python package manager)
- **virtualenv** or `venv` (recommended)
- For the aggregator: SQLite (included with Python)

## Setup (mib-mock-app)

### 1. Clone the Repository

```bash
git clone <repo-url> mibemulation
cd mibemulation/mib-mock-app
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# or
venv\Scripts\activate      # Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Contents of `requirements.txt`:

```
flask>=3.0.0
pycryptodome>=3.20.0
requests>=2.31.0
python-dotenv>=1.0.0
```

### 4. Run the App

```bash
python app.py
```

The app will start on `http://127.0.0.1:5678` with Flask debug mode enabled.

**Note**: On startup, the app attempts to restore the previous session from `session.json`. You'll see either:

```
Session restored from session.json — logged in as <username>
```

or

```
No valid saved session — showing login form
```

## Setup (mib-aggregator)

### 1. Navigate to Aggregator Directory

```bash
cd mibemulation/mib-aggregator
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install pycryptodome httpx sqlalchemy apscheduler python-dotenv
```

### 4. Configure Environment

Create a `.env` file in the `mib-aggregator/` directory:

```
MIB_USERNAME=your_mib_username
MIB_PASSWORD=your_mib_password
MIB_DATA_DIR=~/.mib-aggregator
SYNC_INTERVAL_HOURS=4
SESSION_REFRESH_INTERVAL_HOURS=4
TRANSACTION_DAYS_BACK=30
LOG_LEVEL=INFO
```

### 5. Run Commands

```bash
# Interactive login (with OTP prompt)
python main.py login

# Sync accounts and balances
python main.py sync-accounts

# Sync transactions (last 30 days)
python main.py sync-transactions

# Show account status and sync history
python main.py status

# Force session refresh
python main.py session-refresh

# Run as daemon (continuous sync)
python main.py daemon
```

## Configuration

### Flask App (mib-mock-app)

The mock app has minimal configuration:

| Setting | Default | Location | Description |
|---------|---------|----------|-------------|
| Host | `127.0.0.1` | `app.py:1005` | Bind address |
| Port | `5678` | `app.py:1005` | Listen port |
| Debug | `True` | `app.py:1005` | Flask debug mode |
| Secret Key | Random 16 bytes | `app.py:12` | Flask session signing |
| Session file | `session.json` | `session_store.py:4` | Session persistence path |

To change host/port:

```bash
# Edit app.py line 1005 before running
app.run(host='0.0.0.0', port=8080, debug=True)
```

### Aggregator (mib-aggregator)

Configuration via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `MIB_USERNAME` | `''` | MIB online banking username |
| `MIB_PASSWORD` | `''` | MIB online banking password |
| `MIB_DATA_DIR` | `~/.mib-aggregator` | Data directory for keys and DB |
| `SYNC_INTERVAL_HOURS` | `4` | Hours between sync cycles |
| `SESSION_REFRESH_INTERVAL_HOURS` | `4` | Hours between session refreshes |
| `TRANSACTION_DAYS_BACK` | `30` | Days of history to sync |
| `LOG_LEVEL` | `INFO` | Python logging level |

## Usage: Mock App

### 1. Open the App

Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000).

### 2. Login

1. Enter your MIB online banking **username** and **password**
2. Click **Login to MIB**
3. The app will run through the full registration and login flow

### 3. OTP Verification

If OTP is sent to your registered device:

1. An OTP modal will appear automatically
2. Enter the 6-digit OTP code
3. Click **Verify OTP**
4. If needed, click **Resend OTP** to request a new code

### 4. Dashboard

After successful login, you'll see:

- **Account cards** — Each account showing account number, type, and available balance
- **Refresh button** — Refresh account data
- **Logout button** — Clear session and return to login
- **Recent Transactions** — Placeholder (API not yet identified)

### 5. Debug Panel

Click the **Debug** toggle button to open the debug panel. This provides full visibility into every API call:

**Table columns:**
- **Timestamp** — When the operation occurred
- **Level** — INFO, DEBUG, ERROR
- **Source** — Which component (e.g., "A40 (Login)", "Nonce Generator")
- **Method** — POST, GET, or INTERNAL
- **Endpoint** — The API endpoint or operation description
- **Status** — Status message (200 OK, reasonText, etc.)

**Expandable rows:**
Click any row to see:
- **Nonce** — The generated nonce value
- **Session Key** — The derived Blowfish key
- **HTTP Request** — Full URL, params, headers, body
- **Decrypted Request** — The inner payload before encryption
- **HTTP Response** — Status code, headers, encrypted body
- **Decrypted Response** — The decrypted server response

**Filter bar:**
- Filter by Level, Source, or Method
- Full-text search across all fields
- Clear filters button

**Additional controls:**
- **Clear** — Clear the debug log
- **Download** — (planned) Export log as JSON

## Troubleshooting

### Common Issues

| Issue | Likely Cause | Solution |
|-------|-------------|----------|
| `401` with "User is blocked" | Account blocked after too many attempts | Log in manually on the real MIB app to reset the counter |
| `500` with "Decryption failed" | Session expired or keys mismatch | Clear session.json and try again |
| `500` with "Registration failed" | Server might reject the app ID format | Restart the app (new random app_id) |
| "No valid saved session" | Session.json missing or expired | Login again |
| OTP modal shows but no OTP received | Server not sending OTP (blocked) | Log in on real app first |
| `501` invalid data error | Nonce generation issue | Check nonceGenerator value; may need to redo S40 |

### Clearing State

If you need to completely reset:

```bash
# From the Flask app directory
rm session.json

# Or via API
curl -X POST http://127.0.0.1:5000/api/logout
```

### Verifying Crypto

Use the `verify_crypto.py` tool to confirm the Blowfish key derivation matches captured traffic:

```bash
cd mib-aggregator
python tools/verify_crypto.py --pin 123456
python tools/verify_crypto.py --pin 123456 --raw-b64 "ENCRYPTED_BASE64_STRING"
```

### Debug Log

Watch the Flask console output for detailed log messages about each step of the flow. The debug panel in the web UI also shows all operations in real-time (polls every 1.5 seconds).
