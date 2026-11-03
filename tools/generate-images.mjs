// Generates the game's images with Gemini Nano Banana 2.1 (design doc §5.10, §6).
// Reads prompts/requests.json (from tools/compile-prompts.mjs); never edits the prompts themselves.
// Needs GEMINI_API_KEY in the environment (a Codespaces secret). The key is never printed or written to disk.
//
//   node tools/generate-images.mjs dry-run [--region N | --case N | --all]   what a batch would contain, and its cost
//   node tools/generate-images.mjs pilot                 4 test images, one of each kind (interactive, ≈ $0.17)
//   node tools/generate-images.mjs refs                  the 16 recurring-cast reference portraits (interactive)
//   node tools/generate-images.mjs batch --region N      submit a region's images as one Batch job (half price); images with a
//                                                        reference (recurring faces, scenes) go in once their reference exists
//   node tools/generate-images.mjs restore               rebuild missing www/img files from img-masters/
//   node tools/generate-images.mjs batch --case N | --all
//   node tools/generate-images.mjs status                state of every submitted job
//   node tools/generate-images.mjs fetch                 download finished jobs, save masters and game images
//   node tools/generate-images.mjs continuity            everything that attaches an earlier image (interactive): 21 recurring
//                                                        portraits, and 90 scene photos that reuse their case's location photo
//   node tools/generate-images.mjs redo KEY [KEY…]       regenerate single images (interactive)
//   node tools/generate-images.mjs redo --rejects        regenerate everything listed in prompts/rejects.txt
//   node tools/generate-images.mjs review [--region N]   write review/region-N.html, a contact sheet to approve from
//   node tools/generate-images.mjs report                counts by state, and money spent so far
//
// Files: img-masters/… (full-size masters, WebP q92, git-ignored: back these up), www/img/… (the sizes the game
// ships), prompts/state.json (one entry per image), prompts/jobs.json (batch jobs), prompts/batches/ (JSONL in/out).
import fs from 'node:fs';
import path from 'node:path';

const MODEL = process.env.KESI_IMAGE_MODEL || 'gemini-nano-banana-2.1';
const PRICE = { interactive: { '1K': 0.0336, '2K': 0.0504 }, batch: { '1K': 0.0168, '2K': 0.0252 } }; // USD, Google's pricing page, 2 Nov 2026
const SHIP = { portrait: [600, 800], location: [1200, 800], scene: [1200, 900], evidence: [800, 800] };
const ROOT = process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };

const requests = readJSON(P('prompts/requests.json'), null);
if (!requests) { console.error('prompts/requests.json not found: run  node tools/compile-prompts.mjs  first'); process.exit(1); }
const byKey = new Map(requests.map(r => [r.key, r]));
const regionOf = new Map();
for (const f of fs.readdirSync(P('www/cases')).filter(f => /^case-\d{3}\.json$/.test(f))) {
  const c = JSON.parse(fs.readFileSync(P('www/cases', f), 'utf8')); regionOf.set(c.meta.number, c.meta.regionNumber);
}
const STATE_F = P('prompts/state.json'), JOBS_F = P('prompts/jobs.json');
const state = readJSON(STATE_F, {});
const jobs = readJSON(JOBS_F, []);
const save = () => { writeJSON(STATE_F, state); writeJSON(JOBS_F, jobs); };
const st = (k) => (state[k] ||= { status: 'pending', attempts: 0, spent: 0 });

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] ?? true : undefined; };

// ── Selection ───────────────────────────────────────────────────────────────────────────────────
function select({ withRefs = false } = {}) {
  const region = flag('--region'), caseNo = flag('--case'), all = rest.includes('--all');
  if (!region && !caseNo && !all) { console.error('say which: --region N, --case N or --all'); process.exit(1); }
  return requests.filter(r => r.case > 0
    && (all || (region && regionOf.get(r.case) === +region) || (caseNo && r.case === +caseNo))
    && (withRefs || !r.reference)
    && !['done', 'approved', 'submitted'].includes(st(r.key).status));
}
const cost = (rows, mode) => rows.reduce((s, r) => s + PRICE[mode][r.size], 0);

