export function buildGraphData(projects, members) {
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  const nodes = [];
  const links = [];
  const seenScholars = new Set();

  projects.forEach((project) => {
    nodes.push({ id: `project:${project.id}`, type: 'project', data: project });
    (project.participants || []).forEach((email) => {
      const member = memberByEmail.get(email);
      if (!member) {
        console.warn(`Project "${project.id}" references unknown participant "${email}"`);
        return;
      }
      const scholarId = `scholar:${email}`;
      if (!seenScholars.has(scholarId)) {
        nodes.push({ id: scholarId, type: 'scholar', data: member });
        seenScholars.add(scholarId);
      }
      links.push({ source: `project:${project.id}`, target: scholarId });
    });
  });

  return { nodes, links };
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
  const memberByEmail = new Map(members.map((m) => [m.email, m]));
  return projects.map((project) => ({
    ...project,
    participantNames: (project.participants || [])
      .map((email) => memberByEmail.get(email))
      .filter(Boolean)
      .map((m) => ({ name: `${m.firstname} ${m.lastname}`, email: m.email })),
  }));
}
