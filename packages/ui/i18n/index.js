/**
 * @file packages/ui/src/i18n/index.ts
 * @description Zero-Runtime-Fetch Localization Engine (English `en` & Hindi `hi`)
 * persisted in `chrome.storage.local` under key `vg_locale`.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import enMessages from './locales/en.json';
import hiMessages from './locales/hi.json';
export const STORAGE_LOCALE_KEY = 'vg_locale';
const DICTIONARIES = {
  en: enMessages,
  hi: hiMessages
};

/**
 * Formats a localized string by replacing `{placeholder}` tokens with provided values.
 */
export function translate(locale, key, vars) {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.en;
  let template = dict[key] ?? DICTIONARIES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}
function getChromeLocalStorage() {
  const g = globalThis;
  return g.chrome?.storage?.local ?? null;
}
export async function loadPersistedLocale() {
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
export async function persistLocale(locale) {
  const storage = getChromeLocalStorage();
  if (!storage) return;
  try {
    await storage.set({
      [STORAGE_LOCALE_KEY]: locale
    });
  } catch {
    // Ignore storage write errors in non-extension contexts
  }
}
const I18nContext = createContext({
  locale: 'en',
  setLocale: async () => {},
  t: (key, vars) => translate('en', key, vars)
});
export function I18nProvider({
  initialLocale = 'en',
  children
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  useEffect(() => {
    void loadPersistedLocale().then(saved => {
      setLocaleState(saved);
    });
  }, []);
  const setLocale = useCallback(async next => {
    setLocaleState(next);
    await persistLocale(next);
  }, []);
  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);
  return React.createElement(I18nContext.Provider, {
    value: {
      locale,
      setLocale,
      t
    }
  }, children);
}
export function useI18n() {
  return useContext(I18nContext);
}