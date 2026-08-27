# sync-state.ps1 — 切换机器前，把银月运行时状态提交并推送到远程
# 用法（在 desk 根目录执行）：  .\sync-state.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$ts = Get-Date -Format 'yyyy-MM-dd_HH:mm'

# 仅同步运行时状态相关的目录/文件（代码由你平时的 git 流程管理）
$targets = @()
if (Test-Path 'data')             { $targets += 'data' }
if (Test-Path 'config.local.json') { $targets += 'config.local.json' }
if (Test-Path '银月记忆')       { $targets += '银月记忆' }

if ($targets.Count -eq 0) {
    Write-Host '没有需要同步的状态目录，跳过。'
    exit 0
}

git add -A @targets

# 没有任何改动则直接退出，避免产生空提交
$changed = git status --porcelain
if (-not $changed) {
    Write-Host '状态无变化，已是最新。'
    exit 0
}

git commit -m "chore(state): sync runtime state $ts"
git push
Write-Host "已提交并推送状态：$ts"
