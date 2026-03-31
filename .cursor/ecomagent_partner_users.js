#!/usr/bin/env node

/**
 * EcomAgent Partner Users 汇总脚本
 *
 * 功能：
 * 1) 拉取 /api/partner/users 列表
 * 2) 逐个拉取 /api/partner/users/:id 详情
 * 3) 输出 apiKey、今日/昨日统计、额度与剩余额度汇总
 *
 * 用法：
 *   ECOMAGENT_BEARER="<token>" node ecomagent_partner_users.js
 *   ECOMAGENT_BEARER="<token>" node ecomagent_partner_users.js --id 21
 *   ECOMAGENT_BEARER="<token>" node ecomagent_partner_users.js --show-key
 *   ECOMAGENT_REFRESH_TOKEN="<refresh_token>" node ecomagent_partner_users.js
 *
 * 可选参数：
 *   --base-url <url>      默认 https://ecomagent.in
 *   --id <number>         仅查询单个用户 ID
 *   --concurrency <num>   并发数，默认 5
 *   --raw                 输出原始明细 JSON
 *   --show-key            输出完整 apiKey（默认脱敏）
 *   --token <token>       直接传 access token（不推荐，优先使用环境变量）
 *   --refresh-token <token>  传 refresh token（可自动换 access token）
 *   --push                开启 PushPlus 推送（默认开启）
 *   --no-push             关闭 PushPlus 推送
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_BASE_URL = 'https://ecomagent.in';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_NEWAPI_BASE_URL = process.env.NEWAPI_BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_PUSHPLUS_TOKEN =
  process.env.ECOMAGENT_PUSHPLUS_TOKEN || process.env.PUSHPLUS_TOKEN || 'd9718b2eff8041d2b48ef8b81d8d7ab4';

// 与 ecomagent_all.js 保持一致：用于 refresh_token 换 access_token
const BUILTIN_SUPABASE_AUTH_URL = 'https://zwggawnojtjiaklycfhc.supabase.co/auth/v1';
const BUILTIN_DEFAULT_ACCESS_TOKEN = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImEzYTFkODE5LTYyYWQtNGRmMy04ZjA0LTM4ZmVmY2ZlYzQ5ZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3p3Z2dhd25vanRqaWFrbHljZmhjLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJiZTM5YWYwNy03MmQyLTQ3MDgtYWU3NC02YmJkMGM0ZjM2Y2QiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc0NjY4NjcyLCJpYXQiOjE3NzQ2NjUwNzIsImVtYWlsIjoibGludXhjbG91ZGxhYkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0psRzVnd3B2ejJWeWZRSWwtMm5BRi1EZzV0dms1SS14NG9OX1J6SF9KUXNaZjBZaTQ9czk2LWMiLCJlbWFpbCI6ImxpbnV4Y2xvdWRsYWJAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6ImxpbnV4Y2xvdWRsYWIiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoibGludXhjbG91ZGxhYiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0psRzVnd3B2ejJWeWZRSWwtMm5BRi1EZzV0dms1SS14NG9OX1J6SF9KUXNaZjBZaTQ9czk2LWMiLCJwcm92aWRlcl9pZCI6IjEwOTY4OTI5ODQ5NDA1NzYyODIxOSIsInN1YiI6IjEwOTY4OTI5ODQ5NDA1NzYyODIxOSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im9hdXRoIiwidGltZXN0YW1wIjoxNzc0NDc5NTA4fV0sInNlc3Npb25faWQiOiI4M2RhZGM4ZC03ZmM0LTQ1YjYtYTc5Yy0xYWMxOTE3OGQwMGQiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.lqZjn_VQG4YSRSeSm5YnTXJwaG9sFz_HlwdLFsdsiPI5jMQBx71LFzkxcKaXQFP5UH8mnA3qK1enmZH6OjuaKQ';
const BUILTIN_DEFAULT_REFRESH_TOKEN = '2yczqonkcwpn';

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    id: null,
    concurrency: 5,
    raw: false,
    showKey: false,
    push: true,
    pushToken: DEFAULT_PUSHPLUS_TOKEN,
    token: process.env.ECOMAGENT_BEARER || 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImEzYTFkODE5LTYyYWQtNGRmMy04ZjA0LTM4ZmVmY2ZlYzQ5ZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3p3Z2dhd25vanRqaWFrbHljZmhjLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJiZTM5YWYwNy03MmQyLTQ3MDgtYWU3NC02YmJkMGM0ZjM2Y2QiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc0NjY4NjcyLCJpYXQiOjE3NzQ2NjUwNzIsImVtYWlsIjoibGludXhjbG91ZGxhYkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6Imdvb2dsZSIsInByb3ZpZGVycyI6WyJnb29nbGUiXX0sInVzZXJfbWV0YWRhdGEiOnsiYXZhdGFyX3VybCI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0psRzVnd3B2ejJWeWZRSWwtMm5BRi1EZzV0dms1SS14NG9OX1J6SF9KUXNaZjBZaTQ9czk2LWMiLCJlbWFpbCI6ImxpbnV4Y2xvdWRsYWJAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6ImxpbnV4Y2xvdWRsYWIiLCJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYW1lIjoibGludXhjbG91ZGxhYiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0psRzVnd3B2ejJWeWZRSWwtMm5BRi1EZzV0dms1SS14NG9OX1J6SF9KUXNaZjBZaTQ9czk2LWMiLCJwcm92aWRlcl9pZCI6IjEwOTY4OTI5ODQ5NDA1NzYyODIxOSIsInN1YiI6IjEwOTY4OTI5ODQ5NDA1NzYyODIxOSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im9hdXRoIiwidGltZXN0YW1wIjoxNzc0NDc5NTA4fV0sInNlc3Npb25faWQiOiI4M2RhZGM4ZC03ZmM0LTQ1YjYtYTc5Yy0xYWMxOTE3OGQwMGQiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.lqZjn_VQG4YSRSeSm5YnTXJwaG9sFz_HlwdLFsdsiPI5jMQBx71LFzkxcKaXQFP5UH8mnA3qK1enmZH6OjuaKQ',
    tokenSource: process.env.ECOMAGENT_BEARER ? 'env' : 'builtin',
    refreshToken: process.env.ECOMAGENT_REFRESH_TOKEN || BUILTIN_DEFAULT_REFRESH_TOKEN,
    refreshTokenSource: process.env.ECOMAGENT_REFRESH_TOKEN ? 'env' : 'builtin',
    authJson: process.env.ECOMAGENT_AUTH_JSON || '',
    output: '',
    outputDir: process.cwd(),
    exportJson: false,
    buildChannelTasks: true,
    applyChannels: true,
    dryRun: false,
    channelFile: '',
    newApiBaseUrl: process.env.NEWAPI_BASE_URL || DEFAULT_NEWAPI_BASE_URL,
    newApiToken: process.env.NEWAPI_BEARER || process.env.NEW_API_BEARER || '',
    channelType: Number(process.env.NEWAPI_CHANNEL_TYPE || 1),
    channelModels: process.env.NEWAPI_CHANNEL_MODELS || '',
    channelNamePrefix: process.env.NEWAPI_CHANNEL_NAME_PREFIX || 'EcomAgent Partner',
    sharedGroup: process.env.NEWAPI_SHARED_GROUP || 'ecomagent_partner',
    groupSeparator: process.env.NEWAPI_GROUP_SEPARATOR || ',',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base-url' && argv[i + 1]) {
      args.baseUrl = String(argv[++i]).replace(/\/$/, '');
      continue;
    }
    if (arg === '--id' && argv[i + 1]) {
      args.id = Number(argv[++i]);
      continue;
    }
    if (arg === '--concurrency' && argv[i + 1]) {
      args.concurrency = Math.max(1, Number(argv[++i]) || 1);
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      args.output = String(argv[++i]);
      args.exportJson = true;
      continue;
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      args.outputDir = String(argv[++i]);
      continue;
    }
    if (arg === '--export-json') {
      args.exportJson = true;
      continue;
    }
    if (arg === '--build-channel-tasks') {
      args.buildChannelTasks = true;
      continue;
    }
    if (arg === '--apply-channels') {
      args.applyChannels = true;
      continue;
    }
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--no-dry-run') {
      args.dryRun = false;
      continue;
    }
    if (arg === '--channel-file' && argv[i + 1]) {
      args.channelFile = String(argv[++i]);
      continue;
    }
    if (arg === '--newapi-base-url' && argv[i + 1]) {
      args.newApiBaseUrl = String(argv[++i]).replace(/\/$/, '');
      continue;
    }
    if (arg === '--newapi-token' && argv[i + 1]) {
      args.newApiToken = String(argv[++i]);
      continue;
    }
    if (arg === '--channel-type' && argv[i + 1]) {
      args.channelType = Number(argv[++i]);
      continue;
    }
    if (arg === '--channel-models' && argv[i + 1]) {
      args.channelModels = String(argv[++i]);
      continue;
    }
    if (arg === '--channel-name-prefix' && argv[i + 1]) {
      args.channelNamePrefix = String(argv[++i]);
      continue;
    }
    if (arg === '--shared-group' && argv[i + 1]) {
      args.sharedGroup = String(argv[++i]);
      continue;
    }
    if (arg === '--group-separator' && argv[i + 1]) {
      args.groupSeparator = String(argv[++i]);
      continue;
    }
    if (arg === '--push') {
      args.push = true;
      continue;
    }
    if (arg === '--no-push') {
      args.push = false;
      continue;
    }
    if (arg === '--show-key') {
      args.showKey = true;
      continue;
    }
    if (arg === '--token' && argv[i + 1]) {
      args.token = String(argv[++i]);
      continue;
    }
    if (arg === '--auth-json' && argv[i + 1]) {
      args.authJson = String(argv[++i]);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    }
  }

  if (!args.token && !args.refreshToken) {
    throw new Error('缺少凭证。请设置 ECOMAGENT_BEARER 或 ECOMAGENT_REFRESH_TOKEN（或传 --token/--refresh-token）');
  }
  if (args.id !== null && (!Number.isInteger(args.id) || args.id <= 0)) {
    throw new Error('--id 必须是正整数');
  }

  return args;
}

function printUsageAndExit(code = 1) {
  console.log(`用法:
  ECOMAGENT_BEARER="<access_token>" node ecomagent_partner_users.js [--id 21] [--show-key] [--raw]
  ECOMAGENT_REFRESH_TOKEN="<refresh_token>" node ecomagent_partner_users.js [--id 21]

参数:
  --base-url <url>         默认 https://ecomagent.in
  --id <number>            仅查询单个用户
  --concurrency <num>      并发数，默认 5
  --raw                    输出原始 JSON
  --show-key               显示完整 apiKey
  --output <file>          导出标准化 JSON 到指定文件
  --output-dir <dir>       导出目录（未指定 --output 时生效）
  --export-json            导出标准化 JSON（自动生成文件名）
  --build-channel-tasks    根据导出数据生成 new-api 渠道任务
  --channel-file <file>    指定渠道任务文件（不指定时自动生成）
  --apply-channels         直接调用 new-api /api/channel/ 批量创建
  --dry-run                仅生成任务不提交（默认）
  --no-dry-run             关闭 dry-run，允许提交
  --newapi-base-url <url>  new-api 地址，默认 http://127.0.0.1:3000
  --newapi-token <token>   new-api 管理令牌
  --channel-type <num>     渠道 type，默认 1
  --channel-models <csv>   渠道模型列表（逗号分隔）
  --channel-name-prefix <name> 渠道名称前缀
  --shared-group <group>   组合分组中的共享组名
  --group-separator <sep>  分组分隔符，默认逗号
  --token <token>          直接传 access token（不推荐）
  --refresh-token <token>  直接传 refresh token
  --auth-json <path|json>  从登录返回JSON读取 access_token/refresh_token
  --push                   开启 PushPlus 推送（默认开启）
  --no-push                关闭 PushPlus 推送
`);
  process.exit(code);
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: '*/*',
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message = json?.error || json?.message || `HTTP ${res.status}`;
      throw new Error(`${message} (${url})`);
    }

    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`请求超时 (${REQUEST_TIMEOUT_MS}ms): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickAuthTokensFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return { accessToken: '', refreshToken: '' };

  const accessToken = normalizeToken(payload.access_token || payload.accessToken || payload.token || '');
  const refreshToken = String(payload.refresh_token || payload.refreshToken || '').trim();

  const user = payload.user && typeof payload.user === 'object' ? payload.user : null;
  const session = payload.session && typeof payload.session === 'object' ? payload.session : null;
  const nestedCandidates = [user, session].filter(Boolean);

  for (const node of nestedCandidates) {
    if (!accessToken) {
      const nestedAccess = normalizeToken(node.access_token || node.accessToken || node.token || '');
      if (nestedAccess) {
        return {
          accessToken: nestedAccess,
          refreshToken: refreshToken || String(node.refresh_token || node.refreshToken || '').trim(),
        };
      }
    }
  }

  return {
    accessToken,
    refreshToken,
  };
}

async function hydrateAuthFromJsonInput(args) {
  if (!args.authJson) return;

  const input = String(args.authJson).trim();
  if (!input) return;

  let payload = tryParseJson(input);
  if (!payload) {
    const maybePath = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
    try {
      const content = await fs.readFile(maybePath, 'utf8');
      payload = tryParseJson(content);
      if (!payload) {
        throw new Error('JSON 文件内容不是合法 JSON');
      }
    } catch (err) {
      throw new Error(`读取 --auth-json 失败: ${err?.message || err}`);
    }
  }

  const { accessToken, refreshToken } = pickAuthTokensFromPayload(payload);
  if (accessToken) {
    args.token = accessToken;
    args.tokenSource = 'auth-json';
  }
  if (refreshToken) {
    args.refreshToken = refreshToken;
    args.refreshTokenSource = 'auth-json';
  }
}

async function requestSupabaseAccessTokenByRefresh(refreshToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BUILTIN_SUPABASE_AUTH_URL}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        apikey: BUILTIN_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message = json?.error_description || json?.error || json?.message || `HTTP ${res.status}`;
      throw new Error(`refresh_token 换 access_token 失败: ${message}`);
    }

    if (!json?.access_token) {
      throw new Error('refresh_token 换 access_token 失败: 响应缺少 access_token');
    }

    return json.access_token;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`刷新 access_token 超时 (${REQUEST_TIMEOUT_MS}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeToken(token) {
  if (!token) return '';
  return String(token).replace(/^Bearer\s+/i, '').trim();
}

async function resolveAccessToken(args) {
  await hydrateAuthFromJsonInput(args);
  if (args.tokenSource !== 'auth-json' && args.token && args.tokenSource === 'builtin' && args.refreshToken) {
    const refreshed = await requestSupabaseAccessTokenByRefresh(args.refreshToken);
    return normalizeToken(refreshed);
  }
  if (args.token) return normalizeToken(args.token);
  const refreshed = await requestSupabaseAccessTokenByRefresh(args.refreshToken);
  return normalizeToken(refreshed);
}

function maskKey(key, showKey) {
  if (!key) return '-';
  if (showKey) return key;
  if (key.length <= 12) return `${key.slice(0, 3)}***${key.slice(-3)}`;
  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}

function formatInt(n) {
  return new Intl.NumberFormat('zh-CN').format(Number(n || 0));
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatDateForFilename(ts = Date.now()) {
  const d = new Date(ts);
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'export';
}

function calcSummary(rows) {
  const summary = rows.reduce(
    (acc, r) => {
      acc.users += 1;
      acc.totalRequestLimit += r.requestLimit;
      acc.totalRpmLimit += r.rpmLimit;
      acc.totalTodayRequests += r.todayRequests;
      acc.totalTodayTokens += r.todayTokens;
      acc.totalYesterdayRequests += r.yesterdayRequests;
      acc.totalYesterdayTokens += r.yesterdayTokens;
      acc.totalRemainingRequestQuota += r.remainingRequestQuota;
      return acc;
    },
    {
      users: 0,
      totalRequestLimit: 0,
      totalRpmLimit: 0,
      totalTodayRequests: 0,
      totalTodayTokens: 0,
      totalYesterdayRequests: 0,
      totalYesterdayTokens: 0,
      totalRemainingRequestQuota: 0,
    },
  );

  const requestUsagePct = summary.totalRequestLimit > 0
    ? Number(((summary.totalTodayRequests / summary.totalRequestLimit) * 100).toFixed(2))
    : 0;

  return {
    ...summary,
    requestUsagePct,
  };
}

function determineQuotaTier(row) {
  const limit = toNumber(row.requestLimit);
  const remaining = toNumber(row.remainingRequestQuota);
  const usageRatio = limit > 0 ? toNumber(row.todayRequests) / limit : 1;

  if (limit >= 100000 && remaining >= 50000 && usageRatio < 0.7) {
    return { tier: 'premium', priority: 300, weight: 100 };
  }
  if (limit >= 20000 && remaining >= 5000 && usageRatio < 0.9) {
    return { tier: 'standard', priority: 200, weight: 80 };
  }
  return { tier: 'overflow', priority: 100, weight: 60 };
}

function normalizeModels(modelsRaw) {
  if (!modelsRaw) return '';
  const list = String(modelsRaw)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return list.join(',');
}

function joinGroups(groups, separator = ',') {
  const unique = Array.from(new Set(groups.filter(Boolean).map((v) => String(v).trim()).filter(Boolean)));
  return unique.join(separator || ',');
}

function buildChannelProvisionTasks(rows, options = {}) {
  const channelType = Number(options.channelType || 1);
  const models = normalizeModels(options.models || '');
  const namePrefix = options.namePrefix || 'EcomAgent Partner';
  const sharedGroup = options.sharedGroup || 'ecomagent_partner';
  const groupSeparator = options.groupSeparator || ',';

  return rows.map((row) => {
    const tier = determineQuotaTier(row);
    const quotaGroup = `quota_${tier.tier}`;
    const userGroup = `u_${row.id}`;
    const group = joinGroups([sharedGroup, quotaGroup, userGroup], groupSeparator);
    const keySuffix = String(row.id || '').padStart(6, '0');

    return {
      userId: row.id,
      email: row.email,
      quotaTier: tier.tier,
      strategy: {
        priorityRule: 'higher-is-better',
        weightRule: 'weighted-random-within-same-priority',
        note: 'new-api 按 priority DESC 选择层级，层内按 weight 加权随机',
      },
      request: {
        method: 'POST',
        path: '/api/channel/',
      },
      payload: {
        mode: 'single',
        channel: {
          type: channelType,
          key: row.apiKey,
          name: `${namePrefix} #${keySuffix}`,
          models,
          group,
          priority: tier.priority,
          weight: tier.weight,
          status: 1,
          test_model: models ? models.split(',')[0] : undefined,
          tag: `ecomagent_partner_${tier.tier}`,
          remark: `source_user:${row.id}|quota:${toNumber(row.requestLimit)}|remaining:${toNumber(row.remainingRequestQuota)}`,
        },
      },
    };
  });
}

function buildStandardizedExport({ rows, source = {}, args = {} }) {
  const generatedAt = new Date().toISOString();
  const summary = calcSummary(rows);
  const topByTodayRequests = [...rows]
    .sort((a, b) => b.todayRequests - a.todayRequests)
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      email: r.email,
      todayRequests: r.todayRequests,
      todayTokens: r.todayTokens,
      remainingRequestQuota: r.remainingRequestQuota,
    }));

  const channelProvisioning = {
    defaults: {
      channelType: Number(args.channelType || 1),
      models: normalizeModels(args.channelModels || ''),
      namePrefix: args.channelNamePrefix || 'EcomAgent Partner',
      sharedGroup: args.sharedGroup || 'ecomagent_partner',
      groupSeparator: args.groupSeparator || ',',
      newApiBaseUrl: args.newApiBaseUrl || DEFAULT_NEWAPI_BASE_URL,
      applyDryRunDefault: args.dryRun !== false,
    },
    tasks: buildChannelProvisionTasks(rows, {
      channelType: Number(args.channelType || 1),
      models: args.channelModels || '',
      namePrefix: args.channelNamePrefix || 'EcomAgent Partner',
      sharedGroup: args.sharedGroup || 'ecomagent_partner',
      groupSeparator: args.groupSeparator || ',',
    }),
  };

  return {
    success: true,
    generatedAt,
    source,
    summary,
    users: rows,
    topByTodayRequests,
    channelProvisioning,
  };
}

