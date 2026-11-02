#!/usr/bin/env node
// Exports case JSON as a readable script for review.
// Usage: node tools/export-script.mjs <casesDir> <out.md> [--player] [--range 11-20]
//   --player omits every spoiler; --range limits the export to a span of case numbers.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--range');
const [lo, hi] = ri >= 0 ? argv[ri + 1].split('-').map(Number) : [1, 100];
const [dir = 'www/cases', out = 'case-scripts.md'] = argv.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
const player = argv.includes('--player');
const campaign = JSON.parse(fs.readFileSync(path.join(dir, '_campaign.json'), 'utf8'));
const files = fs.readdirSync(dir).filter(f => /^case-\d{3}\.json$/.test(f)).sort()
  .filter(f => { const n = Number(f.slice(5, 8)); return n >= lo && n <= hi; });
const L = [];
const p = s => L.push(s);

p(`# Kesi: Kenya Case Files — ${player ? 'player view (no solutions)' : 'case scripts'}${ri >= 0 ? `, cases ${lo}–${hi}` : ''}`);
p('');
p(player ? 'Everything a player can see, nothing they can\'t. Used for blind playtests.' :
  'Generated from the case JSON files. Every line here is exactly what the game will show. Spoiler sections are marked.');
p('');

if (!player && lo <= 1) {
  p('## Prologue');
  for (const b of campaign.prologue.beats) {
    p(`- **${b.id}.** ${b.visual}`);
    if (b.text) p(`  - *Text:* ${b.text}`);
    if (b.voice) p(`  - *Mwalimu:* "${b.voice.line}"`);
  }
  p('');
}

