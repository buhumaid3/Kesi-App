// Frame strips of the launch prototypes: node tools/dev/launch-strip.mjs <outdir>  (server on :5173)
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const SIZES = { se: [375, 667], i15: [393, 852], ipad: [820, 1180] };
const TIMES = { lamp: [0.3, 0.8, 1.5, 2.2, 2.9, 3.4, 4.0, 4.9, 6.1], string: [0.5, 1.4, 2.3, 3.0, 3.7, 4.1, 4.5, 5.3, 6.2] };
const b = await chromium.launch(); const errs = [];
for (const v of Object.keys(TIMES)) for (const [sz, [w, h]] of Object.entries(SIZES)) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push(`${v} ${sz}: ${e.message}`));
  await p.goto(`http://localhost:5173/preview/launch.html?v=${v}&t=0`); await p.waitForSelector('body[data-ready]');
  for (const t of TIMES[v]) { await p.evaluate(t => window.__render(t), t); await p.screenshot({ path: `${out}/${v}-${sz}-${t.toFixed(1)}.png` }); }
  await p.close();
}
await b.close(); console.log(errs.join('\n') || 'no errors');
