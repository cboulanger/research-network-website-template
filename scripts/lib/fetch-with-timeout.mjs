// fetch() that gives up after `timeoutMs` instead of Node's much longer
// defaults (up to 300s waiting for a stalled server), so a hanging remote
// fails the build quickly with a clear message.
export async function fetchWithTimeout(url, options = {}, { timeoutMs, fetchImpl = globalThis.fetch } = {}) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

export function timeoutFromEnv(name, fallbackMs) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallbackMs;
}
