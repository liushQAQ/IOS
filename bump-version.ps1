#!/usr/bin/env pwsh
# Release helper: bump version and sync every version source.
#
#   powershell -ExecutionPolicy Bypass -File .\bump-version.ps1              # 1.0.4 -> 1.0.5
#   powershell -ExecutionPolicy Bypass -File .\bump-version.ps1 -Minor       # -> 1.1.0
#   powershell -ExecutionPolicy Bypass -File .\bump-version.ps1 -Major       # -> 2.0.0
#   powershell -ExecutionPolicy Bypass -File .\bump-version.ps1 -Set 1.2.3   # explicit
#
# Synced sources:
#   1. VERSION                            marketing version, read by CI
#   2. DSHios.xcodeproj/project.pbxproj   MARKETING_VERSION (Debug + Release)
#   3. DSHios/Info.plist                  DSHAppVersion
#   4. DSHios/AppDelegate.swift           Version.marketing
#
# CFBundleVersion (build) is injected by CI from github.run_number.
# NOTE: keep this file pure ASCII. PowerShell 5.1 reads a BOM-less UTF-8
# script as ANSI, which garbles non-ASCII comments and can break parsing.

param(
    [switch]$Major,
    [switch]$Minor,
    [string]$Set
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $root) { $root = (Get-Location).Path }

$enc = [System.Text.UTF8Encoding]::new($false)

function Read-Text([string]$p) { [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false)) }
function Write-Text([string]$p, [string]$t) { [System.IO.File]::WriteAllText($p, $t, [System.Text.UTF8Encoding]::new($false)) }

$versionFile = Join-Path $root 'VERSION'
$current = (Read-Text $versionFile).Trim()
Write-Host "Current version: $current (root=$root)"

if ([string]::IsNullOrEmpty($Set)) {
    $parts = $current -split '\.'
    if ($parts.Count -ne 3) { throw "Version must be x.y.z, got: $current" }
    $maj = [int]$parts[0]
    $min = [int]$parts[1]
    $pat = [int]$parts[2]
    if ($Major) { $maj = $maj + 1; $min = 0; $pat = 0 }
    elseif ($Minor) { $min = $min + 1; $pat = 0 }
    else { $pat = $pat + 1 }
    $newStr = [string]::Format('{0}.{1}.{2}', $maj, $min, $pat)
} else {
    $newStr = $Set
}

Write-Host "Bumping: $current -> $newStr"

# 1. VERSION
Write-Text $versionFile ($newStr + "`n")

# 2. project.pbxproj (Debug + Release)
$pbx = Join-Path $root 'DSHios.xcodeproj/project.pbxproj'
Write-Text $pbx ((Read-Text $pbx) -replace 'MARKETING_VERSION = [0-9.]+;', ('MARKETING_VERSION = ' + $newStr + ';'))

# 3. Info.plist DSHAppVersion
$plist = Join-Path $root 'DSHios/Info.plist'
Write-Text $plist ((Read-Text $plist) -replace '(<key>DSHAppVersion</key>\s*<string>)[0-9.]+(</string>)', "`${1}$newStr`$2")

# 4. AppDelegate.swift
$app = Join-Path $root 'DSHios/AppDelegate.swift'
Write-Text $app ((Read-Text $app) -replace 'static let marketing = "[0-9.]+"', ('static let marketing = "' + $newStr + '"'))

Write-Host "Synced VERSION / pbxproj / Info.plist / AppDelegate.swift"
Write-Host "Next: git add -A; git commit -m 'v$newStr'; git push"
