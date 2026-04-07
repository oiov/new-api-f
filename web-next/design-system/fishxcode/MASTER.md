# 设计系统主文件

> **检索逻辑：** 构建特定页面时，优先查找 `design-system/pages/[页面名称].md`。
> 若该文件存在，其规则**覆盖**本主文件。
> 若不存在，严格遵循以下规则。

---

**项目：** FishXCode
**生成时间：** 2026-04-07 14:28:13
**类别：** SaaS（通用）

---

## 全局规则

### 配色方案

| 角色 | 色值 | CSS 变量 |
|------|------|----------|
| 主色 | `#1E40AF` | `--color-primary` |
| 辅助色 | `#3B82F6` | `--color-secondary` |
| 强调/CTA 色 | `#F59E0B` | `--color-cta` |
| 背景色 | `#F8FAFC` | `--color-background` |
| 文字色 | `#1E3A8A` | `--color-text` |

**配色说明：** 蓝色数据基调 + 琥珀色高亮点缀

### 字体排版

- **标题字体：** Fira Code
- **正文字体：** Fira Sans
- **风格定位：** 仪表盘、数据、分析、代码、技术感、精准
- **Google Fonts：** [Fira Code + Fira Sans](https://fonts.google.com/share?selection.family=Fira+Code:wght@400;500;600;700|Fira+Sans:wght@300;400;500;600;700)

**CSS 引入：**

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

### 间距变量

| Token | 值 | 用途 |
|-------|----|------|
| `--space-xs` | `4px` / `0.25rem` | 紧凑间隙 |
| `--space-sm` | `8px` / `0.5rem` | 图标间距、行内间距 |
| `--space-md` | `16px` / `1rem` | 标准内边距 |
| `--space-lg` | `24px` / `1.5rem` | 区块内边距 |
| `--space-xl` | `32px` / `2rem` | 大间距 |
| `--space-2xl` | `48px` / `3rem` | 区块外边距 |
| `--space-3xl` | `64px` / `4rem` | Hero 区内边距 |

### 阴影层级

| 层级 | 值 | 用途 |
|------|-----|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 轻微浮起 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | 卡片、按钮 |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | 弹窗、下拉菜单 |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero 图片、特色卡片 |

---

## 组件规范

### 按钮

```css
/* 主按钮 */
.btn-primary {
  background: #F59E0B;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 次级按钮 */
.btn-secondary {
  background: transparent;
  color: #1E40AF;
  border: 2px solid #1E40AF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### 卡片

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### 输入框

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E40AF;
  outline: none;
  box-shadow: 0 0 0 3px #1E40AF20;
}
```

### 弹窗

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## 风格指南

**风格：** 玻璃态（Glassmorphism）

**关键词：** 磨砂玻璃、半透明、模糊背景、多层叠加、鲜艳背景、光源感、景深、多层次

**适用场景：** 现代 SaaS、金融仪表盘、高端企业官网、生活方式应用、弹窗遮罩、导航栏

**核心效果：** 背景模糊（10–20px）、细边框（1px solid rgba(255,255,255,0.2)）、光反射、Z 轴深度

### 页面结构模式

**模式名称：** AI 个性化落地页

- **转化策略：** 借助个性化实现 20%+ 转化率，需集成分析工具，为新用户提供降级方案
- **CTA 放置：** 根据用户分群进行上下文感知的动态定位
- **章节顺序：** 1. 动态 Hero 区（个性化）→ 2. 相关功能 → 3. 定向化用户评价 → 4. 智能 CTA

---

## 反模式（禁止使用）

- ❌ 过度动画
- ❌ 默认深色模式

### 其他禁止模式

- ❌ **Emoji 用作图标** — 统一使用 SVG 图标（Heroicons、Lucide、Simple Icons）
- ❌ **缺少 cursor:pointer** — 所有可点击元素必须添加 cursor:pointer
- ❌ **悬浮导致布局偏移** — 避免使用引起布局变化的 scale 变换
- ❌ **低对比度文字** — 文字对比度最低保持 4.5:1
- ❌ **状态瞬间切换** — 始终使用过渡动画（150–300ms）
- ❌ **焦点状态不可见** — 焦点状态必须可见，以满足无障碍要求

---

## 交付前检查清单

交付任何 UI 代码前，验证以下各项：

- [ ] 未使用 Emoji 作为图标（改用 SVG）
- [ ] 所有图标来自同一图标集（Heroicons/Lucide）
- [ ] 所有可点击元素具有 `cursor-pointer`
- [ ] 悬浮状态过渡流畅（150–300ms）
- [ ] 亮色模式文字对比度最低 4.5:1
- [ ] 键盘导航时焦点状态可见
- [ ] 已遵守 `prefers-reduced-motion`
- [ ] 响应式断点：375px、768px、1024px、1440px
- [ ] 内容不被固定导航栏遮挡
- [ ] 移动端无横向滚动
