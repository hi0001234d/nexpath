/**
 * Browser build stub for `src/store/db.ts` (wired by the
 * `nexpath-first-party-stubs` esbuild remap; the CLI always gets the real
 * module). The real module owns the sql.js/WASM store — meaningless in the
 * extension, whose data layer is IndexedDB + storage.local — but it sits in
 * the prompt-enhancement engine's import graph through `store/config.ts`
 * (source-reality reads the real `DEFAULT_CONFIG` table from there, and
 * keeping that DATA real is exactly why config.ts is NOT stubbed).
 *
 * Every function here throws loudly: nothing in the browser bundle is allowed
 * to open or write the CLI's sql.js store. If a bundled path ever calls one of
 * these, that is a genuine wiring bug that must surface immediately — not
 * degrade silently.
 */

export type Store = unknown;

export const DEFAULT_DB_PATH = '/nexpath-browser-home/.nexpath/prompt-store.db';

function refuse(fn: string): never {
  throw new Error(`nexpath store-db browser stub: ${fn}() is not available in the extension — the browser data layer is IndexedDB/storage.local`);
}

export async function getSql(): Promise<never> { refuse('getSql'); }
export async function openStore(_dbPath?: string): Promise<never> { refuse('openStore'); }
export function saveStore(_store: Store): never { refuse('saveStore'); }
export function closeStore(_store: Store): never { refuse('closeStore'); }
export function releaseStoreLock(_store: Store): never { refuse('releaseStoreLock'); }
export async function reacquireStoreLock(_store: Store): Promise<never> { refuse('reacquireStoreLock'); }
export async function withReleasedStoreLockV1<T>(_store: Store, _fn: () => Promise<T>): Promise<never> { refuse('withReleasedStoreLockV1'); }
