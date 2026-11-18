// B11 checks on case 031 through the real UI: the case clock on the folder, the autopsy arriving by itself,
// sending tests to the lab, detaining a suspect, taking a detention sample, waiting for a result, the
// laboratory report, and nothing wider than the screen, at three phone sizes.
//   npm run play  then  node tests/ui-b11.mjs http://127.0.0.1:5173 [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', shots = process.argv[3] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SIZES = [['se1', 320, 568], ['iphone', 390, 844], ['landscape', 844, 390]];
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();

for (const [name, w, hgt] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: w < 800, deviceScaleFactor: shots ? 2 : 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);           // a pin under a card or off the photo fails fast instead of waiting 30 s
  page.on('pageerror', e => { fail++; console.log(`FAIL ${name} page error: ${e.message}`); });
  const shot = async f => { if (shots) await page.screenshot({ path: `${shots}/${name}-${f}.png` }); };
  const quiet = () => page.evaluate(() => { document.querySelectorAll('#notes .note').forEach(n => n.click()); document.querySelectorAll('.region-card-wrap').forEach(n => n.remove()); });
  const close = () => page.locator('#sheets .sheet-close').last().click().then(() => wait(200)).catch(() => {});
  const closeAll = async () => { for (let i = 0; i < 4 && await page.locator('#sheets .sheet-close').count(); i++) await close(); };
  const run = fn => page.evaluate(fn);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await run(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html?case=31`); await wait(1400); await quiet();

  check(await page.locator('.folder .clock .clock-t').count() === 1, `${name} the case clock is on the folder`, await page.locator('.clock-t').textContent());
  await shot('01-desk');
  // Investigate: every place and pin, everyone and every question, twice.
  for (let k = 0; k < 2; k++) {
    const nv = await page.locator('.visit-card').count();
    for (let i = 0; i < nv; i++) {
      await page.locator('.visit-card').nth(i).click(); await wait(250);
      const m = await page.locator('.hs-btn').count();
      for (let j = 0; j < m; j++) { await page.locator('.hs-btn').nth(j).click().catch(() => {}); await wait(80);
        const ap = page.locator('.cam-card .paper-form .btn'); if (await ap.count()) { await ap.first().click(); await wait(300); } }
      await closeAll(); await quiet();
    }
    // Open each person's sheet in the UI (the interview, its hours); the questions go through the engine,
    // because tapping a few hundred chips is what ui-region1 already covers and would take minutes here.
    const np = await page.locator('.id-card').count();
    for (let i = 0; i < np; i++) {
      await page.locator('.id-card').nth(i).click(); await wait(200); await quiet();
      await run(() => { const r = window.KESI.run, pid = r.s.view?.id; if (pid && r.canInterview(pid)) for (const t of r.topics(pid)) r.ask(pid, t.about); });
      await closeAll(); await quiet();
    }
  }
  const s1 = await run(() => { const r = window.KESI.run; return { hours: r.s.hours, autopsy: r.kE.has('ev_autopsy'), ready: r.labsReady().map(l => l.id) }; });
  check(s1.hours > 0, `${name} investigating moved the clock on`, `${s1.hours} h`);
  check(s1.autopsy, `${name} the autopsy report arrived by itself`);
  check(s1.ready.includes('ev_tox'), `${name} toxicology waits on the folder to be sent`);
  await page.locator('.fsec', { hasText: 'The lab' }).scrollIntoViewIfNeeded();
  await shot('02-lab');
  // Send toxicology.
  await page.locator('.lab-tag', { hasText: 'toxicology' }).locator('.btn').click(); await wait(300);
  const s2 = await run(() => window.KESI.run.labsPending().map(l => l.id));
  check(s2.includes('ev_tox') && await page.locator('.lab-tag.is-pending').count() === 1, `${name} sent: it shows as in the lab with its return time`);
  // Detain Kimaiyo from his sheet.
  await page.evaluate(() => [...document.querySelectorAll('.id-card')].find(c => c.getAttribute('aria-label').startsWith('Kimaiyo'))?.click()); await wait(400); await quiet();
  const det = page.locator('.sheet--person .custody .btn--danger');
  check(await det.count() === 1, `${name} the suspect's sheet offers Detain`);
  await det.click(); await wait(200);
  check(await page.locator('.ask-wrap').count() === 1, `${name} detaining asks first and explains the 24 hours`);
  await shot('03-detain-ask');
  await page.locator('.ask-wrap .btn').last().click(); await wait(500); await quiet();
  check(await page.locator('.sheet--person .custody.is-on').count() === 1, `${name} in custody: 24 hours left on the sheet`, await page.locator('.custody-h b').textContent().catch(() => ''));
  await page.locator('.sheet--person .custody').scrollIntoViewIfNeeded(); await shot('04-custody');
  await page.locator('.sheet--person .samples .btn').first().click(); await wait(400); await quiet();
  const s3 = await run(() => ({ sweater: window.KESI.run.kE.has('ev_sweater'), left: window.KESI.run.hoursLeft() }));
  check(s3.sweater && s3.left === 23, `${name} the sweater is taken in 1 h`, `${s3.left} h left`);
  await closeAll(); await quiet();
  check(await page.locator('.clock-custody').count() === 1, `${name} the folder clock shows who is in custody`);
  await page.locator('.lab-tag', { hasText: /fibre/i }).locator('.btn').click(); await wait(300);
  await page.locator('.fsec', { hasText: 'The lab' }).scrollIntoViewIfNeeded(); await shot('05-lab-pending');
  // Wait for results until the fibre comparison is back.
  for (let i = 0; i < 3 && !(await run(() => window.KESI.run.kE.has('ev_fibres'))); i++) { await page.locator('.lab-wait').click(); await wait(300); if (await page.locator('.ask-wrap').count()) await page.locator('.ask-wrap .btn').last().click(); await wait(300); await quiet(); }
  const s4 = await run(() => { const r = window.KESI.run; return { fibres: r.kE.has('ev_fibres'), detained: r.s.detained, left: r.hoursLeft() }; });
  check(s4.fibres && s4.detained === 'p_kimaiyo', `${name} the fibre result came back inside the 24 hours`, `${s4.left} h left`);
  // The lab report.
  await page.evaluate(() => [...document.querySelectorAll('.ex-tag')].find(t => /fibre/i.test(t.textContent))?.click()); await wait(500); await quiet();
  check(await page.locator('.sheet--doc .doc--lab .lab-findings li').count() >= 1, `${name} the laboratory report: received, reported, results, signed`);
  await shot('06-lab-report');
  check(await wide() <= 0, `${name} nothing wider than the screen`);
  await closeAll();
  await page.evaluate(() => [...document.querySelectorAll('.ex-tag')].find(t => /Autopsy/i.test(t.textContent))?.click()); await wait(500);
  await shot('07-autopsy');
  await closeAll();
  // Releasing ends it: no more questions.
  await page.evaluate(() => [...document.querySelectorAll('.id-card')].find(c => c.getAttribute('aria-label').startsWith('Kimaiyo'))?.click()); await wait(400); await quiet();
  await page.locator('.sheet--person .custody .link').click(); await wait(150); await page.locator('.ask-wrap .btn').last().click(); await wait(400);
  check(await page.locator('.sheet--person .custody.is-released').count() === 1 && await page.locator('.sheet--person .ask').count() === 0, `${name} released: no more questions`);
  await shot('08-released');
  check(await wide() <= 0, `${name} nothing wider than the screen (person sheet)`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
