// Region 6 rules: the site map and travel. On every case 51–60: the map is well formed, every site can be
// reached, and the engine never charges more for a drive than the case's clockPlan allows (so every order
// the validator proves, rule 16, fits in the game). On case 051: where you start, what a drive costs, the
// clock in minutes, hidden sites never used as waypoints, off-map places, and the save round trip.
// Usage: node tests/travel.mjs
import fs from 'node:fs';
import { CaseRun, fmtHours } from '../www/engine/state.js';
import { layoutSites, renderMap } from '../www/engine/sitemap.js';
const campaign = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8'));
const load = n => JSON.parse(fs.readFileSync(`www/cases/case-${String(n).padStart(3, '0')}.json`, 'utf8'));
const ctxFor = n => ({ patternPins: new Set(), clock: campaign.clock, regionRules: campaign.regions.find(r => n >= r.cases[0] && n <= r.cases[1]) });
let fails = 0;
const check = (ok, msg, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${extra ? '  ' + extra : ''}`); };

check(fmtHours(0.75) === '45 min' && fmtHours(3) === '3 h' && fmtHours(2.25) === '2 h 15 min' && fmtHours(1 / 60 * 5) === '5 min', 'hours read as people say them', `${fmtHours(0.75)} · ${fmtHours(3)} · ${fmtHours(2.25)}`);

for (let n = 51; n <= 60; n++) {
  const c = load(n), tag = `case ${String(n).padStart(3, '0')}`;
  const run = new CaseRun(c, null, ctxFor(n));
  const ids = new Set([...c.locations, ...(c.places || [])].map(x => x.id));
  const bad = c.map.nodes.filter(x => !ids.has(x)), badE = c.map.edges.filter(e => !c.map.nodes.includes(e.a) || !c.map.nodes.includes(e.b));
  check(!bad.length && !badE.length && run.s.site === c.map.start && run.kL.has(c.map.start), `${tag} map well formed, you start at ${c.map.start}`, bad.concat(badE.map(e => e.a + '-' + e.b)).join(' '));
  // With every site known, every location on the map can be reached from the start.
  for (const l of c.locations) run.kL.add(l.id);
  const unreachable = c.map.nodes.filter(x => c.locations.some(l => l.id === x) && !run.route(c.map.start, x));
  check(!unreachable.length, `${tag} every site can be reached`, unreachable.join(' '));
  // Replay the clockPlan's movements: each engine drive costs no more than the plan's travel step.
  let site = c.map.start, planH = 0, engineH = 0; const over = [];
  for (const st of c.clockPlan.steps) {
    if (st.do === 'travel') {
      const r = run.route(st.from, st.target);
      if (!r || r.minutes > st.hours * 60) over.push(`${st.from}→${st.target} ${r?.minutes} min > ${st.hours} h`);
      planH += st.hours; engineH += (r?.minutes || 0) / 60; site = st.target;
    }
  }
  check(!over.length && engineH <= planH + 1e-9, `${tag} drives never cost more than the plan allows`, over.join('; ') || `${fmtHours(engineH)} driving ≤ plan ${fmtHours(planH)}`);
  // The plan replayed through visit() alone (the player's only way to move) never charges more travel.
  const r2 = new CaseRun(c, null, ctxFor(n)); for (const l of c.locations) r2.kL.add(l.id);
  for (const st of c.clockPlan.steps) if (st.do === 'visit') r2.visit(st.target);
  check(r2.s.driven / 60 <= planH + 1e-9, `${tag} visiting in the plan's order drives ${fmtHours(r2.s.driven / 60)}`, `plan ${fmtHours(planH)}`);
}

