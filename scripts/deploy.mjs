import { execSync } from 'node:child_process';

const DEPLOY_BRANCH = 'master';

function projectPathFromRemote() {
  const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  const match = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
  if (!match) throw new Error(`Could not parse project path from remote URL: ${remoteUrl}`);
  return match[1];
}

async function main() {
  const host = process.env.GITLAB_HOST;
  const token = process.env.GITLAB_TOKEN;
  if (!host || !token) {
    console.error('GITLAB_HOST and GITLAB_TOKEN must be set in .env (see .env.example).');
    process.exit(1);
  }

  const projectPath = encodeURIComponent(projectPathFromRemote());
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

main();
