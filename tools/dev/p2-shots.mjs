// P2 screenshots: cabinet with drawers, a region card, the launch at a few moments.  node tools/dev/p2-shots.mjs <outdir> [w h]
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.', W = +(process.argv[3] || 390), H = +(process.argv[4] || 844); fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5173', wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: W < 900 });
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(`${base}/index.html?reset&playtest`); await wait(900);
await p.evaluate(() => { const s = window.KESI.save; s.settings.intros = 'off'; s.settings.titleSeq = false; s.progress.prologue = true; delete s.progress.regionCardSeen; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await p.goto(`${base}/index.html`); await wait(1400);
await p.screenshot({ path: `${out}/region-card-${W}.png` });
await wait(800);
await p.evaluate(() => document.querySelectorAll('.region-card-wrap,#notes .note').forEach(n => n.remove()));
await p.screenshot({ path: `${out}/cabinet-${W}.png` });
await p.evaluate(() => { document.querySelector('details.drawer[data-region="1"]').open = false; document.querySelector('details.drawer[data-region="6"]').open = true; document.querySelector('details.drawer[data-region="6"]').scrollIntoView(); });
await wait(900); await p.screenshot({ path: `${out}/cabinet-open6-${W}.png` });
await b.close(); console.log(errs.join('\n') || 'no errors');
