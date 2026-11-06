import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { understand, money } from '../lib/understand.js';
import { cityBySlug, judge, references } from './prices.js';

/**
 * Ask Karibu: answers only from what Karibu has checked (official links, Travel smart pages, fair prices,
 * the operator watchlist and verified listings) and shows its sources. When it doesn't know, it says so.
 * An optional language model (ANTHROPIC_API_KEY) only rewords answers from the same sources; it never adds facts.
 */
export type Source = { title: string; url: string; kind: 'official' | 'karibu' | 'listing' | 'price' };
export type Answer = {
  intent: string; answered: boolean; text: string; sources: Source[];
  listings?: { slug: string; title: string; city: string; category: string; priceFrom: number | null; currency: string; verificationLevel: number }[];
  chips?: string[]; followUps: string[]; action?: { label: string; href: string };
};

const WEB = () => (process.env.WEB_URL ?? 'https://karibu.enkopintelligence.com').replace(/\/$/, '');
const has = (t: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(t));

async function page(slug: string): Promise<{ title: string; body: string; sources: string[]; reviewed: string } | null> {
  const { rows } = await q(`SELECT title, body_md AS body, source_urls AS sources, to_char(last_reviewed_on, 'DD Mon YYYY') AS reviewed FROM country_pages WHERE country_code = 'KE' AND slug = $1`, [slug]);
  return rows[0] ?? null;
}
async function links(topic: string) {
  const { rows } = await q(`SELECT title, url, warning FROM country_links WHERE country_code = 'KE' AND topic = $1 AND is_active ORDER BY position LIMIT 3`, [topic]);
  return rows as { title: string; url: string; warning: string | null }[];
}
const firstSentences = (s: string, n = 3) => (s.match(/[^.!?]+[.!?]+/g) ?? [s]).slice(0, n).join(' ').trim();

async function infoAnswer(intent: string, slug: string, topic: string | null, lead: string): Promise<Answer> {
  const [p, l] = await Promise.all([page(slug), topic ? links(topic) : Promise.resolve([])]);
  const sources: Source[] = [
    ...l.map((x) => ({ title: x.title, url: x.url, kind: 'official' as const })),
    ...(p ? [{ title: `Travel smart: ${p.title}`, url: `${WEB()}/safety#${slug}`, kind: 'karibu' as const }] : []),
  ];
  const warn = l.find((x) => x.warning)?.warning;
  const text = [lead, p ? `${firstSentences(p.body)} (Karibu reviewed this on ${p.reviewed}.)` : null, warn ? `Warning: ${warn}` : null,
    l[0] ? `The official source is ${l[0].url.replace(/^https:\/\//, '')}. Rules can change, so check there before you rely on them.` : null]
    .filter(Boolean).join('\n\n');
  return { intent, answered: !!(p || l.length), text, sources, followUps: [] };
}

