'use client';

import { useEffect } from 'react';
import { useUser } from '@/context/user-context';
import { useStatus } from '@/context/status-context';
import { getUserFromLocalStorage } from '@/lib/utils';
import { API, updateAPI } from '@/lib/api';
import { normalizeLanguage } from '@/i18n/config';
import { useTranslation } from 'react-i18next';

/**
 * Hook to load user and status data on app startup
 */
export function useAppLoader() {
  const { dispatch: userDispatch, state: userState } = useUser();
  const { i18n } = useTranslation();

  useEffect(() => {
    // Load user from localStorage
    const user = getUserFromLocalStorage();
    if (user) {
      userDispatch({ type: 'login', payload: user });
    }

    // Sync language
    let preferredLang: string | undefined;
    if (user?.setting) {
      try {
        const settings = JSON.parse(user.setting) as { language?: string };
        preferredLang = normalizeLanguage(settings.language);
      } catch {
        // ignore
      }
    }

    if (!preferredLang) {
      const savedLang = localStorage.getItem('i18nextLng');
      if (savedLang) {
        preferredLang = normalizeLanguage(savedLang);
      }
    }

    if (
      preferredLang &&
      typeof i18n?.changeLanguage === 'function' &&
      preferredLang !== normalizeLanguage(i18n.language)
    ) {
      i18n.changeLanguage(preferredLang);
      localStorage.setItem('i18nextLng', preferredLang);
    }
  }, [userDispatch, i18n]);

  return { userState };
}

export async function loginUser(
  username: string,
  password: string,
  captcha?: string,
): Promise<{ success: boolean; message?: string; user?: unknown }> {
  const res = await API.post('/api/user/login', {
    username,
    password,
    recaptcha_token: captcha,
  });
  const data = res.data as { success: boolean; message?: string; data: unknown };
  return {
    success: data.success,
    message: data.message,
    user: data.data,
  };
}

export async function logoutUser(): Promise<void> {
  try {
    await API.get('/api/user/logout', { skipErrorHandler: true } as never);
  } catch {
    // ignore
  }
  localStorage.removeItem('user');
  updateAPI();
}
