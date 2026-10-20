// Internationalization, built on i18next (vendor/i18next.mjs).
//
// UI text lives in message catalogs, web/locales/<language>.json, keyed by
// dotted names (e.g. "setup.players"). en.json is the base (US English);
// other catalogs only need the keys that differ: a missing key falls back
// along the language's fallback chain (en-AU -> en-GB -> en).
//
// To add a language: write web/locales/<code>.json, add it to LANGUAGES,
// and (if it should catch regional variants) to FALLBACK.

import i18next from '../vendor/i18next.mjs';

// The languages offered in the footer, by BCP 47 code.
export const LANGUAGES = { en: 'English (US)', 'en-GB': 'English (UK)', he: 'עברית' };

// Where each language looks when a key is missing.
const FALLBACK = {
  'en-AU': ['en-GB', 'en'],
  'en-NZ': ['en-GB', 'en'],
  'en-IE': ['en-GB', 'en'],
  'en-ZA': ['en-GB', 'en'],
  'en-IN': ['en-GB', 'en'],
  'en-UK': ['en-GB', 'en'],
  default: ['en'],
};

// The chosen language is the one setting shared by the solver and the clue
// validator (validate.html), so it is saved under its own key, not in either
// page's game state.
const LANGUAGE_KEY = 'decryptid.language';

// savedLanguage is the language chosen on either page, or fallback.
export function savedLanguage(fallback = 'auto') {
  try {
    return localStorage.getItem(LANGUAGE_KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

// saveLanguage remembers the chosen language for both pages.
export function saveLanguage(lng) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lng);
  } catch {
    // Storage may be unavailable (private mode); the choice just won't persist.
  }
}

// browserLanguage is the user's preferred language, as the browser reports it.
export const browserLanguage = () => (navigator.languages ?? [navigator.language])[0] || 'en';

// initI18n loads every catalog and selects lng (a code, or 'auto').
export async function initI18n(lng) {
  const resources = {};
  await Promise.all(Object.keys(LANGUAGES).map(async (code) => {
    const res = await fetch(`locales/${code}.json`);
    resources[code] = { translation: await res.json() };
  }));
  await i18next.init({
    lng: lng === 'auto' ? browserLanguage() : lng,
    fallbackLng: FALLBACK,
    resources,
    // Values are inserted into HTML we build ourselves (names, numbers,
    // coordinates), and some messages contain markup such as <b>.
    interpolation: { escapeValue: false },
  });
  applyLanguage();
}

// setLanguage switches language (a code, or 'auto' for the browser's).
export async function setLanguage(lng) {
  await i18next.changeLanguage(lng === 'auto' ? browserLanguage() : lng);
  applyLanguage();
}

// t translates a key, with {{placeholders}} filled from vars.
export const t = (key, vars) => i18next.t(key, vars);

// applyLanguage translates static page text: elements with data-i18n get
// their content, and data-i18n-<attr> their attribute, from the catalog.
function applyLanguage() {
  document.documentElement.lang = i18next.resolvedLanguage ?? 'en';
  document.documentElement.dir = i18next.dir();
  for (const el of document.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.getAttributeNames()) {
      if (a.startsWith('data-i18n-')) el.setAttribute(a.slice('data-i18n-'.length), t(el.getAttribute(a)));
    }
  }
}
