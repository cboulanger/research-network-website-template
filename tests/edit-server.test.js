import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/edit-server.mjs';

async function startTestServer(fixture) {
  const contentPath = await mkdtemp(path.join(tmpdir(), 'edit-content-'));
  await mkdir(path.join(contentPath, 'data'), { recursive: true });
  await writeFile(path.join(contentPath, 'data', 'members.json'), JSON.stringify(fixture.members ?? []));
  await writeFile(path.join(contentPath, 'data', 'projects.json'), JSON.stringify(fixture.projects ?? []));
  await writeFile(path.join(contentPath, 'data', 'events.json'), JSON.stringify(fixture.events ?? []));
  await writeFile(path.join(contentPath, 'data', 'news.json'), JSON.stringify(fixture.news ?? []));

  const server = createServer({ contentPath, schemaDir: 'schema', editorDir: 'scripts/editor' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    contentPath,
    async close() {
      server.close();
      await rm(contentPath, { recursive: true, force: true });
    },
  };
}

test('GET /api/types lists the four array-of-items content types', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/api/types`);
    const body = await res.json();
    assert.deepEqual(body.map((t) => t.name).sort(), ['events', 'members', 'news', 'projects']);
  } finally {
    await ctx.close();
  }
});

test('GET /api/data/members returns the current member list', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 'adler-ada');
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members auto-generates an id from firstname/lastname when none is given', async () => {
  const ctx = await startTestServer({ members: [] });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, 'adler-ada');
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    assert.equal(saved[0].id, 'adler-ada');
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members rejects a record that fails schema validation', async () => {
  const ctx = await startTestServer({ members: [] });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname: 'Ada' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(Array.isArray(body.details) && body.details.length > 0);
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members resolves an id collision by suffixing the submitted id', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'adler-ada',
        firstname: 'Ada',
        lastname: 'Adler',
        affiliation: 'Y',
        email: 'b@example.org',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.notEqual(body.id, 'adler-ada');
    assert.equal(body.id, 'adler-ada-2');
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    assert.equal(saved.length, 2);
    const ids = saved.map((m) => m.id);
    assert.deepEqual(new Set(ids).size, 2);
    assert.ok(ids.includes('adler-ada'));
    assert.ok(ids.includes('adler-ada-2'));
  } finally {
    await ctx.close();
  }
});

test('POST /api/data/members with a malformed JSON body returns 400, not 500', async () => {
  const ctx = await startTestServer({ members: [] });
  try {
    const res = await fetch(`${ctx.base}/api/data/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  } finally {
    await ctx.close();
  }
});

test('PUT /api/data/projects/:id updates a project by id', async () => {
  const ctx = await startTestServer({
    projects: [{ id: 'p1', title: 'Old Title', participants: [] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/projects/p1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'p1', title: 'New Title', participants: [] }),
    });
    assert.equal(res.status, 200);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'projects.json'), 'utf8'));
    assert.equal(saved[0].title, 'New Title');
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/events/:index deletes an event by array position', async () => {
  const ctx = await startTestServer({
    events: [{ date: '2026-01-01', title: 'One' }, { date: '2026-02-01', title: 'Two' }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/events/0`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'events.json'), 'utf8'));
    assert.deepEqual(saved, [{ date: '2026-02-01', title: 'Two' }]);
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/members/:id on a referenced member returns 409 with affected projects and writes nothing', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
    projects: [{ id: 'p1', title: 'One', participants: ['adler-ada'] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members/adler-ada`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.deepEqual(body.affectedProjects, [{ id: 'p1', title: 'One' }]);
    const saved = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    assert.equal(saved.length, 1);
  } finally {
    await ctx.close();
  }
});

test('DELETE /api/data/members/:id?confirm=true cascades: removes the member and strips them from participants', async () => {
  const ctx = await startTestServer({
    members: [{ id: 'adler-ada', firstname: 'Ada', lastname: 'Adler', affiliation: 'X', email: 'a@example.org' }],
    projects: [{ id: 'p1', title: 'One', participants: ['adler-ada'] }],
  });
  try {
    const res = await fetch(`${ctx.base}/api/data/members/adler-ada?confirm=true`, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const members = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'members.json'), 'utf8'));
    const projects = JSON.parse(await readFile(path.join(ctx.contentPath, 'data', 'projects.json'), 'utf8'));
    assert.deepEqual(members, []);
    assert.deepEqual(projects[0].participants, []);
  } finally {
    await ctx.close();
  }
});

test('GET / serves the editor HTML page', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
  } finally {
    await ctx.close();
  }
});
