import { execSync } from 'node:child_process';
import { timeoutFromEnv } from './fetch-with-timeout.mjs';

function gitRemoteUrls() {
  try {
    return execSync('git remote -v', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[1]);
  } catch {
    return [];
  }
}

function projectPathFromRemoteUrl(remoteUrl) {
  const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (!match) throw new Error(`Could not parse project path from remote URL: ${remoteUrl}`);
  return match[1];
}

// An explicit "owner/name" setting wins, so deploying works from a ZIP download
// with no git checkout; the git remote is only a fallback for clones.
function resolveProjectPath(explicit, hostSubstring, settingName, remoteUrls) {
  if (explicit) return explicit;
  const remoteUrl = remoteUrls().find((url) => url.includes(hostSubstring));
  if (!remoteUrl) {
    throw new Error(
      `Set ${settingName}=owner/name in .env (see .env.example); no git remote for ${hostSubstring} was found to infer it from.`,
    );
  }
  return projectPathFromRemoteUrl(remoteUrl);
}

async function failIfNotOk(res, action) {
  if (!res.ok) throw new Error(`Failed to ${action}: ${res.status} ${res.statusText}\n${await res.text()}`);
}

async function deployGithub({ token, repository }, { fetchImpl, remoteUrls }) {
  const projectPath = resolveProjectPath(repository, 'github.com', 'GITHUB_REPOSITORY', remoteUrls);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

  const repoRes = await fetchImpl(`https://api.github.com/repos/${projectPath}`, { headers });
  await failIfNotOk(repoRes, 'look up the repository');
  const { default_branch: ref } = await repoRes.json();

  // Recorded before dispatching so the run this triggers can be told apart
  // from any other run of the same workflow when polling for it below.
  const sinceISO = new Date().toISOString();
  const res = await fetchImpl(
    `https://api.github.com/repos/${projectPath}/actions/workflows/ci.yml/dispatches`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    },
  );
  await failIfNotOk(res, 'trigger workflow');
  return {
    message: `Workflow dispatched on ${ref}: https://github.com/${projectPath}/actions`,
    statusRef: { type: 'github', projectPath, ref, sinceISO },
  };
}

async function deployGitlab({ token, host, project }, { fetchImpl, remoteUrls }) {
  if (!host) throw new Error('GITLAB_HOST must be set in .env (see .env.example).');
  const projectPath = encodeURIComponent(resolveProjectPath(project, host, 'GITLAB_PROJECT', remoteUrls));
  const headers = { 'PRIVATE-TOKEN': token };

  const projectRes = await fetchImpl(`https://${host}/api/v4/projects/${projectPath}`, { headers });
  await failIfNotOk(projectRes, 'look up the project');
  const { default_branch: ref } = await projectRes.json();

  const res = await fetchImpl(`https://${host}/api/v4/projects/${projectPath}/pipeline`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ref }),
  });
  await failIfNotOk(res, 'trigger pipeline');
  const data = await res.json();
  return {
    message: `Pipeline #${data.id} triggered on ${ref}: ${data.web_url}`,
    statusRef: { type: 'gitlab', host, projectPath, pipelineId: data.id },
  };
}

async function githubSiteUrl({ token, repository }, { fetchImpl, remoteUrls }) {
  const projectPath = resolveProjectPath(repository, 'github.com', 'GITHUB_REPOSITORY', remoteUrls);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const res = await fetchImpl(`https://api.github.com/repos/${projectPath}/pages`, { headers });
  if (res.ok) {
    const { html_url: url } = await res.json();
    if (url) return url;
  }
  // Pages API unavailable to this token: fall back to GitHub's default address.
  const [owner, name] = projectPath.split('/');
  const host = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}

async function gitlabSiteUrl({ token, host, project }, { fetchImpl, remoteUrls }) {
  if (!host) return null;
  const projectPath = encodeURIComponent(resolveProjectPath(project, host, 'GITLAB_PROJECT', remoteUrls));
  const res = await fetchImpl(`https://${host}/api/v4/projects/${projectPath}/pages`, {
    headers: { 'PRIVATE-TOKEN': token },
  });
  if (!res.ok) return null;
  return (await res.json()).url || null;
}

// The address of the published site, for linking to it. SITE_URL overrides
// the lookup (e.g. when the site is served through a reverse proxy under a
// nicer domain); otherwise it is asked of the forge's Pages API. Never
// rejects: a missing link must not fail a deploy. Resolves to a URL or null.
export async function resolveSiteUrl({ env = process.env, fetchImpl = fetch, remoteUrls = gitRemoteUrls } = {}) {
  if (env.SITE_URL) return env.SITE_URL;
  const deps = { fetchImpl, remoteUrls };
  const lookups = [
    env.GITHUB_TOKEN &&
      (() => githubSiteUrl({ token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY }, deps)),
    env.GITLAB_TOKEN &&
      (() => gitlabSiteUrl({ token: env.GITLAB_TOKEN, host: env.GITLAB_HOST, project: env.GITLAB_PROJECT }, deps)),
  ].filter(Boolean);
  for (const lookup of lookups) {
    try {
      const url = await lookup();
      if (url) return url;
    } catch {
      // try the next forge
    }
  }
  return null;
}

