# Changelog

## 0.1.35 — 2026-08-26

- Listing: the demo video is now linked at the top, next to what NexPath supports.

## 0.1.34 — 2026-08-25

- Popup selections now deliver within seconds in every case on Windows — a rare condition
  could previously delay the injected prompt by ~30 seconds.
- Windows Devin: one popup and one strengthened prompt per submission on builds that run
  both hook registrations — previously a submission could produce two.
- Windows: the first popup of a session injects and submits without the one-time
  half-minute warm-up delay.
- Windows: setup now completes cleanly for user accounts whose name contains a space
  (previously looped "dependencies incomplete" despite a healthy install).
- Refreshed the marketplace screenshot to show the submit-time flow.

## 0.1.33 — 2026-08-24

- **Prompt-submit guidance**: all popups now fire at the moment you submit a prompt on
  Cursor and Windsurf (Devin) — the prompt is held, a strengthened version is offered,
  and the version you choose is injected back and submitted for you. Only that runs.
- Windows support hardened end-to-end: hook payload parsing, workspace paths, keystroke
  targeting and timing, duplicate hook-registration handling.
- Per-editor setup verification with automatic self-heal, and clear guidance when a full
  editor restart is required.
- Delivery-timing fixes on all platforms so injected prompts never merge with pending
  ones or re-trigger guidance.
- Marketplace listing refreshed (GTM copy).

## 0.1.32 — 2026-06-29

- better-sqlite3 prebuilds for multiple Electron ABIs — works across Cursor/Windsurf
  Electron versions; per-IDE setup offer with a global CLI.

## 0.1.31

- User-facing README and marketplace metadata.

## 0.1.3

- First marketplace release (stable Cursor extension).
