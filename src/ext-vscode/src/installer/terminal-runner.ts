/**
 * Run the setup runner inside a VS Code integrated terminal and wait for it to
 * finish.
 *
 * The integrated terminal is the right surface for an interactive installer: it
 * is a real TTY, so the CLI's clack prompts (yes/no, API key, pickers) work just
 * as they do when a user runs `nexpath install` by hand, and output streams live.
 * VS Code gives no reliable cross-version "command finished" signal for a
 * terminal you only `sendText` into (shell integration isn't guaranteed), so the
 * runner writes a sentinel file on completion and we poll for it here. This is
 * the most environment-robust completion signal.
 *
 * The vscode-touching bits (`createTerminal`) and the fs poll are injected, so
 * the wait/parse logic is unit-testable without a real terminal or disk.
 */

export interface TerminalLike {
  show(preserveFocus?: boolean): void;
  sendText(text: string, addNewLine?: boolean): void;
  dispose(): void;
}

export interface RunResult {
  ok: boolean;
  /** 'OK', 'FAIL:<step>', 'timeout', or an error detail. */
  detail: string;
  timedOut: boolean;
}

export interface RunInTerminalDeps {
  /** Create + return the terminal to drive (already named/configured). */
  createTerminal: () => TerminalLike;
  /** Read the sentinel file's trimmed contents, or null if it doesn't exist yet. */
  readSentinel: () => string | null;
  /** Remove any stale sentinel before the run. Best-effort. */
  clearSentinel: () => void;
  /** Monotonic clock (ms). */
  now: () => number;
  /** Resolve after ms — injected so tests run instantly. */
  sleep: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface RunOptions {
  /** Give up waiting after this long. Default 10 minutes (npm install + prompts). */
  timeoutMs?: number;
  /** Poll interval for the sentinel. Default 500ms. */
  pollMs?: number;
}

/**
 * Send `command` to a fresh terminal and resolve once the runner writes its
 * sentinel (or the timeout elapses). Never rejects — failures are reported via
 * the returned RunResult so the caller can surface a friendly message.
 */
export async function runSetupInTerminal(
  command: string,
  deps: RunInTerminalDeps,
  opts: RunOptions = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const pollMs = opts.pollMs ?? 500;

  deps.clearSentinel();

  const terminal = deps.createTerminal();
  terminal.show(false);
  // `sendText` appends the platform-correct newline; do not add one ourselves.
  terminal.sendText(command);

  const start = deps.now();
  for (;;) {
    const sentinel = deps.readSentinel();
    if (sentinel !== null) {
      if (sentinel === 'OK') {
        deps.log?.('[nexpath] setup runner reported OK');
        return { ok: true, detail: 'OK', timedOut: false };
      }
      const detail = sentinel || 'FAIL';
      deps.log?.(`[nexpath] setup runner reported failure: ${detail}`);
      return { ok: false, detail, timedOut: false };
    }
    if (deps.now() - start >= timeoutMs) {
      deps.log?.('[nexpath] setup runner timed out waiting for sentinel');
      return { ok: false, detail: 'timeout', timedOut: true };
    }
    await deps.sleep(pollMs);
  }
}
