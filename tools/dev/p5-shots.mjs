// P5 screenshots: the verdict (collectible drawn, clipping, reconstruction still when present) and the desk shelf.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.', base = 'http://localhost:5173', wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const errs = [];
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true;
  s.progress.collectibles = ['col_omar_stamp', 'col_upendo_ledger', 'col_dhow_compass', 'col_joseph_compass', 'col_walter_float', 'col_lemayian_whistle']; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html`); await wait(1000);
await page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
await page.locator('.desk-shelf').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/shelf.png` });
await page.locator('.desk-obj').nth(3).click(); await wait(500); await page.screenshot({ path: `${out}/inspect.png` });
await page.locator('#sheets .sheet-close').last().click(); await wait(300);
await page.locator('.folder-card').first().click(); await wait(1200);
await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
await page.locator('.visit-card').first().click(); await wait(500);
for (let i = 0; i < 2; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click({ timeout: 2000 }).catch(() => {}); }
for (let i = 0; i < 4; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); }
await page.locator('.id-card').nth(1).click(); await wait(400); for (let j = 0; j < 3; j++) await page.locator('.ask .chip').nth(j).click().catch(() => {});
for (let i = 0; i < 3; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); }
await page.locator('.dock-charge').click(); await wait(500);
await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
await page.locator('.chip--word', { hasText: 'Peter Kamau' }).click();
for (let k = 0; k < 2; k++) { await page.locator('.card-btn--submit').click(); await wait(400); }
await wait(2500);
await page.locator('.clipping').scrollIntoViewIfNeeded(); await wait(600); await page.screenshot({ path: `${out}/clipping.png` });
await b.close(); console.log(errs.join('\n') || 'no errors');
