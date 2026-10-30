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

Then grade the popups it produced:

```bash
node grading/grade-run.mjs --run=<run-id>
```

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
