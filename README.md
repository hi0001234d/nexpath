# Nexpath

> **A behaviour guidance layer for vibe coders and coding-agent users.**

Nexpath gives developers meaningful direction while they work with AI coding agents — helpful suggestions at the right moment, without slowing you down.

---

## What Is Nexpath?

Nexpath is a behaviour guidance system for developers using AI coding agents. It monitors your
development sessions, understands where you are in your project lifecycle, and surfaces
**"the decision session"** — a lightweight, non-intrusive interactive prompt that gives you
meaningful input and direction without ever forcing your hand.

When Nexpath detects a meaningful moment in your workflow — like transitioning from planning
to architecture, or finishing a coding task without running tests — it presents a set of
**pre-filled agent prompts** you can select with one keypress. These aren't tips. They're
ready-to-send prompts that tell your AI agent exactly what to do next.

If the suggested actions don't fit your current situation, Nexpath offers progressively
simpler alternatives across three levels. If none fit at all, skip it — `nexpath optimize`
lets you revisit skipped items later in one focused session.

**Fully supported on Claude Code as of v0.1.1.** Support for additional coding agents is
planned for v0.1.3.

---

## Why Nexpath Exists

Vibe coding has changed how software gets built. AI coding agents can generate entire features
from a single sentence — but the speed of generation often outpaces the discipline of process.
Developers skip reviews. They forget regression checks. They ship without acceptance tests.
Not out of laziness — out of momentum.

We saw this firsthand in our own team's workflows: careless approvals, skipped cross-confirmation,
over-reliance on AI output. These problems get worse in vibe-coded projects where the entire
codebase may have been generated without rigorous verification at any stage.

Nexpath was built during AI Hackfest 2026 by MLH, informed by prior deep research on MCP and
coding agent workflows. It addresses the gap between what AI agents can generate and what
disciplined development actually requires — giving developers helpful direction, interesting
input, and meaningful suggestions right inside their coding sessions.

Nexpath does not slow you down. It complements your momentum by appearing at the right moments
with the right questions: _"You just finished a feature. Want to cross-confirm before
moving on?"_

---

## Relationship to ReviewDuel

Nexpath is an independent project developed alongside **ReviewDuel**, an open-source peer-review
layer for coding-agent workflows.

ReviewDuel focuses on **what you build** — reviewing artifacts, flagging risks, guiding code
quality. Nexpath focuses on **how you build** — guiding your development behaviour across
sessions so that important steps like testing, reviews, and architecture decisions don't get
skipped under vibe-coding momentum.

Nexpath was extracted as an independent, standalone project so it can:
- Be adopted by developers who do not use ReviewDuel
- Be submitted to hackathons and evaluated on its own merits
- Evolve on its own release cycle

When ReviewDuel becomes public, Nexpath will also ship as an integrated component within it.

---

## Features

### The Decision Session

The core interaction. When Nexpath detects a stage transition in your development workflow, it
presents structured options aligned with where you are in your project lifecycle. Each option
is a pre-filled prompt ready to send to your AI agent — select it and hit Enter.

Decision sessions fire at key moments: moving from idea to planning, planning to architecture,
architecture to task breakdown, completing a task, finishing a phase, and pre-release checks.

### 3-Level Easier Options

When you can't follow the recommended next step — whether due to time, budget, or resources —
Nexpath offers progressively simpler alternatives. Level 1 is the full-depth recommendation,
Level 2 is lighter, and Level 3 is the minimum viable step. If even Level 3 doesn't fit, skip
it and come back later.

### `nexpath optimize`

Run all previously skipped guidance items in one focused session. Nexpath replays each skipped
decision session from oldest to newest, using the same 3-level cascade. Items you address are
removed from the queue; items you skip again stay for next time.

### Vocabulary and Tone Calibration

