import { existsSync } from 'node:fs';
import path from 'node:path';
import { isRemoteContentPath } from './content-store.mjs';

export async function resolveContent(contentPath = process.env.CONTENT_PATH || './content') {
  if (isRemoteContentPath(contentPath)) {
    const { materializeRemote } = await import('./resolve-content-remote.mjs');
    return materializeRemote(contentPath.replace(/\/+$/, ''));
  }
  if (!existsSync(contentPath)) {
    throw new Error(`CONTENT_PATH "${contentPath}" does not exist`);
  }
  return path.resolve(contentPath);
}
