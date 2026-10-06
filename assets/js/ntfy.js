// Message format and transport for public submissions sent through ntfy.
export const EDITABLE_TYPES = ['members', 'projects', 'events', 'news'];
export const NTFY_MAX_BYTES = 4096; // ntfy.sh's per-message limit
export const DEFAULT_NTFY_SERVER = 'https://ntfy.sh';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function buildEnvelope({ type, op, id, data, base, now = new Date() }) {
  const envelope = { v: 1, type, op, data, ts: now.toISOString() };
  if (id !== undefined && id !== null) envelope.id = String(id);
  if (base !== undefined) envelope.base = base;
  return envelope;
}

export function envelopeBytes(envelope) {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}

// Structural check only; content is validated against the collection schema by the editor.
export function checkEnvelope(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'not an object' };
  if (value.v !== 1) return { ok: false, reason: 'unsupported version' };
  if (!EDITABLE_TYPES.includes(value.type)) return { ok: false, reason: 'unknown type' };
  if (value.op !== 'add' && value.op !== 'update') return { ok: false, reason: 'unknown op' };
  if (!isPlainObject(value.data)) return { ok: false, reason: 'data must be an object' };
  if (typeof value.ts !== 'string') return { ok: false, reason: 'missing timestamp' };
  if (value.op === 'update' && (typeof value.id !== 'string' || !value.id)) return { ok: false, reason: 'update needs an id' };
  if (value.base !== undefined && !isPlainObject(value.base)) return { ok: false, reason: 'base must be an object' };
  return { ok: true, envelope: value };
}

export function ntfyUrl({ server = DEFAULT_NTFY_SERVER, topic }) {
  return `${server.replace(/\/+$/, '')}/${encodeURIComponent(topic)}`;
}

export async function postEnvelope({ server, topic, envelope, fetchFn = globalThis.fetch }) {
  const bytes = envelopeBytes(envelope);
  if (bytes > NTFY_MAX_BYTES) {
    throw new Error(`Your submission is too large (${bytes} bytes; the limit is ${NTFY_MAX_BYTES}). Please shorten it.`);
  }
  // No custom headers: a plain text/plain POST avoids a CORS preflight.
  const res = await fetchFn(ntfyUrl({ server, topic }), { method: 'POST', body: JSON.stringify(envelope) });
  if (!res.ok) throw new Error(`Could not send your submission (HTTP ${res.status}). Please try again later.`);
}
