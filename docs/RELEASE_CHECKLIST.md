# 上线前检查清单

> 本清单区分“开发验收”和“正式发布”。未取得 Developer ID 签名与 Apple 公证前，任何 DMG 均不得标记为正式版。

## 自动化门禁

- [ ] `npm ci` 可复现安装
- [ ] `npm audit --audit-level=moderate` 为 0
- [ ] `npm run verify:version` 通过，`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 主版本与完整版本一致
- [ ] `npm run check` 通过：ESLint 0 warning、Vitest 全部通过、核心 `src/lib/**/*.ts` statements/lines ≥ 90%、TypeScript 与 Vite 生产构建通过
- [ ] `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test` 通过
- [ ] `cargo audit --file src-tauri/Cargo.lock` 无已知漏洞
- [ ] macOS GitHub Actions `native` job 通过，且提交 SHA 与待发布 DMG 一致
- [ ] WidgetKit `.appex` 已编译、嵌入、通过 App Group entitlement 与深链校验
- [ ] 主应用与 `TaskWidget.appex` 的 `CFBundleShortVersionString`、`CFBundleVersion` 均与 `package.json` 一致
- [ ] 安装包解压体积与运行内存符合 KR1

## 签名与公证资质（当前外部阻塞）

只读检查命令：

```bash
security find-identity -v -p codesigning
```

2026-11-17 本地检查结果：`0 valid identities found`。当前环境没有可用的 Developer ID Application 身份，无法生成可对外分发的正式签名或公证产物。CI 生成的 DMG 使用 ad-hoc 签名，仅用于开发验收；这不是代码缺陷，也不能通过降低签名要求绕过。

正式发布前，账号持有人需要完成以下外部资质与配置（仓库协作者不得购买、创建或代持账号，也不得索取、读取或提交证书私钥、密码、App 专用密码或环境 secret）：

1. 有效的 Apple Developer Program 会员资格与相关协议。
2. 在 Apple Developer 账号创建 **Developer ID Application** 证书，并将证书及私钥安装到受控构建机的登录钥匙串；证书不得进入仓库或 CI 日志。
3. 记录 Apple Team ID，并确保主应用 `com.todo.desktop` 与 Widget 扩展 `com.todo.desktop.widget` 使用同一 Team 签名。
4. 在 Apple Developer 账号注册 App Group `group.com.todo.desktop`，为主应用与 Widget 扩展启用该 App Group，并更新两者的 provisioning/entitlement 配置。
5. 在受控构建机用 `xcrun notarytool store-credentials` 将公证凭据保存到钥匙串 profile；凭据由账号持有人输入，不得写入仓库、命令行历史或 CI 明文变量。
6. 构建机安装完整 Xcode（不能仅使用 Command Line Tools）并启用对应 Developer 目录。

## 取得资质后的正式发布步骤

以下命令仅在具备上述资质、且由授权人员操作的受控 macOS 构建机执行。当前仓库的 `scripts/build-macos-dmg.sh` 仍以 ad-hoc 签名生成开发验收包，正式发布前必须替换为 Developer ID 签名流程，不能直接把 ad-hoc 包提交公证。

```bash
# 1. 确认身份与 Team
security find-identity -v -p codesigning
# 必须包含 "Developer ID Application: <名称> (<TEAM_ID>)"

# 2. 构建完整 WidgetKit 应用包（脚本会完成版本校验与嵌入）
bash scripts/build-macos-dmg.sh

# 3. 由内到外使用 Developer ID 与时间戳重新签名
codesign --force --options runtime --timestamp --sign "$CODE_SIGN_IDENTITY" \
  --entitlements native/TaskWidget/TaskWidget.entitlements \
  "src-tauri/target/release/bundle/macos/BluNote.app/Contents/PlugIns/TaskWidget.appex"
codesign --force --options runtime --timestamp --sign "$CODE_SIGN_IDENTITY" \
  "src-tauri/target/release/bundle/macos/BluNote.app/Contents/MacOS/WidgetReloader"
