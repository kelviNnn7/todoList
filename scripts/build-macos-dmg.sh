#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"

if ! xcrun --find xcodebuild >/dev/null 2>&1; then
  echo "需要安装完整 Xcode，并在 xcode-select 中启用后才能构建 WidgetKit。" >&2
  exit 1
fi
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "缺少 XcodeGen：请先执行 brew install xcodegen。" >&2
  exit 1
fi

npm run check
npm run tauri build -- --bundles app
xcodegen generate --spec native/project.yml --project native
xcodebuild -project native/DesktopWidgets.xcodeproj -scheme DesktopWidgets -configuration Release -derivedDataPath native/build CODE_SIGNING_ALLOWED=NO build

app_path="src-tauri/target/release/bundle/macos/BluNote.app"
products="native/build/Build/Products/Release"
mkdir -p "$app_path/Contents/PlugIns"
cp -R "$products/TaskWidget.appex" "$app_path/Contents/PlugIns/TaskWidget.appex"
cp "$products/WidgetReloader" "$app_path/Contents/MacOS/WidgetReloader"
chmod +x "$app_path/Contents/MacOS/WidgetReloader"
codesign --force --options runtime --sign - --entitlements native/TaskWidget/TaskWidget.entitlements "$app_path/Contents/PlugIns/TaskWidget.appex"
codesign --force --options runtime --sign - "$app_path/Contents/MacOS/WidgetReloader"
codesign --force --options runtime --sign - --entitlements src-tauri/entitlements.plist "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"

architecture="$(uname -m)"
output_dir="src-tauri/target/release/bundle/dmg"
output_path="$output_dir/BluNote_0.2.4_${architecture}.dmg"
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp -R "$app_path" "$staging/"
ln -s /Applications "$staging/Applications"
mkdir -p "$output_dir"
hdiutil create -volname "BluNote" -srcfolder "$staging" -ov -format UDZO "$output_path"
echo "$output_path"
