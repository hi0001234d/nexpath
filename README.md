# Nexpath

> **[TAGLINE PLACEHOLDER]** — _e.g. "The spec-aware guidance layer for vibe coders and coding-agent users."_

<!-- EXPAND: One punchy sentence that captures what Nexpath does and who it is for. -->

---

## What Is Nexpath?

<!-- EXPAND: 2–3 paragraphs explaining the behaviour guidance system concept once flows are finalised. -->

Nexpath is a behaviour guidance system for developers using AI coding agents (Claude Code, Cursor,
Windsurf, Cline, and others). It monitors your development sessions, understands where you are in
your project lifecycle, and surfaces **"the decision session"** — a lightweight, non-intrusive
interactive prompt that keeps you aligned with spec-driven development practices without ever
forcing your hand.

**[EXPAND: Add concrete description of "the decision session" flow once UX is finalised.]**

**[EXPAND: Add description of the 3-level easier-options system once designed.]**

**[EXPAND: Add description of the `nexpath optimize` catch-up command once designed.]**

---

## Why Nexpath Exists

<!-- EXPAND: Fill in with the full motivation once the spec and behaviour map design is complete. -->

Vibe coding has changed how software gets built. AI coding agents can generate entire features
from a single sentence — but the speed of generation often outpaces the discipline of process.
Developers skip spec reviews. They forget regression checks. They ship without acceptance tests.
Not out of laziness — out of momentum.

Nexpath does not slow you down. It complements your momentum by appearing at the right moments
with the right questions: _"You just closed a feature. Want to cross-confirm the spec before
moving on?"_

**[EXPAND: Add research-backed motivation section (vibe coding stats, AI-generated code quality
findings) once the v0.1.1 UX research pass is complete.]**

**[EXPAND: Add section on spec-driven development and why it matters for AI-assisted projects.]**

---

## Relationship to ReviewDuel

Nexpath is an independent feature developed out of [**ReviewDuel**](<!-- EXPAND: add reviewduel public URL when it goes public -->),
an open-source peer-review layer for coding-agent workflows that we are actively developing
for internal use and plan to make public.

ReviewDuel focuses on **what you build** — reviewing artifacts, flagging risks, guiding code
quality. Nexpath focuses on **how you build** — guiding your development behaviour across
sessions so that spec, tests, and architecture decisions don't get skipped under vibe-coding
momentum.

We extracted Nexpath as an independent, standalone project so it can:
- Be adopted by developers who do not use ReviewDuel
- Be submitted to hackathons and evaluated on its own merits
- Evolve on its own release cycle

When ReviewDuel becomes public, Nexpath will also ship as an integrated component within it.

**[EXPAND: Add link to ReviewDuel public repo once it goes public.]**

---

## Features

<!-- EXPAND: Fill each feature with real description once flows are implemented. -->

### The Decision Session
**[PLACEHOLDER]** — The core interaction loop. Fires at key transition points in your dev
session. Presents structured options aligned with where you are in the spec-driven development
lifecycle. Non-intrusive. Never enforcing.

### Behaviour Map
**[PLACEHOLDER]** — Tracks your development patterns across sessions: spec confirmation
frequency, test creation habits, regression check behaviour, cross-confirmation of agent
output. Stored locally. Never sent anywhere.

### 3-Level Easier Options
**[PLACEHOLDER]** — When you cannot follow the recommended next step (time, budget, resources),
Nexpath offers progressively simpler alternatives — up to three levels — before logging the
skipped item for the `nexpath optimize` command.

### `nexpath optimize`
**[PLACEHOLDER]** — Run all previously skipped guidance options in one focused session.
Catch up on what you bypassed without losing the context of why it was suggested.

### Vocabulary & Tone Calibration
**[PLACEHOLDER]** — Nexpath reads your prompt history to calibrate whether you are a pure
vibe coder, a product-minded builder, or an experienced architect. It adjusts its language,
tone, and the depth of its guidance suggestions accordingly.

### Multi-Agent Support
**[PLACEHOLDER]** — Works with Claude Code, Cursor, Windsurf, Cline, Roo Code, Kilo Code,
OpenCode, and others. Captures prompt history via MCP integration.

### Mood & Nature Detection
**[PLACEHOLDER]** — Detects the user's current mood and developer nature from prompt patterns.
Adjusts the 2–3 word creative labels shown during decision sessions to be appropriately
humorous, technical, or balanced.

