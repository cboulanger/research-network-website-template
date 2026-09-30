import { deploy, waitForDeployStatus } from './lib/deploy.mjs';

try {
  const triggered = await deploy();
  for (const { name, ok, message } of triggered) {
    (ok ? console.log : console.error)(`[${name}] ${message}`);
  }
  if (triggered.some((r) => !r.ok)) process.exit(1);

  console.log('Waiting for the build to finish…');
  const results = await waitForDeployStatus(triggered, {
    onTick: ({ elapsedMs, pendingNames }) =>
      console.log(`  still running after ${Math.round(elapsedMs / 1000)}s: ${pendingNames.join(', ')}`),
  });
  for (const { name, ok, message } of results) {
    (ok ? console.log : console.error)(`[${name}] ${message}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
