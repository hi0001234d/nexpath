/**
 * PB3 — browser PE preparation seam, tested against the REAL engine.
 *
 * Every prepare here runs the actual `src/prompt-enhancement` facade offline
 * (keyless = the engine's own deterministic path; no network, no key). The
 * only mocked engine entry is `preparePromptEnhancement`, and only via a
 * passthrough that individual tests can override to force the facade-error /
 * invalid-result branches — everything else is the shipped chain, so these
 * tests break if the browser request builder drifts from what the engine's
 * validators accept (the exact failure PB3 exists to prevent).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { engineOverride } = vi.hoisted(() => ({
  engineOverride: { prepare: undefined as undefined | (() => unknown) },
}));
vi.mock('./pe-engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pe-engine.js')>();
  return {
    ...actual,
    preparePromptEnhancement: (req: unknown) =>
      engineOverride.prepare
        ? engineOverride.prepare()
        : actual.preparePromptEnhancement(req as never),
  };
});

import type { LogPort } from '../../core/ports/log.port.js';
import {
  isPromptEnhancementSequenceShapedTextV1,
  validatePromptEnhancementPrepareRequestV1,
} from './pe-engine.js';
import {
  buildBrowserPeRequest,
  prepareAndStoreBrowserPe,
  prepareBrowserPe,
  type BrowserPeContext,
} from './pe-prepare.js';

afterEach(() => {
  engineOverride.prepare = undefined;
  vi.unstubAllGlobals();
});

function makeLog(): { log: LogPort; events: Array<[string, Record<string, unknown> | undefined]> } {
  const events: Array<[string, Record<string, unknown> | undefined]> = [];
  const push = (key: string, data?: Record<string, unknown>) => { events.push([key, data]); };
  return { log: { debug: push, info: push, warn: push }, events };
}

const eventNames = (events: Array<[string, unknown]>) => events.map(([k]) => k);

/** A fire-path context mirroring what runPromptSubmitPipeline assembles. */
function fireCtx(overrides: Partial<BrowserPeContext> = {}): BrowserPeContext {
  return {
    projectRoot: 'https://bolt.new/~/sb1-pe-test',
    promptText: 'add a login page with email and password to the app',
    sessionId: 'sess-pe-1',
    promptCount: 5,
    currentStage: 'implementation',
    prevStage: 'implementation',
    triggerKind: 'absence',
    effectiveFlagType: 'absence:tests_before_merge',
    firedKey: 'absence:tests_before_merge@implementation',
    triggerConfidence: 0.9,
    classifierState: 'fire_recommended',
    profile: null,
    configuredRole: 'founder',
    detectedLanguage: undefined,
    streamBOutputs: [],
    triggerEligibility: 'fresh_trigger_eligible',
    recentPromptRefs: ['prompt:2', 'prompt:3', 'prompt:4'],
    ...overrides,
  };
}

const SEQUENCE_PROMPT =
  'first build the login page, then add a database, then deploy the whole thing to production';

describe('buildBrowserPeRequest — validator round-trip (real engine validators)', () => {
  const shapes: Array<[string, BrowserPeContext]> = [
    ['fire/stage_transition', fireCtx({
      triggerKind: 'stage_transition',
      effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:implementation→release',
      currentStage: 'release',
      prevStage: 'implementation',
    })],
    ['fire/absence', fireCtx()],
    ['fallback/sequence-shaped', fireCtx({
      promptText: SEQUENCE_PROMPT,
      classifierState: 'not_applicable',
      triggerEligibility: 'blocked_by_dedup',
    })],
  ];
  for (const [name, ctx] of shapes) {
    it(`${name} produces a request the engine's own validator accepts`, () => {
      const v = validatePromptEnhancementPrepareRequestV1(buildBrowserPeRequest(ctx));
      expect(v.ok, `reasons: ${v.ok ? '' : v.reasonCodes.join(', ')}`).toBe(true);
    });
  }

  it('the extension host surface + store-less honesty survive into the request', () => {
    const req = buildBrowserPeRequest(fireCtx());
    const json = JSON.stringify(req);
    expect(json).toContain('extension_bridge');
    // The browser has no CLI DB — the request must declare PE tables missing,
    // never presume the store-backed snapshot's defaults.
    expect(JSON.stringify(req).includes('"missingPromptEnhancementTables":[]')).toBe(false);
  });
});

