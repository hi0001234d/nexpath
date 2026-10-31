import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import type { Stage, ClassificationResult, UserProfile } from './types.js';
import {
  PROJECT_FACT_CATEGORIES_V1,
  isPromptEnhancementProjectFactCategoryV1,
  type PromptEnhancementProjectFactCategoryV1,
} from '../prompt-enhancement/project-fact-applicability.js';
import {
  promptEnhancementRelevanceMenuLinesV1,
  normalizePromptEnhancementRelevanceOrderV1,
} from '../prompt-enhancement/section-relevance.js';
import { classifyPrompt } from './PromptClassifier.js';
import { extractApiError, type ApiErrorDetails } from '../utils/api-error.js';
import {
  PROMPT_ENHANCEMENT_PRIMARY_INTENTS,
  PROMPT_ENHANCEMENT_CAPABILITIES,
  DEBUG_EVIDENCE_FORMS,
  type PromptEnhancementPrimaryIntent,
  type PromptEnhancementCapabilityId,
} from '../prompt-enhancement/taxonomy-ids.js';

export { DEBUG_EVIDENCE_FORMS } from '../prompt-enhancement/taxonomy-ids.js';
import {
  STAGE2_MODEL,
  STAGE2_MAX_OUTPUT_TOKENS,
  STAGE2_LLM_MIN_CONFIDENCE,
  STAGE2_CONTEXT_WINDOW,
  STAGE_FROM_LABEL,
  buildFullSignalList,
} from './Stage2Trigger.js';

/**
 * Single-LLM stage classifier.
 *
 * One `gpt-4o-mini` call, fired on every prompt, that REPLACES the old
 * keyword → TF-IDF → embedding cascade AND the separate cross-confirmation pass.
 * The rules those layers encoded — the 8-stage taxonomy, the assess-by-intent
 * signal check, and the profile calibration — now live in the system prompt
 * below, alongside three hardening requirements that prevent a known
 * over-rotation failure (naming a production concept being misread as doing it):
 *   (a) verb-mood awareness — naming/planning a production concept is not the
 *       same as exercising it;
 *   (b) scaffolding suppression — an init/scaffold window is never a release;
 *   (c) release verification-token guard — a release needs a verification-state
 *       token, not merely production nouns.
 *
 * On ANY model failure (network, timeout, unparseable reply) the call degrades to
 * the local keyword/TF-IDF classifier so stage classification keeps working
 * offline; a degraded result never recommends firing an advisory.
 */

/** Timeout for the single classification call (ms). */
export const STAGE_CLASSIFIER_TIMEOUT_MS = 12_000;

/** The model behind the stage classifier (shared with the former cross-confirmation call). */
export const STAGE_CLASSIFIER_MODEL = STAGE2_MODEL;

/**
 * The capability attach/reject conditions, presented in their PROMPT-OBSERVABLE
 * halves — never paraphrased into keyword lists (a paraphrase reintroduces the
 * exact keyword-matching defect this observation replaces). Deliberate scoping,
 * not abridgement: clauses about SYSTEM state (registry data, runtime surfaces,
 * internal signal stores) are not observable from the user's prompt and are
 * evaluated registry-side at attachment, where the FULL locked conditions apply;
 * internal vocabulary is rendered in public-safe equivalents. The model only
 * OBSERVES which conditions the prompt meets; the registry decides every
 * attachment.
 */
const CAPABILITY_OBSERVATION_BLOCK = [
  'CAPABILITY OBSERVATION — for each capability below, report it in "capability_candidates" ONLY when its',
  '"attach when" text describes this prompt and its "do not attach when" text does not. You observe;',
  'the system decides. Do not reduce these conditions to keyword matching.',
  '- capability.decomposition_candidate — Attach when: prompt has many points, broad scope, multiple subtasks, or likely handoff value. Do not attach when: tiny low-risk quick improvement without evidence of multiple bounded subtasks.',
  '- capability.confirmation_needed — Attach when: prompt has binary/affirmative confirmation needs, ambiguity, sensitive actions, high-risk changes, or missing acceptance facts. Do not attach as a generic "be careful" note when action-specific confirmation is required.',
  '- capability.adversarial_review — Attach when: review/deeper-inspection behavior is explicitly requested or source/risk evidence calls for challenge-oriented review. Do not force adversarial behavior into every review prompt.',
  '- capability.project_grounding — Attach when: THIS prompt cannot be answered well without stating a specific project fact, file, module, layer or established pattern — i.e. you would name at least one project-fact category below. Do NOT attach because project facts merely exist or would be vaguely nice to know: that is true of every prompt and makes the signal meaningless. Do not fabricate files/APIs/modules, dump unbounded context, or expose raw private source text.',
  '- capability.verification_required — Attach when: tests/manual checks/regression/build/CI/contract/performance/security verification must be present. Do not attach as generic filler unrelated to the route.',
  '- capability.risk_or_rollback — Attach when: migration, dependency, deployment, production, data, destructive, rollback-heavy, compatibility, secrets/config, or incident-like work is present.',
  '- capability.reproduction_or_evidence_needed — Attach when: a debug prompt LACKS reproduction steps, logs, failing test details, environment, request/response samples, screenshots, metrics, or recent-change evidence. Do not attach to feature/maintenance/review as a root-cause instruction without debug evidence, and do not invent evidence.',
  '- capability.behavior_preservation — Attach when: maintenance/refactor/cleanup/compatibility work should protect current behavior unless the user explicitly asks for behavior change. Do not attach to fresh feature work as a reason to suppress requested new behavior, and do not treat behavior-preserving maintenance as generic polish.',
  '- capability.source_signal_guidance — Attach when: a current stage/absence signal, advisory/source signal, or relevant guidance should become a section in the prompt body.',
].join('\n');

