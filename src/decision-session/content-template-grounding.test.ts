import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { deriveSimplerCell, weaveWhyDesc, extractParamsFromPrompts, sanitizePromptDerivedValue } from './content-template-grounding.js';

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

  it('the derive prompt carries the drop-over-neutralize instruction (keep topic, drop un-neutralizable risk)', async () => {
    let seen = '';
    const spy = {
      chat: { completions: { create: async (args: { messages: { content: string }[] }) => {
        seen = args.messages[0].content;
        return { choices: [{ message: { content: '{"option":"o","whyDesc":"w"}' } }] };
      } } },
    } as unknown as import('openai').default;
    await deriveSimplerCell({ option: 'o', whyDesc: 'w' }, spy);
    expect(seen).toMatch(/DROP the risky clause/i);
    expect(seen).toMatch(/KEEPING the topic\/keyword/i);
  });

  it('re-appends the L2 safeguard if the simplified why-desc dropped it', async () => {
    const safeguard = 'still, confirm with me before deleting anything';
    const client = mockClient(JSON.stringify({ option: 'simpler', whyDesc: 'simpler why (no safeguard)' }));
    const cell = await deriveSimplerCell({ option: 'o', whyDesc: 'w' }, client, { l2Safeguard: safeguard });
    expect(cell.whyDesc.endsWith(safeguard)).toBe(true);
  });

  it('does not duplicate the safeguard when the simplified why-desc kept it', async () => {
    const safeguard = 'confirm with me first';
    const client = mockClient(JSON.stringify({ option: 'simpler', whyDesc: `simpler why. ${safeguard}` }));
    const cell = await deriveSimplerCell({ option: 'o', whyDesc: 'w' }, client, { l2Safeguard: safeguard });
    expect(cell.whyDesc.split(safeguard).length - 1).toBe(1); // appears exactly once
  });
});

describe('content-template-grounding — why-desc weave', () => {
  const base = { coreLine: 'Review what changed.', facts: [{ text: 'uses Vitest', tier: 'capability' as const }, { text: 'small team', tier: 'capability' as const }] };

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

  it('falls back deterministically when the weave drops a runtime placeholder', async () => {
    const withToken = { coreLine: 'Review {R4_OPEN}the change{R4_CLOSE}.', facts: [{ text: 'uses Vitest', tier: 'capability' as const }] };
    // Model returns prose WITHOUT the {R...} tokens → must fall back (deterministic keeps them).
    const out = await weaveWhyDesc(withToken, mockClient(JSON.stringify({ whyDesc: 'Review the change. uses Vitest' })));
    expect(out).toContain('{R4_OPEN}');
    expect(out).toContain('{R4_CLOSE}');
    expect(out).toBe('Review {R4_OPEN}the change{R4_CLOSE}.\nuses Vitest');
  });

  it('keeps the weave when all placeholders survive', async () => {
    const withToken = { coreLine: 'See {R5_INJECT: last prompts} here.', facts: [] };
    const out = await weaveWhyDesc(withToken, mockClient(JSON.stringify({ whyDesc: 'See {R5_INJECT: last prompts} here, nicely woven.' })));
    expect(out).toBe('See {R5_INJECT: last prompts} here, nicely woven.');
  });

  it('the weave prompt instructs placeholder preservation + tier-bound wording', async () => {
    let seen = '';
    const spy = {
      chat: { completions: { create: async (args: { messages: { content: string }[] }) => {
        seen = args.messages[0].content;
        return { choices: [{ message: { content: '{"whyDesc":"x"}' } }] };
      } } },
    } as unknown as import('openai').default;
    await weaveWhyDesc({ coreLine: 'c', facts: [
      { text: 'reliably writes tests', tier: 'corroborated' },
      { text: 'has CI', tier: 'capability' },
    ] }, spy);
    expect(seen).toMatch(/Preserve any placeholder tokens/i);
    expect(seen).toMatch(/established practice/i);   // corroborated → practice wording
    expect(seen).toMatch(/available capability/i);   // capability → capability wording
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

  it('sanitizes extracted values (leakage gate) — PII/paths/URLs redacted', async () => {
    const client = mockClient(JSON.stringify({ facts: [{ key: 'contact', value: 'email me at dev@acme.com' }, { key: 'repo', value: 'see https://secret.example/x' }] }));
    const facts = await extractParamsFromPrompts(['p'], client);
    expect(facts.find((f) => f.key === 'contact')?.value).not.toMatch(/dev@acme\.com/);
    expect(facts.find((f) => f.key === 'repo')?.value).not.toMatch(/https?:\/\//);
  });
});

describe('content-template-grounding — sanitize gate (leakage)', () => {
  it('redacts email, URL, and absolute file paths; keeps clean text', () => {
    expect(sanitizePromptDerivedValue('ping a@b.com now')).not.toMatch(/a@b\.com/);
    expect(sanitizePromptDerivedValue('at https://x.io/y')).not.toMatch(/https?:\/\//);
    expect(sanitizePromptDerivedValue('uses Vitest and a small team')).toBe('uses Vitest and a small team');
  });
});
