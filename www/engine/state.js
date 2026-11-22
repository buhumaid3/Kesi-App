// Kesi engine: the case run. Pure logic, no DOM, so the same code runs in the game and in node tests.
// Unlock rules mirror tools/validate.mjs simulate() exactly (design doc §3.5 rule 2): what the validator
// proves reachable is exactly what a player can reach by visiting, tapping, interviewing and asking.

const arr = x => (Array.isArray(x) ? x : x == null ? [] : [x]);

export const GENERIC_REPLIES = [
  "I can't tell you anything about that.",
  "I don't know. Ask someone else.",
  "That's all I know.",
  "Nothing. I didn't see anything about that.",
];

export function genericReply(pid, about) {
  const i = [...(pid + about)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % GENERIC_REPLIES.length;
  return GENERIC_REPLIES[i];
}

export function emptySave() {
  return { kF: [], kE: [], kL: [], kP: [], visited: [], talked: [], asked: [], tapped: [], seenFacts: [], seenEvidence: [],
    log: [], charge: {}, passed: [], wrong: 0, hints: {}, hintLog: [], tut: [], pinned: [], board: null, view: null,
    credibility: 5, solved: false, startedAt: Date.now(),
    broken: [], greyed: [], tried: [], served: [], superior: false,
    hours: 0, at: null, labs: {}, rushed: [], detained: null, dStart: null, everDetained: [],
    site: null, driven: 0, trips: [] };
}

// The campaign clock (_campaign.json clock): hours each action takes, [min, max]. The engine charges the
// minimum, so any order the validator's clockPlan proves (rule 16) also fits in the game.
export const DEFAULT_CLOCK = { interview: [2, 2], visit: [1, 3], read: [0, 1], search: [3, 3], records: [4, 4], submit: [1, 1],
  detain: [0, 0], sample: [1, 1], press: [0, 0], wait: [1, 24], release: [0, 0], rush: [0, 0], travel: [0, 3], reopen: [0, 1] };
export const DETENTION_HOURS = 24;     // Article 49: before a court within 24 hours

// Hours as people say them: "45 min", "3 h", "2 h 15 min". The clock runs in fractions of an hour once
// travel is on the map (region 6), so anything shown to the player goes through this.
export function fmtHours(h) {
  const m = Math.round((h || 0) * 60), hh = Math.floor(Math.abs(m) / 60), mm = Math.abs(m) % 60, sign = m < 0 ? '-' : '';
  if (!hh) return `${sign}${mm} min`;
  return mm ? `${sign}${hh} h ${mm} min` : `${sign}${hh} h`;
}

export class CaseRun {
  constructor(c, saved, ctx = {}) {
    this.c = c;
    this.ctx = ctx;                      // { patternPins: Set of "case-NNN:f_id", regionRules }
    this.n = c.meta.number;
    this.region = c.meta.regionNumber;
    this.byId = new Map();
    for (const k of ['people', 'locations', 'evidence', 'facts', 'words', 'places']) for (const x of c[k] || []) this.byId.set(x.id, x);
    this.interrogation = new Map((c.interrogations || []).map(i => [i.person, i]));
    this.blanks = c.chargeSheet.groups.flatMap(g => g.blanks.map(b => ({ ...b, group: g.id })));
    this.contradictions = c.contradictions || [];
    this.claimOwner = new Map();
    for (const it of c.interrogations || []) for (const cl of [...(it.claims || []), ...(it.laterClaims || []).map(l => l.claim)]) this.claimOwner.set(cl, it.person);
    this.pins = ctx.patternPins || new Set();
    // Region 4: labs, detention samples and the arrest clock. The clock only runs in cases that need it.
    this.labs = c.evidence.filter(e => e.lab);
    this.samples = c.evidence.filter(e => e.detention);
    this.clockOn = !!(this.labs.length || this.samples.length || c.map);
    this.cost = ctx.clock || DEFAULT_CLOCK;
    this.transport = ctx.regionRules?.labTransportHours || 0;
    this.rushOn = this.clockOn && (ctx.regionRules ? (ctx.regionRules.allows?.gates || []).includes('forensicRush') : this.region >= 4);
    this.events = [];
    // Region 6: the site map. You are always at one site on it; going to another site drives the shortest
    // open route and costs the route's minutes (never more than the validator's clockPlan allows, rule 16).
    this.map = c.map || null;
    const s = { ...emptySave(), ...(saved || {}) };
    this.s = s;
    if (this.map && !s.site) s.site = this.map.start;
    for (const k of ['kF', 'kE', 'kL', 'kP', 'visited', 'talked', 'asked', 'tapped', 'seenFacts', 'seenEvidence', 'passed', 'tut'])
      this[k] = new Set(s[k] || []);
    if (!saved) {
      for (const f of c.ob.facts || []) this._addFact(f, 'ob');
    }
    this.refresh();
  }

  // ── Serialisation ────────────────────────────────────────────────────────────────────────────
  toJSON() {
    const out = { ...this.s };
    for (const k of ['kF', 'kE', 'kL', 'kP', 'visited', 'talked', 'asked', 'tapped', 'seenFacts', 'seenEvidence', 'passed', 'tut'])
      out[k] = [...this[k]];
    return out;
  }

  // ── Unlocks (validator rule 2 semantics) ───────────────────────────────────────────────────────
  ok(u) {
    if (!u) return false;
    return !!(u.start || (u.fact && this.kF.has(u.fact)) || (u.evidence && this.kE.has(u.evidence))
      || (u.location && this.kL.has(u.location)) || (u.anyOf && u.anyOf.some(x => this.kF.has(x))));
  }
  known(x) { return this.kF.has(x) || this.kE.has(x) || this.kP.has(x) || this.kL.has(x); }

  refresh() {
    let changed = true; const news = [];
    while (changed) {
      changed = false;
      for (const l of this.c.locations) if (!this.kL.has(l.id) && this.ok(l.unlock)) { this.kL.add(l.id); news.push({ type: 'location', id: l.id }); changed = true; }
      for (const p of this.c.people) if (!this.kP.has(p.id) && this.ok(p.unlock)) { this.kP.add(p.id); news.push({ type: 'person', id: p.id }); changed = true; }
      // Immediate results (an autopsy, an on-site comparison: lab.hours 0) arrive as soon as what they need is in hand.
      for (const e of this.labs) if (!e.lab.hours && !this.kE.has(e.id) && this.labNeedsMet(e)) {
        const g = this.collect(e.id, 'lab'); if (g.evidence) { news.push({ type: 'evidence', id: e.id, facts: g.facts, lab: true }); this.events.push({ type: 'lab', id: e.id, facts: g.facts, now: true }); changed = true; }
      }
    }
    return news;
  }

  _addFact(id, src) {
    if (this.kF.has(id) || !this.byId.has(id)) return false;
    this.kF.add(id);
    this.s.log.push({ f: id, src, at: this.s.log.length });
    return true;
  }

  // Collect an evidence card: every fact on it goes into the notebook at once (§2.2).
  collect(evId, src) {
    const e = this.byId.get(evId);
    if (!e || this.kE.has(evId)) return { evidence: null, facts: [] };
    if (e.gate && !this.s.served.includes(evId)) return { evidence: null, facts: [], gated: this.gateInfo(evId) };
    this.kE.add(evId);
    const facts = (e.facts || []).filter(f => this._addFact(f, src || evId));
    return { evidence: evId, facts };
  }

  // ── Warrants (region 2) and records requests (region 3) ──────────────────────────────────────────────
  // A gated card needs paperwork: a search warrant for a hotspot in a search location, a court order for
  // phone and mobile-money records. The form can only be filed once one of its grounds is known; it costs
  // credibility stamps. With no stamps left the case isn't lost: Mwalimu signs it instead and
  // the case can earn one star at most (§2.5, no softlocks).
  gateInfo(evId) {
    const e = this.byId.get(evId); if (!e?.gate) return null;
    const grounds = e.gate.grounds || [];
    return { id: evId, action: e.gate.action, cost: e.gate.cost ?? 1, grounds, ready: !grounds.length || grounds.some(g => this.kF.has(g)),
      served: this.s.served.includes(evId), title: e.title };
  }
  // Records requests need no place: their form is on the desk as soon as the grounds are known.
  requests() {
    return this.c.evidence.filter(e => e.gate?.action === 'records' && !this.kE.has(e.id)).map(e => this.gateInfo(e.id)).filter(g => g.ready);
  }
  file(evId, src) {
    const g = this.gateInfo(evId);
    if (!g || g.served || !g.ready) return null;
    let superior = false;
    if (this.s.credibility >= g.cost) this.s.credibility -= g.cost; else { this.s.credibility = 0; this.s.superior = superior = true; }
    this.s.served.push(evId);
    this.tick(this.cost[g.action === 'warrant' ? 'search' : 'records']?.[0] || 0);
    const got = this.collect(evId, src || g.action);
    return { ...got, gate: g, superior, unlocked: this.refresh() };
  }

  // ── Pressing a claim (region 2) ───────────────────────────────────────────────────────────────────
  // Pick a claim on someone's statement sheet and put a fact in front of them. If the fact is one of the
  // contradiction's brokenBy, the claim breaks: the reaction, a stamp (implicates: red; explains: grey;
  // mistaken: amber), and whatever it reveals. Linked claims (greys) collapse with it. A fact that doesn't
  // contradict the claim costs a stamp, once per pairing (the same wrong pairing again is free).
  claimState(fid) {
    const k = this.contradictions.find(x => x.claim === fid && this.s.broken.includes(x.id));
    if (k) return { state: 'broken', mark: k.mark, k };
    if (this.s.greyed.includes(fid)) return { state: 'greyed', mark: 'explains' };
    return null;
  }
  pressable(pid) { return this.claimsOf(pid).filter(f => !this.claimState(f)); }
  pressOn() { return this.contradictions.length > 0; }
  press(pid, claim, fid) {
    if (this.claimOwner.get(claim) !== pid || !this.kF.has(claim) || !this.kF.has(fid) || this.claimState(claim) || this.isReleased(pid)) return null;
    const k = this.contradictions.find(x => x.claim === claim && x.brokenBy.includes(fid));
    if (!k) {
      const pair = claim + '|' + fid, again = this.s.tried.includes(pair);
      let cost = 0;
      if (!again) { this.s.tried.push(pair); if (this.credibilityOn() && this.s.credibility > 0) { this.s.credibility--; cost = 1; } this.s.badPress = (this.s.badPress || 0) + 1; }
      return { ok: false, again, cost };
    }
    this.s.broken.push(k.id);
    for (const g of k.greys || []) if (!this.s.greyed.includes(g)) this.s.greyed.push(g);
    const facts = [], evidence = [];
    for (const r of k.reveals || []) {
      if (this.c.facts.some(f => f.id === r)) { if (this._addFact(r, pid)) facts.push(r); }
      else { const g = this.collect(r, pid); if (g.evidence) { evidence.push(g.evidence); facts.push(...g.facts); } }
    }
    // A broken claim can let a later claim through (laterClaims with after: a revealed fact).
    const it = this.interrogation.get(pid);
    for (const lc of it?.laterClaims || []) if (this.kF.has(lc.after) && this._addFact(lc.claim, pid)) facts.push(lc.claim);
    return { ok: true, k, mark: k.mark, reaction: k.reaction, facts, evidence, unlocked: this.refresh() };
  }

  // ── The clock, the lab and detention (region 4, §2.5; validator rules 16 and 17) ────────────────────
  // Nothing runs in real time: actions advance in-game hours. A lab test comes back `lab.hours` after it is
  // submitted (plus the region's transport hours). Detaining someone starts 24 hours; inside them their
  // samples can be taken without consent. When the hours run out they are released and can't be questioned
  // or pressed again. That never ends the case: the rest of the evidence, and Mwalimu, are still there.
  tick(h) {
    if (!this.clockOn || !h) return this.events;
    this.s.hours = Math.round((this.s.hours + h) * 60) / 60;          // whole minutes, no float drift
    for (const [id, due] of Object.entries(this.s.labs)) if (due <= this.s.hours + 1e-9 && !this.kE.has(id)) {
      const g = this.collect(id, 'lab'); this.events.push({ type: 'lab', id, facts: g.facts, at: due });
    }
    if (this.s.detained && this.s.hours > this.s.dStart + DETENTION_HOURS + 1e-9) {
      const pid = this.s.detained; this.s.detained = null; this.events.push({ type: 'released', pid, expired: true });
    }
    if (this.events.length) this.refresh();
    return this.events;
  }
  takeEvents() { const e = this.events; this.events = []; return e; }
  labNeedsMet(e) { return (e.lab.needs || []).every(x => this.kE.has(x)); }
  labsReady() {
    return this.labs.filter(e => e.lab.hours > 0 && !this.kE.has(e.id) && !(e.id in this.s.labs) && this.labNeedsMet(e))
      .map(e => ({ id: e.id, title: e.title, test: e.lab.test, hours: e.lab.hours + this.transport }));
  }
  labsPending() {
    return Object.entries(this.s.labs).filter(([id]) => !this.kE.has(id))
      .map(([id, due]) => ({ id, title: this.byId.get(id).title, test: this.byId.get(id).lab.test, due, left: Math.round((due - this.s.hours) * 60) / 60 })).sort((a, b) => a.due - b.due);
  }
  submitLab(evId) {
    const e = this.byId.get(evId);
    if (!e?.lab || !this.labsReady().some(x => x.id === evId)) return null;
    this.tick(this.cost.submit[0]);
    this.s.labs[evId] = this.s.hours + e.lab.hours + this.transport;
    return { id: evId, due: this.s.labs[evId], events: this.takeEvents(), unlocked: this.refresh() };
  }
  // Forensic rush: one stamp, the result now (rule 17: never needed to solve).
  rush(evId) {
    if (!this.rushOn || !(evId in this.s.labs) || this.kE.has(evId)) return null;
    let superior = false;
    if (this.s.credibility >= 1) this.s.credibility--; else { this.s.superior = superior = true; }
    this.s.rushed.push(evId);
    this.s.labs[evId] = this.s.hours;
    const g = this.collect(evId, 'lab');
    return { id: evId, evidence: g.evidence, facts: g.facts, superior, unlocked: this.refresh() };
  }
  // Wait: to the next lab result, or a number of hours.
  wait(hours) {
    if (!this.clockOn) return null;
    const next = this.labsPending()[0];
    const h = hours ?? (next ? Math.max(1, next.left) : 1);
    this.tick(Math.min(24, Math.max(1, h)));
    const events = this.takeEvents();
    return { hours: this.s.hours, events, facts: events.flatMap(e => e.facts || []), unlocked: this.refresh() };
  }
  detainOn() { return this.clockOn; }
  isReleased(pid) { return this.s.everDetained.includes(pid) && this.s.detained !== pid; }
  canDetain(pid) {
    const p = this.byId.get(pid);
    return this.detainOn() && this.kP.has(pid) && p?.role === 'suspect' && this.interrogation.has(pid) && !this.s.everDetained.includes(pid) && !this.s.detained;
  }
  detain(pid) {
    if (!this.canDetain(pid)) return null;
    this.s.detained = pid; this.s.dStart = this.s.hours; this.s.everDetained.push(pid);
    this.tick(this.cost.detain[0]);
    return { pid, until: this.s.dStart + DETENTION_HOURS, unlocked: this.refresh() };
  }
  release() {
    const pid = this.s.detained; if (!pid) return null;
    this.s.detained = null; this.events.push({ type: 'released', pid, expired: false });
    return { pid, events: this.takeEvents() };
  }
  // The case clock as a time of day: it starts on the hour after the OB entry.
  clockAt(hours = this.s.hours) {
    const m = /^(\d{1,2}):(\d{2})/.exec(this.c.ob.time || ''); const start = m ? +m[1] + (+m[2] > 0 ? 1 : 0) : 8;
    const t = Math.round((start + hours) * 60), day = 1 + Math.floor(t / 1440);
    const hh = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    return { day, hh, label: `Day ${day} · ${hh}` };
  }
  // ── The site map (region 6) ──────────────────────────────────────────────────────────────────────
  onMap(id) { return !!this.map?.nodes.includes(id); }
  // The shortest route between two sites, through sites you know about (a hidden site is never a waypoint;
  // if there's no other way, any road will do).
  route(from, to) {
    if (!this.map || !this.onMap(from) || !this.onMap(to)) return null;
    if (from === to) return { from, to, minutes: 0, path: [from], legs: [] };
    const open = id => id === to || id === from || this.kL.has(id);
    const run = passable => {
      const dist = new Map([[from, 0]]), prev = new Map(), todo = new Set(this.map.nodes.filter(passable));
      while (todo.size) {
        let u = null; for (const x of todo) if (dist.has(x) && (u === null || dist.get(x) < dist.get(u))) u = x;
        if (u === null) break; todo.delete(u); if (u === to) break;
        for (const e of this.map.edges) {
          const v = e.a === u ? e.b : e.b === u ? e.a : null;
          if (!v || !todo.has(v)) continue;
          const d = dist.get(u) + e.minutes;
          if (!dist.has(v) || d < dist.get(v)) { dist.set(v, d); prev.set(v, { u, e }); }
        }
      }
      if (!dist.has(to)) return null;
      const path = [to], legs = []; let x = to;
      while (x !== from) { const p = prev.get(x); legs.unshift(p.e); path.unshift(p.u); x = p.u; }
      return { from, to, minutes: dist.get(to), path, legs };
    };
    return run(open) || run(() => true);
  }
  // Every site on the map, as the player sees it now.
  sites() {
    if (!this.map) return [];
    return this.map.nodes.map(id => {
      const x = this.byId.get(id), location = this.c.locations.some(l => l.id === id);
      const known = location ? this.kL.has(id) : true;     // a place on the map (a lodge, a town) is a landmark
      return { id, name: x?.name || id, location, known, here: this.s.site === id, visited: this.visited.has(id), kind: x?.kind,
        route: known && location ? this.route(this.s.site, id) : null };
    });
  }
  // Drive to a site. The clock moves on by the route's minutes.
  travel(to) {
    if (!this.map || !this.onMap(to) || !this.kL.has(to) || to === this.s.site) return null;
    const r = this.route(this.s.site, to); if (!r) return null;
    this.s.site = to; this.s.driven += r.minutes;
    this.s.trips.push({ from: r.from, to, minutes: r.minutes, at: this.s.hours });
    this.tick(r.minutes / 60);
    return { ...r, by: [...new Set(r.legs.map(e => e.by))], unlocked: this.refresh() };   // results that came back on the road wait in this.events for the caller
  }
  hoursLeft() { return this.s.detained ? Math.round((this.s.dStart + DETENTION_HOURS - this.s.hours) * 60) / 60 : null; }
  samplesFor(pid) { return this.samples.filter(e => e.detention === pid && !this.kE.has(e.id)); }
  sample(evId) {
    const e = this.byId.get(evId);
    if (!e?.detention || this.kE.has(evId) || this.s.detained !== e.detention) return null;
    if (this.hoursLeft() < this.cost.sample[0] - 1e-9) return null;
    this.tick(this.cost.sample[0]);
    const g = this.collect(evId, 'sample');
    return { ...g, events: this.takeEvents(), unlocked: this.refresh() };
  }

  // ── Places ─────────────────────────────────────────────────────────────────────────────────────
  locations() { return this.c.locations.filter(l => this.kL.has(l.id)); }
  // Visiting a site on the map drives there first (region 6). Places off the map (a search, a warrant, a
  // vehicle) are reached without a drive. Returns { ok, travel } or false.
  visit(locId) {
    if (!this.kL.has(locId)) return false;
    const travel = this.map && this.onMap(locId) && this.s.site !== locId ? this.travel(locId) : null;
    if (this.clockOn && this.s.at !== locId) { this.s.at = locId; this.tick(this.cost.visit[0]); }
    this.visited.add(locId); return { ok: true, travel };
  }
  hotspots(locId) {
    const l = this.byId.get(locId);
    return (l?.hotspots || []).filter(h => !h.unlock || this.ok(h.unlock));
  }
  tapHotspot(locId, hsId) {
    const h = this.hotspots(locId).find(x => x.id === hsId);
    if (!h) return null;
    const first = !this.tapped.has(hsId);
    this.tapped.add(hsId);
    const got = h.yields ? this.collect(h.yields, hsId) : { evidence: null, facts: [] };
    const unlocked = this.refresh();
    return { hotspot: h, first, ...got, unlocked };
  }

  // ── People ─────────────────────────────────────────────────────────────────────────────────────
  people() { return this.c.people.filter(p => this.kP.has(p.id)); }
  canInterview(pid) { return this.kP.has(pid) && this.interrogation.has(pid) && !this.isReleased(pid) && this.talks(this.interrogation.get(pid)); }
  talks(it) {
    if (it.stance === 'guarded') return (it.opensWith || []).some(x => this.kF.has(x) || this.kE.has(x));
    if (it.stance === 'lawyered') return (it.lawyered?.reopenedBy || []).some(x => this.kF.has(x));
    return true;
  }
  interview(pid) {
    const it = this.interrogation.get(pid);
    if (!it || !this.canInterview(pid)) return null;
    const first = !this.talked.has(pid);
    this.talked.add(pid);
    if (first) this.tick(this.cost.interview[0]);
    const evidence = [], facts = [];
    for (const y of it.yields || []) { const r = this.collect(y, pid); if (r.evidence) { evidence.push(r.evidence); facts.push(...r.facts); } }
    for (const cl of it.claims || []) if (this._addFact(cl, pid)) facts.push(cl);
    for (const lc of it.laterClaims || []) if (this.kF.has(lc.after) && this._addFact(lc.claim, pid)) facts.push(lc.claim);
    const unlocked = this.refresh();
    return { it, first, evidence, facts, unlocked };
  }
  claimsOf(pid) {
    const it = this.interrogation.get(pid); if (!it) return [];
    return [...(it.claims || []), ...(it.laterClaims || []).map(l => l.claim)].filter(f => this.kF.has(f));
  }
  // Everything Amani can ask a person about: known people, places and evidence, plus any authored topic
  // about a known fact. Authored topics answer; anything else gets a plain "don't know".
  topics(pid) {
    const it = this.interrogation.get(pid); if (!it) return [];
    const authored = new Map((it.topics || []).map(t => [t.about, t]));
    const items = [];
    const add = (about, kind) => {
      if (about === pid) return;
      items.push({ about, kind, authored: authored.has(about), asked: this.asked.has(pid + '|' + about) });
    };
    for (const p of this.c.people) if (this.kP.has(p.id)) add(p.id, 'person');
    for (const l of this.c.locations) if (this.kL.has(l.id)) add(l.id, 'location');
    // Someone else's statement can be put to a person too (case 47: Fidelis's statement opens Sharleen).
    for (const e of this.c.evidence) if (this.kE.has(e.id) && (e.type !== 'witness' || (e.body?.speaker && e.body.speaker !== pid))) add(e.id, 'evidence');
    for (const t of it.topics || []) if (this.kF.has(t.about)) add(t.about, 'fact');
    return items;
  }
  ask(pid, about) {
    const it = this.interrogation.get(pid); if (!it || !this.known(about)) return null;
    this.asked.add(pid + '|' + about);
    const t = (it.topics || []).find(x => x.about === about);
    if (!t) {
      return { reply: genericReply(pid, about), facts: [], evidence: [], generic: true, unlocked: [] };
    }
    const facts = [], evidence = [];
    for (const r of t.reveals || []) {
      const x = this.byId.get(r);
      if (!x) continue;
      if (this.c.facts.includes(x)) { if (this._addFact(r, pid)) facts.push(r); }
      else { const g = this.collect(r, pid); if (g.evidence) { evidence.push(g.evidence); facts.push(...g.facts); } }
    }
    const unlocked = this.refresh();
    return { reply: t.reply, facts, evidence, generic: false, unlocked };
  }

  // ── Notebook ───────────────────────────────────────────────────────────────────────────────────
  factsKnown() { return this.s.log.filter(l => this.kF.has(l.f)).map(l => ({ ...this.byId.get(l.f), src: l.src, order: l.at })); }
  unseenFacts() { return [...this.kF].filter(f => !this.seenFacts.has(f)); }
  markSeen(ids) { for (const i of ids) this.seenFacts.add(i); }
  pin(fid) {
    const p = this.s.pinned;
    const i = p.indexOf(fid);
    if (i >= 0) p.splice(i, 1); else { if (p.length >= 6) p.shift(); p.push(fid); }
    return [...p];
  }

  // ── Charge sheet ───────────────────────────────────────────────────────────────────────────────
  bank(category) {
    // Pin words (SPINE groups) also need their pin on the Pattern File, i.e. found in an earlier case (rule 15).
    return this.c.words.filter(w => w.category === category && (w.unlock?.start || (w.unlock?.anyOf || []).some(x => this.kF.has(x)))
      && (!w.pin || this.pins.has(w.pin)));
  }
  blank(id) { return this.blanks.find(b => b.id === id); }
  options(blankId) {
    const b = this.blank(blankId);
    let ws = this.bank(b.category);
    if (b.pool) ws = ws.filter(w => b.pool.includes(w.id));
    if ((this.s.hintFilled || []).includes(blankId) && !ws.some(w => w.id === b.answer)) ws = [...ws, this.byId.get(b.answer)];
    return ws;
  }
  // ── The timeline strip (region 5, from case 43) ─────────────────────────────────────────────────
  // Event cards dragged into time slots, graded together. An event card appears once one of its unlock
  // facts is known; a slot holds one card; the strip is ready when every card is on it.
  stripOf(blankId) { const b = this.blank(blankId); return b?.category === 'strip' ? b.strip : null; }
  stripPlaced(blankId) { const v = this.s.charge[blankId]; return v && typeof v === 'object' ? v : {}; }
  stripEvents(blankId) {
    const st = this.stripOf(blankId); if (!st) return [];
    const placed = this.stripPlaced(blankId), hinted = this.s.stripHinted || [];
    return st.events.filter(e => !e.unlock || (e.unlock.anyOf || []).some(x => this.kF.has(x)) || hinted.includes(e.id))
      .map(e => ({ id: e.id, text: e.text, slot: placed[e.id] || null, hinted: hinted.includes(e.id) }));
  }
  placeEvent(blankId, eventId, slotId) {
    const b = this.blank(blankId), st = this.stripOf(blankId); if (!st || this.passed.has(b.group)) return false;
    if (!this.stripEvents(blankId).some(e => e.id === eventId)) return false;
    if (slotId != null && !st.slots.some(x => x.id === slotId)) return false;
    const placed = { ...this.stripPlaced(blankId) };
    // A card dropped on a taken slot swaps with the card there (back to where this one came from, or off).
    const other = Object.keys(placed).find(k => placed[k] === slotId && k !== eventId);
    if (other) { if (placed[eventId]) placed[other] = placed[eventId]; else delete placed[other]; }
    if (slotId == null) delete placed[eventId]; else placed[eventId] = slotId;
    this.s.charge[blankId] = placed; return true;
  }
  stripReady(blankId) { const st = this.stripOf(blankId), p = this.stripPlaced(blankId); return !!st && st.events.every(e => p[e.id]); }
  stripCorrect(b) { const p = this.stripPlaced(b.id); return b.strip.events.every(e => p[e.id] === e.slot); }

  setBlank(blankId, wordId) {
    const b = this.blank(blankId); if (!b || this.passed.has(b.group) || b.category === 'strip') return false;
    if (wordId == null) { delete this.s.charge[blankId]; return true; }
    if (!this.options(blankId).some(w => w.id === wordId)) return false;
    this.s.charge[blankId] = wordId; return true;
  }
  ready() { return this.blanks.every(b => b.category === 'strip' ? this.stripReady(b.id) : this.s.charge[b.id]); }
  groupCorrect(g) {
    if (g.unordered) {
      const want = g.blanks.map(b => b.answer).sort().join('|');
      const got = g.blanks.map(b => this.s.charge[b.id]).sort().join('|');
      return want === got;
    }
    return g.blanks.every(b => { if (b.category === 'strip') return this.stripCorrect(b); const v = this.s.charge[b.id]; return v === b.answer || (b.accept || []).includes(v); });
  }
  submit() {
    if (!this.ready()) return null;
    const results = [];
    let anyFail = false;
    for (const g of this.c.chargeSheet.groups) {
      if (this.passed.has(g.id)) { results.push({ id: g.id, pass: true, already: true }); continue; }
      const pass = this.groupCorrect(g);
      if (pass) this.passed.add(g.id); else anyFail = true;
      const fails = arr(g.prosecutor?.fail);
      results.push({ id: g.id, kind: g.kind, pass, line: pass ? g.prosecutor?.pass : fails[this.s.wrong % Math.max(1, fails.length)] });
    }
    if (anyFail) {
      this.s.wrong++;
      if (this.credibilityOn()) this.s.credibility = Math.max(0, this.s.credibility - 1);
    }
    const solved = this.c.chargeSheet.groups.every(g => this.passed.has(g.id));
    if (solved) this.s.solved = true;
    return { results, solved, wrong: this.s.wrong };
  }
  credibilityOn() { return this.region >= 2; }

  // ── Hints (§2.8): tier 1 where to look, tier 2 what to notice, tier 3 fills one blank ──────────────
  hintTier(gid) { return this.s.hints[gid] || 0; }
  hint(gid) {
    const g = this.c.chargeSheet.groups.find(x => x.id === gid); if (!g || this.passed.has(gid)) return null;
    const tier = Math.min(3, this.hintTier(gid) + 1);
    this.s.hints[gid] = tier;
    const h = (this.c.hints || {})[gid] || {};
    let out;
    if (tier === 1) out = { tier, line: h.tier1?.line, point: h.tier1?.point };
    else if (tier === 2) out = { tier, line: h.tier2?.line, facts: h.tier2?.facts || [] };
    else {
      const sb = g.blanks.find(x => x.category === 'strip');
      if (sb) {
        // On a strip, tier 3 puts one card in its slot (the first that is off or wrong).
        const placed = this.stripPlaced(sb.id), ev = sb.strip.events.find(e => placed[e.id] !== e.slot) || sb.strip.events[0];
        this.s.stripHinted = [...new Set([...(this.s.stripHinted || []), ev.id])];
        this.placeEvent(sb.id, ev.id, ev.slot);
        const sl = sb.strip.slots.find(x => x.id === ev.slot);
        out = { tier, blank: sb.id, event: ev.id, slot: ev.slot, line: `"${ev.text}" goes at ${sl.label}. Then make sure you can say why.` };
        if (out.facts) out.missing = [];
        this.s.hintLog.push({ gid, tier, at: Date.now() });
        return out;
      }
      // Fill the first blank that is empty or wrong with its answer.
      const b = g.blanks.find(x => this.s.charge[x.id] !== x.answer) || g.blanks[0];
      this.s.charge[b.id] = b.answer;
      this.s.hintFilled = [...new Set([...(this.s.hintFilled || []), b.id])];
      const w = this.byId.get(b.answer);
      out = { tier, blank: b.id, word: b.answer, line: `Put ${w?.text || 'that'} in the blank. Then make sure you can say why.` };
    }
    // Tier 2 facts the player hasn't found yet are pointed to by their card, never given away.
    if (out.facts) out.missing = out.facts.filter(f => !this.kF.has(f) && !this.pins.has(f));
    this.s.hintLog.push({ gid, tier, at: Date.now() });
    return out;
  }
  // Tier 3 again: if the group still fails after all blanks are hinted, keep filling.
  maxHintTier() { return Math.max(0, ...Object.values(this.s.hints)); }

  stars() {
    const t = this.maxHintTier(), w = this.s.wrong, cred = this.credibilityOn() ? this.s.credibility : 5;
    if (t >= 3 || w > 3 || cred <= 0 || this.s.superior) return 1;
    if (t >= 1 || w >= 2) return 2;
    return 3;
  }
  starReason() {
    const t = this.maxHintTier(), w = this.s.wrong;
    const parts = [];
    parts.push(w === 0 ? 'No returned sheets' : `${w} returned sheet${w > 1 ? 's' : ''}`);
    parts.push(t === 0 ? 'no calls to Mwalimu' : t === 3 ? 'Mwalimu gave you a name' : 'Mwalimu pointed the way');
    if (this.s.superior) parts.push('Mwalimu had to sign your paperwork');
    return parts.join(', ');
  }

  // Facts that pin to the Pattern File when this case is solved (§4.7: auto-filed whether found or not).
  spinePins() { return this.c.facts.filter(f => f.spine).map(f => ({ key: `case-${String(this.n).padStart(3, '0')}:${f.id}`, thread: f.spine, text: f.text, found: this.kF.has(f.id) })); }

  // ── Tutorial voice-notes (case 1) ────────────────────────────────────────────────────────────────
  tutorial(trigger) {
    const t = (this.c.tutorial || []).find(x => x.trigger === trigger);
    if (!t || this.tut.has(trigger)) return null;
    this.tut.add(trigger);
    return t.line;
  }
}

// ── Notebook grouping (§2.7): by person, place, evidence and time ────────────────────────────────────
export function groupFacts(run) {
  const facts = run.factsKnown();
  const groups = { person: new Map(), place: new Map(), evidence: new Map() };
  for (const f of facts) {
    for (const a of f.about || []) {
      const t = a.startsWith('p_') ? 'person' : (a.startsWith('loc_') || a.startsWith('plc_')) ? 'place' : a.startsWith('ev_') ? 'evidence' : null;
      if (!t) continue;
      if (!groups[t].has(a)) groups[t].set(a, []);
      groups[t].get(a).push(f);
    }
  }
  return groups;
}

// Minutes since 00:00, with times after midnight continuing past 24:00 when they follow an evening time.
export function toMin(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(':').map(Number); return h * 60 + m;
}
export function timeRows(run) {
  const rows = [];
  for (const f of run.factsKnown()) {
    if (f.where) rows.push({ fact: f.id, person: f.where.person, place: f.where.place, from: f.where.from, to: f.where.to, text: f.text });
    else if (f.at) rows.push({ fact: f.id, person: null, place: null, from: f.at.from, to: f.at.to, text: f.text });
  }
  // Late-night windows: anything earlier than 06:00 in a case whose times are mostly evening is read as after midnight.
  const mins = rows.flatMap(r => [toMin(r.from), toMin(r.to)]).filter(x => x != null);
  const evening = mins.filter(m => m >= 18 * 60).length > mins.length / 2;
  const adj = m => (m == null ? null : evening && m < 6 * 60 ? m + 1440 : m);
  for (const r of rows) { r.a = adj(toMin(r.from)); r.b = adj(toMin(r.to)); }
  rows.sort((x, y) => (x.a ?? x.b ?? 0) - (y.a ?? y.b ?? 0));
  return rows;
}
