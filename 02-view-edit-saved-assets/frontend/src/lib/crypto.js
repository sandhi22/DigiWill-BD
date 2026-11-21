/**
 * DigiWill BD — client-side cryptography (Web Crypto API only).
 *
 *   passphrase ─PBKDF2(600k)─▶ KEK ─wraps─▶ MK (master key, random 256-bit)
 *   MK ─wraps─▶ AK (per-asset key) ─AES-GCM─▶ asset payload + documents
 *
 *   Nominee key  K_n = HKDF-SHA256( server_share(32B) ‖ card_code(16B) )
 *   server_share is held by the server and released only by the switch;
 *   card_code is printed on the Legacy Card and never leaves the browser.
 *   K_n wraps AK for every asset assigned to that nominee.
 */
const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;

export class DecryptError extends Error {}

// ---- encoding --------------------------------------------------------------

export function toB64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---- AES-GCM primitives ------------------------------------------------------

const importAes = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function seal(rawKey, bytes) {
  const iv = random(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await importAes(rawKey), bytes);
  return { ct: new Uint8Array(ct), iv };
}

async function unseal(rawKey, ct, iv) {
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, await importAes(rawKey), ct);
    return new Uint8Array(pt);
  } catch {
    throw new DecryptError('Decryption failed');
  }
}

/** Wrap a raw 32-byte key under another raw key. */
export async function wrapKey(kek, key) {
  const { ct, iv } = await seal(kek, key);
  return { wrapped: toB64(ct), iv: toB64(iv) };
}

export async function unwrapKey(kek, wrappedB64, ivB64) {
  return unseal(kek, fromB64(wrappedB64), fromB64(ivB64));
}

// ---- vault master key ------------------------------------------------------

async function deriveKek(passphrase, salt, iterations) {
  const base = await subtle.importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

async function wrapMasterKey(mk, passphrase) {
  const salt = random(16);
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);
  const { wrapped, iv } = await wrapKey(kek, mk);
  return { kdf_salt: toB64(salt), kdf_iterations: PBKDF2_ITERATIONS, wrapped_master_key: wrapped, wrap_iv: iv };
}

export async function createVault(passphrase) {
  const mk = random(32);
  return { mk, record: await wrapMasterKey(mk, passphrase) };
}

export async function unlockVault(passphrase, record) {
  const kek = await deriveKek(passphrase, fromB64(record.kdf_salt), record.kdf_iterations);
  return unwrapKey(kek, record.wrapped_master_key, record.wrap_iv);
}

export const rewrapVault = wrapMasterKey;

// ---- assets ----------------------------------------------------------------

export async function encryptAsset(mk, data, ak = null) {
  const key = ak || random(32);
  const { ct, iv } = await seal(key, te.encode(JSON.stringify(data)));
  const wrapped = await wrapKey(mk, key);
  return {
    ak: key,
    fields: { ciphertext: toB64(ct), iv: toB64(iv), wrapped_key: wrapped.wrapped, key_iv: wrapped.iv },
  };
}

export async function decryptWithAssetKey(ak, asset) {
  const pt = await unseal(ak, fromB64(asset.ciphertext), fromB64(asset.iv));
  return JSON.parse(td.decode(pt));
}

export async function assetKey(mk, asset) {
  return unwrapKey(mk, asset.wrapped_key, asset.key_iv);
}

// ---- documents -------------------------------------------------------------

export async function encryptFile(ak, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const body = await seal(ak, bytes);
  const meta = await seal(ak, te.encode(JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream' })));
  return {
    blob: new Blob([body.ct], { type: 'application/octet-stream' }),
    file_iv: toB64(body.iv),
    meta_ciphertext: toB64(meta.ct),
    meta_iv: toB64(meta.iv),
  };
}

export async function decryptFileMeta(ak, doc) {
  const pt = await unseal(ak, fromB64(doc.meta_ciphertext), fromB64(doc.meta_iv));
  return JSON.parse(td.decode(pt));
}

export async function decryptFile(ak, doc, buffer) {
  const meta = await decryptFileMeta(ak, doc);
  const pt = await unseal(ak, new Uint8Array(buffer), fromB64(doc.file_iv));
  return { ...meta, blob: new Blob([pt], { type: meta.type }) };
}

// ---- Legacy Card codes (Crockford base32, 16 bytes + 1 check byte) ---------

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new DecryptError('Invalid character');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function checkByte(bytes) {
  return new Uint8Array(await subtle.digest('SHA-256', bytes))[0];
}

export const formatCode = (raw) => raw.match(/.{1,4}/g).join('-');

/** Uppercase, drop separators, map look-alikes (O→0, I/L→1). */
export function normalizeCode(input) {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/** Returns the 16 code bytes, or throws if the code is mistyped. */
export async function parseCardCode(input) {
  const raw = normalizeCode(input);
  if (raw.length !== 28) throw new DecryptError('length');
  const bytes = unbase32(raw).slice(0, 17);
  if (base32(bytes) !== raw) throw new DecryptError('checksum'); // non-canonical padding = typo
  const code = bytes.slice(0, 16);
  if ((await checkByte(code)) !== bytes[16]) throw new DecryptError('checksum');
  return code;
}

async function newCardCode() {
  const code = random(16);
  const full = new Uint8Array(17);
  full.set(code);
  full[16] = await checkByte(code);
  const raw = base32(full); // 28 chars
  return { code, text: formatCode(raw), hint: raw.slice(-4) };
}

export async function nomineeKey(serverShare, codeBytes) {
  const ikm = new Uint8Array(48);
  ikm.set(serverShare, 0);
  ikm.set(codeBytes, 32);
  const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: te.encode('digiwill-bd/nominee/v1'), info: te.encode('nominee-key') },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** Fresh key split for a nominee. `card` must be shown to the owner exactly once. */
export async function createNomineeKeys(mk) {
  const card = await newCardCode();
  const serverShare = random(32);
  const kn = await nomineeKey(serverShare, card.code);
  const wrapped = await wrapKey(mk, kn);
  return {
    kn,
    card,
    fields: { server_share: toB64(serverShare), wrapped_key: wrapped.wrapped, key_iv: wrapped.iv, card_hint: card.hint },
  };
}

/** Re-wrap each asset key for one nominee key. */
export async function grantsFor(mk, kn, assets) {
  return Promise.all(
    assets.map(async (asset) => {
      const ak = await assetKey(mk, asset);
      const { wrapped, iv } = await wrapKey(kn, ak);
      return { asset: asset.id, wrapped_key: wrapped, iv };
    }),
  );
}
