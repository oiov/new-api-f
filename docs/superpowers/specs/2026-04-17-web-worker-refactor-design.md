# web-worker 前端重构设计（MVP）

> Status: Draft for approval
> Date: 2026-04-17
> Authors: Claude (planner), operator (m4o4w7)
> Scope: 将 `web-worker/` 模板改造为 nbility 新前端 MVP，替代 `web/` 的 C 端控制台部分。管理员路由延后。
> Implementer: Codex（按 §5 切片顺序执行，人肉+Claude 审查）

---

## 目录

- §1 · 整体架构
- §1a · 未来迁移清单（beta → 主域）
- §2 · 目录结构 + 模板裁剪
- §3 · 认证流程 + SSR 路由守卫
- §4 · 页面级规格
- §5 · Codex 切片与交付顺序
- §6 · MVP 接口总账
- §7 · 请求体对齐策略（硬规则）
- §8 · 协作规则摘要

---

## §1 · 整体架构

### 部署拓扑

```
┌──────────────────────────────────────────────────────────────────────┐
│  beta.nbility.dev  (Cloudflare Workers, TanStack Start SSR)          │
│                                                                      │
│   /                         → Landing 占位                           │
│   /auth/login · register …  → 登录 / 注册 / 忘记密码 / OAuth 回调页  │
│   /console                  → 数据看板（SSR 首屏）                   │
│   /console/token            → 令牌管理                               │
│   /console/package          → 套餐管理                               │
│   /console/log              → 使用日志                               │
│   /console/topup            → 充值 / 兑换                            │
│   /console/invite           → 邀请拉新                               │
│   /console/personal         → 个人中心                               │
│                                                                      │
│   /api/*     → Worker 反代到 https://api.nbility.dev/*               │
│               · 注入 Fish-X-Code-User header                         │
│               · 重写 Set-Cookie 的 Domain / SameSite / Secure         │
│               · 注入 X-Frontend: beta                                │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                api.nbility.dev  (Go 后端，不改)
```

### 选型决定

| 决定 | 结论 |
|---|---|
| 运行时 | 保留 TanStack Start（Cloudflare Workers SSR），但 Better Auth / D1 / Stripe / Resend / R2 / Drizzle 全部移除 |
| 认证 | 沿用 Go 后端的 gin-sessions cookie；前端不签 token。Worker 同时写一个 `nbility_uid`（前端可读）供客户端注入 `Fish-X-Code-User` header |
| API 代理 | 所有 `/api/*` 经 Worker 反代到 `api.nbility.dev`；前端代码永远写相对路径 |
| 登录方式（MVP） | 账密 + 邮箱验证码注册 + GitHub OAuth + 忘记密码；2FA 登录分支保留但不做设置页 |
| i18n | 中文 + 英文 |
| UI 库 | shadcn/ui + Tailwind v4 + `@tabler/icons-react`（按模板走） |
| 代码位置 | 直接在 `./web-worker` 原地改造 |
| 协作 | Claude 写 plan，Codex 按切片写代码 |

---

## §1a · 未来迁移清单（beta.nbility.dev → 主域）

为了让将来切换主域时用户不用重登、不需要切换 OAuth 配置，MVP 阶段预埋以下决策：

### 必须在 MVP 就做对的事

1. **Cookie 父域**：所有 cookie（`session`、`nbility_uid`、`oauth_state` 等）一律 `Domain=.nbility.dev`（父域），不种 `Domain=beta.nbility.dev`。Worker 反代层统一改写。
2. **Cookie 前缀**：用 `__Secure-` 不用 `__Host-`（后者禁止写 Domain 属性，与父域策略冲突）。MVP 可先不强制前缀但属性必须齐：`HttpOnly; Secure; SameSite=Lax`。
3. **站点域名零硬编码**：所有 `beta.nbility.dev` 字面量只出现在 `wrangler.jsonc` 与 `src/env/*.ts`；代码里一律从 `websiteConfig.url` / `env.SITE_URL` 读取。
4. **API 反代目标变量化**：`API_ORIGIN` 放 wrangler env；前端代码永远只写相对 `/api/*`。
5. **GitHub OAuth 回调**：采用**方案 B**——注册 GitHub OAuth App 时用 `https://beta.nbility.dev/auth/oauth/github/callback`，前端回调页内部 `fetch('/api/oauth/github?code=&state=')` 调后端（见 §3.4）。切主域时：要么在 GitHub 侧换 callback URL（需配置两个 OAuth App，env 切换 client_id），要么使用固定中转域名 `auth.nbility.dev`。推荐**前期就注册两个 OAuth App**（beta / prod）。
6. **CSP `connect-src`** 从第一天就写 `'self' https://*.nbility.dev`。
7. **环境判别**：用 `VITE_ENV=beta|prod` 驱动 dev-only 菜单等分支；严禁 `window.location.hostname` 判断。

### 迁移日执行清单（将来用）

- [ ] DNS：主域 A/AAAA 指向 Workers
- [ ] `wrangler.jsonc`：主域 route 加入；beta route 保留 14 天做 301
- [ ] Env 切换：`SITE_URL`、`VITE_SITE_URL`、GitHub OAuth `client_id/secret`（若用双 App 方案）
- [ ] **后端 admin 后台**：`system_setting.ServerAddress` 改主域（影响邮件里的 reset 链接）
- [ ] **后端 admin 后台**：GitHub OAuth 客户端若重注册，更新 `GitHubClientId/Secret`（或直接改 GitHub App 的 callback URL）
- [ ] sitemap / robots / manifest / canonical / og:url 跟随 `SITE_URL` 自动变
- [ ] CSP `connect-src` 若收紧过需放开
- [ ] **用户登录态不断**：因 cookie 种在 `.nbility.dev`，继承无损
- [ ] 14 天后删除 beta route

---

## §2 · 目录结构 + 模板裁剪

### 2.1 删除（全栈能力）

```
web-worker/
├── src/
│   ├── auth/              ❌ Better Auth
│   ├── db/                ❌ Drizzle + D1
│   ├── payment/           ❌ Stripe
│   ├── mail/              ❌ Resend
│   ├── storage/           ❌ R2
│   ├── newsletter/        ❌
│   ├── notification/      ❌ Discord/Feishu
│   ├── api/               ❌ 所有 createServerFn 业务
│   ├── middlewares/       ❌ Better Auth 中间件
│   ├── routes/{api,admin,blog,(legals),(tests),dashboard*,settings*}
│   └── components/{admin,affiliate,blog,changelog,dashboard,markdown,page,
│                   payment,pricing,roadmap,settings,waitlist,chatbox,
│                   newsletter,contact}   ❌
├── content/               ❌
├── drizzle.config*.ts     ❌
├── content-collections.ts ❌
└── src/mail/templates/    ❌
```

### 2.2 保留

- `src/components/{ui,data-table,layout,theme,shared,analytics}`
- `src/config/website.ts`（精简为品牌 + URL + i18n 默认 + OAuth 开关）
- `src/env/{client,server}.ts`（按新变量改）
- `src/lib/{utils,routes,seo,formatters}`
- `src/router.tsx`、`src/start.tsx`、`routeTree.gen.ts`
- `src/styles.css`、`vite.config.ts`、`biome.json`、`tsconfig.json`
- `wrangler.jsonc`（重写 env、routes、bindings）

### 2.3 新增

