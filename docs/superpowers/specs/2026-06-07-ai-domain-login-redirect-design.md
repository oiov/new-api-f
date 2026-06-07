# nbility.ai 登录入口跳转到主域 — 设计文档

> 日期：2026-06-07
> 范围：`web-worker/`（新前端 worker 层）
> 关联约定：`web-worker/CLAUDE.md` Rule 7（§5 流量 marker、§6 域名零硬编码）

## 1. 背景与根因

新前端 `web-worker/` 同一个 Cloudflare Worker 同时服务 `nbility.dev`（主域）和 `nbility.ai`（新域）。三种 OAuth 登录（GitHub、Google、LinuxDo）在用户从 `nbility.ai` 发起时失败。

**根因**：OAuth 的 `redirect_uri` 的域名部分最终必须匹配各平台 OAuth App 后台登记的回调地址，目前登记的都是 `nbility.dev`。

- 前端 `auth.ts:getSiteUrl()` 返回 `window.location.origin`，用户在 `nbility.ai` 时 `redirect_uri` 变成 `https://nbility.ai/oauth/github` 等，与平台登记的 `nbility.dev` 不符 → 平台拒绝。
- GitHub / LinuxDo 一个 App 只能登记一个回调 host，是硬卡点；Google 控制台虽支持多 redirect URI，但还有第二个问题（见下）。
- **连带问题**：worker 反代 `/api/*` 时 `headers.set('Host', 'api.nbility.dev')` 改写了 Host，且未注入 `X-Forwarded-Host`，后端 `oauth/google.go:resolveGoogleRedirectBase` 因此算出的 redirect base 是 `api.nbility.dev`，所以即便 Google 配了多 URI 也对不上。

这本质是**跨注册域名的 SSO 问题**：`nbility.dev` 与 `nbility.ai` 是两个不同的可注册域名，会话 cookie 天然无法跨域共享。

## 2. 决策记录（为什么选"跳转"而非"改后端"）

评估过三条路线：

- **方案 A — 每域名一套 OAuth App（按 host 选凭证）**：worker 注入 `X-Forwarded-Host`，后端按 host 选主/备凭证并拼 redirect_uri，前端基本不动。用户可停在自己域名。代价：改后端三处 + GetStatus + 新增备用凭证配置 + GitHub/LinuxDo 各多建一套 App。
- **方案 B — 统一规范域 OAuth + 一次性令牌回传（跨域 SSO）**：各平台单套 App 不变，登录在规范域完成后用短时一次性 code 把会话回传到来源域。扩展域名零成本，但引入令牌签发/兑换端点与额外安全面。
- **方案 C（采纳）— 登录/注册入口整体跳转到主域**：`nbility.ai` 上的登录/注册入口一律 302 到主域完成，OAuth 全用现成主域配置。

**采纳 C 的理由**：用户确认 `nbility.ai` 短期不作主域，可接受"登录后用户停在主域 `nbility.dev`"。C 的后端零改动、OAuth 平台零重配、前端组件零改动，改动面最小、风险最低。

**已知并接受的后果**：在主域完成登录后，会话 cookie 只能种在 `.nbility.dev`，跨不到 `.nbility.ai`。因此 `nbility.ai` 实际退化为"未登录访客入口 + 一键去主域登录"；登录后用户停留在主域。这是用户明确接受的取舍。

**一致性要求**：账号密码登录在 `nbility.ai` 上本可正常工作（cookie 按 host 种到 `.nbility.ai`），仅 OAuth 三者受阻。但若只跳 OAuth、账密留在 ai，会出现"账密停 ai、OAuth 停 dev"的割裂体验。故**整个登录/注册入口（含账密）统一跳转**。

## 3. 设计

改动**只在 worker 一层**。

### 3.1 跳转逻辑（`web-worker/src/server.ts`）

在入口 `fetch` 中，`shouldProxyRequestPath(url.pathname)` 判定（`/api/*` 反代）之后、`handler.fetch(...)`（SSR 渲染）之前，插入登录入口跳转判定：

