/**
 * English and Swahili for the parts of Karibu people use most: navigation, search and the companion.
 * The language is a cookie (kb_lang) so server and client render the same words.
 */
export type Lang = 'en' | 'sw';
export const LANG_COOKIE = 'kb_lang';

const sw: Record<string, string> = {
  Explore: 'Gundua',
  'Settle in': 'Kuhamia',
  'Fair prices': 'Bei halali',
  Prices: 'Bei',
  'Travel smart': 'Safiri salama',
  Share: 'Shiriki',
  Saved: 'Vilivyohifadhiwa',
  Today: 'Leo',
  'My Karibu': 'Karibu yangu',
  'Ask Karibu': 'Uliza Karibu',
  'Sign in': 'Ingia',
  Account: 'Akaunti',
  'My business': 'Biashara yangu',
  'List your business': 'Orodhesha biashara yako',
  Search: 'Tafuta',
  'Search all': 'Tafuta yote',
  Stays: 'Malazi',
  'Game drives': 'Safari za wanyama',
  Transport: 'Usafiri',
  'East Africa without the guesswork.': 'Afrika Mashariki bila kubahatisha.',
  'Here for a week or for good? Stays, game drives and drivers, plus homes, furniture and home services, all checked by our team. Compare honestly, see what people really paid, then message them directly.':
    'Uko hapa kwa wiki moja au kwa kudumu? Malazi, safari na madereva, pamoja na nyumba, samani na huduma za nyumbani, vyote vimekaguliwa na timu yetu. Linganisha kwa uaminifu, ona watu walilipa kiasi gani, kisha watumie ujumbe moja kwa moja.',
  'Places, businesses, parks or neighbourhoods': 'Maeneo, biashara, mbuga au mitaa',
  'Try: “tented camp in the Mara under 30k with hot water”': 'Jaribu: “kambi ya hema Mara chini ya 30k yenye maji moto”',
  'Near me': 'Karibu nami',
  'We understood': 'Tumeelewa',
  'Tell us you need this': 'Tuambie unahitaji hiki',
  'Your plan': 'Mpango wako',
  Trips: 'Safari',
  Language: 'Lugha',
};

export function t(lang: Lang, s: string) {
  return lang === 'sw' ? sw[s] ?? s : s;
}

export function langFromCookie(v: string | undefined | null): Lang {
  return v === 'sw' ? 'sw' : 'en';
}
