import { deploy } from './lib/deploy.mjs';

try {
  const results = await deploy();
  for (const { name, ok, message } of results) {
    (ok ? console.log : console.error)(`[${name}] ${message}`);
  }
  if (results.some((r) => !r.ok)) process.exit(1);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
