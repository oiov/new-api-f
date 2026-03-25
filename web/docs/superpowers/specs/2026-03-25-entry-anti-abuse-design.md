# 入口层防刷方案设计（Vercel/Nginx）

## 1. 背景与目标
当前 `web` 模块面临两类高频无效流量：
1) 关键词扫描路径探测（如 `/admin`、`/wp-admin`、`/.env`）；
2) 对 API 前缀的短时高频请求冲击。

本方案仅在入口层治理，不改 Go 业务代码与数据库结构，目标是：
- 扫描流量就地短路，统一返回轻量响应；
- API 请求做激进限速（用户选择 C 档）；
- 保持现有 API 代理与 SPA 路由可用；
- 可快速回滚。

## 2. 范围与非目标
### 范围
- `web/vercel.json`：扫描路径问候响应与路由顺序维护。
- `web/nginx/default.conf.template`：限速区、扫描路径拦截、API 限速。

### 非目标
- 不实现攻击性对抗（如压缩炸弹、资源耗尽反击）。
- 不引入 Go 中间件风控、Redis 黑名单、数据库封禁记录。
- 不调整业务 API 协议与鉴权逻辑。

## 3. 策略设计

## 3.1 扫描路径拦截（问候响应）
对明显探测路径直接返回固定文本：`hello hack\n`。

覆盖清单（第一版）：
- 后台探测：`/admin` `/administrator` `/manage` `/dashboard` `/cpanel` `/webadmin` `/adminer` `/phpmyadmin` `/pma`
- WordPress 探测：`/wp-admin` `/wp_admin` `/wp-login.php` `/wp_login.php` `/xmlrpc.php`
- 敏感文件/目录探测：`/.env` `/.env.local` `/.env.production` `/.git` `/.svn` `/.hg`
- 其他探测：`/server-status` `/graphql`

返回策略：
- HTTP 200
- `Content-Type: text/plain; charset=utf-8`
- 固定 body，禁止重定向、禁止暴露内部信息。

## 3.2 API 激进限速（C 档）
对 `/api|/v1|/v1beta|/mj|/pg` 前缀应用同 IP 限速：
- 主阈值：`80 req/min`
- Nginx `burst`：`8`
- 方式：`nodelay`

对扫描路径应用更严格限速：
- 阈值：`10 req/min`
- `burst`：`2`
- 方式：`nodelay`

> 说明：Nginx `limit_req` 提供的是速率惩罚能力，不是精确“30 分钟封禁状态机”。本阶段采用入口层最小实现，先做高强度削峰与即时惩罚。

## 3.3 路由优先级与兼容约束
必须保证以下优先级：
1) 扫描路径规则（最高）
2) API 代理规则（含限速）
3) SPA fallback（最低）

兼容要求：
- `/api/status` 等现有接口继续可用；
- `/console` `/docs` `/status` 等前端路由继续回落 `index.html`。

## 4. 变更清单
1) `web/vercel.json`
- 保留并维护扫描路径 rewrite 到 `/hello-hack.txt`；
- 保持 API rewrite 与 SPA fallback 顺序不变。

2) `web/public/hello-hack.txt`
- 固定内容：`hello hack`。

3) `web/nginx/default.conf.template`
- 新增 `limit_req_zone`：`api_per_ip`（80r/m），`scan_per_ip`（10r/m）；
- 扫描路径 `location` 统一返回问候文本并应用 scan 限速；
- API `location` 注入 `limit_req zone=api_per_ip burst=8 nodelay`；
- 保留现有静态缓存、反代、SPA fallback。

## 5. 验证方案

## 5.1 功能验证
- `GET /admin` -> 200 + `hello hack`
- `GET /wp_admin` -> 200 + `hello hack`
- `GET /.env` -> 200 + `hello hack`

## 5.2 业务可用性
- `GET /api/status` -> 200 JSON（保持原行为）
- `GET /console` -> 返回 `index.html`

## 5.3 限速验证
- 对 `/api/status` 在同 IP 内持续压测，观察触发限速惩罚；
- 对扫描路径短时并发请求，观察更快触发惩罚。

## 6. 回滚方案
- 回滚 `web/nginx/default.conf.template` 防刷增量；
- 视需要回滚 `web/vercel.json` 扫描 rewrite；
- 删除 `web/public/hello-hack.txt`（如果不再需要）。

回滚后系统恢复为现有代理与 SPA 路由行为。
