/**
 * Feature 1 — v1(a) worker process entry (`node worker-main.js`, started detached by a hook).
 *
 * Low CPU priority, one instance per user, tool drivers loaded once and warmed up at start,
 * stops itself after 30 minutes without prompts (D10).
 */

import { createRequire } from 'node:module';
import { setPriority } from 'node:os';
import { dirname, join } from 'node:path';
import { createWorkerServer, WorkerAlreadyRunningError } from './worker-server.js';
import { defaultNexpathHome, workerPaths } from './protocol.js';
import { CodebaseMemoryDriver, createStdioCodebaseClient, resolveCodebaseMemoryBin } from '../sources/codebase-memory-driver.js';
import type { SourceDriver } from '../sources/source-driver.js';
import { MemosDriver } from '../sources/memos-driver.js';
import { OpenClawDriver } from '../sources/openclaw-driver.js';
import { MeaningDriver, isMeaningModelInstalled } from '../sources/meaning-driver.js';
import { withStoreRead, withStoreWrite } from './store-writer.js';
import { SessionEndTracker, sessionDecisionsFromMap, type EndedSession } from '../sources/session-end.js';
import { normalizeProjectId } from '../core/project-scope.js';
import { upsertContextMemory } from '../store/historical-map-store.js';
import { createHostLlmBridge } from '../sources/host-llm-bridge.js';
import { saveTurnSummary, TURN_SUMMARY_DELAY_MS } from '../sources/memos-summary.js';
import type { MemosCapturedTurn } from '../sources/memos-driver.js';
import { resolveOpenAIKey } from '../../config/ApiKeyResolver.js';
import { hasUsableNexpathLlmCredential, newNexpathOpenAIClient } from '../../config/llm-client-scope.js';

const home = process.env.NEXPATH_WORKER_DIR ? dirname(process.env.NEXPATH_WORKER_DIR) : defaultNexpathHome();

try {
  setPriority(process.pid, 10); // background work must not compete with the user's agent
} catch {
  /* not permitted on this system: run at normal priority */
}

// The user's key or Nexpath token, loaded the same way the hooks do (env, keychain, file, token).
await resolveOpenAIKey(home).catch(() => null);

const isInstalled = (pkg: string): boolean => {
  try {
    createRequire(import.meta.url).resolve(pkg);
    return true;
  } catch {
    return false;
  }
};

const drivers: (SourceDriver & { close?: () => Promise<void> })[] = [];

// MemOS: every AI call goes through Nexpath's own client; none at all without a credential.
const memos = isInstalled('@memtensor/memos-local-plugin/package.json')
  ? new MemosDriver({
      home: join(home, 'memos'),
      bridge: createHostLlmBridge({
        getClient: () => (hasUsableNexpathLlmCredential() ? newNexpathOpenAIClient() : undefined),
        // CLI: the user's own key. MemOS makes ~1 call per turn (summary) + 1 per prompt
        // (background search); 6/min starved it in the real-key run (14 refused calls).
        maxCallsPerMinute: 20,
        // MemOS writes in the user's own language, never translated (multilingual #7).
        language: 'match',
      }),
      schedule: (job) => server.schedule(job),
    })
  : undefined;
if (memos) drivers.push(memos);

if (resolveCodebaseMemoryBin()) {
  drivers.push(
    new CodebaseMemoryDriver({ connect: () => createStdioCodebaseClient({ cacheDir: join(home, 'codebase-memory') }) })
  );
}
// OpenClaw: months-old search, asked in the background (it takes seconds per search). It
// remembers each session's decisions from our map, saved when the session ends.
// Meaning: MemOS's local embedding model matching the prompt to our own map's facts.
if (isMeaningModelInstalled()) drivers.push(new MeaningDriver());

const openclaw = new OpenClawDriver({ home: join(home, 'openclaw'), schedule: (job) => server.schedule(job) });
drivers.push(openclaw);

