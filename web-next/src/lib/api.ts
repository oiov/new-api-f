import axios, { type AxiosInstance } from 'axios';
import { getUserIdFromLocalStorage } from './utils';
import { toast } from 'sonner';

// All requests use relative paths — the client never knows the backend origin.
// /api/*      → caught by App Router src/app/api/[[...path]]/route.ts (server proxy)
// /v1/* etc.  → caught by next.config.ts rewrites (server rewrite)
// Both run server-side, so no CORS and no backend URL leakage.
function getRequestBaseURL(_url: string): string {
  return '';
}

function showError(error: unknown): void {
  if (typeof window === 'undefined') return;
  let message = 'Unknown error';
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      message = String(data.message);
    } else if (error.message) {
      message = error.message;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }
  toast.error(message);
}

function patchAPIInstance(instance: AxiosInstance): void {
  const originalGet = instance.get.bind(instance);
  const inFlightGetRequests = new Map<string, Promise<unknown>>();

  const genKey = (url: string, config?: Record<string, unknown>): string => {
    const params = config?.params ? JSON.stringify(config.params) : '{}';
    return `${url}?${params}`;
  };

  instance.get = function <T = unknown>(
    url: string,
    config?: Record<string, unknown>,
  ) {
    if ((config as Record<string, unknown>)?.disableDuplicate) {
      return originalGet<T>(url, config as never);
    }

    const key = genKey(url, config);
    if (inFlightGetRequests.has(key)) {
      return inFlightGetRequests.get(key) as Promise<T>;
    }

    const reqPromise = originalGet<T>(url, config as never).finally(() => {
      inFlightGetRequests.delete(key);
    }) as Promise<T>;

    inFlightGetRequests.set(key, reqPromise as Promise<unknown>);
    return reqPromise;
  } as AxiosInstance['get'];
}

function createAPIClient(): AxiosInstance {
  const instance = axios.create({
    headers: {
      'Fish-X-Code-User': String(getUserIdFromLocalStorage() ?? ''),
      'Cache-Control': 'no-store',
    },
  });

  instance.interceptors.request.use((config) => {
    if (config.url) {
      const base = getRequestBaseURL(config.url);
      if (base) {
        config.baseURL = base;
      }
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (
        axios.isAxiosError(error) &&
        (error.config as unknown as Record<string, unknown>)?.skipErrorHandler
      ) {
        return Promise.reject(error);
      }
      showError(error);
      return Promise.reject(error);
    },
  );

  patchAPIInstance(instance);
  return instance;
}

export let API = createAPIClient();

export function updateAPI(): void {
  API = createAPIClient();
}

export function resolveRequestUrl(url: string): string {
  if (!url || typeof url !== 'string' || /^https?:\/\//i.test(url)) return url;
  const baseURL = getRequestBaseURL(url);
  if (!baseURL) return url;
  return `${baseURL}${url.startsWith('/') ? url : `/${url}`}`;
}

// OAuth state utilities
export async function getOAuthState(): Promise<string> {
  const affCode = localStorage.getItem('aff');
  let path = '/api/oauth/state';
  if (affCode && affCode.length > 0) {
    path += `?aff=${encodeURIComponent(affCode)}`;
  }
  const res = await API.get(path);
  const { success, message, data } = res.data as {
    success: boolean;
    message?: string;
    data: string;
  };
  if (success) return data;
  toast.error(message || 'Failed to get OAuth state');
  return '';
}

interface OAuthOptions {
  shouldLogout?: boolean;
  authIntent?: string;
}

async function prepareOAuthState(options: OAuthOptions = {}): Promise<string> {
  const { shouldLogout = false, authIntent } = options;
  if (shouldLogout) {
    try {
      await API.get('/api/user/logout', {
        skipErrorHandler: true,
      } as never);
    } catch {
      // ignore
    }
    localStorage.removeItem('user');
    updateAPI();
  }
  if (authIntent) {
    localStorage.setItem('oauth_auth_intent', authIntent);
  } else {
    localStorage.removeItem('oauth_auth_intent');
  }
  return await getOAuthState();
}

export async function onGitHubOAuthClicked(
  github_client_id: string,
  options: OAuthOptions = {},
): Promise<void> {
  const state = await prepareOAuthState(options);
  if (!state) return;
  window.location.assign(
    `https://github.com/login/oauth/authorize?client_id=${github_client_id}&state=${state}&scope=user:email`,
  );
}

export async function onDiscordOAuthClicked(
  client_id: string,
  options: OAuthOptions = {},
): Promise<void> {
  const state = await prepareOAuthState(options);
  if (!state) return;
  const redirect_uri = `${window.location.origin}/oauth/discord`;
  window.location.assign(
    `https://discord.com/oauth2/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=identify+openid&state=${state}`,
  );
}

export async function onLinuxDOOAuthClicked(
  client_id: string,
  options: OAuthOptions = {},
): Promise<void> {
  const state = await prepareOAuthState(options);
  if (!state) return;
  window.location.assign(
    `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${client_id}&state=${state}`,
  );
}

export async function onGoogleOAuthClicked(
  google_client_id: string,
  options: OAuthOptions = {},
): Promise<void> {
  const state = await prepareOAuthState(options);
  if (!state) return;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', google_client_id);
  url.searchParams.set(
    'redirect_uri',
    `${window.location.origin}/oauth/google`,
  );
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  window.location.assign(url.toString());
}

export async function onOIDCClicked(
  auth_url: string,
  client_id: string,
  openInNewTab = false,
  options: OAuthOptions = {},
): Promise<void> {
  const state = await prepareOAuthState(options);
  if (!state) return;
  const url = new URL(auth_url);
  url.searchParams.set('client_id', client_id);
  url.searchParams.set('redirect_uri', `${window.location.origin}/oauth/oidc`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  if (openInNewTab) {
    window.open(url.toString(), '_blank');
  } else {
    window.location.assign(url.toString());
  }
}

// Channel models
let channelModels: Record<string, string[]> | undefined;

export async function loadChannelModels(): Promise<void> {
  const res = await API.get('/api/models');
  const { success, data } = res.data as {
    success: boolean;
    data: Record<string, string[]>;
  };
  if (!success) return;
  channelModels = data;
  localStorage.setItem('channel_models', JSON.stringify(data));
}

export function getChannelModels(type: number | string): string[] {
  const key = String(type);
  if (channelModels !== undefined && key in channelModels) {
    return channelModels[key] || [];
  }
  const stored = localStorage.getItem('channel_models');
  if (!stored) return [];
  channelModels = JSON.parse(stored) as Record<string, string[]>;
  return channelModels[key] || [];
}

export function normalizeInviteCode(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const base = raw.split(/[?#&]/, 1)[0].trim();
  const matched = base.match(/^[A-Za-z0-9]+/);
  return matched ? matched[0] : '';
}
