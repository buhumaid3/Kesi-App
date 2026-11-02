// Exhaustive autoplay: does everything a player can do in a case (visit every place, tap every hotspot,
// interview everyone, ask everyone about everything) until nothing new appears, then checks that the
// answer words and every proof fact are reachable, the charge sheet accepts the answer, rejects a wrong
// one, the hints work and the run survives a save/load round trip. Usage: node tests/autoplay.mjs [from] [to]
import fs from 'node:fs';
import { CaseRun, groupFacts, timeRows } from '../www/engine/state.js';
const from = +(process.argv[2] || 1), to = +(process.argv[3] || 10);
let fails = 0;
const say = (n, ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} case ${String(n).padStart(3, '0')}  ${msg}`); };
for (let n = from; n <= to; n++) {
  const c = JSON.parse(fs.readFileSync(`www/cases/case-${String(n).padStart(3, '0')}.json`, 'utf8'));
  let run = new CaseRun(c, null);
  let actions = 0;
  for (let pass = 0; pass < 30; pass++) {
    const before = run.kF.size + run.kE.size + run.kP.size + run.kL.size;
    for (const l of run.locations()) { run.visit(l.id); for (const h of run.hotspots(l.id)) { run.tapHotspot(l.id, h.id); actions++; } }
    for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); actions++; for (const t of run.topics(p.id)) { run.ask(p.id, t.about); actions++; } }
    // Save/load round trip mid-case, every pass.
    run = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())));
    if (run.kF.size + run.kE.size + run.kP.size + run.kL.size === before) break;
  }
  const proofFacts = c.solution.proof.flatMap(s => s.from).filter(x => x.startsWith('f_'));
  const missingProof = proofFacts.filter(f => !run.kF.has(f));
  const elimFacts = c.solution.eliminations.flatMap(e => e.by).filter(x => x.startsWith('f_'));
  const missingElim = elimFacts.filter(f => !run.kF.has(f));
  say(n, !missingProof.length, `proof facts reachable (${proofFacts.length})${missingProof.length ? ' missing ' + missingProof : ''}`);
  say(n, !missingElim.length, `elimination facts reachable (${elimFacts.length})${missingElim.length ? ' missing ' + missingElim : ''}`);
  for (const b of run.blanks) {
    const opts = run.options(b.id).map(w => w.id);
    say(n, opts.includes(b.answer), `blank ${b.id}: answer ${b.answer} in bank (${opts.length} options)`);
  }
  // Wrong submission first: pick a wrong word for the first blank.
  const b0 = run.blanks[0];
  const wrong = run.options(b0.id).find(w => w.id !== b0.answer);
  for (const b of run.blanks) run.setBlank(b.id, b.answer);
  if (wrong) { run.setBlank(b0.id, wrong.id); const r = run.submit(); say(n, r && !r.solved && r.results.some(x => !x.pass && x.line), `wrong sheet returned with a line ("${(r.results.find(x => !x.pass)?.line || '').slice(0, 50)}…")`); run.setBlank(b0.id, b0.answer); }
  const r = run.submit();
  say(n, r && r.solved, `correct sheet accepted ("${(r?.results[0]?.line || '').slice(0, 50)}…"), stars ${run.stars()}`);
  // Hints on a fresh run: tier 1, 2, 3 and the tier-3 fill.
  const h = new CaseRun(c, null); const g = c.chargeSheet.groups[0];
  const t1 = h.hint(g.id), t2 = h.hint(g.id), t3 = h.hint(g.id);
  say(n, t1?.line && t2?.line && t3?.word && h.s.charge[t3.blank] === t3.word && h.stars() === 1, `hints: tier1 → ${t1?.point}, tier2 → ${t2?.facts?.length} facts, tier3 fills ${t3?.blank}`);
  const gf = groupFacts(run), tr = timeRows(run);
  console.log(`      ${actions} actions · ${run.kF.size}/${c.facts.length} facts · ${run.kE.size}/${c.evidence.length} cards · notebook ${gf.person.size} people, ${gf.place.size} places · ${tr.length} time rows`);
}
console.log(fails ? `\n${fails} failure(s)` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
