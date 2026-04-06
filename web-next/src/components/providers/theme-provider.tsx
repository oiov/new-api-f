'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { useEffect } from 'react';
import { applyStoredColorTheme } from '@/lib/utils';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyStoredColorTheme();
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}

export { useTheme } from 'next-themes';
