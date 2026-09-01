# Nexpath — Browser Extension. Code Fast. Skip Nothing.

**Stop. Think. Prompt better.**

Nexpath is an AI developer tool that works as a behaviour-guidance layer for vibe coders — it
reviews a prompt **as you send it** and, when it's risky, offers a stronger version *before* it
reaches your agent, so you stay aligned with specs, tests, and architecture decisions without
breaking your flow.

**Built for:** Replit · Lovable · Bolt — fully supported & end-to-end tested.

---

## What Is Nexpath?

Nexpath is an **AI coding-productivity** extension for developers using in-browser AI coding agents
like **Replit**, **Lovable**, and **Bolt**. Think of it as an **AI pair programmer** focused on
*process*, not code — it watches your session and, at key moments in your **coding workflow**,
briefly holds the prompt you are sending to offer an improved version of it.

Instead of generating code, Nexpath guides it:

> *"This prompt skips the spec check. Want to send the stronger version instead?"*

One panel. You decide. Use the suggestion, or send your original untouched — and if Nexpath can't
decide in time, your prompt goes through as-is. Never enforcing, never in the way.

---

## Why Nexpath?

Vibe coding with AI agents lets you ship features in minutes — but that speed often means skipped
spec reviews, forgotten regression checks, and missing tests. Not because you're careless, but
because momentum takes over. Nexpath is the **developer-productivity** layer that complements your AI
workflow without slowing it down.

---

## Supported Agents

| AI Coding Agent | Status |
|---|---|
| **Replit** | ✅ Fully supported · end-to-end tested |
| **Bolt** | ✅ Fully supported · end-to-end tested |
| **Lovable** | ✅ Fully supported · end-to-end tested |

---

## Features

- **Submit-time review** — when a prompt is risky, Nexpath holds it and offers a stronger version
  before it reaches the agent. You choose which one to send; a held prompt is never lost.
- **3-level easier options** — can't take the full recommendation? Nexpath offers progressively simpler alternatives before logging the skip.
- **Send it straight to your agent** — accept a suggestion and Nexpath delivers it into the chat for you, or use your original prompt with one click.
- **Adapts to your style** — calibrates its tone and depth to how you prompt.
- **Runs on your key or your account** — bring your own OpenAI API key, or use a Nexpath token from
  a free Nexpath account instead.

---

## Getting Started

1. **Install** — from the **Chrome Web Store** (Chrome / Edge) or **Firefox Add-ons**.
2. Open Nexpath's **Settings** page and set up either credential:
   - a **Nexpath token** — create a free account at [parseos.tech/nexpath](https://parseos.tech/nexpath/),
     copy the token from your account page, paste it → **Save** → **Test**; or
   - your own **OpenAI API key** (`sk-…`) → **Test** → **Save**.
3. Pick your **role**, then start prompting in Replit, Lovable, or Bolt — when a prompt is worth a
   second look, Nexpath holds it and shows the suggestion right there.

---

## Requirements

- **Chrome** (or Edge/Chromium) or **Firefox 112+**.
- **One credential, REQUIRED** — either an **OpenAI API key**
  (<https://platform.openai.com/api-keys>) or a **Nexpath token** from a free account at
  [parseos.tech/nexpath](https://parseos.tech/nexpath/). Without one, Nexpath stays idle and no
  suggestions appear.

---

## Privacy

- Your **API key or Nexpath token** and settings are stored **locally in your browser** — never
  bundled or logged.
- With **your own OpenAI key**: recent prompt context is sent **only to OpenAI**, using your key,
  and only when a suggestion fires — ParseOS receives nothing.
- With a **Nexpath token**: prompt context is sent to **Nexpath's own service**, which forwards it
  to OpenAI to generate the suggestion and meters your account credit.
- **No telemetry, no tracking, no remote code** — in either mode. Full policy:
  [privacy policy](https://hi0001234d.github.io/nexpath/privacy.html).

---

## License

[Apache-2.0](https://github.com/hi0001234d/nexpath/blob/main/LICENSE)

---

<p align="center">
  Built by <a href="https://parseos.io">ParseOS</a> · AI developer tools for the vibe-coding era
</p>
