import { describe, expect, it, beforeEach, afterEach } from 'vitest';

// Feature 1 skips facts it already delivered in the current session. The CLI must
// pass its session id, or that dedup spans every session and a fact shown once is
// never shown again (found by the 40-prompt popup test, 2026-10-31).

const { openStore } = await import('../../store/index.js');
const { runAuto } = await import('./auto.js');
const { ingestSessionFacts } = await import('../../context-engineering/index.js');

type StoreHandle = Awaited<ReturnType<typeof openStore>>;

describe('runAuto — Feature 1 context is scoped to the CLI session', () => {
  let store: StoreHandle;
  const projectRoot = '/test/feature1-session';

  beforeEach(async () => {
    store = await openStore(':memory:');
    ingestSessionFacts(store, {
      projectRoot,
      prompt: 'continue',
      assistantResponse: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
    });
  });
  afterEach(() => { store.db.close(); });

  it('records delivered Feature 1 context under the current session id', async () => {
    await runAuto({ promptText: 'fix the retry crash in processRetry', projectRoot }, store);

    const sessionId = store.db.exec('SELECT session_id FROM session_states WHERE project_root = ?', [projectRoot])[0]?.values[0]?.[0];
    const delivered = store.db.exec('SELECT session_id, is_enhanced FROM delivered_items WHERE project_root = ?', [projectRoot])[0]?.values ?? [];

    expect(sessionId).toBeTruthy();
    expect(delivered).toEqual([[sessionId, 1]]);
  });
});
