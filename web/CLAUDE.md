# CLAUDE.md — web 模块

> 导航：`/CLAUDE.md` → `web/CLAUDE.md`
> 模块类型：前端应用（React + Vite）
> Last initialized: 2026-03-24

## 模块职责

`web/` 提供 new-api 管理控制台与用户界面，负责：

- 用户与管理员路由页面渲染
- 设置、渠道、令牌、日志、订阅、充值等管理操作
- Playground/Chat 等前端交互能力
- i18n 多语言前端展示

## 入口与运行

- 入口：`web/src/index.jsx`
- 路由主干：`web/src/App.jsx`
- 构建配置：`web/vite.config.js`
- 依赖与脚本：`web/package.json`

常用命令（按项目约定优先 Bun）：

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run i18n:extract`
- `bun run i18n:sync`
- `bun run i18n:lint`

## 关键依赖

- React 18
- React Router DOM
- Semi UI / Semi Icons
- Axios
- i18next / react-i18next
- Vite

## 目录速览

- `src/index.jsx`：React 根挂载，Provider 注入，BrowserRouter 初始化
- `src/App.jsx`：路由表、权限路由（AdminRoute/PrivateRoute）
- `src/components/`：通用组件、布局组件、业务面板
- `src/pages/`：页面级组件（console/home/setup 等）
- `src/helpers/`：API 封装与通用工具
- `src/hooks/`：页面/领域 hooks
- `src/context/`：Status/User/Theme 状态容器
- `src/i18n/`：前端多语言初始化与语言资源

## 对外接口（前端视角）

- 统一 API 客户端：`src/helpers/api.js`（Axios 实例、拦截器、调用封装）
- 主要后端路径前缀：`/api`、`/v1`、`/pg`、`/mj`
- 开发代理：`vite.config.js` 中 server.proxy 指向远端目标

## 质量与测试

- 代码风格：Prettier + ESLint（脚本已在 `package.json`）
- 当前仓内未识别到 web 模块专属测试目录（如 `__tests__` / `*.test.jsx`）

## 本轮扫描样本

- `web/src/index.jsx`
- `web/src/App.jsx`
- `web/vite.config.js`
- `web/package.json`

## 下一步建议深挖

- `web/src/pages/Setting/**`（配置项与后端 option 对接）
- `web/src/components/table/**`（列表与高频管理操作）
- `web/src/helpers/api.js`（所有接口调用聚合点）
