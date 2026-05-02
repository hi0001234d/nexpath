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
import { CLIPBOARD_ONLY, OPTION_SEPARATOR, OPT_OUT_SENTINEL } from './DecisionSession.js';
import { SKIP_NOW, SHOW_SIMPLER } from './options.js';
import type { Store } from '../store/db.js';
import { setConfig } from '../store/config.js';

// ── New-window helpers: .mjs script builders ─────────────────────────────────

/** [cmd, args] tuple for a clipboard command. */
type ClipboardCmd = [cmd: string, args: string[]];

/**
 * Build the .mjs script that runs inside the new terminal window.
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
 * clipboardCmds: ordered list of clipboard commands to try. The script
 * iterates until one succeeds (status 0). Single entry for Windows/macOS,
 * fallback chain for Linux (xclip → wl-copy → xsel).
 */
function buildMjsScript(
  clackUrl: string,
  optFileFwd: string,
  resultFileFwd: string,
  clipboardCmds: ClipboardCmd[],
): string {
  return `import { select, isCancel } from '${clackUrl}';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { emitKeypressEvents } from 'node:readline';

const opts    = JSON.parse(readFileSync('${optFileFwd}', 'utf8'));
const TIMEOUT = Symbol('timeout');

// Capture Ctrl+X (opt-out) and Ctrl+T (frequency) pressed during the select UI.
// @clack/prompts sets raw mode; our listener receives events it doesn't consume.
if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
}
let specialKey = null;
process.stdin.on('keypress', (ch, key) => {
  if (key?.sequence === '\\x18') {   // Ctrl+X → exit immediately
    writeFileSync('${resultFileFwd}', '__NEXPATH_OPT_OUT__', 'utf8');
    process.exit(0);
  }
  if (key?.sequence === '\\x14') {   // Ctrl+T → show freq menu in new window; exit immediately
    writeFileSync('${resultFileFwd}', '__FREQ_MENU_PENDING__', 'utf8');
    process.exit(0);
  }
});

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
      const _clipCmds = ${JSON.stringify(clipboardCmds)};
      for (const [_c, _a] of _clipCmds) {
        const _r = spawnSync(_c, _a, { input: picked, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'] });
        if (_r.status === 0) break;
      }
      writeFileSync('${resultFileFwd}', '__CLIP__', 'utf8');
    }
  }
} else if (!isCancel(picked) && picked !== TIMEOUT && typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', picked, 'utf8');
}

process.exit(0);
`;
}

