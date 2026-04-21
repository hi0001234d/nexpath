import { ReadStream, WriteStream } from 'node:tty';
import { openSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { platform } from 'node:process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as rl from 'node:readline';
import pc from 'picocolors';
import type { SelectFn } from './DecisionSession.js';
import { CLIPBOARD_ONLY, OPTION_SEPARATOR } from './DecisionSession.js';
import { SKIP_NOW, SHOW_SIMPLER } from './options.js';

// ── Windows: new console window running @clack/prompts via Node.js ─────────────

/**
 * Build the .mjs script that runs inside the new console window.
 *
 * The script:
 *   - Imports @clack/prompts select() from the resolved clackUrl
 *   - Reads opts (message + options) from optFileFwd
 *   - Calls select() — full arrow-key UI, visual cursor, ANSI rendering
 *   - Writes the selected value to resultFileFwd (or nothing on cancel/timeout)
 *   - Exits with process.exit(0)
 *
 * 60-second timeout via Promise.race: if user ignores the window, the script
 * exits cleanly without writing the result file → hook treats as 'skipped'.
 *
 * ANSI in message/labels is NOT stripped — @clack/prompts renders it correctly
 * in the new Windows console (Win 10/11 ANSI VT support).
 */
function buildMjsScript(clackUrl: string, optFileFwd: string, resultFileFwd: string): string {
  return `import { select, isCancel } from '${clackUrl}';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const opts    = JSON.parse(readFileSync('${optFileFwd}', 'utf8'));
const TIMEOUT = Symbol('timeout');

let picked;
do {
  picked = await Promise.race([
    select({ message: opts.message, options: opts.options }),
    new Promise((r) => setTimeout(() => r(TIMEOUT), 60_000)),
  ]);
} while (typeof picked === 'string' && picked.startsWith(opts.separatorPrefix));

if (!isCancel(picked) && picked !== TIMEOUT && typeof picked === 'string'
    && picked !== opts.skipNow && picked !== opts.showSimpler) {

  process.stdout.write('\\n\\x1b[2;3m  \\u21b5 hit enter to send directly to Claude\\x1b[0m\\n\\n');

  const action = await Promise.race([
    select({
      message: 'What would you like to do?',
      options: [
        { value: 'send',      label: 'Send to Claude now' },
        { value: 'clipboard', label: 'Copy to clipboard \\u2014 edit before sending' },
      ],
    }),
    new Promise((r) => setTimeout(() => r(TIMEOUT), 60_000)),
  ]);

  if (!isCancel(action) && action !== TIMEOUT && typeof action === 'string') {
    if (action === 'send') {
      writeFileSync('${resultFileFwd}', picked, 'utf8');
    } else {
      spawnSync('clip', [], { input: picked, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
      writeFileSync('${resultFileFwd}', '__CLIP__', 'utf8');
    }
  }
} else if (!isCancel(picked) && picked !== TIMEOUT && typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', picked, 'utf8');
}

process.exit(0);
`;
}

/**
 * Windows-specific SelectFn that opens a new console window running Node.js
 * with @clack/prompts — preserving the full arrow-key, visual-cursor UI.
 *
 * Architecture:
 *   buildWindowsNewWindowSelectFn() returns a SelectFn. Each call to that
 *   SelectFn opens ONE new console window for ONE cascade level. The cascade
 *   loop in runDecisionSession calls selectFn per level — so "Show simpler
 *   options →" closes window 1 and opens window 2 automatically.
 *
 * Why @clack/prompts works here:
 *   cmd /c start gives the child Node.js process its own Windows console.
 *   process.stdin.isTTY === true in the new window.
 *   process.stdin.setRawMode() works → arrow keys, ENTER, Ctrl+C all work.
 *
 * Why createRequire for @clack/prompts path:
 *   createRequire(import.meta.url) resolves packages relative to nexpath's
 *   own node_modules — correct for both local dev, global install, and
 *   npm link. The resolved absolute path is embedded in the .mjs script so
 *   the child process needs no module resolution of its own.
 *
 * Foreground activation: cmd /c start uses ShellExecuteEx (SW_SHOWNORMAL)
 * which reliably brings the new window to the foreground.
 */
function buildWindowsNewWindowSelectFn(): SelectFn {
  // Resolve @clack/prompts ESM entry from nexpath's module context (once per SelectFn build).
  // createRequire().resolve('@clack/prompts') returns the CJS entry (dist/index.cjs).
  // The .mjs script needs the ESM entry (exports['.'].import = dist/index.mjs) so that
  // named imports { select, isCancel } work correctly from an ESM context.
  const _require      = createRequire(import.meta.url);
  const clackPkgPath  = _require.resolve('@clack/prompts/package.json');
  const clackPkg      = JSON.parse(readFileSync(clackPkgPath, 'utf8')) as {
    exports: { '.': { import: string } };
  };
  const clackEsmEntry = clackPkg.exports['.'].import;
  const clackEsmPath  = join(dirname(clackPkgPath), clackEsmEntry);
  const clackUrl      = `file:///${clackEsmPath.replace(/\\/g, '/')}`;

  return (opts) =>
    new Promise<string | symbol>((resolve) => {
      const id         = randomUUID();
      const optFile    = join(tmpdir(), `nexpath-opt-${id}.json`);
      const resultFile = join(tmpdir(), `nexpath-res-${id}.txt`);
      const scriptFile = join(tmpdir(), `nexpath-sel-${id}.mjs`);

      // Forward-slash paths for embedding in the .mjs import/readFile calls
      const optFileFwd    = optFile.replace(/\\/g, '/');
      const resultFileFwd = resultFile.replace(/\\/g, '/');

      // Pass message + options + meta-option sentinels so the MJS script can
      // distinguish real content selections from skip/simpler navigations.
      writeFileSync(
        optFile,
        JSON.stringify({
          message:         opts.message,
          options:         opts.options,
          skipNow:         SKIP_NOW,
          showSimpler:     SHOW_SIMPLER,
          separatorPrefix: OPTION_SEPARATOR,
        }),
        'utf8',
      );

      writeFileSync(scriptFile, buildMjsScript(clackUrl, optFileFwd, resultFileFwd), 'utf8');

      // Textual cue in Claude terminal regardless of whether window is visible
      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      // cmd /c start → ShellExecuteEx → reliable foreground activation
      // Title arg appears in taskbar and Alt+Tab for discoverability
      spawnSync(
        'cmd.exe',
        ['/c', 'start', '/WAIT', 'Nexpath \u2014 Action Required',
          'node', scriptFile],
        { stdio: 'ignore' },
      );

      // Result file format:
      //   '__CLIP__' → user chose "Copy to clipboard" (clip.exe already called by MJS)
      //   any other non-empty text → selected prompt text (send to Claude path)
      //   (absent / empty) → cancelled / timed out
      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw.length > 0) {
          result = raw;
        }
      }

      for (const f of [optFile, resultFile, scriptFile]) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }

      resolve(result);
    });
}

