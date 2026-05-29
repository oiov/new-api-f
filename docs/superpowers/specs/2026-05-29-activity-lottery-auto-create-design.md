# 活动抽奖 — 自动建期 + 自动发码 设计

> Date: 2026-05-29
> 状态：设计已与用户确认，待 spec 评审 → 实现计划
> 涉及模块：Go 后端（model / service / controller / router）+ 旧前端 `web/`（CheckinAdmin 页）

## 0. 背景与目标

当前「活动抽奖」功能（`/console/checkin-admin` 的「活动抽奖」tab）需要管理员**每期手动操作**：

1. 手动到兑换码页创建额度兑换码；
2. 手动新建一期抽奖（`Nbility 日常抽奖活动第 x 期`），把兑换码粘到 `prize_content`；
3. 手动发布/开启。

开奖+发奖**已经自动化**：`service/activity_lottery_task.go` 的 20s master ticker 在 `end_at` 到点后自动开奖、发站内信+邮件。

**本设计补齐缺失的两环**：
- **自动建期**：按管理员配置的「自动抽奖任务」定时创建并开启新一期，期号自增。
- **自动发码**：开奖时为每个中奖者即时生成各自的额度兑换码，分别发放到站内信/邮箱。

### 已确认的设计决策

| 决策点 | 结论 | 排除的备选 |
|---|---|---|
| 触发机制 | **内置 master ticker 定时任务**（仿 `CheckinAutoJob`） | 外部 webhook（Cloudflare/cron-job.org） |
| 管理方式 | 管理员可**创建/编辑/启停/删除**任务 | — |
| 奖品发放 | **每人一码**（per-winner） | 多人共享一码（只有一人能兑，是 bug） |
| 码生成时机 | **开奖事务内即时生成** | 建期时预生成码池（有浪费/作废逻辑） |
| 码类型/额度 | **固定额度 quota 兑换码**（任务模板配置） | 订阅套餐码 |
| 节奏 | **每日一期** | 固定间隔 N 小时 / 每周 |
| 模板参数 | **任务独立模板** | 复用全局 `ActivityLotterySetting` |

## 1. 架构

复用仓库既有的两段 master-node ticker 模式，**只新增「自动建期」一环**；开奖+发奖沿用现有 `activity_lottery_task.go`（仅对 draw 做向后兼容的分支改造）。

```
管理员 /console/checkin-admin「活动抽奖」tab
        │  创建/编辑/启停「自动抽奖任务」(activity_lottery_auto_jobs)
        ▼
┌──────────────────────────────────────────────────────────────┐
│  新增 ticker: StartActivityLotteryAutoCreateTask (20s, master)  │
│   对每个 enabled 任务（事务内 SELECT FOR UPDATE 防并发）:        │
│     now 已过当天 run_at 时刻                                    │
│     且 last_run_date != 今天                  // 当天未建过      │
│     且 (last_round 不存在 或 已 drawn/expired/closed) // 不重叠 │
│     → issue_no++; title=展开模板;                              │
│       CreateActivityLotteryRound(prize_mode=per_winner_code,…) │
│       OpenActivityLotteryRound; 记 last_run_date / last_round_id│
└──────────────────────────────────────────────────────────────┘
        ▼ (期 open，用户参与)
┌──────────────────────────────────────────────────────────────┐
│  已有 ticker: activity_lottery_task (20s, master) —— 不新增     │
│   end_at 到 → DrawActivityLotteryRoundWithOptions             │
│     if prize_mode == per_winner_code:   // 仅自动期            │
│       事务内为每个中奖者 buildRedemptionKey 生成 quota 码       │
│       winner.prize = key                                       │
│     else: <现有共享 prize_content 逻辑，原样保留>              │
│   NotifyActivityLotteryWinnersAsync: 每人发各自 prize          │
└──────────────────────────────────────────────────────────────┘
```

关键文件：
- 新增 `model/activity_lottery_auto_job.go`、`service/activity_lottery_auto_create_task.go`、`controller/activity_lottery_auto_job.go`
- 改造 `model/activity_lottery.go`（draw 分支、round/winner 新字段）、`service/activity_lottery_notify.go`（per-winner 通知）
- `main.go` 注册新 ticker 一行；`model/main.go` AutoMigrate 注册新表
- `router/api-router.go` 注册管理接口
- `web/src/pages/CheckinAdmin/index.jsx` + 新组件：自动任务配置 UI

## 2. 数据模型

