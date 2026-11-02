// Voices for Mwalimu and Halima (stage 1 voice pilot), generated with Gemini text-to-speech.
// Needs GEMINI_API_KEY in the environment (the same Codespaces secret as the images). The key is never
// printed or written to disk. Amani is never voiced (design doc §4.2).
//
//   node tools/generate-voices.mjs cast                    cast every speaking character from the voice company (no cost)
//   node tools/generate-voices.mjs design --cast [--region N]   design the company voices that region needs (1 each)
//   node tools/generate-voices.mjs catalog                 list library voices tagged Kenyan (region KE), if any
//   node tools/generate-voices.mjs design                  design 3 candidate voices each for Mwalimu and Halima from a
//                                                          written description; saves a sample of each to review/voices/
//   node tools/generate-voices.mjs pick mwalimu 2          choose candidate 2 (or a library voice id, or a prebuilt name)
//   node tools/generate-voices.mjs say mwalimu "text"      one test line with the chosen voice → review/voices/say-….wav
//   node tools/generate-voices.mjs lines [--region 1]      compile every line to voice and print the count and cost
//   node tools/generate-voices.mjs generate [--speaker mwalimu] [--region 1]   record every line not yet recorded
//   node tools/generate-voices.mjs review                  review/voices.html: listen to every line, tick rejects
//   node tools/generate-voices.mjs redo --rejects          re-record the lines in prompts/voice-rejects.txt
//   node tools/generate-voices.mjs report                  counts and spend
//
// Output: www/audio/voice/<speaker>/<key>.m4a (AAC, mono; WAV if ffmpeg is missing) and www/audio/voice/manifest.json,
// which the game reads. The key comes from www/engine/voicekey.js, so an edited line gets a new recording, never a stale one.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { voiceKey } from '../www/engine/voicekey.js';
import { buildCast, characterLines, loadCases } from './voice-cast.mjs';
import { GENERIC_REPLIES } from '../www/engine/state.js';

const MODEL = process.env.KESI_TTS_MODEL || 'gemini-3.8-flash-tts';
// Google's pricing page, read 2 November 2026: $0.50 / 1M text tokens and $9.00 / 1M audio tokens through 2026,
// doubling on 1 January 2027; audio is 25 tokens a second. Voice design was not priced on that page.
const PRICE = { textPerM: 0.5, audioPerM: 9.0, audioPerM2027: 18.0, audioTokPerSec: 25 };
const CHARS_PER_SEC = 13.75;                       // about 150 words a minute
const ROOT = process.cwd();
const P = (...a) => path.join(ROOT, ...a);
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };
const CAST_F = P('prompts/voices.json'), STATE_F = P('prompts/voice-state.json'), MAN_F = P('www/audio/voice/manifest.json');

// Who speaks, how they sound, and the delivery note sent with every line. The design descriptions are
// for a Kenyan listener (and the cultural reader) to judge; nothing here names a community.
const SPEAKERS = {
  mwalimu: {
    name: 'Ch. Insp. Esther Wairimu ("Mwalimu")',
    style: 'dry and measured, warm underneath, unhurried; a senior police officer talking to a junior colleague on the phone, late at night',
    designs: [
      'A Kenyan woman in her late fifties, a senior police inspector in Nairobi. Natural Kenyan English accent. Low-medium pitch, slightly husky, dry and measured, with warmth underneath. Speaks in short sentences with small pauses.',
      'A Kenyan woman in her late fifties who trains young detectives in Nairobi. Natural Kenyan English accent. Medium pitch, a brisk teacher\'s cadence, crisp consonants, quietly amused.',
      'A Kenyan woman nearing sixty, a veteran police officer from Nairobi. Natural Kenyan English accent. Low pitch, slower, a little gravelly, calm and certain, the faint smile of someone who has seen everything.',
    ],
  },
  halima: {
    name: 'Prosecutor Halima Abdi',
    style: 'precise and formal, sceptical, brief; a state prosecutor reviewing a charge sheet, fair but unimpressed',
    designs: [
      'A Kenyan woman in her early forties, a state prosecutor in Nairobi. Natural Kenyan English accent of an educated Nairobi professional. Clear mid pitch, precise, formal and sceptical, never raises her voice.',
      'A Kenyan woman in her early forties, a senior prosecutor in Nairobi. Natural Kenyan English accent. Lower and cooler, very controlled, every word placed carefully.',
      'A Kenyan woman in her early forties, a sharp Nairobi prosecutor. Natural Kenyan English accent. Slightly faster, crisp, with dry humour under the formality.',
    ],
  },
};

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] ?? true : undefined; };
const cast = readJSON(CAST_F, { model: MODEL, speakers: {} });
const state = readJSON(STATE_F, { spent: 0, lines: {} });
const manifest = readJSON(MAN_F, {});
const save = () => { writeJSON(CAST_F, cast); writeJSON(STATE_F, state); writeJSON(MAN_F, manifest); };

