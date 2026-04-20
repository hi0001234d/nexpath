import { ReadStream, WriteStream } from 'node:tty';
import { openSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { platform } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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

// ── ANSI stripper ──────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Windows: new console window via cmd /c start /WAIT ─────────────────────────

/**
 * Build the PS1 script content.
 *
 * Includes a 60-second read timeout (via ReadLineAsync.Wait) so if the user
 * misses or ignores the window, the hook auto-skips rather than blocking
 * Claude's terminal indefinitely.
 */
function buildPs1Script(optFileFwd: string, resultFileFwd: string): string {
  return [
    `$opts    = Get-Content -Raw -LiteralPath '${optFileFwd}' | ConvertFrom-Json`,
    `$message = $opts.message`,
    `$options = $opts.options`,
    ``,
    `Write-Host ''`,
    `Write-Host '  Nexpath \u2014 decision session' -ForegroundColor Cyan`,
    `Write-Host '  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' -ForegroundColor DarkGray`,
    `Write-Host ''`,
    `Write-Host "  $message"`,
    `Write-Host ''`,
    `for ($i = 0; $i -lt $options.Count; $i++) {`,
    `  $n = $i + 1`,
    `  Write-Host "  $n)  $($options[$i].label)" -ForegroundColor Green`,
    `}`,
    `Write-Host ''`,
    `Write-Host "  Select (1-$($options.Count)) [auto-skips in 60s]: " -NoNewline`,
    `$task = [System.Console]::In.ReadLineAsync()`,
    `if ($task.Wait(60000)) {`,
    `  $raw = $task.Result`,
    `} else {`,
    `  Write-Host ''`,
    `  Write-Host '  [No selection \u2014 auto-skipping]' -ForegroundColor DarkGray`,
    `  $raw = ''`,
    `}`,
    `$num = 0`,
    `if ([int]::TryParse($raw.Trim(), [ref]$num) -and $num -ge 1 -and $num -le $options.Count) {`,
    `  $value = $options[$num - 1].value`,
    `  [System.IO.File]::WriteAllText('${resultFileFwd}', $value, [System.Text.Encoding]::UTF8)`,
    `}`,
  ].join('\r\n');
}

/**
 * Windows-specific SelectFn that opens a new console window for user input.
 *
 * Why a new window instead of CONIN$/CONOUT$:
 *   Claude Code's TUI holds the Windows console in raw mode. Any readline
 *   opened on CONIN$ in a hook subprocess never receives keystrokes — the
 *   parent process consumes them first.
 *
 * Why cmd /c start /WAIT instead of Start-Process -Wait:
 *   Start-Process uses CreateProcess internally. The foreground activation
 *   right does not reliably propagate through 3 process hops (Claude Code →
 *   hook → outer powershell → inner powershell). cmd.exe's start command uses
 *   ShellExecuteEx with SW_SHOWNORMAL, which is specifically designed to bring
 *   new app windows to the foreground from a subprocess context.
 *
 * Additional reliability measures:
 *   - 60s read timeout: auto-skip prevents indefinite Claude terminal block
 *   - stderr message: textual cue in Claude terminal if window is missed
 *   - Window title 'Nexpath — Action Required': findable in taskbar/Alt+Tab
 */
function buildWindowsNewWindowSelectFn(): SelectFn {
  return (opts) =>
    new Promise<string | symbol>((resolve) => {
      const id         = randomUUID();
      const optFile    = join(tmpdir(), `nexpath-opt-${id}.json`);
      const resultFile = join(tmpdir(), `nexpath-res-${id}.txt`);
      const scriptFile = join(tmpdir(), `nexpath-sel-${id}.ps1`);

      const plainMessage = stripAnsi(opts.message);
      const plainOptions = opts.options.map((o) => ({
        label: stripAnsi(o.label),
        value: o.value,
      }));

      writeFileSync(
        optFile,
        JSON.stringify({ message: plainMessage, options: plainOptions }),
        'utf8',
      );

      const optFileFwd    = optFile.replace(/\\/g, '/');
      const resultFileFwd = resultFile.replace(/\\/g, '/');

      writeFileSync(scriptFile, buildPs1Script(optFileFwd, resultFileFwd), 'utf8');

      // Textual cue in Claude terminal — visible even if window is missed
      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      // cmd /c start uses ShellExecuteEx → reliable foreground activation
      // Title arg ('Nexpath — Action Required') appears in taskbar and Alt+Tab
      spawnSync(
        'cmd.exe',
        ['/c', 'start', '/WAIT', 'Nexpath \u2014 Action Required',
          'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
        { stdio: 'ignore' },
      );

      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw.length > 0) result = raw;
      }

      for (const f of [optFile, resultFile, scriptFile]) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }

      resolve(result);
    });
}

// ── Unix: /dev/tty readline ───────────────────────────────────────────────────

/**
 * Open /dev/tty as a single shared fd for both read and write.
 * Returns null if no controlling terminal is accessible (CI, headless).
 */
function openUnixTtyStreams(): TtyStreams | null {
  try {
    const fd = openSync('/dev/tty', 'r+');
    return {
      input:    new ReadStream(fd),
      output:   new WriteStream(fd),
      sharedFd: true,
    };
  } catch {
    return null;
  }
}

/**
 * Build a SelectFn that uses a readline-based numbered menu over the direct
 * TTY streams.
 *
 * Why readline instead of @clack/core's SelectPrompt:
 *   SelectPrompt.prompt() internally calls `new WriteStream(0)` — hardcoded
 *   fd=0 (piped stdin in hook context). uv_tty_init on a pipe returns EBADF.
 *   readline with terminal:false reads lines without raw mode or fd=0 access,
 *   so it works correctly in hook subprocesses.
 */
function buildUnixSelectFn(streams: TtyStreams): SelectFn {
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

      const menuLines = [
        pc.gray('│'),
        `${pc.cyan('◆')}  ${opts.message}`,
        ...options.map((opt, i) => `${pc.cyan('│')}  ${pc.green(`${i + 1})`)} ${opt.label}`),
        pc.cyan('│'),
      ];
      streams.output.write(menuLines.join('\n') + '\n');
      streams.output.write(`${pc.cyan('└')}  Select (1-${options.length}): `);

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
          cleanup(Symbol('cancelled'));
        }
      });

      iface.once('close', () => cleanup(Symbol('cancelled')));
    });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a platform-appropriate SelectFn for hook subprocess context.
 *
 * Windows  — opens a new console window via cmd /c start /WAIT.
 *            Returns a SelectFn that always resolves (cancelled if window closed
 *            or 60s timeout reached). Never returns null on Windows.
 * Linux/Mac — opens /dev/tty directly (requires controlling terminal).
 *            Returns null when /dev/tty is not accessible (CI, no console).
 */
export function createTtySelectFn(): SelectFn | null {
  if (platform === 'win32') {
    return buildWindowsNewWindowSelectFn();
  }
  const streams = openUnixTtyStreams();
  if (!streams) return null;
  return buildUnixSelectFn(streams);
}
