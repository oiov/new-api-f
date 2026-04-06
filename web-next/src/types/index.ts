// User types
export interface User {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: number;
  status: number;
  token: string;
  quota: number;
  used_quota: number;
  request_count: number;
  group: string;
  aff_code: string;
  inviter_id: number;
  setting: string;
  created_time: number;
  access_token?: string;
}

export interface UserSettings {
  language?: string;
  theme?: string;
  colorTheme?: string;
}

// Announcement type (stored in console_setting.announcements)
export interface Announcement {
  id: number;
  content: string;
  publishDate: string;
  type: 'default' | 'ongoing' | 'success' | 'warning' | 'error';
  extra?: string;
}

// Status/System types
export interface SystemStatus {
  version?: string;
  system_name?: string;
  logo?: string;
  footer?: string;
  top_up_link?: string;
  docs_link?: string;
  chat_links?: string;
  quota_per_unit?: number;
  display_in_currency?: boolean;
  quota_display_type?: 'USD' | 'CNY' | 'TOKENS' | 'CUSTOM';
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  usd_exchange_rate?: number;
  server_address?: string;
  price_enabled?: boolean;
  github_oauth?: boolean;
  github_client_id?: string;
  discord_oauth?: boolean;
  discord_client_id?: string;
  oidc_enabled?: boolean;
  oidc_client_id?: string;
  oidc_authorization_endpoint?: string;
  oidc_display_name?: string;
  linuxdo_oauth?: boolean;
  linuxdo_client_id?: string;
  google_oauth?: boolean;
  google_client_id?: string;
  wechat_login?: boolean;
  wechat_qrcode?: string;
  turnstile_check?: boolean;
  turnstile_site_key?: string;
  passkey_login?: boolean;
  register_enabled?: boolean;
  password_login_enabled?: boolean;
  password_register_enabled?: boolean;
  invite_register_enabled?: boolean;
  email_verification?: boolean;
  email_domain_restriction?: boolean;
  telegram_bot_enabled?: boolean;
  telegram_bot_name?: string;
  demo_site_enabled?: boolean;
  notice?: string;
  about?: string;
  home_page_content?: string;
  setup?: boolean;
  drawing_enabled?: boolean;
  task_enabled?: boolean;
  HeaderNavModules?: string;
  SidebarModulesAdmin?: string;
  SidebarModulesUser?: string;
  custom_oauth_providers?: CustomOAuthProvider[];
  payment_enabled?: boolean;
  recharge_link?: string;
  subscription_enabled?: boolean;
  announcements?: Announcement[];
  [key: string]: unknown;
}

export interface CustomOAuthProvider {
  slug: string;
  name: string;
  client_id: string;
  authorization_endpoint: string;
  scopes: string;
  icon?: string;
}

// Token types
export interface Token {
  id: number;
  user_id: number;
  key: string;
  status: number;
  name: string;
  created_time: number;
  accessed_time: number;
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
  used_quota: number;
  models: string;
  subnet: string;
  allow_ips: string;
  group: string;
}

// Channel types
export interface Channel {
  id: number;
  type: number;
  key: string;
  status: number;
  name: string;
  weight: number;
  created_time: number;
  tested_time: number;
  test_model: string;
  response_time: number;
  base_url: string;
  other: string;
  balance: number;
  balance_updated_time: number;
  models: string;
  group: string;
  used_quota: number;
  model_mapping: string;
  priority: number;
  tag: string;
  setting: string;
  param_override: string;
  model_headers: string;
  set_headers: string;
  auto_ban: number;
  auto_ban_count: number;
}

// Log types
export interface UsageLog {
  id: number;
  user_id: number;
  created_at: number;
  type: number;
  content: string;
  username: string;
  token_name: string;
  model_name: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  channel_id: number;
  channel_name: string;
  request_id: string;
  use_time: number;
  is_stream: boolean;
  multiplier: number;
  ip: string;
  user_quota_after: number;
  elapsed_time: number;
}

// Pagination
export interface PageInfo {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

// Model pricing
export interface ModelPrice {
  model_name: string;
  quota_type: number;
  model_ratio: number;
  completion_ratio: number;
  enable_groups: string[];
}

// Subscription
export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  quota: number;
  duration: number;
  status: number;
  created_time: number;
}

// Context state types
export interface UserState {
  user: User | undefined;
}

export interface StatusState {
  status: SystemStatus | undefined;
}

export type UserAction =
  | { type: 'login'; payload: User }
  | { type: 'logout' };

export type StatusAction =
  | { type: 'set'; payload: SystemStatus }
  | { type: 'unset' };

// Color themes
export type ColorTheme =
  | 'default'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'rose'
  | 'violet'
  | 'yellow';

// Navigation module config
export interface NavModuleConfig {
  visible?: boolean;
  requireAuth?: boolean;
}

export interface HeaderNavModules {
  pricing?: boolean | NavModuleConfig;
  package?: boolean | NavModuleConfig;
  status?: boolean | NavModuleConfig;
  docs?: boolean | NavModuleConfig;
  contact?: boolean | NavModuleConfig;
  [key: string]: boolean | NavModuleConfig | undefined;
}
