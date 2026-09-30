import { escapeHTML, getInitials, hashColor, resolvePortraitUrl } from './shared.js';

export function buildGraphData(projects, members) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const nodes = [];
  const links = [];
  const seenScholars = new Set();

  projects.forEach((project) => {
    nodes.push({ id: `project:${project.id}`, type: 'project', data: project });
    (project.participants || []).forEach((id) => {
      const member = memberById.get(id);
      if (!member) {
        console.warn(`Project "${project.id}" references unknown participant "${id}"`);
        return;
      }
      const scholarId = `scholar:${id}`;
      if (!seenScholars.has(scholarId)) {
        nodes.push({ id: scholarId, type: 'scholar', data: member });
        seenScholars.add(scholarId);
      }
      links.push({ source: `project:${project.id}`, target: scholarId });
    });
  });

  return { nodes, links };
}

export function sanitizeGraphData(nodes, links) {
  const idMap = new Map();
  const sanitizedNodes = nodes.map((n) => {
    if (n.type === 'project') {
      const { id, title, subtitle, description, url, image_url } = n.data;
      idMap.set(n.id, n.id);
      return { id: n.id, type: 'project', data: { id, title, subtitle, description, url, image_url } };
    }
    const { id, firstname, lastname, affiliation, portrait_url, url } = n.data;
    idMap.set(n.id, n.id);
    return {
      id: n.id,
      type: 'scholar',
      data: { firstname, lastname, affiliation, portrait_url: resolvePortraitUrl(portrait_url), url, slug: id },
    };
  });
  const sanitizedLinks = links.map((l) => {
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    return {
      source: idMap.get(sourceId) ?? sourceId,
      target: idMap.get(targetId) ?? targetId,
    };
  });
  return { nodes: sanitizedNodes, links: sanitizedLinks };
}

export function filterMatches(query, node) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (node.type === 'project') {
    return node.data.title.toLowerCase().includes(q);
  }
  return `${node.data.firstname} ${node.data.lastname}`.toLowerCase().includes(q);
}

export function buildProjectListItems(projects, members) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  return projects.map((project) => ({
    ...project,
    participantNames: (project.participants || [])
      .map((id) => memberById.get(id))
      .filter(Boolean)
      .map((m) => ({
        name: m.affiliation ? `${m.firstname} ${m.lastname} (${m.affiliation})` : `${m.firstname} ${m.lastname}`,
        slug: m.id,
      })),
  }));
}

