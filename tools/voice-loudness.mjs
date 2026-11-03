// Measures how loud every recorded voice line is and writes the gain that brings each one to the same
// loudness (-16 LUFS integrated, the usual target for speech on phones), so no line is much quieter or
// louder than the one before it.
//   npm run voices:loudness              measure new or changed lines (cached by content)
//   npm run voices:loudness -- --report  just print the spread, write nothing
//
// Output: www/audio/voice/loudness.json  { "<file>": gainInDb, ... }   (only lines that need ±0.5 dB or more)
// · In the browser and the app, audio.js applies each line's gain as it plays (works with any build).
// · npm run build with ffmpeg also bakes the gain into the 32 kbit/s copy (and writes an empty loudness.json
//   into dist/), so the app does no extra work.
// Needs ffmpeg (the Codespace has it). Measuring 4,000 lines takes a few minutes the first time; after that
// only new recordings are measured (.cache/loudness.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TARGET = -16, MAX_GAIN = 12, MIN_GAIN = -12;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'www', 'audio', 'voice');
const cacheFile = path.join(root, '.cache', 'loudness.json');
const report = process.argv.includes('--report');

if (spawnSync('which', ['ffmpeg'], { stdio: 'ignore' }).status !== 0) {
  console.error('ffmpeg not found. In the Codespace:  sudo apt-get update && sudo apt-get install -y ffmpeg');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const files = [...new Set(Object.values(manifest))].filter(f => fs.existsSync(path.join(dir, f)));
let cache = {}; try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* first run */ }

// ffmpeg's loudnorm filter in measuring mode prints the input's integrated loudness and true peak.
function measure(file) {
  return new Promise(resolve => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `loudnorm=I=${TARGET}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('close', () => {
      const m = err.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
      if (!m) return resolve(null);
      try { const j = JSON.parse(m[0]); resolve({ i: +j.input_i, tp: +j.input_tp }); } catch { resolve(null); }
    });
  });
}

const todo = [];
for (const f of files) {
  const key = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex');
  if (!cache[key]) todo.push({ f, key });
}
console.log(`${files.length} voice files · ${files.length - todo.length} already measured · ${todo.length} to measure`);
let done = 0;
const workers = Math.max(1, Math.min(8, os.cpus().length));
await Promise.all(Array.from({ length: workers }, async () => {
  while (todo.length) {
    const { f, key } = todo.shift();
    const m = await measure(path.join(dir, f));
    if (m && Number.isFinite(m.i)) cache[key] = m;
    if (++done % 200 === 0) process.stdout.write(`  ${done} measured…\r`);
  }
}));
fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
fs.writeFileSync(cacheFile, JSON.stringify(cache));

const out = {}, levels = [];
for (const f of files) {
  const key = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex');
  const m = cache[key]; if (!m) continue;
  levels.push(m.i);
  // Linear gain to the target, but never push the true peak above -1 dBTP (audio.js also limits).
  let g = TARGET - m.i;
  if (Number.isFinite(m.tp)) g = Math.min(g, -1 - m.tp + 6);   // allow 6 dB into the limiter for very peaky lines
  g = Math.max(MIN_GAIN, Math.min(MAX_GAIN, g));
  if (Math.abs(g) >= 0.5) out[f] = Math.round(g * 10) / 10;
}
levels.sort((a, b) => a - b);
const q = p => levels[Math.floor(p * (levels.length - 1))]?.toFixed(1);
console.log(`Loudness before: quietest ${q(0)} · 10% ${q(0.1)} · median ${q(0.5)} · 90% ${q(0.9)} · loudest ${q(1)} LUFS`);
console.log(`${Object.keys(out).length} of ${levels.length} lines get a gain to reach ${TARGET} LUFS.`);
if (!report) {
  fs.writeFileSync(path.join(dir, 'loudness.json'), JSON.stringify(out, null, 0));
  console.log('Wrote www/audio/voice/loudness.json. Commit it with the voices.');
}
