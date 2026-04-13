'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import vi from './locales/vi.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '中文(简体)', nativeName: '中文(简体)' },
  { code: 'zh-TW', name: '中文(繁體)', nativeName: '中文(繁體)' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'Français', nativeName: 'Français' },
  { code: 'ru', name: 'Русский', nativeName: 'Русский' },
  { code: 'ja', name: '日本語', nativeName: '日本語' },
  { code: 'vi', name: 'Tiếng Việt', nativeName: 'Tiếng Việt' },
];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

// JSON 文件本身已包含 { "translation": { ... } } 结构，直接使用，不需要再套一层
const resources = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  fr,
  ru,
  ja,
  vi,
};

/** 从 localStorage / navigator 读取用户语言，找不到则返回 zh-CN */
function detectLanguage(): string {
  if (typeof window === 'undefined') return 'zh-CN';

  // 1. 优先读取用户手动选择的语言
  const saved = localStorage.getItem('i18nextLng');
  if (saved && SUPPORTED_CODES.includes(saved)) return saved;

  // 2. 浏览器语言自动匹配
  const browser = navigator.language || '';
  const normalized = normalizeLanguage(browser);
  if (normalized && SUPPORTED_CODES.includes(normalized)) return normalized;

  return 'zh-CN';
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: detectLanguage(),
    fallbackLng: 'zh-CN',
    supportedLngs: SUPPORTED_CODES,
    interpolation: { escapeValue: false },
    // 关闭内置 LanguageDetector，改由 detectLanguage() 在初始化时直接确定
    detection: undefined,
  });
}

export default i18n;

export function normalizeLanguage(lang: string | null | undefined): string {
  if (!lang) return '';
  const lowerLang = lang.toLowerCase();
  if (lowerLang.startsWith('zh-tw') || lowerLang === 'zh-hant') return 'zh-TW';
  if (lowerLang.startsWith('zh')) return 'zh-CN';
  if (lowerLang.startsWith('fr')) return 'fr';
  if (lowerLang.startsWith('ru')) return 'ru';
  if (lowerLang.startsWith('ja')) return 'ja';
  if (lowerLang.startsWith('vi')) return 'vi';
  if (lowerLang.startsWith('en')) return 'en';
  return lang;
}
