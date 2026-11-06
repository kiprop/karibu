import Link from 'next/link';
import { Area, AreaHead, Panel } from '@/components/RailShell';
import { AskKaribu } from '@/components/AskKaribu';

export const metadata = { title: 'Ask Karibu' };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <Area>
      <AreaHead crumbs={[{ label: 'My Karibu', href: '/today' }, { label: 'Ask Karibu' }]} title="Ask Karibu"
        desc="Your travel companion. It answers only from what Karibu has checked: fair prices, verified businesses, the scam watchlist and official government sites. When it doesn’t know, it says so." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 rounded-xl border border-line bg-panel p-3 sm:p-4">
          <AskKaribu autoFocus initial={q?.slice(0, 300)} />
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="What it can help with">
            <ul className="flex flex-col gap-1.5 text-[13.5px] text-muted">
              <li><b className="text-ink">Is this price fair?</b> Checked against what travellers paid.</li>
              <li><b className="text-ink">Is this operator real?</b> Licences, our records and the scam watchlist.</li>
              <li><b className="text-ink">Entry, health, money, SIM cards</b> from the official sources.</li>
              <li><b className="text-ink">Finding a place</b> in plain words: “tented camp in the Mara under 30k”.</li>
            </ul>
          </Panel>
          <Panel title="In an emergency">
            <p className="text-[13.5px] text-muted">Call <b className="text-ink">999</b> or <b className="text-ink">112</b> in Kenya. <Link href="/safety/emergency" className="font-semibold text-brand">Emergency card</Link></p>
          </Panel>
          <p className="px-1 text-[12.5px] text-muted">Also on WhatsApp, with the same answers. We record what was asked so we can improve, never who asked.</p>
        </div>
      </div>
    </Area>
  );
}