```
src/
├── api-client/                  对 Go 后端 DTO 的 TS 绑定
│   ├── client.ts                fetch 封装 + 401 跳登录 + ApiError
│   ├── types.ts                 DTO 类型（每个带 source 注释与 @quirk 标签）
│   ├── schemas.ts               Zod schema（写操作请求体用）
│   ├── auth.ts                  login/logout/register/send-code/reset
│   ├── user.ts                  self/update/groups/access-token/bindings
│   ├── tokens.ts
│   ├── logs.ts
│   ├── topup.ts
│   ├── invite.ts
│   ├── package.ts               subscription endpoints
│   └── dashboard.ts             status/notice/data.self
│
├── server/
│   ├── api-proxy.ts             /api/* 反代（cookie 重写 / header 注入）
│   ├── cookies.ts               cookie 读写助手
│   ├── auth-guard.ts            SSR beforeLoad helper
│   └── oauth.ts                 /auth/oauth/github/callback handler
│
├── routes/
│   ├── __root.tsx               精简；公共 shell 由 console.tsx 接管
│   ├── index.tsx                Landing 占位；已登录跳 /console
│   ├── auth/
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx  发重置邮件入口
│   ├── user/
│   │   └── reset.tsx            ← 邮件 reset 链接落点（{ServerAddress}/user/reset?email=&token=）
│   │                              挂载即 POST /api/user/reset 拿新密码展示，对齐旧版 /user/reset
│   ├── oauth/
│   │   └── github.tsx           ← GitHub App 回调落点（{SITE_URL}/oauth/github?code=&state=）
│   │                              挂载即 fetch /api/oauth/github，对齐旧版 /oauth/github
│   └── console.tsx              父路由：beforeLoad 守卫 + shell
│       └── console/
│           ├── index.tsx        Dashboard
│           ├── token.tsx
│           ├── package.tsx
│           ├── log.tsx
│           ├── topup.tsx
│           ├── invite.tsx
│           └── personal.tsx
│
├── components/
│   ├── console/                 shell（sidebar / topbar / user-menu / quota-pill）
│   ├── token/                   tokens-table / create-sheet / copy-dialog / cc-switch
│   ├── log/
│   ├── topup/                   redeem-card / pay-tabs / records-tabs
│   ├── invite/                  invite-card / aff-stats / reward-table
│   ├── package/                 plan-card / my-subscriptions / consume-log
│   └── personal/                5 个 tab 的卡片
│
├── hooks/
│   ├── use-auth.ts              useQuery(['me'])
│   └── use-api.ts
│
└── i18n/
    ├── config.ts
    └── locales/{zh,en}.json
```

### 2.4 关键约束

- 前端 fetch **全部走相对 `/api/*`**；严禁硬编码 `api.nbility.dev`。
- 所有公开 URL 通过 `websiteConfig.url` 拼接。
- 设计语言严格按模板（`DashboardLayout`/`Card`/`data-table`/`Sheet`/shadcn 组件），见 §4.8。

---

## §3 · 认证流程 + SSR 路由守卫

### 3.1 关键事实（以 Go 代码为准）

Go 后端 `main.go:181-189` 的 session 配置：
- `gin-contrib/sessions` + `cookie.NewStore([]byte(SessionSecret))`
- cookie 名 `session`，`MaxAge=2592000`, `HttpOnly=true`, `Secure=false`, `SameSite=Strict`, `Path=/`

`middleware/auth.go:33-98` 的 `UserAuth` 要求：
- ① session cookie 有 id/username/role/status；或 ② `Authorization: <access_token>`；
- **并且** 请求带 `Fish-X-Code-User: <id>`（legacy alias `New-Api-User`），值等于 id。

### 3.2 Cookie 合约（Worker 反代重写后）

```
session         (HttpOnly; Secure; SameSite=Lax; Domain=.nbility.dev; Path=/; Max-Age=2592000)
nbility_uid     (Secure; SameSite=Lax; Domain=.nbility.dev; Path=/; 非 HttpOnly —— 供客户端 JS 注 header)
__Secure-oauth_state   (HttpOnly; Secure; SameSite=Lax; Domain=.nbility.dev; Path=/; 短期)
```

Worker 反代层职责：
1. 请求侧：若有 `nbility_uid`，自动注入 `Fish-X-Code-User: <uid>` 和 `New-Api-User: <uid>`；注入 `X-Frontend: beta`。
2. 响应侧：若上游 `Set-Cookie: session=...`，重写为 `Domain=.nbility.dev; SameSite=Lax; Secure`；登录/注册成功时额外 `Set-Cookie: nbility_uid=<data.id>; ...`（id 从响应 JSON 里抽）。
3. 对 `GET /api/user/logout` 的响应，Worker 追加清 `nbility_uid` 的 `Set-Cookie`。

### 3.3 客户端调用

```ts
// src/api-client/client.ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  const body = await r.json();               // 注意：HTTP 都是 200，判 success
  if (!body.success) {
    if (/未登录|登录已过期/.test(body.message)) {
      window.location.href = '/auth/login?expired=1';
    }
    throw new ApiError(body.message, body);
  }
  return body.data as T;
}
```

### 3.4 GitHub OAuth 流程

**回调路径约束**：后端 `oauth/github.go:56-90` 的 `ExchangeToken` **不传 `redirect_uri`**，依赖 GitHub OAuth App 侧注册的 callback URL。而旧版前端 `web/src/App.jsx:292` 已在 `/oauth/github` 注册了 callback 页。若要与旧版共用同一个 OAuth App（推荐，省掉切换成本），**新前端必须也把 GitHub callback 页放在 `/oauth/github`**。

后端 `controller/oauth.go:44-130` 的 `HandleOAuth` 返回 **JSON 不是 302**，所以 GitHub 不能直接回跳到 `/api/oauth/github`（用户会看到 raw JSON）。

正确流程：

1. 登录页 GitHub 按钮 → `GET /api/oauth/state?aff=<optional>` 拿 state（后端同时 session 存 state）
2. `window.location = https://github.com/login/oauth/authorize?client_id=...&redirect_uri={SITE_URL}/oauth/github&state=<state>&scope=user:email`
3. GitHub 重定向 → `/oauth/github?code=&state=`（**前端页面**）
4. 页面 mount 即 `fetch('/api/oauth/github?code=&state=')`，Worker 反代到后端，后端校验 state + exchange token + 创建/登录用户 + `setupLogin` 种 session cookie + 返 JSON
5. 前端读响应 `success=true`，`router.navigate({ to: '/console' })`

> 切主域时：GitHub App 改 callback URL 到新主域；或注册第二个 App（spec §1a 方案 A）。

### 3.5 SSR 守卫

```ts
// src/routes/console.tsx
export const Route = createFileRoute('/console')({
  beforeLoad: async ({ location, context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ['me'],
        queryFn: () => apiFetch<User>('/user/self'),
        staleTime: 60_000,
      });
    } catch {
      throw redirect({
        to: '/auth/login',
        search: { return_to: location.href },
      });
    }
  },
  component: ConsoleShell,
});
```

SSR 时 `apiFetch` 运行在 Worker 内部；为避免 fetch loop，`client.ts` 检查 `import.meta.env.SSR` 直接调 `env.API_ORIGIN + path`，并从入口 request 的 Cookie header 中取 `session` 传进上游。

### 3.6 2FA 登录分支（MVP 必做）

- `POST /api/user/login` 可能返 `data:{ require_2fa: true }`。此时：
  - 后端已写 `session.pending_user_id` 到 cookie（**是半登录态 session**）
  - 响应 body **没有 `data.id`** → Worker **不要写 `nbility_uid`**（还没完成登录）
  - Worker **必须**把 upstream 的 `Set-Cookie: session=...` 正常写回浏览器（Domain/SameSite 重写规则照常）
- 前端切到 2FA 输入态（`Verify2FARequest: { code }`），POST `/api/user/login/2fa`。浏览器会自动带上半登录态 session cookie。
- 后端 `controller/twofa.go:482-486` 清 pending 字段并调 `setupLogin`，响应体里才有 `data.id` → Worker 此时写 `nbility_uid`。
- 错误（`验证码错误`、`会话已过期`）按正常 JSON 返回，前端 toast。

### 3.7 CSRF 兜底

- SameSite=Lax 阻断大部分跨站 POST。
- Worker 反代层对 `POST/PUT/PATCH/DELETE` 校验 `Origin ∈ {SITE_URL}`，不匹配 403。

---

## §4 · 页面级规格

### 4.0 页面 shell（所有 console 页共用）

