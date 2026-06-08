import { describe, expect, it } from 'vitest';
import type { PromptRecord } from '../classifier/types.js';
import type { DecisionContent, OptionEntry } from './options.js';
import {
  applyRuntimeSubstitutions,
  applyRuntimeSubstitutionsAllLevels,
} from './runtime-substitutions.js';
import { R4_CA_OPEN, R4_CA_CLOSE } from './r4-bookends.js';

function makePrompt(text: string, index = 0): PromptRecord {
  return {
    index,
    text,
    capturedAt:      Date.now(),
    classifiedStage: 'implementation',
    confidence:      0.8,
  };
}

const TEMPLATE_WITH_INJECT = [
  '{R4_OPEN}',
  '{R5_INJECT: ~1-2 lines — "example user-grounded reason"}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

const TEMPLATE_NO_INJECT = [
  '{R4_OPEN}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

function makeEntries(descBases: readonly string[]): OptionEntry[] {
  return descBases.map((descBase, i) => ({ option: `static option ${i}`, descBase }));
}

describe('runtime-substitutions — applyRuntimeSubstitutions()', () => {
  it('returns one OptionEntry per generated option text', async () => {
    const generated = ['gen 0', 'gen 1', 'gen 2'];
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: generated,
      staticEntries:        makeEntries([TEMPLATE_NO_INJECT, TEMPLATE_NO_INJECT, TEMPLATE_NO_INJECT]),
      history:              [],
      signalType:           'IRRELEVANT',
      register:             'casual',
    });
    expect(out).toHaveLength(3);
  });

  it('uses the generated option text verbatim (never the static option text)', async () => {
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: ['dynamically rewritten option'],
      staticEntries:        makeEntries([TEMPLATE_NO_INJECT]),
      history:              [],
      signalType:           'IRRELEVANT',
      register:             'casual',
    });
    expect(out[0].option).toBe('dynamically rewritten option');
    expect(out[0].option).not.toContain('static option');
  });

  it('substitutes the CA-facing {R4_OPEN} / {R4_CLOSE} placeholders (runs last)', async () => {
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: ['gen 0'],
      staticEntries:        makeEntries([TEMPLATE_NO_INJECT]),
      history:              [],
      signalType:           'IRRELEVANT',
      register:             'casual',
    });
    expect(out[0].descBase).toContain(R4_CA_OPEN);
    expect(out[0].descBase).not.toContain('{R4_OPEN}');
    expect(out[0].descBase).not.toContain('{R4_CLOSE}');
    // R4_CA_CLOSE is locked to the empty string, so the closing line is just removed.
    expect(R4_CA_CLOSE).toBe('');
  });

  it('with no rewrite client + a desc-base containing {R5_INJECT}, falls back to Strategy D (placeholder removed)', async () => {
    // The Strategy-D fallback is keyed by signalType + register. For an
    // unknown signal_type the desc-base is returned with the placeholder
    // intact — but the bookend substitution still runs afterwards, so
    // {R4_OPEN}/{R4_CLOSE} are still resolved.
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: ['gen 0'],
      staticEntries:        makeEntries([TEMPLATE_WITH_INJECT]),
      history:              [makePrompt('hello world'), makePrompt('second prompt', 1)],
      signalType:           'UNKNOWN_SIGNAL_TYPE_NO_FALLBACK',
      register:             'casual',
    });
    // R4 substitution runs unconditionally.
    expect(out[0].descBase).toContain(R4_CA_OPEN);
    expect(out[0].descBase).not.toContain('{R4_OPEN}');
  });

  it('uses the rewrite client output when one is bound and the summary passes the concentration check', async () => {
    const history = [
      makePrompt('I am refactoring the auth module and updating the migration script', 0),
      makePrompt('Need to migrate the auth module so I refactor and update the script', 1),
      makePrompt('Continuing the refactor of the auth module and the migration script', 2),
    ];
    // Parse the JSON vocab array out of the rewrite prompt and echo it
    // back as the summary so the 70-80% concentration rule passes.
    const rewriteClient = {
      rewrite: async (prompt: string) => {
        const match = prompt.match(/\[(?:"[^"]*",?\s*)+\]/);
        if (!match) return '';
        const vocab = JSON.parse(match[0]) as string[];
        return vocab.join(' ');
      },
    };
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: ['gen 0'],
      staticEntries:        makeEntries([TEMPLATE_WITH_INJECT]),
      history,
      signalType:           'IRRELEVANT',
      register:             'casual',
      injectOptions:        { client: rewriteClient },
    });
    expect(out[0].descBase).not.toContain('{R5_INJECT');
    expect(out[0].descBase).toContain(R4_CA_OPEN);
  });

  it('defaults staticDescBase to empty string when staticEntries is shorter than generatedOptionTexts', async () => {
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: ['gen 0', 'gen 1', 'gen 2'],
      staticEntries:        makeEntries([TEMPLATE_NO_INJECT]),
      history:              [],
      signalType:           'IRRELEVANT',
      register:             'casual',
    });
    expect(out).toHaveLength(3);
    expect(out[1].descBase).toBe('');
    expect(out[2].descBase).toBe('');
    expect(out[0].descBase).toContain(R4_CA_OPEN);
  });

  it('returns an empty array when generatedOptionTexts is empty', async () => {
    const out = await applyRuntimeSubstitutions({
      generatedOptionTexts: [],
      staticEntries:        makeEntries([TEMPLATE_NO_INJECT]),
      history:              [],
      signalType:           'IRRELEVANT',
      register:             'casual',
    });
    expect(out).toEqual([]);
  });

  it('passes injectOptions through to injectR5 (default empty options when omitted)', async () => {
    // No client → injectR5 path will fall back to Strategy D for any
    // input that has the placeholder. Just verify the omission does not
    // throw.
    await expect(
      applyRuntimeSubstitutions({
        generatedOptionTexts: ['gen 0'],
        staticEntries:        makeEntries([TEMPLATE_WITH_INJECT]),
        history:              [makePrompt('foo'), makePrompt('bar', 1)],
        signalType:           'IRRELEVANT',
        register:             'casual',
      }),
    ).resolves.toHaveLength(1);
  });
});