async function writeJsonFile(filePath, data) {
  const targetPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return targetPath;
}

function createDefaultExportPath(args, kind = 'users') {
  const ts = formatDateForFilename();
  const idPart = args.id ? `_id_${args.id}` : '_all';
  const base = sanitizeFilename(`ecomagent_${kind}${idPart}_${ts}.json`);
  return path.resolve(args.outputDir || process.cwd(), base);
}

async function createChannelFromTask(task, args) {
  const token = normalizeToken(args.newApiToken);
  if (!token) {
    throw new Error('缺少 new-api token，请设置 NEWAPI_BEARER 或传 --newapi-token');
  }
  const baseUrl = String(args.newApiBaseUrl || DEFAULT_NEWAPI_BASE_URL).replace(/\/$/, '');
  const result = await requestJson(`${baseUrl}/api/channel/`, {
    method: 'POST',
    token,
    body: task.payload,
  });
  return {
    ok: Boolean(result?.success),
    message: result?.message || '',
    raw: result,
  };
}

async function applyChannelTasks(tasks, args) {
  const results = [];
  for (const task of tasks) {
    try {
      const res = await createChannelFromTask(task, args);
      results.push({
        userId: task.userId,
        email: task.email,
        ok: res.ok,
        message: res.message,
      });
    } catch (err) {
      results.push({
        userId: task.userId,
        email: task.email,
        ok: false,
        message: err?.message || String(err),
      });
    }
  }
  return results;
}


