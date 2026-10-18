// fetch() that gives up after `timeoutMs` instead of Node's much longer
// defaults (up to 300s waiting for a stalled server), so a hanging remote
// fails the build quickly with a clear message.
// Errors thrown here carry a `shortMessage` (e.g. "Timeout Error") alongside the
// detailed `message`, so callers can show the short form to users while logging
// the full detail (which includes the request URL) to a console/log instead.
export async function fetchWithTimeout(url, options = {}, { timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      const wrapped = new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s`, { cause: err });
      wrapped.shortMessage = 'Timeout Error';
      throw wrapped;
    }
    if (err?.message === 'fetch failed' && err.cause) {
      const cause = err.cause;
      const wrapped = new Error(`Request to ${url} failed: ${cause.code ? `${cause.code} ` : ''}${cause.message}`, {
        cause: err,
      });
      wrapped.shortMessage = /timeout/i.test(cause.code || cause.message || '') ? 'Timeout Error' : 'Connection Error';
      throw wrapped;
    }
    throw err;
  }
}

export function timeoutFromEnv(name, fallbackMs) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallbackMs;
}
