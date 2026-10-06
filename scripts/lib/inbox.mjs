// Collects public submissions from the ntfy topic for review in the editor.
// Messages are validated against the public (submission) schema and kept as
// "pending" in a local state file until the reviewer accepts or rejects them,
// so they survive ntfy's short message retention.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { EDITABLE_TYPES, checkEnvelope, ntfyUrl } from '../../assets/js/ntfy.js';
import { pickPrivateRecord, stripPrivateRecord, toSubmissionSchema } from '../../assets/js/private-fields.js';

export function parseNtfyPoll(text) {
  const messages = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.event === 'message' && typeof entry.id === 'string' && typeof entry.message === 'string') {
      messages.push({ id: entry.id, time: entry.time, message: entry.message });
    }
  }
  return messages;
}

export async function pollNtfy({ server, topic, since, fetchFn = globalThis.fetch }) {
  const url = `${ntfyUrl({ server, topic })}/json?poll=1&since=${encodeURIComponent(since || 'all')}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`ntfy responded with HTTP ${res.status}`);
  return parseNtfyPoll(await res.text());
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function diffRecords(from, to) {
  const fields = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return fields
    .filter((f) => stableStringify(from[f]) !== stableStringify(to[f]))
    .map((f) => ({ field: f, from: from[f] ?? null, to: to[f] ?? null }));
}

export function createInbox({ statePath, config, types, loadRecords, fetchFn }) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addKeyword('x-editor');
  const byName = new Map(
    types
      .filter((t) => t.kind === 'array' && EDITABLE_TYPES.includes(t.name))
      .map((t) => [t.name, { ...t, validate: ajv.compile(toSubmissionSchema(t.schema).items) }])
  );

  const emptyState = () => ({ lastId: null, pending: {}, resolved: [] });
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  // A damaged state file must not take the inbox down, nor be silently
  // destroyed: move it aside and start from an empty state.
  async function quarantine() {
    await rename(statePath, `${statePath}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    return emptyState();
  }

  async function readState() {
    let text;
    try {
      text = await readFile(statePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return emptyState();
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      if (err instanceof SyntaxError) return quarantine();
      throw err;
    }
    if (!isPlainObject(parsed) || !isPlainObject(parsed.pending ?? {}) || !Array.isArray(parsed.resolved ?? [])) {
      return quarantine();
    }
    return { ...emptyState(), ...parsed };
  }

  async function writeState(state) {
    await mkdir(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
    await rename(tmp, statePath);
  }

  // Schema-valid is not enough: the id rules keep a submission from addressing
  // a different record than the one it claims to change.
  function acceptable(envelope) {
    const type = byName.get(envelope.type);
    if (!type || !type.validate(envelope.data)) return false;
    if (type.keyField) {
      return envelope.op === 'add' ? !(type.keyField in envelope.data) : envelope.data[type.keyField] === envelope.id;
    }
    return envelope.op === 'add' || envelope.base !== undefined;
  }

  async function refresh() {
    const state = await readState();
    const messages = await pollNtfy({ ...config, since: state.lastId, fetchFn });
    let dropped = 0;
    for (const m of messages) {
      state.lastId = m.id;
      if (Object.hasOwn(state.pending, m.id) || state.resolved.includes(m.id)) continue;
      let parsed;
      try {
        parsed = JSON.parse(m.message);
      } catch {
        dropped += 1;
        continue;
      }
      const checked = checkEnvelope(parsed);
      if (!checked.ok || !acceptable(checked.envelope)) {
        dropped += 1;
        continue;
      }
      state.pending[m.id] = { id: m.id, time: m.time, envelope: checked.envelope };
    }
    await writeState(state);
    return { dropped };
  }

  function locate(type, envelope, records) {
    if (type.keyField) {
      const record = records.find((r) => r[type.keyField] === envelope.id);
      return record ? { record, key: envelope.id } : null;
    }
    const wanted = stableStringify(envelope.base);
    const index = records.findIndex((r) => stableStringify(stripPrivateRecord(type.schema, r)) === wanted);
    return index === -1 ? null : { record: records[index], key: String(index) };
  }

  function describe(pending, type, records) {
    const { envelope } = pending;
    const entry = { id: pending.id, time: pending.time, type: envelope.type, op: envelope.op, data: envelope.data };
    if (envelope.op === 'add') return { ...entry, key: null, stale: false, changes: null, prefill: envelope.data };
    const found = locate(type, envelope, records);
    if (!found) return { ...entry, key: null, stale: true, changes: null, prefill: envelope.data };
    return {
      ...entry,
      key: found.key,
      stale: false,
      changes: diffRecords(stripPrivateRecord(type.schema, found.record), envelope.data),
      prefill: { ...pickPrivateRecord(type.schema, found.record), ...envelope.data },
    };
  }

  async function list() {
    const state = await readState();
    const cache = new Map();
    const entries = [];
    for (const pending of Object.values(state.pending).sort((a, b) => a.time - b.time)) {
      const type = byName.get(pending.envelope.type);
      if (!type) continue;
      if (!cache.has(type.name)) cache.set(type.name, await loadRecords(type.name));
      entries.push(describe(pending, type, cache.get(type.name)));
    }
    return entries;
  }

  async function resolve(id) {
    const state = await readState();
    if (!Object.hasOwn(state.pending, id)) return false;
    delete state.pending[id];
    state.resolved = [...state.resolved, id].slice(-1000);
    await writeState(state);
    return true;
  }

  // One operation at a time: they all read-modify-write the state file.
  let queue = Promise.resolve();
  const serialized = (fn) => (...args) => {
    const run = queue.then(() => fn(...args));
    queue = run.catch(() => {});
    return run;
  };
  return { refresh: serialized(refresh), list: serialized(list), resolve: serialized(resolve) };
}
