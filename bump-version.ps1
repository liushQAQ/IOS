#!/usr/bin/env pwsh
# 发版助手：递增版本号并同步所有版本来源。
#
#   .\bump-version.ps1            # 1.0.4 -> 1.0.5 （修订号 +1）
#   .\bump-version.ps1 -Minor     # 1.0.4 -> 1.1.0
#   .\bump-version.ps1 -Major     # 1.0.4 -> 2.0.0
#   .\bump-version.ps1 -Set 1.2.3 # 直接指定
#
# 同步的四个地方：
#   1. VERSION                           展示版本唯一来源（CI 读取）
#   2. DSHios.xcodeproj/project.pbxproj  MARKETING_VERSION（Debug + Release）
#   3. DSHios/Info.plist                 DSHAppVersion
#   4. DSHios/AppDelegate.swift          Version.marketing / Version.build
#
# 构建号（CFBundleVersion）由 CI 用 GitHub run_number 自动注入，本地不写死。

param(
    [switch]$Major,
    [switch]$Minor,
    [string]$Set
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-CurrentVersion {
    Join-Path $root 'VERSION' | Get-Content -Raw | ForEach-Object { $_.Trim() }
}

function Step-Version([string]$v) {
    $parts = $v.Split('.')
    if ($parts.Count -ne 3) { throw "版本号必须是 x.y.z 格式，当前是 $v" }
    $nums = $parts | ForEach-Object { [int]$_ }
    if ($Set) { return ,([int[]]$Set.Split('.')) }
    if ($Major) { return ,@($nums[0] + 1, 0, 0) }
    if ($Minor) { return ,@($nums[0], $nums[1] + 1, 0) }
    return ,@($nums[0], $nums[1], $nums[2] + 1)
}

$current = Get-CurrentVersion
$new = Step-Version $current
$newStr = $new -join '.'
$build = [string]([int]$new[0] * 10000 + [int]$new[1] * 100 + [int]$new[2])

Write-Host "版本: $current -> $newStr (build $build)"

# 1. VERSION
Set-Content -Path (Join-Path $root 'VERSION') -Value "$newStr`n" -NoNewline -Encoding ascii

# 2. project.pbxproj（Debug + Release 两处）
$pbx = Join-Path $root 'DSHios.xcodeproj/project.pbxproj'
(Get-Content $pbx -Raw) `
    -replace 'MARKETING_VERSION = [0-9.]+;', "MARKETING_VERSION = $newStr;" |
    Set-Content $pbx -NoNewline -Encoding utf8

# 3. Info.plist DSHAppVersion
$plist = Join-Path $root 'DSHios/Info.plist'
(Get-Content $plist -Raw) `
    -replace '(<key>DSHAppVersion</key>\s*<string>)[0-9.]+(</string>)', "`${1}$newStr`$2" |
    Set-Content $plist -NoNewline -Encoding utf8

# 4. AppDelegate.swift
$app = Join-Path $root 'DSHios/AppDelegate.swift'
(Get-Content $app -Raw) `
    -replace 'static let marketing = "[0-9.]+"', "static let marketing = `"$newStr`"" `
    -replace 'static let build = "[0-9]+"', "static let build = `"" + ([string]([int]$new[2] + 1)) + "`"" |
    Set-Content $app -NoNewline -Encoding utf8

Write-Host "已同步 VERSION / pbxproj / Info.plist / AppDelegate.swift"
Write-Host "下一步: git add -A; git commit -m 'v$newStr'; git push"
