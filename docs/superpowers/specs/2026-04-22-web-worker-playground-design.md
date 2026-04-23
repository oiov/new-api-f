# web-worker `/playground` 设计

> Status: Draft for approval
> Date: 2026-04-22
> Scope: 在 `web-worker` 中新增公开可访问的 `/playground` 页面，复刻参考截图的工作台结构，并接入真实的 Chat / Image 能力。
> Out of scope: `Video` 实现、后端新增文件上传接口、控制台侧栏集成、管理员能力。

---

## 1. 目标

在 `web-worker` 中落地一个独立的 `/playground` 页面，满足以下用户目标：

1. 未登录用户也可以直接打开和使用页面。
2. 用户通过手填 API key 使用模型；若未填写，则页面明确引导去登录后台获取 API key。
3. 页面支持 `Chat` 与 `Image` 两种真实可用模式。
4. `Video` 只显示禁用态，不触发任何请求。
5. 模型列表优先从用户 API key 动态拉取；拉取失败时必须有静态兜底清单。
6. API key 默认保存在浏览器本地并自动回填。
7. 视觉上保留参考截图的工作台结构，但品牌、字体、配色、细节沿用 `web-worker` 现有风格。

---

## 2. 设计结论

### 2.1 页面定位

`/playground` 是一个公开路由，不走 `/console` 的登录守卫，也不复用控制台侧栏。它是一套独立工作台外壳，但仍使用 `web-worker` 现有的组件体系、主题变量、导航和品牌元素。

### 2.2 视觉方向

采用“结构像截图，视觉跟随站点”的方案：

- 保留截图中的核心工作流：模式切换、模型选择、参数控制、结果区、底部输入区。
- 使用 `web-worker` 当前字体、颜色、圆角、按钮和暗色模式适配。
- 不追求像素级 1:1 拷贝；优先保证它像当前站点中的一个自然页面。

### 2.3 功能边界

- `Chat`
  - 多轮对话
  - system prompt
  - temperature
  - max tokens
  - context turns
  - stream 开关
  - 文本输入
  - 图片附件
  - 通用文件附件
- `Image`
  - prompt 输入
  - 动态模型
  - 常用图片参数
  - 展示 `url` 或 `b64_json` 返回
- `Video`
  - tab 可见
  - 视觉禁用
  - 不可点击或点击后仅提示“coming soon”

---

## 3. 页面结构

### 3.1 顶层布局

页面由四个区域组成：

1. 顶部工作台头部
2. 参数区
3. 结果区
4. 底部输入区

桌面端采用“头部 + 参数区 + 主结果区 + 底部输入区”的纵向结构。移动端改为单列堆叠，参数区折叠为抽屉或 accordion，输入区固定在下方但不遮挡结果内容。

### 3.2 组件拆分

新增组件边界如下：

- `PlaygroundPage`
  - 页面级状态容器
  - 管理当前模式、模型、API key、请求状态、错误状态
- `PlaygroundHeader`
  - 模式切换：`Chat` / `Image` / `Video`
  - 模型选择
  - API key 入口
  - 语言切换/轻量导航
- `PlaygroundApiKeyBar`
  - 未填写 key 时的引导横幅
  - 填写、编辑、清除本地 API key
  - 跳转登录/控制台拿 key
- `PlaygroundSettingsPanel`
  - Chat 参数
  - Image 参数
  - 依据模式切换内容
- `PlaygroundConversation`
  - Chat 消息列表
  - 流式输出中的 assistant 草稿
  - 空状态、错误态、中断态
- `PlaygroundImageResult`
  - Image 结果列表
  - 下载按钮
  - prompt / revised prompt 展示
- `PlaygroundComposer`
  - 文本输入
  - 文件选择
  - 附件列表
  - 发送按钮

### 3.3 路由结构

新增路由文件：

`web-worker/src/routes/playground.tsx`

该路由不配置 `beforeLoad` 登录守卫，只使用 SEO 元信息和公开页面布局。

---

## 4. 数据流与接口策略

### 4.1 请求入口

前端统一走 `web-worker` 现有的同源 worker 代理：

- `GET /api/v1/models`
- `POST /api/v1/chat/completions`
- `POST /api/v1/images/generations`

不让浏览器直接请求 `API_ORIGIN`。这样可以：

- 复用现有 `/api/*` 代理能力；
- 避免跨域问题；
- 避免前端硬编码后端域名；
- 给后续增加 header 修正、审计或风控留出空间。

### 4.2 API key 存储与使用

API key 的设计约束：

- 默认保存在浏览器本地 `localStorage`
- 页面加载时自动回填
- 不写 cookie
- 不上报到 `web-worker` 自身业务接口
- 每次请求时仅通过请求头使用

使用以下本地存储键名：

- `nbility_playground_api_key`
- `nbility_playground_mode`
- `nbility_playground_model_chat`
- `nbility_playground_model_image`
- `nbility_playground_settings_chat`
- `nbility_playground_settings_image`

前端请求时统一附加：

`Authorization: Bearer <userApiKey>`

