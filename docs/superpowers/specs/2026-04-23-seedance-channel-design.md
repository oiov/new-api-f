# Seedance 专线渠道设计

> Status: Draft for approval
> Date: 2026-04-23
> Scope: 新增独立 `Seedance` 专线渠道类型，当前仅支持 `seedance-2-cheap`，覆盖 Go 后端、旧版 `web` 渠道配置入口、以及新版 `web-worker` `/playground` 的视频测试能力。
> Out of scope: `Seedance-per` 按秒专线、通用视频框架重构、旧版 `web` 中新增完整视频 playground、数据库 schema migration。

---

## 1. 目标

本次实现解决以下具体问题：

1. 后台需要新增一个独立的 `Seedance` 渠道类型，而不是复用现有 `DoubaoVideo`。
2. 当前该渠道只支持 `seedance-2-cheap` 一个模型。
3. 该模型走按次计费，不读取参考媒体时长，不参与按秒计费逻辑。
4. API 对外支持文档中的 multipart 参数：
   - `prompt`
   - `model`
   - `duration`
   - `ratio`
   - `image_1`
   - `image_2`
   - `image_3`
   - `video`
   - `audio`
5. 旧版 `web` 需要支持管理员创建和配置该渠道。
6. 新版 `web-worker` 需要把 `/playground` 中原来预留的 `Video` tab 实现为可测试的 Seedance 视频工作台。
7. 为未来新增 `Seedance-per` 留出清晰扩展边界，但不提前实现。

---

## 2. 设计结论

### 2.1 渠道形态

`Seedance` 作为新的独立渠道类型实现，使用自己的 task adaptor、模型列表和参数校验逻辑，但继续复用现有通用视频任务框架：

- `POST /v1/video/generations`
- `GET /v1/video/generations/{task_id}`
- 任务入库
- 异步轮询
- OpenAI 风格视频结果转换

这意味着它不是继续挂在 `DoubaoVideo` 下，也不是为此重构整个视频任务系统。

### 2.2 鉴权与连接方式

根据当前文档，渠道采用：

- `Authorization: Bearer <apiKey>`
- 管理员可自定义 `base_url`

本次不引入 `AccessKey|SecretKey`、签名或复合凭据格式。

### 2.3 模型范围

当前只支持：

- `seedance-2-cheap`

所有其他 `seedance-*` 模型都不在本次范围内。前端应隐藏，后端应拒绝。

### 2.4 数据库结论

本次不需要数据库 schema migration。

原因：

- `channels` 已可承载新增渠道类型
- `abilities` 已可承载新增模型名
- `tasks` 已可承载新增异步视频任务记录
- 当前需求只涉及代码中的渠道常量、模型列表、默认价格和前端入口，不需要新增字段或新表

---

## 3. 后端设计

### 3.1 新增渠道类型

后端新增独立 `Seedance` 渠道常量、名称和默认 base URL 占位，行为与其他独立渠道一致：

- 可在后台渠道表单中单独选择
- 可单独配置 key
- 可单独配置 `base_url`
- 可单独声明模型能力

旧版 `web` 的渠道选项、后端渠道名称映射、默认模型列表接口需要同步支持该类型。

### 3.2 Task adaptor 边界

新增 `seedance` task adaptor，职责如下：

1. 校验请求参数
2. 解析 multipart 表单
3. 重建并透传 multipart 到上游
4. 处理提交响应
5. 处理轮询结果
6. 将任务结果转换为现有 OpenAI 风格视频输出

不复用 `DoubaoVideo` adaptor 的协议逻辑，不在现有 `doubao` adaptor 内通过条件分支塞入 `seedance`。

### 3.3 请求参数与表单解析

该渠道只接受文档定义的 multipart 请求格式。

支持字段：

- `model`
- `prompt`
- `duration`
- `ratio`
- `image_1`
- `image_2`
- `image_3`
- `video`
- `audio`

参数规则：

- `model` 必填，且只能为 `seedance-2-cheap`
- `prompt` 必填
- `duration` 可选；如果传入，则校验为合法整数，且范围符合文档约束
- `ratio` 可选；如果传入，只允许以下值：
  - `16:9`
  - `4:3`
  - `1:1`
  - `3:4`
  - `9:16`
  - `21:9`
- `adaptive` 对 `seedance-2-cheap` 直接拒绝
- `image_1` ~ `image_3` 各自最多 1 个文件
- `video` 最多 1 个文件
- `audio` 最多 1 个文件

### 3.4 文件处理策略

本次采用最小可用策略：

- 不做 base64 转换
- 不做 `ffprobe`
- 不做媒体时长读取
- 不做复杂 mime 校验
- 文件二进制原样透传给上游

后端只做字段级校验和 multipart 重建。

### 3.5 上游请求构造

上游请求继续使用 multipart 透传：

1. 读取原始 multipart 表单
2. 重建一个新的 multipart body
3. 写入普通字段
4. 写入上传文件
5. 需要时覆盖 `model` 字段，以兼容模型映射

这样可以保持对外 API、文档和 playground 的请求格式完全一致。

### 3.6 提交与轮询结果

提交成功后：

- 使用现有公开 `task_xxx` 任务 ID 返回给客户端
- 任务入库时保存上游 task ID

轮询成功后：

- 解析上游状态为现有内部任务状态
- 在转换后的返回中暴露现有 OpenAI 风格视频结构
- 成功结果中包含 `result_url` 或 `video_url`

### 3.7 计费边界

