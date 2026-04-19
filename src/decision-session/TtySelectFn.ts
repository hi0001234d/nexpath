import { ReadStream, WriteStream } from 'node:tty';
import { openSync } from 'node:fs';
import { platform } from 'node:process';
import { SelectPrompt } from '@clack/core';
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

// ── Render helpers ─────────────────────────────────────────────────────────────

function stateIcon(state: string): string {
  switch (state) {
    case 'initial':
    case 'active':  return pc.cyan('◆');
    case 'cancel':  return pc.red('■');
    case 'error':   return pc.yellow('▲');
    case 'submit':  return pc.green('◇');
    default:        return pc.cyan('◆');
  }
}

/**
 * Build a render function for SelectPrompt that mirrors @clack/prompts styling.
 * `message` is captured from the SelectFn call closure — not available on `this`.
 */
function buildRenderFn(message: string) {
  return function (this: {
    state:   string;
    cursor:  number;
    options: Array<{ value: string; label: string }>;
  }): string {
    const header = `${pc.gray('│')}\n${stateIcon(this.state)}  ${message}\n`;

    switch (this.state) {
      case 'submit':
        return `${header}${pc.gray('│')}  ${pc.dim(this.options[this.cursor]?.label ?? '')}`;

      case 'cancel':
        return (
          `${header}${pc.gray('│')}  ` +
          `${pc.strikethrough(pc.dim(this.options[this.cursor]?.label ?? ''))}\n${pc.gray('│')}`
        );

      default: {
        const optLines = this.options.map((opt, i) => {
          if (i === this.cursor) return `${pc.green('◉')} ${opt.label}`;
          return `${pc.dim('○')} ${pc.dim(opt.label)}`;
        });
        return (
          `${header}${pc.cyan('│')}  ` +
          `${optLines.join(`\n${pc.cyan('│')}  `)}\n${pc.cyan('└')}\n`
        );
      }
    }
  };
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
 */
function openTtyStreams(): TtyStreams | null {
  try {
    if (platform === 'win32') {
      const inFd  = openSync('\\\\.\\CONIN$',  'r+');
      const outFd = openSync('\\\\.\\CONOUT$', 'w+');
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

function buildSelectFn(streams: TtyStreams): SelectFn {
  return async (opts) => {
    const clackOptions = opts.options.map((o) => ({ value: o.value, label: o.label }));

    try {
      const result = await new SelectPrompt({
        options:      clackOptions,
        initialValue: clackOptions[0]?.value,
        input:        streams.input  as unknown as import('stream').Readable,
        output:       streams.output as unknown as import('stream').Writable,
        render:       buildRenderFn(opts.message),
      }).prompt();

      return result as string | symbol;
    } finally {
      // Always close TTY streams to prevent fd leaks per hook invocation.
      streams.input.destroy();
      if (!streams.sharedFd) streams.output.destroy();
    }
  };
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
