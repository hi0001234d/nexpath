# Nexpath one-step installer (Windows, PowerShell).
#   1. Node 22.22.3+ (asks before installing Node 22 with nvm-windows; never touches other versions)
#   2. npm install -g nexpath-cli          (includes MemOS + codebase-memory-mcp)
#   3. npm install -g openclaw@2026.9.2    (optional: months-old project memory; last OpenClaw for Node 22)
#   4. nexpath install                     (credential + agent hooks)
# Usage: .\scripts\install.ps1 [-Yes]
param([switch]$Yes)
$ErrorActionPreference = 'Stop'

function Ask([string]$Question) {
  if ($Yes) { return $true }
  $reply = Read-Host "$Question [Y/n]"
  return ($reply -eq '' -or $reply -match '^(y|yes)$')
}

$OpenClawVersion = '2026.9.2'

function Test-NodeOk {
  # Node 22.22.3+ in the 22 line, 24.15+ in the 24 line, or 25.9+ (Nexpath + OpenClaw 2026.9.2)
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = (node -p "process.versions.node").Trim().Split('.') | ForEach-Object { [int]$_ }
  function At([int]$m, [int]$n) { return ($v[1] -gt $m -or ($v[1] -eq $m -and $v[2] -ge $n)) }
  return (($v[0] -eq 22 -and (At 22 3)) -or ($v[0] -eq 24 -and (At 15 0)) -or ($v[0] -eq 25 -and (At 9 0)) -or ($v[0] -gt 25))
}

if (-not (Test-NodeOk)) {
  $found = if (Get-Command node -ErrorAction SilentlyContinue) { node -v } else { 'none' }
  Write-Host "Nexpath needs Node 22.22.3 or later (found: $found)."
  if (Get-Command nvm -ErrorAction SilentlyContinue) {
    if (Ask 'Install Node 22 with nvm-windows now? (your other Node versions stay)') {
      nvm install 22
      nvm use 22
    } else {
      Write-Host "Stopped. Install Node 22 (e.g. 'nvm install 22'), then run this again."; exit 1
    }
  } else {
    Write-Host 'nvm-windows is not installed. Install Node 22 first:'
    Write-Host '  https://github.com/coreybutler/nvm-windows  then: nvm install 22; nvm use 22'
    Write-Host '  or the Node 22 installer from https://nodejs.org/en/download'
    exit 1
  }
  if (-not (Test-NodeOk)) { Write-Host 'Node is still not 22.22.3+. Open a new PowerShell and run this again.'; exit 1 }
}
Write-Host "Node $(node -v) OK"

npm install -g nexpath-cli

if (Get-Command openclaw -ErrorAction SilentlyContinue) {
  # Your own OpenClaw is never replaced. Newer OpenClaw versions refuse Node 22.
  openclaw --version *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'OpenClaw already installed OK'
  } else {
    Write-Host "Your OpenClaw does not run on Node $(node -v). Nexpath uses OpenClaw $OpenClawVersion on Node 22:"
    Write-Host "  npm install -g openclaw@$OpenClawVersion   (replaces your current OpenClaw)"
  }
} elseif (Ask "Install OpenClaw $OpenClawVersion for months-old project memory? (optional)") {
  npm install -g "openclaw@$OpenClawVersion"
}

nexpath install
