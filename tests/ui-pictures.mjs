// Pictures (polish P5): collectibles drawn on the desk and in the inspect sheet, the clipping with its halftone,
// the reconstruction still only when it exists, and every collectible has a drawing.
//   node tests/ui-pictures.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (ok, l, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? '  ' + x : ''}`); };
const { COLLECTIBLE_ART, objectArt } = await import('../www/engine/objects.js');
const camp = JSON.parse(fs.readFileSync(new URL('../www/cases/_campaign.json', import.meta.url)));
check(camp.collectibles.every(c => COLLECTIBLE_ART.includes(c.id) && objectArt(c.id).startsWith('<svg')), 'every collectible has a drawing', `${COLLECTIBLE_ART.length} of ${camp.collectibles.length}`);
const recon = JSON.parse(fs.readFileSync(new URL('../prompts/briefs/reconstructions.json', import.meta.url)));
check(Object.keys(recon).length === 100 && Object.values(recon).every(r => /face never visible/.test(r.brief) && !/\b(strikes?|struck|stabb?\w*|blood|wound\w*|dead body|corpse|kill\w*)\b/i.test(r.brief)), '100 reconstruction briefs, none describing the act');
const b = await chromium.launch(); const errs = [];

const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true;
  s.progress.collectibles = ['col_omar_stamp', 'col_upendo_ledger', 'col_dhow_compass', 'col_joseph_compass', 'col_walter_float', 'col_lemayian_whistle']; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html`); await wait(1000);
await page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
check(await page.locator('.desk-obj svg.obj-art').count() === 6, 'the collectibles stand on the desk as drawn objects', `${await page.locator('.desk-obj svg').count()}`);
await page.locator('.desk-obj').nth(3).click(); await wait(500);
check(await page.locator('.sheet--object .obj-big svg').count() === 1 && /surveying compass/i.test(await page.locator('.sheet--object').textContent()), 'tapping one picks it up: large, with its story');
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
await page.locator('.clipping').scrollIntoViewIfNeeded(); await wait(800);
check(await page.locator('.clipping canvas.halftone[data-ready]').count() === 1, 'the verdict carries the next morning\'s clipping with a halftone of the scene');
check(/Peter Kamau/.test(await page.locator('.clipping').textContent()), 'the clipping tells the story from the verdict');
check(await page.locator('.recon-still').count() === 0, 'no reconstruction still and no "Photo pending" frame while it isn\'t generated');
check(await page.locator('.v-col').count() === 0 || await page.locator('.v-col-art svg').count() === 1, 'a collectible earned on the verdict is drawn');
await b.close();
check(!errs.length, 'no page errors', errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
