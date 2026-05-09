# web-worker 文档站 Shell 与 Markdown 渲染增强设计

> Status: Approved for implementation planning
> Date: 2026-05-09
> Scope: 恢复并增强 `web-worker` 的 `/docs` 文档渲染与阅读布局
> Out of scope: 替换现有文档内容、改写 API 文档导入脚本、引入外部搜索服务、修改后端接口

---

## 1. 目标

当前 `web-worker` 的 `/docs` 已有文档路由、搜索、导航注册表和 Markdown 渲染管线，但页面呈现偏简单，和二开来源模板的文档站体验相比缺少完整 docs shell 的阅读层次。

本次目标是把 `/docs` 恢复成接近模板文档站的结构，同时保留当前项目已经建立好的文档数据和路由体系：

1. 左侧固定文档导航，包含品牌区、搜索入口、分组导航和当前页高亮。
2. 中间正文区域使用更完整的 Markdown 渲染方式，支持内部链接、图片懒加载、代码块高亮、表格和锚点。
3. 右侧桌面目录从正文 `h2`/`h3` 自动生成，便于长文档和 API 参考页浏览。
4. 移动端继续使用抽屉导航，不在窄屏显示右侧目录。
5. 不引入 TanStarter 文案、品牌或内容；只借鉴模板里的渲染方式和布局结构。

---

## 2. 当前上下文

`web-worker` 目前的文档系统包含：

- `src/routes/docs/**`: TanStack Router file-based docs routes。
- `src/components/docs/doc-content.tsx`: 每个文档页的 Markdown 正文渲染入口。
- `src/components/docs/docs-layout.tsx`: 当前 `/docs` 的整体布局、桌面侧栏、移动抽屉和搜索入口。
- `src/lib/markdown.ts`: unified/remark/rehype 渲染管线，已接入 `remark-gfm`、`rehype-raw`、`rehype-slug`、`rehype-autolink-headings`、`rehype-highlight`。
- `src/lib/docs-markup.ts`: 当前只提供 `splitAfterFirstH1`。
- `src/lib/docs-registry.ts`: 当前文档导航和搜索元数据来源。
- `src/components/docs/docs-search.tsx`: 当前 docs 搜索入口和弹窗。
- `src/custom.css`: 已有 prose 和 highlight.js 相关样式。

模板项目中可复用的关键思路是：

- `src/lib/markdown.ts` 通过 unified 把 Markdown 渲染为 HTML，并给标题生成锚点。
- `src/components/markdown/markdown.tsx` 通过 `html-react-parser` 把 HTML 转为 React 节点，并对内部链接、图片、代码节点做定制处理。
- 页面布局使用左侧导航、中间正文、右侧目录的文档站结构。

依赖方面，`web-worker/package.json` 已包含 `html-react-parser`、`@tailwindcss/typography`、`rehype-highlight` 和 TanStack Router，不需要新增依赖。

---

## 3. 设计结论

### 3.1 总体方案

采用“保留当前文档系统，恢复模板渲染方式，并增强 docs shell”的方案。

不直接复制模板的 `MarkdownPage`，因为它主要服务普通 markdown 页面，不包含当前项目已有的 docs 搜索、API 文档分组和本地化文档路由。实现应围绕当前 `DocContent` 和 `DocsLayout` 扩展。

### 3.2 布局结构

目标结构接近用户提供的参考截图：

- 左侧 docs shell：
  - 顶部显示当前项目文档品牌，不使用模板项目名。
  - 搜索入口保持现有 `DocsSearch`，位置提升到侧栏顶部。
  - 导航继续使用 `DOC_SECTIONS`，保留现有教程和 API 参考分组。
  - 当前页用更明显的背景和文字状态标识。
  - 侧栏在桌面固定，内容过长时内部滚动。

- 中间正文：
  - 使用文档正文最大宽度，避免在宽屏上行长过长。
  - 保留首个 `h1` 作为页面主标题。
  - 标题下方保留复制 Markdown 按钮。
  - `h1` 后插入分隔线，让主标题区和正文区清晰分层。
  - Markdown 正文使用 prose 样式，同时补齐代码块、表格、链接、图片的视觉细节。

- 右侧目录：
  - 桌面端显示 sticky “Table of Contents”。
  - 目录从渲染后的 HTML 中提取 `h2`/`h3`，链接到已有 heading `id`。
  - `h2` 为一级，`h3` 以缩进显示。
  - 页面没有可用标题时不显示目录。
  - 首版不做滚动监听和当前章节高亮，避免引入额外复杂度。

- 移动端：
  - 继续使用现有 `Sheet` 抽屉导航。
  - 顶部保留搜索和菜单按钮。
  - 右侧目录隐藏，正文单栏显示。

### 3.3 Markdown 渲染

`renderMarkdown` 保持当前 unified 管线，继续支持：

- GitHub Flavored Markdown。
- 原始 HTML。
- heading slug。
- heading autolink。
- highlight.js 代码高亮。
- 现有 API 文档的自定义 markdown 预处理，如 `ParamTable` 和 tab code fence。

`DocContent` 不再直接把整段 HTML 用 `dangerouslySetInnerHTML` 输出。改为采用模板方式：

- 调用 `renderMarkdown(source)` 得到 HTML。
- 使用 `html-react-parser` 解析 HTML。
- 内部链接：
  - `href` 以 `/` 开头时使用 TanStack Router `Link`。
  - 外部链接保留普通 `<a>`，补充安全属性。
- 图片：
  - 设置 `loading="lazy"`。
  - 保留原有 `alt`。
  - 添加文档页图片样式。