/**
 * PROJECT-FACT APPLICABILITY — which stored project facts THIS prompt actually calls for.
 *
 * ⛔ Ruled by Hiren: the judgement is the model's, because applicability is a question about what a
 * prompt is FOR, and a deterministic map cannot carry that reasoning. Same contract as every other
 * observation here — the model observes, the registry decides — and it rides this already-parked
 * call rather than adding one.
 *
 * The bar is deliberately in the instruction rather than a numeric score: the categories are few
 * and the failure mode being fixed is over-inclusion, so "omit when unsure" is the whole rule.
 */
const PROJECT_FACT_APPLICABILITY_BLOCK = [
  'PROJECT-FACT APPLICABILITY — the system stores a few facts about this project. Report in',
  '"project_fact_candidates" ONLY the categories THIS prompt genuinely calls for: the ones whose',
  'absence would leave the answer worse, or whose value should visibly shape how the work is done.',
  '⛔ Omit when unsure. Naming a category because it exists, or because it is generally good',
  'practice, is the failure this observation exists to prevent — most prompts need NONE of them,',
  'and an empty list is the correct and common answer.',
  ...PROJECT_FACT_CATEGORIES_V1.map((c) => `- ${c.id} (${c.label}) — serves: ${c.serves}.`),
].join('\n');

/**
 * I1 — the RELEVANCE OBSERVATION (§15.2, §47.2 step 1).
 *
 * 🔒 *"an ORDERING, not a deletion — the model deletes nothing"*. It rides THIS already-parked
 * call (§47.1: the decider rides the same parked classifier call; prohibition 3: no new call), as
 * the addition C1 built its section to accept.
 *
 * ⚠️ The model orders section KINDS, not planned sections: this call runs BEFORE routing and
 * planning, so no plan exists yet to rank. I2 applies the ordering to whatever is actually planned.
 *
 * ⛔ Nothing is decided here. The registry prunes in I2 under the LOCKED drop-criteria, where
 * evidence is tested before relevance is even consulted — a section the model ranks last still
 * survives if the criteria say it must.
 */
const RELEVANCE_OBSERVATION_BLOCK = [
  'SECTION RELEVANCE OBSERVATION — the enhanced prompt is built from sections. Order the kinds',
  'below by how much each would SERVE THIS PROMPT, most useful first, in "section_relevance_order".',
  '⛔ This is an ORDERING, not a selection: do NOT omit kinds because they seem unlikely, and do not',
  'decide what gets used — that decision is not yours. Rank what you are given and stop there.',
  '- Rank on what the developer is trying to DO in this prompt, not on which kinds sound generally',
  '  important. A kind that would repeat what they already said is LESS useful, not more.',
  '- If two kinds serve equally, put the one that changes the work first.',
  ...promptEnhancementRelevanceMenuLinesV1(),
].join('\n');

/**
 * The evidence-priority ladder, in its LOCKED ORDER. Rung 7 exists but is
 * DEFERRED — coding-agent response context is not exposed in this version, so
 * the model must never solicit or weigh it.
 */
