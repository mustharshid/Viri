// Source-assertion regression tests for the P0 namespace/CLEAR/resume fixes.
// background.js is an MV3 ES module with top-level `chrome` access, so it cannot
// be imported in Node; these tests assert on the source itself.
// Run: node --test extension/tests/mib-namespace-regression.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bg = readFileSync(join(here, '..', 'background.js'), 'utf-8');
const mibLogin = readFileSync(join(here, '..', '..', 'pwa', 'src', 'pages', 'Cashier', 'MibLogin.tsx'), 'utf-8');
const cashierApp = readFileSync(join(here, '..', '..', 'pwa', 'src', 'pages', 'Cashier', 'CashierApp.tsx'), 'utf-8');

test('no auth write site still keys on the DB id alone', () => {
  assert.doesNotMatch(bg, /mibSession_' \+ \(bankAccountId \|\| 'default'\)/);
  assert.doesNotMatch(bg, /mib_profileId_' \+ \(bankAccountId \|\| 'default'\)/);
  assert.doesNotMatch(bg, /mib_profileType_' \+ \(bankAccountId \|\| 'default'\)/);
});

test('auth flow derives its session/profile keys from mibAccountKey', () => {
  assert.match(bg, /const authSessionKey = 'mibSession_' \+ mibAccountKey\(/);
  assert.match(bg, /const authProfileIdKey = 'mib_profileId_' \+ mibAccountKey\(/);
  assert.match(bg, /const authProfileTypeKey = 'mib_profileType_' \+ mibAccountKey\(/);
});

test('CLEAR_MIB_CREDENTIALS delegates to the scoped clearMibCredentials helper', () => {
  assert.match(bg, /CLEAR_MIB_CREDENTIALS/);
  assert.match(bg, /clearMibCredentials\(\{/);
  assert.doesNotMatch(bg, /chrome\.storage\.session\.remove\('mibSession'\)/);
});

test('auth-written session envelopes carry a username (identity guard)', () => {
  const occurrences = (bg.match(/sessionState\.username = /g) || []).length;
  assert.ok(occurrences >= 4, `expected >=4 username assignments, found ${occurrences}`);
});

test('resume A41 treats profileSelected alone as success and persists the profile', () => {
  // The resume fast-path must not require accountBalance to mark the profile selected.
  assert.match(bg, /\/\/ Resume mirrors the auth fast-path \(:2467\): profileSelected alone is/);
  assert.match(bg, /if \(sp\) \{\s*profileSelected = true;/);
  assert.match(bg, /const resumeProfileId = a41Resp\.selectedProfileId \|\|/);
  assert.doesNotMatch(bg, /if \(sp && Array\.isArray\(a41Resp\.accountBalance\)/);
});

test('MibLogin forwards accountNumber to START_MIB_AUTH and SUBMIT_MIB_OTP', () => {
  assert.match(mibLogin, /action: 'START_MIB_AUTH'/);
  assert.match(mibLogin, /accountNumber: accountNumber \|\| ''/);
  const starts = mibLogin.split("action: 'START_MIB_AUTH'").length - 1;
  const otps = mibLogin.split("action: 'SUBMIT_MIB_OTP'").length - 1;
  assert.equal(starts, 1);
  assert.equal(otps, 1);
  // Both payloads carry accountNumber
  assert.ok(mibLogin.indexOf('accountNumber: accountNumber || \'\'') !== -1);
  assert.ok(mibLogin.lastIndexOf('accountNumber: accountNumber || \'\'') !== -1);
  assert.notEqual(mibLogin.indexOf('accountNumber: accountNumber || \'\''), mibLogin.lastIndexOf('accountNumber: accountNumber || \'\''));
});

test('CashierApp sends account context with CLEAR_MIB_CREDENTIALS', () => {
  assert.match(cashierApp, /action: 'CLEAR_MIB_CREDENTIALS'/);
  assert.match(cashierApp, /payload: \{ accountId: accId, accountNumber: acc\.account_number \|\| '' \}/);
});