参照模板 `DashboardLayout`（面包屑 + h1 + muted description + children）：
- Sidebar：Dashboard / 令牌 / 套餐 / 日志 / 充值 / 邀请 / 个人中心 七项
- Topbar：分组 badge、余额胶囊（跳 `/console/topup`）、主题切换、语言切换、用户菜单（头像 / 个人中心 / 登出）
- 移动端：顶栏 + 底部抽屉

### 4.1 `/console` · Dashboard

**数据**：`/api/status` + `/api/notice` + `/api/user/self` + `/api/data/self` + `/api/log/self/stat`

**UI**：
- 4 × SectionCards（剩余额度 / 已用额度 / RPM / TPM）
- ChartAreaInteractive（时间范围 7d/30d，来源 `/api/data/self`，≤ 1 个月）
- 公告卡（Markdown from `/api/notice`）
- API Info 卡（`/api/status.api_url` + 用户 group + 复制按钮）

### 4.2 `/console/token` · 令牌管理 ★

**接口**：见 §6 Token 段。

**列表**：基于模板 `data-table`；列 name/status/group/used_quota/remain_quota/expired_time/created_time/actions；分页 + keyword + 状态筛选 + 分组筛选；批量选择。

**行 Actions**：查看 key（`POST /api/token/:id/key`）/ 复制 / 编辑 / 启用禁用（PUT `status`）/ 删除 / 切换 Claude Code。

**Create/Edit Sheet（★ 完整复刻 `EditTokenModal.jsx`）**：

| 字段 | 类型 | 备注 |
|---|---|---|
| `name` | string, ≤50 | 必填 |
| `unlimited_quota` | switch | |
| `remain_quota` | int | 即便 unlimited 也要发；含预设按钮 |
| `expired_time` | `-1 \| unix_seconds` | 快捷：+1 月 / +1 天 / +1 时 / +30 分 / 永不过期 |
| `model_limits_enabled` | bool | **由前端按 `model_limits` 是否非空自动置位** |
| `model_limits` | CSV string | 多选器用 `/api/user/models`，分类 icon 走 `helpers/providerIcons` TS 迁移版 |
| `allow_ips` | string (multiline) | |
| `group` | string | 来源 `/api/user/self/groups` |
| `cross_group_retry` | bool | |
| `tokenCount` | int (1-50, 前端独有) | 批量创建前端循环 POST，第 2 条起 name 拼 `-<随机后缀>` |

提交时（严格对齐旧版 `EditTokenModal.jsx:239-271`）：
- `model_limits` 提交前 `join(',')` 成 string
- `model_limits_enabled = model_limits.length > 0`
- `expired_time` 若非 -1，`Math.ceil(Date.parse(x)/1000)`
- `remain_quota` `parseInt`
- `tokenCount` 剥离，不发

**二级弹窗**：
- CopyTokensModal：sk- key 一次性展示 + cURL / .env / QR
- CCSwitchModal：Claude Code 一键切换配置
- DeleteTokensModal：批量删除二次确认

### 4.3 `/console/package` · 套餐管理

**接口**：`/api/subscription/plans` + `/api/subscription/self` + `.../self/consume_logs` + `.../self/preference` + `.../self/subscriptions/:id/action` + `.../{epay,stripe,creem}/pay`。

**UI**：
- 顶部：我的订阅卡片（renders `subscriptions`；resource_type 徽标；续费/取消/设为首选按钮）
- 中部：浏览套餐 Grid（`plans`；discount badge、sold_out 灰化、max_purchase 约束、allowed_groups/models 摘要）
- 下部：消耗日志 tab
- 顶栏 Dialog：计费偏好（`PUT self/preference`）

### 4.4 `/console/log` · 使用日志

**接口**：`/api/log/self` + `/api/log/self/stat` + `/api/log/self/search` + `/api/log/self/export`（CSV）

**UI**：
- 顶部 stat 小卡（quota / rpm / tpm）
- 筛选栏：时间快捷 + 自定义、type、model、token_name、group、request_id、status_code、keyword
- data-table 分页；行展开看 content + other
- CSV 导出按钮（blob + createObjectURL）

### 4.5 `/console/topup` · 充值 / 兑换

**接口**：`/api/user/topup/info` + `/api/user/topup/self` + `/api/user/redemption/history/self` + `/api/user/topup` + `/api/user/{amount,pay,stripe/amount,stripe/pay,creem/pay,waffo/pay}`

**UI**：
- 进入先拉 topup/info，按开关渲染
- 左：兑换码卡（`POST /user/topup` body `{ key }`）
- 右：在线充值卡 · Tabs（EPay/Stripe/Creem/Waffo 动态）；选金额调 `{method}/amount` → 选支付方式 → `{method}/pay` → 跳转
- 下方 Tabs：充值记录 / 兑换记录

**注意**：`amount` 单位遵循 `/api/status` 里的 quota display type；TOKENS 模式下 amount 是 token 数，USD/CNY 模式下是金额。

### 4.6 `/console/invite` · 邀请拉新

**接口**：`/api/user/aff` + `/api/user/aff/details` + `/api/user/aff_transfer`

**UI**：
- 顶卡：邀请链接 `${SITE_URL}/auth/register?aff=<code>` + 复制 + QR Dialog
- 三连统计：已邀请 / 历史奖励总 / 可提现（`user.aff_quota`）+ 提现 Dialog
- Tab：已邀请用户 / 奖励记录 / 排行榜（分页分别用 `p+size` 和 `reward_p+reward_page_size`）

### 4.7 `/console/personal` · 个人中心

**接口**：`/api/user/self`（GET/PUT）+ `/api/verification` + `/api/oauth/email/bind` + `/api/user/oauth/bindings`（只返 custom providers）+ `/api/user/oauth/bindings/:provider_id`（DELETE，只对 custom providers）+ `/api/user/token`（重置 access token）

**Tabs**：
1. 基础资料（display_name / email / username 只读 / group）
2. 账号安全（`original_password + password` 改密码；邮箱换绑两步：发码 → `GET /oauth/email/bind`；密码重置入口）
3. 第三方绑定（仅 GitHub）
4. 系统访问令牌（`GET /api/user/token` 重置）
5. 账单概览（group / 总充值 / 总消耗）

**⚠️ GitHub 绑定受限**：
- 后端 `/api/user/oauth/bindings` **只返 custom OAuth providers**，不含内置 GitHub（`controller/custom_oauth.go:41-47, 444-465`）
- GitHub 绑定状态直接读 `user.github_id`（非空 = 已绑）
- 绑定：跳 GitHub OAuth 流，后端已登录 session 会走 `handleOAuthBind` 分支（`controller/oauth.go:66-72`）自动 bind
- **解绑仅限 admin**（`DELETE /api/user/:id/bindings/:binding_type`，`controller/user.go:650`）；用户自助无解绑接口
- MVP：Personal 页 GitHub 绑定 tab 只做"查看状态 + 绑定 / 未绑定跳转"；解绑按钮 disabled + tooltip "请联系管理员"

**MVP 不做**：Passkey、2FA 设置、Telegram/WeChat、删号、自助解绑第三方。

### 4.8 风格（硬约束）

按 web-worker 模板：
1. 页骨架 = `DashboardLayout`（breadcrumbs + h1 + muted desc + children）
2. shell 复用 `DashboardSidebar` + `SidebarMain` + `DashboardHeader`
3. 卡片 `Card`；设置类页用 `grid grid-cols-1 md:grid-cols-2 gap-8`
4. 表格统一用模板 `data-table`
5. Dialog vs Sheet：短表单用 Dialog，列表行详情/创建用右侧 Sheet
6. Form：`react-hook-form` + `zod` + shadcn `Form`
7. 图表：`recharts`（模板一致），**不引入 tremor/echarts**
8. 字体/间距/圆角：Bricolage Grotesque + Tailwind token
9. 暗色模式：用语义色（`bg-background/text-foreground`），不写死 hex
10. 图标：`@tabler/icons-react`，**不混用 lucide / semi-icons**

---

## §5 · Codex 切片与交付顺序

### Phase 0 — 基础设施（串行）

