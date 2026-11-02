// Proposes hotspot positions by asking Gemini to find each named thing in the place photo, so the placement
// pass becomes a check instead of a drag-every-pin job. Writes the proposals into www/cases/case-NNN.json
// with "hotspotsAuto": true; the placement tool (npm run place) marks those places "Proposed: check" until
// you look at them and press Save. Nothing is ever marked placed without you.
// Needs GEMINI_API_KEY (the Codespaces secret). The key is never printed or written to disk.
//
//   node tools/auto-place.mjs --region 1 [--dry-run]     every place in region 1 not yet placed by hand
//   node tools/auto-place.mjs --case 6 [--again]         one case (--again also redoes earlier proposals)
//
// Output per place: each pin with Gemini's confidence. Pins it couldn't find stay where they were and are
// listed, so you know which to place by hand (or whether the photo is missing the object altogether).
import fs from 'node:fs';
import path from 'node:path';

const MODEL = process.env.KESI_VISION_MODEL || 'gemini-3.8-flash';
const ROOT = process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? true : undefined; };
const region = flag('--region'), caseNo = flag('--case'), dry = args.includes('--dry-run'), again = args.includes('--again');
if (!region && !caseNo) { console.error('say which: --region N or --case N'); process.exit(1); }

let ai;
async function client() {
  if (ai) return ai;
  if (process.env.KESI_FAKE_CLIENT) return (ai = (await import(path.resolve(process.env.KESI_FAKE_CLIENT))).default); // tests only
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set. Add it as a Codespaces secret, then rebuild or restart the codespace.'); process.exit(1); }
  const { GoogleGenAI } = await import('@google/genai');
  return (ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

const SCHEMA = {
  type: 'object',
  properties: { pins: { type: 'array', items: { type: 'object', properties: {
    n: { type: 'integer', description: 'the pin number from the list' },
    found: { type: 'boolean', description: 'false if the thing is not visible in the photo' },
    point: { type: 'array', items: { type: 'integer' }, description: '[y, x] of the centre of the thing, each 0-1000 relative to the image' },
    confidence: { type: 'number', description: '0 to 1' },
    note: { type: 'string', description: 'one short line: what you pointed at, or why it is not there' },
  }, required: ['n', 'found', 'point', 'confidence'] } } },
  required: ['pins'],
};

function prompt(loc) {
  const list = loc.hotspots.map((h, i) => `${i + 1}. ${h.label}: ${h.text}`).join('\n');
  return `This is a photo of "${loc.name}" from a detective game. The player taps numbered pins to examine things.
For each numbered item below, find the single thing in the photo it refers to and give the point at its centre,
as [y, x] normalised to 0-1000. Use the description to tell similar things apart. If something is described as
small, hidden or "under" something, point at where it would be (for example the floor under the bench).
If the thing is clearly not in the photo at all, set found to false and say so in the note.
Two pins must not share the same point: keep them at least 60 apart.

${list}`;
}

async function propose(n, loc) {
  const img = P('www', 'img', 'cases', String(n).padStart(3, '0'), `${loc.id}.webp`);
  if (!fs.existsSync(img)) return { skipped: `no photo yet (${path.relative(ROOT, img)})` };
  const g = await client();
  const r = await g.interactions.create({
    model: MODEL,
    input: [{ type: 'text', text: prompt(loc) }, { type: 'image', data: fs.readFileSync(img).toString('base64'), mime_type: 'image/webp' }],
    response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
  });
  const text = r.output_text ?? r.outputs?.find?.(o => o.text)?.text ?? '';
  return JSON.parse(text);
}

const files = fs.readdirSync(P('www/cases')).filter(f => /^case-\d{3}\.json$/.test(f)).sort();
let places = 0, pinsMoved = 0, notFound = [];
for (const f of files) {
  const file = P('www/cases', f), c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = c.meta.number;
  if (caseNo && n !== +caseNo) continue;
  if (region && c.meta.regionNumber !== +region) continue;
  let changed = false;
  for (const loc of c.locations) {
    if (!loc.hotspots?.length) continue;
    if (loc.hotspotsPlaced) { console.log(`case ${n} ${loc.id}: placed by hand already, left alone`); continue; }
    if (loc.hotspotsAuto && !again) { console.log(`case ${n} ${loc.id}: proposal already there (add --again to redo)`); continue; }
    if (dry) { console.log(`case ${n} ${loc.id}: would ask about ${loc.hotspots.length} pins`); places++; continue; }
    let out;
    try { out = await propose(n, loc); }
    catch (e) { console.log(`  ✗ case ${n} ${loc.id}: ${String(e.message || e).slice(0, 200)}`); continue; }
    if (out.skipped) { console.log(`  – case ${n} ${loc.id}: ${out.skipped}`); continue; }
    places++;
    console.log(`case ${n} · ${loc.name}`);
    for (const [i, h] of loc.hotspots.entries()) {
      const p = (out.pins || []).find(x => x.n === i + 1);
      if (!p || !p.found || !Array.isArray(p.point) || p.point.length !== 2) {
        notFound.push(`case ${n} ${loc.id} pin ${i + 1} "${h.label}"${p?.note ? `: ${p.note}` : ''}`);
        console.log(`   ${i + 1}. ${h.label.padEnd(36)} not found${p?.note ? ` (${p.note})` : ''}: left at (${h.pos?.join(', ') ?? 'default'})`);
        continue;
      }
      const [y, x] = p.point.map(v => Math.max(0, Math.min(1000, v)) / 10);
      h.pos = [Math.round(Math.max(4, Math.min(96, x))), Math.round(Math.max(6, Math.min(94, y)))];
      pinsMoved++; changed = true;
      console.log(`   ${i + 1}. ${h.label.padEnd(36)} → (${h.pos.join(', ')})  ${Math.round((p.confidence ?? 0) * 100)}%${p.note ? `  ${p.note}` : ''}`);
    }
    loc.hotspotsAuto = true;
    changed = true;
  }
  if (changed && !dry) fs.writeFileSync(file, JSON.stringify(c, null, 2));
}
console.log(`\n${dry ? 'Would ask about' : 'Proposed positions for'} ${places} places${dry ? '' : `, ${pinsMoved} pins moved`}.`);
if (notFound.length) { console.log(`Not found in the photo (${notFound.length}), place these by hand:`); for (const x of notFound) console.log('  ' + x); }
if (!dry && places) console.log('Now check them:  npm run place  → /place. Places marked "Proposed: check" need a look and a Save.');