codesign --force --options runtime --timestamp --sign "$CODE_SIGN_IDENTITY" \
  --entitlements src-tauri/entitlements.plist \
  "src-tauri/target/release/bundle/macos/BluNote.app"

# 4. 验证主应用、嵌套扩展与 Gatekeeper 评估
codesign --verify --deep --strict --verbose=2 "src-tauri/target/release/bundle/macos/BluNote.app"
codesign -d --entitlements :- "src-tauri/target/release/bundle/macos/BluNote.app/Contents/PlugIns/TaskWidget.appex"
spctl --assess --type execute --verbose=4 "src-tauri/target/release/bundle/macos/BluNote.app"

# 5. 重新封装并签名 DMG，提交公证、装订并验证
hdiutil create -volname "BluNote" -srcfolder "<包含 BluNote.app 与 Applications 链接的目录>" \
  -ov -format UDZO "<BluNote_version_arch.dmg>"
codesign --force --timestamp --sign "$CODE_SIGN_IDENTITY" "<BluNote_version_arch.dmg>"
xcrun notarytool submit "<BluNote_version_arch.dmg>" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "<BluNote_version_arch.dmg>"
xcrun stapler validate "<BluNote_version_arch.dmg>"
spctl --assess --type open --context context:primary-signature --verbose=4 "<BluNote_version_arch.dmg>"
```

只有公证成功、`stapler validate` 与 `spctl` 均通过后，才能把该 DMG 标记为正式发布产物并记录 SHA-256。

## 手工平台矩阵

| 场景 | macOS 13/14/15 |
|---|---:|
| 首次启动、透明窗口、浅/深色 | 待签名构建 |
| Liquid Glass、交互反馈、降低透明度、高对比度及无模糊回退 | 待真机 |
| 多显示器位置恢复与锁定 | 待真机 |
| 关闭转托盘、托盘退出、单实例 | 待真机 |
| 通知授权、睡眠唤醒、时区/DST | 待真机 |
| 通知快捷稍后与每日 3 次上限 | 待真机 |
| WidgetKit 小/中尺寸、透明度、5 秒内刷新 | 待签名构建 |
| 安装、升级、卸载与数据保留 | 待签名构建 |

## 发布阻断项

以下项目没有完成前，不应把构建标记为“生产正式版”：

1. Apple Developer ID 签名与公证；当前无有效 codesigning identity。
2. Apple Developer 账号中注册 `group.com.todo.desktop` App Group，并让主应用与 Widget 扩展使用同一 Team 签名。
3. macOS 通知准时率长稳测试，至少覆盖睡眠唤醒、系统时区变更和应用隐藏状态。
4. 多显示器热插拔后的窗口可见性恢复。
5. EventKit 与 Outlook 账户直连（若继续纳入对外承诺）；当前仅支持 ICS。
6. 无障碍键盘全流程与屏幕阅读器真机复核。

## 已实施的风险控制

- CSP 禁止任意远程脚本；生产构建不生成 source map。
- SQLite 全部使用参数绑定，数据库仅保存长度受限 JSON。
- 会议链接仅接受 HTTP/HTTPS；外部内容不使用 `dangerouslySetInnerHTML`。
- ICS 文件限制为 5MB，导入字段设置长度上限，不执行文件中的脚本或附件。
- Tauri 能力只开放主窗口必需的 SQL、通知、窗口状态和自启权限。
- 单实例避免重复提醒；提醒写入 `reminderSentAt` 防止重复触发。
- 任务提醒使用显式状态机，稍后次数按自然日限制为 3 次；旧数据库通过 v2 迁移无损补列。
- Widget 数据采用 App Group 临时文件加原子替换，同步后调用 WidgetKit 刷新桥接程序。
- Widget 版本不再写死：构建时从 `package.json` 注入 Xcode 构建变量，并在应用包与 DMG 挂载后校验主应用/扩展版本一致。
