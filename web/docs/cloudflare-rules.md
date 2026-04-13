# Cloudflare Rules for Nbility / new-api

## 适用架构

- `nbility.dev` -> Cloudflare -> Vercel
- `api.nbility.dev` -> Cloudflare -> Zeabur -> `new-api`

## 设计原则

- 明显扫描流量：直接 `阻止`
- 可能误伤真人或合法 SDK 的流量：优先 `托管质询`
- `/v1` `/v1beta` `/mj` `/pg` 只做粗粒度挑战和限流，不在 Cloudflare 上做过细的业务鉴权语义判断
- 真正的 token 合法性继续交给 `new-api` 的鉴权中间件处理

## 动作选择建议

| 场景 | 建议动作 |
| --- | --- |
| 扫描 `.env`、`wp-admin`、`phpmyadmin` 等明显恶意路径 | `阻止` |
| 登录、注册、找回密码、验证码等高风险真人入口 | `托管质询` |
| 管理后台、管理 API | `托管质询` |
| Relay 接口缺少常见鉴权痕迹 | `托管质询` |
| 高频刷接口 | 推荐使用 `速率限制规则`，动作为 `托管质询` 或 `阻止` |

---

## 一、自定义 WAF 规则

### 规则 1：阻止常见扫描路径

- 作用域：`www` 和 `api`
- 动作：`阻止`

```cf
lower(http.request.uri.path) in {
  "/.env"
  "/wp-admin"
  "/wp-login.php"
  "/phpmyadmin"
  "/admin"
  "/actuator"
  "/manager/html"
  "/cgi-bin/luci"
  "/boaform/admin/formlogin"
}
```

### 规则 2：登录注册等高危入口拦截脚本 UA

- 作用域：`www`
- 动作：`托管质询`
- 说明：不要全站直接对 `curl`、`python-requests` 之类做处理，只限制在高危路径

```cf
(
  starts_with(http.request.uri.path, "/api/user/login")
  or starts_with(http.request.uri.path, "/api/user/register")
  or starts_with(http.request.uri.path, "/api/verification")
  or starts_with(http.request.uri.path, "/api/user/reset")
)
and (
  len(http.user_agent) eq 0
  or lower(http.user_agent) contains "python-requests"
  or lower(http.user_agent) contains "curl"
  or lower(http.user_agent) contains "wget"
  or lower(http.user_agent) contains "httpclient"
  or lower(http.user_agent) contains "go-http-client"
)
```

### 规则 3：管理后台和管理 API 增加挑战

- 作用域：`www`
- 动作：`托管质询`
- 说明：如果觉得 `/console` 对正常管理员干扰太大，可先只保留 `/api/...admin` 这部分

```cf
starts_with(http.request.uri.path, "/console")
or starts_with(http.request.uri.path, "/api/channel")
or starts_with(http.request.uri.path, "/api/token")
or starts_with(http.request.uri.path, "/api/group")
or starts_with(http.request.uri.path, "/api/option")
or starts_with(http.request.uri.path, "/api/checkin/admin")
or starts_with(http.request.uri.path, "/api/invoice/admin")
```

### 规则 4：Relay 接口缺少常见鉴权痕迹时进行挑战

- 作用域：`api`
- 动作：`托管质询`
- 说明：
  - 这条规则只建议挑战，不建议直接阻止
  - `new-api` 实际支持多种认证方式：
    - `Authorization`
    - `x-api-key`
    - `x-goog-api-key`
    - `mj-api-secret`
    - `?key=`
    - `Sec-WebSocket-Protocol`

```cf
(
  starts_with(http.request.uri.path, "/v1")
  or starts_with(http.request.uri.path, "/v1beta")
  or starts_with(http.request.uri.path, "/mj")
  or starts_with(http.request.uri.path, "/pg")
)
and not (
  len(http.request.headers["authorization"]) > 0
  or len(http.request.headers["x-api-key"]) > 0
  or len(http.request.headers["x-goog-api-key"]) > 0
  or len(http.request.headers["mj-api-secret"]) > 0
  or http.request.uri.query contains "key="
  or len(http.request.headers["sec-websocket-protocol"]) > 0
)
```

### 规则 5：明显异常来源国家或 ASN

- 作用域：按需
- 动作：建议先 `托管质询`，确认没误伤后再 `阻止`
- 说明：如果你的业务明确不服务某些国家或某些云厂商 ASN，可以单独补

示例：

```cf
ip.geoip.country in {"KP" "SY"}
```

---

## 二、速率限制规则

> Cloudflare 上对于高频刷接口，优先用 `速率限制规则`，不要全部堆到自定义 WAF 规则里。

