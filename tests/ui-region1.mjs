// Plays all ten region 1 cases through the real interface, exactly as a thorough player would:
// every place, every hotspot, every person, every question; then the charge sheet with the
// answer from the case file. Checks the verdict, the unlock of the next case, the between-case
// messages, and the Pattern File after case 10. Usage: node tests/ui-region1.mjs http://127.0.0.1:8765
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8765';
const errors = []; let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const wait = ms => page.waitForTimeout(ms);
const closeTop = async () => { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (await x.count()) { await x.click(); await wait(240); } };
const closeAll = async () => { for (let i = 0; i < 6 && await page.locator('#sheets .sheet.is-in').count(); i++) await closeTop(); };
const quiet = () => page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
await page.goto(base + '/index.html?reset'); await wait(500);
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kesi.save.v1') || '{}'); }); 
await page.evaluate(() => { window.KESI.save.settings.intros = 'off'; });   // intros are covered by ui-smoke
// Skip the prologue.
await page.locator('.skip').click(); await wait(800); await quiet();
for (let n = 1; n <= 10; n++) {
  const c = JSON.parse(fs.readFileSync(`www/cases/case-${String(n).padStart(3, '0')}.json`, 'utf8'));
  if (n > 1) { await page.locator('.v-actions .card-btn--big').click(); await wait(900); await quiet(); }
  ok(await page.locator('.case-title').textContent() === c.meta.title, `case ${n}: folder opens (${c.meta.title})`);
  let before = -1;
  for (let round = 0; round < 6; round++) {
    const facts = await page.evaluate(() => window.KESI.run.kF.size + window.KESI.run.kE.size);
    if (facts === before) break; before = facts;
    for (let li = 0; li < await page.locator('.visit-card').count(); li++) {
      await page.locator('.visit-card').nth(li).click(); await wait(250); await quiet();
      for (let i = 0; i < await page.locator('.hs-btn').count(); i++) { await page.locator('.hs-btn').nth(i).click(); await wait(60); }
      await closeAll();
    }
    for (let i = 0; i < await page.locator('.id-card').count(); i++) {
      await page.locator('.id-card').nth(i).click(); await wait(200);
      for (let j = 0; j < await page.locator('.ask .chip').count(); j++) { await page.locator('.ask .chip').nth(j).click(); await wait(30); }
      await closeAll();
    }
  }
  const st = await page.evaluate(() => ({ f: window.KESI.run.kF.size, e: window.KESI.run.kE.size }));
  ok(st.f === c.facts.length && st.e === c.evidence.length, `case ${n}: found ${st.f}/${c.facts.length} facts, ${st.e}/${c.evidence.length} exhibits through the interface`);
  // Charge sheet.
  await page.locator('.dock-charge').click(); await wait(300); await quiet();
  for (const bl of c.chargeSheet.groups.flatMap(g => g.blanks)) {
    const word = c.words.find(w => w.id === bl.answer).text;
    await page.locator(`.cs-blank[data-blank="${bl.id}"]`).click(); await wait(80);
    await page.locator('.chip--word', { hasText: word }).first().click(); await wait(80);
  }
  await page.locator('.card-btn--submit').click(); await wait(250);
  if (await page.locator('.card-btn--submit', { hasText: 'SEND IT' }).count()) { await quiet(); await page.locator('.card-btn--submit').click(); }
  await wait(1500); await quiet();
  ok(await page.locator('.scr-verdict').count() === 1, `case ${n}: verdict screen`);
  const stars = await page.locator('.v-stars .stars').getAttribute('aria-label');
  ok(stars === '3 of 3 stars', `case ${n}: ${stars}`);
  const recon = await page.locator('.recon-step').count();
  ok(recon === c.solution.reconstruction.length, `case ${n}: reconstruction ${recon} steps, eliminations ${await page.locator('.elims li').count()}`);
}
const prog = await page.evaluate(() => window.KESI.save.progress);
ok(prog.flags.patternFile && prog.pattern.length >= 3, `Pattern File unlocked with ${prog.pattern.length} pins: ${prog.pattern.join(', ')}`);
ok(prog.collectibles.includes('col_omar_stamp'), 'collectible: Rashid Omar\'s brass shop stamp');
ok(Object.keys(prog.solved).length === 10, `solved ${Object.keys(prog.solved).length}/10`);
await page.locator('.v-actions .card-btn--ghost').click(); await wait(600); await quiet();
await page.locator('.shelf-item--cork').click(); await wait(800);
ok(await page.locator('.ppin').count() >= 3, `Pattern File shows ${await page.locator('.ppin').count()} pins`);
await page.screenshot({ path: process.argv[3] || 'pattern.png' });
await b.close();
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'No page errors.');
console.log(fails ? `${fails} failure(s)` : 'Region 1 plays end to end.');
process.exit(fails || errors.length ? 1 : 0);
