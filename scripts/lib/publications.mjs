// Build-time helpers turning a Zotero group library into the list of
// members' publications: lenient author matching against members.json, and
// sanitizing/linkifying the server-rendered citation HTML.

const DEFAULT_CREATOR_TYPES = ['author', 'editor'];
const NON_PUBLICATION_TYPES = new Set(['note', 'attachment', 'annotation']);

// Letters that Unicode normalization doesn't decompose into base + accent.
const SPECIAL_LETTERS = { ß: 'ss', ø: 'o', ł: 'l', đ: 'd', ð: 'd', æ: 'ae', œ: 'oe', þ: 'th', ı: 'i' };

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßøłđðæœþı]/g, (c) => SPECIAL_LETTERS[c])
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

// Also treats German-style transliterations as equal ("Sundstroem" ==
// "Sundström" == "Sundstrom").
function foldTransliteration(value) {
  return value.replace(/([aou])e/g, '$1');
}

function lastnameKey(value) {
  return foldTransliteration(normalizeName(value).replace(/ /g, ''));
}

function firstToken(value) {
  return foldTransliteration(normalizeName(value).split(' ')[0] || '');
}

function splitCreatorName(creator) {
  if (!creator.name) return { first: creator.firstName || '', last: creator.lastName || '' };
  const name = creator.name.trim();
  if (name.includes(',')) {
    const [last, ...rest] = name.split(',');
    return { first: rest.join(','), last };
  }
  const parts = name.split(/\s+/);
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Last names must be equal (ignoring case, diacritics, spacing and
// punctuation); first names must share their first word, where an initial
// ("A." for "Ada") counts as a match.
export function creatorMatchesMember(creator, member) {
  const { first, last } = splitCreatorName(creator);
  if (!last || lastnameKey(last) !== lastnameKey(member.lastname)) return false;
  const a = firstToken(first);
  const b = firstToken(member.firstname);
  if (!a || !b) return false;
  if (a === b) return true;
  return (a.length === 1 || b.length === 1) && a[0] === b[0];
}

const LINK_PATTERN = /\b(?:(https?:\/\/[^\s<>"]+)|(doi:\s*)?(10\.\d{4,9}\/[^\s<>"]+))/gi;

function trimTrailingPunctuation(value) {
  let s = value;
  // Keep a closing bracket only when it balances one inside the link, e.g.
  // DOIs like 10.1016/0000-0000(90)90000-X.
  const unbalanced = (open, close) => s.endsWith(close) && s.split(open).length < s.split(close).length;
  while (s && ('.,;:!?'.includes(s.slice(-1)) || unbalanced('(', ')') || unbalanced('[', ']'))) {
    s = s.slice(0, -1);
  }
  return s;
}

function linkifyText(text) {
  return text.replace(LINK_PATTERN, (match, url, doiPrefix, doi) => {
    const trimmed = trimTrailingPunctuation(match);
    const rest = match.slice(trimmed.length);
    const href = url ? trimmed : `https://doi.org/${trimTrailingPunctuation(doi)}`;
    return `<a href="${href}">${trimmed}</a>${rest}`;
  });
}

// Wraps bare URLs and DOIs (in text outside existing links) in <a> tags.
export function linkifyHTML(html) {
  let insideLink = false;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (/^<a[\s>]/i.test(part)) insideLink = true;
      else if (/^<\/a\s*>/i.test(part)) insideLink = false;
      else if (!part.startsWith('<') && !insideLink) return linkifyText(part);
      return part;
    })
    .join('');
}

const ALLOWED_TAGS = new Set(['a', 'b', 'i', 'em', 'strong', 'sup', 'sub', 'span', 'div', 'br']);
const SAFE_STYLE = /^(\s*(font-variant|font-style|font-weight|text-decoration|vertical-align)\s*:\s*[a-z-]+\s*;?)+\s*$/i;
const SAFE_CLASS = /^csl-[\w-]+$/;

function parseAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4]).replace(/"/g, '&quot;');
  }
  return attrs;
}

function sanitizeTag(match, slash, rawName, rawAttrs) {
  const name = rawName.toLowerCase();
  if (!ALLOWED_TAGS.has(name)) return '';
  if (slash) return name === 'br' ? '' : `</${name}>`;
  const attrs = parseAttributes(rawAttrs);
  if (name === 'a') {
    return /^https?:\/\//i.test(attrs.href || '')
      ? `<a href="${attrs.href}" target="_blank" rel="noopener">`
      : '<a>';
  }
  let kept = '';
  if (attrs.class && SAFE_CLASS.test(attrs.class)) kept += ` class="${attrs.class}"`;
  if (attrs.style && SAFE_STYLE.test(attrs.style)) kept += ` style="${attrs.style}"`;
  return `<${name}${kept}>`;
}

function unwrapDiv(html, className) {
  const open = new RegExp(`^<div class="${className}"[^>]*>`);
  if (!open.test(html)) return html;
  return html.replace(open, '').replace(/<\/div>\s*$/, '').trim();
}

// Turns Zotero's `bib` field (a csl-bib-body div holding one csl-entry)
// into safe inline HTML: tags outside a small formatting allowlist are
// dropped, links must be http(s) and open in a new tab.
export function cleanBibHTML(bib) {
  let html = String(bib ?? '').trim();
  html = unwrapDiv(html, 'csl-bib-body');
  html = unwrapDiv(html, 'csl-entry');
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  html = linkifyHTML(html);
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, sanitizeTag);
  return html.replace(/<(?![a-z/])/gi, '&lt;').trim();
}

// Last name of the creator a citation starts with, accent-free so "Kovač"
// sorts with "Kovac". First names are left out so that spelling variants
// ("A." / "Ada") don't split one person's works. Falls back to the title
// for creator-less items.
function authorSortName(data) {
  const creator = (data.creators || [])[0];
  if (!creator) return normalizeName(data.title);
  return normalizeName(splitCreatorName(creator).last);
}

// Selects the Zotero items with at least one creator (of the configured
// creator types) who is a member, in input order.
export function selectMemberPublications(items, members, { creatorTypes = DEFAULT_CREATOR_TYPES } = {}) {
  return items
    .filter((item) => item.data && !NON_PUBLICATION_TYPES.has(item.data.itemType))
    .filter((item) =>
      (item.data.creators || []).some(
        (creator) => creatorTypes.includes(creator.creatorType) && members.some((m) => creatorMatchesMember(creator, m))
      )
    )
    .map((item) => ({
      key: item.key,
      date: item.meta?.parsedDate || '',
      added: item.data.dateAdded || '',
      sortName: authorSortName(item.data),
      html: cleanBibHTML(item.bib),
    }));
}