export function renderListView(projects, members, container) {
  const items = buildProjectListItems(projects, members);
  container.innerHTML = items.length
    ? items
        .map(
          (p) => `<li data-participants="${escapeHTML(p.participantNames.map((s) => s.slug).join(' '))}">
            <h3>${escapeHTML(p.title)}</h3>
            ${p.subtitle ? `<p class="subtitle">${escapeHTML(p.subtitle)}</p>` : ''}
            ${p.description ? `<p>${escapeHTML(p.description)}</p>` : ''}
            <p class="participants">${p.participantNames
              .map((s) => `<a href="members.html#${s.slug}" data-slug="${s.slug}">${escapeHTML(s.name)}</a>`)
              .join(', ')}</p>
            ${p.url ? `<a href="${escapeHTML(p.url)}" target="_blank" rel="noopener">Visit project &#8599;</a>` : ''}
          </li>`
        )
        .join('')
    : '<li class="empty-state">No projects yet.</li>';
}

export function parseMemberHash(hash) {
  const match = /^#?member=(.+)$/.exec(hash || '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function participantsInclude(participantsAttr, slug) {
  return (participantsAttr || '').split(/\s+/).includes(slug);
}

export function focusListOnMember(container, slug) {
  container.querySelectorAll('li[data-participants]').forEach((li) => {
    li.hidden = !participantsInclude(li.dataset.participants, slug);
  });
  container.querySelectorAll('a[data-slug]').forEach((a) => {
    a.classList.toggle('participant-focused', a.dataset.slug === slug);
  });
}

export function clearListFocus(container) {
  container.querySelectorAll('li[data-participants]').forEach((li) => {
    li.hidden = false;
  });
  container.querySelectorAll('a.participant-focused').forEach((a) => a.classList.remove('participant-focused'));
}

let lastFocusedBeforeModal = null;

function handleModalKeydown(event) {
  const modal = document.getElementById('project-modal');
  if (event.key === 'Escape') {
    closeModal();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = modal.querySelectorAll('button, a[href]');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openModal(project) {
  const modal = document.getElementById('project-modal');
  document.getElementById('modal-title').textContent = project.title;
  document.getElementById('modal-subtitle').textContent = project.subtitle || '';
  document.getElementById('modal-description').textContent = project.description || '';

  const img = document.getElementById('modal-image');
  if (project.image_url) {
    img.src = project.image_url;
    img.hidden = false;
  } else {
    img.hidden = true;
  }

  const link = document.getElementById('modal-link');
  if (project.url) {
    link.href = project.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  lastFocusedBeforeModal = document.activeElement;
  modal.hidden = false;
  document.getElementById('modal-close').focus();
  document.addEventListener('keydown', handleModalKeydown);
}

function closeModal() {
  document.getElementById('project-modal').hidden = true;
  document.removeEventListener('keydown', handleModalKeydown);
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
    lastFocusedBeforeModal.focus();
  }
}

function showScholarLabel(member, x, y) {
  const tooltip = document.getElementById('scholar-tooltip');
  if (!tooltip) return;
  const name = member.affiliation
    ? `${member.firstname} ${member.lastname} (${member.affiliation})`
    : `${member.firstname} ${member.lastname}`;
  tooltip.innerHTML = member.url
    ? `<a href="${escapeHTML(member.url)}" target="_blank" rel="noopener">${escapeHTML(name)}</a>`
    : escapeHTML(name);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.hidden = false;
}

function hideScholarLabel() {
  const tooltip = document.getElementById('scholar-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function highlight(centerNode, links, nodeSel, linkSel) {
  const connected = new Set([centerNode.id]);
  links.forEach((l) => {
    if (l.source.id === centerNode.id) connected.add(l.target.id);
    if (l.target.id === centerNode.id) connected.add(l.source.id);
  });
  nodeSel.classed('node-dimmed', (d) => !connected.has(d.id));
  linkSel.classed('node-dimmed', (l) => !(connected.has(l.source.id) && connected.has(l.target.id)));
}

function applyFilter(query, nodes, nodeSel, linkSel) {
  if (!query.trim()) {
    nodeSel.classed('node-dimmed', false);
    linkSel.classed('node-dimmed', false);
    return;
  }
  const matching = new Set(nodes.filter((n) => filterMatches(query, n)).map((n) => n.id));
  nodeSel.classed('node-dimmed', (d) => !matching.has(d.id));
  linkSel.classed('node-dimmed', (l) => !(matching.has(l.source.id) && matching.has(l.target.id)));
}

function renderGraphView(nodes, links, svg, { reducedMotion = false, onScholarClick = () => {} } = {}) {
  const width = svg.clientWidth || 900;
  const height = 600;
  const d3svg = d3.select(svg).attr('viewBox', [0, 0, width, height]);
  d3svg.selectAll('*').remove();

  d3svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'project-box-clip')
    .append('rect')
    .attr('x', -80)
    .attr('y', -28)
    .attr('width', 160)
    .attr('height', 56);

  const zoomLayer = d3svg.append('g');
  d3svg.call(
    d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => zoomLayer.attr('transform', event.transform))
  );

  const simulation = d3
    .forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-250))
    .force('link', d3.forceLink(links).id((d) => d.id).distance(110))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(90));

  if (reducedMotion) {
    simulation.stop();
    for (let i = 0; i < 300; i += 1) simulation.tick();
  }

  const link = zoomLayer.append('g').attr('stroke', '#ccc').selectAll('line').data(links).join('line');

  const node = zoomLayer
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => (d.type === 'project' ? 'project-box' : 'scholar-circle'))
    .call(
      d3
        .drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'project') {
      g.append('rect').attr('width', 160).attr('height', 56).attr('x', -80).attr('y', -28).attr('rx', 8);
      const label = d.data.title.length > 24 ? d.data.title.slice(0, 23) + '…' : d.data.title;
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 4)
        .attr('clip-path', 'url(#project-box-clip)')
        .text(label);
      g.append('title').text(d.data.subtitle ? `${d.data.title}\n${d.data.subtitle}` : d.data.title);
      g.style('cursor', 'pointer').on('click', () => openModal(d.data));
    } else {
      const initials = getInitials(d.data.firstname, d.data.lastname);
      const color = hashColor(d.data.slug);
      g.append('circle').attr('r', 26).attr('fill', color);
      const initialsText = () =>
        g.append('text').attr('text-anchor', 'middle').attr('dy', 4).attr('fill', '#fff').text(initials);
      if (d.data.portrait_url) {
        g.append('image')
          .attr('href', d.data.portrait_url)
          .attr('x', -26)
          .attr('y', -26)
          .attr('width', 52)
          .attr('height', 52)
          .on('error', function () {
            d3.select(this).remove();
            initialsText();
          });
      } else {
        initialsText();
      }
      g.style('cursor', 'pointer').on('click', (event) => {
        event.stopPropagation();
        onScholarClick(d, event);
      });
    }
  });

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  if (reducedMotion) {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  // Callbacks waiting for the layout to stop moving, e.g. to anchor a tooltip
  // to a node's final position. With reduced motion the layout is pre-computed.
  let settled = reducedMotion;
  const settledCallbacks = [];
  simulation.on('end', () => {
    settled = true;
    settledCallbacks.splice(0).forEach((cb) => cb());
  });
  const whenSettled = (cb) => (settled ? cb() : settledCallbacks.push(cb));

  return { node, link, whenSettled };
}

function setView(mode) {
  document.getElementById('graph-view').hidden = mode !== 'graph';
  document.getElementById('list-view').hidden = mode !== 'list';
  document.getElementById('view-toggle').textContent =
    mode === 'graph' ? 'Switch to list view' : 'Switch to graph view';
}

if (typeof document !== 'undefined' && document.getElementById('graph-svg')) {
  fetch('assets/projects-graph-data.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load graph data: ${res.status}`);
      return res.json();
    })
    .then(({ nodes, links }) => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const filterInput = document.getElementById('project-filter');
      const listContainer = document.getElementById('project-list');
      const banner = document.getElementById('member-focus-banner');
      let focusedSlug = null;

      // Focus a scholar in both views: dim unrelated graph nodes, hide
      // unrelated projects in the list, and name the member in the banner.
      function focusMember(scholarNode) {
        const { firstname, lastname, slug } = scholarNode.data;
        filterInput.value = '';
        highlight(scholarNode, links, node, link);
        focusListOnMember(listContainer, slug);
        document.getElementById('member-focus-name').textContent = `${firstname} ${lastname}`;
        banner.hidden = false;
        focusedSlug = slug;
        if (parseMemberHash(location.hash) !== slug) {
          history.replaceState(null, '', `#member=${encodeURIComponent(slug)}`);
        }
      }

      function clearMemberFocus() {
        if (!focusedSlug) return;
        focusedSlug = null;
        applyFilter('', nodes, node, link);
        clearListFocus(listContainer);
        banner.hidden = true;
        hideScholarLabel();
        if (parseMemberHash(location.hash)) {
          history.replaceState(null, '', location.pathname + location.search);
        }
      }

      function focusFromHash() {
        const slug = parseMemberHash(location.hash);
        const target = slug && nodes.find((n) => n.id === `scholar:${slug}`);
        if (!target) {
          clearMemberFocus();
          return;
        }
        focusMember(target);
        hideScholarLabel();
        whenSettled(() => {
          if (focusedSlug !== slug || document.getElementById('graph-view').hidden) return;
          const el = node.filter((d) => d.id === target.id).node();
          const rect = el.getBoundingClientRect();
          showScholarLabel(target.data, rect.left + rect.width / 2, rect.top);
        });
      }

      const { node, link, whenSettled } = renderGraphView(nodes, links, document.getElementById('graph-svg'), {
        reducedMotion,
        onScholarClick: (d, event) => {
          focusMember(d);
          showScholarLabel(d.data, event.clientX, event.clientY);
        },
      });

      filterInput.addEventListener('input', (e) => {
        clearMemberFocus();
        applyFilter(e.target.value, nodes, node, link);
      });

      document.getElementById('member-focus-clear').addEventListener('click', clearMemberFocus);
      window.addEventListener('hashchange', focusFromHash);

      document.getElementById('modal-close').addEventListener('click', closeModal);
      document.getElementById('project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'project-modal') closeModal();
      });

      document.addEventListener('click', hideScholarLabel);

      const toggle = document.getElementById('view-toggle');
      let mode = window.innerWidth < 700 ? 'list' : 'graph';
      setView(mode);
      toggle.addEventListener('click', () => {
        mode = mode === 'graph' ? 'list' : 'graph';
        setView(mode);
      });

      focusFromHash();
    })
    .catch((err) => {
      // The static list view (already in the page) remains the fallback —
      // nothing to replace it with; just log for diagnosis.
      console.error(err);
    });
}
