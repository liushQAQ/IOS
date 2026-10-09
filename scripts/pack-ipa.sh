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
ls -lh "$ipa"
