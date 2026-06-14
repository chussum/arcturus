'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from '../../features/auth/session-context';
import { GlobalNav } from '../../widgets/global-nav/global-nav';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GlobalNav />
      {children}
    </SessionProvider>
  );
}
