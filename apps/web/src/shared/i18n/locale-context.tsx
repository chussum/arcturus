'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { type Locale, type Messages, messages } from './messages';

interface LocaleValue {
  locale: Locale;
  /** The active dictionary — components read copy from here. */
  t: Messages;
  setLocale: (locale: Locale) => void;
}

const STORAGE_KEY = 'arcturus-locale';

const LocaleContext = createContext<LocaleValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'ko';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'ko') return saved;
  return window.navigator.language.startsWith('ko') ? 'ko' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Start from 'ko' on both server and first client render to keep hydration
  // stable, then switch to the detected/saved locale.
  const [locale, setLocaleState] = useState<Locale>('ko');

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, t: messages[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside LocaleProvider');
  return value;
}