- **0.1** 模板裁剪（删 §2.1 所列；`pnpm install && pnpm build` 通过）
- **0.2** Worker 反代 + Cookie/Header 重写（`/api/*` forward / Set-Cookie 重写 / Fish-X-Code-User + X-Frontend 注入 / OAuth JSON 透传）
- **0.3** Env + site config（`API_ORIGIN / SITE_URL / COOKIE_DOMAIN / VITE_ENV`，严禁硬编码）
- **0.4** Console shell（父路由 + sidebar 菜单 7 项 + topbar）
- **0.5** api-client 核心（`client.ts` + `types.ts` + `schemas.ts` + `use-auth` + SSR guard）

### Phase 1 — 认证页（串行）

- **1.1** `/auth/login`（账密 + 2FA 分支 + GitHub 按钮）
- **1.2** `/auth/register`（邮箱 + `verification_code` + `aff_code`）
- **1.3** `/auth/forgot-password` + **`/user/reset`**（后者路径与邮件模板一致，挂载即 POST `/api/user/reset`，展示后端生成的新密码）
- **1.4** **`/oauth/github`**（路径与 GitHub OAuth App 注册的 callback 一致，挂载即 `fetch /api/oauth/github` + navigate `/console`）

### Phase 2 — Console 页（2.1-2.2 串行，2.3-2.7 可并行）

- **2.1** `/console/personal`（最小页，验证 shell + auth）
- **2.2a** Token 列表 + 行操作
- **2.2b** Token 创建/编辑 Sheet（★ 完整复刻 EditTokenModal）
- **2.2c** Token 二级弹窗（Copy/CC-Switch/Delete）
- **2.3** `/console` Dashboard
- **2.4** `/console/log`
- **2.5** `/console/topup`
- **2.6** `/console/invite`
- **2.7** `/console/package`

### Phase 3 — 打磨

- **3.1** i18n（zh/en，链 `PUT /api/user/self { language }`）
- **3.2** Landing `/` + `/user-agreement` + `/privacy-policy`
- **3.3** 错误/空态/404/Loading skeleton
- **3.4** CI/部署（wrangler 多环境 + GitHub Actions）

---

## §6 · MVP 接口总账

### 全局约定

- 所有接口 HTTP 200；错误也是 200 + `success:false`。**不能用 `res.ok` 判错**。
- 响应形状：`{ success: bool, message: string, data?: any }`
- 分页：query `p` + `page_size`（`ps` / `size` 是兼容别名，新前端统一用 `page_size`）；响应 `data = { page, page_size, total, items }`
- Worker 反代层统一注入 `Fish-X-Code-User: <nbility_uid>` + `X-Frontend: beta`

### 接口清单（按域）

**Auth & 公共**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/user/login` | POST | `{ username, password }` → 可能返 `data:{ require_2fa:true }` |
| `/api/user/login/2fa` | POST | `{ code }`（TOTP 或备用码） |
| `/api/user/register` | POST | `model.User` 镜像；含 `username/password/email?/verification_code?/aff_code?` |
| `/api/verification` | GET | `?email=` 发注册/换绑验证码 |
| `/api/reset_password` | GET | `?email=` 发重置邮件 |
| `/api/user/reset` | POST | `{ email, token }` → `data:"<后端生成新密码>"` |
| `/api/user/logout` | GET | 清 session |
| `/api/oauth/state` | GET | `?aff=` → `data:<state>` |
| `/api/oauth/:provider` | GET | `?code=&state=` **返 JSON**，非 302 |
| `/api/verify` | POST | `{ method, code? }` 二次验证 |
| `/api/status` | GET | 站点信息/功能开关/API base |
| `/api/notice` | GET | Markdown 公告 |
| `/api/user/self` | GET | User 完整对象 |
| `/api/user/self/groups` | GET | 当前用户可用分组 |
| `/api/user/models` | GET | 当前用户可用模型 |

**`/api/status` 关键字段**（`controller/misc.go:41-215`，完整 80+ 字段里新前端 MVP 会用到的）：

```ts
type StatusResponse = {
  version: string;
  start_time: number;
  system_name: string;
  logo: string;
  footer_html: string;
  server_address: string;                    // 后端 admin 配置的站点 URL（影响邮件链接）
  quota_per_unit: number;                    // tokens per 1 USD
  quota_display_type: 'TOKENS' | 'USD' | 'CNY';
  display_in_currency: boolean;              // 兼容旧字段
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  usd_exchange_rate: number;
  price: number;
  // 功能开关
  password_login_enabled: boolean;
  password_register_enabled: boolean;
  register_enabled: boolean;
  email_verification: boolean;
  invite_register_enabled: boolean;
  enable_data_export: boolean;
  enable_log_export: boolean;
  data_export_default_time: string;
  default_collapse_sidebar: boolean;
  default_use_auto_group: boolean;
  // OAuth（MVP 仅 GitHub）
  github_oauth: boolean;
  github_oauth_register: boolean;
  github_client_id: string;
  // Turnstile
  turnstile_check: boolean;
  turnstile_site_key: string;
  // 链接
  top_up_link: string;
  docs_link: string;
  // 控制台开关 + 内容
  api_info_enabled: boolean;
  announcements_enabled: boolean;
  faq_enabled: boolean;
  contact_channels: any;                     // 联系方式
  api_info?: any;                            // 仅当 api_info_enabled=true 存在
  announcements?: Array<{ ... }>;            // 仅当 announcements_enabled=true 存在
  faq?: Array<{ ... }>;                      // 仅当 faq_enabled=true 存在
  // 订阅推广横幅
  subscription_promo_enabled: boolean;
  subscription_promo_title?: string;
  subscription_promo_subtitle?: string;
  subscription_promo_button_text?: string;
  subscription_promo_button_link?: string;
  // 初始化
  setup: boolean;
  // 条款
  user_agreement_enabled: boolean;
  privacy_policy_enabled: boolean;
  // Token 测试默认值
  token_test_defaults: { claude_model: string; responses_model: string };
  // 其它（MVP 一般不用）
  mj_notify_enabled, wechat_*, telegram_*, discord_*, linuxdo_*, oidc_*, passkey_*,
  checkin_*, activity_lottery_*, custom_oauth_providers?...
};
```

**`/api/user/self` 响应**（`controller/user.go:421-476`，注意是自定义 map，**非 `model.User` 原型**）：

```ts
type SelfResponse = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: number;                              // 0=guest 1=common 10=admin 100=root
  status: number;                            // 1=enabled 2=disabled
  group: string;
  configured_group: string;
  effective_group: string;
  quota: number;
  used_quota: number;
  request_count: number;
  aff_code: string;
  aff_count: number;
  aff_quota: number;                         // 可提现邀请额度
  aff_history_quota: number;
  inviter_id: number;
  // 绑定 id（空串表示未绑）
  github_id: string;
  google_id: string;
  discord_id: string;
  wechat_id: string;
  telegram_id: string;
  oidc_id: string;
  linux_do_id: string;
  stripe_customer: string;
  // 设置
  setting: string;                           // ⚠️ JSON 字符串，前端自行 parse
  sidebar_modules: string;                   // 已从 setting 中提取
  permissions: {                             // 权限：UI 决定展示哪些菜单
    sidebar_settings: boolean;
    sidebar_modules: any;
  };
  site_notification_unread_count: number;
  // ⚠️ 没有 `access_token` 字段（隐私考量）；Personal 页看不到当前 token
  // ⚠️ 没有 `password` / `remark` 字段
  // ⚠️ 没有 `created_at` 字段
};
```

**`/api/user/login` 和 `/api/user/register` 成功响应**（`controller/user.go:115-128`，对比 SelfResponse 少很多字段）：
```ts
type LoginResponse =
  | { require_2fa: true }
  | { id, username, display_name, role, status, group, configured_group, effective_group };
