/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { normalizeLanguage, supportedLanguages } from './language';

const FALLBACK_LANGUAGE = 'zh-CN';
const localeLoaders = {
  en: () => import('./locales/en.json'),
  fr: () => import('./locales/fr.json'),
  'zh-CN': () => import('./locales/zh-CN.json'),
  'zh-TW': () => import('./locales/zh-TW.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
};

const loadedLanguages = new Set();

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return FALLBACK_LANGUAGE;
  }

  const cachedLanguage = normalizeLanguage(localStorage.getItem('i18nextLng'));
  if (supportedLanguages.includes(cachedLanguage)) {
    return cachedLanguage;
  }

  const browserLanguage = normalizeLanguage(navigator.language);
  if (supportedLanguages.includes(browserLanguage)) {
    return browserLanguage;
  }

  return FALLBACK_LANGUAGE;
}

async function loadLanguageResource(language) {
  const normalizedLanguage = normalizeLanguage(language) || FALLBACK_LANGUAGE;
  const targetLanguage = supportedLanguages.includes(normalizedLanguage)
    ? normalizedLanguage
    : FALLBACK_LANGUAGE;

  if (loadedLanguages.has(targetLanguage)) {
    return targetLanguage;
  }

  const loader = localeLoaders[targetLanguage] || localeLoaders[FALLBACK_LANGUAGE];
  const module = await loader();
  const resource = module.default;

  if (i18n.isInitialized) {
    i18n.addResourceBundle(targetLanguage, 'translation', resource, true, true);
  }

  loadedLanguages.add(targetLanguage);
  return targetLanguage;
}

async function createInitialResources() {
  const initialLanguage = getInitialLanguage();
  const resources = {};

  const fallbackModule = await localeLoaders[FALLBACK_LANGUAGE]();
  resources[FALLBACK_LANGUAGE] = fallbackModule.default;
  loadedLanguages.add(FALLBACK_LANGUAGE);

  if (initialLanguage !== FALLBACK_LANGUAGE) {
    const initialModule = await localeLoaders[initialLanguage]();
    resources[initialLanguage] = initialModule.default;
    loadedLanguages.add(initialLanguage);
  }

  return {
    initialLanguage,
    resources,
  };
}

export const initI18n = (async () => {
  const { initialLanguage, resources } = await createInitialResources();

  await i18n.use(LanguageDetector).use(initReactI18next).init({
    lng: initialLanguage,
    load: 'currentOnly',
    supportedLngs: supportedLanguages,
    resources,
    fallbackLng: FALLBACK_LANGUAGE,
    nsSeparator: false,
    interpolation: {
      escapeValue: false,
    },
  });

  const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
  i18n.changeLanguage = async (language, callback) => {
    const nextLanguage = await loadLanguageResource(language);
    return originalChangeLanguage(nextLanguage, callback);
  };

  return i18n;
})();

export default i18n;