如果用户填入的 key 已带 `Bearer ` 或 `sk-` 前缀，则做最小清洗，最终保证发出的 header 是标准 Bearer 格式。

### 4.3 模型列表策略

模型列表优先走动态加载：

1. 页面首次拿到本地 API key 后触发加载；
2. 用户修改 API key 后重新加载；
3. 请求 `/api/v1/models` 成功则缓存当前结果；
4. 失败则自动切换到静态兜底清单。

静态兜底清单要求：

- 至少区分 `chat` 与 `image`
- 在 UI 上提示当前列表来自 fallback，实际可用性以真实请求结果为准
- 首版固定使用以下默认模型：
  - `chat`: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o3`, `o4-mini`, `claude-sonnet-4-5`, `claude-haiku-4-5`, `gemini-2.5-pro`, `gemini-2.5-flash`, `deepseek-chat`, `deepseek-reasoner`
  - `image`: `gpt-image-1`, `dall-e-3`, `qwen-image-plus`, `gemini-3-pro-image-preview`

动态列表过滤规则：

- 名称包含 `image`、`imagen`、`dall-e`、`flux` 的模型归入 `Image`
- 名称包含 `tts`、`embedding`、`rerank`、`whisper` 的模型从 playground 列表隐藏
- 其余模型默认归入 `Chat`
- 如果同一个模型同时命中 `Chat` 与 `Image` 规则，`Image` 优先

### 4.4 Chat 请求格式

`Chat` 模式使用 OpenAI 兼容的：

`POST /api/v1/chat/completions`

请求体包含：

- `model`
- `messages`
- `stream`
- `temperature`
- `max_tokens`

system prompt 以 `messages[0].role = system` 注入。

多轮上下文由前端自己维护，不依赖后端会话。发送前根据 `context turns` 对最近消息进行截取，再与 system prompt 组合成最终 `messages`。

### 4.5 流式输出

当 `stream = true` 时：

- 前端读取响应体流
- 解析 SSE 或兼容 chunk
- 将增量内容不断追加到当前 assistant 草稿消息
- 完成后把草稿消息转成正式消息

当 `stream = false` 时：

- 正常等待完整 JSON 返回
- 一次性插入 assistant 消息

如果流式中断：

- 保留已收到内容
- 把该消息标记为 `interrupted`
- 不清空用户输入
- 允许继续下一轮发送

### 4.6 Image 请求格式

`Image` 模式使用：

`POST /api/v1/images/generations`

首版采用通用参数优先策略，只暴露以下字段：

- `model`
- `prompt`
- `size`
- `n`
- `quality`
- `background`

不在首版铺开大量供应商私有参数，避免页面很“全”但真实兼容性差。

响应处理兼容两种结果：

- `data[].url`
- `data[].b64_json`

当返回 `b64_json` 时，前端在浏览器侧拼成 data URL 后展示和下载。

---

## 5. 附件策略

### 5.1 约束

后端当前未提供通用可用的 `/v1/files` 上传能力，因此首版不能设计成“先上传文件，再把文件 ID 传给聊天接口”。

### 5.2 方案

采用浏览器端读取附件并内联到请求体的策略。

图片附件：

- 前端读取为 data URL
- 作为 `image_url` 内容块发送

通用文件附件：

- 前端读取为 data URL / base64
- 以兼容块附加到消息内容
- 优先匹配后端当前已兼容的 `file` / `input_file` 相关结构
- 首版支持的非图片文件类型固定为：`application/pdf`、`text/plain`、`text/markdown`、`application/json`、`text/csv`

### 5.3 用户体验

附件区要求：

- 图片展示缩略预览
- 通用文件展示文件名、大小、移除按钮
- 发送前可删除任意附件
- 发送中锁定附件编辑，避免请求体和 UI 脱节

### 5.4 限制

必须有前端限制，避免浏览器端内联大文件失控：

- 单次消息最多 4 个附件
- 单个图片附件不超过 8 MB
- 单个非图片附件不超过 2 MB
- 单次消息的附件原始总大小不超过 12 MB
- 图片仅允许 `image/png`、`image/jpeg`、`image/webp`、`image/gif`
- 非图片仅允许本节定义的 5 种类型

超限时在前端直接阻断，不发请求。

### 5.5 兼容性预期

由于不同模型对文件/图片内容支持程度不同，首版不承诺“任意模型都支持任意附件”。当上游或网关返回模型能力不支持时，直接向用户展示真实错误，不做伪兼容。

---

## 6. 状态设计

### 6.1 页面级状态

页面需要维护的关键状态：

- 当前模式：`chat | image | video`
- API key
- API key 是否来自本地回填
- 模型列表来源：`remote | fallback`
- 当前选中模型
- Chat 参数
- Image 参数
- Chat 消息数组
- 正在流式输出的草稿消息
- 当前附件列表
- 当前请求状态：`idle | loading | streaming | success | error`

### 6.2 本地持久化

仅持久化以下内容：

- API key
- 最近一次使用的模式
- 最近一次选择的模型（按模式分别保存）
- Chat 参数：`systemPrompt`、`temperature`、`maxTokens`、`contextTurns`、`stream`
- Image 参数：`size`、`n`、`quality`、`background`

不持久化完整聊天记录和附件，避免本地存储膨胀和敏感信息残留。

---

## 7. 错误处理

### 7.1 无 API key

无 API key 时页面仍可访问，但进入“可浏览，不可发送”的半激活状态：

- 参数区可见
- 模型列表可见但不可真实拉取
- 输入区按钮禁用
- 显示 API key 引导横幅
- 提供两个动作：
  - 手动填写 API key
  - 去登录/控制台获取 API key

### 7.2 模型列表失败

处理方式：

- 自动切换到静态兜底清单
- 顶部或模型选择区展示轻量告警
- 不阻塞继续使用

### 7.3 Chat / Image 请求失败

处理方式：

- toast 展示错误摘要
- 结果区展示详细错误消息
- 保留当前输入内容和参数
- 用户可以直接重试

### 7.4 流式中断

处理方式：

- 保留已收到文本
- 标记消息中断
- 给出“重新发送”或“继续提问”的自然路径

### 7.5 附件错误

区分以下错误：

- 文件过大
- 文件类型不支持
- 文件读取失败
- 模型不支持该类附件

不同错误在文案上必须可区分，避免都落成“上传失败”。

---

## 8. 视觉与交互细节

### 8.1 头部交互

头部保留截图中的工作流密度，但换成 `web-worker` 风格：

- 左侧：品牌 + 页面标题
- 中部：模式切换 segmented control
- 右侧：模型选择、API key 管理按钮、语言切换

### 8.2 空状态

`Chat` 空状态：

- 中央展示轻提示
- 提醒用户发送第一条消息开始对话

`Image` 空状态：

- 中央展示轻量插画或占位框
- 提示输入 prompt 开始生成图片

### 8.3 Video 禁用态

`Video` tab 在视觉上保留，但必须一眼可见不可用：

- 低对比度
- `aria-disabled=true`
- 点击后不切换 active mode
- hover/focus 时固定展示 tooltip：`Coming soon`

### 8.4 移动端

移动端要求：

- 参数区可折叠
- 输入区可用，不遮挡主要内容
- 附件预览不撑破布局
- 模型与 API key 操作可以进入 sheet/drawer

---

## 9. 文件落点

计划新增或修改的前端文件如下：

- `web-worker/src/routes/playground.tsx`
- `web-worker/src/components/playground/playground-page.tsx`
- `web-worker/src/components/playground/playground-header.tsx`
- `web-worker/src/components/playground/playground-api-key-bar.tsx`
- `web-worker/src/components/playground/playground-settings-panel.tsx`
- `web-worker/src/components/playground/playground-conversation.tsx`
- `web-worker/src/components/playground/playground-image-result.tsx`
- `web-worker/src/components/playground/playground-composer.tsx`
- `web-worker/src/components/playground/playground-video-disabled.tsx`
- `web-worker/src/components/playground/playground-types.ts`
- `web-worker/src/hooks/use-playground-models.ts`
- `web-worker/src/hooks/use-playground-chat.ts`
- `web-worker/src/hooks/use-playground-image.ts`
- `web-worker/src/lib/playground-storage.ts`
- `web-worker/src/lib/playground-models.ts`
- `web-worker/src/i18n/locales/en/playground.json`
- `web-worker/src/i18n/locales/zh/playground.json`
- `web-worker/src/i18n/index.ts`

如果实际实现中发现组件边界需要微调，可以调整文件数，但必须保持“页面容器、请求逻辑、存储逻辑、展示组件”分层。

---

## 10. 验证方案

实现完成后至少验证以下路径：

1. `/playground` 可匿名直接访问。
2. 无 API key 时，引导横幅、禁用态、跳转入口都正常。
3. 本地存储的 API key 可自动回填。
4. 动态模型列表成功时能按模式过滤。
5. 动态模型列表失败时会切换到静态 fallback。
6. `Chat` 在 `stream = true` 下可以收到增量输出。
7. `Chat` 在 `stream = false` 下可以收到完整输出。
8. `Chat` 支持文本、多轮上下文、system prompt。
9. `Chat` 支持图片附件。
10. `Chat` 支持通用文件附件。
11. 流式中断时，已接收内容保留且消息被标记。
12. `Image` 可以正常生成并展示 `url` 结果。
13. `Image` 可以正常展示 `b64_json` 结果。
14. `Video` tab 为禁用态且不会发请求。
15. 桌面端布局可用。
16. 移动端布局可用。

---

## 11. 不做事项

本次设计明确不做：

- 后端新增 `/v1/files` 或其他上传接口
- `Video` 生成功能
- 聊天记录云端持久化
- 登录后自动代入用户后台 token
- provider 级能力精确探测
- 把 `/playground` 嵌入现有 `/console` 侧栏体系

这些能力后续如果需要，应单独起 spec，不与本次 `/playground` 首版混在一起。
