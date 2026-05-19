# Seedance2 按秒渠道设计

## Scope

新增独立 `Seedance2` 渠道类型，用于官方 Seedance 2 按秒计费模型。现有 `Seedance` 渠道继续只服务 `seedance-2-cheap`，继续按次计费，不与新渠道共用计费路径。

## 渠道与模型

- 新增 `ChannelTypeSeedance2` / `APITypeSeedance2`，显示名 `Seedance2`。
- 默认 base URL 为 `https://api.llms.best`。
- 支持模型：
  - `seedance-2`
  - `seedance-2-480p`
  - `seedance-2-720p`
  - `seedance-2-1080p`
  - `seedance-2-2k`
  - `seedance-2-4k`
- 明确拒绝 `seedance-2-cheap`，避免误走按秒渠道。

## 请求与转发

新渠道复用 Seedance multipart 协议：

- `POST /v1/video/generations`
- `GET /v1/video/generations/{task_id}`
- 字段：`model`, `prompt`, `duration`, `ratio`, `image_1`, `image_2`, `image_3`, `video`, `audio`

`duration` 缺省为 5，允许 4 到 15。`ratio=adaptive` 允许用于官方按秒模型。

## 计费

按秒模型提交前计算 billable seconds：

```text
billable_seconds = output_duration + reference_video_seconds + reference_audio_seconds
```

- `output_duration` 来自 `duration`，缺省 5。
- 上传 `video` 或 `audio` 时必须能读取时长；读取失败直接拒绝请求，不预扣。
- `seedance-2-cheap` 不加入此逻辑，仍通过 `TaskPricePatches` 按次计费。
- 价格语义为“模型固定价配置代表每秒价格”，最终额度为 `model_price * group_ratio * billable_seconds`。

## 轮询与退款

- 轮询状态解析沿用 Seedance 任务响应结构。
- 失败任务使用现有异步任务退款逻辑全额退还预扣。
- 成功任务默认不做完成后差额结算，因为提交前已按请求媒体时长预扣。

## 配置与文档

- 旧 `web` 渠道下拉增加 `Seedance2`。
- `web-worker/src/content/docs/api-videos-seedance.en.md` 中示例 base URL 改为 `https://api.llms.best`。
- 实现后在当前环境新增一条 `Seedance2` 上游渠道记录，key 使用占位字符串，等待后续替换为真实 API key。

## Tests

- 新渠道拒绝 `seedance-2-cheap`。
- 新渠道接受官方按秒模型。
- `duration` 缺省和范围校验正确。
- 参考视频/音频时长计入 `seconds` 计费倍率。
- 媒体时长读取失败时请求校验失败。
- 现有 `Seedance` cheap 测试保持通过。
