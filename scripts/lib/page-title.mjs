import { marked } from 'marked';
import { getDocType, titleFromFilename } from '../../assets/js/shared.js';

// Decodes only the small, fixed set of entities that can appear in a
// heading's rendered HTML — either introduced by marked.parse() escaping
// text content, or written directly by the author of a raw HTML page
// (conventionally the same entities either way). Not a general-purpose
// HTML entity decoder; &amp; is decoded last so an entity reference an
// author actually typed (e.g. "&amp;lt;", meant to display as "&lt;")
// doesn't get unescaped a second time.
function decodeBasicEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Derives a page's display title from its first <h1>, falling back to a
// title-cased version of the filename if there isn't one. The heading's
// HTML entities are always decoded back to plain text — whether they came
// from marked.parse() escaping a markdown heading, or an HTML-page author
// writing e.g. &quot; directly — because the extracted title is plain text
// that other code (the <title> tag, the admin editor's page list) escapes
// again on its own; leaving entities in would double-escape them.
export function extractPageTitle(source, filename) {
  const bodyHTML = getDocType(filename) === 'markdown' ? marked.parse(source) : source;
  const headingMatch = bodyHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (!headingMatch) return titleFromFilename(filename);
  return decodeBasicEntities(headingMatch[1].replace(/<[^>]+>/g, ''));
}
