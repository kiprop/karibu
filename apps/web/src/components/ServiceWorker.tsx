'use client';

import { useEffect, useState } from 'react';

/** Registers the offline helper and tells people when they're offline. */
export function ServiceWorker() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker?.register('/sw.js').catch(() => {});
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-14 z-50 mx-auto w-fit rounded-b-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-ground">
      You’re offline. Saved pages, fair prices and the emergency card still work.
    </div>
  );
}
