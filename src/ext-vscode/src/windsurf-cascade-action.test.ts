import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  encodeAddCascadeInputBinary,
  buildAddCascadeInputJson,
  injectViaCascadeAction,
  OPEN_CHAT_PANEL_JSON,
  SEND_CHAT_ACTION_COMMAND,
} from './windsurf-cascade-action.js';

/**
 * Independent minimal protobuf reader — deliberately NOT sharing code with the
 * encoder, so a round-trip proves the wire format is correct rather than merely
 * self-consistent. Reads length-delimited (wire type 2) fields only, which is
 * all the AddCascadeInputRequest / TextOrScopeItem text path uses.
 */
function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0, shift = 0, p = pos;
  for (;;) {
    const b = buf[p++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, p];
}

/** Parse one level: returns a map fieldNo → array of length-delimited byte slices. */
function parseLenDelimited(buf: Uint8Array): Map<number, Uint8Array[]> {
  const out = new Map<number, Uint8Array[]>();
  let p = 0;
  while (p < buf.length) {
    const [tag, p1] = readVarint(buf, p);
    const fieldNo = tag >>> 3;
    const wireType = tag & 0x7;
    expect(wireType).toBe(2); // only length-delimited in this path
    const [len, p2] = readVarint(buf, p1);
    const slice = buf.subarray(p2, p2 + len);
    if (!out.has(fieldNo)) out.set(fieldNo, []);
    out.get(fieldNo)!.push(slice);
    p = p2 + len;
  }
  return out;
}

/** Decode AddCascadeInputRequest{items:[TextOrScopeItem{text}]} → array of texts. */
function decodeAddCascadeInput(bytes: Uint8Array): string[] {
  const req = parseLenDelimited(bytes);            // field 1 = items
  const items = req.get(1) ?? [];
  return items.map((item) => {
    const it = parseLenDelimited(item);            // field 1 = text (string)
    const textBytes = (it.get(1) ?? [])[0] ?? new Uint8Array();
    return new TextDecoder().decode(textBytes);
  });
}

describe('encodeAddCascadeInputBinary (wire format, round-trip verified)', () => {
  it('round-trips simple ASCII text', () => {
    const bytes = encodeAddCascadeInputBinary('hello cascade');
    expect(decodeAddCascadeInput(bytes)).toEqual(['hello cascade']);
  });

  it('round-trips long text (>127 bytes → multi-byte varint length)', () => {
    const long = 'x'.repeat(500);
    const bytes = encodeAddCascadeInputBinary(long);
    const decoded = decodeAddCascadeInput(bytes);
    expect(decoded).toEqual([long]);
    expect(decoded[0]).toHaveLength(500);
  });

  it('round-trips multi-byte UTF-8 (emoji, accents, newlines)', () => {
    const text = 'café — déjà vu 🚀\nsecond line\ttab';
    const bytes = encodeAddCascadeInputBinary(text);
    expect(decodeAddCascadeInput(bytes)).toEqual([text]);
  });

  it('round-trips empty text', () => {
    expect(decodeAddCascadeInput(encodeAddCascadeInputBinary(''))).toEqual(['']);
  });

  it('produces the exact expected bytes for a known short string', () => {
    // "hi" → TextOrScopeItem{text}: 0x0A 0x02 'h' 'i'
    //      → AddCascadeInputRequest{items}: 0x0A 0x04 <item>
    const bytes = encodeAddCascadeInputBinary('hi');
    expect(Array.from(bytes)).toEqual([0x0a, 0x04, 0x0a, 0x02, 0x68, 0x69]);
  });
});

describe('buildAddCascadeInputJson', () => {
  it('emits {actionType:"addCascadeInput", payload:[<base64>]} and the base64 decodes back', () => {
    const json = JSON.parse(buildAddCascadeInputJson('hello'));
    expect(json.actionType).toBe('addCascadeInput');
    expect(Array.isArray(json.payload)).toBe(true);
    expect(json.payload).toHaveLength(1);
    const bytes = new Uint8Array(Buffer.from(json.payload[0], 'base64'));
    expect(decodeAddCascadeInput(bytes)).toEqual(['hello']);
  });

  it('OPEN_CHAT_PANEL_JSON has no payload (the panel focus() action)', () => {
    const json = JSON.parse(OPEN_CHAT_PANEL_JSON);
    expect(json).toEqual({ actionType: 'openChatPanel' });
  });
});

describe('injectViaCascadeAction', () => {
  it('focuses then inserts via the real command and returns true', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const getCommands = vi.fn().mockResolvedValue([SEND_CHAT_ACTION_COMMAND]);
    const ok = await injectViaCascadeAction('do the thing', { executeCommand, getCommands });
    expect(ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    // First call: focus the panel.
    expect(executeCommand.mock.calls[0]).toEqual([SEND_CHAT_ACTION_COMMAND, OPEN_CHAT_PANEL_JSON]);
    // Second call: insert the text.
    const [cmd, arg] = executeCommand.mock.calls[1];
    expect(cmd).toBe(SEND_CHAT_ACTION_COMMAND);
    expect(JSON.parse(arg).actionType).toBe('addCascadeInput');
  });

  it('returns false (no calls) when the command is not available', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const getCommands = vi.fn().mockResolvedValue(['some.other.command']);
    const ok = await injectViaCascadeAction('x', { executeCommand, getCommands });
    expect(ok).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('returns false when a command call throws (caller falls back)', async () => {
    const executeCommand = vi.fn().mockRejectedValue(new Error('boom'));
    const getCommands = vi.fn().mockResolvedValue([SEND_CHAT_ACTION_COMMAND]);
    const ok = await injectViaCascadeAction('x', { executeCommand, getCommands });
    expect(ok).toBe(false);
  });

  it('optimistically tries when enumeration fails', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const getCommands = vi.fn().mockRejectedValue(new Error('getCommands failed'));
    const ok = await injectViaCascadeAction('x', { executeCommand, getCommands });
    expect(ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledTimes(2);
  });

  it('uses the devin.* command on the rebranded build (windsurf id absent)', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const getCommands = vi.fn().mockResolvedValue(['devin.sendChatActionMessage', 'foo.bar']);
    const ok = await injectViaCascadeAction('hello devin', { executeCommand, getCommands });
    expect(ok).toBe(true);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(executeCommand.mock.calls[0][0]).toBe('devin.sendChatActionMessage');
    expect(executeCommand.mock.calls[1][0]).toBe('devin.sendChatActionMessage');
  });
});
