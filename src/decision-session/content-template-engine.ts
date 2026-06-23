/**
 * ContentTemplateEngine — owns the good-pattern-present polarity. It composes
 * personalised decision-session content (the two-channel option / why-desc model
 * plus per-user generated templates).
 *
 * Layer B defines this engine's identity + routing here. Its `run()` INTERNALS
 * (the composition + cascade over the content-template records) are authored at
 * the content-template layer; the engine ships dark until then, so `run()` throws
 * a clear not-yet-implemented error rather than returning placeholder content.
 */

import type { Engine, ContentSpec } from './engine-registry.js';

export const contentTemplateEngine: Engine = {
  name: 'content-template',
  accepts: (polarity) => polarity === 'good_present',
  run: (): ContentSpec => {
    throw new Error(
      'ContentTemplateEngine.run() is implemented at the content-template layer (composition not yet built)',
    );
  },
};
