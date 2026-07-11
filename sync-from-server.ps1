# ============================================================
# sync-from-server.ps1
# 从服务器拉取最新文件到本地 Git 仓库，作为备份快照
# 使用方式: .\sync-from-server.ps1
# 工作原理: 服务器是唯一数据源，本地只做备份
# ============================================================
param(
    [string]$SshKey = "$env:USERPROFILE\.ssh\voadge.pem",
    [string]$Remote = "ubuntu@110.42.236.231",
    [string]$RemoteDir = "/opt/noco-base"
)

$ErrorActionPreference = "Stop"
$LocalDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== 从服务器同步文件到本地 ===" -ForegroundColor Cyan
Write-Host "服务器: $Remote"
Write-Host "远程目录: $RemoteDir"
Write-Host "本地目录: $LocalDir"
Write-Host ""

# 需要同步的文件列表
$syncItems = @(
    "docker-compose.yml"
    "nginx.conf"
    "10-dashboard.sh"
    "entrypoint-wrapper.sh"
    "dashboard/index.html"
    "dashboard/briefing.html"
    "dashboard/百宝箱.html"
    "dashboard/行程发票报销助手.html"
    "dashboard/智能排版打印助手.html"
    "dashboard/sw.js"
    "dashboard/nb-version.json"
    "dashboard/mappings.json"
)

function Sync-File {
    param($item)
    $dir = Split-Path $item -Parent
    if ($dir) {
        $null = New-Item -ItemType Directory -Path "$LocalDir\$dir" -Force
    }
    $localPath = "$LocalDir\$($item -replace '/', '\')"
    $remotePath = "$RemoteDir/$item"
    $result = & scp -q -i "$SshKey" -o StrictHostKeyChecking=no "$Remote`:$remotePath" "$localPath" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ $item" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $item (not found on server)" -ForegroundColor Yellow
    }
}

Write-Host "1. 同步配置文件和 dashboard 页面..." -ForegroundColor Yellow
foreach ($item in $syncItems) {
    Sync-File $item
}

Write-Host ""
Write-Host "2. 同步 dashboard/assets/ 目录..." -ForegroundColor Yellow
$localAssets = "$LocalDir\dashboard\assets"
$null = New-Item -ItemType Directory -Path $localAssets -Force
$result = & scp -r -q -i "$SshKey" -o StrictHostKeyChecking=no "$Remote`:$RemoteDir/dashboard/assets/" "$localAssets\" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ dashboard/assets/" -ForegroundColor Green
}

Write-Host ""
Write-Host "3. 同步插件 dist/ 目录..." -ForegroundColor Yellow
foreach ($plugin in @("nocobase-plugin-dashboard-home", "nocobase-plugin-print-template")) {
    $localPlugin = "$LocalDir\$plugin\dist"
    $null = New-Item -ItemType Directory -Path $localPlugin -Force
    $result = & scp -r -q -i "$SshKey" -o StrictHostKeyChecking=no "$Remote`:$RemoteDir/$plugin/dist/" "$localPlugin\" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ $plugin/dist/" -ForegroundColor Green
    } else {
        Write-Host "   - $plugin/dist/ not found" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "4. 记录同步时间..." -ForegroundColor Yellow
Get-Date -Format "yyyy-MM-dd HH:mm:ss" | Set-Content "$LocalDir\.last-sync"

Write-Host ""
Write-Host "=== 同步完成 ===" -ForegroundColor Cyan
Write-Host ""

# Git 提交
Push-Location $LocalDir
try {
    git add -A
    $status = git diff --cached --stat
    if (-not $status) {
        Write-Host "没有变更，服务器文件与本地一致。" -ForegroundColor Green
        return
    }
    Write-Host "变更如下:" -ForegroundColor Yellow
    git diff --cached --stat
    Write-Host ""
    $commit = Read-Host "提交备份快照? (Y/n)"
    if ($commit -eq "" -or $commit -eq "Y" -or $commit -eq "y") {
        $date = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "sync: 从服务器同步备份 $date"
        $push = Read-Host "推送到远程仓库? (y/N)"
        if ($push -eq "Y" -or $push -eq "y") {
            git push
        }
    }
} finally {
    Pop-Location
}