let ai;
async function client() {
  if (ai) return ai;
  if (process.env.KESI_FAKE_CLIENT) return (ai = (await import(path.resolve(process.env.KESI_FAKE_CLIENT))).default); // tests only
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY is not set. Add it as a Codespaces secret, then rebuild or restart the codespace.'); process.exit(1); }
  const { GoogleGenAI } = await import('@google/genai');
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  if (!ai.interactions || !ai.voices) { console.error('This @google/genai is too old for text-to-speech voices. Run: npm install @google/genai@latest'); process.exit(1); }
  return ai;
}

// ── The lines: everything Mwalimu and Halima say in the cases chosen ───────────────────────────────────
function compileLines(region) {
  const camp = readJSON(P('www/cases/_campaign.json'));
  const coach = readJSON(P('www/cases/_coach.json'), { beats: {}, core: {} });
  const reg = camp.regions.find(r => r.number === region);
  const [a, b] = reg.cases;
  const out = [];
  const add = (speaker, text, where) => { if (!text) return; const t = String(text).trim(); const key = voiceKey(speaker, t); if (!out.some(x => x.key === key)) out.push({ key, speaker, text: t, where }); };
  if (region === 1) {
    for (const bt of camp.prologue.beats) if (bt.voice?.speaker === 'rc_mwalimu') add('mwalimu', bt.voice.line, `prologue ${bt.id}`);
    for (const [beat, d] of Object.entries(coach.beats || {})) add('mwalimu', d.line, `tip ${beat}`);
    for (const [t, line] of Object.entries(coach.core || {})) add('mwalimu', line, `tip ${t}`);
    add('mwalimu', coach.hintOffer, 'hint offer');
  }
  const castMap = readJSON(P('www/audio/voice/cast.json'), {});
  const slotsUsed = new Set();
  if (!flag('--leads')) for (const c of loadCases(ROOT).filter(c => c.meta.number >= a && c.meta.number <= b)) {
    for (const l of characterLines(c)) { add(l.speaker, l.text, l.where); if (castMap[l.speaker]) slotsUsed.add(castMap[l.speaker]); }
  }
  // "I don't know" answers are said by the voice, not the character, so each company voice records them once.
  for (const slot of slotsUsed) for (const g of GENERIC_REPLIES) add(slot, g, `${slot} generic`);
  for (let n = a; n <= b; n++) {
    const f = P('www/cases', `case-${String(n).padStart(3, '0')}.json`);
    if (!fs.existsSync(f)) continue;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const t of c.tutorial || []) add('mwalimu', t.line, `case ${n} tutorial ${t.trigger}`);
    for (const [g, h] of Object.entries(c.hints || {})) { add('mwalimu', h.tier1?.line, `case ${n} ${g} hint 1`); add('mwalimu', h.tier2?.line, `case ${n} ${g} hint 2`); }
    const bc = camp.betweenCases[String(n)]; if (bc?.mwalimu) add('mwalimu', bc.mwalimu, `after case ${n}`);
    for (const g of c.chargeSheet.groups) {
      add('halima', g.prosecutor?.pass, `case ${n} ${g.id} accepted`);
      for (const [i, l] of [].concat(g.prosecutor?.fail || []).entries()) add('halima', l, `case ${n} ${g.id} returned ${i + 1}`);
    }
  }
  return out;
}
const estimate = (lines) => {
  const chars = lines.reduce((s, l) => s + l.text.length, 0);
  const secs = chars / CHARS_PER_SEC;
  const audioTok = secs * PRICE.audioTokPerSec, textTok = chars / 4 + lines.length * 40;
  return { chars, minutes: secs / 60, usd: (audioTok * PRICE.audioPerM + textTok * PRICE.textPerM) / 1e6, usd2027: (audioTok * PRICE.audioPerM2027 + textTok * PRICE.textPerM * 2) / 1e6 };
};

