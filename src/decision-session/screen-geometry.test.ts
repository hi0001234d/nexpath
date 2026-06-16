import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CELL_WIDTH_PX,
  DEFAULT_CELL_HEIGHT_PX,
  ENV_CELL_HEIGHT,
  ENV_CELL_WIDTH,
  ENV_SCREEN_HEIGHT,
  ENV_SCREEN_WIDTH,
  FALLBACK_SCREEN_SIZE,
  POPUP_SIZE_RATIO,
  computePopupGeometry,
  detectScreenResolution,
  getEnvScreenOverride,
  parseDimensionsPattern,
  parseMacOsascriptOutput,
  parsePowerShellOutput,
  parseWmicOutput,
  parseXdpyinfoOutput,
  parseXrandrOutput,
} from './screen-geometry.js';

// ── Constants ────────────────────────────────────────────────────────────────

describe('screen-geometry — constants', () => {
  it('POPUP_SIZE_RATIO is 0.7 (locked 70% target)', () => {
    expect(POPUP_SIZE_RATIO).toBe(0.7);
  });

  it('DEFAULT_CELL_WIDTH_PX is a positive integer (conservative monospace default)', () => {
    expect(Number.isInteger(DEFAULT_CELL_WIDTH_PX)).toBe(true);
    expect(DEFAULT_CELL_WIDTH_PX).toBeGreaterThan(0);
  });

  it('DEFAULT_CELL_HEIGHT_PX is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_CELL_HEIGHT_PX)).toBe(true);
    expect(DEFAULT_CELL_HEIGHT_PX).toBeGreaterThan(0);
  });

  it('FALLBACK_SCREEN_SIZE is a sensible 16:9 default', () => {
    expect(FALLBACK_SCREEN_SIZE).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('env-var keys are namespaced under NEXPATH_', () => {
    expect(ENV_SCREEN_WIDTH ).toMatch(/^NEXPATH_/);
    expect(ENV_SCREEN_HEIGHT).toMatch(/^NEXPATH_/);
    expect(ENV_CELL_WIDTH   ).toMatch(/^NEXPATH_/);
    expect(ENV_CELL_HEIGHT  ).toMatch(/^NEXPATH_/);
  });
});

// ── parseDimensionsPattern ───────────────────────────────────────────────────

describe('screen-geometry — parseDimensionsPattern', () => {
  it('extracts width × height from a bare WxH pair', () => {
    expect(parseDimensionsPattern('1920x1080')).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('extracts dimensions from an xdpyinfo-style "dimensions: WxH pixels" line', () => {
    expect(parseDimensionsPattern('dimensions:    2560x1440 pixels (677x381 millimeters)'))
      .toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('returns the FIRST match when multiple WxH pairs are present', () => {
    expect(parseDimensionsPattern('foo 1920x1080 bar 800x600'))
      .toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('tolerates whitespace around the x separator', () => {
    expect(parseDimensionsPattern('1920 x 1080')).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('returns null when no WxH pair is present', () => {
    expect(parseDimensionsPattern('no dimensions here')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseDimensionsPattern('')).toBeNull();
  });

  it('rejects a zero or negative dimension match', () => {
    // The regex only matches digit runs (no leading minus), so a literal 0x0
    // would parse as widthPx=0 → null. Negative values cannot appear because
    // the regex requires bare \d+ tokens.
    expect(parseDimensionsPattern('0x0')).toBeNull();
  });
});

// ── Per-platform output parsers ──────────────────────────────────────────────

describe('screen-geometry — parsePowerShellOutput (Windows primary path)', () => {
  it('parses a two-line "Width\\nHeight" output', () => {
    expect(parsePowerShellOutput('1920\n1080')).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('tolerates Windows CRLF line endings', () => {
    expect(parsePowerShellOutput('2560\r\n1440\r\n')).toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('tolerates leading/trailing whitespace', () => {
    expect(parsePowerShellOutput('  1920  \n  1080  ')).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('returns null on single-line output', () => {
    expect(parsePowerShellOutput('1920')).toBeNull();
  });

  it('returns null when either value is non-numeric', () => {
    expect(parsePowerShellOutput('1920\nfoo')).toBeNull();
    expect(parsePowerShellOutput('foo\n1080')).toBeNull();
  });

  it('returns null when either value is zero or negative', () => {
    expect(parsePowerShellOutput('1920\n0' )).toBeNull();
    expect(parsePowerShellOutput('-1\n1080')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parsePowerShellOutput('')).toBeNull();
  });
});

describe('screen-geometry — parseWmicOutput (Windows fallback path)', () => {
  it('extracts width + height from the /format:list output', () => {
    const sample = '\r\nScreenHeight=1080\r\nScreenWidth=1920\r\n\r\n';
    expect(parseWmicOutput(sample)).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('handles a tightly-formatted single-line variant', () => {
    expect(parseWmicOutput('ScreenWidth=2560 ScreenHeight=1440')).toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('returns null when ScreenWidth is missing', () => {
    expect(parseWmicOutput('ScreenHeight=1080')).toBeNull();
  });

  it('returns null when ScreenHeight is missing', () => {
    expect(parseWmicOutput('ScreenWidth=1920')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseWmicOutput('')).toBeNull();
  });
});

describe('screen-geometry — parseMacOsascriptOutput (macOS primary path)', () => {
  it('parses a "W,H" pair', () => {
    expect(parseMacOsascriptOutput('1920,1080')).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('tolerates whitespace and trailing newlines', () => {
    expect(parseMacOsascriptOutput('  2560 , 1440  \n')).toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('returns null when only one value is present', () => {
    expect(parseMacOsascriptOutput('1920')).toBeNull();
  });

  it('returns null when either value is non-numeric', () => {
    expect(parseMacOsascriptOutput('foo,1080')).toBeNull();
    expect(parseMacOsascriptOutput('1920,bar')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseMacOsascriptOutput('')).toBeNull();
  });
});

describe('screen-geometry — parseXdpyinfoOutput (Linux X11 primary path)', () => {
  it('extracts dimensions from a realistic xdpyinfo line', () => {
    const sample =
      'name of display:    :0\n' +
      'version number:    11.0\n' +
      '...\n' +
      'dimensions:    1920x1080 pixels (508x285 millimeters)\n' +
      'resolution:    96x96 dots per inch\n';
    expect(parseXdpyinfoOutput(sample)).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('handles 4K dimensions', () => {
    expect(parseXdpyinfoOutput('dimensions:    3840x2160 pixels (foo)'))
      .toEqual({ widthPx: 3840, heightPx: 2160 });
  });

  it('returns null when the dimensions line is absent', () => {
    expect(parseXdpyinfoOutput('no dimensions here')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseXdpyinfoOutput('')).toBeNull();
  });
});

describe('screen-geometry — parseXrandrOutput (Linux X11 fallback path)', () => {
  it('extracts the primary monitor dimensions from a realistic xrandr block', () => {
    const sample =
      'Screen 0: minimum 320 x 200, current 1920 x 1080, maximum 16384 x 16384\n' +
      'eDP-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis) 309mm x 174mm\n' +
      '   1920x1080     60.02*+  59.97    59.96    59.93\n';
    expect(parseXrandrOutput(sample)).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('falls back to non-primary "connected" line when no primary marker is present', () => {
    const sample = 'HDMI-1 connected 2560x1440+0+0\n';
    expect(parseXrandrOutput(sample)).toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('picks the FIRST connected output when multiple are present', () => {
    const sample =
      'eDP-1 connected primary 1920x1080+0+0 …\n' +
      'HDMI-2 connected 3840x2160+1920+0 …\n';
    expect(parseXrandrOutput(sample)).toEqual({ widthPx: 1920, heightPx: 1080 });
  });

  it('returns null when no connected output line is present', () => {
    expect(parseXrandrOutput('Screen 0: minimum …\nHDMI-1 disconnected (…)')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseXrandrOutput('')).toBeNull();
  });
});

// ── computePopupGeometry — pure 70% calc ─────────────────────────────────────

describe('screen-geometry — computePopupGeometry — pixel math', () => {
  // Capture + restore env so cell-knob env-vars cannot leak between tests
  // in this suite. Each test sees the locked DEFAULT cell sizes.
  const savedW = process.env[ENV_CELL_WIDTH];
  const savedH = process.env[ENV_CELL_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_CELL_WIDTH];
    delete process.env[ENV_CELL_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_CELL_WIDTH];
    else                       process.env[ENV_CELL_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_CELL_HEIGHT];
    else                       process.env[ENV_CELL_HEIGHT] = savedH;
  });

  it('hits exact 70% on a 1920×1080 screen', () => {
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.widthPx ).toBe(1344);  // 0.7 × 1920
    expect(g.heightPx).toBe(756);   // 0.7 × 1080
  });

  it('hits exact 70% on a 2560×1440 screen', () => {
    const g = computePopupGeometry({ widthPx: 2560, heightPx: 1440 });
    expect(g.widthPx ).toBe(1792);
    expect(g.heightPx).toBe(1008);
  });

  it('hits exact 70% on a 1366×768 laptop screen', () => {
    const g = computePopupGeometry({ widthPx: 1366, heightPx: 768 });
    expect(g.widthPx ).toBe(Math.round(1366 * 0.7));   // 956
    expect(g.heightPx).toBe(Math.round(768  * 0.7));   // 538
  });

  it('handles a square 1080×1080 screen (aspect-ratio-agnostic)', () => {
    const g = computePopupGeometry({ widthPx: 1080, heightPx: 1080 });
    expect(g.widthPx ).toBe(756);
    expect(g.heightPx).toBe(756);
  });

  it('handles a portrait 1080×1920 screen (height > width)', () => {
    const g = computePopupGeometry({ widthPx: 1080, heightPx: 1920 });
    expect(g.widthPx ).toBe(756);
    expect(g.heightPx).toBe(1344);
  });

  it('handles an ultrawide 3440×1440 screen', () => {
    const g = computePopupGeometry({ widthPx: 3440, heightPx: 1440 });
    expect(g.widthPx ).toBe(Math.round(3440 * 0.7));   // 2408
    expect(g.heightPx).toBe(1008);
  });
});

describe('screen-geometry — computePopupGeometry — centering', () => {
  const savedW = process.env[ENV_CELL_WIDTH];
  const savedH = process.env[ENV_CELL_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_CELL_WIDTH];
    delete process.env[ENV_CELL_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_CELL_WIDTH];
    else                       process.env[ENV_CELL_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_CELL_HEIGHT];
    else                       process.env[ENV_CELL_HEIGHT] = savedH;
  });

  it('centers the popup on the screen (xPx + width/2 = screen/2)', () => {
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.xPx + g.widthPx  / 2).toBeCloseTo(1920 / 2, 0);
    expect(g.yPx + g.heightPx / 2).toBeCloseTo(1080 / 2, 0);
  });

  it('xPx equals 15% of screen width at a 70% popup width', () => {
    const g = computePopupGeometry({ widthPx: 2000, heightPx: 1000 });
    expect(g.xPx).toBe(Math.round((2000 - 1400) / 2));
    expect(g.yPx).toBe(Math.round((1000 - 700)  / 2));
  });

  it('produces non-negative origin even for tiny screens', () => {
    const g = computePopupGeometry({ widthPx: 100, heightPx: 100 });
    expect(g.xPx).toBeGreaterThanOrEqual(0);
    expect(g.yPx).toBeGreaterThanOrEqual(0);
  });
});

describe('screen-geometry — computePopupGeometry — cell conversion', () => {
  const savedW = process.env[ENV_CELL_WIDTH];
  const savedH = process.env[ENV_CELL_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_CELL_WIDTH];
    delete process.env[ENV_CELL_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_CELL_WIDTH];
    else                       process.env[ENV_CELL_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_CELL_HEIGHT];
    else                       process.env[ENV_CELL_HEIGHT] = savedH;
  });

  it('uses DEFAULT cell sizes when no env override is set', () => {
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.cols).toBe(Math.floor(1344 / DEFAULT_CELL_WIDTH_PX));
    expect(g.rows).toBe(Math.floor(756  / DEFAULT_CELL_HEIGHT_PX));
  });

  it('honours NEXPATH_CELL_WIDTH_PX override', () => {
    process.env[ENV_CELL_WIDTH] = '8';
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.cols).toBe(Math.floor(1344 / 8));
  });

  it('honours NEXPATH_CELL_HEIGHT_PX override', () => {
    process.env[ENV_CELL_HEIGHT] = '16';
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.rows).toBe(Math.floor(756 / 16));
  });

  it('falls back to default cell when env override is not a positive integer', () => {
    process.env[ENV_CELL_WIDTH ] = 'not-a-number';
    process.env[ENV_CELL_HEIGHT] = '-10';
    const g = computePopupGeometry({ widthPx: 1920, heightPx: 1080 });
    expect(g.cols).toBe(Math.floor(1344 / DEFAULT_CELL_WIDTH_PX));
    expect(g.rows).toBe(Math.floor(756  / DEFAULT_CELL_HEIGHT_PX));
  });

  it('clamps cols and rows to a minimum of 1 so a tiny screen still yields a 1×1 popup', () => {
    const g = computePopupGeometry({ widthPx: 5, heightPx: 5 });
    expect(g.cols).toBeGreaterThanOrEqual(1);
    expect(g.rows).toBeGreaterThanOrEqual(1);
  });
});

// ── Env-var overrides for screen size ────────────────────────────────────────

describe('screen-geometry — getEnvScreenOverride', () => {
  const savedW = process.env[ENV_SCREEN_WIDTH];
  const savedH = process.env[ENV_SCREEN_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_SCREEN_WIDTH];
    delete process.env[ENV_SCREEN_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_SCREEN_WIDTH];
    else                       process.env[ENV_SCREEN_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_SCREEN_HEIGHT];
    else                       process.env[ENV_SCREEN_HEIGHT] = savedH;
  });

  it('returns null when neither env var is set', () => {
    expect(getEnvScreenOverride()).toBeNull();
  });

  it('returns null when only width is set', () => {
    process.env[ENV_SCREEN_WIDTH] = '1920';
    expect(getEnvScreenOverride()).toBeNull();
  });

  it('returns null when only height is set', () => {
    process.env[ENV_SCREEN_HEIGHT] = '1080';
    expect(getEnvScreenOverride()).toBeNull();
  });

  it('returns the parsed ScreenSize when both vars are positive integers', () => {
    process.env[ENV_SCREEN_WIDTH ] = '2560';
    process.env[ENV_SCREEN_HEIGHT] = '1440';
    expect(getEnvScreenOverride()).toEqual({ widthPx: 2560, heightPx: 1440 });
  });

  it('returns null when either value is non-numeric', () => {
    process.env[ENV_SCREEN_WIDTH ] = 'foo';
    process.env[ENV_SCREEN_HEIGHT] = '1080';
    expect(getEnvScreenOverride()).toBeNull();
  });

  it('returns null when either value is 0 or negative', () => {
    process.env[ENV_SCREEN_WIDTH ] = '0';
    process.env[ENV_SCREEN_HEIGHT] = '1080';
    expect(getEnvScreenOverride()).toBeNull();
    process.env[ENV_SCREEN_WIDTH ] = '-10';
    expect(getEnvScreenOverride()).toBeNull();
  });
});

// ── detectScreenResolution platform dispatch ─────────────────────────────────

describe('screen-geometry — detectScreenResolution', () => {
  const savedW = process.env[ENV_SCREEN_WIDTH];
  const savedH = process.env[ENV_SCREEN_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_SCREEN_WIDTH];
    delete process.env[ENV_SCREEN_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_SCREEN_WIDTH];
    else                       process.env[ENV_SCREEN_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_SCREEN_HEIGHT];
    else                       process.env[ENV_SCREEN_HEIGHT] = savedH;
  });

  it('returns the env override when both NEXPATH_SCREEN_* vars are set (universal precedence)', async () => {
    process.env[ENV_SCREEN_WIDTH ] = '1234';
    process.env[ENV_SCREEN_HEIGHT] = '5678';
    expect(await detectScreenResolution()).toEqual({ widthPx: 1234, heightPx: 5678 });
  });

  it('never throws on any platform — always resolves to ScreenSize or null', async () => {
    // Regardless of CI / host environment, the call must NOT reject.
    await expect(detectScreenResolution()).resolves.not.toThrow();
  });

  it('returns a ScreenSize (when detection works) or null (when it fails) — never undefined', async () => {
    delete process.env[ENV_SCREEN_WIDTH];
    delete process.env[ENV_SCREEN_HEIGHT];
    const result = await detectScreenResolution();
    expect(result === null || (typeof result === 'object' && result.widthPx > 0 && result.heightPx > 0))
      .toBe(true);
  });
});

// ── Integration — geometry from env-override path ────────────────────────────

describe('screen-geometry — integration: env override → computePopupGeometry', () => {
  const savedW = process.env[ENV_SCREEN_WIDTH];
  const savedH = process.env[ENV_SCREEN_HEIGHT];
  beforeEach(() => {
    delete process.env[ENV_SCREEN_WIDTH];
    delete process.env[ENV_SCREEN_HEIGHT];
  });
  afterEach(() => {
    if (savedW === undefined) delete process.env[ENV_SCREEN_WIDTH];
    else                       process.env[ENV_SCREEN_WIDTH] = savedW;
    if (savedH === undefined) delete process.env[ENV_SCREEN_HEIGHT];
    else                       process.env[ENV_SCREEN_HEIGHT] = savedH;
  });

  it('produces a geometry whose pixel + cell dimensions are internally consistent', async () => {
    process.env[ENV_SCREEN_WIDTH ] = '1920';
    process.env[ENV_SCREEN_HEIGHT] = '1080';
    const screen = await detectScreenResolution();
    expect(screen).not.toBeNull();
    if (screen === null) return;
    const geom = computePopupGeometry(screen);

    // Pixel dims are 70% of screen.
    expect(geom.widthPx ).toBe(Math.round(1920 * 0.7));
    expect(geom.heightPx).toBe(Math.round(1080 * 0.7));

    // Cell dims are floor(pixel/cell) and at least 1.
    expect(geom.cols).toBeGreaterThanOrEqual(1);
    expect(geom.rows).toBeGreaterThanOrEqual(1);

    // Centering math: xPx + widthPx/2 ≈ screen/2 (within 1 pixel rounding).
    expect(Math.abs((geom.xPx + geom.widthPx  / 2) - 1920 / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((geom.yPx + geom.heightPx / 2) - 1080 / 2)).toBeLessThanOrEqual(1);
  });
});
