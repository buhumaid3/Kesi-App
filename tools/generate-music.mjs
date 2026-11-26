// The score, generated with Google's Lyria through the Gemini API (polish P3, route A; docs/music-decision.md).
// Needs GEMINI_API_KEY in the environment (the same Codespaces secret as the images and voices). The key is never
// printed or written to disk. Claude never runs `generate`; the owner does.
//
//   node tools/generate-music.mjs prompts                  compile one prompt per track from docs/music-brief.md
//                                                         → prompts/music.json; prints the count and the cost
//   node tools/generate-music.mjs generate [--track 1] [--takes 3]   make takes for tracks without an approved take
//                                                         → music-takes/<track>/take-N.mp3 (git-ignored)
//   node tools/generate-music.mjs review                   review/music.html: listen to every take, approve one per
//                                                         track or reject with a note; "Collect choices" gives the text
//                                                         for prompts/music-choices.txt
//   node tools/generate-music.mjs redo --rejects           new takes for the rejected tracks, each with its note added
//   node tools/generate-music.mjs pick                     apply prompts/music-choices.txt: loop the approved takes and
//                                                         write www/audio/music/manifest.json
//   node tools/generate-music.mjs loopify [--track 1]      (re)make the game files from the approved takes
//   node tools/generate-music.mjs report                   what is generated, approved, looped, and the spend
//
// music-choices.txt, one line per track:   1 approve 2        (take 2 of region 1)
//                                          1 approve 2 start=4.5 end=118    (loop points by ear, seconds)
//                                          cabinet reject  "too busy, fewer drums"
//                                          sting approve 1 offset=1.2       (the launch sting: skip 1.2 s of lead-in)
// Every take is logged in docs/licences.md (model, date, prompt, take) by `pick`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };
const PROMPTS_F = P('prompts/music.json'), STATE_F = P('prompts/music-state.json'), CHOICES_F = P('prompts/music-choices.txt');
const MAN_F = P('www/audio/music/manifest.json'), TAKES = P('music-takes'), LIC_F = P('docs/licences.md');
// Prices reported from Google's pricing page (third-party summaries, Nov 2026): Lyria 3.5 full song $0.08 a request,
// Lyria 3 Clip $0.04 a 30-second clip. Check ai.google.dev pricing before the first run.
const MODELS = { song: process.env.KESI_MUSIC_MODEL || 'lyria-3.5', clip: process.env.KESI_CLIP_MODEL || 'lyria-3-clip-preview' };
const PRICE = { song: 0.08, clip: 0.04 };
// Mixing targets (music brief): background under text.
export const TARGET = { lufs: -20, truePeak: -3, kbps: 112, rate: 44100 };

// Per track: what plays it, tempo for bar-aligned loops, and the file name. Feel and instruments come from the brief.
const TRACKS = {
  cabinet: { file: 'cabinet.m4a', bpm: 76, kind: 'loop', model: 'song' },
  1: { file: 'region-01.m4a', bpm: 92, kind: 'loop', model: 'song', place: 'Nairobi city centre at night' },
  2: { file: 'region-02.m4a', bpm: 88, kind: 'loop', model: 'song', place: 'the dense estates of Eastlands, Nairobi' },
  3: { file: 'region-03.m4a', bpm: 72, kind: 'loop', model: 'song', place: 'Mombasa Old Town on the Kenyan coast' },
  4: { file: 'region-04.m4a', bpm: 70, kind: 'loop', model: 'song', place: 'the Rift Valley near Nakuru' },
  5: { file: 'region-05.m4a', bpm: 80, kind: 'loop', model: 'song', place: 'Kisumu on Lake Victoria' },
  6: { file: 'region-06.m4a', bpm: 66, kind: 'loop', model: 'song', place: 'the Maasai Mara at night' },
  7: { file: 'region-07.m4a', bpm: 74, kind: 'loop', model: 'song', place: 'the tea hills below Mt Kenya near Nyeri' },
  8: { file: 'region-08.m4a', bpm: 60, kind: 'loop', model: 'song', place: "Kenya's northern frontier near Lake Turkana" },
  9: { file: 'region-09.m4a', bpm: 84, kind: 'loop', model: 'song', place: "Nairobi's wealthy suburbs, Westlands and Karen" },
  10: { file: 'region-10.m4a', bpm: 76, kind: 'loop', model: 'song', place: 'a Nairobi registry and police station, the last files' },
  finale: { file: 'finale.m4a', bpm: 76, kind: 'once', model: 'song' },
  sting: { file: 'sting.m4a', bpm: 0, kind: 'sting', model: 'clip', seconds: 6.4 },
};

