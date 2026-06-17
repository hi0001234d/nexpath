// Officially-supported agents, bucketed by the runtime platform nexpath is
// being installed FOR (not the agent's implementation detail).
//
// Why four buckets and not three:
//   - cli       : headless terminal coding agents (Claude Code, Codex CLI, Aider).
//   - ide       : standalone IDE forks of VS Code that ship their own MCP
//                 plumbing (Cursor, Windsurf).
//   - vscodeExt : agents that are VS Code EXTENSIONS — they run inside an IDE
//                 (vanilla VS Code OR an IDE fork like Cursor). Cline, Roo Code,
//                 KiloCode, OpenCode.
//   - browser   : agents hosted in the browser (Replit, Bolt.new, Lovable, ChatGPT).
//
// Why `ide` and `vscodeExt` are SEPARATE constants but collapse under one
// install flag (`--for vscode`):
//   When nexpath itself ships as a VS Code extension, installing that extension
//   makes BOTH the IDE-fork agents (Cursor / Windsurf) AND the inside-VS-Code
//   extension agents (Cline / Roo / Kilo / OpenCode) eligible at once. So one
//   user-facing platform value (`vscode`) gates the union. Keeping the two
//   sub-constants separate lets a future build address them independently
//   without re-bucketing the data.
//
// To officially support a new agent in a future version:
//   1. Add { id, label } to the matching sub-constant below.
//   2. Confirm detectAgentsForCleanup() in install.ts builds a matching push.
//   3. Confirm the registration path (writeMcpEntry / writeOpenCodeEntry /
//      buildClineEntry / buildKiloEntry / etc.) is wired in installAction.

export type SupportedPlatform = 'cli' | 'vscode' | 'browser';

export type SupportedAgent = Readonly<{ id: string; label: string }>;

export const PLATFORM_VALUES: ReadonlyArray<SupportedPlatform> = ['cli', 'vscode', 'browser'];

export const DEFAULT_PLATFORM: SupportedPlatform = 'cli';

export const SUPPORTED_CLI_AGENTS: ReadonlyArray<SupportedAgent> = [
  { id: 'claude', label: 'Claude Code' },
];

export const SUPPORTED_IDE_AGENTS: ReadonlyArray<SupportedAgent> = [
];

export const SUPPORTED_VSCODE_EXT_AGENTS: ReadonlyArray<SupportedAgent> = [
];

export const SUPPORTED_BROWSER_AGENTS: ReadonlyArray<SupportedAgent> = [
];

const PLATFORM_TO_BUCKETS: Record<SupportedPlatform, ReadonlyArray<ReadonlyArray<SupportedAgent>>> = {
  cli:     [SUPPORTED_CLI_AGENTS],
  vscode:  [SUPPORTED_IDE_AGENTS, SUPPORTED_VSCODE_EXT_AGENTS],
  browser: [SUPPORTED_BROWSER_AGENTS],
};

export function supportedIdsForPlatform(platform: SupportedPlatform): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const bucket of PLATFORM_TO_BUCKETS[platform]) {
    for (const agent of bucket) ids.add(agent.id);
  }
  return ids;
}

export function allSupportedIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const platform of PLATFORM_VALUES) {
    for (const id of supportedIdsForPlatform(platform)) ids.add(id);
  }
  return ids;
}

export function validatePlatform(value: string | undefined): SupportedPlatform {
  const normalized = (value ?? DEFAULT_PLATFORM).toLowerCase();
  if (!(PLATFORM_VALUES as readonly string[]).includes(normalized)) {
    throw new Error(
      `Invalid --for value "${value}". Expected one of: ${PLATFORM_VALUES.join(', ')}.`,
    );
  }
  return normalized as SupportedPlatform;
}
