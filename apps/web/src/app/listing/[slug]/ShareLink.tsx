'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

/** Share via the phone's share sheet, or copy the link on desktop. */
export function ShareLink({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch {}
  }
  return (
    <button type="button" onClick={share} className="btn-outline h-11"><Icon name="share" size={18} />{done ? 'Link copied' : 'Share'}</button>
  );
}