Nexpath reads your prompt history to calibrate whether you are a pure vibe coder, a
product-minded builder, or an experienced architect. It classifies your developer nature into
one of four archetypes (Beginner, Cool Geek, Hardcore Pro, or Pro-Geek Soul) and detects your
current session mood (focused, excited, frustrated, casual, rushed, or methodical). This shapes
the tone and wording of the creative 2–3 word labels that open each decision session.

### Prompt Classification

Nexpath classifies your prompts against 8 development stages using a two-tier cascade:
- **Tier 1 — Keyword matching** (<1ms): Fast pattern detection against curated signal vocabulary
- **Tier 2 — TF-IDF scoring** (<5ms): Statistical text analysis when keywords are ambiguous

Before surfacing a decision session, a lightweight LLM call (OpenAI gpt-4o-mini) cross-confirms
the classifier's detection to reduce false positives.

### Absence Detection

Nexpath tracks which development signals are present or missing in your session. If you've been
coding for 15+ prompts in a confirmed stage without mentioning tests, cross-confirmation, or
regression checks, it raises an absence flag and offers relevant suggestions.

### Agent Support

Nexpath is built on the Model Context Protocol (MCP) for prompt capture across AI coding agents.

| Agent | Status in v0.1.1 |
|-------|-----------------|
| **Claude Code** | Fully supported — MCP registration, advisory hook, end-to-end tested |
| **Cursor** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |
| **Windsurf** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |
| **Cline** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |
| **Roo Code** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |
| **KiloCode** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |
| **OpenCode** | Config detection and MCP registration implemented; end-to-end testing planned for v0.1.3 |

---

## Installation

```bash
# Clone and build from source
git clone https://github.com/hi0001234d/nexpath.git
cd nexpath
npm install
npm run build
npm link

# Register with Claude Code
nexpath install --yes

# Verify
nexpath status
```

### Environment Variables

```bash
# Required for LLM features (Stage 2 cross-confirmation + pinch labels)
export OPENAI_API_KEY=your-key-here
```

Without an API key, Nexpath still functions — it falls back to static pinch labels and skips
Stage 2 cross-confirmation. The local classifier and decision session UI work fully offline.

---

## Usage

### Commands

```bash
# Register Nexpath with your coding agent
nexpath install --yes

# Remove Nexpath registration
nexpath uninstall

# Set up a new project (interactive questionnaire)
nexpath init

# Revisit previously skipped decision session items
nexpath optimize

# View MCP connections, prompt store stats, and config
nexpath status

# View recent activity log
nexpath log
nexpath log --tail 20 --level error

# Manage configuration
nexpath config get <key>
nexpath config set <key> <value>

# Manage the prompt store
nexpath store enable       # Enable prompt capture
nexpath store disable      # Disable (keeps existing data)
nexpath store delete -y    # Delete all stored prompts
nexpath store prune --older-than 30d   # Remove old prompts
```

---

## The Decision Session — How It Works

1. **Detection** — As you work with your coding agent, Nexpath captures each prompt via MCP
   and classifies your development stage in <5ms using keyword matching and TF-IDF scoring.

2. **Trigger** — When a stage transition is detected (e.g., you've moved from planning to
   coding), a lightweight LLM call confirms the detection. If confirmed, the decision session
   fires.

3. **Presentation** — A 2–3 word creative label appears (e.g., "Before coding.", "Quick check."),
   followed by a question and a set of pre-filled prompt options.

4. **Selection** — Pick an option to send it directly to your agent, or select
   "Show simpler options" to see lighter alternatives (up to 3 levels).

5. **Skip** — Select "Skip for now" and the item is recorded. Run `nexpath optimize` later
   to revisit all skipped items in one session.

---

## Configuration

Configuration is stored in the SQLite database at `~/.nexpath/prompt-store.db`.

| Key | Default | Description |
|-----|---------|-------------|
| `prompt_capture_enabled` | `true` | Enable or disable prompt capture |
| `prompt_store_max_per_project` | `500` | Maximum prompts stored per project |
| `prompt_store_max_db_mb` | `100` | Maximum database size in megabytes |

```bash
nexpath config get prompt_capture_enabled
nexpath config set prompt_store_max_per_project 1000
```

