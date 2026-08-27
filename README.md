  # Nexpath CLI — Build Fast. Ship with Confidence.

> **A local-first behaviour guidance layer that helps builders catch missing checks before AI-generated work becomes shipped risk.**

AI coding agents make it easy to move fast. Nexpath helps reduce the chance that speed quietly becomes an unverified bug, an unsafe change, an unmaintainable codebase, or hours of manual review later.


## Prompt Enhancement — A Practical Twist

Within Nexpath's broader behaviour-guidance vision, Prompt Enhancement is the first feature we're introducing as a practical twist: it saves vibe coders from writing every prompt detail by hand while preserving their original intent. When a task needs more rigour, it can suggest missing development practices, verification, or confirmation steps — encouraging users to give a mature development flow the time it needs to finish.

**Demo:** [Prompt Enhancement in action, on YouTube](https://youtu.be/pNejtPA5DPU)

---

## Why Nexpath Exists

- AI can introduce a bug without making the risk obvious.
- Fast generation can leave a codebase harder to maintain after every change.
- Security, rollback, regression, and acceptance checks are easy to miss while momentum is high.
- Reviewing every AI-generated decision manually can cost more time than the generation saved.

Nexpath reduces these risks by noticing what the current workflow is missing and bringing the relevant check into the work at the right moment. It does not replace developer judgement or promise bug-free code; it helps make that judgement faster, more structured, and harder to skip.

---

## A Workflow, Not Another Tool

1. **Build with your AI coding agent** — Work in the tools and flow you already use.
2. **Review with Nexpath** — Let the Prompt Quality Layer surface missing verification, safety, scope, or maintenance steps while the context is still fresh.
3. **Ship confidently** — Move forward after the important checks are visible, reviewed, and included in the task.

Nexpath is one focused step inside a better shipping workflow — not a new place where development has to happen.

Built during AI Hackfest 2026 by MLH.

---

## The Prompt Quality Layer — How It Works

1. **Understand** — Nexpath reviews the prompt, the current development stage, and relevant workflow signals while preserving the complete original request.
2. **Structure** — It builds one editable prompt with the sections the task needs, such as scope, constraints, acceptance expectations, verification, or missing-practice guidance.
3. **Safeguard** — Higher-risk work can receive confirmation, safety, rollback, or evidence requirements. Complex work can also receive a sequence-aware breakdown when multiple prompts would be more effective.
4. **Review** — You inspect and edit the result before sending it, or return to the original prompt. Nexpath provides the quality layer; you keep the final decision.

---

## How Nexpath Reduces Risk

### Fewer Silent Bugs and Missed Checks

- Verification and test expectations can be added for debugging, maintenance, planning, review, and other tasks that need proof of completion.
- Absence signals can surface missing regression checks, acceptance criteria, reproduction evidence, or project grounding.
- Weak or unrelated signals are not used as filler; guidance must match the current task.
The core interaction keeps your request and the added workflow guidance together:

### Safer High-Risk Changes

- Sensitive actions can receive explicit confirmation, rollback, backup, or safety requirements before the reviewed prompt is used.
- Double confirmation, cross-confirmation, and final confirmation are used only when the task's complexity or risk justifies them.
- The quality layer does not silently expand authority, auto-send work, or treat an agent response as proof of completion.

### A More Maintainable Development Flow

- Scope, constraints, acceptance expectations, affected surfaces, and behaviour-preservation needs stay visible instead of being lost in a fast request.
- Complex work can be decomposed into a clear current task plus a compact, ordered sequence plan.

### Less Review Overhead, Without Losing Control

- Your complete original request stays visible inside one editable, quality-reviewed prompt.
- You can edit the result, use it, or return to the original request before the reviewed version is sent.

---

### Supported AI Coding Agents & Developer Tools

Nexpath CLI is built for prompt capture across AI coding agents.

| Agent | Status in v0.1.4 |
|-------|-----------------|
| **Claude Code** | Fully supported — end-to-end tested |
| **Cursor** | Not yet supported — end-to-end testing planned for v0.1.5 |
| **Windsurf** | Not yet supported — end-to-end testing planned for v0.1.5 |
| **Replit** | Not yet supported — end-to-end testing planned for v0.1.5 |
| **Lovable** | Not yet supported — end-to-end testing planned for v0.1.5 |
| **Bolt.new** | Not yet supported — end-to-end testing planned for v0.1.5 |

---

## Add Nexpath to Your Development Workflow — Installation

```bash
# Clone and build from source
git clone https://github.com/hi0001234d/nexpath.git
cd nexpath
npm install
npm run build
npm link

# Register with your coding agent and verify
nexpath install
nexpath install --yes      # or accept defaults without prompts

# Verify
nexpath --version
```

Setup notes:
- During install you pick your project role (what kind of work you do) so Nexpath tailors its guidance to how you build.
- Nexpath's core is Prompt Enhancement (PE), with Multi-Prompt Sequence (MPS) and Prompt Enhancement Feedback (PEF) — these work automatically as you code.

### Uninstalling

```bash
# Remove the Nexpath CLI
nexpath uninstall
npm uninstall -g nexpath
npm unlink -g nexpath

# Verify it's gone
npm list -g nexpath
which nexpath

# Clear local data and caches
rm -rf ~/.nexpath
rm -rf ~/.config/nexpath
rm -rf ~/.local/share/nexpath
rm -rf ~/.cache/nexpath

# Clear the npm cache
npm cache clean --force
```

`nexpath uninstall` disconnects Nexpath from all detected agents and offers to clear the stored
API key. The remaining steps remove the global package, any leftover binary, and all local
data and caches.

---

## Configuration and Privacy

### Privacy Controls

All data is stored **locally only** at `~/.nexpath/`. Only targeted LLM calls used to classify or
prepare relevant guidance leave your machine.

- **Automatic secret redaction** — API keys (`sk-*`, `ghp_*`, `ghu_*`), bearer tokens, and
  PEM blocks are automatically stripped from prompts before storage.
- **Install-time consent** — During `nexpath install`, telemetry is a separate consent step
  (defaults to enabled). Local prompt capture and remote telemetry are independent — disable
  either anytime via `nexpath store disable`(if you do this, nothing will work) or
  `nexpath config set telemetry.enabled false`.

### Deleting Stored Prompts

```bash
# Delete prompts for a specific project you no longer want to keep
nexpath store delete --project <path>

# Delete all stored prompts permanently
nexpath store delete -y
```

---

## Troubleshooting

### Where Is My API Key Stored?

| Platform | Default location | Inspect with |
|---|---|---|
| macOS | Keychain | Keychain Access.app → search "nexpath" |
| Linux | Secret Service (libsecret) | `secret-tool lookup service nexpath account openai_api_key` |
| Windows | Credential Manager | Control Panel → Credential Manager → Web Credentials |
| Fallback (any OS) | `~/.nexpath/config.json` (mode 0600) | `cat ~/.nexpath/config.json` |

Use `nexpath config show-key-source` to confirm which layer is currently active.

---

## Contributing

[Contribution guide](CONTRIBUTING.md)

---

## License

[Apache License 2.0](LICENSE)

---

## Acknowledgements

- **Major League Hacking (MLH)** — For organizing AI Hackfest 2026
- **Anthropic** — For Claude Code, our primary development environment
- **OpenAI** — For models used in targeted classification and prompt-quality tasks
- **Google** — For Gemini AI, planned as an alternative LLM provider alongside OpenAI

Built with insights from the vibe coding community and developers building real projects with AI coding agents, coding AI tools, and AI developer tools.
