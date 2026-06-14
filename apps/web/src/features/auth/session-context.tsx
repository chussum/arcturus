'use client';

import type { UserProfile } from '@arcturus/shared';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, logout } from '../../entities/user/api';

interface SessionValue {
  user: UserProfile;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Loads the current account once and protects everything beneath it:
 * anonymous visitors are sent to the login hero.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetchMe()
      .then((response) => setUser(response.user))
      .catch(() => router.replace('/login'));
  }, [router]);

  const signOut = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [router]);

  if (!user) return null;
  return <SessionContext.Provider value={{ user, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