```
若 满足全部条件:
  - pathname 精确属于登录/注册入口集合（见 3.2）
  - 当前 host 不属于主域 SITE_URL 的注册域（见 3.3）
  - 当前 host 非本地开发豁免（见 3.3）
则:
  const target = new URL(pathname + search, SITE_URL).toString()
  return Response.redirect(target, 302)
```

- 必须在 SSR 渲染前返回 302，避免用户先看到 ai 登录页再跳（走查点 §6）。
- 用 `new URL(pathname + search, SITE_URL)` 规范化拼接，天然规避 `SITE_URL` 末尾斜杠导致 `//auth/login` 的问题；`search`（query string）随之原样透传，保证 `aff` 邀请码、`return_to` 等参数无损。
- 「主域」取自 `env.SITE_URL`，「当前 host」取自 `new URL(request.url).hostname`，**无任何域名字面量**（§6）。
- **env 健壮性**：跳转判定应使用经 `src/env/server.ts`（Zod）校验后的 env；若入口拿到的 `SITE_URL` 为空/非法导致 `new URL(...)` 抛异常，必须 try/catch 兜底为**不跳、放行 SSR**，绝不能让入口层 500。

### 3.2 受跳转的路径

登录/注册入口路由（来自 `src/routes/auth/`），用**精确匹配集合**（非前缀匹配，避免误伤未来的 `/auth/login-help`、`/auth/register-success` 等兄弟路由）：

```
const LOGIN_ENTRY_PATHS = new Set(['/auth/login', '/auth/register'])
```

- 不跳 `/oauth/github`、`/oauth/google` 回调页：它们走 SSR、且仅在主域上出现，本就不会在 ai 域被触发。
- **LinuxDo 例外说明**：LinuxDo 回调路径是 `/api/oauth/linuxdo`（带 `/api` 前缀，见 `oauth/linuxdo.go:70` 怪癖），会命中入口 `shouldProxyRequestPath('/api/*')` 反代分支、**走反代而非 SSR**，本就不在本跳转判定的覆盖范围内，无需特殊处理。

### 3.3 主域判定与豁免

复用 `api-proxy.ts:resolveCookieDomain`（L40-54）与本地豁免（L188-190）的既有风格，**先把 host 小写归一**：

- `host = new URL(request.url).hostname.toLowerCase()`；`siteHost = new URL(env.SITE_URL).hostname.toLowerCase()`。
- **本地开发豁免**（逐字对齐 `api-proxy.ts:188-190`，不要用"以 localhost 开头"这种模糊表述）：
  `host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')` → **不跳**。
- **主域判定**：`host === siteHost || host.endsWith('.' + siteHost)` → 属于主域 → **不跳**。
  - `nbility.dev`、`beta.nbility.dev`、`www.nbility.dev` → 属于主域 → **不跳**。
  - `nbility.ai`、`www.nbility.ai` → 不属于 → **跳**。
- 端口无影响：`new URL(...).hostname` 已剥离端口（`localhost:3000` → `localhost`）。

### 3.4 跨域 `return_to` 的处理

`return_to` 指向 ai 域（如 `https://nbility.ai/console`）时，在主域登录成功后**不应**据此跳回 ai —— 因为会话 cookie 只在 `.nbility.dev`，跳回 ai 会立即回到未登录态。本设计的取舍是：登录成功后用户**停在主域**（默认落 `/console`），**忽略跨域 `return_to`**；同域 `return_to` 行为不变。实现登录成功后跳转的代码须对 `return_to` 做同域校验（拒绝/忽略外域目标），此点列入走查（§6）。

### 3.5 不改的部分

- 后端 Go：**零改动**。
- OAuth 平台（GitHub / Google / LinuxDo）后台：**零重配**，沿用现有主域配置。
- 前端登录/注册组件、`auth.ts:getSiteUrl()`、`api-client/*`：**零改动**（`return_to` 同域校验若已存在则复用，见 §3.4）。

## 4. 测试

单元测试（沿用 `src/server/*.test.ts` 风格）覆盖跳转判定函数：

