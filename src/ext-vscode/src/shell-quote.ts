/**
 * RC66 (Windows/Cursor marketplace tester "SALVI GAURAV", 2026-08-25) —
 * quoting for win32 `shell: true` spawns.
 *
 * With `shell: true`, Node CONCATENATES the command and args into one line
 * with NO escaping (its own DEP0190 warns about exactly this). Any token
 * containing a space then splits: the health probe ran
 *     node C:\Users\SALVI GAURAV\.nexpath\...\index.js --version
 * and node tried to execute `C:\Users\SALVI` — so a perfectly healthy staged
 * CLI was reported "dependencies missing/incomplete" on EVERY machine whose
 * Windows username contains a space, looping setup forever with an error
 * toast after each run. Same class RC29 fixed in the hooks.json writer; these
 * are the two remaining shell-spawn sites (prereq probe + ipc auto/stop).
 *
 * Node's shell wrapper on win32 encloses the whole joined command in its own
 * outer quotes (`cmd.exe /d /s /c "<joined>"`), so pre-quoting individual
 * tokens here is preserved verbatim — the standard, well-trodden fix.
 *
 * A `"` cannot appear in a Windows path at all, so embedded quotes are
 * stripped rather than escaped (RC29's rule, verbatim). Tokens without
 * whitespace are returned UNCHANGED — on every space-free machine the spawned
 * command line is byte-identical to before this fix.
 */
export function quoteForWindowsShell(token: string): string {
  if (!/\s/.test(token)) return token;
  return `"${token.replace(/"/g, '')}"`;
}

/**
 * Shell-safe (bin, args) for a `shell: platform === 'win32'` spawn.
 * Off win32 the shell is never used there — tokens pass through untouched.
 */
export function shellSafeSpawnTokens(
  bin: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): { bin: string; args: string[] } {
  if (platform !== 'win32') return { bin, args };
  return { bin: quoteForWindowsShell(bin), args: args.map(quoteForWindowsShell) };
}
