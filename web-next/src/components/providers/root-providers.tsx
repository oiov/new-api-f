'use client';

import { ThemeProvider } from './theme-provider';
import { I18nProvider } from './i18n-provider';
import { UserProvider } from '@/context/user-context';
import { StatusProvider } from '@/context/status-context';
import { Toaster } from '@/components/ui/sonner';

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <StatusProvider>
          <UserProvider>
            {children}
            <Toaster richColors position="top-right" closeButton duration={5000} />
          </UserProvider>
        </StatusProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
