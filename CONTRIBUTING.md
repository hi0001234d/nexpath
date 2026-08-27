# Contributing to Nexpath
 
Read the [README](README.md) first — it covers what
Nexpath does and how to install and run it. This guide covers how to contribute changes.
 
## Ways to Contribute
 
- **Reports** — [Issues](../../issues) for bugs and features,
  [Discussions](../../discussions) for everything else
- **Code** — bug fixes, pipeline work, new agent support
- **Docs** — the README, this guide, or the CLI help text
- **Reports** — [Issues](../../issues) for bugs and features,
  [Discussions](../../discussions) for everything else
 
## Reporting Bugs
 
[Search existing issues](../../issues) first to avoid duplicates, then
[open a new one](../../issues/new) with:
 
- OS, Node version, Nexpath version, and which AI coding agent
- The exact prompt or command that reproduces it
- What you expected, and the actual error text
- Output of `nexpath status` — plus `nexpath log` for advisory or popup issues
  (`NEXPATH_DEBUG=1` for verbose stderr)
 
> ⚠️ `nexpath status` dumps your config and `nexpath log` may contain your prompts — redact before
> pasting.
 
## Before You Start
 
- Open an issue first for features and non-trivial bug fixes; typos, small bug fixes, and type-only changes can be submitted directly
- State the problem, your approach, and why it belongs in Nexpath
- For features and non-trivial changes, wait for maintainer approval before opening a PR. **PRs without an approved issue may be closed.**
 
## Common Checks
 
Nexpath runs **no CI on pull requests** — your local run is the only gate.
 
```bash
npm run build          # prebuild gates: content-template + selectability
npm run typecheck      # core CLI + server
npm run typecheck:ext  # required if you touched src/ext-browser/
npm test               # vitest, whole tree
```
 
Three things that trip people up:
 
- **Build gates** — a content template that is schema-invalid, missing its level-1 floor, or
  unreachable by a realistic prompt aborts the build. Fix the record; don't bypass the gate.
- **`src/ext-vscode/`** — a separate package, excluded from the root checks. Run its own
  `npm install && npm run typecheck && npm run test && npm run build`.
- **`npm test` exits 1 on a public clone** — `dev-plan-table-integrity.test.ts` and
  `hv1-env-supply.test.ts` read a private submodule and fail with `ENOENT`. Those two are the only
  accepted failures; everything else red is your change.
 
## Pull Requests
 
- One feature or fix per PR; keep commits focused and logical
- Conventional commit titles — `fix(pe): lower the popup cooldown default`
- Relative imports need the `.js` extension (`NodeNext` ESM) — the most common first-build failure
- `strict` is on: no `any`, no stray `console.log`
- Never commit secrets, API keys, real home paths, or internal planning terminology
- Tests live next to the code as `<module>.test.ts` — add or update tests when behavior changes; a bug fix needs one that fails before the fix and passes after
- Rebase on the latest `main`, target `main`, and link the issue with `Fixes #123` when applicable
- **Paste real command output as testing evidence.** "Should pass" is not evidence. If a check is
  blocked, say which one, why, and what you ran instead.
- **You own what you submit** — AI agents are welcome, but you must understand the diff and be able
  to explain it
 
## Contribution Agreement
 
By submitting a pull request, you agree that your contributions are licensed under the project's
[Apache 2.0](LICENSE) license. 