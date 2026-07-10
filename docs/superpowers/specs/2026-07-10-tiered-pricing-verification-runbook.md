# tiered_expr 分档计费 —— 上线配置与验证 Runbook

> 配套设计文档：`2026-07-10-tiered-pricing-port-design.md`
> 适用版本：包含 review 修复提交（后端 `965feb43a`、M3 `049a2990f`、web-worker `160b704`）之后的部署。
> 目标：上线后**证明**分档计费配置正确、扣费落在正确档位、修复过的漏洞路径全部闭合。

## 1. 配置

### 1.1 管理后台（推荐）

倍率设置 → 模型定价编辑器 → 选中模型 → 计费模式选「表达式计费」→ 可视化填档（或 Raw 模式直贴）→ 保存。

GPT-5.6 形态模板（系数填**真实 $/1M token 单价**，不是倍率）：

```
len <= 272000
  ? tier("standard",     p*<输入单价> + c*<输出单价> + cr*<缓存读单价>)
  : tier("long_context", p*<翻倍输入> + c*<翻倍输出> + cr*<翻倍缓存读>)
```

变量：`p` 输入、`c` 输出、`len` 完整上下文长度（判档专用，含缓存 token、不受扣减影响）、
`cr` 缓存读、`cc`/`cc1h` 缓存写 5m/1h、`img`/`img_o` 图像、`ai`/`ao` 音频。

保存时后端跑 `SmokeTestExpr` 校验（已加固：负数结果、NaN/Inf、非对称向量当场拒绝），
报错 = 表达式不合法，**不会**落库。

### 1.2 API 批量配置

`PUT /api/option/`，两个 key，值均为 `{"模型名": "..."}` 的 JSON map 字符串：

- `billing_setting.billing_mode` → `{"gpt-5.6": "tiered_expr"}`
- `billing_setting.billing_expr` → `{"gpt-5.6": "len <= 272000 ? ... : ..."}`

### 1.3 配置生效断言（3 条）

| # | 断言 | 方法 |
|---|---|---|
| C1 | pricing 带出分档数据 | `GET /api/pricing` → 该模型条目含 `billing_mode:"tiered_expr"` + `billing_expr` |
| C2 | 多节点一致 | 各节点分别查 `/api/pricing`（经 SyncOptions 传播；**删配置/清空表达式即时生效，无需重启**——修复后行为） |
| C3 | 渠道测试冒烟 | 管理端渠道测试页测一发该模型 → 测试日志有非 0 quota 和 `matched_tier` |

## 2. 验证

### 2.1 环境（沿用既有 slave 验证套路）

```bash
set -a; source .env; set +a
export NODE_TYPE=slave SKIP_AUTO_MIGRATE=true PORT=3001
./new-api   # 连生产库只读，不 migrate；用 .env 里的 patchToken 发请求
```

**省钱技巧**：先配一个**阈值极小的同构表达式**（如 `len <= 1000 ? ... : ...`）验证切档机制，
机制确认后换回正式 272K 阈值，只补发一次长文档请求确认真实阈值。

### 2.2 手工核算公式（quota 断言依据）

```
quota = 表达式结果($) / 1,000,000 × QuotaPerUnit(默认 500000) × 分组倍率
```

例：`tier("standard", p*1.25 + c*10)`，实际 p=1000 / c=500、分组倍率 1：
`(1000×1.25 + 500×10)/1e6 × 500000 = 3125`。
结算走 decimal，日志 quota 必须**分毫不差**；不差 1（tiered 无 min-1 兜底，极小请求可为 0，属预期）。

### 2.3 测试矩阵

日志断言看管理端日志详情的 `other` 字段（`billing_mode` / `expr_b64` / `matched_tier`）与 quota 值。

| # | 测试 | 请求构造 | 断言 |
|---|---|---|---|
| T1 | 短上下文落标准档 | `stream:true` 小 prompt | `matched_tier="standard"`，quota 与 2.2 核算一致 |
| T2 | 长上下文落高档 | prompt 超阈值 | `matched_tier="long_context"`，单价按高档 |
| T3 | 跨档结算 | 短 prompt + 大 `max_tokens` 诱导长输出 | 按**实际** token 重算档位结算，非预扣档 |
| T4 | 工具附加费 ⚠️修复项 | 带 `web_search` 的 responses 请求 | quota = 表达式 + 工具费；日志"Web Search 花费"与实扣一致（修复前工具费被丢弃但日志谎报） |
| T5 | audio 不再计 0 ⚠️P0 修复项 | 给 audio/realtime 模型临时配 tiered 发一发 | quota **非 0** 且带 `matched_tier`（修复前 bill-zero 全额退预扣） |
| T6 | 回退安全 ⚠️修复项 | 清空表达式保存后再请求；再删 `billing_mode` | 均正常走 ratio 计费不报错、即时生效不需重启 |
| T7 | 缓存变量 | 带 prompt cache 的请求 | `cr`/`cc` 按表达式单价计；`len` 含缓存 token 判档 |
| T8 | 表达式运行失败可见性 ⚠️修复项 | 表达式含 `param("n") > 3`，请求发 `"n":"abc"` | 请求按预扣估算收费，后端日志出现 `tiered settle expr failed`（修复前静默） |
| T9 | 用户侧展示（web-worker） | 打开定价页 + 日志详情 | 分档价格表渲染、命中档高亮、中文档位名不乱码、`&&` 条件完整显示 |

T1/T2/T6 为最小必测集；T4/T5/T8 是本次修复的回归锚点，首次上线务必各跑一遍。

### 2.4 编辑器回归点（M3，配置时顺手验证）

- Raw 模式贴一个带括号嵌套/`1e3` 系数的表达式 → 切「可视化」→ 应弹确认框而非静默清空
- 建一条 param「包含」/「大于」请求规则 → 保存 → 重新打开 → 规则完整回显

## 3. 上线后监控哨点

| 哨点 | 含义 | 动作 |
|---|---|---|
| 日志关键字 `tiered settle expr failed` | 表达式在真实请求上运行失败，按预扣估算收费 | 立即检查该模型表达式（常见：param() 类型不符） |
| 日志关键字 `quota saturation` / `other.admin_info.quota_saturation` | 有请求触发 int32 钳制或负数落 0 | 正常运营不应出现；出现 = 表达式产出异常值，排查 |
| tiered 模型日志大量 quota=0 | 极小请求属预期，成规模则异常 | 核对表达式系数与 usage 上报 |
| `matched_tier` 分布 | 应与流量上下文长度分布吻合 | 全落单一档 = 阈值或 `len` 上报可疑 |

## 4. 已知边界（预期行为，非 bug）

- 预扣费按 `max_tokens`（缺省 8192）估算输出，超长输出可致余额短暂深负，结算为准。
- tiered 结算无 min-1 quota 兜底（与 ratio 路径不同），极小请求可计 0。
- `header()` 条件可被客户端自带 header 命中——**只用于加价方向**，勿做降价条件（可被自选优惠）。
- ratio_sync 管理页（从外部上游拉价格）不含分档数据同步，属上游功能重构，单独排期；
  同集群多节点传播不受影响（走 option SyncOptions）。
- `expr.md` 文档中的 `|||when(...)` 后缀为文档漂移，实际实现是 `(base) * (cond ? mult : 1)` 因子。
