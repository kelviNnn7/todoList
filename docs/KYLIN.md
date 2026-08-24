# BluNote 麒麟 OS 适配说明

## 支持范围

BluNote 0.2.3 为麒麟/开放麒麟提供 x86_64 与 ARM64 两种原生安装包：

- `.deb`：适用于麒麟软件商店、系统软件中心和 `apt` 管理的正式安装。
- `.AppImage`：适用于免安装运行与便携验证。

应用在 Linux 上使用系统 WebKitGTK、GTK 3、Ayatana AppIndicator 与 Freedesktop 通知服务；任务、会议、ICS 导入、本地 SQLite、托盘、开机自启、透明度、窗口缩放及桌面挂件模式均复用 macOS 版本的数据模型和交互。

## 安装

```bash
sudo apt install ./BluNote_0.2.3_amd64.deb
```

ARM64 设备应安装文件名带 `arm64` 或 `aarch64` 的安装包。AppImage 首次运行前需要添加执行权限：

```bash
chmod +x BluNote_0.2.3_amd64.AppImage
./BluNote_0.2.3_amd64.AppImage
```

## X11 与 Wayland

- UKUI/X11：支持自由拖动、边缘缩放、屏幕可视区约束、边缘吸附、位置恢复、跳过任务栏和桌面置底，体验与 macOS 应用内挂件模式一致。
- Wayland：支持合成器授权的交互式拖动与缩放；出于 Wayland 安全模型，应用不能保证绝对窗口坐标和永久置底。BluNote 会识别该会话并在设置中提示。若需要完整桌面挂件行为，请在登录界面选择 UKUI/X11 会话。

macOS 的 WidgetKit 属于 Apple 专有框架，麒麟没有对应的系统小组件图库。麒麟版本以无边框常驻桌面窗口提供同等任务展示、透明度和交互能力。

## 本地构建

建议在麒麟/openKylin 或 Ubuntu 22.04 的目标架构机器上安装 Rust、Node.js 22 与 Tauri 的 Linux 系统依赖，然后运行：

```bash
npm ci
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:kylin
```

生成文件位于：

- `src-tauri/target/release/bundle/deb/`
- `src-tauri/target/release/bundle/appimage/`

ARM64 AppImage 必须在 ARM64 runner 上原生生成，不能把 x86_64 AppImage 改名后发布。
