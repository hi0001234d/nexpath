# Changelog — Nexpath Browser Extension

All notable changes to the browser extension. Versions track the `version` field in
`manifest.chrome.json` / `manifest.firefox.json`.

## 0.1.52

Faster delivery, and no clipboard permission prompt on Chrome.

### Changed
- **The suggestion arrives sooner.** The check that confirms your prompt was sent now samples
  densely for the first second instead of waiting out a fixed interval, so a send that worked is
  recognised almost immediately. The overall time limit is unchanged.
- **Chrome no longer asks to see your clipboard.** Delivery on Bolt now uses a direct text
  insertion rather than a synthetic paste event. The paste event was what made the site reach for
  the clipboard, which is what raised the browser's permission bubble.
- **Replit delivery goes through the editor itself.** The improved prompt is applied as a single
  editor transaction, so it no longer has to be split into pieces to fit a paste size limit, and
  arrives in one step regardless of length. The previous method remains as a fallback.

### Fixed
- A prompt could be sent twice when a site cleared its composer in the last moment of the settle
  window.
- A multi-line prompt could be reported as "not delivered" when it had in fact arrived, because the
  check read the composer's raw text rather than what it actually renders.

### Notes
- Permissions, supported sites and privacy behaviour are unchanged from 0.1.51.
- An OpenAI API key is still required.

## 0.1.51

The suggestion now arrives **before** the prompt is sent, not after the agent replies.

### Changed
- **Submit‑time popup.** Submitting a prompt on a supported site holds it while Nexpath prepares a
  suggestion, and the popup offers an improved version of that prompt alongside the original. In
  0.1.5 the popup appeared only after the agent had finished responding, by which point the prompt
  had already been sent.
- **The chosen prompt is delivered per site.** Lovable rewrites the request already in flight, so
  nothing is re‑typed. Bolt and Replit cancel the submission and re‑issue it through the composer,
  which is briefly visible.
- **Choosing "Use original prompt" sends it immediately.** The short feedback question that follows
  no longer holds the prompt back while it is answered.
- **No time limit on the popup.** It waits for the user, matching the CLI. A heartbeat keeps the
  session alive, and the original prompt is sent unchanged if anything fails.

### Added
- **Prompt‑enhancement engine in the extension**, with the CLI's own popup surfaces rendered as a
  right‑docked panel: the enhanced body, additional details, directional refinements, the
  multi‑prompt sequence offer, and the post‑decision feedback step.

### Notes
- Permissions are unchanged from 0.1.5 (`storage`, `tabs`, and the same four supported sites).
- An OpenAI API key is required for the popup to appear; without one the extension stays idle.

## 0.1.5

First release candidate — CLI‑parity classifier and popup.

### Added
- **Local classifier (CLI parity):** keyword → TF‑IDF two‑tier classification, byte‑identical to
  the CLI's `natural`‑backed classifier (weights precomputed from `natural`, verified by a
  differential test).
- **Natural‑language detection:** detects the language of recent prompts (tinyld) and adapts the
  suggestion wording, mirroring the CLI.
- **Advisory popup** on Replit, Lovable, and Bolt: capture → classify → Stage‑2 → suggestion, shown
  when the agent finishes responding. Multi‑level options (L1/L2/L3), pinch/question/why‑help,
  profile‑adaptive register.
- **Send to your agent / Copy to clipboard / Skip**, an in‑panel frequency/role chooser
  (Alt+Shift+T), and per‑project disable (Alt+Shift+X).
- Options page: bring‑your‑own OpenAI API key (with a Test button), advisory frequency, and role.

### Changed / Fixed (CLI parity)
- Removed the non‑functional MiniLM "Tier 3" stub; classification is now keyword + TF‑IDF, matching
  the CLI (fixes non‑keyword prompts previously defaulting to `implementation/0`).
- Firefox inject‑back: `execCommand('insertText')` fallback so "Send to your agent" reliably lands
  and submits on Firefox (WebKit/Gecko clipboard‑event differences).
- **Drift‑resilient composer lookup:** "Send to your agent" now resolves the agent's chat input via a
  prioritised selector fallback list and prefers the first *rendered* match (`resolveComposer` in
  `inject-kit.ts`) instead of one pinned selector — fixes Lovable's inject‑back silently falling back
  to clipboard after Lovable renamed the composer's aria‑label (`"Chat input"` → `"Ask Lovable…"`).
  Purely additive: every original selector is kept as the top priority. Live‑verified on lovable.dev.
- Popup detail text brightened to a readable light gray, non‑italic (matches the CLI).
- Space now toggles a single option's details without collapsing others (non‑exclusive, CLI parity).
- "Copy to clipboard" now closes the popup instead of returning to the option list (CLI
  `clipboard_only` parity).
- **Store summary aligned to brand:** the manifest `description` (which Chrome uses as the store
  summary) now reads "AI coding assistant for Replit, Lovable, and Bolt — a behaviour-guidance
  layer for vibe coders." — the same pattern the Nexpath VS Code extension uses, kept within
  Chrome's 132-char summary limit (guard-tested).
- **Minimised permissions:** removed the unused `scripting` permission from both manifests —
  all injection is declarative (`content_scripts` + `web_accessible_resources`), so it was
  never used. The extension now requests only `storage` and `tabs`. A manifest guard test
  pins this surface so an unused permission can't be reintroduced.

### Notes
- Bring‑your‑own OpenAI key; nothing is sent anywhere except the user's own OpenAI account.
- No remote code (MV3‑compliant); no telemetry.
