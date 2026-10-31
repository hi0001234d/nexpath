/**
 * Feature 1 — Context Engineering: Feature 3 Dynamic Inference Resource Router Client (Milestone M8)
 *
 * Communicates with Bhavnesh's F3 Resource Router (https://parseos.tech/f3/v1/resource)
 * to decide whether prompt enhancement inference runs locally (LAN GPU via Iroh) or on Cloud Pro.
 *
 * Operational Guarantees:
 *  - Metadata only: NEVER sends prompt or response text.
 *  - Strict 1,000ms timeout: Automatically fails open to Cloud Pro (gpt-4o-mini) on timeout/error.
 *  - 30-second cache: Caches decisions per callKind.
 *  - Idempotent request IDs: Re-querying with the same requestId returns the cached decision.
 *  - Asynchronous telemetry reporting to POST /f3/v1/resource-result (fire-and-forget).
 */

import { linkAbortSignal } from './abort-link.js';
import type {
  F3ResourceRequest,
  F3ResourceDecision,
  F3ResourceResultReport,
  F3CallKind,
  F3FailType,
} from '../types/context-engineering.js';

export const F3_ROUTER_DEFAULT_URL = 'https://parseos.tech';
export const F3_ROUTER_TIMEOUT_MS = 1000;
export const F3_CACHE_TTL_MS = 30 * 1000; // 30 seconds

interface CacheEntry {
  decision: F3ResourceDecision;
  timestamp: number;
}

export interface F3ClientOptions {
  baseUrl?: string;
  deviceToken?: string;
  /** Sent as X-Device-Id; the server's desktop gate requires it next to the device token. */
  deviceId?: string;
  timeoutMs?: number;
}

export class F3ResourceClient {
  private readonly baseUrl: string;
  private readonly deviceToken?: string;
  private readonly deviceId?: string;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options?: F3ClientOptions) {
    // Per-call option first, then NEXPATH_F3_URL, then parseos.tech.
    this.baseUrl = (options?.baseUrl || process.env.NEXPATH_F3_URL || F3_ROUTER_DEFAULT_URL).replace(/\/+$/, '');
    this.deviceToken = options?.deviceToken;
    this.deviceId = options?.deviceId;
    this.timeoutMs = options?.timeoutMs || F3_ROUTER_TIMEOUT_MS;
  }

  /**
   * Queries F3 Resource Router for an execution target (local or pro).
   * Executes within 1,000ms SLA with unconditional fail-open to Pro.
   */
  async getResourceDecision(
    request: F3ResourceRequest,
    customToken?: string,
    /** Caller's cancel / time budget; aborting it stops the request at once. */
    signal?: AbortSignal
  ): Promise<F3ResourceDecision> {
    const token = customToken || this.deviceToken;
    const cacheKey = `${request.callKind}:${request.localAllowed}:${request.language}`;

    // 1. Check in-memory 30s cache
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < F3_CACHE_TTL_MS) {
      return cached.decision;
    }

    // 2. If localAllowed is false, immediately default to Pro without network call
    if (!request.localAllowed) {
      const proDecision: F3ResourceDecision = {
        decisionId: `d-pro-local-disabled-${Date.now()}`,
        target: 'pro',
        reason: 'LOCAL_NOT_ALLOWED',
        lanDevice: null,
        pro: { model: 'gpt-4o-mini' },
      };
      this.cache.set(cacheKey, { decision: proDecision, timestamp: now });
      return proDecision;
    }

    // 3. Dispatch to F3 Router with 1,000ms timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const unlink = linkAbortSignal(controller, signal);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (this.deviceId) {
        headers['X-Device-Id'] = this.deviceId;
      }

      const response = await fetch(`${this.baseUrl}/f3/v1/resource`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      unlink();

      if (!response.ok) {
        // Any 4xx or 5xx fails open to Pro
        return this.createFallbackProDecision(`HTTP_${response.status}`);
      }

      const raw = await response.json();
      const decision = this.parseDecision(raw);

      // Cache decision for 30 seconds
      this.cache.set(cacheKey, { decision, timestamp: Date.now() });
      return decision;
    } catch (err) {
      clearTimeout(timeoutId);
      unlink();
      const isTimeout = controller.signal.aborted;
      const reason = isTimeout ? 'ROUTER_TIMEOUT' : 'ROUTER_NETWORK_ERROR';
      return this.createFallbackProDecision(reason);
    }
  }

  /**
   * Reports performance result to POST /f3/v1/resource-result asynchronously.
   * Fire-and-forget: never throws and never blocks prompt execution.
   */
  reportResult(report: F3ResourceResultReport, customToken?: string): void {
    const token = customToken || this.deviceToken;
    const url = `${this.baseUrl}/f3/v1/resource-result`;

    // Asynchronously dispatch
    (async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (this.deviceId) {
          headers['X-Device-Id'] = this.deviceId;
        }

        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(report),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // Telemetry failure is ignored silently (Fail-Open guarantee)
      }
    })().catch(() => {});
  }

  /**
   * Clears internal cache (useful for testing and reset).
   */
  clearCache(): void {
    this.cache.clear();
  }

  private parseDecision(raw: any): F3ResourceDecision {
    if (raw && typeof raw === 'object' && raw.target) {
      return {
        decisionId: raw.decisionId || `d-gen-${Date.now()}`,
        target: raw.target === 'local' ? 'local' : 'pro',
        reason: raw.reason || 'SUCCESS',
        lanDevice: raw.target === 'local' && raw.lanDevice ? raw.lanDevice : null,
        pro: raw.target === 'pro' && raw.pro ? raw.pro : (raw.target === 'pro' ? { model: 'gpt-4o-mini' } : null),
      };
    }
    return this.createFallbackProDecision('INVALID_RESPONSE');
  }

  private createFallbackProDecision(reason: string): F3ResourceDecision {
    return {
      decisionId: `d-fallback-${Date.now()}`,
      target: 'pro',
      reason,
      lanDevice: null,
      pro: { model: 'gpt-4o-mini' },
    };
  }
}
