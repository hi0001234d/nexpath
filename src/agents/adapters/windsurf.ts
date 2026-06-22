import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { registerAdapter } from '../registry.js';
import {
  getWindsurfHooksPath,
  writeWindsurfHooks,
  removeWindsurfHooks,
} from '../../windsurf-hook/install.js';
import type {
  InstallContext,
  InstallResult,
  VSCodeExtensionAdapter,
} from '../types.js';

/**
 * Windsurf adapter (M10 of M2 Branch 4).
 *
 * Windsurf is Codeium's AI-native IDE (a VS Code fork, like Cursor).
 * Nexpath ships the same VS Code extension to Cursor + Windsurf via
 * Open VSX. This adapter mirrors `cursor.ts` but with Windsurf-specific
 * config paths.
 *
 * Storage layout difference from Cursor:
 *   - Cursor uses VS Code's standard `User/workspaceStorage/<id>/state.vscdb`
 *     (SQLite) — covered by the cursor-v* extractors.
 *   - Windsurf historically uses `~/.codeium/windsurf/` (Cascade chat data
 *     stored as JSON files rather than SQLite). Architecture rev 2 §4.2
 *     covers this; the dev plan §3 M2 §2.2 M10 calls out the difference.
 *   - Recent Windsurf versions ALSO populate VS Code-style storage at
 *     `User/workspaceStorage/`. We watch both — the Windsurf extractor
 *     (already shipped in B2 as a stub) handles the cascade.* keys when
 *     they appear; the JSON-file path watch belongs to a future
 *     refinement once a real Windsurf chat capture is available.
 *
 * The `extractPrompt` stub matches `cursor.ts` for the same reason —
 * decoding lives at the extension's runtime, not in the CLI adapter.
 */

const MARKETPLACE_ID = 'nexpath.nexpath-vscode';

const OPEN_VSX_URL = `https://open-vsx.org/extension/${MARKETPLACE_ID.replace(
  '.',
  '/',
)}`;
const VS_CODE_MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${MARKETPLACE_ID}`;

/**
 * OS-specific Windsurf configuration directory. Used both as the primary
 * detection heuristic and as the base for the workspace-storage path.
 */
export function windsurfConfigDir(
  home: string,
  platform: NodeJS.Platform = process.platform,
  appdata?: string,
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Windsurf');
    case 'win32':
      return join(appdata ?? process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Windsurf');
    default:
      return join(home, '.config', 'Windsurf');
  }
}

/**
 * Legacy Cascade data directory (per-user, OS-agnostic). Windsurf may
 * still drop JSON chat files here in addition to the VS Code-style
 * workspaceStorage path.
 */
function codeiumCascadeDir(home: string): string {
  return join(home, '.codeium', 'windsurf');
}

export const windsurfAdapter: VSCodeExtensionAdapter = {
  id: 'windsurf',
  label: 'Windsurf',
  category: 'vscode-extension',
  marketplace: { openVsx: MARKETPLACE_ID, vsCode: MARKETPLACE_ID },

  detect(ctx: InstallContext): boolean {
    return (
      existsSync(windsurfConfigDir(ctx.home)) ||
      existsSync(codeiumCascadeDir(ctx.home))
    );
  },

  chatHistoryPaths(ctx: InstallContext): string[] {
    return [
      join(windsurfConfigDir(ctx.home), 'User', 'workspaceStorage'),
      codeiumCascadeDir(ctx.home),
    ];
  },

  /**
   * Intentional stub — same architectural decision as `cursor.ts`. See the
   * comprehensive JSDoc on `cursorAdapter.extractPrompt` for the full
   * rationale + migration path if a CLI caller is ever added.
   *
   * Short version: decoding lives in the extension runtime
   * (`src/ext-vscode/src/extractors/`); the CLI adapter never decodes rows.
   * Returning `null` is contract-compliant ("I don't know"). When the
   * extractors are promoted to `src/agents/chat-history-extractors/`,
   * this method gets wired up to delegate via `pickExtractor` +
   * `extractor.decodeRow`.
   */
  extractPrompt(_rowKey: string, _rowValue: unknown) {
    return null;
  },

  async install(ctx: InstallContext): Promise<InstallResult> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Windsurf'.padEnd(12)} — not detected; skipping`);
      return { status: 'skipped', notes: 'Windsurf not installed on this machine' };
    }
    // Capture: write the Cascade hook (pre_user_prompt → nexpath auto) so prompts
    // are captured even though Windsurf encrypts Cascade at rest. The advisory is
    // then delivered by the extension's poller (read-only hooks can't inject).
    const cliPath  = resolve(process.argv[1]);
    const hooksPath = getWindsurfHooksPath(ctx.home);
    writeWindsurfHooks(hooksPath, cliPath);
    console.log(`✓ ${'Windsurf'.padEnd(12)} — Cascade capture hook written to ${hooksPath}`);
    // Windows/Devin Next does NOT execute the user-level hooks.json (verified
    // 2026-06-16: 0 hook invocations during a full Cascade walk, while the file was
    // present at the documented path and `nexpath windsurf-hook` captured fine when
    // invoked directly). Per the Cascade Hooks spec, hooks also load + merge from the
    // WORKSPACE-level `.windsurf/hooks.json`, which Devin Next DOES honor — so on
    // Windows write that too, relative to the project the user runs install in. Gated
    // to win32 so platforms that already fire the user-level hook don't double-capture.
    if (process.platform === 'win32') {
      const wsHooksPath = join(ctx.cwd, '.windsurf', 'hooks.json');
      writeWindsurfHooks(wsHooksPath, cliPath);
      console.log(`   ${' '.repeat(12)}   + workspace hook (Windows/Devin Next): ${wsHooksPath}`);
    }

    // Delivery: the extension must be installed for the advisory UI + inject.
    console.log(`   ${' '.repeat(12)}   Then install the Nexpath extension to deliver guidance:`);
    console.log(`    Open VSX:            ${OPEN_VSX_URL}`);
    console.log(`    VS Code Marketplace: ${VS_CODE_MARKETPLACE_URL}`);
    console.log(`    Or via CLI:          windsurf --install-extension ${MARKETPLACE_ID}`);
    return {
      status: 'installed',
      notes:
        'Cascade capture hook written; the user must also install the VS Code extension (deep-link printed) for advisory delivery.',
    };
  },

  async uninstall(ctx: InstallContext): Promise<void> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Windsurf'.padEnd(12)} — not detected; skipping`);
      return;
    }
    const removed = removeWindsurfHooks(getWindsurfHooksPath(ctx.home));
    console.log(removed
      ? `✓ ${'Windsurf'.padEnd(12)} — Cascade capture hook removed`
      : `-  ${'Windsurf'.padEnd(12)} — no Cascade capture hook found`);
    // Mirror the install: remove the Windows workspace-level hook too (no-op elsewhere).
    if (process.platform === 'win32') {
      removeWindsurfHooks(join(ctx.cwd, '.windsurf', 'hooks.json'));
    }
    console.log(`   ${' '.repeat(12)}   Uninstall the Nexpath extension from the Windsurf Extensions panel`);
    console.log(`    Or via CLI:          windsurf --uninstall-extension ${MARKETPLACE_ID}`);
  },
};

registerAdapter(windsurfAdapter);
