# BluNote

BluNote 是一款面向 macOS、Windows 与银河麒麟的轻量桌面待办挂件，用紧凑的日历、任务和会议视图帮助用户管理当天安排。macOS/Windows 采用 Tauri 2，银河麒麟采用自包含 Electron 运行时，界面统一使用 React 19，数据与设置默认只保存在本机。

当前版本：`0.3.2`

## 支持平台

| 平台 | 最低要求 | 当前构建说明 |
|---|---|---|
| macOS | macOS 13 | 本地 DMG 按构建机器架构生成；当前提供的安装包为 Apple Silicon `arm64` |
| Windows | Windows 10 21H2 | 使用 NSIS 生成安装程序，WebView2 采用下载引导安装模式 |
| 银河麒麟 | V10 SP1 2503，x86_64/Hygon C86 | 使用自包含 Electron 的 DEB，不依赖 `libwebkit2gtk-4.1-0`；v0.3.2 已精简冗余前端依赖和语言包 |

面向外部用户正式分发前，macOS 安装包需要 Developer ID 签名与 Apple 公证，Windows 安装包需要 Authenticode 签名。Intel 与 Apple Silicon 通用的 macOS 安装包还需要额外构建 Universal 2 产物。

## 已实现功能

### 任务与会议

- 新建、继续编辑、完成和删除工作任务或部门会议。
- 新增任务时可选择单日，或从指定日期起按每周一个或多个星期重复；每次出现可独立完成。
- 任务支持一层子任务、独立计划时间和完成进度汇总。
- 任务支持指定时间提醒，以及 30 分钟、1 小时、次日 9:00 和自定义稍后提醒。
- 每个任务每天最多稍后提醒 3 次，避免无限重复通知。
- 会议支持开始/结束时间、地点、HTTP/HTTPS 会议链接，以及提前 5、15、30 或 60 分钟提醒。
- 编辑原有事项时保留记录 ID、创建时间、子任务进度和未变化的提醒状态，不会重复创建记录。
- 支持导入最大 5 MB 的 ICS 日历文件；导入内容只在本机解析。

### 日历与布局

- 周视图固定以周一为第一天、周日为最后一天。
- 月视图补齐完整自然周；日期角标只统计当天未完成待办和尚未开始的会议，已完成待办及已开始会议不计入。
- 收起状态为 `360 × 620` 紧凑挂件，展开状态为 `900 × 640` 双栏窗口。
- 展开后待办与日历左右排列，各占可用画幅的 50%。
- 待办列表可独立上下滚动，并支持键盘聚焦。
- 周/月视图偏好分别保存，展开与收起互不干扰。

### 桌面窗口

- 无边框透明窗口，适配 macOS 明暗外观。
- 设置使用四档滑杆调节字体，当前标准字号为第 1 档，后续三档逐级放大；点击设置栏外部时自动收起。
- 支持拖动窗口、八方向边缘拉伸、位置锁定与 8 px 屏幕边缘吸附。
- 窗口始终限制在当前显示器的可视工作区内。
- 冷启动固定使用正常紧凑尺寸，仅恢复上次窗口位置，避免 Retina 物理像素导致的缩放异常。
- 支持 55%–100% 外观透明度调节。
- 支持普通窗口与桌面小组件模式切换。
- 支持关闭后托盘驻留、单实例运行和开机自启。

### macOS 原生小组件

- 提供 WidgetKit 小、中尺寸小组件工程。
- 显示今日任务与最近会议，并支持透明度设置。
- 通过 App Group 本地快照共享数据，点击可返回主应用。
- 完整构建需要 Xcode、XcodeGen、有效的 App Group 与一致的 Apple Team 签名。

## 技术架构

| 层级 | 技术 | 主要职责 |
|---|---|---|
| UI | React 19、TypeScript、CSS、Lucide | 日历、任务卡片、编辑表单与响应式布局 |
| 桌面运行时 | Tauri 2 | 窗口、托盘、单实例、通知、自启和安装包 |
| 本地服务 | Rust | SQLite 访问、系统通知桥接、窗口边界与 Widget 快照 |
| 数据库 | SQLite（rusqlite bundled） | 本机事项、提醒状态和数据库迁移 |
| macOS 小组件 | SwiftUI、WidgetKit | 原生桌面小组件与主应用深链 |
| 测试 | Vitest、Testing Library、Rust tests | 业务逻辑、组件交互、窗口状态和数据库迁移 |

## 项目结构

