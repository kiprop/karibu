import { config } from '../config.js';
import { hmacSha512, safeEqual } from './util.js';

/**
 * Vendor plan billing through Paystack (cards and M-Pesa in Kenya). Karibu only collects its
 * own subscription fees; no traveller-to-vendor money passes through Karibu.
 * Without a secret key (development) checkout is simulated and the plan activates immediately.
 */
export const paymentsConfigured = () => Boolean(config.paystack.secretKey);

export async function startCheckout(opts: { email: string; plan: 'pro' | 'featured'; vendorId: string; callbackUrl: string }) {
  const planCode = config.paystack.planCodes[opts.plan];
  if (!config.paystack.secretKey || !planCode) return { simulated: true as const };
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.paystack.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: opts.email,
      plan: planCode,
      amount: 100, // required by the API; the plan amount overrides it
      callback_url: opts.callbackUrl,
      metadata: { vendorId: opts.vendorId, plan: opts.plan },
    }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string; reference: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(`Payment provider error: ${json.message}`);
  return { simulated: false as const, url: json.data.authorization_url, reference: json.data.reference };
}

/** Paystack signs webhook bodies with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhook(rawBody: string, signature: string | undefined) {
  if (!config.paystack.secretKey || !signature) return false;
  return safeEqual(hmacSha512(config.paystack.secretKey, rawBody), signature);
}
