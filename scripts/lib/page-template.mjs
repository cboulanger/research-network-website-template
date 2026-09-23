import { navHTML, skipLinkHTML, escapeHTML } from '../../assets/js/shared.js';

export function renderPage({ title, activePage, bannerLabel, favicon, mainHTML, footerHTML = '', bodyScripts = [], vendorScripts = [], pathPrefix = '' }) {
  const faviconTag = favicon ? `<link rel="icon" href="${pathPrefix}images/${escapeHTML(favicon)}">` : '';
  const vendorScriptTags = vendorScripts.map((src) => `<script src="${pathPrefix}${src}"></script>`).join('\n  ');
  const scriptTags = bodyScripts.map((src) => `<script type="module" src="${pathPrefix}${src}"></script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="${pathPrefix}assets/css/style.css">
  ${faviconTag}
</head>
<body>
  ${skipLinkHTML()}
  ${navHTML(activePage, bannerLabel).replace(/href="/g, `href="${pathPrefix}`)}
  <main id="main-content">
${mainHTML}
  </main>
  ${footerHTML}
  ${vendorScriptTags}
  ${scriptTags}
</body>
</html>
`;
}
