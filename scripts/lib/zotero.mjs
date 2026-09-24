import { fetchWithTimeout, timeoutFromEnv } from './fetch-with-timeout.mjs';

const PAGE_SIZE = 100;

export function parseZoteroGroupId(value) {
  const match = String(value ?? '').trim().match(/^(?:https?:\/\/(?:www\.)?zotero\.org\/groups\/)?(\d+)(?:[/?#].*)?$/i);
  if (!match) {
    throw new Error(`zoteroGroup "${value}" must be a numeric group id or a https://www.zotero.org/groups/<numeric group id> URL`);
  }
  return match[1];
}

// Fetches every top-level item (no notes/attachments as children) of a
// Zotero group library, each with its formatted citation (`bib`, rendered
// server-side in the given CSL style, with URLs/DOIs wrapped in links) and
// its raw metadata (`data`, used for author matching).
export async function fetchZoteroItems({
  groupId,
  style,
  locale,
  apiKey = process.env.ZOTERO_API_KEY,
  baseUrl = process.env.ZOTERO_API_BASE || 'https://api.zotero.org',
  fetchImpl = globalThis.fetch,
  timeoutMs = timeoutFromEnv('ZOTERO_TIMEOUT_MS', 30000),
}) {
  const headers = { 'Zotero-API-Version': '3' };
  if (apiKey) headers['Zotero-API-Key'] = apiKey;

  const items = [];
  let total = Infinity;
  for (let start = 0; start < total; start += PAGE_SIZE) {
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}/groups/${groupId}/items/top`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('include', 'bib,data');
    url.searchParams.set('style', style);
    if (locale) url.searchParams.set('locale', locale);
    url.searchParams.set('linkwrap', '1');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('start', String(start));

    const res = await fetchWithTimeout(url.toString(), { headers }, { timeoutMs, fetchImpl });
    if (!res.ok) {
      const hint =
        res.status === 403
          ? ' — the group library must be public ("Library Reading: Anyone on the internet"), or set ZOTERO_API_KEY'
          : '';
      throw new Error(`Zotero request ${url} failed: ${res.status} ${res.statusText}${hint}`);
    }
    const page = await res.json();
    items.push(...page);
    total = Number(res.headers.get('total-results') ?? items.length);
    if (!page.length) break;
  }
  return items;
}
