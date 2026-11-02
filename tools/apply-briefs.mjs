// Writes new image descriptions from a briefs file into the case files.
//   node tools/apply-briefs.mjs prompts/briefs/region-01.json [--force] [--dry-run]
// Only fills gaps: a person, place or exhibit that already has a description keeps it, unless --force.
// "noPhoto" entries mark an exhibit as deliberately without a photo, with the reason (the audit skips it).
// "rename": { personId: "New Name" } renames a minor character whose name collides with another case's person
// (the person and any exhibit title carrying the old name). A top-level "continuity" list adds imageContinuity
// entries to _campaign.json (same face across cases).
import fs from 'node:fs';
import path from 'node:path';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/apply-briefs.mjs prompts/briefs/region-01.json [--force] [--dry-run]'); process.exit(1); }
const force = rest.includes('--force'), dry = rest.includes('--dry-run');
const briefs = JSON.parse(fs.readFileSync(file, 'utf8'));
const pad = n => String(n).padStart(3, '0');
let added = 0, kept = 0, marked = 0; const unknown = [];
for (const [n, b] of Object.entries(briefs)) {
  if (!/^\d+$/.test(n)) continue;
  const f = path.join('www/cases', `case-${pad(+n)}.json`);
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const set = (list, id, kind, val) => {
    const x = list.find(y => y.id === id);
    if (!x) { unknown.push(`case ${n} ${id}`); return; }
    if (x.image?.brief && !force) { kept++; return; }
    const brief = typeof val === 'string' ? val : val.brief;
    x.image = { kind: typeof val === 'object' && val.kind ? val.kind : kind, brief, ...(kind === 'portrait' ? { ref: x.image?.ref ?? null } : {}) };
    delete x.noPhoto; added++;
    console.log(`  case ${n} ${id}: ${brief.slice(0, 90)}${brief.length > 90 ? '…' : ''}`);
  };
  for (const [id, v] of Object.entries(b.people || {})) set(c.people, id, 'portrait', v);
  for (const [id, v] of Object.entries(b.locations || {})) set(c.locations, id, 'location', v);
  for (const [id, v] of Object.entries(b.evidence || {})) set(c.evidence, id, 'evidence', v);
  for (const [id, name] of Object.entries(b.rename || {})) {
    const p = c.people.find(y => y.id === id); if (!p) { unknown.push(`case ${n} ${id}`); continue; }
    if (p.name === name) continue;
    const old = p.name; p.name = name;
    for (const e of c.evidence) if (e.title?.includes(old)) e.title = e.title.replaceAll(old, name);
    console.log(`  case ${n} ${id}: renamed ${old} → ${name}`); added++;
  }
  for (const [id, why] of Object.entries(b.noPhoto || {})) { const e = c.evidence.find(y => y.id === id); if (!e) { unknown.push(`case ${n} ${id}`); continue; } e.noPhoto = why; marked++; console.log(`  case ${n} ${id}: no photo (${why.slice(0, 70)}…)`); }
  if (!dry) fs.writeFileSync(f, JSON.stringify(c, null, 2));
}
if (Array.isArray(briefs.continuity)) {
  const cf = path.join('www/cases', '_campaign.json'), camp = JSON.parse(fs.readFileSync(cf, 'utf8'));
  camp.imageContinuity ||= [];
  for (const e of briefs.continuity) if (!camp.imageContinuity.some(x => x.key === e.key)) { camp.imageContinuity.push(e); console.log(`  continuity: ${e.key}${e.recurring ? ' → ' + e.recurring : ''}`); }
  if (!dry) fs.writeFileSync(cf, JSON.stringify(camp, null, 2));
}
console.log(`${dry ? 'Would add' : 'Added'} ${added} descriptions, kept ${kept} existing, marked ${marked} as drawn on purpose.`);
if (unknown.length) { console.log(`Not found (check the ids): ${unknown.join(', ')}`); process.exitCode = 1; }
