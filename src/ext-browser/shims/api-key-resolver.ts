/**
 * Browser build stub for `src/config/ApiKeyResolver.ts` (wired by the
 * `nexpath-first-party-stubs` esbuild remap; the CLI always gets the real
 * module). The real resolver drags dotenv + cross-keychain + native keyring
 * bindings — none of which can exist in a browser — while the
 * prompt-enhancement facade only ever calls `isValidApiKey` (a pure regex
 * check) from that module.
 *
 * The regex is duplicated here BY VALUE because the real module cannot be
 * imported without its heavy chain; drift is pinned by a differential test
 * (api-key-resolver-stub.test.ts) that compares this stub against the real
 * implementation character-for-character and behaviourally. Any other export
 * of the real module is deliberately absent so a new engine dependency on the
 * resolver fails the browser build loudly.
 */

export const API_KEY_REGEX = /^sk-[A-Za-z0-9_-]{20,}$/;

export function isValidApiKey(key: string): boolean {
  return API_KEY_REGEX.test(key);
}
