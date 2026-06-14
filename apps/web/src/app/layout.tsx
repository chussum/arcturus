import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/geist/index.css';
import '@fontsource-variable/geist-mono/index.css';
import '@fontsource/instrument-serif/400-italic.css';
import { LocaleProvider } from '../shared/i18n/locale-context';
import { ToastProvider } from '../shared/ui/toast';
import '../shared/styles/globals.css';

export const metadata: Metadata = {
  title: 'Arcturus',
  description: 'Deploy anything to your team server.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <LocaleProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