```text
todoList/
├── src/                    # React 前端
│   ├── components/         # 事项卡片与新增/编辑表单
│   ├── lib/                # 日历、ICS、提醒、存储和校验逻辑
│   └── assets/             # 应用内图标
├── src-tauri/              # Tauri/Rust 桌面端
│   ├── capabilities/       # 最小权限配置
│   ├── icons/              # macOS 与 Windows 打包图标
│   └── src/                # SQLite、窗口、通知和托盘实现
├── native/                 # macOS WidgetKit 与刷新桥接程序
├── scripts/                # macOS DMG 构建脚本
├── docs/                   # 功能文档、需求文档与发布检查
└── .github/workflows/      # 质量检查和跨平台构建
```

## 本地开发

### 环境要求

- Node.js `20.19+` 或 `22.12+`
- npm
- Rust stable
- 对应平台的 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)
- 构建完整 macOS WidgetKit 版本时需要完整 Xcode 与 XcodeGen

### 安装与运行

```bash
npm ci
npm run tauri dev
```

只调试浏览器界面时可以运行：

```bash
npm run dev
```

## 质量检查

提交代码前执行：

```bash
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run check` 会依次执行 ESLint、Vitest 和生产构建。GitHub Actions 还会运行依赖审计，并在 macOS、Windows 环境构建原生安装包。

常用命令：

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run test` | 执行前端测试 |
| `npm run test:coverage` | 生成前端覆盖率报告 |
| `npm run lint` | 执行 ESLint |
| `npm run build` | 执行 TypeScript 与 Vite 生产构建 |
| `npm run check` | 执行前端完整质量检查 |
| `npm run tauri dev` | 启动桌面应用开发模式 |
| `npm run tauri build` | 构建当前平台安装包 |

## 安装包构建

### 标准 Tauri 构建

```bash
npm ci
npm run check
npm run tauri build
```

默认产物位置：

- macOS：`src-tauri/target/release/bundle/dmg/`
- Windows：`src-tauri/target/release/bundle/nsis/`

### 包含 WidgetKit 的 macOS DMG

```bash
bash scripts/build-macos-dmg.sh
```

该脚本会构建主应用、WidgetKit 扩展和刷新桥接程序，将扩展嵌入应用后进行签名与 DMG 封装。未配置 Developer ID 时生成的本地签名安装包只适合开发验收，不能替代正式签名和 Apple 公证。

## 数据与隐私

- 无账号、云同步或内置遥测。
- 事项保存在系统应用数据目录的 `todo.db`。
- 数据库使用参数绑定，事项 JSON 长度限制为 65,535 字节。
- ICS 文件只在本机解析，不上传文件内容。
- 会议链接只接受 HTTP/HTTPS 协议。
- Content Security Policy 禁止加载任意远程脚本。
- WidgetKit 只通过 `group.com.todo.desktop` App Group 读取本地快照。

卸载应用前如需保留数据，请先备份系统应用数据目录中的 `todo.db`。

## 代码命名规范

- 源码标识符、包名、文件名、目录名、数据库名和系统协议名必须按职责命名，不得包含具体 App 或产品品牌名称。
- 产品名称只允许出现在用户可见文案、安装包展示信息和产品文档中。
- 兼容历史版本所需的旧值必须封装在独立迁移逻辑中，不得扩散到业务代码。
- 新增模块优先采用 `task`、`calendar`、`widget`、`storage` 等领域或职责词汇。

## 分支约定

- `main`：已评审、已测试的稳定代码。
- `dev`：后续功能开发分支。
- 新需求先在 `dev` 完成开发和验证，获得批准后再合并至 `main`。

## 当前限制

- 当前不支持账号体系或跨设备同步。
- 当前不支持 Apple EventKit、Microsoft Outlook 账户直连，仅支持 ICS 文件导入。
- macOS WidgetKit 需要完整 Xcode、App Group 和正式 Apple Team 签名。
- 正式公开分发仍需完成 macOS Developer ID/公证与 Windows Authenticode 签名。
- 当前本地 macOS 安装包为 Apple Silicon `arm64`，Intel Mac 需要单独的 x86_64 或 Universal 2 构建。

## 相关文档

- [BluNote v0.2.2 功能说明书](docs/BluNote-v0.2.2-功能说明书.md)
- [BluNote v1.0 产品需求文档](docs/BluNote-v1.0-产品需求文档.md)
- [上线前检查清单](docs/RELEASE_CHECKLIST.md)

## 许可证

本项目使用 [MIT License](LICENSE)。