async function priceAnswer(question: string, amount: number, citySlug: string): Promise<Answer> {
  const city = await cityBySlug(citySlug);
  // The item is what's left once the amount and filler are removed: "is 6500 fair for a taxi from jkia to westlands"
  const item = question.toLowerCase()
    .replace(/(kes|ksh|kshs|sh|bob|\$)?\s*[\d,]+(\.\d+)?\s*(k|bob|kes|ksh|shillings)?/g, ' ')
    .replace(/\b(is|was|it|a|an|the|fair|ok|okay|too|much|expensive|for|to|pay|paid|paying|charged|they|he|she|me|i|my|price|cost|at|night|in|nairobi|mombasa|diani|reasonable|rip|off|ripoff|asked|asking|quote|quoted|what|about|this|that|good|deal)\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (item.length < 2) return { intent: 'price', answered: false, text: 'What was the price for? For example: “Is KES 6,500 fair for a taxi from JKIA to Westlands?”', sources: [], followUps: [] };
  const { checked, community } = await references(city.id, item, city.currency);
  const j = judge(amount, checked, community);
  const href = `${WEB()}/safety/prices?city=${citySlug}`;
  const sources: Source[] = [{ title: `Fair prices in ${city.name}`, url: href, kind: 'price' }];
  if (j.verdict === 'unknown') {
    return {
      intent: 'price', answered: false, sources,
      text: `I don’t have enough checked prices for “${item}” in ${city.name} yet, so I can’t say if ${city.currency} ${money(amount)} is fair. If you pay it, adding what you paid helps the next traveller.`,
      followUps: [], action: { label: 'I paid this much', href: `${WEB()}/safety/prices/add?city=${citySlug}&item=${encodeURIComponent(item)}&amount=${amount}` },
    };
  }
  const range = `${city.currency} ${money(j.typicalLow!)}–${money(j.typicalHigh!)}`;
  const what = checked?.item ?? community?.item ?? item;
  const verdictText = {
    fair: `That looks fair. The usual price for ${what.toLowerCase()} in ${city.name} is about ${range}.`,
    low: `That’s below the usual ${range} for ${what.toLowerCase()} in ${city.name}. Good, but check what’s included.`,
    high: `That’s a bit high. The usual price for ${what.toLowerCase()} in ${city.name} is about ${range}. It’s normal to ask for a better price.`,
    very_high: `That’s about ${j.times}× the usual price. ${what} in ${city.name} is usually ${range}. You can politely decline or offer the usual price.`,
  }[j.verdict as 'fair' | 'low' | 'high' | 'very_high'];
  const basis = [checked ? `our team checked ${checked.low}–${checked.high} on ${new Date(checked.checkedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${checked.isExample ? ' (example figure)' : ''}` : null,
    community && community.typicalReports >= 3 ? `${community.reports} travellers reported paying a median of ${money(community.median)}` : null].filter(Boolean).join('; ');
  return { intent: 'price', answered: true, text: `${verdictText}${basis ? `\n\nBased on: ${basis}.` : ''}`, sources, followUps: ['How do I avoid airport taxi overcharging?'] };
}

async function operatorAnswer(app: FastifyInstance, name: string): Promise<Answer> {
  const r = await app.inject({ method: 'GET', url: `/v1/operators/check?query=${encodeURIComponent(name)}` });
  const d = r.json() as { result: string; watchlist: { name: string; reason: string } | null; matches: { name: string; slug: string; level: number; current: boolean; suspended: boolean }[] };
  const sources: Source[] = [{ title: 'Check an operator', url: `${WEB()}/safety/check?query=${encodeURIComponent(name)}`, kind: 'karibu' }];
  const tra = (await links('business_check'))[0];
  if (tra) sources.push({ title: tra.title, url: tra.url, kind: 'official' });
  const text = {
    watchlist: `Be careful. “${d.watchlist?.name}” is on Karibu’s watchlist: ${d.watchlist?.reason}. Don’t send money until you’re sure.`,
    verified: `“${d.matches[0]?.name}” is verified on Karibu (level ${d.matches[0]?.level}). Still, pay deposits only to the business’s company account or paybill, never to a personal number.`,
    listed_unverified: `“${d.matches[0]?.name}” is on Karibu but not currently verified. Ask for their licence number and check it on the regulator’s site before paying.`,
    not_found: `I couldn’t find “${name}” on Karibu or the watchlist. That doesn’t mean it’s a scam, but check their licence on the regulator’s site and never pay a deposit to a personal number.`,
  }[d.result] ?? '';
  if (d.matches[0]?.slug) sources.unshift({ title: d.matches[0].name, url: `${WEB()}/b/${d.matches[0].slug}`, kind: 'listing' });
  return { intent: 'operator', answered: true, text, sources, followUps: ['What are common safari scams?'] };
}

async function searchAnswer(app: FastifyInstance, question: string): Promise<Answer> {
  const r = await app.inject({ method: 'GET', url: `/v1/listings?nl=1&pageSize=5&q=${encodeURIComponent(question.slice(0, 100))}` });
  const d = r.json() as any;
  const chips: string[] = d.understood?.chips?.map((c: { label: string }) => c.label) ?? [];
  let rows = d.results ?? [];
  let note = '';
  if (!rows.length && d.relaxed) {
    rows = d.relaxed.results;
    note = ` Nothing matched everything, so these are without ${d.relaxed.without}.`;
  }
  const params = new URLSearchParams({ q: question.slice(0, 100), nl: '1' });
  const listings = rows.slice(0, 5).map((x: any) => ({ slug: x.slug, title: x.title, city: x.city, category: x.category, priceFrom: x.priceFrom, currency: x.currency, verificationLevel: x.verificationLevel }));
  if (!listings.length) {
    return { intent: 'search', answered: false, chips, text: `I couldn’t find verified listings for that yet${chips.length ? ` (${chips.join(', ')})` : ''}. Tell us you need it and we’ll look for one.`, sources: [], followUps: [], action: { label: 'Tell us you need this', href: `${WEB()}/explore?${params}` } };
  }
  return {
    intent: 'search', answered: true, chips, listings,
    text: `${chips.length ? `I looked for: ${chips.join(', ')}.` : 'Here’s what I found.'} ${d.total || d.relaxed?.total} verified ${(d.total || d.relaxed?.total) === 1 ? 'listing' : 'listings'}.${note} Every one was checked by our team.`,
    sources: listings.map((l: any) => ({ title: l.title, url: `${WEB()}/listing/${l.slug}`, kind: 'listing' as const })),
    followUps: [], action: { label: 'See all results', href: `${WEB()}/explore?${params}` },
  };
}

/** Pick an intent and answer from Karibu's own data. */
export async function answer(app: FastifyInstance, raw: string, opts: { city?: string } = {}): Promise<Answer> {
  const t = raw.trim();
  const low = t.toLowerCase();
  const city = opts.city ?? (understand(t, (await q(`SELECT slug, name, country_code AS country FROM cities`)).rows).filters.city) ?? 'nairobi';

  // Emergencies first, always.
  if (has(low, 'emergency', 'ambulance', 'police', 'robbed', 'stolen', 'attacked', 'accident', 'lost passport', 'lost my passport', 'help me', 'msaada')) {
    const { rows } = await q(`SELECT kind, label, value FROM emergency_contacts WHERE country_code = 'KE' AND kind IN ('emergency','police','ambulance','tourist_police','embassy') ORDER BY kind = 'embassy', kind`);
    const nums = rows.filter((r) => r.kind !== 'embassy').map((r) => `${r.label}: ${r.value}`).join('\n');
    const emb = rows.filter((r) => r.kind === 'embassy');
    return {
      intent: 'emergency', answered: true,
      text: `If you’re in danger, call now:\n${nums}\n\nFor a lost or stolen passport, report it to the police and contact your embassy.`,
      sources: [{ title: 'Emergency card', url: `${WEB()}/safety/emergency`, kind: 'karibu' }, ...emb.map((e) => ({ title: e.label, url: e.value, kind: 'official' as const }))],
      followUps: [],
    };
  }

  // "Is 6,500 fair for…", "they're charging 3k for a boda"
  const amt = low.match(/(?:kes|ksh|kshs|sh)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|bob|kes|ksh|shillings)?\b/);
  if (amt && has(low, 'fair', 'too much', 'expensive', 'charg', 'pay', 'paid', 'cost', 'price', 'quote', 'rip', 'reasonable', 'ok\\b', 'normal')) {
    let n = parseFloat(amt[1].replace(/,/g, ''));
    if (amt[2] === 'k') n *= 1000;
    if (n >= 10) return priceAnswer(t, Math.round(n), city);
  }

  // "Is Mara Sunset Tours legit?", "check operator X", "is +2547… a scam"
  const op = t.match(/(?:is|are)\s+(.{2,60}?)\s+(?:legit|legitimate|real|genuine|a scam|scam|safe|trustworthy|verified|licensed)\b/i)
    ?? t.match(/(?:check|verify)\s+(?:the\s+)?(?:operator|company|business|agent|number)?\s*[:-]?\s*(.{2,60})$/i)
    ?? t.match(/(\+?\d[\d\s-]{8,})/);
  if (op && has(low, 'legit', 'real', 'genuine', 'scam', 'trust', 'verified', 'licensed', 'check', 'verify', 'safe to pay')) {
    return operatorAnswer(app, op[1].trim().replace(/[?.!]+$/, ''));
  }

  if (has(low, 'visa', 'eta\\b', 'e-ta', 'entry', 'passport', 'immigration', 'border')) {
    return infoAnswer('entry', 'entry', 'entry', 'Entry rules depend on your passport. Here’s what Karibu has checked:');
  }
  if (has(low, 'vaccin', 'malaria', 'yellow fever', 'health', 'hospital', 'doctor', 'clinic', 'sick')) {
    return infoAnswer('health', 'health', 'health', 'For health questions, here’s what Karibu has checked. A travel clinic can advise you personally.');
  }
  if (has(low, 'm-pesa', 'mpesa', 'money', 'cash', 'atm', 'card', 'currency', 'exchange', 'tip', 'tipping')) {
    return infoAnswer('money', 'money', null, 'Here’s how paying works in Kenya:');
  }
  if (has(low, 'sim', 'esim', 'data', 'airtime', 'safaricom', 'airtel')) {
    return infoAnswer('sim', 'sim', null, 'Getting connected:');
  }
  if (has(low, 'sgr', 'train', 'madaraka', 'flight', 'airport', 'getting around', 'matatu', 'boda', 'uber', 'bolt') && !has(low, 'find', 'book', 'need a')) {
    return infoAnswer('getting-around', 'getting-around', 'transport', 'Getting around:');
  }
  if (has(low, 'park fee', 'kws', 'conservancy fee', 'entry fee')) {
    return infoAnswer('parks', 'getting-around', 'parks', 'Park fees are set by Kenya Wildlife Service and the conservancies. Pay only through official channels:');
  }
  if (has(low, 'safe', 'safety', 'scam', 'dangerous', 'night')) {
    return infoAnswer('safety', 'safety', 'safety', 'Staying safe:');
  }
  return searchAnswer(app, t);
}

