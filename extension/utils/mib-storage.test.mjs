// Unit tests for extension/utils/mib-storage.js.
// Run: node --test extension/utils/mib-storage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mibAccountKey, clearMibCredentials } from './mib-storage.js';

function makeChromeStorage() {
  const local = new Map();
  const session = new Map();
  const storage = {
    async get(keys) {
      if (keys === null) return Object.fromEntries(local);
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (local.has(k)) out[k] = local.get(k);
        return out;
      }
      if (typeof keys === 'string') return local.has(keys) ? { [keys]: local.get(keys) } : {};
      if (keys && typeof keys === 'object') {
        const out = {};
        for (const [k, def] of Object.entries(keys)) {
          out[k] = local.has(k) ? local.get(k) : def;
        }
        return out;
      }
      return {};
    },
    async set(items) { for (const [k, v] of Object.entries(items)) local.set(k, v); },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) local.delete(k);
    },
  };
  const sessionStorage = {
    async get(keys) {
      if (keys === null) return Object.fromEntries(session);
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (session.has(k)) out[k] = session.get(k);
        return out;
      }
      if (typeof keys === 'string') return session.has(keys) ? { [keys]: session.get(keys) } : {};
      if (keys && typeof keys === 'object') {
        const out = {};
        for (const [k, def] of Object.entries(keys)) {
          out[k] = session.has(k) ? session.get(k) : def;
        }
        return out;
      }
      return {};
    },
    async set(items) { for (const [k, v] of Object.entries(items)) session.set(k, v); },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) session.delete(k);
    },
  };
  return {
    local,
    session,
    storage: { local: storage, session: sessionStorage },
  };
}

test('mibAccountKey prefers account number, falls back to DB id, then default', () => {
  assert.equal(mibAccountKey('ACC-123', 5), 'ACC-123');
  assert.equal(mibAccountKey('', 5), '5');
  assert.equal(mibAccountKey(undefined, undefined), 'default');
  assert.equal(mibAccountKey(undefined, 5), '5');
  assert.equal(mibAccountKey('  ', 5), '5'); // whitespace-only number trimmed
});

test('clearMibCredentials (scoped) purges global + account keys, keeps other accounts', async () => {
  const { local, session, storage } = makeChromeStorage();
  global.chrome = { storage };

  await storage.local.set({
    mib_key1: 'k1', mib_key2: 'k2', mib_appId: 'a', mib_profileId: 'p', mib_profileType: '0',
    'mib_profileId_ACC-123': 'p1', 'mib_profileType_ACC-123': '0',
    'mib_profileId_OTHER': 'p2', 'mib_profileType_OTHER': '1',
  });
  await storage.session.set({
    'mibSession_ACC-123': { sessionKey: 's1' },
    'mibSession_OTHER': { sessionKey: 's2' },
    'mib_accountBalance_ACC-123': [{ accountNumber: 'ACC-123' }],
    mib_stored_creds_map: {
      'ACC-123': { username: 'bob', password: 'pw' },
      OTHER: { username: 'alice', password: 'pw' },
      __username_bob: { username: 'bob', password: 'pw' },
      __username_alice: { username: 'alice', password: 'pw' },
    },
    mibAuthTemp: { sessionState: {} },
  });

  await clearMibCredentials({ accountNumber: 'ACC-123', bankAccountId: 5 });

  // Global device identity cleared
  for (const k of ['mib_key1', 'mib_key2', 'mib_appId', 'mib_profileId', 'mib_profileType']) {
    assert.equal(local.has(k), false, `${k} should be cleared`);
  }
  // This account's per-account keys cleared (both canonical + legacy DB-id suffix)
  assert.equal(local.has('mib_profileId_ACC-123'), false);
  assert.equal(local.has('mib_profileId_5'), false);
  assert.equal(local.has('mib_profileType_ACC-123'), false);
  // Other accounts untouched
  assert.equal(local.get('mib_profileId_OTHER'), 'p2');

  // Session keys / balances / auth temp for this account cleared
  assert.equal(session.has('mibSession_ACC-123'), false);
  assert.equal(session.has('mibSession_5'), false);
  assert.equal(session.has('mib_accountBalance_ACC-123'), false);
  assert.equal(session.has('mibAuthTemp'), false);
  assert.equal(session.has('mibSession_OTHER'), true);

  // Credential map: only this account's entries removed
  const map = session.get('mib_stored_creds_map');
  assert.deepEqual(map, {
    OTHER: { username: 'alice', password: 'pw' },
    __username_alice: { username: 'alice', password: 'pw' },
  });

  delete global.chrome;
});

test('clearMibCredentials (full, no account context) clears every MIB account key', async () => {
  const { local, session, storage } = makeChromeStorage();
  global.chrome = { storage };

  await storage.local.set({
    mib_key1: 'k1', 'mib_profileId_ACC-123': 'p1', 'mib_profileId_OTHER': 'p2',
  });
  await storage.session.set({
    'mibSession_ACC-123': { sessionKey: 's1' },
    'mibSession_OTHER': { sessionKey: 's2' },
    mib_stored_creds_map: { 'ACC-123': { username: 'bob', password: 'pw' } },
    mibAuthTemp: { sessionState: {} },
  });

  await clearMibCredentials();

  assert.equal(local.size, 0);
  assert.equal(session.has('mib_stored_creds_map'), false);
  assert.equal(session.has('mibAuthTemp'), false);

  delete global.chrome;
});

test('clearMibCredentials (full) removes an empty/session-storage map without error', async () => {
  const { storage } = makeChromeStorage();
  global.chrome = { storage };
  await clearMibCredentials(); // no seeded data — must not throw
  delete global.chrome;
});
