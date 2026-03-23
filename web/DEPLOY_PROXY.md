# Cloudflare Pages / Vercel 部署说明

当前前端默认有两种 API 访问模式：

- 同源模式：`VITE_REACT_APP_SERVER_URL` 留空，浏览器请求当前站点下的 `/api`、`/v1`、`/mj`、`/pg`
- 直连模式：设置 `VITE_REACT_APP_SERVER_URL=https://your-backend.example.com`，浏览器直接跨域访问后端

对于 Vercel 和 Cloudflare Pages，建议使用同源模式并通过平台代理转发到 Go 后端。

## 必须遵守

- 不要设置 `VITE_REACT_APP_SERVER_URL`
- 设置平台运行时环境变量 `BACKEND_ORIGIN=https://你的 Go 后端域名`
- `BACKEND_ORIGIN` 末尾不要带 `/`

## Vercel

- Root Directory: `web`
- Install Command: `bun install`
- Build Command: `bun run build`
- Output Directory: `dist`
- Runtime Env:
  - `BACKEND_ORIGIN=https://api.example.com`

仓库内已提供：

- [vercel.json](/Users/admin/Developer/fishxcode/new-api/web/vercel.json)
- [api/_proxy.js](/Users/admin/Developer/fishxcode/new-api/web/api/_proxy.js)

转发规则：

- `/api/*` -> Go 后端 `/api/*`
- `/v1/*` -> Go 后端 `/v1/*`
- `/mj/*` -> Go 后端 `/mj/*`
- `/pg/*` -> Go 后端 `/pg/*`
- 其他不带扩展名的前端路由 -> `/index.html`

## Cloudflare Pages

- Framework preset: `Vite`
- Root Directory: `web`
- Build Command: `bun run build`
- Build Output Directory: `dist`
- Pages Env:
  - `BACKEND_ORIGIN=https://api.example.com`

仓库内已提供：

- [functions/api/[[path]].js](/Users/admin/Developer/fishxcode/new-api/web/functions/api/[[path]].js)
- [functions/v1/[[path]].js](/Users/admin/Developer/fishxcode/new-api/web/functions/v1/[[path]].js)
- [functions/mj/[[path]].js](/Users/admin/Developer/fishxcode/new-api/web/functions/mj/[[path]].js)
- [functions/pg/[[path]].js](/Users/admin/Developer/fishxcode/new-api/web/functions/pg/[[path]].js)
- [public/_redirects](/Users/admin/Developer/fishxcode/new-api/web/public/_redirects)
- [.npmrc](/Users/admin/Developer/fishxcode/new-api/web/.npmrc)

`_redirects` 里的最后一条用于 React Router SPA fallback。
如果 Cloudflare 仍先执行 `npm install`，`.npmrc` 已启用 `legacy-peer-deps=true` 作为兜底，避免 `@lobehub/icons` 的 peer 依赖解析中断构建。
如果 Cloudflare 控制台仍配置成 `npm run build`，仓库当前的 `build` 脚本也会先执行 `bun install --frozen-lockfile`，然后再构建，避免 `vite: not found`。

## 什么时候需要直连模式

只有在你明确不想使用平台代理时，才设置 `VITE_REACT_APP_SERVER_URL`。此时需要保证：

- Go 后端允许该前端域名跨域
- 上游防火墙/WAF 不会拦截浏览器直连
- 浏览器可以直接访问后端域名

## 当前项目与代理相关的关键点

- 前端 API 客户端：`src/helpers/api.js`
- 开发环境代理：`vite.config.js`
- Go 内嵌前端部署：项目根的 `router/main.go` 与 `router/web-router.go`

## 建议

生产上优先走平台代理，不要混用平台代理和 `VITE_REACT_APP_SERVER_URL`。两者同时存在时，浏览器会优先直连后端，平台代理等于失效。

## 前端 Docker 部署

仓库内已提供独立前端镜像方案：

- [Dockerfile](/Users/admin/Developer/fishxcode/new-api/web/Dockerfile)
- [nginx/default.conf.template](/Users/admin/Developer/fishxcode/new-api/web/nginx/default.conf.template)
- [docker/docker-entrypoint.sh](/Users/admin/Developer/fishxcode/new-api/web/docker/docker-entrypoint.sh)

用途：

- 静态托管 `dist`
- React Router SPA fallback
- 反向代理 `/api`、`/v1`、`/mj`、`/pg` 到 Go 后端
- 关闭代理缓冲，兼容流式响应

示例：

```bash
docker build -t new-api-web ./web
docker run --rm -p 8080:80 \
  -e BACKEND_ORIGIN=https://api.example.com \
  new-api-web
```

注意：

- `BACKEND_ORIGIN` 必填
- `BACKEND_ORIGIN` 末尾不要带 `/`