### 规则 6：登录限流

- 作用域：`www`
- 路径：`/api/user/login`
- 阈值建议：`1 分钟 / 单 IP > 10 次`
- 动作：`托管质询`
- 持续时间：`10 分钟`

### 规则 7：注册限流

- 作用域：`www`
- 路径：`/api/user/register`
- 阈值建议：`1 分钟 / 单 IP > 5 次`
- 动作：`托管质询`
- 持续时间：`30 分钟`

### 规则 8：验证码 / 找回密码限流

- 作用域：`www`
- 路径：
  - `/api/verification`
  - `/api/user/reset`
- 阈值建议：`1 分钟 / 单 IP > 5 次`
- 动作：`阻止`
- 持续时间：`30 分钟`

### 规则 9：支付 / 兑换 / 下单限流

- 作用域：`www`
- 路径建议：
  - `/api/user/topup`
  - `/api/user/pay`
  - `/api/user/stripe/pay`
  - `/api/redemption`
  - `/api/subscription/stripe/pay`
  - `/api/subscription/creem/pay`
  - `/api/subscription/epay/pay`
- 阈值建议：`1 分钟 / 单 IP > 10 次`
- 动作：`托管质询`

### 规则 10：Relay 基础限流

- 作用域：`api`
- 路径：
  - `/v1/*`
  - `/v1beta/*`
  - `/mj/*`
  - `/pg/*`
- 阈值建议：`10 秒 / 单 IP > 60~120 次`
- 动作：`托管质询`
- 说明：
  - 企业出口、NAT、多用户共享 IP 的情况下不要一开始就设太严
  - 先宽后紧

### 规则 11：模型列表接口限流

- 作用域：`api`
- 路径：
  - `/v1/models`
  - `/v1beta/models`
- 阈值建议：`1 分钟 / 单 IP > 30 次`
- 动作：`阻止`

---

## 三、缓存与代理建议

### `nbility.dev`

- 建议：橙云
- 建议开启：
  - Cloudflare Managed Rules
  - Bot Fight Mode / Super Bot Fight Mode
  - Browser Integrity Check

### `api.nbility.dev`

- 如果存在大量超长请求、长推理、慢任务：
  - 建议优先灰云 `DNS only`
- 如果大多数请求都能快速首包返回，并且主要依赖流式：
  - 可以继续橙云，但必须避免把超长任务长时间挂在一条 HTTP 请求上

### API 缓存建议

以下路径一律 `Bypass Cache`：

- `/api/*`
- `/v1/*`
- `/v1beta/*`
- `/mj/*`
- `/pg/*`

---

## 四、与你项目强相关的注意事项

### 0. 签到功能在当前项目里的真实页面位置

当前 `web` 前端里，用户签到组件 `CheckinCalendar` 挂载在控制台首页：

- 页面路由：`/console`
- 组件挂载：`src/components/dashboard/index.jsx`

这意味着：

- 如果你要求“用户访问签到页面必须触发 Cloudflare 挑战”
- 在当前项目里，**页面级挑战实际等价于挑战 `/console` 首页**
- 它不会只影响签到卡片，而是会影响整个控制台首页访问

如果你的目标是“只在真正使用签到功能时触发挑战”，更适合使用 API 级规则：

- `GET /api/user/checkin`
- `GET /api/user/checkin/leaderboard`
- `POST /api/user/checkin`

### 1. 不要在 Cloudflare 里只检查 `Bearer`

错误示例：

```cf
(http.request.uri.path contains "/v1")
and not any(lower(http.request.headers["authorization"][*])[*] contains "bearer ")
```

原因：

- 你的 `new-api` 不只支持 `Authorization: Bearer ...`
- 还支持：
  - 直接 `Authorization: sk-...`
  - `x-api-key`
  - `x-goog-api-key`
  - `mj-api-secret`
  - `?key=`
  - WebSocket `Sec-WebSocket-Protocol`

### 2. `/v1` 规则优先“挑战”，不要先“阻止”

原因：

- Relay 流量协议多
- SDK 行为差异大
- 容易误杀正常请求

### 3. 真正的鉴权仍交给 `new-api`

Cloudflare 只做：

- 扫描拦截
- 人机挑战
- 限流
- 粗粒度过滤

不要在 Cloudflare 层复刻业务鉴权逻辑。

---

## 五、推荐落地顺序

### 第一批，立即上线

1. 规则 1：扫描路径 -> `阻止`
2. 规则 2：登录注册脚本 UA -> `托管质询`
3. 规则 3：后台入口 -> `托管质询`
4. 规则 6~9：登录注册支付等限流

