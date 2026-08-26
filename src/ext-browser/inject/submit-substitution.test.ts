import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  rewriteLastUserMessage,
  rewriteLovableMessage,
  rewriteBodyForAgent,
  withReplacedBody,
  SITE_SUBSTITUTION_STRATEGY,
  fetchGateOwnsSite,
} from './submit-substitution.js';
// main-world.ts installs its fetch patch at module scope, so it needs a window
// before it can be imported. The extractors themselves are pure — they are
// imported from there deliberately, so these tests prove the rewriter and the
// extractor agree on the SAME field rather than on a copy of it.
let extractLastUserMessage: (body: string) => string | null;
let extractLovableMessage: (body: string) => string | null;

beforeAll(async () => {
  vi.stubGlobal('window', {
    postMessage: () => {},
    fetch: () => Promise.resolve({} as Response),
    location: { origin: 'https://bolt.new', hostname: 'bolt.new' },
    addEventListener: () => {},
  });
  const mod = await import('./main-world.js');
  extractLastUserMessage = mod.extractLastUserMessage;
  extractLovableMessage = mod.extractLovableMessage;
});

const NEW = 'add unit tests for the checkout total calculation';

describe('rewriteLastUserMessage (Bolt / AI-SDK messages body)', () => {
  it('replaces the newest user message and leaves everything else intact', () => {
    const body = JSON.stringify({
      model: 'x',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'ship it' },
      ],
    });
    const out = rewriteLastUserMessage(body, NEW)!;
    const parsed = JSON.parse(out) as { model: string; messages: Array<{ role: string; content: string }> };
    expect(parsed.messages.map((m) => m.content)).toEqual(['first', 'reply', NEW]);
    expect(parsed.model).toBe('x'); // sibling fields preserved
  });

  it('rewrites the SAME field the extractor reads from', () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: 'old' }, { role: 'assistant', content: 'a' }],
    });
    expect(extractLastUserMessage(body)).toBe('old');
    expect(extractLastUserMessage(rewriteLastUserMessage(body, NEW)!)).toBe(NEW);
  });

  it('returns null for shapes it does not recognise', () => {
    expect(rewriteLastUserMessage('not json', NEW)).toBeNull();
    expect(rewriteLastUserMessage(JSON.stringify({}), NEW)).toBeNull();
    expect(rewriteLastUserMessage(JSON.stringify({ messages: [] }), NEW)).toBeNull();
    expect(rewriteLastUserMessage(JSON.stringify({ messages: [{ role: 'assistant', content: 'a' }] }), NEW)).toBeNull();
    expect(rewriteLastUserMessage(JSON.stringify({ messages: [{ role: 'user', content: 42 }] }), NEW)).toBeNull();
  });
});

describe('rewriteLovableMessage (flat message field)', () => {
  const body = JSON.stringify({
    id: 'umsg_01kwv', message: 'ship it', files: [], chat_only: false, view: 'preview',
  });

  it('replaces `message` and preserves every sibling field', () => {
    const parsed = JSON.parse(rewriteLovableMessage(body, NEW)!) as Record<string, unknown>;
    expect(parsed['message']).toBe(NEW);
    expect(parsed['id']).toBe('umsg_01kwv');
    expect(parsed['view']).toBe('preview');
    expect(parsed['chat_only']).toBe(false);
  });

  it('rewrites the SAME field the extractor reads from', () => {
    expect(extractLovableMessage(body)).toBe('ship it');
    expect(extractLovableMessage(rewriteLovableMessage(body, NEW)!)).toBe(NEW);
  });

  it('refuses lookalike payloads — the extractor\'s own guard, mirrored', () => {
    expect(rewriteLovableMessage(JSON.stringify({ message: 'x' }), NEW)).toBeNull();
    expect(rewriteLovableMessage(JSON.stringify({ id: 'other_01', message: 'x' }), NEW)).toBeNull();
    expect(rewriteLovableMessage(JSON.stringify({ id: 'umsg_1', message: 42 }), NEW)).toBeNull();
    expect(rewriteLovableMessage('not json', NEW)).toBeNull();
  });
});

