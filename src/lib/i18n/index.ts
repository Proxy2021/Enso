/**
 * Lightweight i18n system for Enso.
 *
 * Reads locale from Zustand store (synced to localStorage).
 * Provides a `useT()` hook that returns a `t(key)` function.
 */

import { useSyncExternalStore } from "react";
import en from "./en.json";
import zh from "./zh.json";

export type Locale = "en" | "zh";

const dictionaries: Record<Locale, Record<string, string>> = { en, zh };

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

export const SUPPORTED_LOCALES: Locale[] = ["en", "zh"];

// ---- Module-level locale state (set by the Zustand store) ----

let _locale: Locale = (localStorage.getItem("enso_language") as Locale) || "en";
const _listeners = new Set<() => void>();

/** Called by the Zustand store to keep locale in sync. */
export function _setLocale(locale: Locale) {
  if (_locale === locale) return;
  _locale = locale;
  _listeners.forEach((fn) => fn());
}

export function getLocale(): Locale {
  return _locale;
}

// ---- Translation ----

/** Translate a key using the given locale, falling back to English. */
export function translate(locale: Locale, key: string): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
}

/** Translate using the current global locale. */
export function t(key: string): string {
  return translate(_locale, key);
}

// ---- React hook ----

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}
function getSnapshot() { return _locale; }

/** React hook — returns `t(key)` bound to current locale. */
export function useT() {
  const locale = useSyncExternalStore(subscribe, getSnapshot);
  return {
    t: (key: string) => translate(locale, key),
    locale,
  };
}
