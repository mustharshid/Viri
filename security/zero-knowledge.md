# Viri Zero-Knowledge Architecture

The Viri platform enforces a strict zero-knowledge security model concerning all financial authentication credentials. 

## Core Principles

1. **No Cloud Storage of Credentials:** 
   The central Viri backend database (Laravel/SQLite) **never** stores, transmits, processes, or sees plaintext or ciphertext banking usernames, passwords, or TOTP secret seeds. 
   
2. **Local Encryption (AES-256-GCM):**
   When a Merchant Administrator configures their bank integration via the Viri PWA Dashboard, the credentials are encrypted entirely client-side using `crypto.subtle` with an AES-256-GCM algorithm.

3. **Sandboxed Key Management:**
   The encrypted payload is persisted inside the browser's sandboxed local `IndexedDB`. The encryption key is bound to the local hardware/session.

4. **In-Memory Volatility:**
   During a transfer verification, the Browser Extension Bridge decrypts the TOTP seed in-memory, generates the 6-digit code, authenticates with the bank endpoint directly from the local terminal's IP address, and immediately purges the session and decrypted secrets from memory.

5. **Local IP Evasion:**
   Because all API polling is conducted via the local Chrome Extension, the requests originate from the physical cash counter's IP address, avoiding centralized datacenter IP blacklisting by the banks.
