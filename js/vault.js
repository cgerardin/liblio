// Coffre chiffré : les secrets (jeton GitHub, clé API Claude) sont chiffrés
// en AES-GCM avec une clé dérivée du mot de passe (PBKDF2-SHA256).
// Le fichier data/vault.json peut donc être public dans le dépôt :
// sans le mot de passe il est inutilisable. Choisissez une phrase de passe longue.

import { enc, dec, b64, unb64 } from './util.js';

const ITERATIONS = 600_000;

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealVault(secrets, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(secrets))),
  );
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function openVault(vault, password) {
  const key = await deriveKey(password, unb64(vault.salt), vault.iter);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    throw new Error('Mot de passe incorrect');
  }
}
