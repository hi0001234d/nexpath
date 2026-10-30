# CLAUDE HANDOFF: Feature 1 — Context Engineering

> **Purpose**: This document is a complete handoff packet for **Claude** (Claude Code CLI or Claude Web). It contains everything needed to understand the project status, locked architectural contracts, native Nexpath integrations, and immediate next steps without needing to re-read the entire chat history.

---

## 📌 1. Project Overview & Working Directory

* **Active Codebase Path:** `/media/dhruv/newDisk/yagnik/PRODUCTION` (cloned on `main` at `v0.1.58`).
* **Target Development Folder:** `/media/dhruv/newDisk/yagnik/PRODUCTION/src/context-engineering/`.
* **Historical / Spec Folder:** `/media/dhruv/newDisk/yagnik/Feature 1/` (Read-only reference; do NOT modify `spec.md` or `implementation.md`).
* **Feature Goal:** Automatically capture, organize, and inject workspace memory (architectural decisions, conventions, superseded choices) into coding prompts so LLM agents act like they remember previous work.

---

## 🔒 2. Locked External Contracts (100% Finalized — Do Not Change)

All four external boundaries have been negotiated and locked:

### A. Feature 3 / Bhavnesh (BHA) — Dynamic Inference Router (M8)
* **Pre-Routing:** `POST /f3/v1/resource` asks whether to run inference on `local` (LAN GPU) or `pro` (ParseOS Cloud).
  - Uses only request metadata (facts/tags/tokens), **zero raw prompt text sent**.
  - **SLA:** 1,000ms hard timeout.
  - **Fail-Open:** On timeout or error, silently fall back to `pro`.
  - **Payload Structure:** Response is symmetric (`lanDevice` and `pro` keys always present; the unselected is `null`).
  - **Cache:** Decisions cached locally for 30 seconds.
* **Post-Routing Telemetry:** `POST /f3/v1/resource-result` reports completion latency and fallback stats.
  - `failType` is mandatory whenever `ok: false` or `fellBackToPro: true` (`LOCAL_TIMEOUT` | `LOCAL_ERROR` | `CONNECT_FAILED` | `BAD_OUTPUT` | `PRO_ERROR`). Null only on clean success (`ok: true, fellBackToPro: false`).

### B. Feature 6 Team — Transparent Ollama Host
* When `target === "local"`, calls are sent through the Desktop Runtime's Iroh peer bridge (`iroh-ollama-proxy/0`).
* Standard OpenAI `/v1/chat/completions` schema with `model = lanDevice.model` passed verbatim (`<model>:<size>`).
* Zero cloud leakage guaranteed by direct P2P Iroh tunnel.

### C. Desktop Runtime Lead (Ved) — Desktop Mode & Delivered Payload
* **Pro Execution:** Direct `fetch` dispatch to `https://parseos.tech/v1/chat/completions` with:
  - `Authorization: Bearer <deviceToken>` (`npd_...`)
  - `X-Device-Id: <deviceId>`
* **Cancel Toast:** 6-second Cancel Toast (`CANCEL_TOAST`, duration `6000ms`) with diff comparison drawer when `isEnhanced: true`. Immediate 0ms bypass when `isEnhanced: false`.
* **7-Field Delivered Payload Schema:**
  ```ts
  export interface EnhancementResult {
    isEnhanced: boolean;
    enhancedPrompt: string;
    stage: 'stage1' | 'stage2' | 'stage3' | 'fallback';
    stageConfidence: number;
    injectedContextTags: string[];
    contextTokenEstimate: number;
    processingTimeMs: number;
  }
  ```

### D. Open-Source CLI Pro Dispatch
* Thin client dispatch directly to `https://parseos.tech/v1/chat/completions` using Bearer `npk_...` token. Zero Desktop App dependency required for terminal users.

---

## 🧩 3. The 8 Reused Native Nexpath Subsystems (Zero Bloat Policy)

Feature 1 does **NOT** build redundant infrastructure. It directly imports and reuses existing Nexpath modules:

1. **SQLite Database Engine (`src/store/db.ts` & `src/store/schema.ts`):**
   - Pure `sql.js` (WebAssembly SQLite) with file-locking (`.lock`) and `:memory:` mode.
   - Storage file: `~/.nexpath/prompt-store.db`.
   - Feature 1 tables (`context_memory` and `delivered_items`) live directly in this database.
   - Zero native compilation/`node-gyp` needed.
2. **Auth & Tokens (`src/config/NexpathTokenStore.ts`):**
   - Automatically reads `npk_...` and `npd_...` tokens from OS Keychain (`cross-keychain`) or `~/.nexpath/config.json` via `readNexpathToken()`.
3. **HTTP Attribution Headers (`src/config/nexpath-client-headers.ts`):**
   - Supplies `X-Nexpath-Client: 'cli'` and surface tracking headers for all outbound requests.
4. **Secret Redaction (`src/store/redact.ts`):**
   - Pre-built regex engine redacting `sk-...`, `npk_...`, `ghp_...`, Bearer tokens, and PEM keys before saving to DB or sending to models.
5. **Workspace Project Registry (`src/store/projects.ts`):**
   - Uses `ProjectRecord` (`project_root`, `language`, `detected_language`) to align workspace identity.
6. **Environment Facts & Framework Probes (`src/env/framework-fingerprints.ts` & `src/env/env-probe.ts`):**
   - Probes OS, WSL, Docker, and frameworks (React, Vite, Node, Python, Next.js) for contextual prompt grounding.
7. **Fail-Safe Logger (`src/logger.ts`):**
   - Structured logger appending to `~/.nexpath/nexpath.log` (5 MB rotation) with a strict "never throws" design.
