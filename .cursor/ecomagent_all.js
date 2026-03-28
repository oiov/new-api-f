#!/usr/bin/env node

/**
 * EcomAgent 通用脚本：自动刷新登录态 + 创建 API Key + 查询额度
 *
 * 配置文件（ecomagent_all.json）结构：
 * {
 *   "baseUrl": "https://ecomagent.in",
 *   "supabaseAuthUrl": "https://<project>.supabase.co/auth/v1", // 可选
 *   "supabaseAnonKey": "...",                                  // 可选（可被内置值兜底）
 *   "accounts": {
 *     "yunhuinfo": {
 *       "accountId": "...",
 *       "email": "...",
 *       "usageAccountId": "...",
 *       "refreshToken": "<refresh_token>",
 *       "runtime": {
 *         "token": "<access_token>",
 *         "tokenExpiresAt": "<iso-date>",
 *         "apiKey": "<api-key>",
 *         "apiKeyCreatedAt": "<iso-date>",
 *         "apiKeyExpiresAt": "<iso-date>"
 *       }
 *     }
 *   }
 * }
 *
 * 用法：
 *   node ecomagent_all.js fishxcode
 *   node ecomagent_all.js yunhuinfo --create-key
 *   node ecomagent_all.js linuxcloudlab --only-usage
 *   node ecomagent_all.js all --create-key
 *   node ecomagent_all.js all --only-usage
 *
 * 可选参数：
 *   --create-key             为目标账号创建/刷新 key（不传则不创建）
 *   --only-usage             只执行查询 usage
 *   --push                   将汇总报告推送到 PushPlus
 *   --raw                    输出完整 JSON（默认输出精简分析）
 *   --base-url <URL>         覆盖默认 baseUrl
 *   --config <path>          指定配置文件（默认同目录 ecomagent_all.json）
 *
 * 默认行为（不带 --create-key / --only-usage）：
 *   - token 过期 → 自动刷新 token + 自动创建 key
 *   - token 未过期、key 过期 → 自动创建 key
 *   - 都未过期 → 仅查询 usage
 */

const { readFile, writeFile } = require("node:fs/promises");
const { resolve, dirname } = require("node:path");

const REQUEST_TIMEOUT_MS = 15000;
const __dirname = dirname(__filename);

// 按当前项目固定写死（仍允许 config/env 覆盖）
const BUILTIN_SUPABASE_AUTH_URL = "https://zwggawnojtjiaklycfhc.supabase.co/auth/v1";
const BUILTIN_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE";

// 解析命令行参数
function parseArgs(argv) {
  const result = {
    target: undefined,
    createKey: false,
    onlyUsage: false,
    push: false,
    raw: false,
    help: false,
    uploadNewApi: true,
    baseUrlOverride: undefined,
    configPath: resolve(__dirname, "ecomagent_all.json"),
    newApiBaseUrl: process.env.NEWAPI_BASE_URL || "http://127.0.0.1:3000",
    channelType: Number(process.env.NEWAPI_CHANNEL_TYPE || 1),
    channelModels: process.env.NEWAPI_CHANNEL_MODELS || "",
    channelNamePrefix: process.env.NEWAPI_CHANNEL_NAME_PREFIX || "EcomAgent",
    sharedGroup: process.env.NEWAPI_SHARED_GROUP || "ecomagent_auto",
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--create-key") {
      result.createKey = true;
      continue;
    }
    if (arg === "--only-usage") {
      result.onlyUsage = true;
      continue;
    }
    if (arg === "--push") {
      result.push = true;
      continue;
    }
    if (arg === "--raw") {
      result.raw = true;
      continue;
    }
    if (arg === "--base-url" && argv[i + 1]) {
      result.baseUrlOverride = argv[++i].replace(/\/$/, "");
      continue;
    }
    if (arg === "--upload-newapi") {
      result.uploadNewApi = true;
      continue;
    }
    if (arg === "--no-upload-newapi") {
      result.uploadNewApi = false;
      continue;
    }
    if (arg === "--newapi-base-url" && argv[i + 1]) {
      result.newApiBaseUrl = argv[++i].replace(/\/$/, "");
      continue;
    }
    if (arg === "--channel-type" && argv[i + 1]) {
      result.channelType = Number(argv[++i]);
      continue;
    }
    if (arg === "--channel-models" && argv[i + 1]) {
      result.channelModels = String(argv[++i]);
      continue;
    }
    if (arg === "--channel-name-prefix" && argv[i + 1]) {
      result.channelNamePrefix = String(argv[++i]);
      continue;
    }
    if (arg === "--shared-group" && argv[i + 1]) {
      result.sharedGroup = String(argv[++i]);
      continue;
    }

    if (!arg.startsWith("-") && !result.target) {
      result.target = arg;
      continue;
    }
  }

  // 无参数或仅 flags 时默认 all + push（青龙面板场景）
  if (!result.target) {
    result.target = "all";
    result.push = true;
  }
  if (result.onlyUsage) result.createKey = false;

  return result;
}

