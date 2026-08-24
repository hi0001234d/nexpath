import OpenAI from 'openai';
import type { Stage, ClassificationResult, UserProfile } from './types.js';
import { classifyPrompt } from './PromptClassifier.js';
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
  'OUTPUT — return STRICT JSON only, no markdown, no prose:',
  '{',
  '  "stage": "<one of: Idea | PRD/Spec | Architecture | Task Breakdown | Implementation | Review/Testing | Release | Feedback Loop>",',
  '  "stage_confidence": <0.0-1.0>,',
  '  "signals_present": ["<signal_key>"],',
  '  "signals_absent": ["<signal_key>"],',
  '  "fire_decision_session": <true|false>,',
  '  "selected_signal_key": "<one absent signal_key to raise, or empty string>",',
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

  return {
    stage,
    confidence,
    signalsPresent: (p.signals_present as unknown[]).filter((x): x is string => typeof x === 'string'),
    signalsAbsent: (p.signals_absent as unknown[]).filter((x): x is string => typeof x === 'string'),
    fireRecommendation,
    selectedSignalKey,
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
    reason: parsed.reason,
    degraded: false,
  };
}

/** Local degrade fallback: classify the stage with the keyword/TF-IDF cascade; never recommends firing. */
async function degrade(promptText: string): Promise<StageClassifierResult> {
  const local = await classifyPrompt(promptText);
  return {
    classification: local,
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
  config?: { minConfidence?: number; contextWindow?: number },
): Promise<StageClassifierResult> {
  const minConfidence = config?.minConfidence ?? STAGE2_LLM_MIN_CONFIDENCE;
  const contextWindow = config?.contextWindow ?? STAGE2_CONTEXT_WINDOW;
  const windowText = input.window.map((w) => w.text).join('\n');

  let result: StageClassifierResult;
  try {
    // Construct inside the try: with no client and no API key, `new OpenAI()` throws
    // synchronously — degrade to the local classifier instead of crashing the caller.
    const openai = client ?? new OpenAI();
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
    const rawReply = response.choices[0]?.message?.content ?? '';
    result = rawReply ? toResult(parseStageClassifierReply(rawReply, minConfidence)) : await degrade(input.promptText);
  } catch {
    result = await degrade(input.promptText);
  }
  return applyReleaseGuard(result, windowText);
}
