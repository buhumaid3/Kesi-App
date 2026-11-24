// Region 7 rules: lawyered suspects (silent until the right fact is put to the advocate; a wrong one costs a
// stamp once per pairing), the document comparison order, and the FORGERY group (the forged document and
// its tell; a second proven tell accepted in cases 62 and 70; a genuine document is refused).
// Usage: node tests/region7.mjs
import fs from 'node:fs';
import { CaseRun } from '../www/engine/state.js';
const campaign = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8'));
const load = n => JSON.parse(fs.readFileSync(`www/cases/case-${String(n).padStart(3, '0')}.json`, 'utf8'));
const pad = n => String(n).padStart(3, '0');
function pinsBefore(n) { const pf = campaign.patternFile, out = new Set(pf.openingPins); for (let m = 1; m < n; m++) for (const f of load(m).facts) if (f.spine) out.add(`case-${pad(m)}:${f.id}`); return out; }
const ctxFor = n => ({ patternPins: pinsBefore(n), clock: campaign.clock, regionRules: campaign.regions.find(r => n >= r.cases[0] && n <= r.cases[1]) });
let fails = 0;
const check = (ok, msg, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${extra ? '  ' + extra : ''}`); };
// Everything a player can do except reopening (and, optionally, with it).
function explore(run, { reopen = true } = {}) {
  for (let i = 0; i < 30; i++) {
    const n0 = run.kF.size + run.kE.size + run.kP.size;
    for (const l of run.locations()) { run.visit(l.id); for (const h of run.hotspots(l.id)) { const r = run.tapHotspot(l.id, h.id); if (r?.gated?.ready) run.file(r.gated.id, h.id); } }
    for (const g of run.requests()) run.file(g.id);
    if (reopen) for (const p of run.people()) if (run.lawyered(p.id)) { const f = run.interrogation.get(p.id).lawyered.reopenedBy.find(x => run.kF.has(x)); if (f) run.reopen(p.id, f); }
    for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); for (const t of run.topics(p.id)) run.ask(p.id, t.about); }
    for (const k of run.contradictions) { const pid = run.claimOwner.get(k.claim), by = k.brokenBy.find(b => run.kF.has(b)); if (by && run.kF.has(k.claim) && !run.claimState(k.claim)) run.press(pid, k.claim, by); }
    for (const l of run.labsReady()) run.submitLab(l.id);
    if (run.kF.size + run.kE.size + run.kP.size === n0) { if (run.labsPending().length) { run.wait(); continue; }
      const next = run.samples.find(e => !run.kE.has(e.id) && !run.s.everDetained.includes(e.detention));
      if (next) { if (run.s.detained) run.release(); if (run.detain(next.detention)) { for (const e of run.samplesFor(next.detention)) run.sample(e.id); continue; } }
      break; }
  }
}

for (const n of [62, 66, 70]) {
  const c = load(n), it = c.interrogations.find(i => i.stance === 'lawyered'), pid = it.person, right = it.lawyered.reopenedBy[0];
  const run = new CaseRun(c, null, ctxFor(n));
  explore(run, { reopen: false });
  check(run.kP.has(pid) && run.lawyered(pid) && !run.canInterview(pid), `case ${pad(n)}: ${pid} says nothing while lawyered, even with the reopening fact known`, run.kF.has(right) ? 'fact known' : 'fact not yet known');
  check(run.kF.has(right), `case ${pad(n)}: the reopening fact ${right} can be found without them`);
  const wrong = [...run.kF].find(f => !it.lawyered.reopenedBy.includes(f));
  const st0 = run.s.credibility, w1 = run.reopen(pid, wrong), st1 = run.s.credibility, w2 = run.reopen(pid, wrong);
  check(w1 && !w1.ok && w1.cost === 1 && st1 === st0 - 1 && w2 && !w2.ok && w2.again && run.s.credibility === st1, `case ${pad(n)}: a wrong fact costs a stamp; the same wrong fact again is free`);
  check(run.reopen(pid, 'f_nonexistent') === null, `case ${pad(n)}: a fact you don't know can't be presented`);
  const ok = run.reopen(pid, right);
  check(ok?.ok && !run.lawyered(pid) && run.canInterview(pid), `case ${pad(n)}: the right fact reopens it; ${pid} can be questioned`);
  const saved = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())), ctxFor(n));
  check(saved.canInterview(pid) && saved.reopen(pid, right) === null, `case ${pad(n)}: reopened survives save and load, and can't be reopened twice`);
}
// Documents: the forged one's first comparison is its genuine twin, where the case has one.
const twins = { 61: ['ev_salesfile', 'ev_genuine_lb'], 62: ['ev_codicil', 'ev_will'], 67: ['ev_register', 'ev_entry'], 63: ['ev_slip_copies', 'ev_genuine_slip'], 64: ['ev_certificate', 'ev_genuine_cert'], 65: ['ev_cert', 'ev_genuine_kcse'],
  66: ['ev_title', 'ev_genuine_title'], 68: ['ev_medcert', 'ev_genuine_cert'], 69: ['ev_invoices', 'ev_genuine_inv'], 70: ['ev_filed_will', 'ev_genuine_will'] };
for (const [n, [forged, genuine]] of Object.entries(twins)) {
  const c = load(+n), run = new CaseRun(c, null, ctxFor(+n)); explore(run);
  const list = run.compareWith(forged).map(e => e.id);
  check(run.kE.has(forged) && run.kE.has(genuine) && list[0] === genuine, `case ${pad(n)}: comparing ${forged} offers ${genuine} first`, list.slice(0, 3).join(', '));
}
// FORGERY: the forged document and its tell are accepted; a genuine document is refused; accepted second tells.
for (let n = 61; n <= 70; n++) {
  const c = load(n), g = c.chargeSheet.groups.find(x => x.kind === 'forgery'), doc = g.blanks.find(b => b.id === 'document'), tell = g.blanks.find(b => b.id === 'tell');
  const base = new CaseRun(c, null, ctxFor(n)); explore(base);
  const fill = (run, d, t) => { for (const b of run.blanks) { if (b.category === 'strip') for (const e of b.strip.events) run.placeEvent(b.id, e.id, e.slot); else run.setBlank(b.id, b.answer); } run.setBlank('document', d); run.setBlank('tell', t); };
  const copy = () => new CaseRun(c, JSON.parse(JSON.stringify(base.toJSON())), ctxFor(n));
  const r1 = copy(); fill(r1, doc.answer, tell.answer); const s1 = r1.submit();
  check(s1 && r1.passed.has(g.id) && r1.s.solved, `case ${pad(n)}: ${doc.answer} forged, shown by ${tell.answer}: accepted`);
  const genuineDoc = base.options('document').find(w => w.id !== doc.answer);
  const r2 = copy(); fill(r2, genuineDoc.id, tell.answer); r2.submit();
  check(!r2.passed.has(g.id), `case ${pad(n)}: naming ${genuineDoc.id} instead is returned`);
  for (const alt of tell.accept || []) { if (alt === tell.answer) continue; const r3 = copy(); fill(r3, doc.answer, alt); r3.submit(); check(r3.passed.has(g.id), `case ${pad(n)}: the second proven tell ${alt} is accepted too`); }
}
console.log(fails ? `\n${fails} failed` : '\nAll region 7 checks passed.');
process.exit(fails ? 1 : 0);
