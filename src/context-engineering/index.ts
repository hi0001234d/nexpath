/**
 * Feature 1 — Context Engineering
 * Public Module API
 */

// Types & Contracts
export * from './types/context-engineering.js';

// Project Scoping
export * from './core/project-scope.js';

// Historical Map & Delivered Items Store
export * from './store/historical-map-store.js';

// Shared SQLite store (~/.nexpath/prompt-store.db): the desktop runtime opens it
// once and passes it to every call, so CLI and desktop share one memory.
export { openStore, closeStore, type Store } from '../store/db.js';

// Adapters
export * from './adapters/memos-adapter.js';

// Ingestion Pipeline (Path A)
export * from './ingestion/fact-extractor.js';
export * from './ingestion/decision-chainer.js';
export * from './ingestion/git-diff-annotator.js';
export * from './ingestion/stop-capture.js';

// Retrieval & Selection Pipeline (Path B)
export * from './retrieval/gap-detector.js';
export * from './retrieval/task-classifier.js';
export * from './retrieval/budget-ranker.js';

// Delivery & Output Layer (Phase 4 / VED Contract)
export * from './delivery/section-router.js';
export * from './delivery/tag-generator.js';
export * from './delivery/fail-open.js';
export * from './delivery/prompt-enhancer.js';

// Clients (F3 Dynamic Router & F6 Local LLM Bridge)
export * from './clients/f3-resource-client.js';
export * from './clients/f6-delegation-client.js';

// Learning & Post-Session Pattern Analysis (Path C / Phase 5)
export * from './learning/pattern-learner.js';
export * from './learning/post-session-handler.js';
