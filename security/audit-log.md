# Centralized Security Audit Log

The Viri Admin Backend maintains a strict, append-only security audit log to monitor the integrity of the SaaS platform.

## Access Constraints
- The log is **read-only** via the Super-Admin dashboard.
- Only internal Viri administrators can view these records.
- Records cannot be mutated or deleted via the API.

## Tracked Events
The audit engine captures the following telemetry for every tenant:
1. **Subscription Changes:** Activation, suspension, and expiration timestamps.
2. **Billing Events:** Invoice generation, payment receipts, and tier upgrades.
3. **Terminal Anomalies:** Unauthorized connection attempts from unregistered terminal IDs or MAC addresses.
4. **Credential Resets:** Triggers when a Merchant Admin resets their hardware profile (Note: the log only records the event, not the credentials).
5. **Administrative Actions:** Any configuration changes executed by the Viri system admin on a tenant's profile.

## Data Structure
```json
{
  "timestamp": "2026-06-17T08:00:00Z",
  "event_type": "SUBSCRIPTION_SUSPENDED",
  "tenant_id": "merch_9481",
  "actor": "admin_system",
  "ip_address": "192.168.1.100",
  "metadata": {
    "reason": "Contract Expired"
  }
}
```