const INTENT_LADDER_BLOCK = [
  'PRIMARY INTENT — decide which ONE intent from the menu best describes what the developer wants DONE',
  'in the CURRENT (last) prompt. Follow this evidence-priority ladder IN ORDER — earlier rungs always',
  'outweigh later rungs:',
  '1. Explicit current-prompt words and artifacts: error text, failing test names, regression language,',
  '   review verbs, planning verbs, file/module names, risk words, rollout/migration terms.',
  '2. Currently available project/source facts and selected module/layer/file context.',
  '3. Current stage-transition, absence-signal, and related guidance evidence.',
  '4. Recent prompt history (the earlier prompts in the window).',
  '5. Persistent missing-signal memory and prior scoped feedback, including edit feedback.',
  '6. User profile/workstyle/mood signals ONLY as weak tie-breakers — they must NOT override stronger',
  '   prompt, source, signal, risk, or feedback evidence. Never weight mood over an explicit error',
  '   string, a file path, or a review verb.',
  '7. (Deferred — not available.) Coding-agent response context is not exposed in this version:',
  '   never solicit it and never weigh it.',
  'A single word describing WHEN a bug appeared (e.g. "refactor", "migration") does not override',
  'direct evidence of WHAT the developer wants done (a bug report, a stack trace, a failing test).',
  'If no intent is clearly supported by the ladder, return an empty "primary_intent" with low',
  '"intent_confidence" — never guess a specific intent from thin evidence.',
  '',
  'DEBUG EVIDENCE OBSERVATION — independent of intent: report in "debug_evidence_present" which of',
  `these evidence forms the CURRENT prompt already contains: ${DEBUG_EVIDENCE_FORMS.join(', ')}.`,
  'This is an observation of what is present, not a judgement of sufficiency.',
].join('\n');

/** The 40-intent menu, from the typed taxonomy — the model chooses from ALL of them. */
const INTENT_MENU_BLOCK = [
  'INTENT MENU (choose exactly one for "primary_intent", or empty string):',
  ...PROMPT_ENHANCEMENT_PRIMARY_INTENTS.map((intent) => `- ${intent}`),
].join('\n');

/**
 * SENSITIVE-ACTION OBSERVATION — the precision half of the confirmation-line design.
 *
 * The deterministic keyword layer (RISK_PATTERNS) keeps perfect recall and is unchanged;
 * this observation answers the one question no vocabulary can: does the CURRENT prompt
 * PROPOSE performing a risky action, or merely MENTION a risk-flavoured word? It is an
 * APPROVED exception to the additive-only rule (a clearance removes the confirmation
 * line), bound by: only an explicit negative clears, a reasonless clearance is VOID, and
 * absence always fails closed. The instruction therefore pushes the model toward
 * 'proposed'/omission whenever unsure — a wrong 'not_proposed' is the only dangerous
 * direction.
 */
/**
 * SENSITIVE-ACTION OBSERVATION — the precision half of the confirmation-line design.
 *
 * The deterministic keyword layer (RISK_PATTERNS) keeps perfect recall and is unchanged;
 * this observation answers the one question no vocabulary can: does the CURRENT prompt
 * ASK for a risky action to be performed, or does the risky word merely play a harmless
 * role? It is an APPROVED exception to the additive-only rule (a clearance removes the
 * confirmation line), bound by: only an explicit negative clears, a reasonless clearance
 * is VOID, and absence always fails closed.
 *
 * REVISED after live measurement run 1 (recorded in the acceptance results): the first
 * wording let the model judge whether a category seemed dangerous in the abstract, and it
 * wrongly cleared imperative asks it deemed routine (a dependency install; a publish-and-
 * notify). The rule below now states explicitly that an imperative naming the action IS
 * the proposal, using exactly those failures as counter-examples. Run 2 judges this text
 * against the same unchanged recall floor.
 */
// ⛔ SENSITIVE-ACTION OBSERVATION — NOT HERE, BY DESIGN (final, 2026-08-25). Hosting this
// observation on this multi-task prompt failed its absolute recall floor in two live
// measurements (the model cleared risky imperatives against its own verbatim counter-example
// — attention dilution). The owner-approved home is the dedicated micro-call in
// sensitive-action-micro-clearance.ts (45/45 on the frozen set, ship-gated), which produces
// the same provenance field. A test pins that this prompt never carries the fields again;
// the failed block's text and the full measurement record live with the acceptance runner.

/**
 * The stable system prompt — the prefix-cache lever. This is a module constant and
 * MUST stay free of per-call values (the dynamic window/profile go in the user
 * message) so the provider can prefix-cache it across every prompt.
 */