function printUsageAndExit(code = 1) {
  console.log(`用法:
  node ecomagent_all.js <账号名|all> [--create-key] [--only-usage] [--push] [--raw] [--base-url <URL>] [--config <path>]

新增参数:
  --upload-newapi           上传账号 key 到 new-api /api/channel/（默认开启）
  --no-upload-newapi        关闭上传
  --newapi-base-url <URL>   new-api 地址（默认环境变量 NEWAPI_BASE_URL 或 http://127.0.0.1:3000）
  --channel-type <num>      渠道 type（默认 1）
  --channel-models <csv>    渠道模型列表，如 gpt-4o-mini,gpt-4.1
  --channel-name-prefix <s> 渠道名称前缀（默认 EcomAgent）
  --shared-group <name>     共享分组（默认 ecomagent_auto）
`);
  process.exit(code);
}

function migrateAccountProfile(profile) {
  const next = { ...profile };
  const runtime = { ...(next.runtime && typeof next.runtime === "object" ? next.runtime : {}) };

  if (next.token) runtime.token = next.token;
  if (next.tokenExpiresAt) {
    runtime.tokenExpiresAt =
      typeof next.tokenExpiresAt === "number"
        ? new Date(next.tokenExpiresAt * 1000).toISOString()
        : next.tokenExpiresAt;
  }
  if (next.apiKey) runtime.apiKey = next.apiKey;
  if (next.apiKeyCreatedAt) runtime.apiKeyCreatedAt = next.apiKeyCreatedAt;
  if (next.apiKeyExpiresAt) runtime.apiKeyExpiresAt = next.apiKeyExpiresAt;
  if (!next.refreshToken && next.refresh_token) next.refreshToken = next.refresh_token;

  delete next.token;
  delete next.tokenExpiresAt;
  delete next.apiKey;
  delete next.apiKeyCreatedAt;
  delete next.apiKeyExpiresAt;
  delete next.refresh_token;

  if (Object.keys(runtime).length > 0) {
    next.runtime = runtime;
  } else {
    delete next.runtime;
  }

  return next;
}

async function loadConfig(configPath) {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("配置文件格式错误：根对象无效");
  }
  if (!parsed.baseUrl || typeof parsed.baseUrl !== "string") {
    throw new Error("配置文件格式错误：缺少 baseUrl");
  }
  if (!parsed.accounts || typeof parsed.accounts !== "object") {
    throw new Error("配置文件格式错误：缺少 accounts");
  }

  const accounts = Object.fromEntries(
    Object.entries(parsed.accounts).map(([name, profile]) => [name, migrateAccountProfile(profile)]),
  );

  return {
    ...parsed,
    accounts,
  };
}

function resolveTargets(target, accounts) {
  if (target === "all") return Object.keys(accounts);
  if (accounts[target]) return [target];

  console.error(`未知目标: ${target}`);
  printUsageAndExit();
}

