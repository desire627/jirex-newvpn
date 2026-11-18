import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.js';
import ru from './ru.js';
import { BRAND } from '../brand.js';

const DICTS = { en, ru };
export const LANGS = [
  { id: 'en', short: 'EN', label: 'English' },
  { id: 'ru', short: 'RU', label: 'Русский' },
];

// Saved choice first; otherwise Russian for browsers set to Russian, English for everyone else.
function detectLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && DICTS[saved]) return saved;
  } catch {}
  const browser = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  return browser.startsWith('ru') ? 'ru' : 'en';
}

let current = detectLang();
export const getLang = () => current;
export const getLocale = () => (current === 'ru' ? 'ru-RU' : 'en-GB');

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

function fill(text, params) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
}

// t('dash.hi', { name }) → string. Plural entries pick a form using params.count.
export function translate(key, params = {}, lang = current) {
  let value = lookup(DICTS[lang], key) ?? lookup(en, key);
  if (value == null) return key;
  if (typeof value === 'object' && !Array.isArray(value) && 'other' in value) {
    const form = new Intl.PluralRules(lang).select(Number(params.count) || 0);
    value = value[form] ?? value.other;
  }
  return typeof value === 'string' ? fill(value, params) : value;
}

// Turns "**bold**" in a translated string into <strong> elements.
export function rich(text) {
  return String(text)
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${BRAND.name} · ${translate('common.pageTitle', {}, lang)}`;
  }, [lang]);

  const setLang = useCallback((next) => {
    current = next;
    try {
      localStorage.setItem('lang', next);
    } catch {}
    setLangState(next);
  }, []);

  const value = useMemo(() => {
    const t = (key, params) => translate(key, params, lang);
    return { lang, setLang, t, tr: (key, params) => rich(t(key, params)) };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('common.language')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          className={lang === l.id ? 'active' : ''}
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          title={l.label}
          lang={l.id}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
