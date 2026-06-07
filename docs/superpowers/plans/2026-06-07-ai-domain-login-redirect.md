# nbility.ai 登录入口跳转主域 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让从 `nbility.ai` 访问登录/注册入口的用户被 302 重定向到主域完成 OAuth/账密登录，后端与 OAuth 平台零改动。

**Architecture:** 在 worker 入口 `web-worker/src/server.ts` 的 `fetch` 中、`/api/*` 反代判定之后、SSR 渲染之前，调用一个纯函数 `resolveLoginRedirect` 判定是否需要跳转；判定逻辑（路径精确匹配、host 小写归一、本地豁免、主域注册域后缀匹配、URL 规范化、异常兜底）全部内聚在独立可测文件 `src/server/login-redirect.ts`。

**Tech Stack:** TypeScript, Cloudflare Worker (TanStack Start), `node:test` + `node:assert/strict`（用 `npx tsx --test` 运行）。

**关联文档:** spec `docs/superpowers/specs/2026-06-07-ai-domain-login-redirect-design.md`

---

## File Structure

- **Create** `web-worker/src/server/login-redirect.ts` — 纯函数 `resolveLoginRedirect(requestUrl, siteUrl)`，唯一职责：根据请求 URL 与主域配置，返回应跳转的目标 URL 字符串或 `null`。无副作用、无 `Response`，便于单测。
- **Create** `web-worker/src/server/login-redirect.test.ts` — 覆盖全部分支的单元测试。
- **Modify** `web-worker/src/server.ts` — 入口接线：调用纯函数，非空则 `Response.redirect(target, 302)`。

> 设计约束（来自 spec §6 / web-worker CLAUDE.md §8）：判定全程走 `env.SITE_URL` 与 `new URL(request.url).hostname`，**不出现** `nbility.ai`/`nbility.dev` 域名字面量。

---

## Task 1: 纯函数 `resolveLoginRedirect` + 单元测试 (TDD)

**Files:**
- Create: `web-worker/src/server/login-redirect.ts`
- Test: `web-worker/src/server/login-redirect.test.ts`

判定规则（逐条对应 spec §3.1–§3.3）：
1. `requestUrl` 解析失败 → `null`（不跳）。
2. `pathname` 不在精确集合 `{'/auth/login','/auth/register'}` → `null`。
3. host 小写归一后命中本地豁免（`localhost` / `127.0.0.1` / `[::1]` / `*.localhost`）→ `null`。
   注：`URL.hostname` 对 IPv6 回环保留方括号，`new URL('http://[::1]/...').hostname === '[::1]'`，故用 `'[::1]'` 判定（spec §3.3 写的 `'::1'` 是笔误，以此处为准）。
4. `siteUrl` 缺失或解析失败 → `null`（兜底放行 SSR，绝不抛异常）。
5. host 属于主域注册域（`host === siteHost || host.endsWith('.'+siteHost)`）→ `null`。
6. 其余 → 返回 `new URL(pathname + search, siteUrl).toString()`（规范化拼接，规避尾斜杠双斜杠）。

- [ ] **Step 1: 写失败测试**

创建 `web-worker/src/server/login-redirect.test.ts`：

```ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveLoginRedirect } from './login-redirect';

const SITE = 'https://nbility.dev';

describe('resolveLoginRedirect', () => {
  test('redirects ai-domain login to main domain, preserving path', () => {
    assert.equal(
      resolveLoginRedirect('https://nbility.ai/auth/login', SITE),
      'https://nbility.dev/auth/login'
    );
  });

  test('preserves query string (aff) on register', () => {
    assert.equal(
      resolveLoginRedirect('https://nbility.ai/auth/register?aff=abc', SITE),
      'https://nbility.dev/auth/register?aff=abc'
    );
  });

  test('preserves return_to query as-is', () => {
    assert.equal(
      resolveLoginRedirect(
        'https://nbility.ai/auth/login?return_to=%2Fconsole',
        SITE
      ),
      'https://nbility.dev/auth/login?return_to=%2Fconsole'
    );
  });

  test('normalizes host casing before matching', () => {
    assert.equal(
      resolveLoginRedirect('https://Nbility.AI/auth/login', SITE),
      'https://nbility.dev/auth/login'
    );
  });

  test('redirects www subdomain of ai', () => {
    assert.equal(
      resolveLoginRedirect('https://www.nbility.ai/auth/login', SITE),
      'https://nbility.dev/auth/login'
    );
  });

  test('does not redirect main domain', () => {
    assert.equal(resolveLoginRedirect('https://nbility.dev/auth/login', SITE), null);
  });

  test('does not redirect subdomains of main domain', () => {
    assert.equal(
      resolveLoginRedirect('https://beta.nbility.dev/auth/login', SITE),
      null
    );
    assert.equal(
      resolveLoginRedirect('https://www.nbility.dev/auth/login', SITE),
      null
    );
  });

  test('does not redirect local dev hosts', () => {
    assert.equal(resolveLoginRedirect('http://localhost/auth/login', SITE), null);
    assert.equal(
      resolveLoginRedirect('http://localhost:3000/auth/login', SITE),
      null
    );
    assert.equal(resolveLoginRedirect('http://127.0.0.1/auth/login', SITE), null);
    assert.equal(resolveLoginRedirect('http://[::1]/auth/login', SITE), null);
    assert.equal(
      resolveLoginRedirect('http://app.localhost/auth/login', SITE),
      null
    );
  });

  test('does not redirect non-login paths on ai domain', () => {
    assert.equal(resolveLoginRedirect('https://nbility.ai/console', SITE), null);
    assert.equal(resolveLoginRedirect('https://nbility.ai/', SITE), null);
    assert.equal(
      resolveLoginRedirect('https://nbility.ai/auth/login-help', SITE),
      null
    );
  });

  test('falls back to no-redirect when siteUrl missing or invalid', () => {
    assert.equal(resolveLoginRedirect('https://nbility.ai/auth/login', undefined), null);
    assert.equal(
      resolveLoginRedirect('https://nbility.ai/auth/login', 'not-a-url'),
      null
    );
  });

  test('falls back to no-redirect when requestUrl invalid', () => {
    assert.equal(resolveLoginRedirect('not-a-url', SITE), null);
  });

  test('handles siteUrl with trailing slash without double slash', () => {
    assert.equal(
      resolveLoginRedirect('https://nbility.ai/auth/login', 'https://nbility.dev/'),
      'https://nbility.dev/auth/login'
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web-worker && npx tsx --test src/server/login-redirect.test.ts`
Expected: FAIL — `Cannot find module './login-redirect'`（模块尚未创建）。

- [ ] **Step 3: 写最小实现**

创建 `web-worker/src/server/login-redirect.ts`：

```ts
const LOGIN_ENTRY_PATHS = new Set(['/auth/login', '/auth/register']);

function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost')
  );
}

/**
 * 当请求落在登录/注册入口、且当前域名不属于主域（SITE_URL）的注册域时，
 * 返回应 302 跳转到的主域目标 URL；否则返回 null（不跳）。
 *
 * 纯函数、无副作用：任何解析异常都回退为 null（放行 SSR），绝不抛出。
 * 域名判定全部走 siteUrl / 请求 host，无域名字面量（web-worker CLAUDE.md §8）。
 */
export function resolveLoginRedirect(
  requestUrl: string,
  siteUrl: string | undefined
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (!LOGIN_ENTRY_PATHS.has(url.pathname)) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (isLocalHost(host)) {
    return null;
  }

  if (!siteUrl) {
    return null;
  }
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  const siteHost = site.hostname.toLowerCase();

  // 已属主域注册域（含子域如 beta./www.）→ 不跳
  if (host === siteHost || host.endsWith(`.${siteHost}`)) {
    return null;
  }

  return new URL(`${url.pathname}${url.search}`, site).toString();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web-worker && npx tsx --test src/server/login-redirect.test.ts`
Expected: PASS — `ℹ tests 12 / pass 12 / fail 0`（共 12 个 `test()`，全绿）。

- [ ] **Step 5: 提交**

```bash
cd web-worker && npx biome check --write src/server/login-redirect.ts src/server/login-redirect.test.ts
git add web-worker/src/server/login-redirect.ts web-worker/src/server/login-redirect.test.ts
git commit -m "feat(web-worker): add login-redirect helper for ai-domain login funnel"
```

---

## Task 2: 接入 worker 入口 `server.ts`

**Files:**
- Modify: `web-worker/src/server.ts`

接线规则：在 `shouldProxyRequestPath` 反代判定之后、`handler.fetch` 之前插入跳转判定（spec §3.1）。

- [ ] **Step 1: 修改 `server.ts`**

把 `web-worker/src/server.ts` 改为：

