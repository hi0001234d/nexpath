/**
 * UI Mock Harness — development-only.
 *
 * Loads a fixture advisory payload and mounts the panel in a real browser tab
 * so UI developers can iterate without needing the full extension pipeline.
 *
 * Usage: serve this file with any static dev server (e.g. `vite`, `npx serve`).
 * The panel module must be built first:
 *   npm run build:ui        (outputs dist/ui.js exporting mountNexpathPanel)
 *
 * Fixture files live in ./fixtures/*.json — edit them to test different states.
 */

import type { AdvisoryPayload, PanelEvent, MountNexpathPanel } from '../ui-contract.js';

// ── Fixture loader ─────────────────────────────────────────────────────────────

const FIXTURE_NAMES = [
  'stage-transition-prd',
  'absence-test-creation',
  'absence-spec-before-code',
  'beginner-profile',
  'hardcore-pro-profile',
  'frustrated-mood',
] as const;

type FixtureName = typeof FIXTURE_NAMES[number];

async function loadFixture(name: FixtureName): Promise<AdvisoryPayload> {
  const res = await fetch(`./fixtures/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load fixture: ${name}`);
  return res.json() as Promise<AdvisoryPayload>;
}

// ── Harness bootstrap ─────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Load the UI module dynamically — built output must be available at ./ui.js
  const uiModule = await import('../../../ext-browser/ui/ui.js' as string) as { mountNexpathPanel: MountNexpathPanel };
  const { mountNexpathPanel } = uiModule;

  const params    = new URLSearchParams(window.location.search);
  const fixtureName = (params.get('fixture') ?? 'stage-transition-prd') as FixtureName;

  const payload = await loadFixture(fixtureName);

  const root = document.getElementById('nexpath-harness-root');
  if (!root) throw new Error('Missing #nexpath-harness-root element in HTML');

  // ── Event log ────────────────────────────────────────────────────────────────
  const eventLog = document.getElementById('nexpath-harness-log');
  function logEvent(event: PanelEvent): void {
    const entry = document.createElement('pre');
    entry.textContent = JSON.stringify(event, null, 2);
    eventLog?.prepend(entry);

    if (event.type === 'select') {
      console.log('[nexpath harness] select:', event.optionId, event.body);
    } else {
      console.log('[nexpath harness] event:', event.type);
    }
  }

  // ── Mount + show — mountNexpathPanel takes only { onEvent }; show(payload) is a
  // separate call, since the real engine calls mount() once per content-script
  // lifetime and show() again on every subsequent advisory. ──────────────────────
  const controller = mountNexpathPanel(root, { onEvent: logEvent });
  controller.show(payload);
  console.log('[nexpath harness] panel mounted + shown. fixture:', fixtureName);
  console.log('[nexpath harness] payload:', payload);

  // Expose controls on window for manual testing in devtools, and wire the
  // "Simulate setBusy/hide" buttons the brief promises the harness has.
  (window as unknown as Record<string, unknown>)['nexpathController'] = controller;

  document.getElementById('nexpath-harness-busy-on')?.addEventListener('click', () => {
    controller.setBusy(true);
    console.log('[nexpath harness] setBusy(true)');
  });
  document.getElementById('nexpath-harness-busy-off')?.addEventListener('click', () => {
    controller.setBusy(false);
    console.log('[nexpath harness] setBusy(false)');
  });
  document.getElementById('nexpath-harness-hide')?.addEventListener('click', () => {
    controller.hide();
    console.log('[nexpath harness] hide()');
  });
}

bootstrap().catch((err: unknown) => {
  console.error('[nexpath harness] bootstrap failed:', err);
});
