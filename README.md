# 钉事 PinDo

一个面向 macOS 13+ 与 Windows 10 21H2+ 的轻量桌面 To-Do 挂件。界面采用柔和毛玻璃、圆角卡片和周/月日历，任务、会议与子任务都保存在本机。

## 功能

- 360 × 620 挂件与 900 × 640 展开窗口两态切换
- 桌面小组件模式：驻留桌面层、不遮挡普通窗口，并可隐藏任务栏入口
- macOS WidgetKit 原生小组件：小/中尺寸、透明背景、今日任务与最近会议、点击回到主应用
- 55%–100% 外观透明度调节，设置在本机持久保存
- 挂件默认连续 7 天周视图、展开默认完整月视图，两种偏好独立保存
- 工作任务、部门会议分类管理
- 一层子任务、独立计划时间、自动汇总进度
- 会议地点、链接以及提前 5/15/30/60 分钟系统通知
- 任务定时提醒及通知快捷稍后：30 分钟、1 小时、明天 9:00、自定义；每日最多 3 次
- SQLite 本地持久化；关闭窗口后托盘常驻
- 自由拖动、8px 边缘吸附、位置锁定、500ms 位置记忆、单实例、明暗主题与 ICS 日历导入
- Content Security Policy、最小 Tauri 权限、输入长度与链接协议校验

## 本地开发

要求 Node.js 20.19+/22.12+、Rust stable，以及对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm ci
npm run check
npm run tauri dev
```

## 构建

普通跨平台应用构建使用 `npm run tauri build`。包含 WidgetKit 扩展的 macOS DMG 需要完整 Xcode 与 XcodeGen：

```bash
bash scripts/build-macos-dmg.sh
```

macOS 产物位于 `src-tauri/target/release/bundle/dmg`，Windows 安装包位于 `src-tauri/target/release/bundle/nsis`。正式对外分发前应在 CI 中配置 Apple Developer ID、公证凭据与 Windows 代码签名证书。

## 数据与隐私

PinDo v0.2 没有账号、云同步或遥测。数据位于操作系统应用数据目录中的 `pindo.db`，不会上传。macOS 原生小组件仅通过 App Group 读取本机快照；ICS 文件仅在本机解析，导入会议以只读来源标记。

## 当前发布范围

v0.2 P0 功能与跨平台 ICS 导入已实现。正式分发仍需配置 Apple Developer ID/App Group、公证凭据与 Windows 代码签名证书。Apple EventKit、Outlook 账户直连属于 P1，当前版本不宣称支持账户直连。详见 [上线检查](docs/RELEASE_CHECKLIST.md)。

## 许可证

[MIT](LICENSE)
