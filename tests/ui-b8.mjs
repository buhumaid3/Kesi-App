// B8 checks: one voice at a time, switching people inside a sheet, the phone fitting its handset at every size,
// and the board fitting its frame with nothing cut off.   npm run play  then  npm run test:b8
//   node tests/ui-b8.mjs http://127.0.0.1:5173 [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { voiceKey } from '../www/engine/voicekey.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', shots = process.argv[3] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SIZES = [['se1', 320, 568], ['iphone', 390, 844], ['promax', 430, 932], ['landscape', 844, 390], ['ipad', 768, 1024], ['desktop', 1440, 900]];
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

// A short tone as a WAV file: the recorded line every test voice plays (0.45 s).
function tone(sec = 0.45, rate = 22050) {
  const n = Math.round(sec * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 330) * 8000), 44 + i * 2);
  return buf;
}

async function newPage(w, h, { voices = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1000, isMobile: w < 1000, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fail++; console.log(`FAIL page error: ${e.message}`); });
  if (voices) {
    await page.addInitScript(() => { window.__kesiAudioLog = []; });
    const manifest = Object.fromEntries(voices.map(([sp, text], i) => [voiceKey(sp, text), `t${i}.wav`]));
    await page.route('**/audio/voice/manifest.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) }));
    await page.route('**/audio/voice/t*.wav', r => r.fulfill({ contentType: 'audio/wav', body: tone() }));
  }
  return { ctx, page };
}
// Playtest save, case 2 with places visited and people interviewed, so every app and the board have content.
async function intoCase(page) {
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await page.evaluate(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html`); await wait(700);
  const quiet = () => page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
  await quiet(); await page.locator('.region-card-wrap').click({ timeout: 800 }).catch(() => {});
  await page.locator('.folder-card').nth(1).click(); await wait(1000); await quiet();
  const close = () => page.locator('#sheets .sheet-close').last().click().then(() => wait(220));
  for (let k = 0; k < 2; k++) { const v = page.locator('.visit-card'); const n = await v.count(); for (let i = 0; i < n; i++) { await v.nth(i).click(); await wait(250); const hs = page.locator('.hs-btn'); const m = await hs.count(); for (let j = 0; j < m; j++) await hs.nth(j).click().catch(() => {}); await close(); } }
  const ids = page.locator('.id-card'); const np = await ids.count();
  for (let i = 0; i < Math.min(np, 4); i++) { await ids.nth(i).click(); await wait(250); for (let j = 0; j < 2; j++) await page.locator('.ask .chip').nth(j).click().catch(() => {}); await close(); }
  await quiet();
  return { quiet, close };
}

// ── 1. One voice at a time ─────────────────────────────────────────────────────────────────────────────
{
  const L = ['First line.', 'Second line.', 'Third line.', 'A question answered.', 'Another answer.'];
  const { ctx, page } = await newPage(390, 844, { voices: [['mwalimu', L[0]], ['mwalimu', L[1]], ['halima', L[2]], ['mwalimu', L[3]], ['mwalimu', L[4]]] });
  await page.goto(`${base}/index.html`); await wait(900);
  await page.mouse.click(5, 5);                                     // the first tap unlocks audio
  const r = await page.evaluate(async L => {
    const A = window.KESI.audio, log = window.__kesiAudioLog;
    await new Promise(r => setTimeout(r, 300));
    // Three lines asked for at once, by different parts of the game: they must play one after another.
    const ps = [A.speak('mwalimu', L[0], { tag: 'note1' }), A.speak('mwalimu', L[1], { tag: 'note2' }), A.speak('halima', L[2], { tag: 'verdict' })];
    await new Promise(r => setTimeout(r, 120));
    // A tap for a line from someone else while one is playing: it waits for the current line, then goes next.
    const tapped = A.speak('mwalimu', L[3], { now: true, tag: 'person' });
    // Skipping: a new tap on the same tag replaces that tag's line (and nobody else's).
    const replaced = A.speak('mwalimu', L[4], { now: true, tag: 'person' });
    const res = await Promise.all([...ps, tapped, replaced]);
    // Closing a sheet stops only its own lines.
    const a = A.speak('mwalimu', L[0], { tag: 'keep' }), c = A.speak('mwalimu', L[1], { tag: 'drop' });
    A.stopVoice('drop');
    const kept = await a, dropped = await c;
    return { res, kept, dropped, log: log.map(x => ({ tag: x.tag, s: x.start, e: x.end })) };
  }, L);
  const ok = r.log.length >= 5 && r.log.every(x => x.e != null);
  check(ok, 'voice queue: every line played and ended', `${r.log.length} lines`);
  let overlap = 0; const s = [...r.log].sort((a, b) => a.s - b.s);
  for (let i = 1; i < s.length; i++) if (s[i].s < s[i - 1].e - 5) overlap++;
  check(overlap === 0, 'voice queue: two lines never overlap', s.map(x => `${x.tag} ${Math.round(x.s)}–${Math.round(x.e)}`).join(', '));
  check(r.res.slice(0, 3).every(Boolean), 'voice queue: queued lines were each heard in full');
  check(r.res[3] === false && r.res[4] === true, 'voice queue: a second tap on the same person replaces their line, not anyone else\'s');
  const order = s.map(x => x.tag).slice(0, 4).join(' ');
  check(order === 'note1 person note2 verdict', 'voice queue: a tapped line waits for the line playing, then goes next', order);
  check(r.kept === true && r.dropped === false, 'voice queue: stopVoice(tag) stops only that tag');
  await ctx.close();
}

// ── 2. Switching people inside a person's sheet ────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(390, 844);
  const { quiet } = await intoCase(page);
  await page.locator('.id-card').nth(1).click(); await wait(300); await quiet();
  const first = await page.evaluate(() => document.querySelector('#sheets .sheet--person')?.getAttribute('aria-label'));
  const strip = await page.locator('.sheet--person .sw-person').count();
  check(strip >= 2, 'person sheet: a row of everyone you can question', `${strip} portraits`);
  const asked1 = await page.locator('.sheet--person .qa').count();
  const other = page.locator('.sheet--person .sw-person:not(.is-on)').first();
  const otherPid = await other.getAttribute('data-pid');
  await other.click(); await wait(300); await quiet();
  const r = await page.evaluate(() => ({ n: document.querySelectorAll('#sheets .sheet--person').length, label: document.querySelector('#sheets .sheet--person')?.getAttribute('aria-label'), on: document.querySelector('.sw-person.is-on')?.dataset.pid, head: document.querySelector('.sheet--person .person-meta h2')?.textContent }));
  check(r.n === 1 && r.label !== first && r.on === otherPid && r.head === r.label, 'person sheet: tapping a portrait switches to them in the same sheet', `${first} → ${r.label}`);
  await page.locator(`.sheet--person .sw-person`).filter({ hasText: first.split(' ')[0] }).first().click(); await wait(300);
  const back = await page.evaluate(() => ({ label: document.querySelector('#sheets .sheet--person')?.getAttribute('aria-label'), qa: document.querySelectorAll('.sheet--person .qa').length }));
  check(back.label === first && back.qa === asked1, 'person sheet: switching back keeps the conversation so far', `${back.qa} answers`);
  // places and exhibits
  await page.locator('#sheets .sheet-close').last().click(); await wait(250);
  await page.locator('.visit-card').first().click(); await wait(300);
  const chips = await page.locator('.sheet--location .sw-chip').count();
  if (chips > 1) { const before = await page.evaluate(() => document.querySelector('.sheet--location').getAttribute('aria-label')); await page.locator('.sheet--location .sw-chip:not(.is-on)').first().click(); await wait(300);
    const after = await page.evaluate(() => ({ l: document.querySelector('.sheet--location').getAttribute('aria-label'), n: document.querySelectorAll('#sheets .sheet--location').length }));
    check(after.n === 1 && after.l !== before, 'place sheet: switch place from inside a place'); }
  await page.locator('#sheets .sheet-close').last().click(); await wait(250);
  await page.locator('.ex-tag').first().click(); await wait(300);
  const e1 = await page.locator('.sheet--doc .sw-count').textContent();
  await page.locator('.sheet--doc .sw-step').last().click(); await wait(300);
  const e2 = await page.locator('.sheet--doc .sw-count').textContent(), nDoc = await page.locator('#sheets .sheet--doc').count();
  check(e1 !== e2 && nDoc === 1, 'exhibit sheet: › goes to the next exhibit', `${e1} → ${e2}`);
  await ctx.close();
}

// ── 3. The phone fits its handset; 4. the board fits its frame ─────────────────────────────────────────
for (const [name, w, h] of SIZES) {
  const { ctx, page } = await newPage(w, h);
  const { quiet, close } = await intoCase(page);
  // Board
  await page.locator('.dock-cork').click(); await wait(500); await quiet();
  const fitIn = () => page.evaluate(() => {
    const v = document.querySelector('.cork-view').getBoundingClientRect(), c = document.querySelector('.cork').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.bcard')].map(e => e.getBoundingClientRect());
    const inside = r => r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
    return { board: inside(c), cards: cards.every(inside), n: cards.length, vis: v.bottom <= innerHeight + 1 && v.right <= innerWidth + 1 && v.height > 100, z: +document.querySelector('.cork-view').dataset.z };
  });
  const f1 = await fitIn();
  check(f1.board && f1.cards && f1.vis, `${name} board: fitted whole on opening, nothing cut off`, `${f1.n} cards at ${Math.round(f1.z * 100)}%`);
  if (shots) await page.screenshot({ path: `${shots}/${name}-board.png` });
  await page.locator('.cork-zoom [aria-label="Zoom in"]').click(); await page.locator('.cork-zoom [aria-label="Zoom in"]').click(); await wait(400);
  const z2 = await page.evaluate(() => +document.querySelector('.cork-view').dataset.z);
  // drag a card at this zoom: it moves by the drag divided by the zoom (it stays under the finger)
  const card = page.locator('.bcard').first(), id = await card.getAttribute('data-id');
  const p0 = await page.evaluate(id => [...window.KESI.run.s.board.pos[id]], id);
  const bb = await card.boundingBox();
  const vb = await page.locator('.cork-view').boundingBox();
  const sx = Math.max(vb.x + 20, Math.min(vb.x + vb.width - 60, bb.x + 30)), sy = Math.max(vb.y + 20, Math.min(vb.y + vb.height - 60, bb.y + 30));
  if (sx > bb.x && sy > bb.y && sx < bb.x + bb.width && sy < bb.y + bb.height) {
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 30, sy + 20, { steps: 5 }); await page.mouse.up(); await wait(150);
    const p1 = await page.evaluate(id => [...window.KESI.run.s.board.pos[id]], id);
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    check(Math.abs(dx - 30 / z2) < 3 && Math.abs(dy - 20 / z2) < 3, `${name} board: a card dragged at ${Math.round(z2 * 100)}% stays under the finger`, `moved ${dx.toFixed(1)}, ${dy.toFixed(1)} board units`);
  }
  await page.locator('.cz-fit').click(); await wait(400);
  const f2 = await fitIn();
  check(z2 > f1.z && f2.board && f2.cards && Math.abs(f2.z - f1.z) < 0.01, `${name} board: Fit goes back to the whole board`);
  await close();
  // Phone
  await page.locator('.dock-phone').click(); await wait(450);
  const views = [['lock', null], ['home', null], ['keypad', async () => { await page.locator('[data-app=phone]').click(); await wait(150); await page.locator('.ph-tab').nth(2).click(); }],
    ['pick', async () => { await page.locator('[data-app=phone]').click(); await wait(150); await page.locator('.ph-row').first().click(); }],
    ['contacts', () => page.locator('[data-app=contacts]').click()], ['photos', () => page.locator('[data-app=photos]').click()], ['map', () => page.locator('[data-app=map]').click()],
    ['calendar', () => page.locator('[data-app=calendar]').click()], ['recorder', () => page.locator('[data-app=recorder]').click()], ['voicenotes', () => page.locator('[data-app=voice]').click()],
    ['messages', () => page.locator('[data-app=messages]').click()], ['recents', async () => { await page.locator('[data-app=phone]').click(); await wait(150); await page.locator('.ph-tab').nth(1).click(); }]];
  const bad = [];
  for (const [v, go] of views) {
    if (v === 'home') { await page.locator('.ph-unlock').click().catch(() => {}); await wait(250); }
    else if (go) { await page.locator('.ph-home').click(); await wait(150); await go(); await wait(300); }
    const r = await page.evaluate(() => {
      const hs = document.querySelector('.handset').getBoundingClientRect(), body = document.querySelector('.ph-body');
      const fit = document.querySelector('.ph-fit');
      const fr = fit?.getBoundingClientRect(), br = body.getBoundingClientRect();
      const scroller = document.querySelector('.ph-scroll, .ph-thread, .ph-app-view > .ph-list');
      return { inView: hs.top >= -1 && hs.bottom <= innerHeight + 1 && hs.left >= -1 && hs.right <= innerWidth + 1,
        bodyScrolls: body.scrollHeight > body.clientHeight + 1, fitOverflow: fit ? fr.bottom > br.bottom + 1 || fit.scrollHeight > fit.clientHeight + 2 : false,
        k: fit?.dataset.fit || '-', listOwn: !fit && !!scroller };
    });
    if (!r.inView || r.bodyScrolls || r.fitOverflow) bad.push(`${v}${r.inView ? '' : ' off-screen'}${r.bodyScrolls ? ' phone scrolls' : ''}${r.fitOverflow ? ' cut off' : ''}`);
    if (['lock', 'home', 'keypad', 'pick'].includes(v)) check(!r.bodyScrolls && !r.fitOverflow && r.inView, `${name} phone ${v}: fits the handset, no scrolling`, `scale ${r.k}`);
    else if (r.bodyScrolls || !r.listOwn) bad.push(`${v} list does not scroll inside its app`);
    if (shots && ['home', 'keypad', 'contacts', 'map'].includes(v)) await page.screenshot({ path: `${shots}/${name}-phone-${v}.png` });
  }
  check(!bad.length, `${name} phone apps: lists scroll inside the app, never the whole phone`, bad.join('; '));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