```
登录成功后应立即调 `/api/user/self` 拿完整用户信息。

**Turnstile 合约**（`middleware/turnstile-check.go` + 旧 web `LoginForm.jsx:252`、`RegisterForm.jsx:330,357`）：
- 仅当 `status.turnstile_check=true` 时需要
- 用 query param `?turnstile=<widget_token>`，**不是 body 不是 header**
- 登录 / 注册 / 发邮箱验证码 三个接口都需要带
- 后端校验通过后会把 `session.turnstile=true` 设为会话级通过，同会话后续请求可不带
- MVP 若 beta env 关闭 `TurnstileCheckEnabled`，新前端可完全不渲染 widget

**URL `?aff=` 邀请码流**（`RegisterForm.jsx:126-211`）：
- `/auth/login?aff=xxx` 或 `/auth/register?aff=xxx` 页面挂载时：
  - 从 `window.location.search.aff` 读 → `normalizeInviteCode` → 存 `localStorage.aff`
- 注册表单用户也能手动填 `aff_code`
- 注册提交 body 的 `aff_code` 取值优先级：表单输入 > URL `aff` > `localStorage.aff`

**Personal（`/console/personal`）**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/user/self` | PUT | 改资料 / 改密码 / 改语言 / 改 sidebar_modules —— **都走这一个**；改密码用 `original_password + password` |
| `/api/oauth/email/bind` | GET | `?email=&code=` 换绑邮箱 |
| `/api/user/oauth/bindings` | GET | **只返 custom OAuth 绑定**（不含 GitHub/Google 等内置）；GitHub 状态看 `user.github_id` |
| `/api/user/oauth/bindings/:provider_id` | DELETE | **只能解绑 custom OAuth**；内置 GitHub 用户无自助解绑接口 |
| `/api/user/token` | GET | 重置 access token → `data:<新 token>` |

**Token（`/console/token`）**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/token/` | GET / POST / PUT | 列表 / 新增（无批量，前端循环）/ 更新 |
| `/api/token/:id` | GET / DELETE | |
| `/api/token/:id/key` | POST | `data:{ key }` |
| `/api/token/:id/test` | POST | |
| `/api/token/batch` | POST | 批量删除 |
| `/api/token/batch/invalid` | POST | 清理失效 |
| `/api/token/search` | GET `?keyword=` | |

Token 字段：`id, user_id, key, status, name, created_time, accessed_time, expired_time(-1=never), remain_quota, unlimited_quota, used_quota, model_limits_enabled, model_limits(CSV string), allow_ips, group, cross_group_retry, auto_group, source`

**Log（`/console/log`）**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/log/self` | GET | 分页；字段见 §6 |
| `/api/log/self/stat` | GET | `data:{ quota, rpm, tpm }` |
| `/api/log/self/search` | GET `?keyword=` | |
| `/api/log/self/export` | GET | **CSV**；带 `X-Export-Total` / `X-Export-Truncated` header |
| `/api/data/self` | GET `?start_timestamp=&end_timestamp=` | 按日聚合（≤ 1 个月） |

Log query 字段（名字要对）：`p,page_size,type,start_timestamp,end_timestamp,model_name,token_name,group,request_id,error_message,status_code,subscription_id,subscription_plan_id`

**Log type 枚举**（`model/log.go:86-95`，前端筛选器用）：
- `0` Unknown · `1` Topup · `2` Consume（默认）· `3` Manage · `4` System · `5` Error · `6` Refund · `7` Subscription
- 查询传 `0` 或省略 = 不限类型

**TopUp（`/console/topup`）**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/user/topup/info` | GET | 开关、`pay_methods`、`amount_options`、`discount` |
| `/api/user/topup/self` | GET | 充值记录分页 |
| `/api/user/redemption/history/self` | GET | 兑换记录分页 |
| `/api/user/topup` | POST | `{ key }` 兑换码 |
| `/api/user/amount` | POST | `{ amount }` → `data: "<金额 string>"` |
| `/api/user/pay` | POST | `{ amount, payment_method }` EPay |
| `/api/user/stripe/amount` · `/stripe/pay` · `/creem/pay` · `/waffo/pay` | POST | 同上结构 |

**`pay_methods` shape**（`setting/operation_setting/payment_setting_old.go:20-37` + `controller/topup.go:30-79`）：
```ts
type PayMethod = {
  name: string;      // 显示名（"支付宝"、"微信"、"Stripe"、"Waffo (Global Payment)"...）
  type: string;      // 提交时作为 payment_method 字段（"alipay"/"wxpay"/"stripe"/"waffo"/custom1...）
  color: string;     // CSS 颜色（旧版遗留，可忽略或按品牌色重新映射）
  min_topup?: string; // 可选，自定义通道可能有下限
};
```

**TopUp 记录字段**（`model/topup.go:16-28`）：
`id, user_id, amount, money, trade_no, payment_method, create_time, complete_time, status(pending/success/failed/cancelled), invoiced`

**Invite（`/console/invite`）**

| 接口 | 方法 | 备注 |
|---|---|---|
| `/api/user/aff` | GET | `data:<aff_code>`（首次访问自动生成） |
| `/api/user/aff/details` | GET | 分页 `p/size` 和 `reward_p/reward_page_size` |
| `/api/user/aff_transfer` | POST | `{ quota: int }` 提现到主额度 |

**Package（`/console/package`）**

| 接口 | 方法 |
|---|---|
| `/api/subscription/plans` | GET（公开） |
| `/api/subscription/self` | GET |
| `/api/subscription/self/conversion_campaign` | GET |
| `/api/subscription/self/conversion_campaign/request` | POST |
| `/api/subscription/self/consume_logs` | GET `?p=` |
| `/api/subscription/self/preference` | PUT |
| `/api/subscription/self/subscriptions/:id/action` | POST |
| `/api/subscription/self/subscriptions/:id/day_pass` | POST |
| `/api/subscription/self/subscriptions/:id/day_pass_plan` | POST |
| `/api/subscription/self/day_pass_plans/:id/cancel` | POST |
| `/api/subscription/{epay,stripe,creem}/pay` | POST |

**`/self` 响应关键嵌套结构**（`controller/subscription.go:207-253`）：
```ts
type SubscriptionSelfResponse = {
  billing_preference: string;
  preferred_subscription_id: number;
  subscriptions: SubscriptionSummary[];         // 仅当前激活
  all_subscriptions: SubscriptionSummary[];     // 含过期 / 取消
  manual_delivery_orders: SubscriptionManualDeliverySummary[];
  day_pass_plans: SubscriptionDayPassPlanSummary[];
};

type SubscriptionSummary = {
  subscription: UserSubscription;
  refund_order?: { order_id, trade_no, topup_id, payment_method, money, complete_time };
  aggregate_access_token?: { token_id, token_name, key_preview, expired_time, ... };
  dedicated_access_token?: { token_id, token_name, key_preview, expired_time, ... };
};