// D12 write-back: MemOS's active learned rules go into our map (at most every 10 minutes per
// project). A hook holding the database lock is never waited on: try again in 30 s, 3 times.
const WRITE_BACK_EVERY_MS = 10 * 60_000;
const lastWriteBack = new Map<string, number>();
const writeBack = async (projectRoot: string, attempt = 0): Promise<void> => {
  if (!memos) return;
  const rows = await memos.learnedRules(projectRoot);
  if (rows.length === 0) return;
  const result = await withStoreWrite(join(home, 'prompt-store.db'), (store) => {
    for (const row of rows) upsertContextMemory(store, row);
    return rows.length;
  });
  if (!result.written && result.reason === 'busy' && attempt < 3) {
    setTimeout(() => server.schedule(() => writeBack(projectRoot, attempt + 1)), 30_000).unref();
  }
};

// MemOS's turn summary → our map, a little after the turn (MemOS writes it in the background).
// Same lock rule as write-back: never wait on a hook; busy → try again in 30 s, 3 times.
const saveSummary = async (turn: MemosCapturedTurn, attempt = 0): Promise<void> => {
  if (!memos) return;
  const summary = await memos.turnSummary(turn).catch(() => undefined);
  if (!summary) return;
  const result = await withStoreWrite(join(home, 'prompt-store.db'), (store) => saveTurnSummary(store, turn, summary));
  if (!result.written && result.reason === 'busy' && attempt < 3) {
    setTimeout(() => server.schedule(() => saveSummary(turn, attempt + 1)), 30_000).unref();
  }
};

// Session end → OpenClaw. The map is read under the hooks' lock rule: busy → try again in 30 s,
// 3 times; at shutdown, once.
const DB_PATH = join(home, 'prompt-store.db');
const saveSessionToOpenClaw = async (session: EndedSession, attempt = 0, final = false): Promise<void> => {
  if (!(await openclaw.available())) return;
  const read = await withStoreRead(DB_PATH, (store) => sessionDecisionsFromMap(store, session));
  if (read.written) {
    await openclaw.saveSessionDecisions(read.result);
  } else if (read.reason === 'busy' && !final && attempt < 3) {
    setTimeout(() => server.schedule(() => saveSessionToOpenClaw(session, attempt + 1)), 30_000).unref();
  }
};
let shuttingDown = false;
const sessions = new SessionEndTracker({
  onEnd: (session) =>
    shuttingDown ? saveSessionToOpenClaw(session, 0, true) : server.schedule(() => saveSessionToOpenClaw(session)),
});

const server = createWorkerServer({
  socketPath: workerPaths(home).socket,
  drivers,
  onCapture: async (raw) => {
    const turn = { ...raw, projectRoot: normalizeProjectId(raw.projectRoot) };
    sessions.noteTurn(turn);
    const captured = await memos?.capture(turn).catch(() => undefined);
    if (captured) setTimeout(() => server.schedule(() => saveSummary(captured)), TURN_SUMMARY_DELAY_MS).unref();
    const last = lastWriteBack.get(turn.projectRoot) ?? 0;
    if (memos && Date.now() - last >= WRITE_BACK_EVERY_MS) {
      lastWriteBack.set(turn.projectRoot, Date.now());
      server.schedule(() => writeBack(turn.projectRoot));
    }
  },
  onIdle: () => void shutdown(),
});

/** Save open sessions to OpenClaw (files only; indexing waits for the next search), then exit. */
const shutdown = async (): Promise<never> => {
  shuttingDown = true;
  await Promise.race([sessions.endAll(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => {});
  process.exit(0);
};

server.listen().then(
  () => {
    for (const driver of drivers) void driver.available(); // start slow connects now, not on the first prompt
  },
  (err) => process.exit(err instanceof WorkerAlreadyRunningError ? 0 : 1)
);

const stop = () => void server.close().then(shutdown);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
