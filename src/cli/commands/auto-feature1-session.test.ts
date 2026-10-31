import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Feature 1 shows each memory fact once per session. Two CLI rules keep that working:
//  1. the CLI passes its session id, or the dedup spans every session and a fact shown
//     once never comes back (found by the 40-prompt popup test, 2026-10-31);
//  2. a fact is marked shown only when Nexpath actually shows its popup, so memory is
//     not used up on prompts where Nexpath stays silent.

const feature1Calls: { context: Record<string, unknown>; options: Record<string, unknown> | undefined }[] = [];
vi.mock('../../context-engineering/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context-engineering/index.js')>();
  return {
    ...actual,
    preparePromptEnhancementWithSections: vi.fn(async (...args: Parameters<typeof actual.preparePromptEnhancementWithSections>) => {
      feature1Calls.push({ context: args[1] as unknown as Record<string, unknown>, options: args[2] as Record<string, unknown> | undefined });
      return actual.preparePromptEnhancementWithSections(...args);
    }),
  };
});

const { openStore } = await import('../../store/index.js');
const { runAuto } = await import('./auto.js');
const { ingestSessionFacts } = await import('../../context-engineering/index.js');

type StoreHandle = Awaited<ReturnType<typeof openStore>>;

describe('runAuto — Feature 1 memory and the CLI session', () => {
  let store: StoreHandle;
  const projectRoot = '/test/feature1-session';

  beforeEach(async () => {
    feature1Calls.length = 0;
    store = await openStore(':memory:');
    ingestSessionFacts(store, {
      projectRoot,
      prompt: 'continue',
      assistantResponse: 'Locked requirement: processRetry in src/payment.ts is the only entry point for retries.',
    });
  });
  afterEach(() => { store.db.close(); });

  it('asks Feature 1 with the current session id and lets the CLI record delivery', async () => {
    // A sequence-shaped prompt takes Nexpath's prompt-enhancement path, where memory is gathered.
    await runAuto({ promptText: '1. fix the retry crash in processRetry 2. then add tests for it', projectRoot }, store);

    const sessionId = store.db.exec('SELECT session_id FROM session_states WHERE project_root = ?', [projectRoot])[0]?.values[0]?.[0];
    expect(sessionId).toBeTruthy();
    expect(feature1Calls.length).toBeGreaterThan(0);
    for (const call of feature1Calls) {
      expect(call.context.sessionId).toBe(sessionId);
      expect(call.options?.recordDelivery).toBe(false);
    }
  });

  it('does not mark memory as shown when Nexpath shows no popup', async () => {
    // No API key in tests: Nexpath's writer cannot run, so no popup is shown.
    await runAuto({ promptText: '1. fix the retry crash in processRetry 2. then add tests for it', projectRoot }, store);

    const delivered = store.db.exec('SELECT COUNT(*) FROM delivered_items')[0]?.values[0]?.[0];
    expect(delivered).toBe(0);
  });
});