// ── The brief → prompts ───────────────────────────────────────────────────────────────────────────────
export function readBrief(md) {
  const rows = {};
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)\.m4a`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!m) continue;
    const id = m[1] === 'cabinet' ? 'cabinet' : m[1] === 'finale' ? 'finale' : m[1] === 'sting' ? 'sting' : String(+m[1].replace('region-', ''));
    rows[id] = { under: m[2].replace(/\s*\([^)]*\d[^)]*\)/g, '').trim(), feel: m[3].trim(), instruments: m[4].trim() };
  }
  return rows;
}
// No artist names, song titles or "in the style of" anywhere (Google's filter, and the safe practice): only
// instruments, tempo, mood and place. Genre names (benga, taarab) describe a tradition, not a person.
export function compilePrompt(id, row) {
  const t = TRACKS[id];
  const base = [
    'Instrumental only, no vocals, no lyrics, no spoken words.',
    'Background score for a quiet detective game played by reading case files at a desk at night.',
  ];
  if (t.kind === 'sting') return [...base,
    'A short opening sting of about seven seconds for the game\'s title.',
    'Seconds 0 to 3.5: near silence, soft rain-like texture and a low drone slowly swelling.',
    'At about 3.6 seconds: one deep, warm hit (low drum and a low piano chord together), then a three-second ringing tail that fades out.',
    `Feel: ${row.feel}. Instruments: ${row.instruments}.`,
    'No melody to speak of, no beat, nothing after the tail.'].join(' ');
  const len = t.kind === 'once' ? 'About two minutes, with a clear ending.' : 'About two minutes, one steady section from start to end, so the end can loop seamlessly back into the start.';
  return [...base,
    t.place ? `Place: ${t.place}.` : '',
    `It plays while the player works: ${row.under}.`,
    `Feel: ${row.feel}.`,
    `Instruments: ${row.instruments}.`,
    t.bpm ? `Tempo: ${t.bpm} BPM, in 4/4, steady.` : '',
    t.kind === 'once' ? 'It may build gently towards the end and resolve.' : 'Keep it even and understated: no build-ups, no drops, no sudden hits, no solos, no key changes, no fade-in or fade-out.',
    'Soft dynamics, mid and low register, leaving space in the mix; it must never compete with reading.',
    len].filter(Boolean).join(' ');
}

// ── Looping and levels (ffmpeg) ───────────────────────────────────────────────────────────────────────
const ff = (args, opts = {}) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8', ...opts }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').split('\n').slice(-4).join(' ')}`); return r; };
export function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return +r.stdout.trim();
}
export function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const j = (r.stderr || '').match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!j) throw new Error('could not measure loudness');
  const v = JSON.parse(j[0]);
  return { i: +v.input_i, tp: +v.input_tp, lra: +v.input_lra, thresh: +v.input_thresh };
}
// Loop points: start a bar or two in (skips any lead-in), end on a bar boundary at least 6 s before the file
// ends; the last `xf` seconds before the end are cross-faded into the start, so the seam is smooth even if the
// take's tempo drifts from the prompt's. Points set by ear in music-choices.txt win.
export function loopPoints(seconds, bpm, { start, end, xf } = {}) {
  const bar = bpm ? 240 / bpm : 2;
  const s = start ?? Math.min(2 * bar, seconds * 0.1);
  const usable = seconds - 6 - s;
  const e = end ?? s + Math.max(bar, Math.floor(usable / bar) * bar);
  return { start: +s.toFixed(3), end: +Math.min(e, seconds - 0.5).toFixed(3), xf: xf ?? Math.min(2 * bar, 4), bar };
}
// Make the game file from a take. loop: [start,end) with the tail cross-faded into the head; once: whole take,
// short fade-out; sting: from `offset`, `seconds` long, fade-out. Then two-pass loudness to the target, AAC.
export function render(src, dest, { kind = 'loop', bpm = 0, start, end, xf, offset = 0, seconds = 6.4 } = {}) {
  const tmp = dest + '.tmp.wav';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const dur = probeSeconds(src);
  let filter, info = {};
  if (kind === 'loop') {
    const L = loopPoints(dur, bpm, { start, end, xf }); info = L;
    const len = L.end - L.start;
    // body: [start+xf, end) ; head: [start, start+xf) fades in under tail [end, end+xf) fading out.
    filter = `[0:a]atrim=${L.start + L.xf}:${L.end},asetpts=PTS-STARTPTS[body];` +
      `[0:a]atrim=${L.start}:${L.start + L.xf},asetpts=PTS-STARTPTS,afade=t=in:d=${L.xf}:curve=qsin[head];` +
      `[0:a]atrim=${L.end}:${L.end + L.xf},asetpts=PTS-STARTPTS,afade=t=out:d=${L.xf}:curve=qsin[tail];` +
      `[head][tail]amix=inputs=2:normalize=0[seam];[body][seam]concat=n=2:v=0:a=1[out]`;
    info.length = +len.toFixed(3);
  } else if (kind === 'sting') {
    filter = `[0:a]atrim=${offset}:${offset + seconds},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, seconds - 1.5)}:d=1.5[out]`;
    info = { offset, length: seconds };
  } else {
    filter = `[0:a]afade=t=out:st=${Math.max(0, dur - 3)}:d=3[out]`;
    info = { length: dur };
  }
  ff(['-i', src, '-filter_complex', filter, '-map', '[out]', '-ar', String(TARGET.rate), '-ac', '2', tmp]);
  const m = measure(tmp);
  const norm = `loudnorm=I=${TARGET.lufs}:TP=${TARGET.truePeak}:LRA=11:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:linear=true`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // A loop must keep its exact length (no resampler padding), so the AAC encoder's priming is trimmed by the
  // player's buffer length; the game loops the decoded buffer, which Web Audio does sample-accurately.
  ff(['-i', tmp, '-af', `${norm},aresample=${TARGET.rate}`, '-c:a', 'aac', '-b:a', `${TARGET.kbps}k`, '-movflags', '+faststart', dest]);
  fs.rmSync(tmp, { force: true });
  const out = measure(dest);
  return { ...info, lufs: out.i, truePeak: out.tp, seconds: +probeSeconds(dest).toFixed(2), kb: Math.round(fs.statSync(dest).size / 1024) };
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────────
const [cmd, ...rest] = import.meta.url === `file://${process.argv[1]}` ? process.argv.slice(2) : [];
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] ?? true : undefined; };
let ai;
async function client() {
  if (ai) return ai;
  if (process.env.KESI_FAKE_CLIENT) return (ai = (await import(path.resolve(process.env.KESI_FAKE_CLIENT))).default); // tests only
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set. Add it as a Codespaces secret, then rebuild or restart the codespace.'); process.exit(1); }
  const { GoogleGenAI } = await import('@google/genai');
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  if (!ai.interactions) { console.error('This @google/genai is too old for Lyria. Run: npm install @google/genai@latest'); process.exit(1); }
  return ai;
}
const tracksArg = () => { const t = flag('--track'); return t ? String(t).split(',') : Object.keys(TRACKS); };
const state = readJSON(STATE_F, { spent: 0, tracks: {} });
const saveState = () => writeJSON(STATE_F, state);
const tState = id => (state.tracks[id] ||= { takes: [], approved: null, rejects: [] });

