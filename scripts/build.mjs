import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { resolveContent } from './lib/resolve-content.mjs';
import { renderPage } from './lib/page-template.mjs';
import { rewritePagesUrl } from './lib/rewrite-pages-url.mjs';
import { escapeHTML } from '../assets/js/shared.js';
import { isValidDocFilename, getDocType, titleFromFilename } from '../assets/js/shared.js';
import { renderNewsTeaser, renderNews } from '../assets/js/news.js';
import { renderEventsTeaser, renderEvents } from '../assets/js/events.js';
import { renderMembers, renderMemberList, participantSlugs } from '../assets/js/members.js';
import { buildGraphData, renderListView, sanitizeGraphData } from '../assets/js/projects-graph.js';

const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR_OVERRIDE || 'public');

async function loadContent(contentDir) {
  const readJSON = async (name) => JSON.parse(await readFile(path.join(contentDir, 'data', `${name}.json`), 'utf8'));
  return {
    site: await readJSON('site'),
    members: await readJSON('members'),
    projects: await readJSON('projects'),
    events: await readJSON('events'),
    news: await readJSON('news'),
  };
}

function withRewrittenUrls(items) {
  return items.map((item) => ({ ...item, url: rewritePagesUrl(item.url) }));
}

async function buildIndexPage(content) {
  const { site } = content;
  const logoTag = site.logo
    ? `<img class="hero-logo" src="images/${escapeHTML(site.logo)}" alt="${escapeHTML(site.title)}">`
    : '';
  const aboutMarkdown = await readFile(path.join(content.contentDir, 'pages', 'about.md'), 'utf8');
  const aboutHTML = marked.parse(aboutMarkdown);

  const newsTeaser = {};
  renderNewsTeaser(withRewrittenUrls(content.news), newsTeaser);
  const eventsTeaser = {};
  renderEventsTeaser(withRewrittenUrls(content.events), eventsTeaser);

  const mainHTML = `
    <section class="hero">
      <div class="hero-inner">
        ${logoTag}
        <div class="hero-text">
          <h1>${escapeHTML(site.title)}</h1>
          <p>${escapeHTML(site.subtitle)}</p>
        </div>
      </div>
    </section>
    <div class="landing-columns">
      <div class="landing-box doc-content" id="about-box">${aboutHTML}</div>
      <div class="landing-sidebar">
        <div class="landing-box">
          <h2>News</h2>
          <div id="news-teaser">${newsTeaser.innerHTML}</div>
        </div>
        <div class="landing-box">
          <h2>Events</h2>
          <div id="events-teaser">${eventsTeaser.innerHTML}</div>
        </div>
      </div>
    </div>`;

  const footerHTML = `<footer>
    <p><a href="members.html">Members</a> &middot; <a href="projects.html">Projects</a> &middot; <a href="events.html">Events</a> &middot; <a href="news.html">News</a></p>
  </footer>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'index.html'),
    renderPage({
      title: site.title,
      activePage: 'home',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      footerHTML,
    })
  );
}

async function buildMembersPage(content) {
  const { site, members, projects } = content;
  const slugsWithProjects = participantSlugs(projects, members);
  const gridContainer = {};
  renderMembers(members, gridContainer, slugsWithProjects);
  const listContainer = {};
  renderMemberList(members, listContainer, slugsWithProjects);

  const mainHTML = `
    <h1>Members</h1>
    <div class="list-controls">
      <input type="search" id="member-filter" class="filter-input" placeholder="Filter by name or affiliation" aria-label="Filter members">
      <button id="member-view-toggle" class="view-toggle-btn" type="button">Switch to list view</button>
    </div>
    <p id="member-filter-empty" class="empty-state" hidden>No members match your filter.</p>
    <div id="members-grid">${gridContainer.innerHTML}</div>
    <div id="members-list" hidden>${listContainer.innerHTML}</div>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'members.html'),
    renderPage({
      title: `Members — ${site.bannerLabel}`,
      activePage: 'members',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      bodyScripts: ['assets/js/members.js'],
    })
  );
}

