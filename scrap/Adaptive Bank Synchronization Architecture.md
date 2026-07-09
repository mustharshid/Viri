Feature Specification: Adaptive Bank Synchronization Architecture
Objective
Implement an adaptive bank synchronization architecture for Viri that automatically changes behavior based on the number of active terminals using the same bank account.
The system must support:
Automatic Single Terminal Mode when only one terminal is active.
Automatic Multi-Terminal Mode when two or more terminals are active.
Preservation of the current secure single-terminal architecture.
Efficient synchronization for multiple cashier terminals.
Zero-knowledge handling of bank credentials.

Core Operating Principle
The synchronization mode should NOT be manually configured.
The system should automatically determine the appropriate mode based on active terminals. The mode of operation should be visible in the System Health card in PWA terminal.
Mode Decision Logic
Active terminals using bank account = 1        ↓Single Terminal Mode
Active terminals using bank account > 1        ↓Multi-Terminal Mode

Mode 1: Automatic Single Terminal Mode
Scenario
Only one cashier terminal is currently using a bank account.
Example:
Bank Account AC1Active terminals:C1 only
The system should operate exactly as the current implementation.

Flow
Cashier Terminal C1        |        |        vViri PWA        |        |        vBrowser Extension        |        |        vBank Website        |        |        vBank Statement JSON        |        |        vDisplay Transactions

Requirements
Maintain existing behaviour:
Terminal directly communicates with bank.
Browser extension retrieves bank statement JSON.
Data is displayed locally.
No transaction synchronization layer is activated.
No multi-terminal coordination occurs.
Viri server must NOT store:
bank username
bank password
bank session
authentication cookies
banking credentials

Mode 2: Automatic Multi-Terminal Mode
Scenario
More than one terminal is actively using the same bank account.
Example:
Bank Account AC1Active terminals:C1C2C3
The system automatically switches to shared synchronization mode.

Terminal Activity Detection
Each terminal should periodically announce:
I am active and using account AC1
The server maintains:
Account AC1Active terminals:C1C2C3Last heartbeat:10:05:20
A terminal is considered active if:
Last heartbeat < configured timeout
Example:
Active timeout:30 seconds

Automatic Mode Switching
Single → Multi
Example:
Initially:
AC1Active terminals:C1
C1 operates normally.
Then C2 opens AC1.
System detects:
Active terminals:C1C2
Automatically switches to:
Multi-Terminal Mode
No user action required.

Multi → Single
Example:
C2 closes.
After timeout:
Active terminals:C1
System automatically returns to:
Single Terminal Mode

Multi-Terminal Synchronization Architecture
When multiple terminals are active:
One terminal becomes the temporary bank synchronization holder.
Example:
                 Viri Server          Transaction Coordination                    |                    |        Active Bank Holder Terminal                    |                    |             Browser Extension                    |                    |              Bank Website

Active Terminal Lease System
Each bank account has a synchronization lease.
Example:
Account:AC1Active Holder:C1Lease expires:10 seconds
Only the active holder communicates with the bank.

Sync Request Flow
Example:
Cashier C2 presses:
Sync AC1

Step 1
C2 sends:
POST /api/account/AC1/sync-request

Step 2
Server checks:
active bank holder
last successful refresh time
available transaction data

Step 3
If data is fresh:
Example:
Last bank refresh:10:05:20Current time:10:05:25Age:5 seconds
Return:
latest transactions
No bank access required.

Step 4
If data is stale:
Example:
Last refresh:10:03:00Age:2 minutes
Server sends refresh command:
C1 extension:Refresh AC1

Step 5
Active holder:
Browser Extension        |Bank Login        |Download JSON        |Extract Transactions        |Upload New Transactions

Transaction Synchronization
Only new transaction records should be transferred.
Never send full bank statements repeatedly.
Each terminal maintains:
last_sync_timestamplast_transaction_idlast_transaction_fingerprint
Server returns:
Only transactions after last known record

Transaction Fingerprinting
Implement duplicate prevention.
Generate SHA-256 fingerprint using:
bank_account_id
transaction_date
transaction_type
amount
debit_credit_indicator
normalized description
reference_number

Transaction Confidence Matching
When fingerprints do not match:
Run secondary similarity analysis.
Use:
Amount
40%
Date
20%
Reference Number
25%
Description Similarity
15%

Confidence Actions
95-100%
Automatically treat as duplicate.

70-94%
Create reconciliation review.
Require administrator confirmation.

Below 70%
Store as a new transaction.

Communication Architecture
Single Terminal Mode
No persistent connections.
Use:
User presses Sync↓REST request↓Browser Extension↓Bank↓Display

Multi-Terminal Mode
Initial implementation:
Use:
REST API+Short Polling
Do NOT use persistent SSE connections under current hosting limitations.
Polling should only occur when:
terminal is waiting for refresh command
terminal is waiting for transaction update
Recommended interval:
3 seconds.

Future Scaling Option
If Viri grows beyond current hosting limits:
Use:
Laravel     |Redis/Event Bus     |Node.js Socket Server     |Terminals
Use WebSockets only for the communication layer.
Do not move banking logic into WebSockets.

Performance Requirements
The architecture must support:
30 simultaneous cashier terminals.
Multiple companies.
Multiple bank accounts per company.
Multiple active accounts per terminal.
Avoid:
Long-running PHP requests.
Persistent SSE connections.
Continuous bank scraping.
Duplicate transaction transfers.
Excessive database queries.

Security Requirements
The system must never store:
bank credentials
passwords
login tokens
browser session cookies
Credentials remain only on customer terminals.
The server only coordinates synchronization and stores required transaction metadata.

Testing Requirements
Test:
Test 1
One terminal active.
Expected:
Single Terminal Mode.

Test 2
Second terminal opens same account.
Expected:
Automatic switch to Multi-Terminal Mode.

Test 3
Second terminal closes.
Expected:
Automatic return to Single Terminal Mode.

Test 4
Two terminals request sync simultaneously.
Expected:
Only one bank query occurs.

Test 5
Thirty terminals operate simultaneously.
Expected:
No PHP worker exhaustion.

Final Goal
Create an intelligent adaptive bank synchronization system where:
Single users receive the fastest and most private experience.
Multi-terminal businesses automatically receive shared synchronization.
Bank credentials remain local.
Only one terminal communicates with the bank when necessary.
The server efficiently coordinates transaction sharing.
The architecture works reliably within limited hosting resources.