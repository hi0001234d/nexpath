import { describe, it, expect } from 'vitest';
import { cursorComposerBubble } from './cursor-composer-bubble.js';

const SOURCE = '/home/u/.config/Cursor/User/globalStorage/state.vscdb';

function userBubble(text: string, composerId = 'comp-1', bubbleId = 'bub-1'): {
  key:   string;
  value: string;
} {
  return {
    key: `cursorDiskKV/bubbleId:${composerId}:${bubbleId}`,
    value: JSON.stringify({
      _v:        3,
      type:      1,
      bubbleId,
      text,
      createdAt: '2026-05-23T09:58:55.791Z',
    }),
  };
}

function assistantBubble(composerId = 'comp-1', bubbleId = 'bub-2'): {
  key:   string;
  value: string;
} {
  return {
    key: `cursorDiskKV/bubbleId:${composerId}:${bubbleId}`,
    value: JSON.stringify({
      _v:        3,
      type:      2,
      bubbleId,
      text:      '', // assistant bubbles have empty text in older Cursor versions
      createdAt: '2026-05-23T09:59:01.000Z',
    }),
  };
}

describe('cursorComposerBubble', () => {
  it('identifies itself with the expected id and label', () => {
    expect(cursorComposerBubble.id).toBe('cursor-composer-bubble');
    expect(cursorComposerBubble.label).toMatch(/composer.*agent/i);
  });

  it('owns keys starting with cursorDiskKV/bubbleId: and nothing else', () => {
    expect(
      cursorComposerBubble.ownsKey('cursorDiskKV/bubbleId:c1:b1'),
    ).toBe(true);
    expect(
      cursorComposerBubble.ownsKey('cursorDiskKV/composerData:c1'),
    ).toBe(false);
    expect(cursorComposerBubble.ownsKey('aiService.prompts')).toBe(false);
    expect(cursorComposerBubble.ownsKey('bubbleId:c1:b1')).toBe(false); // missing prefix
  });

  it('emits one event per user bubble with composerId as rawSessionId', () => {
    const row    = userBubble('make me a website where i can create invoices');
    const events = cursorComposerBubble.decodeRow(row, SOURCE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      prompt:       'make me a website where i can create invoices',
      rawSessionId: 'comp-1',
      sourcePath:   SOURCE,
      extractorId:  'cursor-composer-bubble',
    });
    expect(events[0].capturedAt).toBeInstanceOf(Date);
  });

  it('skips assistant bubbles (type=2)', () => {
    expect(cursorComposerBubble.decodeRow(assistantBubble(), SOURCE)).toEqual(
      [],
    );
  });

  it('skips bubbles whose type is not 1 (defensive against schema drift)', () => {
    const row = {
      key:   'cursorDiskKV/bubbleId:c1:b3',
      value: JSON.stringify({ _v: 3, type: 99, text: 'whatever' }),
    };
    expect(cursorComposerBubble.decodeRow(row, SOURCE)).toEqual([]);
  });

  it('skips user bubbles with empty / whitespace-only text', () => {
    const empty = userBubble('', 'comp-2', 'bub-4');
    const ws    = userBubble('   \n   \t  ', 'comp-2', 'bub-5');
    expect(cursorComposerBubble.decodeRow(empty, SOURCE)).toEqual([]);
    expect(cursorComposerBubble.decodeRow(ws, SOURCE)).toEqual([]);
  });

  it('skips rows with malformed JSON without throwing', () => {
    const row = {
      key:   'cursorDiskKV/bubbleId:c1:b6',
      value: '{not valid json',
    };
    expect(() => cursorComposerBubble.decodeRow(row, SOURCE)).not.toThrow();
    expect(cursorComposerBubble.decodeRow(row, SOURCE)).toEqual([]);
  });

  it('skips rows whose key does not match the expected shape', () => {
    expect(
      cursorComposerBubble.decodeRow(
        { key: 'aiService.prompts', value: '[]' },
        SOURCE,
      ),
    ).toEqual([]);
    // Missing the second colon → no parseable composerId
    expect(
      cursorComposerBubble.decodeRow(
        { key: 'cursorDiskKV/bubbleId:onlyone', value: '{}' },
        SOURCE,
      ),
    ).toEqual([]);
  });

  it('different composers produce different rawSessionIds so they do not dedup against each other', () => {
    const a = cursorComposerBubble.decodeRow(
      userBubble('first conversation prompt', 'comp-A'),
      SOURCE,
    );
    const b = cursorComposerBubble.decodeRow(
      userBubble('second conversation prompt', 'comp-B'),
      SOURCE,
    );
    expect(a[0].rawSessionId).toBe('comp-A');
    expect(b[0].rawSessionId).toBe('comp-B');
  });

  it('fingerprintKeys is exactly the table-qualified bubbleId prefix', () => {
    expect(cursorComposerBubble.fingerprintKeys).toEqual([
      'cursorDiskKV/bubbleId:',
    ]);
  });

  it('trims whitespace around the prompt text (Cursor sometimes appends a trailing newline)', () => {
    const row = {
      key:   'cursorDiskKV/bubbleId:comp-X:b1',
      value: JSON.stringify({
        _v:   3,
        type: 1,
        text: '  the login is not working on my phone fix it\n',
      }),
    };
    const events = cursorComposerBubble.decodeRow(row, SOURCE);
    expect(events[0].prompt).toBe(
      'the login is not working on my phone fix it',
    );
  });
});
