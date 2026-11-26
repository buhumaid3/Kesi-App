// The detective's tools from ui.beats: the magnifier on any exhibit, the overlay in the comparison view, and
// Mwalimu's tips for them firing in their first case.   node tests/ui-tools.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (ok, l, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const errs = [];
for (const [name, w, h] of [['iphone', 390, 844], ['ipad', 1024, 768]]) {
  const page = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900, reducedMotion: 'reduce' });
  page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
  await page.goto(`${base}/index.html?case=63`); await wait(1400);
  const docs = await page.evaluate(() => { const r = window.KESI.run; for (const e of r.c.evidence) if (e.doc) r.kE.add(e.id); return r.documents().map(e => e.id); });
  check(docs.length >= 2, `${name}: case 63 has documents to compare`, String(docs.length));
  await page.evaluate(id => { document.querySelectorAll('#notes .note').forEach(n => n.remove()); window.KESI.dev.openEvidence(id); }, docs[0]); await wait(400);
  await page.locator('.btn--loupe').click(); await wait(150);
  check(await page.locator('.loupe').count() === 1, `${name}: the magnifier opens over the document`);
  const t1 = await page.locator('.loupe').evaluate(l => l.style.transform);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  const t2 = await page.locator('.loupe').evaluate(l => l.style.transform);
  check(t1 !== t2, `${name}: arrow keys move it`);
  const z = await page.locator('.loupe .loupe-copy').evaluate(c => c.style.transform);
  check(/scale\(2\.5\)/.test(z), `${name}: it magnifies 2.5×`);
  await wait(900);
  const tip = await page.evaluate(() => [...document.querySelectorAll('#notes .note, .vn')].map(n => n.textContent).join(' '));
  check(/Magnifier/.test(tip), `${name}: Mwalimu's magnifier tip plays in case 63`);
  await page.keyboard.press('Escape');
  check(await page.locator('.loupe').count() === 0, `${name}: Esc puts it away`);
  await page.evaluate(([a, b]) => window.KESI.dev.openCompare(a, b), docs); await wait(400);
  await page.locator('.cmp-modes button', { hasText: 'Overlay' }).click(); await wait(300);
  check(await page.locator('.ov-stage .ov-top').count() === 1 && await page.locator('.ov-stage .ov-base').count() === 1, `${name}: Overlay lays one document over the other`);
  await page.locator('.ov-fade').fill('80');
  check(await page.locator('.ov-top').evaluate(t => t.style.opacity) === '0.8', `${name}: the see-through slider works`);
  await page.locator('.ov-nudge').nth(3).click(); await page.locator('.ov-nudge').nth(3).click();
  check(/translate\(8px, 0px\)/.test(await page.locator('.ov-top').evaluate(t => t.style.transform)), `${name}: the arrow buttons slide the top sheet`);
  const sw = await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
  check(sw, `${name}: nothing scrolls sideways`);
  await page.close();
}
// The working views (widgets.js) on a phone: case 88's audio clip, case 32's pencil sum, case 54's collar tracks.
{
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  page.on('pageerror', e => errs.push(`widgets: ${e.message}`));
  const open = async (n, id) => { await page.goto(`${base}/index.html?case=${n}`); await wait(1200);
    await page.evaluate(id => { document.querySelectorAll('#notes .note, .region-card-wrap').forEach(x => x.remove()); window.KESI.run.kE.add(id); window.KESI.dev.openEvidence(id); }, id); await wait(400); };
  await open(88, 'ev_monitor');
  check(await page.locator('.wf .wf-list li').count() === 2, 'case 88: the audio clip shows its two marked moments');
  await page.locator('.wf-range').evaluate(r => { r.value = '1388'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  check(/23:08: a heavy thud/.test(await page.locator('.wf-cap').textContent()), 'scrubbing to 23:08 brings up the thud');
  await page.locator('.wf-range').evaluate(r => { r.value = '1370'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  check(/Quiet/.test(await page.locator('.wf-cap').textContent()), 'between the marks it is quiet');
  await open(32, 'ev_storecard');
  check(/500 ml − 420 ml = 80 ml/.test(await page.locator('.pencil-sum').textContent()), 'case 32: the pencil sum from the stock card');
  await open(41, 'ev_levybook');
  check(await page.locator('.pencil-sum').count() === 0, 'no sum where the numbers are unrelated (case 41 levy book)');
  await open(54, 'ev_collar');
  const c0 = await page.locator('.ct-svg circle').first().getAttribute('cx');
  await page.locator('.ct-range').evaluate(r => { r.value = '1675'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  const c1 = await page.locator('.ct-svg circle').first().getAttribute('cx');
  check(c0 !== c1, 'case 54: moving the time slider moves the lionesses toward the kill', `${c0} → ${c1}`);
  check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), 'nothing scrolls sideways');
  await page.close();
}
await b.close();
check(!errs.length, 'no page errors', errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