async function buildEventsPage(content) {
  const { site, events } = content;
  const listContainer = {};
  renderEvents(withRewrittenUrls(events), listContainer);
  const mainHTML = `<h1>Events</h1>\n<div id="events-list">${listContainer.innerHTML}</div>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'events.html'),
    renderPage({
      title: `Events — ${site.bannerLabel}`,
      activePage: 'events',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
    })
  );
}

async function buildNewsPage(content) {
  const { site, news } = content;
  const listContainer = {};
  renderNews(withRewrittenUrls(news), listContainer);
  const mainHTML = `<h1>News</h1>\n<div id="news-list">${listContainer.innerHTML}</div>`;
  await writeFile(
    path.join(PUBLIC_DIR, 'news.html'),
    renderPage({
      title: `News — ${site.bannerLabel}`,
      activePage: 'news',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
    })
  );
}

async function buildPagesDocs(content) {
  const { site } = content;
  const pagesDir = path.join(content.contentDir, 'pages');
  await mkdir(path.join(PUBLIC_DIR, 'pages'), { recursive: true });
  const entries = (await readdir(pagesDir)).filter(isValidDocFilename);

  for (const filename of entries) {
    const source = await readFile(path.join(pagesDir, filename), 'utf8');
    const type = getDocType(filename);
    const bodyHTML = type === 'markdown' ? marked.parse(source) : source;
    const headingMatch = bodyHTML.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = headingMatch ? headingMatch[1].replace(/<[^>]+>/g, '') : titleFromFilename(filename);
    const outName = filename.replace(/\.(md|html)$/, '.html');

    const mainHTML = `<div id="page-content" class="doc-content">${bodyHTML}</div>\n<p id="page-back-link"></p>`;
    await writeFile(
      path.join(PUBLIC_DIR, 'pages', outName),
      renderPage({
        title: `${title} — ${site.bannerLabel}`,
        activePage: 'pages',
        bannerLabel: site.bannerLabel,
        favicon: site.favicon,
        mainHTML,
        bodyScripts: ['assets/js/page-back-link.js'],
        pathPrefix: '../',
      })
    );
  }
}

async function buildProjectsPage(content) {
  const { site, projects, members } = content;
  const listContainer = {};
  renderListView(projects, members, listContainer);

  const { nodes, links } = buildGraphData(projects, members);
  const graphData = sanitizeGraphData(nodes, links);
  await mkdir(path.join(PUBLIC_DIR, 'assets'), { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, 'assets', 'projects-graph-data.json'), JSON.stringify(graphData));

  const mainHTML = `
    <h1>Projects</h1>
    <div class="list-controls">
      <input type="search" id="project-filter" class="filter-input" placeholder="Filter by scholar or project title" aria-label="Filter projects and scholars">
      <button id="view-toggle" class="view-toggle-btn" type="button">Switch to graph view</button>
    </div>
    <p id="member-focus-banner" class="member-focus-banner" hidden>Showing projects of <strong id="member-focus-name"></strong> &middot; <button id="member-focus-clear" class="link-button" type="button">Show all</button></p>
    <div id="graph-view" hidden>
      <svg id="graph-svg"></svg>
      <div id="scholar-tooltip" class="scholar-tooltip" hidden></div>
    </div>
    <div id="list-view">
      <ul id="project-list">${listContainer.innerHTML}</ul>
    </div>
    <div id="project-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
      <div class="modal-content">
        <button id="modal-close" type="button" aria-label="Close">&times;</button>
        <img id="modal-image" alt="">
        <h2 id="modal-title"></h2>
        <p id="modal-subtitle"></p>
        <p id="modal-description"></p>
        <a id="modal-link" target="_blank" rel="noopener">Visit project &#8599;</a>
      </div>
    </div>`;

  await writeFile(
    path.join(PUBLIC_DIR, 'projects.html'),
    renderPage({
      title: `Projects — ${site.bannerLabel}`,
      activePage: 'projects',
      bannerLabel: site.bannerLabel,
      favicon: site.favicon,
      mainHTML,
      vendorScripts: projects.length ? ['assets/vendor/d3.min.js'] : [],
      bodyScripts: projects.length ? ['assets/js/projects-graph.js'] : [],
    })
  );
}

async function main() {
  const contentDir = await resolveContent();
  const content = { ...(await loadContent(contentDir)), contentDir };

  await mkdir(PUBLIC_DIR, { recursive: true });
  await buildIndexPage(content);
  await buildMembersPage(content);
  await buildEventsPage(content);
  await buildNewsPage(content);
  await buildPagesDocs(content);
  await buildProjectsPage(content);

  await cp('assets/css', path.join(PUBLIC_DIR, 'assets', 'css'), { recursive: true });
  await cp(path.join(content.contentDir, 'images'), path.join(PUBLIC_DIR, 'images'), { recursive: true });
  await mkdir(path.join(PUBLIC_DIR, 'assets', 'js'), { recursive: true });
  for (const file of ['members.js', 'projects-graph.js', 'page-back-link.js', 'shared.js']) {
    await cp(path.join('assets', 'js', file), path.join(PUBLIC_DIR, 'assets', 'js', file));
  }
  if (content.projects.length) {
    await mkdir(path.join(PUBLIC_DIR, 'assets', 'vendor'), { recursive: true });
    await cp('node_modules/d3/dist/d3.min.js', path.join(PUBLIC_DIR, 'assets', 'vendor', 'd3.min.js'));
  }

  console.log(`Built into ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
