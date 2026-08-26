import { describe, it, expect, vi } from 'vitest';

// The module imports the polyfill for its DEFAULT storage reader; every test here
// injects `getRaw`, so this mock exists only to make the import loadable outside a
// real extension context (the convention pe-config.test.ts already uses).
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: mockGet } } },
}));

import {
  resolveSubmitFlow,
  submitFlowStorageKeys,
  isSubmitFlowSite,
  SUBMIT_FLOW_OVERRIDE_KEY,
  SUBMIT_FLOW_SITE_KEYS,
  SUBMIT_FLOW_DEFAULT_ENABLED,
  SUBMIT_FLOW_SITES,
} from './submit-flow-config.js';

/** A storage stub that answers exactly the keys the resolver asks for. */
function store(values: Record<string, unknown>) {
  return (keys: string[]): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (k in values) out[k] = values[k];
    return Promise.resolve(out);
  };
}

describe('resolveSubmitFlow — the HB1 switch resolver', () => {
  describe('tier 3: the default (HB-D2 ship polarity)', () => {
    it('is ON when nothing is set — absent means ON in the browser, unlike the CLI', async () => {
      expect(SUBMIT_FLOW_DEFAULT_ENABLED).toBe(true);
      for (const site of SUBMIT_FLOW_SITES) {
        expect(await resolveSubmitFlow(site, { getRaw: store({}) }))
          .toEqual({ enabled: true, source: 'default_on' });
      }
    });
  });

  describe('tier 2: the per-site persisted flag', () => {
    it('exact "false" turns the site OFF (the documented revert — RC19c)', async () => {
      const raw = store({ [SUBMIT_FLOW_SITE_KEYS.bolt]: 'false' });
      expect(await resolveSubmitFlow('bolt', { getRaw: raw }))
        .toEqual({ enabled: false, source: 'site_off' });
    });

    it('exact "true" turns the site ON', async () => {
      const raw = store({ [SUBMIT_FLOW_SITE_KEYS.lovable]: 'true' });
      expect(await resolveSubmitFlow('lovable', { getRaw: raw }))
        .toEqual({ enabled: true, source: 'site_on' });
    });

    it('is per-site — one site\'s "false" never disarms another', async () => {
      const raw = store({ [SUBMIT_FLOW_SITE_KEYS.bolt]: 'false' });
      expect((await resolveSubmitFlow('replit', { getRaw: raw })).enabled).toBe(true);
    });

    it('reads EXACTLY — a boolean true, "TRUE", or "1" in the site slot is not a match', async () => {
      for (const junk of [true, 'TRUE', '1', ' true', 1]) {
        const raw = store({ [SUBMIT_FLOW_SITE_KEYS.bolt]: junk });
        // Falls through to the default rather than coercing.
        expect(await resolveSubmitFlow('bolt', { getRaw: raw }))
          .toEqual({ enabled: true, source: 'default_on' });
      }
    });

    it('junk in the site slot never turns a site OFF by accident', async () => {
      const raw = store({ [SUBMIT_FLOW_SITE_KEYS.bolt]: 'nope' });
      expect((await resolveSubmitFlow('bolt', { getRaw: raw })).source).toBe('default_on');
    });
  });

  describe('tier 1: the hidden developer override', () => {
    it('"0" forces OFF even when the site flag says true', async () => {
      const raw = store({ [SUBMIT_FLOW_OVERRIDE_KEY]: '0', [SUBMIT_FLOW_SITE_KEYS.bolt]: 'true' });
      expect(await resolveSubmitFlow('bolt', { getRaw: raw }))
        .toEqual({ enabled: false, source: 'override_off' });
    });

    it('"1" forces ON even when the site flag says false', async () => {
      const raw = store({ [SUBMIT_FLOW_OVERRIDE_KEY]: '1', [SUBMIT_FLOW_SITE_KEYS.bolt]: 'false' });
      expect(await resolveSubmitFlow('bolt', { getRaw: raw }))
        .toEqual({ enabled: true, source: 'override_on' });
    });

    it('an unrecognised override value defers to the lower tiers instead of deciding', async () => {
      const raw = store({ [SUBMIT_FLOW_OVERRIDE_KEY]: 'yes', [SUBMIT_FLOW_SITE_KEYS.bolt]: 'false' });
      expect(await resolveSubmitFlow('bolt', { getRaw: raw }))
        .toEqual({ enabled: false, source: 'site_off' });
    });
  });

  describe('sites we have not built a submit mechanism for', () => {
    it('resolves OFF for "unknown" — we never gate a site we cannot hold correctly', async () => {
      expect(await resolveSubmitFlow('unknown', { getRaw: store({}) }))
        .toEqual({ enabled: false, source: 'unsupported_site_off' });
    });

    it('does not even touch storage for an unsupported site', async () => {
      const getRaw = vi.fn(store({}));
      await resolveSubmitFlow('unknown', { getRaw });
      expect(getRaw).not.toHaveBeenCalled();
    });
  });

  describe('failure posture (inverted-risk rule: never hold from an abnormal state)', () => {
    it('a storage read that REJECTS resolves OFF — distinct from absent, which is ON', async () => {
      const getRaw = (): Promise<Record<string, unknown>> => Promise.reject(new Error('storage gone'));
      expect(await resolveSubmitFlow('bolt', { getRaw }))
        .toEqual({ enabled: false, source: 'read_error_off' });
    });

    it('never throws, whatever storage does', async () => {
      const getRaw = (): Promise<Record<string, unknown>> => { throw new Error('sync boom'); };
      await expect(resolveSubmitFlow('bolt', { getRaw })).resolves.toEqual({
        enabled: false, source: 'read_error_off',
      });
    });
  });

  describe('key names (pinned — the team lead locked these strings 2026-07-29)', () => {
    it('uses the locked per-site key names', () => {
      expect(SUBMIT_FLOW_SITE_KEYS).toEqual({
        bolt:    'bolt_promptsubmit_advisory',
        lovable: 'lovable_promptsubmit_advisory',
        replit:  'replit_promptsubmit_advisory',
      });
    });

    it('submitFlowStorageKeys lists the override plus every site key', () => {
      expect(submitFlowStorageKeys()).toEqual([
        'nexpath_promptsubmit_advisory',
        'bolt_promptsubmit_advisory',
        'lovable_promptsubmit_advisory',
        'replit_promptsubmit_advisory',
      ]);
    });

    it('asks storage for ONLY the override and the one site key it needs', async () => {
      const getRaw = vi.fn(store({}));
      await resolveSubmitFlow('replit', { getRaw });
      expect(getRaw).toHaveBeenCalledWith(['nexpath_promptsubmit_advisory', 'replit_promptsubmit_advisory']);
    });
  });

  describe('isSubmitFlowSite', () => {
    it('accepts the three gated sites and nothing else', () => {
      expect(SUBMIT_FLOW_SITES.every(isSubmitFlowSite)).toBe(true);
      for (const other of ['unknown', 'cursor', 'windsurf', '', 'BOLT']) {
        expect(isSubmitFlowSite(other)).toBe(false);
      }
    });
  });

  describe('no writer exists (RC19c by construction)', () => {
    it('the module exports no way to write a flag, so an explicit off cannot be self-healed', async () => {
      const mod = await import('./submit-flow-config.js') as Record<string, unknown>;
      const writers = Object.keys(mod).filter((k) => /^(set|write|enable|disable|clear)/i.test(k));
      expect(writers).toEqual([]);
    });
  });
});
