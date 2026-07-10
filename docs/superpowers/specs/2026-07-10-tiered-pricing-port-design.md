# 移植上游「表达式分档计费(tiered_expr)」到 fish-new-api

> 目标:让单个模型能按上下文长度(或其他请求条件)切换不同价格,支撑 GPT-5.6 这类
> 「输入 > 272K tokens 价格翻倍」的官方定价。方案 = 从上游 QuantumNous/new-api 全量移植
> 已成熟的 `tiered_expr` 表达式计费引擎,而非自造轮子。

## 1. 背景与结论

- 本地当前是「一模型一价」:所有 ratio getter 只接收模型名,计费公式里 `ratio` 是与
  token 数无关的单一常量(`service/text_quota.go`、`setting/ratio_setting/*`)。无法表达长上下文加价。
- 上游最新版(`quantumnous/main`,分叉点 2026-03-23,上游领先 623 提交)已原生支持,
  实现是一套**表达式计费引擎** `pkg/billingexpr`:一个模型配一条表达式字符串,如
  ```
  len <= 272000
    ? tier("standard",    p * 5  + c * 30 + cr * 0.5)
    : tier("long_context", p * 10 + c * 45 + cr * 1.0)
  ```
  - 变量:`p` 输入、`c` 输出、`len` 完整上下文长度(专用于档位判断,不受缓存扣减影响)、
    `cr` 缓存读、`cc`/`cc1h` 缓存写、`img` 图像、`ai`/`ao` 音频;系数是真实 $/1M 单价。
  - 支持 `param()`(读请求体)、`header()`、`hour()` 等,可做流式加价/时段折扣/按 header 翻倍。
  - 用 `tiered_expr` 作为一种新的 `billing_mode`,与现有 `ratio`/按次计费并存,**不破坏**存量配置。

**决策:走全量移植(路线 1)。** 已把上游全量 fetch 到本地做整体评估,而非只挑相关 commit。

## 2. 分层落点(本项目三前端/后端约束)

- 后端 Go:直接移植,`billingexpr` 等为纯新增包,接入点函数签名与上游一致。
- 管理员前端 = 旧 `web/src`(Semi UI):**配置入口**(倍率设置页的分档编辑器)落在这。
  对标上游 `web/classic`(同为 Semi UI,目录 `pages/Setting/Ratio/...` 与本地几乎一一对应)。
- 用户前端 = `web-worker`(shadcn,独立 git 仓库):**只做展示**(定价页展示分档价、
  日志页展示命中档位)。属加法式改动,可作为独立后续 Phase。

## 3. 后端移植(Go)—— 第一优先级

### 3.1 纯新增文件(直接从 quantumnous/main 搬,零冲突)
- `pkg/billingexpr/`:`compile.go`(175)、`run.go`(140)、`settle.go`(38)、`round.go`(14)、
  `types.go`(73)、`expr.md`(文档)、`billingexpr_test.go`(1011)、`settle_clamp_test.go`(53)
- `setting/billing_setting/tiered_billing.go`(106)—— 用 `config.GlobalConfig.Register`
  注册,本地该机制已存在(见 `setting/performance_setting/config.go` 等),无摩擦。
- `relay/helper/billing_expr_request.go`(91)+ `_test.go`(63)
- `service/tiered_settle.go`(121)+ `service/tiered_settle_test.go`(779)
- 合计约 2900 行,其中大半是测试。

### 3.2 依赖
- `go.mod` 新增 `github.com/expr-lang/expr v1.17.8`(`gjson` 本地已有)。`go mod tidy`。

### 3.3 接入点改造(本地已改过、上游也改过 → 手工合并,非机械 cherry-pick)
逐文件对照上游 diff 手工植入(左=上游自分叉点改动量,供预期冲突面):

| 文件 | 上游改动 | 植入内容 |
|---|---|---|
| `relay/helper/price.go` | +139/-27 | `ModelPriceHelper` 开头加 `tiered_expr` 分支 → `modelPriceHelperTiered()`;签名两边一致 |
| `service/text_quota.go` | +136/-68 | `calculateTextQuotaSummary` 结算处调 `TryTieredSettle`/`BuildTieredTokenParams`/`composeTieredTextQuota`;`PostTextConsumeQuota` 尾部 `InjectTieredBillingInfo` |
| `service/quota.go` | +58/-14 | WSS/Audio 路径接 `TryTieredSettle`(与文本对称) |
| `relay/common/relay_info.go` | +88/-19 | `RelayInfo` 加 `TieredBillingSnapshot *billingexpr.BillingSnapshot`、`BillingRequestInput` 字段 + import |
| `service/log_info_generate.go` | +83 | 新增 `InjectTieredBillingInfo()`(纯追加函数) |

- 冲突主因:本地这 5 个文件自分叉点也各改了几十行(缓存/审计/工具计费等本地特性),
  需人工确认两边改动不打架,尤其 `text_quota.go` 的结算公式段。

