import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [,, url, out, w = 1700] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: 1100 }, deviceScaleFactor: +(process.argv[5] || 1) });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(url); await p.waitForSelector('body[data-ready]', { timeout: 15000 }).catch(() => {});
await p.screenshot({ path: out, fullPage: true }); console.log(errs.join('\n') || 'no errors'); await b.close();
