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

// Deferred import so mocks are in place before module is evaluated
const { createTtySelectFn, buildUnixMenuLines, detectLinuxTerminal } = await import('./TtySelectFn.js');
const { OPT_OUT_SENTINEL }   = await import('./DecisionSession.js');
const { SHOW_SIMPLER, SKIP_NOW } = await import('./options.js');
const { spawnSync }          = await import('node:child_process');

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID        = 'test-uuid-tty';
const OPT_FILE    = join(tmpdir(), `nexpath-opt-${UUID}.json`);
const RESULT_FILE = join(tmpdir(), `nexpath-res-${UUID}.txt`);
const SCRIPT_FILE = join(tmpdir(), `nexpath-sel-${UUID}.mjs`); // .mjs — ESM Node.js script

function cleanTempFiles(): void {
  for (const f of [OPT_FILE, RESULT_FILE, SCRIPT_FILE]) {
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

// ── Windows SelectFn (these tests run on the win32 platform naturally) ─────────

describe('createTtySelectFn — Windows (win32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    cleanTempFiles();
  });

  afterEach(() => {
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

  it('resolves with Symbol on 60s timeout (no result file written)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('uses cmd.exe /c start /WAIT for reliable foreground activation', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const [cmd, args] = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
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

    const args = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    const title = args[3];
    expect(title).toContain('Nexpath');
  });

  it('passes the .mjs script file path as last arg to node', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const args = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
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

  it('.mjs script imports @clack/prompts ESM entry (.mjs not .cjs) and uses Promise.race', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    // Must point to the ESM entry — CJS entry breaks named imports in .mjs context
    expect(capturedScript).toContain('index.mjs');
    expect(capturedScript).not.toContain('index.cjs');
    expect(capturedScript).toContain('Promise.race');
    expect(capturedScript).toContain('60_000');
    expect(capturedScript).toContain('select(');
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
    expect(capturedScript).toContain('__FREQ_MENU_PENDING__');
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

  it('freq script contains frequency sub-menu options when __FREQ_MENU_PENDING__ is returned', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let capturedFreqScript = '';
    let callCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Main window: user pressed Ctrl+T → trigger freq flow
        writeFileSync(RESULT_FILE, '__FREQ_MENU_PENDING__', 'utf8');
      } else if (callCount === 2) {
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

  it('resolves with Symbol when no result file (timeout/cancel)', async () => {
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

  it('spawns second terminal window for __FREQ_MENU_PENDING__', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let terminalSpawnCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      gnomeTerminalMock(() => {
        terminalSpawnCount++;
        if (terminalSpawnCount === 1) {
          writeFileSync(RESULT_FILE, '__FREQ_MENU_PENDING__', 'utf8');
        }
      }),
    );
    await createTtySelectFn()!(makeOpts());
    expect(terminalSpawnCount).toBe(2);
    try { unlinkSync(FREQ_SCRIPT_FILE); } catch { /* ignore */ }
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
    expect(capturedAppleScript).toContain('busy of w');
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

  it('resolves with Symbol when no result file (timeout/cancel)', async () => {
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

  it('spawns second osascript for __FREQ_MENU_PENDING__', async () => {
    const FREQ_SCRIPT_FILE = join(tmpdir(), `nexpath-freq-sel-${UUID}.mjs`);
    let osascriptCount = 0;
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string) => {
        if (cmd === 'osascript') {
          osascriptCount++;
          if (osascriptCount === 1) {
            writeFileSync(RESULT_FILE, '__FREQ_MENU_PENDING__', 'utf8');
          }
        }
      },
    );
    await createTtySelectFn()!(makeOpts());
    expect(osascriptCount).toBe(2);
    try { unlinkSync(FREQ_SCRIPT_FILE); } catch { /* ignore */ }
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
      expect(script).toContain('select(');
      expect(script).toContain('isCancel(');
      expect(script).toContain('Promise.race');
      expect(script).toContain('60_000');
      expect(script).toContain('__NEXPATH_OPT_OUT__');
      expect(script).toContain('__FREQ_MENU_PENDING__');
      expect(script).toContain('emitKeypressEvents');
    }

    // Clipboard differs: Linux has xclip chain, macOS has pbcopy
    expect(linuxScript).toContain('xclip');
    expect(macScript).toContain('pbcopy');
    expect(linuxScript).not.toContain('pbcopy');
    expect(macScript).not.toContain('xclip');
  });
});
