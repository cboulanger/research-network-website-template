import { execSync } from 'node:child_process';

const DEPLOY_BRANCH = 'master';

function remotes() {
  return execSync('git remote -v', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .map(([name, url]) => ({ name, url }));
}

function projectPathFromRemoteUrl(remoteUrl) {
  const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (!match) throw new Error(`Could not parse project path from remote URL: ${remoteUrl}`);
  return match[1];
}

function findRemoteUrl(hostSubstring) {
  const match = remotes().find(({ url }) => url.includes(hostSubstring));
  return match?.url;
}

async function deployGithub(token) {
  const remoteUrl = findRemoteUrl('github.com');
  if (!remoteUrl) throw new Error('No git remote pointing at github.com was found.');
  const projectPath = projectPathFromRemoteUrl(remoteUrl);

  const res = await fetch(
    `https://api.github.com/repos/${projectPath}/actions/workflows/ci.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: DEPLOY_BRANCH }),
    },
  );

  if (!res.ok) {
    console.error(`Failed to trigger workflow: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }

  console.log(
    `Workflow dispatched on ${DEPLOY_BRANCH}: https://github.com/${projectPath}/actions`,
  );
}

async function deployGitlab(token) {
  const host = process.env.GITLAB_HOST;
  if (!host) {
    console.error('GITLAB_HOST must be set in .env (see .env.example).');
    process.exit(1);
  }
  const remoteUrl = findRemoteUrl(host);
  if (!remoteUrl) throw new Error(`No git remote pointing at ${host} was found.`);
  const projectPath = encodeURIComponent(projectPathFromRemoteUrl(remoteUrl));

  const res = await fetch(`https://${host}/api/v4/projects/${projectPath}/pipeline`, {
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ref: DEPLOY_BRANCH }),
  });

  if (!res.ok) {
    console.error(`Failed to trigger pipeline: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Pipeline #${data.id} triggered on ${DEPLOY_BRANCH}: ${data.web_url}`);
}

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const gitlabToken = process.env.GITLAB_TOKEN;

  if (githubToken) {
    await deployGithub(githubToken);
  } else if (gitlabToken) {
    await deployGitlab(gitlabToken);
  } else {
    console.error('Set GITHUB_TOKEN or GITLAB_TOKEN in .env (see .env.example).');
    process.exit(1);
  }
}

main();
