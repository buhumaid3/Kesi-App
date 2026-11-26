// Frame strips of the P4 motion moments: every running animation is paused and set to the same time, so each
// frame is exact.   node tools/dev/p4-strips.mjs <outdir>     (dev server on :5173)
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.', base = 'http://localhost:5173', wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html`); await wait(1200);
await page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
const freeze = () => page.evaluate(() => { window.__frozen = document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity); window.__frozen.forEach(a => a.pause()); });
const at = t => page.evaluate(t => window.__frozen.forEach(a => { a.currentTime = t; }), t);
const thaw = () => page.evaluate(() => window.__frozen.forEach(a => a.play()));
async function strip(name, times, trigger) {
  await trigger(); await freeze();
  for (const t of times) { await at(t); await page.screenshot({ path: `${out}/${name}-${String(t).padStart(4, '0')}.png` }); }
  await thaw(); await wait(1500);
}
await strip('1-folder', [0, 130, 260, 390, 520], async () => { await page.locator('.folder-card').first().click(); await wait(30); });
await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
await page.locator('.ledger-strip').first().click().catch(() => {}); await wait(300);
await page.locator('.visit-card').first().click(); await wait(500);
for (let i = 0; i < 2; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click({ timeout: 2000 }).catch(() => {}); }
for (let i = 0; i < 4; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); }
await wait(800); await page.evaluate(() => document.querySelectorAll('#notes .note, .motion-ghost, .flyer').forEach(n => n.remove()));
await strip('2-exhibit', [0, 150, 300, 450, 600], async () => { await page.locator('.ex-tag').first().click(); await wait(20); });
for (let i = 0; i < 3; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); }
await page.locator('.dock-charge').click(); await wait(700);
await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
await strip('3-word', [0, 120, 240, 360, 480], async () => { await page.locator('.chip--word').first().click(); await wait(20); });
const sub = page.locator('.card-btn--submit'); await sub.click(); await wait(300);
await strip('4-send', [0, 160, 320, 500, 800], async () => { await sub.click(); await wait(20); });
await b.close(); console.log('ok');