/** Optional: reword the answer more naturally with Claude, using only the same text and sources. */
async function polish(question: string, a: Answer): Promise<Answer> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !a.answered || a.intent === 'emergency') return a;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: process.env.ASK_MODEL ?? 'claude-haiku-5-5',
        max_tokens: 400,
        system: 'You are Ask Karibu, a calm, friendly East Africa travel companion. Rewrite the DRAFT answer to the QUESTION in plain, warm English, at most 120 words. Use ONLY facts in the DRAFT. Do not add prices, rules, names, dates or advice that are not in the DRAFT. Keep every warning. No markdown headings.',
        messages: [{ role: 'user', content: `QUESTION: ${question}\n\nDRAFT:\n${a.text}` }],
      }),
    });
    if (!res.ok) return a;
    const j = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = j.content?.find((c) => c.type === 'text')?.text?.trim();
    return text ? { ...a, text } : a;
  } catch {
    return a;
  }
}

async function log(channel: 'web' | 'whatsapp', question: string, a: Answer) {
  await q(`INSERT INTO ask_log (channel, intent, question, answered, sources) VALUES ($1,$2,$3,$4,$5)`, [channel, a.intent, question.slice(0, 300), a.answered, a.sources.length]).catch(() => {});
}

// ---------------- WhatsApp (Meta Cloud API) ----------------
function plainForWhatsApp(a: Answer) {
  const lines = [a.text];
  if (a.listings?.length) lines.push(a.listings.map((l, i) => `${i + 1}. ${l.title} (${l.city})${l.priceFrom ? ` from ${l.currency} ${money(l.priceFrom)}` : ''}\n${WEB()}/listing/${l.slug}`).join('\n'));
  const official = a.sources.filter((s) => s.kind !== 'listing').slice(0, 2);
  if (official.length) lines.push(`Sources:\n${official.map((s) => `• ${s.title}: ${s.url}`).join('\n')}`);
  if (a.action) lines.push(`${a.action.label}: ${a.action.href}`);
  return lines.join('\n\n').slice(0, 4000);
}

