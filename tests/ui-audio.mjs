// Music and sound in the browser (polish P3): every region's track plays and loops over its exact loop points,
// room sounds follow the region, music ducks under a voice, the finale plays once, the sting replaces the drawn
// drone and hit, and nothing clips with music, a voice and cues together. Tracks are synthetic (made with the
// real loop tool), served in place of the real files.   node tests/ui-audio.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { render } from '../tools/generate-music.mjs';
import { voiceKey } from '../www/engine/voicekey.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('ffmpeg is not installed: skipping.'); process.exit(0); }

// Synthetic takes → game files through the real loop tool: a 3-bar loop at 120 BPM (6 s), a once track, a sting.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kesi-audio-'));
const take = (f, secs, freq) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*${freq}*t)+0.3*sin(2*PI*55*t)*exp(-8*mod(t\\,0.5)):s=44100:d=${secs}`, '-ac', '2', f]);
take(`${tmp}/loop.wav`, 16, 220); take(`${tmp}/once.wav`, 8, 330); take(`${tmp}/sting.wav`, 30, 110);
const L = render(`${tmp}/loop.wav`, `${tmp}/loop.m4a`, { kind: 'loop', bpm: 120, start: 1, end: 7 });
render(`${tmp}/once.wav`, `${tmp}/once.m4a`, { kind: 'once' });
render(`${tmp}/sting.wav`, `${tmp}/sting.m4a`, { kind: 'sting', seconds: 6.4 });
take(`${tmp}/voice.wav`, 4, 600);
spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', `${tmp}/voice.wav`, '-c:a', 'aac', `${tmp}/voice.m4a`]);
const regions = ['cabinet', ...Array.from({ length: 10 }, (_, i) => String(i + 1))];
const manifest = { ...Object.fromEntries(regions.map(r => [r, 'loop.m4a'])), finale: 'once.m4a', sting: 'sting.m4a', _loops: Object.fromEntries(regions.map(r => [r, L.length])), _once: ['finale'] };
const LINE = 'This is a test line for the mix.', VK = voiceKey('mwalimu', LINE);

const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => { fail++; console.log(`FAIL page error: ${e.message}`); });
await page.route('**/audio/music/manifest.json', r => r.fulfill({ json: manifest }));
await page.route('**/audio/music/*.m4a', r => r.fulfill({ body: fs.readFileSync(`${tmp}/${path.basename(new URL(r.request().url()).pathname)}`), contentType: 'audio/mp4' }));
await page.route('**/audio/voice/manifest.json', r => r.fulfill({ json: { [VK]: 'mwalimu/test.m4a' } }));
await page.route('**/audio/voice/mwalimu/test.m4a', r => r.fulfill({ body: fs.readFileSync(`${tmp}/voice.m4a`), contentType: 'audio/mp4' }));
await page.goto(`${base}/index.html?reset&playtest`); await wait(800);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html`); await wait(900);
await page.mouse.click(200, 30); await wait(1800);
const st = () => page.evaluate(() => window.KESI.audio.status());
let s = await st();
check(s.running && s.region === 'cabinet' && s.music && s.looping, 'the cabinet theme plays and loops', JSON.stringify({ region: s.region, music: s.music }));
const eff = s.loopEnd > 0 ? s.loopEnd - s.loopStart : s.duration;   // no loop points needed when the decoder trimmed the priming
check(Math.abs(eff - L.length) < 0.01, 'it loops over the exact loop length from the manifest', `${eff.toFixed(3)} s vs ${L.length} s (decoded ${s.duration.toFixed(3)} s)`);
for (const r of regions.slice(1)) {
  await page.evaluate(n => window.KESI.audio.music(+n), r); await wait(700);
  s = await st();
  check(s.region === +r && s.music && s.looping && s.ambience === +r, `region ${r}: its track loops, with its room sounds`);
}
// Through the loop point: still playing, still sounding.
await page.evaluate(() => window.KESI.audio.music(1)); await wait(L.length * 1000 + 1500);
const lv = await page.evaluate(() => window.KESI.audio.levels());
s = await st();
check(s.music && lv.rms > 0.005, 'it keeps playing past the loop point', `rms ${lv.rms.toFixed(3)}`);
// Ducking under a voice.
const g0 = (await st()).musicGain;
await page.evaluate(line => { window.KESI.audio.speak('mwalimu', line, { now: true, tag: 'test' }); }, LINE); await wait(900);
const g1 = (await st()).musicGain;
check(g1 < g0 * 0.45, 'music ducks under a voice', `${g0.toFixed(3)} → ${g1.toFixed(3)}`);
// Nothing clips: music + voice + a burst of cues, peak sampled after the limiter for 2 s.
let peak = 0;
await page.evaluate(() => { for (const k of ['accepted', 'closed', 'hit', 'stamp', 'caught', 'ending']) window.KESI.audio.sfx(k); });
for (let i = 0; i < 20; i++) { const l = await page.evaluate(() => window.KESI.audio.levels()); peak = Math.max(peak, l.peak); await wait(100); }
check(peak > 0.05 && peak < 0.99, 'nothing clips with music, a voice and six cues at once', `peak ${peak.toFixed(3)} (1.0 = full scale)`);
await wait(4000);
check((await st()).musicGain > g1 * 1.8, 'music comes back after the voice');
// The finale plays once.
await page.evaluate(() => window.KESI.audio.music('finale')); await wait(800);
s = await st();
check(s.region === 'finale' && s.music && !s.looping, 'the finale plays once (no loop)');
// Room sounds off.
await page.evaluate(() => { window.KESI.save.settings.roomSounds = false; window.KESI.audio.music(3); }); await wait(500);
check((await st()).ambience == null, 'Settings → Room sounds off: no room sounds');
// The sting is used when it exists.
check(await page.evaluate(() => window.KESI.audio.hasSting() && window.KESI.audio.sting()), 'the score\'s sting plays when it is in the manifest');
await b.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
