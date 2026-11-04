import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';

// ---- RFC 6238 time-based codes, as used by Google Authenticator, Microsoft Authenticator, 1Password and others ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 30_000);

/** Returns the matching time step (allowing one step of clock drift either way), or null. */
export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const s = currentStep(now);
  for (const step of [s, s - 1, s + 1]) {
    if (lastStep !== null && step <= lastStep) continue; // never accept the same code twice
    if (totpAt(secret, step) === code) return step;
  }
  return null;
}

export async function enrolment(email: string, secret: string) {
  const uri = `otpauth://totp/${encodeURIComponent(`EI Karibu staff:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('EI Karibu staff')}&algorithm=SHA1&digits=6&period=30`;
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { uri, qrSvg, secret: secret.replace(/(.{4})/g, '$1 ').trim() };
}

// ---- The authenticator secret is encrypted at rest with a key derived from STAFF_SECRET_KEY (or COOKIE_SECRET) ----
const key = () => createHash('sha256').update(`karibu-staff-totp:${process.env.STAFF_SECRET_KEY ?? config.cookieSecret}`).digest();

export function sealSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function openSecret(sealed: string) {
  const [v, iv, tag, enc] = sealed.split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

/** Ten one-time recovery codes like "k7qf-3m9x", for when the phone is lost. */
export function newRecoveryCodes() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => alphabet[x % alphabet.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const normaliseRecovery = (c: string) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
