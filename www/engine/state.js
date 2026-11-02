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
    credibility: 5, solved: false, startedAt: Date.now() };
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
    const s = { ...emptySave(), ...(saved || {}) };
    this.s = s;
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
    if (e.gate) return { evidence: null, facts: [], gated: e.gate };   // gates arrive in region 2
    this.kE.add(evId);
    const facts = (e.facts || []).filter(f => this._addFact(f, src || evId));
    return { evidence: evId, facts };
  }

  // ── Places ─────────────────────────────────────────────────────────────────────────────────────
  locations() { return this.c.locations.filter(l => this.kL.has(l.id)); }
  visit(locId) {
    if (!this.kL.has(locId)) return false;
    this.visited.add(locId); return true;
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
  canInterview(pid) { return this.kP.has(pid) && this.interrogation.has(pid) && this.talks(this.interrogation.get(pid)); }
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
    for (const e of this.c.evidence) if (this.kE.has(e.id) && e.type !== 'witness') add(e.id, 'evidence');
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
    return this.c.words.filter(w => w.category === category && (w.unlock?.start || (w.unlock?.anyOf || []).some(x => this.kF.has(x))));
  }
  blank(id) { return this.blanks.find(b => b.id === id); }
  options(blankId) {
    const b = this.blank(blankId);
    let ws = this.bank(b.category);
    if (b.pool) ws = ws.filter(w => b.pool.includes(w.id));
    if ((this.s.hintFilled || []).includes(blankId) && !ws.some(w => w.id === b.answer)) ws = [...ws, this.byId.get(b.answer)];
    return ws;
  }
  setBlank(blankId, wordId) {
    const b = this.blank(blankId); if (!b || this.passed.has(b.group)) return false;
    if (wordId == null) { delete this.s.charge[blankId]; return true; }
    if (!this.options(blankId).some(w => w.id === wordId)) return false;
    this.s.charge[blankId] = wordId; return true;
  }
  ready() { return this.blanks.every(b => this.s.charge[b.id]); }
  groupCorrect(g) {
    if (g.unordered) {
      const want = g.blanks.map(b => b.answer).sort().join('|');
      const got = g.blanks.map(b => this.s.charge[b.id]).sort().join('|');
      return want === got;
    }
    return g.blanks.every(b => { const v = this.s.charge[b.id]; return v === b.answer || (b.accept || []).includes(v); });
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
      // Fill the first blank that is empty or wrong with its answer.
      const b = g.blanks.find(x => this.s.charge[x.id] !== x.answer) || g.blanks[0];
      this.s.charge[b.id] = b.answer;
      this.s.hintFilled = [...new Set([...(this.s.hintFilled || []), b.id])];
      const w = this.byId.get(b.answer);
      out = { tier, blank: b.id, word: b.answer, line: `Put ${w?.text || 'that'} in the blank. Then make sure you can say why.` };
    }
    // Tier 2 facts the player hasn't found yet are pointed to by their card, never given away.
    if (out.facts) out.missing = out.facts.filter(f => !this.kF.has(f));
    this.s.hintLog.push({ gid, tier, at: Date.now() });
    return out;
  }
  // Tier 3 again: if the group still fails after all blanks are hinted, keep filling.
  maxHintTier() { return Math.max(0, ...Object.values(this.s.hints)); }

  stars() {
    const t = this.maxHintTier(), w = this.s.wrong, cred = this.credibilityOn() ? this.s.credibility : 5;
    if (t >= 3 || w > 3 || cred <= 0) return 1;
    if (t >= 1 || w >= 2) return 2;
    return 3;
  }
  starReason() {
    const t = this.maxHintTier(), w = this.s.wrong;
    const parts = [];
    parts.push(w === 0 ? 'No returned sheets' : `${w} returned sheet${w > 1 ? 's' : ''}`);
    parts.push(t === 0 ? 'no calls to Mwalimu' : t === 3 ? 'Mwalimu gave you a name' : 'Mwalimu pointed the way');
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
