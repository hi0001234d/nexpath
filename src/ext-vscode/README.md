# Nexpath VS Code Extension

Companion extension that wires Cursor and Windsurf into the Nexpath prompt-guidance pipeline.

This sub-package lives at `nexpath/src/ext-vscode/`. It builds independently of the main CLI (via esbuild) and ships to Open VSX + the VS Code Marketplace.

## Status

Milestone M2 Branch 1 (`v0.1.3/m2/extension-skeleton`) — skeleton + IPC stub + first-launch onboarding + activity-bar icon. Chat-history watcher (M2/M3), webview UI (M6–M8), and the Cursor/Windsurf adapters (M9/M10) land in subsequent branches.

## Build

```bash
cd src/ext-vscode/
npm install
npm run build       # bundles src/extension.ts -> out/extension.js (CJS for VS Code host)
npm run watch       # rebuild on save
```

## Test

Unit tests live next to their source files (`*.test.ts`) and are picked up by the root repo's `npm test` (vitest). They mock the `vscode` module via `vi.mock('vscode', ...)`.

## Module Layout

| File | Module (per dev plan §3 M2 §2.2) |
|---|---|
| `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `src/extension.ts` | M1 — skeleton |
| `src/ipc.ts` | M5 — IPC to nexpath CLI |
| `src/onboarding.ts` | M11 — first-launch consent + macOS Full-Disk-Access guidance |
| `media/icon.svg` | M12 — activity-bar icon |