export const STAGE_CLASSIFIER_SYSTEM_PROMPT = [
  'You are a stage classifier for an AI coding-agent session. Given a developer\'s recent prompts,',
  'identify which software-development stage they are currently in, assess which key practices',
  '(signals) are present or absent, and decide whether a brief advisory ("decision session") should fire.',
  '',
  'THE 8 STAGES (choose exactly one for "stage"):',
  '- Idea — exploring the problem/concept before committing to a build: brainstorming, "what if", vision, validating the core idea, an MVP concept.',
  '- PRD/Spec — defining WHAT to build: requirements, specs, user stories, acceptance criteria, feature briefs.',
  '- Architecture — designing the system: system design, data models, database schema, component boundaries, design patterns, ADRs, technical trade-offs.',
  '- Task Breakdown — splitting the work: subtasks, backlog, tickets, sprint plan, checklists, work items and dependencies.',
  '- Implementation — writing/changing code: implement, build the endpoint, add the handler, write the function, refactor, a migration script.',
  '- Review/Testing — verifying correctness: unit/integration tests, running the tests, regression, coverage, reviewing code, edge cases, "does this match the spec".',
  '- Release — shipping to an environment: deploy, publish, push to prod, go live, release a version, tag, changelog, CI/CD pipeline, rollback procedure.',
  '- Feedback Loop — reacting to real usage: user-reported bugs, production incidents, hotfixes, post-launch feedback, monitoring alerts, planning the next iteration.',
  '',
  'HOW TO CLASSIFY — assess INTENT and BEHAVIOUR, not exact keyword match. Weight what the developer is',
  'actually doing over the specific vocabulary they use; low keyword precision is normal, especially for',
  'non-technical or casual developers (see the profile block in the user message).',
  '',
  'VERB-MOOD AWARENESS (critical): distinguish NAMING or PLANNING a production concept from EXERCISING it.',
  'Design/spec/init verbs — "write the spec", "compare trade-offs", "initialize", "set up", "scaffold",',
  '"plan" — are NOT release or implementation activity just because production nouns (deploy, Docker,',
  'Kubernetes, CI/CD, production database) appear in the text. Only an actual deploy/ship imperative',
  '("deploy this", "push to prod", "publish the package", "go live") indicates Release.',
  '',
  'SCAFFOLDING / EARLY-SESSION ANCHOR: when the window contains explicit scaffolding/initialization verbs',
  '— "initialize", "set up the project", "scaffold", "bootstrap", "npm init", "create-<x>", "new project"',
  '— classify by the setup intent (Idea / Architecture / Implementation as appropriate) and DO NOT classify',
  'as Release, regardless of which production dependencies or tools are named.',
  '',
  'VERIFICATION-TOKEN GUARD FOR RELEASE: classify a prompt as Release ONLY if the window contains at least',
  'one verification/release-state token — tests passing, "ready to ship", going live, a production deploy,',
  'cutting/tagging a release, writing release notes, or a rollback. Merely naming production infrastructure',
  '(Docker, CI, prod, cloud) is NOT sufficient for Release.',
  '',
  'SIGNAL ASSESSMENT: for the signals listed in the user message (the practices relevant to the current',
  'stage), decide which are PRESENT (clearly being done/planned) and which are ABSENT. Recommend firing',
  '("fire_decision_session": true) only when an important practice for the stage is genuinely absent, or a',
  'meaningful stage transition warrants a nudge, AND you are reasonably confident. When unsure, prefer false.',
  '',
  INTENT_MENU_BLOCK,
  '',
  INTENT_LADDER_BLOCK,
  '',
  CAPABILITY_OBSERVATION_BLOCK,
  '',
  PROJECT_FACT_APPLICABILITY_BLOCK,
  '',
  RELEVANCE_OBSERVATION_BLOCK,
  '',
  'OUTPUT — return STRICT JSON only, no markdown, no prose:',
  '{',
  '  "stage": "<one of: Idea | PRD/Spec | Architecture | Task Breakdown | Implementation | Review/Testing | Release | Feedback Loop>",',
  '  "stage_confidence": <0.0-1.0>,',
  '  "signals_present": ["<signal_key>"],',
  '  "signals_absent": ["<signal_key>"],',
  '  "fire_decision_session": <true|false>,',
  '  "selected_signal_key": "<one absent signal_key to raise, or empty string>",',
  '  "primary_intent": "<one intent id from the INTENT MENU, or empty string>",',
  '  "intent_confidence": <0.0-1.0>,',
  '  "debug_evidence_present": ["<evidence form>"],',
  '  "capability_candidates": ["<capability id>"],',
  '  "project_fact_candidates": ["<project-fact category id, or omit — empty is normal>"],',
  '  "section_relevance_order": ["<section kind id, most useful first — ALL of them>"],',
  '  "reason": "<one sentence>"',
  '}',
  'FEEDBACK-LOOP BOUNDARY: classify Feedback Loop ONLY when the window contains explicit evidence the product is ALREADY deployed/live for real users (e.g. "its live", "deployed", "published", users actively using it). Building features FOR clients/users (a client portal, sending invoices to clients) is NOT live evidence — without it, bug reports and fixes during building are Implementation or Review/Testing, not Feedback Loop.',
  'ADD-FEATURE REQUESTS: a prompt asking the agent to BUILD or ADD a specific feature now ("add a page...", "add a dashboard...", "make it do X") is Implementation activity — the agent is being asked to write code. Task Breakdown applies only when the developer is organising or splitting work into a plan/list without asking for the build itself.',
].join('\n');

