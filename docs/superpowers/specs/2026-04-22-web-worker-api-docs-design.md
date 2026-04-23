# web-worker API 文档镜像设计

> Status: Draft for review
> Date: 2026-04-22
> Scope: 将 `https://docs.llms.best` 的 API 参考文档镜像到 `web-worker/src/content/docs`，并把所有 API Base URL 统一改为 `https://api.nbility.dev`
> Out of scope: 改造现有 docs 渲染器、自动化定时同步远端文档、后端接口实现变更

---

## 1. 目标

当前 `web-worker/src/content/docs` 主要是接入教程，缺少标准 API 参考页。目标是在不破坏现有教程体系的前提下，补齐一套独立的 API 参考文档，并统一站内所有 API 示例中的基础地址。

本次工作需要满足：

1. 保留现有教程页，不把教程和 API 参考混成一类。
2. 在 `web-worker` 中新增一套完整的 API 文档树，覆盖 `docs.llms.best/en` 当前可见的 API 参考路径。
3. 新增文档中的所有上游 Base URL 都改成 `https://api.nbility.dev`。
4. 现有教程文档中凡是错误写成 `https://nbility.dev` 或旧 API 基址的地方，一并改正。
5. 文档内容尽量保持标准接口说明结构：概述、路径、参数、示例、响应、错误说明。

---

## 2. 已确认的来源范围

通过抓取 `docs.llms.best/en` 的站内链接，当前可见的 API 参考路径包括：

- `/en`
- `/en/authentication`
- `/en/models`
- `/en/errors`
- `/en/chat`
- `/en/chat/completions`
- `/en/chat/responses`
- `/en/chat/realtime`
- `/en/images`
- `/en/images/banana`
- `/en/videos`
- `/en/videos/facetalk`
- `/en/videos/seedance`
- `/en/videos/veo`
- `/en/music/suno`
- `/en/embeddings`
- `/en/compatibility/claude`
- `/en/compatibility/gemini`

这些页面构成首批镜像范围。若抓取过程中发现页面内部还存在未出现在导航中的 API 子页，再补录到同一目录树。

---

## 3. 设计结论

### 3.1 文档目录策略

采用“教程”和“API 参考”分层的方案：

- 保留现有 `web-worker/src/content/docs/*.md`
- 新增 `web-worker/src/content/docs/api/` 目录
- API 文档按能力域拆分，而不是沿用完全扁平的文件名

建议的目标结构：

- `web-worker/src/content/docs/api/index.md`
- `web-worker/src/content/docs/api/authentication.md`
- `web-worker/src/content/docs/api/models.md`
- `web-worker/src/content/docs/api/errors.md`
- `web-worker/src/content/docs/api/chat/index.md`
- `web-worker/src/content/docs/api/chat/completions.md`
- `web-worker/src/content/docs/api/chat/responses.md`
- `web-worker/src/content/docs/api/chat/realtime.md`
- `web-worker/src/content/docs/api/images/index.md`
- `web-worker/src/content/docs/api/images/banana.md`
- `web-worker/src/content/docs/api/videos/index.md`
- `web-worker/src/content/docs/api/videos/facetalk.md`
- `web-worker/src/content/docs/api/videos/seedance.md`
- `web-worker/src/content/docs/api/videos/veo.md`
- `web-worker/src/content/docs/api/music/suno.md`
- `web-worker/src/content/docs/api/embeddings.md`
- `web-worker/src/content/docs/api/compatibility/claude.md`
- `web-worker/src/content/docs/api/compatibility/gemini.md`

这样处理的原因：

- 路径和能力域一一对应，后续继续补文档时不容易失控。
- 用户能明显区分“如何在某个客户端中接入”和“接口本身怎么调用”。
- 与原站 `/en/chat/completions` 这类层级保持接近，后续人工同步简单。

### 3.2 内容规整策略

不直接照搬 HTML，而是按“镜像参考内容，重写为本地 Markdown”的方式落地：

- 从源站页面提取正文结构和代码示例
- 去掉站点壳、导航、复制按钮等无关元素
- 保留接口路径、参数表、请求示例、响应示例、说明文字
- 对不适合本地 Markdown 的组件语法进行改写

改写规则：

1. 所有 `https://api.llms.best` 改为 `https://api.nbility.dev`
2. 若示例里已经带 `/v1/...`，则保持路径不变，只替换域名
3. 页面标题保持语义，但允许改成更适合本地文档导航的中文标题
4. 保留原始接口英文路径，避免用户复制命令时产生歧义
5. 对上游明显缺漏但项目已知支持的参数，可在“补充说明”区域注明，不直接伪造原站原文

### 3.3 现有教程修正规则

