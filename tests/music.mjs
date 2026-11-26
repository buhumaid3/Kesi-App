// The music tool end to end against a fake Lyria client, in a scratch copy of the repo's music files:
// prompts (no artist names, instrumental), generate, review page, choices, loops at the target loudness with a
// smooth seam, the manifest, the licences log, redo with a note.   node tests/music.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
let fail = 0, pass = 0; const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${x ? '  ' + x : ''}`); };
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('ffmpeg is not installed: skipping the music tool test.'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kesi-music-'));
fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
fs.copyFileSync(path.join(repo, 'docs/music-brief.md'), path.join(tmp, 'docs/music-brief.md'));
const tool = path.join(repo, 'tools/generate-music.mjs');
const run = (...a) => { const r = spawnSync('node', [tool, ...a], { cwd: tmp, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '', KESI_FAKE_CLIENT: path.join(here, 'fixtures/fake-lyria.mjs') } }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const J = f => JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'));

let r = run('prompts');
ok(r.code === 0 && /13 prompts/.test(r.out), 'prompts: 13 tracks (cabinet, 10 regions, finale, sting)', r.out.trim().split('\n')[0]);
const prompts = J('prompts/music.json');
ok(Object.values(prompts).every(p => /^Instrumental only, no vocals/.test(p.prompt)), 'every prompt asks for instrumental only');
ok(Object.values(prompts).every(p => !/\bin the style of\b/i.test(p.prompt)), 'no prompt says "in the style of"');
ok(prompts.sting.model.includes('clip') && prompts['1'].model === 'lyria-3.5', 'the sting uses the 30 s clip model, the rest the full-song model');

r = run('generate', '--track', '1,cabinet,finale,sting', '--takes', '2');
ok(r.code === 0, 'generate: two takes each for four tracks', r.out.trim().split('\n').pop());
const st = J('prompts/music-state.json');
ok(st.tracks['1'].takes.length === 2 && fs.existsSync(path.join(tmp, st.tracks['1'].takes[0].file)), 'takes saved to music-takes/');
ok(Math.abs(st.spent - (3 * 2 * 0.08 + 2 * 0.04)) < 1e-6, 'spend tracked', `$${st.spent}`);

r = run('review');
const html = fs.readFileSync(path.join(tmp, 'review/music.html'), 'utf8');
ok(r.code === 0 && (html.match(/<audio /g) || []).length === 8 && html.includes('Collect choices'), 'review page lists every take with a player and the choices collector');

fs.writeFileSync(path.join(tmp, 'prompts/music-choices.txt'), '1 approve 2\ncabinet approve 1 start=1 end=31\nfinale approve 1\nsting approve 1 offset=0.5\n');
r = run('pick');
ok(r.code === 0, 'pick: approved takes rendered', r.out.trim().split('\n')[0]);
const man = J('www/audio/music/manifest.json');
ok(man['1'] === 'region-01.m4a' && man.cabinet === 'cabinet.m4a' && man.finale === 'finale.m4a' && man.sting === 'sting.m4a', 'manifest lists the four files');
const st2 = J('prompts/music-state.json');
for (const id of ['1', 'cabinet', 'finale', 'sting']) {
  const res = st2.tracks[id].approved.result;
  ok(Math.abs(res.lufs - -20) <= 1.5 && res.truePeak <= -2.5, `${id}: loudness ${res.lufs} LUFS, peak ${res.truePeak} dBTP (target −20, under −3)`);
}
ok(Math.abs(st2.tracks.cabinet.approved.result.seconds - 30) < 0.3, 'the loop points chosen by ear are honoured', `${st2.tracks.cabinet.approved.result.seconds} s for start=1 end=31`);
ok(Math.abs(st2.tracks.sting.approved.result.seconds - 6.4) < 0.2, 'the sting is cut to 6.4 s', `${st2.tracks.sting.approved.result.seconds} s`);
// Bar-aligned loop for region 1 (92 BPM): length is a whole number of bars.
const L = st2.tracks['1'].approved.result, bar = 240 / 92, bars = L.length / bar;
ok(Math.abs(bars - Math.round(bars)) < 0.01, 'automatic loop length is a whole number of bars', `${bars.toFixed(2)} bars`);
// The seam: the level across the loop point is close to the level either side (no click, no gap).
const pcm = f => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 }); return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4); };
const a = pcm(path.join(tmp, 'www/audio/music/region-01.m4a')), rms = (x, i, n) => { let s = 0; for (let k = i; k < i + n; k++) s += x[(k + x.length) % x.length] ** 2; return Math.sqrt(s / n); };
const w = 400, seam = rms(a, a.length - w / 2, w), mid = rms(a, Math.floor(a.length / 2), w);
const jump = Math.abs(a[a.length - 1] - a[0]);
ok(seam > mid * 0.4 && seam < mid * 2.5 && jump < 0.2, 'the loop seam keeps the level (no gap, no click)', `seam ${seam.toFixed(3)} vs middle ${mid.toFixed(3)}, edge jump ${jump.toFixed(3)}`);
const lic = fs.readFileSync(path.join(tmp, 'docs/licences.md'), 'utf8');
ok(/\| 1 \| region-01\.m4a \| lyria-3\.5 \| \d{4}-\d\d-\d\d \| 2 \|/.test(lic) && /\| sting \|/.test(lic), 'docs/licences.md logs model, date, take and prompt for each');

fs.writeFileSync(path.join(tmp, 'prompts/music-choices.txt'), '2 reject "fewer drums, more space"\n');
run('generate', '--track', '2', '--takes', '1');
r = run('redo', '--rejects', '--takes', '1');
const t2 = J('prompts/music-state.json').tracks['2'].takes;
ok(r.code === 0 && t2.length === 2 && /Correction from review: fewer drums, more space/.test(t2[1].prompt), 'redo adds the review note to the prompt');
r = run('report');
ok(r.code === 0 && /music in the app [\d.]+ MB/.test(r.out), 'report', r.out.trim().split('\n').pop());

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
