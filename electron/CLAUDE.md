# CLAUDE.md — electron 模块

> 导航：`/CLAUDE.md` → `electron/CLAUDE.md`
> 模块类型：桌面封装（Electron）
> Last initialized: 2026-03-24

## 模块职责

`electron/` 为 new-api 提供桌面应用包装，负责：

- 启动与管理桌面窗口（BrowserWindow）
- 桌面环境下启动/监控后端二进制进程
- 系统托盘、崩溃日志导出、错误提示
- 通过 preload 向渲染层暴露受控环境信息

## 入口与运行

- 主进程入口：`electron/main.js`
- 预加载脚本：`electron/preload.js`
- 构建与打包配置：`electron/package.json`
- 辅助构建脚本：`electron/build.sh`

常用命令（当前模块脚本基于 npm）：

- `npm run start-app`
- `npm run dev-app`
- `npm run build`
- `npm run build:mac`
- `npm run build:win`
- `npm run build:linux`

## 关键运行机制

- 通过 `child_process.spawn` 启动 Go 后端二进制
- 通过 HTTP 探活逻辑等待服务可用
- 在生产模式将数据目录定位于用户目录（`app.getPath('userData')`）
- 记录并分类常见错误（端口占用、权限、配置、文件缺失等）

## 对外接口（渲染进程可用）

`preload.js` 通过 `contextBridge.exposeInMainWorld('electron', ...)` 暴露：

- `isElectron`
- `version`
- `platform`
- `versions`
- `dataDir`

## 本轮扫描样本

- `electron/main.js`
- `electron/preload.js`
- `electron/package.json`
- `electron/build.sh`

## 下一步建议深挖

- `electron/main.js` 中窗口生命周期与异常退出分支
- `electron/README.md` 中开发/打包流程与主仓构建链路一致性
- 桌面模式与 web dev 模式的端口/环境变量协同边界
