#!/usr/bin/env node
// Kesi: Kenya Case Files — case solvability validator.
// Implements design doc §3.5 rules 1–18 (rule 13 is the cross-case curve check; rules 16 and 17
// replay each case's authored clock plan against the 24-hour arrest clock; from region 5 the WHEN
// group is checked: single time windows and the timeline strip; from region 6 the WHERE group and the
// site map: travel steps in the clock plan must follow the map's routes).
// Usage: node tools/validate.mjs [casesDir] [--quiet]
// Exit code 1 if any case has an error.

import fs from 'node:fs';
import path from 'node:path';

const casesDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'www/cases';
const quiet = process.argv.includes('--quiet');
const imgDir = path.join(path.dirname(casesDir), 'img', 'cases');

const campaign = JSON.parse(fs.readFileSync(path.join(casesDir, '_campaign.json'), 'utf8'));
const files = fs.readdirSync(casesDir).filter(f => /^case-\d{3}\.json$/.test(f)).sort();

// Phone-screen length limits (rule 11).
const LIMITS = {
  'ob.text': 480, 'fact.text': 200, 'topic.reply': 340, 'hotspot.text': 260, 'person.bio': 220,
  'reconstruction.text': 340, 'prosecutor': 220, 'hint.line': 240, 'evidence.title': 48,
  'location.description': 420, 'interrogation.intro': 260, 'contradiction.reaction': 300,
  'tutorial.line': 220, 'glossary.def': 160,
};

// Lexicon: every Swahili/Sheng term the campaign defines anywhere. If a term appears in a
// case's player-facing text, that case's glossary must define it (rule 11).
const lexicon = new Set((campaign.lexicon || []).map(t => t.toLowerCase()));

let totalErrors = 0, totalWarnings = 0, missingImages = 0;

