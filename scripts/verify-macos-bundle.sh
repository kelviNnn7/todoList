#!/usr/bin/env bash
set -euo pipefail

app_path="${1:-}"
expected_version="${2:-}"

if [[ -z "$app_path" || -z "$expected_version" ]]; then
  echo "用法：bash scripts/verify-macos-bundle.sh <BluNote.app> <期望版本>" >&2
  exit 2
fi

app_plist="$app_path/Contents/Info.plist"
appex_path="$app_path/Contents/PlugIns/TaskWidget.appex"
appex_plist="$appex_path/Contents/Info.plist"

for path in "$app_path" "$app_plist" "$appex_path" "$appex_plist"; do
  if [[ ! -e "$path" ]]; then
    echo "缺少打包产物：$path" >&2
    exit 1
  fi
done

plist_value() {
  plutil -extract "$1" raw -o - "$2"
}

app_short="$(plist_value CFBundleShortVersionString "$app_plist")"
app_build="$(plist_value CFBundleVersion "$app_plist")"
appex_short="$(plist_value CFBundleShortVersionString "$appex_plist")"
appex_build="$(plist_value CFBundleVersion "$appex_plist")"

if [[ "$app_short" != "$expected_version" || "$app_build" != "$expected_version" ]]; then
  echo "主应用版本与 package.json 不一致：期望 ${expected_version}，实际 short=${app_short} build=${app_build}" >&2
  exit 1
fi
if [[ "$appex_short" != "$expected_version" || "$appex_build" != "$expected_version" ]]; then
  echo "Widget 扩展版本与 package.json 不一致：期望 ${expected_version}，实际 short=${appex_short} build=${appex_build}" >&2
  exit 1
fi
if [[ "$app_short" != "$appex_short" || "$app_build" != "$appex_build" ]]; then
  echo "主应用与 Widget 扩展版本不一致：主应用 short=${app_short} build=${app_build}，扩展 short=${appex_short} build=${appex_build}" >&2
  exit 1
fi

case "${app_short}${app_build}${appex_short}${appex_build}" in
  *'$('*) echo "版本字段仍包含未展开的 Xcode 构建变量" >&2; exit 1 ;;
esac

if [[ ! -x "$app_path/Contents/MacOS/WidgetReloader" ]]; then
  echo "缺少可执行的 WidgetReloader 桥接程序" >&2
  exit 1
fi

echo "版本校验通过：主应用 short=${app_short} build=${app_build}，Widget 扩展 short=${appex_short} build=${appex_build}"
