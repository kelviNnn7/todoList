#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "WKWebView 像素回归仅支持 macOS。" >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "需要 Swift 工具链（Xcode Command Line Tools）。" >&2
  exit 1
fi
if [[ ! -f dist/index.html ]]; then
  npm run build
fi

output_arg="${1:-output/opacity-fix}"
mkdir -p "$output_arg"
output_dir="$(cd "$output_arg" && pwd)"
port="${WKWEBVIEW_TEST_PORT:-4174}"
server_log="$(mktemp -t widget-opacity-server)"
mkdir -p output/.swift-modules
bundle="output/OpacityProbe.app"
binary="$bundle/Contents/MacOS/opacity-probe"
cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f "$server_log"
  rm -rf "$bundle"
}
trap cleanup EXIT

node scripts/serve-dist.mjs "$port" dist >"$server_log" 2>&1 &
server_pid=$!
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if ! curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
  echo "本地预览服务启动失败：" >&2
  cat "$server_log" >&2
  exit 1
fi

rm -rf "$bundle"
mkdir -p "$bundle/Contents/MacOS"
swiftc -swift-version 5 -O -module-cache-path output/.swift-modules \
  -framework AppKit -framework WebKit scripts/wkwebview-opacity-test.swift -o "$binary"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>opacity-probe</string>
<key>CFBundleIdentifier</key><string>com.todo.desktop.opacityprobe</string>
<key>CFBundleName</key><string>OpacityProbe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
codesign --force --sign - "$bundle" >/dev/null 2>&1 || true

set +e
"$binary" "http://127.0.0.1:${port}/" "$output_dir" >"$output_dir/wkwebview-opacity-run.json" 2>"$output_dir/wkwebview-opacity-stderr.log" &
probe_pid=$!
for _ in $(seq 1 240); do
  if ! kill -0 "$probe_pid" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if kill -0 "$probe_pid" >/dev/null 2>&1; then
  kill "$probe_pid" >/dev/null 2>&1 || true
  wait "$probe_pid" 2>/dev/null || true
  echo "WKWebView 像素回归超时（240s）。" >&2
  exit 1
fi
wait "$probe_pid"
status=$?
set -e
cat "$output_dir/wkwebview-opacity-run.json"
exit "$status"