- 代码：
  - 正确映射 HTML `class` 到 React `className`。
  - 保留 `rehype-highlight` 生成的语言和高亮 class。

这能恢复模板的 React 化渲染方式，同时避免破坏现有 markdown 渲染能力。

### 3.4 目录生成

扩展 `src/lib/docs-markup.ts`，增加纯函数：

- `extractDocHeadings(markup)`：从渲染后的 HTML 中提取 `h2`/`h3` 标题，返回 `{ id, text, depth }[]`。
- 保留并继续测试 `splitAfterFirstH1(markup)`。

提取规则：

1. 只收录带 `id` 的 `h2` 和 `h3`。
2. 去掉 heading 内部的 HTML 标签和自动锚点包装，只保留可读文字。
3. 过滤空标题。
4. 保持文档中的出现顺序。

由于 `rehype-slug` 已经给标题生成 `id`，目录不需要重新实现 slug 算法。

### 3.5 样式策略

样式应集中在 `DocContent`、`DocsLayout` 的 Tailwind class 和 `src/custom.css` 的少量文档样式中。

设计原则：

- 跟随当前项目主题变量，兼容 light/dark。
- 视觉密度参考截图，但不照搬模板品牌色和内容。
- 左侧侧栏、正文、右侧目录形成三栏文档站层次。
- 卡片化只用于真正的导航区域或代码/表格容器，不把正文外层做成厚重卡片。
- 代码块使用已有 highlight.js class，补齐暗色背景和横向滚动。
- 表格保持全宽、边框清晰、移动端可横向滚动。

---

## 4. 实施边界

### 4.1 应修改的文件

预计修改：

- `web-worker/src/components/docs/doc-content.tsx`
- `web-worker/src/components/docs/docs-layout.tsx`
- `web-worker/src/lib/docs-markup.ts`
- `web-worker/src/lib/docs-markup.test.ts`
- `web-worker/src/custom.css`
- 必要时补充 `web-worker/src/i18n/locales/zh/docs.json`
- 必要时补充 `web-worker/src/i18n/locales/en/docs.json`

不应修改：

- 文档正文内容文件，除非发现渲染必须修正的本地语法问题。
- API 文档导入脚本。
- 后端 Go 代码。
- 受保护的项目标识、组织标识、README 品牌和元数据。

### 4.2 i18n

新增 UI 文案如果已有 key 可复用则复用。若需要新增右侧目录标题，放入 docs namespace：

- 中文：`tableOfContents`
- 英文：`tableOfContents`

页面主内容仍由 Markdown 文件自身负责本地化。

### 4.3 错误处理

- Markdown 渲染未完成前显示当前骨架屏。
- 渲染失败时不让整页崩溃；显示简短错误状态，并保留复制 Markdown 的能力。
- 目录提取失败或没有标题时不显示右侧目录。
- HTML parser 定制只处理明确需要的节点，不重写未知 HTML 标签。

---

## 5. 测试与验证

### 5.1 单元测试

扩展 `src/lib/docs-markup.test.ts`：

- `splitAfterFirstH1` 继续覆盖有/无 `h1` 的行为。
- `extractDocHeadings` 能提取 `h2`/`h3` 的 `id`、文字和层级。
- heading 内含自动链接或内联标签时能清理成可读文字。
- 不带 `id` 或空文字的标题会被忽略。

### 5.2 构建与检查

实现完成后至少运行：

```bash
cd web-worker
bunx tsx --test src/lib/docs-markup.test.ts
pnpm build
```

如果 Biome 检查在当前环境可用，再运行：

```bash
cd web-worker
pnpm exec biome check src/components/docs/doc-content.tsx src/components/docs/docs-layout.tsx src/lib/docs-markup.ts src/lib/docs-markup.test.ts src/custom.css
```

### 5.3 手动验证

使用本地 dev server 打开：

- `/docs`
- `/docs/guide`
- `/docs/api`
- 一个长 API 文档页，例如 `/docs/api/chat/completions`

验证：

- 左侧导航当前页高亮正确。
- 搜索入口可打开并跳转。
- 复制 Markdown 按钮可用。
- 正文内部 `/docs/...` 链接不刷新整页。
- 外部链接正常打开。
- 代码块高亮、横向滚动和暗色背景正常。
- 表格不撑破布局。
- 右侧目录能跳转到对应章节。
- 移动宽度下导航抽屉可用，右侧目录隐藏。

---

## 6. 风险与取舍

### 6.1 HTML 解析风险

从 `dangerouslySetInnerHTML` 改成 `html-react-parser` 会改变部分节点的渲染路径。为降低风险，只定制 `a`、`img`、`code` 三类节点，其余节点保持 parser 默认行为。

### 6.2 目录准确性

目录依赖 `rehype-slug` 生成的 heading `id`。如果某个自定义 HTML 标题没有 id，首版会跳过它，而不是重新推断 slug。这保证目录链接不会指向不存在的锚点。

### 6.3 滚动高亮暂不实现

参考截图中的目录高亮可作为后续增强。首版只提供可点击目录，避免引入 IntersectionObserver 状态、边界处理和移动端兼容复杂度。

---

## 7. 验收标准

实现完成后应满足：

1. `/docs` 页面视觉结构接近参考截图的三栏文档站布局。
2. 现有 docs 路由、搜索、导航分组和复制 Markdown 功能不回退。
3. Markdown 渲染恢复模板式 React 节点处理，内部链接使用 TanStack Router。
4. 桌面端可见自动生成的右侧目录，移动端隐藏。
5. 相关单元测试和构建验证通过，或明确记录无法运行的原因。
