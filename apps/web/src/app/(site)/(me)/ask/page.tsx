import { AreaHead } from '@/components/RailShell';
import { AskKaribu } from '@/components/AskKaribu';

export const metadata = { title: 'Ask Karibu' };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <AreaHead crumb="Companion" title="Ask Karibu"
        desc="Your travel companion. It answers only from what Karibu has checked: fair prices, verified businesses, the scam watchlist and official government sites. When it doesn’t know, it says so." />
      <div className="max-w-3xl rounded-xl border border-line bg-ground p-3 sm:p-4">
        <AskKaribu autoFocus initial={q?.slice(0, 300)} />
      </div>
      <p className="max-w-3xl text-[13px] text-muted">
        Also on WhatsApp: message Karibu’s number with the same questions. We record what was asked so we can improve, never who asked.
      </p>
    </div>
  );
}