function buildUserRow(detail, showKey) {
  const user = detail?.user || {};
  const today = detail?.todayUsage || {};
  const yesterday = detail?.yesterdayUsage || {};

  const requestLimit = toNumber(user.request_limit);
  const rpmLimit = toNumber(user.rpm_limit);
  const todayRequests = toNumber(today.total_requests);
  const todayTokens = toNumber(today.total_tokens);
  const yesterdayRequests = toNumber(yesterday.total_requests);
  const yesterdayTokens = toNumber(yesterday.total_tokens);

  return {
    id: user.id,
    email: user.user_email,
    providerUserId: user.provider_user_id,
    apiKeyName: user.api_key_name || detail?.apiKeys?.[0]?.provider_key_name || '-',
    apiKey: user.api_key || detail?.apiKey || detail?.apiKeys?.[0]?.provider_key_value || '',
    apiKeyDisplay: maskKey(user.api_key || detail?.apiKey || detail?.apiKeys?.[0]?.provider_key_value || '', showKey),
    requestLimit,
    rpmLimit,
    todayRequests,
    todayTokens,
    yesterdayRequests,
    yesterdayTokens,
    remainingRequestQuota: Math.max(requestLimit - todayRequests, 0),
    deletableAtUtc: detail?.deletePolicy?.deletableAtUtc || user?.deletableAtUtc || '-',
    canDeleteNow: Boolean(detail?.deletePolicy?.canDeleteNow || user?.canDeleteNow),
  };
}