// Asks every configured forge to rebuild the site from the current content
// store. Nothing is uploaded: the forge's CI fetches the content itself.
// Resolves to [{ name, ok, message }]; never rejects for per-forge failures.
export async function deploy({ env = process.env, fetchImpl = fetch, remoteUrls = gitRemoteUrls } = {}) {
  const deps = { fetchImpl, remoteUrls };
  const targets = [
    env.GITHUB_TOKEN && {
      name: 'github',
      run: () => deployGithub({ token: env.GITHUB_TOKEN, repository: env.GITHUB_REPOSITORY }, deps),
    },
    env.GITLAB_TOKEN && {
      name: 'gitlab',
      run: () =>
        deployGitlab({ token: env.GITLAB_TOKEN, host: env.GITLAB_HOST, project: env.GITLAB_PROJECT }, deps),
    },
  ].filter(Boolean);

  if (!targets.length) {
    throw new Error('Set GITHUB_TOKEN and/or GITLAB_TOKEN in .env (see .env.example).');
  }

  const results = await Promise.allSettled(targets.map(({ run }) => run()));
  return results.map((result, i) => ({
    name: targets[i].name,
    ok: result.status === 'fulfilled',
    message: result.status === 'fulfilled' ? result.value.message : result.reason.message,
    statusRef: result.status === 'fulfilled' ? result.value.statusRef : undefined,
  }));
}

// Finds the run that a dispatch created: workflow_dispatch gives back nothing
// to correlate with, so the newest matching run created no earlier than the
// dispatch is taken to be it.
async function findGithubRun({ token, projectPath, ref, sinceISO }, { fetchImpl }) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const res = await fetchImpl(
    `https://api.github.com/repos/${projectPath}/actions/workflows/ci.yml/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=5`,
    { headers },
  );
  await failIfNotOk(res, 'list workflow runs');
  const { workflow_runs: runs } = await res.json();
  return runs.find((run) => new Date(run.created_at) >= new Date(sinceISO)) || null;
}

async function checkGithubStatus(statusRef, { token }, deps) {
  let runId = statusRef.runId;
  if (!runId) {
    const run = await findGithubRun({ ...statusRef, token }, deps);
    if (!run) return { done: false };
    runId = run.id;
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const res = await deps.fetchImpl(`https://api.github.com/repos/${statusRef.projectPath}/actions/runs/${runId}`, {
    headers,
  });
  await failIfNotOk(res, 'check workflow run status');
  const run = await res.json();
  return {
    done: run.status === 'completed',
    success: run.conclusion === 'success',
    url: run.html_url,
    runId: run.id,
    description: run.status === 'completed' ? run.conclusion : run.status,
  };
}

async function checkGitlabStatus(statusRef, { token }, deps) {
  const res = await deps.fetchImpl(
    `https://${statusRef.host}/api/v4/projects/${statusRef.projectPath}/pipelines/${statusRef.pipelineId}`,
    { headers: { 'PRIVATE-TOKEN': token } },
  );
  await failIfNotOk(res, 'check pipeline status');
  const pipeline = await res.json();
  const done = ['success', 'failed', 'canceled', 'skipped'].includes(pipeline.status);
  return { done, success: pipeline.status === 'success', url: pipeline.web_url, description: pipeline.status };
}

function checkTargetStatus(statusRef, env, deps) {
  if (statusRef.type === 'github') return checkGithubStatus(statusRef, { token: env.GITHUB_TOKEN }, deps);
  return checkGitlabStatus(statusRef, { token: env.GITLAB_TOKEN }, deps);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls each triggered target's pipeline/workflow run until it finishes or
// `timeoutMs` elapses, so the caller can report a real success/failure
// instead of just "rebuild started". Results without a statusRef (the
// trigger itself failed, or the caller passed a plain success message) are
// returned unchanged. Never rejects: a per-target check failure is reported
// as that target's failure.
export async function waitForDeployStatus(
  results,
  { env = process.env, fetchImpl = fetch, intervalMs, timeoutMs, onTick } = {},
) {
  intervalMs = intervalMs ?? timeoutFromEnv('DEPLOY_POLL_INTERVAL_MS', 10_000);
  timeoutMs = timeoutMs ?? timeoutFromEnv('DEPLOY_POLL_TIMEOUT_MS', 300_000);
  const deps = { fetchImpl };
  const start = Date.now();

  const pending = new Map(results.filter((r) => r.ok && r.statusRef).map((r) => [r, { ...r.statusRef }]));
  const finalByResult = new Map();

  while (pending.size && Date.now() - start < timeoutMs) {
    for (const [result, statusRef] of pending) {
      let status;
      try {
        status = await checkTargetStatus(statusRef, env, deps);
      } catch (err) {
        finalByResult.set(result, { ok: false, message: `${result.message}\nStatus check failed: ${err.message}` });
        pending.delete(result);
        continue;
      }
      if (status.runId) statusRef.runId = status.runId;
      if (status.done) {
        finalByResult.set(result, {
          ok: status.success,
          message: `${status.success ? 'Succeeded' : 'Failed'} (${status.description}): ${status.url || result.message}`,
        });
        pending.delete(result);
      }
    }
    if (!pending.size) break;
    onTick?.({ elapsedMs: Date.now() - start, pendingNames: [...pending.keys()].map((r) => r.name) });
    if (Date.now() - start >= timeoutMs) break;
    await delay(intervalMs);
  }

  return results.map((r) => {
    if (!r.ok || !r.statusRef) return r;
    const final = finalByResult.get(r);
    if (final) return { name: r.name, ...final };
    return {
      name: r.name,
      ok: false,
      message: `${r.message}\nTimed out after ${Math.round(timeoutMs / 1000)}s waiting for it to finish.`,
    };
  });
}
