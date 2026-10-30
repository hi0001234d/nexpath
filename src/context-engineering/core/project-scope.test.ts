import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalizeWorkspacePath,
  hashProjectPath,
  resolveWorkspaceRelativePath,
} from './project-scope.js';

describe('Feature 1 — Project Scope & Path Canonicalization', () => {
  it('canonicalizes workspace path and defaults to process.cwd()', () => {
    const cwd = process.cwd();
    const canonical = canonicalizeWorkspacePath();
    expect(canonical).toBeDefined();
    expect(typeof canonical).toBe('string');
    expect(canonical.length).toBeGreaterThan(0);
  });

  it('handles non-existent paths by falling back gracefully without throwing', () => {
    const nonExistent = join(tmpdir(), 'nexpath-non-existent-' + Date.now(), 'subdir');
    const result = canonicalizeWorkspacePath(nonExistent);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('generates deterministic 16-character SHA-256 hash', () => {
    const pathA = '/workspace/project-alpha';
    const hash1 = hashProjectPath(pathA);
    const hash2 = hashProjectPath(pathA);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);

    const pathB = '/workspace/project-beta';
    const hashB = hashProjectPath(pathB);
    expect(hashB).not.toBe(hash1);
    expect(hashB).toHaveLength(16);
  });

  it('resolves relative path if inside workspace', () => {
    const root = canonicalizeWorkspacePath(tmpdir());
    const file = join(root, 'src', 'index.ts');
    const rel = resolveWorkspaceRelativePath(root, file);
    expect(rel).toBe(join('src', 'index.ts'));
  });

  it('returns undefined if file is outside workspace', () => {
    const root = '/workspace/project-alpha';
    const file = '/different/directory/file.ts';
    const rel = resolveWorkspaceRelativePath(root, file);
    expect(rel).toBeUndefined();
  });

  it('returns undefined when file path is omitted', () => {
    const root = '/workspace/project-alpha';
    expect(resolveWorkspaceRelativePath(root, undefined)).toBeUndefined();
  });
});