### 3.4 校验/存储端点
- `SmokeTestExpr`(编译+样例向量试算,保证非负)在保存表达式时调用。
- 管理员保存分档配置的 controller/option 路径:对照上游 `controller/option.go` / 倍率同步
  (`controller/ratio_sync.go` 的 `GetPricingSyncData`)接线。

### 3.5 用户侧数据链路(供 web-worker 展示)
- `model/pricing.go` 的 `Pricing` 结构体加 `BillingMode`/`BillingExpr`(`json:"...,omitempty"`)
  两字段,`GetPricing()` 填充点在 ratio 填充段(本地约 353-361 行附近):
  当模型是 `tiered_expr` 时写入 mode+expr。→ `/api/pricing` 即带出分档数据。
- 日志侧契约:`InjectTieredBillingInfo` 往 log `other` 写
  `billing_mode="tiered_expr"` + `expr_b64`(base64 表达式)+ `matched_tier`。

### 3.6 关键验证(遵循项目规约:relay 改动需真实 apikey 验证)
- 单测:直接带上游 `*_test.go` 跑 `pkg/billingexpr`、`service/tiered_settle`、`relay/helper/price_test`。
- **集成**:起 slave,用 patchToken 发真实流式请求,分别构造「短上下文」「>272K 长上下文」
  两类请求,核对日志 `matched_tier` 与实际扣费落在正确档位。
- 三库兼容(SQLite/MySQL/PG):option 存取走 GORM,无 DB 特定 SQL,低风险,仍需三库冒烟。

## 4. 管理员前端移植(web/src,Semi UI)—— 第二优先级

对标上游 `web/classic/src/pages/Setting/Ratio/`:
- 新增 `components/TieredPricingEditor.jsx`(约 1697 行,可视化+Raw 双模式编辑器)
- 新增 `components/requestRuleExpr.js`(443)—— `|||when(...)` 请求规则解析
- 新增 `constants/billing.constants.js`(56)—— `BILLING_EXTRA_VARS` 等常量(本地缺,须搬)
- 改造本地 `ModelPricingEditor.jsx`(778 行)+ `useModelPricingEditorState.js`(1031 行):
  对照上游 `classic` 版(781 / 1133 行)植入分档模式的挂接;这是前端主冲突面。
- i18n:编辑器中文 key 需过 `bun run i18n:sync`(本地 web/src 是 Semi 老前端,遵循其 i18n 流程)。

## 5. 用户前端展示(web-worker,shadcn)—— 第三优先级(可独立后续做)

现状均假设「单套价格」,需加分档感知:
- `web-worker/src/api-client/types.ts`:pricing 类型加 `billing_mode?`/`billing_expr?`;
  `LogOther` 加 `billing_mode?`/`expr_b64?`/`matched_tier?`。带 `// source:` + `@quirk` 注释(项目规约 Rule 7)。
- `web-worker/src/components/log/billing-formula.ts`:`BillingFormulaModel` 目前只有
  `'fixed' | 'ratio'`,加 `'tiered'` 分支:解析 `expr_b64` + 高亮 `matched_tier` 档。
- `web-worker/src/components/pricing/usage-pricing-tab.tsx`:`item.model_ratio * 2` 这类单套
  算价改为——若 `billing_mode==='tiered_expr'` 则解析表达式展示多档价格。
- 端口一个精简版表达式解析器(参考上游 `web/default/src/features/pricing/lib/billing-expr.ts`
  779 行 / `tier-expr.ts` 323 行,仅取「解析+展示」子集,不需编辑能力)。
- 写操作对比表:本前端只读展示,无写操作,但仍需截图对比新旧价格展示一致(规约 Rule 7.4)。

## 6. 实施顺序与里程碑

1. **M1 后端引擎落地**:搬 3.1 纯新增文件 + 3.2 依赖 + 跑通上游单测(不接线)。
2. **M2 后端接线**:3.3 五个接入点手工合并 + 3.4 校验端点 + 3.5 pricing/log 字段;
   编译通过 + 单测绿 + slave 真实流式短/长上下文验证(3.6)。
3. **M3 管理员编辑器**:第 4 节;能在后台给某模型配分档表达式并保存生效。
4. **M4 用户侧展示**:第 5 节;定价页/日志页正确展示分档价与命中档位。

M1+M2 交付即已「功能可用」(可用 API/DB 直接配表达式并正确计费);M3 让配置有 UI;
M4 让终端用户看得见。可按此优先级分批推进、分批验证。

## 7. 风险与注意

- **最大风险 = 后端 5 个接入点的手工合并**(本地/上游都改过 `text_quota.go` 等)。
  逐段 diff、保留本地已有特性(工具计费、缓存审计等),不可整文件覆盖。
- 保护条款(CLAUDE.md Rule 5):移植文件均含上游 QuantumNous 版权头,原样保留,不改不删。
- Rule 6(指针零值):新引入的请求 DTO 若有可选标量,遵循指针+omitempty(本移植主要是 float 计算,风险低)。
- web-worker 是独立仓库、团队直接在 main 开发:M4 改动需与该仓库协作节奏对齐,不与外层混提交。
- 全局当前未 commit:移植前建议新建工作分支,后端/前端分批提交,便于出问题按层回退。
