// Exhaustive autoplay: does everything a player can do in a case (visit every place, tap every hotspot,
// interview everyone, ask everyone about everything) until nothing new appears, then checks that the
// answer words and every proof fact are reachable, the charge sheet accepts the answer, rejects a wrong
// one, the hints work and the run survives a save/load round trip. Usage: node tests/autoplay.mjs [from] [to]
import fs from 'node:fs';
import { fmtHours, CaseRun, groupFacts, timeRows } from '../www/engine/state.js';
const from = +(process.argv[2] || 1), to = +(process.argv[3] || 10);
// The Pattern File as it stands when case n opens (same rule as tools/validate.mjs): opening pins after case 10,
// plus every spine fact of every earlier case (auto-filed when that case is solved).
const campaign = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8'));
const pad = n => String(n).padStart(3, '0');
const caseFile = n => JSON.parse(fs.readFileSync(`www/cases/case-${pad(n)}.json`, 'utf8'));
function patternBefore(n) {
  const pf = campaign.patternFile || {};
  if (!pf.unlocksAfter || n <= pf.unlocksAfter) return new Set();
  const pins = new Set(pf.openingPins || []);
  for (let m = 1; m < n; m++) for (const f of caseFile(m).facts) if (f.spine) pins.add(`case-${pad(m)}:${f.id}`);
  return pins;
}
let fails = 0;
const say = (n, ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} case ${String(n).padStart(3, '0')}  ${msg}`); };
for (let n = from; n <= to; n++) {
  const c = caseFile(n);
  const ctx = { patternPins: patternBefore(n), clock: campaign.clock, regionRules: campaign.regions.find(r => n >= r.cases[0] && n <= r.cases[1]) };
  let run = new CaseRun(c, null, ctx);
  let stampsSpent = 0;
  let actions = 0, waits = 0;
  const detentions = [], reopened = [];
  for (let pass = 0; pass < 30; pass++) {
    const before = run.kF.size + run.kE.size + run.kP.size + run.kL.size;
    // What should be here (region 8): check every expected item once its reason is known.
    for (const l of run.locations()) if (run.visited.has(l.id)) for (const x of run.expectedAt(l.id)) if (!x.checked) { run.checkExpected(l.id, x.id); actions++; }
    for (const l of run.locations()) { run.visit(l.id); for (const h of run.hotspots(l.id)) {
      const r = run.tapHotspot(l.id, h.id); actions++;
      // A search warrant, filed as soon as there are grounds (region 2).
      if (r?.gated?.ready && !r.gated.served) { const before = run.s.credibility; if (run.file(r.gated.id, h.id)) { stampsSpent += before - run.s.credibility; actions++; } }
    } }
    // Records requests on the desk (region 3).
    for (const g of run.requests()) { const before = run.s.credibility; if (run.file(g.id)) { stampsSpent += before - run.s.credibility; actions++; } }
    // Press every claim with the fact that breaks it (region 2): the bot never guesses, so no stamp is lost here.
    for (const k of run.contradictions) {
      const pid = run.claimOwner.get(k.claim), by = k.brokenBy.find(b => run.kF.has(b));
      if (pid && by && run.kF.has(k.claim) && !run.claimState(k.claim)) { run.press(pid, k.claim, by); actions++; }
    }
    // Lawyered suspects (region 7): present the reopening fact to the advocate as soon as it is known.
    for (const p of run.people()) if (run.lawyered(p.id)) { const f = run.interrogation.get(p.id).lawyered.reopenedBy.find(x => run.kF.has(x)); if (f && run.reopen(p.id, f)?.ok) { actions++; reopened.push(p.id); } }
    for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); actions++; for (const t of run.topics(p.id)) { run.ask(p.id, t.about); actions++; } }
    // The lab (region 4): submit every test as soon as what it needs is in hand.
    for (const l of run.labsReady()) { run.submitLab(l.id); actions++; }
    // Save/load round trip mid-case, every pass.
    run = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())), ctx);
    if (run.kF.size + run.kE.size + run.kP.size + run.kL.size === before) {
      // Stuck: wait for a result, or (having investigated everything first, as the design rewards) detain
      // the next person whose samples are still untaken, take them, and carry on inside the 24 hours.
      if (run.labsPending().length) { run.wait(); waits++; continue; }
      const next = run.samples.find(e => !run.kE.has(e.id) && !run.s.everDetained.includes(e.detention));
      if (next) {
        if (run.s.detained) run.release();
        if (!run.detain(next.detention)) break;
        detentions.push(`${next.detention}@${fmtHours(run.s.hours)}`);
        for (const e of run.samplesFor(next.detention)) run.sample(e.id);
        // While they're held: send what the samples make possible, wait for it, press with it (no touring).
        for (const l of run.labsReady()) { run.submitLab(l.id); actions++; }
        while (run.labsPending().length && run.s.detained) { run.wait(); waits++; }
        for (const k of run.contradictions) { const pid = run.claimOwner.get(k.claim), by = k.brokenBy.find(b => run.kF.has(b)); if (pid && by && run.kF.has(k.claim) && !run.claimState(k.claim)) { run.press(pid, k.claim, by); actions++; } }
        continue;
      }
      break;
    }
  }
  if (run.clockOn) say(n, true, `clock ${fmtHours(run.s.hours)}${run.map ? ` (${fmtHours(run.s.driven / 60)} driving, ${run.s.trips.length} drives)` : ''} · detained ${detentions.join(', ') || 'nobody'} · ${waits} waits · labs ${run.labs.filter(e => run.kE.has(e.id)).length}/${run.labs.length} back`);
  const proofFacts = c.solution.proof.flatMap(s => s.from).filter(x => x.startsWith('f_'));
  const missingProof = proofFacts.filter(f => !run.kF.has(f));
  const elimFacts = c.solution.eliminations.flatMap(e => e.by).filter(x => x.startsWith('f_'));
  const missingElim = elimFacts.filter(f => !run.kF.has(f));
  say(n, !missingProof.length, `proof facts reachable (${proofFacts.length})${missingProof.length ? ' missing ' + missingProof : ''}`);
  say(n, !missingElim.length, `elimination facts reachable (${elimFacts.length})${missingElim.length ? ' missing ' + missingElim : ''}`);
  for (const b of run.blanks) {
    if (b.category === 'strip') {
      const evs = run.stripEvents(b.id);
      say(n, evs.length === b.strip.events.length, `strip ${b.id}: all ${b.strip.events.length} event cards found (${evs.length}), ${b.strip.slots.length} slots`);
      continue;
    }
    const opts = run.options(b.id).map(w => w.id);
    say(n, opts.includes(b.answer), `blank ${b.id}: answer ${b.answer} in bank (${opts.length} options)`);
  }
  // Wrong submission first: pick a wrong word for the first blank (or swap two strip cards).
  const b0 = run.blanks.find(b => b.category !== 'strip') || run.blanks[0];
  const wrong = b0.category === 'strip' ? null : run.options(b0.id).find(w => w.id !== b0.answer);
  for (const b of run.blanks) if (b.category === 'strip') for (const e of b.strip.events) run.placeEvent(b.id, e.id, e.slot); else run.setBlank(b.id, b.answer);
  for (const b of run.blanks.filter(b => b.category === 'strip')) {
    // On a copy, so the real run's groups aren't accepted early.
    const cp = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())), ctx);
    const act = b.strip.events.find(e => e.act), decoy = b.strip.slots.find(x => !b.strip.events.some(e => e.slot === x.id));
    cp.placeEvent(b.id, act.id, decoy.id);
    const rr = cp.submit(); say(n, rr && !rr.solved && rr.results.some(x => x.id === b.group && !x.pass && x.line), `strip with the act in a decoy slot (${decoy.label}) returned ("${(rr?.results.find(x => !x.pass)?.line || '').slice(0, 50)}…")`);
    const rs = new CaseRun(c, JSON.parse(JSON.stringify(cp.toJSON())), ctx);
    say(n, rs.stripPlaced(b.id)[act.id] === decoy.id, 'strip placements survive save and load');
  }
  if (wrong) { run.setBlank(b0.id, wrong.id); const r = run.submit(); say(n, r && !r.solved && r.results.some(x => !x.pass && x.line), `wrong sheet returned with a line ("${(r.results.find(x => !x.pass)?.line || '').slice(0, 50)}…")`); run.setBlank(b0.id, b0.answer); }
  const r = run.submit();
  if (r == null) { say(n, false, 'charge sheet not ready'); continue; }
  if (run.contradictions.length) {
    const broken = run.s.broken.length, wrongPress = new CaseRun(c, null, ctx);
    say(n, broken === run.contradictions.length, `contradictions broken ${broken}/${run.contradictions.length}, stamps spent on paperwork ${stampsSpent}, superior ${run.s.superior}`);
  }
  say(n, r && r.solved, `correct sheet accepted ("${(r?.results[0]?.line || '').slice(0, 50)}…"), stars ${run.stars()}`);
  // Hints on a fresh run: tier 1, 2, 3 and the tier-3 fill.
  const h = new CaseRun(c, null, ctx); const g = c.chargeSheet.groups[0];
  const t1 = h.hint(g.id), t2 = h.hint(g.id), t3 = h.hint(g.id);
  const t3ok = t3?.event ? h.stripPlaced(t3.blank)[t3.event] === t3.slot : t3?.word && h.s.charge[t3.blank] === t3.word;
  say(n, t1?.line && t2?.line && t3ok && h.stars() === 1, `hints: tier1 → ${t1?.point}, tier2 → ${t2?.facts?.length} facts, tier3 fills ${t3?.event ? t3.event + ' → ' + t3.slot : t3?.blank}`);
  const gf = groupFacts(run), tr = timeRows(run);
  console.log(`      ${actions} actions · ${run.kF.size}/${c.facts.length} facts · ${run.kE.size}/${c.evidence.length} cards · notebook ${gf.person.size} people, ${gf.place.size} places · ${tr.length} time rows`);
}
console.log(fails ? `\n${fails} failure(s)` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
