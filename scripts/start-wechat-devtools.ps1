# 打开 MuuziWx 并开启自动化端口（供 scripts/verify-*.js 使用）
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = (Resolve-Path $ProjectRoot).Path

$app = Get-StartApps | Where-Object {
  $_.AppID -like 'D:\Tencent\*' -and $_.Name -notmatch '卸载'
} | Where-Object {
  $_.Name -like '*开发者*' -or $_.AppID -like '*微信*'
} | Select-Object -First 1
if (-not $app) {
  $app = Get-StartApps | Where-Object {
    $_.AppID -like 'D:\Tencent\*web*'
  } | Select-Object -First 1
}

if (-not $app) {
  Write-Host '未找到「微信开发者工具」。请先安装：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html'
  exit 1
}

$dir = Split-Path -LiteralPath $app.AppID
$cli = Join-Path $dir 'cli.bat'
if (-not (Test-Path -LiteralPath $cli)) {
  Write-Host "未找到 cli.bat: $cli"
  exit 1
}

Write-Host "项目: $ProjectRoot"
Write-Host "CLI:  $cli"

& cmd /c "`"$cli`" open --project `"$ProjectRoot`" --trust-project"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Start-Sleep -Seconds 2
& cmd /c "`"$cli`" auto --project `"$ProjectRoot`" --trust-project --auto-port 9420"
exit $LASTEXITCODE