for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const person = id => c.people.find(x => x.id === id);
  const fact = id => c.facts.find(x => x.id === id);
  const ev = id => c.evidence.find(x => x.id === id);
  const word = id => c.words.find(x => x.id === id);
  p(`---`);
  p(`## Case ${c.meta.number}${c.meta.final ? ' — FINAL' : c.meta.boss ? ' — BOSS' : ''}: ${c.meta.title}`);
  p(`*${c.meta.date} · folder tab "${c.meta.folderTab}" · about ${c.meta.estMinutes} min*`);
  p('');
  p(`### OB entry`);
  p(`> **${c.ob.number}** · ${c.ob.date} · ${c.ob.time}  `);
  p(`> ${c.ob.text}`);
  p('');
  if (c.map) {
    const nm = id => c.locations.find(x => x.id === id)?.name || (c.places || []).find(x => x.id === id)?.name || id;
    p(`### Site map`);
    for (const e of c.map.edges) p(`- ${nm(e.a)} ↔ ${nm(e.b)}: ${e.minutes} min by ${e.by}`);
    p('');
  }
  p(`### People`);
  // Region 9: accomplices, unknowing helpers and the real target are spoilers.
  const ptag = x => player ? '' : [x.isCulprit && 'CULPRIT', x.accomplice && 'ACCOMPLICE', x.unknowingHelper && 'unknowing helper', x.intendedTarget && 'REAL TARGET'].filter(Boolean).map(t => ` **[${t}]**`).join('');
  for (const x of c.people) p(`- **${x.name}**, ${x.age}, ${x.occupation} (${x.role}${x.statementOnly ? ', statement only' : ''})${ptag(x)}. ${x.bio}`);
  p('');
  for (const l of c.locations) {
    p(`### Location: ${l.name}`);
    p(l.description);
    p('');
    for (const h of l.hotspots || []) {
      p(`- **${h.label}**${h.unlock && !player ? ` *(appears after ${h.unlock.fact || h.unlock.evidence || 'unlock'})*` : ''}: ${h.text}${h.yields ? ` → *${ev(h.yields).title}*` : ''}`);
    }
    // Region 8: each location's Expected list (what should be here, and why we expect it).
    if ((l.expected || []).length) {
      p('');
      p(`*Expected here:*`);
      for (const x of l.expected) {
        const why = fact(x.because)?.text;
        const res = player ? '' : x.present ? ' — **present**' : ` — **MISSING** → "${fact(x.fact)?.text}"`;
        p(`- ${x.text}${why && !player ? ` *(because: "${why}")*` : ''}${res}`);
      }
    }
    p('');
  }
  p(`### Evidence and facts`);
  for (const e of c.evidence) {
    const GATE = { warrant: ['a search warrant', 'WARRANT'], records: ['a court order (records request)', 'RECORDS REQUEST'], forensicRush: ['a forensic rush', 'FORENSIC RUSH'] };
    const [plain, label] = e.gate ? (GATE[e.gate.action] || [e.gate.action, e.gate.action.toUpperCase()]) : [];
    const gate = e.gate ? (player ? ` · needs ${plain}` : ` · ${label}, ${e.gate.cost} stamp; grounds: ${(e.gate.grounds || []).map(g => `"${fact(g).text}"`).join(' / ')}`) : '';
    const labTxt = e.lab ? (e.lab.hours ? ` · lab: ${e.lab.test}, ${e.lab.hours} in-game hours after submission; needs ${e.lab.needs.map(n => ev(n)?.title || n).join(' + ')}` : ` · ${e.lab.test}, immediate${e.lab.needs.length ? `; needs ${e.lab.needs.map(n => ev(n)?.title || n).join(' + ')}` : ''}`) : '';
    const detTxt = e.detention ? ` · taken only while ${person(e.detention).name} is detained` : '';
    // Region 7: documents are genuine or forged (the forger can be the victim, case 64).
    const docTxt = e.doc ? (player ? ' · document' : ` · document: ${e.doc.genuine ? 'genuine' : `FORGED${e.doc.forger ? ` (forger: ${person(e.doc.forger)?.name})` : ''}`}`) : '';
    const plantTxt = e.planted && !player ? ` · PLANTED by ${person(e.planted.by)?.name}${e.planted.frames ? ` to frame ${person(e.planted.frames)?.name}` : ' (frames no one: it stages a story)'}` : '';
    p(`- **${e.title}** (${e.type}${gate}${labTxt}${detTxt}${docTxt}${plantTxt})`);
    const rail = f => f.at ? ` ⏱ ${f.at.day ? f.at.day + ' ' : ''}${f.at.from}${f.at.to ? '–' + f.at.to : ''}` : '';
    for (const fid of e.facts) p(`  - ${fact(fid).text}${rail(fact(fid))}${fact(fid).spine && !player ? ` *(spine: ${fact(fid).spine})*` : ''}`);
  }
  p('');
  p(`### Interviews`);
  for (const it of c.interrogations) {
    const who = person(it.person);
    const opens = it.stance === 'guarded' ? `; talks once shown: ${(it.opensWith || []).map(x => ev(x)?.title || fact(x)?.text || x).join(' or ')}` : '';
    const law = it.stance === 'lawyered' ? `, ${it.lawyered.advocate}: "${it.lawyered.line}"${player ? '' : `; reopened by: ${it.lawyered.reopenedBy.map(x => `"${fact(x)?.text}"`).join(' or ')}`}` : '';
    p(`**${who.name}** (${it.stance}${opens}${law})`);
    p(`> ${it.intro}`);
    for (const cl of it.claims || []) p(`- Says: ${fact(cl).text}${!player && fact(cl).kind === 'lie' ? ' **[LIE]**' : ''}`);
    for (const lc of it.laterClaims || []) p(`- Later says${player ? '' : ` (once ${fact(lc.after)?.text ? `"${fact(lc.after).text}"` : lc.after} is known)`}: ${fact(lc.claim).text}${!player && fact(lc.claim).kind === 'lie' ? ' **[LIE]**' : ''}`);
    for (const t of it.topics || []) {
      const about = person(t.about)?.name || ev(t.about)?.title || c.locations.find(x => x.id === t.about)?.name || fact(t.about)?.text || t.about;
      p(`- *Asked about ${about}:* "${t.reply}"`);
    }
    p('');
  }
  if (!player && (c.contradictions || []).length) {
    p(`### SPOILER: presses`);
    for (const k of c.contradictions) {
      p(`- Press **${fact(k.claim).text}** with ${k.brokenBy.map(b => `"${fact(b).text}"`).join(' or ')} → stamped BROKEN, marked ${{ explains: 'grey (explains)', mistaken: 'amber (honest mistake)' }[k.mark] || 'red (implicates)'}.`);
      p(`  - *Reaction:* "${k.reaction}"`);
      for (const r of k.reveals || []) p(`  - *New fact:* ${fact(r)?.text || ev(r)?.title}`);
      for (const g of k.greys || []) p(`  - *Greys out:* ${fact(g).text}`);
    }
    p('');
  }
  p(`### Charge sheet`);
  p(`\`${c.chargeSheet.template.replace('{victim}', c.chargeSheet.fixed.victim)}\``);
  for (const g of c.chargeSheet.groups) for (const b of g.blanks) {
    if (b.category === 'strip') {
      p(`- **WHEN timeline strip**: drag each event into a time slot.`);
      p(`  - Events: ${b.strip.events.map(e => e.text).join(' · ')}`);
      p(`  - Slots: ${b.strip.slots.map(x => x.label).join(' · ')}`);
      continue;
    }
    const opts = c.words.filter(w => w.category === b.category && (!b.pool || b.pool.includes(w.id))).map(w => w.text).join(' · ');
    const kindTag = g.kind === 'spine' ? ' (SPINE group: dragged from the Pattern File)' : g.kind === 'absence' && b.category === 'absence' ? ' (ABSENCE group: dotted cards from the Expected lists)' : g.kind === 'accomplice' && b.category === 'person' ? ' (ACCOMPLICE: "helped by …")' : g.kind === 'planted' && b.category === 'item' ? ' (PLANTED: red-edged cards)' : g.kind === 'realTarget' ? ' (REAL TARGET)' : '';
    p(`- **{${b.id}}**${kindTag} word bank: ${opts}`);
  }
  if (!player) {
    for (const g of c.chargeSheet.groups) {
      p(`- Halima, pass: "${g.prosecutor.pass}"`);
      for (const x of g.prosecutor.fail) p(`- Halima, fail: "${x}"`);
    }
  }
  p('');
  p(`### Hint calls (Mwalimu)`);
  const multi = Object.keys(c.hints).length > 1;
  for (const [g, h] of Object.entries(c.hints)) {
    const tag = multi ? ` (${g.replace('g_', '').toUpperCase()})` : '';
    p(`- Tier 1${tag}: "${h.tier1.line}"`);
    p(`- Tier 2${tag}: "${h.tier2.line}"`);
  }
  p('');
  if (!player) {
    p(`### SPOILER: solution`);
    const slotLabel = (b, id) => b.strip.slots.find(x => x.id === id)?.label;
    const answers = c.chargeSheet.groups.flatMap(g => g.blanks.map(b => b.category === 'strip'
      ? `when = ${b.strip.events.map(e => `${e.text} → ${slotLabel(b, e.slot)}`).join('; ')}`
      : `${b.id} = ${word(b.answer).text}${(b.accept || []).length ? ` (also accepted: ${b.accept.map(a => word(a).text).join('; ')})` : ''}`)).join(', ');
    const tod = c.solution.timeOfDeath;
    p(`**Answer:** ${answers}. Act window: ${tod.from}–${tod.to}${tod.note ? ` (${tod.note})` : ''}.${tod.alibisApply === false ? ` Alibis don't apply: ${tod.reason}` : ''}`);
    for (const s of c.solution.proof) p(`${s.id}. ${s.concludes}`);
    p('');
    p(`**Eliminations**`);
    for (const g of c.chargeSheet.groups) for (const b of g.blanks) if (b.category === 'strip') {
      for (const e of b.strip.events) p(`- WHEN: *${e.text}* → ${slotLabel(b, e.slot)}: ${e.why}`);
      for (const d of b.strip.decoys || []) p(`- WHEN decoy slot ${slotLabel(b, d.slot)}: ${d.why}`);
    }
    for (const e of c.solution.eliminations) p(`- ${word(e.word).text}${e.present ? ' *(present, not the killer)*' : ''}: ${e.why}`);
    const spineFacts = c.facts.filter(f => f.spine);
    if (spineFacts.length) { p(''); p(`**Pinned to the Pattern File on solve**`); for (const f of spineFacts) p(`- ${f.text} *(${f.spine})*`); }
    p('');
    p(`**Verdict reconstruction**`);
    for (const r of c.solution.reconstruction) p(`- ${r.text}`);
    for (const a of c.afterVerdict || []) {
      p(`- *After the verdict:* ${a.beat}`);
      // Region 6: a story choice (case 60's phone call). It never changes the solution.
      if (a.choice) { for (const o of a.choice.options) p(`  - **${o.label}:** ${o.result}`); if (a.choice.effect) p(`  - *Either way:* ${a.choice.effect}`); }
      // Region 7: a tap-through scene (case 70's kitchen table) and Pattern File entries filed after the verdict.
      (a.beats || []).forEach((b, i) => p(`  ${i + 1}. ${b}`));
      for (const f of a.files || []) p(`  - *Pattern File (${f.thread}):* ${f.text}`);
    }
    p('');
    if (c.tutorial) { p(`**Mwalimu voice-notes (interface teaching)**`); for (const t of c.tutorial) p(`- *${t.trigger}:* "${t.line}"`); p(''); }
    const bc = campaign.betweenCases[String(c.meta.number)];
    if (bc) {
      p(`**Between cases**`);
      if (bc.mwalimu) p(`- Mwalimu: "${bc.mwalimu}"`);
      if (bc.halima) p(`- Halima (text): "${bc.halima}"`);
      if (bc.desk) p(`- Desk: ${bc.desk}`);
      p('');
    }
    if (c.clockPlan) {
      const t = s => s.do === 'wait' ? `wait ${s.hours} h` : s.do === 'travel' ? `travel ${c.locations.find(x => x.id === s.from)?.name || s.from} → ${c.locations.find(x => x.id === s.target)?.name || s.target} (${s.hours} h)` : `${s.do} ${person(s.target)?.name || ev(s.target)?.title || c.locations.find(x => x.id === s.target)?.name || (c.contradictions || []).find(x => x.id === s.target) && `"${fact(c.contradictions.find(x => x.id === s.target).claim).text}"` || s.target}${s.hours != null ? ` (${s.hours} h)` : ''}`;
      p(`**Clock plan** (about ${c.clockPlan.totalHours} in-game hours, no forensic rush). ${c.clockPlan.note || ''}`);
      p(c.clockPlan.steps.map((s, i) => `${i + 1}. ${t(s)}`).join(' · '));
      p('');
    }
    p(`**Interface beat:** ${c.ui.beatNotes}`);
    p('');
  }
  p(`### Glossary`);
  p(c.glossary.map(g => `**${g.term}**: ${g.def}`).join(' · '));
  p('');
}
fs.writeFileSync(out, L.join('\n'));
console.log(`wrote ${out} (${L.length} lines)`);