> 迁移策略：GORM `AutoMigrate` 对已有表新增列跨三库安全（SQLite/MySQL/PG），无需手写 ALTER。新表加入 `model/main.go:migrateDB()` 的 `AutoMigrate(...)` 列表与 `migrateDBFast()` 的并行列表。所有 JSON 操作走 `common.*`（Rule 1）。

### 2.1 新表 `activity_lottery_auto_jobs`

```go
type ActivityLotteryAutoJob struct {
    Id                       int     `json:"id" gorm:"primaryKey;autoIncrement"`
    Name                     string  `json:"name" gorm:"type:varchar(128);not null;default:''"`
    Enabled                  bool    `json:"enabled" gorm:"not null;default:true;index"` // 启停
    TitleTemplate            string  `json:"title_template" gorm:"type:varchar(128);not null;default:''"` // 含 {n}
    IssueNo                  int     `json:"issue_no" gorm:"not null;default:0"`          // 期号计数器
    RunAtSeconds             int     `json:"run_at_seconds" gorm:"not null;default:0"`    // 当天开期时刻 0..86399 (Asia/Shanghai)
    DurationSeconds          int     `json:"duration_seconds" gorm:"not null;default:0"` // end_at = start_at + duration
    WinnerCount              int     `json:"winner_count" gorm:"not null;default:0"`
    MinParticipants          int     `json:"min_participants" gorm:"not null;default:0"`
    JoinSources              string  `json:"join_sources" gorm:"type:varchar(128);not null;default:'manual'"` // CSV
    JoinTopupMinMoney        float64 `json:"join_topup_min_money" gorm:"not null;default:0"`
    JoinDailyConsumeMinMoney float64 `json:"join_daily_consume_min_money" gorm:"not null;default:0"`
    PrizeQuota               int     `json:"prize_quota" gorm:"not null;default:0"`     // 兑换码额度(quota 单位，1 美元=500000)
    PrizeName                string  `json:"prize_name" gorm:"type:varchar(64);not null;default:''"` // 兑换码 name 模板(含 {n})
    PrizeText                string  `json:"prize_text" gorm:"type:varchar(255);not null;default:''"` // round 展示用奖品名
    LastRunDate              string  `json:"last_run_date" gorm:"type:varchar(10);not null;default:'';index"` // 防当天重复
    LastRoundId              int     `json:"last_round_id" gorm:"not null;default:0"`
    Status                   string  `json:"status" gorm:"type:varchar(32);not null;default:'';index"`
    LastError                string  `json:"last_error" gorm:"type:text;not null;default:''"`
    CreatedAt                int64   `json:"created_at" gorm:"bigint;index"`
    UpdatedAt                int64   `json:"updated_at" gorm:"bigint;index"`
}
func (ActivityLotteryAutoJob) TableName() string { return "activity_lottery_auto_jobs" }
```

### 2.2 `ActivityLotteryRound` 新增字段（手动期默认不受影响）

```go
PrizeMode       string `json:"prize_mode" gorm:"type:varchar(32);not null;default:'shared';index"` // shared | per_winner_code
AutoJobId       int    `json:"auto_job_id" gorm:"not null;default:0;index"`  // 0=手动
PrizeQuota      int    `json:"prize_quota" gorm:"not null;default:0"`        // per-winner 码额度
PrizeName       string `json:"prize_name" gorm:"type:varchar(64);not null;default:''"` // 码 name(已展开期号)
```

常量：
```go
ActivityLotteryPrizeModeShared        = "shared"          // 现有行为
ActivityLotteryPrizeModePerWinnerCode = "per_winner_code" // 自动期
```

### 2.3 `ActivityLotteryWinner` 新增字段

```go
Prize string `json:"prize" gorm:"type:text;not null;default:''"` // 该中奖者分到的兑换码 key
```

- **仅本人可见**：`ActivityLotteryWinnerPublicView` **不加** `prize` 字段（公开榜单不暴露码）。
- 中奖者本人通过 `GetActivityLotterySummary`（已含 `IsWinner` 判定）拿到 `round.Prize` 字段时，per-winner 模式下改为返回**本人的 `winner.prize`**。

## 3. 开奖改造（向后兼容核心）

`DrawActivityLotteryRoundWithOptions`（`model/activity_lottery.go`）在选出 `selected` 中奖者、构造 `winners` 后，**新增分支**：