function cmdPrompts() {
  const brief = readBrief(fs.readFileSync(P('docs/music-brief.md'), 'utf8'));
  const out = {};
  for (const id of Object.keys(TRACKS)) {
    if (!brief[id]) { console.error(`docs/music-brief.md has no row for ${TRACKS[id].file}`); process.exit(1); }
    const prompt = compilePrompt(id, brief[id]);
    if (/\bin the style of\b|\bby [A-Z][a-z]+ [A-Z]/.test(prompt)) { console.error(`${id}: the prompt names an artist; describe instruments and mood instead`); process.exit(1); }
    out[id] = { model: MODELS[TRACKS[id].model], prompt, file: TRACKS[id].file, kind: TRACKS[id].kind, bpm: TRACKS[id].bpm };
  }
  writeJSON(PROMPTS_F, out);
  const takes = +(flag('--takes') || 3), cost = Object.values(TRACKS).reduce((s, t) => s + PRICE[t.model] * takes, 0);
  console.log(`${Object.keys(out).length} prompts → prompts/music.json. ${takes} takes each ≈ $${cost.toFixed(2)} (at $${PRICE.song} a song, $${PRICE.clip} a clip; check the pricing page).`);
}

async function makeTake(id, note) {
  const p = readJSON(PROMPTS_F)?.[id];
  if (!p) { console.error('Run `prompts` first.'); process.exit(1); }
  const g = await client();
  const input = note ? `${p.prompt} Correction from review: ${note}.` : p.prompt;
  const res = await g.interactions.create({ model: p.model, input });
  const a = res.output_audio;
  if (!a?.data) throw new Error(`no audio returned${res.output_text ? `: ${String(res.output_text).slice(0, 120)}` : ''}`);
  const ts = tState(id), n = ts.takes.length + 1;
  const f = path.join(TAKES, id, `take-${n}.mp3`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(a.data, 'base64'));
  ts.takes.push({ n, file: path.relative(ROOT, f), model: p.model, at: new Date().toISOString(), prompt: input, seconds: +probeSeconds(f).toFixed(1) });
  state.spent = +(state.spent + PRICE[TRACKS[id].model]).toFixed(2);
  saveState();
  return ts.takes.at(-1);
}
async function cmdGenerate() {
  const takes = +(flag('--takes') || 3);
  for (const id of tracksArg()) {
    const ts = tState(id);
    if (ts.approved) continue;
    for (let i = ts.takes.length; i < takes; i++) {
      try { const t = await makeTake(id); console.log(`${id} take ${t.n}: ${t.seconds} s`); }
      catch (e) { console.error(`${id}: ${e.message}`); if (/quota|429|RESOURCE_EXHAUSTED/i.test(e.message)) return; break; }
    }
  }
  console.log(`Spent so far ≈ $${state.spent.toFixed(2)}. Next: node tools/generate-music.mjs review`);
}
function cmdReview() {
  const prompts = readJSON(PROMPTS_F, {});
  const rows = Object.keys(TRACKS).map(id => {
    const ts = tState(id);
    return `<section><h2>${id === 'cabinet' || id === 'finale' || id === 'sting' ? id : `Region ${id}`} <small>${TRACKS[id].file}${ts.approved ? ` · approved take ${ts.approved.take}` : ''}</small></h2>
      <p class="pr">${(prompts[id]?.prompt || '').replace(/</g, '&lt;')}</p>
      ${ts.takes.map(t => `<div class="take"><label><input type="radio" name="t-${id}" value="${t.n}"> Take ${t.n} · ${t.seconds} s</label><audio controls preload="none" src="../${t.file}"></audio>
        <button type="button" data-loop="${id}:${t.n}">Hear the loop seam</button></div>`).join('') || '<p>No takes yet.</p>'}
      <label><input type="radio" name="t-${id}" value="reject"> Reject all, note: <input type="text" data-note="${id}" size="50"></label>
      <label>Loop start <input type="number" step="0.1" data-start="${id}" style="width:5em"> end <input type="number" step="0.1" data-end="${id}" style="width:5em"> (s, optional)</label></section>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>Kesi music review</title>
<style>body{font:15px system-ui;margin:24px;max-width:900px;background:#1a1410;color:#eee}section{border-top:1px solid #444;padding:12px 0}h2{margin:0 0 6px}small{color:#aaa;font-weight:400}.pr{color:#bbb;font-size:13px}.take{display:flex;gap:10px;align-items:center;margin:6px 0;flex-wrap:wrap}audio{height:32px}textarea{width:100%;height:160px}</style>
<h1>Kesi music review</h1><p>Pick one take per track, or reject with a note. For loops, press "Hear the loop seam" to play the last 6 s into the first 6 s. Then Collect choices and paste into prompts/music-choices.txt, and run <code>node tools/generate-music.mjs pick</code> (approved) or <code>redo --rejects</code> (rejected).</p>
${rows}<p><button id="collect">Collect choices</button></p><textarea id="out"></textarea>
<script>
const ac = new AudioContext();
document.querySelectorAll('[data-loop]').forEach(b => b.onclick = async () => {
  const [id, n] = b.dataset.loop.split(':'); const a = b.parentElement.querySelector('audio');
  const buf = await ac.decodeAudioData(await (await fetch(a.src)).arrayBuffer());
  const st = +document.querySelector('[data-start="' + id + '"]').value || 0, en = +document.querySelector('[data-end="' + id + '"]').value || buf.duration - 6;
  const s1 = ac.createBufferSource(); s1.buffer = buf; s1.connect(ac.destination); s1.start(0, Math.max(0, en - 6), 6);
  const s2 = ac.createBufferSource(); s2.buffer = buf; s2.connect(ac.destination); s2.start(ac.currentTime + 6, st, 6);
});
document.getElementById('collect').onclick = () => {
  const out = [];
  document.querySelectorAll('section').forEach(s => {
    const r = s.querySelector('input[type=radio]:checked'); if (!r) return;
    const id = r.name.slice(2), st = s.querySelector('[data-start]').value, en = s.querySelector('[data-end]').value;
    if (r.value === 'reject') out.push(id + ' reject "' + (s.querySelector('[data-note]').value || '').replace(/"/g, "'") + '"');
    else out.push(id + ' approve ' + r.value + (st ? ' start=' + st : '') + (en ? ' end=' + en : ''));
  });
  document.getElementById('out').value = out.join('\\n');
};
</script>`;
  fs.mkdirSync(P('review'), { recursive: true });
  fs.writeFileSync(P('review/music.html'), html);
  console.log('Wrote review/music.html (open it from the repo root so the takes load).');
}
export function parseChoices(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\S+)\s+(approve|reject)\s*(.*)$/); if (!m) throw new Error(`can't read: ${line}`);
    const [, id, act, tail] = m;
    if (!TRACKS[id]) throw new Error(`unknown track ${id}`);
    if (act === 'reject') { out.push({ id, act, note: (tail.match(/"([^"]*)"/) || [, tail])[1].trim() }); continue; }
    const take = +tail.split(/\s+/)[0]; if (!take) throw new Error(`${id}: which take?`);
    const opt = {}; for (const kv of tail.matchAll(/(start|end|offset|xf)=([\d.]+)/g)) opt[kv[1]] = +kv[2];
    out.push({ id, act, take, ...opt });
  }
  return out;
}
function logLicence(id, take, result) {
  const head = '## Music (Lyria, route A)\n\n| Track | File | Model | Generated | Take | Prompt |\n|---|---|---|---|---|---|\n';
  let s = fs.existsSync(LIC_F) ? fs.readFileSync(LIC_F, 'utf8') : '# Licences and provenance\n\n';
  if (!s.includes('## Music (Lyria, route A)')) s += `\n${head}`;
  const row = `| ${id} | ${TRACKS[id].file} | ${take.model} | ${take.at.slice(0, 10)} | ${take.n} | ${take.prompt.replace(/\|/g, '/')} |`;
  const re = new RegExp(`^\\| ${id} \\|.*$`, 'm');
  s = re.test(s) ? s.replace(re, row) : s.replace(head, head + row + '\n');
  fs.writeFileSync(LIC_F, s);
}
function loopifyOne(id) {
  const ts = tState(id), ap = ts.approved; if (!ap) return null;
  const take = ts.takes.find(t => t.n === ap.take); if (!take) throw new Error(`${id}: take ${ap.take} missing`);
  const t = TRACKS[id];
  const r = render(P(take.file), P('www/audio/music', t.file), { kind: t.kind, bpm: t.bpm, seconds: t.seconds, ...ap });
  ap.result = r; saveState();
  const man = readJSON(MAN_F, {}); man[id] = t.file;
  // The game reads the exact loop length (see audio.js) and which tracks play once.
  man._loops = { ...(man._loops || {}) }; if (t.kind === 'loop') man._loops[id] = r.length; else delete man._loops[id];
  man._once = [...new Set([...(man._once || []).filter(x => x !== id), ...(t.kind === 'once' ? [id] : [])])];
  writeJSON(MAN_F, man);
  logLicence(id, take, r);
  return r;
}
function cmdPick() {
  if (!fs.existsSync(CHOICES_F)) { console.error('prompts/music-choices.txt is missing (paste from the review page).'); process.exit(1); }
  for (const c of parseChoices(fs.readFileSync(CHOICES_F, 'utf8'))) {
    const ts = tState(c.id);
    if (c.act === 'reject') { ts.rejects.push({ note: c.note, at: new Date().toISOString() }); continue; }
    const { id, act, ...ap } = c; ts.approved = ap; saveState();
    const r = loopifyOne(id);
    console.log(`${id}: take ${c.take} → www/audio/music/${TRACKS[id].file} · ${r.seconds} s · ${r.lufs} LUFS · peak ${r.truePeak} dBTP · ${r.kb} KB`);
  }
  saveState();
}
async function cmdRedo() {
  if (!flag('--rejects')) { console.error('Use: redo --rejects'); process.exit(1); }
  const choices = parseChoices(fs.existsSync(CHOICES_F) ? fs.readFileSync(CHOICES_F, 'utf8') : '').filter(c => c.act === 'reject');
  for (const c of choices) {
    for (let i = 0; i < +(flag('--takes') || 2); i++) { try { const t = await makeTake(c.id, c.note); console.log(`${c.id} take ${t.n} (with the note)`); } catch (e) { console.error(`${c.id}: ${e.message}`); break; } }
  }
  console.log('Clear the reject lines from music-choices.txt, then review again.');
}
function cmdReport() {
  let mb = 0;
  for (const id of Object.keys(TRACKS)) {
    const ts = tState(id), r = ts.approved?.result;
    if (r) mb += r.kb / 1024;
    console.log(`${id.padEnd(8)} ${ts.takes.length} takes · ${ts.approved ? `take ${ts.approved.take}` : 'not approved'}${r ? ` · ${r.seconds} s, ${r.lufs} LUFS, ${r.truePeak} dBTP, ${r.kb} KB` : ''}`);
  }
  console.log(`Spent ≈ $${state.spent.toFixed(2)} · music in the app ${mb.toFixed(1)} MB`);
}

if (cmd) {
  const run = { prompts: cmdPrompts, generate: cmdGenerate, review: cmdReview, redo: cmdRedo, pick: cmdPick, report: cmdReport,
    loopify: () => { for (const id of tracksArg()) { const r = loopifyOne(id); if (r) console.log(`${id}: ${r.seconds} s · ${r.lufs} LUFS · ${r.truePeak} dBTP`); } } }[cmd];
  if (!run) { console.error(`Unknown command ${cmd}. See the top of this file.`); process.exit(1); }
  await run();
}
