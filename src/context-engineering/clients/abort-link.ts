/**
 * Aborts `controller` when `outer` aborts, so a caller's cancel or time budget
 * stops an in-flight request. Returns a cleanup that removes the listener.
 * (Node 18 has no AbortSignal.any, which the package still supports.)
 */
export function linkAbortSignal(controller: AbortController, outer?: AbortSignal): () => void {
  if (!outer) return () => {};
  if (outer.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  outer.addEventListener('abort', onAbort, { once: true });
  return () => outer.removeEventListener('abort', onAbort);
}

/**
 * Resolves like `promise`, but rejects as soon as `signal` aborts — so a call that
 * ignores the signal (e.g. a caller-supplied client) still cannot hold the budget.
 */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}
