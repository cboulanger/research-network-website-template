import test from 'node:test';
import assert from 'node:assert/strict';
import { deploy, waitForDeployStatus } from '../scripts/lib/deploy.mjs';

function fakeFetch(calls) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    const isLookup = !options.method;
    return {
      ok: true,
      json: async () => (isLookup ? { default_branch: 'main' } : { id: 7, web_url: 'https://gl/p/7' }),
    };
  };
}

test('deploy uses GITHUB_REPOSITORY and the default branch without needing git', async () => {
  const calls = [];
  const results = await deploy({
    env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'me/site' },
    fetchImpl: fakeFetch(calls),
    remoteUrls: () => [],
  });
  assert.equal(results[0].ok, true);
  assert.equal(calls[0].url, 'https://api.github.com/repos/me/site');
  assert.match(calls[1].url, /repos\/me\/site\/actions\/workflows\/ci\.yml\/dispatches$/);
  assert.equal(JSON.parse(calls[1].options.body).ref, 'main');
});

test('deploy falls back to the git remote when GITHUB_REPOSITORY is unset', async () => {
  const calls = [];
  await deploy({
    env: { GITHUB_TOKEN: 't' },
    fetchImpl: fakeFetch(calls),
    remoteUrls: () => ['git@github.com:me/site.git'],
  });
  assert.equal(calls[0].url, 'https://api.github.com/repos/me/site');
});

test('deploy reports a per-forge error when the repository cannot be determined', async () => {
  const results = await deploy({ env: { GITHUB_TOKEN: 't' }, fetchImpl: fakeFetch([]), remoteUrls: () => [] });
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /GITHUB_REPOSITORY/);
});

test('deploy triggers a GitLab pipeline on the default branch', async () => {
  const calls = [];
  const results = await deploy({
    env: { GITLAB_TOKEN: 't', GITLAB_HOST: 'gl', GITLAB_PROJECT: 'grp/site' },
    fetchImpl: fakeFetch(calls),
    remoteUrls: () => [],
  });
  assert.equal(results[0].ok, true);
  assert.match(calls[1].url, /projects\/grp%2Fsite\/pipeline$/);
  assert.equal(calls[1].options.body.get('ref'), 'main');
});

test('deploy throws when no token is set', async () => {
  await assert.rejects(deploy({ env: {} }), /GITHUB_TOKEN/);
});

import { resolveSiteUrl } from '../scripts/lib/deploy.mjs';

test('resolveSiteUrl prefers the SITE_URL override without any lookup', async () => {
  const calls = [];
  const url = await resolveSiteUrl({
    env: { SITE_URL: 'https://nice.example/', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'me/site' },
    fetchImpl: fakeFetch(calls),
    remoteUrls: () => [],
  });
  assert.equal(url, 'https://nice.example/');
  assert.equal(calls.length, 0);
});

test('resolveSiteUrl reads the GitHub Pages address from the API', async () => {
  const url = await resolveSiteUrl({
    env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'me/site' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ html_url: 'https://me.example.org/site/' }) }),
    remoteUrls: () => [],
  });
  assert.equal(url, 'https://me.example.org/site/');
});

test('resolveSiteUrl falls back to the default github.io address when the Pages API is unavailable', async () => {
  const url = await resolveSiteUrl({
    env: { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'Me/site' },
    fetchImpl: async () => ({ ok: false, status: 404 }),
    remoteUrls: () => [],
  });
  assert.equal(url, 'https://me.github.io/site/');
});

test('resolveSiteUrl reads the GitLab Pages address and returns null when nothing works', async () => {
  const gitlabEnv = { GITLAB_TOKEN: 't', GITLAB_HOST: 'gl.example', GITLAB_PROJECT: 'g/p' };
  assert.equal(
    await resolveSiteUrl({
      env: gitlabEnv,
      fetchImpl: async () => ({ ok: true, json: async () => ({ url: 'https://g.pages.gl.example/p' }) }),
      remoteUrls: () => [],
    }),
    'https://g.pages.gl.example/p',
  );
  assert.equal(
    await resolveSiteUrl({ env: gitlabEnv, fetchImpl: async () => { throw new Error('down'); }, remoteUrls: () => [] }),
    null,
  );
  assert.equal(await resolveSiteUrl({ env: {}, fetchImpl: fakeFetch([]), remoteUrls: () => [] }), null);
});

