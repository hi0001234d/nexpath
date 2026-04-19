import { ReadStream, WriteStream } from 'node:tty';
import { openSync } from 'node:fs';
import { platform } from 'node:process';
import * as rl from 'node:readline';
import pc from 'picocolors';
import type { SelectFn } from './DecisionSession.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TtyStreams {
  input:    ReadStream;
  output:   WriteStream;
  /**
   * True when input and output share the same underlying fd (Linux /dev/tty).
   * Used to prevent double-destroy on cleanup.
   */
  sharedFd: boolean;
}

// ── Platform-specific TTY stream opening ───────────────────────────────────────

/**
 * Open the console TTY device directly, bypassing the piped stdin/stdout of
 * the hook subprocess.
 *
 * Windows : opens \\.\CONIN$ (read) and \\.\CONOUT$ (write) as separate fds.
 * Linux/Mac: opens /dev/tty as a single shared fd for both read and write.
 *
 * Returns null if no TTY device is accessible (CI, no-console context, service).
 * The caller must fall back to no_action when null is returned.
 *
 * NOTE: Git Bash / MSYS2 translates \\.\CONIN$ → C:\.CONIN$ → ENOENT.
 *       Windows path only works in PowerShell / cmd / Windows Terminal.
 */
function openTtyStreams(): TtyStreams | null {
  try {
    if (platform === 'win32') {
      // r+ (OPEN_EXISTING + GENERIC_READ|WRITE) — do NOT use 'w+' for CONOUT$,
      // it implies truncation semantics on some Windows versions.
      const inFd  = openSync('\\\\.\\CONIN$',  'r+');
      const outFd = openSync('\\\\.\\CONOUT$', 'r+');
      return {
        input:    new ReadStream(inFd),
        output:   new WriteStream(outFd),
        sharedFd: false,
      };
    } else {
      // Linux / Mac — single fd serves both read and write
      const fd = openSync('/dev/tty', 'r+');
      return {
        input:    new ReadStream(fd),
        output:   new WriteStream(fd),
        sharedFd: true,
      };
    }
  } catch {
    return null;
  }
}

// ── SelectFn builder ───────────────────────────────────────────────────────────

/**
 * Build a SelectFn that uses a readline-based numbered menu over the direct
 * TTY streams.
 *
 * Why readline instead of @clack/core's SelectPrompt:
 *   SelectPrompt.prompt() internally calls `new WriteStream(0)` — hardcoded
 *   fd=0 (piped stdin in hook context). uv_tty_init on a pipe returns EBADF.
 *   readline with terminal:false reads lines without raw mode or fd=0 access,
 *   so it works correctly in hook subprocesses.
 *
 * UX: numbered list (1-N) written to CONOUT$, user types a number + Enter.
 * No setRawMode required — the console's built-in cooked mode provides echo
 * and line buffering.
 */
function buildSelectFn(streams: TtyStreams): SelectFn {
  return (opts) =>
    new Promise<string | symbol>((resolve) => {
      const options = opts.options;
      let settled = false;

      function cleanup(value: string | symbol): void {
        if (settled) return;
        settled = true;
        iface.close();
        streams.input.destroy();
        if (!streams.sharedFd) streams.output.destroy();
        resolve(value);
      }

      // Render numbered menu to CONOUT$ directly
      const menuLines = [
        pc.gray('│'),
        `${pc.cyan('◆')}  ${opts.message}`,
        ...options.map((opt, i) => `${pc.cyan('│')}  ${pc.green(`${i + 1})`)} ${opt.label}`),
        pc.cyan('│'),
      ];
      streams.output.write(menuLines.join('\n') + '\n');
      streams.output.write(`${pc.cyan('└')}  Select (1-${options.length}): `);

      // readline with terminal:false — line-mode read, no raw mode, no fd=0 access
      const iface = rl.createInterface({
        input:    streams.input as unknown as import('stream').Readable,
        terminal: false,
      });

      streams.input.once('error',  () => cleanup(Symbol('tty_error')));
      streams.output.once('error', () => cleanup(Symbol('tty_error')));

      iface.once('line', (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
          const selected = options[num - 1];
          streams.output.write(
            `${pc.gray('│')}  ${pc.dim(selected.label)}\n${pc.gray('│')}\n`,
          );
          cleanup(selected.value);
        } else {
          // Invalid input → treat as cancel/skip
          cleanup(Symbol('cancelled'));
        }
      });

      iface.once('close', () => cleanup(Symbol('cancelled')));
    });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a TTY-aware SelectFn that opens the console TTY device directly,
 * bypassing the piped stdin in Claude Code's hook subprocess context.
 *
 * Returns null when no TTY device is accessible — the caller should fall back
 * to returning { outcome: 'no_action', reason: 'no_tty' }.
 *
 * Platform support:
 *   Windows  — \\.\CONIN$ / \\.\CONOUT$ (requires console attachment)
 *   Linux/Mac — /dev/tty (requires controlling terminal)
 */
export function createTtySelectFn(): SelectFn | null {
  const streams = openTtyStreams();
  if (!streams) return null;
  return buildSelectFn(streams);
}
