import { escapeHTML, getInitials, hashColor, memberSlug, resolvePortraitUrl, textMatchesQuery, wirePortraitFallback } from './shared.js';

export function sortMembersByLastname(members) {
  return [...members].sort((a, b) =>
    a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
  );
}

export function memberSearchText(member) {
  return `${member.firstname} ${member.lastname} ${member.affiliation || ''}`.trim().toLowerCase();
}

export function memberMatches(query, member) {
  return textMatchesQuery(query, memberSearchText(member));
}

export function participantSlugs(projects, members) {
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  const slugs = new Set();
  projects.forEach((project) => {
    (project.participants || []).forEach((email) => {
      const member = memberByEmail.get(email);
      if (member) slugs.add(memberSlug(member));
    });
  });
  return slugs;
}

function renderProjectsLink(member, participantSlugs) {
  const slug = memberSlug(member);
  return participantSlugs && participantSlugs.has(slug)
    ? `<a class="member-projects-link" href="projects.html#member=${escapeHTML(slug)}">Projects</a>`
    : '';
}

function renderPublicationsLink(member) {
  return member.orcid
    ? `<a class="member-publications-link" href="https://orcid.org/${escapeHTML(member.orcid)}" target="_blank" rel="noopener">Publications</a>`
    : '';
}

export function renderMemberCard(member, participantSlugs) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${escapeHTML(resolvePortraitUrl(member.portrait_url))}" alt="" data-portrait-fallback data-initials="${escapeHTML(initials)}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${escapeHTML(initials)}</div>`;
  return `<li class="member-card" id="${memberSlug(member)}" data-search="${escapeHTML(memberSearchText(member))}">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${escapeHTML(member.affiliation)}</p>${renderProjectsLink(member, participantSlugs)}${renderPublicationsLink(member)}</li>`;
}

export function renderMembers(members, container, participantSlugs) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-grid">${sorted.map((m) => renderMemberCard(m, participantSlugs)).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

export function renderMemberListItem(member, participantSlugs) {
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  return `<li class="member-list-item" data-search="${escapeHTML(memberSearchText(member))}"><span class="name">${nameHTML}</span>${
    member.affiliation ? `<span class="affiliation">${escapeHTML(member.affiliation)}</span>` : ''
  }${renderProjectsLink(member, participantSlugs)}${renderPublicationsLink(member)}</li>`;
}

export function renderMemberList(members, container, participantSlugs) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-list">${sorted.map((m) => renderMemberListItem(m, participantSlugs)).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  const gridContainer = document.getElementById('members-grid');
  const listContainer = document.getElementById('members-list');
  const filterInput = document.getElementById('member-filter');
  const filterEmptyState = document.getElementById('member-filter-empty');
  const toggle = document.getElementById('member-view-toggle');

  wirePortraitFallback(gridContainer);

  function applyFilter(query) {
    const items = document.querySelectorAll('#members-grid [data-search], #members-list [data-search]');
    let anyVisible = false;
    items.forEach((el) => {
      const match = textMatchesQuery(query, el.dataset.search);
      el.hidden = !match;
      if (match) anyVisible = true;
    });
    filterEmptyState.hidden = items.length === 0 || anyVisible;
  }
  filterInput.addEventListener('input', (e) => applyFilter(e.target.value));

  function setView(mode) {
    gridContainer.hidden = mode !== 'grid';
    listContainer.hidden = mode !== 'list';
    toggle.textContent = mode === 'grid' ? 'Switch to list view' : 'Switch to grid view';
  }
  let mode = window.innerWidth < 700 ? 'list' : 'grid';
  setView(mode);
  toggle.addEventListener('click', () => {
    mode = mode === 'grid' ? 'list' : 'grid';
    setView(mode);
  });
}