test('waitForDeployStatus passes through a result with no statusRef unchanged', async () => {
  const triggered = [{ name: 'github', ok: false, message: 'boom' }];
  const results = await waitForDeployStatus(triggered, {
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });
  assert.deepEqual(results, triggered);
});

test('waitForDeployStatus polls a GitHub run (not yet listed, then running, then completed) to success', async () => {
  const runsResponses = [{ workflow_runs: [] }, { workflow_runs: [{ id: 42, created_at: new Date(Date.now() + 1000).toISOString() }] }];
  const runResponses = [{ id: 42, status: 'in_progress' }, { id: 42, status: 'completed', conclusion: 'success', html_url: 'https://github.com/me/site/actions/runs/42' }];
  let runsCall = 0;
  let runCall = 0;
  const fetchImpl = async (url) => {
    if (url.includes('/actions/workflows/ci.yml/runs')) return { ok: true, json: async () => runsResponses[runsCall++] };
    if (/\/actions\/runs\/\d+$/.test(url)) return { ok: true, json: async () => runResponses[runCall++] };
    throw new Error(`unexpected url ${url}`);
  };
  const triggered = [
    {
      name: 'github',
      ok: true,
      message: 'Workflow dispatched on main: https://github.com/me/site/actions',
      statusRef: { type: 'github', projectPath: 'me/site', ref: 'main', sinceISO: new Date().toISOString() },
    },
  ];
  const results = await waitForDeployStatus(triggered, { env: { GITHUB_TOKEN: 't' }, fetchImpl, intervalMs: 1, timeoutMs: 2000 });
  assert.equal(results[0].ok, true);
  assert.match(results[0].message, /Succeeded/);
  assert.match(results[0].message, /runs\/42/);
});

test('waitForDeployStatus polls a GitLab pipeline to failure', async () => {
  const statuses = ['running', 'failed'];
  let i = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => ({ status: statuses[i++], web_url: 'https://gl/p/7' }) });
  const triggered = [
    { name: 'gitlab', ok: true, message: 'Pipeline #7 triggered', statusRef: { type: 'gitlab', host: 'gl', projectPath: 'grp%2Fsite', pipelineId: 7 } },
  ];
  const results = await waitForDeployStatus(triggered, { env: { GITLAB_TOKEN: 't' }, fetchImpl, intervalMs: 1, timeoutMs: 2000 });
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /Failed/);
});

test('waitForDeployStatus reports a timeout when the pipeline never finishes', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ status: 'running', web_url: 'https://gl/p/7' }) });
  const triggered = [
    { name: 'gitlab', ok: true, message: 'Pipeline #1 triggered', statusRef: { type: 'gitlab', host: 'gl', projectPath: 'g%2Fp', pipelineId: 1 } },
  ];
  const results = await waitForDeployStatus(triggered, { env: { GITLAB_TOKEN: 't' }, fetchImpl, intervalMs: 5, timeoutMs: 20 });
  assert.equal(results[0].ok, false);
  assert.match(results[0].message, /Timed out/);
});

test('waitForDeployStatus reports a per-target failure when the status check itself errors, without affecting other targets', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('gl.example')) throw new Error('network down');
    return { ok: true, json: async () => ({ status: 'success', web_url: 'https://gl/p/9' }) };
  };
  const triggered = [
    { name: 'broken', ok: true, message: 'triggered', statusRef: { type: 'gitlab', host: 'gl.example', projectPath: 'g%2Fp', pipelineId: 1 } },
    { name: 'fine', ok: true, message: 'triggered', statusRef: { type: 'gitlab', host: 'gl.ok', projectPath: 'g%2Fp', pipelineId: 9 } },
  ];
  const results = await waitForDeployStatus(triggered, { fetchImpl, intervalMs: 1, timeoutMs: 1000 });
  assert.equal(results.find((r) => r.name === 'broken').ok, false);
  assert.match(results.find((r) => r.name === 'broken').message, /Status check failed: network down/);
  assert.equal(results.find((r) => r.name === 'fine').ok, true);
});
