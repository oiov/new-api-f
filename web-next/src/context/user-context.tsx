'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { User, UserState, UserAction } from '@/types';
import { normalizeLanguage } from '@/i18n/config';

function reducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'login':
      return { ...state, user: action.payload };
    case 'logout':
      return { ...state, user: undefined };
    default:
      return state;
  }
}

const initialState: UserState = { user: undefined };

interface UserContextValue {
  state: UserState;
  dispatch: React.Dispatch<UserAction>;
}

export const UserContext = createContext<UserContextValue>({
  state: initialState,
  dispatch: () => null,
});

// Legacy tuple export for compatibility
export const UserContextLegacy = createContext<
  [UserState, React.Dispatch<UserAction>]
>([initialState, () => null]);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { i18n } = useTranslation();

  // Sync language preference when user data is loaded
  useEffect(() => {
    if (state.user?.setting) {
      try {
        const settings = JSON.parse(state.user.setting) as {
          language?: string;
        };
        const normalizedLanguage = normalizeLanguage(settings.language);
        if (
          normalizedLanguage &&
          typeof i18n?.changeLanguage === 'function' &&
          normalizedLanguage !== normalizeLanguage(i18n.language)
        ) {
          i18n.changeLanguage(normalizedLanguage);
        }
        if (normalizedLanguage) {
          localStorage.setItem('i18nextLng', normalizedLanguage);
        }
      } catch {
        // ignore
      }
    }
  }, [state.user?.setting, i18n]);

  return (
    <UserContext.Provider value={{ state, dispatch }}>
      <UserContextLegacy.Provider value={[state, dispatch]}>
        {children}
      </UserContextLegacy.Provider>
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

export function useUserLegacy() {
  return useContext(UserContextLegacy);
}

// Check if user is admin
export function useIsAdmin(): boolean {
  const { state } = useUser();
  return (state.user?.role ?? 0) >= 10;
}

export function useIsRoot(): boolean {
  const { state } = useUser();
  return (state.user?.role ?? 0) >= 100;
}

export function useIsLoggedIn(): boolean {
  const { state } = useUser();
  return !!state.user;
}

// Persist user to localStorage
export function persistUser(user: User): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearUser(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user');
  }
}
