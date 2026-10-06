import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getEditableTypes } from '../scripts/lib/editable-types.mjs';
import { parseNtfyPoll, diffRecords, createInbox } from '../scripts/lib/inbox.mjs';
import { buildEnvelope, postEnvelope } from '../assets/js/ntfy.js';

const types = getEditableTypes('schema');
const config = { server: 'https://ntfy.test', topic: 'topic' };

const line = (m) => JSON.stringify({
  id: m.id, time: m.time ?? 1, event: 'message', topic: 'topic',
  message: typeof m.message === 'string' ? m.message : JSON.stringify(m.message),
});
const fakeFetch = (messages, calls = []) => async (url) => {
  calls.push(url);
  return { ok: true, status: 200, text: async () => messages.map(line).join('\n') };
};
const env = (over) => buildEnvelope({ type: 'members', op: 'add', data: { lastname: 'Okoro', firstname: 'Chidi', affiliation: 'Lagos' }, ...over });

async function makeInbox(records, messages, calls) {
  const dir = await mkdtemp(path.join(tmpdir(), 'inbox-'));
  const statePath = path.join(dir, 'inbox.json');
  const inbox = createInbox({ statePath, config, types, loadRecords: async (name) => records[name] ?? [], fetchFn: fakeFetch(messages, calls) });
  return { inbox, statePath };
}

test('parseNtfyPoll keeps message events and ignores keepalives and junk lines', () => {
  const text = [
    JSON.stringify({ id: 'a', event: 'open' }), 'not json', line({ id: 'b', message: 'hi' }),
    JSON.stringify({ id: 'c', event: 'keepalive' }),
  ].join('\n');
  assert.deepEqual(parseNtfyPoll(text), [{ id: 'b', time: 1, message: 'hi' }]);
});

test('diffRecords lists changed, added and removed fields', () => {
  assert.deepEqual(diffRecords({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 }), [
    { field: 'b', from: 2, to: 5 }, { field: 'c', from: 3, to: null }, { field: 'd', from: null, to: 4 },
  ]);
});

test('refresh keeps valid envelopes, drops invalid ones, persists state and resumes from lastId', async () => {
  const calls = [];
  const messages = [
    { id: 'm1', message: env() },
    { id: 'm2', message: 'not json' },
    { id: 'm3', message: env({ data: { lastname: 'X' } }) },                       // fails schema (missing firstname, affiliation)
    { id: 'm4', message: env({ data: { lastname: 'O', firstname: 'C', affiliation: 'L', email: 'x@y.org' } }) }, // private field
    { id: 'm5', message: env({ data: { id: 'forced', lastname: 'O', firstname: 'C', affiliation: 'L' } }) },      // add must not set id
    { id: 'm6', message: { ...env(), type: 'site' } },
  ];
  const { inbox, statePath } = await makeInbox({}, messages, calls);
  assert.deepEqual(await inbox.refresh(), { dropped: 5 });
  assert.match(calls[0], /\/json\?poll=1&since=all$/);
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.deepEqual(Object.keys(state.pending), ['m1']);
  assert.equal(state.lastId, 'm6');
  await inbox.refresh();
  assert.match(calls[1], /since=m6$/);
});

test('list: keyed update shows changes and keeps private fields in the prefill', async () => {
  const records = { members: [{ id: 'adler-ada', lastname: 'Adler', firstname: 'Ada', affiliation: 'Old', email: 'ada@example.org' }] };
  const update = buildEnvelope({
    type: 'members', op: 'update', id: 'adler-ada',
    data: { id: 'adler-ada', lastname: 'Adler', firstname: 'Ada', affiliation: 'New' },
  });
  const { inbox } = await makeInbox(records, [{ id: 'u1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.key, 'adler-ada');
  assert.equal(entry.stale, false);
  assert.deepEqual(entry.changes, [{ field: 'affiliation', from: 'Old', to: 'New' }]);
  assert.equal(entry.prefill.email, 'ada@example.org');
  assert.equal(entry.prefill.affiliation, 'New');
});

test('list: update of a missing record is stale and opens as an add', async () => {
  const update = buildEnvelope({
    type: 'members', op: 'update', id: 'gone-person',
    data: { id: 'gone-person', lastname: 'G', firstname: 'P', affiliation: 'A' },
  });
  const { inbox } = await makeInbox({ members: [] }, [{ id: 'u1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.stale, true);
  assert.equal(entry.key, null);
  assert.equal(entry.changes, null);
});

test('list: records without an id are located by matching base, and keyed by array index', async () => {
  const records = { events: [{ date: '2020-01-01', title: 'a' }, { date: '2021-01-01', title: 'b' }] };
  const update = buildEnvelope({
    type: 'events', op: 'update', id: '1', base: { date: '2021-01-01', title: 'b' }, data: { date: '2021-01-01', title: 'b2' },
  });
  const { inbox } = await makeInbox(records, [{ id: 'e1', message: update }]);
  await inbox.refresh();
  const [entry] = await inbox.list();
  assert.equal(entry.key, '1');
  assert.deepEqual(entry.changes, [{ field: 'title', from: 'b', to: 'b2' }]);

  records.events[1].title = 'changed meanwhile';
  const [stale] = await inbox.list();
  assert.equal(stale.stale, true);
});

test('resolve removes an entry and it is not re-added when ntfy returns it again', async () => {
  const { inbox } = await makeInbox({}, [{ id: 'm1', message: env() }]);
  await inbox.refresh();
  assert.equal(await inbox.resolve('m1'), true);
  assert.equal(await inbox.resolve('m1'), false);
  await inbox.refresh();
  assert.deepEqual(await inbox.list(), []);
});

test('end to end against a fake ntfy server: postEnvelope -> refresh -> list', async () => {
  const stored = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { stored.push({ id: `id${stored.length + 1}`, time: 1, message: body }); res.writeHead(200).end('{}'); });
    } else {
      res.writeHead(200).end(stored.map(line).join('\n'));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = { server: `http://127.0.0.1:${server.address().port}`, topic: 'topic' };
    await postEnvelope({ ...base, envelope: env() });
    const dir = await mkdtemp(path.join(tmpdir(), 'inbox-'));
    const inbox = createInbox({ statePath: path.join(dir, 'inbox.json'), config: base, types, loadRecords: async () => [] });
    await inbox.refresh();
    const entries = await inbox.list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.lastname, 'Okoro');
  } finally {
    server.close();
  }
});
