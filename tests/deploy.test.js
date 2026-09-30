import test from 'node:test';
import assert from 'node:assert/strict';
import { deploy } from '../scripts/lib/deploy.mjs';

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
