#!/usr/bin/env bash
# Nexpath one-step installer (macOS / Linux).
#   1. Node 22.22.3+ (asks before installing Node 22 with nvm; never touches other Node versions)
#   2. npm install -g nexpath-cli          (includes MemOS + codebase-memory-mcp)
#   3. npm install -g openclaw@2026.9.2    (optional: months-old project memory; last OpenClaw for Node 22)
#   4. nexpath install                     (credential + agent hooks)
# Usage: scripts/install.sh [-y]           (-y: answer yes to every question)
set -euo pipefail

YES=0
[ "${1:-}" = "-y" ] && YES=1

ask() { # ask "question" → 0 for yes
  if [ "$YES" = 1 ]; then return 0; fi
  read -r -p "$1 [Y/n] " reply </dev/tty || return 1
  case "${reply:-y}" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

OPENCLAW_VERSION=2026.9.2

node_ok() { # Node 22.22.3+ in the 22 line, 24.15+ in the 24 line, or 25.9+ (Nexpath + OpenClaw 2026.9.2)
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);const at=(m,n)=>b>m||(b===m&&c>=n);process.exit((a===22&&at(22,3))||(a===24&&at(15,0))||(a===25&&at(9,0))||a>25?0:1)'
}

if ! node_ok; then
  echo "Nexpath needs Node 22.22.3 or later (found: $(node -v 2>/dev/null || echo none))."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    if ask "Install Node 22 with nvm now? (your other Node versions stay)"; then
      nvm install 22
      nvm use 22
    else
      echo "Stopped. Install Node 22 (e.g. 'nvm install 22'), then run this again."; exit 1
    fi
  else
    echo "nvm is not installed. Install Node 22 first:"
    echo "  https://github.com/nvm-sh/nvm#installing-and-updating  then: nvm install 22"
    echo "  or download Node 22 from https://nodejs.org/en/download"
    exit 1
  fi
  node_ok || { echo "Node is still not 22.22.3+. Stopped."; exit 1; }
fi
echo "Node $(node -v) ✓"

npm install -g nexpath-cli

if command -v openclaw >/dev/null 2>&1; then
  # Your own OpenClaw is never replaced. Newer OpenClaw versions refuse Node 22.
  if openclaw --version >/dev/null 2>&1; then
    echo "OpenClaw already installed ✓ ($(openclaw --version 2>/dev/null | head -1))"
  else
    echo "Your OpenClaw does not run on Node $(node -v). Nexpath uses OpenClaw $OPENCLAW_VERSION on Node 22:"
    echo "  npm install -g openclaw@$OPENCLAW_VERSION   (replaces your current OpenClaw)"
  fi
elif ask "Install OpenClaw $OPENCLAW_VERSION for months-old project memory? (optional)"; then
  npm install -g "openclaw@$OPENCLAW_VERSION"
fi

nexpath install
