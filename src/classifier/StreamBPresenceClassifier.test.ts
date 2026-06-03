import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import {
  classifyStreamBPresence,
  parseStreamBResponse,
  STREAM_B_MODEL,
  STREAM_B_MAX_OUTPUT_TOKENS,
} from './StreamBPresenceClassifier.js';

// ── parseStreamBResponse ──────────────────────────────────────────────────────

describe('parseStreamBResponse', () => {
  it('returns correct booleans for a valid JSON response', () => {
    const raw = JSON.stringify({
      feature_scope_before_build: true,
      implementation_checkpoint:  false,
      spec_before_code:           true,
    });
    expect(parseStreamBResponse(raw)).toEqual({
      feature_scope_before_build: true,
      implementation_checkpoint:  false,
      spec_before_code:           true,
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseStreamBResponse('not json')).toBeNull();
    expect(parseStreamBResponse('{incomplete')).toBeNull();
    expect(parseStreamBResponse('')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const partial = JSON.stringify({ feature_scope_before_build: true }); // missing 2 fields
    expect(parseStreamBResponse(partial)).toBeNull();
  });

  it('returns null when field values are not boolean', () => {
    const bad = JSON.stringify({
      feature_scope_before_build: 'yes',
      implementation_checkpoint:  1,
      spec_before_code:           null,
    });
    expect(parseStreamBResponse(bad)).toBeNull();
  });

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"feature_scope_before_build":false,"implementation_checkpoint":true,"spec_before_code":false}\n```';
    expect(parseStreamBResponse(raw)).toEqual({
      feature_scope_before_build: false,
      implementation_checkpoint:  true,
      spec_before_code:           false,
    });
  });

  it('strips plain ``` fences before parsing', () => {
    const raw = '```\n{"feature_scope_before_build":true,"implementation_checkpoint":false,"spec_before_code":true}\n```';
    expect(parseStreamBResponse(raw)).toEqual({
      feature_scope_before_build: true,
      implementation_checkpoint:  false,
      spec_before_code:           true,
    });
  });

  it('returns null for a JSON array (wrong top-level type)', () => {
    expect(parseStreamBResponse('[true, false, true]')).toBeNull();
  });
});

// ── classifyStreamBPresence ───────────────────────────────────────────────────

describe('classifyStreamBPresence', () => {
  function makeMockClient(content: string): OpenAI {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content } }],
          }),
        },
      },
    } as unknown as OpenAI;
  }

  const VALID_RESPONSE = JSON.stringify({
    feature_scope_before_build: true,
    implementation_checkpoint:  false,
    spec_before_code:           true,
  });

  it('returns parsed result for a valid API response', async () => {
    const client = makeMockClient(VALID_RESPONSE);
    const result = await classifyStreamBPresence('let me spec this feature out first', client);
    expect(result).toEqual({
      feature_scope_before_build: true,
      implementation_checkpoint:  false,
      spec_before_code:           true,
    });
  });

  it('returns all-false when API response is malformed JSON', async () => {
    const client = makeMockClient('not json');
    const result = await classifyStreamBPresence('some prompt', client);
    expect(result).toEqual({
      feature_scope_before_build: false,
      implementation_checkpoint:  false,
      spec_before_code:           false,
    });
  });

  it('returns all-false when API response has missing fields', async () => {
    const client = makeMockClient(JSON.stringify({ feature_scope_before_build: true }));
    const result = await classifyStreamBPresence('some prompt', client);
    expect(result).toEqual({
      feature_scope_before_build: false,
      implementation_checkpoint:  false,
      spec_before_code:           false,
    });
  });

  it('throws when the API call fails', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('network timeout')),
        },
      },
    } as unknown as OpenAI;
    await expect(classifyStreamBPresence('some prompt', client)).rejects.toThrow('network timeout');
  });

  it('calls the API with the correct model and temperature', async () => {
    const client   = makeMockClient(VALID_RESPONSE);
    await classifyStreamBPresence('some prompt', client);
    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({
        model:       STREAM_B_MODEL,
        temperature: 0,
        max_tokens:  STREAM_B_MAX_OUTPUT_TOKENS,
      }),
      expect.anything(),
    );
  });

  it('sends the prompt text as the user message', async () => {
    const client     = makeMockClient(VALID_RESPONSE);
    const promptText = 'let me define the scope of this feature';
    await classifyStreamBPresence(promptText, client);
    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    const args     = createFn.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMsg  = args.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe(promptText);
  });

  it('includes a system message describing all three signals', async () => {
    const client = makeMockClient(VALID_RESPONSE);
    await classifyStreamBPresence('some prompt', client);
    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    const args     = createFn.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const sysMsg   = args.messages.find((m) => m.role === 'system');
    expect(sysMsg?.content).toContain('feature_scope_before_build');
    expect(sysMsg?.content).toContain('implementation_checkpoint');
    expect(sysMsg?.content).toContain('spec_before_code');
  });
});