当前已发现一批旧教程把 API 基址写成了 `https://nbility.dev` 或其 `/v1` 变体。这批内容需要一起修正。

修正规则：

- OpenAI 兼容接口统一写 `https://api.nbility.dev/v1`
- Anthropic 兼容接口统一写 `https://api.nbility.dev`
- Claude/Gemini 这类兼容协议页要根据协议习惯决定是否带 `/v1`
- 普通站点页面链接，例如注册、登录、控制台，继续保留 `https://nbility.dev/...`

也就是说，本次替换不是全局把 `nbility.dev` 全换掉，而是只替换“用于 API 请求的 Base URL”。

---

## 4. 实施方案

### 4.1 内容采集流程

每个源页面按以下流程处理：

1. 抓取页面 HTML
2. 提取正文中的原始 markdown 或等价内容块
3. 规范化为本地 Markdown
4. 替换 Base URL
5. 写入目标文件

如果某些页面能直接提取 `rawMarkdown`，优先使用它；因为这比从渲染后的 HTML 回推 Markdown 更稳定。

如果 `rawMarkdown` 抽取失败，则退回到 HTML 结构化提取：

- 标题
- 描述
- 章节标题
- 代码块
- 表格
- JSON 示例

### 4.2 Frontmatter 约定

新增 API 文档统一补齐 frontmatter，便于站内排序和导航：

- `title`
- `description`
- `icon` 或 `category`（如果当前 docs 系统支持）
- `order`

文档展示顺序按来源站导航组织：

1. API 总览
2. Authentication
3. Models
4. Errors
5. Chat
6. Images
7. Videos
8. Music
9. Embeddings
10. Compatibility

### 4.3 路由与导航适配

默认假设 `web-worker` 现有 docs 系统会自动收录 `src/content/docs` 下的新文件。

如果自动收录后导航顺序混乱，则补一层本地目录首页来建立入口：

- 在 `api/index.md` 中列出所有能力域
- 各域 `index.md` 中列出子接口

这能保证即使没有额外导航配置，用户也能从文档站内自然进入 API 文档树。

---

## 5. 错误处理与质量边界

### 5.1 内容忠实度

本次目标是“结构化镜像 + Nbility 域名替换”，不是法律意义上的逐字存档。为了避免错误扩散：

- 不凭空补写不存在的接口
- 不凭记忆改参数语义
- 对无法确认的字段保持和源站一致
- 对本项目已知的额外差异，单独加“Nbility 说明”

### 5.2 页面缺失时的处理

若某个页面抓取失败：

- 先保留占位文档，不伪造完整内容
- 在文档中明确标记“待补充”
- 同时继续完成其余页面

但如果只是页面解析方式不同，不接受直接跳过；应先尝试第二种提取方式。

### 5.3 Base URL 替换风险

替换时最大的风险是把站点链接误替换成 API 域名。因此必须区分：

- 文档站 / 控制台 / 注册登录链接
- 真实 API 调用链接

验证重点：

- `https://nbility.dev/auth/*` 保持不变
- `https://nbility.dev/console/*` 保持不变
- `https://nbility.dev/v1` 必须改成 `https://api.nbility.dev/v1`
- `https://api.llms.best` 必须改成 `https://api.nbility.dev`

---

## 6. 测试与验证

完成后至少执行以下验证：

1. 搜索 `web-worker/src/content/docs`，确认不存在错误的 API 基址残留：
   - `https://nbility.dev/v1`
   - `https://api.llms.best`
2. 构建 `web-worker`，确认新增文档不会破坏 docs 编译
3. 抽查关键页面的内容完整性：
   - chat completions
   - images
   - embeddings
   - compatibility/claude
4. 检查现有教程页中的 API 示例是否已修正，但站点跳转链接未被误改

---

## 7. 推荐执行顺序

推荐按两段执行：

第一段：

- 统一修正现有教程中的错误 API Base URL
- 建立 `api/` 文档目录和索引页

第二段：

- 批量导入 `docs.llms.best` 的 API 参考页
- 对每页做最小必要的本地格式规整
- 逐页验证关键示例链接和代码块

这样即使中途遇到个别页面解析差异，现有教程中的错误 API 地址也已经先被修正，不会被继续带出。

---

## 8. 最终决定

按方案 1 执行：

- 在 `web-worker/src/content/docs/api/` 下新增完整 API 文档树
- 参考 `docs.llms.best` 当前公开 API 参考页逐页镜像
- 所有 API Base URL 统一使用 `https://api.nbility.dev`
- 现有教程中遗漏的错误 API 基址一并修正

该方案在信息架构、维护成本和用户理解成本之间最均衡，也最符合“补充完整 API 文档，同时不破坏现有教程体系”的目标。
