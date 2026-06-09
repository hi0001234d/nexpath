// Adapter registrations live here as side-effect imports.
// Each adapter module calls registerAdapter() at module load.
//
// Subsequent milestones add CLI-wrap (Codex CLI + Aider) and browser
// adapters (Replit / Bolt.new / Lovable / ChatGPT).
import './adapters/claude-code.js';
import './adapters/cursor.js';
import './adapters/windsurf.js';