// 统一 JSON 请求封装（用于 ecomagent 业务接口，Bearer 鉴权）
async function requestJson(url, { method, token, body }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message = json?.error || json?.message || `HTTP ${res.status}`;
      throw new Error(message);
    }

    return json;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`请求超时 (${REQUEST_TIMEOUT_MS}ms): ${url}`);
    if (err.cause?.code === "ENOTFOUND") throw new Error(`DNS 解析失败: ${new URL(url).hostname}`);
    if (err.cause?.code === "ECONNREFUSED") throw new Error(`连接被拒绝: ${url}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// 从 JWT 中解析 payload（仅用于读取公开声明，如 iss）
function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// 解析 Supabase Auth 地址优先级：config > 内置常量 > JWT iss
function getSupabaseAuthUrl(token, config) {
  if (config?.supabaseAuthUrl && typeof config.supabaseAuthUrl === "string") {
    return config.supabaseAuthUrl.replace(/\/$/, "");
  }

  if (BUILTIN_SUPABASE_AUTH_URL) {
    return BUILTIN_SUPABASE_AUTH_URL.replace(/\/$/, "");
  }

  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const iss = payload?.iss;
  if (typeof iss !== "string") return null;

  if (iss.endsWith("/auth/v1")) return iss;
  return `${iss.replace(/\/$/, "")}/auth/v1`;
}
// 使用 refresh token 换取新 access token（Supabase refresh grant）
async function refreshAccessToken({ refreshToken, currentAccessToken, config }) {
  const authUrl = getSupabaseAuthUrl(currentAccessToken, config);
  if (!authUrl) {
    throw new Error("无法确定 Supabase auth 地址：请在配置添加 supabaseAuthUrl");
  }

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };

  const anonKey =
    config?.supabaseAnonKey ||
    config?.supabase_anon_key ||
    process.env.SUPABASE_ANON_KEY ||
    BUILTIN_SUPABASE_ANON_KEY;
  if (anonKey) {
    headers.apikey = anonKey;
  } else {
    throw new Error("缺少 Supabase anon key：请在配置中添加 supabaseAnonKey 或设置环境变量 SUPABASE_ANON_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const message = json?.error_description || json?.error || json?.message || `HTTP ${res.status}`;
      const hint = res.status === 400 ? "（refresh_token 可能已失效或被撤销，需重新登录获取）" : "";
      throw new Error(`刷新 token 失败: ${message}${hint}`);
    }

    if (!json?.access_token) {
      throw new Error("刷新 token 失败: 响应缺少 access_token");
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken,
      expiresIn: Number(json.expires_in || 0),
      expiresAt: json.expires_at || null,
    };
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`刷新 token 超时 (${REQUEST_TIMEOUT_MS}ms)`);
    if (err.cause?.code === "ENOTFOUND") throw new Error(`DNS 解析失败: ${new URL(authUrl).hostname}`);
    if (err.cause?.code === "ECONNREFUSED") throw new Error(`连接被拒绝: ${authUrl}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUsage(payload) {
  const usage = payload?.usage || payload?.data || payload;

  return {
    requests: Number(usage?.requests ?? 0),
    tokens: Number(usage?.tokens ?? usage?.totalTokens ?? 0),
    recentLogs: Array.isArray(usage?.recentLogs) ? usage.recentLogs : [],
    modelBreakdown: Array.isArray(usage?.modelBreakdown) ? usage.modelBreakdown : [],
    lastUpdated: usage?.lastUpdated || payload?.updatedAt || null,
    subscription: payload?.subscription || null,
    billing: payload?.billing || null,
    raw: payload,
  };
}

function inferExpiresAt(createdAt, ttlHours = 24) {
  if (!createdAt) return null;
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(base.getHours() + ttlHours);
  return base.toISOString();
}

function formatInt(n) {
  return new Intl.NumberFormat("zh-CN").format(Number(n || 0));
}

function getTopModel(modelBreakdown = []) {
  if (!Array.isArray(modelBreakdown) || modelBreakdown.length === 0) return null;
  return [...modelBreakdown].sort((a, b) => (b.tokens || 0) - (a.tokens || 0))[0] || null;
}

function buildUsageInsight(usage) {
  const requests = Number(usage?.requests || 0);
  const tokens = Number(usage?.tokens || 0);
  const avgTokensPerRequest = requests > 0 ? Math.round(tokens / requests) : 0;
  const topModel = getTopModel(usage?.modelBreakdown);
  const lastLog = Array.isArray(usage?.recentLogs) && usage.recentLogs.length > 0 ? usage.recentLogs[0] : null;

  return {
    requests,
    tokens,
    avgTokensPerRequest,
    topModel,
    lastLog,
    lastUpdated: usage?.lastUpdated || null,
  };
}

function printAccountCompact(result) {
  const u = buildUsageInsight(result.usage);

  console.log(`\n[${result.provider}]`);

  const actions = [];
  if (result.didRefresh) actions.push("刷新token");
  if (result.didCreateKey) actions.push("创建key");
  if (actions.length === 0) actions.push("仅查额度");
  console.log(`  操作: ${actions.join(" + ")}`);

  console.log(`  账号: ${result.email}`);

  if (result.subscription) {
    const sub = result.subscription;
    console.log(`  套餐: ${sub.plan} | 请求限额: ${sub.requestLimit} | Token限额: ${sub.tokenLimit}`);
  }

  console.log(`  请求: ${formatInt(u.requests)} 次`);
  console.log(`  Tokens: ${formatInt(u.tokens)}`);
  console.log(`  单次均值: ${formatInt(u.avgTokensPerRequest)} tokens/req`);

  if (u.topModel) {
    console.log(
      `  主模型: ${u.topModel.model} (${formatInt(u.topModel.requests)} 次, ${formatInt(u.topModel.tokens)} tokens)`,
    );
  } else {
    console.log("  主模型: -");
  }

  if (u.lastLog) {
    console.log(
      `  最近调用: ${u.lastLog.timestamp} | ${u.lastLog.model} | ${formatInt(u.lastLog.tokens)} tokens | ${u.lastLog.status}`,
    );
  } else {
    console.log("  最近调用: -");
  }

  console.log(`  更新时间: ${u.lastUpdated || "-"}`);

  if (result.key?.value) {
    const keyLabel = result.didCreateKey ? "新Key" : "Key";
    console.log(`  ${keyLabel}: ${result.key.value}`);
    if (result.key.expiresAt) console.log(`  Key过期: ${result.key.expiresAt}`);
  }
}

function printOverall(summary) {
  const okItems = summary.filter((x) => x.success && x.usage);
  const totalReq = okItems.reduce((sum, x) => sum + Number(x.usage.requests || 0), 0);
  const totalTokens = okItems.reduce((sum, x) => sum + Number(x.usage.tokens || 0), 0);

  const topByTokens = [...okItems].sort((a, b) => Number(b.usage.tokens || 0) - Number(a.usage.tokens || 0));

  console.log("\n===== 总览 =====");
  console.log(`账号数: ${okItems.length}`);
  console.log(`总请求: ${formatInt(totalReq)}`);
  console.log(`总Tokens: ${formatInt(totalTokens)}`);

  if (topByTokens.length > 0) {
    console.log("Top(按Tokens):");
    for (const item of topByTokens) {
      console.log(
        `  - ${item.provider}: ${formatInt(item.usage.tokens)} tokens / ${formatInt(item.usage.requests)} req`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Markdown 报告生成
// ═══════════════════════════════════════════════════════════════════

function buildMarkdownReport(summary, startDate, elapsedMs) {
  const lines = [];
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const okItems = summary.filter((x) => x.success && x.usage);
  const failItems = summary.filter((x) => !x.success);
  const totalReq = okItems.reduce((sum, x) => sum + Number(x.usage.requests || 0), 0);
  const totalTokens = okItems.reduce((sum, x) => sum + Number(x.usage.tokens || 0), 0);

  lines.push(`# EcomAgent 账号报告`);
  lines.push(``);
  lines.push(`> ${startDate} | 耗时 ${(elapsedMs / 1000).toFixed(1)}s | 成功 ${okItems.length} / 失败 ${failItems.length}`);
  lines.push(``);

  // 总览
  const totalReqLimit = okItems.reduce((sum, x) => sum + (Number(x.subscription?.requestLimit) || 100), 0);
  const totalReqPct = totalReqLimit > 0 ? Math.round(totalReq / totalReqLimit * 100) : 0;

  lines.push(`## 总览`);
  lines.push(``);
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 账号数 | ${okItems.length} |`);
  lines.push(`| 总请求 | ${formatInt(totalReq)} / ${formatInt(totalReqLimit)} (${totalReqPct}%) |`);
  lines.push(`| 总 Tokens | ${formatInt(totalTokens)} |`);
  lines.push(`| 可用 Key 数 | ${okItems.filter((x) => x.key?.value).length} |`);
  lines.push(``);

  // 账号明细表
  lines.push(`## 账号明细`);
  lines.push(``);
  lines.push(`| 账号 | 套餐 | 操作 | 请求 | 用量比 | Tokens | API Key |`);
  lines.push(`|---|---|---|---|---|---|---|`);

  for (const r of okItems) {
    const u = buildUsageInsight(r.usage);
    const actions = [];
    if (r.didRefresh) actions.push("刷新token");
    if (r.didCreateKey) actions.push("创建key");
    if (actions.length === 0) actions.push("查额度");

    const plan = r.subscription?.plan || "-";
    const reqLimit = Number(r.subscription?.requestLimit) || 100;
    const pct = reqLimit > 0 ? `${u.requests}/${reqLimit} (${Math.round(u.requests / reqLimit * 100)}%)` : `${formatInt(u.requests)}`;
    const keyDisplay = r.key?.value ? `\`${r.key.value}\`` : "-";

    lines.push(`| ${r.provider} | ${plan} | ${actions.join("+")} | ${formatInt(u.requests)} | ${pct} | ${formatInt(u.tokens)} | ${keyDisplay} |`);
  }

  // 失败账号
  if (failItems.length > 0) {
    lines.push(``);
    lines.push(`## 失败账号`);
    lines.push(``);
    for (const f of failItems) {
      lines.push(`- **${f.provider}**: ${f.error}`);
    }
  }

  // Top 模型使用
  const allModels = new Map();
  for (const r of okItems) {
    for (const m of r.usage?.modelBreakdown || []) {
      const key = m.model;
      const existing = allModels.get(key) || { model: key, requests: 0, tokens: 0 };
      existing.requests += Number(m.requests || 0);
      existing.tokens += Number(m.tokens || 0);
      allModels.set(key, existing);
    }
  }

  if (allModels.size > 0) {
    const sorted = [...allModels.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10);
    lines.push(``);
    lines.push(`## 模型用量 Top10`);
    lines.push(``);
    lines.push(`| 模型 | 请求数 | Tokens |`);
    lines.push(`|---|---|---|`);
    for (const m of sorted) {
      lines.push(`| ${m.model} | ${formatInt(m.requests)} | ${formatInt(m.tokens)} |`);
    }
  }

  lines.push(``);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// PushPlus 推送
// ═══════════════════════════════════════════════════════════════════

const PUSHPLUS_TOKEN = "d9718b2eff8041d2b48ef8b81d8d7ab4";
const SUBSCRIPTION_ACCESS_TOKEN = process.env.SUBSCRIPTION_ACCESS_TOKEN || "";
const SUBSCRIPTION_USER_ID = process.env.SUBSCRIPTION_USER_ID || "1";

async function pushToX(title, content) {
  if (!PUSHPLUS_TOKEN) return;
  try {
    const headers = {
      "Content-Type": "application/json",
      accept: "application/json",
    };

    if (SUBSCRIPTION_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${SUBSCRIPTION_ACCESS_TOKEN}`;
    }
    if (SUBSCRIPTION_USER_ID) {
      headers["New-Api-User"] = String(SUBSCRIPTION_USER_ID);
    }

    const res = await fetch("https://www.pushplus.plus/send", {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: PUSHPLUS_TOKEN,
        title,
        content,
        template: "markdown",
      }),
    });
    const json = await res.json();
    if (json.code === 200) {
      console.log("PushPlus 推送成功");
    } else {
      console.error(`PushPlus 推送失败: ${json.msg}`);
    }
  } catch (err) {
    console.error(`PushPlus 推送异常: ${err.message}`);
  }
}

function ensureRuntime(profile) {
  if (!profile.runtime || typeof profile.runtime !== "object") {
    profile.runtime = {};
  }
  return profile.runtime;
}

function sanitizeName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "ecomagent";
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .join(",");
}

function buildQuotaTier(result) {
  const requestLimit = Number(result?.subscription?.requestLimit || 0);
  const requests = Number(result?.usage?.requests || 0);
  const remaining = Math.max(requestLimit - requests, 0);
  const usageRatio = requestLimit > 0 ? requests / requestLimit : 1;

  if (requestLimit >= 100000 && remaining >= 50000 && usageRatio < 0.7) {
    return { tier: "premium", priority: 300, weight: 100 };
  }
  if (requestLimit >= 20000 && remaining >= 5000 && usageRatio < 0.9) {
    return { tier: "standard", priority: 200, weight: 80 };
  }
  return { tier: "overflow", priority: 100, weight: 60 };
}

function buildNewApiChannelPayload(result, options) {
  const key = result?.key?.value || result?.subscription?.apiKey || "";
  if (!key) return null;

  const tier = buildQuotaTier(result);
  const models = parseCommaList(options.channelModels);
  const safeProvider = sanitizeName(result.provider || "account");
  const safeEmail = sanitizeName((result.email || "").split("@")[0]);
  const sharedGroup = options.sharedGroup || "ecomagent_auto";
  const groups = [sharedGroup, `quota_${tier.tier}`, `u_${safeProvider}`].join(",");

  return {
    mode: "single",
    channel: {
      type: Number(options.channelType || 1),
      key,
      name: `${options.channelNamePrefix} ${safeProvider}-${safeEmail}`,
      models,
      group: groups,
      priority: tier.priority,
      weight: tier.weight,
      status: 1,
      tag: `ecomagent_${tier.tier}`,
      remark: `provider:${result.provider}|email:${result.email}|limit:${Number(result?.subscription?.requestLimit || 0)}|requests:${Number(result?.usage?.requests || 0)}`,
    },
  };
}

async function uploadChannelsToNewApi(summary, options) {
  if (!options.uploadNewApi) return { uploaded: 0, failed: 0, skipped: summary.length };

  const token = SUBSCRIPTION_ACCESS_TOKEN;
  if (!token) {
    throw new Error("缺少 SUBSCRIPTION_ACCESS_TOKEN，无法上传到 new-api");
  }

  let uploaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of summary) {
    if (!result?.success) {
      skipped += 1;
      continue;
    }

    const payload = buildNewApiChannelPayload(result, options);
    if (!payload) {
      skipped += 1;
      continue;
    }

    try {
      const res = await fetch(`${options.newApiBaseUrl}/api/channel/`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
          "New-Api-User": String(SUBSCRIPTION_USER_ID || "1"),
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!res.ok || json?.success === false) {
        failed += 1;
        console.error(`[上传失败] ${result.provider}: ${json?.message || `HTTP ${res.status}`}`);
        continue;
      }

      uploaded += 1;
      console.log(`[上传成功] ${result.provider}`);
    } catch (err) {
      failed += 1;
      console.error(`[上传异常] ${result.provider}: ${err?.message || err}`);
    }
  }

  return { uploaded, failed, skipped };
}


function persistRefreshedSession(profile, refreshed) {
  const runtime = ensureRuntime(profile);
  runtime.token = refreshed.accessToken;
  if (refreshed.expiresAt) {
    runtime.tokenExpiresAt =
      typeof refreshed.expiresAt === "number"
        ? new Date(refreshed.expiresAt * 1000).toISOString()
        : refreshed.expiresAt;
  } else if (refreshed.expiresIn > 0) {
    runtime.tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  }
  profile.refreshToken = refreshed.refreshToken;
}

function persistApiKey(profile, key) {
  const runtime = ensureRuntime(profile);
  runtime.apiKey = key.value;
  runtime.apiKeyCreatedAt = key.createdAt;
  runtime.apiKeyExpiresAt = key.expiresAt;
}

// 检查 JWT 是否即将过期（提前 5 分钟视为过期）
function isTokenExpired(token) {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 < Date.now() + 5 * 60 * 1000;
}

// 检查 API Key 是否已过期
function isApiKeyExpired(profile) {
  const expiresAt = profile.runtime?.apiKeyExpiresAt;
  if (!expiresAt) return true;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() < Date.now() + 5 * 60 * 1000;
}

// 账号执行主流程：智能判断过期状态，按需刷新/创建
async function runForAccount(name, profile, options, baseUrl, config) {
  const currentToken = profile.runtime?.token;
  let token = currentToken;
  let didRefresh = false;
  let didCreateKey = false;

  // 1. token 过期 → 刷新（没有 refreshToken 且 token 未过期则跳过）
  const tokenExpired = isTokenExpired(currentToken);
  const hasRefreshToken = Boolean(profile.refreshToken);

  if (tokenExpired) {
    if (!hasRefreshToken) {
      throw new Error(`token 已过期且缺少 refreshToken，无法刷新`);
    }

    const refreshed = await refreshAccessToken({
      refreshToken: profile.refreshToken,
      currentAccessToken: currentToken,
      config,
    });
    persistRefreshedSession(profile, refreshed);
    token = refreshed.accessToken;
    didRefresh = true;
  }

  // 2. 决定是否创建 key：
  //    --create-key 强制创建 | --only-usage 跳过 | 默认模式下 key 过期且有能力刷新时自动创建
  const forceCreateKey = Boolean(options.createKey || profile.createKey);
  const keyExpired = isApiKeyExpired(profile);
  const shouldCreateKey = !options.onlyUsage && (forceCreateKey || keyExpired) && token;

  const result = {
    success: true,
    provider: name,
    accountId: profile.accountId,
    email: profile.email,
    key: null,
    subscription: null,
    usage: null,
    didRefresh,
    didCreateKey: false,
    tokenExpired,
    keyExpired,
  };

  if (shouldCreateKey) {
    const keyResp = await requestJson(`${baseUrl}/api/generate-key`, {
      method: "POST",
      token,
      body: {
        accountId: profile.accountId,
        email: profile.email,
      },
    });

    const createdAt = keyResp?.createdAt || keyResp?.apiKeyCreatedAt || new Date().toISOString();
    const keyValue = keyResp?.key || keyResp?.apiKey || null;
    const expiresAt = keyResp?.expiresAt || inferExpiresAt(createdAt, 24);

    result.key = {
      value: keyValue,
      reused: Boolean(keyResp?.reused),
      createdAt,
      expiresAt,
      ttlHours: 24,
      raw: keyResp,
    };

    if (keyValue) {
      persistApiKey(profile, result.key);
      result.didCreateKey = true;
    }
  }

  // 并行查询 subscription + usage
  const usageAccountId = profile.usageAccountId || profile.accountId;
  const [subResp, usageResp] = await Promise.all([
    requestJson(`${baseUrl}/api/subscription/${profile.accountId}`, { method: "GET", token }).catch(() => null),
    requestJson(`${baseUrl}/api/account-usage/${usageAccountId}`, { method: "GET", token }).catch(() => null),
  ]);

  // 解析 subscription
  if (subResp?.success && subResp.subscription) {
    const sub = subResp.subscription;
    result.subscription = {
      plan: sub.plan || "-",
      requestLimit: sub.requestLimit || "-",
      tokenLimit: sub.tokenLimit || "-",
      apiKey: sub.apiKey || null,
      apiKeyName: sub.apiKeyName || null,
      apiKeyCreatedAt: sub.apiKeyCreatedAt || null,
    };
    // 如果没创建新 key，用 subscription 里的现有 key 信息
    if (!result.key && sub.apiKey) {
      result.key = {
        value: sub.apiKey,
        reused: true,
        createdAt: sub.apiKeyCreatedAt || null,
        expiresAt: null,
      };
    }
  }

  result.usage = normalizeUsage(usageResp);
  return result;
}

(async () => {
  const startTime = Date.now();
  const startDate = new Date().toLocaleString("zh-CN", { hour12: false });
  const options = parseArgs(process.argv);

  if (options.help) {
    printUsageAndExit(0);
  }

  const config = await loadConfig(options.configPath);
  const baseUrl = options.baseUrlOverride || config.baseUrl;
  const targets = resolveTargets(options.target, config.accounts);

  console.log(`开始时间: ${startDate}`);
  console.log(`目标: ${targets.join(", ")} (${targets.length} 个账号)`);

  const CONCURRENCY = 5;
  const summary = [];
  let shouldPersistConfig = false;

  async function processAccount(name) {
    const profile = config.accounts[name];
    try {
      const result = await runForAccount(name, profile, options, baseUrl, config);
      if (result.key?.value || result.didRefresh) shouldPersistConfig = true;
      return result;
    } catch (err) {
      return {
        success: false,
        provider: name,
        accountId: profile?.accountId || null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 并发控制
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processAccount));

    for (const result of results) {
      summary.push(result);
      if (result.success) {
        if (options.raw) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printAccountCompact(result);
        }
      } else {
        console.error(`\n[${result.provider}] 失败: ${result.error}`);
      }
    }
  }

  if (shouldPersistConfig) {
    await writeFile(options.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    if (!options.raw) {
      console.log(`\n已更新配置文件中的 token/apiKey: ${options.configPath}`);
    }
  }

  if (!options.raw) {
    printOverall(summary);
  }

  const uploadStats = await uploadChannelsToNewApi(summary, options);
  if (!options.raw) {
    console.log(`上传 new-api 渠道: 成功 ${uploadStats.uploaded} | 失败 ${uploadStats.failed} | 跳过 ${uploadStats.skipped}`);
  }

  const ok = summary.filter((x) => x.success).length;
  const fail = summary.length - ok;
  const elapsedMs = Date.now() - startTime;
  console.log(`\n完成: ${summary.length} 个账号 | 成功 ${ok} | 失败 ${fail} | 耗时 ${(elapsedMs / 1000).toFixed(1)}s`);

  // PushPlus 推送
  if (options.push) {
    const md = buildMarkdownReport(summary, startDate, elapsedMs);
    await pushToX(`EcomAgent 报告 (${ok}/${summary.length})`, md);
  }

  if (fail > 0) process.exitCode = 1;
})();
