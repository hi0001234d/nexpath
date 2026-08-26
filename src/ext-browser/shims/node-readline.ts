/**
 * Browser stub for `node:readline` — same footing as the node:tty shim: the
 * engine's CLI popup imports it for its default TTY interaction, which the
 * browser never exercises (the service worker injects its own interaction).
 * Every entry point is a loud refusal.
 */
function refuse(what: string): never {
  throw new Error(`nexpath browser shim: node:readline ${what} is not available in the extension`);
}

export function createInterface(): never { refuse('createInterface'); }
export function emitKeypressEvents(): never { refuse('emitKeypressEvents'); }
export function clearScreenDown(): never { refuse('clearScreenDown'); }
export function cursorTo(): never { refuse('cursorTo'); }
export function moveCursor(): never { refuse('moveCursor'); }

export default { createInterface, emitKeypressEvents, clearScreenDown, cursorTo, moveCursor };
