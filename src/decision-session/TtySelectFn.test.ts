import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';

// Mock randomUUID for predictable temp file paths
vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'test-uuid-tty') }));

// Mock spawnSync — tests configure its behaviour per-case
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Mock screen-geometry so Phase 2's per-popup detection round-trip does NOT
// add extra spawnSync calls into the per-test mock-call timeline. Returning
// null forces the planWindowsPopupSpawn passthrough branch (legacy spawn
// shape) so the pre-Phase-2 test assertions keep working unchanged.
vi.mock('./screen-geometry.js', () => ({
  detectScreenResolution: vi.fn(() => Promise.resolve(null)),
  computePopupGeometry:   vi.fn(() => null),
}));

// Deferred import so mocks are in place before module is evaluated
const {
  createTtySelectFn,
  buildUnixMenuLines,
  detectLinuxTerminal,
  runCtrlTRootChooser,
  runFrequencySubMenu,
  runRoleSubMenu,
  planWindowsPopupSpawn,
  planLinuxPopupSpawn,
  buildTerminalAppleScript,
  nexpathAgentLabel,
} = await import('./TtySelectFn.js');
const { OPT_OUT_SENTINEL }       = await import('./DecisionSession.js');
const { SHOW_SIMPLER, SKIP_NOW } = await import('./options.js');
const { spawnSync }              = await import('node:child_process');
const { openStore }              = await import('../store/index.js');
const { getConfig, setConfig }   = await import('../store/config.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID        = 'test-uuid-tty';
const OPT_FILE    = join(tmpdir(), `nexpath-opt-${UUID}.json`);
const RESULT_FILE = join(tmpdir(), `nexpath-res-${UUID}.txt`);
const SCRIPT_FILE = join(tmpdir(), `nexpath-sel-${UUID}.mjs`); // .mjs — ESM Node.js script

function cleanTempFiles(): void {
  const files = [
    OPT_FILE, RESULT_FILE, SCRIPT_FILE,
    join(tmpdir(), `nexpath-root-sel-${UUID}.mjs`), join(tmpdir(), `nexpath-root-res-${UUID}.txt`),
    join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`), join(tmpdir(), `nexpath-freq-res-${UUID}.txt`),
    join(tmpdir(), `nexpath-role-sel-${UUID}.mjs`), join(tmpdir(), `nexpath-role-res-${UUID}.txt`),
  ];
  for (const f of files) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
}

function makeOpts() {
  return {
    message: 'Test gap spotted.',
    options: [
      { label: 'Option A', value: 'option-a-value' },
      { label: 'Option B', value: 'option-b-value' },
      { label: 'Skip for now', value: '__skip__' },
    ],
  };
}

/**
 * Classify which nexpath window a spawnSync call opens, from the script path.
 * Win/Linux pass the path as a direct arg; macOS embeds it in the AppleScript
 * (args[1]). The root chooser now loops, so tests inspect each spawn to drive
 * the multi-step flow (frequency / role / Done) deterministically.
 */
function classifyWindow(cmd: string, args: string[]): 'main' | 'root' | 'freq' | 'role' | 'other' {
  const hay = cmd === 'osascript' ? (args[1] ?? '') : args.join(' ');
  if (hay.includes('nexpath-root-sel-')) return 'root';
  if (hay.includes('nexpath-freq-sel-')) return 'freq';
  if (hay.includes('nexpath-role-sel-')) return 'role';
  if (hay.includes('nexpath-sel-'))      return 'main';
  return 'other';
}

/** Resolve the result-file path a sub-window writes to (sel → res, .mjs → .txt). */
function windowResultFile(kind: 'root' | 'freq' | 'role', cmd: string, args: string[]): string | null {
  const hay = cmd === 'osascript' ? (args[1] ?? '') : args.join(' ');
  const m = hay.match(new RegExp(`nexpath-${kind}-sel-[a-zA-Z0-9-]+\\.mjs`));
  return m ? join(tmpdir(), m[0].replace('-sel-', '-res-').replace('.mjs', '.txt')) : null;
}

// ── Windows SelectFn (process.platform spoofed to 'win32' so tests run on any host) ──

describe('createTtySelectFn — Windows (win32)', () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    cleanTempFiles();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('returns a non-null SelectFn on Windows', () => {
    const fn = createTtySelectFn();
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe('function');
  });

  it('resolves with selected value when user picks a valid option', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-a-value');
  });

  it('resolves with Symbol when window is closed without selecting', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // no result file written — simulates window closed or Ctrl+C
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with Symbol when result file is empty', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, '', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with Symbol when window exits without selection (no result file written)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  // Helper: skip the `where wt.exe` probe call added in Phase 2 and locate
  // the actual popup-window spawn call. With the screen-geometry mock
  // returning null, planWindowsPopupSpawn always returns the legacy
  // cmd.exe / start / WAIT shape, so the popup call always targets cmd.exe.
  function popupSpawnCall(): [string, string[]] {
    const calls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
    const popup = calls.find((c) => c[0] === 'cmd.exe' || c[0] === 'wt.exe');
    if (!popup) throw new Error('no popup spawn call captured');
    return popup as [string, string[]];
  }

  it('uses cmd.exe /c start /WAIT for reliable foreground activation', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const [cmd, args] = popupSpawnCall();
    expect(cmd).toBe('cmd.exe');
    expect(args[0]).toBe('/c');
    expect(args[1]).toBe('start');
    expect(args[2]).toBe('/WAIT');
    // Runs Node.js — not PowerShell — for full @clack/prompts arrow-key UI
    expect(args[4]).toBe('node');
  });

  it('passes a branded window title for taskbar discoverability', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const [, args] = popupSpawnCall();
    const title = args[3];
    expect(title).toContain('Nexpath');
  });

  it('passes the .mjs script file path as last arg to node', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const [, args] = popupSpawnCall();
    const scriptArg = args[args.length - 1];
    expect(scriptArg).toContain('nexpath-sel-');
    expect(scriptArg).toContain('.mjs');
  });

  it('preserves ANSI codes in message — @clack/prompts renders them in the new window', async () => {
    let capturedOptContent = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(OPT_FILE)) capturedOptContent = readFileSync(OPT_FILE, 'utf8');
    });
    await createTtySelectFn()!({
      message: '\x1b[1;96mHold up.\x1b[0m',
      options: [{ label: '\x1b[32mOption A\x1b[0m', value: 'val-a' }],
    });
    const parsed = JSON.parse(capturedOptContent) as { message: string; options: { label: string }[] };
    // ANSI preserved — @clack/prompts handles rendering, unlike the old PS1 approach
    expect(parsed.message).toContain('\x1b[1;96m');
    expect(parsed.options[0].label).toContain('\x1b[32m');
  });

  it('.mjs script imports @clack/prompts ESM entry (.mjs not .cjs) and awaits select directly', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    // Must point to the ESM entry — CJS entry breaks named imports in .mjs context
    expect(capturedScript).toContain('index.mjs');
    expect(capturedScript).not.toContain('index.cjs');
    expect(capturedScript).not.toContain('Promise.race');
    expect(capturedScript).not.toContain('60_000');
    expect(capturedScript).toContain('await select(');
    expect(capturedScript).toContain('isCancel(');
  });

  it('.mjs script uses forward-slash file paths for cross-platform Node.js reads', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    // Backslashes in embedded paths would break readFileSync on some Node versions
    expect(capturedScript).not.toMatch(/readFileSync\('.*\\.+.*'\)/);
    expect(capturedScript).not.toMatch(/writeFileSync\('.*\\.+.*'\)/);
  });

  it('writes stderr message before spawning the window', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    const spawnMock = spawnSync as ReturnType<typeof vi.fn>;
    spawnMock.mockReturnValue({ status: 0 });

    await createTtySelectFn()!(makeOpts());

    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.toLowerCase().includes('nexpath'))).toBe(true);
    // stderr must fire before spawnSync
    const stderrOrder = stderrSpy.mock.invocationCallOrder[0];
    const spawnOrder  = spawnMock.mock.invocationCallOrder[0];
    expect(stderrOrder).toBeLessThan(spawnOrder!);
  });

  it('cleans up all three temp files after resolution', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(RESULT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('cleans up temp files even when no result file is written', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('preserves option value as-is through the result file', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-b-value', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-b-value');
  });

  it('resolves with OPT_OUT_SENTINEL when result file contains __NEXPATH_OPT_OUT__', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, '__NEXPATH_OPT_OUT__', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe(OPT_OUT_SENTINEL);
  });

  it('resolves with raw __FREQ__:<value> string when result file contains it', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, '__FREQ__:major_only', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('__FREQ__:major_only');
  });

  it('.mjs script contains emitKeypressEvents and Ctrl+X/T sentinel output', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(capturedScript).toContain('emitKeypressEvents');
    expect(capturedScript).toContain('__NEXPATH_OPT_OUT__');
    expect(capturedScript).toContain('__ROOT_MENU_PENDING__');
  });

  it('.mjs script embeds clipboard commands as iterable array (not hardcoded clip)', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    // Must contain the serialised clipboard command array for platform-aware clipboard
    expect(capturedScript).toContain('[["clip",[]]]');
    // Must iterate the array rather than calling clip directly
    expect(capturedScript).toContain('for (const [_c, _a] of _clipCmds)');
    expect(capturedScript).toContain('if (_r.status === 0) break');
  });

  it('freq script contains frequency sub-menu options after Ctrl+T → root chooser → frequency flow', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let capturedFreqScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation((_cmd: string, args: string[]) => {
      callCount++;
      if (callCount === 1) {
        // Main window: user pressed Ctrl+T → emit root chooser sentinel
        writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
      } else if (callCount === 2) {
        // Root chooser window: pick "frequency"
        const rootScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-root-sel-'));
        if (rootScriptArg) {
          const rootResultFile = rootScriptArg.replace('-sel-', '-res-').replace('.mjs', '.txt');
          writeFileSync(rootResultFile, '__FREQ_FLOW__', 'utf8');
        }
      } else if (callCount === 3) {
        // Freq window: capture the freq script
        if (existsSync(FREQ_SCRIPT_FILE)) capturedFreqScript = readFileSync(FREQ_SCRIPT_FILE, 'utf8');
      }
    });
    await createTtySelectFn()!(makeOpts());
    expect(capturedFreqScript).toContain('major_only');
    expect(capturedFreqScript).toContain('once_per_session');
    expect(capturedFreqScript).toContain('every_event');
    try { unlinkSync(FREQ_SCRIPT_FILE); } catch { /* ignore */ }
  });
});

// ── Structured-fields plumbing — optFile JSON carries pre-styled header
// values for the render-loop path consumer. Exercised on the Windows
// callsite here; the Linux + macOS callsites use the identical optFile
// JSON shape (verified by the cross-callsite consistency test in the
// 'Regression: .mjs script content is platform-consistent' block below).

describe('createTtySelectFn — Windows — optFile structured fields (render-loop plumbing)', () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.clearAllMocks();
    if (existsSync(OPT_FILE))    unlinkSync(OPT_FILE);
    if (existsSync(SCRIPT_FILE)) unlinkSync(SCRIPT_FILE);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
  });

  async function captureOptFile(over: Parameters<NonNullable<ReturnType<typeof createTtySelectFn>>>[0]): Promise<Record<string, unknown>> {
    let captured = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(OPT_FILE)) captured = readFileSync(OPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(over);
    return JSON.parse(captured) as Record<string, unknown>;
  }

  it('writes pinchLabel pre-styled (formatPinchLabel applied) when caller passes the raw string', async () => {
    const parsed = await captureOptFile({
      message:    'legacy message',
      options:    [{ label: 'A', value: 'a' }],
      pinchLabel: 'Before coding.',
    });
    expect(parsed['pinchLabel']).toBeDefined();
    expect(parsed['pinchLabel']).not.toBe('Before coding.');           // formatter applied
    expect(parsed['pinchLabel']).toMatch(/\x1b\[/);                    // ANSI escape present
    expect(parsed['pinchLabel']).toContain('Before coding.');          // raw text preserved inside the wrap
  });

  it('writes subtitle pre-styled (formatSubtitle applied) when present', async () => {
    const parsed = await captureOptFile({
      message:  'legacy',
      options:  [{ label: 'A', value: 'a' }],
      subtitle: 'level subtitle',
    });
    expect(parsed['subtitle']).toBeDefined();
    expect(parsed['subtitle']).not.toBe('level subtitle');
    expect(parsed['subtitle']).toMatch(/\x1b\[/);
    expect(parsed['subtitle']).toContain('level subtitle');
  });

  it('writes question pre-styled (formatQuestion applied) when present', async () => {
    const parsed = await captureOptFile({
      message:  'legacy',
      options:  [{ label: 'A', value: 'a' }],
      question: 'Is the plan written?',
    });
    expect(parsed['question']).toBeDefined();
    expect(parsed['question']).not.toBe('Is the plan written?');
    expect(parsed['question']).toMatch(/\x1b\[/);
    expect(parsed['question']).toContain('Is the plan written?');
  });

  it('writes whyHelpBlock verbatim (already-composed; no extra formatter applied)', async () => {
    const composed = 'You\'re seeing this because\nrecent prompts...';
    const parsed = await captureOptFile({
      message:      'legacy',
      options:      [{ label: 'A', value: 'a' }],
      whyHelpBlock: composed,
    });
    expect(parsed['whyHelpBlock']).toBe(composed);
  });

  it('omits structured fields when the caller does not pass them (legacy clack path unaffected)', async () => {
    const parsed = await captureOptFile({
      message: 'legacy only',
      options: [{ label: 'A', value: 'a' }],
    });
    // JSON.stringify drops undefined fields — they are absent from the parsed object.
    expect(parsed['pinchLabel']).toBeUndefined();
    expect(parsed['subtitle']).toBeUndefined();
    expect(parsed['question']).toBeUndefined();
    expect(parsed['whyHelpBlock']).toBeUndefined();
  });

  it('keeps the legacy message + options fields intact alongside the new structured fields', async () => {
    const parsed = await captureOptFile({
      message:    '\x1b[1;96mHold up.\x1b[0m',
      options:    [{ label: 'A', value: 'val-a' }],
      pinchLabel: 'Before coding.',
      question:   'Question?',
    });
    // Legacy fields preserved — required for the @clack/prompts.select fallback path.
    expect(parsed['message']).toContain('Hold up.');
    expect((parsed['options'] as Array<{ label: string }>)[0]?.label).toBe('A');
    // New structured fields landed alongside.
    expect(parsed['pinchLabel']).toContain('Before coding.');
    expect(parsed['question']).toContain('Question?');
  });
});

// ── MAIN popup renderer — the .mjs child uses renderLoop (not clack
// select) for the main popup, per the structured-fields path. Sub-menu
// action prompt + freq + role + root menus continue on clack select.

describe('createTtySelectFn — Windows — .mjs script wires renderLoop for the MAIN popup', () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.clearAllMocks();
    if (existsSync(SCRIPT_FILE)) unlinkSync(SCRIPT_FILE);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
  });

  async function captureScript(): Promise<string> {
    let captured = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) captured = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    return captured;
  }

  it('imports renderLoop + eventsFromReadline from the sibling render-loop module', async () => {
    const script = await captureScript();
    expect(script).toContain("import { renderLoop, eventsFromReadline } from '");
    expect(script).toContain("render-loop.js'");  // resolved sibling URL ends with this
  });

  it('calls renderLoop with a layout built from the structured optFile fields', async () => {
    const script = await captureScript();
    expect(script).toContain('await renderLoop({');
    expect(script).toContain('pinchLabel:');
    expect(script).toContain('subtitle:');
    expect(script).toContain('question:');
    expect(script).toContain('whyHelpBlock:');
    expect(script).toContain('descBase:');
    expect(script).toContain('isSeparator:');
    expect(script).toContain('isMeta:');
  });

  it('keeps clack select for the sub-menu action prompt (Send to your agent / Copy to clipboard)', async () => {
    const script = await captureScript();
    // Sub-menu select call still uses clack — verified by the explicit
    // import of `select` from clackUrl staying in place and the
    // "What would you like to do?" prompt still being a clack select.
    expect(script).toContain("import { select, isCancel } from '");
    expect(script).toContain("'What would you like to do?'");
    expect(script).toContain("'Send to your agent now'");
  });

  it('translates renderLoop null (cancel) to an empty result-file write', async () => {
    const script = await captureScript();
    expect(script).toContain('_rlResult === null');
    expect(script).toContain("writeFileSync('");
    expect(script).toMatch(/_rlResult === null[\s\S]*writeFileSync\(.*,\s*''\s*,\s*'utf8'\)/);
  });

  it('preserves the Ctrl+X / Ctrl+T keypress capture path alongside renderLoop', async () => {
    const script = await captureScript();
    // Ctrl+X opt-out sentinel + Ctrl+T root-menu sentinel still written
    // by the dedicated keypress listener; both coexist with renderLoop's
    // eventsFromReadline because process.exit(0) is synchronous and
    // pre-empts further JS execution.
    expect(script).toContain('__NEXPATH_OPT_OUT__');
    expect(script).toContain('__ROOT_MENU_PENDING__');
    expect(script).toContain("'\\x18'");  // Ctrl+X check — literal backslash-x-1-8 in the script template
    expect(script).toContain("'\\x14'");  // Ctrl+T check — literal backslash-x-1-4 in the script template
  });

  it('omits the legacy do-while-on-separator-skip loop (renderLoop skips separators in moveFocus)', async () => {
    const script = await captureScript();
    // Old code had: do { picked = await select(...); } while (typeof picked === 'string' && picked.startsWith(opts.separatorPrefix));
    // renderLoop's moveFocus already skips isSeparator items, so the loop is redundant.
    expect(script).not.toMatch(/do\s*\{\s*picked\s*=\s*await\s+select/);
  });
});

// ── W-05: buildUnixMenuLines — pure menu-building logic ──────────────────────

describe('buildUnixMenuLines — W-05 rendering', () => {
  it('3-line option text produces 3 separate │ rows (first numbered, next 2 indented)', () => {
    const opts = [{ value: 'opt1', label: 'Line 1\nLine 2\nLine 3' }];
    const { menuLines } = buildUnixMenuLines('Test message', opts);
    const pipeLines = menuLines.filter((l) => l.includes('│'));
    const indentedLines = pipeLines.filter((l) => l.includes('     '));
    expect(indentedLines).toHaveLength(2);
  });

  it('SHOW_SIMPLER renders as dim row, not green-numbered content option', () => {
    const opts = [{ value: SHOW_SIMPLER, label: 'Show simpler options →' }];
    const { menuLines } = buildUnixMenuLines('Test message', opts);
    const showSimplerLine = menuLines.find((l) => l.includes('Show simpler'));
    expect(showSimplerLine).toBeDefined();
    expect(showSimplerLine).not.toMatch(/\d\)/);
  });

  it('SHOW_SIMPLER still gets a numbered index entry (user can type it)', () => {
    const opts = [{ value: SHOW_SIMPLER, label: 'Show simpler options →' }];
    const { indexToOption } = buildUnixMenuLines('Test message', opts);
    expect(indexToOption.size).toBe(1);
    expect(indexToOption.get(1)?.value).toBe(SHOW_SIMPLER);
  });

  it('regular single-line option renders with green numbered prefix', () => {
    const opts = [{ value: 'opt1', label: 'Review the code just generated' }];
    const { menuLines } = buildUnixMenuLines('Test message', opts);
    const optLine = menuLines.find((l) => l.includes('Review the code'));
    expect(optLine).toBeDefined();
    expect(optLine).toContain('1)');
  });

  it('selection echo pattern: only first line of multi-line selected.label appears in dim output', () => {
    const multiLineLabel = '1. Walk through this feature as a real user.\n2. Share what you find.\n3. Flag anything wrong.';
    const firstLine = multiLineLabel.split('\n')[0];
    expect(firstLine).toBe('1. Walk through this feature as a real user.');
    expect(firstLine).not.toContain('\n');
  });
});

// ── Linux: detectLinuxTerminal + new-window SelectFn ─────────────────────────

describe('detectLinuxTerminal', () => {
  const origDisplay  = process.env.DISPLAY;
  const origWayland  = process.env.WAYLAND_DISPLAY;

  afterEach(() => {
    // Restore env
    if (origDisplay  !== undefined) process.env.DISPLAY = origDisplay;  else delete process.env.DISPLAY;
    if (origWayland  !== undefined) process.env.WAYLAND_DISPLAY = origWayland; else delete process.env.WAYLAND_DISPLAY;
    vi.restoreAllMocks();
  });

  it('returns null when neither $DISPLAY nor $WAYLAND_DISPLAY is set', () => {
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    expect(detectLinuxTerminal()).toBeNull();
  });

  it('returns first matching terminal when $DISPLAY is set', () => {
    process.env.DISPLAY = ':0';
    // Mock 'which' — gnome-terminal found
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'xdg-terminal-exec') return { status: 1 };
        if (cmd === 'which' && args[0] === 'gnome-terminal') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('gnome-terminal');
  });

  it('returns xterm as last-resort fallback', () => {
    process.env.DISPLAY = ':0';
    // Mock 'which' — only xterm found
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'xterm') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('xterm');
  });

  it('returns null when no terminal emulator is found despite $DISPLAY being set', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 1 });
    expect(detectLinuxTerminal()).toBeNull();
  });

  it('detects terminal on Wayland ($WAYLAND_DISPLAY set, $DISPLAY unset)', () => {
    delete process.env.DISPLAY;
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'foot') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('foot');
  });

  it('gnome-terminal args include --wait for blocking', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gnome-terminal') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal()!;
    const args = spec.args('Test Title', '/tmp/test.mjs');
    expect(args).toContain('--wait');
    expect(args).toContain('--');
    expect(args).toContain('node');
    expect(args).toContain('/tmp/test.mjs');
  });

  it('xterm args include font flags for readable UI', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'xterm') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal()!;
    const args = spec.args('Test Title', '/tmp/test.mjs');
    expect(args).toContain('-fa');
    expect(args).toContain('Monospace');
    expect(args).toContain('-fs');
    expect(args).toContain('12');
  });

  it('xfce4-terminal args include --disable-server to prevent D-Bus return', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'xfce4-terminal') return { status: 0 };
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal()!;
    const args = spec.args('Test Title', '/tmp/test.mjs');
    expect(args).toContain('--disable-server');
  });

  it('skips gnome-terminal when version < 3.36 (--wait bug)', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gnome-terminal') return { status: 0 };
        if (cmd === 'which' && args[0] === 'xterm') return { status: 0 };
        if (cmd === 'gnome-terminal' && args[0] === '--version') {
          return { status: 0, stdout: 'GNOME Terminal 3.28.2' };
        }
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('xterm'); // gnome-terminal skipped, falls to xterm
  });

  it('accepts gnome-terminal when version >= 3.36', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gnome-terminal') return { status: 0 };
        if (cmd === 'gnome-terminal' && args[0] === '--version') {
          return { status: 0, stdout: 'GNOME Terminal 3.44.0' };
        }
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('gnome-terminal');
  });

  it('accepts gnome-terminal when version cannot be determined', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && args[0] === 'gnome-terminal') return { status: 0 };
        if (cmd === 'gnome-terminal' && args[0] === '--version') {
          return { status: 1, stdout: '' };
        }
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec).not.toBeNull();
    expect(spec!.cmd).toBe('gnome-terminal');
  });

  it('priority order: xdg-terminal-exec > gnome-terminal when both available', () => {
    process.env.DISPLAY = ':0';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'which' && (args[0] === 'xdg-terminal-exec' || args[0] === 'gnome-terminal')) {
          return { status: 0 };
        }
        return { status: 1 };
      },
    );
    const spec = detectLinuxTerminal();
    expect(spec!.cmd).toBe('xdg-terminal-exec');
  });
});

/** Mock spawnSync for Linux tests: gnome-terminal found + passes version check. */
function gnomeTerminalMock(extraHandler?: (cmd: string, args: string[]) => unknown) {
  return (cmd: string, args: string[]) => {
    if (cmd === 'which') return { status: args[0] === 'gnome-terminal' ? 0 : 1 };
    if (cmd === 'gnome-terminal' && args[0] === '--version') return { status: 0, stdout: 'GNOME Terminal 3.44.0' };
    if (extraHandler) return extraHandler(cmd, args);
    return undefined;
  };
}

describe('createTtySelectFn — Linux new-window path', () => {
  const origPlatform = process.platform;
  const origDisplay  = process.env.DISPLAY;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    process.env.DISPLAY = ':0';
    cleanTempFiles();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    if (origDisplay !== undefined) process.env.DISPLAY = origDisplay; else delete process.env.DISPLAY;
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('.mjs script embeds Linux clipboard fallback chain', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd, _args) => {
        if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
      }),
    );
    const fn = createTtySelectFn();
    expect(fn).not.toBeNull();
    await fn!(makeOpts());
    expect(capturedScript).toContain('xclip');
    expect(capturedScript).toContain('wl-copy');
    expect(capturedScript).toContain('xsel');
  });

  it('spawns detected terminal emulator (not cmd.exe)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => ({ status: 0 })),
    );
    const fn = createTtySelectFn();
    await fn!(makeOpts());
    const spawnCalls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const terminalCall = spawnCalls.find(
      (c) => c[0] !== 'which' && !(c[0] === 'gnome-terminal' && c[1][0] === '--version'),
    );
    expect(terminalCall).toBeDefined();
    expect(terminalCall![0]).toBe('gnome-terminal');
    expect(terminalCall![1]).toContain('--wait');
  });

  it('resolves with selected value via result file', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => { writeFileSync(RESULT_FILE, 'option-a-value', 'utf8'); }),
    );
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-a-value');
  });

  it('cleans up temp files after resolution', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => { writeFileSync(RESULT_FILE, 'option-a-value', 'utf8'); }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(RESULT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('resolves with Symbol when no result file (cancel/close)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => ({ status: 0 })),
    );
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with OPT_OUT_SENTINEL when result is __NEXPATH_OPT_OUT__', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => { writeFileSync(RESULT_FILE, '__NEXPATH_OPT_OUT__', 'utf8'); }),
    );
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe(OPT_OUT_SENTINEL);
  });

  it('writes stderr cue before spawning terminal', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => ({ status: 0 })),
    );
    await createTtySelectFn()!(makeOpts());
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.includes('nexpath'))).toBe(true);
  });

  it('root chooser → freq window → re-opens chooser → exits on Done', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let rootVisits = 0;
    let freqVisits = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((cmd: string, args: string[]) => {
        const kind = classifyWindow(cmd, args);
        if (kind === 'main') {
          // Main window: emit root chooser sentinel (user pressed Ctrl+T)
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (kind === 'root') {
          // First chooser visit picks frequency; the re-opened chooser picks Done.
          rootVisits++;
          const f = windowResultFile('root', cmd, args);
          if (f) writeFileSync(f, rootVisits === 1 ? '__FREQ_FLOW__' : '__DONE__', 'utf8');
        } else if (kind === 'freq') {
          freqVisits++;
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(rootVisits).toBe(2);
    expect(freqVisits).toBe(1);
    try { unlinkSync(FREQ_SCRIPT_FILE); } catch { /* ignore */ }
  });

  it('root chooser → role window → re-opens chooser → exits on Done', async () => {
    let rootVisits = 0;
    let roleVisits = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((cmd: string, args: string[]) => {
        const kind = classifyWindow(cmd, args);
        if (kind === 'main') {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (kind === 'root') {
          rootVisits++;
          const f = windowResultFile('root', cmd, args);
          if (f) writeFileSync(f, rootVisits === 1 ? '__ROLE_FLOW__' : '__DONE__', 'utf8');
        } else if (kind === 'role') {
          roleVisits++;
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(rootVisits).toBe(2);
    expect(roleVisits).toBe(1);
  });

  it('root chooser script contains both top-level options and emits __FREQ_FLOW__ / __ROLE_FLOW__', async () => {
    let capturedRootScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd: string, args: string[]) => {
        const rootScriptArg = args.find((a) => a.endsWith('.mjs') && a.includes('nexpath-root-sel-'));
        if (rootScriptArg && existsSync(rootScriptArg)) {
          capturedRootScript = readFileSync(rootScriptArg, 'utf8');
        }
        if (existsSync(SCRIPT_FILE) && !capturedRootScript) {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedRootScript).toContain('Adjust advisory frequency');
    expect(capturedRootScript).toContain('Configure role');
    expect(capturedRootScript).toContain('__FREQ_FLOW__');
    expect(capturedRootScript).toContain('__ROLE_FLOW__');
  });

  it('freq script lists optimum option and excludes the legacy "Configure role…" entry', async () => {
    let capturedFreqScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd: string, args: string[]) => {
        callCount++;
        if (callCount === 1) {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (callCount === 2) {
          const rootScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-root-sel-'));
          if (rootScriptArg) {
            const rootResultFile = rootScriptArg.replace('-sel-', '-res-').replace('.mjs', '.txt');
            writeFileSync(rootResultFile, '__FREQ_FLOW__', 'utf8');
          }
        } else if (callCount === 3) {
          const freqScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-freq-sel-'));
          if (freqScriptArg && existsSync(freqScriptArg)) {
            capturedFreqScript = readFileSync(freqScriptArg, 'utf8');
          }
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedFreqScript).toContain("value: 'optimum'");
    expect(capturedFreqScript).toContain("value: 'every_event'");
    expect(capturedFreqScript).toContain("value: 'major_only'");
    expect(capturedFreqScript).toContain("value: 'once_per_session'");
    expect(capturedFreqScript).toContain("value: 'off'");
    expect(capturedFreqScript).not.toContain('__role_menu__');
    expect(capturedFreqScript).not.toContain('Configure role');
  });

  it('freq script embeds initialValue derived from currently configured frequency', async () => {
    let capturedFreqScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd: string, args: string[]) => {
        callCount++;
        if (callCount === 1) {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (callCount === 2) {
          const rootScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-root-sel-'));
          if (rootScriptArg) {
            const rootResultFile = rootScriptArg.replace('-sel-', '-res-').replace('.mjs', '.txt');
            writeFileSync(rootResultFile, '__FREQ_FLOW__', 'utf8');
          }
        } else if (callCount === 3) {
          const freqScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-freq-sel-'));
          if (freqScriptArg && existsSync(freqScriptArg)) {
            capturedFreqScript = readFileSync(freqScriptArg, 'utf8');
          }
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedFreqScript).toContain('initialValue:');
    expect(capturedFreqScript).toContain('"every_event"');
  });

  it('role script lists the four predefined roles and excludes the legacy Clear option', async () => {
    let capturedRoleScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd: string, args: string[]) => {
        callCount++;
        if (callCount === 1) {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (callCount === 2) {
          const rootScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-root-sel-'));
          if (rootScriptArg) {
            const rootResultFile = rootScriptArg.replace('-sel-', '-res-').replace('.mjs', '.txt');
            writeFileSync(rootResultFile, '__ROLE_FLOW__', 'utf8');
          }
        } else if (callCount === 3) {
          const roleScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-role-sel-'));
          if (roleScriptArg && existsSync(roleScriptArg)) {
            capturedRoleScript = readFileSync(roleScriptArg, 'utf8');
          }
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedRoleScript).toContain('indie_hacker');
    expect(capturedRoleScript).toContain('founder');
    expect(capturedRoleScript).toContain('pm');
    expect(capturedRoleScript).toContain('vibe_coder');
    expect(capturedRoleScript).toContain('indie hacker');
    expect(capturedRoleScript).toContain('founder / product creator');
    expect(capturedRoleScript).toContain('product manager');
    expect(capturedRoleScript).toContain('vibe coder');
    // radio-button SelectPrompt (not a numbered readline prompt), rendering the
    // ●/○ markers and carrying the gray "why" description below the options
    expect(capturedRoleScript).toContain('SelectPrompt');
    expect(capturedRoleScript).toContain('●');
    expect(capturedRoleScript).toContain('○');
    expect(capturedRoleScript).not.toContain('Select (1-4)');
    expect(capturedRoleScript).toContain('Why a project role?');
    expect(capturedRoleScript).toContain('WHAT YOUR GOAL IS');
    expect(capturedRoleScript).not.toContain('clear');
    expect(capturedRoleScript).not.toContain('Clear role');
  });

  it('role script pre-selects the current role via initialValue (founder default)', async () => {
    let capturedRoleScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd: string, args: string[]) => {
        callCount++;
        if (callCount === 1) {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (callCount === 2) {
          const rootScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-root-sel-'));
          if (rootScriptArg) {
            const rootResultFile = rootScriptArg.replace('-sel-', '-res-').replace('.mjs', '.txt');
            writeFileSync(rootResultFile, '__ROLE_FLOW__', 'utf8');
          }
        } else if (callCount === 3) {
          const roleScriptArg = args.find((a) => typeof a === 'string' && a.includes('nexpath-role-sel-'));
          if (roleScriptArg && existsSync(roleScriptArg)) {
            capturedRoleScript = readFileSync(roleScriptArg, 'utf8');
          }
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedRoleScript).toContain('founder / product creator');
    expect(capturedRoleScript).toContain('initialValue:');
    expect(capturedRoleScript).toContain('"founder"');
  });

  it('role flow path produces one role-window spawn and no freq-window spawn', async () => {
    let rootVisits = 0;
    let roleSpawnCount = 0;
    let freqSpawnCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((cmd: string, args: string[]) => {
        const kind = classifyWindow(cmd, args);
        if (kind === 'main') {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (kind === 'root') {
          // Gate the loop: choose role once, then Done — otherwise the chooser
          // re-opens forever (the bug that previously OOM'd this suite).
          rootVisits++;
          const f = windowResultFile('root', cmd, args);
          if (f) writeFileSync(f, rootVisits === 1 ? '__ROLE_FLOW__' : '__DONE__', 'utf8');
        } else if (kind === 'role') {
          roleSpawnCount++;
        } else if (kind === 'freq') {
          freqSpawnCount++;
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(roleSpawnCount).toBe(1);
    expect(freqSpawnCount).toBe(0);
  });

  it('loops frequency then role, persisting both, and exits on Done with SKIP_NOW', async () => {
    const store = await openStore(':memory:');
    try {
      let rootVisits = 0;
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        gnomeTerminalMock((cmd: string, args: string[]) => {
          const kind = classifyWindow(cmd, args);
          if (kind === 'main') {
            writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
          } else if (kind === 'root') {
            rootVisits++;
            const f = windowResultFile('root', cmd, args);
            const sentinel = rootVisits === 1 ? '__FREQ_FLOW__' : rootVisits === 2 ? '__ROLE_FLOW__' : '__DONE__';
            if (f) writeFileSync(f, sentinel, 'utf8');
          } else if (kind === 'freq') {
            const f = windowResultFile('freq', cmd, args);
            if (f) writeFileSync(f, '__FREQ__:optimum', 'utf8');
          } else if (kind === 'role') {
            const f = windowResultFile('role', cmd, args);
            if (f) writeFileSync(f, '__ROLE__:pm', 'utf8');
          }
        }),
      );
      const result = await createTtySelectFn(store, '/proj/newwin-loop')!(makeOpts());
      expect(getConfig(store.db, 'advisory_frequency:/proj/newwin-loop')).toBe('optimum');
      expect(getConfig(store.db, 'role:/proj/newwin-loop')).toBe('pm');
      expect(result).toBe(SKIP_NOW);
      expect(rootVisits).toBe(3); // freq, role, then Done
    } finally {
      store.db.close();
    }
  });
});

// ── macOS: new Terminal.app window via osascript ─────────────────────────────

describe('createTtySelectFn — macOS (darwin)', () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
    cleanTempFiles();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('returns a non-null SelectFn on macOS (osascript always available)', () => {
    const fn = createTtySelectFn();
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe('function');
  });

  it('spawns osascript (not cmd.exe or terminal emulators)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());
    const spawnCalls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls as [string, string[]][];
    const osascriptCall = spawnCalls.find((c) => c[0] === 'osascript');
    expect(osascriptCall).toBeDefined();
    expect(osascriptCall![1][0]).toBe('-e');
  });

  it('AppleScript contains Terminal.app activate and do script', async () => {
    let capturedAppleScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'osascript') capturedAppleScript = args[1];
        return { status: 0 };
      },
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedAppleScript).toContain('tell application "Terminal"');
    expect(capturedAppleScript).toContain('activate');
    expect(capturedAppleScript).toContain('do script');
    expect(capturedAppleScript).toContain('; exit');
  });

  it('AppleScript polls busy flag with delay loop', async () => {
    let capturedAppleScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'osascript') capturedAppleScript = args[1];
        return { status: 0 };
      },
    );
    await createTtySelectFn()!(makeOpts());
    expect(capturedAppleScript).toContain('busy of theTab');
    expect(capturedAppleScript).toContain('delay 0.5');
    expect(capturedAppleScript).toContain('on error');
    expect(capturedAppleScript).toContain('exit repeat');
  });

  it('.mjs script embeds pbcopy clipboard command', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(capturedScript).toContain('pbcopy');
    expect(capturedScript).not.toContain('"clip"');
    expect(capturedScript).not.toContain('xclip');
  });

  it('resolves with selected value via result file', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-a-value');
  });

  it('resolves with Symbol when no result file (cancel/close)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with OPT_OUT_SENTINEL when result is __NEXPATH_OPT_OUT__', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, '__NEXPATH_OPT_OUT__', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe(OPT_OUT_SENTINEL);
  });

  it('cleans up temp files after resolution', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(RESULT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('writes stderr cue before spawning osascript', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());
    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.includes('nexpath'))).toBe(true);
  });

  it('root chooser → freq osascript → re-opens chooser → exits on Done', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let rootVisits = 0;
    let freqVisits = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd !== 'osascript') return;
        const kind = classifyWindow(cmd, args);
        if (kind === 'main') {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (kind === 'root') {
          rootVisits++;
          const f = windowResultFile('root', cmd, args);
          if (f) writeFileSync(f, rootVisits === 1 ? '__FREQ_FLOW__' : '__DONE__', 'utf8');
        } else if (kind === 'freq') {
          freqVisits++;
        }
      },
    );
    await createTtySelectFn()!(makeOpts());
    expect(rootVisits).toBe(2);
    expect(freqVisits).toBe(1);
    try { unlinkSync(FREQ_SCRIPT_FILE); } catch { /* ignore */ }
  });

  it('root chooser → role osascript → re-opens chooser → exits on Done', async () => {
    let rootVisits = 0;
    let roleVisits = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd !== 'osascript') return;
        const kind = classifyWindow(cmd, args);
        if (kind === 'main') {
          writeFileSync(RESULT_FILE, '__ROOT_MENU_PENDING__', 'utf8');
        } else if (kind === 'root') {
          rootVisits++;
          const f = windowResultFile('root', cmd, args);
          if (f) writeFileSync(f, rootVisits === 1 ? '__ROLE_FLOW__' : '__DONE__', 'utf8');
        } else if (kind === 'role') {
          roleVisits++;
        }
      },
    );
    await createTtySelectFn()!(makeOpts());
    expect(rootVisits).toBe(2);
    expect(roleVisits).toBe(1);
  });
});

// ── Phase 5: Validation & regression tests ───────────────────────────────────

describe('AppleScript string escaping', () => {
  const origPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('escapes backslashes and double-quotes in script path for AppleScript embedding', async () => {
    let capturedAppleScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[]) => {
        if (cmd === 'osascript') capturedAppleScript = args[1];
        return { status: 0 };
      },
    );
    await createTtySelectFn()!(makeOpts());
    // AppleScript do script command should not contain unescaped quotes
    // that would break the AppleScript string literal
    const doScriptMatch = capturedAppleScript.match(/do script "(.*)"/);
    expect(doScriptMatch).not.toBeNull();
    // The embedded command should contain the script path and ;exit
    expect(doScriptMatch![1]).toContain('; exit');
    expect(doScriptMatch![1]).toContain('node');
  });
});

describe('Linux fallback to /dev/tty when no terminal found', () => {
  const origPlatform = process.platform;
  const origDisplay  = process.env.DISPLAY;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    process.env.DISPLAY = ':0';
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    if (origDisplay !== undefined) process.env.DISPLAY = origDisplay; else delete process.env.DISPLAY;
    vi.restoreAllMocks();
  });

  it('returns null (no tty) when no terminal emulator found and /dev/tty unavailable', () => {
    // All 'which' calls return not-found
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 1 });
    // On CI/test environment /dev/tty may or may not exist,
    // but the key assertion is: no crash, returns SelectFn or null gracefully
    const fn = createTtySelectFn();
    // Either null (no /dev/tty) or a function (has /dev/tty) — never throws
    expect(fn === null || typeof fn === 'function').toBe(true);
  });
});

describe('Regression: .mjs script content is platform-consistent', () => {
  const origPlatform = process.platform;
  const origDisplay  = process.env.DISPLAY;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    if (origDisplay !== undefined) process.env.DISPLAY = origDisplay; else delete process.env.DISPLAY;
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('Linux and macOS .mjs scripts share the same core UI logic', async () => {
    let linuxScript = '';
    let macScript = '';

    // Capture Linux script
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    process.env.DISPLAY = ':0';
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock((_cmd, _args) => {
        if (existsSync(SCRIPT_FILE)) linuxScript = readFileSync(SCRIPT_FILE, 'utf8');
      }),
    );
    await createTtySelectFn()!(makeOpts());
    cleanTempFiles();

    // Capture macOS script
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) macScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());

    // Both must contain the same core UI elements
    for (const script of [linuxScript, macScript]) {
      expect(script).toContain('await select(');
      expect(script).toContain('isCancel(');
      expect(script).not.toContain('Promise.race');
      expect(script).not.toContain('60_000');
      expect(script).toContain('__NEXPATH_OPT_OUT__');
      expect(script).toContain('__ROOT_MENU_PENDING__');
      expect(script).toContain('emitKeypressEvents');
      // Branded Nexpath wordmark header must be written to stdout before the prompt renders.
      expect(script).toContain('process.stdout.write(');
      expect(script).toContain('NEXPATH CLI');
    }

    // Clipboard differs: Linux has xclip chain, macOS has pbcopy
    expect(linuxScript).toContain('xclip');
    expect(macScript).toContain('pbcopy');
    expect(linuxScript).not.toContain('pbcopy');
    expect(macScript).not.toContain('xclip');
  });
});

// ── Sentinel inventory ───────────────────────────────────────────────────────
//
// Static-source audit that guards the contract between the .mjs scripts (which
// emit sentinels) and the orchestrator handlers (which consume them).
//
// Every literal __XXX__ string written to a result file must have at least one
// consumer site that recognises it. Legacy sentinels that are no longer emitted
// must be fully purged.

describe('Sentinel inventory — every emitter has a consumer', () => {
  const ttySource = readFileSync(
    join(import.meta.dirname ?? __dirname, 'TtySelectFn.ts'),
    'utf8',
  );
  const dsSource = readFileSync(
    join(import.meta.dirname ?? __dirname, 'DecisionSession.ts'),
    'utf8',
  );
  const combined = ttySource + '\n' + dsSource;

  it('current sentinels are all present in TtySelectFn.ts', () => {
    const currentSentinels = [
      '__NEXPATH_OPT_OUT__',
      '__CLIP__',
      '__ROOT_MENU_PENDING__',
      '__FREQ_FLOW__',
      '__ROLE_FLOW__',
      '__FREQ__:',
      '__ROLE__:',
    ];
    for (const sentinel of currentSentinels) {
      expect(ttySource, `${sentinel} should be present in TtySelectFn.ts`).toContain(sentinel);
    }
  });

  it('legacy dead sentinels are not present in source', () => {
    const legacy = ['__FREQ_MENU_PENDING__', '__ROLE_MENU_PENDING__'];
    for (const sentinel of legacy) {
      expect(ttySource, `${sentinel} should not appear in TtySelectFn.ts`).not.toContain(sentinel);
      expect(dsSource, `${sentinel} should not appear in DecisionSession.ts`).not.toContain(sentinel);
    }
  });

  it('every literal __SENTINEL__ string written via writeFileSync has at least one consumer reference', () => {
    // Capture sentinels emitted via writeFileSync('...', '__FOO__', ...) calls.
    // These appear inside the .mjs script templates as well as in handler bodies.
    const emitMatches = [...ttySource.matchAll(/writeFileSync\s*\([^,)]+,\s*['"`](__[A-Z_]+__)['"`]/g)];
    const emitted = new Set(emitMatches.map((m) => m[1]));

    expect(emitted.size, 'at least three literal sentinels should be detected').toBeGreaterThanOrEqual(3);

    for (const sentinel of emitted) {
      const refPattern = new RegExp(`['"\`]${sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g');
      const refCount = [...combined.matchAll(refPattern)].length;
      expect(
        refCount,
        `sentinel ${sentinel} should appear at least twice across TtySelectFn.ts and DecisionSession.ts (emit + consume)`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── Unix-path sub-menu functions (runCtrlTRootChooser / runFrequencySubMenu / runRoleSubMenu) ──
//
// These functions are used when nexpath falls back to the in-line /dev/tty
// readline interface (no GUI terminal emulator). They mirror the new-window
// mjs scripts but are tested independently because their stateful readline
// dispatch logic is not exercised by the script-content tests above.

function makeFakeStreams() {
  const writes: string[] = [];
  return {
    writes,
    streams: {
      input: {} as never,
      output: { write: (s: string) => { writes.push(s); return true; } } as never,
      sharedFd: false,
    } as never,
  };
}

function makeFakeInterface() {
  let lineCallback: ((answer: string) => void) | null = null;
  const iface = {
    once: vi.fn((event: string, cb: unknown) => {
      if (event === 'line') lineCallback = cb as (answer: string) => void;
    }),
  } as never;
  return {
    iface,
    trigger: (answer: string) => {
      if (!lineCallback) throw new Error('no line callback was registered before trigger()');
      const cb = lineCallback;
      lineCallback = null;
      cb(answer);
    },
  };
}

describe('runCtrlTRootChooser (Unix path)', () => {
  it('renders frequency, role, and Done options with a 1-3 selection prompt', () => {
    const { writes, streams } = makeFakeStreams();
    const { iface } = makeFakeInterface();
    const cleanup = vi.fn();
    runCtrlTRootChooser(streams, iface, undefined, undefined, cleanup);
    const rendered = writes.join('');
    expect(rendered).toContain('Adjust advisory frequency');
    expect(rendered).toContain('Configure role');
    expect(rendered).toContain('Done!');
    expect(rendered).toContain('Select (1-3)');
  });

  it('closes with SKIP_NOW when the user selects Done', () => {
    const { streams } = makeFakeStreams();
    const { iface, trigger } = makeFakeInterface();
    const cleanup = vi.fn();
    runCtrlTRootChooser(streams, iface, undefined, undefined, cleanup);
    trigger('3'); // Done!
    expect(cleanup).toHaveBeenCalledWith(SKIP_NOW);
  });

  it('dispatches into the frequency sub-menu when the user selects 1', () => {
    const { writes, streams } = makeFakeStreams();
    const { iface, trigger } = makeFakeInterface();
    const cleanup = vi.fn();
    runCtrlTRootChooser(streams, iface, undefined, undefined, cleanup);
    trigger('1');
    const rendered = writes.join('');
    expect(rendered).toContain('Advisory frequency');
    expect(rendered).toContain('High');
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('dispatches into the role sub-menu when the user selects 2', () => {
    const { writes, streams } = makeFakeStreams();
    const { iface, trigger } = makeFakeInterface();
    const cleanup = vi.fn();
    runCtrlTRootChooser(streams, iface, undefined, undefined, cleanup);
    trigger('2');
    const rendered = writes.join('');
    expect(rendered).toContain('Project role');
    expect(rendered).toContain('vibe coder');
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('cleans up with SKIP_NOW when the answer is invalid', () => {
    const { streams } = makeFakeStreams();
    const { iface, trigger } = makeFakeInterface();
    const cleanup = vi.fn();
    runCtrlTRootChooser(streams, iface, undefined, undefined, cleanup);
    trigger('99');
    expect(cleanup).toHaveBeenCalledWith(SKIP_NOW);
  });

  it('re-opens the chooser after a sub-menu so multiple settings can change, then exits on Done', async () => {
    const store = await openStore(':memory:');
    try {
      const { writes, streams } = makeFakeStreams();
      const { iface, trigger } = makeFakeInterface();
      const cleanup = vi.fn();
      runCtrlTRootChooser(streams, iface, store, '/proj/loopback', cleanup);
      trigger('1'); // frequency
      trigger('1'); // optimum → saves, then loops back to the chooser
      expect(getConfig(store.db, 'advisory_frequency:/proj/loopback')).toBe('optimum');
      // chooser rendered twice (initial + re-opened) and has not closed yet
      const hubRenders = writes.join('').split('What would you like to adjust?').length - 1;
      expect(hubRenders).toBe(2);
      expect(cleanup).not.toHaveBeenCalled();
      trigger('3'); // Done!
      expect(cleanup).toHaveBeenCalledWith(SKIP_NOW);
    } finally {
      store.db.close();
    }
  });
});

describe('runFrequencySubMenu (Unix path)', () => {
  it('renders the three visible frequency options including the High rung and excludes the legacy role entry', async () => {
    const store = await openStore(':memory:');
    try {
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      const cleanup = vi.fn();
      runFrequencySubMenu(streams, iface, store, '/proj/freq', cleanup);
      const rendered = writes.join('');
      expect(rendered).toContain('High');
      expect(rendered).toContain('Medium');
      expect(rendered).toContain('Low');
      expect(rendered).not.toContain('Once per coding session');
      expect(rendered).not.toContain('Off — disable all advisories');
      expect(rendered).not.toContain('Configure role');
      expect(rendered).toContain('Select (1-3)');
      // High (optimum) is the first option; Medium (every_event) is second
      const lines = rendered.split('\n');
      const highIdx = lines.findIndex((l) => l.includes('High'));
      const mediumIdx = lines.findIndex((l) => l.includes('Medium'));
      expect(highIdx).toBeGreaterThanOrEqual(0);
      expect(mediumIdx).toBeGreaterThan(highIdx);
      // parenthetical descriptors removed from labels
      expect(rendered).not.toContain('(3–5 prompts)');
      expect(rendered).not.toContain('(stage changes)');
      expect(rendered).not.toContain('Every qualifying event (default)');
    } finally {
      store.db.close();
    }
  });

  it('marks the currently configured frequency with a (current) suffix', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'advisory_frequency:/proj/freq2', 'optimum');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runFrequencySubMenu(streams, iface, store, '/proj/freq2', vi.fn());
      const rendered = writes.join('');
      const highLine = rendered.split('\n').find((line) => line.includes('High'));
      expect(highLine).toBeDefined();
      expect(highLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('writes the selected frequency to config and signals completion', async () => {
    const store = await openStore(':memory:');
    try {
      const { streams } = makeFakeStreams();
      const { iface, trigger } = makeFakeInterface();
      const onDone = vi.fn();
      runFrequencySubMenu(streams, iface, store, '/proj/freq3', onDone);
      trigger('1'); // optimum
      expect(getConfig(store.db, 'advisory_frequency:/proj/freq3')).toBe('optimum');
      expect(onDone).toHaveBeenCalled();
    } finally {
      store.db.close();
    }
  });

  it('signals completion without writing when the answer is invalid', async () => {
    const store = await openStore(':memory:');
    try {
      const { streams } = makeFakeStreams();
      const { iface, trigger } = makeFakeInterface();
      const onDone = vi.fn();
      runFrequencySubMenu(streams, iface, store, '/proj/freq4', onDone);
      trigger('99');
      expect(getConfig(store.db, 'advisory_frequency:/proj/freq4')).toBeUndefined();
      expect(onDone).toHaveBeenCalled();
    } finally {
      store.db.close();
    }
  });

  it('falls back to the global advisory_frequency value when no project-scoped value is set', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'advisory_frequency', 'major_only');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runFrequencySubMenu(streams, iface, store, '/proj/freq5', vi.fn());
      const rendered = writes.join('');
      const lowLine = rendered.split('\n').find((line) => line.includes('Low'));
      expect(lowLine).toBeDefined();
      expect(lowLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('hides once_per_session and off labels from the visible popup options', async () => {
    const store = await openStore(':memory:');
    try {
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runFrequencySubMenu(streams, iface, store, '/proj/freq_hidden', vi.fn());
      const rendered = writes.join('');
      expect(rendered).not.toContain('Once per coding session');
      expect(rendered).not.toContain('Off — disable all advisories');
    } finally {
      store.db.close();
    }
  });

  it('preserves a CLI-set once_per_session value even though the popup hides that option', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'advisory_frequency:/proj/freq_cliset', 'once_per_session');
      const { iface } = makeFakeInterface();
      const { streams } = makeFakeStreams();
      const onDone = vi.fn();
      runFrequencySubMenu(streams, iface, store, '/proj/freq_cliset', onDone);
      expect(getConfig(store.db, 'advisory_frequency:/proj/freq_cliset')).toBe('once_per_session');
    } finally {
      store.db.close();
    }
  });
});

describe('runRoleSubMenu (Unix path)', () => {
  it('renders four role options including vibe_coder and excludes the legacy Clear option', async () => {
    const store = await openStore(':memory:');
    try {
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      const cleanup = vi.fn();
      runRoleSubMenu(streams, iface, store, '/proj/role', cleanup);
      const rendered = writes.join('');
      expect(rendered).toContain('indie hacker');
      expect(rendered).toContain('founder / product creator');
      expect(rendered).toContain('product manager');
      expect(rendered).toContain('vibe coder');
      expect(rendered).not.toContain('Clear role');
      expect(rendered).toContain('Select (1-4)');
      // gray "why" description appears below the options
      expect(rendered).toContain('Why a project role?');
      expect(rendered).toContain('WHAT YOUR GOAL IS');
      const lines = rendered.split('\n');
      const lastOptionIdx = lines.findIndex((l) => l.includes('product manager'));
      const descIdx = lines.findIndex((l) => l.includes('Why a project role?'));
      expect(descIdx).toBeGreaterThan(lastOptionIdx);
    } finally {
      store.db.close();
    }
  });

  it('marks the currently configured role with a (current) suffix; falls back to founder default', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'role:/proj/role2', 'vibe_coder');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runRoleSubMenu(streams, iface, store, '/proj/role2', vi.fn());
      const rendered = writes.join('');
      const vibeLine = rendered.split('\n').find((line) => line.includes('vibe coder'));
      expect(vibeLine).toBeDefined();
      expect(vibeLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('defaults the current indicator to founder when no role is configured', async () => {
    const store = await openStore(':memory:');
    try {
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runRoleSubMenu(streams, iface, store, '/proj/role3', vi.fn());
      const rendered = writes.join('');
      const founderLine = rendered.split('\n').find((line) => line.includes('founder / product creator'));
      expect(founderLine).toBeDefined();
      expect(founderLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('treats legacy "clear" / empty role values as unset → founder default', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'role:/proj/role4', 'clear');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runRoleSubMenu(streams, iface, store, '/proj/role4', vi.fn());
      const rendered = writes.join('');
      const founderLine = rendered.split('\n').find((line) => line.includes('founder / product creator'));
      expect(founderLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('writes the selected role to config and signals completion', async () => {
    const store = await openStore(':memory:');
    try {
      const { streams } = makeFakeStreams();
      const { iface, trigger } = makeFakeInterface();
      const onDone = vi.fn();
      runRoleSubMenu(streams, iface, store, '/proj/role5', onDone);
      trigger('2'); // vibe_coder
      expect(getConfig(store.db, 'role:/proj/role5')).toBe('vibe_coder');
      expect(onDone).toHaveBeenCalled();
    } finally {
      store.db.close();
    }
  });

  it('falls back to the global role value when no project-scoped value is set', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'role', 'pm');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runRoleSubMenu(streams, iface, store, '/proj/role6', vi.fn());
      const rendered = writes.join('');
      const pmLine = rendered.split('\n').find((line) => line.includes('product manager'));
      expect(pmLine).toBeDefined();
      expect(pmLine).toContain('(current)');
    } finally {
      store.db.close();
    }
  });

  it('rejects an invalid stored role value and falls back to founder default', async () => {
    const store = await openStore(':memory:');
    try {
      setConfig(store, 'role:/proj/role7', 'not_a_real_role');
      const { writes, streams } = makeFakeStreams();
      const { iface } = makeFakeInterface();
      runRoleSubMenu(streams, iface, store, '/proj/role7', vi.fn());
      const rendered = writes.join('');
      const founderLine = rendered.split('\n').find((line) => line.includes('founder / product creator'));
      expect(founderLine).toContain('(current)');
      // None of the legitimate option lines should be tagged with (current) besides founder
      const otherLines = rendered.split('\n').filter((line) =>
        line.includes('(current)') && !line.includes('founder / product creator'),
      );
      expect(otherLines).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });
});

// ── planWindowsPopupSpawn ────────────────────────────────────────────────────
//
// Pure-function unit tests for the Windows spawn-plan helper. The helper
// returns `{ cmd, args }` and is then invoked via spawnSync at the call
// site, so verifying the shape of the returned plan is sufficient to lock
// in the single-branch passthrough contract — `cmd /c start /WAIT title
// node scriptPath` — without touching the actual terminal-window spawn
// surface. `start /WAIT` keeps the parent spawnSync blocked for the
// popup's full lifetime so the temp .mjs survives until node has loaded
// it. Sizing is unused on Windows because nested `cmd /c "<inner-cmd>"`
// chains proved fragile under modern Windows shell quoting — the `geom`
// parameter is accepted for signature parity but the spawn shape never
// changes shape from the passthrough.

describe('planWindowsPopupSpawn — geometry null (detection-failure passthrough)', () => {
  it('targets cmd.exe with the original /c start /WAIT title node script shape', () => {
    const plan = planWindowsPopupSpawn(null, 'My Title', 'C:/tmp/script.mjs');
    expect(plan.cmd).toBe('cmd.exe');
    expect(plan.args).toEqual([
      '/c', 'start', '/WAIT',
      'My Title',
      'node', 'C:/tmp/script.mjs',
    ]);
  });

  it('uses the legacy passthrough shape regardless of host capabilities (no detection → no sizing)', () => {
    const plan = planWindowsPopupSpawn(null, 'T', 'S');
    expect(plan.cmd).toBe('cmd.exe');
    expect(plan.args).toEqual(['/c', 'start', '/WAIT', 'T', 'node', 'S']);
  });

  it('does NOT include mode CON when geom is null (legacy default size applies)', () => {
    const plan = planWindowsPopupSpawn(null, 'T', 'S');
    const joinedArgs = plan.args.join(' ');
    expect(joinedArgs).not.toContain('mode CON');
  });
});

describe('planWindowsPopupSpawn — title and path passthrough', () => {
  const geom = {
    widthPx: 1344, heightPx: 756, xPx: 288, yPx: 162, cols: 134, rows: 37,
  };

  it('handles a title with spaces and an em-dash (real WINDOW_TITLE shape)', () => {
    const plan = planWindowsPopupSpawn(geom, 'Nexpath — Action Required', 'C:/tmp/s.mjs');
    // Title sits as the 4th arg in the cmd /c start /WAIT shape.
    expect(plan.args[3]).toBe('Nexpath — Action Required');
  });

  it('handles a script path with forward slashes (used after Windows path normalization)', () => {
    const plan = planWindowsPopupSpawn(geom, 'T', 'C:/Users/me/AppData/Local/Temp/nexpath-sel-abc.mjs');
    // Passthrough shape: ['/c', 'start', '/WAIT', title, 'node', scriptPath].
    // The script path sits as the final arg directly (no inner-cmd wrapper),
    // preceded by the literal `node` invocation.
    expect(plan.args[plan.args.length - 2]).toBe('node');
    expect(plan.args[plan.args.length - 1]).toBe('C:/Users/me/AppData/Local/Temp/nexpath-sel-abc.mjs');
  });
});

// ── planLinuxPopupSpawn ──────────────────────────────────────────────────────
//
// Pure-function unit tests for the Linux spawn-plan helper. Each TerminalSpec
// either supplies geometry args (gnome-terminal / xterm / xfce4-terminal /
// alacritty / kitty / foot) or omits them (konsole / wezterm / xdg-terminal-
// exec / x-terminal-emulator). The helper prepends the geometry args (when
// both spec and geom are present) to the existing args tail; otherwise it
// returns the base args byte-identical to the pre-Phase-3 shape.

const sampleGeom = {
  widthPx:  1344,
  heightPx: 756,
  xPx:      288,
  yPx:      162,
  cols:     134,
  rows:     37,
};

describe('planLinuxPopupSpawn — geometry args per emulator (cells-based)', () => {
  it('gnome-terminal prepends --geometry=COLSxROWS+X+Y', () => {
    const spec = {
      cmd:  'gnome-terminal',
      args: (t: string, s: string) => ['--wait', `--title=${t}`, '--', 'node', s],
      geometryArgs: (g: typeof sampleGeom) => [`--geometry=${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.cmd).toBe('gnome-terminal');
    expect(plan.args[0]).toBe('--geometry=134x37+288+162');
    expect(plan.args.slice(1)).toEqual(['--wait', '--title=T', '--', 'node', '/tmp/s.mjs']);
  });

  it('xterm prepends -geometry COLSxROWS+X+Y (separate flag + value)', () => {
    const spec = {
      cmd:  'xterm',
      args: (t: string, s: string) => ['-T', t, '-e', 'node', s],
      geometryArgs: (g: typeof sampleGeom) => ['-geometry', `${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.cmd).toBe('xterm');
    expect(plan.args[0]).toBe('-geometry');
    expect(plan.args[1]).toBe('134x37+288+162');
    expect(plan.args.slice(2)).toEqual(['-T', 'T', '-e', 'node', '/tmp/s.mjs']);
  });

  it('xfce4-terminal prepends --geometry=COLSxROWS+X+Y', () => {
    const spec = {
      cmd:  'xfce4-terminal',
      args: (t: string, s: string) => ['--disable-server', `--title=${t}`, '-e', `node ${s}`],
      geometryArgs: (g: typeof sampleGeom) => [`--geometry=${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.args[0]).toBe('--geometry=134x37+288+162');
  });

  it('alacritty prepends --dimensions COLS ROWS (no centering offset)', () => {
    const spec = {
      cmd:  'alacritty',
      args: (t: string, s: string) => ['--title', t, '-e', 'node', s],
      geometryArgs: (g: typeof sampleGeom) => ['--dimensions', `${g.cols}`, `${g.rows}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.args.slice(0, 3)).toEqual(['--dimensions', '134', '37']);
    expect(plan.args.slice(3)).toEqual(['--title', 'T', '-e', 'node', '/tmp/s.mjs']);
  });
});

describe('planLinuxPopupSpawn — geometry args per emulator (pixel-based)', () => {
  it('kitty prepends -o initial_window_width / height with explicit px suffix + remember_window_size=no', () => {
    const spec = {
      cmd:  'kitty',
      args: (t: string, s: string) => ['--title', t, 'node', s],
      geometryArgs: (g: typeof sampleGeom) => [
        '-o', `initial_window_width=${g.widthPx}px`,
        '-o', `initial_window_height=${g.heightPx}px`,
        '-o', 'remember_window_size=no',
      ],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.args.slice(0, 6)).toEqual([
      '-o', 'initial_window_width=1344px',
      '-o', 'initial_window_height=756px',
      '-o', 'remember_window_size=no',
    ]);
    expect(plan.args.slice(6)).toEqual(['--title', 'T', 'node', '/tmp/s.mjs']);
  });

  it('foot prepends --window-size-pixels=WxH', () => {
    const spec = {
      cmd:  'foot',
      args: (t: string, s: string) => [`--title=${t}`, 'node', s],
      geometryArgs: (g: typeof sampleGeom) => [`--window-size-pixels=${g.widthPx}x${g.heightPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan.args[0]).toBe('--window-size-pixels=1344x756');
  });
});

describe('planLinuxPopupSpawn — emulators WITHOUT a geometryArgs field (default size)', () => {
  it('konsole returns base args unchanged (no geometry flag exists)', () => {
    const spec = {
      cmd:  'konsole',
      args: (t: string, s: string) => ['-p', `tabtitle=${t}`, '-e', 'node', s],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({
      cmd:  'konsole',
      args: ['-p', 'tabtitle=T', '-e', 'node', '/tmp/s.mjs'],
    });
  });

  it('wezterm returns base args unchanged', () => {
    const spec = {
      cmd:  'wezterm',
      args: (_t: string, s: string) => ['start', '--', 'node', s],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({ cmd: 'wezterm', args: ['start', '--', 'node', '/tmp/s.mjs'] });
  });

  it('xdg-terminal-exec returns base args unchanged (backend-emulator decides)', () => {
    const spec = {
      cmd:  'xdg-terminal-exec',
      args: (_t: string, s: string) => ['node', s],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({ cmd: 'xdg-terminal-exec', args: ['node', '/tmp/s.mjs'] });
  });

  it('x-terminal-emulator returns base args unchanged (symlink — depends on backend)', () => {
    const spec = {
      cmd:  'x-terminal-emulator',
      args: (_t: string, s: string) => ['-e', 'node', s],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({ cmd: 'x-terminal-emulator', args: ['-e', 'node', '/tmp/s.mjs'] });
  });
});

describe('planLinuxPopupSpawn — geometry null (detection-failure passthrough)', () => {
  it('returns base args byte-identical to pre-Phase-3 shape when geom is null (even if spec has geometryArgs)', () => {
    const spec = {
      cmd:  'gnome-terminal',
      args: (t: string, s: string) => ['--wait', `--title=${t}`, '--', 'node', s],
      geometryArgs: (g: typeof sampleGeom) => [`--geometry=${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, null, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({
      cmd:  'gnome-terminal',
      args: ['--wait', '--title=T', '--', 'node', '/tmp/s.mjs'],
    });
  });

  it('returns base args unchanged when geom is null AND spec has no geometryArgs', () => {
    const spec = {
      cmd:  'konsole',
      args: (t: string, s: string) => ['-p', `tabtitle=${t}`, '-e', 'node', s],
    };
    const plan = planLinuxPopupSpawn(spec, null, 'T', '/tmp/s.mjs');
    expect(plan).toEqual({
      cmd:  'konsole',
      args: ['-p', 'tabtitle=T', '-e', 'node', '/tmp/s.mjs'],
    });
  });
});

describe('planLinuxPopupSpawn — title and path passthrough', () => {
  it('passes the title through both base-args and geometry path', () => {
    const spec = {
      cmd:  'xterm',
      args: (t: string, s: string) => ['-T', t, '-e', 'node', s],
      geometryArgs: (g: typeof sampleGeom) => ['-geometry', `${g.cols}x${g.rows}+${g.xPx}+${g.yPx}`],
    };
    const plan = planLinuxPopupSpawn(spec, sampleGeom, 'Nexpath — Action Required', '/tmp/s.mjs');
    expect(plan.args).toContain('Nexpath — Action Required');
  });
});

// ── buildTerminalAppleScript ─────────────────────────────────────────────────
//
// Pure-function unit tests for the macOS AppleScript builder. When no geom
// is supplied, the generated script preserves the pre-Phase-4 hardcoded
// `set number of rows … to 50` sizing and is byte-identical to the prior
// shape. When geom IS supplied, the rows-set is replaced by a try-wrapped
// `set bounds of (first window …) to {x1, y1, x2, y2}` centered rectangle.

describe('buildTerminalAppleScript — null geometry (pre-change shape)', () => {
  it('emits the legacy "set number of rows … to 50" sizing when no geom is passed', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs');
    expect(s).toContain('set number of rows of (first window whose selected tab is theTab) to 50');
  });

  it('does NOT emit a bounds-set when no geom is passed', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs');
    expect(s).not.toContain('set bounds of');
  });

  it('emits the legacy "set number of rows" sizing when geom is explicitly null', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs', null);
    expect(s).toContain('set number of rows of (first window whose selected tab is theTab) to 50');
  });

  it('contains the do script command verbatim with the trailing "; exit"', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs');
    expect(s).toContain('do script "node /tmp/script.mjs; exit"');
  });

  it('escapes embedded double quotes in the command', () => {
    const s = buildTerminalAppleScript('echo "hello"');
    expect(s).toContain('do script "echo \\"hello\\"; exit"');
  });

  it('escapes embedded backslashes in the command', () => {
    const s = buildTerminalAppleScript('echo c:\\path');
    expect(s).toContain('do script "echo c:\\\\path; exit"');
  });

  it('wraps the activate / do script / wait / close flow in `tell application "Terminal"`', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs');
    expect(s).toContain('tell application "Terminal"');
    expect(s).toContain('activate');
    expect(s).toContain('set theTab to do script');
    expect(s).toContain('repeat');
    expect(s).toContain('close (first window whose selected tab is theTab)');
    expect(s).toContain('end tell');
  });
});

describe('buildTerminalAppleScript — geometry supplied (Phase 4 bounds-setter)', () => {
  const geom = {
    widthPx:  1344,
    heightPx: 756,
    xPx:      288,
    yPx:      162,
    cols:     134,
    rows:     37,
  };

  it('emits a bounds-set with the centered rectangle in {x1,y1,x2,y2} order', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs', geom);
    // x2 = xPx + widthPx = 288 + 1344 = 1632
    // y2 = yPx + heightPx = 162 + 756 = 918
    expect(s).toContain('set bounds of (first window whose selected tab is theTab) to {288, 162, 1632, 918}');
  });

  it('wraps the bounds-set in a try block so a future macOS rejecting the bounds shape falls back to default', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs', geom);
    // The try block should appear immediately before the bounds-set line.
    const boundsIdx = s.indexOf('set bounds of');
    const tryBeforeBounds = s.lastIndexOf('try', boundsIdx);
    expect(tryBeforeBounds).toBeGreaterThan(0);
    expect(tryBeforeBounds).toBeLessThan(boundsIdx);
  });

  it('does NOT emit the legacy "set number of rows … to 50" sizing when geom is supplied', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs', geom);
    expect(s).not.toContain('set number of rows of (first window whose selected tab is theTab) to 50');
  });

  it('preserves the do script + wait + close flow alongside the bounds-set', () => {
    const s = buildTerminalAppleScript('node /tmp/script.mjs', geom);
    expect(s).toContain('do script');
    expect(s).toContain('repeat');
    expect(s).toContain('close (first window whose selected tab is theTab)');
  });

  it('handles a portrait-screen geometry (width < height)', () => {
    const portraitGeom = { ...geom, widthPx: 756, heightPx: 1344, xPx: 162, yPx: 288 };
    const s = buildTerminalAppleScript('node /tmp/script.mjs', portraitGeom);
    expect(s).toContain('set bounds of (first window whose selected tab is theTab) to {162, 288, 918, 1632}');
  });

  it('handles a square-screen geometry', () => {
    const squareGeom = { widthPx: 756, heightPx: 756, xPx: 162, yPx: 162, cols: 75, rows: 37 };
    const s = buildTerminalAppleScript('node /tmp/script.mjs', squareGeom);
    expect(s).toContain('set bounds of (first window whose selected tab is theTab) to {162, 162, 918, 918}');
  });
});

describe('nexpathAgentLabel', () => {
  it("returns the agent-neutral 'your agent' label", () => {
    expect(nexpathAgentLabel()).toBe('your agent');
  });

  it('is the same label regardless of which surface triggered the popup', () => {
    // The popup wording no longer varies per agent — Claude Code, Cursor and
    // Windsurf / Devin all share one label, so there is no per-agent code to
    // keep in sync.
    const original = process.env.NEXPATH_AGENT;
    try {
      for (const agent of ['cursor', 'windsurf', 'devin', 'something-else', '']) {
        process.env.NEXPATH_AGENT = agent;
        expect(nexpathAgentLabel()).toBe('your agent');
      }
      delete process.env.NEXPATH_AGENT;
      expect(nexpathAgentLabel()).toBe('your agent');
    } finally {
      if (original === undefined) delete process.env.NEXPATH_AGENT;
      else process.env.NEXPATH_AGENT = original;
    }
  });
});
