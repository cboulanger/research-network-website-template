import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

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
    JSON.stringify([{ firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' }])
  );
  await writeFile(
    path.join(dir, 'data', 'projects.json'),
    JSON.stringify([{ id: 'p1', title: 'Test Project', participants: ['secret@example.org'] }])
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
      { firstname: 'Test', lastname: 'Person', affiliation: 'Test Org', email: 'secret@example.org' },
      { firstname: 'Solo', lastname: 'Member', affiliation: 'Test Org', email: 'solo@example.org' },
    ])
  );

  await runBuild(contentDir, publicDir);

  const membersHTML = await readFile(path.join(publicDir, 'members.html'), 'utf8');
  assert.equal(membersHTML.match(/projects\.html#member=test-person/g).length, 2);
  assert.doesNotMatch(membersHTML, /projects\.html#member=solo-member/);

  const projectsHTML = await readFile(path.join(publicDir, 'projects.html'), 'utf8');
  assert.match(projectsHTML, /id="member-focus-banner"/);

  await rm(contentDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
});
