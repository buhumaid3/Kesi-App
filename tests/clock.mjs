// Region 4 rules on case 031: lab timing, immediate autopsy, detention samples, the 24-hour clock running
// out, forensic rush, and the save round trip of all of it. Usage: node tests/clock.mjs
import fs from 'node:fs';
import { CaseRun } from '../www/engine/state.js';
const campaign = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8'));
const c = JSON.parse(fs.readFileSync('www/cases/case-031.json', 'utf8'));
const ctx = { patternPins: new Set(campaign.patternFile.openingPins), clock: campaign.clock, regionRules: campaign.regions[3] };
let fails = 0;
const check = (ok, msg, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${extra ? '  ' + extra : ''}`); };
// Explore everything reachable without the lab or a detention.
function explore(run) {
  for (let i = 0; i < 20; i++) {
    const n = run.kF.size + run.kE.size;
    for (const l of run.locations()) { run.visit(l.id); for (const h of run.hotspots(l.id)) { const r = run.tapHotspot(l.id, h.id); if (r?.gated?.ready) run.file(r.gated.id, h.id); } }
    for (const g of run.requests()) run.file(g.id);
    for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); for (const t of run.topics(p.id)) run.ask(p.id, t.about); }
    for (const k of run.contradictions) { const pid = run.claimOwner.get(k.claim), by = k.brokenBy.find(b => run.kF.has(b)); if (by && run.kF.has(k.claim) && !run.claimState(k.claim)) run.press(pid, k.claim, by); }
    if (run.kF.size + run.kE.size === n) break;
  }
}
let run = new CaseRun(c, null, ctx);
check(run.clockOn && run.s.hours === 0, 'the clock is on in a lab case and starts at 0 h');
const fresh = new CaseRun(JSON.parse(fs.readFileSync('www/cases/case-021.json', 'utf8')), null, ctx);
fresh.visit(fresh.locations()[0].id);
check(!fresh.clockOn && fresh.s.hours === 0, 'no clock in a region 3 case');
explore(run);
check(run.s.hours > 0, 'visits and interviews advance the clock', `${run.s.hours} h`);
check(run.kE.has('ev_autopsy'), 'the autopsy (0 h) arrives as soon as the body is in hand');
check(run.kF.has('f_aut_tod'), 'its facts go straight to the notebook');
check(run.labsReady().some(l => l.id === 'ev_tox') && !run.labsReady().some(l => l.id === 'ev_fibres'), 'toxicology can be submitted; fibres wait for the sweater (a detention sample)');
check(!run.sample('ev_sweater'), 'the sweater can\'t be taken from someone who isn\'t detained');
const t0 = run.s.hours;
const sub = run.submitLab('ev_tox');
check(sub && run.s.hours === t0 + 1 && sub.due === t0 + 1 + 18, 'submitting takes 1 h; toxicology is due 18 h later', `due ${sub?.due} h`);
check(!run.submitLab('ev_tox'), 'the same test can\'t be submitted twice');
run.wait(5);
check(!run.kE.has('ev_tox') && run.labsPending()[0].left === 13, 'five hours on: not back, 13 h left');
// Save round trip with a test in the lab.
run = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())), ctx);
check(run.labsPending().length === 1, 'a pending test survives save and load');
const w = run.wait();
check(run.kE.has('ev_tox') && w.events.some(e => e.type === 'lab' && e.id === 'ev_tox') && w.facts.includes('f_tox'), 'waiting jumps to the result; it arrives with its facts', `${run.s.hours} h`);
// Detention.
check(run.canDetain('p_kimaiyo') && !run.canDetain('p_beryl') && !run.canDetain('p_sammy'), 'a suspect can be detained; the victim and witnesses can\'t');
const d = run.detain('p_kimaiyo');
check(d && run.hoursLeft() === 24, 'detaining starts 24 hours');
check(!run.canDetain('p_duncan'), 'one detention at a time');
const sm = run.sample('ev_sweater');
check(sm?.evidence === 'ev_sweater' && run.hoursLeft() === 23, 'a sample takes 1 h and goes to the exhibits');
check(run.labsReady().some(l => l.id === 'ev_fibres'), 'with the sweater in hand, the fibre comparison can go to the lab');
// Forensic rush on a copy: one stamp, result now.
const r2 = new CaseRun(c, JSON.parse(JSON.stringify(run.toJSON())), ctx);
r2.submitLab('ev_fibres'); const cr = r2.s.credibility, hr = r2.s.hours;
const ru = r2.rush('ev_fibres');
check(ru?.evidence === 'ev_fibres' && r2.s.credibility === cr - 1 && r2.s.hours === hr, 'forensic rush: one stamp, the result now, no hours');
// The clock runs out.
run.submitLab('ev_fibres');
run.wait(24);
check(!run.s.detained && run.isReleased('p_kimaiyo'), 'after 24 hours the suspect is released');
check(!run.canInterview('p_kimaiyo'), 'a released suspect can\'t be questioned again');
const k = run.contradictions.find(x => run.claimOwner.get(x.claim) === 'p_kimaiyo' && !run.claimState(x.claim) && run.kF.has(x.claim));
const by = k?.brokenBy.find(b => run.kF.has(b));
check(!k || !by || run.press('p_kimaiyo', k.claim, by) === null, 'or pressed again', k ? k.id : 'nothing left to press');
check(!run.canDetain('p_kimaiyo'), 'and can\'t be detained a second time');
// No softlock: Mwalimu's third hint still fills every blank.
for (const g of c.chargeSheet.groups) for (const b of g.blanks) { run.hint(g.id); run.hint(g.id); run.hint(g.id); }
for (const b of run.blanks) if (run.s.charge[b.id] !== b.answer) run.setBlank(b.id, b.answer);
check(run.submit()?.solved, 'the case can still be closed after the clock ran out (one star)', `stars ${run.stars()}`);
console.log(fails ? `\n${fails} failure(s)` : '\nAll clock checks passed.');
process.exit(fails ? 1 : 0);
