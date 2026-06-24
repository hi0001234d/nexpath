// Per-class decision-session content (class8_role_cluster). Relocated verbatim from
// options.ts / options-beginner.ts — one home per signal class.

import type { DecisionContent } from '../options.js';
import { WHY_HELP_BY_SIGNAL_TYPE } from '../why-help-by-signal-type.js';

// ── Phase 6 E1-E3 — founder role CASUAL content ───────────────────────────────
export const ABSENCE_USER_VALUE_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_USER_VALUE_CHECK",
  question: 'Has this feature been validated with real users?',
  pinchFallback: 'Check user signal before committing to this build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_VALUE_CHECK'],
  L1: [
    {
      option: 'The single biggest waste in product development is building something nobody asked for. Lean Startup core loop: before any feature build, check whether you have a user signal — a conversation, a behavioral observation, a direct request, or survey data — that confirms the problem you\'re solving is real for your users. Without signal, you\'re making a bet, not a decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to build but I haven't checked whether real users actually asked for this."}
User signal for this feature hasn't been validated — risk of building something nobody asked for.
Confirm signal: conversation / behavioral observation / direct request / survey data — before bet becomes decision.
{R4_CLOSE}`,
    },
    {
      option: 'User validation doesn\'t have to be formal. Showing a sketch to 5 users beats shipping a polished feature to zero signal. The goal is to reduce the chance that the feature solves a problem that only exists in the builder\'s imagination. Customer discovery question: did at least one real user tell you they need this, or did you observe them struggling with the absence of it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Lean validation not done."}
The customer-discovery validation hasn't been done.
Sketch to 5 users beats polished to zero signal — did one real user say they need this?
{R4_CLOSE}`,
    },
    {
      option: 'If you haven\'t validated yet: pause and define the minimum signal that would confirm this feature is worth building. A user interview, a feature request count, a survey question, or behavioral data from existing usage. The cost of a short validation step is always lower than the cost of shipping an unvalidated feature and finding out it doesn\'t get used.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Minimum validation signal not defined."}
The minimum-validation-signal definition hasn't been done.
Interview / request count / survey / behavioural data — short validation costs less than shipped-but-unused.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What user signal do you have that this feature is worth building? A request, observation, or research data — any concrete signal reduces the build risk.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Lighter: concrete signal — request / observation / research data.
{R4_CLOSE}`,
    },
    {
      option: 'Minimum validation: can you point to one user who said they need this, or behavioral data showing they struggle without it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Narrower: one user said-need OR behavioural struggle-without-it.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Pause to validate with at least one real user before committing to this build.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering this build."}
Minimum next step: one-real-user validation before commit.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_OUTCOME_DEFINITION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_OUTCOME_DEFINITION",
  question: 'What does success look like for this feature?',
  pinchFallback: 'Define the success metric before building starts.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_OUTCOME_DEFINITION'],
  L1: [
    {
      option: 'An output is something you ship. An outcome is the change in user behavior that justifies shipping it. The OKR discipline applied to product: before building, write one sentence that completes "This feature is successful if...". Without that sentence, you can\'t evaluate whether the feature worked, you can\'t communicate success criteria to teammates, and you can\'t decide when the feature is done enough to ship.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ship without defining what success looks like."}
The success outcome for this feature hasn't been defined — without it, ship/no-ship can't be evaluated.
Complete: "This feature is successful if ..." — output is ship; outcome is user behaviour change.
{R4_CLOSE}`,
    },
    {
      option: 'Write the success metric for this feature in observable form: name the user behaviour or system metric, the threshold that defines success, and the timeframe — e.g. "feature is used at least once by 40% of active users in the first month" — then state whether the current build can be evaluated against it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Observable success-metric not written."}
The observable success-metric hasn't been written.
Behaviour or metric / threshold / timeframe — evaluable against current build.
{R4_CLOSE}`,
    },
    {
      option: 'Use the outcome definition as a scope filter: list every addition currently in this feature, evaluate each against the success metric, and flag any that do not contribute to hitting it for removal or deferral.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Outcome-as-scope-filter not applied."}
The outcome-as-scope-filter pass hasn't been done.
List additions / evaluate each vs metric / flag non-contributors for removal or deferral.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Finish this sentence before coding: "This feature succeeds if X happens for Y users within Z timeframe." Without this, you can\'t measure whether the feature worked.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to code."}
Lighter: X happens / Y users / Z timeframe success sentence.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the one metric that would tell you, 30 days after shipping, whether this feature justified the engineering time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Narrower: 30-day-post-ship metric for engineering-time-justification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the success metric now — the observable outcome that tells you the feature worked.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Minimum next step: observable-outcome success metric.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEATURE_PRIORITIZATION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FEATURE_PRIORITIZATION",
  question: 'Why is this the highest-priority thing to build right now?',
  pinchFallback: 'Confirm this is the highest-impact item before building.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEATURE_PRIORITIZATION'],
  L1: [
    {
      option: 'Building what comes to mind next — rather than what has the highest impact — is the feature factory pattern. Every hour of engineering time spent on a lower-impact feature is an hour not spent on a higher-impact one. Backlog prioritization question: what evidence suggests this feature delivers more value to users than any alternative you could build with the same engineering time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building what came to mind; impact-vs-alternatives not checked."}
Priority rationale for this feature hasn't been stated — risk of feature-factory pattern building lower-impact work.
Evidence: more value than any alternative for same engineering hours?
{R4_CLOSE}`,
    },
    {
      option: 'A useful prioritization heuristic: impact-effort scoring. Impact = estimated positive change in a key metric if this ships. Effort = engineering days to implement. Highest impact-to-effort ratio wins. You don\'t need a formal matrix — a quick mental comparison against 2-3 alternatives is enough. The question is: is there a feature you\'re not building that would deliver more value for less effort?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Impact-effort scoring not applied."}
The impact-effort scoring hasn't been applied.
Impact / effort / ratio — any not-building alternative with better ratio?
{R4_CLOSE}`,
    },
    {
      option: 'State the explicit priority rationale for this feature in one sentence — why this over the alternatives — and name the next-highest-priority alternative that is being deferred. If no rationale exists beyond "it seemed like a good idea," draft one now or pause the build.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Explicit priority rationale not stated."}
The explicit priority rationale hasn't been stated.
Why this over alternatives / next-highest-deferred named / draft or pause.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the top 2 alternatives you\'re not building right now. Is this feature higher impact-to-effort than either of them? If yes, the prioritization is justified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Lighter: top-2 alternatives + this-feature higher-ratio?
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the user/business impact of NOT building this feature, vs. NOT building the next highest-priority alternative?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Narrower: not-build-this vs not-build-alternative impact.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Confirm explicit prioritization rationale before starting — impact vs. alternatives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing what to build."}
Minimum next step: explicit rationale before start.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_PERSONA_CLARITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_USER_PERSONA_CLARITY",
  question: 'Who specifically is this feature for?',
  pinchFallback: 'Name the specific user this feature is designed for.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_PERSONA_CLARITY'],
  L1: [
    {
      option: 'Name the specific user this feature serves: 2 sentences describing who they are, what context they use the product in, and what they are trying to accomplish — concrete enough that a design decision can be tested against "would Marcus understand this?" rather than "would users in general?"',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Designing for 'users in general' without a specific named persona."}
The specific user this feature serves hasn't been named — building for 'users in general' loses every design decision.
2-sentence persona: who they are / context / what they're trying to accomplish — concrete-enough for design-decision test.
{R4_CLOSE}`,
    },
    {
      option: 'Write a 2-sentence persona description for this feature\'s primary user — who they are, their context, and what they are trying to do — then check every recent design decision against that persona and flag any that serve "users in general" instead.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Persona description + decision audit not done."}
The persona-write + decision-audit hasn't been done.
Persona / audit recent decisions / flag 'users in general' drift.
{R4_CLOSE}`,
    },
    {
      option: 'Define the target user for this feature in one sentence, then re-check the feature scope: list any request, addition, or behaviour that does not serve that user and propose removing or deferring it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope-re-check against target user not done."}
The target-user + scope-re-check hasn't been done.
Define / re-check scope / propose remove or defer non-serving items.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific user type this feature is for — 2 sentences about who they are and what they\'re trying to do. "For users" isn\'t an answer.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Lighter: specific user-type — 2-sentence who/what; not 'for users'.
{R4_CLOSE}`,
    },
    {
      option: 'If you had to describe the one person who would get the most value from this feature, who would it be? Build for that person explicitly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Narrower: one-person-most-value + build-for-them-explicitly.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the specific user type this feature is designed for before making build decisions.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Designing this feature."}
Minimum next step: specific user-type before build decisions.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_COMPETITIVE_AWARENESS_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_COMPETITIVE_AWARENESS",
  question: 'Have you checked how competitors handle this?',
  pinchFallback: 'Run a quick competitive check before committing to this build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_COMPETITIVE_AWARENESS'],
  L1: [
    {
      option: 'Building a feature without knowing the competitive landscape means you\'re solving a problem that may already be solved — possibly better than you\'ll solve it. Before committing to any non-trivial feature, answer three questions: does a competitor already have this? If yes, how have they implemented it? And what would make your version a reason to switch rather than a reason to stay with the incumbent?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without knowing competitive landscape."}
Competitive landscape for this feature hasn't been checked — risk of solving an already-solved problem worse than incumbent.
3-questions: competitor has this? / how implemented? / reason-to-switch vs reason-to-stay?
{R4_CLOSE}`,
    },
    {
      option: 'Classify this feature as table stakes (required to compete), a differentiator (reason to switch), or irrelevant to user comparison — then state the implementation implication: polish parity, a clear wedge, or do not build. Confirm the current build matches the classification.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Feature classification not done."}
The feature classification hasn't been done.
Table stakes / differentiator / irrelevant → polish-parity / clear-wedge / do-not-build.
{R4_CLOSE}`,
    },
    {
      option: 'Run a 20-minute competitive audit: list the top 2-3 competitor implementations of this feature, summarize what each got right and wrong, and propose the specific differentiation angle this build will use. If no differentiation is identified, propose what would need to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "20-min competitive audit not run."}
The 20-min competitive audit hasn't been run.
Top 2-3 competitor implementations / right vs wrong / specific differentiation angle.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What do the top 2 competitors do for this feature? And what would make your version a reason to choose you over them?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: top-2 competitors + your reason-to-choose-over-them.
{R4_CLOSE}`,
    },
    {
      option: 'Is this feature table stakes, a differentiator, or something users don\'t compare? That classification should drive the implementation approach.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: table-stakes / differentiator / not-compared classification.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run a quick competitive audit before building — check how competitors solve this and where you differentiate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: quick competitive audit + differentiation angle.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MVP_BOUNDARY_DISCIPLINE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_MVP_BOUNDARY_DISCIPLINE",
  question: 'Is this addition within MVP scope?',
  pinchFallback: 'Check whether this is needed to test the core hypothesis.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_MVP_BOUNDARY_DISCIPLINE'],
  L1: [
    {
      option: 'Apply MVP discipline to this addition: name the riskiest hypothesis the MVP is meant to test, then state whether this addition reduces uncertainty about that hypothesis. If it does not, propose deferring it to post-validation scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding to MVP without checking against riskiest hypothesis."}
MVP-scope discipline hasn't been applied to this addition — risk of gold-plating the unvalidated MVP.
Riskiest hypothesis named / addition reduces uncertainty? / defer if not.
{R4_CLOSE}`,
    },
    {
      option: 'The discipline question for every addition: does this help test what we\'re trying to learn, or does it just make the product feel more complete? "Feel more complete" is the scope creep justification. If the feature doesn\'t reduce the uncertainty about whether the core hypothesis is true, it\'s out of MVP scope — not permanently, just for this phase. Ship the minimum, learn, then add.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Discipline question not asked."}
The discipline-question hasn't been asked.
Test-learning vs feel-more-complete / ship min / learn / then add.
{R4_CLOSE}`,
    },
    {
      option: 'Common MVP scope creep patterns: "nice to have" additions that don\'t affect hypothesis testing, polish passes that go beyond the minimum for usability, and "while we\'re in this area" additions. All three delay the learning loop without increasing its quality. Define the scope boundary explicitly: list the features that are in-hypothesis-scope and treat everything else as post-validation work.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope boundary not explicit."}
The explicit scope boundary hasn't been defined.
In-hypothesis-scope list / everything-else as post-validation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Does this addition help test the core hypothesis, or does it just make the product feel more complete? If the latter, it\'s out of MVP scope for now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Lighter: test-hypothesis vs feel-more-complete check.
{R4_CLOSE}`,
    },
    {
      option: 'What is the minimum set of features needed to get a real answer on the riskiest hypothesis? Is the current scope still within that minimum?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Narrower: minimum-set-for-real-answer + current-scope check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Check MVP scope — only include what\'s needed to test the core hypothesis, defer the rest.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Adding to MVP."}
Minimum next step: MVP-scope check — defer non-hypothesis additions.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_ACQUISITION_CONSIDERATION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_USER_ACQUISITION_CONSIDERATION",
  question: 'How will target users find and access this feature?',
  pinchFallback: 'Define the acquisition path before building.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_ACQUISITION_CONSIDERATION'],
  L1: [
    {
      option: 'A feature\'s value is zero for any user who never encounters it. Distribution fit is as important as product-market fit — and it has to be designed in, not discovered after launch. Before committing to a feature build, answer: what is the specific path through which target users will find and start using this feature? SEO, referral loop, in-app discovery, sharing mechanic, onboarding hook, community post — name the channel.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without acquisition path designed in."}
Acquisition path for this feature hasn't been defined — feature value is zero for users who never discover it.
Name the channel: SEO / referral loop / in-app discovery / sharing / onboarding / community.
{R4_CLOSE}`,
    },
    {
      option: 'Name the specific acquisition mechanic for this feature — built-in sharing, referral hook, SEO surface, in-app discovery, onboarding placement — then confirm the implementation actually supports that mechanic. If the channel and the build are misaligned, flag what needs to change.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Acquisition mechanic + implementation alignment not checked."}
The mechanic-vs-implementation alignment hasn't been checked.
Mechanic named / implementation supports it? / flag misalignment.
{R4_CLOSE}`,
    },
    {
      option: 'Write the acquisition-path sentence for this feature in the exact form: "Users reach this via [channel], and the first time they see it they are shown [first-encounter UX]." If either bracket is empty, propose what would fill it before more is built.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Acquisition-path sentence not written."}
The acquisition-path sentence hasn't been written.
Reach via [channel] / first-encounter UX [shown] — fill empty brackets before more built.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific acquisition path: how do target users find out this feature exists, and how do they reach it for the first time?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: specific path — find-out + first-reach.
{R4_CLOSE}`,
    },
    {
      option: 'Is the acquisition mechanic built into the feature, or does it rely on users discovering it organically? Distribution-by-design vs. distribution-by-hope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: built-in vs organic-discovery — design vs hope.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the acquisition path before building — name how target users will find and reach this feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: acquisition path before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RETENTION_MECHANISM_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_RETENTION_MECHANISM_CHECK",
  question: 'How does this feature bring users back?',
  pinchFallback: 'Consider the retention angle before building.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RETENTION_MECHANISM_CHECK'],
  L1: [
    {
      option: 'Features that acquire users but don\'t retain them have diminishing returns forever. Every significant feature should have an answer to: why does a user return to this feature after the first use, and how does using it once make the next use more likely? Without a retention angle, you\'re building acquisition features, not engagement features.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building feature without thinking about retention angle."}
Retention mechanic for this feature hasn't been named — feature acquires users but doesn't bring them back.
Why return after first use? / how does using-once make next-use more likely?
{R4_CLOSE}`,
    },
    {
      option: 'Pick one of three retention mechanics for this feature and confirm it is built in: (1) it saves something users want to return to, (2) it creates a loop where one session\'s output is the next session\'s input, or (3) it connects users to other users. Name the chosen mechanic and where it lives in the current build, or propose what to add.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Retention mechanic not picked + located."}
The retention-mechanic pick + locate hasn't been done.
Save / loop session-output→input / connect users — name chosen + where it lives.
{R4_CLOSE}`,
    },
    {
      option: 'Nir Eyal\'s Hook model: trigger → action → reward → investment. "Investment" is what makes the next trigger more effective — the user puts something into the product (data, preferences, connections, history) that increases the value of returning. Every feature should have an answer for what the "investment" is. If there isn\'t one, the feature has no retention loop.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Hook 'investment' not named."}
The Hook-investment hasn't been named.
Trigger → action → reward → investment / what does user put in that raises return-value?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the retention mechanic for this feature — what makes a user come back after the first use, and what makes returning more valuable than the first visit?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: mechanic + return-more-valuable-than-first.
{R4_CLOSE}`,
    },
    {
      option: 'Does using this feature once make the next use more likely? If not, it\'s a one-visit feature — which may be fine, but should be an explicit design choice.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: one-use → next-use likelier? / explicit one-visit design choice.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the retention angle now — what brings users back to this feature after the first use.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: retention angle before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT",
  question: 'How will you know if this feature is working after you ship it?',
  pinchFallback: 'Add a feedback mechanism before shipping.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_FEEDBACK_LOOP_ESTABLISHMENT'],
  L1: [
    {
      option: 'Shipping without a way to measure whether the feature worked means the engineering investment produces no validated learning. The Lean Startup loop: Build → Measure → Learn. Skipping the Measure step after Build means the loop stops at the most expensive point and never produces the insight that informs the next build. Define your measurement mechanism before shipping, not after.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to ship without measurement mechanism in place."}
Post-ship measurement mechanism hasn't been set — engineering investment produces no validated learning.
Build → Measure → Learn / define measurement before ship, not after.
{R4_CLOSE}`,
    },
    {
      option: 'Specify the minimum viable feedback set for this feature: name the analytics event that fires on use, the user-feedback channel (in-product or support), and the indicator that ties to the defined success metric. Confirm each is in place or list what needs adding before shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Min viable feedback set not specified."}
The MV feedback set hasn't been specified.
Analytics event / feedback channel / success-metric indicator — confirm or list missing.
{R4_CLOSE}`,
    },
    {
      option: 'Common shipping patterns that break the feedback loop: shipping with no analytics instrumentation, shipping with analytics but no defined success threshold, and shipping with a metric but no scheduled review. All three mean the feature will run for weeks without producing a learning decision. Define the mechanism, the metric, and the review date before the code ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Mechanism / metric / review-date not defined."}
The mechanism + metric + review-date trio hasn't been defined.
No-instrumentation / no-threshold / no-review-date — define all three before ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the feedback mechanism: what data will tell you whether this feature is being used, and what will tell you whether it\'s solving the problem it was built for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Lighter: mechanism — used-data + problem-solved-data.
{R4_CLOSE}`,
    },
    {
      option: 'When will you review the data, and what will you do if the feature isn\'t hitting the success metric you defined?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Narrower: review date + action-if-missed-metric.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Add a feedback mechanism before shipping — analytics event, success metric, and review date.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to ship."}
Minimum next step: event + metric + review-date.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_HYPOTHESIS_BEFORE_BUILD_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_HYPOTHESIS_BEFORE_BUILD",
  question: 'What hypothesis does this feature test?',
  pinchFallback: 'Define the hypothesis before starting the build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_HYPOTHESIS_BEFORE_BUILD'],
  L1: [
    {
      option: 'Write the experiment hypothesis for this feature in the form: "We believe [feature/change] will cause [observable outcome] for [user type]. We will know this is true when [signal] appears within [timeframe]." If any bracket cannot be filled, propose what data or decision would resolve it before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without falsifiable hypothesis stated."}
Falsifiable hypothesis for this feature hasn't been written — experiment outcome can't be evaluated.
We believe [X] will cause [Y] for [Z] / known true when [signal] appears within [timeframe].
{R4_CLOSE}`,
    },
    {
      option: 'The hypothesis doesn\'t have to be certain — it has to be falsifiable. "Users will use the export feature at least once per week" is falsifiable. "Users will find this useful" is not. The falsifiability test: after shipping, can you look at a single data point and say definitively whether the hypothesis was proven or disproven? If not, refine the hypothesis until you can.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Falsifiability test not applied."}
The falsifiability test hasn't been applied.
Single data point → proven or disproven? / refine until yes.
{R4_CLOSE}`,
    },
    {
      option: 'State the falsification condition for this feature\'s hypothesis: what specific data point, observed within the success window, would prove the hypothesis wrong? Commit to that condition now — and use it as the post-ship review trigger.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Falsification condition not stated."}
The falsification condition hasn't been stated.
Specific data point in success window / commit now / post-ship review trigger.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Complete this before coding: "We believe [this feature] will [achieve outcome] for [user type]. We will know this is true when [observable signal]."',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to code."}
Lighter: We-believe / achieve outcome / for user-type / observable signal.
{R4_CLOSE}`,
    },
    {
      option: 'What would tell you this experiment failed? If you can\'t name a failure condition, the hypothesis isn\'t specific enough to be falsifiable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Narrower: experiment-failed condition — if can't name → not falsifiable.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define the hypothesis now — what outcome does this feature test, and how will you know if it worked?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to build."}
Minimum next step: hypothesis — outcome tested + how to know.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE",
  question: 'When did you last check product direction — not just implementation?',
  pinchFallback: 'Take a product perspective before continuing to build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TECHNICAL_VS_PRODUCT_TIME_BALANCE'],
  L1: [
    {
      option: 'Pause implementation and run a product-direction check: count the last 10-15 prompts by category (implementation instructions vs product-direction questions). If heavily skewed to implementation, answer one product question before continuing — is this still the right feature to be building for the right user toward the right outcome?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Heavy implementation prompts; product-direction check not done."}
Product-direction check hasn't been done — heavy implementation skew risks optimising the wrong feature.
Count last 10-15 / impl vs product-direction / answer one product-Q before continuing.
{R4_CLOSE}`,
    },
    {
      option: 'A useful ratio check: in the last 10-15 prompts, how many were implementation instructions ("build this", "add this", "fix this") vs. product-direction questions ("should we build this at all", "is this the right user experience", "does this move our core metric")? Heavy implementation skew is a signal that product thinking has been suspended. Suspend it too long and you optimize the implementation of the wrong feature.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Implementation-vs-product-direction ratio not checked."}
The impl-vs-product-direction ratio check hasn't been done.
Build/add/fix vs should-build/right-UX/moves-metric — heavy impl skew = suspended product thinking.
{R4_CLOSE}`,
    },
    {
      option: 'Product check questions that take < 5 minutes: Is this feature still the highest-priority thing to build right now? Does the implementation direction still match the product goal? Is there a user I should talk to before the next build decision? Has anything changed about the problem I\'m solving? These questions don\'t interrupt implementation — they protect it from building in the wrong direction.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "5-min product check questions not asked."}
The 5-min product-check questions haven't been asked.
Highest-priority? / impl-matches-goal? / user-to-talk-to? / problem-changed?
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Pause the implementation for a moment: is the feature you\'re building still the right thing to be building right now, and is the direction still aligned with your product goal?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Lighter: still-right-feature + direction-aligned-with-goal.
{R4_CLOSE}`,
    },
    {
      option: 'One product-direction question before continuing: is there anything you\'ve learned in the last few sessions that should change what you\'re building or how you\'re building it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Narrower: learnings-that-should-change-what-or-how.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Take a product-direction check before continuing to build — not just what, but whether.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Deep in implementation."}
Minimum next step: product-direction check — not just what, but whether.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_NORTH_STAR_ALIGNMENT_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_NORTH_STAR_ALIGNMENT",
  question: 'How does this feature connect to your product\'s core metric?',
  pinchFallback: 'Check north star alignment before adding this feature.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_NORTH_STAR_ALIGNMENT'],
  L1: [
    {
      option: 'Trace this feature to the product\'s north star metric in one or two steps: state how it moves the metric directly, or how it enables a downstream feature that does. If no traceable connection exists, propose deferring or removing it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building feature without tracing to north-star metric."}
North-star connection for this feature hasn't been traced — risk of scope inflation untethered from the core metric.
Trace 1-2 steps: directly moves metric / enables downstream feature / else defer or remove.
{R4_CLOSE}`,
    },
    {
      option: 'Articulate the north star connection for this feature: name the metric, name the chain of cause-and-effect from this feature to the metric (one or two intermediate steps allowed), and confirm the chain holds. If it does not, flag the feature as candidate for scope removal.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "North-star chain not articulated."}
The north-star chain articulation hasn't been done.
Metric / chain of cause-and-effect / chain holds? / scope-removal candidate if not.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the north star filter to this feature\'s scope: if the feature does not connect to the north star directly or via one intermediate step, decide whether it belongs in a later phase, belongs as foundation for a north-star feature still to come, or should be cut from this scope entirely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "North-star filter not applied to scope."}
The north-star scope filter hasn't been applied.
Direct/1-step / else: later-phase / foundation-for-future / cut.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'In one sentence: how does this feature move your north star metric? Direct path, or via which intermediate effect?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: 1-sentence — moves metric direct or via intermediate.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature has no traceable connection to your north star, is it a foundation for features that will, or is it scope inflation?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: no-traceable-connection — foundation or scope-inflation?
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Articulate the north star connection before building — direct or indirect, but traceable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: traceable north-star connection before build.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 6 E4-E6 — indie_hacker role CASUAL content ─────────────────────────
export const ABSENCE_TIME_TO_VALUE_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TIME_TO_VALUE_CHECK",
  question: 'Is this solution the right size for your current scale?',
  pinchFallback: 'Check whether this complexity is justified at current user count.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TIME_TO_VALUE_CHECK'],
  L1: [
    {
      option: 'Right-size this solution for current scale: name the current user count, name the simplest technology that solves the problem at that scale (a database query, a single API call, a flat file), and propose using it. Defer infrastructure complexity until scale actually requires it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building complex solution before checking if simpler fits current scale."}
Right-sizing for current scale hasn't been done — risk of premature complexity for hoped-for traffic.
Current user count / simplest tech that solves at this scale / defer infra complexity.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the 37signals match-current-traffic rule: confirm this solution fits today\'s traffic rather than hoped-for traffic. If you are reaching for a queue, cache, or distributed component before having users, propose the simpler version that will work at current scale and is easily replaceable later.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "37signals match-current-traffic rule not applied."}
The match-current-traffic check hasn't been done.
Today's traffic vs hoped-for / reaching for queue/cache/distributed pre-users? / simpler + replaceable.
{R4_CLOSE}`,
    },
    {
      option: 'Right-sizing heuristic: if a simple database query, a single API call, or a flat file solves the problem — and you\'re reaching for a queue system, caching layer, or distributed component — ask whether your current user count justifies the complexity. "Not yet but it will eventually" is the premature optimization justification. Build the simple version, ship it, and complicate it when scale actually demands it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Right-sizing heuristic not applied."}
The right-sizing heuristic hasn't been applied.
Simple DB-query / single-API / flat-file solves it? / 'eventually' = premature optimisation / simple-first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s your current user count, and does the complexity of this solution match that scale? What\'s the simplest version that works for the users you have right now?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Lighter: current count + complexity-matches-scale? + simplest-version-for-current-users.
{R4_CLOSE}`,
    },
    {
      option: 'Could a simpler technology solve the same problem and be easily replaced when scale actually requires the complex version?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Narrower: simpler-tech + easy-replace-when-scale-demands.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Right-size this — build the simplest solution that works for your current scale, not future scale.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Minimum next step: simplest for current scale, not future.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SHIP_READINESS_DEFINITION_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SHIP_READINESS_DEFINITION",
  question: 'What needs to be true for this to be ready to ship?',
  pinchFallback: 'Write ship criteria before continuing to build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SHIP_READINESS_DEFINITION'],
  L1: [
    {
      option: 'Write the ship criteria for this build before more is added: list the specific, binary conditions that must be true to ship — "users can sign up", "the core workflow completes end-to-end", etc. This list is your Definition of Done; everything beyond it is post-launch scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without explicit ship criteria written."}
Ship criteria haven't been written — risk of always being 'not ready yet' without binary gates.
Specific binary conditions / DoD list / everything else = post-launch scope.
{R4_CLOSE}`,
    },
    {
      option: 'Ship criteria should be binary: each item is objectively true or false. "Users can sign up and complete the core workflow" is a valid ship criterion. "The design feels polished" is not. Criteria that can\'t be evaluated as pass/fail don\'t function as ship gates — they become "not ready yet" justifications that can always be renegotiated. Write criteria you can check off with a yes or a no.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Binary criteria not written."}
The binary-criteria write hasn't been done.
Objectively T/F / yes-or-no check / no 'feels polished' renegotiable items.
{R4_CLOSE}`,
    },
    {
      option: 'A useful constraint: limit your ship criteria to what\'s needed for the first user to get value from the product. Everything beyond that is post-launch scope. Add it to a backlog, not the ship gate. The ship gate is about minimum viable launch, not minimum viable polish.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "First-user-value constraint not applied."}
The first-user-value constraint hasn't been applied.
First user gets value = ship gate / beyond = backlog / MV launch not MV polish.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write down the ship criteria right now: specific, binary conditions that must be true before you ship. This becomes your launch checklist.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Lighter: binary conditions = launch checklist.
{R4_CLOSE}`,
    },
    {
      option: 'Of those criteria, which ones are needed for the first user to get value — and which are "nice to have before launching"? Separate them: one list is the ship gate, the other is a post-launch backlog.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Narrower: first-user-value vs nice-to-have-before-launch separation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write explicit ship criteria now — specific, binary. Everything else is post-launch scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building."}
Minimum next step: explicit binary ship criteria.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MANUAL_BEFORE_AUTOMATE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_MANUAL_BEFORE_AUTOMATE",
  question: 'Have you done this manually to confirm it works before automating?',
  pinchFallback: 'Do it manually first, then automate the proven version.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_MANUAL_BEFORE_AUTOMATE'],
  L1: [
    {
      option: 'Apply Paul Graham\'s "do things that don\'t scale" rule: do this workflow manually for the first users before automating it. Run the process by hand, capture what users actually need vs what you assumed, and only then automate the validated version.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "About to automate a process before running it manually first."}
Manual-first validation hasn't been done — automation of an unvalidated process risks rebuild after discovery.
Do-things-that-don't-scale / run by hand for first users / capture need-vs-assumed / then automate.
{R4_CLOSE}`,
    },
    {
      option: 'The manual-before-automate discipline: do the process manually for the first users, watch what actually happens — what\'s needed, what\'s not, what users ask for that you didn\'t anticipate — then automate the validated version. Every time automation is built for an unvalidated process, there\'s a real chance of needing to rebuild the automation after discovering the manual version was wrong.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Manual-watch-validate discipline not applied."}
The manual-watch-validate discipline hasn't been applied.
Manual for first users / watch needed / un-anticipated asks / automate validated version.
{R4_CLOSE}`,
    },
    {
      option: 'Questions to ask before automating: have you done this manually at least once? Did it work as expected? Did users respond as expected? If any answer is no — do it manually first. Automation is optimization. Optimization of an unvalidated process is premature spend.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Pre-automate questions not asked."}
The pre-automate questions haven't been asked.
Done manually once? / worked as expected? / users responded as expected? / any 'no' → manual first.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'How many times have you done this process manually, and what did you learn that shaped the automation design? If the answer is zero — do it manually first.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Lighter: manual-times-done + learning-shaped-automation; zero → do manual.
{R4_CLOSE}`,
    },
    {
      option: 'What would happen if you did this manually for the first 10 users instead of building the automation now? Is there anything you\'d learn that might change how you automate it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Narrower: first-10-users manual / what'd change in automation design.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Do this manually first — validate it works for real users before building the automation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "About to automate."}
Minimum next step: manual-first + validate with real users.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_TECH_STACK_COMPLEXITY_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_TECH_STACK_COMPLEXITY_CHECK",
  question: 'Can you maintain this architecture alone, at 2am, when it breaks?',
  pinchFallback: 'Apply the solo maintainability test before adding this complexity.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_TECH_STACK_COMPLEXITY_CHECK'],
  L1: [
    {
      option: 'Every technology choice for a solo indie project is a choice you\'ll maintain alone — debugging it at 2am, extending it when requirements change, understanding it after 3 months away. Complexity that would be distributed across a team of engineers is complexity a solo builder pays in full. The right lens: "is this the simplest stack I can maintain alone, or is this the most impressive stack I can technically justify?"',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Choosing tech stack without solo-maintainability lens."}
Solo-maintainability check hasn't been applied — team-grade complexity costs solo dev in maintenance tax.
Simplest-I-can-maintain-alone vs most-impressive-I-can-justify / debug 2am / extend / 3-months-away.
{R4_CLOSE}`,
    },
    {
      option: 'Run the CV-driven-development check on this stack choice: if the architecture is team-grade complexity for a solo build, propose the simpler stack that solves the same user problem. The user sees the product, not the architecture — choose the stack you can debug alone at 2 a.m.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "CV-driven-development check not run."}
The CV-driven-development check hasn't been run.
Team-grade-for-solo-build? / simpler stack same user problem / user sees product not architecture.
{R4_CLOSE}`,
    },
    {
      option: 'Solo maintainability benchmark: if a production issue hit this system tonight, how long would it take you to find and fix it alone, without documentation? A simpler stack answers that in minutes. A complex one answers it in hours — and that difference is paid by you, every time something breaks. Simpler stack = lower maintenance tax = more time shipping.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "MTTR-alone benchmark not run."}
The MTTR-alone benchmark hasn't been run.
Find+fix alone no docs / minutes vs hours / lower tax = more shipping.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the simplest architecture that solves the same problem? Is the added complexity of this approach worth the increased solo maintenance cost?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Lighter: simplest-same-problem + complexity-worth-solo-maintenance-cost.
{R4_CLOSE}`,
    },
    {
      option: 'If this broke in production at midnight, how would you debug it alone? What\'s your mean-time-to-understand for this architecture under pressure?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Narrower: midnight-debug alone + MTTU under pressure.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply the solo maintainability test — choose the simplest architecture you can debug alone.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Choosing tech."}
Minimum next step: solo-maintainability test → simplest debuggable alone.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_LAUNCH_STRATEGY_ABSENCE_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_LAUNCH_STRATEGY_ABSENCE",
  question: 'How are people going to find out this product exists when you launch?',
  pinchFallback: 'Define a launch strategy before getting closer to ship date.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_LAUNCH_STRATEGY_ABSENCE'],
  L1: [
    {
      option: 'Shipping without a launch plan means launching into silence. Good products do not attract users by themselves — distribution is a discipline that must be planned and executed, not discovered. The minimum viable launch strategy: name one specific channel where you will announce this product, write the post before launch day, and identify who in your network or community should see it. That\'s a launch plan.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Approaching ship date without a launch plan drafted."}
Launch plan hasn't been drafted — shipping without distribution risks launching into silence.
One channel / write post pre-launch / network audience identified — that's a plan.
Still, before you publish or post this launch publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick one specific launch channel and execute it well: Product Hunt (write the listing and schedule), Hacker News Show HN (draft the post), a targeted subreddit, a niche community, or cold outreach to 5-10 target users. One channel done properly beats five attempted on launch day — name the channel and start the announcement draft now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Channel not picked + draft not started."}
The pick-channel + draft-announcement hasn't been done.
PH / Show HN / subreddit / community / cold outreach 5-10 — one done well > five attempted.
Still, before you publish the announcement on any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'The launch plan question: when you ship, who specifically is going to see it, and how? If the answer is "people will find it" — that\'s not a plan, that\'s a hope. Name the channel, identify the audience, and write the announcement before you\'re in launch-day mode.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Who-sees-it / how-they-see-it not answered."}
The who-sees-it + how-they-see-it pair hasn't been answered.
Channel / audience / pre-launch announcement / 'people-will-find-it' = hope, not plan.
Still, before you post the announcement publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific channel and the specific audience: where will you announce, and who exactly will see it on launch day?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Lighter: channel + audience pair.
Still, before you publish to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Write the launch announcement draft now — before you need it. It forces clarity on what the product is, who it\'s for, and what makes it worth trying.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Narrower: draft pre-need / forces clarity on what / for whom / worth-trying.
Still, before you publish or post the draft publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write a launch plan now: one specific channel, one specific audience, one drafted announcement.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Approaching ship."}
Minimum next step: channel + audience + drafted announcement.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_EARLY_USER_FEEDBACK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_EARLY_USER_FEEDBACK",
  question: 'When did you last get a real user\'s reaction to what you\'re building?',
  pinchFallback: 'Show what you\'ve built to at least one real user before continuing.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_EARLY_USER_FEEDBACK'],
  L1: [
    {
      option: 'Break out of silo-building before more is built: identify one real user to show the current build to today — for a 10-minute screen-share, a Loom walk-through, or a screenshot review. Capture their actual reaction, not your interpretation, and adjust direction based on what you see.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building in silo; haven't shown current state to a real user recently."}
Recent feedback from real users hasn't been collected — silo-building risks building on unvalidated assumptions.
Identify one user today / screen-share or Loom / capture actual reaction not interpretation.
{R4_CLOSE}`,
    },
    {
      option: 'Get rough early feedback before the next polish pass: show 2-3 real users the current build via screenshot, Loom, or live demo — the goal is not approval, it is friction (where they get confused, what they ignore, what they ask about). Capture each piece of friction and decide what to address before continuing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Rough feedback before polish-pass not collected."}
The pre-polish rough-feedback hasn't been collected.
2-3 users / screenshot / Loom / live demo / goal is friction not approval.
{R4_CLOSE}`,
    },
    {
      option: 'A practical minimum: before finishing any significant feature, show a working or near-working version to one real user and watch them interact with it without explaining anything. What they struggle with, what they don\'t notice, what they ask about — that\'s the feedback that matters. You don\'t need a survey. You need one real person trying to use the thing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "One-real-user-watch not done."}
The one-real-user-watch hasn't been done.
Working or near-working / no explanation / struggle / don't-notice / asks-about = feedback that matters.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who can you show the current build state to today — not to get approval, but to watch them use it and see where they get confused or stuck?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Lighter: someone-to-show-today + watch-confusion-and-stuck.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the riskiest assumption in your current build? Is there a way to test that assumption with a real user before building further on top of it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Narrower: riskiest assumption + test with real user before further build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Show this to at least one real user now — watch them use it before building further.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "In a build streak."}
Minimum next step: show to one real user + watch.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SOLO_MAINTAINABILITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SOLO_MAINTAINABILITY",
  question: 'Is this addition maintainable by you alone, long-term?',
  pinchFallback: 'Run the solo maintainability check before adding this complexity.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SOLO_MAINTAINABILITY'],
  L1: [
    {
      option: 'Every integration, service, or abstraction you add to a solo project is complexity you\'ll maintain alone — debugging it in production, extending it when requirements change, understanding it after weeks away. The solo maintainability question is not "does this work?" but "can I own the full blast radius of this when it breaks, by myself, without help?" If the answer requires reading documentation for 30 minutes every time something goes wrong, the complexity cost is real and ongoing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Adding integration without solo-tax check."}
Solo-tax check hasn't been applied to this addition — risk of complexity solo dev can't own when it breaks.
Own full blast radius alone? / no help / 30-min docs per failure = real cost.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the solo-tax test before adding this integration: estimate the long-term maintenance cost (debugging, version churn, documentation drift) and compare to the long-term cost of building the simpler equivalent yourself. Adopt only if the maintenance cost is clearly lower.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Long-term maintenance cost not estimated."}
The long-term-cost estimate hasn't been done.
Debugging / version churn / docs drift vs simpler-equivalent build / adopt only if lower.
{R4_CLOSE}`,
    },
    {
      option: 'Before adding any new service, integration, or complex abstraction: name the failure mode that\'s most likely to wake you up at 3am. Can you diagnose and fix that failure alone, in under 30 minutes, with the logs you\'ll have available? If not, the complexity is not solo-sustainable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "3am failure mode not named."}
The 3am-failure-mode + diagnose-alone check hasn't been done.
Likely failure / <30 min alone with available logs? / else not solo-sustainable.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the most likely failure mode for this addition, and how long would it take you to diagnose and fix it alone, at night, with no colleagues to ask?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Lighter: likely failure + alone-diagnose-time at night.
{R4_CLOSE}`,
    },
    {
      option: 'Is there a simpler alternative that solves the same problem with lower solo maintenance cost — even if it takes an extra day to build?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Narrower: simpler-alternative + lower-cost even-if-extra-day-build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Apply the solo maintainability test: can you own the full failure mode of this, alone?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Considering an addition."}
Minimum next step: own-full-failure-alone test.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DISTRIBUTION_THINKING_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_DISTRIBUTION_THINKING",
  question: 'How will users discover and access this feature?',
  pinchFallback: 'Consider the distribution angle before building this feature.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DISTRIBUTION_THINKING'],
  L1: [
    {
      option: 'Distribution is a design constraint, not a marketing task. Features that assume users will discover them organically are features built on distribution magic. Before building any significant feature, answer: what is the specific path through which a new user discovers this feature exists and reaches it for the first time? The answer shapes the implementation — SEO-friendly URLs, in-product sharing mechanics, referral hooks, and community-compatible output formats are all distribution design, not afterthoughts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without designing discovery path."}
Discovery path for this feature hasn't been designed — feature relies on distribution magic.
Specific path: SEO URLs / sharing / referral / community-compatible output = design, not afterthought.
{R4_CLOSE}`,
    },
    {
      option: 'The distribution question for indie products: are you relying on existing users to find this (in-product discovery), new users to find the product through this feature (SEO / social sharing), or explicit outreach to get people to try it? Each of these requires a different implementation approach. In-product discovery needs navigation design; SEO requires content structure; social sharing requires a shareable artifact. Choosing the distribution approach before building ensures the feature can actually fulfill it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Distribution-approach + impl-alignment not chosen."}
The distribution-approach pick hasn't been done.
In-product / SEO-social / outreach → navigation / content structure / shareable artifact.
{R4_CLOSE}`,
    },
    {
      option: 'A minimum distribution consideration: for each feature, name the one most likely way a user first encounters it. Then check whether the current implementation supports that discovery path. If the implementation makes the feature invisible to the intended discovery mechanism, distribution is broken before the feature ships.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "First-encounter path not checked vs impl."}
The first-encounter + impl-support check hasn't been done.
Most likely first-encounter / impl supports it? / invisible-to-mechanism = broken pre-ship.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the specific discovery path for this feature: how does a user who has never seen it find out it exists and reach it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: specific discovery path — never-seen-user finds-and-reaches.
{R4_CLOSE}`,
    },
    {
      option: 'Does the current implementation support that discovery path, or would a user arriving through that channel hit a dead end?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: impl supports path / dead-end-on-arrival check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the distribution path for this feature before building — how does a user first find it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: name distribution path before build.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_MONETIZATION_PATH_CLARITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_MONETIZATION_PATH_CLARITY",
  question: 'How does this feature connect to how the product makes money?',
  pinchFallback: 'Consider the monetization connection before building this feature.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_MONETIZATION_PATH_CLARITY'],
  L1: [
    {
      option: 'Building features without monetization awareness builds a free product by default — regardless of intent. Every significant feature should have an articulated answer to "how does this connect to the revenue model?" It doesn\'t need to be direct: "this is a retention feature that reduces churn, which improves LTV" is a valid connection. "This makes the product better" is not — it\'s the answer that leads to technically excellent, commercially unsustainable products.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Building without monetization awareness."}
Monetization connection for this feature hasn't been articulated — risk of building free product by default.
Connection to revenue model / 'better' isn't an answer / direct or indirect-via-LTV.
{R4_CLOSE}`,
    },
    {
      option: 'Revenue model options for indie products: paid tier (freemium gate), usage-based pricing, one-time purchase, SaaS subscription, affiliate revenue, API access tier. For each feature, ask: is this in the free tier (acquisition) or the paid tier (monetization)? If free, why — what acquisition or retention goal does it serve that connects back to paid conversion? If paid, what makes it worth paying for? These questions don\'t slow development — they prevent building the wrong tier.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Free-vs-paid tier decision not made."}
The free-vs-paid tier decision hasn't been made.
Paid tier / usage / one-time / SaaS / affiliate / API / free with goal vs paid with worth-paying.
{R4_CLOSE}`,
    },
    {
      option: 'Lock the monetization decision for this feature now, before users learn to expect it for free: place it explicitly in the free tier (and name the acquisition or retention goal it serves) or the paid tier (and name what makes it worth paying for). Document the choice and the rationale.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Tier lock + rationale not documented."}
The tier-lock + rationale-document hasn't been done.
Lock pre-user-expectation / free with named goal OR paid with named worth-paying / document.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Is this feature in the free or paid tier? What\'s the explicit reason — acquisition, retention, conversion, or direct revenue?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Lighter: free or paid + explicit reason — acquisition/retention/conversion/revenue.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature were behind a paywall, would users pay for it? If not, what would need to change about the feature — or the framing — to make it worth paying for?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Narrower: paywall test + change-to-make-worth-paying-for.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Name the monetization connection for this feature before building — free tier or paid, and why.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Building this feature."}
Minimum next step: monetization connection + why.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY",
  question: 'Is this a milestone worth sharing publicly?',
  pinchFallback: 'Consider sharing this milestone publicly before moving to the next.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_BUILD_IN_PUBLIC_OPPORTUNITY'],
  L1: [
    {
      option: 'Share this milestone publicly today before continuing: draft a short post (tweet, Loom, community update) describing what you just shipped and what you learned. Audiences built during the build survive launch-day failures; audiences built launch-week do not.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Shipped a milestone without sharing publicly."}
Milestone sharing hasn't been done — audience built during the build survives launch failures; audience built launch-week doesn't.
Short post / tweet / Loom / community update — shipped + learned.
Still, before you publish this post to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the milestone type and write the share: first working core feature, first technical milestone, first 10 users, first revenue, or one specific lesson worth teaching. Draft a one-paragraph post (no polish required) and identify the audience — your followers, a relevant community, or a niche forum.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Milestone-type + audience not picked."}
The milestone-type + audience pick hasn't been done.
First-feature / tech-milestone / 10-users / revenue / lesson — one-paragraph draft + audience.
Still, before you publish the drafted post to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Pick the lowest-friction share format and ship it: a short tweet, a 60-second Loom walk-through, or a one-paragraph forum update. Frequency over polish — consistent presence during the build is what compounds into a launch-day audience.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Low-friction share format not picked."}
The low-friction-share pick hasn't been done.
Tweet / 60s Loom / forum paragraph — frequency over polish.
Still, before you publish the share to any public channel you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'What\'s the simplest format to share this milestone today — a tweet, a short post, a screen share? Who specifically should see it?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Lighter: simplest format + who-specifically-sees-it.
Still, before you publish this share publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What did you learn building this that another indie hacker would find useful? That\'s the post. Share the process, not just the output.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Narrower: indie-hacker-useful learning = the post / share process not just output.
Still, before you publish this learning-post publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Share this milestone publicly now — a short post about what you built and what you learned.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Shipped a milestone."}
Minimum next step: short public post — built + learned.
Still, before you publish this post publicly you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_SCOPE_VS_TIME_CHECK_CASUAL: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_VS_TIME_CHECK",
  question: 'Is the current scope still within your available time and energy?',
  pinchFallback: 'Run a scope-vs-time check before adding more to the build.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SCOPE_VS_TIME_CHECK'],
  L1: [
    {
      option: 'Run the scope-vs-time check on this build before more is added: name the current scope, estimate the shipping date at current pace, and compare to the original target. If the date has slipped twice in a row, cut scope to fit the original timeline — list specifically what gets deferred to post-launch.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Scope expanding; haven't checked vs available time."}
Scope-vs-time check hasn't been run — risk of expanding scope past timeline without acknowledgment.
Current scope / ship-date at pace vs target / 2× slip → cut scope, name deferred items.
{R4_CLOSE}`,
    },
    {
      option: 'Time-box check: at the current scope, how long will it take to ship something a real user can use? If the answer is "a few more weeks" and it was "a few more weeks" last session too — scope has grown past the original timeline without acknowledgment. The fix is not to work faster; it\'s to cut scope to fit the original timeline, not to extend the timeline to fit the expanded scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Time-box check not done."}
The time-box check hasn't been done.
Ship-something-usable timing / 'few more weeks' twice → cut scope not extend timeline.
{R4_CLOSE}`,
    },
    {
      option: 'A useful constraint: define the minimum version that\'s still shippable given the time you have available this week or this month. Everything beyond that goes to a post-launch backlog. The constraint is productive: it forces the prioritization decision that scope expansion defers indefinitely.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines first-person — "Min-shippable-this-week constraint not applied."}
The min-shippable-in-available-time constraint hasn't been applied.
This-week or this-month min / beyond = backlog / forces prioritization scope expansion defers.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'At current scope, when will you ship something a real user can actually use? If that date keeps moving, scope has grown past the timeline — cut something.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Lighter: ship-real-user-use date + moving = cut.
{R4_CLOSE}`,
    },
    {
      option: 'What\'s the minimum version that\'s shippable in your available time this week/month? What specifically gets cut to reach that minimum?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Narrower: min-shippable + specifically-what-cut.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Cut scope to fit available time — define the minimum shippable version for this week/month.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line first-person — "Scope expanding."}
Minimum next step: cut scope to available time.
{R4_CLOSE}`,
    },
  ],
};

// ── Phase 6 E7-E9 — pm role FORMAL content ───────────────────────────────────
export const ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV",
  question: 'Are acceptance criteria defined for this story before development begins?',
  pinchFallback: 'Define acceptance criteria for this story before starting implementation.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_ACCEPTANCE_CRITERIA_BEFORE_DEV'],
  L1: [
    {
      option: 'Write the acceptance criteria for this story before any implementation prompt: state each criterion as an independently verifiable condition, in Given/When/Then or "this is done when [X]" form. List at least three covering the primary scenario and the most likely edge case.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Story about to enter dev without acceptance criteria stated."}
Acceptance criteria for this story haven't been defined — risk of building the wrong thing correctly.
3+ independently-verifiable criteria / G/W/T or done-when form / primary + likely edge.
{R4_CLOSE}`,
    },
    {
      option: 'Apply the INVEST testability rule to this story\'s acceptance criteria: for each criterion, confirm a tester could write a test case from it. Rewrite any criterion that is too vague to be testable — use Given/When/Then or completion-condition form.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "INVEST testability not applied."}
The INVEST testability check hasn't been applied.
Per criterion: tester writes test from it? / rewrite vague ones in G/W/T.
{R4_CLOSE}`,
    },
    {
      option: 'Before writing any implementation prompt: name the acceptance criteria. One sentence minimum: "This is done when [condition]." This 30-second discipline prevents the most expensive rework scenario: building the wrong thing correctly.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "30-second AC discipline skipped."}
The 30-second AC discipline hasn't been done.
'Done when [condition]' / prevents wrong-thing-correctly rework.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the acceptance criteria now, in Given/When/Then or completion-condition format, before starting the implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Lighter: G/W/T or done-when before impl prompt.
{R4_CLOSE}`,
    },
    {
      option: 'What is the explicit condition that would cause you to reject this story at demo? That condition IS the acceptance criteria.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Narrower: demo-rejection condition = AC.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the acceptance criteria — "this is done when [condition]" — before any implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Story entering dev."}
Minimum next step: 'done when [condition]' pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK",
  question: 'Have relevant stakeholders been aligned on this feature before development begins?',
  pinchFallback: 'Verify stakeholder alignment before proceeding with significant development work.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_STAKEHOLDER_ALIGNMENT_CHECK'],
  L1: [
    {
      option: 'Identify every stakeholder with a legitimate opinion on this feature, name the alignment touchpoint required for each (sign-off, design review, security review, eng-lead consult), and confirm each is completed or scheduled before implementation begins. Document the date and outcome.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature entering dev without stakeholder alignment confirmed."}
Stakeholder alignment for this feature hasn't been confirmed — risk of rework on rejection at demo.
Identify stakeholders / per-stakeholder touchpoint type / each completed or scheduled / date + outcome documented.
Still, before you send any alignment request to a stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Run a 15-minute stakeholder alignment pass for this feature before implementation: list the stakeholders, send the alignment request, capture responses, and document the result in the sprint item. State explicitly any assumption being made about a stakeholder\'s position.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "15-min alignment pass not run."}
The 15-min alignment pass hasn't been run.
List / send request / capture responses / document in sprint item / state stakeholder-position assumptions.
Still, before you send the alignment request to any stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Alignment threshold: not every feature requires formal sign-off. The question is: who has a legitimate opinion about this feature that, if unvalidated, could cause rejection at demo? If the answer is "anyone," alignment before development is required. Document who was aligned and when.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Alignment-threshold question not asked."}
The alignment-threshold question hasn't been asked.
Legitimate opinion → demo-rejection risk? / if 'anyone' → align pre-dev / document who + when.
Still, before you contact any stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Who has a legitimate opinion about this feature that could cause rework if not validated? Contact them before writing the first implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Lighter: legitimate-opinion + contact-before-first-prompt.
Still, before you contact the stakeholder you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What assumption about stakeholder expectations is embedded in this feature? Validate the assumption before coding it in.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Narrower: embedded stakeholder-expectation assumption + validate pre-code.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify and align the relevant stakeholder for this feature before beginning implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Minimum next step: identify + align stakeholder pre-impl.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG",
  question: 'Are there ambiguous quality attributes in these requirements that need a measurable definition?',
  pinchFallback: 'Resolve ambiguous quality attributes to measurable criteria before implementation.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_REQUIREMENTS_AMBIGUITY_FLAG'],
  L1: [
    {
      option: 'Audit this feature\'s requirements for ambiguity: identify every quality-attribute placeholder ("better", "faster", "improved", "user-friendly") and replace each with a measurable target — name the metric, the measurement method, and the success threshold.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Quality-attribute placeholders not converted to measurables."}
Ambiguous quality attributes haven't been converted to measurable targets — risk of unevaluable requirement satisfaction.
Identify placeholders / replace with metric + method + threshold.
{R4_CLOSE}`,
    },
    {
      option: 'Convert every ambiguous phrase in this requirement set to a measurable equivalent before implementation begins. Example: "faster" → "API p95 response time under 200 ms"; "intuitive" → "primary task completed by a new user in under 90 seconds without help." List the rewrites.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Ambiguous-phrase conversions not done."}
The ambiguous-phrase conversions haven't been done.
faster → p95 latency / intuitive → completion-time / list rewrites pre-impl.
{R4_CLOSE}`,
    },
    {
      option: 'Apply SMART to every quality attribute in this feature\'s requirements: confirm each is Specific, Measurable, Achievable, Relevant, Time-bound. Reject or rewrite any criterion that does not pass all five before development starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "SMART check not applied per attribute."}
The per-attribute SMART check hasn't been done.
Specific / Measurable / Achievable / Relevant / Time-bound — fail any → reject or rewrite pre-dev.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Replace each quality attribute placeholder ("better," "faster," "improved") with a specific, measurable target. State the measurement method and success threshold.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements have placeholders."}
Lighter: placeholder → specific + measurable + method + threshold.
{R4_CLOSE}`,
    },
    {
      option: 'What is the testable condition that would prove this requirement is met? Write it before building toward it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements not all testable."}
Narrower: testable proven-met condition pre-build.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Define a measurable acceptance target for every quality attribute before starting implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Requirements with placeholders."}
Minimum next step: measurable target per attribute pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEPENDENCY_MAPPING_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DEPENDENCY_MAPPING",
  question: 'Have upstream and downstream dependencies for this work been identified before starting?',
  pinchFallback: 'Map dependencies before beginning this work to prevent blocked integration.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEPENDENCY_MAPPING'],
  L1: [
    {
      option: 'Dependency identification is a foundational project management discipline (WBS, critical path method). Before any work begins: what does this work depend on (upstream), and what depends on this work completing (downstream)? Unmapped upstream dependencies create blocked work discovered mid-sprint; unmapped downstream dependencies create integration surprises at the worst time — when another team has built against an unstated assumption.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Work about to start without dependency mapping."}
Upstream/downstream dependencies for this work haven't been mapped — risk of mid-sprint blocked work or integration surprises.
WBS/CPM discipline / what this depends on + what depends on this / unmapped = mid-sprint blocks + downstream surprises.
{R4_CLOSE}`,
    },
    {
      option: 'Classify every dependency for this work item: technical, team, external, or knowledge. For each, name the specific dependency, its current status, and the resolution path (coordination, timeline negotiation, decision needed). Flag the longest-resolution dependency for immediate attention.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Dependency classification not done."}
The dependency classification hasn't been done.
Technical / team / external / knowledge — name + status + resolution-path / longest-resolution flagged.
{R4_CLOSE}`,
    },
    {
      option: 'Run the 30-minute dependency-mapping conversation now for this work item: convene the relevant teams, list upstream and downstream items, capture each in the sprint item with owner and resolution date. The alternative is the 2-5× recovery cost when a dependency surfaces mid-sprint — pre-empt it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "30-min dependency-mapping conversation not held."}
The 30-min dependency-mapping conversation hasn't been held.
Convene / upstream + downstream / owner + resolution date / 2-5× recovery if surfaces mid-sprint.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'List all upstream dependencies (what this work requires to proceed) and downstream impacts (what depends on this work completing). Who needs to be notified?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Lighter: list upstream + downstream + who-to-notify.
{R4_CLOSE}`,
    },
    {
      option: 'Which of these dependencies are currently unresolved? What specific action is needed before development can safely begin?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Narrower: unresolved + specific-action-for-safe-start.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Map all upstream and downstream dependencies for this work item before the first implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work about to start."}
Minimum next step: map upstream + downstream pre-first-prompt.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_DEFINITION_OF_DONE_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_DEFINITION_OF_DONE",
  question: 'Is there an explicit Definition of Done for this sprint item?',
  pinchFallback: 'Define the completion criteria for this item before starting work.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_DEFINITION_OF_DONE'],
  L1: [
    {
      option: 'Write the Definition of Done for this sprint item before work begins: state the functional condition, the quality gate (testing or review pass), the documentation requirement, and the target deployment state. Use the form "this item is done when [X] AND [Y]."',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Sprint item entering work without DoD."}
Definition of Done for this item hasn't been written — risk of sprint-review debate over whether work is finished.
Functional / quality gate / docs / deployment state / 'done when [X] AND [Y]' form.
{R4_CLOSE}`,
    },
    {
      option: 'Compose this item\'s DoD with all four required elements: (1) functional acceptance — what the system should do, (2) quality gate — what testing or review must pass, (3) documentation requirement, (4) deployment state. Address or explicitly exclude each before development starts.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Four-element DoD not composed."}
The four-element DoD hasn't been composed.
Functional / quality gate / docs / deployment — address or explicitly exclude pre-dev.
{R4_CLOSE}`,
    },
    {
      option: 'Write the one-line DoD for this item now: "This item is done when [functional condition] AND [quality gate]." Add it to the sprint item — a one-line DoD prevents the sprint-review debate over whether work is finished.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "One-line DoD not added to sprint item."}
The one-line DoD hasn't been added to the sprint item.
Functional condition AND quality gate / prevents sprint-review debate.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Write the Definition of Done for this item now — "this is done when [condition]." State both the functional condition and the quality gate.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Lighter: functional + quality-gate in 'done when' form.
{R4_CLOSE}`,
    },
    {
      option: 'What would cause you to reject this item at sprint review? That rejection condition IS the Definition of Done.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Narrower: sprint-review-rejection condition = DoD.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the Definition of Done — "this is done when [condition]" — before any work begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering work."}
Minimum next step: 'done when [condition]' pre-work.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_CROSS_TEAM_IMPACT_CHECK_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_CROSS_TEAM_IMPACT_CHECK",
  question: 'Have teams affected by this change been notified before development begins?',
  pinchFallback: 'Identify and notify affected teams before building this change to shared systems.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_CROSS_TEAM_IMPACT_CHECK'],
  L1: [
    {
      option: 'Identify every team affected by this change to a shared system (API, schema, infrastructure), draft the notification message, send it, and document delivery in the sprint item before implementation begins. A pre-change Slack message costs minutes; a post-change broken integration costs team-days.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Shared-system change about to start without affected teams notified."}
Affected teams haven't been notified of this shared-system change — risk of post-change broken integration costing team-days.
Identify teams / draft notification / send / document delivery / pre-change Slack < post-change broken integration.
Still, before you send the notification to any team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Classify this shared-system change by impact category — API contract, database schema, shared service behaviour, infrastructure — then route the notification to the affected consumers for each category. Confirm each team has received and acknowledged the change before this work proceeds.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impact-category classification + routing not done."}
The impact-category classification + routing hasn't been done.
API contract / schema / shared service / infra → route + receive + acknowledge per category.
Still, before you route the notification to any affected consumer team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'Minimum notification standard: before building any change to a shared system, name the affected teams, send a notification, and document that notification in the sprint item. "Notified Team X on [date] — no blocking concerns raised" is sufficient. The documentation creates accountability and a paper trail for sprint retrospectives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Minimum notification standard not met."}
The minimum notification standard hasn't been met.
Name teams / send / document with date + outcome — accountability + retro paper trail.
Still, before you send the cross-team notification you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'List the teams affected by this change. Send them a notification before writing the first implementation prompt. Document who was notified.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Lighter: list + send + document.
Still, before you send the notification to any team you must ask me for go-ahead confirmation.
{R4_CLOSE}`,
    },
    {
      option: 'What would break in another team\'s work if this change deployed without warning? That team needs notification before you begin.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Narrower: break-without-warning team → notify before begin.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Notify all affected teams of this shared-system change before starting implementation.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Shared-system change pending."}
Minimum next step: notify affected teams pre-impl.
{R4_CLOSE}`,
    },
  ],
  l2SafeguardRequired: true,
};

export const ABSENCE_SUCCESS_METRIC_DEFINITION_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_SUCCESS_METRIC_DEFINITION",
  question: 'Is there a success metric defined for this feature before development begins?',
  pinchFallback: 'Define how success will be measured for this feature before starting implementation.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SUCCESS_METRIC_DEFINITION'],
  L1: [
    {
      option: 'Define the success metric for this feature before development: name the metric, the measurement method, the success threshold, and the measurement timeline — e.g. "feature adoption rate, tracked via feature_used analytics event, threshold 30% of active users within 30 days." Add to the sprint item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Feature entering dev without success metric defined."}
Success metric for this feature hasn't been defined — risk of unevaluable post-ship outcome.
Metric / method / threshold / timeline — add to sprint item pre-dev.
{R4_CLOSE}`,
    },
    {
      option: 'Success metric format: name the metric, the measurement method, the success threshold, and the measurement timeline. Example: "Success metric: feature adoption rate. Method: track feature_used events in analytics. Threshold: 30% of active users within 30 days of launch. Timeline: 60-day measurement window." A metric without a threshold is not a metric — it\'s an observation. A metric without a timeline is not actionable.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Success-metric four-part format not applied."}
The four-part success-metric format hasn't been applied.
Metric / method / threshold / timeline — no threshold = observation; no timeline = unactionable.
{R4_CLOSE}`,
    },
    {
      option: 'Confirm the three pre-ship functions of this feature\'s success metric are in place: (1) team alignment on what value the feature delivers, (2) the basis for the post-ship retrospective, (3) the forcing question — "if we cannot measure success, should we build this at all?" Resolve any of the three that is missing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three pre-ship metric functions not confirmed."}
The three pre-ship metric functions haven't been confirmed.
Team-value alignment / retro basis / 'measurable-or-build?' forcing question / resolve missing.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Define the success metric now: name the metric, measurement method, success threshold, and measurement timeline. Write it in the sprint item before coding begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Lighter: metric + method + threshold + timeline.
{R4_CLOSE}`,
    },
    {
      option: 'If this feature shipped tomorrow and no one used it, would we know? If not, the success metric is missing — define it now.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Narrower: would-we-know-if-unused test → missing metric.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'State the success metric, threshold, and measurement timeline before any implementation work.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Feature entering dev."}
Minimum next step: metric + threshold + timeline pre-impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_PRIORITY_JUSTIFICATION_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_PRIORITY_JUSTIFICATION",
  question: 'Is there an explicit justification for why this item is the current highest priority?',
  pinchFallback: 'Articulate the priority justification for this item before beginning work.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_PRIORITY_JUSTIFICATION'],
  L1: [
    {
      option: 'State the priority justification for this sprint item in one sentence before development begins: name the user or business value, the urgency or time criticality, the risk reduction or strategic alignment — and the next-highest-priority alternative being deferred to make room for this item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Sprint item entering dev without priority rationale."}
Priority rationale for this item hasn't been articulated — risk of silent drift toward easiest work.
Value / urgency / risk / strategic alignment / next-highest-priority deferred.
{R4_CLOSE}`,
    },
    {
      option: 'Priority justification components: user or business value (who benefits and how much?); urgency or time criticality (does delay reduce value?); risk reduction (does doing this now prevent a future problem?); effort estimate (relative cost). WSJF combines these: (Value + Time Criticality + Risk Reduction) / Effort. The formula is less important than the discipline — before committing to any item, articulate why this item over the alternatives.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "WSJF-style justification not articulated."}
The WSJF-style justification hasn't been articulated.
Value / time criticality / risk reduction / effort — WSJF ratio / discipline > formula.
{R4_CLOSE}`,
    },
    {
      option: 'One-sentence priority justification minimum: "This item is highest priority because [specific reason — user impact / time constraint / risk / strategic alignment]." This 30-second discipline makes backlog prioritization decisions explicit, reversible, and legible to the team. It prevents the silent drift toward whatever is easiest.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "One-sentence justification not written."}
The one-sentence priority justification hasn't been written.
'Highest priority because [specific reason]' / 30-sec discipline / explicit + reversible + legible.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'State the priority justification for this item in one sentence: why this item over the next item in the backlog? Name the specific reason.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Lighter: one-sentence why-this-over-next-backlog.
{R4_CLOSE}`,
    },
    {
      option: 'What would be lost if this item were pushed to the next sprint? If the answer is "nothing significant," it may not be the highest priority item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Narrower: what-lost-if-pushed / 'nothing significant' = priority check.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Justify this item\'s priority before starting: why this item now, over the alternatives?',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Item entering dev."}
Minimum next step: why-this-now-over-alternatives.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_USER_STORY_COMPLETENESS_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_USER_STORY_COMPLETENESS",
  question: 'Is this work item expressed as a complete user story with who, what, and why?',
  pinchFallback: 'Reframe this work item as a user story — who benefits, what they need, why it matters.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_USER_STORY_COMPLETENESS'],
  L1: [
    {
      option: 'Rewrite this work item in Connextra format before implementation: "As a [specific user type], I want [the capability this feature enables], so that [the value or outcome delivered]." If the "so that" cannot be completed, that is the most important thing to resolve — propose what stakeholder conversation closes it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Work item missing Connextra-format user story."}
User story who/what/why hasn't been completed — risk of technically-correct artifact missing the outcome.
As-a / I-want / so-that — 'so that' unfillable = most important to resolve pre-impl.
{R4_CLOSE}`,
    },
    {
      option: 'For this user story, validate the proposed implementation approach against the "so that" clause: does the chosen approach deliver the stated value, or does it deliver a technically-correct artifact that misses the outcome? Propose adjustments if the latter.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Impl-vs-'so-that' check not done."}
The impl-vs-'so-that' check hasn't been done.
Delivers stated value or technically-correct-missing-outcome? / adjust if latter.
{R4_CLOSE}`,
    },
    {
      option: 'Reframe now: "As a [specific user type], I want [the action this feature enables], so that [the outcome they can achieve]." If you cannot complete the "so that," the feature\'s value is not yet understood — and that is the most important thing to resolve before implementation begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Connextra-format reframe not done."}
The Connextra reframe hasn't been done.
As-a / I-want / so-that / 'so-that' unfilled = feature-value not yet understood.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Complete the user story template: "As a [user type], I want [action], so that [value]." If the "so that" is unclear, that is what to resolve before building.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Lighter: complete As-a/I-want/so-that — unclear 'so-that' → resolve first.
{R4_CLOSE}`,
    },
    {
      option: 'Who specifically benefits from this feature? What outcome does it enable for them? That is the user story — write it before writing the implementation prompt.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Narrower: who-benefits + outcome-enabled = user story before impl prompt.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Write the full user story — who/what/why — before any implementation begins.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Work item pending."}
Minimum next step: full user story who/what/why before impl.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RISK_FLAG_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_RISK_FLAG",
  question: 'Have risks been identified for this decision or scope change before proceeding?',
  pinchFallback: 'Identify and document risks before proceeding with this significant decision.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RISK_FLAG'],
  L1: [
    {
      option: 'Identify the risks for this decision before proceeding: for each risk category (technical, scope, stakeholder, dependency, timeline), name the specific risk, estimate likelihood (H/M/L) and impact (H/M/L), and state the mitigation or acceptance decision. Document each in the sprint item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Decision pending; risks not identified per category."}
Risks for this decision haven't been identified — assumptions remain unmonitored uncertainties.
Categories: technical / scope / stakeholder / dependency / timeline / likelihood + impact + mitigation per risk.
{R4_CLOSE}`,
    },
    {
      option: 'Risk categories relevant to PM + AI development: technical risk (the implementation approach may not work as designed or may have performance characteristics that break under load); scope risk (the feature may be more complex than the current estimate); stakeholder risk (a decision-maker may reject the direction at demo); dependency risk (an upstream team or external service may not deliver on time); timeline risk (effort estimates may be wrong). Each category should be briefly evaluated before proceeding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Per-category risk evaluation not done."}
The per-category risk evaluation hasn't been done.
Technical / scope / stakeholder / dependency / timeline — brief evaluation each pre-proceed.
{R4_CLOSE}`,
    },
    {
      option: 'Risk naming format: "[Risk]: [description] — [likelihood: H/M/L] — [impact: H/M/L] — [mitigation: action or accepted]." A one-sentence risk identification is better than no identification. It converts an assumption into a monitored uncertainty, which is the prerequisite for doing anything about it.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Risk-naming format not applied."}
The risk-naming format hasn't been applied.
[Risk] / [description] / [L: H/M/L] / [I: H/M/L] / [mitigation: action or accepted].
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Name the risks for this decision before proceeding: what could go wrong, how likely, what the impact is, and whether there is a mitigation or it is accepted.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Lighter: what-wrong / likely / impact / mitigation-or-accepted.
{R4_CLOSE}`,
    },
    {
      option: 'What assumption embedded in this decision, if wrong, would cause the most damage? That assumption IS the risk. Name it before committing to the decision.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Narrower: most-damaging-if-wrong assumption = the risk.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Identify and document risks before proceeding — what could go wrong and how it would be mitigated.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Decision pending."}
Minimum next step: identify + document risks + mitigation.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT",
  question: 'Has the impact of this scope change on the current sprint been assessed?',
  pinchFallback: 'Assess sprint impact before accepting this scope change.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_SCOPE_CHANGE_IMPACT_ASSESSMENT'],
  L1: [
    {
      option: 'Before accepting this mid-sprint scope change, complete the four-point impact assessment: (1) what existing in-progress item is displaced, (2) does the sprint end date shift, (3) which downstream teams have a date dependency on what this change affects, (4) what is explicitly removed or deferred to make room. Document all four answers in the sprint item before the change enters scope.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Mid-sprint scope change pending without four-point impact assessment."}
Sprint-impact assessment for this scope change hasn't been completed — risk of sprint failure from un-traded-off expansion.
4 points: displaced-item / sprint-end-shift / downstream-date-dep / removed-or-deferred — document all pre-enter-scope.
{R4_CLOSE}`,
    },
    {
      option: 'Four-point impact assessment for any mid-sprint scope change: (1) Timeline impact — does this change the sprint end date? (2) In-progress item impact — what currently in-flight work is affected or displaced? (3) Downstream dependency impact — do other teams have a date dependency on something this change affects? (4) Trade-off decision — what is explicitly removed or deferred to make room for this change? All four must be answered before the change enters the sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Four-point assessment per change not done."}
The four-point per-change assessment hasn't been done.
Timeline / in-progress / downstream / trade-off — answer all four pre-enter-sprint.
{R4_CLOSE}`,
    },
    {
      option: 'Scope change governance minimum: "Accepting [change X]. Impact: [timeline +N days / no change]. Displaces: [item Y — deferred to next sprint]. Downstream: [Team Z notified / no downstream impact]. Trade-off: [accepted — deferred item Y is lower priority]." This 60-second assessment prevents sprint failure and creates a paper trail for the retrospective.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Governance minimum not met."}
The governance minimum hasn't been met.
Accepting / Impact / Displaces / Downstream / Trade-off — 60-sec format / retro paper trail.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before accepting this scope change: what does it displace, does it affect the sprint end date, and are downstream teams impacted? Answer all three before committing.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Lighter: displaces / end-date-shift / downstream-impact — all three pre-commit.
{R4_CLOSE}`,
    },
    {
      option: 'What is being removed or deferred to make room for this change? If nothing is being removed, the sprint commitment has just expanded without capacity expanding.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Narrower: removed-or-deferred trade-off / else capacity not expanding.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Complete the four-point impact assessment before accepting this scope change into the sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Scope change pending."}
Minimum next step: complete 4-point impact assessment pre-accept.
{R4_CLOSE}`,
    },
  ],
};

export const ABSENCE_RETROSPECTIVE_HABIT_FORMAL: DecisionContent = {
  signalType:   "ABSENCE_RETROSPECTIVE_HABIT",
  question: 'Has this sprint or iteration been closed with a retrospective before starting the next?',
  pinchFallback: 'Run a retrospective on this sprint before moving to the next cycle.',
  whyHelp:       WHY_HELP_BY_SIGNAL_TYPE['ABSENCE_RETROSPECTIVE_HABIT'],
  L1: [
    {
      option: 'Run the sprint retrospective now before the next sprint begins: list what went well (preserve and reinforce), what did not go well (process problems without blame), and one or two specific, actionable process changes to try in the next sprint. Document the chosen action items.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Next sprint about to start without retrospective on this one."}
Sprint retrospective hasn't been run before the next cycle — process problems repeat without action items.
What went well / what didn't go well / 1-2 specific actionable changes / document action items.
{R4_CLOSE}`,
    },
    {
      option: 'Structure the retrospective in three parts: (1) what went well — name 2-3 practices to preserve, (2) what did not go well — name 2-3 process problems, (3) what to try next sprint — commit to one or two specific changes. Capture the commitments in the sprint board.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Three-part retro structure not run."}
The three-part retro structure hasn't been run.
2-3 preserve / 2-3 problems / 1-2 next-sprint commitments / sprint board capture.
{R4_CLOSE}`,
    },
    {
      option: 'Draft the retrospective action items as specific, executable commitments — not platitudes. Reject "we should communicate better"; accept "we will use a shared Slack channel for async decisions, starting next sprint." Write 1-2 such commitments and assign owners.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1-2 lines — "Specific executable commitments not drafted."}
The specific-executable-commitments draft hasn't been done.
Reject platitudes / accept specific 'we will [X]' / 1-2 commitments + owners.
{R4_CLOSE}`,
    },
  ],
  L2: [
    {
      option: 'Before starting the next sprint: run the retrospective — what went well, what didn\'t, and one specific process change to try next cycle. Document the action item.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Lighter: well / didn't / one specific change + document.
{R4_CLOSE}`,
    },
    {
      option: 'What process mistake from this sprint, if not addressed now, will definitely repeat in the next sprint? That is the retrospective topic.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Narrower: will-definitely-repeat-if-not-addressed = retro topic.
{R4_CLOSE}`,
    },
  ],
  L3: [
    {
      option: 'Run the sprint retrospective now — what went well, what didn\'t, one process change for next sprint.',
      descBase: `{R4_OPEN}
{R5_INJECT: ~1 line — "Next sprint imminent."}
Minimum next step: retro + one process change for next sprint.
{R4_CLOSE}`,
    },
  ],
};