/** Input for one stage classification. */
export interface StageClassifierInput {
  /** The current prompt — used for the local degrade fallback. */
  promptText: string;
  /** Recent prompts to show the model (oldest first); include the current prompt as the last entry. */
  window: readonly { text: string }[];
  /**
   * Current session stage. Deliberately NOT embedded in the model prompt (stating it made
   * the model confirm it — see buildStageClassifierUserMessage); retained for callers,
   * logging, and any non-prompt consumer.
   */
  sessionStage: Stage;
  /** Current session stage confidence. Not embedded in the model prompt (same reason). */
  sessionConfidence: number;
  /** Developer profile for the calibration block (null if not yet computed). */
  profile: UserProfile | null;
}

/** The parsed model assessment (before it is wrapped with a ClassificationResult). */
export interface ParsedStageReply {
  stage: Stage;
  confidence: number;
  signalsPresent: string[];
  signalsAbsent: string[];
  fireRecommendation: boolean;
  selectedSignalKey: string;
  /**
   * The model's intent PROPOSAL from the 40-intent menu ('' when unsupported by
   * the evidence ladder). A proposal only — the router prefers it, the registry
   * decides; and these fields parse SOFTLY (invalid/absent -> ''/0/[]) so an
   * older or partial reply still classifies the stage.
   */
  primaryIntent: PromptEnhancementPrimaryIntent | '';
  intentConfidence: number;
  /** Which debug-evidence forms the current prompt already contains (observation). */
  debugEvidencePresent: readonly (typeof DEBUG_EVIDENCE_FORMS)[number][];
  /** Capability candidates whose locked attach-conditions the model observed as met. */
  capabilityCandidates: readonly PromptEnhancementCapabilityId[];
  /** Project-fact categories THIS prompt calls for. Empty is the common, correct answer. */
  projectFactCandidates: readonly PromptEnhancementProjectFactCategoryV1[];
  /** I1: section kinds ordered most-useful-first for THIS prompt. Observation only. */
  sectionRelevanceOrder: readonly string[];
  /**
   * Sensitive-action precision observation (see StageClassifierResult for the full
   * contract). Parses SOFTLY like its sibling observations — but degrades to ABSENT
   * (undefined), never to a default value, because absence is the fail-closed state.
   */
  sensitiveActionVerdict?: 'proposed' | 'not_proposed';
  sensitiveActionReason?: string;
  /** The model's noun-phrase name for a proposed action. Captured for the record; consumed by nothing. */
  sensitiveActionName?: string;
  reason: string;
}

/** The stage-classifier result: a ClassificationResult-compatible view + the folded assessment. */
export interface StageClassifierResult {
  /** Feeds `processPrompt` — only `stage`/`confidence` are read downstream; `tier`/`allScores` are for shape. */
  classification: ClassificationResult;
  signalsPresent: string[];
  signalsAbsent: string[];
  /** Confidence-gated recommendation to fire a decision session. */
  fireRecommendation: boolean;
  /** The absence signal key the model chose to raise (or ''). */
  selectedSignalKey: string;
  /** Intent proposal + observations (see ParsedStageReply); empty/zero on the degraded path. */
  primaryIntent: PromptEnhancementPrimaryIntent | '';
  intentConfidence: number;
  debugEvidencePresent: readonly (typeof DEBUG_EVIDENCE_FORMS)[number][];
  capabilityCandidates: readonly PromptEnhancementCapabilityId[];
  /** Project-fact categories THIS prompt calls for. Empty is the common, correct answer. */
  projectFactCandidates: readonly PromptEnhancementProjectFactCategoryV1[];
  /** I1: section kinds ordered most-useful-first for THIS prompt. Observation only. */
  sectionRelevanceOrder: readonly string[];
  /**
   * Sensitive-action precision observation: does the CURRENT prompt PROPOSE performing a
   * risky action, or merely MENTION a risk-flavoured word? Absent until the prompt block
   * asks for it, and absent on the degraded path — absence always fails CLOSED downstream
   * (the confirmation is emitted). Unlike every earlier observation, "no answer" and "the
   * safe answer" are OPPOSITES here, so only an explicit 'not_proposed' WITH a non-empty
   * reason can ever clear anything.
   */
  sensitiveActionVerdict?: 'proposed' | 'not_proposed';
  /** Required for a clearance to count: what the benign reading IS. Reasonless clearances are void. */
  sensitiveActionReason?: string;
  /** The model's noun-phrase name for a proposed action. Captured for the record; consumed by nothing. */
  sensitiveActionName?: string;
  reason: string;
  /** True when this result came from the local fallback (the model was unavailable). */
  degraded: boolean;
}

// `ClassificationResult.tier` is a legacy cascade field; the single-LLM classifier is not a tier.
// Production reads only stage/confidence, so this value is cosmetic (shape compatibility only).
const LLM_TIER = 3 as const;

