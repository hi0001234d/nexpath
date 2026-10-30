/**
 * Feature 1 — Context Engineering: Two-Tier Section Router & Compulsory Grounding Guard (Module 10)
 *
 * Routes ranked facts into:
 *  - Tier 1: Matching active sections (Context and constraints, Risk, safety and confirmation)
 *  - Tier 2: Dedicated "Project facts" (project_grounding_facts) section
 *
 * Compulsory Grounding Rule:
 *  - When Project facts receives >= 1 fact, it is flagged as a Mandatory Survivor Section
 *    (isMandatorySurvivorSection = true) so pruners cannot drop it under token pressure.
 *
 * Clean Prompt Text Guarantee:
 *  - Injected text contains ZERO synthetic tags (@file:..., @rule:...) and ZERO invented file paths.
 */

import type {
  ScoredFact,
  PromptSection,
} from '../types/context-engineering.js';

export type { PromptSection };

export interface SectionRoutingResult {
  sections: PromptSection[];
  enhancedPrompt: string;
  hasInjectedContent: boolean;
  tier1LineCount: number;
  tier2LineCount: number;
}

/**
 * Routes scored facts and workspace metadata into clean Two-Tier sections,
 * and composes the enhanced prompt.
 */
export function routeSectionsAndCompose(
  rawPrompt: string,
  allocatedFacts: ScoredFact[],
  workspaceLines: string[] = []
): SectionRoutingResult {
  if (allocatedFacts.length === 0 && workspaceLines.length === 0) {
    return {
      sections: [],
      enhancedPrompt: rawPrompt,
      hasInjectedContent: false,
      tier1LineCount: 0,
      tier2LineCount: 0,
    };
  }

  const contextAndConstraintsLines: string[] = [];
  const riskSafetyLines: string[] = [];
  const projectFactsLines: string[] = [];

  // Workspace lines always go to Tier 2 (Project facts)
  for (const wl of workspaceLines) {
    projectFactsLines.push(wl);
  }

  // Route facts into Tier 1 or Tier 2
  for (const item of allocatedFacts) {
    const kind = item.fact.kind;
    const contentLower = item.fact.content.toLowerCase();
    const line = item.formattedLine;

    // Failures, pattern alerts, and safety-critical items route to Tier 1: Risk, safety and confirmation
    if (
      kind === 'failure' ||
      kind === 'pattern_alert' ||
      contentLower.includes('risk') ||
      contentLower.includes('crash') ||
      contentLower.includes('credential') ||
      contentLower.includes('rollback')
    ) {
      riskSafetyLines.push(line);
    }
    // Specific implementation rules, constraints, decisions route to Tier 1: Context and constraints
    else if (
      kind === 'constraint' ||
      kind === 'decision' ||
      (kind === 'rule' && (item.fact.locked === 1 || item.score >= 0.50))
    ) {
      contextAndConstraintsLines.push(line);
    }
    // General conventions, patterns, and overflow facts route to Tier 2: Project facts
    else {
      projectFactsLines.push(line);
    }
  }

  const sections: PromptSection[] = [];

  // --------------------------------------------------------------------------
  // Tier 1 Sections
  // --------------------------------------------------------------------------
  if (contextAndConstraintsLines.length > 0) {
    sections.push({
      id: 'context_and_constraints',
      title: 'Context and constraints',
      lines: contextAndConstraintsLines,
      isMandatorySurvivorSection: false,
    });
  }

  if (riskSafetyLines.length > 0) {
    sections.push({
      id: 'risk_safety_confirmation',
      title: 'Risk, safety and confirmation',
      lines: riskSafetyLines,
      isMandatorySurvivorSection: false,
    });
  }

  // --------------------------------------------------------------------------
  // Tier 2 Section (Project facts — Compulsory Survivor)
  // --------------------------------------------------------------------------
  if (projectFactsLines.length > 0) {
    sections.push({
      id: 'project_grounding_facts',
      title: 'Project facts',
      lines: projectFactsLines,
      isMandatorySurvivorSection: true, // Compulsory Grounding Rule
    });
  }

  // --------------------------------------------------------------------------
  // Compose Enhanced Prompt Text
  // --------------------------------------------------------------------------
  const promptParts: string[] = [rawPrompt.trim()];

  if (sections.length > 0) {
    promptParts.push('\n---');
    for (const sec of sections) {
      promptParts.push(`\n### ${sec.title}`);
      for (const line of sec.lines) {
        promptParts.push(line);
      }
    }
  }

  const enhancedPrompt = promptParts.join('\n');
  const tier1Count = contextAndConstraintsLines.length + riskSafetyLines.length;
  const tier2Count = projectFactsLines.length;

  return {
    sections,
    enhancedPrompt,
    hasInjectedContent: sections.length > 0,
    tier1LineCount: tier1Count,
    tier2LineCount: tier2Count,
  };
}

/**
 * Prunes sections under line budget constraints while strictly preserving
 * any mandatory survivor sections (e.g. project_grounding_facts / "Project facts").
 * Satisfies TC-SEC-RTR-6 & Compulsory Grounding Rule.
 */
export function pruneSections(
  sections: PromptSection[],
  maxTotalLines: number
): PromptSection[] {
  const total = sections.reduce((acc, s) => acc + s.lines.length, 0);
  if (total <= maxTotalLines) return sections;

  const mandatorySections = sections.filter((s) => s.isMandatorySurvivorSection);
  const nonMandatorySections = sections.filter((s) => !s.isMandatorySurvivorSection);

  const mandatoryLinesCount = mandatorySections.reduce((acc, s) => acc + s.lines.length, 0);
  let remainingBudget = Math.max(0, maxTotalLines - mandatoryLinesCount);

  const prunedNonMandatory: PromptSection[] = [];
  for (const sec of nonMandatorySections) {
    if (remainingBudget <= 0) break;
    const linesToTake = Math.min(sec.lines.length, remainingBudget);
    prunedNonMandatory.push({
      ...sec,
      lines: sec.lines.slice(0, linesToTake),
    });
    remainingBudget -= linesToTake;
  }

  // Mandatory survivor sections are ALWAYS kept intact
  return [...prunedNonMandatory, ...mandatorySections];
}
