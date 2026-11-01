/**
 * @file packages/ui/src/i18n/index.ts
 * @description Zero-Runtime-Fetch Localization Engine (English `en` & Hindi `hi`)
 * persisted in `chrome.storage.local` under key `vg_locale`.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import enMessages from './locales/en.json';
import hiMessages from './locales/hi.json';

export const STORAGE_LOCALE_KEY = 'vg_locale';

export type Locale = 'en' | 'hi';

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: enMessages,
  hi: hiMessages,
};

/**
 * Formats a localized string by replacing `{placeholder}` tokens with provided values.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  let template = dict[key] ?? DICTIONARIES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}

function getChromeLocalStorage(): any {
  const g = globalThis as any;
  return g.chrome?.storage?.local ?? null;
}

export async function loadPersistedLocale(): Promise<Locale> {
  const storage = getChromeLocalStorage();
  if (!storage) return 'en';
  try {
    const data = await storage.get([STORAGE_LOCALE_KEY]);
    const raw = data[STORAGE_LOCALE_KEY];
    return raw === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export async function persistLocale(locale: Locale): Promise<void> {
  const storage = getChromeLocalStorage();
  if (!storage) return;
  try {
    await storage.set({
      [STORAGE_LOCALE_KEY]: locale,
    });
  } catch {
    // Ignore storage write errors in non-extension contexts
  }
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: async () => {},
  t: (key, vars) => translate('en', key, vars),
});

export interface I18nProviderProps {
  initialLocale?: Locale;
  children: ReactNode;
}

export function I18nProvider({ initialLocale = 'en', children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    void loadPersistedLocale().then(saved => {
      setLocaleState(saved);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await persistLocale(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale]
  );

  return React.createElement(
    I18nContext.Provider,
    {
      value: {
        locale,
        setLocale,
        t,
      },
    },
    children
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
