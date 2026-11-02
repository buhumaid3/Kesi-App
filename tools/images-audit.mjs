// Every image the game can show, and why any of them is missing.
//   npm run images:audit -- --region 1        one region, every image listed
//   npm run images:audit -- --all             all 100 cases: totals per region and case, gaps listed
//   add --gaps to list only what's missing, --json for a machine-readable copy in prompts/audit.json
//
// What needs a picture (design doc §5, §14):
//   every person except Amani (portrait) · every place (location photo) · every scene · every exhibit that is
//   a physical object (render object, sceneNote, photo) · anything else the case file gives an image brief.
//   Paper exhibits (registers, receipts, ledgers, statements, logs…) are drawn in code for sharp text and are
//   not counted, unless the case gives them a photo too. An exhibit with "noPhoto": "reason" is skipped on purpose.
// Statuses, in the order they're checked:
//   OK · no description · rejected in review · generated, file missing (restore with  generate-images restore )
//   · submitted, not fetched · failed (Google's error) · needs a reference that doesn't exist yet · never generated
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? true : undefined; };
const region = flag('--region') ? +flag('--region') : null, all = args.includes('--all'), gapsOnly = args.includes('--gaps');
if (!region && !all) { console.error('say which: --region N or --all'); process.exit(1); }
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const pad = n => String(n).padStart(3, '0');