// ── Unix: /dev/tty readline ───────────────────────────────────────────────────

interface TtyStreams {
  input:    ReadStream;
  output:   WriteStream;
  /**
   * True when input and output share the same underlying fd (Linux /dev/tty).
   * Used to prevent double-destroy on cleanup.
   */
  sharedFd: boolean;
}

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
 * /dev/tty streams.
 *
 * Why readline instead of @clack/core's SelectPrompt:
 *   SelectPrompt.prompt() internally calls `new WriteStream(0)` — hardcoded
 *   fd=0 (piped stdin in hook context). uv_tty_init on a pipe returns EBADF.
 *   readline with terminal:false reads lines without raw mode or fd=0 access,
 *   so it works correctly in hook subprocesses.
 */
function copyToClipboardUnix(text: string): void {
  const cmds: [string, string[]][] =
    platform === 'darwin'
      ? [['pbcopy', []]]
      : [['xclip', ['-selection', 'clipboard']], ['wl-copy', []], ['xsel', ['--clipboard', '--input']]];
  for (const [cmd, args] of cmds) {
    const r = spawnSync(cmd, args, { input: text, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'], timeout: 3000 });
    if (r.status === 0) return;
  }
}

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

      // Build numbered menu — separator items get a blank visual row, no number.
      const indexToOption = new Map<number, (typeof options)[number]>();
      const menuLines = [pc.gray('│'), `${pc.cyan('◆')}  ${opts.message}`];
      let numIdx = 1;
      for (const opt of options) {
        if (opt.value.startsWith(OPTION_SEPARATOR)) {
          menuLines.push(pc.cyan('│'));
        } else {
          menuLines.push(`${pc.cyan('│')}  ${pc.green(`${numIdx})`)} ${opt.label}`);
          indexToOption.set(numIdx++, opt);
        }
      }
      menuLines.push(pc.cyan('│'));
      streams.output.write(menuLines.join('\n') + '\n');
      streams.output.write(`${pc.cyan('└')}  Select (1-${indexToOption.size}): `);

      const iface = rl.createInterface({
        input:    streams.input as unknown as import('stream').Readable,
        terminal: false,
      });

      streams.input.once('error',  () => cleanup(Symbol('tty_error')));
      streams.output.once('error', () => cleanup(Symbol('tty_error')));

      iface.once('line', (answer) => {
        const num = parseInt(answer.trim(), 10);
        const selected = indexToOption.get(num);
        if (selected !== undefined) {
          streams.output.write(
            `${pc.gray('│')}  ${pc.dim(selected.label)}\n${pc.gray('│')}\n`,
          );

          // For meta-options (skip / show simpler), return immediately — no second prompt.
          if (selected.value === SKIP_NOW || selected.value === SHOW_SIMPLER) {
            cleanup(selected.value);
            return;
          }

          // Real content selection: show hint + send-vs-clipboard prompt.
          streams.output.write(
            `\n\x1b[2;3m  \u21b5 hit enter to send directly to Claude\x1b[0m\n\n`,
          );
          const actionLines = [
            `${pc.cyan('◆')}  What would you like to do?`,
            `${pc.cyan('│')}  ${pc.green('1)')} Send to Claude now`,
            `${pc.cyan('│')}  ${pc.green('2)')} Copy to clipboard \u2014 edit before sending`,
            pc.cyan('│'),
          ];
          streams.output.write(actionLines.join('\n') + '\n');
          streams.output.write(`${pc.cyan('└')}  `);

          iface.once('line', (actionAnswer) => {
            const actionNum = parseInt(actionAnswer.trim(), 10);
            if (actionNum === 2) {
              copyToClipboardUnix(selected.value);
              cleanup(CLIPBOARD_ONLY);
            } else {
              cleanup(selected.value);
            }
          });
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
 * Windows  — opens a new console window running Node.js + @clack/prompts.
 *            Full arrow-key UI, visual cursor, ANSI. 60s auto-timeout.
 *            Always returns a SelectFn (never null) — cancelled/timeout
 *            resolves as Symbol.
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