/** The per-profile calibration block (mirrors the former cross-confirmation prompt). */
function profileBlock(profile: UserProfile | null): string {
  if (!profile) return 'Developer profile: not yet computed — assess signals without profile context.';
  const natureNote =
    profile.nature === 'beginner'    ? ' (non-technical, uses plain language — not SWE vocabulary)'
    : profile.nature === 'cool_geek' ? ' (casual, informal — everyday language, not SWE terms)'
    : profile.nature === 'hardcore_pro' ? ' (experienced engineer, precise vocabulary)'
    : ' (experienced engineer, expressive vocabulary)';
  return [
    'Developer profile context:',
    `- Nature: ${profile.nature}${natureNote}`,
    `- Technical depth: ${profile.depth}`,
    `- Current mood: ${profile.mood}`,
    'Calibration: low stage confidence is normal for beginner/cool_geek profiles — weight behavioural patterns over vocabulary precision.',
  ].join('\n');
}

/**
 * Build the dynamic user message (never cached): calibration + profile + window + the
 * all-stages signal checklist. Deliberately does NOT state the session's current stage:
 * asserting it made the model confirm that stage instead of classifying the prompts
 * (sessions start at idea, the manager feeds the last output back in, and the session
 * locked there). The stage is detected fresh from the window on every call.
 */
export function buildStageClassifierUserMessage(input: StageClassifierInput, contextWindow = STAGE2_CONTEXT_WINDOW): string {
  const recent = input.window.slice(-contextWindow);
  const promptLines = recent.map((p, i) => `[${i + 1}] ${p.text}`).join('\n');
  return [
    'Current session context:',
    'Stage calibration: treat the work as having moved to a later stage only when the prompts clearly show building, verifying, or shipping activity; early exploratory, cosmetic, or scoping requests belong to Idea.',
    '',
    profileBlock(input.profile),
    '',
    `Recent developer prompts (oldest first, last ${recent.length}):`,
    promptLines,
    '',
    'Signals to check (across ALL stages):',
    buildFullSignalList(),
  ].join('\n');
}

/**
 * Parse the raw model reply into a ParsedStageReply. Strips markdown fencing, validates
 * every field, maps the human stage label back to the enum, and applies the
 * low-confidence override (below `minConfidence` ⇒ do not fire). Throws on
 * invalid/incomplete JSON — the caller catches and degrades.
 */