function buildFreqMjsScript(clackUrl: string, resultFileFwd: string): string {
  return `import { select, isCancel } from '${clackUrl}';
import { writeFileSync } from 'node:fs';

const TIMEOUT = Symbol('timeout');
const picked = await Promise.race([
  select({
    message: 'Advisory frequency',
    options: [
      { value: 'every_event',      label: 'Every qualifying event (default)' },
      { value: 'major_only',       label: 'Major transitions only (stage changes)' },
      { value: 'once_per_session', label: 'Once per coding session' },
      { value: 'off',              label: 'Off \\u2014 disable all advisories' },
    ],
  }),
  new Promise((r) => setTimeout(() => r(TIMEOUT), 60_000)),
]);

if (!isCancel(picked) && picked !== TIMEOUT && typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', \`__FREQ__:\${picked}\`, 'utf8');
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
function buildWindowsNewWindowSelectFn(_store?: Store, _projectRoot?: string): SelectFn {
  const clackUrl = resolveClackEsmUrl();

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

      writeFileSync(scriptFile, buildMjsScript(clackUrl, optFileFwd, resultFileFwd, [['clip', []]]), 'utf8');

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
      //   '__CLIP__'               → user chose "Copy to clipboard" (clip.exe already called)
      //   '__NEXPATH_OPT_OUT__'    → user pressed Ctrl+X; runDecisionSession writes config
      //   '__FREQ_MENU_PENDING__'  → user pressed Ctrl+T; spawn a second freq-selection window
      //   '__FREQ__:<value>'       → freq picked in second window; runDecisionSession writes config
      //   any other non-empty      → selected prompt text (send to Claude path)
      //   (absent / empty)         → cancelled / timed out
      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__FREQ_MENU_PENDING__') {
          const freqId         = randomUUID();
          const freqResultFile = join(tmpdir(), `nexpath-freq-res-${freqId}.txt`);
          const freqScriptFile = join(tmpdir(), `nexpath-freq-sel-${freqId}.mjs`);
          const freqResultFwd  = freqResultFile.replace(/\\/g, '/');
          writeFileSync(freqScriptFile, buildFreqMjsScript(clackUrl, freqResultFwd), 'utf8');
          spawnSync(
            'cmd.exe',
            ['/c', 'start', '/WAIT', 'Nexpath \u2014 Frequency', 'node', freqScriptFile],
            { stdio: 'ignore' },
          );
          if (existsSync(freqResultFile)) {
            const freqRaw = readFileSync(freqResultFile, 'utf8').trim();
            if (freqRaw.startsWith('__FREQ__:')) result = freqRaw;
          }
          for (const f of [freqScriptFile, freqResultFile]) {
            try { unlinkSync(f); } catch { /* ignore */ }
          }
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
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

// ── Linux: new terminal window via detected emulator ─────────────────────────

/** Resolve the @clack/prompts ESM entry URL from nexpath's module context. */
function resolveClackEsmUrl(): string {
  const _require      = createRequire(import.meta.url);
  const clackPkgPath  = _require.resolve('@clack/prompts/package.json');
  const clackPkg      = JSON.parse(readFileSync(clackPkgPath, 'utf8')) as {
    exports: { '.': { import: string } };
  };
  const clackEsmEntry = clackPkg.exports['.'].import;
  const clackEsmPath  = join(dirname(clackPkgPath), clackEsmEntry);
  return `file:///${clackEsmPath.replace(/\\/g, '/')}`;
}

function commandExists(cmd: string): boolean {
  const r = spawnSync('which', [cmd], { stdio: 'pipe', timeout: 2000 });
  return r.status === 0;
}

interface TerminalSpec {
  cmd:  string;
  args: (title: string, scriptFile: string) => string[];
  /** Optional extra validation after commandExists passes (e.g. version check). */
  validate?: () => boolean;
}

const LINUX_TERMINALS: TerminalSpec[] = [
  {
    cmd: 'xdg-terminal-exec',
    args: (_t, s) => ['node', s],
  },
  {
    cmd: 'gnome-terminal',
    args: (t, s) => ['--wait', `--title=${t}`, '--', 'node', s],
    // --wait is buggy before v3.36 (window close doesn't trigger exit signal)
    validate: () => {
      const r = spawnSync('gnome-terminal', ['--version'], { encoding: 'utf8', stdio: 'pipe', timeout: 2000 });
      const m = r.stdout?.match(/(\d+)\.(\d+)/);
      if (!m) return true; // can't determine version — assume OK
      return parseInt(m[1]) > 3 || (parseInt(m[1]) === 3 && parseInt(m[2]) >= 36);
    },
  },
  {
    cmd: 'konsole',
    args: (t, s) => ['-p', `tabtitle=${t}`, '-e', 'node', s],
  },
  {
    cmd: 'xfce4-terminal',
    args: (t, s) => ['--disable-server', `--title=${t}`, '-e', `node ${s}`],
  },
  {
    cmd: 'kitty',
    args: (t, s) => ['--title', t, 'node', s],
  },
  {
    cmd: 'alacritty',
    args: (t, s) => ['--title', t, '-e', 'node', s],
  },
  {
    cmd: 'wezterm',
    args: (_t, s) => ['start', '--', 'node', s],
  },
  {
    cmd: 'foot',
    args: (t, s) => [`--title=${t}`, 'node', s],
  },
  {
    cmd: 'x-terminal-emulator',
    args: (_t, s) => ['-e', 'node', s],
  },
  {
    cmd: 'xterm',
    args: (t, s) => ['-T', t, '-fa', 'Monospace', '-fs', '12', '-e', 'node', s],
  },
];

