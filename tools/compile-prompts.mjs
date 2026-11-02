// Compiles every image prompt in the game from the case data (design doc §2.13, §5.11).
// Prompt = master style prefix + kind wrapper + rewritten brief + composition hints + continuity reference + guardrails.
// Writes: prompts/case-NNN.txt (ready to paste, one block per image), prompts/_recurring.txt (reference portraits,
// generated first), prompts/manifest.json (one row per image), and prompts/requests.json (what
// tools/generate-images.mjs sends to Gemini). Exits 1 if a guardrail check fails (a community word, legible-text request, gore word
// or detective-in-frame request survives the rewrite).
// Usage: node tools/compile-prompts.mjs [www/cases] [prompts]
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'www/cases';
const OUT = process.argv[3] || 'prompts';
const campaign = JSON.parse(fs.readFileSync(path.join(SRC, '_campaign.json'), 'utf8'));
const files = fs.readdirSync(SRC).filter(f => /^case-\d{3}\.json$/.test(f)).sort();

// ── The master style prompt (prefixed to every image) ───────────────────────────────────────────
export const MASTER = [
  'Documentary photograph for a Kenyan police case file.',
  'Shot on 35 mm colour film with a standard lens: natural available light, true-to-life colour slightly muted and warm, fine even film grain, honest exposure, no HDR, no glow, no bokeh effects, no retouching.',
  'Contemporary Kenya, the 2020s. Ordinary and unglamorous: real wear, real dust, real clutter, real weather. People look like real people photographed by a tired police photographer, not models.',
].join(' ');

// The same guardrails close every prompt.
export const GUARD = [
  'No readable text anywhere: any writing, signage, labels, number plates, screens or documents are out of focus, turned away or too small to read.',
  'No logos, brand names, flags, insignia or badges; uniforms are plain.',
  'No police officer, detective, photographer or camera visible; nobody looks at the camera except an ID-photo subject.',
  'No blood, wounds, injuries, dead bodies or nudity; weapons and tools appear only as still objects lying where they were found.',
  'Not an illustration, not a 3D render, not a painting.',
].join(' ');

// Kind wrappers: framing, light and aspect ratio for each image kind.
export const KIND = {
  portrait: { ratio: '3:4', size: '1K', openai: '1024x1536',
    text: 'Head-and-shoulders identification photograph. The subject faces the camera, shoulders square, centred, eyes on the upper third, against a plain pale grey or off-white wall. Even, flat front light like a station ID camera, a faint shadow behind the shoulders. Expression exactly as described; no smile unless stated.' },
  location: { ratio: '3:2', size: '2K', openai: '1536x1024',
    text: 'Establishing photograph of a real kind of place in Kenya, taken at eye level from where an investigator would stand on arrival. Natural 35 mm perspective, everything in focus, people absent or distant and unidentifiable. Light and time of day as described; if not stated, bright overcast daylight.' },
  scene: { ratio: '4:3', size: '2K', openai: '1536x1024',
    text: 'Crime-scene record photograph of the place after the event, slightly above eye level, flat on-camera flash or the available light, documentary and still. The event is implied only by what was left behind.' },
  evidence: { ratio: '1:1', size: '1K', openai: '1024x1024',
    text: 'Close-up evidence photograph of the object as it was found, in its place, filling about two thirds of the frame, soft even light or flat flash, sharp detail on the object, the surroundings plain and slightly out of focus. No ruler, no numbered marker (the case file adds its own).' },
};

// ── Brief rewrite rules ─────────────────────────────────────────────────────────────────────────
// 1. Community words are dropped: they belong in the case data (for the fairness audit), not in the picture.
//    A generator asked for "a Luo man" or "a Kalenjin woman" reaches for stereotyped features; clothing, age,
//    work and expression already carry who someone is. Kenyan Asian and Kenyan European are kept, because
//    they change what the person looks like rather than inviting a caricature.
const communities = [...new Set(files.flatMap(f => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).people.map(p => p.community)))]
  .flatMap(c => c.split(/[\s()-]+/)).filter(w => w && !/^(Kenyan|Asian|European|Gujarati|Punjabi)$/i.test(w));
