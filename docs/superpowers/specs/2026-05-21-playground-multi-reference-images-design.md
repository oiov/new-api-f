# web-worker Playground 多参考图上传设计

> Status: Approved for implementation
> Date: 2026-05-21
> Scope: `web-worker` `/playground` 图片模式编辑参数中的 `image` 支持多张参考图，并同步优化视频模式参考图片区布局。
> Out of scope: 后端接口改造、遮罩多图、图片排序、拖拽上传、旧前端 `web/` Playground。

## 1. 背景

`web-worker/src/content/docs/api-images.en.md` 的图片编辑接口使用 multipart `image` 文件字段。后端适配器已经支持多种多图表单形态，包括重复 `image` 字段、`image[]` 字段以及 `image[0]` 这类数组字段，并在转发 OpenAI 兼容上游时把多文件统一为 `image[]`。

当前 `/playground` 图片编辑模式只保存一个 `editImage`，并通过 `FormData.set('image', file)` 提交单图。用户无法在 Playground 中验证多参考图编辑能力。

视频模式的“参考图片”区域已经支持最多 3 张图片，但采用三格平铺，放在 320px 参数侧栏里会占用较多垂直空间。图片编辑多图如果继续平铺，会进一步挤压提示词和参数区域。

## 2. 设计结论

采用视觉 mockup A：紧凑重叠缩略图堆叠。

- 图片编辑的 `image` 参数改为多图列表。
- 视频模式参考图片区域复用同一类紧凑多图上传控件。
- 多图控件只在面板中展示一行重叠缩略图、数量、文件摘要和固定添加入口。
- 点击或键盘聚焦缩略图时打开大图预览浮层，浮层内提供文件名、大小和删除操作。
- 遮罩 `mask` 仍然是单图上传，不与多图源图绑定。

## 3. 请求与数据流

图片编辑提交时：

1. 至少需要 1 张 `image` 文件。
2. 前端用 `FormData.append('image', file)` 逐张追加，不再用 `set('image', file)` 覆盖。
3. 其他字段保持不变：`model`、`prompt`、`size`、`quality`、`n`、`response_format`、`background`。
4. `mask` 仍使用单个 `mask` 文件字段。

这样可以直接匹配后端已有的重复 `image` 字段解析逻辑，不需要改后端或文档协议。

## 4. 组件设计

新增一个面向参数面板的多图上传组件，供图片编辑和视频参考图片共用。

组件职责：

- 渲染隐藏的 `input type="file"`，图片编辑和视频模式都允许一次选择多张。
- 展示已选图片的重叠缩略图堆叠。
- 展示当前数量和简短文件名摘要。
- 保留一个固定添加按钮。
- 支持删除单张图片。
- 支持点击缩略图打开预览浮层。
- 禁用态下保留预览但禁止添加和删除。

图片编辑与视频模式的区别通过 props 传入：

- `accept`
- `maxFiles`
- `maxSizeBytes`
- `emptyLabel`
- `hint`
- `uploads`
- `onAddFiles`
- `onRemoveAt`
- `disabled`

图片编辑的上传限制继续遵循文档：PNG，小于 4MB。视频参考图片继续允许常见图片格式，小于 10MB，最多 3 张。

## 5. 页面状态

图片编辑状态从：

`PlaygroundImageUpload | null`

改为：

`PlaygroundImageUpload[]`

相关处理：

- 清空源图时清空整个数组。
- 添加图片时追加到数组尾部。
- 超过最大数量时只接收剩余可用数量，并提示用户。
- 单张文件校验失败时跳过该文件并提示。
- 切换生成/编辑 tab 不主动清空已选图片，避免用户误切后丢失文件。

视频模式可继续保留固定长度数组状态，也可以在控件边界转换成列表。为了降低改动风险，页面内部保留现有 `Array<PlaygroundVideoUpload | null>`，传给复用控件前过滤成列表，增删时再写回固定槽位。

## 6. 交互细节

多图上传区在 320px 侧栏内保持稳定高度。

- 0 张：显示一个紧凑虚线上传入口。
- 1-4 张：展示重叠缩略图和添加按钮。
- 超过 4 张：展示前三张缩略图，最后一个缩略图显示剩余数量。
- hover 或 focus 缩略图：轻微展开、提升层级，并显示文件名 tooltip。
- click 缩略图：打开预览浮层。
- 预览浮层：展示大图、文件名、大小、位置和删除按钮。

该交互避免在参数区平铺大量原图，同时仍能让用户检查每张参考图。

## 7. i18n

需要补充 Playground locale 文案：

- 图片编辑参考图数量与多图提示。
- 添加参考图、管理/预览参考图、删除参考图。
- 数量超限提示。
- 多文件上传部分成功提示。

所有语言文件保持 key 完整，中文为主文案，其他语言给出直译占位，避免运行时缺 key。

## 8. 测试

优先补单元测试：

- `buildPlaygroundImageEditFormData` 接收多张图片并追加多个 `image` 字段。
- 不传图片时返回不含 `image` 文件字段，页面提交层负责拦截。
- cURL 预览在编辑模式显示多图示例字段。

再做前端构建/检查：

- `bunx tsx --test src/lib/playground-image.test.ts`
- `bunx tsx --test src/hooks/use-playground-image.test.ts`
- `bun run build` 或仓库现有检查命令。

## 9. 风险与取舍

- 不新增后端逻辑，依赖已有 multipart 多图解析。
- 不做拖拽排序，避免扩大交互复杂度。
- 不把遮罩改成多图，因为当前接口语义是单个 `mask`，多图源图与单图遮罩的关系由上游决定。
- 图片编辑仍限制 PNG，保持和文档一致；视频参考图片保留更宽的图片格式支持。
