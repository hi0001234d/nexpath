import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { deriveSimplerCell, weaveWhyDesc, extractParamsFromPrompts } from './content-template-grounding.js';

/** A fake OpenAI whose chat.completions.create returns `reply` (or throws if a thunk that throws). */
function mockClient(reply: string | (() => never)): OpenAI {
  return {
    chat: {
      completions: {
        create: async () => {
          const content = typeof reply === 'function' ? reply() : reply;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  } as unknown as OpenAI;
}

function throwingClient(): OpenAI {
  return {
    chat: { completions: { create: async () => { throw new Error('network'); } } },
  } as unknown as OpenAI;
}

describe('content-template-grounding — simpler derive (b)', () => {
  it('returns the parsed two-channel cell on valid output', async () => {
    const client = mockClient(JSON.stringify({ option: 'simpler opt', whyDesc: 'simpler why' }));
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, client)).resolves.toEqual({ option: 'simpler opt', whyDesc: 'simpler why' });
  });

  it('strips markdown fencing before parsing', async () => {
    const client = mockClient('```json\n{"option":"o2","whyDesc":"w2"}\n```');
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, client)).resolves.toEqual({ option: 'o2', whyDesc: 'w2' });
  });

  it('rejects on malformed JSON (engine then falls back to its (a) form)', async () => {
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, mockClient('not json'))).rejects.toThrow();
  });

  it('rejects when a required field is missing or empty', async () => {
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, mockClient(JSON.stringify({ option: '' , whyDesc: 'w' })))).rejects.toThrow();
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, mockClient(JSON.stringify({ option: 'x' })))).rejects.toThrow();
  });

  it('rejects when the client throws', async () => {
    await expect(deriveSimplerCell({ option: 'o', whyDesc: 'w' }, throwingClient())).rejects.toThrow();
  });
});

describe('content-template-grounding — why-desc weave', () => {
  const base = { coreLine: 'Review what changed.', factLines: ['uses Vitest', 'small team'] };

  it('returns the woven why-desc on valid output', async () => {
    const client = mockClient(JSON.stringify({ whyDesc: 'Review what changed — you use Vitest, small team.' }));
    await expect(weaveWhyDesc(base, client)).resolves.toBe('Review what changed — you use Vitest, small team.');
  });

  it('falls back to the deterministic assembly on invalid output', async () => {
    const out = await weaveWhyDesc(base, mockClient('garbage'));
    expect(out).toBe('Review what changed.\nuses Vitest\nsmall team');
  });

  it('falls back to the deterministic assembly when the client throws', async () => {
    const out = await weaveWhyDesc(base, throwingClient());
    expect(out).toBe('Review what changed.\nuses Vitest\nsmall team');
  });

  it('keeps the safeguard verbatim when the weave includes it', async () => {
    const safeguard = 'still, confirm with me before deleting anything';
    const client = mockClient(JSON.stringify({ whyDesc: `Review what changed.\n${safeguard}` }));
    const out = await weaveWhyDesc({ ...base, l2Safeguard: safeguard }, client);
    expect(out).toContain(safeguard);
  });

  it('re-appends the safeguard if the weave dropped it (survival is non-negotiable)', async () => {
    const safeguard = 'still, confirm with me before deleting anything';
    const client = mockClient(JSON.stringify({ whyDesc: 'Review what changed (safeguard omitted by the model).' }));
    const out = await weaveWhyDesc({ ...base, l2Safeguard: safeguard }, client);
    expect(out.endsWith(safeguard)).toBe(true);
  });
});

describe('content-template-grounding — prompt-derived param extraction', () => {
  it('maps valid extracted facts', async () => {
    const client = mockClient(JSON.stringify({ facts: [{ key: 'test_runner', value: 'uses Vitest' }, { key: 'lang', value: 'TypeScript' }] }));
    await expect(extractParamsFromPrompts(['I run vitest', 'all in TS'], client)).resolves.toEqual([
      { key: 'test_runner', value: 'uses Vitest' },
      { key: 'lang', value: 'TypeScript' },
    ]);
  });

  it('returns [] for empty prompt input (no call made)', async () => {
    await expect(extractParamsFromPrompts([], throwingClient())).resolves.toEqual([]);
  });

  it('filters malformed / empty entries', async () => {
    const client = mockClient(JSON.stringify({ facts: [{ key: 'ok', value: 'v' }, { key: '', value: 'x' }, { key: 'k' }, { nope: 1 }] }));
    await expect(extractParamsFromPrompts(['p'], client)).resolves.toEqual([{ key: 'ok', value: 'v' }]);
  });

  it('returns [] on malformed JSON and on a client error', async () => {
    await expect(extractParamsFromPrompts(['p'], mockClient('garbage'))).resolves.toEqual([]);
    await expect(extractParamsFromPrompts(['p'], throwingClient())).resolves.toEqual([]);
  });

  it('the extraction prompt forbids secrets/PII and raw-text copying', async () => {
    let seen = '';
    const spy = {
      chat: { completions: { create: async (args: { messages: { content: string }[] }) => {
        seen = args.messages[0].content;
        return { choices: [{ message: { content: '{"facts":[]}' } }] };
      } } },
    } as unknown as import('openai').default;
    await extractParamsFromPrompts(['p'], spy);
    expect(seen).toMatch(/never extract secrets/i);
    expect(seen).toMatch(/do NOT copy raw prompt text/i);
  });
});