// Fresh prompts (so new briefs count), compiled to a scratch folder; the real prompts/ is left alone.
const tmp = P('.cache', 'audit-prompts');
spawnSync(process.execPath, [P('tools/compile-prompts.mjs'), P('www/cases'), tmp], { stdio: 'ignore' });
const requests = readJSON(path.join(tmp, 'requests.json'), []);
const byKey = new Map(requests.map(r => [r.key, r]));
const state = readJSON(P('prompts/state.json'), {});
const rejectsF = P('prompts/rejects.txt');
const rejected = new Map();
if (fs.existsSync(rejectsF)) {
  const t = fs.statSync(rejectsF).mtimeMs;
  for (const l of fs.readFileSync(rejectsF, 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'))) { const [k, ...note] = l.split(/\s+/); rejected.set(k, { note: note.join(' '), t }); }
}
// Prices per image at batch rates (generate-images.mjs, Google's pricing page 2 Nov 2026).
const BATCH = { '1K': 0.0168, '2K': 0.0252 };
const PHOTO_RENDERS = new Set(['object', 'sceneNote', 'photo']);

const camp = readJSON(P('www/cases/_campaign.json'));
const files = fs.readdirSync(P('www/cases')).filter(f => /^case-\d{3}\.json$/.test(f)).sort();
const rows = [];
const add = (n, reg, id, what, name, hasBrief) => {
  const key = `${pad(n)}/${id}`, req = byKey.get(key), s = state[key] || {};
  const file = `img/cases/${pad(n)}/${id}.webp`, exists = fs.existsSync(P('www', file));
  let status, detail = '';
  if (!hasBrief) status = 'no description';
  else if (rejected.has(key) && (!s.at || Date.parse(s.at) < rejected.get(key).t)) { status = 'rejected in review'; detail = rejected.get(key).note; }
  else if (exists) status = 'OK';
  else if (['done', 'approved'].includes(s.status)) { status = 'generated, file missing'; detail = fs.existsSync(P('img-masters', file.replace(/^img\//, ''))) ? 'master is there: run  generate-images restore' : 'no master either: regenerate'; }
  else if (s.status === 'submitted') { status = 'submitted, not fetched'; detail = s.job || ''; }
  else if (s.status === 'failed') { status = 'failed'; detail = s.error || ''; }
  else if (req?.reference && !fs.existsSync(P('img-masters', req.reference.replace(/^img\//, ''))) && !fs.existsSync(P('www', req.reference))) { status = 'needs a reference'; detail = req.reference; }
  else status = 'never generated';
  rows.push({ case: n, region: reg, key, id, what, name, status, detail, size: req?.size || (what === 'portrait' || what === 'object' ? '1K' : '2K'), reference: req?.reference || null });
};
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(P('www/cases', f), 'utf8'));
  const n = c.meta.number, reg = c.meta.regionNumber;
  if (region && reg !== region) continue;
  for (const p of c.people) if (!/^amani\b/i.test(p.name)) add(n, reg, p.id, 'portrait', p.name, !!p.image?.brief);
  for (const l of c.locations) add(n, reg, l.id, l.kind === 'scene' ? 'place (scene)' : 'place', l.name, !!l.image?.brief);
  for (const e of c.evidence) {
    if (e.noPhoto) continue;
    if (!PHOTO_RENDERS.has(e.render) && !e.image) continue;
    add(n, reg, e.id, e.render === 'sceneNote' ? 'scene' : 'object', e.title, !!e.image?.brief);
  }
}
// Recurring-cast reference portraits: every later face depends on them.
const refRows = (camp.recurringCast || []).map(r => {
  const key = `000/${r.id}`, s = state[key] || {}, exists = fs.existsSync(P('www/img/ref', `${r.id}.webp`));
  return { key, name: r.name, status: !r.image?.brief ? 'no description' : exists ? 'OK' : s.status === 'failed' ? 'failed' : s.status === 'submitted' ? 'submitted, not fetched' : 'never generated', detail: s.error || '' };
});

const ORDER = ['no description', 'rejected in review', 'generated, file missing', 'submitted, not fetched', 'failed', 'needs a reference', 'never generated', 'OK'];
const gap = r => r.status !== 'OK';
const sum = rs => ORDER.map(s => [s, rs.filter(r => r.status === s).length]).filter(([, v]) => v);
const usd = rs => rs.filter(r => gap(r) && r.status !== 'submitted, not fetched').reduce((s, r) => s + (BATCH[r.size] || 0.0168), 0);

const refsBad = refRows.filter(gap);
console.log(`Recurring-cast reference portraits: ${refRows.length - refsBad.length}/${refRows.length} OK${refsBad.length ? ' — ' + refsBad.map(r => `${r.key} ${r.status}`).join(', ') : ''}`);
const regions = [...new Set(rows.map(r => r.region))].sort((a, b) => a - b);
for (const rg of regions) {
  const rr = rows.filter(r => r.region === rg);
  console.log(`\nREGION ${rg}: ${rr.length} images · ${rr.filter(r => !gap(r)).length} OK · ${rr.filter(gap).length} missing · to fill ≈ $${usd(rr).toFixed(2)} at batch price`);
  console.log('  ' + sum(rr).map(([s, v]) => `${s}: ${v}`).join(' · '));
  const cases = [...new Set(rr.map(r => r.case))];
  for (const n of cases) {
    const cr = rr.filter(r => r.case === n), miss = cr.filter(gap);
    if (all && !region) { if (miss.length) console.log(`  case ${pad(n)}: ${cr.length - miss.length}/${cr.length} OK · ${sum(miss).map(([s, v]) => `${s} ${v}`).join(', ')}`); continue; }
    console.log(`  case ${pad(n)}: ${cr.length - miss.length}/${cr.length} OK`);
    for (const r of cr) if (!gapsOnly || gap(r)) console.log(`    ${gap(r) ? '✗' : '✓'} ${r.what.padEnd(13)} ${r.id.padEnd(18)} ${r.name.slice(0, 34).padEnd(34)} ${r.status}${r.detail ? ` (${String(r.detail).slice(0, 120)})` : ''}`);
  }
}
const allMiss = rows.filter(gap);
console.log(`\nTOTAL: ${rows.length} images · ${rows.length - allMiss.length} OK · ${allMiss.length} missing · ≈ $${usd(rows).toFixed(2)} to fill at batch price.`);
console.log('  ' + sum(rows).map(([s, v]) => `${s}: ${v}`).join(' · '));
if (args.includes('--json')) { fs.writeFileSync(P('prompts/audit.json'), JSON.stringify({ at: new Date().toISOString(), refs: refRows, rows }, null, 1)); console.log('Written to prompts/audit.json.'); }
process.exitCode = allMiss.length || refsBad.length ? 2 : 0;   // 2 = gaps found (not a crash)
