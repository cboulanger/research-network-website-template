export function findProjectsReferencingMember(projects, memberId) {
  return projects.filter((p) => Array.isArray(p.participants) && p.participants.includes(memberId));
}

export function cascadeDeleteMember(members, projects, memberId) {
  const remainingMembers = members.filter((m) => m.id !== memberId);
  const updatedProjects = projects.map((p) =>
    Array.isArray(p.participants) && p.participants.includes(memberId)
      ? { ...p, participants: p.participants.filter((id) => id !== memberId) }
      : p
  );
  return { members: remainingMembers, projects: updatedProjects };
}