```
if round.PrizeMode == ActivityLotteryPrizeModePerWinnerCode {
    codeName := normalizeLotteryText(round.PrizeName, 20)   // 截断兜底, 避免超长导致 Create 失败
    for each winner w:
        key = BuildRedemptionKey(RedemptionTypeQuota)   // 复用下沉后的导出生成器
        tx.Create(&Redemption{
            UserId: 0,                       // 系统生成
            Name:   codeName,
            Key:    key,
            Quota:  round.PrizeQuota,
            RedemptionType: RedemptionTypeQuota,
            Status: common.RedemptionCodeStatusEnabled,
            CreatedTime: nowUnix,
            ExpiredTime: 0,                  // 中奖奖励码恒不过期, 兑换时机由用户决定
        })
        w.Prize = key
    // 站内信 content 用 w.Prize（每人各自的码）
} else {
    // 现有共享 prize_content 逻辑，原样保留 —— 手动期永远走这里
}
```

注意：
- `buildRedemptionKey` 目前是 `controller/redemption.go` 的非导出函数。需**下沉到 model 包**为导出函数 `BuildRedemptionKey`（model 已 import common，无 import cycle；`controller` 改调用它，行为不变）。常量 `redemptionKeyPrefix*` 一并迁移。
- `PrizeName` 经 `normalizeLotteryText(_, 20)` 截断，确保不触发兑换码 name 长度约束导致 `tx.Create` 失败（**展开期号后的长度才是关键**）。
- `Redemption` 无 GORM hooks，`tx.Create` 在事务内安全（已核对 `model/redemption.go`，其 `Insert()` 用 `DB.Create`，这里改用 `tx.Create`）。
- 生成码与写 winner、改 round 状态、发站内信**在同一事务**内；任一步失败 → 整体回滚，round 保持 `open`，`last_error` 记录，下个 ticker 周期重试（幂等：因为 round 仍 open 未 drawn）。
- 站内信仍在 draw 事务内逐个 `CreateSiteNotificationTx`（现有做法），content 由共享 prize 改为 `w.Prize`。

### 3.1 中奖者奖品展示（`GetActivityLotterySummary`，必改）

现有 `model/activity_lottery.go` 在 `isWinner` 分支返回 `round.PrizeContent`（`if prize==""→round.Prize`）。自动期不设 `PrizeContent`，中奖者本人将看不到自己的码。**必须改为**：

```
if isWinner {
    if round.PrizeMode == ActivityLotteryPrizeModePerWinnerCode {
        // 查本人 winner 行，返回 winner.Prize（本人专属码）
        prize = <SELECT prize FROM activity_lottery_winners WHERE round_id=? AND user_id=?>
    } else {
        prize = strings.TrimSpace(round.PrizeContent)   // 现有行为
        if prize == "" { prize = strings.TrimSpace(round.Prize) }
    }
}
```

手动期（shared）走 else 分支，行为不变。per-winner 码**只对中奖者本人**经此返回，公开视图不含。

## 4. 通知改造（per-winner）

`service/activity_lottery_notify.go`：
- `NotifyActivityLotteryWinnersAsync` 已逐个 winner 循环发送邮件。改为：每个 winner 的通知正文使用**该 winner 的 `Prize`**；若 `winner.Prize` 为空（手动期 shared）→ **回退到 `round.PrizeContent`**（= 现有行为）。
- `buildActivityLotteryWinnerNotification` 增加一个 prize 文本入参（或拆出 `buildActivityLotteryWinnerNotificationWithPrize(round, prizeText)`），空时回退 round 级 prize。

## 5. 自动建期 service

新增 `service/activity_lottery_auto_create_task.go`，结构完全仿 `checkin_auto_task.go` / `activity_lottery_task.go`：

```go
const activityLotteryAutoCreateTickInterval = 20 * time.Second
var (activityLotteryAutoCreateOnce sync.Once; activityLotteryAutoCreateRunning atomic.Bool)

func StartActivityLotteryAutoCreateTask() {
    activityLotteryAutoCreateOnce.Do(func() {
        if !common.IsMasterNode { return }
        gopool.Go(func() {
            ticker := time.NewTicker(activityLotteryAutoCreateTickInterval); defer ticker.Stop()
            runActivityLotteryAutoCreateOnce()
            for range ticker.C { runActivityLotteryAutoCreateOnce() }
        })
    })
}
```

