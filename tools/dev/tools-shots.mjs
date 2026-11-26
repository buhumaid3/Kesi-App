// Screens of the magnifier and the overlay (case 63).   node tools/dev/tools-shots.mjs <outdir>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.', base = 'http://localhost:5173', wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; s.progress.flags = { coach: { magnifierOnStamps: 1, documentTools: 1 } }; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html?case=63`); await wait(1400);
const docs = await page.evaluate(() => { const r = window.KESI.run; for (const e of r.c.evidence) if (e.doc) r.kE.add(e.id); document.querySelectorAll('#notes .note').forEach(n => n.remove()); return r.documents().map(e => e.id); });
await page.evaluate(id => window.KESI.dev.openEvidence(id), docs[0]); await wait(400);
await page.locator('.btn--loupe').click(); await page.mouse.move(200, 330); await page.mouse.move(210, 340); await wait(200);
await page.screenshot({ path: `${out}/loupe.png` });
await page.keyboard.press('Escape');
await page.evaluate(([a, b]) => window.KESI.dev.openCompare(a, b), docs); await wait(400);
await page.locator('.cmp-modes button', { hasText: 'Overlay' }).click(); await wait(300);
await page.locator('.ov-nudge').nth(3).click(); await page.locator('.ov-nudge').nth(2).click(); await wait(100);
await page.screenshot({ path: `${out}/overlay.png` });
await b.close(); console.log('ok');
