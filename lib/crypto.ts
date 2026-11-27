// AES-256-GCM for personal data stored in the DB (postcodes). Key never leaves the server:
// SCENARIO_ENCRYPTION_KEY has no NEXT_PUBLIC_ prefix, so Next never bundles it for the browser.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const k = Buffer.from(process.env.SCENARIO_ENCRYPTION_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('SCENARIO_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32).');
  return k;
}

/** `aad` binds the ciphertext to its owner, so it can't be copied into another user's row. */
export function encrypt(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv).setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(token: string, aad: string): string {
  const [v, iv, tag, ct] = token.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised ciphertext');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')).setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