`runActivityLotteryAutoCreateOnce`：
1. `CompareAndSwap` 单实例保护；若全局 `ActivityLotterySetting.Enabled == false` 则跳过（沿用总开关）。
2. `now := model.GetCheckinNow()`（Asia/Shanghai）。
3. 调 `model.ListDueActivityLotteryAutoJobs(now)`：`enabled=true` 的任务。
4. 对每个任务 `model.RunActivityLotteryAutoJob(jobId, now)`（事务内）：
   - `SELECT FOR UPDATE` 该 job；
   - 计算当天 `run_at`（`getActivityLotteryDayStart(now) + run_at_seconds`）；若 `now < run_at` → 跳过；
   - 若 `last_run_date == 今天`（`formatCheckinDate`）→ 跳过；
   - 若 `last_round_id > 0` 且对应 round 状态为 `open`（仍进行中）→ 跳过（不重叠）；
   - `issue_no++`；`title = strings.ReplaceAll(title_template, "{n}", issue_no)`；同理展开 `prize_name`；
   - `start_at = run_at`（或 now，取较晚）；`end_at = start_at + duration_seconds`；
   - 构造 `ActivityLotteryRoundUpsertRequest`，但**经由新建期入口**写入 per-winner 字段（`prize_mode=per_winner_code`、`auto_job_id`、`prize_quota`、`prize_name`（展开 `{n}`）、`Published=true`）；码不过期（`ExpiredTime=0`，见 §3）；
   - 创建 round 后 `OpenActivityLotteryRound`；
   - 更新 job：`last_run_date=今天`、`last_round_id`、`issue_no`、`status`、清 `last_error`。
   - 出错 → 记 `last_error`，不递增 `last_run_date`（下个周期重试）。

`main.go` 在 `StartActivityLotteryTask()` 附近加一行 `service.StartActivityLotteryAutoCreateTask()`。

> CreateActivityLotteryRound 现有签名只接受 `ActivityLotteryRoundUpsertRequest`（无 per-winner 字段）。方案：给 `ActivityLotteryRoundUpsertRequest` 增加可选字段 `PrizeMode/AutoJobId/PrizeQuota/PrizeName`，**手动 controller 不传 → 零值 → `prize_mode` 落为 `shared`**（`CreateActivityLotteryRound` 内对空 `prize_mode` 归一为 `shared`）。这样手动路径行为不变。

## 6. 管理接口

挂在已有 `/api/activity/lottery/admin` 组下（`router/api-router.go`，`AdminAuth()` + `PermissionAuth`）：

| 方法 | 路径 | 权限 | handler |
|---|---|---|---|
| GET | `/activity/lottery/admin/auto_jobs` | `ActivityAdminView` | `AdminListActivityLotteryAutoJobs` |
| GET | `/activity/lottery/admin/auto_jobs/:id` | `ActivityAdminView` | `AdminGetActivityLotteryAutoJob` |
| POST | `/activity/lottery/admin/auto_jobs` | `ActivityAdminManage` | `AdminCreateActivityLotteryAutoJob` |
| PUT | `/activity/lottery/admin/auto_jobs/:id` | `ActivityAdminManage` | `AdminUpdateActivityLotteryAutoJob` |
| DELETE | `/activity/lottery/admin/auto_jobs/:id` | `ActivityAdminManage` | `AdminDeleteActivityLotteryAutoJob` |

- 响应沿用 `common.ApiSuccess` / `common.ApiError` 约定。
- 创建/编辑校验：`title_template` 非空且含 `{n}`（或允许无 `{n}` 但需提示）；`duration_seconds > 0`；`run_at_seconds ∈ [0,86399]`；`winner_count >= 1`；`prize_quota > 0`；`prize_name` 展开期号后 ≤ 20 字（与现有兑换码 name 校验一致，避免开奖时生成失败）；`join_sources` 经 `NormalizeActivityLotteryJoinSources`；启用 topup/consume 时对应门槛 > 0。
- 中奖奖励码**恒不过期**（无过期配置项），兑换时机由用户决定。
- 编辑随时生效**下一期**，不影响已建期。删除任务不影响已建期。

## 7. 后台 UI（旧 `web/`）

> 依据根 CLAUDE.md Rule 7：`web-worker/` 重构期间 `web/` 旧前端照常维护。本配置加在 `web/`。

- 落点：`web/src/pages/CheckinAdmin/index.jsx`「活动抽奖」tab（`TAB_LOTTERY`）内，新增「自动抽奖任务」配置区（或新增子 tab），**仿现有「自动签到任务」(`TAB_AUTO_JOBS`) 的表格 + 弹窗交互**（Semi UI、CardTable、CardPro）。
- 该文件已 2722 行，过大：新逻辑抽到独立组件（如 `web/src/pages/CheckinAdmin/ActivityLotteryAutoJobPanel.jsx`）以避免继续膨胀，仅在 index.jsx 内挂载。
- 字段：任务名、启停开关、标题模板、开期时刻、持续时长、中奖人数、最低参与人数、参与方式（含门槛）、兑换码额度、兑换码 name、奖品展示名；列表展示当前期号 `issue_no`、`last_run_date`、`status`、`last_error`。
- i18n：新增中文 key 到 `web/src/i18n/locales/*.json`（key 为中文源串，Rule 中前端 i18n）。
- **不引入** 新 UI 库。

