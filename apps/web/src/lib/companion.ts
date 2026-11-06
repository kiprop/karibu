'use client';

import { call } from './client-api';

/** What the companion knows about a trip. Signed in: saved to the account. Guest: kept on this device only. */
export type Profile = {
  mode?: 'visit' | 'settle' | null;
  passportCountry?: string | null;
  arrivingOn?: string | null;
  leavingOn?: string | null;
  baseCity?: string | null;
  travellerType?: string | null;
  partySize?: number | null;
  budget?: 'budget' | 'mid' | 'premium' | null;
  language?: 'en' | 'sw';
};

const PKEY = 'kb_profile';
const CKEY = 'kb_checklist';

export function localProfile(): Profile {
  try {
    return JSON.parse(localStorage.getItem(PKEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveLocalProfile(p: Profile) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {}
}
export function localChecklist(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CKEY) ?? '[]');
  } catch {
    return [];
  }
}
export function setLocalStep(key: string, done: boolean) {
  const s = new Set(localChecklist());
  if (done) s.add(key);
  else s.delete(key);
  try {
    localStorage.setItem(CKEY, JSON.stringify([...s]));
  } catch {}
}

/** Query string a guest sends so the API can tailor answers without storing anything. */
export function profileQuery(p: Profile) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  return u.toString();
}

export async function loadProfile(signedIn: boolean): Promise<Profile> {
  if (!signedIn) return localProfile();
  try {
    const r = await call<{ profile: Profile }>('/me/profile');
    // First sign-in on this device: carry over what they set as a guest.
    const local = localProfile();
    if (!r.profile.arrivingOn && !r.profile.mode && (local.arrivingOn || local.mode)) {
      await call('/me/profile', { method: 'PUT', body: local });
      return local;
    }
    return r.profile;
  } catch {
    return localProfile();
  }
}

export async function saveProfile(signedIn: boolean, p: Profile) {
  saveLocalProfile(p);
  if (signedIn) await call('/me/profile', { method: 'PUT', body: p });
}

export const TRAVELLER_TYPES: [string, string][] = [
  ['solo', 'On my own'], ['couple', 'As a couple'], ['family', 'With family'], ['friends', 'With friends'],
  ['business', 'For work'], ['long_stay', 'Staying long or working remotely'], ['moving_home', 'Moving home'],
];
