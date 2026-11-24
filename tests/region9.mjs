// Regions 9–10 rules on the charge sheet: two culprits named in either order (case 85), "nobody" refused
// where someone helped, the wrong intended target refused, planted items with their accepted alternatives
// (cases 88, 90), and the final sheet (case 100: two accomplices, two places, six spine lines) accepted whole.
// Usage: node tests/region9.mjs
import fs from 'node:fs';
import { CaseRun } from '../www/engine/state.js';
const campaign = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8'));
const pad = n => String(n).padStart(3, '0');
const load = n => JSON.parse(fs.readFileSync(`www/cases/case-${pad(n)}.json`, 'utf8'));
function pinsBefore(n) { const out = new Set(campaign.patternFile.openingPins); for (let m = 1; m < n; m++) for (const f of load(m).facts) if (f.spine) out.add(`case-${pad(m)}:${f.id}`); return out; }
const ctxFor = n => ({ patternPins: pinsBefore(n), clock: campaign.clock, regionRules: campaign.regions.find(r => n >= r.cases[0] && n <= r.cases[1]) });
let fails = 0;
const check = (ok, msg, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${extra ? '  ' + extra : ''}`); };
function explore(run) {
  for (let i = 0; i < 40; i++) {
    const n0 = run.kF.size + run.kE.size + run.kP.size;
    for (const l of run.locations()) { run.visit(l.id); for (const x of run.expectedAt(l.id)) run.checkExpected(l.id, x.id); for (const h of run.hotspots(l.id)) { const r = run.tapHotspot(l.id, h.id); if (r?.gated?.ready) run.file(r.gated.id, h.id); } }
    for (const g of run.requests()) run.file(g.id);
    for (const p of run.people()) if (run.lawyered(p.id)) { const f = run.interrogation.get(p.id).lawyered.reopenedBy.find(x => run.kF.has(x)); if (f) run.reopen(p.id, f); }
    for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); for (const t of run.topics(p.id)) run.ask(p.id, t.about); }
    for (const k of run.contradictions) { const pid = run.claimOwner.get(k.claim), by = k.brokenBy.find(b => run.kF.has(b)); if (by && run.kF.has(k.claim) && !run.claimState(k.claim)) run.press(pid, k.claim, by); }
    for (const l of run.labsReady()) run.submitLab(l.id);
    if (run.kF.size + run.kE.size + run.kP.size === n0) {
      if (run.labsPending().length) { run.wait(); continue; }
      const next = run.samples.find(e => !run.kE.has(e.id) && !run.s.everDetained.includes(e.detention));
      if (next) { if (run.s.detained) run.release(); if (run.detain(next.detention)) { for (const e of run.samplesFor(next.detention)) run.sample(e.id); for (const l of run.labsReady()) run.submitLab(l.id); while (run.labsPending().length && run.s.detained) run.wait(); continue; } }
      break;
    }
  }
}
// A copy of an explored case with the whole sheet filled with the answers, then `edit` applied.
function sheet(n, base, edit = () => {}) {
  const run = new CaseRun(load(n), JSON.parse(JSON.stringify(base.toJSON())), ctxFor(n));
  for (const b of run.blanks) { if (b.category === 'strip') for (const e of b.strip.events) run.placeEvent(b.id, e.id, e.slot); else run.setBlank(b.id, b.answer); }
  edit(run); run.submit(); return run;
}
const bases = {};
const base = n => bases[n] ||= (() => { const r = new CaseRun(load(n), null, ctxFor(n)); explore(r); return r; })();

// Two culprits, either order (case 85).
{
  const g = load(85).chargeSheet.groups.find(x => x.unordered), [b1, b2] = g.blanks;
  const ok = sheet(85, base(85)), swapped = sheet(85, base(85), r => { r.setBlank(b1.id, b2.answer); r.setBlank(b2.id, b1.answer); });
  check(ok.passed.has(g.id) && ok.s.solved, 'case 085: both culprits named: accepted');
  check(swapped.passed.has(g.id), 'case 085: the same two in the other order: accepted too');
  const other = base(85).options(b1.id).find(w => w.id !== b1.answer && w.id !== b2.answer);
  const half = sheet(85, base(85), r => r.setBlank(b2.id, other.id));
  check(!half.passed.has(g.id), `case 085: one right and one wrong (${other.id}): returned`);
}
// "Nobody" where someone helped; the right accomplice and role.
for (const n of [81, 82, 89, 93, 96, 98]) {
  const g = load(n).chargeSheet.groups.find(x => x.kind === 'accomplice'), pb = g.blanks.find(b => b.category === 'person');
  const ok = sheet(n, base(n)), nobody = sheet(n, base(n), r => r.setBlank(pb.id, 'w_nobody'));
  check(ok.passed.has(g.id) && ok.s.solved && base(n).options(pb.id).some(w => w.id === 'w_nobody') && !nobody.passed.has(g.id), `case ${pad(n)}: the accomplice and their role accepted; "nobody" offered and returned`);
}
// The intended target (case 84): the victim refused.
{
  const c = load(84), g = c.chargeSheet.groups.find(x => x.kind === 'realTarget'), b = g.blanks[0];
  const wrong = base(84).options(b.id).find(w => w.id !== b.answer);
  check(sheet(84, base(84)).passed.has(g.id) && !sheet(84, base(84), r => r.setBlank(b.id, wrong.id)).passed.has(g.id), `case 084: the intended target accepted; ${wrong.id} returned`);
}
// Planted: alternatives accepted (88, 90); a genuine item refused.
for (const n of [88, 90, 93]) {
  const g = load(n).chargeSheet.groups.find(x => x.kind === 'planted');
  check(sheet(n, base(n)).passed.has(g.id), `case ${pad(n)}: the planted item and its tell accepted`);
  for (const b of g.blanks) for (const alt of b.accept || []) if (alt !== b.answer) check(sheet(n, base(n), r => r.setBlank(b.id, alt)).passed.has(g.id), `case ${pad(n)}: ${alt} accepted as well`);
  const ib = g.blanks[0], other = base(n).options(ib.id).find(w => w.id !== ib.answer && !(ib.accept || []).includes(w.id));
  if (other) check(!sheet(n, base(n), r => r.setBlank(ib.id, other.id)).passed.has(g.id), `case ${pad(n)}: ${other.id} named as planted: returned`);
}
// Case 90's reviewer is Rukia Hassan; her acceptance line is the case's own.
check(load(90).chargeSheet.reviewer === 'Senior Prosecutor Rukia Hassan', 'case 090: reviewed by Senior Prosecutor Rukia Hassan');
// The final sheet (case 100).
{
  const c = load(100), run = sheet(100, base(100));
  check(run.s.solved && run.passed.size === c.chargeSheet.groups.length, `case 100: every group accepted, the case closes`, `${run.passed.size} of ${c.chargeSheet.groups.length} groups`);
  const sp = c.chargeSheet.groups.find(g => g.kind === 'spine');
  check(sp.blanks.length === 6 && sp.blanks.every(b => base(100).options(b.id).some(w => w.id === b.answer)), 'case 100: six spine lines, each answer in its own list');
  const swap = sheet(100, base(100), r => { r.setBlank('accomplice1', 'w_pius'); r.setBlank('accomplice2', 'w_oduya'); });
  check(!swap.passed.has('g_acc1') || !swap.passed.has('g_acc2'), 'case 100: the two accomplices swapped (with their roles fixed): returned');
  check(c.meta.final && (c.afterVerdict || []).some(a => /prologue's drawer/.test(a.beat || '')) && (c.afterVerdict || []).some(a => /last voice-note/.test(a.beat || '')), 'case 100: the ending has the drawer and the last voice-note');
}
console.log(fails ? `\n${fails} failed` : '\nAll region 9–10 checks passed.');
process.exit(fails ? 1 : 0);
