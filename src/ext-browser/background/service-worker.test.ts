import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClassificationResult, SessionState } from '../../core/classifier/types.js';
// Real (unmocked) — composeWhyHelpBlock + this table run for real in the payload
// test, exactly as the SW uses them, so the whyHelp wiring is proven end to end.
import { WHY_HELP_BY_SIGNAL_TYPE } from '../../decision-session/why-help-by-signal-type.js';

/**
 * service-worker.ts orchestrates the core pipeline + browser adapters. Its own
 * dependencies (classifier, session-state, stage2, pinch, decision content, all
 * adapters) already have dedicated unit tests elsewhere — this file mocks every
 * one of them and only verifies the SW's own wiring: offscreen lifecycle,
 * onInstalled behaviour, and onMessage routing/orchestration order.
 */

vi.mock('../../core/classifier/PromptClassifier.js', () => ({ classifyPrompt: vi.fn() }));
vi.mock('../../core/session-state.js', () => ({ SessionStateManager: { load: vi.fn() } }));
vi.mock('../../core/stage2.js', () => ({ shouldFireStage2: vi.fn(), runStage2: vi.fn() }));
vi.mock('../../core/classifier/AbsenceDetector.js', () => ({ detectAbsenceFlags: vi.fn(() => []) }));
vi.mock('../../core/classifier/StreamBPresenceClassifier.js', () => ({ classifyStreamBPresence: vi.fn() }));
vi.mock('../../core/classifier/LLMProfileClassifier.js', () => ({ classifyUserProfileLLM: vi.fn(), MIN_PROFILE_PROMPTS: 4 }));
vi.mock('../../core/classifier/UserProfileClassifier.js', () => ({ isProfileStale: vi.fn(() => true) }));
vi.mock('../../core/decision/pinch.js', () => ({ generatePinchLabel: vi.fn() }));
vi.mock('../../core/decision/static-content.js', () => ({ resolveDecisionContent: vi.fn() }));
vi.mock('../../core/decision/options.js', () => ({ generateOptionList: vi.fn() }));
vi.mock('../adapters/storage-idb.js', () => ({ IdbStorageAdapter: vi.fn() }));
vi.mock('../adapters/memory-storage.js', () => ({ makeMemoryStoragePort: vi.fn() }));
vi.mock('../adapters/llm-fetch.js', () => ({ FetchLLMAdapter: vi.fn() }));
vi.mock('../adapters/storage-chrome.js', () => ({ ChromeStorageKeyAdapter: vi.fn() }));
vi.mock('../adapters/clock-browser.js', () => ({ BrowserClockAdapter: vi.fn() }));
vi.mock('../adapters/log-console.js', () => ({ ConsoleLogAdapter: vi.fn() }));
vi.mock('../adapters/log-persistent.js', () => ({ PersistentLogAdapter: vi.fn() }));
vi.mock('../content/panel-adapter.js', () => ({ ContentScriptUIAdapter: vi.fn() }));
// PB3: the PE seam has its own real-engine tests (pe-prepare.test.ts); here it is
// mocked so this file tests only the SW's WIRING — when the prepare is invoked,
// with which context, and that its failures never touch the advisory pipeline.
// pe-engine is mocked to a switchable gate so tests drive the sequence-shape
// branch explicitly (the real gate's behaviour is pinned in pe-prepare.test.ts).
vi.mock('./pe-prepare.js', () => ({ prepareAndStoreBrowserPe: vi.fn() }));
vi.mock('./pe-engine.js', () => ({
  PE_ENGINE_READY: true,
  isPromptEnhancementSequenceShapedTextV1: vi.fn(() => false),
}));
vi.mock('../adapters/pe-pending-store.js', () => ({
  upsertPendingPe: vi.fn(),
  getPendingPe: vi.fn(),
  markPendingPeShown: vi.fn(),
}));
vi.mock('../adapters/pe-config.js', () => ({ resolvePePopupCooldown: vi.fn(), resolvePeSequenceEnabled: vi.fn() }));
vi.mock('../adapters/pe-sequence-store.js', () => ({ recordPendingSequence: vi.fn(), getPendingSequence: vi.fn() }));
vi.mock('./pe-popup-host.js', () => ({
  runBrowserPePopup: vi.fn(),
  deliverPePanelCommand: vi.fn(),
}));

const { classifyPrompt } = await import('../../core/classifier/PromptClassifier.js');
const { SessionStateManager } = await import('../../core/session-state.js');
const { shouldFireStage2, runStage2 } = await import('../../core/stage2.js');
const { detectAbsenceFlags } = await import('../../core/classifier/AbsenceDetector.js');
const { classifyStreamBPresence } = await import('../../core/classifier/StreamBPresenceClassifier.js');
const { classifyUserProfileLLM } = await import('../../core/classifier/LLMProfileClassifier.js');
const { isProfileStale } = await import('../../core/classifier/UserProfileClassifier.js');
const { generatePinchLabel } = await import('../../core/decision/pinch.js');
const { resolveDecisionContent } = await import('../../core/decision/static-content.js');
const { generateOptionList } = await import('../../core/decision/options.js');
const { IdbStorageAdapter } = await import('../adapters/storage-idb.js');
const { makeMemoryStoragePort } = await import('../adapters/memory-storage.js');
const { ChromeStorageKeyAdapter } = await import('../adapters/storage-chrome.js');
const { BrowserClockAdapter } = await import('../adapters/clock-browser.js');
const { ConsoleLogAdapter } = await import('../adapters/log-console.js');
const { PersistentLogAdapter } = await import('../adapters/log-persistent.js');
const { ContentScriptUIAdapter } = await import('../content/panel-adapter.js');
const { prepareAndStoreBrowserPe } = await import('./pe-prepare.js');
const { isPromptEnhancementSequenceShapedTextV1 } = await import('./pe-engine.js');
const { getPendingPe, markPendingPeShown } = await import('../adapters/pe-pending-store.js');
const { resolvePePopupCooldown, resolvePeSequenceEnabled } = await import('../adapters/pe-config.js');
const { recordPendingSequence, getPendingSequence } = await import('../adapters/pe-sequence-store.js');
const { runBrowserPePopup } = await import('./pe-popup-host.js');

const idbLoadSessionState = vi.fn();
const idbGetProjectDetectedLanguage = vi.fn();
const idbSaveSessionState = vi.fn().mockResolvedValue(undefined);
const idbSaveProjectDetectedLanguage = vi.fn().mockResolvedValue(undefined);

const keyStoreGetKey = vi.fn();
const keyStoreSetKey = vi.fn().mockResolvedValue(undefined);
// Advisory-surface switch (PB4), answered at the adapter layer so individual
// tests' keyed getKey mockImplementations never have to know about it. null =
// the production default (PE-first, advisory surface removed); the legacy
// response-stop describe sets 'enabled' to exercise the preserved flow.
const advisoryLegacySwitch: { value: string | null } = { value: null };
const clockNow = vi.fn().mockReturnValue(1000);

// Shared across ConsoleLogAdapter instantiations so tests can assert on log events
// (the SW's stage2_result/prompt_submit_deduped observability lines are behaviour).
const logDebugMock = vi.fn();
const logWarnMock = vi.fn();

const showAdvisoryMock = vi.fn();

const mgrProcessPrompt = vi.fn();
const mgrMarkAdvisoryFired = vi.fn();
const mgrMarkDecisionSessionFired = vi.fn();
const mgrHasFiredDecisionSession = vi.fn();
const mgrAddAbsenceFlag = vi.fn();
const mgrApplyStage2SignalUpdates = vi.fn();
const mgrSetProfile = vi.fn();
let mgrCurrent: Partial<SessionState>;

const getLatestStateMock = vi.fn();

const hasDocumentMock = vi.fn();
const createDocumentMock = vi.fn().mockResolvedValue(undefined);
const openOptionsPageMock = vi.fn();
const onInstalledAddListenerMock = vi.fn();
const onMessageAddListenerMock = vi.fn();
const tabsQueryMock = vi.fn();
const tabsReloadMock = vi.fn().mockResolvedValue(undefined);
const tabsSendMessageMock = vi.fn().mockResolvedValue(undefined);
const alarmsCreateMock = vi.fn();
const onAlarmAddListenerMock = vi.fn();

// browser.* (webextension-polyfill) covers everything except chrome.offscreen, which has no
// cross-browser equivalent and stays a real chrome.* global — see importFreshServiceWorker below.
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onInstalled:     { addListener: onInstalledAddListenerMock },
      onMessage:        { addListener: onMessageAddListenerMock },
      openOptionsPage:  openOptionsPageMock,
    },
    tabs: { query: tabsQueryMock, reload: tabsReloadMock, sendMessage: tabsSendMessageMock },
    alarms: { create: alarmsCreateMock, onAlarm: { addListener: onAlarmAddListenerMock } },
  },
}));

type MessageListener = (
  msg: unknown,
  sender: { tab?: { id: number } },
  sendResponse: (r: unknown) => void,
) => boolean;

async function importFreshServiceWorker(chromeOffscreen: unknown): Promise<{
  messageListener: MessageListener;
  installedListener: (details: { reason: string }) => void;
}> {
  vi.stubGlobal('chrome', { offscreen: chromeOffscreen });
  vi.resetModules();
  await import('./service-worker.js');
  return {
    messageListener: onMessageAddListenerMock.mock.calls[0]![0] as MessageListener,
    installedListener: onInstalledAddListenerMock.mock.calls[0]![0] as (details: { reason: string }) => void,
  };
}

function baseClassification(): ClassificationResult {
  return { stage: 'implementation', confidence: 0.8, tier: 1 };
}

/** The advisory payload handlePromptSubmit queued (persisted under the pending key). */
function pendingPayload(): Record<string, unknown> | null {
  const call = keyStoreSetKey.mock.calls.find(
    ([k]) => typeof k === 'string' && k.startsWith('nexpath_pending_advisory::'),
  );
  return call ? (JSON.parse(call[1] as string) as Record<string, unknown>) : null;
}