describe('rewriteBodyForAgent — the per-site seam', () => {
  const bolt = JSON.stringify({ messages: [{ role: 'user', content: 'old' }] });
  const lovable = JSON.stringify({ id: 'umsg_1', message: 'old' });

  /** Run `fn` with both sites temporarily on the body-rewrite mechanism. */
  function withBodyRewrite(fn: () => void): void {
    const prev = { ...SITE_SUBSTITUTION_STRATEGY };
    SITE_SUBSTITUTION_STRATEGY['bolt'] = 'body_rewrite';
    SITE_SUBSTITUTION_STRATEGY['lovable'] = 'body_rewrite';
    try { fn(); } finally { Object.assign(SITE_SUBSTITUTION_STRATEGY, prev); }
  }

  it('routes each site to its own rewriter', () => {
    withBodyRewrite(() => {
      expect(extractLastUserMessage(rewriteBodyForAgent('bolt', bolt, NEW)!)).toBe(NEW);
      expect(extractLovableMessage(rewriteBodyForAgent('lovable', lovable, NEW)!)).toBe(NEW);
    });
  });

  it('never crosses the wires — a Lovable body is not rewritten as Bolt', () => {
    withBodyRewrite(() => {
      expect(rewriteBodyForAgent('bolt', lovable, NEW)).toBeNull();
      expect(rewriteBodyForAgent('lovable', bolt, NEW)).toBeNull();
    });
  });

  it('returns null for an unknown agent (replit has no fetch transport)', () => {
    expect(rewriteBodyForAgent('replit', bolt, NEW)).toBeNull();
    expect(rewriteBodyForAgent('unknown', bolt, NEW)).toBeNull();
  });

  it('refuses an empty replacement — a block with nothing to send loses the prompt', () => {
    withBodyRewrite(() => { expect(rewriteBodyForAgent('bolt', bolt, '')).toBeNull(); });
  });

  it('BOLT is refused — it is on the composer mechanism (live evidence: optimistic bubble + 30s timeout)', () => {
    expect(rewriteBodyForAgent('bolt', bolt, NEW)).toBeNull();
  });

  it('LOVABLE is rewritten — its recon showed no bubble at submit, so one request is cleaner', () => {
    expect(extractLovableMessage(rewriteBodyForAgent('lovable', lovable, NEW)!)).toBe(NEW);
  });

  it('rewrites correctly for a site explicitly set to body_rewrite', () => {
    const original = SITE_SUBSTITUTION_STRATEGY['bolt'];
    try {
      SITE_SUBSTITUTION_STRATEGY['bolt'] = 'body_rewrite';
      expect(extractLastUserMessage(rewriteBodyForAgent('bolt', bolt, NEW)!)).toBe(NEW);
    } finally {
      SITE_SUBSTITUTION_STRATEGY['bolt'] = original!;
    }
  });

  it('the shipped strategy table records each site\'s live-evidence decision', () => {
    expect(SITE_SUBSTITUTION_STRATEGY).toEqual({
      bolt: 'composer_intercept', lovable: 'body_rewrite',
    });
  });

  it('EXACTLY ONE gate owns each site — never both, never neither by accident', () => {
    // fetchGateOwnsSite is the single source of truth: the page's fetch patch
    // gates a site iff this is true, and the composer gate stands down iff it is.
    expect(fetchGateOwnsSite('lovable')).toBe(true);   // fetch rewrites Lovable
    expect(fetchGateOwnsSite('bolt')).toBe(false);     // composer gates Bolt
    expect(fetchGateOwnsSite('replit')).toBe(false);   // composer gates Replit (no fetch transport)
    expect(fetchGateOwnsSite('unknown')).toBe(false);
  });
});

describe('withReplacedBody', () => {
  it('swaps a string body and preserves the rest of init', () => {
    const init = { method: 'POST', body: 'old', headers: { 'content-type': 'application/json' } };
    const [input, next] = withReplacedBody('https://bolt.new/api/chat/v2', init, 'new');
    expect(input).toBe('https://bolt.new/api/chat/v2');
    expect(next).toEqual({ method: 'POST', body: 'new', headers: { 'content-type': 'application/json' } });
    expect(init.body).toBe('old'); // the caller's object is not mutated
  });

  it('returns the inputs unchanged when the shape is not one it can rewrite', () => {
    const init = { method: 'POST' };
    const [input, next] = withReplacedBody('https://bolt.new/api/chat/v2', init, 'new');
    // Identity is how the caller detects "not supported" and falls back.
    expect(input).toBe('https://bolt.new/api/chat/v2');
    expect(next).toBe(init);
  });
});
