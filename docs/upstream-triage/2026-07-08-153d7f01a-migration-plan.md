# 迁移 Plan: 流中断记录(StreamStatus)+ 断连处理框架(不实现,仅设计)

> 日期: 2026-07-08(2026-07-08 修订:纳入完整上游序列)
> 上游终点: `QuantumNous/new-api@153d7f01a` (#5710),但**依赖一整条 commit 链**
> 状态: **设计文档,未实现**。这是流处理架构级迁移,跨 ~5 个上游 commit、~20 个文件,风险高,需专门排期。

## ❌ 决定(2026-07-08):不做

复核本地 `StreamScannerHandler` 后确认:**本地已具备断连处理的核心保护**,此迁移性价比过低,**决定不做/长期搁置**。

本地 `relay/helper/stream_scanner.go:237-284` 的 scanner 读循环每次读上游前已检查 `c.Request.Context().Done()` → 断连立即 return,**停止读上游 body(不 drain)= 不计费断连后 token**;`wg.Wait()` 有 5 秒超时兜底(慢客户端不永久 hang);写函数 `StringData/FlushWriter/PingData` 已有 context-done 检查。

因此 153d7f01a + 5238f279d 相对本地的**唯一实质增量**是"把流中断原因记入日志(StreamStatus)"——属运营可见性 nice-to-have,**非正确性修复**。用 3-5 天、~20 文件、9 channel 流式回归的高风险迁移换这个,不划算。

> 修正:本文档下方原设计**前提有误**——假设本地断连处理缺失,实际本地早已具备。以下方案仅作存档,若将来只为"中断原因入日志"的运营需求可再评估阶段 A 的最小子集。

---

## ⚠️ 关键认知:这不是"一个 commit 的 backport"

最初以为迁 `153d7f01a`(断连)即可。核查上游 `main` 完整历史后发现:**签名迁移和 StreamStatus/StreamResult 是更早的 `5238f279d` 引入的**,`153d7f01a` 只是在其之上加断连处理。真正的迁移目标是**上游 main 当前形态**,即以下 commit 链的累积效果:

| # | commit | 内容 | 文件数 | 本地状态 |
| --- | --- | --- | --- | --- |
| 1 | `5238f279d` | **feat: 用 StreamStatus 记录流中断原因** —— 引入 StreamStatus/StreamResult + **迁移 8 个 channel 的 dataHandler 签名** + `model/log.go` 记录中断原因 + relay_info.go 加字段 | **17** | ❌ 未做(基础) |
| 2 | `0936e2504` | perf: debug log 避免 eager formatting | 小 | ❌ |
| 3 | `32805849d` | reuse stream scanner buffer | 9 | ✅ **已做**(batch-4) |
| 4 | `59a93cf5c` | fix(openai): image streaming relay governance | 中 | ❌(triage 列 P2) |
| 5 | `153d7f01a` | **fix: 断连后避免陈旧写入 + 不计费 + write deadline** | 6 | ❌(终点) |

> 教训:流处理这种区域,**必看上游 main 完整状态**而非单 commit,否则会漏掉 `5238f279d` 这个真正的大头,把 3-5 天的工程误判成"backport 一个 fix"。

## Context — 最终修什么

- **`5238f279d`**: 把"流为什么中断"(正常结束/客户端停止/handler 停止/错误)结构化记录到 `StreamStatus`,并写入 `model/log.go`(运营可见中断原因)。签名从 `func(data string) bool` 改为 `func(data string, sr *StreamResult)`,用 `sr.Stop(err)`/`sr.Error(err)` 表达。
- **`153d7f01a`**: 断连后立即 cleanup(cancel + 关 upstream body,不 drain)→ **不再计费断连后 token**;每次写前 `ExtendWriteDeadline`(30s)防慢客户端 hang;无条件 `wg.Wait()` 再归还 gin.Context。

## 本地 vs 目标差异

| 维度 | 上游 main(目标) | 本地 | 
| --- | --- | --- |
| `dataHandler` 签名 | `func(data string, sr *StreamResult)` | `func(data string) bool` |
| `StreamStatus`(`relay/common/stream_status.go`,112 行) | 有 | **无** |
| `StreamResult`(`relay/helper/stream_result.go`,52 行) | 有 | **无** |
| `RelayInfo.StreamStatus` 字段 | 有 | **无** |
| `model/log.go` 记录中断原因 | 有 | **无** |
| 9 个调用点签名 | `sr.Stop/Error` | `return bool` |
| 生命周期 | context cancel + once + 立即 cleanup + write deadline | 旧 defer + SafeSendBool |
| `common.go` 断连感知 | requestContextDone + ClaudeData/ChunkData 检查 | **FlushWriter/StringData/PingData 已有**;ClaudeData/ChunkData 无 |
| `firstResponseTimeReader` | 无 | **本地特有(需保留)** |

签名迁移映射模式(以 gemini 为例):
```
func(data string) bool {            →   func(data string, sr *helper.StreamResult) {
    if err != nil { return false }  →       if err != nil { sr.Stop(fmt.Errorf(...)); return }
    return callback(...)            →       if !callback(...) { sr.Stop(...) }
}
```
`return false`(停止/错误) → `sr.Stop(err)`;`return true`(继续) → 隐式继续;软错误 → `sr.Error(err)`。

## 迁移策略(4 阶段,严格按依赖)

### 阶段 A — StreamStatus/StreamResult 基础设施 + 签名迁移(= `5238f279d`) ⚠️ 大头
- 新建 `relay/common/stream_status.go`、`relay/helper/stream_result.go`。
- `RelayInfo` 加 `StreamStatus` 字段;`StreamScannerHandler` 签名改 + 内部 `info.StreamStatus = NewStreamStatus()` + 每次 callback 后检查 `sr.IsStopped()`。
- **迁移 9 个调用点**(gemini/baidu/claude/xai/dify/openai×3/audio)的 dataHandler:`return bool` → `sr.Stop/Error`。逐个核对每个 handler 的 bool 语义。
- `model/log.go` 记录中断原因(需对齐本地 log 结构——本地 log 与上游可能分叉)。
- **保留本地 `firstResponseTimeReader`**(阶段全程带着)。
- 风险: **高**。9 channel 流式全受影响,每个真实验证。工作量最大。

### 阶段 B — image streaming governance(= `59a93cf5c`,可选)
- 与 image 流式相关;若本地 image 中继不迁 StreamStatus 可延后。评估与阶段 A 的耦合度再定。

### 阶段 C — 断连处理 + 生命周期(= `153d7f01a`)
- `StreamScannerHandler`: `context.WithCancel` + `cleanupOnce`/`stopOnce` + `cleanup()` 立即关 body(不 drain) + `defer cleanup()`。
- 每次锁内写前 `ExtendWriteDeadline(c)`(30s)。
- `common.go`: 抽 `requestContextDone(c)`,给 `ClaudeData`/`ClaudeChunkData`/`ResponseChunkData` 加 context-done 提前返回(本地 FlushWriter/StringData/PingData 已有)。
- 风险: **高**(并发生命周期易死锁/泄漏/double-close)。

### 阶段 D(可先做,独立) — 非 scanner 循环断连感知
`common.go` 的 ClaudeData/ChunkData/ResponseChunkData 加 context 检查 + image/audio loop(`relay_image.go`/`openai/helper.go`)检查写错误提前退出。**不依赖 StreamResult**,可作为独立小 commit 先落地,拿 ollama/audio/image 部分收益。

## 关键决策点(实现前拍板)
1. **值不值得**: 这是 3-5 天、~20 文件、9 channel 流式回归的大工程。收益是"断连不计费 + 中断原因入日志 + 慢客户端不 hang"。断连不计费对成本有实际意义,但需权衡工程量与风险。
2. **能否只做子集**:
   - 只做**阶段 D**(独立,0.5 天)→ 拿 ollama/audio/image 断连感知,不碰 scanner 架构。
   - 或 **wrapper 方案**: StreamScannerHandler 内部用 StreamStatus,但**对外保留 `func(data string) bool` 签名**(内部 wrapper 把 bool 映射成 sr.Stop),避免改 9 个调用点。大幅降侵入,偏离上游。
3. `model/log.go` 中断原因字段是否需要(本地 log 已高度自定义,加字段要过 DB 兼容)。

## 验证(必须覆盖断连,见 [[feedback_relay_changes_need_real_apikey_test]])
slave + 真实 apikey:
1. 正常流多厂商完成(回归 9 channel)。
2. **中途断连**: 流式几帧后强制断开 → 后端确认 upstream body 关闭、goroutine 退出、**该请求不再计费后续 token**(查 log quota)、`StreamStatus.EndReason` 记为 client-disconnect。
3. **慢客户端**(`curl --limit-rate`)→ 30s write deadline 生效,不永久 hang。
4. streaming timeout 触发正常清理。
5. 压测后 `runtime.NumGoroutine()` 回落(无泄漏)。

## 工作量重估
- 阶段 A(5238f279d 等价): **2-3 天**(9 channel 签名 + StreamStatus 框架 + log + 逐个验证);wrapper 方案可压到 1-1.5 天。
- 阶段 B(image): 0.5-1 天(视耦合)。
- 阶段 C(153d7f01a 等价): 1-2 天(生命周期 + 断连压测)。
- 阶段 D(独立): 0.5 天。
- **合计: 全量 4-6 天;wrapper+跳过 image 约 2.5-3.5 天。**

## 建议
1. **先做阶段 D**(独立、低风险、0.5 天),拿非 scanner 循环的断连感知部分收益。
2. 阶段 A/C 作为一个专门排期,优先评估 **wrapper 方案**(保留 bool 签名)把侵入和回归面降到最低;`model/log.go` 中断原因视需要决定做不做。
3. 阶段 B(image)与 `59a93cf5c` 一并评估(它也在 triage P2)。
4. 不与组织钱包/订阅重构同期(避免流处理大改 + 账务大改叠加)。