---

## Privacy

All data is stored **locally only** at `~/.nexpath/`. Nothing leaves your machine except two
targeted LLM calls per decision session (sending only session context — last 10 prompts and
detected stage).

- **Automatic secret redaction** — API keys (`sk-*`, `ghp_*`, `ghu_*`), bearer tokens, and
  PEM blocks are stripped from prompts before storage
- **Configurable limits** — 500 prompts per project, 100 MB total DB size (both configurable)
- **Full control** — disable capture (`nexpath store disable`), delete all data
  (`nexpath store delete`), prune old prompts (`nexpath store prune --older-than 30d`)
- **First-run disclosure** — on the first prompt capture, Nexpath prints a banner explaining
  what it stores and how to opt out

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Coding Agent                         │
│               (Claude Code — fully supported)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  nexpath-serve (MCP stdio server)                           │
│  ┌──────────────────┐     ┌────────────────────────────┐   │
│  │  capture_prompt   │────▶│  prompt-store.db (SQLite)   │   │
│  │  tool handler     │     │  ~/.nexpath/                │   │
│  └──────────────────┘     └────────────────────────────┘   │
│                                                             │
│  Advisory pipeline (fires automatically between prompts)    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │  Stage 1: Prompt Classifier                    │   │  │
│  │  │  Tier 1: Keyword Match (<1ms)                  │   │  │
│  │  │  Tier 2: TF-IDF Scoring (<5ms)                 │   │  │
│  │  └────────────────────┬──────────────────────────┘   │  │
│  │                       │                               │  │
│  │  ┌────────────────────▼──────────────────────────┐   │  │
│  │  │  Session State Manager                         │   │  │
│  │  │  stage tracking · signal counters              │   │  │
│  │  │  absence detection · user profile              │   │  │
│  │  └────────────────────┬──────────────────────────┘   │  │
│  │                       │                               │  │
│  │  ┌────────────────────▼──────────────────────────┐   │  │
│  │  │  Stage 2: LLM Cross-Confirmation               │   │  │
│  │  │  OpenAI gpt-4o-mini                            │   │  │
│  │  └────────────────────┬──────────────────────────┘   │  │
│  │                       │                               │  │
│  │  ┌────────────────────▼──────────────────────────┐   │  │
│  │  │  Decision Session UI                            │   │  │
│  │  │  pinch label → question → L1 / L2 / L3         │   │  │
│  │  │  selected prompt → back to agent                │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Development Lifecycle Stages

```
Idea → PRD → Architecture → Task Breakdown → Implementation → Review/Testing → Release → Feedback Loop
```

Decision sessions fire at forward stage transitions, offering relevant pre-filled prompts
to help you cross-confirm work before moving on.

---

## Roadmap

| Version | Status | Description |
|---------|--------|-------------|
| **v0.1.1** | Completed | Core behaviour guidance system — decision sessions, 3-level options, `nexpath optimize`, prompt classification, developer profiling. Full Claude Code support. |
| **v0.1.2** | Planned | Fix existing MCP server issues and stabilise the advisory pipeline for production reliability. |
| **v0.1.3** | Planned | Expand end-to-end support to additional coding agents: Cursor, Windsurf, Cline, Roo Code, KiloCode, and OpenCode. |

---

## Contributing

Contribution guide coming once the initial implementation is stable.

Nexpath is developed as an independent project alongside ReviewDuel. Contributions to Nexpath
are tracked in this repo. The ReviewDuel integration is maintained separately.

---

## License

[Apache License 2.0](LICENSE)

---

## Acknowledgements

- **Major League Hacking (MLH)** — For organizing AI Hackfest 2026
- **Anthropic** — For Claude Code, our primary development environment
- **OpenAI** — For gpt-4o-mini, the runtime LLM powering cross-confirmation and pinch labels
- **Model Context Protocol** — For enabling cross-agent prompt capture

Built with insights from the vibe coding community and developers building real projects with AI coding agents.