// Every case is loaded up front: the Pattern File (rule 15) and the curve check (rule 13) are cross-case.
const allCases = new Map(files.map(f => [f.replace('.json', ''), JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8'))]));
const pinId = (caseId, factId) => `${caseId}:${factId}`;
// The Pattern File as it stands when case N opens: the opening pins plus every spine fact of every
// earlier case (spine facts are auto-filed on solve, design doc §4.7), once the file has unlocked.
function patternFileBefore(n) {
  const pf = campaign.patternFile || {};
  if (!pf.unlocksAfter || n <= pf.unlocksAfter) return new Set();
  const pins = new Set(pf.openingPins || []);
  for (const [cid, cc] of allCases) if (cc.meta.number < n) for (const f of cc.facts) if (f.spine) pins.add(pinId(cid, f.id));
  return pins;
}
const resolvePin = id => { const [cid, fid] = id.split(':'); return allCases.get(cid)?.facts.find(f => f.id === fid); };
// One number per case for the curve check (rule 13): what a player has to hold in their head.
const curveScore = cc => {
  const d = cc.difficulty;
  return d.suspects + d.chainLength + d.liars + d.redHerrings + (d.twist ? 1 : 0) + (d.gatedActions || []).length + 2 * (d.groups.length - 1);
};

for (const file of files) {
  const c = allCases.get(file.replace('.json', ''));
  const errors = [], warnings = [];
  const E = m => errors.push(m), W = m => warnings.push(m);
  const region = campaign.regions.find(r => r.number === c.meta.regionNumber);
  if (!region) { E(`meta.regionNumber ${c.meta.regionNumber} not in _campaign.json`); }
  const pattern = patternFileBefore(c.meta.number);
  const isPin = id => typeof id === 'string' && id.includes(':');
  const spineCaseAllowed = c.meta.boss || (c.meta.number >= 91 && c.meta.number <= 99);

  // ---------- Rule 1: integrity ----------
  const ids = new Map();
  const reg = (id, kind) => {
    if (!id) return E(`missing id on a ${kind}`);
    if (ids.has(id)) E(`duplicate id ${id} (${kind} and ${ids.get(id)})`);
    ids.set(id, kind);
  };
  const people = new Map(), locations = new Map(), places = new Map(), evidence = new Map(),
    facts = new Map(), words = new Map(), hotspots = new Map(), contradictions = new Map();
  for (const p of c.people) { reg(p.id, 'person'); people.set(p.id, p); }
  for (const l of c.locations) {
    reg(l.id, 'location'); locations.set(l.id, l);
    for (const h of l.hotspots || []) { reg(h.id, 'hotspot'); hotspots.set(h.id, { ...h, location: l.id }); }
  }
  for (const pl of c.places || []) { reg(pl.id, 'place'); places.set(pl.id, pl); }
  for (const e of c.evidence) { reg(e.id, 'evidence'); evidence.set(e.id, e); }
  for (const f of c.facts) { reg(f.id, 'fact'); facts.set(f.id, f); }
  for (const w of c.words) { reg(w.id, 'word'); words.set(w.id, w); }
  for (const k of c.contradictions || []) { reg(k.id, 'contradiction'); contradictions.set(k.id, k); }
  for (const s of c.solution.proof) reg(s.id, 'proof step');

  const isPlace = id => locations.has(id) || places.has(id);
  const anyEntity = id => people.has(id) || isPlace(id) || evidence.has(id) || facts.has(id);
  const need = (cond, msg) => { if (!cond) E(msg); };
  const checkUnlock = (u, where) => {
    if (!u) return E(`${where}: missing unlock`);
    if (u.start) return;
    if (u.fact) need(facts.has(u.fact), `${where}: unlock fact ${u.fact} not found`);
    if (u.evidence) need(evidence.has(u.evidence), `${where}: unlock evidence ${u.evidence} not found`);
    if (u.location) need(locations.has(u.location), `${where}: unlock location ${u.location} not found`);
    if (u.anyOf) for (const x of u.anyOf) need(facts.has(x), `${where}: unlock anyOf ${x} not a fact`);
  };

  need(c.meta.id === file.replace('.json', ''), `meta.id ${c.meta.id} doesn't match file name`);
  for (const f of c.ob.facts || []) need(facts.has(f), `ob.facts ${f} not found`);
  for (const p of c.people) {
    checkUnlock(p.unlock, `person ${p.id}`);
    if (p.isCulprit) need(p.role === 'suspect', `culprit ${p.id} must have role suspect`);
    if (!p.community) E(`person ${p.id} has no community tag (Part L action 4)`);
  }
  need(c.people.some(p => p.isCulprit), 'no culprit');
  for (const l of c.locations) {
    checkUnlock(l.unlock, `location ${l.id}`);
    for (const h of l.hotspots || []) {
      if (h.yields) need(evidence.has(h.yields), `hotspot ${h.id} yields unknown ${h.yields}`);
      if (h.unlock) checkUnlock(h.unlock, `hotspot ${h.id}`);
      if (!h.text) E(`hotspot ${h.id} has no text`);
    }
    // Region 8: the Expected list. Every expectation is grounded in a stated routine or rule (because),
    // and an expectation that isn't met creates an ABSENCE fact (a dotted card on the board).
    for (const x of l.expected || []) {
      if (!x.text) E(`expected item ${x.id} at ${l.id} has no text`);
      if (!facts.has(x.because)) E(`expected item ${x.id} at ${l.id}: grounding fact ${x.because} not found (no trick items)`);
      if (x.present === false) {
        if (!facts.has(x.fact)) E(`expected item ${x.id} at ${l.id}: absence fact ${x.fact} not found`);
        else if (!facts.get(x.fact).absence) E(`expected item ${x.id}: fact ${x.fact} must be marked absence`);
      } else if (x.fact) E(`expected item ${x.id} is present but names an absence fact`);
    }
  }
  for (const f of c.facts.filter(f => f.absence))
    if (!c.locations.some(l => (l.expected || []).some(x => x.fact === f.id))) E(`absence fact ${f.id} is on no location's Expected list`);
  for (const e of c.evidence) {
    need((e.facts || []).length > 0, `evidence ${e.id} has no facts`);
    for (const f of e.facts || []) need(facts.has(f), `evidence ${e.id} fact ${f} not found`);
  }
  for (const f of c.facts) {
    for (const a of f.about || []) need(anyEntity(a), `fact ${f.id} about ${a} not found`);
    if (f.where) {
      need(people.has(f.where.person), `fact ${f.id} where.person ${f.where.person} not found`);
      need(isPlace(f.where.place), `fact ${f.id} where.place ${f.where.place} not found`);
    }
    if (f.spine) need((campaign.threads || []).some(t => t.id === f.spine), `fact ${f.id} spine thread ${f.spine} unknown (rule 15)`);
    need(['true', 'claim', 'lie'].includes(f.kind), `fact ${f.id} bad kind ${f.kind}`);
    // Region 5: a fact with a time can be pinned to the corkboard's timeline rail.
    if (f.at) need(/^\d{2}:\d{2}$/.test(f.at.from || '') && (f.at.to == null || /^\d{2}:\d{2}$/.test(f.at.to)), `fact ${f.id}: at needs HH:MM times`);
  }
  for (const it of c.interrogations) {
    need(people.has(it.person), `interrogation person ${it.person} not found`);
    // Guarded people say nothing until shown something relevant (design doc §2.4).
    if (it.stance === 'guarded') {
      if (!(it.opensWith || []).length) E(`guarded ${it.person} has no opensWith`);
      for (const x of it.opensWith || []) need(facts.has(x) || evidence.has(x), `${it.person} opensWith ${x} not found`);
    }
    // Region 7: a lawyered suspect answers "On my advocate's advice, no comment" until the player presents
    // a reopening fact (a wrong attempt costs a stamp, like a wrong press).
    if (it.stance === 'lawyered') {
      if (!it.lawyered?.advocate) E(`lawyered ${it.person} has no advocate`);
      if (!(it.lawyered?.reopenedBy || []).length) E(`lawyered ${it.person} has no reopening fact`);
      for (const x of it.lawyered?.reopenedBy || []) need(facts.has(x), `${it.person} reopening fact ${x} not found`);
    } else if (it.lawyered) E(`${it.person} has lawyered settings but stance ${it.stance}`);
    for (const x of it.claims || []) need(facts.has(x), `interrogation ${it.person} claim ${x} not found`);
    // laterClaims: a claim that only joins the statement sheet once a fact is known (e.g. what a suspect
    // says after admitting he was there).
    for (const lc of it.laterClaims || []) { need(facts.has(lc.claim), `later claim ${lc.claim} not found`); need(facts.has(lc.after), `later claim ${lc.claim}: after ${lc.after} not found`); }
    for (const x of it.yields || []) need(evidence.has(x), `interrogation ${it.person} yields ${x} not found`);
    for (const t of it.topics || []) {
      need(anyEntity(t.about), `topic of ${it.person} about ${t.about} not found`);
      for (const r of t.reveals || []) need(facts.has(r) || evidence.has(r), `topic reveal ${r} not found`);
    }
  }
  const claimOwner = new Map();
  for (const it of c.interrogations) for (const x of [...(it.claims || []), ...(it.laterClaims || []).map(l => l.claim)]) claimOwner.set(x, it.person);
  for (const k of c.contradictions || []) {
    need(facts.has(k.claim), `contradiction ${k.id} claim not found`);
    need(claimOwner.has(k.claim), `contradiction ${k.id}: ${k.claim} is on nobody's statement sheet, so it can't be pressed`);
    for (const b of k.brokenBy) need(facts.has(b), `contradiction ${k.id} brokenBy ${b} not found`);
    for (const r of k.reveals || []) need(facts.has(r) || evidence.has(r), `contradiction ${k.id} reveal ${r} not found`);
    for (const g of k.greys || []) need(facts.has(g), `contradiction ${k.id} greys ${g} not found`);
    // Broken isn't guilty: every break is marked red (implicates) or grey (explains); from region 4 a
    // third, amber mark (mistaken) is for an honest witness who was wrong (case 37).
    need(['implicates', 'explains', 'mistaken'].includes(k.mark), `contradiction ${k.id} needs mark implicates|explains|mistaken`);
    if (k.mark === 'mistaken' && facts.get(k.claim)?.kind === 'lie') E(`contradiction ${k.id}: a lie can't be marked mistaken`);
    if (!k.reaction) E(`contradiction ${k.id} has no reaction line`);
  }
  for (const e of c.evidence) if (['warrant', 'records'].includes(e.gate?.action)) {
    // Warrants (region 2) and records requests (region 3) need grounds: the form only appears once a
    // probable-cause fact is known (master list C1, D1).
    if (!(e.gate.grounds || []).length) E(`${e.gate.action} on ${e.id} has no grounds`);
    for (const g of e.gate.grounds || []) need(facts.has(g), `${e.gate.action} ${e.id} grounds ${g} not a fact`);
  }
  for (const w of c.words) {
    if (w.unlock?.anyOf) for (const x of w.unlock.anyOf) need(facts.has(x), `word ${w.id} unlock ${x} not a fact`);
    // Region 9: the ACCOMPLICE blank always offers "nobody", a person word with no person behind it.
    if (w.category === 'person' && w.nobody) { if (w.ref) E(`person word ${w.id}: a "nobody" word has no ref`); }
    else if (w.category === 'person') need(people.has(w.ref), `person word ${w.id} ref ${w.ref} not a person`);
    if (w.category === 'target') need(people.has(w.ref), `target word ${w.id} ref ${w.ref} not a person`);
    if (w.category === 'item') need(evidence.has(w.ref), `item word ${w.id} ref ${w.ref} not evidence`);
    if (w.category === 'place') need(isPlace(w.ref), `place word ${w.id} ref ${w.ref} not a location or place`);
    if (w.category === 'pin') {
      // Rule 15: a Pattern File pin must be a spine fact from an earlier case, already on the wall.
      const pf = resolvePin(w.pin || '');
      if (!pf) E(`pin word ${w.id}: ${w.pin} doesn't resolve to a fact in an earlier case (rule 15)`);
      else if (!pf.spine) E(`pin word ${w.id}: ${w.pin} is not a spine fact (rule 15)`);
      else if (!pattern.has(w.pin)) E(`pin word ${w.id}: ${w.pin} is not on the Pattern File when case ${c.meta.number} opens (rule 15)`);
    }
  }
  for (const g of c.chargeSheet.groups) for (const bl of g.blanks) {
    if (g.kind === 'why' && bl.category !== 'motive') E(`WHY blank ${bl.id} must use motive words`);
    if (g.kind === 'how' && bl.category !== 'method') E(`HOW blank ${bl.id} must use method words`);
  }
  // Forensics (region 4): a lab result needs its samples; a detention sample needs its person.
  for (const e of c.evidence) {
    if (e.lab) {
      need(Number.isFinite(e.lab.hours) && e.lab.hours >= 0, `lab ${e.id} needs hours`);
      need((e.lab.needs || []).length > 0, `lab ${e.id} needs at least one sample`);
      for (const x of e.lab.needs || []) need(evidence.has(x), `lab ${e.id} sample ${x} not found`);
      need(e.type === 'forensic', `lab result ${e.id} must be type forensic`);
    }
    if (e.detention) need(people.has(e.detention), `detention sample ${e.id}: person ${e.detention} not found`);
  }
  for (const g of c.chargeSheet.groups) if (g.kind === 'spine' && !spineCaseAllowed) E(`spine group ${g.id} outside a boss case or 91–99 (rule 15)`);
  // Region 10 (K1): no new mechanics; every case carries a SPINE group and at least three of the groups taught since
  // region 5; only case 100 may have more than eight groups (one SPINE line per thread).
  if (region?.number === 10) {
    if (!c.chargeSheet.groups.some(g => g.kind === 'spine')) E('region 10: every case needs a SPINE group (K1)');
    const taught = new Set(c.chargeSheet.groups.map(g => g.kind).filter(k => ['when', 'where', 'forgery', 'absence', 'accomplice', 'planted', 'realTarget'].includes(k)));
    if (taught.size < 3) E(`region 10: only ${taught.size} of the taught groups (needs 3, K1)`);
  }
  if (c.chargeSheet.groups.length > 8 && c.meta.number !== 100) E(`${c.chargeSheet.groups.length} groups; only case 100 may have more than eight`);
  const blanks = [];
  const strips = [];
  for (const g of c.chargeSheet.groups) for (const b of g.blanks) {
    blanks.push({ ...b, group: g.id });
    if (g.kind === 'when' && !['time', 'strip'].includes(b.category)) E(`WHEN blank ${b.id} must be a time window or a strip`);
    // WHERE (region 6): place words name a location or place. A blank asks where the killing happened
    // (subject "scene", the default), where the culprit was at a time (subject "culprit", with at), or
    // something else the proof establishes (subject "other", with a note: case 60's stolen files).
    if (g.kind === 'where') {
      if (b.category !== 'place') E(`WHERE blank ${b.id} must use place words`);
      const subj = b.subject || 'scene';
      if (!['scene', 'culprit', 'other'].includes(subj)) E(`WHERE blank ${b.id}: subject must be scene|culprit|other`);
      if (subj === 'culprit' && !/^\d{2}:\d{2}$/.test(b.at || '')) E(`WHERE blank ${b.id}: a culprit-location blank needs at HH:MM`);
      if (subj === 'other' && !b.note) E(`WHERE blank ${b.id}: subject other needs a note`);
    }
    // FORGERY (region 7): {document} was forged, as shown by {tell}. Document words name document
    // evidence (with doc.genuine); tell words carry the facts that show them.
    if (g.kind === 'forgery') {
      if (!['document', 'tell'].includes(b.category)) E(`FORGERY blank ${b.id} must be a document or a tell`);
    }
    if (g.kind === 'absence') {
      if (!['absence', 'conclusion'].includes(b.category)) E(`ABSENCE blank ${b.id} must be an absence or a conclusion`);
    }
    // Region 9: ACCOMPLICE ("helped by {accomplice}, who {role}"), PLANTED ("{item} was planted, as shown
    // by {tell}") and REAL TARGET ("the killer meant to kill {target}").
    if (g.kind === 'accomplice' && !['person', 'role'].includes(b.category)) E(`ACCOMPLICE blank ${b.id} must be a person or a role`);
    if (g.kind === 'planted' && !['item', 'plantTell'].includes(b.category)) E(`PLANTED blank ${b.id} must be an item or a tell`);
    if (g.kind === 'realTarget' && b.category !== 'target') E(`REAL TARGET blank ${b.id} must use target words`);
    if (b.category === 'strip') {
      // The timeline strip (region 5, from case 43): 3–5 event cards dragged into time slots, graded as
      // one group. Every event names its slot and the facts that pin it there; every slot no event
      // belongs in is a decoy with an authored refutation (master list F1).
      const st = b.strip || {}; strips.push({ ...b, group: g.id });
      const slotIds = new Set((st.slots || []).map(x => x.id));
      for (const x of st.slots || []) reg(x.id, 'strip slot');
      for (const x of st.events || []) reg(x.id, 'strip event');
      if ((st.events || []).length < 3 || st.events.length > 5) E(`strip ${b.id} needs 3–5 events`);
      if (!((st.slots || []).length > (st.events || []).length)) E(`strip ${b.id} needs more slots than events`);
      const used = new Map();
      for (const ev of st.events || []) {
        need(slotIds.has(ev.slot), `strip event ${ev.id}: slot ${ev.slot} not found`);
        if (used.has(ev.slot)) E(`strip ${b.id}: events ${used.get(ev.slot)} and ${ev.id} share slot ${ev.slot}`);
        used.set(ev.slot, ev.id);
        if (!(ev.by || []).length || !ev.why) E(`strip event ${ev.id} needs facts (by) and a why`);
        for (const x of ev.by || []) need(facts.has(x), `strip event ${ev.id}: fact ${x} not found`);
        for (const x of ev.unlock?.anyOf || []) need(facts.has(x), `strip event ${ev.id}: unlock ${x} not a fact`);
      }
      for (const x of st.slots || []) if (!used.has(x.id)) {
        const d = (st.decoys || []).find(d => d.slot === x.id);
        if (!d || !(d.by || []).length || !d.why) E(`strip ${b.id}: decoy slot ${x.id} has no refutation (rule 5)`);
        else for (const f of d.by) need(facts.has(f), `strip decoy ${x.id}: fact ${f} not found`);
      }
      if ((st.events || []).filter(e => e.act).length !== 1) E(`strip ${b.id} needs exactly one act event`);
      continue;
    }
    if (b.category === 'time') for (const w of c.words.filter(w => w.category === 'time'))
      need(/^\d{2}:\d{2}$/.test(w.window?.from || '') && /^\d{2}:\d{2}$/.test(w.window?.to || ''), `time word ${w.id} needs window {from,to}`);
    const answers = [b.answer, ...(b.accept || [])];
    for (const a of answers) {
      need(words.has(a), `blank ${b.id} answer ${a} not a word`);
      if (words.has(a)) need(words.get(a).category === b.category, `blank ${b.id} answer ${a} category mismatch`);
    }
    need(c.chargeSheet.template.includes(`{${b.id}}`), `template lacks {${b.id}}`);
  }

  // ---------- Rule 2: reachability ----------
  const gated = c.evidence.filter(e => e.gate);
  function simulate(allowedGates, startFactsOnly = false) {
    // Pattern File pins are on the wall before the case opens.
    const kF = new Set([...(c.ob.facts || []), ...pattern]), kE = new Set(), kL = new Set(), kP = new Set();
    const ok = u => !!u && (u.start || (u.fact && kF.has(u.fact)) || (u.evidence && kE.has(u.evidence))
      || (u.location && kL.has(u.location)) || (u.anyOf && u.anyOf.some(x => kF.has(x))));
    const known = x => kF.has(x) || kE.has(x);
    const addE = id => {
      const e = evidence.get(id);
      if (!e || kE.has(id)) return false;
      if (e.gate && !allowedGates.has(id)) return false;
      if (e.gate?.grounds && !e.gate.grounds.some(g => kF.has(g))) return false;
      kE.add(id); (e.facts || []).forEach(f => kF.add(f)); return true;
    };
    if (startFactsOnly) return { kF, kE, kL, kP };
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of c.locations) if (!kL.has(l.id) && ok(l.unlock)) { kL.add(l.id); changed = true; }
      for (const p of c.people) if (!kP.has(p.id) && ok(p.unlock)) { kP.add(p.id); changed = true; }
      for (const l of c.locations) if (kL.has(l.id)) for (const h of l.hotspots || [])
        if (h.yields && (!h.unlock || ok(h.unlock)) && addE(h.yields)) changed = true;
      // An unmet expectation is noted as missing once its grounding fact is known (region 8).
      for (const l of c.locations) if (kL.has(l.id)) for (const x of l.expected || [])
        if (x.present === false && kF.has(x.because) && !kF.has(x.fact)) { kF.add(x.fact); changed = true; }
      // A records request needs no location: the request form appears once its grounds are known.
      for (const e of gated) if (e.gate.action === 'records' && addE(e.id)) changed = true;
      // A detention sample is taken from a detained person (any known person can be detained);
      // a lab result arrives once every sample it needs is in hand. Time is checked by rule 16.
      for (const e of c.evidence) if (e.detention && kP.has(e.detention) && addE(e.id)) changed = true;
      for (const e of c.evidence) if (e.lab && (e.lab.needs || []).every(x => kE.has(x)) && addE(e.id)) changed = true;
      const talks = it => it.stance === 'guarded' ? (it.opensWith || []).some(known)
        : it.stance === 'lawyered' ? (it.lawyered?.reopenedBy || []).some(x => kF.has(x)) : true;
      for (const it of c.interrogations) if (kP.has(it.person) && talks(it)) {
        for (const y of it.yields || []) if (addE(y)) changed = true;
        for (const cl of it.claims || []) if (!kF.has(cl)) { kF.add(cl); changed = true; }
        for (const lc of it.laterClaims || []) if (kF.has(lc.after) && !kF.has(lc.claim)) { kF.add(lc.claim); changed = true; }
        for (const t of it.topics || []) {
          const avail = kP.has(t.about) || kL.has(t.about) || kE.has(t.about) || kF.has(t.about);
          if (avail) for (const r of t.reveals || []) {
            if (facts.has(r) && !kF.has(r)) { kF.add(r); changed = true; }
            if (evidence.has(r) && addE(r)) changed = true;
          }
        }
      }
      for (const k of c.contradictions || []) if (kF.has(k.claim) && k.brokenBy.some(b => kF.has(b)))
        for (const r of k.reveals || []) {
          if (facts.has(r) && !kF.has(r)) { kF.add(r); changed = true; }
          if (evidence.has(r) && addE(r)) changed = true;
        }
    }
    return { kF, kE, kL, kP };
  }
  const wordsUnlocked = kF => new Set(c.words.filter(w => w.unlock?.start || (w.unlock?.anyOf || []).some(x => kF.has(x))).map(w => w.id));

  const proofFacts = new Set(), elimFacts = new Set();
  for (const s of c.solution.proof) for (const x of s.from) if (facts.has(x)) proofFacts.add(x);
  for (const el of c.solution.eliminations) for (const x of el.by) elimFacts.add(x);
  for (const sb of strips) for (const ev of sb.strip.events) { ev.by.forEach(x => proofFacts.add(x)); (ev.unlock?.anyOf || []).forEach(x => elimFacts.add(x)); }
  for (const sb of strips) for (const d of sb.strip.decoys || []) d.by.forEach(x => elimFacts.add(x));
  const answerWords = new Set(blanks.filter(b => b.category !== 'strip').flatMap(b => [b.answer, ...(b.accept || [])]));

  // Find the cheapest set of gated actions that makes the proof reachable (rule 3).
  let best = null;
  const n = gated.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const allowed = new Set(gated.filter((_, i) => mask & (1 << i)).map(e => e.id));
    const cost = gated.filter((_, i) => mask & (1 << i)).reduce((s, e) => s + (e.gate.cost || 1), 0);
    if (best && cost >= best.cost) continue;
    const st = simulate(allowed);
    const wu = wordsUnlocked(st.kF);
    if ([...proofFacts].every(f => st.kF.has(f)) && [...answerWords].every(w => wu.has(w))) best = { cost, allowed, st };
  }
  const full = simulate(new Set(gated.map(e => e.id)));
  const fullWords = wordsUnlocked(full.kF);
  if (!best) {
    for (const f of proofFacts) if (!full.kF.has(f)) E(`proof fact ${f} unreachable (rule 2)`);
    for (const w of answerWords) if (!fullWords.has(w)) E(`answer word ${w} never unlocks (rule 2)`);
  }
  for (const f of elimFacts) if (!full.kF.has(f)) E(`elimination fact ${f} unreachable (rule 2)`);
  for (const t of Object.values(c.hints)) for (const f of t.tier2?.facts || []) if (!full.kF.has(f)) E(`hint fact ${f} unreachable`);
  for (const f of c.facts) if (!full.kF.has(f.id)) W(`fact ${f.id} can never be discovered (dead content)`);
  for (const e of c.evidence) if (!full.kE.has(e.id)) W(`evidence ${e.id} can never be found`);

  // ---------- Rule 3: credibility budget ----------
  if (best && best.cost > 3) E(`cheapest proof costs ${best.cost} stamps (max 3, rule 3)`);

  // ---------- Rule 4: proof completeness ----------
  const seen = new Set();
  for (const s of c.solution.proof) {
    for (const x of s.from) {
      if (isPin(x)) { need(pattern.has(x), `proof ${s.id} cites pin ${x}, not on the Pattern File yet (rule 15)`); continue; }
      need(facts.has(x) || seen.has(x), `proof ${s.id} cites ${x}, not a fact or earlier step (rule 4)`);
    }
    seen.add(s.id);
  }
  // Background spine details (A4) are never needed to solve an ordinary case.
  if (!spineCaseAllowed) for (const s of c.solution.proof) for (const x of s.from)
    if (facts.get(x)?.spine) E(`proof ${s.id} needs spine fact ${x}, but spine details are background outside boss cases (A4)`);
  for (const b of blanks) need(c.solution.proof.some(s => (s.answers || []).includes(b.id)), `blank ${b.id} not answered by any proof step (rule 4)`);

  // ---------- Rule 5: uniqueness by elimination ----------
  const options = {};
  const perm = (n, k) => { let p = 1; for (let i = 0; i < k; i++) p *= n - i; return p; };
  for (const b of blanks) {
    if (b.category === 'strip') { options[b.id] = perm(b.strip.slots.length, b.strip.events.length); continue; }
    const opts = c.words.filter(w => w.category === b.category && fullWords.has(w.id) && (!b.pool || b.pool.includes(w.id)));
    options[b.id] = opts.length;
    const answers = [b.answer, ...(b.accept || [])];
    for (const w of opts) if (!answers.includes(w.id)) {
      const el = c.solution.eliminations.find(x => x.word === w.id && x.blank === b.id);
      if (!el) E(`no elimination for ${w.id} in blank ${b.id} (rule 5)`);
      else if (!el.why) E(`elimination ${w.id}/${b.id} has no why`);
    }
  }

  // ---------- Rule 18: FORGERY (region 7) ----------
  // The forged document must be the only forged document among the options, and every accepted tell
  // (the answer and any accepted alternative, cases 62 and 70) must be proven by facts in the proof.
  for (const e of c.evidence) if (e.doc) {
    if (typeof e.doc.genuine !== 'boolean') E(`evidence ${e.id}: doc.genuine must be true or false`);
    if (e.doc.forger) need(people.has(e.doc.forger), `evidence ${e.id}: forger ${e.doc.forger} not found`);
  }
  for (const w of c.words.filter(w => w.category === 'document')) {
    const e = evidence.get(w.ref);
    if (!e) E(`document word ${w.id}: ${w.ref} is not evidence`);
    else if (!e.doc) E(`document word ${w.id}: ${w.ref} has no doc {genuine}`);
  }
  for (const w of c.words.filter(w => w.category === 'tell')) {
    if (!(w.by || []).length) E(`tell word ${w.id} has no facts (by)`);
    for (const x of w.by || []) need(facts.has(x), `tell word ${w.id}: fact ${x} not found`);
  }
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'forgery')) {
    const db = g.blanks.find(b => b.category === 'document'), tb = g.blanks.find(b => b.category === 'tell');
    if (!db || !tb) { E(`FORGERY group ${g.id} needs a document blank and a tell blank`); continue; }
    const docOpts = c.words.filter(w => w.category === 'document' && (!db.pool || db.pool.includes(w.id)));
    const ans = words.get(db.answer);
    if (ans && evidence.get(ans.ref)?.doc?.genuine !== false) E(`FORGERY answer ${db.answer} (${ans?.ref}) is not marked forged (rule 18)`);
    for (const w of docOpts) if (w.id !== db.answer && evidence.get(w.ref)?.doc?.genuine === false)
      E(`document option ${w.id} is also forged: ambiguous FORGERY (rule 18)`);
    for (const t of [tb.answer, ...(tb.accept || [])]) {
      const w = words.get(t);
      if (!w) continue;
      for (const x of w.by || []) if (!proofFacts.has(x)) E(`accepted tell ${t}: fact ${x} is not in the proof (rule 18)`);
    }
  }
  // ABSENCE (region 8): "{what's missing} shows that {conclusion}". Absence words name absence facts;
  // conclusion words carry the facts that support them. Every accepted answer is proven (rule 18).
  for (const w of c.words.filter(w => w.category === 'absence')) {
    const f = facts.get(w.ref);
    if (!f) E(`absence word ${w.id}: ${w.ref} is not a fact`);
    else if (!f.absence) E(`absence word ${w.id}: ${w.ref} is not an absence fact`);
  }
  for (const w of c.words.filter(w => w.category === 'conclusion')) {
    if (!(w.by || []).length) E(`conclusion word ${w.id} has no facts (by)`);
    for (const x of w.by || []) need(facts.has(x), `conclusion word ${w.id}: fact ${x} not found`);
  }
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'absence')) {
    const ab = g.blanks.find(b => b.category === 'absence'), cb = g.blanks.find(b => b.category === 'conclusion');
    if (!ab || !cb) { E(`ABSENCE group ${g.id} needs an absence blank and a conclusion blank`); continue; }
    for (const a of [ab.answer, ...(ab.accept || [])]) { const w = words.get(a); if (w && !proofFacts.has(w.ref)) E(`accepted absence ${a}: fact ${w.ref} is not in the proof (rule 18)`); }
    for (const t of [cb.answer, ...(cb.accept || [])]) { const w = words.get(t); for (const x of w?.by || []) if (!proofFacts.has(x)) E(`accepted conclusion ${t}: fact ${x} is not in the proof (rule 18)`); }
  }
  // Region 10: every accepted pin must be a Pattern File fact the proof actually cites (rule 18).
  // (Pattern File refs are cited raw in proof steps, so they're checked against the steps, not against this case's facts.)
  const proofRefs = new Set(c.solution.proof.flatMap(s => s.from));
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'spine')) for (const b of g.blanks)
    for (const a of b.accept || []) { const w = words.get(a); if (w?.pin && !proofRefs.has(w.pin)) E(`accepted pin ${a}: ${w.pin} is not cited in the proof (rule 18)`); }
  // ---------- Region 9: WHO, ACCOMPLICE, PLANTED, REAL TARGET (rule 18 and rule 5) ----------
  const culpritIds = c.people.filter(p => p.isCulprit).map(p => p.id);
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'who')) {
    // Every WHO answer names a culprit, and together the blanks name every culprit (joint principals, case 85).
    const named = new Set();
    const pbs = g.blanks.filter(b => b.category === 'person');   // case 10 also has a {client} blank
    for (const b of pbs) for (const a of [b.answer, ...(b.accept || [])]) {
      const w = words.get(a); if (!w) continue;
      if (!culpritIds.includes(w.ref)) E(`WHO answer ${a} (${w.ref}) is not a culprit`);
      named.add(w.ref);
    }
    for (const cp of culpritIds) if (!named.has(cp)) E(`culprit ${cp} is not named by any WHO answer`);
    if (pbs.length > 1 && !g.unordered) E(`WHO group ${g.id} with joint principals must be unordered`);
    if (pbs.length !== culpritIds.length) E(`WHO group ${g.id} has ${pbs.length} blanks for ${culpritIds.length} culprits`);
  }
  const accomplices = c.people.filter(p => p.accomplice);
  for (const p of accomplices) {
    if (p.isCulprit) E(`${p.id} can't be both culprit and accomplice`);
    if (p.role !== 'suspect') E(`accomplice ${p.id} must have role suspect`);
    if (p.unknowingHelper) E(`${p.id} can't be both an accomplice and an unknowing helper`);
  }
  for (const w of c.words.filter(w => w.category === 'role')) {
    if (!(w.by || []).length) E(`role word ${w.id} has no facts (by)`);
    for (const x of w.by || []) need(facts.has(x), `role word ${w.id}: fact ${x} not found`);
  }
  const accGroups = c.chargeSheet.groups.filter(g => g.kind === 'accomplice');
  if (accomplices.length && !accGroups.length) E('the case has an accomplice but no ACCOMPLICE group');
  for (const g of accGroups) {
    const pb = g.blanks.find(b => b.category === 'person'), rb = g.blanks.find(b => b.category === 'role');
    if (!pb || !rb) { E(`ACCOMPLICE group ${g.id} needs a person blank and a role blank`); continue; }
    const opts = c.words.filter(w => w.category === 'person' && (!pb.pool || pb.pool.includes(w.id)));
    if (!pb.pool) E(`ACCOMPLICE blank ${pb.id} needs a pool (its names differ from WHO's)`);
    if (!opts.some(w => w.nobody)) E(`ACCOMPLICE blank ${pb.id} must offer "nobody"`);
    const ans = words.get(pb.answer);
    if (accomplices.length) {
      if (!ans || !accomplices.some(p => p.id === ans.ref)) E(`ACCOMPLICE answer ${pb.answer} is not the case's accomplice`);
      // Region 10: only the final case may name two accomplices, one ACCOMPLICE group each (K1: Oduya and Pius).
      const maxAcc = c.meta.number === 100 ? 2 : 1;
      if (accomplices.length > maxAcc) E(`one accomplice per case (found ${accomplices.length})`);
    } else if (!ans?.nobody) E(`ACCOMPLICE answer ${pb.answer}: the case has no accomplice, so the answer is "nobody"`);
    for (const t of [rb.answer, ...(rb.accept || [])]) { const w = words.get(t); for (const x of w?.by || []) if (!proofFacts.has(x)) E(`accepted role ${t}: fact ${x} is not in the proof (rule 18)`); }
    // An unknowing helper (a guard bribed to open a door "for a family matter") is not an accomplice:
    // their refutation must rest on what they knew, so it cites at least two facts.
    for (const p of c.people.filter(p => p.unknowingHelper)) {
      const w = opts.find(w => w.ref === p.id);
      const el = w && c.solution.eliminations.find(x => x.word === w.id && x.blank === pb.id);
      if (w && (!el || el.by.length < 2)) E(`unknowing helper ${p.id}: the ACCOMPLICE refutation needs the evidence of what they knew (2+ facts)`);
    }
  }
  if (accGroups.length > 1) {
    if (c.meta.number !== 100) E(`${accGroups.length} ACCOMPLICE groups; only case 100 may have two`);
    if (accGroups.length !== accomplices.length) E(`${accGroups.length} ACCOMPLICE groups but ${accomplices.length} accomplices`);
    const answers = accGroups.map(g => words.get(g.blanks.find(b => b.category === 'person')?.answer)?.ref);
    if (new Set(answers).size !== answers.length) E('two ACCOMPLICE groups name the same accomplice');
  }
  for (const e of c.evidence) if (e.planted) {
    need(people.has(e.planted.by), `evidence ${e.id}: planted.by ${e.planted.by} not found`);
    // Region 10: a plant can frame a story rather than a person (case 91's fake lift notice): frames is then omitted.
    if (e.planted.frames) need(people.has(e.planted.frames), `evidence ${e.id}: planted.frames ${e.planted.frames} not found`);
    if (!culpritIds.includes(e.planted.by) && !accomplices.some(p => p.id === e.planted.by)) E(`evidence ${e.id}: planted by ${e.planted.by}, who is neither a culprit nor the accomplice`);
    if (culpritIds.includes(e.planted.frames)) E(`evidence ${e.id}: planted evidence can't frame a culprit`);
  }
  for (const w of c.words.filter(w => w.category === 'plantTell')) {
    if (!(w.by || []).length) E(`planted tell ${w.id} has no facts (by)`);
    for (const x of w.by || []) need(facts.has(x), `planted tell ${w.id}: fact ${x} not found`);
  }
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'planted')) {
    const ib = g.blanks.find(b => b.category === 'item'), tb = g.blanks.find(b => b.category === 'plantTell');
    if (!ib || !tb) { E(`PLANTED group ${g.id} needs an item blank and a tell blank`); continue; }
    // Case 88: two items were planted together, so the second is an accepted alternative; every accepted
    // item must be planted, and no other option may be.
    const okItems = [ib.answer, ...(ib.accept || [])];
    for (const a of okItems) { const w = words.get(a); if (w && !evidence.get(w.ref)?.planted) E(`PLANTED answer ${a} (${w.ref}) is not marked planted (rule 18)`); }
    for (const w of c.words.filter(w => w.category === 'item' && (!ib.pool || ib.pool.includes(w.id))))
      if (!okItems.includes(w.id) && evidence.get(w.ref)?.planted) E(`item option ${w.id} is also planted: ambiguous PLANTED (rule 18)`);
    for (const t of [tb.answer, ...(tb.accept || [])]) { const w = words.get(t); for (const x of w?.by || []) if (!proofFacts.has(x)) E(`accepted planted tell ${t}: fact ${x} is not in the proof (rule 18)`); }
  }
  if (c.evidence.some(e => e.planted) && !c.chargeSheet.groups.some(g => g.kind === 'planted')) E('the case has planted evidence but no PLANTED group');
  const targets = c.people.filter(p => p.intendedTarget);
  for (const g of c.chargeSheet.groups.filter(g => g.kind === 'realTarget')) {
    if (targets.length !== 1) E(`REAL TARGET needs exactly one person marked intendedTarget (found ${targets.length})`);
    const ans = words.get(g.blanks[0]?.answer);
    if (ans && ans.ref !== targets[0]?.id) E(`REAL TARGET answer ${g.blanks[0].answer} is not the intended target`);
    if (targets[0]?.role === 'victim') E('the intended target can\'t be the victim');
  }
  if (targets.length && !c.chargeSheet.groups.some(g => g.kind === 'realTarget')) E('a person is marked intendedTarget but there is no REAL TARGET group');

  for (const e of c.evidence.filter(e => e.lab && ['document', 'handwriting'].includes(e.lab.test)))
    if (e.lab.hours !== (campaign.labHours?.[e.lab.test] ?? 10)) E(`${e.id}: a ${e.lab.test} examination takes ${campaign.labHours?.[e.lab.test] ?? 10} lab hours`);

  // ---------- Rule 6: timeline consistency ----------
  const toMin = t => { if (t == null) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Intervals may run past midnight (e.g. 18:30–06:00): the end then gets +24h.
  const span = f => { const a = toMin(f.where.from) ?? 0; let b = toMin(f.where.to) ?? 48 * 60; if (b < a) b += 24 * 60; return [a, b]; };
  // Compare an interval with a window, also trying the window shifted by a day (overnight cases).
  const overlaps = ([a1, a2], [b1, b2]) => [0, 1440].some(d => a1 < b2 + d && b1 + d < a2);
  const coversWin = ([a1, a2], [b1, b2]) => [0, 1440].some(d => a1 <= b1 + d && a2 >= b2 + d);
  const trueWhere = c.facts.filter(f => f.kind === 'true' && f.where);
  // A place declared `within` another (places[].within, transitive) is part of it: being in the
  // laundry and being on the resort's staff side at the same time is not two places at once.
  const inside = (x, y) => { let cur = places.get(x)?.within, guard = 0; while (cur && guard++ < 10) { if (cur === y) return true; cur = places.get(cur)?.within; } return false; };
  for (let i = 0; i < trueWhere.length; i++) for (let j = i + 1; j < trueWhere.length; j++) {
    const a = trueWhere[i], b = trueWhere[j];
    if (a.where.person !== b.where.person || a.where.place === b.where.place) continue;
    if (overlaps(span(a), span(b)) && !(a.where.within || []).includes(b.where.place) && !(b.where.within || []).includes(a.where.place)
      && !inside(a.where.place, b.where.place) && !inside(b.where.place, a.where.place))
      E(`${a.where.person} is in two places at once: ${a.id} and ${b.id} (rule 6)`);
  }
  const tod = c.solution.timeOfDeath;
  if (!tod) E('solution.timeOfDeath missing (rule 6)');
  else if (tod.alibisApply === false && !tod.reason) E('timeOfDeath.alibisApply is false without a reason (rule 6)');
  else {
    const t1 = toMin(tod.from); let t2 = toMin(tod.to); if (t2 < t1) t2 += 1440;
    const win = [t1, t2];
    // WHEN (region 5). A single time window must be the act window itself, and no wrong window may
    // overlap it (two right answers would be a guess). On a strip, the act event's slot must sit
    // inside the act window.
    const wspan = w => { const a = toMin(w.from); let z = toMin(w.to ?? w.from); if (z < a) z += 1440; return [a, z]; };
    for (const b of blanks) if (b.category === 'time') {
      const aw = words.get(b.answer)?.window;
      if (aw && (aw.from !== tod.from || aw.to !== tod.to)) E(`WHEN answer ${b.answer} (${aw.from}–${aw.to}) isn't the act window ${tod.from}–${tod.to} (rule 6)`);
      for (const w of c.words.filter(w => w.category === 'time' && w.id !== b.answer))
        if (w.window && overlaps(wspan(w.window), win) && !(wspan(w.window)[1] === win[0] || wspan(w.window)[0] === win[1])) E(`time word ${w.id} overlaps the act window: ambiguous WHEN (rule 6)`);
    }
    for (const sb of strips) {
      const act = sb.strip.events.find(e => e.act); const sl = act && sb.strip.slots.find(x => x.id === act.slot);
      if (sl?.from) { const [a, z] = wspan(sl); if (!coversWin(win, [a, z])) E(`strip act ${act.id}: slot ${sl.label} isn't inside the act window ${tod.from}–${tod.to} (rule 6)`); }
    }
    // The scene is tod.place, everything listed in tod.within, and every place declared inside one of them.
    const sceneParts = [tod.place, ...(tod.within || [])];
    const inScene = pl => sceneParts.some(s => pl === s || inside(pl, s));
    // A zone that CONTAINS the scene (a mast area, a whole town) is not an alibi: being "somewhere in
    // Old Town" doesn't put you anywhere else (master list D1: a mast narrows, it never pins).
    const containsScene = pl => sceneParts.some(s => inside(s, pl));
    // WHERE (region 6). The answer to a scene blank must be the scene (or a place inside it), and no wrong
    // option may be: two right answers would be a guess. A culprit blank's answer must be where a true
    // fact puts the culprit at that time.
    for (const g of c.chargeSheet.groups.filter(g => g.kind === 'where')) for (const b of g.blanks) {
      const subj = b.subject || 'scene';
      const ans = words.get(b.answer);
      const opts = c.words.filter(w => w.category === 'place' && (!b.pool || b.pool.includes(w.id)));
      if (subj === 'scene') {
        if (ans && !inScene(ans.ref)) E(`WHERE answer ${b.answer} (${ans.ref}) isn't the scene ${tod.place} (rule 6)`);
        for (const w of opts) if (w.id !== b.answer && !(b.accept || []).includes(w.id) && inScene(w.ref)) E(`place word ${w.id} is also inside the scene: ambiguous WHERE (rule 6)`);
      }
      if (subj === 'culprit' && ans) {
        const t = toMin(b.at);
        const culprits = c.people.filter(p => p.isCulprit).map(p => p.id);
        const placed = trueWhere.some(f => culprits.includes(f.where.person) && (f.where.place === ans.ref || inside(f.where.place, ans.ref))
          && coversWin(span(f), [t, t]));
        if (!placed) E(`WHERE answer ${b.answer}: no true fact puts the culprit at ${ans.ref} at ${b.at} (rule 6)`);
      }
    }
    const atScene = pid => trueWhere.some(f => f.where.person === pid && inScene(f.where.place) && overlaps(span(f), win));
    for (const p of c.people.filter(p => p.isCulprit)) if (!atScene(p.id)) E(`culprit ${p.id} never placed at ${tod.place} during ${tod.from}–${tod.to} (rule 6)`);
    const whoBlanks = new Set(c.chargeSheet.groups.filter(g => g.kind === 'who').flatMap(g => g.blanks.map(b => b.id)));
    for (const el of c.solution.eliminations) {
      const w = words.get(el.word);
      if (!w || w.category !== 'person' || w.nobody) continue;
      // Alibis answer "who killed"; an ACCOMPLICE refutation is about what someone knew or did, not where they were.
      if (!whoBlanks.has(el.blank)) continue;
      const p = people.get(w.ref);
      if (!p || p.role !== 'suspect') continue;
      // "Present, not the killer" (an accessory at the scene, case 40): no alibi is possible, so the
      // elimination must rest on at least one lab or autopsy result, never on testimony alone.
      if (el.present) {
        const labFacts = new Set(c.evidence.filter(e => e.lab).flatMap(e => e.facts));
        if (!el.by.some(id => labFacts.has(id))) E(`elimination of ${p.id} as present-not-killer needs a lab or autopsy fact (rule 6)`);
        continue;
      }
      const covers = el.by.map(id => facts.get(id)).some(f => f && f.kind === 'true' && f.where && f.where.person === p.id
        && !inScene(f.where.place) && !containsScene(f.where.place) && coversWin(span(f), win));
      // A slow death (poison over days, case 39) can switch alibis off, with a reason; the culprit must
      // still be placed at the act, and every other suspect still needs an authored refutation.
      if (!covers && tod.alibisApply !== false) E(`suspect ${p.id}'s elimination doesn't give an alibi covering ${tod.from}–${tod.to} (rule 6)`);
    }
  }
  for (const f of c.facts.filter(f => f.kind === 'lie')) {
    const k = (c.contradictions || []).find(k => k.claim === f.id);
    if (!k || !k.brokenBy.some(b => facts.get(b)?.kind === 'true')) E(`lie ${f.id} is not contradicted by a true fact (rule 6/7)`);
  }

  // ---------- Rule 7: liars are catchable ----------
  for (const f of c.facts.filter(f => f.kind === 'lie')) {
    const k = (c.contradictions || []).find(k => k.claim === f.id);
    if (k && !(full.kF.has(f.id) && k.brokenBy.some(b => full.kF.has(b)))) E(`lie ${f.id} can't be caught with reachable facts (rule 7)`);
  }

  // ---------- Rules 16 and 17: the arrest clock ----------
  // Every case with lab tests or detention samples carries an authored clock plan: one order of actions
  // that solves the case. The validator replays it. Rule 16: every detention sample is taken, and every
  // press against the detained person happens, inside the 24 hours; every press that needs a lab result
  // happens after the result arrives; one detention at a time; everything the proof needs from the lab
  // is submitted. Rule 17: the plan never uses a forensic rush (and rush is never a gate on evidence).
  const labs = c.evidence.filter(e => e.lab), samples = c.evidence.filter(e => e.detention);
  for (const e of gated) if (e.gate.action === 'forensicRush') E(`${e.id}: forensic rush can't gate evidence (rule 17)`);
  if (c.map) {
    for (const e of c.map.edges || []) for (const x of [e.a, e.b]) need((c.map.nodes || []).includes(x), `map edge ${e.a}–${e.b}: ${x} is not a map node`);
    for (const x of c.map.nodes || []) need(isPlace(x), `map node ${x} is not a location or place`);
  }
  if (labs.length || samples.length || c.map) {
    const plan = c.clockPlan;
    const cost = campaign.clock || {};
    if (!plan?.steps?.length) E('case has lab tests or detention samples but no clockPlan (rule 16)');
    else {
      // Immediate results (autopsy, an on-site comparison: lab.hours 0) need no submission or wait.
      const labOf = new Map(); for (const e of labs) if (e.lab.hours > 0) for (const f of e.facts) labOf.set(f, e);
      let t = 0, detained = null, dStart = null; const everDetained = new Map();
      const submitted = new Map(), sampled = new Set();
      // The site map (region 6): travel between sites costs at least the route's time, and a visit to a
      // map site needs a travel step from the last map site visited.
      const edges = c.map?.edges || [];
      const route = (a, b) => edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
      const onMap = id => (c.map?.nodes || []).includes(id);
      let lastSite = c.map?.start || null, arrived = null;
      plan.steps.forEach((st, i) => {
        const where = `clockPlan step ${i + 1} (${st.do} ${st.target || ''})`;
        if (st.do === 'travel') {
          const r = route(st.from, st.target);
          if (!r) E(`${where}: no route on the site map from ${st.from} (rule 16)`);
          else if ((st.hours ?? 0) * 60 < r.minutes) E(`${where}: ${st.hours} h is less than the route's ${r.minutes} min (rule 16)`);
          if (lastSite && st.from !== lastSite) E(`${where}: travelling from ${st.from}, but the last site was ${lastSite} (rule 16)`);
          lastSite = st.target; arrived = st.target;
        }
        if (st.do === 'visit' && c.map && onMap(st.target) && lastSite && st.target !== lastSite && arrived !== st.target)
          E(`${where}: visiting ${st.target} without travelling there from ${lastSite} (rule 16)`);
        if (st.do === 'visit' && c.map && onMap(st.target)) lastSite = st.target;
        const range = (st.do === 'travel' && region?.travelHours) ? region.travelHours : cost[st.do];
        if (!range) return E(`${where}: unknown action (rule 16)`);
        const h = st.hours ?? range[0];
        if (h < range[0] || h > range[1]) E(`${where}: ${h} h is outside ${range[0]}–${range[1]} h (rule 16)`);
        t += h;
        const inDetention = () => detained && t <= dStart + 24;
        if (st.do === 'rush') E(`${where}: the plan uses a forensic rush (rule 17)`);
        if (st.do === 'detain') {
          if (!people.has(st.target)) return E(`${where}: no such person`);
          if (detained && t <= dStart + 24) E(`${where}: ${detained} is still detained; one detention at a time (rule 16)`);
          detained = st.target; dStart = t; everDetained.set(st.target, t);
        }
        if (st.do === 'release') detained = null;
        if (st.do === 'sample') {
          const e = evidence.get(st.target);
          if (!e?.detention) return E(`${where}: not a detention sample`);
          if (detained !== e.detention || !inDetention()) E(`${where}: ${e.detention} is not detained at hour ${t} (rule 16)`);
          sampled.add(e.id);
        }
        if (st.do === 'submit') {
          const e = evidence.get(st.target);
          if (!e?.lab) return E(`${where}: not a lab test`);
          for (const x of e.lab.needs) if (evidence.get(x)?.detention && !sampled.has(x)) E(`${where}: sample ${x} hasn't been taken yet (rule 16)`);
          // Region 8: samples travel by road and plane; every lab test takes the region's transport hours extra.
          submitted.set(e.id, t + e.lab.hours + (region?.labTransportHours || 0));
        }
        if (st.do === 'press') {
          const k = contradictions.get(st.target);
          if (!k) return E(`${where}: no such contradiction`);
          const owner = claimOwner.get(k.claim);
          const usable = k.brokenBy.filter(b => !labOf.has(b) || (submitted.has(labOf.get(b).id) && submitted.get(labOf.get(b).id) <= t));
          if (!usable.length) E(`${where}: the lab result it needs isn't back at hour ${t} (rule 16)`);
          if (everDetained.has(owner) && !(detained === owner && inDetention()))
            E(`${where}: ${owner} was detained and has been released by hour ${t}; they can't be pressed again (rule 16)`);
        }
      });
      for (const s of c.solution.proof) for (const x of s.from) {
        const e = labOf.get(x);
        if (e && !submitted.has(e.id)) E(`clockPlan never submits ${e.id}, which the proof needs (rule 16)`);
        const se = c.evidence.find(ev => ev.detention && ev.facts.includes(x));
        if (se && !sampled.has(se.id)) E(`clockPlan never takes ${se.id}, which the proof needs (rule 16)`);
      }
      const declared = plan.totalHours;
      if (declared != null && declared !== t) W(`clockPlan.totalHours ${declared} but the steps add up to ${t} (rule 16)`);
    }
  }

  // ---------- Rule 8: no leak ----------
  const obOnly = wordsUnlocked(new Set(c.ob.facts || []));
  for (const w of answerWords) if (obOnly.has(w)) E(`answer ${w} is unlocked by the OB entry alone (rule 8)`);
  for (const sb of strips) { const act = sb.strip.events.find(e => e.act); if (act && act.by.every(x => (c.ob.facts || []).includes(x))) E(`strip act ${act.id} is placed by the OB entry alone (rule 8)`); }

  // ---------- Rule 9: guess resistance ----------
  for (const g of c.chargeSheet.groups) {
    if (g.blanks.length === 1 && g.blanks[0].category === 'strip') {
      const min = (region?.number || 1) <= 5 ? 12 : 30;
      if (options[g.blanks[0].id] < min) E(`strip ${g.id} has ${options[g.blanks[0].id]} arrangements (min ${min}, rule 9)`);
    } else if (g.blanks.length === 1) {
      const min = region?.number === 1 ? 4 : 5;
      if (options[g.blanks[0].id] < min) E(`group ${g.id} has ${options[g.blanks[0].id]} options (min ${min}, rule 9)`);
    } else {
      const combos = g.blanks.reduce((p, b) => p * options[b.id], 1);
      const min = (region?.number || 1) <= 5 ? 12 : 30;
      if (combos < min) E(`group ${g.id} has ${combos} combinations (min ${min}, rule 9)`);
    }
  }

  // ---------- Rule 10: region rules ----------
  if (region) {
    const a = region.allows;
    for (const e of c.evidence) if (!a.evidenceTypes.includes(e.type)) E(`evidence ${e.id} type ${e.type} not allowed in region ${region.number} (rule 10)`);
    for (const e of gated) if (!a.gates.includes(e.gate.action)) E(`gate ${e.gate.action} not allowed in region ${region.number} (rule 10)`);
    if (!a.contradictions && (c.contradictions || []).length) E(`contradictions not allowed in region ${region.number} (rule 10)`);
    if (!a.lies && c.facts.some(f => f.kind === 'lie')) E(`lies not allowed in region ${region.number} (rule 10)`);
    for (const g of c.chargeSheet.groups) if (!a.groups.includes(g.kind)) E(`group kind ${g.kind} not allowed in region ${region.number} (rule 10)`);
    for (const it of c.interrogations) if (!a.stances.includes(it.stance)) E(`stance ${it.stance} not allowed in region ${region.number} (rule 10)`);
    if (a.liarsPerCase) {
      const liarCount = new Set(c.facts.filter(f => f.kind === 'lie').map(f => claimOwner.get(f.id))).size;
      const [lo, hi] = a.liarsPerCase;
      if (liarCount < lo || liarCount > hi) E(`${liarCount} liars; region ${region.number} needs ${lo}–${hi} (rule 10)`);
    }
  }

  // ---------- Rule 11: content policy ----------
  need(c.pattern?.noRealCaseRetold === true, 'pattern.noRealCaseRetold must be true (rule 11)');
  if ((c.pattern?.tags || []).some(t => /sexual/i.test(t))) E('sexual-violence tags are not allowed (rule 11)');
  const texts = [];
  const push = (kind, s) => { if (typeof s === 'string') texts.push([kind, s]); };
  push('ob.text', c.ob.text);
  c.facts.forEach(f => push('fact.text', f.text));
  c.people.forEach(p => push('person.bio', p.bio));
  c.locations.forEach(l => { push('location.description', l.description); (l.hotspots || []).forEach(h => push('hotspot.text', h.text)); });
  c.evidence.forEach(e => push('evidence.title', e.title));
  c.interrogations.forEach(it => { push('interrogation.intro', it.intro); (it.topics || []).forEach(t => push('topic.reply', t.reply)); });
  (c.contradictions || []).forEach(k => push('contradiction.reaction', k.reaction));
  c.chargeSheet.groups.forEach(g => { push('prosecutor', g.prosecutor.pass); (g.prosecutor.fail || []).forEach(x => push('prosecutor', x)); });
  c.solution.reconstruction.forEach(r => push('reconstruction.text', r.text));
  Object.values(c.hints).forEach(h => { push('hint.line', h.tier1?.line); push('hint.line', h.tier2?.line); });
  (c.tutorial || []).forEach(t => push('tutorial.line', t.line));
  (c.glossary || []).forEach(g => push('glossary.def', g.def));
  for (const [kind, s] of texts) if (LIMITS[kind] && s.length > LIMITS[kind]) E(`${kind} too long (${s.length}/${LIMITS[kind]}): "${s.slice(0, 50)}…"`);
  const gl = new Set((c.glossary || []).map(g => g.term.toLowerCase()));
  // People's names are not vocabulary: "Riziki Chai" or "Jumaa Tsuma" must not demand a glossary entry
  // for chai (tea) or jumaa (Friday prayer). Name tokens are blanked before the scan (nicknames in
  // brackets, like "(Mama Chiku)", are not, because "Mama" there is the word).
  let allText = texts.filter(([k]) => k !== 'glossary.def').map(([, s]) => s).join(' \n ').toLowerCase();
  const nameTokens = new Set(c.people.flatMap(p => p.name.replace(/\(.*?\)/g, '').replace(/"[^"]*"/g, '').toLowerCase().split(/\s+/)).filter(t => t.length > 2));
  for (const t of nameTokens) if (lexicon.has(t)) allText = allText.replace(new RegExp(`(^|[^a-z])${t}([^a-z]|$)`, 'g'), '$1 $2');
  for (const term of lexicon) {
    const re = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(allText) && !gl.has(term)) E(`Swahili/Sheng term "${term}" used but not in this case's glossary (rule 11)`);
  }

  // ---------- Rule 12: declared vs measured difficulty (warnings) ----------
  const d = c.difficulty;
  const suspects = c.people.filter(p => p.role === 'suspect').length;
  if (d.suspects !== suspects) W(`difficulty.suspects ${d.suspects} but ${suspects} suspects (rule 12)`);
  // A red herring is a person, or a phantom created by a lie (a fact flagged redHerring, case 26).
  const herrings = c.people.filter(p => p.redHerring).length + c.facts.filter(f => f.redHerring).length;
  if (d.redHerrings !== herrings) W(`difficulty.redHerrings ${d.redHerrings} but ${herrings} marked (rule 12)`);
  const liars = new Set(c.facts.filter(f => f.kind === 'lie').map(f => f.about?.[0])).size;
  if (d.liars !== liars) W(`difficulty.liars ${d.liars} but ${liars} measured (rule 12)`);
  const depth = {};
  for (const s of c.solution.proof) depth[s.id] = 1 + Math.max(0, ...s.from.map(x => depth[x] || 0));
  const chain = Math.max(...Object.values(depth));
  if (d.chainLength !== chain) W(`difficulty.chainLength ${d.chainLength} but proof depth ${chain} (rule 12)`);
  const gkinds = c.chargeSheet.groups.map(g => g.kind);
  if (JSON.stringify(d.groups) !== JSON.stringify(gkinds)) W(`difficulty.groups ${d.groups} vs ${gkinds} (rule 12)`);
  const gatedUsed = best ? gated.filter(e => best.allowed.has(e.id)).map(e => e.gate.action) : [];
  if (JSON.stringify([...(d.gatedActions || [])].sort()) !== JSON.stringify([...gatedUsed].sort()))
    W(`difficulty.gatedActions ${JSON.stringify(d.gatedActions)} but the cheapest proof uses ${JSON.stringify(gatedUsed)} (rule 12)`);

  // ---------- Rule 13: curve check (warning) ----------
  // Flags a case that's measurably easier than the case three before it, within a region. Across a
  // region boundary the old axes deliberately step back while a new mechanic arrives; that step is
  // governed by the per-region targets (master list A2), not by this check.
  const prev = allCases.get(`case-${String(c.meta.number - 3).padStart(3, '0')}`);
  if (prev && prev.meta.regionNumber === c.meta.regionNumber && curveScore(c) < curveScore(prev))
    W(`curve: score ${curveScore(c)} is below case ${prev.meta.number}'s ${curveScore(prev)} (rule 13)`);

  // ---------- Rule 14: missing images (warning) ----------
  const briefs = [...c.people, ...c.locations, ...c.evidence].filter(x => x.image?.brief);
  const num = String(c.meta.number).padStart(3, '0');
  const missing = briefs.filter(x => !fs.existsSync(path.join(imgDir, num, `${x.id}.webp`))).length;
  missingImages += missing;

  // ---------- Hints present for every group ----------
  for (const g of c.chargeSheet.groups) {
    const h = c.hints[g.id];
    if (!h?.tier1?.point || !h?.tier1?.line || !h?.tier2?.facts?.length || !h?.tier2?.line) E(`hints for ${g.id} incomplete`);
    else need(anyEntity(h.tier1.point), `hint tier1 point ${h.tier1.point} not found`);
  }

  totalErrors += errors.length; totalWarnings += warnings.length;
  const status = errors.length ? 'FAIL' : 'pass';
  console.log(`${file}  ${status}  errors ${errors.length}  warnings ${warnings.length}  ` +
    `stamps ${best ? best.cost : '-'}  facts ${c.facts.length}  options ${JSON.stringify(options)}  images ${briefs.length - missing}/${briefs.length}`);
  if (!quiet) { errors.forEach(m => console.log('   ERROR ' + m)); warnings.forEach(m => console.log('   warn  ' + m)); }
}
console.log(`\n${files.length} cases · ${totalErrors} errors · ${totalWarnings} warnings · ${missingImages} images not yet generated (rule 14)`);
process.exit(totalErrors ? 1 : 0);
