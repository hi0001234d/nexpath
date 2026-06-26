# Nexpath — AI Coding Assistant for Cursor & Windsurf

**Stop. Think. Prompt better.**

Nexpath is an AI developer tool that works as a behaviour-guidance layer for vibe
coders — it surfaces a quick **decision session** *between* your prompts so you stay
aligned with specs, tests, and architecture decisions, without breaking your flow.

**Built for:** Cursor · Windsurf (Devin) — fully supported & end-to-end tested.

![Nexpath decision session](https://raw.githubusercontent.com/hi0001234d/nexpath/main/src/ext-vscode/media/nexpath-demo.png)

---

## What Is Nexpath?

Nexpath is an **AI coding-productivity** extension for developers using AI coding
agents like **Cursor** and **Windsurf**. Think of it as an **AI pair programmer**
focused on *process*, not code — it watches your session and surfaces a lightweight
advisory at key transition points in your **coding workflow**.

Instead of generating code, Nexpath guides it:

> *"You just shipped a feature. Want to confirm the feedback loop before moving on?"*

One nudge. You decide. No enforcement, no interruption — just the right question at the
right moment.

---

## Why Nexpath?

Vibe coding with AI coding agents lets you ship features in minutes — but that speed
often means skipped spec reviews, forgotten regression checks, and missing tests. Not
because you're careless, but because momentum takes over. Nexpath is the
**developer-productivity** layer that complements your AI workflow without slowing it down.

---

## Supported Agents

| AI Coding Agent | Status |
|---|---|
| **Cursor** | ✅ Fully supported · end-to-end tested |
| **Windsurf / Devin** | ✅ Fully supported · end-to-end tested |

> Nexpath installs in VS Code-family editors, but its guidance is built for and tested
> on **Cursor** and **Windsurf (Devin)**.

---

## Features

- **Between-prompt advisory** — a lightweight decision session at key transition points. Non-intrusive, never enforcing.
- **3-level easier options** — can't take the full recommendation? Nexpath offers progressively simpler alternatives before logging the skip.
- **Behaviour-aware** — tracks the shape of your session locally; your prompt history lives in a local store on your machine.
- **Nothing is lost** — every item you skip is logged locally, so you can revisit the ones that matter.
- **Adapts to your style** — calibrates its tone and depth to how you prompt.

---

## Getting Started

1. **Install** — search **"Nexpath AI"** in your editor's Extensions panel, **or** install
   directly: Command Palette → `ext install nexpath.nexpath-vscode`.
2. On first launch, Nexpath shows two prompts in the bottom-right:
   - **"Allow Nexpath to read your AI chat history for prompt-level guidance?"** → click
     **Allow**. (This lets Nexpath see your prompts so it can guide you — your data stays
     on your machine. Without it, Nexpath will not work.)
   - **"Set up Nexpath for Cursor now?"** → click **Set up**.
3. A terminal opens — answer the one-time prompts: your **OpenAI API key** and a quick
   **telemetry** choice.
4. Restart your agent and start prompting — Nexpath surfaces sessions when they help.

> Re-run setup anytime from the Command Palette → **"Nexpath: Set up CLI"**.

---


## Requirements

- **Cursor** or **Windsurf (Devin)** — VS Code `^1.80.0` or compatible.
- **Node.js ≥ 20.19** on your machine (the bundled engine needs it; older Node will fail to start).
- An **OpenAI API key** — <https://platform.openai.com/api-keys>. Without a valid key,
  prompts are tracked but no decision session is generated.

---

## Privacy

- Your **API key** is stored in your OS keychain (or a `0600` file fallback) — never bundled or logged.
- **Your prompt history is stored locally** on your machine.
- To generate a decision session, Nexpath sends **recent prompt context to OpenAI** using
  **your** key — that is the only place your prompt text is sent, and only when a session fires.
- **Telemetry is opt-in.** If you enable it, only anonymous usage events (command names,
  timings, error types) are collected — never your code, prompts, key, or file paths.
  Change anytime: `nexpath config set telemetry.enabled true|false`.

---

## License

[Apache-2.0](https://github.com/hi0001234d/nexpath/blob/main/LICENSE)

---

<p align="center">
  Built by <a href="https://parseos.io">ParseOS</a> · AI developer tools for the vibe-coding era
</p>