describe('service-worker.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDocumentMock.mockResolvedValue(false);

    mgrCurrent = {
      currentStage: 'implementation',
      promptCount: 3,
      profile: null,
      detectedLanguage: undefined,
      promptHistory: [],
      firedDecisionSessions: [],
      lastAdvisoryPromptIndex: -1,
      advisoryCount: 0,
      absenceFlags: [],
      promptsInCurrentStage: 1,
    };
    idbLoadSessionState.mockResolvedValue(null);
    idbGetProjectDetectedLanguage.mockResolvedValue(undefined);
    getLatestStateMock.mockReturnValue({ currentStage: 'implementation', detectedLanguage: undefined });
    keyStoreGetKey.mockResolvedValue(null);
    mgrHasFiredDecisionSession.mockReturnValue(false);
    tabsQueryMock.mockResolvedValue([]);

    vi.mocked(classifyPrompt).mockResolvedValue(baseClassification());
    // Production-shaped default for the (mocked) PE prepare seam — the SW's
    // recordPeDisposition reads these fields to persist the debug summary.
    vi.mocked(prepareAndStoreBrowserPe).mockResolvedValue({
      disposition: 'show_current_body',
      safeFallback: false,
      result: { disposition: 'show_current_body', uiView: { body: { sendPolicy: 'send_current' } } },
    } as never);
    // Default: no personalisation → handleResponseStop shows the static queued payload.
    vi.mocked(generateOptionList).mockResolvedValue(null);
    vi.mocked(SessionStateManager.load).mockImplementation(function () {
      return {
        current: mgrCurrent,
        processPrompt: mgrProcessPrompt,
        markAdvisoryFired: mgrMarkAdvisoryFired,
        markDecisionSessionFired: mgrMarkDecisionSessionFired,
        hasFiredDecisionSession: mgrHasFiredDecisionSession,
        setProfile: mgrSetProfile,
        addAbsenceFlag: mgrAddAbsenceFlag,
        applyStage2SignalUpdates: mgrApplyStage2SignalUpdates,
      } as unknown as ReturnType<typeof SessionStateManager.load>;
    });
    vi.mocked(shouldFireStage2).mockReturnValue(null as unknown as ReturnType<typeof shouldFireStage2>);
    vi.mocked(IdbStorageAdapter).mockImplementation(function () {
      return {
        loadSessionState: idbLoadSessionState,
        getProjectDetectedLanguage: idbGetProjectDetectedLanguage,
        saveSessionState: idbSaveSessionState,
        saveProjectDetectedLanguage: idbSaveProjectDetectedLanguage,
      } as unknown as InstanceType<typeof IdbStorageAdapter>;
    });
    vi.mocked(makeMemoryStoragePort).mockReturnValue({
      port: {} as unknown as ReturnType<typeof makeMemoryStoragePort>['port'],
      getLatestState: getLatestStateMock,
    });
    advisoryLegacySwitch.value = null;
    vi.mocked(ChromeStorageKeyAdapter).mockImplementation(function () {
      return {
        getKey: (name: string) =>
          name === 'nexpath_advisory_legacy_surface' && advisoryLegacySwitch.value !== null
            ? Promise.resolve(advisoryLegacySwitch.value)
            : keyStoreGetKey(name),
        setKey: keyStoreSetKey,
      } as unknown as InstanceType<typeof ChromeStorageKeyAdapter>;
    });
    vi.mocked(BrowserClockAdapter).mockImplementation(function () {
      return { now: clockNow } as unknown as InstanceType<typeof BrowserClockAdapter>;
    });
    vi.mocked(ConsoleLogAdapter).mockImplementation(function () {
      return { debug: logDebugMock, info: vi.fn(), warn: logWarnMock } as unknown as InstanceType<typeof ConsoleLogAdapter>;
    });
    // Passthrough: the persistence decorator's own behavior has its dedicated test
    // file; here the SW's log assertions target the inner (console) adapter mocks.
    vi.mocked(PersistentLogAdapter).mockImplementation(function (inner: unknown) {
      return inner as InstanceType<typeof PersistentLogAdapter>;
    });
    vi.mocked(ContentScriptUIAdapter).mockImplementation(function () {
      return { showAdvisory: showAdvisoryMock } as unknown as InstanceType<typeof ContentScriptUIAdapter>;
    });
  });

  describe('onInstalled', () => {
    it('opens the options page on fresh install', async () => {
      const { installedListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      installedListener({ reason: 'install' });
      expect(openOptionsPageMock).toHaveBeenCalledOnce();
    });

    it('does not open the options page on update', async () => {
      const { installedListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      installedListener({ reason: 'update' });
      expect(openOptionsPageMock).not.toHaveBeenCalled();
    });

    it('reloads open agent-site tabs on update — stale content scripts from the previous generation silently DROP every capture (live 2026-07-06)', async () => {
      tabsQueryMock.mockResolvedValue([{ id: 11 }, { id: 22 }]);
      const { installedListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      installedListener({ reason: 'update' });

      await vi.waitFor(() => expect(tabsReloadMock).toHaveBeenCalledTimes(2));
      expect(tabsQueryMock).toHaveBeenCalledWith({
        url: ['https://*.replit.com/*', 'https://bolt.new/*', 'https://*.stackblitz.com/*', 'https://lovable.dev/*'],
      });
      expect(tabsReloadMock).toHaveBeenCalledWith(11);
      expect(tabsReloadMock).toHaveBeenCalledWith(22);
    });

    it('reloads agent tabs on fresh install too (any onInstalled = new generation)', async () => {
      tabsQueryMock.mockResolvedValue([{ id: 7 }]);
      const { installedListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      installedListener({ reason: 'install' });

      await vi.waitFor(() => expect(tabsReloadMock).toHaveBeenCalledWith(7));
      expect(openOptionsPageMock).toHaveBeenCalledOnce();
    });

    it('skips tabs without an id and survives a tabs.query failure', async () => {
      tabsQueryMock.mockRejectedValue(new Error('no permission'));
      const { installedListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      installedListener({ reason: 'update' });

      await vi.waitFor(() => expect(logWarnMock).toHaveBeenCalledWith('agent_tab_reload_failed', expect.anything()));
      expect(tabsReloadMock).not.toHaveBeenCalled();
    });
  });

  describe('onMessage routing', () => {
    it('keeps the channel open for nexpath:response-stop and resolves {ok:true} when nothing is queued', async () => {
      // response-stop is now async (it shows any queued advisory — CLI popup-on-Stop
      // timing), so it keeps the channel open and resolves via the Promise, like
      // prompt-submit. With no pending advisory (getKey → null) it shows nothing.
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      const keepOpen = messageListener(
        { type: 'nexpath:response-stop', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {},
        sendResponse,
      );
      expect(keepOpen).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('logs response_stop_received so receipt is directly visible in the console, not just inferred', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const logInstance = vi.mocked(ConsoleLogAdapter).mock.results.at(-1)!.value as { debug: ReturnType<typeof vi.fn> };

      messageListener(
        { type: 'nexpath:response-stop', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {},
        vi.fn(),
      );

      expect(logInstance.debug).toHaveBeenCalledWith('response_stop_received', { agent: 'replit', projectRoot: 'https://replit.com' });
    });

    it('logs prompt_submit_received immediately on receipt, before the pipeline resolves', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const logInstance = vi.mocked(ConsoleLogAdapter).mock.results.at(-1)!.value as { debug: ReturnType<typeof vi.fn> };

      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        vi.fn(),
      );

      expect(logInstance.debug).toHaveBeenCalledWith('prompt_submit_received', { agent: 'replit', projectRoot: 'https://replit.com' });
    });

    it('ignores unrecognized message shapes, responding with undefined', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      const keepOpen = messageListener({ type: 'nexpath:something-else' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(undefined);
      expect(keepOpen).toBe(true);
    });

    it('keeps the channel open for nexpath:prompt-submit and resolves {ok:true} when no stage2 trigger fires', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      const keepOpen = messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      expect(keepOpen).toBe(true);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).toHaveBeenCalledOnce();
      expect(mgrProcessPrompt).toHaveBeenCalledOnce();
      expect(idbSaveSessionState).toHaveBeenCalled();
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('skips stage2 and resolves {ok:true} when a trigger fires but no API key is configured', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      keyStoreGetKey.mockResolvedValue(null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('resolves {ok:false} and does not throw when classifyPrompt rejects', async () => {
      vi.mocked(classifyPrompt).mockRejectedValue(new Error('classification blew up'));
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: false }));
    });

    it('QUEUES the advisory on submit (does NOT show yet) when stage2 fires and the key is present — CLI popup-on-Stop timing', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      // Promise.all calls getKey in declared order: openai_api_key, then
      // advisory_frequency, then role — mockResolvedValueOnce answers only the
      // first, leaving the beforeEach's null default for the other two (a blanket
      // mockResolvedValue here would wrongly feed 'sk-real-key' into
      // resolveFrequencyConfig too, since it now answers all 3 calls in this test).
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      vi.mocked(runStage2).mockResolvedValue({ fire_decision_session: true } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'Write tests', descBase: 'body' }],
        L2: [{ option: 'Write one test', descBase: 'body' }],
        L3: [{ option: 'TODO comment', descBase: 'body' }],
        pinchFallback: 'fallback pinch',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Hold up.');

      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 42 },
        {},
        sendResponse,
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      // Shown on the response-stop event, NOT at submit.
      expect(showAdvisoryMock).not.toHaveBeenCalled();
      // The built payload is queued for this project.
      const payload = pendingPayload();
      expect(payload).toMatchObject({
        schemaVersion: 1,
        pinchLabel: 'Hold up.',
        stage: 'implementation',
        options: [
          { id: 'l1-0', level: 'L1', title: 'Write tests', body: 'body' },
          { id: 'l2-0', level: 'L2', title: 'Write one test', body: 'body' },
          { id: 'l3-0', level: 'L3', title: 'TODO comment', body: 'body' },
        ],
        meta: { agent: 'replit', frequency: 'every_event' },
      });
      // Bookkeeping still happens at decision time (CLI auto parity).
      expect(mgrMarkAdvisoryFired).toHaveBeenCalledOnce();
      expect(mgrMarkDecisionSessionFired).toHaveBeenCalledOnce();
    });

    it('does not attempt to show an advisory when there is no tab id', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      // See the previous test's comment — Once, not blanket, so frequency/role
      // calls still get the beforeEach's null default.
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      vi.mocked(runStage2).mockResolvedValue({ fire_decision_session: true } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [], L2: [], L3: [], pinchFallback: 'fallback',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Hold up.');

      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 0 },
        {},
        sendResponse,
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });
  });

  describe('advisory frequency + role gating (mirrors cli/commands/auto.ts)', () => {
    // Promise.all calls getKey in declared order: openai_api_key, advisory_frequency,
    // role, then the cross-page dedup record — queue exactly 3 Once values for the
    // first three; the 4th call falls through to the default mockResolvedValue(null)
    // (no prior prompt recorded → dedup guard passes).
    function mockKeyStore(apiKey: string | null, freq: string | null, role: string | null): void {
      keyStoreGetKey.mockResolvedValueOnce(apiKey).mockResolvedValueOnce(freq).mockResolvedValueOnce(role);
    }

    it('freq "off" fast-exits before shouldFireStage2 is ever called', async () => {
      mockKeyStore('sk-real-key', 'off', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(shouldFireStage2).not.toHaveBeenCalled();
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('blocks when promptCount is below the configured frequency level\'s minPromptsBeforeAdvisory', async () => {
      // major_only requires 5 prompts before any advisory; mgrCurrent.promptCount is 3.
      mockKeyStore('sk-real-key', 'major_only', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(shouldFireStage2).not.toHaveBeenCalled();
    });

    it('dedups — does not re-run stage2 for a stage_transition event already recorded as fired this session', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrHasFiredDecisionSession.mockReturnValue(true);
      mockKeyStore('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('major_only blocks an absence-triggered advisory but allows a stage_transition one through', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({
        kind: 'absence',
        qualifyingFlags: [{ signalKey: 'x' }],
      } as unknown as ReturnType<typeof shouldFireStage2>);
      mockKeyStore('sk-real-key', 'major_only', null);
      mgrCurrent.promptCount = 5; // clears major_only's minPromptsBeforeAdvisory gate
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('once_per_session blocks a second advisory in the same session', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mockKeyStore('sk-real-key', 'once_per_session', null);
      mgrCurrent.promptCount = 10; // clears once_per_session's minPromptsBeforeAdvisory gate
      mgrCurrent.firedDecisionSessions = ['stage_transition:idea→implementation'];
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('post-advisory cooldown blocks a second advisory fired too soon after the last one', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mockKeyStore('sk-real-key', 'every_event', null); // postAdvisoryCooldown = 5
      mgrCurrent.promptCount = 4;
      mgrCurrent.lastAdvisoryPromptIndex = 2; // only 2 prompts since the last advisory — inside the 5-prompt cooldown
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('session advisory cap blocks further advisories once the default cap is reached', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mockKeyStore('sk-real-key', 'every_event', null); // sessionAdvisoryCapDefault = 5
      mgrCurrent.promptCount = 20;
      mgrCurrent.advisoryCount = 5;
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(runStage2).not.toHaveBeenCalled();
    });

    it('passes frequency-derived minConfidence/contextWindow overrides into runStage2', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({ fire_decision_session: false } as unknown as Awaited<ReturnType<typeof runStage2>>);
      mockKeyStore('sk-real-key', 'major_only', null); // stage2MinConfidence=0.49, stage2ContextWindow=10
      mgrCurrent.promptCount = 5;
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(runStage2).toHaveBeenCalledOnce());
      expect(runStage2).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { minConfidence: 0.49, contextWindow: 10 },
      );
    });

    it('injects the configured role into an existing profile', async () => {
      mgrCurrent.profile = {
        nature: 'hardcore_pro',
        precisionScore: 8,
        playfulnessScore: 2,
        precisionOrdinal: 'high',
        playfulnessOrdinal: 'low',
        mood: 'focused',
        depth: 'high',
        depthScore: 8,
        computedAt: 1,
        role: null,
      };
      mockKeyStore('sk-real-key', 'every_event', 'pm');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(mgrSetProfile).toHaveBeenCalledWith(expect.objectContaining({ role: 'pm' }));
    });

    it('does not inject role when no profile exists yet (LLM profile classification not wired in the browser yet)', async () => {
      mockKeyStore('sk-real-key', 'every_event', 'pm');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(mgrSetProfile).not.toHaveBeenCalled();
    });
  });

  describe('cross-page prompt dedup (Bolt landing→project double-capture)', () => {
    // The dedup record is read via the 4th getKey in the Promise.all; a name-aware
    // implementation answers only that key so the config keys keep their defaults.
    function mockDedupRecord(record: { text: string; at: number } | null): void {
      keyStoreGetKey.mockImplementation(async (name: string) =>
        name.startsWith('nexpath_last_prompt::') && record ? JSON.stringify(record) : null,
      );
    }

    function submit(messageListener: MessageListener, promptText: string): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText, projectRoot: 'https://bolt.new', agent: 'bolt', tabId: 7 },
        {},
        sendResponse,
      );
      return sendResponse;
    }

    it('skips the whole pipeline when the same text repeats within the window', async () => {
      mockDedupRecord({ text: 'Add a hero section component', at: 900 }); // clock.now() = 1000 → 100ms old
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener, 'Add a hero section component');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).not.toHaveBeenCalled();
      expect(mgrProcessPrompt).not.toHaveBeenCalled();
      expect(logDebugMock).toHaveBeenCalledWith('prompt_submit_deduped', expect.objectContaining({ projectRoot: 'https://bolt.new' }));
    });

    it('dedups a whitespace-variant echo of the same prompt within the window (F1, live 2026-08-29)', async () => {
      // The "Use enhanced" flow: the prompt-injected marker stores the panel's
      // text, then the capture channels re-read the SAME submission with drifted
      // whitespace (composer innerText vs fetch body). Exact `===` let it through
      // and the turn was billed twice — 1312 vs 1320 input tokens, live on Bolt.
      mockDedupRecord({ text: 'My original request:\nAdd a hero section\n\ncomponent', at: 900 });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener, 'My original request:\n\nAdd a hero section component\n');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).not.toHaveBeenCalled();
      expect(mgrProcessPrompt).not.toHaveBeenCalled();
      expect(logDebugMock).toHaveBeenCalledWith('prompt_submit_deduped', expect.objectContaining({ projectRoot: 'https://bolt.new' }));
    });

    it('processes normally when the text differs and records the new prompt', async () => {
      mockDedupRecord({ text: 'Add a hero section component', at: 900 });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener, 'Implement a card layout');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).toHaveBeenCalledOnce();
      expect(keyStoreSetKey).toHaveBeenCalledWith(
        'nexpath_last_prompt::https://bolt.new',
        JSON.stringify({ text: 'Implement a card layout', at: 1000 }),
      );
    });

    it('processes normally when the identical text arrives after the window has expired', async () => {
      mockDedupRecord({ text: 'Add a hero section component', at: 1000 - 200_000 });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener, 'Add a hero section component');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).toHaveBeenCalledOnce();
    });

    it('treats a malformed stored record as absent and processes normally', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) =>
        name.startsWith('nexpath_last_prompt::') ? 'not-json{{{' : null,
      );
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener, 'Add a hero section component');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(classifyPrompt).toHaveBeenCalledOnce();
    });
  });

  describe('stage-2 outcome observability (the LLM verdict must never be silent)', () => {
    function mockKeyStore3(apiKey: string | null, freq: string | null, role: string | null): void {
      keyStoreGetKey.mockResolvedValueOnce(apiKey).mockResolvedValueOnce(freq).mockResolvedValueOnce(role);
    }

    it('logs stage2_started and a stage2_result with fire:false + reason when the LLM declines', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: false,
        stage: 'release',
        stage_confidence: 0.9,
        reason: 'testing practices already demonstrated',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      mockKeyStore3('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://bolt.new', agent: 'bolt', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('stage2_started', expect.objectContaining({ trigger: 'stage_transition' }));
      expect(logDebugMock).toHaveBeenCalledWith('stage2_result', expect.objectContaining({
        fire: false,
        reason: 'testing practices already demonstrated',
      }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
      // The verdict must also be persisted — SW console lines die with the SW (MV3),
      // so this record is the only after-the-fact answer to "why no advisory?".
      expect(keyStoreSetKey).toHaveBeenCalledWith(
        'nexpath_last_stage2_result',
        expect.stringContaining('"reason":"testing practices already demonstrated"'),
      );
    });

    it('persists a stage-2 ERROR record when runStage2 throws', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockRejectedValue(new Error('AbortError: timeout'));
      mockKeyStore3('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://bolt.new', agent: 'bolt', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(keyStoreSetKey).toHaveBeenCalledWith(
        'nexpath_last_stage2_result',
        expect.stringContaining('AbortError: timeout'),
      );
    });

    it('logs stage2_result with fire:true and QUEUES the advisory (shown on response-stop, not at submit)', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true,
        stage: 'release',
        stage_confidence: 0.95,
        reason: 'release transition without testing evidence',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'Run tests', descBase: 'd' }],
        L2: [],
        L3: [],
        pinchFallback: 'Final Review',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Final Review');
      mockKeyStore3('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://bolt.new', agent: 'bolt', tabId: 7 },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('stage2_result', expect.objectContaining({ fire: true }));
      // Popup-on-Stop timing: queued now, not shown yet.
      expect(logDebugMock).toHaveBeenCalledWith('advisory_pending', expect.objectContaining({ stage: 'implementation' }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
      // The verdict record must persist on the FIRE path too, not just declines/errors.
      expect(keyStoreSetKey).toHaveBeenCalledWith(
        'nexpath_last_stage2_result',
        expect.stringContaining('"fire":true'),
      );
    });
  });

  describe('hidden force-advisory test key (nexpath_force_advisory)', () => {
    // Name-keyed rather than call-ordered: the force key is read LAST in the SW's
    // Promise.all, and a positional mock would silently rot the moment another
    // getKey is added ahead of it.
    function mockKeys(map: Record<string, string | null>): void {
      keyStoreGetKey.mockImplementation((key: string) => Promise.resolve(map[key] ?? null));
    }

    const BASE = { openai_api_key: 'sk-real-key', advisory_frequency: 'every_event' };

    function submit(messageListener: (m: unknown, s: unknown, r: unknown) => void): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'fix the build', projectRoot: 'https://replit.com/@u/p', agent: 'replit', tabId: 7 },
        {},
        sendResponse,
      );
      return sendResponse;
    }

    /** The full fire path needs the payload builders the queued advisory reads. */
    function primeFirePathContent(): void {
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'Run tests', descBase: 'd' }],
        L2: [],
        L3: [],
        pinchFallback: 'Final Review',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Final Review');
    }

    it('is OFF when the key is absent — the min-prompts gate still blocks and nothing is forced', async () => {
      mgrCurrent.promptCount = 1; // below every_event's minPromptsBeforeAdvisory (3)
      mockKeys(BASE);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_min_prompts_blocked', expect.objectContaining({ promptCount: 1 }));
      expect(shouldFireStage2).not.toHaveBeenCalled();
      expect(logDebugMock).not.toHaveBeenCalledWith('advisory_gate_forced', expect.anything());
      expect(logDebugMock).not.toHaveBeenCalledWith('advisory_force_key_active', expect.anything());
    });

    it('arms on EXACTLY "enabled" — a truthy-looking "true" does not turn it on', async () => {
      mgrCurrent.promptCount = 1;
      mockKeys({ ...BASE, nexpath_force_advisory: 'true' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_min_prompts_blocked', expect.anything());
      expect(shouldFireStage2).not.toHaveBeenCalled();
    });

    it('bypasses the min-prompts gate AND synthesises a trigger when there is none', async () => {
      mgrCurrent.promptCount = 1;
      // beforeEach leaves shouldFireStage2 returning null → the no-trigger exit.
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: false, stage: 'release', stage_confidence: 0.9, reason: 'looks fine',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      primeFirePathContent();
      mockKeys({ ...BASE, nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_force_key_active', expect.anything());
      expect(logDebugMock).toHaveBeenCalledWith('advisory_gate_forced', expect.objectContaining({ gate: 'min_prompts' }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_gate_forced', expect.objectContaining({
        gate: 'no_trigger', synthesised: 'stage_transition',
      }));
      expect(runStage2).toHaveBeenCalled();
    });

    it('overrides a stage-2 DECLINE so the advisory is queued anyway — the gate that blocked the live Replit run', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: false,
        stage: 'review_testing',
        stage_confidence: 1,
        reason: 'The developer is focused on correcting issues and ensuring tests are in place.',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      primeFirePathContent();
      mockKeys({ ...BASE, nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_gate_forced', expect.objectContaining({
        gate: 'stage2_verdict',
        modelReason: 'The developer is focused on correcting issues and ensuring tests are in place.',
      }));
      // Forced or not, the advisory is QUEUED for response-stop, never shown at submit.
      expect(logDebugMock).toHaveBeenCalledWith('advisory_pending', expect.anything());
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('records the model\'s REAL verdict even when the switch overrides it (a forced run must not look natural)', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: false, stage: 'review_testing', stage_confidence: 1, reason: 'no gap',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      primeFirePathContent();
      mockKeys({ ...BASE, nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      // stage2_result is logged/persisted BEFORE the override — the honest record of
      // what the model actually said survives.
      expect(logDebugMock).toHaveBeenCalledWith('stage2_result', expect.objectContaining({ fire: false }));
      expect(keyStoreSetKey).toHaveBeenCalledWith('nexpath_last_stage2_result', expect.stringContaining('"fire":false'));
    });

    it('bypasses the per-event dedup so a forced run repeats instead of firing once per session', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrHasFiredDecisionSession.mockReturnValue(true);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true, stage: 'release', stage_confidence: 0.9, reason: 'r',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      primeFirePathContent();
      mockKeys({ ...BASE, nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_gate_forced', expect.objectContaining({ gate: 'dedup' }));
      expect(runStage2).toHaveBeenCalled();
    });

    it('bypasses the post-advisory cooldown', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrCurrent.promptCount = 4;
      mgrCurrent.lastAdvisoryPromptIndex = 3; // 1 prompt since the last advisory
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true, stage: 'release', stage_confidence: 0.9, reason: 'r',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      primeFirePathContent();
      mockKeys({ ...BASE, nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_gate_forced', expect.objectContaining({ gate: 'post_advisory_cooldown' }));
      expect(runStage2).toHaveBeenCalled();
    });

    it('does NOT override advisory_frequency=off — a test switch must never defeat a user kill switch', async () => {
      mockKeys({ ...BASE, advisory_frequency: 'off', nexpath_force_advisory: 'enabled' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = submit(messageListener);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('advisory_freq_blocked', expect.objectContaining({ freq: 'off' }));
      expect(shouldFireStage2).not.toHaveBeenCalled();
      expect(runStage2).not.toHaveBeenCalled();
    });
  });

  describe('CLI-parity payload enrichment (question + whyHelp + per-level option lists)', () => {
    function primeFirePath(whyHelpEntry: unknown): void {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key'); // api-key; freq/role/proj → null default
      vi.mocked(runStage2).mockResolvedValue({ fire_decision_session: true } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        question: 'Before shipping — has it been reviewed and tested?',
        whyHelp: whyHelpEntry,
        // L1 has TWO options — the CLI-parity list the shipped flat `options` view can't carry.
        L1: [{ option: 'Run the full suite', descBase: 'b1' }, { option: 'Run a focused review', descBase: 'b2' }],
        L2: [{ option: 'Quick check', descBase: 'b3' }],
        L3: [{ option: 'TODO comment', descBase: 'b4' }],
        pinchFallback: 'fallback',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Before you ship.');
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'x' });
    }

    it('sends question, per-level option ARRAYS, and a flat options view that is the first of each level', async () => {
      primeFirePath(undefined); // no why-help entry → composeWhyHelpBlock returns null
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sr = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://replit.com', agent: 'replit', tabId: 9 },
        {}, sr,
      );
      await vi.waitFor(() => expect(sr).toHaveBeenCalledWith({ ok: true }));
      // The enriched payload is what gets QUEUED (shown later on response-stop).
      const payload = pendingPayload();

      expect(payload.question).toBe('Before shipping — has it been reviewed and tested?');
      expect(payload.whyHelp).toBeNull();
      expect(payload.levels.L1).toEqual([
        { id: 'l1-0', level: 'L1', title: 'Run the full suite', body: 'b1' },
        { id: 'l1-1', level: 'L1', title: 'Run a focused review', body: 'b2' },
      ]);
      expect(payload.levels.L2).toEqual([{ id: 'l2-0', level: 'L2', title: 'Quick check', body: 'b3' }]);
      expect(payload.levels.L3).toEqual([{ id: 'l3-0', level: 'L3', title: 'TODO comment', body: 'b4' }]);
      // Shipped-panel back-compat: flat view = first of each level, same ids as before.
      expect(payload.options).toEqual([
        { id: 'l1-0', level: 'L1', title: 'Run the full suite', body: 'b1' },
        { id: 'l2-0', level: 'L2', title: 'Quick check', body: 'b3' },
        { id: 'l3-0', level: 'L3', title: 'TODO comment', body: 'b4' },
      ]);
    });

    it('composes a non-null whyHelp block when the stage has a why-help entry (real composeWhyHelpBlock)', async () => {
      primeFirePath(WHY_HELP_BY_SIGNAL_TYPE['IDEA_TO_PRD']);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sr = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://replit.com', agent: 'replit', tabId: 9 },
        {}, sr,
      );
      await vi.waitFor(() => expect(sr).toHaveBeenCalledWith({ ok: true }));
      const payload = pendingPayload();
      expect(typeof payload.whyHelp).toBe('string');
      expect((payload.whyHelp as string).length).toBeGreaterThan(0);
    });

    it('does NOT run the option generator at submit — queuing stays instant (regression guard)', async () => {
      // Regression: running generateOptionList (2 LLM calls) on the submit path delayed
      // persisting the pending advisory, so a fast agent response reached response-stop
      // before the advisory was queued → missed popup. Option-gen must run at STOP only.
      primeFirePath(undefined);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sr = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it', projectRoot: 'https://replit.com', agent: 'replit', tabId: 9 },
        {}, sr,
      );
      await vi.waitFor(() => expect(sr).toHaveBeenCalledWith({ ok: true }));
      expect(generateOptionList).not.toHaveBeenCalled();
      // Queued payload carries STATIC option text (raw desc-base) — personalised later, at stop.
      const payload = pendingPayload() as unknown as { levels: { L1: { title: string; body: string }[] } };
      expect(payload.levels.L1[0]).toMatchObject({ title: 'Run the full suite', body: 'b1' });
    });
  });

  describe('prompt-enhancement prepare wiring (PB3 — mirrors auto.ts fired path + sequence fallback)', () => {
    const SEQ = 'first build the login page, then add a database, then deploy the whole thing';
    function mockKeyStorePe(apiKey: string | null, freq: string | null, role: string | null): void {
      keyStoreGetKey.mockResolvedValueOnce(apiKey).mockResolvedValueOnce(freq).mockResolvedValueOnce(role);
    }
    function primeFire(kind: 'stage_transition' | 'absence', selectedSignal?: string): void {
      vi.mocked(shouldFireStage2).mockReturnValue(
        (kind === 'stage_transition'
          ? { kind }
          : { kind, qualifyingFlags: [{ signalKey: selectedSignal ?? 'testing' }] }
        ) as unknown as ReturnType<typeof shouldFireStage2>,
      );
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true,
        stage: 'implementation',
        stage_confidence: 0.95,
        reason: 'r',
        ...(kind === 'absence' ? { selected_signal_key: selectedSignal ?? 'testing' } : {}),
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'Run tests', descBase: 'd' }], L2: [], L3: [],
        pinchFallback: 'Final Review',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Final Review');
    }
    function submitPe(messageListener: MessageListener, promptText: string): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText, projectRoot: 'https://bolt.new/~/p1', agent: 'bolt', tabId: 7 },
        {},
        sendResponse,
      );
      return sendResponse;
    }
    /** The single ctx object the SW handed to the (mocked) PE prepare seam. */
    function peCtx(): Record<string, unknown> {
      expect(prepareAndStoreBrowserPe).toHaveBeenCalledTimes(1);
      return vi.mocked(prepareAndStoreBrowserPe).mock.calls[0]![2] as unknown as Record<string, unknown>;
    }

    it('fired stage_transition → prepares AFTER the pending-advisory persist, with fire-path context', async () => {
      primeFire('stage_transition');
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, 'ship it');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

      const ctx = peCtx();
      expect(ctx).toMatchObject({
        projectRoot: 'https://bolt.new/~/p1',
        promptText: 'ship it',
        triggerKind: 'stage_transition',
        effectiveFlagType: 'stage_transition',
        firedKey: 'stage_transition:implementation→implementation',
        classifierState: 'fire_recommended',
        triggerEligibility: 'fresh_trigger_eligible',
        promptCount: 3,
      });
      // A1 ordering lesson: the pending-advisory write must land BEFORE any PE work.
      const persistOrder = keyStoreSetKey.mock.invocationCallOrder[
        keyStoreSetKey.mock.calls.findIndex(([k]) => typeof k === 'string' && k.startsWith('nexpath_pending_advisory::'))
      ]!;
      expect(persistOrder).toBeLessThan(vi.mocked(prepareAndStoreBrowserPe).mock.invocationCallOrder[0]!);
      // The prepare runs inside handlePromptSubmit — before the inflight marker clears
      // (the '' write), so response-stop's marker wait covers the PE parking too.
      const markerClearOrder = keyStoreSetKey.mock.invocationCallOrder[
        keyStoreSetKey.mock.calls.findIndex(([k, v]) => typeof k === 'string' && k.startsWith('nexpath_decision_inflight::') && v === '')
      ]!;
      expect(vi.mocked(prepareAndStoreBrowserPe).mock.invocationCallOrder[0]!).toBeLessThan(markerClearOrder);

      // PB5: the whitelisted disposition summary is persisted for the debug
      // channel — decisions and counters only, never prompt or body text.
      const summaryCall = keyStoreSetKey.mock.calls.find(([k]) => k === 'nexpath_last_pe_prepare');
      expect(summaryCall).toBeDefined();
      const summary = JSON.parse(summaryCall![1] as string) as Record<string, unknown>;
      expect(summary).toMatchObject({
        path: 'fired_trigger',
        eligibility: 'fresh_trigger_eligible',
        disposition: 'show_current_body',
        sendPolicy: 'send_current',
        stored: true,
        promptCount: 3,
      });
      expect(summaryCall![1]).not.toContain('ship it');
    });

    it('fired absence → effective flagType/firedKey use Stage 2\'s selected signal; a dismissed flag downgrades eligibility', async () => {
      primeFire('absence', 'testing');
      // The SW's step-11 eligibility check reads mgr.current (the session's live
      // absence-flag history), not the post-persist snapshot.
      mgrCurrent.absenceFlags = [
        { signalKey: 'testing', stage: 'implementation', raisedAtIndex: 1, dismissedAtIndex: 2, cooldownUntil: 0 },
      ];
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, 'add checkout flow');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

      expect(peCtx()).toMatchObject({
        triggerKind: 'absence',
        effectiveFlagType: 'absence:testing',
        firedKey: 'absence:testing@implementation',
        triggerEligibility: 'dismissed_or_user_skipped',
      });
    });

    it('sequence-shaped prompt at the DEDUP exit → fallback prepare labeled blocked_by_dedup, stage2 never runs', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrHasFiredDecisionSession.mockReturnValue(true);
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

      expect(runStage2).not.toHaveBeenCalled();
      expect(vi.mocked(isPromptEnhancementSequenceShapedTextV1)).toHaveBeenCalledWith(SEQ);
      expect(peCtx()).toMatchObject({
        promptText: SEQ,
        classifierState: 'not_applicable',
        triggerEligibility: 'blocked_by_dedup',
        firedKey: 'sequence_shaped:3',
      });
    });

    it('sequence-shaped prompt below min-prompts → fallback labeled support_only_not_triggering', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      // major_only needs 5 prompts; mgrCurrent.promptCount is 3 → min-prompts exit.
      mockKeyStorePe('sk-real-key', 'major_only', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(peCtx()).toMatchObject({ triggerEligibility: 'support_only_not_triggering' });
    });

    it('sequence-shaped prompt with NO trigger → fallback labeled support_only_not_triggering', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      // shouldFireStage2 default-mocked to null in beforeEach → no-trigger exit.
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(peCtx()).toMatchObject({ triggerEligibility: 'support_only_not_triggering' });
    });

    it('sequence-shaped prompt when Stage 2 DECLINES → fallback labeled too_weak_no_popup', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: false, stage: 'implementation', stage_confidence: 0.4, reason: 'weak',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(peCtx()).toMatchObject({ triggerEligibility: 'too_weak_no_popup' });
    });

    it('a NON-sequence prompt at a blocked exit prepares nothing (the fallback is sequence-gated)', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(false);
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrHasFiredDecisionSession.mockReturnValue(true);
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, 'fix the typo in the readme');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(prepareAndStoreBrowserPe).not.toHaveBeenCalled();
    });

    it('frequency "off" stays FULLY silent — no PE prepare even for a sequence-shaped prompt (CLI parity)', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      mockKeyStorePe('sk-real-key', 'off', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(prepareAndStoreBrowserPe).not.toHaveBeenCalled();
    });

    it('the no-API-key stage-2 exit prepares nothing (documented decision: keyless browser = no PE surface)', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mockKeyStorePe(null, 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('stage2_skipped_no_key', expect.anything());
      expect(prepareAndStoreBrowserPe).not.toHaveBeenCalled();
    });

    it('a PE prepare rejection is caught + logged — the advisory pipeline is untouched (fail-open)', async () => {
      primeFire('stage_transition');
      vi.mocked(prepareAndStoreBrowserPe).mockRejectedValue(new Error('engine exploded'));
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, 'ship it');
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

      expect(logDebugMock).toHaveBeenCalledWith('advisory_pending', expect.anything());
      expect(pendingPayload()).not.toBeNull();
      expect(logDebugMock).toHaveBeenCalledWith('pe_prepare_failed', expect.objectContaining({ path: 'fired_trigger' }));
    });

    it('a fallback-path PE rejection is caught + logged with its own path label', async () => {
      vi.mocked(isPromptEnhancementSequenceShapedTextV1).mockReturnValue(true);
      vi.mocked(prepareAndStoreBrowserPe).mockRejectedValue(new Error('engine exploded'));
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      mgrHasFiredDecisionSession.mockReturnValue(true);
      mockKeyStorePe('sk-real-key', 'every_event', null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = submitPe(messageListener, SEQ);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(logDebugMock).toHaveBeenCalledWith('pe_prepare_failed', expect.objectContaining({ path: 'sequence_fallback' }));
    });
  });

  describe('response-stop shows the queued advisory (CLI popup-on-Stop timing)', () => {
    // These tests pin the LEGACY advisory flow, which PB4 kept byte-identical
    // behind the advisory-surface switch — so they run with the switch 'enabled'. The
    // PE-first default is pinned in its own describe below.
    beforeEach(() => { advisoryLegacySwitch.value = 'enabled'; });
    const P = 'https://replit.com';
    const PENDING_KEY = 'nexpath_pending_advisory::https://replit.com';
    const samplePayload = {
      schemaVersion: 1, advisoryId: 'adv-queued', pinchLabel: 'Hold up.', stage: 'implementation',
      question: 'q', whyHelp: null, levels: { L1: [], L2: [], L3: [] }, options: [],
      meta: { agent: 'replit', frequency: 'every_event' },
    };
    function stop(messageListener, tabId) {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:response-stop', projectRoot: P, agent: 'replit', tabId: 0 },
        tabId === undefined ? {} : { tab: { id: tabId } },
        sendResponse,
      );
      return sendResponse;
    }

    it('shows the pending advisory when the agent finishes, logs advisory_showing, and clears the pending key', async () => {
      keyStoreGetKey.mockImplementation(async (name) => (name === PENDING_KEY ? JSON.stringify(samplePayload) : null));
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = stop(messageListener, 55);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce());
      expect(showAdvisoryMock).toHaveBeenCalledWith(expect.objectContaining({ advisoryId: 'adv-queued' }));
      expect(ContentScriptUIAdapter).toHaveBeenCalledWith(55); // uses the STOP event's tab
      expect(logDebugMock).toHaveBeenCalledWith('advisory_showing', expect.objectContaining({ tabId: 55 }));
      expect(keyStoreSetKey).toHaveBeenCalledWith(PENDING_KEY, ''); // cleared after read
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    });

    it('personalises titles + resolves desc bodies at STOP (CLI stop.ts parity), then shows', async () => {
      const OG_KEY = 'nexpath_pending_advisory_og::https://replit.com';
      const og = {
        stage: 'implementation', flagType: 'stage_transition', prevStage: 'implementation',
        promptsInCurrentStage: 3, language: null, profile: null, promptHistory: [],
      };
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === OG_KEY) return JSON.stringify(og);
        if (name === 'openai_api_key') return 'sk-real-key';
        return null;
      });
      vi.mocked(resolveDecisionContent).mockReturnValue({
        question: 'q', whyHelp: null,
        L1: [{ option: 'static L1', descBase: 'static b1' }],
        L2: [{ option: 'static L2', descBase: 'static b2' }],
        L3: [{ option: 'static L3', descBase: 'static b3' }],
        pinchFallback: 'f',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generateOptionList).mockResolvedValueOnce({
        l1: ['Personalised L1'], l2: ['Personalised L2'], l3: ['Personalised L3'],
        generatedDescBases: { l1: ['resolved body 1'], l2: ['resolved body 2'], l3: ['resolved body 3'] },
      } as unknown as Awaited<ReturnType<typeof generateOptionList>>);
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce());
      expect(generateOptionList).toHaveBeenCalledOnce();
      const shown = showAdvisoryMock.mock.calls[0]?.[0] as unknown as {
        levels: { L1: { title: string; body: string }[] };
        options: { title: string; body: string }[];
      };
      expect(shown.levels.L1[0]).toMatchObject({ title: 'Personalised L1', body: 'resolved body 1' });
      expect(shown.options[0]).toMatchObject({ title: 'Personalised L1', body: 'resolved body 1' });
    });

    const OG_KEY = 'nexpath_pending_advisory_og::https://replit.com';
    const staticContent = {
      question: 'q', whyHelp: null,
      L1: [{ option: 'static L1', descBase: 'b1' }],
      L2: [{ option: 'static L2', descBase: 'b2' }],
      L3: [{ option: 'static L3', descBase: 'b3' }],
      pinchFallback: 'f',
    } as unknown as ReturnType<typeof resolveDecisionContent>;
    const genResult = {
      l1: ['P1'], l2: ['P2'], l3: ['P3'],
      generatedDescBases: { l1: ['rb1'], l2: ['rb2'], l3: ['rb3'] },
    } as unknown as Awaited<ReturnType<typeof generateOptionList>>;

    it('detects the prompt language at STOP (stop.ts parity), persists it, and generates options in it', async () => {
      // CLI parity: tinyld runs over the recent-prompt window once >= LANG_DETECT_INTERVAL
      // prompts exist. Unambiguously-Spanish window → generateOptionList gets 'es', and the
      // detected code is persisted so later submits localise too (auto.ts reads it).
      const es = [
        'por favor construye la aplicacion de recetas con un formulario',
        'anade el boton para guardar las recetas en el almacenamiento local',
        'implementa la busqueda de recetas por nombre y por categoria',
        'necesito validar los campos del formulario antes de enviar',
        'crea la pagina de detalle de cada receta con los ingredientes',
        'quiero mostrar un mensaje de error cuando falte un ingrediente',
        'agrega la funcionalidad para eliminar una receta de la lista',
        'haz que el diseno sea responsivo para telefonos moviles',
      ];
      const promptHistory = [...es, ...es].map((text, i) => ({
        index: i, text, capturedAt: 0, classifiedStage: 'implementation', confidence: 1,
      }));
      const og = {
        stage: 'implementation', flagType: 'stage_transition', prevStage: 'implementation',
        promptsInCurrentStage: 3, language: null, profile: null, promptHistory,
      };
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === OG_KEY) return JSON.stringify(og);
        if (name === 'openai_api_key') return 'sk-real-key';
        return null; // language_override unset
      });
      idbGetProjectDetectedLanguage.mockResolvedValue(undefined);
      vi.mocked(resolveDecisionContent).mockReturnValue(staticContent);
      vi.mocked(generateOptionList).mockResolvedValueOnce(genResult);
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(generateOptionList).toHaveBeenCalledOnce());
      // 3rd positional arg to generateOptionList is the resolved language.
      expect(vi.mocked(generateOptionList).mock.calls[0]![2]).toBe('es');
      expect(idbSaveProjectDetectedLanguage).toHaveBeenCalledWith('https://replit.com', 'es');
    });

    it('skips detection below LANG_DETECT_INTERVAL prompts and keeps the submit-time language', async () => {
      const og = {
        stage: 'implementation', flagType: 'stage_transition', prevStage: 'implementation',
        promptsInCurrentStage: 3, language: 'fr', profile: null,
        promptHistory: [{ index: 0, text: 'bonjour le monde', capturedAt: 0, classifiedStage: 'implementation', confidence: 1 }],
      };
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === OG_KEY) return JSON.stringify(og);
        if (name === 'openai_api_key') return 'sk-real-key';
        return null;
      });
      vi.mocked(resolveDecisionContent).mockReturnValue(staticContent);
      vi.mocked(generateOptionList).mockResolvedValueOnce(genResult);
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(generateOptionList).toHaveBeenCalledOnce());
      expect(vi.mocked(generateOptionList).mock.calls[0]![2]).toBe('fr'); // submit-time value passes through
      expect(idbSaveProjectDetectedLanguage).not.toHaveBeenCalled();
    });

    it('shows the STATIC queued payload when personalisation fails (no missed popup)', async () => {
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify({ ...samplePayload, options: [{ id: 'l1-0', level: 'L1', title: 'static title', body: 'raw {R4_OPEN}' }] });
        if (name === 'nexpath_pending_advisory_og::https://replit.com') return JSON.stringify({ stage: 'implementation', flagType: 'stage_transition', prevStage: null, promptsInCurrentStage: 1, language: null, profile: null, promptHistory: [] });
        if (name === 'openai_api_key') return 'sk-real-key';
        return null;
      });
      vi.mocked(generateOptionList).mockResolvedValueOnce(null); // engine failed → fall back to static
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce());
      const shown = showAdvisoryMock.mock.calls[0]?.[0] as unknown as { options: { title: string }[] };
      expect(shown.options[0]?.title).toBe('static title'); // popup still shows, static content
    });

    it('logs the rejection reason when the generator rejects — never a silent swallow', async () => {
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === 'nexpath_pending_advisory_og::https://replit.com') return JSON.stringify({ stage: 'implementation', flagType: 'stage_transition', prevStage: null, promptsInCurrentStage: 1, language: null, profile: null, promptHistory: [] });
        if (name === 'openai_api_key') return 'sk-real-key';
        return null;
      });
      vi.mocked(generateOptionList).mockRejectedValueOnce(new Error('instant network refusal'));
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce()); // popup never missed
      expect(logWarnMock).toHaveBeenCalledWith('advisory_personalize_rejected', expect.objectContaining({ error: expect.stringContaining('instant network refusal') }));
    });

    it('logs a guard skip (hasOg/hasApiKey) when the og sidecar or key is missing', async () => {
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === 'openai_api_key') return 'sk-real-key';
        return null; // og sidecar missing
      });
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-queued' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      stop(messageListener, 55);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce());
      expect(generateOptionList).not.toHaveBeenCalled();
      expect(logDebugMock).toHaveBeenCalledWith('advisory_personalize_skipped', { hasOg: false, hasApiKey: true });
    });

    it('FAST-RESPONSE RACE: stop arriving BEFORE the decision queues still shows the popup (waits on the in-flight marker)', async () => {
      // Reproduces the live 2026-07-10 bug: response_stop at +2.4s, advisory_pending
      // at +3.3s, popup never shown. The fix: handleResponseStop waits while the
      // decision-in-flight marker is up. Real in-memory store semantics needed here.
      const store = new Map<string, string>();
      keyStoreGetKey.mockImplementation(async (name: string) => store.get(name) || null);
      keyStoreSetKey.mockImplementation(async (name: string, value: string) => { store.set(name, value); });
      store.set('openai_api_key', 'sk-real-key');

      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      // Slow decision: Stage 2 takes 1.2s — the stop below arrives long before.
      vi.mocked(runStage2).mockImplementation(() => new Promise((resolve) =>
        setTimeout(() => resolve({ fire_decision_session: true } as unknown as Awaited<ReturnType<typeof runStage2>>), 1200)));
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'o1', descBase: 'b1' }], L2: [], L3: [], pinchFallback: 'f',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Pinch.');
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'x' });

      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const submitResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it now', projectRoot: 'https://replit.com', agent: 'replit', tabId: 42 },
        {}, submitResponse,
      );
      // Stop arrives 50ms later — decision is still ~1.2s from queuing.
      await new Promise((r) => setTimeout(r, 50));
      const stopResponse = vi.fn();
      stop(messageListener, 42, stopResponse);

      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce(), { timeout: 6000, interval: 100 });
    }, 10000);



    it('retries Stage 2 ONCE on the cold-start AbortError and still queues the advisory', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      vi.mocked(runStage2)
        .mockRejectedValueOnce(new Error('AbortError: signal is aborted without reason'))
        .mockResolvedValueOnce({ fire_decision_session: true } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'o1', descBase: 'b1' }], L2: [], L3: [], pinchFallback: 'f',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('P.');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it now', projectRoot: 'https://replit.com', agent: 'replit', tabId: 42 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(runStage2)).toHaveBeenCalledTimes(2);
      expect(logDebugMock).toHaveBeenCalledWith('stage2_timeout_retry', {});
      // The advisory reached the queue despite the first attempt timing out.
      const pendingCall = keyStoreSetKey.mock.calls.find((c) => c[0] === PENDING_KEY && (c[1] as string).length > 0);
      expect(pendingCall).toBeDefined();
    });

    it('does NOT retry Stage 2 on a non-timeout error (fails fast, persists the error record)', async () => {
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      vi.mocked(runStage2).mockRejectedValue(new Error('OpenAI fetch error 401: invalid key'));
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'ship it now', projectRoot: 'https://replit.com', agent: 'replit', tabId: 42 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(runStage2)).toHaveBeenCalledTimes(1);
      expect(logWarnMock).toHaveBeenCalledWith('stage2_error', expect.objectContaining({ error: expect.stringContaining('401') }));
    });

    it('does not wait when the in-flight marker is stale (torn-down pipeline)', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) => {
        if (name.startsWith('nexpath_decision_inflight::')) return JSON.stringify({ at: Date.now() - 120_000 });
        return null;
      });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = stop(messageListener, 55);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      await new Promise((r) => setTimeout(r, 700)); // longer than one poll interval
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('does nothing when no advisory is queued', async () => {
      keyStoreGetKey.mockResolvedValue(null);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = stop(messageListener, 55);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('does NOT show when frequency was switched off after queuing (Ctrl+X honoured at stop)', async () => {
      keyStoreGetKey.mockImplementation(async (name) => {
        if (name === PENDING_KEY) return JSON.stringify(samplePayload);
        if (name === 'advisory_frequency') return 'off';
        return null;
      });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = stop(messageListener, 55);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      // handleResponseStop runs detached; wait until it reaches the clear (which happens
      // before the freq-off return) before asserting the popup was suppressed.
      await vi.waitFor(() => expect(keyStoreSetKey).toHaveBeenCalledWith(PENDING_KEY, '')); // still cleared
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('does not show when the stop event has no tab id', async () => {
      keyStoreGetKey.mockImplementation(async (name) => (name === PENDING_KEY ? JSON.stringify(samplePayload) : null));
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = stop(messageListener, undefined); // no sender.tab, msg.tabId = 0
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
      // The pending advisory must SURVIVE a tab-less stop (pre-2026-07-10 order
      // cleared it first — silently destroying the advisory forever).
      expect(keyStoreSetKey).not.toHaveBeenCalledWith(PENDING_KEY, '');
    });
  });

  describe('PE-first response-stop (PB4 — the default, mirrors the CLI PE branch of stop.ts)', () => {
    const P = 'https://bolt.new/~/p1';
    const PENDING_KEY = `nexpath_pending_advisory::${P}`;
    const OG_KEY = `nexpath_pending_advisory_og::${P}`;
    const peRecord = {
      sessionId: 's1', promptCount: 9, status: 'pending' as const, createdAt: 1,
      request: { requestId: 'r1' }, result: { disposition: 'show_current_body' },
    };
    function stopPe(messageListener: MessageListener, tabId?: number): ReturnType<typeof vi.fn> {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:response-stop', projectRoot: P, agent: 'bolt', tabId: 0 },
        tabId === undefined ? {} : { tab: { id: tabId } },
        sendResponse,
      );
      return sendResponse;
    }

    beforeEach(() => {
      vi.mocked(resolvePePopupCooldown).mockResolvedValue(7);
      vi.mocked(resolvePeSequenceEnabled).mockResolvedValue(false);
      vi.mocked(runBrowserPePopup).mockResolvedValue({ result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
      vi.mocked(getPendingPe).mockResolvedValue(null);
      vi.mocked(markPendingPeShown).mockResolvedValue(undefined);
      vi.mocked(recordPendingSequence).mockResolvedValue(undefined);
      vi.mocked(getPendingSequence).mockResolvedValue(null);
    });

    it('consumes a queued advisory SILENTLY (MPS-7: the advisory surface is removed by default)', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) => (name === PENDING_KEY ? '{"advisoryId":"a1"}' : null));
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('advisory_removed_surface', { projectRoot: P }));
      expect(keyStoreSetKey).toHaveBeenCalledWith(PENDING_KEY, '');
      expect(keyStoreSetKey).toHaveBeenCalledWith(OG_KEY, '');
      expect(showAdvisoryMock).not.toHaveBeenCalled();
      expect(vi.mocked(generateOptionList)).not.toHaveBeenCalled(); // no personalisation LLM spend either
    });

    it('shows the pending PE at stop: runs the popup host with the row, session-scoped', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
      expect(vi.mocked(getPendingPe)).toHaveBeenCalledWith(P, 's1');
      const deps = vi.mocked(runBrowserPePopup).mock.calls[0]![0];
      expect(deps.projectRoot).toBe(P);
      expect(deps.record).toBe(peRecord);
      // The resolved sequence switch travels into the popup host (CLI parity).
      expect(deps.sequenceEnabled).toBe(false);
    });

    it('onFirstRendered consumes the row AND starts the cooldown window in session state', async () => {
      const state = { sessionId: 's1', promptCount: 9 } as Record<string, unknown>;
      idbLoadSessionState.mockResolvedValue(state);
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
      await vi.mocked(runBrowserPePopup).mock.calls[0]![0].onFirstRendered();
      expect(markPendingPeShown).toHaveBeenCalledWith(P);
      expect(state['lastPromptEnhancementPromptIndex']).toBe(9);
      expect(idbSaveSessionState).toHaveBeenCalledWith(state);
    });

    it('selected_current sends the accepted body to the tab for inject (echo-guarded content-side)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      vi.mocked(runBrowserPePopup).mockResolvedValue({ result: { state: 'selected_current', bodyText: 'THE BODY' }, mpsFirstPopupSent: false });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
        type: 'nexpath:pe-inject', projectRoot: P, text: 'THE BODY',
      }));
      expect(logDebugMock).toHaveBeenCalledWith('pe_injected', expect.objectContaining({ chars: 8 }));
    });

    it('MPS first-popup SENT → the sequence row is recorded (ids/counts) and the body injects (PB6)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      vi.mocked(runBrowserPePopup).mockResolvedValue({
        result: { state: 'selected_current', bodyText: 'FIRST SEQUENCE PROMPT' },
        mpsFirstPopupSent: true,
        mpsIdentity: {
          requestId: 'r1', handoffDecisionId: 'h1', currentBodyId: 'b1',
          bodyRevision: 1, remainingTaskCount: 2,
        },
      });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(vi.mocked(recordPendingSequence)).toHaveBeenCalledWith('https://bolt.new/~/p1', expect.objectContaining({
        sessionId: 's1', status: 'first_sent', requestId: 'r1',
        handoffDecisionId: 'h1', remainingTaskCount: 2,
      })));
      await vi.waitFor(() => expect(tabsSendMessageMock).toHaveBeenCalledWith(7, expect.objectContaining({
        type: 'nexpath:pe-inject', text: 'FIRST SEQUENCE PROMPT',
      })));
      expect(logDebugMock).toHaveBeenCalledWith('pe_sequence_recorded', expect.objectContaining({ remainingTaskCount: 2 }));
    });

    it('a later stop with an ACTIVE sequence row and no pending PE logs pe_sequence_continuation_gated and does nothing (PB6 fail-closed)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(null);
      vi.mocked(getPendingSequence).mockResolvedValue({
        sessionId: 's1', createdAt: 1, status: 'first_sent', requestId: 'r1',
        handoffDecisionId: 'h1', currentBodyId: 'b1', bodyRevision: 1, remainingTaskCount: 2,
      });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('pe_sequence_continuation_gated', {
        projectRoot: 'https://bolt.new/~/p1', remainingTaskCount: 2,
      }));
      expect(runBrowserPePopup).not.toHaveBeenCalled();
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('no sequence row is recorded when the MPS popup was not sent', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
      expect(vi.mocked(recordPendingSequence)).not.toHaveBeenCalled();
    });

    it('a STALE pending (older than 30min) is consumed silently WITHOUT the cooldown mark — the cross-sitting resurrection fix (live Firefox/Bolt 2026-08-25)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue({
        ...peRecord,
        createdAt: 1000 - 31 * 60_000, // parked 31 minutes before this stop
      } as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('pe_pending_expired_stale', expect.objectContaining({ projectRoot: P })));
      expect(markPendingPeShown).toHaveBeenCalledWith(P);   // row dies
      expect(runBrowserPePopup).not.toHaveBeenCalled();      // never shown
      // No render happened, so the cooldown window must NOT have started.
      expect(idbSaveSessionState).not.toHaveBeenCalled();
    });

    it('cooldown hit CONSUMES the row with a ring event and shows nothing (stop.ts:552–561)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9, lastPromptEnhancementPromptIndex: 5 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('pe_popup_cooldown', expect.objectContaining({ cooldown: 7 })));
      expect(markPendingPeShown).toHaveBeenCalledWith(P);
      expect(runBrowserPePopup).not.toHaveBeenCalled();
    });

    it('outside the cooldown window the popup shows (boundary: promptCount - lastShown >= cooldown)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 12, lastPromptEnhancementPromptIndex: 5 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
    });

    it('frequency "off" toggled since the prepare consumes the row silently', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) => (name === 'advisory_frequency' ? 'off' : null));
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('pe_suppressed_freq_off', { projectRoot: P }));
      expect(markPendingPeShown).toHaveBeenCalledWith(P);
      expect(runBrowserPePopup).not.toHaveBeenCalled();
    });

    it('no usable tab leaves the row PENDING (never consume before a render is possible)', async () => {
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, undefined);
      await vi.waitFor(() => expect(logWarnMock).toHaveBeenCalledWith('pe_stop_no_tab', {}));
      expect(markPendingPeShown).not.toHaveBeenCalled();
      expect(runBrowserPePopup).not.toHaveBeenCalled();
    });

    it('LEGACY switch "enabled": pending PE is suppressed silently and the advisory flow runs unchanged', async () => {
      advisoryLegacySwitch.value = 'enabled';
      const payload = {
        schemaVersion: 1, advisoryId: 'adv-legacy', pinchLabel: 'p', stage: 'implementation',
        question: 'q', whyHelp: null, levels: { L1: [], L2: [], L3: [] }, options: [],
        meta: { agent: 'bolt', frequency: 'every_event' },
      };
      keyStoreGetKey.mockImplementation(async (name: string) => (name === PENDING_KEY ? JSON.stringify(payload) : null));
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      showAdvisoryMock.mockResolvedValue({ type: 'dismiss', advisoryId: 'adv-legacy' });
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(showAdvisoryMock).toHaveBeenCalledOnce());
      expect(logDebugMock).toHaveBeenCalledWith('pe_suppressed_legacy_surface', { projectRoot: P });
      expect(markPendingPeShown).toHaveBeenCalledWith(P);
      expect(runBrowserPePopup).not.toHaveBeenCalled();
    });

    it('the switch read is exact-equality: any other value stays PE-first (A9)', async () => {
      advisoryLegacySwitch.value = 'true'; // truthy but NOT the exact sentinel
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      stopPe(messageListener, 7);
      await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
      expect(showAdvisoryMock).not.toHaveBeenCalled();
    });

    it('routes nexpath:pe-terminal-notice to the pending-store consume (SW-teardown resilience)', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:pe-terminal-notice', projectRoot: P, outcome: 'use_original' },
        {},
        sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(markPendingPeShown).toHaveBeenCalledWith(P);
      expect(logDebugMock).toHaveBeenCalledWith('pe_terminal_notice', { projectRoot: P, outcome: 'use_original' });
    });

    it('acks nexpath:pe-keepalive (the MV3 idle-timer reset needs nothing more)', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener({ type: 'nexpath:pe-keepalive', projectRoot: P }, {}, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
    });
  });

  describe('the held-submit decider (the submit-time popup, inside the page\'s hold)', () => {
    const P = 'https://bolt.new/~/p1';
    const PENDING_KEY = `nexpath_pending_advisory::${P}`;
    const OG_KEY = `nexpath_pending_advisory_og::${P}`;
    const peRecord = {
      sessionId: 's1', promptCount: 9, status: 'pending' as const, createdAt: 1,
      request: { requestId: 'r1' }, result: { disposition: 'show_current_body' },
    };

    // `null` (not undefined) means "no tab": passing undefined explicitly would
    // trigger the default parameter and silently give the test a tab anyway.
    function decide(messageListener: MessageListener, tabId: number | null = 7, over: Record<string, unknown> = {}) {
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-decision-request', site: 'bolt', projectRoot: P,
          requestId: 'r1', prompt: 'just ship it', submitId: 's1', ...over },
        tabId === null ? {} : { tab: { id: tabId } },
        sendResponse,
      );
      return sendResponse;
    }

    beforeEach(() => {
      vi.mocked(resolvePePopupCooldown).mockResolvedValue(7);
      vi.mocked(resolvePeSequenceEnabled).mockResolvedValue(false);
      vi.mocked(getPendingPe).mockResolvedValue(peRecord as never);
      vi.mocked(markPendingPeShown).mockResolvedValue(undefined);
      idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9 });
      vi.mocked(runBrowserPePopup).mockResolvedValue({ result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
      // The decider waits for the pipeline to have SEEN this prompt (the
      // capture/decision race). Default: it already has, so these tests exercise
      // the decision itself; the race describe overrides this deliberately.
      keyStoreGetKey.mockImplementation(async (name: string) =>
        (name === `nexpath_last_prompt::${P}` ? JSON.stringify({ text: 'just ship it', at: 1 }) : null));
    });

    // ── RELEASING THE HOLD WHEN THE USER PICKS THEIR OWN PROMPT ───────────────
    // "Use original" does not emit its command until the satisfaction step is
    // answered, and the hold has no ceiling — so an abandoned survey held the
    // prompt forever ("the flow stucked"). The panel announces the decision as
    // it is made; that announcement ends the hold without touching the popup.
    describe('the early release (use_original announced before its feedback step)', () => {
      /** A popup that is still on screen collecting feedback. */
      function popupStillOpen(): void {
        vi.mocked(runBrowserPePopup).mockReturnValue(new Promise(() => {}) as never);
      }
      function notice(messageListener: MessageListener, outcome: string, root = P, tabId: number | null = 7) {
        const sendResponse = vi.fn();
        messageListener(
          { type: 'nexpath:pe-terminal-notice', projectRoot: root, outcome },
          tabId === null ? {} : { tab: { id: tabId } },
          sendResponse,
        );
        return sendResponse;
      }

      it('releases the prompt while the popup is still up', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_original');
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(logDebugMock).toHaveBeenCalledWith('submit_decision_early_release', { submitId: 's1', projectRoot: P });
      });

      it('WITHOUT the announcement the prompt stays held — this is the bug it fixes', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).not.toHaveBeenCalled();
      });

      it('only use_original releases early — use_current must wait for its body text', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_current');
        notice(messageListener, 'close');
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).not.toHaveBeenCalled();
      });

      it('a notice for a DIFFERENT page never releases this page\'s prompt', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_original', 'https://bolt.new/~/OTHER');
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).not.toHaveBeenCalled();
      });

      it('a notice from ANOTHER TAB on the same project never releases this tab\'s prompt', async () => {
        // Two tabs open on one project share a projectRoot (it is the project
        // URL). Releasing on the root alone would send a prompt whose own user
        // never touched the popup.
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener, 7);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_original', P, 9);   // the OTHER tab
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).not.toHaveBeenCalled();

        notice(messageListener, 'use_original', P, 7);   // the holding tab
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
      });

      it('a notice carrying no tab releases nothing', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener, 7);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_original', P, null);
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).not.toHaveBeenCalled();
      });

      it('one notice answers exactly ONE hold — never two at once', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const first = decide(messageListener, 7, { submitId: 'sA' });
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
        const second = decide(messageListener, 7, { submitId: 'sB' });
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(2));

        notice(messageListener, 'use_original');
        await new Promise((r) => setTimeout(r, 50));
        const answered = [first, second].filter((r) => r.mock.calls.length > 0);
        expect(answered).toHaveLength(1);
      });

      it('a notice with nothing held is a no-op, and still acks', async () => {
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = notice(messageListener, 'use_original');
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
        expect(logDebugMock).not.toHaveBeenCalledWith('submit_decision_early_release', expect.anything());
      });

      it('a second notice after the release changes nothing (the command follows behind it)', async () => {
        popupStillOpen();
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        notice(messageListener, 'use_original');
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());
        notice(messageListener, 'use_original');   // the real terminal click
        await new Promise((r) => setTimeout(r, 50));
        expect(sendResponse).toHaveBeenCalledOnce();  // never answered twice
      });

      it('a popup that REJECTS after an early release does not become an unhandled rejection', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
          let boom: (e: Error) => void = () => {};
          vi.mocked(runBrowserPePopup).mockReturnValue(new Promise((_, rej) => { boom = rej; }) as never);
          const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
          const sendResponse = decide(messageListener);
          await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

          notice(messageListener, 'use_original');
          await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
          boom(new Error('popup died after the release'));
          await new Promise((r) => setTimeout(r, 50));
          expect(unhandled).not.toHaveBeenCalled();
        } finally {
          process.off('unhandledRejection', unhandled);
        }
      });

      it('the popup\'s own outcome still decides when it answers first (no behaviour change)', async () => {
        vi.mocked(runBrowserPePopup).mockResolvedValue({
          result: { state: 'selected_current', bodyText: 'the improved prompt' }, mpsFirstPopupSent: false,
        } as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({
          decision: { kind: 'block', replacement: 'the improved prompt' },
        }));
        expect(logDebugMock).not.toHaveBeenCalledWith('submit_decision_early_release', expect.anything());
      });
    });

    describe('the block condition — only an explicit, non-empty replacement withholds', () => {
      it('selected_current WITH body text → block, carrying that text', async () => {
        vi.mocked(runBrowserPePopup).mockResolvedValue({
          result: { state: 'selected_current', bodyText: 'the improved prompt' }, mpsFirstPopupSent: false,
        } as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({
          decision: { kind: 'block', replacement: 'the improved prompt' },
        }));
      });

      it('selected_current with EMPTY body text → allow (a block with nothing to send loses the prompt)', async () => {
        vi.mocked(runBrowserPePopup).mockResolvedValue({
          result: { state: 'selected_current', bodyText: '' }, mpsFirstPopupSent: false,
        } as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
      });

      for (const state of ['selected_original', 'closed_no_send']) {
        it(`${state} → allow`, async () => {
          vi.mocked(runBrowserPePopup).mockResolvedValue({ result: { state }, mpsFirstPopupSent: false } as never);
          const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
          const sendResponse = decide(messageListener);
          await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        });
      }

      it('not_shown → allow', async () => {
        vi.mocked(runBrowserPePopup).mockResolvedValue({
          result: { state: 'not_shown', reasonCodes: ['popup_already_open'] }, mpsFirstPopupSent: false,
        } as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
      });

      it('a popup host that THROWS → allow, never a hung hold', async () => {
        vi.mocked(runBrowserPePopup).mockRejectedValue(new Error('engine blew up'));
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
      });
    });

    describe('the capture/decision race — the popup must not be lost to timing', () => {
      // The capture that starts the pipeline and the decision request that waits
      // for it are two independent messages fired microseconds apart. The decider
      // must wait for ITS OWN prompt's run to appear, not just glance at a marker
      // that may not be written yet.
      const LAST_PROMPT_KEY = `nexpath_last_prompt::${P}`;

      it('waits for the pipeline to pick up THIS prompt before reading its rows', async () => {
        let seen = false;
        keyStoreGetKey.mockImplementation(async (name: string) => {
          if (name === LAST_PROMPT_KEY) return seen ? JSON.stringify({ text: 'just ship it', at: 1 }) : null;
          return null;
        });
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);

        // The pipeline has not registered yet — the decider must NOT have concluded.
        await new Promise((r) => setTimeout(r, 150));
        expect(runBrowserPePopup).not.toHaveBeenCalled();

        seen = true; // capture lands, pipeline records the prompt
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      });

      it('proceeds immediately when the pipeline already handled this prompt', async () => {
        keyStoreGetKey.mockImplementation(async (name: string) =>
          (name === LAST_PROMPT_KEY ? JSON.stringify({ text: 'just ship it', at: 1 }) : null));
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalledTimes(1));
      });

      it('gives up after the grace window and ALLOWS, rather than holding forever', async () => {
        // Capture was dropped entirely: nothing will ever record this prompt.
        keyStoreGetKey.mockResolvedValue(null);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(
          () => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }),
          { timeout: 8000 },
        );
        expect(logDebugMock).toHaveBeenCalledWith('submit_decision_pipeline_never_started', expect.anything());
      }, 10000);

      it('is not fooled by a DIFFERENT prompt already in the last-prompt slot', async () => {
        keyStoreGetKey.mockImplementation(async (name: string) =>
          (name === LAST_PROMPT_KEY ? JSON.stringify({ text: 'some earlier prompt', at: 1 }) : null));
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await new Promise((r) => setTimeout(r, 200));
        expect(runBrowserPePopup).not.toHaveBeenCalled(); // still waiting for OUR prompt
      });
    });

    describe('preconditions that allow without showing anything', () => {
      it('no pending PE row → allow, popup never runs', async () => {
        vi.mocked(getPendingPe).mockResolvedValue(null);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(runBrowserPePopup).not.toHaveBeenCalled();
      });

      it('no tab to render into → allow, popup never runs', async () => {
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener, null);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(runBrowserPePopup).not.toHaveBeenCalled();
      });

      it('cooldown window → allow, and the row is CONSUMED (a cooldown hit is a decision)', async () => {
        idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9, lastPromptEnhancementPromptIndex: 8 });
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(markPendingPeShown).toHaveBeenCalledWith(P);
        expect(runBrowserPePopup).not.toHaveBeenCalled();
      });
    });

    describe('one decider per turn (the response-stop surface is suppressed)', () => {
      it('consumes the queued advisory rows so the later stop finds nothing', async () => {
        keyStoreGetKey.mockImplementation(async (name: string) => {
          if (name === PENDING_KEY) return '{"advisoryId":"a1"}';
          if (name === `nexpath_last_prompt::${P}`) return JSON.stringify({ text: 'just ship it', at: 1 });
          return null;
        });
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith('submit_decision_consumed_advisory', expect.anything()));
        expect(keyStoreSetKey).toHaveBeenCalledWith(PENDING_KEY, '');
        expect(keyStoreSetKey).toHaveBeenCalledWith(OG_KEY, '');
      });

      it('consumes the pending PE row on first render, starting the cooldown', async () => {
        const state = { sessionId: 's1', promptCount: 9 } as Record<string, unknown>;
        idbLoadSessionState.mockResolvedValue(state);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());
        await vi.mocked(runBrowserPePopup).mock.calls[0]![0].onFirstRendered();
        expect(markPendingPeShown).toHaveBeenCalledWith(P);
        expect(state['lastPromptEnhancementPromptIndex']).toBe(9);
      });
    });

    describe('RC43 — the post-hold quiet window', () => {
      it('drops a response-stop that arrives while this project\'s submit is being decided', async () => {
        let resolvePopup: (v: unknown) => void = () => {};
        vi.mocked(runBrowserPePopup).mockReturnValue(new Promise((r) => { resolvePopup = r; }) as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        // The site's completion observers fire while we still hold the submit —
        // that stop is our own echo, not a turn ending.
        messageListener(
          { type: 'nexpath:response-stop', projectRoot: P, agent: 'bolt', tabId: 0 },
          { tab: { id: 7 } }, vi.fn(),
        );
        await vi.waitFor(() => expect(logDebugMock).toHaveBeenCalledWith(
          'response_stop_quiet_window', { projectRoot: P }));

        resolvePopup({ result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
      });

      it('a stop for a DIFFERENT project is unaffected', async () => {
        let resolvePopup: (v: unknown) => void = () => {};
        vi.mocked(runBrowserPePopup).mockReturnValue(new Promise((r) => { resolvePopup = r; }) as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        messageListener(
          { type: 'nexpath:response-stop', projectRoot: 'https://bolt.new/~/other', agent: 'bolt', tabId: 0 },
          { tab: { id: 7 } }, vi.fn(),
        );
        await new Promise((r) => setTimeout(r, 50));
        expect(logDebugMock).not.toHaveBeenCalledWith(
          'response_stop_quiet_window', { projectRoot: 'https://bolt.new/~/other' });

        resolvePopup({ result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
      });

      it('the window only DELAYS a stop — the pending rows are never consumed by it', async () => {
        let resolvePopup: (v: unknown) => void = () => {};
        vi.mocked(runBrowserPePopup).mockReturnValue(new Promise((r) => { resolvePopup = r; }) as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());
        const setCallsBefore = keyStoreSetKey.mock.calls.length;

        messageListener(
          { type: 'nexpath:response-stop', projectRoot: P, agent: 'bolt', tabId: 0 },
          { tab: { id: 7 } }, vi.fn(),
        );
        await new Promise((r) => setTimeout(r, 50));
        // A suppressed stop writes nothing at all.
        expect(keyStoreSetKey.mock.calls.length).toBe(setCallsBefore);

        resolvePopup({ result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
      });
    });

    describe('the "held" notice is announced ONLY when a popup is actually coming', () => {
      const preparing = () => tabsSendMessageMock.mock.calls.filter(
        (c) => (c[1] as { type?: string } | undefined)?.type === 'nexpath:pe-preparing');

      it('announces it once the popup is about to run', async () => {
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());
        expect(preparing()).toHaveLength(1);
      });

      it('says NOTHING when there is no pending enhancement — the common case', async () => {
        // Live-caught on Bolt: a 102 ms hold that produced no popup still told the
        // user their prompt was held and an enhancement was being prepared.
        vi.mocked(getPendingPe).mockResolvedValue(null);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(preparing()).toEqual([]);
      });

      it('says NOTHING when the cooldown suppresses the popup', async () => {
        idbLoadSessionState.mockResolvedValue({ sessionId: 's1', promptCount: 9, lastPromptEnhancementPromptIndex: 8 });
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(preparing()).toEqual([]);
      });

      it('says NOTHING when there is no tab to render into', async () => {
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener, null);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(preparing()).toEqual([]);
      });
    });

    describe('THIS PATH NEVER INJECTS (injecting as well as substituting = two prompts)', () => {
      it('a block does not send nexpath:pe-inject to the tab', async () => {
        vi.mocked(runBrowserPePopup).mockResolvedValue({
          result: { state: 'selected_current', bodyText: 'the improved prompt' }, mpsFirstPopupSent: false,
        } as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
        const injects = tabsSendMessageMock.mock.calls.filter(
          (c) => (c[1] as { type?: string } | undefined)?.type === 'nexpath:pe-inject');
        expect(injects).toEqual([]);
      });
    });

    describe('an abandoned hold (the page already sent the original)', () => {
      it('tears the popup down and discards a verdict that arrives afterwards', async () => {
        let resolvePopup: (v: unknown) => void = () => {};
        vi.mocked(runBrowserPePopup).mockReturnValue(new Promise((r) => { resolvePopup = r; }) as never);
        const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
        const sendResponse = decide(messageListener);
        await vi.waitFor(() => expect(runBrowserPePopup).toHaveBeenCalled());

        // The page gives up and sends the original.
        messageListener(
          { type: 'nexpath:submit-flow-event', site: 'bolt', event: 'submit_hold_expired', data: { submitId: 's1' } },
          { tab: { id: 7 } }, vi.fn(),
        );
        const closes = tabsSendMessageMock.mock.calls.filter(
          (c) => (c[1] as { type?: string } | undefined)?.type === 'nexpath:pe-close');
        expect(closes.length).toBeGreaterThanOrEqual(1);

        // The user clicks "use this" afterwards — it must NOT come back as a block.
        resolvePopup({ result: { state: 'selected_current', bodyText: 'too late' }, mpsFirstPopupSent: false });
        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
        expect(logDebugMock).toHaveBeenCalledWith('submit_decision_discarded_abandoned', expect.anything());
      });
    });
  });

  describe('inflight-marker overlap (live-caught 2026-08-24: quick pipeline erased a slow sibling\'s marker)', () => {
    it('a quick-exit pipeline does NOT clear the marker while a slow sibling still runs; the last finisher clears it', async () => {
      // Backing store so the marker's real state is observable across both
      // pipelines (the plain mocks don't retain writes).
      const store = new Map<string, string>();
      keyStoreGetKey.mockImplementation(async (k: string) => store.get(k) ?? null);
      keyStoreSetKey.mockImplementation(async (k: string, v: string) => { store.set(k, v); });
      store.set('openai_api_key', 'sk-real-key');
      store.set('advisory_frequency', 'every_event');

      // Pipeline A goes down the fire path and BLOCKS inside the PE prepare
      // (the real compose takes 8-18s of LLM time — the exact window the live
      // race hit) until we release it.
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true, stage: 'implementation', stage_confidence: 0.9, reason: 'r',
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'o', descBase: 'd' }], L2: [], L3: [], pinchFallback: 'p',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('p');
      let releasePrepare!: () => void;
      vi.mocked(prepareAndStoreBrowserPe).mockImplementation(() =>
        new Promise((resolve) => {
          releasePrepare = () => resolve({
            disposition: 'no_popup_not_applicable', safeFallback: true, reasonCode: 'facade_error',
          } as never);
        }));

      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const P = 'https://bolt.new/~/overlap';
      const MARKER = `nexpath_decision_inflight::${P}`;
      const submit = (text: string): ReturnType<typeof vi.fn> => {
        const sendResponse = vi.fn();
        messageListener(
          { type: 'nexpath:prompt-submit', promptText: text, projectRoot: P, agent: 'bolt', tabId: 7 },
          {},
          sendResponse,
        );
        return sendResponse;
      };

      const responseA = submit('slow prompt that fires');
      await vi.waitFor(() => expect(vi.mocked(prepareAndStoreBrowserPe)).toHaveBeenCalledTimes(1));
      expect(store.get(MARKER)).toBeTruthy(); // A is inside the marker

      // Pipeline B: same text within the dedup window → quick exit via the
      // cross-page dedup — the exact "fast second prompt" from the live race.
      const responseB = submit('slow prompt that fires');
      await vi.waitFor(() => expect(responseB).toHaveBeenCalledWith({ ok: true }));
      // THE FIX: B's finally must NOT have cleared A's marker.
      expect(store.get(MARKER), 'quick pipeline erased the slow sibling\'s marker').toBeTruthy();

      releasePrepare();
      await vi.waitFor(() => expect(responseA).toHaveBeenCalledWith({ ok: true }));
      expect(store.get(MARKER)).toBe(''); // last finisher clears
    });
  });

  describe('per-project frequency override (CLI-parity Ctrl+X disable)', () => {
    it('a per-project advisory_frequency:<root>=off fast-exits even while the global setting is active', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) => {
        if (name === 'openai_api_key') return 'sk-real-key';
        if (name === 'advisory_frequency') return 'every_event';        // global: on
        if (name === 'advisory_frequency:https://replit.com') return 'off'; // this project: disabled
        return null;
      });
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(shouldFireStage2).not.toHaveBeenCalled(); // off → fast-exit, same as global off
    });

    it('the per-project override wins over the global setting in the other direction too (global off, project on)', async () => {
      keyStoreGetKey.mockImplementation(async (name: string) => {
        if (name === 'openai_api_key') return 'sk-real-key';
        if (name === 'advisory_frequency') return 'off';                       // global: disabled
        if (name === 'advisory_frequency:https://replit.com') return 'every_event'; // this project: on
        return null;
      });
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'stage_transition' } as unknown as ReturnType<typeof shouldFireStage2>);
      vi.mocked(runStage2).mockResolvedValue({ fire_decision_session: false } as unknown as Awaited<ReturnType<typeof runStage2>>);
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });

      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'hi', projectRoot: 'https://replit.com', agent: 'replit', tabId: 7 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(shouldFireStage2).toHaveBeenCalled(); // project override re-enabled → gating proceeds
    });
  });

  describe('advisory footer intents (CLI-parity panel Ctrl+X / Ctrl+T shortcuts)', () => {
    it("'disable-project' writes advisory_frequency:<root>=off and acks, without opening options", async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      const keepOpen = messageListener(
        { type: 'nexpath:advisory-footer-intent', intent: 'disable-project', projectRoot: 'https://replit.com' },
        {}, sendResponse,
      );
      expect(keepOpen).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(keyStoreSetKey).toHaveBeenCalledWith('advisory_frequency:https://replit.com', 'off');
      expect(openOptionsPageMock).not.toHaveBeenCalled();
    });

    it("'open-settings' opens the options page and acks, writing no frequency key", async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:advisory-footer-intent', intent: 'open-settings', projectRoot: 'https://replit.com' },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(openOptionsPageMock).toHaveBeenCalledOnce();
      expect(keyStoreSetKey).not.toHaveBeenCalledWith('advisory_frequency:https://replit.com', 'off');
    });

    it('absence trigger: detector flags reach shouldFireStage2; Stage-2 SELECTED signal forms flagType + fired key (CLI auto.ts step 8)', async () => {
      const flag = { signalKey: 'TEST_CREATION', stage: 'implementation', firstAbsentAt: 0, promptCountAtDetection: 3 };
      vi.mocked(detectAbsenceFlags).mockReturnValue([flag] as never);
      vi.mocked(shouldFireStage2).mockReturnValue({ kind: 'absence', qualifyingFlags: [flag] } as unknown as ReturnType<typeof shouldFireStage2>);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      vi.mocked(runStage2).mockResolvedValue({
        fire_decision_session: true,
        selected_signal_key: 'SECURITY_REVIEW_GAP',
        signals_present: ['TEST_CREATION'],
      } as unknown as Awaited<ReturnType<typeof runStage2>>);
      vi.mocked(resolveDecisionContent).mockReturnValue({
        L1: [{ option: 'o1', descBase: 'b1' }], L2: [], L3: [], pinchFallback: 'f',
      } as unknown as ReturnType<typeof resolveDecisionContent>);
      vi.mocked(generatePinchLabel).mockResolvedValue('Pinch.');

      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'more code', projectRoot: 'https://replit.com', agent: 'replit', tabId: 42 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));

      // Detector output flows into the trigger decision (was hardcoded [] pre-wiring).
      expect(vi.mocked(shouldFireStage2)).toHaveBeenCalledWith(expect.anything(), undefined, [flag], expect.anything());
      // CLI 6.8: newly-detected flags persisted when the trigger is absence —
      // AND saved to IDB before the Stage-2 await (a Stage-2 error must not drop
      // them, or the detector re-flags the same signals every prompt).
      expect(mgrAddAbsenceFlag).toHaveBeenCalledWith(expect.anything(), flag);
      expect(idbSaveSessionState.mock.invocationCallOrder.some(
        (o) => o < vi.mocked(runStage2).mock.invocationCallOrder[0]!
          && o > mgrAddAbsenceFlag.mock.invocationCallOrder[0]!,
      )).toBe(true);
      // CLI 7.5: Stage-2 signal assessments fed back into the counters.
      expect(mgrApplyStage2SignalUpdates).toHaveBeenCalledWith(expect.anything(), ['TEST_CREATION']);
      // CLI step 8: the fired key uses Stage 2's SELECTED signal, not the first qualifying flag.
      expect(mgrMarkDecisionSessionFired).toHaveBeenCalledWith(expect.anything(), 'absence:SECURITY_REVIEW_GAP@implementation');
      const ogCall = keyStoreSetKey.mock.calls.find((c) => (c[0] as string).startsWith('nexpath_pending_advisory_og'));
      expect(ogCall).toBeDefined();
      expect(JSON.parse(ogCall![1] as string)).toMatchObject({ flagType: 'absence:SECURITY_REVIEW_GAP' });
    });

    it('profile classifier RUNS when the gate is open (stale + history >= MIN_PROFILE_PROMPTS-1) and sets the profile', async () => {
      mgrCurrent.promptHistory = [
        { index: 0, text: 'a', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 1, text: 'b', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 2, text: 'c', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
      ]; // length 3 == MIN_PROFILE_PROMPTS(4) - 1 → gate open
      vi.mocked(isProfileStale).mockReturnValue(true);
      vi.mocked(classifyUserProfileLLM).mockResolvedValue({ nature: 'beginner', mood: 'rushed', depth: 'low', computedAt: 3 } as never);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(classifyUserProfileLLM)).toHaveBeenCalledOnce();
      expect(mgrSetProfile).toHaveBeenCalledWith(expect.objectContaining({ nature: 'beginner', mood: 'rushed' }));
    });

    it('profile classifier is SKIPPED for short history (gate closed → profile stays null, zero regression)', async () => {
      mgrCurrent.promptHistory = [
        { index: 0, text: 'a', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
      ]; // length 1 < 3 → gate closed
      vi.mocked(isProfileStale).mockReturnValue(true);
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(classifyUserProfileLLM)).not.toHaveBeenCalled();
      expect(mgrSetProfile).not.toHaveBeenCalledWith(expect.objectContaining({ nature: expect.anything() }));
    });

    it('profile classifier is SKIPPED when the profile is fresh (not stale), even with long history', async () => {
      mgrCurrent.promptHistory = [
        { index: 0, text: 'a', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 1, text: 'b', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 2, text: 'c', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
      ];
      vi.mocked(isProfileStale).mockReturnValue(false); // fresh → skip
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(classifyUserProfileLLM)).not.toHaveBeenCalled();
    });

    it('profile classifier TIMEOUT/failure leaves profile unchanged (never blocks the pipeline)', async () => {
      mgrCurrent.promptHistory = [
        { index: 0, text: 'a', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 1, text: 'b', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
        { index: 2, text: 'c', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.5 },
      ];
      vi.mocked(isProfileStale).mockReturnValue(true);
      vi.mocked(classifyUserProfileLLM).mockRejectedValue(new Error('AbortError'));
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse,
      );
      // Pipeline still completes (ok:true), profile not set from the failed call.
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(mgrSetProfile).not.toHaveBeenCalledWith(expect.objectContaining({ nature: expect.anything() }));
    });

    it('Stream B presence runs ONLY at implementation stage with >=3 prompts in it (CLI auto.ts 2.8 gate)', async () => {
      vi.mocked(classifyStreamBPresence).mockResolvedValue({} as never);
      mgrCurrent.promptsInCurrentStage = 3;
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p1', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(classifyStreamBPresence)).toHaveBeenCalledTimes(1);

      // Below the prompt floor the gate stays closed (no LLM call).
      vi.mocked(classifyStreamBPresence).mockClear();
      mgrCurrent.promptsInCurrentStage = 1;
      keyStoreGetKey.mockResolvedValueOnce('sk-real-key');
      const sendResponse2 = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-submit', promptText: 'p2', projectRoot: 'https://replit.com', agent: 'replit', tabId: 1 },
        {}, sendResponse2,
      );
      await vi.waitFor(() => expect(sendResponse2).toHaveBeenCalledWith({ ok: true }));
      expect(vi.mocked(classifyStreamBPresence)).not.toHaveBeenCalled();
    });

    it("'set-frequency' writes the GLOBAL slot (options-page sync) and clears the per-project override", async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:advisory-footer-intent', intent: 'set-frequency', projectRoot: 'https://replit.com', value: 'optimum' },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(keyStoreSetKey).toHaveBeenCalledWith('advisory_frequency', 'optimum');
      expect(keyStoreSetKey).toHaveBeenCalledWith('advisory_frequency:https://replit.com', '');
    });

    it("'set-role' writes the GLOBAL role slot (+clears per-project); a non-whitelisted value is rejected", async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:advisory-footer-intent', intent: 'set-role', projectRoot: 'https://replit.com', value: 'indie_hacker' },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      expect(keyStoreSetKey).toHaveBeenCalledWith('role', 'indie_hacker');
      expect(keyStoreSetKey).toHaveBeenCalledWith('role:https://replit.com', '');

      keyStoreSetKey.mockClear();
      const sendResponse2 = vi.fn();
      messageListener(
        { type: 'nexpath:advisory-footer-intent', intent: 'set-frequency', projectRoot: 'https://replit.com', value: 'off; DROP TABLE' },
        {}, sendResponse2,
      );
      await vi.waitFor(() => expect(sendResponse2).toHaveBeenCalledWith({ ok: true }));
      expect(keyStoreSetKey).not.toHaveBeenCalled();
      expect(logWarnMock).toHaveBeenCalledWith('advisory_set_frequency_rejected', expect.anything());
    });

    it('nexpath:prompt-injected records the text in the cross-page dedup slot (injected-echo suppression)', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:prompt-injected', projectRoot: 'https://replit.com', text: 'Run the full test suite' },
        {}, sendResponse,
      );
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
      const call = keyStoreSetKey.mock.calls.find((c) => c[0] === 'nexpath_last_prompt::https://replit.com');
      expect(call).toBeDefined();
      expect(JSON.parse(call![1] as string)).toMatchObject({ text: 'Run the full test suite' });
    });

    it('nexpath:advisory-terminal logs advisory_dismissed (survives SW-teardown of the round-trip)', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:advisory-terminal', eventType: 'skip', advisoryId: 'adv-99' },
        {}, sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(logDebugMock).toHaveBeenCalledWith('advisory_dismissed', { eventType: 'skip', advisoryId: 'adv-99' });
    });

    it('nexpath:submit-flow-state records the PAGE world\'s own belief in the ring buffer', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-flow-state', site: 'bolt', armed: true, source: 'default_on', seq: 2 },
        {}, sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(logDebugMock).toHaveBeenCalledWith('submit_flow_state', {
        site: 'bolt', armed: true, source: 'default_on', seq: 2,
      });
    });

    it('a malformed submit-flow-state is not routed (the guard rejects it)', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-flow-state', site: 'bolt', armed: 'yes', source: 'x', seq: 1 },
        {}, sendResponse,
      );
      expect(logDebugMock).not.toHaveBeenCalledWith('submit_flow_state', expect.anything());
    });

    it('nexpath:submit-decision-request always answers, and answers allow for now', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      const kept = messageListener(
        { type: 'nexpath:submit-decision-request', site: 'bolt', projectRoot: 'https://bolt.new/~/p',
          requestId: 'r1', prompt: 'ship it', submitId: 's1' },
        {}, sendResponse,
      );
      // MUST keep the channel open: the page is holding the user's request.
      expect(kept).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ decision: { kind: 'allow' } }));
      expect(logDebugMock).toHaveBeenCalledWith('submit_decision_requested', expect.objectContaining({ submitId: 's1' }));
      expect(logDebugMock).toHaveBeenCalledWith('submit_decision_answered', { submitId: 's1', kind: 'allow' });
    });

    it('a malformed decision request is not routed', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-decision-request', site: 'bolt', requestId: 'r1' }, // no prompt/submitId/projectRoot
        {}, sendResponse,
      );
      expect(logDebugMock).not.toHaveBeenCalledWith('submit_decision_requested', expect.anything());
    });

    it('a gated-path ring event is logged under its own event name', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-flow-event', site: 'lovable', event: 'submit_hold_released_allow',
          data: { submitId: 's1', heldMs: 812 } },
        {}, sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(logDebugMock).toHaveBeenCalledWith('submit_hold_released_allow', {
        site: 'lovable', submitId: 's1', heldMs: 812,
      });
    });

    it('the read-back is diagnostic ONLY — it must not touch the advisory pipeline', async () => {
      const { messageListener } = await importFreshServiceWorker({ hasDocument: hasDocumentMock, createDocument: createDocumentMock });
      const sendResponse = vi.fn();
      messageListener(
        { type: 'nexpath:submit-flow-state', site: 'replit', armed: false, source: 'site_off', seq: 1 },
        {}, sendResponse,
      );
      expect(classifyPrompt).not.toHaveBeenCalled();
      expect(shouldFireStage2).not.toHaveBeenCalled();
      expect(runStage2).not.toHaveBeenCalled();
      expect(keyStoreSetKey).not.toHaveBeenCalled();
    });
  });

});
