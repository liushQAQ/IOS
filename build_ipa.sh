#!/usr/bin/env bash
# 一键打包【未签名】IPA（在任意 macOS + Xcode 上运行）
# 自动生成 2 个版本：
# 1. dist/DSHios-personal-unsigned.ipa （包含个人内网、外网穿透配置）
# 2. dist/DSHios-public-unsigned.ipa   （纯净版，剔除外网地址与密钥）
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="DSHios.xcodeproj"
SCHEME="DSHios"
BUILD_DIR="build"
OUT_DIR="dist"

rm -rf "$BUILD_DIR" "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "▶ 1/4 编译个人版（不签名）..."
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$BUILD_DIR/DSHios-personal.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  AD_HOC_CODE_SIGNING_ALLOWED=NO

echo "▶ 2/4 打包个人版 IPA..."
mkdir -p "$OUT_DIR/Payload"
cp -R "$BUILD_DIR/DSHios-personal.xcarchive/Products/Applications/DSHios.app" "$OUT_DIR/Payload/DSHios.app"
rm -rf "$OUT_DIR/Payload/DSHios.app/_CodeSignature" 2>/dev/null || true
rm -f  "$OUT_DIR/Payload/DSHios.app/embedded.mobileprovision" 2>/dev/null || true
(cd "$OUT_DIR" && zip -qry DSHios-personal-unsigned.ipa Payload)
cp "$OUT_DIR/DSHios-personal-unsigned.ipa" "$OUT_DIR/DSHios-unsigned.ipa"
rm -rf "$OUT_DIR/Payload"

echo "▶ 3/4 编译公开纯净版（不签名，去除外网地址与密匙）..."
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$BUILD_DIR/DSHios-public.xcarchive" \
  SWIFT_ACTIVE_COMPILATION_CONDITIONS="PUBLIC_BUILD" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  AD_HOC_CODE_SIGNING_ALLOWED=NO

echo "▶ 4/4 打包公开纯净版 IPA..."
mkdir -p "$OUT_DIR/Payload"
cp -R "$BUILD_DIR/DSHios-public.xcarchive/Products/Applications/DSHios.app" "$OUT_DIR/Payload/DSHios.app"
rm -rf "$OUT_DIR/Payload/DSHios.app/_CodeSignature" 2>/dev/null || true
rm -f  "$OUT_DIR/Payload/DSHios.app/embedded.mobileprovision" 2>/dev/null || true
(cd "$OUT_DIR" && zip -qry DSHios-public-unsigned.ipa Payload)
rm -rf "$OUT_DIR/Payload"

echo "✅ 完成："
echo "   - 个人版：$OUT_DIR/DSHios-personal-unsigned.ipa"
echo "   - 公开版：$OUT_DIR/DSHios-public-unsigned.ipa"
