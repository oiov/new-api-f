# 地区拦截页（Region Block）设计

> 日期：2026-06-14
> 范围：`web-worker/`（新前端，`nbility.dev`）+ `web/`（旧管理后台，`old.nbility.dev`）+ Cloudflare 边缘
> 关联约定：根 `CLAUDE.md` §Rule 7、`web-worker/CLAUDE.md`
> 状态：设计待评审

## 1. 目标与约束

给两个前端加一个"地区不可用"拦截页（视觉参照 Anthropic claude.ai 的 *App unavailable* 页），按访客 IP 所在国家拦截**中国大陆**（默认 `CN`，国家码列表可配）访客。

硬约束：

1. **纯前端展示层拦截**——只换页面内容，**不动任何后端接口**。被拦访客的 `/api/*` 调用照常转发；尤其公告 / 站内信拉取（走 `api.nbility.dev`）必须正常工作。
2. **保留顶部导航栏 + 通知弹窗**——拦截后仍渲染顶部导航栏；有未读公告照常自动弹出 `NoticeDialog`/`NoticeModal`。其余所有页面（落地页、控制台、管理后台路由）一律替换为拦截页。
3. **对 `api.nbility.dev` 零影响**——所有地区判定逻辑只挂在前端域名（`nbility.dev` 的 Worker、`old.nbility.dev` 的 CF Snippet），api 子域不挂任何规则。
4. **环境变量可配开关**——是否拦截、拦哪些国家码，通过配置切换。
5. **管理员逃生口**——`old.nbility.dev` 是管理员后台且按用户决策"一视同仁拦截"，必须留一个绕过口，避免身处中国的管理员把自己锁死。web-worker 也留同款。
6. 拦截页只放管理员邮箱 `support@nbility.dev`（`mailto:`），不放额外按钮。
7. 受 §Rule 5 保护的品牌标识（new-api / QuantumNous）不得改动。

## 2. 决策记录（已与用户确认）

| # | 决策 | 选择 |
|---|---|---|
| D1 | 国家来源 | Cloudflare 边缘读 `cf.country`（方案 A） |
| D2 | old 后台是否拦 | 一视同仁拦截（含管理员），但加逃生口 |
| D3 | 国家码范围 | env 可配列表，默认 `CN` |
| D4 | 拦截后保留 | 顶部导航栏 + 通知弹窗，其余全替换 |
| D5 | 判定取向 | **边缘判定**（edge-decides）：边缘算出 `blocked` 布尔，前端只读 |
| D6 | 逃生口 | old + web-worker 都加 |
| D7 | old 开关位置 | CF Snippet 内（CF 面板编辑，旧前端无需重新 build） |
| D8 | 拦截页内容 | 仅邮箱，无额外按钮 |

## 3. 总体架构

### 3.1 边缘判定模型（核心）

国家匹配逻辑集中在**边缘一处**，前端是"哑消费者"，只读一个布尔：

- **web-worker**：判定在它自身的 Cloudflare Worker（`src/server.ts`）里完成。
- **old web**：判定在挂到 `old.nbility.dev` 的 CF Snippet 里完成。
- 两者都把结果以**两种载体**注入，保证 SSR 首屏与客户端水合一致、无闪烁：
  - `Set-Cookie: nb_geo_block=1|0; Domain=.nbility.dev; Path=/; SameSite=Lax`（客户端读）
  - 请求头 `x-nb-geo-block: 1|0`（仅 web-worker SSR 首屏读；old web 为纯 CSR，不需要）
- 另设展示用 cookie `nb_geo=<ISO 国家码>`（可选，用于调试/日志，不参与判定）。

### 3.2 请求流（web-worker）

```
Browser ── nbility.dev ──▶ Cloudflare Worker (src/server.ts)
   ├── /api/* ───────────▶ 反代到 api.nbility.dev（原样，不受地区影响）
   └── HTML 请求:
         1. country = request.cf.country
         2. bypass = hasBypassCookie || (?geobypass=<TOKEN> 命中)
         3. blocked = GEO_BLOCK_ENABLED && countries.includes(country) && !bypass
         4. 克隆 request 注入 x-nb-geo-block 头 → 交给 TanStack handler.fetch 做 SSR
         5. 响应注入 Set-Cookie: nb_geo_block / nb_geo（命中 bypass 时种 nb_geo_bypass）
```

### 3.3 请求流（old web）

