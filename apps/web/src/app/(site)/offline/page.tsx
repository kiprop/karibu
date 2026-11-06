import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Centered } from '@/components/Page';

export const metadata = { title: 'Offline' };

/** Shown when you open a page you haven't visited before and there's no signal. */
export default function Offline() {
  return (
    <Centered>
      <div className="card flex flex-col gap-4 p-6">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-soft text-muted"><Icon name="wifi" size={24} /></span>
      <h1 className="area-title">You’re offline</h1>
      <p className="text-muted">This page wasn’t saved yet. These work without signal once you’ve opened them:</p>
      <ul className="flex flex-col gap-2">
        <li><Link className="btn-outline w-full justify-start" href="/safety/emergency"><Icon name="sos" size={18} />Emergency card: 999 and 112</Link></li>
        <li><Link className="btn-outline w-full justify-start" href="/safety/prices"><Icon name="tag" size={18} />Fair prices</Link></li>
        <li><Link className="btn-outline w-full justify-start" href="/safety"><Icon name="shield" size={18} />Travel smart</Link></li>
        <li><Link className="btn-outline w-full justify-start" href="/saved"><Icon name="heart" size={18} />Saved places you’ve opened</Link></li>
      </ul>
      </div>
    </Centered>
  );
}
