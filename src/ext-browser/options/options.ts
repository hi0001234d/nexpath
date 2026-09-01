import browser from 'webextension-polyfill';
import {
  NEXPATH_TOKEN_KEY,
  NEXPATH_BASE_URL_KEY,
  DEFAULT_API_BASE_URL,
  isValidNexpathTokenShape,
} from '../adapters/llm-credentials.js';

const KEY_NAME = 'openai_api_key';
const MODELS_URL = 'https://api.openai.com/v1/models';
const ROLE_KEY = 'role';

const input    = document.getElementById('api-key')      as HTMLInputElement;
const saveBtn  = document.getElementById('save-key')     as HTMLButtonElement;
const testBtn  = document.getElementById('test-key')     as HTMLButtonElement;
const keyStatus = document.getElementById('key-status')  as HTMLParagraphElement;
const checkEl  = document.getElementById('self-check')   as HTMLDivElement;
const roleGroup = document.getElementById('role-group')      as HTMLDivElement;
// No version display on this page (product decision 2026-09-01): the footer is the
// plain "Nexpath web" link home; the browser's own extensions page remains the
// place to read the installed version.

// ── Nexpath token (optional alternative to an OpenAI key) ─────────────────────
const tokenInput      = document.getElementById('nexpath-token')      as HTMLInputElement;
const tokenSaveBtn    = document.getElementById('save-token')         as HTMLButtonElement;
const tokenTestBtn    = document.getElementById('test-token')         as HTMLButtonElement;
const tokenStatus     = document.getElementById('token-status')       as HTMLParagraphElement;
// The Service URL FIELD was removed 2026-08-31 (owner: not useful to users —
// the shipped default is always right for them). The STORAGE override
// (NEXPATH_BASE_URL_KEY) stays honoured for developers/self-hosters, settable
// from the console; when present it still drives Test and the disclosure.
const baseUrlInput    = document.getElementById('nexpath-base-url')   as HTMLInputElement | null;
let storedBaseUrl = '';

// ── Project role — same value set, labels and default as the CLI installer
// (src/cli/commands/install.ts's ROLE_OPTIONS).
//
// ADVISORY FREQUENCY WAS REMOVED FROM THIS PAGE (owner request 2026-08-25, tester
// feedback). It advertised a control over a surface this extension no longer shows:
// the advisory popup is removed by default here (MPS-7 parity), so the setting read
// as broken. The stored `advisory_frequency` value is still HONOURED by the service
// worker's stop-gate if one exists from an earlier version — this change removes the
// UI only, never the behaviour, so nothing regresses for existing installs.

const ROLE_OPTIONS = [
  { value: 'founder',      label: 'founder / product creator' },
  { value: 'vibe_coder',   label: 'vibe coder' },
  { value: 'indie_hacker', label: 'indie hacker' },
  { value: 'pm',           label: 'product manager' },
] as const;
const DEFAULT_ROLE = 'founder';

