import { ReadStream, WriteStream } from 'node:tty';
import { openSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { platform } from 'node:process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as rl from 'node:readline';
import pc, { createColors } from 'picocolors';
import type { SelectFn } from './DecisionSession.js';
import {
  CLIPBOARD_ONLY,
  OPTION_SEPARATOR,
  OPT_OUT_SENTINEL,
  NEXPATH_HEADER,
  NEXPATH_HEADER_LINES,
} from './DecisionSession.js';
import { SKIP_NOW, SHOW_SIMPLER } from './options.js';
import type { Store } from '../store/db.js';
import { getConfig, setConfig } from '../store/config.js';
import { ROLE_OPTIONS, buildRoleDescriptionLines, buildRoleMenuLines } from '../cli/shared/role-description.js';

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
 *   - Writes the selected value to resultFileFwd (or nothing on cancel/close)
 *   - Exits with process.exit(0)
 *
 * clipboardCmds: ordered list of clipboard commands to try. The script
 * iterates until one succeeds (status 0). Single entry for Windows/macOS,
 * fallback chain for Linux (xclip → wl-copy → xsel).
 */
function buildMjsScript(
  clackUrl: string,
  renderLoopUrl: string,
  optFileFwd: string,
  resultFileFwd: string,
  clipboardCmds: ClipboardCmd[],
): string {
  return `import { select, isCancel } from '${clackUrl}';
import { renderLoop, eventsFromReadline } from '${renderLoopUrl}';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { emitKeypressEvents } from 'node:readline';
import { tmpdir } from 'node:os';

process.stdout.write(${JSON.stringify(NEXPATH_HEADER)});

const opts    = JSON.parse(readFileSync('${optFileFwd}', 'utf8'));
const _dbg = tmpdir() + '/nexpath-render-debug.txt';
const _log = (m) => appendFileSync(_dbg, m + '\\n', 'utf8');
_log('=== ' + new Date().toISOString() + ' ===');
_log('columns=' + process.stdout.columns + '  rows=' + process.stdout.rows);
const _ml = opts.message.split('\\n');
_log('msgLines=' + _ml.length + '  opts=' + opts.options.length);
_ml.forEach((l, i) => _log('  msg[' + i + '] visLen=' + l.replace(/\\x1b\\[[0-9;]*m/g, '').length));
let _wc = 0, _nlTotal = 0;
const _ow = process.stdout.write.bind(process.stdout);
process.stdout.write = function(chunk, ...a) {
  _wc++;
  if (typeof chunk === 'string') {
    const nl = (chunk.match(/\\n/g) || []).length;
    _nlTotal += nl;
    if (_wc <= 4) _log('w' + _wc + ' nl=' + nl + ' len=' + chunk.length);
  }
  return _ow(chunk, ...a);
};

const _rows = process.stdout.rows;
const _cols = process.stdout.columns;
const _msgLineCount = opts.message.split('\\n').length;
const _fixedLines = 1 + _msgLineCount + 2 + ${NEXPATH_HEADER_LINES};
const _avail = _rows - _fixedLines - 2;
function _lineCount(label) {
  if (!label) return 1;
  const segs = label.replace(/\\x1b\\[[0-9;]*m/g, '').split('\\n');
  let total = 0;
  for (let i = 0; i < segs.length; i++) {
    const w = segs[i].length + (i === 0 ? 5 : 0);
    total += Math.max(Math.ceil(w / _cols), 1);
  }
  return total;
}
let _budget = 0, _maxItems = 0;
for (const opt of opts.options) {
  const lc = _lineCount(opt.label);
  if (_budget + lc > _avail) break;
  _budget += lc;
  _maxItems++;
}
const _skipNowIdx = opts.options.findIndex(o => o.value === opts.skipNow);
if (_skipNowIdx >= 0 && _maxItems <= _skipNowIdx) _maxItems = _skipNowIdx + 1;
_maxItems = Math.max(_maxItems, 5);
const _helpIdx = opts.options.findIndex(o => o.value === opts.separatorPrefix + 'help');
if (_helpIdx >= 0) {
  _maxItems = opts.options.length;
}
const _selOptions = (_skipNowIdx >= 0 && _maxItems < opts.options.length)
  ? opts.options.slice(0, _skipNowIdx + 1)
  : opts.options;
if (_maxItems >= _selOptions.length) {
  let _totalVL = 0;
  for (const opt of _selOptions) _totalVL += _lineCount(opt.label);
  if (_totalVL > _selOptions.length) {
    let _wb = 0, _wm = 0;
    for (const opt of _selOptions) {
      const lc = _lineCount(opt.label);
      if (_wb + lc > _selOptions.length) break;
      _wb += lc;
      _wm++;
    }
    if (_wm < _selOptions.length) {
      _maxItems = Math.max(_wm, 5);
      if (_skipNowIdx >= 0 && _maxItems <= _skipNowIdx) _maxItems = _skipNowIdx + 1;
    }
  }
}
_log('maxItems=' + _maxItems + ' budget=' + _budget + ' avail=' + _avail + ' selOpts=' + _selOptions.length);

// Capture Ctrl+X (opt-out) and Ctrl+T (root chooser) pressed during the select UI.
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
  if (key?.sequence === '\\x14') {   // Ctrl+T → show root chooser in new window; exit immediately
    writeFileSync('${resultFileFwd}', '__ROOT_MENU_PENDING__', 'utf8');
    process.exit(0);
  }
});

// Path A: custom render loop replaces @clack/prompts.select for the main
// popup (dev-plan §11.12 + §11.15 line 2184). renderLoop renders the
// full popup including the why-help block in \`message\` (legacy) AND
// per-option desc-base sub-lines + shortcut hint — neither of which
// clack's select widget can show. \`eventsFromReadline\` adapts the
// process.stdin keypress stream into the renderLoop's AsyncIterable
// contract; the cancel() handle stops the queue when we're done.
const { events: _kev, cancel: _kevCancel } = eventsFromReadline(process.stdin);
let picked;
try {
  while (true) {
    const _pickedItem = await renderLoop({
      layout: {
        pinchLabel:    opts.pinchLabel,
        subtitle:      opts.subtitle,
        question:      opts.question,
        whyHelpBlock:  opts.whyHelpBlock,
        options:       _selOptions,
        rows:          process.stdout.rows,
        cols:          process.stdout.columns,
        maxItemsFloor: _maxItems,
      },
      keyEvents: _kev,
    });
    if (_pickedItem === null) { picked = undefined; break; }
    if (typeof _pickedItem.value === 'string' && _pickedItem.value.startsWith(opts.separatorPrefix)) continue;
    picked = _pickedItem.value;
    break;
  }
} finally {
  _kevCancel();
}

process.stdout.write = _ow;
_log('done: writes=' + _wc + ' nlTotal=' + _nlTotal);

if (typeof picked === 'string'
    && picked !== opts.skipNow && picked !== opts.showSimpler) {

  process.stdout.write('\\n\\x1b[2;3m  \\u21b5 hit enter to send directly to Claude\\x1b[0m\\n\\n');

  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'send',      label: 'Send to Claude now' },
      { value: 'clipboard', label: 'Copy to clipboard \\u2014 edit before sending' },
    ],
  });

  if (!isCancel(action) && typeof action === 'string') {
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
} else if (typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', picked, 'utf8');
}

process.exit(0);
`;
}

function buildFreqMjsScript(clackUrl: string, resultFileFwd: string, currentFreq: string): string {
  return `import { select, isCancel } from '${clackUrl}';
import { writeFileSync } from 'node:fs';

process.stdout.write(${JSON.stringify(NEXPATH_HEADER)});

const picked = await select({
  message: 'Advisory frequency',
  initialValue: ${JSON.stringify(currentFreq)},
  options: [
    // Active popup options: simple High / Medium / Low labels.
    { value: 'optimum',          label: 'High' },
    { value: 'every_event',      label: 'Medium' },
    { value: 'major_only',       label: 'Low' },
    // The two entries below stay valid via the CLI (nexpath config set
    // advisory_frequency once_per_session / off) and are still honoured by
    // the gating logic — they are intentionally hidden from this popup.
    // { value: 'once_per_session', label: 'Once per coding session' },
    // { value: 'off',              label: 'Off \\u2014 disable all advisories' },
  ],
});

if (!isCancel(picked) && typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', \`__FREQ__:\${picked}\`, 'utf8');
}

process.exit(0);
`;
}

/**
 * Role picker for the new window: a radio-button @clack/core SelectPrompt with a
 * custom render that lists the roles, then shows the gray "why" description
 * BELOW the options (a plain select() can only put its message above them). The
 * description is pre-styled here so it matches the numbered /dev/tty menu.
 */
function buildRoleMjsScript(_clackUrl: string, resultFileFwd: string, currentRole: string): string {
  const coreUrl   = resolveClackCoreEsmUrl();
  const options   = ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  const descLines = buildRoleDescriptionLines(createColors(true));
  return `import { SelectPrompt, isCancel } from '${coreUrl}';
import { writeFileSync } from 'node:fs';

process.stdout.write(${JSON.stringify(NEXPATH_HEADER)});

const ESC = String.fromCharCode(27);
const A = (c) => (s) => ESC + '[' + c + 'm' + s + ESC + '[0m';
const gray = A('90'), cyan = A('36'), green = A('32'), dim = A('2'), red = A('31'), bold = A('1');
const descLines = ${JSON.stringify(descLines)};

const p = new SelectPrompt({
  options: ${JSON.stringify(options)},
  initialValue: ${JSON.stringify(currentRole)},
  render() {
    const sym = this.state === 'submit' ? green('◇')
              : this.state === 'cancel' ? red('■')
              : cyan('◆');
    const head = gray('│') + '\\n' + sym + '  ' + bold('Project role') + '\\n';
    if (this.state === 'submit' || this.state === 'cancel') {
      return head + gray('│') + '  ' + dim(this.options[this.cursor].label);
    }
    const optLines = this.options.map((o, i) =>
      i === this.cursor
        ? cyan('│') + '  ' + green('●') + ' ' + o.label
        : cyan('│') + '  ' + dim('○') + ' ' + dim(o.label)
    ).join('\\n');
    return head + optLines + '\\n' + cyan('│') + '\\n' + descLines.join('\\n') + '\\n' + cyan('└') + '\\n';
  },
});

const picked = await p.prompt();
if (!isCancel(picked) && typeof picked === 'string') {
  writeFileSync('${resultFileFwd}', \`__ROLE__:\${picked}\`, 'utf8');
}
process.exit(0);
`;
}

function buildRootMenuMjsScript(clackUrl: string, resultFileFwd: string): string {
  return `import { select, isCancel } from '${clackUrl}';
import { writeFileSync } from 'node:fs';

process.stdout.write(${JSON.stringify(NEXPATH_HEADER)});

const picked = await select({
  message: 'What would you like to adjust?',
  options: [
    { value: 'frequency', label: 'Adjust advisory frequency' },
    { value: 'role',      label: 'Configure role' },
    { value: 'done',      label: 'Done!' },
  ],
});

if (!isCancel(picked) && typeof picked === 'string') {
  if (picked === 'frequency') {
    writeFileSync('${resultFileFwd}', '__FREQ_FLOW__', 'utf8');
  } else if (picked === 'role') {
    writeFileSync('${resultFileFwd}', '__ROLE_FLOW__', 'utf8');
  } else if (picked === 'done') {
    writeFileSync('${resultFileFwd}', '__DONE__', 'utf8');
  }
}

process.exit(0);
`;
}

const WINDOW_TITLE = 'Nexpath — Action Required';
const FREQ_WINDOW_TITLE = 'Nexpath — Frequency';
const ROLE_WINDOW_TITLE = 'Nexpath — Role';
const ROOT_WINDOW_TITLE = 'Nexpath — Adjust';

/** Callback that spawns a new window running the given .mjs script with the given title. */
type SpawnWindowFn = (title: string, scriptPath: string) => void;

/** Spawn the role-selection sub-menu in a new window with the user's current role pre-selected. */
function spawnRoleMenuFlow(clackUrl: string, spawnWindow: SpawnWindowFn, currentRole: string): string | symbol {
  const roleId         = randomUUID();
  const roleResultFile = join(tmpdir(), `nexpath-role-res-${roleId}.txt`);
  const roleScriptFile = join(tmpdir(), `nexpath-role-sel-${roleId}.mjs`);
  const roleResultFwd  = roleResultFile.replace(/\\/g, '/');
  writeFileSync(roleScriptFile, buildRoleMjsScript(clackUrl, roleResultFwd, currentRole), 'utf8');
  spawnWindow(ROLE_WINDOW_TITLE, roleScriptFile);
  let result: string | symbol = Symbol('cancelled');
  if (existsSync(roleResultFile)) {
    const roleRaw = readFileSync(roleResultFile, 'utf8').trim();
    if (roleRaw.startsWith('__ROLE__:')) result = roleRaw;
  }
  for (const f of [roleScriptFile, roleResultFile]) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
  return result;
}

/** Spawn the frequency sub-menu in a new window with the user's current value pre-selected. */
function spawnFreqMenuFlow(clackUrl: string, spawnWindow: SpawnWindowFn, currentFreq: string): string | symbol {
  const freqId         = randomUUID();
  const freqResultFile = join(tmpdir(), `nexpath-freq-res-${freqId}.txt`);
  const freqScriptFile = join(tmpdir(), `nexpath-freq-sel-${freqId}.mjs`);
  const freqResultFwd  = freqResultFile.replace(/\\/g, '/');
  writeFileSync(freqScriptFile, buildFreqMjsScript(clackUrl, freqResultFwd, currentFreq), 'utf8');
  spawnWindow(FREQ_WINDOW_TITLE, freqScriptFile);
  let result: string | symbol = Symbol('cancelled');
  if (existsSync(freqResultFile)) {
    const freqRaw = readFileSync(freqResultFile, 'utf8').trim();
    if (freqRaw.startsWith('__FREQ__:')) {
      result = freqRaw;
    }
  }
  for (const f of [freqScriptFile, freqResultFile]) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
  return result;
}

/**
 * Spawn the root chooser in a new window and loop. The user can adjust the
 * advisory frequency, configure the role, or both — after each sub-menu the
 * chooser re-opens so the other can be adjusted. Each selection is saved
 * immediately. "Done!" (or closing the window) exits and returns SKIP_NOW.
 */
function spawnRootChooserFlow(
  clackUrl:    string,
  spawnWindow: SpawnWindowFn,
  store:       Store | undefined,
  projectRoot: string | undefined,
): string | symbol {
  for (;;) {
    const currentFreq    = readCurrentFreq(store, projectRoot);
    const currentRole    = readCurrentRole(store, projectRoot);
    const rootId         = randomUUID();
    const rootResultFile = join(tmpdir(), `nexpath-root-res-${rootId}.txt`);
    const rootScriptFile = join(tmpdir(), `nexpath-root-sel-${rootId}.mjs`);
    const rootResultFwd  = rootResultFile.replace(/\\/g, '/');
    writeFileSync(rootScriptFile, buildRootMenuMjsScript(clackUrl, rootResultFwd), 'utf8');
    spawnWindow(ROOT_WINDOW_TITLE, rootScriptFile);
    const routed = existsSync(rootResultFile) ? readFileSync(rootResultFile, 'utf8').trim() : '';
    for (const f of [rootScriptFile, rootResultFile]) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }

    if (routed === '__FREQ_FLOW__') {
      const picked = spawnFreqMenuFlow(clackUrl, spawnWindow, currentFreq);
      if (typeof picked === 'string' && picked.startsWith('__FREQ__:') && store && projectRoot) {
        setConfig(store, `advisory_frequency:${projectRoot}`, picked.slice('__FREQ__:'.length));
      }
      continue;
    }
    if (routed === '__ROLE_FLOW__') {
      const picked = spawnRoleMenuFlow(clackUrl, spawnWindow, currentRole);
      if (typeof picked === 'string' && picked.startsWith('__ROLE__:') && store && projectRoot) {
        setConfig(store, `role:${projectRoot}`, picked.slice('__ROLE__:'.length));
      }
      continue;
    }
    // '__DONE__', a closed window, or anything unexpected leaves the chooser.
    break;
  }
  return SKIP_NOW;
}

