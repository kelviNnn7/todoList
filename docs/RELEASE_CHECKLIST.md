# 上线前检查清单

## 自动化门禁

- [ ] `npm ci` 可复现安装
- [ ] `npm audit --audit-level=moderate` 为 0
- [ ] ESLint 无 warning
- [ ] Vitest 全部通过并生成覆盖率
- [ ] TypeScript 严格模式与 Vite 生产构建通过
- [ ] `cargo fmt --check`、`cargo clippy -- -D warnings` 通过
- [ ] macOS 与 Windows GitHub Actions 原生构建通过
- [ ] 安装包解压体积与运行内存符合 KR1

## 手工平台矩阵

| 场景 | macOS 13/14/15 | Windows 10 21H2 | Windows 11 |
|---|---:|---:|---:|
| 首次启动、透明窗口、浅/深色 | 待签名构建 | 待 CI 构建 | 待 CI 构建 |
| 多显示器位置恢复与锁定 | 待真机 | 待真机 | 待真机 |
| 关闭转托盘、托盘退出、单实例 | 待真机 | 待真机 | 待真机 |
| 通知授权、睡眠唤醒、时区/DST | 待真机 | 待真机 | 待真机 |
| 安装、升级、卸载与数据保留 | 待签名构建 | 待签名构建 | 待签名构建 |

## 发布阻断项

以下项目没有完成前，不应把构建标记为“生产正式版”：

1. Apple Developer ID 签名与公证、Windows Authenticode 签名。
2. 三套目标系统的通知准时率长稳测试，至少覆盖睡眠唤醒、系统时区变更和应用隐藏状态。
3. 多显示器热插拔后的窗口可见性恢复。
4. EventKit 与 Outlook 账户直连（若继续纳入 V1 对外承诺）；当前仅支持 ICS。
5. 无障碍键盘全流程与屏幕阅读器真机复核。

## 已实施的风险控制

- CSP 禁止任意远程脚本；生产构建不生成 source map。
- SQLite 全部使用参数绑定，数据库仅保存长度受限 JSON。
- 会议链接仅接受 HTTP/HTTPS；外部内容不使用 `dangerouslySetInnerHTML`。
- ICS 文件限制为 5MB，导入字段设置长度上限，不执行文件中的脚本或附件。
- Tauri 能力只开放主窗口必需的 SQL、通知、窗口状态和自启权限。
- 单实例避免重复提醒；提醒写入 `reminderSentAt` 防止重复触发。