const COMMUNITY = new RegExp(`\\b(${[...new Set(communities)].join('|')})\\b\\s*`, 'g');
// 2. Writing in a photo is never the clue. Any quoted or capitalised wording the brief asks the object to carry is
//    taken out of the picture and returned as `transcribe`: the engine prints it on a typed exhibit tag clipped to
//    the photo, so the words are exact, sharp, accessible and translatable, and the generator can't misspell a clue.
const QUOTED = /(^|[\s(:,])['"\u2018\u201c]([^'"\u2019\u201d]{1,90})['"\u2019\u201d](?=[\s,.;:)!?]|$)/g;
const CAPS_CUE = /\b(reading|labelled|labeled|headed|engraved|reads|printed|stencilled|marked)\b:?\s+([A-Z0-9][A-Z0-9 .,:\u2014\u2013&/'-]{2,}[A-Z0-9.])/g;
const SOFT = 'lettering (too small and soft to read)';
const lift = (brief) => {
  const words = [];
  let b = brief.replace(QUOTED, (m, pre, txt) => { words.push(txt); return `${pre}${SOFT}`; });
  b = b.replace(CAPS_CUE, (m, verb, txt) => { words.push(txt.trim()); return `${verb} ${SOFT}`; });
  b = b.replace(/\b(legible|readable)\b/g, 'too faint to read');
  return { b, words };
};
const rewrite = (brief) => {
  let b = brief
    .replace(/,?\s*ID-photo framing\.?/i, '')                 // the portrait wrapper already says it
    .replace(/Kenyan-Asian|Kenyan Asian/g, 'Kenyan Asian')
    .replace(/Kenyan-European|Kenyan European/g, 'Kenyan European')
    .replace(/\((Gujarati|Punjabi)\)\s*/g, '')
    .replace(COMMUNITY, '')
    .replace(/\bKenyan Kenyan\b/g, 'Kenyan')
    .replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
  if (/^(man|woman|young|boy|girl|elderly|old)\b/i.test(b)) b = 'Kenyan ' + b;
  return b.replace(/\.$/, '');
};

// 2. Composition hints from the hotspot positions, so the things the player taps land roughly where the
//    data expects them. A placement pass after generation (tools/place-hotspots.html) re-pins them exactly.
const third = (x) => (x < 34 ? 'left' : x > 66 ? 'right' : 'centre');
const band = (y) => (y < 34 ? 'upper' : y > 66 ? 'lower' : 'middle');
const where = ([x, y]) => { const b = band(y), t = third(x); return b === 'middle' && t === 'centre' ? 'in the centre' : `in the ${b === 'middle' ? '' : b + ' '}${t}${t === 'centre' ? '' : ' third'}`; };
const PLATE = /\b(K[A-Z]{2}\s?\d{3}\s?[A-Z]|GK\s?[A-Z]?[\s.…]*\d{3})\b/g;
const noPlates = (t) => t.replace(/\b(behind|beside|next to|near)\s+(K[A-Z]{2}\s?\d{3}\s?[A-Z])\b/gi, '$1 the parked vehicle').replace(PLATE, 'the vehicle');
const compose = (loc, ev) => {
  // People are never placed in a location shot (their statements are cards, not things in the picture).
  const hs = (loc.hotspots || []).filter(h => !h.unlock && !['witness', 'phone'].includes(ev.get(h.yields)?.type) && ev.get(h.yields)?.render !== 'statement').slice(0, 5);
  if (!hs.length) return '';
  const hs2 = hs.filter(h => !/^search\b/i.test(h.label)); // a records search is an action, not a thing in the picture
  if (!hs2.length) return '';
  return 'Composition: ' + hs2.map(h => `${noPlates(h.label).replace(QUOTED, '$1$2').replace(/["\u201c\u201d]/g, '').replace(/^The /, 'the ')} ${where(h.pos)}`).join('; ') + '.';
};

// 3. Continuity: the same person in a later case is generated from the earlier image.
const norm = (n) => n.replace(/\(rtd\)|,?\s*"[^"]*"|\b(Mzee|Mama|Dr\.|Ch\.|Insp\.|Advocate|Prosecutor|Senior|Sgt\.|Cpl|Mrs\.|Ms\.|Mr\.|Fr\.|Elder|Major|The late|Supt\.|Det\.)\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const continuity = new Map((campaign.imageContinuity || []).map(x => [x.key, x]));
const rcById = new Map((campaign.recurringCast || []).map(r => [r.id, r]));
const refFile = (key) => `ref/${key.replace(/\s+/g, '-')}.webp`;

// 4. Guardrail checks on the final prompt text.
const BAD = [
  [COMMUNITY, 'community word'],
  [/\b(blood(?![- ](sample|test|type|pressure|bank|slide))|bloody|wound|corpse|dead body|gore|naked)\b/i, 'gore or nudity word'],
  [/\b(legible|readable)\b(?! text anywhere)/i, 'asks for legible text'],
  [/\b(detective(?!'s)|police officer|policeman|policewoman)\b/i, 'detective in frame'],
  [QUOTED, 'quoted wording left in the picture'],
];

const rows = [];
const blocks = new Map();
const firstSeen = new Map(); // continuity key -> first case number with a portrait
const problems = [];
const push = (caseNo, id, kind, brief, extra = {}) => {
  const k = KIND[kind] || KIND.evidence;
  const { b: lifted, words } = kind === 'portrait' ? { b: brief, words: [] } : lift(brief);
  const b = kind === 'portrait' ? rewrite(lifted) : noPlates(lifted.replace(/,?\s*ID-photo framing\.?/i, '')).replace(/\.$/, '');
  const parts = [MASTER, k.text, (kind === 'portrait' ? 'Subject: ' : kind === 'evidence' ? 'Object: ' : 'Show: ') + b + '.'];
  if (extra.compose) parts.push(extra.compose);
  if (extra.reference && kind === 'scene') parts.push(`The attached photograph (${extra.reference}) is this same place, taken earlier the same night: keep the same vehicles, paintwork, buildings, ground and light, and show the closer view described.`);
  else if (extra.reference) parts.push(`Use the attached reference image (${extra.reference}) for this person's face, build and age${extra.ageNote ? ', ' + extra.ageNote : ''}; change only clothing, expression and setting as described.`);
  parts.push(GUARD);
  const prompt = parts.join('\n');
  for (const [re, what] of BAD) {
    const body = [b, extra.compose || ''].join(' ');
    if (what === 'quoted wording left in the picture' && kind === 'portrait') continue;
    if (what === 'community word' && kind !== 'portrait') continue;
    re.lastIndex = 0;
    if (re.test(body)) problems.push(`${caseNo === 0 ? 'recurring' : 'case ' + caseNo} ${id}: ${what} survives the rewrite: "${b}"`);
  }
  const file = caseNo === 0 ? `img/ref/${id}.webp` : `img/cases/${String(caseNo).padStart(3, '0')}/${id}.webp`;
  const row = { case: caseNo, id, kind, ratio: k.ratio, size: k.size, openaiSize: k.openai, file, reference: extra.reference || null, transcribe: words.length ? words : undefined, prompt };
  rows.push(row);
  const key = caseNo === 0 ? '_recurring' : `case-${String(caseNo).padStart(3, '0')}`;
  if (!blocks.has(key)) blocks.set(key, []);
  blocks.get(key).push(row);
};

// Recurring cast reference portraits come first: every later appearance points at these.
for (const r of campaign.recurringCast || []) if (r.image?.brief) push(0, r.id, 'portrait', r.image.brief);
const rcFile = (id) => `img/ref/${id}.webp`;

for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  const n = c.meta.number;
  for (const p of c.people) {
    if (!p.image) continue;
    const key = norm(p.name);
    const cont = continuity.get(key);
    let reference = null;
    const rcByName = (campaign.recurringCast || []).find(r => norm(r.name) === key);
    if (p.image.ref && rcById.has(p.image.ref)) reference = rcFile(p.image.ref);
    else if (rcByName) reference = rcFile(rcByName.id);
    else if (cont?.recurring) reference = rcFile(cont.recurring);
    else if (cont && firstSeen.has(key) && firstSeen.get(key) < n) reference = `img/cases/${String(firstSeen.get(key)).padStart(3, '0')}/${firstSeen.get(key + '#id')}.webp`;
    if (cont && !firstSeen.has(key)) { firstSeen.set(key, n); firstSeen.set(key + '#id', p.id); }
    push(n, p.id, 'portrait', p.image.brief, { reference, ageNote: reference ? `now ${p.age}` : null });
  }
  const evMap = new Map(c.evidence.map(e => [e.id, e]));
  for (const l of c.locations) if (l.image) push(n, l.id, 'location', l.image.brief, { compose: compose(l, evMap) });
  const sceneLoc = c.locations.find(l => l.kind === 'scene' && l.image);
  for (const e of c.evidence) if (e.image) {
    const isScene = e.image.kind === 'scene';
    push(n, e.id, isScene ? 'scene' : 'evidence', e.image.brief, isScene && sceneLoc ? { reference: `img/cases/${String(n).padStart(3, '0')}/${sceneLoc.id}.webp` } : {});
  }
}

// Same name in two cases without a continuity entry: either a collision or a missing link.
const names = new Map();
for (const f of files) for (const p of JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).people) {
  if (!p.image) continue; const k = norm(p.name); if (!names.has(k)) names.set(k, new Set()); names.get(k).add(f.slice(5, 8));
}
for (const [k, s] of names) if (s.size > 1 && !continuity.has(k)) problems.push(`name "${k}" has portraits in cases ${[...s].join(', ')} but no imageContinuity entry`);

fs.mkdirSync(OUT, { recursive: true });
for (const [key, list] of blocks) {
  const head = key === '_recurring'
    ? '# Recurring cast — reference portraits. Generate these FIRST; later prompts attach them.\n'
    : `# ${key} — ${list.length} images\n`;
  const body = list.map((r, i) => `## ${i + 1}. ${r.id} · ${r.kind} · ${r.ratio} · save as www/${r.file}${r.reference ? `\nATTACH: www/${r.reference}` : ''}\n\n${r.prompt}\n`).join('\n');
  fs.writeFileSync(path.join(OUT, `${key}.txt`), head + '\n' + body);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(rows.map(({ prompt, ...r }) => r), null, 1));
// requests.json: everything tools/generate-images.mjs needs (key, prompt, ratio, size, file, reference).
fs.writeFileSync(path.join(OUT, 'requests.json'), JSON.stringify(rows.map(r => ({ key: `${String(r.case).padStart(3, '0')}/${r.id}`, ...r })), null, 1));
if (fs.existsSync(path.join(OUT, 'batch-gemini.jsonl'))) fs.unlinkSync(path.join(OUT, 'batch-gemini.jsonl'));

const byKind = rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {});
console.log(`${rows.length} prompts (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')}) · ${rows.filter(r => r.reference).length} with a reference image · ${blocks.size} files in ${OUT}/`);
if (problems.length) { console.log(problems.map(p => '  PROBLEM ' + p).join('\n')); process.exit(1); }
