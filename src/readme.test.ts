import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// README sits at the repo root, one directory above src/.
const README_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'README.md',
);

const readme = readFileSync(README_PATH, 'utf8');

describe('README — public-safe content guard', () => {
  it('does not leak internal planning terminology', () => {
    // These terms belong to the private reviewduel-submodule planning artefacts and
    // must never appear in the public README. Each was an actual internal term used
    // during development of this project; the public docs reference only user-facing
    // surfaces.
    const forbidden = [
      'sub-10',
      'sub-9',
      'sub-8',
      'sub-7',
      'autoresearch',
      'reviewduel-submodule',
      'dev plan',
      'devplan',
      'review before going public',
      'internal planning',
    ];
    for (const term of forbidden) {
      expect(
        readme.toLowerCase(),
        `README should not contain internal term "${term}"`,
      ).not.toContain(term.toLowerCase());
    }
  });

  it('documents the user-facing frequency and role surfaces', () => {
    expect(readme).toContain('Frequency and Role');
    expect(readme).toContain('every_event');
    expect(readme).toContain('optimum');
    expect(readme).toContain('major_only');
    expect(readme).toContain('once_per_session');
    expect(readme).toContain('off');
    expect(readme).toContain('indie_hacker');
    expect(readme).toContain('founder');
    expect(readme).toContain('pm');
    expect(readme).toContain('vibe_coder');
  });

  it('documents Ctrl+T for inline configuration', () => {
    expect(readme).toContain('Ctrl+T');
    expect(readme).toContain('Cmd+T');
  });
});
