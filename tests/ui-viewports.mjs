// Every screen at nine screen sizes, light and dark: checks that nothing makes the page scroll sideways,
// that nothing sticks out past the screen edge (outside its own scrolling box), that the dock and the
// sheet's close button are on screen, and saves a screenshot of each. Usage:
//   node tests/ui-viewports.mjs http://127.0.0.1:8765 outdir
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8765', out = process.argv[3] || 'vp';
fs.mkdirSync(out, { recursive: true });
const VIEWPORTS = [
  ['se1', 320, 568, true], ['se3', 375, 667, true], ['iphone', 390, 844, true], ['promax', 430, 932, true],
  ['landscape', 844, 390, true], ['ipad', 768, 1024, true], ['ipad-land', 1024, 768, true], ['ipadpro-land', 1366, 1024, true], ['desktop', 1440, 900, false],
];
let fails = 0; const errors = [];
const b = await chromium.launch();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function audit(page, label) {
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    const sw = document.scrollingElement.scrollWidth;
    const inScroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true; } return false; };
    for (const el of document.querySelectorAll('#app *, #sheets *, #notes *')) {
      const rc = el.getBoundingClientRect();
      if (!rc.width || getComputedStyle(el).visibility === 'hidden') continue;
      if ((rc.right > W + 1 || rc.left < -1) && !inScroller(el) && !el.closest('.dock')) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(rc.left)}→${Math.round(rc.right)}`);
    }
    const close = document.querySelector('#sheets .sheet.is-in:last-of-type .sheet-close');
    const cr = close?.getBoundingClientRect();
    const dock = document.querySelector('.dock')?.getBoundingClientRect();
    return { sw, W, H, bad: bad.slice(0, 6), nbad: bad.length, closeOk: !close || (cr.right <= W + 1 && cr.top >= -1 && cr.bottom <= H + 1), dockOk: !dock || (dock.bottom <= H + 1 && dock.right <= W + 1) };
  });
  const ok = r.sw <= r.W + 1 && !r.nbad && r.closeOk && r.dockOk;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  scrollWidth ${r.sw}/${r.W}${r.nbad ? `  ${r.nbad} past the edge: ${r.bad.join(', ')}` : ''}${r.closeOk ? '' : '  close button off screen'}${r.dockOk ? '' : '  dock off screen'}`);
}
for (const [name, w, h, touch] of VIEWPORTS) for (const scheme of ['light', 'dark']) {
  if (scheme === 'dark' && !['se1', 'ipad-land', 'desktop'].includes(name)) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000, colorScheme: scheme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  const tag = `${name}-${scheme}`;
  const shot = s => page.screenshot({ path: `${out}/${tag}-${s}.png` });
  const quiet = () => page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
  const closeAll = async () => { for (let i = 0; i < 5; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); } };
  await page.goto(`${base}/index.html?reset&playtest`); await wait(900);
  await page.evaluate(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html`); await wait(900); await quiet();
  await page.locator('.region-card-wrap').click({ timeout: 1000 }).catch(() => {});
  await audit(page, `${tag} cabinet`); await shot('1-cabinet');
  await page.locator('.folder-card').first().click(); await wait(1400); await quiet();
  await audit(page, `${tag} desk`); await shot('2-desk');
  await page.locator('.visit-card').first().click(); await wait(500); await quiet();
  for (let i = 0; i < 3; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click(); }
  await wait(300); await quiet();
  await audit(page, `${tag} place`); await shot('3-place');
  await closeAll();
  await page.locator('.id-card').nth(1).click(); await wait(400); await quiet();
  for (let j = 0; j < 3; j++) await page.locator('.ask .chip').nth(j).click().catch(() => {});
  await audit(page, `${tag} interview`); await shot('4-interview'); await closeAll();
  await page.locator('.ex-tag').nth(2).click(); await wait(400); await quiet();
  await audit(page, `${tag} exhibit`); await shot('5-exhibit'); await closeAll();
  await page.locator('.dock-note').click(); await wait(400); await quiet();
  await audit(page, `${tag} notebook`); await shot('6-notebook'); await closeAll();
  await page.locator('.dock-cork').click(); await wait(400); await quiet();
  await audit(page, `${tag} board`); await shot('7-board'); await closeAll();
  await page.locator('.dock-charge').click(); await wait(400); await quiet();
  await audit(page, `${tag} charge`); await shot('8-charge');
  await page.locator('.chip--word', { hasText: 'Peter Kamau' }).click(); await wait(100);
  for (let k = 0; k < 2; k++) { await page.locator('.card-btn--submit').click(); await wait(300); await quiet(); }
  await wait(1800); await quiet();
  await audit(page, `${tag} verdict`); await shot('9-verdict');
  await ctx.close();
}
await b.close();
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'No page errors.');
console.log(fails ? `${fails} failure(s)` : 'Every screen fits every size.');
process.exit(fails || errors.length ? 1 : 0);