async function sendWhatsApp(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.log(`[whatsapp:console] to ${to}:\n${body}`);
    return;
  }
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

const WA_HELP = 'Karibu here. Ask me things like:\n• Is 6,500 fair for a taxi from JKIA to Westlands?\n• Is Mara Sunset Tours legit?\n• Do I need an eTA?\n• Furnished 2 bedroom in Kilimani under 120k\n• Emergency numbers';

export async function askRoutes(app: FastifyInstance) {
  app.post('/ask', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const b = z.object({ question: z.string().trim().min(2).max(300), city: z.string().max(80).optional() }).parse(req.body);
    const a = await polish(b.question, await answer(app, b.question, { city: b.city }));
    await log('web', b.question, a);
    return a;
  });

  app.post('/ask/feedback', async (req) => {
    const b = z.object({ question: z.string().max(300), helpful: z.boolean() }).parse(req.body);
    await q(`UPDATE ask_log SET helpful = $2 WHERE id = (SELECT id FROM ask_log WHERE question = $1 ORDER BY at DESC LIMIT 1)`, [b.question.slice(0, 300), b.helpful]);
    return { ok: true };
  });

  // Meta's webhook check: echo the challenge when the verify token matches.
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const p = req.query as Record<string, string>;
    if (p['hub.mode'] === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && p['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.type('text/plain').send(p['hub.challenge']);
    }
    return reply.code(403).send('Forbidden');
  });

  app.post('/webhooks/whatsapp', async (req: FastifyRequest, reply) => {
    // When an app secret is set, only accept messages signed by Meta.
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      const sig = String(req.headers['x-hub-signature-256'] ?? '');
      const expected = `sha256=${createHmac('sha256', secret).update((req as any).rawBody ?? JSON.stringify(req.body)).digest('hex')}`;
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return reply.code(401).send({ error: 'Bad signature' });
    }
    const msgs = ((req.body as any)?.entry ?? []).flatMap((e: any) => e.changes ?? []).flatMap((c: any) => c.value?.messages ?? []);
    for (const m of msgs.slice(0, 5)) {
      const from = String(m.from ?? '');
      const text = String(m.text?.body ?? '').trim();
      if (!from) continue;
      if (!text || /^(hi|hello|hey|jambo|habari|mambo|start|help|menu)\b/i.test(text)) {
        await sendWhatsApp(from, WA_HELP);
        continue;
      }
      const a = await polish(text, await answer(app, text.slice(0, 300)));
      await log('whatsapp', text, a);
      await sendWhatsApp(from, plainForWhatsApp(a));
    }
    return { ok: true };
  });
}
