import { createHash, randomBytes, randomInt, timingSafeEqual, createHmac } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomCode = (digits = 6) => String(randomInt(0, 10 ** digits)).padStart(digits, '0');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const hmacSha512 = (secret: string, body: string) => createHmac('sha512', secret).update(body).digest('hex');

export function slugify(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Build a wa.me link with a correctly percent-encoded prefilled message. */
export function whatsappUrl(phoneE164: string, text: string) {
  return `https://wa.me/${phoneE164.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code = 'error') {
    super(message);
  }
}
export const notFound = (what = 'Not found') => new HttpError(404, what, 'not_found');
export const forbidden = (what = 'You do not have access to this') => new HttpError(403, what, 'forbidden');
export const badRequest = (what: string, code = 'bad_request') => new HttpError(400, what, code);

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com',
]);
/** True when an email is on the business's own domain rather than a free webmail provider. A trust signal for reviewers, not a requirement. */
export function isCompanyEmail(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return !!domain && !FREE_MAIL.has(domain);
}
