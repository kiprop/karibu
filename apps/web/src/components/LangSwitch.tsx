'use client';

import { LANG_COOKIE, type Lang } from '@/lib/i18n';

/** English or Kiswahili. Saved for a year on this device. */
export function LangSwitch({ lang, className = '' }: { lang: Lang; className?: string }) {
  const set = (l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  };
  return (
    <div role="group" aria-label="Language" className={`inline-flex rounded-md border border-line bg-panel p-0.5 text-[12px] font-semibold ${className}`}>
      {([['en', 'EN'], ['sw', 'SW']] as const).map(([l, label]) => (
        <button key={l} onClick={() => set(l)} aria-pressed={lang === l} lang={l} title={l === 'en' ? 'English' : 'Kiswahili'}
          className={`rounded px-1.5 py-0.5 ${lang === l ? 'bg-ink text-ground' : 'text-muted hover:text-ink'}`}>{label}</button>
      ))}
    </div>
  );
}