function buildRadioGroup(
  container: HTMLDivElement,
  name: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  selected: string,
  onChange: (value: string) => void,
): void {
  container.innerHTML = '';
  for (const opt of options) {
    const id = `${name}-${opt.value}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'radio-option';
    wrapper.htmlFor = id;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.id = id;
    radio.value = opt.value;
    radio.checked = opt.value === selected;
    radio.addEventListener('change', () => {
      if (radio.checked) onChange(opt.value);
    });

    const labelSpan = document.createElement('span');
    labelSpan.className = 'radio-label';
    labelSpan.textContent = opt.label;

    wrapper.appendChild(radio);
    wrapper.appendChild(labelSpan);
    container.appendChild(wrapper);
  }
}

// ── Key persistence ───────────────────────────────────────────────────────────

async function loadKey(): Promise<void> {
  const result = await browser.storage.local.get(KEY_NAME);
  const saved = result[KEY_NAME];
  if (typeof saved === 'string' && saved.length > 0) {
    input.value = saved;
    setKeyStatus('Key saved — click Test to validate', '');
  }
  await loadToken();
  await loadRole();
  await renderSelfCheck();
}

// ── Nexpath token persistence ────────────────────────────────────────────────

function setTokenStatus(msg: string, kind: 'ok' | 'err' | ''): void {
  tokenStatus.textContent = msg;
  tokenStatus.className = `status ${kind}`;
}

/** The configured service base URL — legacy field, stored override, or default. */
function serviceBaseUrl(): string {
  const value = baseUrlInput?.value.trim() || storedBaseUrl;
  return (value.length > 0 ? value : DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

// The Mode-B disclosure paragraph was REMOVED entirely on 2026-09-01 (product
// decision: no storage/data-flow statements shown to users for now; revisit at a
// future privacy pass). The guard below keeps any stale markup hidden.
try { const d = document.getElementById('token-disclosure'); if (d) d.hidden = true; } catch { /* no-op */ }

async function loadToken(): Promise<void> {
  const result = await browser.storage.local.get([NEXPATH_TOKEN_KEY, NEXPATH_BASE_URL_KEY]);
  const savedToken = result[NEXPATH_TOKEN_KEY];
  const savedBase = result[NEXPATH_BASE_URL_KEY];
  if (typeof savedBase === 'string' && savedBase.length > 0) {
    storedBaseUrl = savedBase;
    if (baseUrlInput) baseUrlInput.value = savedBase;
  }
  const hasToken = typeof savedToken === 'string' && savedToken.length > 0;
  if (hasToken) {
    tokenInput.value = savedToken as string;
    setTokenStatus('Token saved — click Test to validate', '');
  }
}

tokenSaveBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) { setTokenStatus('Please enter a token', 'err'); return; }
  if (!isValidNexpathTokenShape(token)) {
    setTokenStatus('Token must look like npk_…', 'err');
    return;
  }
  try {
    const payload: Record<string, string> = { [NEXPATH_TOKEN_KEY]: token };
    if (baseUrlInput) payload[NEXPATH_BASE_URL_KEY] = baseUrlInput.value.trim();
    await browser.storage.local.set(payload);
    setTokenStatus('Saved — click Test to validate', '');
    await renderSelfCheck();
  } catch (err) {
    setTokenStatus(`Save failed: ${String(err)}`, 'err');
  }
});

// Validates against the service's own identity endpoint (`GET <base>/me`) —
// a real bearer-authenticated call, the token-mode analogue of the OpenAI
// key's GET /v1/models probe above.
tokenTestBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) { setTokenStatus('Enter a token first', 'err'); return; }
  if (!isValidNexpathTokenShape(token)) {
    setTokenStatus('Token must look like npk_…', 'err');
    return;
  }

  setTokenStatus('Validating…', '');
  tokenTestBtn.disabled = true;

  try {
    const resp = await fetch(`${serviceBaseUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (resp.ok) {
      const payload: Record<string, string> = { [NEXPATH_TOKEN_KEY]: token };
      if (baseUrlInput) payload[NEXPATH_BASE_URL_KEY] = baseUrlInput.value.trim();
      await browser.storage.local.set(payload);
      setTokenStatus('Token valid ✅', 'ok');
      } else if (resp.status === 401) {
      setTokenStatus('Invalid token ❌ — regenerate it on your account page', 'err');
    } else {
      setTokenStatus(`Service returned ${resp.status} — try again`, 'err');
    }
  } catch {
    setTokenStatus('Network error — check your connection and try again', 'err');
  } finally {
    tokenTestBtn.disabled = false;
    await renderSelfCheck();
  }
});

// ── Project role persistence ──────────────────────────────────────────────────

async function loadRole(): Promise<void> {
  const result = await browser.storage.local.get([ROLE_KEY]);
  const role = typeof result[ROLE_KEY] === 'string' ? result[ROLE_KEY] as string : DEFAULT_ROLE;

  buildRadioGroup(roleGroup, 'role', ROLE_OPTIONS, role, async (value) => {
    await browser.storage.local.set({ [ROLE_KEY]: value });
    await renderSelfCheck();
  });
}

function setKeyStatus(msg: string, kind: 'ok' | 'err' | ''): void {
  keyStatus.textContent = msg;
  keyStatus.className = `status ${kind}`;
}

