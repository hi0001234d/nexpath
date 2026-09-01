// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const fetchMock = vi.fn();

const mockOnChanged = vi.fn();
vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: mockGet, set: mockSet }, onChanged: { addListener: mockOnChanged } } },
}));

function setupDom(): void {
  document.body.innerHTML = `
    <input id="api-key" />
    <button id="test-key"></button>
    <button id="save-key"></button>
    <p id="key-status"></p>
    <input id="nexpath-token" />
    <button id="test-token"></button>
    <button id="save-token"></button>
    <p id="token-status"></p>
    <div id="frequency-group"></div>
    <div id="role-group"></div>
    <div id="self-check"></div>
  `;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadOptionsModule(): Promise<void> {
  setupDom();
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  await import('./options.js');
  await flush();
}

function els() {
  return {
    input: document.getElementById('api-key') as HTMLInputElement,
    testBtn: document.getElementById('test-key') as HTMLButtonElement,
    saveBtn: document.getElementById('save-key') as HTMLButtonElement,
    status: document.getElementById('key-status') as HTMLParagraphElement,
    selfCheck: document.getElementById('self-check') as HTMLDivElement,
    freqGroup: document.getElementById('frequency-group') as HTMLDivElement,
    roleGroup: document.getElementById('role-group') as HTMLDivElement,
  };
}

function radioFor(group: HTMLDivElement, value: string): HTMLInputElement {
  return group.querySelector(`input[value="${value}"]`) as HTMLInputElement;
}

describe('options.ts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    fetchMock.mockReset();
    mockSet.mockResolvedValue(undefined);
  });

  describe('loadKey', () => {
    it('populates the input and shows "Key saved" when a key is already stored', async () => {
      mockGet.mockResolvedValue({ openai_api_key: 'sk-existing' });
      await loadOptionsModule();

      const { input, status } = els();
      expect(input.value).toBe('sk-existing');
      expect(status.textContent).toContain('Key saved');
    });

    it('leaves the input empty when no key is stored', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { input, status } = els();
      expect(input.value).toBe('');
      expect(status.textContent).toBe('');
    });

    it('renders self-check "Not set" when no key is stored', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('Not set');
    });

    it('renders self-check "Saved" when a key is stored', async () => {
      mockGet.mockResolvedValue({ openai_api_key: 'sk-existing' });
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('Saved');
    });

    it('surfaces an error status when the initial load fails (no silent unhandled rejection)', async () => {
      // e.g. an invalidated extension context — storage.get rejects. The fire-and-forget
      // init must report this to the user, not drop it as an unhandled rejection.
      mockGet.mockRejectedValue(new Error('Extension context invalidated'));
      await loadOptionsModule();

      expect(els().status.textContent).toContain("Couldn't load saved settings");
    });
  });

  describe('project-role selector — same value set/labels/default as the CLI installer', () => {
    it('renders the 4 role options, matching the CLI picker exactly', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { roleGroup } = els();
      expect(roleGroup.querySelectorAll('input[type="radio"]').length).toBe(4);
      expect(radioFor(roleGroup, 'founder')).not.toBeNull();
      expect(radioFor(roleGroup, 'vibe_coder')).not.toBeNull();
      expect(radioFor(roleGroup, 'indie_hacker')).not.toBeNull();
      expect(radioFor(roleGroup, 'pm')).not.toBeNull();
    });

    it("defaults to founder when nothing is stored — matches the CLI installer's DEFAULT_ROLE", async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      expect(radioFor(els().roleGroup, 'founder').checked).toBe(true);
    });

    it('pre-selects the stored role value', async () => {
      mockGet.mockResolvedValue({ role: 'indie_hacker' });
      await loadOptionsModule();

      expect(radioFor(els().roleGroup, 'indie_hacker').checked).toBe(true);
    });

    it('persists the chosen role to storage on change', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();

      const { roleGroup } = els();
      radioFor(roleGroup, 'pm').click();
      await flush();

      expect(mockSet).toHaveBeenCalledWith({ role: 'pm' });
    });

    it('reflects the current role in the self-check panel', async () => {
      mockGet.mockResolvedValue({ role: 'vibe_coder' });
      await loadOptionsModule();

      expect(els().selfCheck.innerHTML).toContain('vibe coder');
    });
  });

  // Owner request 2026-08-25 (tester feedback): the Advisory Frequency control is GONE
  // from this page — it advertised control over a surface this extension no longer
  // shows (the advisory popup is removed by default, MPS-7 parity), so it read as
  // broken. These pin its absence so it cannot return by accident, and pin that the
  // page never writes the key any more.
  describe('advisory frequency is REMOVED from the settings page', () => {
    it('renders no frequency radios and no frequency row in the self-check', async () => {
      mockGet.mockResolvedValue({ advisory_frequency: 'optimum', role: 'founder' });
      await loadOptionsModule();

      const freqRadios = document.querySelectorAll('input[name="frequency"]');
      expect(freqRadios.length).toBe(0);
      const html = els().selfCheck.innerHTML;
      expect(html).not.toContain('Advisory frequency');
      expect(html).not.toContain('High');
    });

    it('never writes advisory_frequency, even when a stored value exists', async () => {
      mockGet.mockResolvedValue({ advisory_frequency: 'optimum' });
      await loadOptionsModule();

      radioFor(els().roleGroup, 'pm').click();
      await flush();

      for (const call of mockSet.mock.calls) {
        expect(Object.keys(call[0] as object)).not.toContain('advisory_frequency');
      }
    });

    it('the shipped options.html contains no frequency control', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).not.toContain('frequency-group');
      expect(html).not.toMatch(/Advisory Frequency/i);
    });
  });

  // Onboarding spec (2026-08-31): the token card must carry the exact,
  // step-wise path to a token — register link, verify, copy, paste/Save/Test —
  // so a user with no OpenAI key is never left guessing where tokens come from.
  describe('token onboarding steps (shipped options.html)', () => {
    it('walks the register -> verify -> copy -> paste path with a real signup link', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).toContain('https://parseos.tech/nexpath/signup');
      expect(html).toContain('https://parseos.tech/nexpath/login');
      expect(html).toMatch(/Create your free account/);
      expect(html).toMatch(/Verify your email/);
      expect(html).toMatch(/Copy the token/);
      // The OpenAI-key-priority rule stays stated (both cards remain valid paths).
      expect(html).toContain('takes priority');
    });
  });

  // Owner direction 2026-08-31 (settings-page restructure): token card
  // FIRST, no Advanced/Service-URL field, footer is the brand linking home.
  describe('page structure (shipped options.html)', () => {
    it('puts the Nexpath Token card before the OpenAI key card', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html.indexOf('id="nexpath-token"')).toBeGreaterThan(-1);
      expect(html.indexOf('id="nexpath-token"')).toBeLessThan(html.indexOf('id="api-key"'));
    });

    it('ships no Advanced section and no Service URL field', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).not.toContain('nexpath-base-url');
      expect(html).not.toMatch(/Advanced/);
      expect(html).not.toMatch(/Service URL/i);
    });

    it('footer is the clickable "Nexpath web" wordmark linking home — no version display, no icon', async () => {
      const { readFileSync } = await import('node:fs');
      const html = readFileSync('src/ext-browser/options/options.html', 'utf8');
      expect(html).toContain('class="footer-brand"');
      expect(html).toContain('href="https://parseos.tech/nexpath/"');
      // The wordmark and the "web" qualifier live inside ONE anchor: the whole
      // "Nexpath web" is the click target.
      expect(html).toMatch(/<a class="footer-brand"[^>]*>Nexpath <span class="footer-web">web<\/span><\/a>/);
      expect(html).not.toContain('nexpath.dev');
      // Version display removed (owner 2026-09-01) — and no glyph/icon characters.
      expect(html).not.toContain('ext-version');
      expect(html).not.toMatch(/footer-brand[^<]*<[^>]*>[^<]*[↗➚➜→]/u);
    });
  });

  describe('save button', () => {
    beforeEach(async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();
    });

    it('shows an error and does not save when the input is empty', async () => {
      const { saveBtn, status } = els();
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('Please enter a key');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('shows an error and does not save when the key does not start with sk-', async () => {
      const { input, saveBtn, status } = els();
      input.value = 'bad-key';
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('must start with sk-');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('saves a valid key and updates status', async () => {
      const { input, saveBtn, status } = els();
      input.value = 'sk-valid';
      saveBtn.click();
      await flush();

      expect(mockSet).toHaveBeenCalledWith({ openai_api_key: 'sk-valid' });
      expect(status.textContent).toContain('Saved');
    });

    it('shows an error status when chrome.storage.local.set throws', async () => {
      mockSet.mockRejectedValueOnce(new Error('quota exceeded'));
      const { input, saveBtn, status } = els();
      input.value = 'sk-valid';
      saveBtn.click();
      await flush();

      expect(status.textContent).toContain('Save failed');
    });
  });


  describe('live refresh (storage.onChanged)', () => {
    it('re-renders the radio groups when the chooser writes the global keys', async () => {
      mockGet.mockResolvedValue({}); // arrange the initial-load read BEFORE importing the module
      await loadOptionsModule();
      const listener = mockOnChanged.mock.calls.at(-1)?.[0] as (c: Record<string, unknown>, a: string) => void;
      expect(listener).toBeTypeOf('function');
      mockGet.mockResolvedValue({ role: 'pm' });
      listener({ role: { newValue: 'pm' } }, 'local');
      await flush();
      const checked = document.querySelector('#role-group input[checked], #role-group input:checked') as HTMLInputElement | null;
      expect(checked?.value).toBe('pm');
    });

    it('surfaces an error status when a live-refresh read fails (no silent unhandled rejection)', async () => {
      mockGet.mockResolvedValue({});
      await loadOptionsModule();
      const listener = mockOnChanged.mock.calls.at(-1)?.[0] as (c: Record<string, unknown>, a: string) => void;

      mockGet.mockRejectedValue(new Error('read failed'));
      listener({ role: { newValue: 'pm' } }, 'local');
      await flush();

      expect(els().status.textContent).toContain("Couldn't refresh settings");
    });
  });
});