- `nbility.ai` + `/auth/login` → 跳，目标 `https://nbility.dev/auth/login`，query 透传。
- `nbility.ai` + `/auth/register?aff=abc` → 跳，`aff` 保留。
- `Nbility.AI`（大写）+ `/auth/login` → 跳（验证小写归一）。
- `www.nbility.ai` + `/auth/login` → 跳。
- `nbility.dev` / `beta.nbility.dev` / `www.nbility.dev` + `/auth/login` → 不跳。
- `localhost` / `127.0.0.1` / `[::1]` / `x.localhost` + `/auth/login` → 不跳。
- `localhost:3000` + `/auth/login` → 不跳（验证端口剥离）。
- `nbility.ai` + 非登录路径（`/console`、`/`、`/auth/login-help`）→ 不跳（验证精确匹配）。
- `SITE_URL` 缺失/非法 → 不跳、放行 SSR（验证兜底不 500）。
- `SITE_URL` 带尾斜杠（`https://nbility.dev/`）→ 目标无双斜杠。

## 5. 范围边界

- **仅** `nbility.ai` → 主域 的登录/注册入口跳转。
- 不处理 Discord / OIDC / 自定义 generic 登录（用户未涉及；它们的 redirect_uri 硬锁后端 `ServerAddress`，与本设计无关）。
- 不实现跨域会话回传（方案 B），不实现按 host 选凭证（方案 A）。

## 6. 走查点（高危）

1. 302 发生在 SSR 渲染前（worker 入口层，**非**路由 `beforeLoad`），否则用户会看到 ai 登录页闪一下再跳。
2. query 参数（尤其 `aff`、`return_to`）无损透传。
3. `beta.nbility.dev`、`www.*`、`localhost`/`127.0.0.1`/`::1` 不被误伤（豁免生效）。
4. 登录成功后跳转代码对 `return_to` 做同域校验，忽略指向 ai 域的外域目标（§3.4），否则会跳回未登录态。
5. `SITE_URL` 异常时入口层不 500（§3.1 兜底放行 SSR）。
6. 登录成功后用户停在主域属预期行为，需在产品/运营侧知会，避免被当作 bug。

## 7. 未来切换主域 Migration Checklist

当决定把 `nbility.ai`（或其他域）扶正为主域时，按"躲不掉"程度排序需要改的地方：

### 7.1 OAuth 平台后台（**必改，与代码无关**）
- GitHub OAuth App：回调改为 `https://<新主域>/oauth/github`。
- Google OAuth：已授权重定向 URI 加/换为 `https://<新主域>/oauth/google`。
- LinuxDo OAuth App：回调改为 `https://<新主域>/api/oauth/linuxdo`（注意现存 `/api` 前缀怪癖，须逐字一致，见 `oauth/linuxdo.go:70`）。

### 7.2 worker env / wrangler 配置（改配置，非改代码）
- `SITE_URL` → `https://<新主域>`。
- `COOKIE_DOMAIN` → `.<新主域>`（及 wrangler vars 中对应项）。
- `API_ORIGIN`（若 API 域也迁移则一并改）。
- wrangler.jsonc 的自定义域绑定。

### 7.3 后端配置（改配置，非改代码；仅当用到这些登录方式）
- 系统设置 `ServerAddress` → `https://<新主域>`：影响 OIDC / Discord / 自定义 generic 的 redirect_uri（`oauth/oidc.go:67`、`oauth/discord.go:65`、`oauth/generic.go:105` 硬锁此值）。

### 7.4 前端代码（**零改动**，前提是本设计落地）
- 本设计的跳转逻辑面向 `env.SITE_URL` 动态判定，**不写死** dev/ai。改完 7.2 的 `SITE_URL` 后，跳转方向自动反转（变为旧主域登录入口跳新主域），前端代码无需改动。
- **前提**：新主域绑定至同一个 worker（见 7.2 wrangler 自定义域），跳转逻辑才能在同一入口生效。
- 若届时希望**两域名都能独立 OAuth 登录**（真并存，而非单主域），则需升级到本文档 §2 的方案 A 或方案 B —— 那才需要改后端。

### 7.5 验证
- 在新主域走通 GitHub / Google / LinuxDo 三种登录。
- 确认旧主域登录入口正确跳到新主域、query 透传。
- 确认 cookie 种到新主域、会话有效。
