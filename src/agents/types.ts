/**
 * Adapter interface contract for the coding-agent hooking module (Layer B of the
 * three-layer architecture). Every coding agent surface (Claude Code, Cursor,
 * Windsurf, Codex CLI, Aider, Replit, Bolt.new, Lovable, ChatGPT) is wired into
 * nexpath through one of these four adapter categories.
 *
 * See: lib/share/submodule/reviewduel-submodule/docs/architecture/coding-agent-hooks-architecture.md
 */

export type AdapterCategory =
  | 'hook'
  | 'vscode-extension'
  | 'cli-wrap'
  | 'browser-extension';

export interface InstallContext {
  home: string;
  cwd: string;
  /** Skip confirmation prompts. */
  yes: boolean;
  /** Path to ~/.nexpath/prompt-store.db (or ':memory:' for tests). */
  dbPath: string;
}

export interface InstallResult {
  status: 'installed' | 'already-installed' | 'skipped' | 'failed';
  notes?: string;
}

export interface AgentAdapter {
  /** Stable identifier, e.g. 'claude-code', 'cursor', 'replit'. */
  id: string;
  label: string;
  category: AdapterCategory;

  /** Returns true if this agent appears to be present on the current system. */
  detect(ctx: InstallContext): Promise<boolean> | boolean;

  /** Wire up the binding — write config, install extension, register shell alias, etc. */
  install(ctx: InstallContext): Promise<InstallResult>;

  /** Reverse of install. */
  uninstall(ctx: InstallContext): Promise<void>;
}

/** Adapters that wire into agents with native lifecycle hooks (e.g. Claude Code). */
export interface HookAdapter extends AgentAdapter {
  category: 'hook';
  /** Path to the agent's settings file that hosts hook entries. */
  settingsPath(ctx: InstallContext): string;
  /** Build the hook entries to merge into the agent's settings file. */
  buildHooks(ctx: InstallContext): Record<string, Array<{ type: string; command: string }>>;
}

/** Adapters that ship a companion VS Code-format extension (e.g. Cursor, Windsurf). */
export interface VSCodeExtensionAdapter extends AgentAdapter {
  category: 'vscode-extension';
  /** Marketplace identifiers. */
  marketplace: { openVsx: string; vsCode?: string };
  /** Per-OS chat-history paths the extension's file-watcher subscribes to. */
  chatHistoryPaths(ctx: InstallContext): string[];
  /** Schema-extractor — reads new rows out of the watched file. */
  extractPrompt(rowKey: string, rowValue: unknown): { prompt: string; sessionId: string } | null;
}

/** Adapters that wrap a CLI binary (e.g. Codex CLI, Aider). */
export interface CLIWrapAdapter extends AgentAdapter {
  category: 'cli-wrap';
  /** The original binary name, e.g. 'codex', 'aider'. */
  realBinary: string;
  /** Strategy: 'shell-alias' or 'node-proxy'. */
  strategy: 'shell-alias' | 'node-proxy';
  /** For node-proxy: heuristic that detects an agent response boundary in stdout. */
  detectResponseEnd?(stdoutChunk: string): boolean;
}

/** Adapters that ship a browser extension content script (Replit, Bolt.new, Lovable, ChatGPT). */
export interface BrowserExtensionAdapter extends AgentAdapter {
  category: 'browser-extension';
  /** Origins this content script runs against (Manifest V3 match patterns). */
  origins: string[];
  /** Capture strategy in priority order. */
  capture: Array<'fetch' | 'websocket' | 'dom-events' | 'mutation-observer'>;
  /** Inline content-script source to be bundled into the extension build. */
  contentScriptModule: string;
}