// ── Gemini client (loaded lazily so dry-run works without the SDK or a key) ─────────────────────
let ai;
async function client() {
  if (ai) return ai;
  if (process.env.KESI_FAKE_CLIENT) return (ai = (await import(path.resolve(process.env.KESI_FAKE_CLIENT))).default); // tests only
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set. Add it as a Codespaces secret, then rebuild or restart the codespace.'); process.exit(1); }
  const { GoogleGenAI } = await import('@google/genai');
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}
const genConfig = (r) => ({ responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: r.ratio, imageSize: r.size } });
const parts = (r, note) => {
  const ps = [{ text: r.prompt + (note ? `\nCorrection from review: ${note}.` : '') }];
  if (r.reference) {
    const ref = P('img-masters', r.reference.replace(/^img\//, ''));
    if (!fs.existsSync(ref)) throw new Error(`${r.key}: reference ${r.reference} has no master yet (generate and approve it first)`);
    ps.push({ inlineData: { mimeType: 'image/webp', data: fs.readFileSync(ref).toString('base64') } });
  }
  return ps;
};
// Pull the image out of a GenerateContentResponse (interactive or a batch output line).
function imageFrom(resp) {
  const cand = resp?.candidates?.[0];
  const part = cand?.content?.parts?.find(p => p.inlineData?.data || p.inline_data?.data);
  if (part) return Buffer.from((part.inlineData || part.inline_data).data, 'base64');
  const why = resp?.promptFeedback?.blockReason || cand?.finishReason || 'no image in the response';
  throw new Error(`no image (${why})`);
}

// ── Saving: a master (kept) and the shipped size (in the app) ───────────────────────────────────
async function store(r, buf) {
  const sharp = (await import('sharp')).default;
  const master = P('img-masters', r.file.replace(/^img\//, ''));
  fs.mkdirSync(path.dirname(master), { recursive: true });
  await sharp(buf).webp({ quality: 92 }).toFile(master);
  const [w, h] = SHIP[r.kind] || SHIP.evidence;
  const out = P('www', r.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf).resize(w, h, { fit: 'cover', position: 'attention' }).webp({ quality: 75 }).toFile(out);
  // Record what actually came back, so a batch that ignored the aspect ratio or size is caught in  report .
  const m = await sharp(buf).metadata();
  const [rw, rh] = r.ratio.split(':').map(Number);
  Object.assign(st(r.key), { px: `${m.width}x${m.height}`, ratioOff: Math.abs(m.width / m.height - rw / rh) > 0.03 * (rw / rh) || undefined });
  return out;
}

// ── Interactive generation, two at a time, with backoff on rate limits ──────────────────────────
async function interactive(rows, notes = {}) {
  const g = await client();
  let i = 0, ok = 0, bad = 0;
  const work = async () => {
    while (i < rows.length) {
      const r = rows[i++]; const s = st(r.key);
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const resp = await g.models.generateContent({ model: MODEL, contents: [{ role: 'user', parts: parts(r, notes[r.key]) }], config: genConfig(r) });
          const out = await store(r, imageFrom(resp));
          Object.assign(s, { status: 'done', attempts: s.attempts + 1, spent: +(s.spent + PRICE.interactive[r.size]).toFixed(4), at: new Date().toISOString(), error: undefined });
          ok++; console.log(`  ✓ ${r.key} → ${path.relative(ROOT, out)}`); break;
        } catch (e) {
          const msg = String(e?.message || e);
          const retry = /429|RESOURCE_EXHAUSTED|503|500|UNAVAILABLE|deadline/i.test(msg) && attempt < 4;
          if (retry) { await new Promise(res => setTimeout(res, 2000 * 2 ** attempt)); continue; }
          Object.assign(s, { status: 'failed', attempts: s.attempts + 1, error: msg.slice(0, 300) });
          bad++; console.log(`  ✗ ${r.key}: ${msg.slice(0, 160)}`); break;
        }
      }
      save();
    }
  };
  await Promise.all([work(), work()]);
  console.log(`${ok} generated, ${bad} failed.`);
}

// ── Batch ───────────────────────────────────────────────────────────────────────────────────────
async function submitBatch(rows, label) {
  if (!rows.length) { console.log('Nothing to submit: every selected image is done, submitted or needs a reference.'); return; }
  const g = await client();
  fs.mkdirSync(P('prompts/batches'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const inFile = P('prompts/batches', `${label}-${stamp}.in.jsonl`);
  // Each line carries its reference image inline when it has one (a recurring face, or the place a scene shows).
  fs.writeFileSync(inFile, rows.map(r => JSON.stringify({ key: r.key, request: { contents: [{ role: 'user', parts: parts(r) }], generation_config: genConfig(r) } })).join('\n') + '\n');
  const up = await g.files.upload({ file: inFile, config: { mimeType: 'jsonl', displayName: path.basename(inFile) } });
  const job = await g.batches.create({ model: MODEL, src: up.name, config: { displayName: `kesi-${label}` } });
  jobs.push({ name: job.name, label, inFile: path.relative(ROOT, inFile), keys: rows.map(r => r.key), submitted: new Date().toISOString(), state: job.state || 'JOB_STATE_PENDING', fetched: false });
  for (const r of rows) Object.assign(st(r.key), { status: 'submitted', job: job.name });
  save();
  console.log(`Submitted ${rows.length} images as ${job.name} (${label}). Estimated cost $${cost(rows, 'batch').toFixed(2)}. Google's target is within 24 hours; check with  status .`);
}

async function status() {
  if (!jobs.length) return console.log('No batch jobs yet.');
  const g = await client();
  for (const j of jobs.filter(j => !j.fetched)) {
    const b = await g.batches.get({ name: j.name });
    j.state = b.state; j.dest = b.dest?.fileName || j.dest;
    console.log(`${j.name}  ${j.label.padEnd(10)} ${String(j.keys.length).padStart(4)} images  ${b.state}  (submitted ${j.submitted.slice(0, 16).replace('T', ' ')})`);
  }
  for (const j of jobs.filter(j => j.fetched)) console.log(`${j.name}  ${j.label.padEnd(10)} fetched`);
  save();
}

async function fetchJobs() {
  const g = await client();
  for (const j of jobs.filter(j => !j.fetched)) {
    const b = await g.batches.get({ name: j.name });
    j.state = b.state;
    if (['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(b.state)) {
      for (const k of j.keys) if (st(k).status === 'submitted') Object.assign(st(k), { status: 'pending', job: undefined });
      j.fetched = true; console.log(`${j.name} ${b.state}: its ${j.keys.length} images are back to pending; submit them again.`); continue;
    }
    if (b.state !== 'JOB_STATE_SUCCEEDED') { console.log(`${j.name} still ${b.state}`); continue; }
    const outFile = P('prompts/batches', path.basename(j.inFile).replace('.in.jsonl', '.out.jsonl'));
    // A big batch's output is several GB (every image as base64), so it is downloaded to disk and read one line
    // at a time; reading it whole runs a Codespace out of memory and the process is killed ("Terminated").
    if (!fs.existsSync(outFile)) {
      const part = outFile + '.part';
      fs.rmSync(part, { force: true });
      console.log(`${j.name}: downloading the results (${j.keys.length} images; this can take a few minutes)…`);
      await g.files.download({ file: b.dest.fileName, downloadPath: part });
      fs.renameSync(part, outFile);
    }
    console.log(`  ${(fs.statSync(outFile).size / 1048576).toFixed(0)} MB of results; saving images…`);
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: fs.createReadStream(outFile, { encoding: 'utf8', highWaterMark: 1 << 20 }), crlfDelay: Infinity });
    // Google: responses are written in the same order as the requests. Use the key when present, the order when not.
    // Resumable: an image already saved (status done) is skipped, and progress is saved every 25 images.
    let ok = 0, bad = 0, skipped = 0, i = -1, n = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      i++;
      let o; try { o = JSON.parse(line); } catch { bad++; continue; }
      const key = o.key || j.keys[i]; const r = byKey.get(key);
      if (!r) continue;
      const s = st(key);
      if (['done', 'approved'].includes(s.status) && s.job === j.name) { skipped++; continue; }
      try {
        if (o.error) throw new Error(o.error.message || JSON.stringify(o.error));
        await store(r, imageFrom(o.response || o));
        Object.assign(s, { status: 'done', attempts: s.attempts + 1, spent: +(s.spent + PRICE.batch[r.size]).toFixed(4), at: new Date().toISOString(), error: undefined });
        ok++;
      } catch (e) { Object.assign(s, { status: 'failed', attempts: s.attempts + 1, error: String(e.message || e).slice(0, 300) }); bad++; }
      if (++n % 25 === 0) { save(); process.stdout.write(`  ${n} saved so far…\r`); }
    }
    const lines = { length: i + 1 };
    if (skipped) console.log(`  ${skipped} were already saved by an earlier run.`);
    if (lines.length !== j.keys.length) console.log(`  note: ${lines.length} result lines for ${j.keys.length} requests`);
    j.fetched = true; save();
    console.log(`${j.name} (${j.label}): ${ok} saved, ${bad} failed.`);
    for (const k of j.keys) if (st(k).status === 'failed') console.log(`  ✗ ${k}: ${st(k).error}`);
    const missing = j.keys.filter(k => st(k).status === 'submitted');
    if (missing.length) { for (const k of missing) Object.assign(st(k), { status: 'failed', error: 'no result line in the batch output' }); save(); console.log(`  ${missing.length} had no result at all: ${missing.join(', ')}`); }
    if (bad || missing.length) console.log('  Failed images are ready to send again:  node tools/generate-images.mjs batch --region N  (or  redo KEY  for one at a time).');
  }
}

// ── Review sheet ────────────────────────────────────────────────────────────────────────────────
function review() {
  const region = flag('--region');
  const rows = requests.filter(r => (r.case === 0 && !region) || (r.case > 0 && (!region || regionOf.get(r.case) === +region))).filter(r => fs.existsSync(P('www', r.file)));
  const name = region ? `region-${String(region).padStart(2, '0')}` : 'all';
  const cards = rows.map(r => `<figure data-key="${r.key}"><img loading="lazy" src="../www/${r.file}"><figcaption><b>${r.key}</b> · ${r.kind}${r.reference ? ' · ref' : ''}<br><label><input type="checkbox"> reject</label> <input class="note" placeholder="what's wrong (optional)"></figcaption><details><summary>prompt</summary><p>${r.prompt.split('\n').slice(2).join('<br>').replace(/</g, '&lt;')}</p></details></figure>`).join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Kesi image review ${name}</title>
<style>body{background:#2A1D15;color:#F3EBDA;font:14px/1.4 ui-monospace,monospace;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
figure{margin:0;background:#F3EBDA;color:#23222B;padding:8px}figure img{width:100%;display:block}figcaption{margin-top:6px}.note{width:100%;margin-top:4px}
details p{font-size:12px}button{font:inherit;padding:10px 16px;margin:10px 0}textarea{width:100%;height:140px}</style>
<h1>Kesi · image review · ${name} · ${rows.length} images</h1>
<p>Reject anything with: readable or garbled text · a logo, insignia or flag · warped hands or faces · a face like a real public figure · the wrong age · a caricature · blood, a body or injury · a detective or camera in frame · a hotspot object missing · a recurring face that doesn't match.</p>
<button onclick="out.value=[...document.querySelectorAll('figure')].filter(f=>f.querySelector('input[type=checkbox]').checked).map(f=>f.dataset.key+'  '+f.querySelector('.note').value).join('\\n');out.select()">Collect rejects</button>
<textarea id="out" placeholder="Rejected keys appear here: copy them into prompts/rejects.txt"></textarea><main>${cards}</main>`;
  fs.mkdirSync(P('review'), { recursive: true });
  fs.writeFileSync(P('review', `${name}.html`), html);
  console.log(`review/${name}.html: ${rows.length} images. Open it in the Codespace's browser preview (or download it with the www/img folder).`);
}

function report() {
  const tally = {}; let spent = 0;
  for (const r of requests) { const s = st(r.key); tally[s.status] = (tally[s.status] || 0) + 1; spent += s.spent || 0; }
  console.log(`${requests.length} images:`, Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`Spent so far ≈ $${spent.toFixed(2)}. Remaining at batch price ≈ $${cost(requests.filter(r => !['done', 'approved'].includes(st(r.key).status)), 'batch').toFixed(2)}.`);
  const off = requests.filter(r => st(r.key).ratioOff);
  if (off.length) console.log(`Wrong aspect ratio (${off.length}): ` + off.map(r => `${r.key} ${st(r.key).px} (wanted ${r.ratio})`).join(', '));
  const failed = requests.filter(r => st(r.key).status === 'failed');
  if (failed.length) console.log('Failed:\n' + failed.map(r => `  ${r.key}  ${st(r.key).error}`).join('\n'));
  save();
}

// ── Commands ────────────────────────────────────────────────────────────────────────────────────
const PILOT = ['001/p_moses', '001/loc_stage', '001/ev_spanner'];
switch (cmd) {
  case 'dry-run': {
    const rows = select();
    const skipped = requests.filter(r => r.case > 0 && r.reference).length;
    console.log(`${rows.length} images would be submitted (${rows.filter(r => r.size === '1K').length} at 1K, ${rows.filter(r => r.size === '2K').length} at 2K): batch ≈ $${cost(rows, 'batch').toFixed(2)}, interactive ≈ $${cost(rows, 'interactive').toFixed(2)}. ${skipped} images with a reference (recurring faces, scenes) are left for  continuity .`);
    break;
  }
  case 'pilot': {
    const scene = requests.find(r => r.case === 1 && r.kind === 'scene');
    const rows = [...PILOT.map(k => byKey.get(k)), scene].filter(Boolean);
    console.log(`Pilot: ${rows.length} images, one of each kind, ≈ $${cost(rows, 'interactive').toFixed(2)}.`);
    await interactive(rows); break;
  }
  case 'refs': {
    const rows = requests.filter(r => r.case === 0 && !['done', 'approved'].includes(st(r.key).status));
    console.log(`Recurring cast: ${rows.length} portraits, ≈ $${cost(rows, 'interactive').toFixed(2)}.`);
    await interactive(rows); break;
  }
  case 'batch': {
    // Everything selected whose reference (if any) already exists goes in; the rest waits and is listed.
    const rows = select({ withRefs: true });
    const ready = rows.filter(r => !r.reference || fs.existsSync(P('img-masters', r.reference.replace(/^img\//, ''))));
    const waiting = rows.filter(r => !ready.includes(r));
    if (waiting.length) console.log(`${waiting.length} wait for their reference image (generate those first, then run batch again): ${waiting.map(r => r.key).join(', ')}`);
    await submitBatch(ready, flag('--region') ? `region-${flag('--region')}` : flag('--case') ? `case-${flag('--case')}` : 'all');
    break;
  }
  case 'restore': {
    // Rebuild the game-size images from the masters, for anything generated whose www/ file is missing.
    let n = 0;
    for (const r of requests) {
      if (fs.existsSync(P('www', r.file))) continue;
      const master = P('img-masters', r.file.replace(/^img\//, ''));
      if (!fs.existsSync(master)) continue;
      await store(r, fs.readFileSync(master)); n++; console.log(`  restored www/${r.file}`);
    }
    console.log(`${n} images restored from img-masters/.`); break;
  }
  case 'status': await status(); break;
  case 'fetch': await fetchJobs(); break;
  case 'continuity': {
    const rows = requests.filter(r => r.reference && !['done', 'approved'].includes(st(r.key).status));
    const ready = rows.filter(r => fs.existsSync(P('img-masters', r.reference.replace(/^img\//, ''))));
    if (ready.length < rows.length) console.log(`${rows.length - ready.length} wait for their reference image: ` + rows.filter(r => !ready.includes(r)).map(r => r.key).join(', '));
    console.log(`Images with a reference (recurring faces, scenes): ${ready.length}, ≈ $${cost(ready, 'interactive').toFixed(2)}.`);
    await interactive(ready); break;
  }
  case 'redo': {
    let keys = rest.filter(x => !x.startsWith('--')); const notes = {};
    if (rest.includes('--rejects')) {
      const lines = fs.existsSync(P('prompts/rejects.txt')) ? fs.readFileSync(P('prompts/rejects.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
      for (const l of lines) { const [k, ...n] = l.split(/\s+/); keys.push(k); if (n.length) notes[k] = n.join(' '); }
    }
    const rows = keys.map(k => byKey.get(k) || (console.log(`  unknown key ${k}`), null)).filter(Boolean);
    console.log(`Regenerating ${rows.length}, ≈ $${cost(rows, 'interactive').toFixed(2)}.`);
    await interactive(rows, notes); break;
  }
  case 'review': review(); break;
  case 'report': report(); break;
  default: console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 20).join('\n'));
}
