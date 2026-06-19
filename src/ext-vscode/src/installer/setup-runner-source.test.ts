import { describe, it, expect } from 'vitest';
import {
  buildSetupRunnerSource,
  SETUP_RUNNER_FILENAME,
  SETUP_SENTINEL_FILENAME,
} from './setup-runner-source.js';

describe('buildSetupRunnerSource', () => {
  const src = buildSetupRunnerSource();

  it('is CommonJS (require-based) so it runs regardless of package type', () => {
    expect(src).toContain("require('node:child_process')");
    expect(src).toContain("require('node:fs')");
  });

  it('reads stagedDir, sentinel and cliEntry from argv', () => {
    expect(src).toContain('process.argv[2]'); // stagedDir
    expect(src).toContain('process.argv[3]'); // sentinel
    expect(src).toContain('process.argv[4]'); // cliEntry
  });

  it('runs npm install for production deps', () => {
    expect(src).toContain("'install'");
    expect(src).toContain("'--omit=dev'");
  });

  it('does the two-pass agent registration: --for cli (interactive) then --for vscode --yes', () => {
    expect(src).toContain("'install', '--for', 'cli'");
    expect(src).toContain("'install', '--for', 'vscode', '--yes'");
    // the cli pass must precede the vscode pass
    expect(src.indexOf("'--for', 'cli'")).toBeLessThan(src.indexOf("'--for', 'vscode'"));
  });

  it('inherits stdio so the CLI prompts stay interactive in the terminal', () => {
    expect(src).toContain("stdio: 'inherit'");
  });

  it('writes an OK/FAIL sentinel for the extension to poll', () => {
    expect(src).toContain('writeFileSync(sentinel');
    expect(src).toContain("'OK'");
    expect(src).toContain("'FAIL:'");
  });

  it('exposes stable runner + sentinel filenames', () => {
    expect(SETUP_RUNNER_FILENAME).toBe('nexpath-setup-runner.cjs');
    expect(SETUP_SENTINEL_FILENAME).toBe('.setup-sentinel');
  });
});
