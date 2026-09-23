import { getInitials, hashColor, fetchJSON, initNav, wirePortraitFallback, escapeHTML } from './shared.js';

export function sortMembersByLastname(members) {
  return [...members].sort((a, b) =>
    a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
  );
}

export function renderMemberCard(member) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${escapeHTML(member.portrait_url)}" alt="" data-portrait-fallback data-initials="${escapeHTML(initials)}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${escapeHTML(initials)}</div>`;
  return `<li class="member-card" id="${encodeURIComponent(member.email)}">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${escapeHTML(member.affiliation)}</p></li>`;
}

export function renderMembers(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-grid">${sorted.map(renderMemberCard).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

export function memberMatches(query, member) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = `${member.firstname} ${member.lastname}`.toLowerCase();
  const affiliation = (member.affiliation || '').toLowerCase();
  return name.includes(q) || affiliation.includes(q);
}

export function renderMemberListItem(member) {
  const firstname = escapeHTML(member.firstname);
  const lastname = escapeHTML(member.lastname);
  const nameHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${firstname} ${lastname}</a>`
    : `${firstname} ${lastname}`;
  return `<li class="member-list-item"><span class="name">${nameHTML}</span>${
    member.affiliation ? `<span class="affiliation">${escapeHTML(member.affiliation)}</span>` : ''
  }</li>`;
}

export function renderMemberList(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-list">${sorted.map(renderMemberListItem).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

function setView(mode) {
  document.getElementById('members-grid').hidden = mode !== 'grid';
  document.getElementById('members-list').hidden = mode !== 'list';
  document.getElementById('member-view-toggle').textContent =
    mode === 'grid' ? 'Switch to list view' : 'Switch to grid view';
}

if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  initNav('members');
  const gridContainer = document.getElementById('members-grid');
  const listContainer = document.getElementById('members-list');
  const filterInput = document.getElementById('member-filter');
  const toggle = document.getElementById('member-view-toggle');

  fetchJSON('data/members.json')
    .then((members) => {
      function render(query) {
        const filtered = members.filter((m) => memberMatches(query, m));
        renderMembers(filtered, gridContainer);
        renderMemberList(filtered, listContainer);
        wirePortraitFallback(gridContainer);
      }
      render('');

      filterInput.addEventListener('input', (e) => render(e.target.value));

      let mode = window.innerWidth < 700 ? 'list' : 'grid';
      setView(mode);
      toggle.addEventListener('click', () => {
        mode = mode === 'grid' ? 'list' : 'grid';
        setView(mode);
      });
    })
    .catch((err) => {
      gridContainer.innerHTML = '<p class="error-state">Couldn\'t load member data.</p>';
      console.error(err);
    });
}
