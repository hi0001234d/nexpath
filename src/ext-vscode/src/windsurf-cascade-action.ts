/**
 * Direct Cascade insert via Windsurf's real `windsurf.sendChatActionMessage`
 * command — no clipboard, no keystroke, no focus race.
 *
 * # Why this exists
 * Earlier attempts pasted via the OS clipboard + a simulated Ctrl+V. That is
 * fragile: it depends on the right window AND the Cascade input being focused,
 * and the clipboard can be clobbered (e.g. a screenshot image) between copy and
 * paste. The genuinely reliable path is the one Windsurf uses internally.
 *
 * # What the Windsurf bundle actually exposes (verified against Windsurf 2.3.x
 *   `workbench.desktop.main.js`, NOT guessed)
 * - `windsurf.sendChatActionMessage` is a REGISTERED command. Its handler does:
 *     run(accessor, arg) { if (typeof arg === 'string') arg = S2.fromJsonString(arg);
 *                          chatService.sendActionToChatClient(arg) }
 *   i.e. it accepts a JSON string of `SendActionToChatPanelRequest`.
 * - `SendActionToChatPanelRequest` (proto `exa.language_server_pb`):
 *       field 1 `action_type` : string
 *       field 2 `payload`     : repeated bytes
 * - `action_type:"openChatPanel"` with NO payload is literally the Cascade
 *   panel's own `focus()` implementation (`new S2({actionType:"openChatPanel"})`).
 * - `action_type:"addCascadeInput"` with `payload[0]` = the binary of
 *   `AddCascadeInputRequest` (proto `exa.chat_client_server_pb`):
 *       field 1 `items` : repeated `TextOrScopeItem`
 *   where `TextOrScopeItem` (proto `exa.codeium_common_pb`) is a oneof `chunk`:
 *       field 1 `text` : string
 *   The bundle's receiver decodes `payload[0]` and, for each item with the
 *   `text` chunk, inserts the text into Cascade's lexical input — exactly what
 *   we want, on the EXISTING conversation (it is not a "new chat" action).
 *
 * Protobuf JSON encodes `bytes` as base64 and `repeated` as an array, so the
 * outer message serialises to `{"actionType":"addCascadeInput","payload":["<b64>"]}`.
 * We build the inner `AddCascadeInputRequest` wire bytes by hand (two nested
 * length-delimited string fields — trivial + unit-tested for round-trip).
 */
import { Buffer } from 'node:buffer';

/** The registered Windsurf command that routes an action to the chat client. */
export const SEND_CHAT_ACTION_COMMAND = 'windsurf.sendChatActionMessage';

/**
 * Candidate ids for the send-chat-action command across builds. Windsurf was
 * rebranded to "Devin" (Devin Desktop), and forks routinely re-namespace their
 * commands (`windsurf.*` → `devin.*`), so we probe the whole family and use the
 * first one the host actually registers. `windsurf.sendChatActionMessage` stays
 * first (the verified id on Windsurf 2.3.x).
 */
export const SEND_CHAT_ACTION_COMMAND_CANDIDATES = [
  'windsurf.sendChatActionMessage',
  'devin.sendChatActionMessage',
  'cascade.sendChatActionMessage',
  'codeium.sendChatActionMessage',
] as const;

/** Pick the first candidate send-chat-action command the host registers (or null). */
export function pickCascadeActionCommand(available: readonly string[]): string | null {
  return SEND_CHAT_ACTION_COMMAND_CANDIDATES.find((c) => available.includes(c)) ?? null;
}

/** Focus/reveal the Cascade chat panel (the panel's own `focus()` action). */
export const OPEN_CHAT_PANEL_JSON = JSON.stringify({ actionType: 'openChatPanel' });

/** Encode a non-negative integer as a protobuf base-128 varint. */
function varint(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

/** A length-delimited protobuf field: tag = (fieldNo<<3)|2, then varint len, then bytes. */
function lenDelimited(fieldNo: number, bytes: Uint8Array | number[]): number[] {
  const body = Array.from(bytes);
  return [(fieldNo << 3) | 2, ...varint(body.length), ...body];
}

/**
 * Build the `AddCascadeInputRequest` wire bytes for a single text item:
 *   AddCascadeInputRequest { items[1] = TextOrScopeItem { text = <text> } }
 * Field numbers (verified): AddCascadeInputRequest.items = 1, TextOrScopeItem.text = 1.
 */
export function encodeAddCascadeInputBinary(text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  const item = lenDelimited(1, textBytes);            // TextOrScopeItem { text }
  const request = lenDelimited(1, item);              // AddCascadeInputRequest { items[0] }
  return Uint8Array.from(request);
}

/**
 * The JSON string to hand to `windsurf.sendChatActionMessage` to insert `text`
 * directly into Cascade's input. `payload` is repeated-bytes → a base64 array.
 */
export function buildAddCascadeInputJson(text: string): string {
  const payloadB64 = Buffer.from(encodeAddCascadeInputBinary(text)).toString('base64');
  return JSON.stringify({ actionType: 'addCascadeInput', payload: [payloadB64] });
}

export interface CascadeActionDeps {
  /** Run a command; resolves on success, rejects if the command is absent/throws. */
  executeCommand: (id: string, ...args: unknown[]) => Thenable<unknown>;
  /** List available command ids (test seam / availability gate). */
  getCommands?: (filterInternal?: boolean) => Thenable<string[]>;
}

/**
 * Insert `text` straight into the existing Cascade conversation via the real
 * Windsurf command — focus the panel, then add the input. Returns `true` only if
 * the command exists AND both calls resolved; `false` otherwise so the caller can
 * fall back to the clipboard + keystroke path. Never throws.
 */
export async function injectViaCascadeAction(
  text: string,
  deps: CascadeActionDeps,
): Promise<boolean> {
  // Resolve which candidate command this host registers. When we can enumerate,
  // pick the first present one (or bail if none — avoids a guaranteed-throw on a
  // build that lacks the command). If enumeration fails, optimistically try the
  // canonical id.
  let command: string = SEND_CHAT_ACTION_COMMAND;
  if (deps.getCommands) {
    try {
      const picked = pickCascadeActionCommand(await deps.getCommands(true));
      if (!picked) return false;
      command = picked;
    } catch {
      // fall through and try the canonical id anyway
    }
  }
  try {
    // Reveal + focus the Cascade chat panel (existing conversation).
    await deps.executeCommand(command, OPEN_CHAT_PANEL_JSON);
    // Insert the advisory text into its input.
    await deps.executeCommand(command, buildAddCascadeInputJson(text));
    return true;
  } catch {
    return false;
  }
}