8. **Process Cleanup Helper (`src/utils/kill-tree.ts`):**
   - Process tree termination for probe and network timeouts.

---

## 📁 4. Target Architecture for `src/context-engineering/`

```
/media/dhruv/newDisk/yagnik/PRODUCTION/src/context-engineering/
├── types/
│   └── context-engineering.ts         # TypeScript contracts (WorkspaceContext, F3 Router, Local LLM, EnhancementResult)
├── store/
│   ├── context-schema.ts              # Table DDL for context_memory & delivered_items (using sql.js Store)
│   ├── historical-map-store.ts        # CRUD, superseded_by chaining, queries
│   └── historical-map-store.test.ts   # In-memory (:memory:) unit tests
├── core/
│   ├── project-scope.ts               # Workspace path normalization & project mapping
│   └── project-scope.test.ts          # Path resolution unit tests
└── index.ts                           # Public API exports
```

### Table Definitions Required:
* **`context_memory`**:
  - `id` (INTEGER PRIMARY KEY)
  - `project_root` (TEXT)
  - `kind` (TEXT: 'decision' | 'convention' | 'constraint' | 'pattern')
  - `key` (TEXT)
  - `content` (TEXT)
  - `superseded_by` (INTEGER NULL REFERENCES context_memory(id))
  - `active` (INTEGER: 1 or 0)
  - `created_at` (INTEGER)
  - `updated_at` (INTEGER)
* **`delivered_items`**:
  - `id` (INTEGER PRIMARY KEY)
  - `project_root` (TEXT)
  - `raw_prompt` (TEXT)
  - `enhanced_prompt` (TEXT)
  - `is_enhanced` (INTEGER)
  - `stage` (TEXT)
  - `context_token_estimate` (INTEGER)
  - `processing_time_ms` (INTEGER)
  - `created_at` (INTEGER)

---

## 🚦 5. Implementation Status Across All Phases (100% COMPLETED 🟢)

- [x] **Phase 1: Foundation (Store, Schema, Project Scope)** — 22/22 unit tests passing (`phase1-foundation.test.ts`).
- [x] **Phase 2: Memory Ingestion (MemOS Adapter, Fact Capture, Decision Chaining)** — 23/23 unit tests passing (`phase2-ingestion.test.ts`).
- [x] **Phase 3: Retrieval & Selection (Sub-5ms Gap Detector, Task Classifier, 10-Line Budget Ranker)** — 26/26 unit tests passing (`phase3-retrieval.test.ts`).
- [x] **Phase 4: Output & PE Delivery (Two-Tier Section Router, Fail-Open Wrapper, Semi-E2E)** — 34/34 tests passing (18 unit in `phase4-delivery.test.ts` + 16 live integration in `phase4-e2e.test.ts`).
- [x] **Phase 5: Work-Pattern Learner (R3) & Post-Session Analysis Layer** — 12/12 unit tests passing (`phase5-learner.test.ts`).
- [x] **Phase 6: Desktop App Integration Track (Locked Architecture Flow)** — 16/16 unit tests passing (`phase6-desktop-integration.test.ts`).
- [x] **Edge Cases & Security Isolation (test-plan.md §11)** — 10/10 tests passing (`edge-cases.test.ts`).
- [x] **Official Performance Benchmarks (test-plan.md §14)** — 4/4 benchmarks passing (`benchmarks.test.ts`): BM-1 (<1.5ms median), BM-2 (<0.5ms median), BM-3 (<3ms median), BM-4 (<25ms median).

> **Overall Test Health:** **147 / 147 Feature 1 Vitest tests passing with 0 errors across 9 test files.** Full TypeScript compilation (`npm run typecheck`), production build (`npm run build`), and raw Node.js dist bundle smoke test pass cleanly. Existing native store suite passes 398/398 with zero regressions.

---

## 🔒 6. Key Operating Laws Enforced

1. **Universal Zero-UI Engine Law:**
   - Feature 1 has ZERO UI responsibility and contains ZERO UI code or dependencies.
   - Headless in-process library returning pure text payload (`enhancedPrompt`) to Ved and CLI.
2. **Clean Prompt Text Guarantee:**
   - Zero synthetic tags (`@file:...`, `@rule:...`, `@alert:...`) in `enhancedPrompt`.
   - Zero invented or speculative file paths.
3. **Fail-Open Isolation (<2,500ms hard SLA, <800ms target):**
   - On any SQLite contention, network error, router timeout, or local LLM failure, silently falls open to safe payload without crashing or blocking user workflow.
4. **Telemetry Omission (Step 4 Dropped):**
   - Zero latency overhead; post-inference telemetry is omitted.

---

## 🔗 7. Deep-Dive Links & Raw Records

If Claude needs to inspect the raw discussion or background artifacts:

1. **Full Antigravity Raw Chat Transcript:**  
   `/home/dhruv/.gemini/antigravity-cli/brain/9870f4e7-5f49-4639-8570-ac357b3b73bb/.system_generated/logs/transcript.jsonl`
2. **Native Integrations Specification:**  
   `/home/dhruv/.gemini/antigravity-cli/brain/9870f4e7-5f49-4639-8570-ac357b3b73bb/Nexpath-Native-Integrations.md`
3. **Comprehensive Feature 1 Progress Report:**  
   `/home/dhruv/.gemini/antigravity-cli/brain/9870f4e7-5f49-4639-8570-ac357b3b73bb/Feature1-Progress-Report.md`
4. **Original Feature 1 Architecture & Spec:**  
   `/media/dhruv/newDisk/yagnik/Feature 1/spec.md`  
   `/media/dhruv/newDisk/yagnik/Feature 1/CONTEXT-ENGINE-HANDOFF.md`  
   `/media/dhruv/newDisk/yagnik/Feature 1/devplan.md`