type UserSubscription = {                       // model/subscription.go:584-632
  id: number; user_id: number; plan_id: number;
  amount_total: number; amount_used: number;    // quota 单位
  resource_type: 'quota' | 'request_count';
  request_count_total: number; request_count_used: number;
  request_count_period_total: number; request_count_period_used: number;
  reset_period: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  duration_unit: 'year' | 'month' | 'week' | 'day' | 'hour' | 'custom';
  duration_value: number;
  start_time: number; end_time: number;
  status: 'active' | 'expired' | 'cancelled';
  source: 'order' | 'admin';
  upgrade_group: string;
  aggregate_enabled: boolean;
  last_reset_time: number; next_reset_time: number;
  created_at: number; updated_at: number;
  // 其它 source_order_* 字段略
};
```

**`/self/subscriptions/:id/action` body + action 枚举**（`controller/subscription.go:590-604`, `model/subscription.go:5850-5853`）：
```ts
type UserSubscriptionActionRequest = {
  action: 'enable_aggregate_access' | 'disable_aggregate_access'
        | 'set_preferred' | 'clear_preferred';
  value: number;  // 大多数 action 不需要，传 0
};
```
其它 `extend_period` / `reduce_period` / `extend_days` / `reduce_days` / `reset_usage_now` 是 admin 专用，普通用户 403。

### MVP 明确不做

- 管理员侧所有 admin 分支接口
- Passkey / 2FA 设置（登录分支保留）
- 签到 / 抽奖 / 发票 / 站内通知
- 微信 / Telegram / Discord / 自定义 OAuth
- Chat / Playground / Midjourney / R2 前台

---

## §7 · 请求体对齐策略（硬规则）

### 7.1 铁律

**新前端对任何写操作（POST / PUT / DELETE / 带副作用的 GET）发出的请求，请求行、query、headers、body 必须与旧版 `web/` 提交完全一致**——字段名、字段类型、编码方式都不得改动。

如果发现旧版有"不合理"的做法（比如 `model_limits` 是 CSV 不是数组），也照抄。要改必须改后端 + 两端一起改，**不得单边创新**。

### 7.2 已识别怪癖（切片必读）

| 领域 | 怪癖 | 来源 |
|---|---|---|
| Token | `model_limits` 提交是 **CSV string** | `web/.../EditTokenModal.jsx:261` |
| Token | `model_limits_enabled` 按 `model_limits` 非空**自动置位** | 同上 :262 |
| Token | `expired_time` 是 unix 秒 int；`-1` = 永不 | 同上 :252-260 |
| Token | `remain_quota` 是 int，即便 unlimited 也要发 | 同上 :250 |
| Token | **无批量接口**；前端循环 POST，第 2 条起 name 拼 `-<suffix>` | 同上 :239-271 |
| Token | `tokenCount` 前端独有，提交前 strip | 同上 :242 |
| Register | 邀请人 code 字段名是 **`aff_code`** | `model/user.go:45` |
| Register | 邮箱验证码字段名是 **`verification_code`** | `model/user.go:39` |
| UpdateSelf | 改密码字段名 **`original_password + password`** | `controller/user.go:783` |
| UpdateSelf | 改语言/sidebar 走同一个 PUT，body `{ language }` 或 `{ sidebar_modules }` | `controller/user.go:696-750` |
| Reset password | body `{ email, token }`；**不含新密码**；新密码在响应 `data` | `controller/misc.go:386-419` |
| Aff transfer | body `{ quota }`（不是 amount） | `controller/user.go:347-349` |
| Redeem | body `{ key }`（不是 code） | `controller/user.go:1091-1093` |
| Pay | `{ amount, payment_method }`；amount 单位跟 `/status` display type | `controller/topup.go:103-145` |
| `/user/amount` | 返 `data:"<string>"` | `controller/topup.go:405` |
| Log query | `type/token_name/model_name/start_timestamp/...` 下划线风格 | `controller/log.go:16-56` |
| 2FA login body | **`{ code }`** 字段名 | `controller/twofa.go:22-24` |
| `/api/verify` | `{ method, code? }` | `controller/secure_verification.go:25-28` |
| 邮箱换绑 | **GET** `?email=&code=`，不是 POST | `controller/user.go:1060-1089` |
| 分页 query | **`p` + `page_size`**（`ps` / `size` 是兼容别名，旧 token 页走 `size`，新前端统一 `page_size`） | `common/page_info.go:41-79` |
| Turnstile 参数位置 | **query `?turnstile=<widget_token>`**；登录/注册/发邮箱验证码 三个接口；会话级通过后同会话后续免带 | `middleware/turnstile-check.go:26`, `web/LoginForm.jsx:252`, `RegisterForm.jsx:330,357` |
| `?aff=` 邀请流 | URL `?aff=xxx` → `localStorage.aff` → 注册 body `aff_code`；优先级：表单 > URL > localStorage | `web/RegisterForm.jsx:126-211` |
| 2FA 半登录 cookie | `/login` 返 `require_2fa:true` 时后端已写 `session.pending_user_id`；Worker 必须原样写回浏览器，**此时不写 `nbility_uid`**；`/login/2fa` 成功后 setupLogin 才有 `data.id`，Worker 在那一步写 `nbility_uid` | `controller/user.go:63-85`, `controller/twofa.go:482-486` |
| Log type 枚举 | `0 unknown / 1 topup / 2 consume / 3 manage / 4 system / 5 error / 6 refund / 7 subscription`；`type=0` = 不限 | `model/log.go:86-95` |
| `User.access_token` 字段 | JSON 类型是 `string \| null`（Go `*string`）；为空时为 `null` 不是 `""` | `model/user.go:40` |
| `User.setting` 字段 | 是 JSON string，**不是** JSON object；前端自行 `JSON.parse` | `model/user.go:52` |

### 7.3 三层防线

**防线 1 · `src/api-client/types.ts` 契约文件**
- 每个 DTO 顶部注释 `// source: <go 文件>:<func>`
- 字段带 `@quirk` 标签：`@quirk csv-string` / `@quirk unix-seconds` / `@quirk -1=never` / `@quirk int-even-when-unlimited`
- 写请求类型独立定义（`CreateTokenRequest` 等），不复用 Go Model 的 TS 镜像

**防线 2 · `src/api-client/schemas.ts` Zod 守门**
- 每个写操作函数用 Zod `parse`（不是 `safeParse`）；schema 把怪癖固化进去
- 类型 `z.infer` 导出，防 TS 和 schema 漂移

示例：
```ts
const ModelLimits = z.string().regex(/^[a-zA-Z0-9.,\-_/]*$/);   // CSV
const ExpiredTime = z.union([z.literal(-1), z.number().int().positive()]);
export const CreateTokenRequest = z.object({
  name: z.string().min(1).max(50),
  remain_quota: z.number().int(),
  unlimited_quota: z.boolean(),
  expired_time: ExpiredTime,
  model_limits_enabled: z.boolean(),
  model_limits: ModelLimits,
  allow_ips: z.string(),
  group: z.string(),
  cross_group_retry: z.boolean(),
});
```

**防线 3 · 交付时抓包对比**
- Codex 每个涉及写操作的切片，交付时必须附"请求对比表"：旧版 DevTools 抓取 vs 新版实际发送，逐字段 diff = 0。
- 若后端要求变了，Claude + 用户决定是否两端改，**Codex 不得单边调整**。

### 7.4 高危接口（强制双人走查）

1. `POST /api/token/` — remain_quota 单位错会泄露大额度
2. `PUT /api/user/self` — 宽松 map 解析；漏字段可能清空 display_name
3. `POST /api/user/topup` — 兑换码错格式会污染日志
4. `POST /api/user/aff_transfer` — quota 单位错误
5. `POST /api/user/{epay,stripe,creem,waffo}/pay` — amount 单位跟 display type 耦合
6. `POST /api/subscription/{...}/pay` — 同上
7. `PUT /api/subscription/self/preference` — billing preference 错切

### 7.5 X-Frontend marker

Worker 反代层对所有 `/api/*` 请求注入 `X-Frontend: beta`。
- Go 后端侧可在 access log 加这个字段区分新旧流量
- 出问题时可针对性限流或回退

---

## §8 · 协作规则摘要

### Claude（规划）

- 维护 `docs/superpowers/specs/<date>-*-design.md` 和实施计划
- 每个切片开工前给 Codex 交代：范围 / 前置 / 接口核实状态 / 验收
- 审查 Codex 产出的请求对比表；不对齐不放行

### Codex（实施）

- 按切片顺序实施，不超纲（不得跨切片改动共享代码）
- 每个切片开工前，对涉及接口必须 grep 对应 `controller/*.go` + `model/*.go` 确认签名与字段
- 写操作必须：
  - DTO 来源注释指向 Go 文件
  - Zod schema 固化怪癖
  - 交付时附请求对比表
- 设计语言严格遵守 §4.8；不得混用 UI 库
- 单切片每次交付 1-2 个 review-friendly commit
- Cloudflare Workers 不能用 Node-only API

### 用户（裁决）

- 审查 Claude 的 plan 与 Codex 的切片交付
- 高危接口（§7.4）双人走查
- 接口形状冲突时由用户最终拍板

---

## 附录 A · 环境变量

