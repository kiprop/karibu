import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { badRequest } from './util.js';

// Argon2id (algorithm 2), OWASP's recommended settings: 19 MiB memory, 2 passes, 1 lane.
const OPTS = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function checkPassword(stored: string | null | undefined, pw: string) {
  if (!stored) {
    // Spend about the same time as a real check, so "no password set" can't be told apart by timing.
    await hash(pw, OPTS);
    return false;
  }
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'karibu123', 'safari123', 'kenya2026', 'nairobi123']);

/**
 * At least 8 characters, not a well-known password, and not in a known data breach.
 * The breach check sends only the first 5 characters of the password's SHA-1 to Have I Been Pwned (k-anonymity),
 * and is skipped if that service can't be reached so sign-up never breaks.
 */
export async function assertGoodPassword(pw: string, context: (string | null | undefined)[] = []) {
  if (pw.length < 8) throw badRequest('Use at least 8 characters for your password', 'weak_password');
  if (pw.length > 200) throw badRequest('That password is too long', 'weak_password');
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) throw badRequest('That password is too easy to guess. Try a short phrase of a few words.', 'weak_password');
  for (const c of context) {
    const part = c?.toLowerCase().split('@')[0].replace(/^\+/, '');
    if (part && part.length >= 4 && low.includes(part)) throw badRequest('Don’t use your email or phone number in your password', 'weak_password');
  }
  if (await isBreached(pw)) {
    throw badRequest('That password has appeared in a data breach elsewhere, so it isn’t safe. Please choose another.', 'breached_password');
  }
}

async function isBreached(pw: string) {
  if (process.env.PASSWORD_BREACH_CHECK === 'false' || process.env.NODE_ENV === 'test') return false;
  const sha = createHash('sha1').update(pw).digest('hex').toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'EI-Karibu' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const suffix = sha.slice(5);
    return (await res.text()).split('\n').some((line) => {
      const [s, n] = line.trim().split(':');
      return s === suffix && Number(n) > 0;
    });
  } catch {
    return false;
  }
}
