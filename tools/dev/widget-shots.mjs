// Screens of the working views: case 88's audio clip, case 32's pencil sum, case 54's collar tracks.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.', base = 'http://localhost:5173', wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const errs = []; const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
for (const [n, id, sel, act] of [[88, 'ev_monitor', '.wf', async () => { await page.locator('.wf-range').fill('1388'); }], [32, 'ev_storecard', '.pencil-sum', null], [54, 'ev_collar', '.ct', async () => { await page.locator('.ct-range').fill('1475'); }]]) {
  await page.goto(`${base}/index.html?case=${n}`); await wait(1300); await page.evaluate(() => document.querySelectorAll('.region-card-wrap').forEach(x => x.remove()));
  await page.evaluate(id => { const r = window.KESI.run; r.kE.add(id); document.querySelectorAll('#notes .note, .region-card-wrap').forEach(x => x.remove()); window.KESI.dev.openEvidence(id); }, id); await wait(400);
  if (act) await act(); await wait(150);
  const el = page.locator(sel).first(); console.log(n, sel, await el.count());
  if (await el.count()) { await el.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/w${n}.png` }); }
}
await b.close(); console.log(errs.join('\n') || 'no errors');