| Var | 作用 | Scope |
|---|---|---|
| `API_ORIGIN` | Go 后端地址（如 `https://api.nbility.dev`） | Worker env |
| `SITE_URL` | 前端站点 URL（如 `https://beta.nbility.dev`） | Worker env |
| `COOKIE_DOMAIN` | Cookie 父域（`.nbility.dev`） | Worker env |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client id | Worker secret |
| `VITE_SITE_URL` | 构建时站点 URL | Vite env |
| `VITE_ENV` | `beta` / `prod` | Vite env |

## 附录 B · 前期已落地的结论（原本预留给 Codex grep，已提前验证）

| 原问题 | 结论 | 源 |
|---|---|---|
| `middleware.TurnstileCheck` 在 env 关闭时是否豁免 | ✅ **是**。`middleware/turnstile-check.go:19` 只在 `common.TurnstileCheckEnabled=true` 时才校验，否则直接 `c.Next()`。MVP 前提：beta env 必须在后台关 Turnstile 开关。Turnstile token 通过 **query `?turnstile=...`** 传（非 header） | `middleware/turnstile-check.go:17-81` |
| 后端邮件模板的跳转 URL 配置来源 | ✅ **来自 admin 后台 `system_setting.ServerAddress`**。密码重置邮件正文：`fmt.Sprintf("%s/user/reset?email=%s&token=%s", system_setting.ServerAddress, email, code)`。**运维任务**：MVP 上线前需把后端 `ServerAddress` 改成 `https://beta.nbility.dev`，否则新用户的重置链接会跳回旧前端 | `controller/misc.go:368` |
| `oauth/github.go` redirect_uri 如何配置 | ✅ **后端不传 `redirect_uri` 给 GitHub**（ExchangeToken 只传 `client_id/client_secret/code`）。redirect_uri 由 **GitHub OAuth App 侧注册**，旧版前端用 `{ServerAddress}/oauth/github` 作为回调路径。新前端沿用该路径（spec §3.4） | `oauth/github.go:56-90`, `web/src/App.jsx:292` |
| `PUT /api/user/self` 对 `email` 字段的处理 | ✅ **不改 email**。`controller/user.go:773-778` 构造 `cleanUser` 只取 `Username/Password/DisplayName`，email 被丢弃。换绑走 `GET /api/oauth/email/bind?email=&code=`（依赖 session） | `controller/user.go:773-778` |
| `POST /api/token/:id/key` 是否挂 `SecureVerificationRequired` | ✅ **没挂**。`router/api-router.go:381` 只挂了 `CriticalRateLimit + DisableCache`。前端直接调即可，不需要二次验证弹窗（旧版 UI 的弹窗为历史残留） | `router/api-router.go:381` |
| `.../self/subscriptions/:id/action` body 里 action 枚举 | ✅ body 是 `{ action: string, value: int64 }`；普通用户**只能**传 4 个 action：`enable_aggregate_access` / `disable_aggregate_access` / `set_preferred` / `clear_preferred`（`extend_period` 等管理员才能用） | `controller/subscription.go:590-604`, `model/subscription.go:5850-5853` |
| Worker Set-Cookie 多值合并行为 | ⚠️ **开工时实测**。Cloudflare Workers `Response.headers.getSetCookie()` 在现代 runtime 里可用；反代实现时要对每个 Set-Cookie 单独重写 Domain/SameSite/Secure，再一个一个 `append` 到响应。如果用 `headers.get('set-cookie')` 可能只拿到第一条，开工时 Codex 用 `getSetCookie()` 或手动从 raw fetch 响应迭代 | Cloudflare Workers runtime |
| 分页 query 参数名 | ✅ 标准是 **`p` + `page_size`**；旧 web token 页曾用 `p + size`。新前端统一 `page_size` | `common/page_info.go:41-79` |

## 附录 C · 运维前置条件（MVP 上线前必须完成）

这些不是代码，由用户/运维在后端 admin 后台做：

- [ ] 后端 `system_setting.ServerAddress` 设为 `https://beta.nbility.dev`（否则新 UI 接不住邮件 reset 链接）
- [ ] 后端 Turnstile 开关：beta env 先关闭（除非愿意在 MVP 就接前端 widget）
- [ ] GitHub OAuth App 的 Authorization callback URL 改为 `https://beta.nbility.dev/oauth/github`（或创建 beta 专用 OAuth App 并把 `client_id/client_secret` 同步到 `common.GitHubClientId/Secret`）
- [ ] 后端 env `SessionSecret` 不变（新前端不重签 token，直接用后端已有 session）
- [ ] 后端 CORS 允许 origin `https://beta.nbility.dev`（虽然我们走 Worker 反代不需要，但防止未来前端直连）

## 附录 D · 仍需 Codex 开工时对照（不阻塞 spec 定稿）

| 切片 | 对照点 |
|---|---|
| 0.2 | Worker Set-Cookie 多值合并（见附录 B） |
| 所有写切片 | 抓旧版 DevTools 对比 payload（spec §7.3 防线 3） |
| 2.2b Token 创建 | 按旧版 `EditTokenModal.jsx:239-271` 逐字段对齐 submit 逻辑 |
| 3.1 i18n | 接入语言切换后立即 `PUT /api/user/self { language }` 持久化 |

---

## 附录 E · 枚举常量中心

所有枚举都以**字符串/数字字面量**形式出现在后端响应。前端 TS 直接写字面量，不要自造映射。

### E.1 User.role（数字）

| 值 | 常量 | 说明 |
|---|---|---|
| `0` | `RoleGuestUser` | 游客（未登录） |
| `1` | `RoleCommonUser` | 普通用户 |
| `10` | `RoleAdminUser` | 管理员 |
| `100` | `RoleRootUser` | 超级管理员 |

MVP 只做 role=1 的 C 端；`role≥10` 的功能不展示。

### E.2 User.status（数字）

| 值 | 说明 |
|---|---|
| `1` | Enabled |
| `2` | Disabled（被封禁 → 登录/请求会返 403） |

### E.3 Token.status（数字，`constant.TokenStatusXxx`）

| 值 | 说明 |
|---|---|
| `1` | Enabled |
| `2` | Disabled |
| `3` | Expired |
| `4` | Exhausted |

### E.4 Log.type（数字）

见 §6 Log 段：`0 unknown · 1 topup · 2 consume · 3 manage · 4 system · 5 error · 6 refund · 7 subscription`。

### E.5 Subscription.status（字符串）

`active / expired / cancelled`（见 `UserSubscription.status` 字段）。

### E.6 SubscriptionPlan.resource_type / UserSubscription.resource_type

`quota`（按额度）/ `request_count`（按成功请求数）

### E.7 SubscriptionPlan.duration_unit / UserSubscription.duration_unit

`year / month / week / day / hour / custom`

### E.8 SubscriptionPlan.quota_reset_period / UserSubscription.reset_period

`never / daily / weekly / monthly / yearly / custom`

### E.9 SubscriptionPlan.delivery_mode

`auto_activate / manual_delivery`

### E.10 SubscriptionDayPassPlan.status（字符串）

`active / completed / cancelled`

### E.11 InviteReward status（字符串，出现在 `invited_users[].overall_status / quota_status / plan_status` 和 `inviter_reward_records[].status`）

| 值 | 说明 |
|---|---|
| `granted` | 已发放奖励 |
| `blocked` | 已拦截（反作弊） |
| `unknown` | 未确定 |
| `not_configured` | 未配置此维度奖励 |

Overall 推导（`model/invite_reward.go:608-612`）：若 `summary.Blocked` → `blocked`；若 quota 或 plan 任一 `granted` → `granted`；否则保持 `unknown`。

### E.12 Redemption.redemption_type（字符串）

`quota`（默认）/ `subscription`

### E.13 TopUp.status（字符串，实际见 `model/topup.go`）

`pending / success / failed / cancelled`（**Codex 开工时再 grep 一下确认完整集合**）

### E.14 SubscriptionOrder.status（字符串）

`pending / success / failed / cancelled / refunded` 等；与 TopUp 类似但独立。