## 8. 边角情况

| 情况 | 处理 |
|---|---|
| 实际合格参与人数 < winner_count | `pickRandomUserIDs` 返回实际人数，**只生成实际中奖人数的码**（即时生成，无浪费） |
| 参与人数 < min_participants | 沿用现有 `ExpireActivityLotteryRound`：该期 expire，不开奖、不生成码 |
| 多 master 并发 | `IsMasterNode` 单点 + ticker `CompareAndSwap` + job 行 `SELECT FOR UPDATE` + `last_run_date` 当天去重 |
| SQLite 无 `FOR UPDATE` | GORM 在 SQLite 下**忽略** `clause.Locking{Strength:"UPDATE"}`（现有 `DrawActivityLotteryRoundWithOptions` 已这样用且在 SQLite 跑通）。SQLite 串行写 + `last_run_date` 当天去重 + 单 master 已足够防重复建期；不依赖行锁 |
| 上一期还 open（未到 end） | 跳过建期，不重叠（`OpenActivityLotteryRound` 也会关闭其他 open 期，双保险） |
| 生成兑换码失败 | draw 整体事务回滚，round 保持 open，`last_error` 记录，下周期重试 |
| 总开关 `ActivityLotterySetting.Enabled=false` | 建期 ticker 与开奖 ticker 均跳过 |
| 任务 enabled=false | 建期 ticker 跳过；已建/进行中的期不受影响（照常开奖） |
| run_at 时区 | 统一 Asia/Shanghai（`GetCheckinNow` / `getActivityLotteryDayStart`） |
| 兑换码归属 | `UserId=0`（系统生成）；可在开奖日志 `RecordLog` 标注来源期号 |

## 9. 实现切片（建议顺序）

1. **S1 数据层**：新表 struct + round/winner 新字段 + 常量；`model/main.go` 迁移注册；`buildRedemptionKey` 下沉为导出函数（controller 改调用）。验收：编译通过、迁移在三库可跑、现有 redemption 测试通过。
2. **S2 开奖改造**：draw per-winner 分支 + notify per-winner + summary per-winner 展示；**保证 shared 分支零行为变化**。验收：新增单测覆盖 per_winner_code 与 shared 两条路径；手动期回归。
3. **S3 自动建期**：`ActivityLotteryAutoJob` model CRUD + `RunActivityLotteryAutoJob` + service ticker + main.go 注册。验收：单测覆盖到点建期/当天去重/不重叠。
4. **S4 管理接口**：controller + router。验收：接口冒烟。
5. **S5 后台 UI**：CheckinAdmin 自动任务面板 + i18n。验收：创建/编辑/启停/删除可用，请求字段与后端一致。

## 10. 验收 & 走查清单

- [ ] **手动期回归**（最高优先）：手动新建一期、填 `prize_content`、开启、（强制/到期）开奖 → 单一共享奖品行为与改造前完全一致；公开榜单接口形状不变。
- [ ] 自动任务到点建期，期号自增，title/prize_name 正确展开 `{n}`。
- [ ] 当天重复 tick 不重复建期；上一期未结束不建新期。
- [ ] 自动期开奖：每个中奖者获得**各自不同**的有效 quota 兑换码，能成功兑换且额度正确、**不过期**（`ExpiredTime=0`）。
- [ ] 中奖者站内信 + 邮件收到本人的码；非中奖者/公开接口看不到任何码。
- [ ] 参与不足 min_participants → 该期 expire，不生成码。
- [ ] 三库（SQLite/MySQL/PG）迁移与开奖均通过。
- [ ] 兑换码 `name` 长度等校验不会导致开奖事务失败。

## 11. 不做（YAGNI）

- 不做外部 webhook 触发端点。
- 不做建期预生成码池 / 码作废逻辑。
- 不做每周/任意 cron 表达式（仅每日：靠 `last_run_date` 当天去重实现，**当前不加 `cadence` 列**；未来扩展再加列）。
- 不改 `web-worker/` 新前端（本功能属管理端，仍在 `web/`）。
- 不做订阅套餐类奖品（仅 quota 码）。
