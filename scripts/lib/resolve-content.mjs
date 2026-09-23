import { existsSync } from 'node:fs';
import path from 'node:path';

function isRemote(contentPath) {
  return /^https?:\/\//i.test(contentPath);
}

export async function resolveContent(contentPath = process.env.CONTENT_PATH || './content') {
  if (isRemote(contentPath)) {
    const { materializeRemote } = await import('./resolve-content-remote.mjs');
    return materializeRemote(contentPath.replace(/\/+$/, ''));
  }
  if (!existsSync(contentPath)) {
    throw new Error(`CONTENT_PATH "${contentPath}" does not exist`);
  }
  return path.resolve(contentPath);
}