### E.15 SubscriptionOrder.fulfillment_status

`not_required / pending_delivery / delivered`

### E.16 Announcement.type（字符串，`/api/status.announcements[].type`）

`default / ongoing / success / warning / error`

---

## 附录 F · 复杂响应结构速查

### F.1 Announcement (from `/api/status.announcements`)

```ts
type Announcement = {
  content: string;                           // ≤500 字
  publishDate: string;                       // RFC3339
  type?: 'default' | 'ongoing' | 'success' | 'warning' | 'error';
  extra?: string;                            // 说明 ≤200 字
};
```
排序：`publishDate` 降序。

### F.2 ApiInfo (from `/api/status.api_info`)

```ts
type ApiInfoItem = {
  url: string;                               // ≤500 字，合法 URL
  route: string;                             // 线路描述 ≤100 字
  description: string;                       // ≤200 字
  color: string;                             // 预置颜色 token
};
```

### F.3 InviteRewardDetails (from `/api/user/aff/details`)

```ts
type InviteRewardDetails = {
  config: {
    inviter_quota: number;
    invitee_quota: number;
    inviter_plan?: InviteRewardPlanInfo;
    invitee_plan?: InviteRewardPlanInfo;
    invite_register_enabled: boolean;
    invite_code_usable_count: number;
  };
  leaderboard: Array<{ display_name, aff_count, aff_history_quota }>;
  inviter_reward_records: Array<{
    subscription_id: number; plan_id: number; plan_title: string;
    status: 'granted' | 'blocked' | 'unknown' | 'not_configured';
    created_at: number; end_time: number;
    plan?: InviteRewardPlanInfo;
  }>;
  inviter_reward_total: number;
  inviter_reward_page: number;
  inviter_reward_page_size: number;
  invited_users: Array<{
    user_id: number; username: string; display_name: string;
    status: number;                          // 见 E.2
    overall_status: string;                  // 见 E.11
    quota_status: string;                    // 见 E.11
    quota_amount: number;
    plan_status: string;                     // 见 E.11
    reward_at: number;
    blocked_reason: string;
    reward_end_time: number;
    invitee_plan?: InviteRewardPlanInfo;
  }>;
  invited_users_total: number;
  invited_users_page: number;
  invited_users_page_size: number;
};

type InviteRewardPlanInfo = {
  plan_id: number; title: string;
  resource_type: 'quota' | 'request_count';
  amount_total: number; request_count_total: number;
  duration_unit: string; duration_value: number; custom_seconds: number;
  upgrade_group: string;
};
```

### F.4 Log.other 的实际 JSON 载荷

后端把补充信息塞进 `Log.other`（string）。旧版 `helpers/log.js:20-33` 统一用 `getLogOther(record.other)` 解析，失败返 `null`。常用字段（来自 `web/src/components/table/usage-logs/UsageLogsColumnDefs.jsx`）：

```ts
type LogOther = {
  // 计费倍率（consume 日志）
  model_ratio?: number;
  model_price?: number;
  group_ratio?: number;
  completion_ratio?: number;
  // 缓存 token 细分
  cache_tokens?: number;
  cache_ratio?: number;
  cache_creation_tokens?: number;
  cache_creation_ratio?: number;
  cache_creation_tokens_5m?: number;
  cache_creation_ratio_5m?: number;
  cache_creation_tokens_1h?: number;
  cache_creation_ratio_1h?: number;
  // 管理员补充（manage 日志）
  action?: string;                           // 'refund' / 'compensate' / ...
  refund_to_quota?: boolean;
  admin_info?: {
    use_channel?: (number | null)[];
    // ...具体字段因 action 而异
  };
  // 其它可能出现的字段（Codex 开工时再完善）
};
```

**渲染规则**：
- `consume` 类型日志：展开时显示 model_ratio + group_ratio + cache 细分
- `manage` 类型日志：展开时显示 admin_info / action
- 解析失败（`getLogOther` 返 `null`）：展开区域显示 raw `other` 字符串

### F.5 TopUp 记录 (from `/api/user/topup/self`)

```ts
type TopUp = {
  id: number;
  user_id: number;
  amount: number;                            // quota 数（按 quota_display_type 展示）
  money: number;                             // 实付金额（货币单位）
  trade_no: string;
  payment_method: string;                    // 'alipay' / 'wxpay' / 'stripe' / 'creem' / 'waffo' / custom
  create_time: number;                       // unix 秒
  complete_time: number;                     // 0 表示未完成
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  invoiced: boolean;                         // 是否已开发票
};
```

### F.6 Redemption 记录 (from `/api/user/redemption/history/self`)

```ts
type RedemptionHistoryItem = {
  id: number;
  name: string;
  quota: number;                             // 兑换额度（仅 redemption_type='quota' 时）
  redemption_type: 'quota' | 'subscription';
  subscription_plan_id: number;              // 仅 redemption_type='subscription'
  subscription_plan_title: string;
  redeemed_time: number;                     // unix 秒
  used_user_id: number;
  username: string;
};
```

### F.7 `POST /api/user/topup` 兑换响应 data

```ts
type RedeemResponse =
  // 当 redemption_type='quota'：data 是 number（quota 数）
  | number
  // 当 redemption_type='subscription'：data 是 RedeemResult
  | {
      redemption_type: 'subscription';
      quota: number;
      subscription_plan_id: number;
      subscription_plan_title: string;
      subscription_id: number;
      subscription_order_id: number;
      fulfillment_status?: 'not_required' | 'pending_delivery' | 'delivered';
    };
```
前端渲染：判断 `typeof data === 'number'` 还是 object，分别提示"获得 X 额度"或"开通套餐 {title}"。

### F.8 `/api/subscription/self` 嵌套结构补齐

```ts
type SubscriptionManualDeliverySummary = {
  order: SubscriptionOrder;
  plan?: SubscriptionPlan;
  refund_order?: { order_id, trade_no, topup_id, payment_method, money, complete_time };
};

type SubscriptionOrder = {
  id: number; user_id: number; plan_id: number;
  money: number;
  plan_title: string;
  plan_duration_unit: string; plan_duration_value: number;
  plan_total_amount: number;
  plan_resource_type: 'quota' | 'request_count';
  plan_upgrade_group: string;
  plan_delivery_mode: 'auto_activate' | 'manual_delivery';
  trade_no: string;
  payment_method: string;
  status: string;                            // 见 E.14
  create_time: number; complete_time: number;
  fulfillment_status: 'not_required' | 'pending_delivery' | 'delivered';
  delivery_admin_remark: string;
  delivered_by: number; delivered_at: number;
  refund_to_quota: boolean; refund_quota_amount: number;
  // 其它管理员相关字段略
};

type SubscriptionDayPassPlanSummary = {
  plan: SubscriptionDayPassPlan;
  parent_subscription?: UserSubscription;
};

type SubscriptionDayPassPlan = {
  id: number; user_id: number; parent_user_subscription_id: number;
  status: 'active' | 'completed' | 'cancelled';
  mode: 'fixed_daily';
  total_days: number; generated_days: number;
  request_count_per_day: number;
  total_request_count: number; generated_request_count: number;
  timezone: string;
  start_date: string;                        // 'YYYY-MM-DD'
  end_date: string;
  next_generate_at: number; last_generate_at: number;
  last_error: string;
  created_at: number; updated_at: number;
};
```

### F.9 QuotaData (from `/api/data/self`)

```ts
type QuotaData = {
  id: number;
  user_id: number;
  username: string;
  model_name: string;
  created_at: number;                        // unix 秒（精度为"天"——后端以天聚合）
  token_used: number;
  count: number;                             // 请求次数
  quota: number;                             // 消耗 quota
};
```

返回是 `QuotaData[]`，按 `(user_id, model_name, created_at)` 维度聚合。Dashboard 画图时前端要按 `created_at` 分桶，`model_name` 分系列堆叠。

跨度限制：`end_timestamp - start_timestamp ≤ 2592000`（30 天）——超过后端返 `"时间跨度不能超过 1 个月"`。
