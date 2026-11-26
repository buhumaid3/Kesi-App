// Reconstruction stills (polish P5): one image brief per case for the verdict's "What happened", written from
// the case file. Writes prompts/briefs/reconstructions.json (edit it freely; tools/compile-prompts.mjs reads it).
//   node tools/recon-briefs.mjs            write briefs for cases that don't have one yet (never overwrites)
//   node tools/recon-briefs.mjs --force    rewrite every brief
// The rule (the brief's guardrails): the scene's own place, at the time it happened, after the act; people only
// as one small, distant figure seen from behind or implied by what they left. No act, no injury, no weapon in use.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd(), SRC = path.join(ROOT, 'www/cases'), OUT = path.join(ROOT, 'prompts/briefs/reconstructions.json');
const force = process.argv.includes('--force');
const out = fs.existsSync(OUT) && !force ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const light = hhmm => {
  const h = +String(hhmm || '12').split(':')[0];
  if (h >= 19 || h < 5) return 'at night, in whatever light the place has after dark (street lights, a lamp, a doorway, moonlight)';
  if (h < 7) return 'just before dawn, blue grey light';
  if (h < 17) return 'in daylight';
  return 'at dusk, low warm light';
};
// The object left behind, if the case names one in its HOW answer or the reconstruction's act step: a still object only.
const OBJECT_WORDS = /\b(spanner|wheel brace|bottle|cup|glass|jerrican|rope|cable|bag|box|basket|phone|torch|helmet|panga|jembe|hammer|pipe|plank|stone|brick|sack|cloth|jacket|shoe|sandal|cap|kikoi|kanga|ledger|key)\b/i;
let made = 0;
for (const f of fs.readdirSync(SRC).filter(f => /^case-\d{3}\.json$/.test(f)).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')), n = String(c.meta.number).padStart(3, '0');
  if (out[n] && !force) continue;
  const scene = c.locations.find(l => l.kind === 'scene' && l.image) || c.locations.find(l => l.image);
  if (!scene) continue;
  const steps = c.solution.reconstruction || [], act = steps.find(s => s.image) || steps[Math.floor(steps.length / 2)] || { text: '' };
  const obj = (act.text.match(OBJECT_WORDS) || [])[1];
  // The place as its own photo shows it (the reference), without its "no people" note; its own time of day wins,
  // because the still is generated from that photo.
  const place = scene.image.brief.replace(/\.$/, '').replace(/,?\s*(with\s+)?no (people|one)[^,.;]*/gi, '').trim();
  const timed = /\b(night|dusk|dawn|morning|midday|noon|afternoon|evening|daylight|sunset|sunrise|after dark)\b/i.test(place);
  const brief = `${place}${timed ? '' : `, ${light(c.solution.timeOfDeath?.from)}`}. A still moment just after it happened: the place quiet and ordinary${obj ? `, a ${obj.toLowerCase()} lying where it was left` : ''}; at most one small figure far off, seen from behind, walking out of the light, face never visible`;
  out[n] = { brief, scene: scene.id, from: act.text };
  made++;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`${made} reconstruction briefs written (${Object.keys(out).length} in all) → prompts/briefs/reconstructions.json`);