`seedance-2-cheap` 按次计费，结论如下：

- 不读取参考视频时长
- 不读取参考音频时长
- 不将 `duration` 参与倍率乘算
- 不走按秒结算
- 任务完成轮询时跳过差额重算

因此，该模型应被明确标记为按次计费模型，行为与当前其他按次任务一致：

- 提交前按固定单价预扣
- 成功后按固定单价结算
- 失败时按现有异步任务退款链路退回

### 3.8 默认价格配置

为保证模型可直接使用，本次需要给 `seedance-2-cheap` 增加默认按次价格入口。

如果缺少默认价格，会出现：

- 管理后台模型可见但无法计费
- 请求时命中“模型价格未配置”

本次不为未来的 `seedance-2-*` 按秒模型增加默认价格或倍率。

---

## 4. 旧版 `web` 设计

### 4.1 渠道配置入口

旧版 `web` 只承担管理员配置入口，不承担本次视频测试 UI。

需要新增：

- 渠道类型下拉项：`Seedance`
- 渠道类型名称映射
- 默认模型列表：`seedance-2-cheap`
- 密钥输入提示：普通 API Key
- `base_url` 可编辑

### 4.2 不扩展的范围

本次不在旧版 `web` 中新增专门的 Seedance 视频 playground。

如果当前旧版渠道测试本来不支持这类视频任务，则继续保持不支持，不为本次额外扩展。

---

## 5. `web-worker` `/playground` 设计

### 5.1 页面定位

`/playground` 中原来占位的 `Video` tab 改为真正可用的 Seedance 视频工作台。

布局方向遵循现有 image 模式的双栏结构，而不是另起一套复杂视频控制台。

### 5.2 布局结构

页面采用双栏：

- 左栏：视频参数与文件上传面板
- 右栏：任务状态与结果展示区

该布局风格与 image 模式一致，只替换字段和右侧结果类型。

### 5.3 顶部模型选择

顶部模型选择器继续沿用现有 header 方案。

当 mode=`video` 时：

- 只显示视频模型
- 当前只展示 `seedance-2-cheap`
- 若远端 `/v1/models` 有返回视频模型，则按视频过滤
- 若远端无结果或失败，则 fallback 至 `seedance-2-cheap`

### 5.4 左栏字段

左栏最小字段集：

- `prompt`
- `duration`
- `ratio`
- `image_1`
- `image_2`
- `image_3`
- `video`
- `audio`
- 提交按钮

不增加本次文档中没有定义的额外参数。

### 5.5 右栏状态

右栏包含以下状态：

1. 初始空态
2. 提交中
3. 轮询中
4. 成功态
5. 失败态

轮询中展示：

- task id
- status
- progress

成功态展示：

- 视频预览播放器
- 下载按钮
- 新开按钮

失败态展示：

- 错误信息
- 可重新提交

### 5.6 前端请求流程

请求链路保持简单：

1. `POST /v1/video/generations`
2. 提交成功后拿到 task id
3. 定时轮询 `GET /v1/video/generations/{task_id}`
4. 成功后渲染视频结果

本次不做：

- SSE
- 任务历史列表
- 中断恢复
- 后台任务管理

### 5.7 组件边界

为避免把视频逻辑硬塞进 image 组件，新增独立边界：

- video types / settings
- video controls component
- video result component
- video hook（提交 + 轮询）
- model filter 扩展支持 `video`

`playground-page.tsx` 只负责模式切换和顶层状态编排。

### 5.8 本地存储

新增 video 专用本地存储键：

- 最近一次视频模式
- 最近一次视频模型
- 最近一次 video settings

不与 chat/image 共用同一个 settings 结构。

---

## 6. 测试设计

### 6.1 后端测试

至少覆盖以下行为：

1. `Seedance` adaptor 请求校验
   - `model` 非 `seedance-2-cheap` 会失败
   - `ratio=adaptive` 会失败
   - `prompt` 缺失会失败
2. multipart 字段解析
   - `image_1~image_3`
   - `video`
   - `audio`
   能被正确识别并重建
3. 提交响应转换
   - 正确返回公开 `task_xxx`
4. 轮询状态映射
   - 成功 / 失败 / 进行中
5. 按次计费
   - 任务记录被标记为按次计费
   - 轮询完成时跳过差额结算

### 6.2 `web-worker` 测试

新增或扩展 node 测试覆盖：

1. video 模型过滤逻辑
2. video 请求 `FormData` 构造
3. video 轮询状态映射
4. video 本地存储读写
5. playground 中英文 locale 完整性

### 6.3 人工验收

人工验收通过标准：

1. 管理员能在旧版后台创建 `Seedance` 渠道
2. 渠道允许输入普通 API key 和自定义 `base_url`
3. 默认模型可选 `seedance-2-cheap`
4. `/v1/video/generations` 可提交含 3 图、1 视频、1 音频的 multipart 请求
5. `ratio=adaptive` 被明确拒绝
6. `web-worker` `/playground` 的 `Video` tab 可提交并轮询
7. 成功后可直接预览视频
8. 数据库不需要 migration 即可工作

---

## 7. 非目标

本次明确不做：

- `Seedance-per` 按秒专线
- 其他 `seedance-2-*` 模型
- 旧版 `web` 的视频测试工作台
- 通用视频任务抽象重构
- 读取参考媒体时长
- `ffprobe` 接入
- 按秒差额结算逻辑

这些能力如需推进，应单独起 spec。
