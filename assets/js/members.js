import { getInitials, hashColor, fetchJSON, initNav, wirePortraitFallback } from './shared.js';

export function sortMembersByLastname(members) {
  return [...members].sort((a, b) =>
    a.lastname.localeCompare(b.lastname, undefined, { sensitivity: 'base' })
  );
}

export function renderMemberCard(member) {
  const initials = getInitials(member.firstname, member.lastname);
  const color = hashColor(member.email);
  const nameHTML = member.url
    ? `<a href="${member.url}" target="_blank" rel="noopener">${member.firstname} ${member.lastname}</a>`
    : `${member.firstname} ${member.lastname}`;
  const portrait = member.portrait_url
    ? `<img class="avatar" src="${member.portrait_url}" alt="" data-portrait-fallback data-initials="${initials}" data-avatar-color="${color}">`
    : `<div class="avatar-fallback" style="background-color:${color}">${initials}</div>`;
  return `<li class="member-card">${portrait}<h3>${nameHTML}</h3><p class="affiliation">${member.affiliation}</p><p class="email"><a href="mailto:${member.email}">${member.email}</a></p></li>`;
}

export function renderMembers(members, container) {
  const sorted = sortMembersByLastname(members);
  container.innerHTML = sorted.length
    ? `<ul class="member-grid">${sorted.map(renderMemberCard).join('')}</ul>`
    : '<p class="empty-state">No members yet.</p>';
}

if (typeof document !== 'undefined' && document.getElementById('members-grid')) {
  initNav('members');
  const container = document.getElementById('members-grid');
  fetchJSON('data/members.json')
    .then((members) => {
      renderMembers(members, container);
      wirePortraitFallback(container);
    })
    .catch((err) => {
      container.innerHTML = '<p class="error-state">Couldn\'t load member data.</p>';
      console.error(err);
    });
}