/** Read the currently configured advisory_frequency, project-scoped first then global, default 'every_event'. */
function readCurrentFreq(store: Store | undefined, projectRoot: string | undefined): string {
  if (!store) return 'every_event';
  if (projectRoot) {
    const projectValue = getConfig(store.db, `advisory_frequency:${projectRoot}`);
    if (projectValue) return projectValue;
  }
  const globalValue = getConfig(store.db, 'advisory_frequency');
  return globalValue ?? 'every_event';
}

/** Read the currently configured role, project-scoped first then global, default 'founder'. */
function readCurrentRole(store: Store | undefined, projectRoot: string | undefined): string {
  const valid = ['indie_hacker', 'founder', 'pm', 'vibe_coder'];
  if (!store) return 'founder';
  if (projectRoot) {
    const projectValue = getConfig(store.db, `role:${projectRoot}`);
    if (projectValue && valid.includes(projectValue)) return projectValue;
  }
  const globalValue = getConfig(store.db, 'role');
  if (globalValue && valid.includes(globalValue)) return globalValue;
  return 'founder';
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
function buildWindowsNewWindowSelectFn(store?: Store, projectRoot?: string): SelectFn {
  const clackUrl      = resolveClackEsmUrl();
  const renderLoopUrl = resolveRenderLoopEsmUrl();

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
          // Path A render-loop structured fields (consumed by .mjs child when
          // the script switches from clack `select` to `renderLoop`). Legacy
          // clack-based child still works — these are ignored when absent.
          pinchLabel:      opts.pinchLabel,
          subtitle:        opts.subtitle,
          question:        opts.question,
          whyHelpBlock:    opts.whyHelpBlock,
        }),
        'utf8',
      );

      writeFileSync(scriptFile, buildMjsScript(clackUrl, renderLoopUrl, optFileFwd, resultFileFwd, [['clip', []]]), 'utf8');

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
      //   '__ROOT_MENU_PENDING__'  → user pressed Ctrl+T; spawn the root chooser window
      //   '__FREQ__:<value>'       → freq picked in freq window; runDecisionSession writes config
      //   '__ROLE__:<value>'       → role picked in role window; runDecisionSession writes config
      //   any other non-empty      → selected prompt text (send to Claude path)
      //   (absent / empty)         → cancelled / timed out
      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__ROOT_MENU_PENDING__') {
          result = spawnRootChooserFlow(clackUrl, (title, script) => {
            spawnSync(
              'cmd.exe',
              ['/c', 'start', '/WAIT', title, 'node', script],
              { stdio: 'ignore' },
            );
          }, store, projectRoot);
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
        } else if (raw.startsWith('__ROLE__:')) {
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

/**
 * Resolve the local `render-loop.js` ESM URL — sibling module to this file
 * after TypeScript compilation (`dist/decision-session/render-loop.js`).
 *
 * Mirrors the `resolveClackEsmUrl()` pattern so the .mjs child script can
 * import `renderLoop` from a fully-qualified `file:///` URL with no module
 * resolution of its own — required because the child runs in a separate
 * Node process spawned in a new window (Windows / Linux / Mac) and has no
 * package.json context to resolve bare specifiers against.
 */
function resolveRenderLoopEsmUrl(): string {
  // import.meta.url points at this compiled module (dist/decision-session/TtySelectFn.js);
  // render-loop.js lives as a sibling in the same dist directory.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const rlPath  = join(thisDir, 'render-loop.js');
  return `file:///${rlPath.replace(/\\/g, '/')}`;
}

/** Resolve the @clack/core ESM entry URL (for SelectPrompt) from nexpath's module context. */
function resolveClackCoreEsmUrl(): string {
  const _require = createRequire(import.meta.url);
  const pkgPath  = _require.resolve('@clack/core/package.json');
  const pkg      = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    exports: { '.': { import: string } };
  };
  const esmPath = join(dirname(pkgPath), pkg.exports['.'].import);
  return `file:///${esmPath.replace(/\\/g, '/')}`;
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

function buildLinuxNewWindowSelectFn(store?: Store, projectRoot?: string): SelectFn | null {
  const terminal = detectLinuxTerminal();
  if (!terminal) return null;

  const clackUrl      = resolveClackEsmUrl();
  const renderLoopUrl = resolveRenderLoopEsmUrl();

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
          // Path A render-loop structured fields (consumed by .mjs child when
          // the script switches from clack `select` to `renderLoop`). Legacy
          // clack-based child still works — these are ignored when absent.
          pinchLabel:      opts.pinchLabel,
          subtitle:        opts.subtitle,
          question:        opts.question,
          whyHelpBlock:    opts.whyHelpBlock,
        }),
        'utf8',
      );

      writeFileSync(scriptFile, buildMjsScript(clackUrl, renderLoopUrl, optFileFwd, resultFileFwd, LINUX_CLIPBOARD_CMDS), 'utf8');

      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      spawnSync(terminal.cmd, terminal.args(WINDOW_TITLE, scriptFile), { stdio: 'ignore' });

      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__ROOT_MENU_PENDING__') {
          result = spawnRootChooserFlow(clackUrl, (title, script) => {
            spawnSync(terminal.cmd, terminal.args(title, script), { stdio: 'ignore' });
          }, store, projectRoot);
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
        } else if (raw.startsWith('__ROLE__:')) {
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
    set number of rows of (first window whose selected tab is theTab) to 50
    delay 1
    repeat
        delay 0.5
        try
            if not (busy of theTab) then exit repeat
        on error
            exit repeat
        end try
    end repeat
    try
        close (first window whose selected tab is theTab)
    end try
end tell`;
}

function buildMacNewWindowSelectFn(store?: Store, projectRoot?: string): SelectFn {
  const clackUrl      = resolveClackEsmUrl();
  const renderLoopUrl = resolveRenderLoopEsmUrl();

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
          // Path A render-loop structured fields (consumed by .mjs child when
          // the script switches from clack `select` to `renderLoop`). Legacy
          // clack-based child still works — these are ignored when absent.
          pinchLabel:      opts.pinchLabel,
          subtitle:        opts.subtitle,
          question:        opts.question,
          whyHelpBlock:    opts.whyHelpBlock,
        }),
        'utf8',
      );

      writeFileSync(scriptFile, buildMjsScript(clackUrl, renderLoopUrl, optFileFwd, resultFileFwd, MAC_CLIPBOARD_CMDS), 'utf8');

      process.stderr.write('\n[nexpath] Please select an action in the new window\n');

      spawnSync('osascript', ['-e', buildTerminalAppleScript(`node ${scriptFile}`)], { stdio: 'ignore' });

      let result: string | symbol = Symbol('cancelled');
      if (existsSync(resultFile)) {
        const raw = readFileSync(resultFile, 'utf8').trim();
        if (raw === '__CLIP__') {
          result = CLIPBOARD_ONLY;
        } else if (raw === '__NEXPATH_OPT_OUT__') {
          result = OPT_OUT_SENTINEL;
        } else if (raw === '__ROOT_MENU_PENDING__') {
          result = spawnRootChooserFlow(clackUrl, (_title, script) => {
            spawnSync('osascript', ['-e', buildTerminalAppleScript(`node ${script}`)], { stdio: 'ignore' });
          }, store, projectRoot);
        } else if (raw.startsWith('__FREQ__:')) {
          result = raw;
        } else if (raw.startsWith('__ROLE__:')) {
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

export function runRoleSubMenu(
  streams:     TtyStreams,
  iface:       rl.Interface,
  store:       Store | undefined,
  projectRoot: string | undefined,
  onDone:      () => void,
): void {
  const currentRole = readCurrentRole(store, projectRoot);
  const menuLines = buildRoleMenuLines(currentRole);
  streams.output.write(menuLines.join('\n') + '\n');
  streams.output.write(`${pc.cyan('└')}  Select (1-4): `);

  iface.once('line', (answer) => {
    const num = parseInt(answer.trim(), 10);
    const choice = ROLE_OPTIONS.find((o) => o.num === num);
    if (choice && store && projectRoot) {
      setConfig(store, `role:${projectRoot}`, choice.value);
      streams.output.write(
        `${pc.cyan('│')}  ${pc.dim(`Role set to: ${choice.label}`)}
${pc.cyan('│')}
`,
      );
    }
    onDone();
  });
}

export function runCtrlTRootChooser(
  streams:     TtyStreams,
  iface:       rl.Interface,
  store:       Store | undefined,
  projectRoot: string | undefined,
  cleanup:     (value: string | symbol) => void,
): void {
  const rootOptions = [
    { num: 1, value: 'frequency', label: 'Adjust advisory frequency' },
    { num: 2, value: 'role',      label: 'Configure role' },
    { num: 3, value: 'done',      label: 'Done!' },
  ];
  const menuLines = [
    pc.cyan('│'),
    `${pc.cyan('◆')}  ${pc.bold('What would you like to adjust?')}`,
    ...rootOptions.map((o) => `${pc.cyan('│')}  ${pc.green(`${o.num})`)} ${o.label}`),
    pc.cyan('│'),
  ];
  streams.output.write(menuLines.join('\n') + '\n');
  streams.output.write(`${pc.cyan('└')}  Select (1-3): `);

  iface.once('line', (answer) => {
    const num = parseInt(answer.trim(), 10);
    const choice = rootOptions.find((o) => o.num === num);
    // After adjusting frequency or role, loop back to this chooser so the user
    // can adjust the other one too; "Done!" (or an invalid entry) closes.
    const backToHub = () => runCtrlTRootChooser(streams, iface, store, projectRoot, cleanup);
    if (choice?.value === 'frequency') {
      runFrequencySubMenu(streams, iface, store, projectRoot, backToHub);
      return;
    }
    if (choice?.value === 'role') {
      runRoleSubMenu(streams, iface, store, projectRoot, backToHub);
      return;
    }
    cleanup(SKIP_NOW);
  });
}

export function runFrequencySubMenu(
  streams:     TtyStreams,
  iface:       rl.Interface,
  store:       Store | undefined,
  projectRoot: string | undefined,
  onDone:      () => void,
): void {
  const currentFreq = readCurrentFreq(store, projectRoot);
  const freqOptions = [
    // Active popup options: simple High / Medium / Low labels.
    { num: 1, value: 'optimum',     label: 'High' },
    { num: 2, value: 'every_event', label: 'Medium' },
    { num: 3, value: 'major_only',  label: 'Low' },
    // The two entries below stay valid via the CLI (nexpath config set
    // advisory_frequency once_per_session / off) and are still honoured by
    // the gating logic — they are intentionally hidden from this menu.
    // { num: 4, value: 'once_per_session', label: 'Once per coding session' },
    // { num: 5, value: 'off',              label: 'Off — disable all advisories' },
  ];
  const menuLines = [
    pc.cyan('│'),
    `${pc.cyan('◆')}  ${pc.bold('Advisory frequency')}`,
    ...freqOptions.map((o) => {
      const suffix = o.value === currentFreq ? pc.dim(' (current)') : '';
      return `${pc.cyan('│')}  ${pc.green(`${o.num})`)} ${o.label}${suffix}`;
    }),
    pc.cyan('│'),
  ];
  streams.output.write(menuLines.join('\n') + '\n');
  streams.output.write(`${pc.cyan('└')}  Select (1-3): `);

  iface.once('line', (answer) => {
    const num = parseInt(answer.trim(), 10);
    const choice = freqOptions.find((o) => o.num === num);
    if (choice && store && projectRoot) {
      setConfig(store, `advisory_frequency:${projectRoot}`, choice.value);
      streams.output.write(
        `${pc.cyan('│')}  ${pc.dim(`Frequency set to: ${choice.label}`)}
${pc.cyan('│')}
`,
      );
    }
    onDone();
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

        // Ctrl+T → root chooser
        if (answer.charCodeAt(0) === 0x14) {
          runCtrlTRootChooser(streams, iface, store, projectRoot, cleanup);
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
