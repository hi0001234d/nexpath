import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerAdapter } from '../registry.js';
import type {
  InstallContext,
  InstallResult,
  VSCodeExtensionAdapter,
} from '../types.js';

/**
 * Cursor adapter (M9 of M2 Branch 4).
 *
 * Cursor is a VS Code fork. Nexpath integrates via a companion VS Code
 * extension that runs INSIDE Cursor (sub-package at `src/ext-vscode/`).
 * This CLI-side adapter only handles install-time concerns:
 *   1. Detect whether Cursor is installed on this machine.
 *   2. Print deep-link instructions for the user to install the extension
 *      via Open VSX (Cursor's marketplace).
 *   3. Self-register with the agent registry so `nexpath install` picks
 *      it up automatically.
 *
 * The actual runtime work (watching `state.vscdb`, rendering the
 * decision-session webview, injecting selected options into the chat
 * input) happens inside the VS Code extension at activation time — see
 * `src/ext-vscode/src/extension.ts` for the wiring.
 *
 * The `extractPrompt` method is intentionally a stub. The architecture
 * doc declares it on the `VSCodeExtensionAdapter` interface for symmetric
 * API shape, but actual row decoding lives at the extension's runtime via
 * `src/ext-vscode/src/extractors/` — the CLI never runs the watcher and
 * therefore never decodes rows. A future refactor could relocate the
 * extractors to the CLI level and have the adapter wrap them; for now
 * the stub returns `null` so any caller asking the CLI adapter to decode
 * a row gets the explicit "I don't know" answer.
 */

/** Marketplace identifier used in both Open VSX and the VS Code Marketplace. */
const MARKETPLACE_ID = 'nexpath.nexpath-vscode';

const OPEN_VSX_URL = `https://open-vsx.org/extension/${MARKETPLACE_ID.replace(
  '.',
  '/',
)}`;
const VS_CODE_MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${MARKETPLACE_ID}`;

/**
 * OS-specific Cursor configuration directory. Existence of this directory
 * is the heuristic the adapter uses to decide whether Cursor is installed.
 */
export function cursorConfigDir(
  home: string,
  platform: NodeJS.Platform = process.platform,
  appdata?: string,
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Cursor');
    case 'win32':
      return join(appdata ?? process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Cursor');
    default:
      return join(home, '.config', 'Cursor');
  }
}

export const cursorAdapter: VSCodeExtensionAdapter = {
  id: 'cursor',
  label: 'Cursor',
  category: 'vscode-extension',
  marketplace: { openVsx: MARKETPLACE_ID, vsCode: MARKETPLACE_ID },

  detect(ctx: InstallContext): boolean {
    return existsSync(cursorConfigDir(ctx.home));
  },

  chatHistoryPaths(ctx: InstallContext): string[] {
    // Return the base workspaceStorage directory; per-workspace state.vscdb
    // enumeration happens at extension activation time (we can't enumerate
    // here because the user may open new workspaces after install runs).
    return [join(cursorConfigDir(ctx.home), 'User', 'workspaceStorage')];
  },

  /**
   * Intentional stub — see "Architectural decision" below.
   *
   * The `VSCodeExtensionAdapter` interface declares `extractPrompt` for
   * symmetric API shape (so a hypothetical future caller could ask
   * "given this raw row, what's the user prompt?"). In our current
   * architecture this method has **no caller**:
   *
   *   - The `nexpath` CLI never reads `state.vscdb` rows — the watcher
   *     lives entirely inside the VS Code extension.
   *   - The extension uses the extractor modules at
   *     `src/ext-vscode/src/extractors/{cursor-v2024-q4, v2025-q1,
   *     v2025-q2, windsurf, index}.ts` directly (via
   *     `chat-history-watcher.ts`'s `pickExtractor` + `decodeRow` flow).
   *   - The CLI adapter sits on the install/configure side; it doesn't
   *     do row decoding.
   *
   * Returning `null` is the contract-compliant "I don't know" answer.
   *
   * ## When this should be filled in (migration path)
   *
   * If a future CLI tool needs to decode chat-history rows (e.g.
   * `nexpath debug last-prompts <state.vscdb>`), the right move is to
   * **promote the extractor modules from the sub-package to the CLI
   * level** so both sides share one source of truth:
   *
   *   1. Move `src/ext-vscode/src/extractors/*` → `src/agents/chat-history-extractors/*`.
   *   2. Move `src/ext-vscode/src/chat-history-types.ts` →
   *      `src/agents/chat-history-extractors/types.ts`.
   *   3. Update sub-package imports in `chat-history-watcher.ts` to use
   *      the new CLI path. Sub-package `tsconfig.json` likely needs
   *      `rootDir` widened (e.g. `".."`) so imports outside `./src` are
   *      allowed.
   *   4. Wire `cursor.ts` and `windsurf.ts` adapters' `extractPrompt`
   *      to call `pickExtractor` + `extractor.decodeRow` and reshape
   *      to the interface's `{ prompt, sessionId } | null` signature.
   *   5. Leave thin re-export shims at the old sub-package paths so any
   *      external importer keeps working.
   *
   * This is a non-trivial refactor with cross-tree concerns (esbuild
   * externals, tsconfig.rootDir, vitest config). Deferred from B4
   * because there is currently no caller demanding it; the unit tests
   * verify only the stub-returns-null contract.
   */
  extractPrompt(_rowKey: string, _rowValue: unknown) {
    return null;
  },

  async install(ctx: InstallContext): Promise<InstallResult> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Cursor'.padEnd(12)} — not detected; skipping`);
      return { status: 'skipped', notes: 'Cursor not installed on this machine' };
    }
    if (process.env.NEXPATH_EXT_SETUP) {
      // Setup launched BY the Nexpath extension → it's already installed, so the
      // marketplace deep-links are redundant noise.
      console.log(`✓ ${'Cursor'.padEnd(12)} — ready (Nexpath extension active)`);
    } else {
      console.log(`✓ ${'Cursor'.padEnd(12)} — install the Nexpath extension to activate guidance:`);
      console.log(`    Open VSX:            ${OPEN_VSX_URL}`);
      console.log(`    VS Code Marketplace: ${VS_CODE_MARKETPLACE_URL}`);
      console.log(`    Or via CLI:          cursor --install-extension ${MARKETPLACE_ID}`);
    }
    return {
      status: 'installed',
      notes:
        'Deep-link instructions printed; the user must install the VS Code extension manually before guidance activates.',
    };
  },

  async uninstall(ctx: InstallContext): Promise<void> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Cursor'.padEnd(12)} — not detected; skipping`);
      return;
    }
    console.log(`-  ${'Cursor'.padEnd(12)} — uninstall the Nexpath extension from the Cursor Extensions panel`);
    console.log(`    Or via CLI:          cursor --uninstall-extension ${MARKETPLACE_ID}`);
  },
};

// Side-effect registration on module load — registered before any installAction
// invocation thanks to the side-effect import in src/agents/index.ts.
registerAdapter(cursorAdapter);
