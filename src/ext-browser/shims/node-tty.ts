/**
 * Browser stub for `node:tty` — reached only through the engine's CLI submit
 * popup module (`prompt-enhancement/cli-submit-popup.ts`), whose default
 * TTY interaction the browser NEVER uses (the service worker always injects
 * its own `interaction`, so the TTY branch is statically unreachable). The
 * classes exist so the import resolves; constructing one is a loud failure,
 * never silent emulation.
 */
function refuse(what: string): never {
  throw new Error(`nexpath browser shim: node:tty ${what} is not available in the extension`);
}

export class ReadStream {
  constructor() { refuse('ReadStream'); }
}

export class WriteStream {
  constructor() { refuse('WriteStream'); }
}

export default { ReadStream, WriteStream };