### 第二批，观察后上线

1. 规则 4：Relay 空鉴权痕迹 -> `托管质询`
2. 规则 10：Relay 基础限流
3. 规则 11：模型列表限流

### 第三批，按业务扩展

1. 国家限制
2. ASN 限制
3. 企业客户白名单 / 跳过规则

---

## 六、签到功能专用规则

> 你当前要求是：用户访问签到页面时，必须触发 Cloudflare 挑战。  
> 在当前项目中，这对应的页面实际上是 `/console`。

### 方案 A：页面级挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：整个 `/console` 首页
- 适用场景：你接受用户每次进入控制台首页都先过一次 Cloudflare 挑战

```cf
http.request.uri.path eq "/console"
```

说明：

- 这是当前项目中最符合“访问签到页面就挑战”的页面级规则
- 但因为签到不是独立 URL，而是在控制台首页组件内展示，所以无法只挑战签到卡片本身

### 方案 B：页面级严格版

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：
  - `/console`
  - `/console/`
- 适用场景：避免尾部斜杠差异导致漏匹配

```cf
http.request.uri.path eq "/console"
or http.request.uri.path eq "/console/"
```

### 方案 C：最小影响版，不挑战整个页面，只挑战签到接口

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：只影响签到相关请求，不影响控制台首页其他模块
- 更推荐

```cf
starts_with(http.request.uri.path, "/api/user/checkin")
```

### 方案 D：最稳妥版，只在真正点击签到时挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：仅签到提交动作
- 对现有页面和功能影响最小

```cf
http.request.method eq "POST"
and http.request.uri.path eq "/api/user/checkin"
```

### 方案 E：签到状态查询时触发挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：用户打开签到区域时，请求签到状态接口就会触发挑战
- 对应请求示例：
  - `https://nbility.dev/api/user/checkin?month=2026-04`
  - `https://nbility.dev/api/user/checkin?month=2026-05`

```cf
(
  lower(http.host) eq "nbility.dev"
  or lower(http.host) eq "nbility.dev"
)
and http.request.method eq "GET"
and http.request.uri.path eq "/api/user/checkin"
```

说明：

- 不要把 `month=2026-04` 这种具体查询参数写死到规则里
- 应按路径匹配，否则下个月参数变化后规则就失效

### 方案 F：签到功能全链路挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：
  - `GET /api/user/checkin`
  - `POST /api/user/checkin`
  - `GET /api/user/checkin/leaderboard`

```cf
(
  lower(http.host) eq "nbility.dev"
  or lower(http.host) eq "nbility.dev"
)
and starts_with(http.request.uri.path, "/api/user/checkin")
```

### 方案 G：签到提交时触发挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：仅用户点击“立即签到”提交时触发挑战

```cf
(
  lower(http.host) eq "nbility.dev"
  or lower(http.host) eq "nbility.dev"
)
and http.request.method eq "POST"
and http.request.uri.path eq "/api/user/checkin"
```

### 方案 H：签到榜查询时触发挑战

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：用户访问签到榜时触发挑战

```cf
(
  lower(http.host) eq "nbility.dev"
  or lower(http.host) eq "nbility.dev"
)
and http.request.method eq "GET"
and http.request.uri.path eq "/api/user/checkin/leaderboard"
```

### 页面级方案的最终建议

如果你坚持“页面级”：

- 用方案 B

如果你优先考虑“不影响现有功能和用户体验”：

- 用方案 D
- 或退一步用方案 C

### 页面级完整 host 条件版

- 作用域：`www`
- 动作：`托管质询`
- 影响范围：整个 `/console` 首页

```cf
(
  lower(http.host) eq "nbility.dev"
  or lower(http.host) eq "nbility.dev"
)
and (
  http.request.uri.path eq "/console"
  or http.request.uri.path eq "/console/"
)
```

---

## 七、最终建议

- `nbility.dev`
  - 保持橙云
  - 上扫描拦截、登录注册质询、后台质询、支付限流

- `api.nbility.dev`
  - 如果长请求很多，优先考虑灰云
  - 如果仍保留橙云，只做粗粒度挑战和限流

- 对“签到必须挑战”这件事：
  - 页面级：`/console`
  - 更稳妥：`/api/user/checkin`
  - 最小影响：`POST /api/user/checkin`

---

## 八、后续建议

- 如果 `api.nbility.dev` 经常出现长请求超时，不要继续靠 WAF 规则硬扛
- 优先改：
  - 流式响应
  - 异步任务
  - 轮询结果
- 对于 `new-api` 这种 AI relay 服务，可用性优先级通常高于把所有 API 都放在 Cloudflare 橙云后面
