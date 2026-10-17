import { marked } from 'marked';
import { getDocType, titleFromFilename } from '../../assets/js/shared.js';

// marked only ever produces this fixed set of entities when escaping text
// content, so this undoes exactly its own escaping rather than acting as a
// general-purpose HTML entity decoder.
function decodeBasicEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Derives a page's display title from its first <h1>, falling back to a
// title-cased version of the filename if there isn't one. For markdown
// pages, the heading's rendered HTML is unescaped back to plain text:
// marked.parse() escapes text content (a literal " becomes &quot;), which
// is correct for the page's rendered body but must be undone for the
// title, since the title is plain text that other code (the <title> tag,
// the admin editor's page list) escapes again on its own.
export function extractPageTitle(source, filename) {
  const bodyHTML = getDocType(filename) === 'markdown' ? marked.parse(source) : source;
  const headingMatch = bodyHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (!headingMatch) return titleFromFilename(filename);
  return decodeBasicEntities(headingMatch[1].replace(/<[^>]+>/g, ''));
}
