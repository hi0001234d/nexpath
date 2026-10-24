# NexPath session harness

A test harness that runs [NexPath](https://github.com/hi0001234d/nexpath) the way a developer
actually uses it — a full multi-turn session through its real CLI hooks — and records what it decided
at every turn.

## Requirements

| | |
|---|---|
| Node | 22 or newer (`node:sqlite` is used to read NexPath's store) |
| Python | 3.8 or newer (gives each run its own terminal, so the popup never touches yours) |
| NexPath | cloned and **built** — `npm install && npm run build`, so `dist/cli/index.js` exists |
| An OpenAI key | only for runs where NexPath's own AI calls should happen |
| Platform | Linux (NexPath draws its popup to `/dev/tty`) |

## Run one session

```bash
# a free check: no key, so NexPath never calls out
node runner/run-session.mjs \
  --task=iterative__dvc_2.19.0_2.20.0 \
  --arm=nexpath \
  --project=/path/to/a/checkout \
  --nexpath-cli=/path/to/nexpath/dist/cli/index.js \
  --no-key
```

With NexPath's AI calls recorded, so a repeat is free and identical:

```bash
node proxy/proxy.mjs --mode=record --port=8787 --name=run1 &

node runner/run-session.mjs \
  --task=iterative__dvc_2.19.0_2.20.0 --arm=nexpath \
  --project=/path/to/a/checkout \
  --nexpath-cli=/path/to/nexpath/dist/cli/index.js \
  --env-file=/path/to/a/file/holding/OPENAI_API_KEY \
  --proxy-url=http://127.0.0.1:8787/v1 --require-proxy-mode=record
```

## Agent driver (experimental)

`runner/agent-driver.mjs` hands the complete frozen prompt list, in order, to
Claude Code (`claude -p ... --resume ...`), including conditional turns.
Real tasks must provide all frozen rows in `turns.jsonl`; shortened runs are
rejected. It supports both arms:

- `arm: control`: each prompt goes straight to the agent; NexPath is never invoked,
  even if `--nexpath-cli` is given.
- `arm: nexpath`: the measured arm is the standalone hook path. The driver
  calls `nexpath auto` before each agent turn and `nexpath stop` afterward,
  using a private PTY from `runner/pty-run.py`. Accepted `additionalContext`
  reaches the agent, while an explicit UserPromptSubmit block sends nothing.
  Each standalone run gets a fresh run-local `session.db`.
  Every hook invocation records its exact JSON stdin alongside stdout,
  stderr, and PTY logs. Treat run artifacts as potentially sensitive data.
  From the second turn onward, `auto` receives the real Claude Code session
  transcript path, located from the real HOME by session id rather than guessed
  from the project slug. Continuation prompts also carry this path.
  `--from-runner` accepts preprocessed NexPath rows from `run-session.mjs`
  without repeating hooks, but marks the output `arm_definition: "fixture"`.
  Fixture runs must not be interpreted as measured NexPath-arm results.

  When `stop` accepts guidance (the real hook contract: stdout
  `{"decision":"block","reason":...}` on a clean exit), it is delivered to the same
  Claude Code session as a separate continuation turn via `--resume`. The frozen
  prompt in `turns.jsonl` is never rewritten. The continuation's own
  UserPromptSubmit/Stop fire too (Stop with `stop_hook_active:true`, matching Claude
  Code's own loop-guard condition), and the chain is capped by `--max-continuations`
  (default 2) so a build that keeps blocking cannot loop the driver forever. Reaching
  the cap is logged and recorded. Each continuation's prompt, guidance,
  session id, hook outcome, agent result and patch are recorded in their own row in
  `continuations.jsonl`, separate from the turn's own row in `agent-results.jsonl`.
  Agent rows include raw cumulative Claude cost, per-call cost deltas, usage and
  duration. The standalone run DB records `advisory_frequency`, selected by
  `--level=optimum` (default) or `--level=every_event`, and provides separate
  popup-prepared and popup-shown fields, fired flags, and section counts.
  Popup preparation comes from the enhancement row. A displayed popup is
  counted only when `session_states.state_json.shownPopupCount` increases,
  not when a row is merely marked consumed (`status: "shown"`).
  The run metadata records source versions, empty Claude setting sources,
  and whether the real HOME has Claude hook settings (event names and counts,
  never command contents).
  Processed NexPath handoffs require `--from-runner` and consistent hook-outcome
  fields and accepted `submit` values. The driver does not re-invoke their hooks.

  Hook calls check exit status and timeouts. A failed NexPath hook fails the
  NexPath-arm run instead of appearing as a successful no-guidance turn.
  Hooks use their own pseudo-terminal, not the operator's terminal.

  Each step records a cumulative patch from the starting commit and an
  incremental patch for that step. Staging changes before generating the
  patches includes untracked files. The index is reset after capture, leaving
  file changes in the working tree. Reuse a clean checkout for another run;
  do not discard experimental changes without checking them.

### Known limitations

- **OS keychain is not sandboxed.** A fresh `$HOME` isolates the usual
  `~/.nexpath/config.json` fallback, but NexPath can still read credentials
  from the login-session OS keychain. Consequently, `--no-key` does not
  guarantee a credential-free run on a machine with a stored key.
  `meta.json` records `credential_isolation.keychain_sandboxed: false`. Complete isolation
  requires a separate environment or a change to NexPath's credential resolver.
- **End-to-end live guidance remains unverified.** Offline tests exercise the
  private PTY and enhanced-prompt forwarding with mock processes, but no live
  Claude Code coding-agent benchmark with real NexPath guidance is established.

```bash
node runner/agent-driver.mjs --turns=runs/<run-id>/turns.jsonl --project=<checkout> \
  --execute --nexpath-cli=/path/to/nexpath/dist/cli/index.js
# For fixture-only handoff of run-session NexPath rows, add --from-runner.
# For repeatable live hook calls, pass --proxy-url=... --require-proxy-mode=replay
```

It validates every prompt against the corresponding frozen entry in
`prompts/<task>.json` without skipping conditional turns. After the session,
`fits.jsonl` records a `fits: true|false` check for every frozen `assumes` line,
using prior transcript tool actions, agent replies and cumulative pre-turn Git
patches. The same fields are added to `agent-results.jsonl`, and `meta.json`
reports counts per arm. These evidence checks are conservative, especially for
subjective reply assumptions: missing evidence is marked `false`, not guessed.
They are reported for auditing, **never** counted as SWE-EVO scores.
See `--help` for every flag.

For Layer 0 grading, choose an output directory beneath `runs/`, for example
`--out=runs/driver-01` (relative to the harness directory). The driver writes
`runs/driver-01/meta.json` with `prompts_file` and `popups_shown`, and
`runs/driver-01/popups/<NN>.txt` with the popup body, excluding the
UserPromptSubmit wrapper. Enhanced continuation popup bodies are saved under
`popups/continuations/` so their extra filenames cannot be misread as
numbered frozen prompts by the existing grader. No grading code is changed.

```bash
node grading/grade-run.mjs --run=driver-01
```

Stop decisions (including malformed or capped guidance) are recorded on the
original turn and summarized in `meta.json`.

Every script takes `--help`.

## Layout

| path | what it is |
|---|---|
| `runner/run-session.mjs` | drives one session: the prompts in, the decisions and popups out |
| `runner/pty-run.py` | gives the run its own terminal and answers the popup |
| `proxy/proxy.mjs` | record / replay / auto for NexPath's AI calls |
| `proxy/rekey.mjs` | re-keys an existing cassette without calling the API |
| `grading/GRADING-SHEET.md` | the five yes/no rules for popup text |
| `grading/grade-run.mjs` | applies them, writes `grades.csv` |
| `prompts/<task>.json` | the frozen conversation for a task |
| `HOW-IT-WORKS.md` | the moving parts, in more detail |
| `runs/<id>/turns.jsonl` | what the agent must receive, one row per turn (the handover file) |
| `runs/`, `proxy/cassettes/` | local output — not published |