```
Browser ── old.nbility.dev ──(CF 橙云)──▶ CF Snippet ──▶ Go 源站(内嵌 SPA)
   CF Snippet 对 HTML 响应:
     1. country = request.cf.country
     2. bypass = hasBypassCookie || (?geobypass=<TOKEN> 命中)
     3. blocked = ENABLED && COUNTRIES.includes(country) && !bypass
     4. append Set-Cookie: nb_geo_block / nb_geo（bypass 命中时种 nb_geo_bypass）
   App.jsx 读 nb_geo_block cookie 决定是否渲染拦截页
```

> Snippet 仅匹配 `old.nbility.dev/*`；`api.nbility.dev` 不在匹配范围内 → 后端零影响。

## 4. 组件设计

### 4.1 web-worker

**A. `src/server.ts`（改）**
- 在现有 `shouldProxyRequestPath` 分支之后、`handler.fetch` 之前，新增 geo 判定。
- 抽出 `src/server/geo-block.ts`：
  - `resolveGeoBlock(request, env): { blocked: boolean; country: string; bypass: boolean }`
  - `applyGeoHeaders(request, result): Request`（克隆请求加 `x-nb-geo-block`）
  - `applyGeoCookies(response, result, env): Response`（加 `Set-Cookie`）
- `/api/*` 分支**完全不经过** geo 逻辑。
- 新增 env（`Env` 接口 + `wrangler.jsonc` vars）：
  - `GEO_BLOCK_ENABLED: string`（`"true"`/`"false"`，默认 `"false"`）
  - `GEO_BLOCK_COUNTRIES: string`（CSV，默认 `"CN"`）
  - `GEO_BLOCK_BYPASS_TOKEN: string`（secret，逃生口密钥）

**B. 客户端读取 `src/lib/geo-block.ts`（新）**
- `useRegionBlocked(): boolean`：SSR 时从注入头读，客户端从 `nb_geo_block` cookie 读；含 `nb_geo_bypass` 时恒 `false`（客户端侧 bypass 检查是冗余安全网；**主判定在边缘**，边缘见到 `nb_geo_bypass` 即 `blocked=false`）。
- SSR 首屏值经 TanStack 的 root context / dehydration 传到客户端，保证两端一致。

**C. `src/routes/__root.tsx`（改）**
- `RootComponent`：`const blocked = useRegionBlocked(); return blocked ? <RegionBlockScreen/> : <Outlet/>;`
- 与现有 `MaintenanceDialog` 同范式，不动 `RootDocument`（ThemeProvider / i18n / Toaster 仍在）。

**D. `src/components/shared/region-block-screen.tsx`（新）**
- 复用现有顶部导航栏：抽 `src/components/layout/navbar.tsx` 为可在拦截态渲染的形态——保留 logo + 语言/主题 + 通知按钮（含 `NoticeDialog` 自动弹窗逻辑，见 `src/components/layout/navbar.tsx:87` 的 `useEffect`），隐藏页面区块导航链接。
- 主体：居中图标（`@tabler/icons-react`）+ 大标题 + 副文案 + `support@nbility.dev` 的 `mailto:` 按钮。
- 仅用 shadcn/ui + Tailwind + `@tabler/icons-react`（遵守 `web-worker/CLAUDE.md` §7）。
- i18n：`landing`/`common` 命名空间下新增 zh/en 文案键。

### 4.2 old web

**A. CF Snippet（新，CF 面板内维护，不入仓库代码但 spec 记录其逻辑）**
- 路由匹配 `old.nbility.dev/*`，仅对 HTML 响应注入 cookie（静态资源跳过）。
  - 实现核实点：CF Snippet 运行时在**响应改写**路径上需能访问 `request.cf.country`；若 Snippet 运行时不暴露，则降级为在请求阶段读 `request.cf.country` 并通过响应 `Set-Cookie` 注入（逻辑等价）。
- 常量：`ENABLED`、`COUNTRIES`（默认 `['CN']`）、`BYPASS_TOKEN`。开关 = 改 Snippet 常量。
- 仓库内放一份参考实现：`docs/superpowers/specs/snippets/old-region-block.snippet.js`（仅文档/备份，CF 实际运行版在面板）。

**B. `web/src/components/RegionGate.jsx`（新）**
- 读 `nb_geo_block` cookie → blocked。
- blocked 时渲染 Semi 版拦截页（图标 + 标题 + 文案 + `support@nbility.dev`）。

