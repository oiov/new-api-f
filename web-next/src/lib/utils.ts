import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { User, SystemStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// User utilities
export function getUserIdFromLocalStorage(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const user = localStorage.getItem('user');
    if (user) {
      const data = JSON.parse(user) as User;
      return data.id;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function getUserFromLocalStorage(): User | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const user = localStorage.getItem('user');
    if (user) {
      return JSON.parse(user) as User;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function isAdmin(user?: User): boolean {
  if (!user) {
    user = getUserFromLocalStorage();
  }
  return (user?.role ?? 0) >= 10;
}

export function isRoot(user?: User): boolean {
  if (!user) {
    user = getUserFromLocalStorage();
  }
  return (user?.role ?? 0) >= 100;
}

export function isLoggedIn(): boolean {
  return !!getUserFromLocalStorage();
}

// Quota utilities

/** 获取当前展示货币符号 */
export function getCurrencySymbol(status?: SystemStatus): string {
  switch (status?.quota_display_type) {
    case 'CNY': return '¥';
    case 'USD': return '$';
    case 'CUSTOM': return status.custom_currency_symbol || '¤';
    default:
      // 兼容旧字段：display_in_currency=true 时按 USD 处理
      return (status?.display_in_currency) ? '$' : '';
  }
}

/** quota 原始值 → 展示值（已乘汇率） */
function quotaToDisplay(quota: number, status?: SystemStatus): number {
  const quotaPerUnit = status?.quota_per_unit ?? 500000;
  const usd = quota / quotaPerUnit;
  switch (status?.quota_display_type) {
    case 'CNY': return usd * (status.usd_exchange_rate ?? 1);
    case 'CUSTOM': return usd * (status.custom_currency_exchange_rate ?? 1);
    default: return usd; // USD 或 兼容模式
  }
}

/** 将原始额度格式化为紧凑 token 字符串，例：500000→500K，1234567→1.23M */
export function formatTokensCompact(quota: number): string {
  if (quota >= 1_000_000_000) return `${(quota / 1_000_000_000).toFixed(2)}B`;
  if (quota >= 1_000_000) return `${(quota / 1_000_000).toFixed(2)}M`;
  if (quota >= 1_000) return `${(quota / 1_000).toFixed(1)}K`;
  return quota.toString();
}

export function formatQuota(
  quota: number,
  status?: SystemStatus,
  digits?: number,
): string {
  const type = status?.quota_display_type;
  // TOKENS 模式：直接显示原始额度数字
  if (type === 'TOKENS' || (!type && !status?.display_in_currency)) {
    return quota.toString();
  }
  const symbol = getCurrencySymbol(status);
  const val = quotaToDisplay(quota, status);
  if (val === 0) return `${symbol}0`;
  // 自动决定小数位：大数少位、小数多位
  let d: number;
  if (digits !== undefined) {
    d = digits;
  } else if (val >= 1000) {
    d = 2;
  } else if (val >= 1) {
    d = 4;
  } else if (val >= 0.0001) {
    d = 6;
  } else {
    return `< ${symbol}0.0001`;
  }
  // 去掉末尾多余零
  const s = val.toFixed(d).replace(/\.?0+$/, '');
  return `${symbol}${s}`;
}

export function getSystemName(status?: SystemStatus): string {
  return status?.system_name || 'New API';
}

export function getLogo(status?: SystemStatus): string {
  return status?.logo || '/logo.png';
}

// Clipboard
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  }
}

// Time formatting
export function formatTimestamp(
  timestamp: number,
  format = 'YYYY-MM-DD HH:mm:ss',
): string {
  if (!timestamp || timestamp <= 0) return 'Never';
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

export function renderQuota(quota: number, digits = 2): string {
  if (quota >= 1000000) {
    return `${(quota / 1000000).toFixed(digits)}M`;
  }
  if (quota >= 1000) {
    return `${(quota / 1000).toFixed(digits)}K`;
  }
  return String(quota);
}

// Status cache utilities
const STATUS_CACHE_KEY = 'status_data';
const STATUS_CACHE_TIME_KEY = 'status_data_time';

export function readStatusData(): SystemStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(STATUS_CACHE_KEY);
    if (data) return JSON.parse(data) as SystemStatus;
  } catch {
    // ignore
  }
  return null;
}

export function setStatusData(data: SystemStatus): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(STATUS_CACHE_TIME_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function getStatusCacheAge(): number {
  if (typeof window === 'undefined') return Infinity;
  try {
    const time = localStorage.getItem(STATUS_CACHE_TIME_KEY);
    if (time) return Date.now() - Number(time);
  } catch {
    // ignore
  }
  return Infinity;
}

// Color theme utilities
const COLOR_THEME_KEY = 'color-theme';
export type ColorTheme =
  | 'default'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'rose'
  | 'violet'
  | 'yellow';

export function getStoredColorTheme(): ColorTheme {
  if (typeof window === 'undefined') return 'default';
  return (localStorage.getItem(COLOR_THEME_KEY) as ColorTheme) || 'default';
}

export function setStoredColorTheme(theme: ColorTheme): void {
  if (typeof window === 'undefined') return;
  if (theme === 'default') {
    localStorage.removeItem(COLOR_THEME_KEY);
    document.documentElement.removeAttribute('data-color-theme');
  } else {
    localStorage.setItem(COLOR_THEME_KEY, theme);
    document.documentElement.setAttribute('data-color-theme', theme);
  }
}

export function applyStoredColorTheme(): void {
  const theme = getStoredColorTheme();
  if (theme && theme !== 'default') {
    document.documentElement.setAttribute('data-color-theme', theme);
  }
}

// Sidebar collapse
const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

export function getSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

// Invite code normalization
export function normalizeInviteCode(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const base = raw.split(/[?#&]/, 1)[0].trim();
  const matched = base.match(/^[A-Za-z0-9]+/);
  return matched ? matched[0] : '';
}

// Truncate text
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// Format number with commas
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

// Generate random string
export function randomString(length = 16): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join('');
}
