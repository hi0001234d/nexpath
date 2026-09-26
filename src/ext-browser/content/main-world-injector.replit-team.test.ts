// @vitest-environment jsdom

/**
 * Replit chats and team workspaces through the content-script relay.
 *
 * A chat lives at /chats/<id>, and a team workspace puts its chats and projects
 * under /t/<team>/ — none of them start with /@<user>/, and the relay used to
 * treat all of them as having no project: every prompt was "capture skipped — no
 * project context", a prompt typed on the home page was stashed and then
 * "expired without entering a project", and nothing ever reached the service
 * worker, so no popup could show. The URL rule itself is unit-tested in
 * agents/agent-hosts.test.ts; this file proves the relay now forwards those
 * pages' prompts and response-stops under each page's own root.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn().mockReturnValue('chrome-extension://abc123/inject/main-world.js'),
      sendMessage: sendMessageMock,
      onMessage: { addListener: vi.fn() },
    },
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
  },
}));

const ORIGIN = 'https://replit.com';
const PROJECT_PATH = '/t/my-team/repls/Invoice-App';
const CHAT_PATH = '/t/my-team/chats/chat-cnv_0abc123def456ghi789';
/** A chat outside a team workspace — where a home-page prompt lands first. */
const PLAIN_CHAT_PATH = '/chats/hello-world-cnv_0abc123def456';

function setPath(pathname: string): void {
  vi.stubGlobal('location', { origin: ORIGIN, hostname: 'replit.com', pathname });
}

function dispatchWindowMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }));
}

describe('main-world-injector.ts — Replit team workspace pages', () => {
  // The module registers its listener once, at import time.
  beforeAll(async () => {
    setPath(PROJECT_PATH);
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
    await import('./main-world-injector.js');
  });

  afterEach(() => {
    vi.useRealTimers();
    setPath(PROJECT_PATH);
  });

  it('forwards a prompt typed on a team PROJECT page, under that project\'s root', () => {
    sendMessageMock.mockClear();
    setPath(PROJECT_PATH);
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'add a login page', agent: 'replit' });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:prompt-submit',
      promptText: 'add a login page',
      projectRoot: `${ORIGIN}${PROJECT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('forwards a prompt typed on a team CHAT page, under that chat\'s root', () => {
    sendMessageMock.mockClear();
    setPath(CHAT_PATH);
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'fix the checkout import', agent: 'replit' });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:prompt-submit',
      promptText: 'fix the checkout import',
      projectRoot: `${ORIGIN}${CHAT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('forwards a prompt typed in a chat that has no team, under that chat\'s root', () => {
    sendMessageMock.mockClear();
    setPath(PLAIN_CHAT_PATH);
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'make it dark mode', agent: 'replit' });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:prompt-submit',
      promptText: 'make it dark mode',
      projectRoot: `${ORIGIN}${PLAIN_CHAT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('a prompt typed on the Replit home is delivered once the page moves into the new chat', () => {
    // The live shape: the home page has no project, the prompt is held, and the
    // page then lands on the chat the site just created for it.
    vi.useFakeTimers();
    sendMessageMock.mockClear();
    setPath('/~');
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'make a hello world page', agent: 'replit' });
    expect(sendMessageMock).not.toHaveBeenCalled();

    setPath(PLAIN_CHAT_PATH);
    vi.advanceTimersByTime(1_100);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:prompt-submit',
      promptText: 'make a hello world page',
      projectRoot: `${ORIGIN}${PLAIN_CHAT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('forwards the response-stop on a team page — the moment the popup is shown', () => {
    sendMessageMock.mockClear();
    setPath(CHAT_PATH);
    dispatchWindowMessage({ type: 'nexpath:response-stopped', agent: 'replit' });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:response-stop',
      projectRoot: `${ORIGIN}${CHAT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('a prompt typed on the team home is delivered once the page moves into a chat', () => {
    vi.useFakeTimers();
    sendMessageMock.mockClear();
    setPath('/t/my-team'); // no project here — the relay holds the text
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'build a recipe site', agent: 'replit' });
    expect(sendMessageMock).not.toHaveBeenCalled();

    setPath(CHAT_PATH); // the same page instance navigates into the new chat
    vi.advanceTimersByTime(1_100);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'nexpath:prompt-submit',
      promptText: 'build a recipe site',
      projectRoot: `${ORIGIN}${CHAT_PATH}`,
      agent: 'replit',
      tabId: 0,
    });
  });

  it('the team\'s project list is still not a project — capture is skipped there, as before', () => {
    vi.useFakeTimers();
    sendMessageMock.mockClear();
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    setPath('/t/my-team/repls');
    dispatchWindowMessage({ type: 'nexpath:prompt-captured', promptText: 'hello', agent: 'replit' });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(postSpy).toHaveBeenCalledWith({ type: 'nexpath:capture-rejected', promptText: 'hello' }, ORIGIN);
    postSpy.mockRestore();

    // Staying on the list past the hold window drops the held text; nothing is sent.
    vi.advanceTimersByTime(125_000);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
