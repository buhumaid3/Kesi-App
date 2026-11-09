// Builds the app's web bundle: www/ → dist/, which Capacitor copies into the iOS app (npx cap sync ios).
//   npm run build                 full build (voices re-encoded small for the app)
//   npm run build -- --fast       copy voices as they are (quick local check)
//
// What changes on the way:
// · Voice lines are re-encoded from 56 to 32 kbit/s mono AAC: about 160 MB → about 90 MB, still clean speech.
//   Uses ffmpeg (Codespace) or Apple's afconvert (the Codemagic Mac). Results are cached in .cache/voice32/
//   by content, so only new or changed lines are re-encoded next time. With neither tool, files are copied.
// · Loudness: every line is brought to about -16 LUFS. tools/voice-loudness.mjs measures each line once and
//   writes www/audio/voice/loudness.json; with ffmpeg the gain is baked into the 32k copy here (and dist/ gets
//   an empty loudness.json); with afconvert the file is kept and audio.js applies each line's gain as it plays.
// · Files the app never needs are left out: review pages, sound sketches, .DS_Store, source maps.
// · A small build stamp (dist/build.json) says what went in, for the settings screen and bug reports.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'www'), out = path.join(root, 'dist'), cache = path.join(root, '.cache', 'voice32');
const fast = process.argv.includes('--fast');
const SKIP = [/^title-preview\.html$/, /(^|\/)\.DS_Store$/, /\.map$/, /(^|\/)review\//, /\.tmp\./, /\.wav$/];
const has = cmd => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
const encoder = fast ? null : has('ffmpeg') ? 'ffmpeg' : has('afconvert') ? 'afconvert' : null;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(cache, { recursive: true });
let gains = {}; try { gains = JSON.parse(fs.readFileSync(path.join(src, 'audio', 'voice', 'loudness.json'), 'utf8')); } catch { /* not measured yet */ }
const bake = encoder === 'ffmpeg';
let files = 0, bytesIn = 0, bytesOut = 0, voices = 0, encoded = 0, cached = 0;
function encode(file, dest, gain = 0) {
  const buf = fs.readFileSync(file);
  const key = crypto.createHash('sha1').update(buf).update(bake && gain ? `gain${gain}` : '').digest('hex');
  const hit = path.join(cache, key + '.m4a');
  if (!fs.existsSync(hit)) {
    const tmp = hit + '.part.m4a';
    const r = encoder === 'ffmpeg'
      ? spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, ...(gain ? ['-af', `volume=${gain}dB,alimiter=limit=0.89:level=false`] : []), '-ac', '1', '-c:a', 'aac', '-b:a', '32k', tmp])
      : spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-c', '1', '-b', '32000', file, tmp]);
    if (r.status !== 0 || !fs.existsSync(tmp)) { fs.copyFileSync(file, dest); return; }
    // Never ship a bigger file than the original.
    if (fs.statSync(tmp).size >= buf.length && !(bake && gain)) fs.copyFileSync(file, hit); else fs.renameSync(tmp, hit);
    fs.rmSync(tmp, { force: true });
    encoded++;
  } else cached++;
  fs.copyFileSync(hit, dest);
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(src, abs).split(path.sep).join('/');
    if (SKIP.some(r => r.test(rel))) continue;
    if (e.isDirectory()) { walk(abs); continue; }
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const size = fs.statSync(abs).size; bytesIn += size;
    if (encoder && rel.startsWith('audio/voice/') && rel.endsWith('.m4a')) { voices++; encode(abs, dest, gains[path.basename(rel)] || 0); }
    else if (bake && rel === 'audio/voice/loudness.json') fs.writeFileSync(dest, '{}');
    else fs.copyFileSync(abs, dest);
    bytesOut += fs.statSync(dest).size; files++;
    if (voices && voices % 500 === 0 && rel.endsWith('.m4a')) process.stdout.write(`  voices ${voices}…\r`);
  }
}
walk(src);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let commit = '';
try { commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(); } catch { /* not a git checkout */ }
fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({ version: pkg.version, commit, built: new Date().toISOString(), voices: encoder ? '32k' : 'as recorded' }));
const mb = b => (b / 1048576).toFixed(1);
console.log(`dist/: ${files} files, ${mb(bytesOut)} MB (www/ was ${mb(bytesIn)} MB).`);
if (encoder) console.log(`Voices: ${voices} lines at 32 kbit/s with ${encoder} (${encoded} encoded, ${cached} from cache)${bake ? `, ${Object.keys(gains).length} levelled to -16 LUFS` : ', levelled as they play (loudness.json)'}.`);
else if (fast) console.log('Voices: copied as recorded (--fast), levelled as they play (loudness.json).');
else console.log('No ffmpeg or afconvert found: voices copied as recorded.');
if (!Object.keys(gains).length) console.log('Voices are not levelled yet: run  npm run voices:loudness  (needs ffmpeg) and commit www/audio/voice/loudness.json.');
