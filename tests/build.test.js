import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

async function writeFixtureContent(dir) {
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'pages'), { recursive: true });
  await mkdir(path.join(dir, 'images'), { recursive: true });
  await writeFile(
    path.join(dir, 'data', 'site.json'),
    JSON.stringify({ bannerLabel: 'TX', title: 'Test Network', subtitle: 'A test subtitle.' })
  );
  await writeFile(
    path.join(dir, 'data', 'members.json'),
    JSON.stringify([
      { id: 'person-test', firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
    ])
  );
  await writeFile(
    path.join(dir, 'data', 'projects.json'),
    JSON.stringify([{ id: 'p1', title: 'Test Project', participants: ['person-test'] }])
  );
  await writeFile(path.join(dir, 'data', 'events.json'), JSON.stringify([]));
  await writeFile(path.join(dir, 'data', 'news.json'), JSON.stringify([]));
  await writeFile(path.join(dir, 'pages', 'about.md'), '# About\n\nTest content.');
}

async function runBuild(contentDir, publicDir) {
  execFileSync('node', ['scripts/build.mjs'], {
    env: { ...process.env, CONTENT_PATH: contentDir, PUBLIC_DIR_OVERRIDE: publicDir },
    stdio: 'pipe',
  });
}

// Non-blocking variant, for tests that serve fake HTTP responses in-process.
async function runBuildAsync(contentDir, publicDir, extraEnv = {}) {
  await promisify(execFile)('node', ['scripts/build.mjs'], {
    env: { ...process.env, CONTENT_PATH: contentDir, PUBLIC_DIR_OVERRIDE: publicDir, ...extraEnv },
  });
}

test('build.mjs produces static HTML with no raw email addresses anywhere in the output', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);

  await runBuild(contentDir, publicDir);

  const indexHTML = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(indexHTML, /Test Network/);

  const membersHTML = await readFile(path.join(publicDir, 'members.html'), 'utf8');
  assert.doesNotMatch(membersHTML, /secret@example\.org/);
  assert.doesNotMatch(membersHTML, /secret%40example\.org/);

  const projectsHTML = await readFile(path.join(publicDir, 'projects.html'), 'utf8');
  assert.doesNotMatch(projectsHTML, /secret@example\.org/);

  const graphJSON = await readFile(path.join(publicDir, 'assets', 'projects-graph-data.json'), 'utf8');
  assert.doesNotMatch(graphJSON, /secret@example\.org/);

  const aboutHTML = await readFile(path.join(publicDir, 'pages', 'about.html'), 'utf8');
  assert.match(aboutHTML, /Test content/);

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});

test('build.mjs copies static assets (CSS and client JS) into public/', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);

  await runBuild(contentDir, publicDir);

  assert.ok(existsSync(path.join(publicDir, 'assets', 'css', 'style.css')), 'expected assets/css/style.css to exist');
  for (const file of ['members.js', 'projects-graph.js', 'page-back-link.js', 'shared.js']) {
    assert.ok(existsSync(path.join(publicDir, 'assets', 'js', file)), `expected assets/js/${file} to exist`);
  }

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});

test('build.mjs links project participants from the members page to the focused projects page', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);
  await writeFile(
    path.join(contentDir, 'data', 'members.json'),
    JSON.stringify([
      { id: 'person-test', firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
      { id: 'member-solo', firstname: 'Solo', lastname: 'Member', affiliation: 'Test Org', email: 'solo@example.org' },
    ])
  );

  await runBuild(contentDir, publicDir);

  const membersHTML = await readFile(path.join(publicDir, 'members.html'), 'utf8');
  assert.equal(membersHTML.match(/projects\.html#member=person-test/g).length, 2);
  assert.doesNotMatch(membersHTML, /projects\.html#member=member-solo/);

  const projectsHTML = await readFile(path.join(publicDir, 'projects.html'), 'utf8');
  assert.match(projectsHTML, /id="member-focus-banner"/);

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});

test('build.mjs omits the publications section when publications.json is absent', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);

  await runBuild(contentDir, publicDir);

  assert.equal(existsSync(path.join(publicDir, 'publications.html')), false);
  const indexHTML = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  assert.doesNotMatch(indexHTML, /publications\.html|Latest Publications/);

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});

test('build.mjs lists members\' Zotero publications on a page and in a landing box', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);
  await writeFile(
    path.join(contentDir, 'data', 'publications.json'),
    JSON.stringify({ zoteroGroup: 'https://www.zotero.org/groups/42', style: 'apa' })
  );

  const item = (key, lastName, parsedDate) => ({
    key,
    meta: { parsedDate },
    bib: `<div class="csl-bib-body"><div class="csl-entry">${lastName} (${parsedDate}). Title ${key}. doi:10.5555/${key}</div></div>`,
    data: { key, itemType: 'book', creators: [{ creatorType: 'author', firstName: 'T.', lastName }], dateAdded: '' },
  });
  const zoteroItems = [item('K1', 'Persón', '2021'), item('K2', 'Stranger', '2025'), item('K3', 'Person', '2024')];
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Total-Results': String(zoteroItems.length) });
    res.end(JSON.stringify(zoteroItems));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await runBuildAsync(contentDir, publicDir, { ZOTERO_API_BASE: `http://127.0.0.1:${server.address().port}` });
  } finally {
    server.close();
  }

  assert.match(requests[0], /^\/groups\/42\/items\/top\?/);
  assert.match(requests[0], /style=apa/);

  const publicationsHTML = await readFile(path.join(publicDir, 'publications.html'), 'utf8');
  assert.match(publicationsHTML, /class="active">Publications</);
  assert.doesNotMatch(publicationsHTML, /Title K2/);
  assert.ok(publicationsHTML.indexOf('Title K3') < publicationsHTML.indexOf('Title K1'), 'expected newest first');
  assert.match(publicationsHTML, /<a href="https:\/\/doi\.org\/10\.5555\/K1" target="_blank" rel="noopener">doi:10\.5555\/K1<\/a>/);

  const indexHTML = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(indexHTML, /Latest Publications/);
  assert.match(indexHTML, /See all publications/);
  assert.match(publicationsHTML, /id="publication-sort"/);
  assert.match(publicationsHTML, /src="assets\/js\/publications\.js"/);
  assert.ok(existsSync(path.join(publicDir, 'assets', 'js', 'publications.js')));

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});

test('build.mjs fails on a stalled Zotero server without touching the existing build', async (t) => {
  const contentDir = await mkdtemp(path.join(tmpdir(), 'build-content-'));
  const publicDir = await mkdtemp(path.join(tmpdir(), 'build-public-'));
  await writeFixtureContent(contentDir);
  await writeFile(path.join(contentDir, 'data', 'publications.json'), JSON.stringify({ zoteroGroup: '42', style: 'apa' }));
  await writeFile(path.join(publicDir, 'index.html'), 'previous build');

  const server = http.createServer(() => {}); // accepts the request, never answers
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(
      () =>
        runBuildAsync(contentDir, publicDir, {
          ZOTERO_API_BASE: `http://127.0.0.1:${server.address().port}`,
          ZOTERO_TIMEOUT_MS: '300',
        }),
      /timed out/
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }

  assert.equal(await readFile(path.join(publicDir, 'index.html'), 'utf8'), 'previous build');
  assert.equal(existsSync(path.join(publicDir, 'members.html')), false);

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});
