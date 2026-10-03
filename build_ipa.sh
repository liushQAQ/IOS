#!/usr/bin/env bash
# 一键打包【未签名】IPA（在任意 macOS + Xcode 上运行）
# 用法：  ./build_ipa.sh
# 产物：  dist/DSHios-unsigned.ipa  （可直接交给 Sideloadly / 爱思助手 / AltStore / zsign 自行签名）
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="DSHios.xcodeproj"
SCHEME="DSHios"
BUILD_DIR="build"
OUT_DIR="dist"

rm -rf "$BUILD_DIR" "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "▶ 1/2 编译归档（不签名）..."
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$BUILD_DIR/DSHios.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  AD_HOC_CODE_SIGNING_ALLOWED=NO

APP_PATH="$BUILD_DIR/DSHios.xcarchive/Products/Applications/DSHios.app"
if [ ! -d "$APP_PATH" ]; then
  echo "❌ 未找到编译产物 $APP_PATH" >&2
  exit 1
fi

echo "▶ 2/2 打包 Payload/DSHios.app → 未签名 IPA..."
pushd "$OUT_DIR" >/dev/null
mkdir -p Payload
cp -R "$APP_PATH" Payload/DSHios.app
# 清掉任何签名残留，确保是「未签名」包
rm -rf Payload/DSHios.app/_CodeSignature 2>/dev/null || true
rm -f  Payload/DSHios.app/embedded.mobileprovision 2>/dev/null || true
zip -qry DSHios-unsigned.ipa Payload
popd >/dev/null

echo "✅ 完成：$OUT_DIR/DSHios-unsigned.ipa"
echo "   （未签名；用 Sideloadly / 爱思助手 / AltStore / zsign 签你自己的证书）"
