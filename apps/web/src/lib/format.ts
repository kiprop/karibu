const nf = (cur: string) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

export function price(currency: string, from: number | null, to: number | null, unit?: string) {
  if (from == null) return 'Ask for price';
  const f = nf(currency);
  const range = to && to !== from ? `${f.format(from)}–${f.format(to)}` : f.format(from);
  return `${currency} ${range}${unit ? ` ${unit}` : ''}`;
}

export function shortDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  return d.toLocaleDateString('en-GB', { ...opts, timeZone: 'Africa/Nairobi' });
}

export function eventTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Nairobi' });
}

export function km(m?: number | null) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
