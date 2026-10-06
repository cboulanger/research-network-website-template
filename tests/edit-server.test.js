import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/edit-server.mjs';

async function startTestServer(fixture, options = {}) {
  const contentPath = await mkdtemp(path.join(tmpdir(), 'edit-content-'));
  await mkdir(path.join(contentPath, 'data'), { recursive: true });
  await writeFile(path.join(contentPath, 'data', 'members.json'), JSON.stringify(fixture.members ?? []));
  await writeFile(path.join(contentPath, 'data', 'projects.json'), JSON.stringify(fixture.projects ?? []));
  await writeFile(path.join(contentPath, 'data', 'events.json'), JSON.stringify(fixture.events ?? []));
  await writeFile(path.join(contentPath, 'data', 'news.json'), JSON.stringify(fixture.news ?? []));
  await writeFile(
    path.join(contentPath, 'data', 'site.json'),
    JSON.stringify(fixture.site ?? { bannerLabel: 'B', title: 'T', subtitle: 'S' })
  );

  const server = createServer({ contentPath, schemaDir: 'schema', editorDir: 'scripts/editor', ...options });
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

test('GET /api/types lists every editable content type', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/api/types`);
    const body = await res.json();
    assert.deepEqual(body.map((t) => t.name).sort(), ['events', 'members', 'news', 'projects', 'publications', 'site']);
  } finally {
    await ctx.close();
  }
});

test('singleton types (site, publications) are read and replaced as a single object', async () => {
  const ctx = await startTestServer({});
  try {
    const put = (name, body) =>
      fetch(`${ctx.base}/api/data/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const site = await (await fetch(`${ctx.base}/api/data/site`)).json();
    assert.equal(site.title, 'T');
    assert.equal((await put('site', { ...site, title: 'New' })).status, 200);
    assert.equal((await (await fetch(`${ctx.base}/api/data/site`)).json()).title, 'New');
    assert.equal((await put('site', { title: 'incomplete' })).status, 400);

    // publications.json is optional: absent reads as {}, and PUT creates it.
    assert.deepEqual(await (await fetch(`${ctx.base}/api/data/publications`)).json(), {});
    assert.equal((await put('publications', { zoteroGroup: '2211429', style: 'apa' })).status, 200);
    assert.equal((await (await fetch(`${ctx.base}/api/data/publications`)).json()).style, 'apa');
    assert.equal((await fetch(`${ctx.base}/api/data/site`, { method: 'POST', body: '{}' })).status, 405);
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

test('POST /api/data/projects generates an id from the title and suffixes collisions', async () => {
  const ctx = await startTestServer({});
  try {
    const post = () =>
      fetch(`${ctx.base}/api/data/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Legal Histories', participants: [] }),
      });
    assert.equal((await (await post()).json()).id, 'legal-histories');
    assert.equal((await (await post()).json()).id, 'legal-histories-2');
  } finally {
    await ctx.close();
  }
});

test('POST /api/deploy returns the results of the deploy function', async () => {
  const ctx = await startTestServer({}, { deployFn: async () => [{ name: 'github', ok: true, message: 'ok' }] });
  try {
    const res = await fetch(`${ctx.base}/api/deploy`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { results: [{ name: 'github', ok: true, message: 'ok' }] });
  } finally {
    await ctx.close();
  }
});

test('POST /api/deploy returns 400 when deploying is not configured', async () => {
  const ctx = await startTestServer({}, {
    deployFn: async () => {
      throw new Error('Set GITHUB_TOKEN');
    },
  });
  try {
    const res = await fetch(`${ctx.base}/api/deploy`, { method: 'POST' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /GITHUB_TOKEN/);
  } finally {
    await ctx.close();
  }
});

test('POST /api/deploy refuses to deploy invalid content and does not call the deploy function', async () => {
  let called = false;
  const ctx = await startTestServer({ news: [{ bogus: true }] }, { deployFn: async () => { called = true; return []; } });
  try {
    const res = await fetch(`${ctx.base}/api/deploy`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /news failed schema validation/);
    assert.ok(Array.isArray(body.details) && body.details.length > 0);
    assert.equal(called, false);
  } finally {
    await ctx.close();
  }
});

test('POST /api/deploy waits for the triggered build to finish before responding', async () => {
  let waitCalledWith = null;
  const ctx = await startTestServer(
    {},
    {
      deployFn: async () => [{ name: 'github', ok: true, message: 'triggered', statusRef: { type: 'github' } }],
      waitFn: async (triggered) => {
        waitCalledWith = triggered;
        return triggered.map((r) => ({ name: r.name, ok: true, message: 'build succeeded' }));
      },
    }
  );
  try {
    const res = await fetch(`${ctx.base}/api/deploy`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { results: [{ name: 'github', ok: true, message: 'build succeeded' }] });
    assert.equal(waitCalledWith[0].name, 'github');
  } finally {
    await ctx.close();
  }
});

test('POST /api/build runs the build function and returns ok', async () => {
  let called = false;
  const ctx = await startTestServer({}, { buildFn: async () => { called = true; } });
  try {
    const res = await fetch(`${ctx.base}/api/build`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(called, true);
  } finally {
    await ctx.close();
  }
});

test('POST /api/build returns 500 with the error message when the build fails', async () => {
  const ctx = await startTestServer({}, { buildFn: async () => { throw new Error('boom'); } });
  try {
    const res = await fetch(`${ctx.base}/api/build`, { method: 'POST' });
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /boom/);
  } finally {
    await ctx.close();
  }
});

test('GET /preview/* serves files from the built public directory', async () => {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'preview-'));
  await writeFile(path.join(publicDir, 'index.html'), '<h1>hi</h1>');
  const ctx = await startTestServer({}, { publicDir });
  try {
    const res = await fetch(`${ctx.base}/preview/index.html`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(await res.text(), '<h1>hi</h1>');
    assert.equal((await fetch(`${ctx.base}/preview/nope.html`)).status, 404);
  } finally {
    await ctx.close();
    await rm(publicDir, { recursive: true, force: true });
  }
});

test('GET /api/site returns the resolved site URL', async () => {
  const ctx = await startTestServer({}, { siteUrlFn: async () => 'https://site.example/' });
  try {
    const res = await fetch(`${ctx.base}/api/site`);
    assert.deepEqual(await res.json(), { url: 'https://site.example/' });
  } finally {
    await ctx.close();
  }
});

test('the shared form module is served to the editor', async () => {
  const ctx = await startTestServer({});
  try {
    const res = await fetch(`${ctx.base}/assets/js/record-form.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.match(await res.text(), /export function renderRecordFields/);
    assert.equal((await fetch(`${ctx.base}/assets/js/../../package.json`)).status, 404);
  } finally {
    await ctx.close();
  }
});

test('GET /api/inbox reports disabled when no ntfy topic is configured', async () => {
  const ctx = await startTestServer({});
  try {
    assert.deepEqual(await (await fetch(`${ctx.base}/api/inbox`)).json(), { enabled: false });
    assert.equal((await fetch(`${ctx.base}/api/inbox/x`, { method: 'POST', body: '{}' })).status, 404);
  } finally {
    await ctx.close();
  }
});

test('inbox endpoints list submissions and resolve them', async () => {
  const message = JSON.stringify({ v: 1, type: 'news', op: 'add', ts: 't', data: { date: '2026-01-01', title: 'Hi', url: 'https://example.org' } });
  const ntfyFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: 'n1', time: 1, event: 'message', message }) });
  const inboxStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'inbox-')), 'inbox.json');
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const body = await (await fetch(`${ctx.base}/api/inbox`)).json();
    assert.equal(body.enabled, true);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].data.title, 'Hi');
    const post = (id, action) => fetch(`${ctx.base}/api/inbox/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    assert.equal((await post('n1', 'nonsense')).status, 400);
    assert.equal((await post('n1', 'reject')).status, 204);
    assert.equal((await post('n1', 'reject')).status, 404);
    assert.deepEqual((await (await fetch(`${ctx.base}/api/inbox`)).json()).entries, []);
  } finally {
    await ctx.close();
  }
});

test('a failing ntfy poll becomes a warning but pending entries are still listed', async () => {
  const ntfyFetch = async () => ({ ok: false, status: 503 });
  const inboxStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'inbox-')), 'inbox.json');
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const body = await (await fetch(`${ctx.base}/api/inbox`)).json();
    assert.match(body.warning, /503/);
    assert.deepEqual(body.entries, []);
  } finally {
    await ctx.close();
  }
});

test('inbox POST with a JSON null body or a malformed id escape returns 400', async () => {
  const ntfyFetch = async () => ({ ok: true, status: 200, text: async () => '' });
  const inboxStatePath = path.join(await mkdtemp(path.join(tmpdir(), 'inbox-')), 'inbox.json');
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const headers = { 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${ctx.base}/api/inbox/x`, { method: 'POST', headers, body: 'null' })).status, 400);
    assert.equal((await fetch(`${ctx.base}/api/inbox/%E0%A4%A`, { method: 'POST', headers, body: JSON.stringify({ action: 'reject' }) })).status, 400);
  } finally {
    await ctx.close();
  }
});

test('GET /api/inbox returns a warning instead of 500 when the inbox cannot be listed', async () => {
  const ntfyFetch = async () => ({ ok: true, status: 200, text: async () => '' });
  const dir = await mkdtemp(path.join(tmpdir(), 'inbox-'));
  // A directory where the state file should be makes every read fail (EISDIR).
  const inboxStatePath = path.join(dir, 'inbox.json');
  await mkdir(inboxStatePath);
  const ctx = await startTestServer({}, { ntfyConfig: { server: 'https://ntfy.test', topic: 't' }, inboxStatePath, ntfyFetch });
  try {
    const res = await fetch(`${ctx.base}/api/inbox`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.entries, []);
    assert.ok(body.warning);
  } finally {
    await ctx.close();
  }
});