describe('prepareBrowserPe — boundary wrapper (fail-open contract)', () => {
  it('a task-shaped prompt reaches a real show disposition keyless (deterministic path)', async () => {
    const prep = await prepareBrowserPe(buildBrowserPeRequest(fireCtx()));
    expect(prep.safeFallback).toBe(false);
    if (prep.safeFallback) return;
    expect(prep.disposition).toBe('show_current_body');
    expect(prep.result.uiView.body.sendPolicy).toBe('send_current');
    expect(prep.result.uiView.body.text.length).toBeGreaterThan(100);
  });

  it('a corrupted request is reduced to safeFallback invalid_request with reason codes', async () => {
    const req = buildBrowserPeRequest(fireCtx());
    (req as { schemaVersion: unknown }).schemaVersion = 999;
    const prep = await prepareBrowserPe(req);
    expect(prep.safeFallback).toBe(true);
    if (!prep.safeFallback) return;
    expect(prep.reasonCode).toBe('invalid_request');
    expect(prep.validationReasonCodes?.length ?? 0).toBeGreaterThan(0);
  });

  it('a facade throw is reduced to safeFallback facade_error (never propagates)', async () => {
    engineOverride.prepare = () => { throw new Error('boom'); };
    const prep = await prepareBrowserPe(buildBrowserPeRequest(fireCtx()));
    expect(prep).toMatchObject({ safeFallback: true, reasonCode: 'facade_error' });
  });

  it('a result failing the result validator is reduced to safeFallback invalid_result', async () => {
    engineOverride.prepare = () => ({ garbage: true });
    const prep = await prepareBrowserPe(buildBrowserPeRequest(fireCtx()));
    expect(prep).toMatchObject({ safeFallback: true, reasonCode: 'invalid_result' });
  });
});

describe('prepareAndStoreBrowserPe — park-without-showing (owner decision B-i)', () => {
  it('show disposition → row parked with session identity + validated request/result', async () => {
    const { log, events } = makeLog();
    const upsert = vi.fn().mockResolvedValue(undefined);
    const ctx = fireCtx();
    const prep = await prepareAndStoreBrowserPe(log, null, ctx, upsert);
    expect(prep.safeFallback).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [root, record] = upsert.mock.calls[0] as [string, {
      sessionId: string; promptCount: number; request: unknown; result: { disposition: string };
    }];
    expect(root).toBe(ctx.projectRoot);
    expect(record.sessionId).toBe('sess-pe-1');
    expect(record.promptCount).toBe(5);
    expect(validatePromptEnhancementPrepareRequestV1(record.request as never).ok).toBe(true);
    expect(record.result.disposition).toBe('show_current_body');
    expect(eventNames(events)).toEqual(
      expect.arrayContaining(['pe_prepare_boundary', 'pe_pending_stored']),
    );
  });

  it('no_popup display decision is NEVER stored (blink defense) and is logged as skipped', async () => {
    const { log, events } = makeLog();
    const upsert = vi.fn().mockResolvedValue(undefined);
    // Routes deterministically to no_popup (cosmetic micro-tweak, no primary intent).
    const ctx = fireCtx({ promptText: 'make the header bold and change the theme color to dark blue' });
    const prep = await prepareAndStoreBrowserPe(log, null, ctx, upsert);
    expect(prep.safeFallback).toBe(false);
    expect(prep.disposition).toBe('no_popup_not_applicable');
    expect(upsert).not.toHaveBeenCalled();
    expect(eventNames(events)).toContain('pe_prepare_skipped_no_popup');
    expect(eventNames(events)).not.toContain('pe_pending_stored');
  });

  it('a store write failure is swallowed and logged — the submit pipeline stays intact', async () => {
    const { log, events } = makeLog();
    const upsert = vi.fn().mockRejectedValue(new Error('storage gone'));
    const prep = await prepareAndStoreBrowserPe(log, null, fireCtx(), upsert);
    expect(prep.safeFallback).toBe(false);
    expect(eventNames(events)).toContain('pe_pending_store_failed');
  });

  it('safeFallback never reaches the store', async () => {
    engineOverride.prepare = () => { throw new Error('boom'); };
    const { log, events } = makeLog();
    const upsert = vi.fn();
    const prep = await prepareAndStoreBrowserPe(log, null, fireCtx(), upsert);
    expect(prep.safeFallback).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(eventNames(events)).toContain('pe_prepare_boundary');
  });

  it('the boundary log carries the trigger eligibility label (CLI observability parity)', async () => {
    const { log, events } = makeLog();
    await prepareAndStoreBrowserPe(
      log, null, fireCtx({ triggerEligibility: 'blocked_by_post_advisory_cooldown' }), vi.fn(),
    );
    const boundary = events.find(([k]) => k === 'pe_prepare_boundary');
    expect(boundary?.[1]?.['eligibility']).toBe('blocked_by_post_advisory_cooldown');
  });

  it('with a key present + dead network, the call still resolves (A3 fail-open)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { log } = makeLog();
    const upsert = vi.fn().mockResolvedValue(undefined);
    await expect(
      prepareAndStoreBrowserPe(log, `sk-test-${'a'.repeat(24)}`, fireCtx(), upsert),
    ).resolves.toBeDefined();
  });
});

describe('sequence-shape gate seam (drives the SW blocked-exit fallback)', () => {
  it('a multi-step sequence prompt is sequence-shaped; a one-liner is not', () => {
    expect(isPromptEnhancementSequenceShapedTextV1(SEQUENCE_PROMPT)).toBe(true);
    expect(isPromptEnhancementSequenceShapedTextV1('fix the typo in the readme')).toBe(false);
  });
});
