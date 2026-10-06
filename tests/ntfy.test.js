import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITABLE_TYPES, NTFY_MAX_BYTES, buildEnvelope, envelopeBytes, checkEnvelope, ntfyUrl, postEnvelope,
} from '../assets/js/ntfy.js';

const now = new Date('2026-10-06T12:00:00Z');

test('buildEnvelope sets version and timestamp and omits unset id/base', () => {
  const env = buildEnvelope({ type: 'members', op: 'add', data: { firstname: 'A' }, now });
  assert.deepEqual(env, { v: 1, type: 'members', op: 'add', data: { firstname: 'A' }, ts: '2026-10-06T12:00:00.000Z' });
  const upd = buildEnvelope({ type: 'events', op: 'update', id: 3, data: {}, base: { title: 'x' }, now });
  assert.equal(upd.id, '3');
  assert.deepEqual(upd.base, { title: 'x' });
});

test('checkEnvelope accepts valid envelopes and rejects malformed ones', () => {
  assert.equal(EDITABLE_TYPES.join(), 'members,projects,events,news');
  const ok = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  assert.equal(checkEnvelope(ok).ok, true);
  const bad = [
    null, [], { ...ok, v: 2 }, { ...ok, type: 'site' }, { ...ok, op: 'delete' },
    { ...ok, data: [] }, { ...ok, ts: 5 },
    { ...ok, op: 'update' },                                  // update needs an id
    { ...ok, op: 'update', id: 'x', base: 'nope' },           // base must be an object
  ];
  for (const value of bad) assert.equal(checkEnvelope(value).ok, false, JSON.stringify(value));
});

test('ntfyUrl joins server and topic without double slashes', () => {
  assert.equal(ntfyUrl({ topic: 'abc' }), 'https://ntfy.sh/abc');
  assert.equal(ntfyUrl({ server: 'https://ntfy.example.org/', topic: 'a_b' }), 'https://ntfy.example.org/a_b');
});

test('postEnvelope POSTs the JSON body with no custom headers', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const envelope = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  await postEnvelope({ server: 'https://ntfy.sh', topic: 'abc', envelope, fetchFn });
  assert.equal(calls[0].url, 'https://ntfy.sh/abc');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, JSON.stringify(envelope));
  assert.equal(calls[0].init.headers, undefined);
});

test('postEnvelope rejects oversized payloads before any request and reports HTTP errors', async () => {
  let called = false;
  const fetchFn = async () => { called = true; return { ok: false, status: 429 }; };
  const big = buildEnvelope({ type: 'news', op: 'add', data: { title: 'x'.repeat(NTFY_MAX_BYTES) }, now });
  assert.ok(envelopeBytes(big) > NTFY_MAX_BYTES);
  await assert.rejects(postEnvelope({ topic: 'abc', envelope: big, fetchFn }), /too large/i);
  assert.equal(called, false);
  const small = buildEnvelope({ type: 'news', op: 'add', data: { title: 't' }, now });
  await assert.rejects(postEnvelope({ topic: 'abc', envelope: small, fetchFn }), /HTTP 429/);
});