function printCompact(rows, showKey) {
  console.log('\n===== 用户明细 =====');
  for (const r of rows) {
    console.log(`\n[ID ${r.id}] ${r.email}`);
    console.log(`  provider_user_id: ${r.providerUserId || '-'}`);
    console.log(`  api_key_name: ${r.apiKeyName}`);
    console.log(`  api_key: ${showKey ? r.apiKey : r.apiKeyDisplay}`);
    const requestUsagePct = r.requestLimit > 0 ? ((r.todayRequests / r.requestLimit) * 100).toFixed(1) : '0.0';
    console.log(`  今日请求: ${formatInt(r.todayRequests)} / 额度: ${formatInt(r.requestLimit)} (剩余 ${formatInt(r.remainingRequestQuota)}，已用 ${requestUsagePct}%)`);
    console.log(`  RPM额度: ${formatInt(r.rpmLimit)}`);
    console.log(`  今日Tokens: ${formatInt(r.todayTokens)} | 昨日请求: ${formatInt(r.yesterdayRequests)} | 昨日Tokens: ${formatInt(r.yesterdayTokens)}`);
    console.log(`  可删除: ${r.canDeleteNow ? '是' : '否'} | 可删时间: ${r.deletableAtUtc}`);
  }
}

function printSummary(rows) {
  const summary = rows.reduce(
    (acc, r) => {
      acc.users += 1;
      acc.totalRequestLimit += r.requestLimit;
      acc.totalRpmLimit += r.rpmLimit;
      acc.totalTodayRequests += r.todayRequests;
      acc.totalTodayTokens += r.todayTokens;
      acc.totalYesterdayRequests += r.yesterdayRequests;
      acc.totalYesterdayTokens += r.yesterdayTokens;
      acc.totalRemainingRequestQuota += r.remainingRequestQuota;
      return acc;
    },
    {
      users: 0,
      totalRequestLimit: 0,
      totalRpmLimit: 0,
      totalTodayRequests: 0,
      totalTodayTokens: 0,
      totalYesterdayRequests: 0,
      totalYesterdayTokens: 0,
      totalRemainingRequestQuota: 0,
    },
  );

  const topByTodayRequests = [...rows]
    .sort((a, b) => b.todayRequests - a.todayRequests)
    .slice(0, 5);

  const requestUsagePct = summary.totalRequestLimit > 0
    ? ((summary.totalTodayRequests / summary.totalRequestLimit) * 100).toFixed(1)
    : '0.0';

  console.log('\n===== 汇总统计 =====');
  console.log(`用户数: ${formatInt(summary.users)}`);
  console.log(`总请求额度: ${formatInt(summary.totalRequestLimit)}`);
  console.log(`总RPM额度: ${formatInt(summary.totalRpmLimit)}`);
  console.log(`今日总请求: ${formatInt(summary.totalTodayRequests)} (已用 ${requestUsagePct}%)`);
  console.log(`今日总Tokens: ${formatInt(summary.totalTodayTokens)}`);
  console.log(`昨日总请求: ${formatInt(summary.totalYesterdayRequests)}`);
  console.log(`昨日总Tokens: ${formatInt(summary.totalYesterdayTokens)}`);
  console.log(`今日剩余请求额度: ${formatInt(summary.totalRemainingRequestQuota)}`);

  if (topByTodayRequests.length > 0) {
    console.log('\nTop5 今日请求用户:');
    for (const item of topByTodayRequests) {
      console.log(`  - ID ${item.id} | ${item.email} | ${formatInt(item.todayRequests)} req | ${formatInt(item.todayTokens)} tokens`);
    }
  }
}

