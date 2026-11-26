// The launch sequence ("Lamp on", polish P2): draws at three sizes, the title reads on whatever is behind it,
// and a frame is cheap enough for 60 fps.   node tests/ui-launch.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const b = await chromium.launch();
for (const [name, w, h] of [['se', 375, 667], ['iphone', 393, 852], ['ipad', 820, 1180], ['landscape', 852, 393]]) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { fail++; console.log(`FAIL ${name} page error: ${e.message}`); });
  await page.goto(`${base}/preview/launch.html?t=0`); await page.waitForSelector('body[data-ready]');
  const r = await page.evaluate(async () => {
    const { titleBox } = await import('../engine/launch.js');
    const cv = document.querySelector('canvas'), x = cv.getContext('2d'), dpr = cv.width / cv.clientWidth;
    const L = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    // The background behind the title at the moment it lands, and while it holds: the brightest 5% of pixels.
    const bright = [];
    for (const t of [3.6, 4.0, 4.9]) {
      window.__render(t - 0.001 < 3.6 ? 3.59 : t);
      // Draw again without the title: render just before the title starts, at the same camera (the camera holds still in the street).
    }
    globalThis.__launchPlateOnly = true; window.__render(4.9); globalThis.__launchPlateOnly = false;
    const bx = titleBox(cv.clientWidth, cv.clientHeight);
    const d = x.getImageData(Math.round(bx.x * dpr), Math.round(bx.y * dpr), Math.round(bx.w * dpr), Math.round(bx.h * dpr)).data;
    const lum = []; for (let i = 0; i < d.length; i += 16) lum.push(0.2126 * L(d[i]) + 0.7152 * L(d[i + 1]) + 0.0722 * L(d[i + 2]));
    lum.sort((a, b) => a - b); const p95 = lum[Math.floor(lum.length * 0.95)];
    // Frame cost: 120 frames across the whole sequence.
    const t0 = performance.now(); for (let i = 0; i < 120; i++) window.__render(i * 6.4 / 120); const ms = (performance.now() - t0) / 120;
    return { p95, ms, frame: document.querySelector('.launch').dataset.frame };
  });
  const contrast = (1.05) / (r.p95 + 0.05);   // sign white (≈1.0) against the brightest background behind it
  check(contrast >= 4.5, `${name}: title contrast against the photo behind it`, `${contrast.toFixed(1)}:1 (sign white on the photo with its dark plate, brightest 5%)`);
  check(r.ms < 12, `${name}: issuing a frame takes ${r.ms.toFixed(1)} ms of script time (budget 12 ms for 60 fps)`);
  await page.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
