#!/bin/bash
set -euo pipefail
archive="$1"
ipa="$2"
app="$archive/Products/Applications/ios-mcp-agent.app"
test -d "$app"
rm -rf Payload
mkdir -p Payload "$(dirname "$ipa")"
cp -R "$app" Payload/ios-mcp-agent.app
rm -rf Payload/ios-mcp-agent.app/_CodeSignature
rm -f Payload/ios-mcp-agent.app/embedded.mobileprovision
zip -qry "$ipa" Payload
rm -rf Payload
# 同步生成巨魔专享的 .tipa 包（方便在手机端/隔空投送时被 TrollStore 原生直接识别关联）
tipa="${ipa%.ipa}.tipa"
cp -f "$ipa" "$tipa"
ls -lh "$ipa" "$tipa"