function buildPushMarkdown(rows) {
  const summary = rows.reduce(
    (acc, r) => {
      acc.users += 1;
      acc.totalRequestLimit += r.requestLimit;
      acc.totalRpmLimit += r.rpmLimit;
      acc.totalTodayRequests += r.todayRequests;
      acc.totalTodayTokens += r.todayTokens;
      acc.totalYesterdayRequests += r.yesterdayRequests;
      acc.totalYesterdayTokens += r.yesterdayTokens;
      acc.totalRemainingRequestQuota += r.remainingRequestQuota;
      return acc;
    },
    {
      users: 0,
      totalRequestLimit: 0,
      totalRpmLimit: 0,
      totalTodayRequests: 0,
      totalTodayTokens: 0,
      totalYesterdayRequests: 0,
      totalYesterdayTokens: 0,
      totalRemainingRequestQuota: 0,
    },
  );

  const requestUsagePct = summary.totalRequestLimit > 0
    ? ((summary.totalTodayRequests / summary.totalRequestLimit) * 100).toFixed(1)
    : '0.0';

  const topByTodayRequests = [...rows]
    .sort((a, b) => b.todayRequests - a.todayRequests)
    .slice(0, 10);

  const lines = [];
  lines.push('# EcomAgent Partner Users 统计');
  lines.push('');
  lines.push(`- 用户数: ${formatInt(summary.users)}`);
  lines.push(`- 总请求额度: ${formatInt(summary.totalRequestLimit)}`);
  lines.push(`- 总RPM额度: ${formatInt(summary.totalRpmLimit)}`);
  lines.push(`- 今日总请求: ${formatInt(summary.totalTodayRequests)} (已用 ${requestUsagePct}%)`);
  lines.push(`- 今日总Tokens: ${formatInt(summary.totalTodayTokens)}`);
  lines.push(`- 昨日总请求: ${formatInt(summary.totalYesterdayRequests)}`);
  lines.push(`- 昨日总Tokens: ${formatInt(summary.totalYesterdayTokens)}`);
  lines.push(`- 今日剩余请求额度: ${formatInt(summary.totalRemainingRequestQuota)}`);
  lines.push('');
  lines.push('## Top 今日请求用户');
  lines.push('');
  lines.push('| ID | 用户 | 今日请求 | 今日Tokens | 剩余额度 |');
  lines.push('|---|---|---:|---:|---:|');
  for (const r of topByTodayRequests) {
    lines.push(`| ${r.id} | ${r.email} | ${formatInt(r.todayRequests)} | ${formatInt(r.todayTokens)} | ${formatInt(r.remainingRequestQuota)} |`);
  }
  return lines.join('\n');
}

