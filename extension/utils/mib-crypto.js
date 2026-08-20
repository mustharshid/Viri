import { Blowfish } from './egoroof-blowfish.js';

const DH_G = 2n;
const DH_P = BigInt('2410312426921032588552076022197566074856950548502459942654116941958108831682612228890093858261341614673227141477904012196503648957050582631942730706805009223062734745341073406696246014589361659774041027169249453200378729434170325843778659198143763193776859869524088940195577346119843545301547043747207749969763750084308926339295559968882457872412993810129130294592999947926365264059284647209730384947211681434464714438488520940127459844288859336526896320919633919');
const DH_A = BigInt('1563516802667282387226490351799736881442299778484610378722158765594241028592123324764949712696577');
export const DEFAULT_KEY = '8M3L9SBF1AC4FRE56788M3L9SBF1AC4FRE5678';

// August-2026 bundle transport constants (HANDOFF.md §3.1/§4.1)
export const MIB_API_URL = 'https://faisamobilex-smvc-v2.mib.com.mv/index/';
export const MIB_WEBVIEW_URL = 'https://faisamobilex-wv-v2.mib.com.mv';
export const MIB_MODEL = 'AND-1.0';
export const MIB_APP_VERSION = '15'; // app version hard-coded '15' (new.dec ~517330)

const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function computeCmod() {
  return modPow(DH_G, DH_A, DH_P);
}

export function blowfishEncrypt(plaintext, key) {
  const bf = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
  const encoded = bf.encode(plaintext);
  return btoa(String.fromCharCode(...new Uint8Array(encoded)));
}

export function blowfishDecrypt(cipherB64, key) {
  const bf = new Blowfish(key, Blowfish.MODE.ECB, Blowfish.PADDING.PKCS5);
  const raw = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  return bf.decode(raw, Blowfish.TYPE.STRING);
}

export async function computePgf03(password, userSalt, clientSalt) {
  const enc = new TextEncoder();

  const h1 = await sha256Hex(password);
  const h2 = await sha256Hex(h1.toUpperCase() + userSalt);
  const result = await sha256Hex(clientSalt + h2.toUpperCase());
  return result.toUpperCase();
}

async function sha256Hex(input) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveSessionKey(smod) {
  // Yield before blocking BigInt modPow to keep service worker responsive
  await new Promise(r => setTimeout(r, 0));
  const smodBig = BigInt(smod);
  const shared = modPow(smodBig, DH_A, DH_P);
  const sharedStr = shared.toString();
  const hash = await sha256Hex(sharedStr);

  const rawBytes = new Uint8Array(hash.match(/.{2}/g).map(b => parseInt(b, 16)));
  return btoa(String.fromCharCode(...rawBytes));
}

function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/** Random alphanumeric string of `length` chars (device keys / appId middle). */
export function generateKey(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += KEY_CHARS[bytes[i] % KEY_CHARS.length];
  return out;
}

/** `n` random bytes rendered as a decimal string (sodium=20, xxid=40). */
function randomBytesDecimal(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + hex).toString();
}

export function generateNonce(nonceGenerator) {
  if (!nonceGenerator || !String(nonceGenerator).trim()) {
    throw new Error('Empty nonceGenerator — cannot build a nonce.');
  }
  const groups = nonceGenerator.split('-');
  const paddedList = [];
  const lastTwo = [];
  const digitSum = [];
  let cumSum = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const tokens = groups[gi].trim().split(/\s+/);
    if (tokens.length !== 8) {
      throw new Error(
        `Malformed nonceGenerator group #${gi + 1}: expected 8 tokens, got ${tokens.length} ` +
        '— the server may have changed the generator format.'
      );
    }
    const numStr = tokens[0].replace(/[^0-9]/g, '');
    const n = parseInt(numStr, 10);
    const r = (crypto.getRandomValues(new Uint32Array(1))[0] % 99) + 1;
    const product = n * r;
    const padded = String(product).padStart(5, '0');
    let ds = 0;
    for (let i = 0; i < padded.length; i++) {
      ds += parseInt(padded[i], 10);
    }
    const lt = parseInt(padded.slice(-2), 10);
    paddedList.push(padded);
    lastTwo.push(lt);
    digitSum.push(ds);
    cumSum += ds;
  }

  const resultGroups = [];
  for (let i = 0; i < groups.length; i++) {
    const tokens = groups[i].trim().split(/\s+/);
    let carry = lastTwo[i];
    const ds = digitSum[i];
    const nonceDigits = [];

    for (let j = 1; j < tokens.length; j++) {
      const token = tokens[j];
      const op = token.replace(/[^A-Z]/g, '');
      const num = parseInt(token.replace(/[^0-9]/g, ''), 10) || 0;
      let val;
      switch (op) {
        case 'M': val = (carry % num) + ds + cumSum; break;
        case 'A': val = carry + num + ds + cumSum; break;
        case 'S': val = (carry * carry) + num + ds + cumSum; break;
        case 'X': val = (carry * num) + ds + cumSum; break;
        case 'C': val = (carry * carry * carry) + num + ds + cumSum; break;
        default: val = 0;
      }
      const digit = parseInt(String(val).slice(-2), 10);
      nonceDigits.push(digit);
      carry = digit;
    }

    resultGroups.push(
      paddedList[i] + ' ' +
      nonceDigits.map(d => String(d).padStart(2, '0')).join(' ')
    );
  }

  const result = resultGroups.join('-');
  if (!result) throw new Error('Nonce assembly produced an empty string — check nonceGenerator format.');
  return result;
}

export function generateSodium() {
  return randomBytesDecimal(20); // 20 random bytes as decimal string
}

export function generateXxid() {
  return randomBytesDecimal(40); // 40 random bytes as decimal string
}

export function generateAppId() {
  // AND{ver}-{rand15}{ver} — new.dec ~517330, version hard-coded '15'
  return 'AND' + MIB_APP_VERSION + '-' + generateKey(15) + MIB_APP_VERSION;
}

export function generateClientSalt() {
  return generateKey(32);
}