// ── Synthesis ──────────────────────────────────────────────────────────────────────────────────────────
function audioFrom(resp) {
  const cands = [resp?.output_audio, ...(resp?.outputs || []), ...(resp?.output || [])];
  for (const c of cands) {
    if (!c) continue;
    if (c.data && /audio|wav|l16/.test(c.mime_type || c.mimeType || 'audio')) return { data: c.data, mime: c.mime_type || c.mimeType || 'audio/wav' };
    if (c.audio?.data) return { data: c.audio.data, mime: c.audio.mime_type || 'audio/wav' };
  }
  return null;
}
// Raw 24 kHz mono 16-bit PCM gets a WAV header; a WAV is kept as it is.
function toWav(buf, mime) {
  if (buf.slice(0, 4).toString() === 'RIFF') return buf;
  const rate = +((mime.match(/rate=(\d+)/) || [])[1] || 24000);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
const wavSeconds = (wav) => Math.max(0, (wav.length - 44) / (wav.readUInt32LE(28) || 48000));
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const castFile = () => readJSON(P('prompts/voice-cast.json'), null);
function voiceOf(speaker) {
  const cf = castFile();
  const slot = cf?.assign?.[speaker] || speaker;
  return { slot, voice: cast.speakers[slot]?.voice || cast.speakers[speaker]?.voice, person: cf?.people?.[speaker] };
}
function styleOf(speaker, person) {
  if (SPEAKERS[speaker]) return SPEAKERS[speaker].style;
  if (person) {
    const mood = { guarded: 'wary, giving as little as possible', lawyered: 'clipped and careful, a lawyer beside them', cooperative: 'natural and conversational' }[person.stance] || 'natural and conversational';
    return `${person.occupation}, about ${person.age}, talking to a police detective; ${mood}; everyday Kenyan speech, not theatrical`;
  }
  return 'natural and conversational, talking to a police detective; everyday Kenyan speech, not theatrical';
}
async function synth(speaker, text, note) {
  const { voice, slot, person } = voiceOf(speaker);
  if (!voice) throw new Error(`no voice for ${speaker} (${slot}): run  cast  and  design --cast, or  design  then  pick ${speaker} N`);
  const g = await client();
  const style = styleOf(speaker, person) + (note ? `; correction from review: ${note}` : '');
  const resp = await g.interactions.create({
    model: cast.model || MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  });
  const a = audioFrom(resp);
  if (!a) throw new Error('no audio in the response');
  return toWav(Buffer.from(a.data, 'base64'), a.mime);
}

async function record(lines, notes = {}) {
  const ff = hasFfmpeg();
  if (!ff) console.log('ffmpeg not found: saving WAV (large). Install it for small AAC files:  sudo apt-get update && sudo apt-get install -y ffmpeg');
  let ok = 0, failed = 0;
  for (const l of lines) {
    try {
      const wav = await synth(l.speaker, l.text, notes[l.key]);
      const base = P('www/audio/voice', l.key);
      fs.mkdirSync(path.dirname(base), { recursive: true });
      let file = `${l.key}.wav`;
      if (ff) {
        const tmp = base + '.tmp.wav'; fs.writeFileSync(tmp, wav);
        const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-c:a', 'aac', '-b:a', '56k', base + '.m4a']);
        fs.unlinkSync(tmp);
        if (r.status === 0) { file = `${l.key}.m4a`; if (fs.existsSync(base + '.wav')) fs.unlinkSync(base + '.wav'); }
        else fs.writeFileSync(base + '.wav', wav);
      } else fs.writeFileSync(base + '.wav', wav);
      const secs = wavSeconds(wav);
      const usd = (secs * PRICE.audioTokPerSec * PRICE.audioPerM + (l.text.length / 4 + 40) * PRICE.textPerM) / 1e6;
      manifest[l.key] = file;
      state.lines[l.key] = { status: 'done', speaker: l.speaker, text: l.text, where: l.where, secs: +secs.toFixed(1), file, at: new Date().toISOString() };
      state.spent = +(state.spent + usd).toFixed(4);
      ok++;
      console.log(`  ✓ ${l.key}  ${secs.toFixed(1)} s  ${l.where}`);
    } catch (e) {
      failed++;
      state.lines[l.key] = { ...(state.lines[l.key] || {}), status: 'failed', speaker: l.speaker, text: l.text, where: l.where, error: String(e.message || e).slice(0, 200) };
      console.log(`  ✗ ${l.key}  ${e.message || e}`);
      if (/RESOURCE_EXHAUSTED|429/.test(String(e.message))) await new Promise(r => setTimeout(r, 8000));
    }
    save();
  }
  console.log(`${ok} recorded, ${failed} failed. Spent so far ≈ $${state.spent.toFixed(2)}.`);
}

// ── Commands ───────────────────────────────────────────────────────────────────────────────────────────
switch (cmd) {
  case 'catalog': {
    const g = await client();
    const res = await g.voices.list({ region_code: [flag('--region') || 'KE'], page_size: 100 });
    const vs = res.voices || [];
    if (!vs.length) console.log('No library voices are tagged with that region. Use  design  instead.');
    for (const v of vs) console.log(`${v.id || v.display_name} | ${v.display_name} | ${v.language_code || ''} ${v.accent || ''} ${v.gender || ''} | ${v.description || ''}`);
    break;
  }
  case 'cast': {
    const r = buildCast(ROOT);
    writeJSON(P('prompts/voice-cast.json'), { slots: r.slots, assign: r.assign, people: r.people });
    writeJSON(P('www/audio/voice/cast.json'), r.assign);
    const pool = Object.keys(r.slots).filter(s => s.startsWith('pool-')).length, fixed = Object.keys(r.slots).length - pool;
    console.log(`${Object.keys(r.assign).length} speaking characters cast from ${pool} company voices and ${fixed} fixed voices for recurring people.`);
    console.log('No two people in one case share a voice. Written to prompts/voice-cast.json and www/audio/voice/cast.json.');
    break;
  }
  case 'design': {
    const g = await client();
    if (rest.includes('--cast')) {
      const cf = castFile(); if (!cf) { console.error('Run  node tools/generate-voices.mjs cast  first.'); process.exit(1); }
      const region = flag('--region');
      const wanted = new Set(Object.entries(cf.assign).filter(([k]) => !region || Math.ceil(+k.slice(1, 4) / 10) === +region).map(([, s]) => s));
      const todo = [...wanted].filter(s => !cast.speakers[s]?.voice).sort();
      console.log(`Designing ${todo.length} voices${region ? ` for region ${region}` : ''}.`);
      fs.mkdirSync(P('review/voices'), { recursive: true });
      for (const slot of todo) {
        const d = cf.slots[slot];
        try {
          const v = await g.voices.create({ store: true, voice: { type: 'prompted', display_name: `kesi-${slot}`.slice(0, 60), language_code: 'en-KE', region_code: 'KE', gender: d.gender === 'f' ? 'female' : 'male', prompted: { input: d.description } } });
          cast.speakers[slot] = { voice: v.id, candidates: [{ n: 1, id: v.id, description: d.description }] };
          if (v.sample_audio?.data) fs.writeFileSync(P('review/voices', `${slot}.wav`), toWav(Buffer.from(v.sample_audio.data, 'base64'), v.sample_audio.mime_type || 'audio/wav'));
          console.log(`  ✓ ${slot}  ${v.id}`);
        } catch (e) { console.log(`  ✗ ${slot}  ${e.message || e}`); }
        save();
      }
      console.log('Samples are in review/voices/. To replace one you don\'t like:  node tools/generate-voices.mjs redesign SLOT "new description"');
      break;
    }
    fs.mkdirSync(P('review/voices'), { recursive: true });
    for (const [id, sp] of Object.entries(SPEAKERS)) {
      const entry = cast.speakers[id] ||= { voice: null, candidates: [] };
      if (entry.candidates.length && !rest.includes('--again')) { console.log(`${id}: candidates already designed (add --again to make new ones)`); continue; }
      entry.candidates = [];
      for (const [i, d] of sp.designs.entries()) {
        const v = await g.voices.create({ store: true, voice: { type: 'prompted', display_name: `kesi-${id}-${i + 1}`, language_code: 'en-KE', region_code: 'KE', prompted: { input: d } } });
        entry.candidates.push({ n: i + 1, id: v.id, description: d });
        if (v.sample_audio?.data) fs.writeFileSync(P('review/voices', `${id}-${i + 1}.wav`), toWav(Buffer.from(v.sample_audio.data, 'base64'), v.sample_audio.mime_type || 'audio/wav'));
        console.log(`${id} ${i + 1}: ${v.id}  → review/voices/${id}-${i + 1}.wav`);
        save();
      }
    }
    console.log('Listen to the samples: start  npm run play  and open /review/voices/mwalimu-1.wav (and the others) on the forwarded port, then:  node tools/generate-voices.mjs pick mwalimu N  and  pick halima N');
    break;
  }
  case 'redesign': {
    const [slot, ...words] = rest; const cf = castFile();
    const g = await client();
    const desc = words.join(' ') || cf?.slots?.[slot]?.description;
    if (!desc) { console.error('usage: redesign SLOT "description"'); process.exit(1); }
    const v = await g.voices.create({ store: true, voice: { type: 'prompted', display_name: `kesi-${slot}`.slice(0, 60), language_code: 'en-KE', region_code: 'KE', prompted: { input: desc } } });
    cast.speakers[slot] = { voice: v.id, candidates: [{ n: 1, id: v.id, description: desc }] };
    if (v.sample_audio?.data) { fs.mkdirSync(P('review/voices'), { recursive: true }); fs.writeFileSync(P('review/voices', `${slot}.wav`), toWav(Buffer.from(v.sample_audio.data, 'base64'), v.sample_audio.mime_type || 'audio/wav')); }
    // Lines already recorded with the old voice are re-recorded on the next  generate --redo-slot SLOT .
    save(); console.log(`${slot} → ${v.id}. Re-record its lines:  node tools/generate-voices.mjs generate --region N --redo-slot ${slot}`);
    break;
  }
  case 'pick': {
    const [who, which] = rest;
    if (!SPEAKERS[who] || !which) { console.error('usage: pick mwalimu 2   (or a voice id, or a prebuilt name such as Kore)'); process.exit(1); }
    const entry = cast.speakers[who] ||= { voice: null, candidates: [] };
    const c = /^\d+$/.test(which) ? entry.candidates.find(x => x.n === +which) : null;
    entry.voice = c ? c.id : which;
    save();
    console.log(`${who} → ${entry.voice}. Test it:  node tools/generate-voices.mjs say ${who} "Detective. Ngara."`);
    break;
  }
  case 'say': {
    const [who, ...words] = rest;
    const wav = await synth(who, words.join(' '));
    fs.mkdirSync(P('review/voices'), { recursive: true });
    const f = P('review/voices', `say-${who}-${Date.now()}.wav`); fs.writeFileSync(f, wav);
    console.log(`${(wavSeconds(wav)).toFixed(1)} s → ${path.relative(ROOT, f)}`);
    break;
  }
  case 'lines': {
    const region = +(flag('--region') || 1);
    const lines = compileLines(region);
    writeJSON(P('prompts/voice-lines.json'), lines);
    const groups = { mwalimu: l => l.speaker === 'mwalimu', halima: l => l.speaker === 'halima', characters: l => l.speaker.startsWith('c'), 'company "don\'t know" lines': l => /^(pool|rc)-/.test(l.speaker) };
    for (const [name, fn] of Object.entries(groups)) {
      const ls = lines.filter(fn); if (!ls.length) continue;
      const e = estimate(ls), done = ls.filter(l => manifest[l.key]).length;
      console.log(`${name}: ${ls.length} lines (${done} recorded), ${e.chars} characters, about ${e.minutes.toFixed(1)} minutes, ≈ $${e.usd.toFixed(2)} (≈ $${e.usd2027.toFixed(2)} at 2027 prices)`);
    }
    const all = estimate(lines); console.log(`Total: ${lines.length} lines, about ${all.minutes.toFixed(0)} minutes, ≈ $${all.usd.toFixed(2)}.`);
    console.log('Written to prompts/voice-lines.json.');
    break;
  }
  case 'generate': {
    const region = +(flag('--region') || 1), who = flag('--speaker');
    const redoSlot = flag('--redo-slot'); const cf = castFile();
    const slotOf = sp => cf?.assign?.[sp] || sp;
    const lines = compileLines(region).filter(l => (!who || l.speaker === who || slotOf(l.speaker) === who) && (!manifest[l.key] || (redoSlot && slotOf(l.speaker) === redoSlot)));
    // Lines whose voice hasn't been chosen yet are skipped with one message, not one error per line.
    const missing = new Map();
    const ready = lines.filter(l => { const v = voiceOf(l.speaker); if (v.voice) return true; missing.set(v.slot, (missing.get(v.slot) || 0) + 1); return false; });
    for (const [slot, n] of missing) console.log(`Skipping ${n} lines for ${slot}: no voice yet (${SPEAKERS[slot] ? `pick ${slot} N` : 'design --cast'}).`);
    const e = estimate(ready);
    console.log(`Recording ${ready.length} lines, about ${e.minutes.toFixed(1)} minutes of speech, ≈ $${e.usd.toFixed(2)}.`);
    await record(ready);
    break;
  }
  case 'redo': {
    const notes = {}; let keys = rest.filter(x => !x.startsWith('--'));
    if (rest.includes('--rejects')) {
      const f = P('prompts/voice-rejects.txt');
      for (const l of (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : []).map(x => x.trim()).filter(x => x && !x.startsWith('#'))) {
        const [k, ...n] = l.split(/\s+/); keys.push(k); if (n.length) notes[k] = n.join(' ');
      }
    }
    const lines = keys.map(k => state.lines[k] ? { key: k, ...state.lines[k] } : (console.log(`  unknown line ${k}`), null)).filter(Boolean);
    await record(lines, notes);
    break;
  }
  case 'review': {
    const rows = Object.entries(state.lines).filter(([, l]) => l.status === 'done');
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice Review</title>
<style>body{font:15px/1.45 system-ui;margin:0 16px 80px;background:#f3ebda;color:#23222b}h1{font-size:20px}.row{background:#fff;margin:10px 0;padding:10px 12px;border-radius:4px}.row small{color:#555;display:block}audio{width:100%;margin-top:6px}textarea{width:100%;height:120px}button{font:inherit;padding:8px 12px}input[type=text]{width:100%}</style>
<h1>Voice review: ${rows.length} lines</h1><p>Listen to each line. Reject anything mispronounced (names, Swahili and Sheng words), with the wrong tone, or that doesn't sound like a Kenyan speaker; add a short note. Then Collect rejects, paste into prompts/voice-rejects.txt and run <code>node tools/generate-voices.mjs redo --rejects</code>.</p>
${rows.map(([k, l]) => `<div class="row" data-key="${k}"><b>${esc(l.speaker)}</b> · ${esc(l.where)}<small>${esc(l.text)}</small><audio controls preload="none" src="/audio/voice/${esc(l.file)}"></audio><label><input type="checkbox"> reject</label> <input type="text" placeholder="what's wrong (e.g. say 'Ngara' as NGAH-rah)"></div>`).join('\n')}
<p><button onclick="o.value=[...document.querySelectorAll('.row')].filter(r=>r.querySelector('input[type=checkbox]').checked).map(r=>r.dataset.key+'  '+r.querySelector('input[type=text]').value).join('\\n');o.select()">Collect rejects</button></p><textarea id="o"></textarea>`;
    fs.mkdirSync(P('review'), { recursive: true });
    fs.writeFileSync(P('review/voices.html'), html);
    console.log('Wrote review/voices.html. Start  npm run play  and open /review/voices.html on the forwarded port.');
    break;
  }
  case 'report': {
    const ls = Object.values(state.lines);
    const by = s => ls.filter(l => l.status === s).length;
    console.log(`${ls.length} lines: ${by('done')} recorded, ${by('failed')} failed. ${ls.filter(l => l.status === 'done').reduce((s, l) => s + (l.secs || 0), 0).toFixed(0)} s of speech. Spent ≈ $${(state.spent || 0).toFixed(2)}.`);
    for (const [k, l] of Object.entries(state.lines).filter(([, l]) => l.status === 'failed')) console.log(`  failed ${k}: ${l.error}`);
    break;
  }
  default: console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 18).join('\n'));
}
