# Viri Threat Model & Data Flow

This document visualizes the security boundaries and data flows of the Viri architecture, ensuring sensitive data never leaves the local terminal.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph "Terminal Machine (Cash Counter)"
        PWA[Viri PWA Dashboard]
        DB[(Local IndexedDB)]
        EXT[Viri Extension Bridge]
    end

    subgraph "Viri Cloud Infrastructure"
        BACKEND[Laravel API Server]
        ADMIN[Super-Admin Portal]
        SQLITE[(SQLite / MySQL)]
    end

    subgraph "External Networks"
        BML[Bank of Maldives (BML)]
        MIB[Maldives Islamic Bank (MIB)]
    end

    %% PWA Interactions
    PWA --"Stores AES Encrypted Credentials"--> DB
    PWA --"Checks License & Terminal ID"--> BACKEND
    PWA --"Triggers 'Verify Transfer' (IPC)"--> EXT

    %% Extension Interactions
    EXT --"Retrieves Encrypted Credentials"--> DB
    EXT --"Generates Local TOTP"--> EXT
    EXT --"Polls API via Local IP"--> BML
    EXT --"Polls API via Local IP"--> MIB
    EXT --"Returns Clean Match Data (No Secrets)"--> PWA

    %% Backend Interactions
    ADMIN --"Manages Tenants & Invoices"--> BACKEND
    BACKEND --"Writes Append-Only Events"--> SQLITE

    %% Security Boundaries
    classDef secure fill:#00FFAA,stroke:#0A0A0A,stroke-width:2px,color:#0A0A0A;
    classDef volatile fill:#FFAA00,stroke:#0A0A0A,stroke-width:2px,color:#0A0A0A;
    classDef cloud fill:#3A86FF,stroke:#0A0A0A,stroke-width:2px,color:#FFF;

    class DB,EXT secure;
    class PWA volatile;
    class BACKEND,SQLITE,ADMIN cloud;
```

### Boundary Definitions
- **Secure (Green):** Highly isolated execution environments where raw secrets are decrypted and used in-memory.
- **Volatile (Amber):** The frontend interface. Holds temporary UI state but defers to the extension for network execution.
- **Cloud (Blue):** The central SaaS logic. Strictly isolated from banking credentials.
