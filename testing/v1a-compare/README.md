# v1(a) comparison: V1 vs the three tools

Runs a prompt set through the **real** `nexpath auto` / `nexpath stop` hooks of this repo's build and
records, for every prompt, exactly what Feature 1 hands to Nexpath's writer AI, which source it came
from (our map, MemOS, OpenClaw, codebase-memory-mcp) and, with a key, the popup text.

```bash
nvm use 24                      # Node 24.22+
npm run build
H=$(mktemp -d) && mkdir -p $H/.cache && ln -s ~/.cache/memos $H/.cache/memos   # reuse MemOS's model
REAL_HOME=$HOME HOME=$H node testing/v1a-compare/run.mjs tools testing/v1a-compare/prompts-natural.json /tmp/natural-tools.json 6000
REAL_HOME=$HOME HOME=$(mktemp -d) node testing/v1a-compare/run.mjs v1 testing/v1a-compare/prompts-natural.json /tmp/natural-v1.json 500
```

- `v1` = tools switched off (`feature1_tools=off`), `tools` = on. The last number is the pause between
  prompts in ms (6000 for `tools`, so background work finishes as it would between real prompts).
- Everything (database, worker, MemOS, OpenClaw, codebase-memory-mcp) lives under the throwaway `HOME`;
  your real `~/.nexpath` is never touched. The key is read from `REAL_HOME` the way the hooks read it
  (env, keychain, file, Nexpath token) and never printed. Without a key there is no popup and the
  writer AI is not tested.
- With a key every prompt calls the writer AI (gpt-4o-mini): one run takes 10–20 minutes.

Prompt sets:

| File | What it checks |
|---|---|
| `prompts-40.json` | `testing/f1-popup-test` set: decisions in fixed wording ("Final decision: …"), later questions, replaced decisions must not come back (`notShows`), unrelated prompts stay clean |
| `prompts-natural.json` | Decisions in normal sentences and inside the agent's replies; session 2 asks with new wording; session 3 starts after a simulated map cleanup (`wipeMap`) |

Status per prompt: `FOUND` / `MISS` (needed facts, with the source of each), `OLD` (a replaced value
came back), `CLEAN` / `NOISE` (unrelated prompt got memory). Results so far: `v1(a).md` §9.9–9.13.