```ts
import handler from '@tanstack/react-start/server-entry';
import { proxyApi } from './server/api-proxy';
import { resolveLoginRedirect } from './server/login-redirect';
import { shouldProxyRequestPath } from './server/proxy-routing';

interface Env {
  API_ORIGIN: string;
  SITE_URL: string;
  COOKIE_DOMAIN: string;
  VITE_ENV?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (shouldProxyRequestPath(url.pathname)) {
      return proxyApi(request, env);
    }
    const loginRedirect = resolveLoginRedirect(request.url, env.SITE_URL);
    if (loginRedirect) {
      return Response.redirect(loginRedirect, 302);
    }
    return handler.fetch(request, { context: { fromFetch: true } });
  },
};
```

- [ ] **Step 2: 类型检查 + lint + 既有测试不回归**

Run:
```bash
cd web-worker
npx tsc --noEmit
npx biome check src/server.ts src/server/login-redirect.ts src/server/login-redirect.test.ts
npx tsx --test src/server/proxy-routing.test.ts src/server/login-redirect.test.ts
```
Expected: tsc 无错误；biome 无 error；测试全绿。
（注：若 `npx tsc` 因项目配置不便直接跑，至少保证 biome 与测试全绿。）

- [ ] **Step 3: 提交**

```bash
git add web-worker/src/server.ts
git commit -m "feat(web-worker): redirect ai-domain login/register entry to main domain"
```

---

## Task 3: 验证 return_to 跨域行为已天然满足（无新增代码）

**Files:**
- Inspect only: `web-worker/src/components/auth/login-form.tsx:141-157`, `register-form.tsx:398`

**背景**：spec §3.4 要求登录成功后不依据指向 ai 域的 `return_to` 跳回（否则回到未登录态）。现状调查结论：`return_to` 全部为站内相对路径（`/console`、`/playground` 等），登录成功用 TanStack `navigate({ to: search.return_to ?? '/console' })` 做**内部路由跳转**，不会导航到外域绝对 URL。因此本要求**已天然满足，无需改代码**。本任务仅做确认与固化。

- [ ] **Step 1: 确认 login-form 跳转用的是内部 navigate**

Run: `cd web-worker && grep -n "navigate(" src/components/auth/login-form.tsx`
Expected: 看到 `navigate({ to: search.return_to ?? '/console' })` 形式（`to:` 内部路由，非 `window.location.href = <绝对URL>`）。

若发现任何把 `return_to` 当作绝对 URL 用 `window.location.href`/`location.assign` 跳转的代码 → 视为超出本 plan 范围的缺陷，**停下并向用户报告**，不要在本 plan 内擅自扩展修复。

- [ ] **Step 2: 在 spec 走查清单上记录确认结论**

无需改代码。在 PR/交付说明里写明："return_to 跨域校验经核查已天然满足（站内相对路径 + 内部 navigate）。"

---

## Task 4: 手动/集成验证（合并前）

**前置**：本地无法复现真实多域名（localhost 被豁免），故此验证在部署到 worker（含 `nbility.ai` 自定义域）后进行。

- [ ] **Step 1: 部署预览环境**（按团队既有 `pnpm run deploy` 流程，或 wrangler 预览）。

- [ ] **Step 2: 逐项走查（对应 spec §6）**
  - 访问 `https://nbility.ai/auth/login` → 浏览器 302 到 `https://nbility.dev/auth/login`（无登录页闪现）。
  - 访问 `https://nbility.ai/auth/register?aff=测试码` → 跳转后 URL 仍带 `aff`。
  - 在主域用 GitHub / Google / LinuxDo 三种方式各登录一次 → 均成功，cookie 种在 `.nbility.dev`。
  - 访问 `https://nbility.dev/auth/login`、`https://beta.nbility.dev/auth/login` → 不跳转、正常渲染。
  - 访问 `https://nbility.ai/console`、`https://nbility.ai/` → 不跳转。

- [ ] **Step 3: 记录结果**：把实际 302 Location 与各登录结果记入 PR 描述。任何一项不符 → 回到对应 Task 修复。

---

## 完成定义 (Definition of Done)

- `resolveLoginRedirect` 单测全绿（Task 1）。
- `server.ts` 接线、tsc/biome 通过、既有测试不回归（Task 2）。
- `return_to` 跨域行为确认（Task 3）。
- 部署后手动走查全部通过（Task 4）。
- 全程无域名字面量进入 `.ts` 代码（§6）。
