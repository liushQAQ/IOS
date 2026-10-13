#!/usr/bin/env bash
# 本地打包未签名 TIPA（单一公开版，老总规范：架构彻底合并）
# 在任意装了 Xcode 的 Mac 上执行：
#   git pull && bash build_tipa_local.sh
# 产物（不覆盖历史版本，按版本号落盘）：
#   dist/DSHios-public-<版本>-local.tipa
set -euo pipefail
cd "$(dirname "$0")"

command -v xcodebuild >/dev/null || { echo "需要在装了 Xcode 的 Mac 上运行"; exit 1; }

VER="$(tr -d '[:space:]' < VERSION)"
[ -n "$VER" ] || { echo "VERSION 文件为空"; exit 1; }
BUILD_DIR="build"
OUT_DIR="dist"
mkdir -p "$OUT_DIR"

pack() {
  local tag="$1" archive="$2"
  local app="$BUILD_DIR/$archive/Products/Applications/DSHios.app"
  [ -d "$app" ] || { echo "缺少 $app"; exit 1; }
  rm -rf "$OUT_DIR/Payload"
  mkdir -p "$OUT_DIR/Payload"
  cp -R "$app" "$OUT_DIR/Payload/DSHios.app"
  rm -rf "$OUT_DIR/Payload/DSHios.app/_CodeSignature" 2>/dev/null || true
  rm -f  "$OUT_DIR/Payload/DSHios.app/embedded.mobileprovision" 2>/dev/null || true
  local name="DSHios-${tag}-${VER}-local"
  # 保留旧产物：同名已存在就加时间戳，绝不覆盖
  if [ -e "$OUT_DIR/$name.tipa" ]; then
    name="${name}-$(date +%H%M%S)"
  fi
  (cd "$OUT_DIR" && zip -qry "$name.tipa" Payload)
  cp "$OUT_DIR/$name.tipa" "$OUT_DIR/$name.ipa"
  rm -rf "$OUT_DIR/Payload"
  echo "   - $OUT_DIR/$name.tipa"
}

echo "▶ 1/2 编译单一公开版（不签名） v$VER ..."
xcodebuild archive \
  -project DSHios.xcodeproj -scheme DSHios -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$BUILD_DIR/DSHios-public.xcarchive" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" DEVELOPMENT_TEAM="" AD_HOC_CODE_SIGNING_ALLOWED=NO

echo "▶ 2/2 打包单一公开版 TIPA ..."
pack public DSHios-public.xcarchive

echo "✅ 完成（单一公开版未签名，巨魔/TrollStore 直接装）"