**C. `web/src/components/layout/PageLayout.jsx`（改）**
- 在 `<Content>` 内、`<App/>`（`PageLayout.jsx:292`）外包一层 `RegionGate`：
  - blocked → 保留 `Header`（含 HeaderBar / `NoticeModal` 自动弹窗），隐藏 `Sider`，`Content` 渲染拦截页。
  - 未 blocked → 原样渲染。
- 公告自动弹逻辑随 Header/NoticeModal 保留 → 满足"公告照常弹"。

**D. old web 开关**：完全由 CF Snippet 控制（D7）。前端只读 cookie，不再额外加 Vite 开关。

## 5. 逃生口（bypass）

- 访问 `<域名>/?geobypass=<TOKEN>`：边缘（Worker / Snippet）校验 `TOKEN` 命中后，种 `Set-Cookie: nb_geo_bypass=1; Domain=.nbility.dev; Max-Age=31536000`，并本次直接放行。
- 此后该浏览器恒跳过拦截（边缘见到 `nb_geo_bypass` 即 `blocked=false`）。
- `TOKEN` 为长随机串，配置在 web-worker 的 secret 与 Snippet 常量中。
- 文档化：把"逃生口 URL"记在内部运维笔记，不写进任何前端可见处。

## 6. 环境变量总表

| 变量 | 端 | 默认 | 说明 |
|---|---|---|---|
| `GEO_BLOCK_ENABLED` | web-worker wrangler `vars` | `"false"` | 总开关；redeploy 生效 |
| `GEO_BLOCK_COUNTRIES` | web-worker wrangler `vars` | `"CN"` | CSV 国家码 |
| `GEO_BLOCK_BYPASS_TOKEN` | web-worker secret | —（必填，启用时） | 逃生口密钥 |
| `ENABLED` / `COUNTRIES` / `BYPASS_TOKEN` | old web 的 CF Snippet 常量 | `false` / `['CN']` / — | 在 CF 面板编辑 |

## 7. 边界与正确性

1. **`/api/*` 永不被拦**：web-worker 中 geo 判定在反代分支之后才进入；Snippet 只匹配 `old.nbility.dev`。被拦访客的 API（含 `/api/notice`、站内信、status）全部照常 → 公告能弹。
2. **SSR / 水合一致**：web-worker 用注入头做 SSR 首屏，cookie 供客户端水合；两端取同一来源，无闪烁、无水合 mismatch。
3. **`cf.country` 缺失**（本地 dev / 非 CF 环境）：`country` 为空 → 不命中列表 → 不拦截（fail-open，避免误伤）。
4. **静态资源**：Snippet / Worker 仅对 HTML 文档注入 cookie，JS/CSS/图片不处理。
5. **登录态无关**：判定纯按 IP 国家，不读会话；逃生口是唯一放行手段（含管理员）。
6. **品牌保护**：拦截页与所有改动不触碰 new-api / QuantumNous 标识（§Rule 5）。

## 8. 验收清单

- [ ] `GEO_BLOCK_ENABLED=false` 时两端完全无变化（回归）。
- [ ] 模拟 `cf.country=CN`（或带 `nb_geo_block=1` cookie）：
  - [ ] web-worker：落地页 + 控制台均显示拦截页，仅顶部导航栏 + 通知弹窗存活；有未读公告自动弹出。
  - [ ] old web：管理后台路由显示拦截页，Header + NoticeModal 存活。
  - [ ] 两端拦截页含 `support@nbility.dev` 可点 `mailto:`。
- [ ] 拦截态下 `/api/*` 调用（DevTools 观察 `/api/notice` 等）正常返回 200，不受影响。
- [ ] `cf.country=US` 等非列表国家：两端完全正常访问。
- [ ] `?geobypass=<正确TOKEN>`：种 `nb_geo_bypass`，此后该浏览器永久放行；错误 TOKEN 不放行。
- [ ] `api.nbility.dev` 无任何 geo 规则，curl 各地区均正常（抽样）。
- [ ] i18n zh/en 拦截页文案齐全。
- [ ] web-worker Biome `pnpm check` 通过；old web lint 通过。

## 9. 不做（YAGNI）

- 不做地区白名单 UI / 后台配置面板（仅 env / Snippet 常量）。
- 不做"查看支持的地区"列表页（D8 只留邮箱）。
- 不做后端 IP 风控联动（纯前端展示层）。
- 不做省级 / 城市级细分（仅国家码）。