saveBtn.addEventListener('click', async () => {
  const key = input.value.trim();
  if (!key) { setKeyStatus('Please enter a key', 'err'); return; }
  if (!key.startsWith('sk-')) { setKeyStatus('Key must start with sk-', 'err'); return; }
  try {
    await browser.storage.local.set({ [KEY_NAME]: key });
    setKeyStatus('Saved — click Test to validate', '');
    await renderSelfCheck();
  } catch (err) {
    setKeyStatus(`Save failed: ${String(err)}`, 'err');
  }
});

// ── Key validation (real OpenAI call via GET /v1/models) ─────────────────────

testBtn.addEventListener('click', async () => {
  const key = input.value.trim();
  if (!key) { setKeyStatus('Enter a key first', 'err'); return; }

  setKeyStatus('Validating…', '');
  testBtn.disabled = true;

  try {
    const resp = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (resp.ok) {
      await browser.storage.local.set({ [KEY_NAME]: key });
      setKeyStatus('Key valid ✅', 'ok');
    } else if (resp.status === 401) {
      setKeyStatus('Invalid key ❌ — check and re-enter', 'err');
    } else {
      setKeyStatus(`OpenAI returned ${resp.status} — try again`, 'err');
    }
  } catch {
    setKeyStatus('Network error — check connection', 'err');
  } finally {
    testBtn.disabled = false;
    await renderSelfCheck();
  }
});

// ── Self-check panel ──────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderSelfCheck(): Promise<void> {
  const result = await browser.storage.local.get([KEY_NAME, ROLE_KEY, NEXPATH_TOKEN_KEY]);
  const hasKey = typeof result[KEY_NAME] === 'string' && (result[KEY_NAME] as string).length > 0;
  const hasToken =
    typeof result[NEXPATH_TOKEN_KEY] === 'string' && (result[NEXPATH_TOKEN_KEY] as string).length > 0;

  const roleValue = typeof result[ROLE_KEY] === 'string' ? result[ROLE_KEY] as string : DEFAULT_ROLE;
  const roleLabel = ROLE_OPTIONS.find((o) => o.value === roleValue)?.label ?? roleValue;

  // The effective credential, mirroring llm-credentials.ts's resolution order:
  // own OpenAI key wins, then the Nexpath token, else nothing runs.
  const route = hasKey
    ? 'OpenAI — your API key'
    : hasToken
      ? 'Nexpath service — token'
      : 'Not configured ❌';

  checkEl.innerHTML = `
    <div class="check-row">
      <span class="check-label">API key</span>
      <span class="check-val ${hasKey ? 'ok' : hasToken ? '' : 'err'}">${hasKey ? 'Saved ✅' : 'Not set'}</span>
    </div>
    <div class="check-row">
      <span class="check-label">Nexpath token</span>
      <span class="check-val ${hasToken ? 'ok' : ''}">${hasToken ? 'Saved ✅' : 'Not set'}</span>
    </div>
    <div class="check-row">
      <span class="check-label">LLM route</span>
      <span class="check-val ${hasKey || hasToken ? 'ok' : 'err'}">${route}</span>
    </div>
    <div class="check-row">
      <span class="check-label">Project role</span>
      <span class="check-val ok">${escHtml(roleLabel)}</span>
    </div>
    <div class="check-row">
      <span class="check-label">Capture sites</span>
      <span class="check-val ok">Replit · Lovable · Bolt ✅</span>
    </div>
  `;
}

// Fire-and-forget page init: surface a load failure to the user rather than letting it
// become a silent unhandled promise rejection (storage / invalidated-extension-context
// errors). Nothing awaits this, so without the .catch() a failure vanishes with the page
// left half-rendered and no explanation.
void loadKey().catch((err) => setKeyStatus(`Couldn't load saved settings: ${String(err)}`, 'err'));

// Live-refresh: the popup's Alt+Shift+T chooser writes the SAME global keys this page
// shows — without this listener the page displayed stale values until a manual
// reload, which read as "the chooser and the settings are two different settings"
// (user report, 2026-07-10). storage.onChanged re-renders on any relevant write.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (ROLE_KEY in changes || KEY_NAME in changes) {
    // Same fire-and-forget hardening as the init call above: a refresh failure surfaces
    // to the user instead of becoming a silent unhandled rejection.
    void Promise.all([loadRole(), renderSelfCheck()])
      .catch((err) => setKeyStatus(`Couldn't refresh settings: ${String(err)}`, 'err'));
  }
});
