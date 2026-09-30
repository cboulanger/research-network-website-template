import { readContentFile, writeContentFile } from './lib/content-store.mjs';
import { computeMemberId } from '../assets/js/shared.js';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function migrateMemberIds(members, projects) {
  const usedIds = new Set(members.filter((m) => ID_PATTERN.test(m.id || '')).map((m) => m.id));
  const idByEmail = new Map();
  const assignedIds = [];

  const migratedMembers = members.map((member) => {
    if (ID_PATTERN.test(member.id || '')) {
      idByEmail.set(member.email, member.id);
      return member;
    }
    const base = computeMemberId(member.firstname, member.lastname);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    idByEmail.set(member.email, id);
    assignedIds.push({ name: `${member.firstname} ${member.lastname}`, id });
    return { ...member, id };
  });

  const warnings = [];
  let rewrittenParticipants = 0;
  const migratedProjects = projects.map((project) => {
    if (!Array.isArray(project.participants)) return project;
    const participants = project.participants.map((value) => {
      if (idByEmail.has(value)) {
        rewrittenParticipants += 1;
        return idByEmail.get(value);
      }
      if (usedIds.has(value)) return value;
      warnings.push(`Project "${project.id}" references unknown participant "${value}"`);
      return value;
    });
    return { ...project, participants };
  });

  return { members: migratedMembers, projects: migratedProjects, assignedIds, rewrittenParticipants, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const contentPath = args.find((a) => a !== '--apply') || process.env.CONTENT_PATH || './content';

  const members = JSON.parse(await readContentFile(contentPath, 'data/members.json'));
  const projects = JSON.parse(await readContentFile(contentPath, 'data/projects.json'));

  const result = migrateMemberIds(members, projects);

  console.log(`Members: ${result.assignedIds.length} assigned a new id (${members.length} total)`);
  result.assignedIds.forEach(({ name, id }) => console.log(`  - ${name} -> ${id}`));
  console.log(`Projects: ${result.rewrittenParticipants} participant reference(s) rewritten from email to id`);
  if (result.warnings.length) {
    console.log('Warnings:');
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (!apply) {
    console.log('Dry run only - no files written. Re-run with --apply to write changes.');
    return;
  }

  await writeContentFile(contentPath, 'data/members.json', JSON.stringify(result.members, null, 2) + '\n');
  await writeContentFile(contentPath, 'data/projects.json', JSON.stringify(result.projects, null, 2) + '\n');
  console.log('Wrote data/members.json and data/projects.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
