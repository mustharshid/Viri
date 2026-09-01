// Account-scoped MIB storage helpers. Plain ESM (no `chrome` access at module
// evaluation) so this file is unit-testable with Node's built-in test runner.

/**
 * Canonical identity for an account's MIB storage keys.
 *
 * The resume/sync flow (ensureMibSession / runMibApiFlow) keys on the account
 * NUMBER, while the auth flow historically keyed on the DB id — so a session
 * created during re-authentication was invisible to the next sync. Every
 * writer and reader MUST derive its keys from this helper using the same
 * identity so they can never drift again.
 *
 * @param {string|number} accountNumber  account number (preferred)
 * @param {string|number} bankAccountId  DB id (fallback)
 * @returns {string}
 */
export function mibAccountKey(accountNumber, bankAccountId) {
  const num = accountNumber && String(accountNumber).trim();
  if (num) return num;
  const id = bankAccountId && String(bankAccountId).trim();
  return id || 'default';
}

function isAccountScopedKey(k) {
  return k.startsWith('mib_profileId_') ||
    k.startsWith('mib_profileType_') ||
    k.startsWith('mibSession_') ||
    k.startsWith('mib_accountBalance_');
}

/**
 * Remove a MIB account's session/profile/credential state from chrome storage.
 *
 * When an account identity is provided the clear is scoped to that account's
 * per-account keys and its credential-map entries; otherwise every MIB
 * account-scoped key is removed (also cleaning any orphaned keys left by the
 * pre-fix DB-id namespace).
 *
 * @param {{accountNumber?: string, bankAccountId?: string|number}} [opts]
 */
export async function clearMibCredentials({ accountNumber = '', bankAccountId = '' } = {}) {
  const scoped = Boolean(accountNumber || bankAccountId);
  // Candidate account identities to purge: the canonical key, plus the
  // DB-id key (to clean pre-fix namespace orphans for this account).
  const key = scoped ? mibAccountKey(accountNumber, bankAccountId) : null;
  const suffixCandidates = new Set();
  if (scoped) {
    suffixCandidates.add(key);
    if (accountNumber && bankAccountId) suffixCandidates.add(String(bankAccountId));
  }

  // Global device identity + global profile (always — a "clear credentials"
  // must invalidate the local device registration).
  await chrome.storage.local.remove(['mib_key1', 'mib_key2', 'mib_appId', 'mib_profileId', 'mib_profileType']);

  // Per-account keys (chrome.storage.local).
  const localAll = await chrome.storage.local.get(null);
  const localKeys = Object.keys(localAll || {}).filter(k => {
    if (!isAccountScopedKey(k)) return false;
    if (!scoped) return true;
    const suffix = k.slice(k.lastIndexOf('_') + 1);
    return suffixCandidates.has(suffix);
  });
  if (localKeys.length) await chrome.storage.local.remove(localKeys);

  // Per-account session keys + balance caches (chrome.storage.session).
  const sessionAll = await chrome.storage.session.get(null);
  const sessionKeys = Object.keys(sessionAll || {}).filter(k => {
    if (!isAccountScopedKey(k)) return false;
    if (!scoped) return true;
    const suffix = k.slice(k.lastIndexOf('_') + 1);
    return suffixCandidates.has(suffix);
  });
  if (sessionKeys.length) await chrome.storage.session.remove(sessionKeys);

  // Credential fallback map: clear the account's entries and its username-keyed
  // entry (which may live under either identity).
  const map = (sessionAll && sessionAll.mib_stored_creds_map) || {};
  if (map && typeof map === 'object') {
    const next = { ...map };
    let removedAny = false;
    if (!scoped) {
      for (const k of Object.keys(next)) {
        delete next[k];
        removedAny = true;
      }
    } else {
      const entry = [...suffixCandidates].map(s => next[s]).find(e => e) || null;
      const entryUsername = entry?.username;
      for (const k of Object.keys(next)) {
        if (suffixCandidates.has(k) || (entryUsername && k === '__username_' + entryUsername)) {
          delete next[k];
          removedAny = true;
        }
      }
    }
    if (removedAny) {
      if (Object.keys(next).length === 0) {
        await chrome.storage.session.remove('mib_stored_creds_map');
      } else {
        await chrome.storage.session.set({ mib_stored_creds_map: next });
      }
    }
  }

  // A half-finished auth temp must not outlive a clear.
  await chrome.storage.session.remove('mibAuthTemp');
}
