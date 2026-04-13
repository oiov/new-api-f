'use client';

import { useState, useCallback } from 'react';
import { getSidebarCollapsed, setSidebarCollapsed } from '@/lib/utils';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return getSidebarCollapsed();
  });

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    setSidebarCollapsed(value);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      setSidebarCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, setCollapsed, toggleCollapsed };
}
