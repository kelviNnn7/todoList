# 钉事 PinDo

一个面向 macOS 13+ 与 Windows 10 21H2+ 的轻量桌面 To-Do 挂件。界面采用柔和毛玻璃、圆角卡片和两周时间轴，任务、会议与子任务都保存在本机。

## 功能

- 360 × 620 挂件与 900 × 640 展开窗口两态切换
- 14 天日历，支持跨月、前后翻页、按日过滤
- 工作任务、部门会议分类管理
- 一层子任务、独立计划时间、自动汇总进度
- 会议地点、链接以及提前 5/15/30/60 分钟系统通知
- SQLite 本地持久化；关闭窗口后托盘常驻
- 窗口位置记忆、单实例、明暗主题与 ICS 日历导入
- Content Security Policy、最小 Tauri 权限、输入长度与链接协议校验

## 本地开发

要求 Node.js 20.19+/22.12+、Rust stable，以及对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm ci
npm run check
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

macOS 产物位于 `src-tauri/target/release/bundle/dmg`，Windows 安装包位于 `src-tauri/target/release/bundle/nsis`。正式对外分发前应在 CI 中配置 Apple Developer ID、公证凭据与 Windows 代码签名证书。

## 数据与隐私

PinDo V1 没有账号、云同步或遥测。数据位于操作系统应用数据目录中的 `pindo.db`，不会上传。ICS 文件仅在本机解析；导入会议为只读来源标记，重复 UID 会覆盖更新。

## 当前发布范围

P0 功能与跨平台 ICS 导入已实现。Apple EventKit、Outlook 账户直连属于需要平台账号授权和真实设备矩阵验证的 P1 集成，当前版本不宣称支持账户直连。详见 [上线检查](docs/RELEASE_CHECKLIST.md)。

## 许可证

[MIT](LICENSE)
