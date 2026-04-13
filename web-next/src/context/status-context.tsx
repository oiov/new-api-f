'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
} from 'react';
import type { SystemStatus, StatusState, StatusAction } from '@/types';
import { API } from '@/lib/api';
import {
  readStatusData,
  setStatusData,
  getStatusCacheAge,
  getSystemName,
  getLogo,
} from '@/lib/utils';
import { toast } from 'sonner';

function reducer(state: StatusState, action: StatusAction): StatusState {
  switch (action.type) {
    case 'set':
      return { ...state, status: action.payload };
    case 'unset':
      return { ...state, status: undefined };
    default:
      return state;
  }
}

const initialState: StatusState = { status: undefined };

interface StatusContextValue {
  state: StatusState;
  dispatch: React.Dispatch<StatusAction>;
  reload: () => Promise<void>;
}

export const StatusContext = createContext<StatusContextValue>({
  state: initialState,
  dispatch: () => null,
  reload: async () => {},
});

// Legacy tuple export for compatibility
export const StatusContextLegacy = createContext<
  [StatusState, React.Dispatch<StatusAction>]
>([initialState, () => null]);

const STATUS_CACHE_MAX_AGE = 5 * 60 * 1000;

function applyBranding(status?: SystemStatus): void {
  if (typeof window === 'undefined') return;
  const systemName = getSystemName(status);
  if (systemName) {
    document.title = systemName;
  }
  const logo = getLogo(status);
  if (logo) {
    const linkElement = document.querySelector<HTMLLinkElement>(
      "link[rel~='icon']",
    );
    if (linkElement) {
      linkElement.href = logo;
    }
  }
}

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadStatus = useCallback(async () => {
    try {
      const res = await API.get('/api/status');
      const { success, data } = res.data as {
        success: boolean;
        data: SystemStatus;
      };
      if (success) {
        dispatch({ type: 'set', payload: data });
        setStatusData(data);
        applyBranding(data);
      } else {
        toast.error('Unable to connect to server');
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    // Load from cache first
    const cachedStatus = readStatusData();
    if (cachedStatus) {
      dispatch({ type: 'set', payload: cachedStatus });
      applyBranding(cachedStatus);
    } else {
      applyBranding();
    }

    // Refresh from server
    const cacheAge = getStatusCacheAge();
    const refreshDelay =
      cachedStatus && cacheAge <= STATUS_CACHE_MAX_AGE ? 300 : 0;
    const refreshTask = window.setTimeout(() => {
      loadStatus().catch(console.error);
    }, refreshDelay);

    return () => {
      window.clearTimeout(refreshTask);
    };
  }, [loadStatus]);

  return (
    <StatusContext.Provider value={{ state, dispatch, reload: loadStatus }}>
      <StatusContextLegacy.Provider value={[state, dispatch]}>
        {children}
      </StatusContextLegacy.Provider>
    </StatusContext.Provider>
  );
}

export function useStatus() {
  return useContext(StatusContext);
}

export function useStatusLegacy() {
  return useContext(StatusContextLegacy);
}

export function useSystemStatus(): SystemStatus | undefined {
  const { state } = useStatus();
  return state.status;
}

// Parse HeaderNavModules config
export function parseHeaderNavModules(config?: string) {
  if (!config) return {};
  try {
    return JSON.parse(config) as Record<
      string,
      boolean | { visible?: boolean; requireAuth?: boolean }
    >;
  } catch {
    return {};
  }
}

export function isModuleRequireAuth(
  moduleName: string,
  config?: string,
): boolean {
  const modules = parseHeaderNavModules(config);
  const moduleConfig = modules[moduleName];
  if (typeof moduleConfig === 'boolean') return false;
  return moduleConfig?.requireAuth === true;
}
