// The title sequence at launch: full the first time, short after, a tap skips, Reduce Motion gets a still,
// the setting turns it off.   npm run play  then  node tests/ui-title.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
async function ctx(reduced) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await c.newPage(); page.on('pageerror', e => { fail++; console.log(`FAIL page error: ${e.message}`); });
  return { c, page };
}
{
  const { c, page } = await ctx(false);
  await page.goto(`${base}/index.html?reset&title`); await wait(600);
  check(await page.locator('.title-seq').count() === 1, 'first launch: the title sequence is on screen');
  await wait(1200);
  check(await page.locator('.title-seq').count() === 1, 'first launch: still playing after 1.8 s (the full version)');
  await page.locator('.title-seq').click(); await wait(700);
  check(await page.locator('.title-seq').count() === 0, 'a tap skips it');
  check(await page.evaluate(() => window.KESI.save.progress.titleSeen === true), 'it is remembered as seen');
  await page.goto(`${base}/index.html?title`); await wait(300);
  check(await page.locator('.title-seq').count() === 1, 'next launch: it plays again');
  await wait(4600);
  check(await page.locator('.title-seq').count() === 0, 'next launch: the short version ends by itself (about 3.5 s)');
  await page.evaluate(() => { window.KESI.save.settings.titleSeq = false; localStorage.setItem('kesi.save.v1', JSON.stringify(window.KESI.save)); });
  await page.goto(`${base}/index.html?title`); await wait(600);
  check(await page.locator('.title-seq').count() === 0, 'Settings → Title sequence off: no title');
  await c.close();
}
{
  const { c, page } = await ctx(true);
  await page.goto(`${base}/index.html?reset&title`); await wait(500);
  check(await page.locator('.title-seq.is-still').count() === 1, 'Reduce Motion: a still frame');
  const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.ts-stamp')).opacity);
  check(+vis > 0.9, 'Reduce Motion: the still shows the finished title');
  await wait(3300);
  check(await page.locator('.title-seq').count() === 0, 'Reduce Motion: it moves on by itself');
  await c.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
