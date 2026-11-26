// App Store screenshot frames (polish P6): six screens captured from the game at the two required iPhone sizes,
// then framed with a caption on the region's key art.   npm run play   then   node tools/store-shots.mjs
// Writes store/raw/<size>/*.png (plain screenshots, usable as-is) and store/framed/<size>/*.png (captioned).
// Sizes: 6.9" 1320 × 2868 (440 × 956 pt at 3×) and 6.5" 1242 × 2688 (414 × 896 pt at 3×), portrait.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:5173';
const wait = ms => new Promise(r => setTimeout(r, ms));
const SIZES = { '6.9': [440, 956], '6.5': [414, 896] };
// Caption, which region's art backs it, and how to reach the screen.
const SHOTS = [
  { id: '1-desk', region: 1, caption: 'A detective’s desk in Nairobi. A hundred cases on it.' },
  { id: '2-scene', region: 1, caption: 'Walk the scene. Notice what doesn’t fit.' },
  { id: '3-interview', region: 2, caption: 'Question everyone. Catch the lie with the evidence.' },
  { id: '4-charge', region: 10, caption: 'Write the charge. The prosecutor decides if it holds.' },
  { id: '5-map', region: 6, caption: 'From River Road to the Mara.' },
  { id: '6-verdict', region: 9, caption: 'Ten regions. One file that ties them all together.' },
];

async function capture(b, size, [w, h]) {
  const dir = path.join(root, 'store/raw', size); fs.mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await ctx.newPage();
  const quiet = () => page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
  const closeAll = async () => { for (let i = 0; i < 5; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(250); } };
  const shot = id => page.screenshot({ path: path.join(dir, `${id}.png`) });
  await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
  await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
  await page.goto(`${base}/index.html?case=1`); await wait(1500); await quiet();
  await shot('1-desk');
  await page.locator('.visit-card').first().click(); await wait(600); await quiet();
  await page.locator('.hs-btn').nth(1).click().catch(() => {}); await wait(700); await quiet();
  await shot('2-scene');
  await page.locator('.cam-card .cam-x, .cam-card [aria-label="Close"]').first().click().catch(() => {});
  for (let i = 0; i < 2; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click({ timeout: 2000 }).catch(() => {}); }
  await closeAll(); await quiet();
  await page.locator('.id-card').nth(1).click(); await wait(500); await quiet();
  for (let j = 0; j < 2; j++) await page.locator('.ask .chip').nth(j).click().catch(() => {});
  await wait(400); await quiet(); await page.locator('#sheets .sheet.is-in .sheet-body').last().evaluate(b => { b.scrollTop = 0; });
  await shot('3-interview');
  await closeAll();
  await page.locator('.dock-charge').click(); await wait(500); await quiet();
  await page.locator('.chip--word', { hasText: 'Peter Kamau' }).click().catch(() => {}); await wait(600); await quiet();
  await shot('4-charge');
  for (let k = 0; k < 2; k++) { await page.locator('.card-btn--submit').click().catch(() => {}); await wait(500); }
  await wait(2500); await quiet(); await page.evaluate(() => scrollTo(0, 0));
  await shot('6-verdict');
  await page.goto(`${base}/index.html?case=51`); await wait(1600); await quiet();
  await page.locator('.site-map svg').first().click().catch(() => {}); await wait(900); await quiet();
  await shot('5-map');
  await ctx.close();
}

async function frame(b, size, [w, h]) {
  const dir = path.join(root, 'store/framed', size); fs.mkdirSync(dir, { recursive: true });
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  for (const s of SHOTS) {
    const raw = path.join(root, 'store/raw', size, `${s.id}.png`); if (!fs.existsSync(raw)) continue;
    const img = `data:image/png;base64,${fs.readFileSync(raw).toString('base64')}`;
    await page.goto(`${base}/preview/store-frame.html?r=${s.region}`);
    await page.evaluate(({ img, caption }) => window.__frame(img, caption), { img, caption: s.caption });
    await page.waitForSelector('body[data-ready]'); await wait(150);
    await page.screenshot({ path: path.join(dir, `${s.id}.png`) });
  }
  await page.close();
}

const b = await chromium.launch();
for (const [size, wh] of Object.entries(SIZES)) { await capture(b, size, wh); await frame(b, size, wh); }
await b.close();
console.log(`Wrote store/raw and store/framed for ${Object.keys(SIZES).map(s => s + '"').join(' and ')} (${SHOTS.length} each).`);