---

## Installation

<!-- EXPAND: Fill in once the package is published. -->

```bash
# [PLACEHOLDER — npm install command once published]
npm install -g nexpath

# [PLACEHOLDER — MCP registration step for coding agent integration]
nexpath init
```

**[EXPAND: Add step-by-step installation guide per supported coding agent once MCP setup flow is designed.]**

---

## Usage

<!-- EXPAND: Fill in all commands once CLI interface is designed. -->

### Core Commands

```bash
# [PLACEHOLDER — trigger a manual decision session]
nexpath

# [PLACEHOLDER — run all previously skipped guidance items]
nexpath optimize

# [PLACEHOLDER — view your behaviour map summary]
nexpath status

# [PLACEHOLDER — configure language, vocabulary level, or override settings]
nexpath config set <key> <value>
```

### Auto Mode

```bash
# [PLACEHOLDER — command name TBD; fires the decision session automatically
# at the right moment based on your session activity]
nexpath auto
```

**[EXPAND: Full command reference once CLI interface design is finalised.]**

---

## The Decision Session — How It Works

<!-- EXPAND: Full flow description with UX screenshots/recordings once implemented. -->

**[PLACEHOLDER]** — Step-by-step walkthrough of a decision session interaction:
1. How it detects the right moment to surface
2. What the session prompt looks like in the terminal
3. How the 3-level easier-options system works
4. What gets logged vs. what gets skipped
5. How `nexpath optimize` replays skipped items

**[EXPAND: Add terminal recording / asciinema demo once the UX is implemented.]**

---

## Configuration

<!-- EXPAND: Full config reference once all config fields are finalised. -->

**[PLACEHOLDER]** — Configuration is stored in `~/.nexpath/config.json`.

| Key | Values | Description |
|-----|--------|-------------|
| `language_override` | `en`, `hi`, `gu`, ... | Pin artifact language regardless of auto-detection |
| `vocabulary_level` | `beginner` \| `intermediate` \| `advanced` | Override auto-detected level |
| `[PLACEHOLDER]` | `[PLACEHOLDER]` | `[PLACEHOLDER]` |

---

## Privacy

<!-- EXPAND: Full privacy statement once data handling is finalised. -->

All data — prompt history, behaviour map, session logs — is stored **locally only**. Nothing
leaves your machine. No telemetry. No cloud sync.

**[EXPAND: Add full data handling statement once storage layer (SQLite schema) is finalised.]**

**[EXPAND: Add opt-out / data deletion instructions once implemented.]**

---

## Architecture

<!-- EXPAND: System design overview once architecture is finalised. -->

**[PLACEHOLDER]** — High-level architecture diagram and component description:
- MCP server (`nexpath-prompt-store`) for prompt capture
- SQLite storage at `~/.nexpath/prompt-store.db`
- Behaviour map engine
- Decision session runtime
- Vocabulary and language calibration layer

**[EXPAND: Add architecture diagram once system design is complete.]**

---

## Roadmap

<!-- EXPAND: Fill in milestones once v0.1.1 planning is complete. -->

| Version | Status | Description |
|---------|--------|-------------|
| **v0.1.1** | Planning | Core behaviour guidance system — the decision session, behaviour map, 3-level options |
| **[PLACEHOLDER]** | Not started | `[PLACEHOLDER]` |
| **[PLACEHOLDER]** | Not started | `[PLACEHOLDER]` |

---

## Contributing

<!-- EXPAND: Contributing guide once the repo is public and contribution workflow is set. -->

**[PLACEHOLDER]** — Contribution guide coming once the initial implementation is stable.

Nexpath is developed as an independent feature alongside [ReviewDuel](<!-- EXPAND: URL -->).
Contributions to Nexpath are tracked in this repo. The ReviewDuel integration is maintained
separately.

---

## License

<!-- EXPAND: Confirm license once decided. -->

**[PLACEHOLDER]** — License TBD. Expected: MIT or Apache 2.0.

---

## Acknowledgements

<!-- EXPAND: Add once project matures. -->

Built with insights from the vibe coding community and the spec-driven development movement.

**[EXPAND: Add specific acknowledgements, inspirations, and referenced works once finalised.]**
