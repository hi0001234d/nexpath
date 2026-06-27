import { describe, it, expect } from 'vitest';
import { buildGroundingLines, buildEmbeddingPrompt, type ArtifactConfidence } from './OptionGenerator.js';
import type { PromptRecord } from '../classifier/types.js';

const zero: ArtifactConfidence = { spec: 0, unitTests: 0, e2eTests: 0, taskBreakdown: 0 };
const p = (text: string): PromptRecord => ({ text } as unknown as PromptRecord);
type EmbedOpts = Parameters<typeof buildEmbeddingPrompt>[0];

describe('R13 Gap-1 — early-session forward-looking grounding band', () => {
  it('adds the forward-looking instruction when all implementation artifacts are zero', () => {
    const lines = buildGroundingLines(zero);
    expect(lines).toMatch(/FORWARD-LOOKING/);
    expect(lines.toLowerCase()).toContain('early session');
  });

  it('does NOT add it once any implementation artifact is detected (spec / unit / e2e)', () => {
    expect(buildGroundingLines({ ...zero, unitTests: 60 })).not.toMatch(/FORWARD-LOOKING/);
    expect(buildGroundingLines({ ...zero, spec: 40 })).not.toMatch(/FORWARD-LOOKING/);
    expect(buildGroundingLines({ ...zero, e2eTests: 30 })).not.toMatch(/FORWARD-LOOKING/);
  });

  it('keys on artifact-zero only — taskBreakdown alone does not suppress the band', () => {
    expect(buildGroundingLines({ ...zero, taskBreakdown: 30 })).toMatch(/FORWARD-LOOKING/);
  });
});

describe('R13 Gap-2 — Pass-2 grounds the three new target phrases', () => {
  const opts = { l1: ['Review this phase before moving on.'], l2: ['Check this service.'], l3: ['Any issue in this boundary?'] } as unknown as EmbedOpts;
  const prompt = buildEmbeddingPrompt(opts, [p('working on the api')]);

  it('lists "this phase" / "this service" / "this boundary" as groundable phrases', () => {
    expect(prompt).toContain('this phase');
    expect(prompt).toContain('this service');
    expect(prompt).toContain('this boundary');
  });

  it('still lists the original generic phrases (additive, not a replacement)', () => {
    expect(prompt).toContain('what was just built');
    expect(prompt).toContain('this project');
    expect(prompt).toContain('this feature');
  });
});
