import { config } from '../config.js';

/**
 * Outbound email and SMS. The console provider logs messages (development and tests).
 * Production providers plug in here: an email API (for example Resend or Amazon SES)
 * and an SMS gateway that covers East African networks (for example Africa's Talking).
 */
export interface Outbox {
  email(to: string, subject: string, text: string): Promise<void>;
  sms(to: string, text: string): Promise<void>;
}

export const sent: Array<{ kind: 'email' | 'sms'; to: string; text: string }> = [];

const consoleOutbox: Outbox = {
  async email(to, subject, text) {
    sent.push({ kind: 'email', to, text });
    if (config.env !== 'test') console.log(`[email] to=${to} subject="${subject}"\n${text}`);
  },
  async sms(to, text) {
    sent.push({ kind: 'sms', to, text });
    if (config.env !== 'test') console.log(`[sms] to=${to} ${text}`);
  },
};

async function africasTalkingSms(to: string, text: string) {
  const body = new URLSearchParams({ username: config.sms.username ?? '', to, message: text });
  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey: config.sms.apiKey ?? '', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
}

async function resendEmail(to: string, subject: string, text: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mail.from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}

export const outbox: Outbox = {
  email: config.mail.provider === 'resend' ? resendEmail : consoleOutbox.email,
  sms: config.sms.provider === 'africastalking' ? africasTalkingSms : consoleOutbox.sms,
};