// ── Case 051 in detail ───────────────────────────────────────────────────────────────────────────────
{
  const c = load(51), ctx = ctxFor(51);
  let run = new CaseRun(c, null, ctx);
  const t0 = run.clockAt().hh;
  check(run.s.site === 'loc_landing' && run.s.hours === 0, 'case 051 starts at the landing site, nothing driven', t0);
  const s0 = run.sites();
  check(s0.find(x => x.id === 'loc_launch')?.known === false && s0.find(x => x.id === 'loc_camp')?.route?.minutes === 45, 'the launch site is hidden until found; the camp is 45 min away');
  check(run.travel('loc_launch') === null && run.travel('loc_landing') === null, "you can't drive to a hidden site, or to where you are");
  const v1 = run.visit('loc_landing');
  check(v1.ok && !v1.travel && run.s.hours === 1, 'looking round the landing site: 1 h, no drive');
  const v2 = run.visit('loc_camp');
  check(v2.travel?.minutes === 45 && v2.travel.by.includes('4x4') && run.s.hours === 2.75 && run.s.site === 'loc_camp', 'visiting the camp drives there first: 45 min by 4×4, then 1 h', `${fmtHours(run.s.hours)}`);
  const at = run.clockAt();
  check(/:\d{2}$/.test(at.hh) && !at.hh.endsWith(':00'), 'the clock shows the minutes', at.label);
  const v3 = run.visit('loc_camp');
  check(!v3.travel && run.s.hours === 2.75, 'going back into the same site costs nothing');
  // Unlock the launch site the way a player does: the tracker on the camp's hotspots.
  for (let i = 0; i < 5 && !run.kL.has('loc_launch'); i++) for (const h of run.hotspots('loc_camp')) run.tapHotspot('loc_camp', h.id);
  for (let i = 0; i < 5 && !run.kL.has('loc_launch'); i++) for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); for (const t of run.topics(p.id)) run.ask(p.id, t.about); }
  check(run.kL.has('loc_launch'), 'the vehicle tracker puts the launch site on the map');
  check(run.route('loc_camp', 'loc_launch').minutes === 20, 'camp to launch site: 20 min');
  const h1 = run.s.hours, tr = run.travel('loc_launch');
  check(tr && Math.abs(run.s.hours - h1 - 20 / 60) < 1e-9 && run.s.trips.length === 2, 'driving moves the clock on by the route, no more', fmtHours(run.s.hours - h1));
  // Save and load: the site, the distance driven and the trips survive.
  const saved = JSON.parse(JSON.stringify(run.toJSON()));
  run = new CaseRun(c, saved, ctx);
  check(run.s.site === 'loc_launch' && run.s.driven === 65 && run.s.trips.length === 2, 'save and load keep where you are and what you drove', `${run.s.driven} min`);
}
// Hidden sites are never waypoints: a copy of case 051 where the hidden launch site is a shortcut to Talek.
{
  const c = load(51);
  c.map.edges = c.map.edges.map(e => (e.a === 'loc_launch' && e.b === 'loc_landing') || (e.a === 'loc_launch' && e.b === 'loc_talek') ? { ...e, minutes: 10 } : e);
  const run = new CaseRun(c, null, ctxFor(51));
  run.kL.add('loc_talek');
  const r1 = run.route('loc_landing', 'loc_talek');
  check(r1.path.join('>') === 'loc_landing>loc_camp>loc_talek' && r1.minutes === 95, 'with the launch site hidden, the drive to Talek goes by the camp', `${r1.path.join(' > ')} ${r1.minutes} min`);
  run.kL.add('loc_launch');
  const r2 = run.route('loc_landing', 'loc_talek');
  check(r2.minutes === 20 && r2.path.includes('loc_launch'), 'once it is known, the shortcut is used', `${r2.minutes} min`);
}
// Off the map: a search location is reached without a drive and doesn't move you.
{
  const c = load(52), run = new CaseRun(c, null, ctxFor(52));
  run.kL.add('loc_lstore');
  const h = run.s.hours, v = run.visit('loc_lstore');
  check(v.ok && !v.travel && run.s.site === c.map.start && run.s.hours === h + 1, 'case 052: the workshop search is off the map: no drive, you stay at your site');
  const sites = run.sites();
  check(!sites.some(x => x.id === 'loc_lstore'), 'off-map places are not drawn on the map');
}
// A place on the map that isn't a location (case 060's lodge) is a landmark: shown, never driven to.
{
  const c = load(60), run = new CaseRun(c, null, ctxFor(60));
  const lodge = run.sites().find(x => x.id === 'plc_lodge');
  check(lodge && lodge.known && !lodge.location && !lodge.route && run.travel('plc_lodge') === null, 'case 060: the lodge is a landmark on the map, not a destination');
}
// Travel spends detention hours too.
{
  const c = load(54), run = new CaseRun(c, null, ctxFor(54));
  for (const l of c.locations) run.kL.add(l.id);
  run.visit(c.map.start);
  const sus = c.people.find(p => p.role === 'suspect' && run.interrogation.has(p.id));
  run.kP.add(sus.id);
  run.detain(sus.id);
  const left = run.hoursLeft(), r = run.visit('loc_post');
  check(Math.abs(left - run.hoursLeft() - (r.travel.minutes / 60 + 1)) < 1e-9, 'case 054: a drive while someone is detained spends their hours', `${fmtHours(left)} → ${fmtHours(run.hoursLeft())}`);
}
// The printed map: every case 51–100 draws, with every known site, deterministic, with the sheet's furniture.
{
  const kinds = {}, problems = [];
  for (let n = 51; n <= 100; n++) {
    const c = load(n), run = new CaseRun(c, null, ctxFor(n)); for (const l of c.locations) run.kL.add(l.id);
    try {
      const P = layoutSites(c.map.nodes, c.map.edges, { start: c.map.start, width: 600, height: 440, pad: 64 });
      const a = renderMap(c, { sites: run.sites(), here: run.s.site }, { W: 600, H: 440, full: true, P });
      const b = renderMap(c, { sites: run.sites(), here: run.s.site }, { W: 600, H: 440, full: true, P });
      const strip = t => t.replace(/-\d+x\d+/g, '');
      const drawn = (a.svg.match(/data-site="/g) || []).length, want = c.locations.filter(l => c.map.nodes.includes(l.id)).length;
      if (drawn !== want) problems.push(`${n}: ${drawn}/${want} sites`);
      if (strip(a.svg) !== strip(b.svg)) problems.push(`${n}: not deterministic`);
      for (const k of ['mp-rose', 'mp-scale', 'mp-inset', 'mp-gridnum', 'mp-corner', 'sm-car']) if (!a.svg.includes(k)) problems.push(`${n}: no ${k}`);
      if (a.legend.length < 4) problems.push(`${n}: legend ${a.legend.length}`);
      kinds[a.theme.kind] = (kinds[a.theme.kind] || 0) + 1;
    } catch (e) { problems.push(`${n}: ${e.message}`); }
  }
  check(!problems.length, 'printed map: cases 51–100 draw every site, the same every time, with north, scale, locator, grid and legend', problems.join('; ') || Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', '));
  check(['savanna', 'highland', 'arid', 'town', 'suburb', 'farmland', 'building', 'urban'].every(k => kinds[k]), 'every kind of sheet is used somewhere');
}
// Hidden sites and their roads are not drawn; the terrain doesn't change when they appear.
{
  const c = load(51), run = new CaseRun(c, null, ctxFor(51));
  const P = layoutSites(c.map.nodes, c.map.edges, { start: c.map.start, width: 340, height: 225 });
  const a = renderMap(c, { sites: run.sites(), here: run.s.site }, { W: 340, H: 225, P });
  run.kL.add('loc_launch');
  const b = renderMap(c, { sites: run.sites(), here: run.s.site }, { W: 340, H: 225, P });
  const ground = t => (t.match(/class="mp-contour[^"]*" stroke="[^"]+" d="[^"]+"|<path d="[^"]+" class="mp-contour/g) || []).join('');
  check(!a.svg.includes('data-site="loc_launch"') && b.svg.includes('data-site="loc_launch"'), 'a hidden site is not on the printed map until found');
  check(ground(a.svg) === ground(b.svg) && ground(a.svg).length > 100, 'finding a site does not move the terrain');
}
console.log(fails ? `\n${fails} failed` : '\nAll travel checks passed.');
process.exit(fails ? 1 : 0);