/**
 * Detect an installed terminal emulator that supports blocking execution.
 * Returns null when no GUI session is available ($DISPLAY / $WAYLAND_DISPLAY unset)
 * or no known terminal emulator is found.
 */
export function detectLinuxTerminal(): TerminalSpec | null {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return null;
  for (const spec of LINUX_TERMINALS) {
    if (commandExists(spec.cmd)) {
      if (spec.validate && !spec.validate()) continue;
      return spec;
    }
  }
  return null;
}

/** Linux clipboard fallback chain: xclip → wl-copy → xsel. */
const LINUX_CLIPBOARD_CMDS: ClipboardCmd[] = [
  ['xclip', ['-selection', 'clipboard']],
  ['wl-copy', []],
  ['xsel', ['--clipboard', '--input']],
];

const WINDOW_TITLE = 'Nexpath \u2014 Action Required';
const FREQ_WINDOW_TITLE = 'Nexpath \u2014 Frequency';

function buildLinuxNewWindowSelectFn(store?: Store, projectRoot?: string): SelectFn | null {
  const terminal = detectLinuxTerminal();
  if (!terminal) return null;

  const clackUrl = resolveClackEsmUrl();

  return (opts) =>
    new Promise<string | symbol>((resolve) => {
      const id         = randomUUID();
      const optFile    = join(tmpdir(), `nexpath-opt-${id}.json`);
      const resultFile = join(tmpdir(), `nexpath-res-${id}.txt`);
      const scriptFile = join(tmpdir(), `nexpath-sel-${id}.mjs`);

      const optFileFwd    = optFile.replace(/\\/g, '/');
      const resultFileFwd = resultFile.replace(/\\/g, '/');

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

      writeFileSync(scriptFile, buildMjsScript(clackUrl, optFileFwd, resultFileFwd, LINUX_CLIPBOARD_CMDS), 'utf8');

      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      spawnSync(terminal.cmd, terminal.args(WINDOW_TITLE, scriptFile), { stdio: 'ignore' });

      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__FREQ_MENU_PENDING__') {
          const freqId         = randomUUID();
          const freqResultFile = join(tmpdir(), `nexpath-freq-res-${freqId}.txt`);
          const freqScriptFile = join(tmpdir(), `nexpath-freq-sel-${freqId}.mjs`);
          const freqResultFwd  = freqResultFile.replace(/\\/g, '/');
          writeFileSync(freqScriptFile, buildFreqMjsScript(clackUrl, freqResultFwd), 'utf8');
          spawnSync(terminal.cmd, terminal.args(FREQ_WINDOW_TITLE, freqScriptFile), { stdio: 'ignore' });
          if (existsSync(freqResultFile)) {
            const freqRaw = readFileSync(freqResultFile, 'utf8').trim();
            if (freqRaw.startsWith('__FREQ__:')) result = freqRaw;
          }
          for (const f of [freqScriptFile, freqResultFile]) {
            try { unlinkSync(f); } catch { /* ignore */ }
          }
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
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

// ── macOS: new Terminal.app window via osascript ─────────────────────────────

/** macOS clipboard: pbcopy. */
const MAC_CLIPBOARD_CMDS: ClipboardCmd[] = [['pbcopy', []]];

/**
 * Build an AppleScript that opens a new Terminal.app window, runs a command,
 * and polls until the command finishes.
 *
 * osascript is synchronous — spawnSync('osascript', ['-e', script]) blocks
 * until the AppleScript completes. The polling loop inside waits for the
 * shell's `busy` flag to clear (i.e. the Node.js child exits).
 *
 * ;exit after the command ensures the shell exits so busy becomes false.
 * If the user closes the window manually, the `on error` catches the stale
 * reference and exits the loop cleanly.
 */
function buildTerminalAppleScript(command: string): string {
  // Escape backslashes and double-quotes for AppleScript string embedding
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `tell application "Terminal"
    activate
    set theTab to do script "${escaped}; exit"
    delay 1
    repeat
        delay 0.5
        try
            if busy of theTab is false then exit repeat
        on error
            exit repeat
        end try
    end repeat
    try
        close (first window whose selected tab is theTab) saving no
    on error
        try
            close front window saving no
        end try
    end try
end tell`;
}

function buildMacNewWindowSelectFn(_store?: Store, _projectRoot?: string): SelectFn {
  const clackUrl = resolveClackEsmUrl();

  return (opts) =>
    new Promise<string | symbol>((resolve) => {
      const id         = randomUUID();
      const optFile    = join(tmpdir(), `nexpath-opt-${id}.json`);
      const resultFile = join(tmpdir(), `nexpath-res-${id}.txt`);
      const scriptFile = join(tmpdir(), `nexpath-sel-${id}.mjs`);

      const optFileFwd    = optFile.replace(/\\/g, '/');
      const resultFileFwd = resultFile.replace(/\\/g, '/');

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

      writeFileSync(scriptFile, buildMjsScript(clackUrl, optFileFwd, resultFileFwd, MAC_CLIPBOARD_CMDS), 'utf8');

      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      spawnSync('osascript', ['-e', buildTerminalAppleScript(`node ${scriptFile}`)], { stdio: 'ignore' });

      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__FREQ_MENU_PENDING__') {
          const freqId         = randomUUID();
          const freqResultFile = join(tmpdir(), `nexpath-freq-res-${freqId}.txt`);
          const freqScriptFile = join(tmpdir(), `nexpath-freq-sel-${freqId}.mjs`);
          const freqResultFwd  = freqResultFile.replace(/\\/g, '/');
          writeFileSync(freqScriptFile, buildFreqMjsScript(clackUrl, freqResultFwd), 'utf8');
          spawnSync('osascript', ['-e', buildTerminalAppleScript(`node ${freqScriptFile}`)], { stdio: 'ignore' });
          if (existsSync(freqResultFile)) {
            const freqRaw = readFileSync(freqResultFile, 'utf8').trim();
            if (freqRaw.startsWith('__FREQ__:')) result = freqRaw;
          }
          for (const f of [freqScriptFile, freqResultFile]) {
            try { unlinkSync(f); } catch { /* ignore */ }
          }
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
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

function runFrequencySubMenu(
  streams:     TtyStreams,
  iface:       rl.Interface,
  store:       Store | undefined,
  projectRoot: string | undefined,
  cleanup:     (value: string | symbol) => void,
): void {
  const freqOptions = [
    { num: 1, value: 'every_event',      label: 'Every qualifying event (default)' },
    { num: 2, value: 'major_only',       label: 'Major transitions only (stage changes)' },
    { num: 3, value: 'once_per_session', label: 'Once per coding session' },
    { num: 4, value: 'off',              label: 'Off \u2014 disable all advisories' },
  ];
  const menuLines = [
    pc.cyan('│'),
    `${pc.cyan('◆')}  ${pc.bold('Advisory frequency')}`,
    ...freqOptions.map((o) => `${pc.cyan('│')}  ${pc.green(`${o.num})`)} ${o.label}`),
    pc.cyan('│'),
  ];
  streams.output.write(menuLines.join('\n') + '\n');
  streams.output.write(`${pc.cyan('└')}  Select (1-4): `);

  iface.once('line', (answer) => {
    const num = parseInt(answer.trim(), 10);
    const choice = freqOptions.find((o) => o.num === num);
    if (choice && store && projectRoot) {
      setConfig(store, `advisory_frequency:${projectRoot}`, choice.value);
      streams.output.write(
        `${pc.cyan('│')}  ${pc.dim(`Frequency set to: ${choice.label}`)}\n${pc.cyan('│')}\n`,
      );
    }
    cleanup(SKIP_NOW);
  });
}

type UnixMenuOption = { value: string; label: string };

export function buildUnixMenuLines(
  message: string,
  options: UnixMenuOption[],
): { menuLines: string[]; indexToOption: Map<number, UnixMenuOption> } {
  const indexToOption = new Map<number, UnixMenuOption>();
  const menuLines: string[] = [pc.gray('│'), `${pc.cyan('◆')}  ${message}`];
  let numIdx = 1;
  for (const opt of options) {
    if (opt.value.startsWith(OPTION_SEPARATOR)) {
      if (opt.label) {
        menuLines.push(`${pc.cyan('│')}  ${opt.label}`);
      } else {
        menuLines.push(pc.cyan('│'));
      }
    } else if (opt.value === SHOW_SIMPLER) {
      menuLines.push(`${pc.cyan('│')}  ${pc.dim(opt.label)}`);
      indexToOption.set(numIdx++, opt);
    } else {
      const optLines = opt.label.split('\n');
      menuLines.push(`${pc.cyan('│')}  ${pc.green(`${numIdx})`)} ${optLines[0]}`);
      for (let i = 1; i < optLines.length; i++) {
        menuLines.push(`${pc.cyan('│')}     ${optLines[i]}`);
      }
      indexToOption.set(numIdx++, opt);
    }
  }
  return { menuLines, indexToOption };
}

function buildUnixSelectFn(
  streams:      TtyStreams,
  store?:       Store,
  projectRoot?: string,
): SelectFn {
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

      const { menuLines, indexToOption } = buildUnixMenuLines(opts.message, options);
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
        // Ctrl+X → opt-out forever
        if (answer.charCodeAt(0) === 0x18) {
          if (store && projectRoot) {
            setConfig(store, `advisory_frequency:${projectRoot}`, 'off');
          }
          streams.output.write(
            `${pc.cyan('│')}  ${pc.dim('Advisory disabled. Run nexpath config set advisory_frequency every_event to re-activate.')}\n${pc.cyan('│')}\n`,
          );
          cleanup(SKIP_NOW);
          return;
        }

        // Ctrl+T → frequency sub-menu
        if (answer.charCodeAt(0) === 0x14) {
          runFrequencySubMenu(streams, iface, store, projectRoot, cleanup);
          return;
        }

        const num = parseInt(answer.trim(), 10);
        const selected = indexToOption.get(num);
        if (selected !== undefined) {
          streams.output.write(
            `${pc.gray('│')}  ${pc.dim(selected.label.split('\n')[0])}\n${pc.gray('│')}\n`,
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
 * Windows — new console window via cmd /c start (full @clack/prompts UI).
 * macOS   — new Terminal.app window via osascript (full @clack/prompts UI).
 * Linux   — new terminal window via detected emulator (full @clack/prompts UI).
 *           Falls back to /dev/tty readline if no terminal emulator is found.
 *
 * Returns null when no interactive method is available (CI, headless, no console).
 */
export function createTtySelectFn(store?: Store, projectRoot?: string): SelectFn | null {
  const plat = process.platform;
  if (plat === 'win32') {
    return buildWindowsNewWindowSelectFn(store, projectRoot);
  }
  if (plat === 'darwin') {
    return buildMacNewWindowSelectFn(store, projectRoot);
  }
  if (plat === 'linux') {
    const linuxFn = buildLinuxNewWindowSelectFn(store, projectRoot);
    if (linuxFn) return linuxFn;
  }
  // Linux fallback (no terminal emulator / no display) or unknown platform
  const streams = openUnixTtyStreams();
  if (!streams) return null;
  return buildUnixSelectFn(streams, store, projectRoot);
}
