'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Me } from '@/lib/types';
import { call, guestFavourites, setGuestFavourites } from '@/lib/client-api';

type Ctx = {
  me: Me;
  favourites: Set<string>;
  toggleFavourite: (id: string) => Promise<boolean>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ me, children }: { me: Me; children: React.ReactNode }) {
  const [favourites, setFavourites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (me.user) {
      call<{ favourites: { id: string }[] }>('/me/favourites')
        .then((r) => setFavourites(new Set(r.favourites.map((f) => f.id))))
        .catch(() => {});
    } else {
      const load = () => setFavourites(new Set(guestFavourites()));
      load();
      window.addEventListener('kb-favourites', load);
      return () => window.removeEventListener('kb-favourites', load);
    }
  }, [me.user]);

  const toggleFavourite = useCallback(
    async (id: string) => {
      const on = !favourites.has(id);
      const next = new Set(favourites);
      on ? next.add(id) : next.delete(id);
      setFavourites(next);
      if (me.user) {
        try {
          await call(`/me/favourites/${id}`, { method: on ? 'PUT' : 'DELETE' });
        } catch {
          setFavourites(favourites);
        }
      } else {
        setGuestFavourites([...next]);
      }
      return on;
    },
    [favourites, me.user],
  );

  return <SessionCtx.Provider value={{ me, favourites, toggleFavourite }}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession must be used inside SessionProvider');
  return c;
}
