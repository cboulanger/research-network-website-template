export function rewritePagesUrl(url) {
  const match = typeof url === 'string' ? url.match(/^pages\.html\?doc=(.+)$/) : null;
  if (!match) return url;
  const stem = match[1].replace(/\.(md|html)$/, '');
  return `pages/${stem}.html`;
}