export function parseStageClassifierReply(raw: string, minConfidence = STAGE2_LLM_MIN_CONFIDENCE): ParsedStageReply {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`stage-classifier: invalid JSON response: ${raw.slice(0, 120)}`);
  }
  const p = parsed as Record<string, unknown>;

  if (typeof p.stage !== 'string') throw new Error('stage-classifier: missing or non-string "stage"');
  if (typeof p.stage_confidence !== 'number') throw new Error('stage-classifier: missing or non-number "stage_confidence"');
  if (!Array.isArray(p.signals_present)) throw new Error('stage-classifier: missing or non-array "signals_present"');
  if (!Array.isArray(p.signals_absent)) throw new Error('stage-classifier: missing or non-array "signals_absent"');
  if (typeof p.fire_decision_session !== 'boolean') throw new Error('stage-classifier: missing or non-boolean "fire_decision_session"');
  if (typeof p.reason !== 'string') throw new Error('stage-classifier: missing or non-string "reason"');

  const stage = STAGE_FROM_LABEL[p.stage as string];
  if (!stage) throw new Error(`stage-classifier: unknown stage label "${p.stage}"`);

  const confidence = Math.max(0, Math.min(1, p.stage_confidence as number));
  // Low confidence → don't bother the user, regardless of the model's own flag.
  const fireRecommendation = (p.fire_decision_session as boolean) && confidence >= minConfidence;
  const selectedSignalKey = typeof p.selected_signal_key === 'string' ? p.selected_signal_key : '';

  // Intent + observation fields parse SOFTLY: they are proposals/observations the
  // router and registry consume, so an invalid or absent value degrades to
  // ''/0/[] instead of failing the stage classification.
  const rawIntent = typeof p.primary_intent === 'string' ? p.primary_intent : '';
  const primaryIntent = (PROMPT_ENHANCEMENT_PRIMARY_INTENTS as readonly string[]).includes(rawIntent)
    ? (rawIntent as PromptEnhancementPrimaryIntent)
    : '';
  const intentConfidence = typeof p.intent_confidence === 'number'
    ? Math.max(0, Math.min(1, p.intent_confidence))
    : 0;
  const debugEvidencePresent = (Array.isArray(p.debug_evidence_present) ? p.debug_evidence_present : [])
    .filter((x): x is (typeof DEBUG_EVIDENCE_FORMS)[number] =>
      typeof x === 'string' && (DEBUG_EVIDENCE_FORMS as readonly string[]).includes(x));
  const capabilityCandidates = (Array.isArray(p.capability_candidates) ? p.capability_candidates : [])
    .filter((x): x is PromptEnhancementCapabilityId =>
      typeof x === 'string' && (PROMPT_ENHANCEMENT_CAPABILITIES as readonly string[]).includes(x));
  // ⚠️ Absent parses to [] like its siblings — but downstream it must NOT be confused with an
  // observation that ran and named nothing. The distinction is carried at the boundary, where an
  // absent CHANNEL (no key, failed call) is undefined and fails closed.
  const projectFactCandidates = (Array.isArray(p.project_fact_candidates) ? p.project_fact_candidates : [])
    .filter(isPromptEnhancementProjectFactCategoryV1);
  // I1: unknown kinds and repeats are dropped, order preserved — a ranking with a slip in it
  // is still a ranking, and refusing the whole reply over one would cost the observation.
  const sectionRelevanceOrder = normalizePromptEnhancementRelevanceOrderV1(p.section_relevance_order);
  // Sensitive-action verdict: soft like its siblings, but its degraded form is ABSENT
  // (undefined) — never a default — because for this one field "no answer" and "the safe
  // answer" are opposites, and absence is what fails closed downstream. Anything other than
  // the two exact verdict strings parses to undefined; a reason parses only as a non-empty
  // string (a whitespace-only reason is no reason).
  const sensitiveActionVerdict = p.sensitive_action_verdict === 'proposed' || p.sensitive_action_verdict === 'not_proposed'
    ? p.sensitive_action_verdict
    : undefined;
  const sensitiveActionReason = typeof p.sensitive_action_reason === 'string' && p.sensitive_action_reason.trim().length > 0
    ? p.sensitive_action_reason
    : undefined;

  return {
    stage,
    confidence,
    signalsPresent: (p.signals_present as unknown[]).filter((x): x is string => typeof x === 'string'),
    signalsAbsent: (p.signals_absent as unknown[]).filter((x): x is string => typeof x === 'string'),
    fireRecommendation,
    selectedSignalKey,
    primaryIntent,
    intentConfidence,
    debugEvidencePresent,
    capabilityCandidates,
    projectFactCandidates,
    sectionRelevanceOrder,
    sensitiveActionVerdict,
    sensitiveActionReason,
    reason: p.reason as string,
  };
}

/** Wrap a ParsedStageReply as a StageClassifierResult with a ClassificationResult view. */
function toResult(parsed: ParsedStageReply): StageClassifierResult {
  return {
    classification: {
      stage: parsed.stage,
      confidence: parsed.confidence,
      tier: LLM_TIER,
      allScores: { [parsed.stage]: parsed.confidence },
    },
    signalsPresent: parsed.signalsPresent,
    signalsAbsent: parsed.signalsAbsent,
    fireRecommendation: parsed.fireRecommendation,
    selectedSignalKey: parsed.selectedSignalKey,
    primaryIntent: parsed.primaryIntent,
    intentConfidence: parsed.intentConfidence,
    debugEvidencePresent: parsed.debugEvidencePresent,
    capabilityCandidates: parsed.capabilityCandidates,
    projectFactCandidates: parsed.projectFactCandidates,
    sectionRelevanceOrder: parsed.sectionRelevanceOrder,
    sensitiveActionVerdict: parsed.sensitiveActionVerdict,
    sensitiveActionReason: parsed.sensitiveActionReason,
    reason: parsed.reason,
    degraded: false,
  };
}

/** Local degrade fallback: classify the stage with the keyword/TF-IDF cascade; never recommends firing. */
async function degrade(promptText: string): Promise<StageClassifierResult> {
  const local = await classifyPrompt(promptText);
  return {
    classification: local,
    // The degraded path PROPOSES nothing: the deterministic no-key routing owns
    // these prompts, so intent/observations stay empty.
    primaryIntent: '',
    intentConfidence: 0,
    debugEvidencePresent: [],
    capabilityCandidates: [],
    projectFactCandidates: [],
    sectionRelevanceOrder: [],
    // The sensitive-action verdict/reason are deliberately OMITTED here: a degraded call
    // carries no clearance, and omission is the fail-closed state (the confirmation emits).
    signalsPresent: [],
    signalsAbsent: [],
    fireRecommendation: false,
    selectedSignalKey: '',
    reason: 'degraded: local classifier fallback (model unavailable)',
    degraded: true,
  };
}

/** Explicit scaffolding / project-initialization markers — a setup window, not a release. */
const SCAFFOLDING_RE =
  /\b(initiali[sz]e|scaffold(?:ing)?|bootstrap(?:ping)?|new project|project setup|from scratch)\b|set up (?:the |a )?(?:project|repo|new)|npm init|(?:npm|yarn|pnpm) create|create-[a-z]/i;
