import enLocale from './locales/en.json';
import frLocale from './locales/fr.json';
import jaLocale from './locales/ja.json';
import ruLocale from './locales/ru.json';
import viLocale from './locales/vi.json';
import zhCNLocale from './locales/zh-CN.json';
import zhTWLocale from './locales/zh-TW.json';

export const localeModules = {
  en: enLocale,
  fr: frLocale,
  'zh-CN': zhCNLocale,
  'zh-TW': zhTWLocale,
  ru: ruLocale,
  ja: jaLocale,
  vi: viLocale,
};

export const localeTranslations = Object.fromEntries(
  Object.entries(localeModules).map(([language, module]) => [
    language,
    module?.translation || module,
  ]),
);
