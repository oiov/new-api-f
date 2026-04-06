'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsLoggedIn, useIsAdmin, useIsRoot } from '@/context/user-context';
import { getUserFromLocalStorage } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireRoot?: boolean;
  redirectTo?: string;
}

export function AuthGuard({
  children,
  requireAdmin = false,
  requireRoot = false,
  redirectTo = '/login',
}: AuthGuardProps) {
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const isAdmin = useIsAdmin();
  const isRoot = useIsRoot();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check localStorage directly for immediate auth check
    const user = getUserFromLocalStorage();
    if (!user) {
      router.replace(redirectTo);
      return;
    }

    const userRole = user.role ?? 0;
    if (requireRoot && userRole < 100) {
      router.replace('/forbidden');
      return;
    }
    if (requireAdmin && userRole < 10) {
      router.replace('/forbidden');
      return;
    }

    setChecking(false);
  }, [router, requireAdmin, requireRoot, redirectTo]);

  if (checking) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}

export function AuthRedirect({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const user = getUserFromLocalStorage();
    if (user) {
      router.replace('/console');
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) return null;
  return <>{children}</>;
}