/** Genuine release / verification-state tokens — a real deploy/ship imperative or a verification signal. */
const VERIFICATION_RE =
  /\b(deploy|deploying|deployed|publish(?:ing|ed)?|ship(?:ping|ped)?|go live|going live|push to prod|pushing to prod|roll ?back|release notes|tag(?:ging)? (?:a |the )?(?:release|version)|cut(?:ting)? (?:a |the )?release|tests? (?:are )?passing|passing tests|ready to ship|qa (?:approved|sign))\b/i;

/**
 * Deterministic backstop behind the prompt rules: a scaffolding/initialization window
 * with NO release/verification token is never a real release, regardless of which
 * production nouns appear. When the classifier returns `release` in that situation the
 * classification is neutralised — confidence is forced to 0 (so the stage transition is
 * blocked upstream) and the advisory is suppressed. Runs on BOTH the model path and the
 * local fallback (the fallback cascade cannot make this distinction on its own).
 */
export function applyReleaseGuard(result: StageClassifierResult, windowText: string): StageClassifierResult {
  if (result.classification.stage !== 'release') return result;
  if (!SCAFFOLDING_RE.test(windowText) || VERIFICATION_RE.test(windowText)) return result;
  return {
    ...result,
    classification: { ...result.classification, confidence: 0, allScores: { release: 0 } },
    fireRecommendation: false,
    reason: `${result.reason} [release suppressed: scaffolding window without a verification token]`,
  };
}

/**
 * Classify one prompt with the single-LLM stage classifier. Makes the single
 * `gpt-4o-mini` call; on any failure (API error, timeout, empty, or unparseable
 * reply) returns the local degrade result. A deterministic release guard runs on
 * either path. Never throws.
 */
export async function classifyStage(
  input: StageClassifierInput,
  client?: OpenAI,
  config?: {
    minConfidence?: number;
    contextWindow?: number;
    /**
     * Called when the provider call FAILED — not when there was no credential
     * to make one with. Degrading stays silent to the user either way; this
     * only lets a caller that owns a log record which of the two happened.
     *
     * ⚠️ A callback rather than a logger import: this module is bundled into
     * the browser service worker, where `src/logger.ts`'s `node:fs` cannot go.
     */
    onProviderError?: (details: ApiErrorDetails) => void;
  },
): Promise<StageClassifierResult> {
  const minConfidence = config?.minConfidence ?? STAGE2_LLM_MIN_CONFIDENCE;
  const contextWindow = config?.contextWindow ?? STAGE2_CONTEXT_WINDOW;
  const windowText = input.window.map((w) => w.text).join('\n');

  let result: StageClassifierResult;
  // ⚠️ Separates "we never got a reply" from "the reply was unusable". A garbage
  // or empty reply also lands in the catch below — `parseStageClassifierReply`
  // throws on one — but the provider DID answer, so it is not a provider
  // failure and must not be reported as one.
  let providerAnswered = false;
  try {
    // Construct inside the try: with no client and no API key, `new OpenAI()` throws
    // synchronously — degrade to the local classifier instead of crashing the caller.
    const openai = client ?? newNexpathOpenAIClient();
    const response = await openai.chat.completions.create(
      {
        model: STAGE_CLASSIFIER_MODEL,
        messages: [
          { role: 'system', content: STAGE_CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: buildStageClassifierUserMessage(input, contextWindow) },
        ],
        temperature: 0,
        max_tokens: STAGE2_MAX_OUTPUT_TOKENS,
      },
      { timeout: STAGE_CLASSIFIER_TIMEOUT_MS },
    );
    providerAnswered = true;
    const rawReply = response.choices[0]?.message?.content ?? '';
    result = rawReply ? toResult(parseStageClassifierReply(rawReply, minConfidence)) : await degrade(input.promptText);
  } catch (err) {
    // Degrading is still right. Degrading SILENTLY was not: a refused call and
    // a machine with no credential at all produced identical behaviour and
    // identical silence, so "guidance went quiet" had no traceable cause.
    //
    // ⚠️ It reports the SHAPE of the failure and does not interpret it. This
    // layer cannot know what a given status means for a given provider — and
    // for the Nexpath service in particular, which code an exhausted balance
    // returns is not settled. Naming a cause we have not confirmed would be
    // worse than the silence it replaces; the status is reported and the reader
    // decides.
    //
    // A construction failure (no credential) never reaches the network and so
    // carries no status — which is exactly what tells the two apart.
    if (!providerAnswered) config?.onProviderError?.(extractApiError(err, 'openai'));
    result = await degrade(input.promptText);
  }
  return applyReleaseGuard(result, windowText);
}