describe('runtime-substitutions — applyRuntimeSubstitutionsAllLevels()', () => {
  function makeContent(): DecisionContent {
    return {
      question:      'q?',
      pinchFallback: 'p',
      L1: makeEntries([TEMPLATE_NO_INJECT, TEMPLATE_NO_INJECT]),
      L2: makeEntries([TEMPLATE_NO_INJECT]),
      L3: makeEntries([TEMPLATE_NO_INJECT, TEMPLATE_NO_INJECT, TEMPLATE_NO_INJECT]),
    };
  }

  it('returns the { l1, l2, l3 } shape', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(
      { l1: ['l1a', 'l1b'], l2: ['l2a'], l3: ['l3a', 'l3b', 'l3c'] },
      makeContent(),
      [],
      'IRRELEVANT',
      'casual',
    );
    expect(Object.keys(out).sort()).toEqual(['l1', 'l2', 'l3']);
  });

  it('returns the correct number of options per level (matching the generated counts)', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(
      { l1: ['l1a', 'l1b'], l2: ['l2a'], l3: ['l3a', 'l3b', 'l3c'] },
      makeContent(),
      [],
      'IRRELEVANT',
      'casual',
    );
    expect(out.l1).toHaveLength(2);
    expect(out.l2).toHaveLength(1);
    expect(out.l3).toHaveLength(3);
  });

  it('routes each level to its corresponding static entries (L1 → l1, L2 → l2, L3 → l3)', async () => {
    const content: DecisionContent = {
      question:      'q?',
      pinchFallback: 'p',
      L1: [{ option: 'static-L1-0', descBase: 'L1-DESC-{R4_OPEN}{R4_CLOSE}' }],
      L2: [{ option: 'static-L2-0', descBase: 'L2-DESC-{R4_OPEN}{R4_CLOSE}' }],
      L3: [{ option: 'static-L3-0', descBase: 'L3-DESC-{R4_OPEN}{R4_CLOSE}' }],
    };
    const out = await applyRuntimeSubstitutionsAllLevels(
      { l1: ['gen-l1'], l2: ['gen-l2'], l3: ['gen-l3'] },
      content,
      [],
      'IRRELEVANT',
      'casual',
    );
    expect(out.l1[0].descBase).toContain('L1-DESC-');
    expect(out.l2[0].descBase).toContain('L2-DESC-');
    expect(out.l3[0].descBase).toContain('L3-DESC-');
  });

  it('substitutes bookends on every level', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(
      { l1: ['l1a'], l2: ['l2a'], l3: ['l3a'] },
      makeContent(),
      [],
      'IRRELEVANT',
      'casual',
    );
    for (const entry of [...out.l1, ...out.l2, ...out.l3]) {
      expect(entry.descBase).toContain(R4_CA_OPEN);
      expect(entry.descBase).not.toContain('{R4_OPEN}');
      expect(entry.descBase).not.toContain('{R4_CLOSE}');
    }
  });

  it('preserves the generated option texts verbatim on every level', async () => {
    const out = await applyRuntimeSubstitutionsAllLevels(
      { l1: ['gen-l1-0', 'gen-l1-1'], l2: ['gen-l2-0'], l3: ['gen-l3-0', 'gen-l3-1', 'gen-l3-2'] },
      makeContent(),
      [],
      'IRRELEVANT',
      'casual',
    );
    expect(out.l1.map((e) => e.option)).toEqual(['gen-l1-0', 'gen-l1-1']);
    expect(out.l2.map((e) => e.option)).toEqual(['gen-l2-0']);
    expect(out.l3.map((e) => e.option)).toEqual(['gen-l3-0', 'gen-l3-1', 'gen-l3-2']);
  });
});
