import { describe, it, expect } from 'vitest';
import { postEvent, DEFAULT_POSTHOG_ENDPOINT } from './TelemetryClient.js';
import { buildEnvelopes, POSTHOG_LIB_NAME, POSTHOG_LIB_VERSION } from './TelemetryBatcher.js';
import type { PostHogSingleEnvelope, TelemetryEvent } from './types.js';

const E2E_TOKEN    = process.env.E2E_POSTHOG_TOKEN;
const E2E_ENDPOINT = process.env.E2E_POSTHOG_ENDPOINT ?? DEFAULT_POSTHOG_ENDPOINT;

const runE2E = E2E_TOKEN !== undefined && E2E_TOKEN.length > 0;

describe.skipIf(!runE2E)('end-to-end against live PostHog /capture/ (gated by E2E_POSTHOG_TOKEN)', () => {
  it('sends a minimal single-event ping envelope and receives 200', async () => {
    const envelope: PostHogSingleEnvelope = {
      api_key:     E2E_TOKEN!,
      event:       'nexpath_e2e_ping',
      distinct_id: `nexpath-e2e-${Date.now()}`,
      timestamp:   new Date().toISOString(),
      properties:  {
        $lib:         POSTHOG_LIB_NAME,
        $lib_version: POSTHOG_LIB_VERSION,
        test_run:     true,
      },
    };
    const result = await postEvent(E2E_ENDPOINT, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.acceptedCount).toBe(1);
  }, 15_000);

  it('sends 3 single-event envelopes built by buildEnvelopes and each receives 200', async () => {
    const events: TelemetryEvent[] = Array.from({ length: 3 }, (_, i) => ({
      ts:             new Date().toISOString(),
      v:              1,
      installationId: `e2e-install-${Date.now()}`,
      userId:         `e2e-user-${Date.now()}`,
      teamId:         `e2e-team-${Date.now()}`,
      projectRoot:    `/tmp/nexpath-e2e/${i}`,
      event:          'prompt_received',
      promptCount:    i + 1,
    }));

    const { envelopes, consumedCount } = buildEnvelopes(events, {
      apiKey:           E2E_TOKEN!,
      hashProjectRoot:  true,
    });
    expect(envelopes).toHaveLength(3);
    expect(consumedCount).toBe(3);

    for (const env of envelopes) {
      const result = await postEvent(E2E_ENDPOINT, env);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.acceptedCount).toBe(1);
    }
  }, 30_000);
});