async function pushToPushPlus(token, title, content) {
  if (!token) {
    console.log('PushPlus token 为空，跳过推送');
    return;
  }

  const res = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      title,
      content,
      template: 'markdown',
    }),
  });

  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok || Number(json?.code) !== 200) {
    const msg = json?.msg || json?.message || `HTTP ${res.status}`;
    throw new Error(`PushPlus 推送失败: ${msg}`);
  }

  console.log('PushPlus 推送成功');
}

async function mapWithConcurrency(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;

  async function runner() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= items.length) break;
      out[current] = await worker(items[current], current);
    }
  }

  const n = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: n }, () => runner()));
  return out;
}

async function main() {
  const start = Date.now();
  const args = parseArgs(process.argv);
  const accessToken = await resolveAccessToken(args);

  const listRes = await requestJson(`${args.baseUrl}/api/partner/users`, {
    method: 'GET',
    token: accessToken,
  });

  if (!listRes?.success || !Array.isArray(listRes.users)) {
    throw new Error('用户列表响应格式异常');
  }

  const users = args.id !== null
    ? listRes.users.filter((u) => Number(u.id) === args.id)
    : listRes.users;

  if (users.length === 0) {
    throw new Error(args.id !== null ? `列表中未找到用户 ID=${args.id}` : '用户列表为空');
  }

  const details = await mapWithConcurrency(users, args.concurrency, async (u) => {
    const detailRes = await requestJson(`${args.baseUrl}/api/partner/users/${u.id}`, {
      method: 'GET',
      token: accessToken,
    });

    if (!detailRes?.success) {
      throw new Error(`查询用户 ${u.id} 详情失败`);
    }

    return detailRes;
  });

  const rows = details
    .map((d) => buildUserRow(d, args.showKey))
    .sort((a, b) => b.id - a.id);

  if (args.raw) {
    console.log(JSON.stringify({ success: true, users: rows, count: rows.length }, null, 2));
  } else {
    printCompact(rows, args.showKey);
    printSummary(rows);
  }

  const standardized = buildStandardizedExport({
    rows,
    source: {
      baseUrl: args.baseUrl,
      listApi: '/api/partner/users',
      detailApi: '/api/partner/users/:id',
    },
    args,
  });

  let standardizedPath = '';
  if (args.exportJson || args.buildChannelTasks || args.applyChannels) {
    standardizedPath = args.output
      ? path.resolve(process.cwd(), args.output)
      : createDefaultExportPath(args, 'partner_users');
    const saved = await writeJsonFile(standardizedPath, standardized);
    console.log(`标准化JSON已输出: ${saved}`);
  }

  let channelTaskPath = '';
  let channelTasks = [];
  if (args.buildChannelTasks || args.applyChannels) {
    channelTasks = standardized.channelProvisioning?.tasks || [];
    const channelTaskDoc = {
      success: true,
      generatedAt: new Date().toISOString(),
      sourceFile: standardizedPath || null,
      strategy: {
        priority: 'priority 越大越优先（DESC）',
        weight: '同优先级内按 weight 加权随机',
        group: '支持组合分组（逗号分隔）',
      },
      defaults: standardized.channelProvisioning?.defaults || {},
      tasks: channelTasks,
    };
    channelTaskPath = args.channelFile
      ? path.resolve(process.cwd(), args.channelFile)
      : createDefaultExportPath(args, 'channel_tasks');
    const savedTaskPath = await writeJsonFile(channelTaskPath, channelTaskDoc);
    console.log(`渠道任务JSON已输出: ${savedTaskPath}`);
  }

  if (args.applyChannels) {
    if (channelTasks.length === 0) {
      throw new Error('未生成渠道任务，无法提交');
    }

    if (args.dryRun) {
      console.log(`dry-run 模式：跳过提交 ${channelTasks.length} 条渠道任务`);
    } else {
      const applyResults = await applyChannelTasks(channelTasks, args);
      const okCount = applyResults.filter((x) => x.ok).length;
      const failCount = applyResults.length - okCount;
      console.log(`渠道提交完成：成功 ${okCount}，失败 ${failCount}`);
      if (failCount > 0) {
        const failedTop = applyResults.filter((x) => !x.ok).slice(0, 10);
        for (const f of failedTop) {
          console.log(`  - user#${f.userId} ${f.email}: ${f.message}`);
        }
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n完成：${rows.length} 个用户，耗时 ${elapsed}s`);

  if (args.push) {
    const title = `EcomAgent Partner 统计 (${rows.length} 用户)`;
    const content = buildPushMarkdown(rows);
    await pushToPushPlus(args.pushToken, title, content);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('执行失败:', err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  buildStandardizedExport,
  buildChannelProvisionTasks,
  determineQuotaTier,
  normalizeModels,
  joinGroups,
  calcSummary,
  main,
};
