// B15 checks on case 071 through the real UI, at three phone sizes: the Expected list at a place (items
// appear once you know why; Check says present or missing; a missing one becomes a dotted fact), the place
// card's "to check" count, the county-lab hours on the lab card, and the ABSENCE line on the charge sheet
// (a wrong absence returned with Halima's line, the right one accepted).
// The investigation itself goes through the engine (ui-region1 covers investigating through the UI).
//   npm run play  then  node tests/ui-b15.mjs http://127.0.0.1:5173 [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', shots = process.argv[3] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SIZES = [['se1', 320, 568], ['iphone', 390, 844], ['landscape', 844, 390]];
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Everything a player can do, in the page, except checking the Expected lists.
const EXPLORE = `() => {
  const r = window.KESI.run;
  for (let i = 0; i < 30; i++) {
    for (const l of r.locations()) { r.visit(l.id); for (const h of r.hotspots(l.id)) { const x = r.tapHotspot(l.id, h.id); if (x?.gated?.ready) r.file(x.gated.id, h.id); } }
    for (const g of r.requests()) r.file(g.id);
    for (const p of r.people()) if (r.lawyered(p.id)) { const f = r.interrogation.get(p.id).lawyered.reopenedBy.find(x => r.kF.has(x)); if (f) r.reopen(p.id, f); }
    for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); }
    for (const k of r.contradictions) { const pid = r.claimOwner.get(k.claim), by = k.brokenBy.find(f => r.kF.has(f)); if (by && r.kF.has(k.claim) && !r.claimState(k.claim)) r.press(pid, k.claim, by); }
    if (i === 3) for (const l of r.labsReady()) r.submitLab(l.id);
  }
}`;
const b = await chromium.launch();

for (const [name, w, hgt] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: w < 800, deviceScaleFactor: shots ? 2 : 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  page.on('pageerror', e => { fail++; console.log(`FAIL ${name} page error: ${e.message}`); });
  const shot = async f => { if (shots) await page.screenshot({ path: `${shots}/${name}-${f}.png` }); };
  const quiet = () => page.evaluate(() => { document.querySelectorAll('#notes .note').forEach(n => n.click()); document.querySelectorAll('.region-card-wrap').forEach(n => n.remove()); });
  const closeAll = async () => { for (let i = 0; i < 5 && await page.locator('#sheets .sheet-close').count(); i++) { await page.locator('#sheets .sheet-close').last().click().catch(() => {}); await wait(200); } };
  const run = fn => page.evaluate(fn);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await run(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html?case=71`); await wait(1400); await quiet();
  await page.evaluate(`(${EXPLORE})()`);
  await page.reload(); await wait(1400); await quiet();

  // The lab card says the samples travel.
  const lab = await page.locator('.lab-tag .lab-time').allTextContents();
  check(lab.length === 0 || lab.some(t => /county lab/.test(t)) || await page.locator('.lab-tag.is-pending').count() > 0, `${name} lab cards include the hours on the road to the county lab`, lab.join(' | ') || 'all sent');
  const t4 = await run(() => window.KESI.run.labsReady().concat([]).map(l => l.hours));
  // The place card counts what's left to check.
  check(/to check/.test(await page.locator('.visit-card[data-lid="loc_compound"]').textContent()), `${name} the compound's card says how many things are left to check`, await page.locator('.visit-card[data-lid="loc_compound"] .vc-check').textContent().catch(() => ''));
  await page.locator('.visit-card[data-lid="loc_compound"]').click(); await wait(700); await quiet();
  const items = await page.locator('.expected .exp-item').count(), total = await run(() => window.KESI.run.byId.get('loc_compound').expected.length);
  check(await page.locator('.expected').count() === 1 && items >= 3 && items <= total, `${name} "Expected here": what should be at the compound, and why`, `${items} of ${total} shown`);
  const why = await page.locator('.exp-item[data-x="x_bark"] .exp-why').textContent();
  check(/Because:/.test(why) && why.length > 20, `${name} each item says why you expect it`, why.slice(0, 70));
  await page.locator('.expected').scrollIntoViewIfNeeded(); await shot('01-expected');
  // Present: the dogs are chained.
  await page.locator('.exp-item[data-x="x_chain"] .exp-check').click(); await wait(400); await quiet();
  check(await page.locator('.exp-item[data-x="x_chain"].is-present .exp-stamp').count() === 1 && !(await run(() => window.KESI.run.kF.has('f_abs_dogs'))), `${name} the dogs are chained: PRESENT, nothing new`);
  // Missing: the dogs didn't bark.
  await page.locator('.exp-item[data-x="x_bark"] .exp-check').click(); await wait(500);
  check(await page.locator('.exp-item[data-x="x_bark"].is-missing .exp-stamp').count() === 1 && await run(() => window.KESI.run.kF.has('f_abs_dogs')), `${name} the dogs didn't bark: MISSING, and it goes to the notebook`);
  check(await page.locator('#notes, .toast, [role="status"]').filter({ hasText: 'Missing' }).count() >= 1, `${name} a note says what was noted as missing`);
  await quiet();
  for (const x of await page.$$eval('.exp-item .exp-check', bs => bs.map(b2 => b2.closest('.exp-item').dataset.x))) { await page.locator(`.exp-item[data-x="${x}"] .exp-check`).click(); await wait(250); await quiet(); }
  await page.locator('.expected').scrollIntoViewIfNeeded(); await shot('02-checked');
  check(await wide() <= 0, `${name} nothing wider than the screen (place)`);
  await closeAll(); await quiet();
  // The notebook marks missing facts.
  await page.locator('.dock-note').click(); await wait(500); await quiet();
  await page.locator('.nb-tab', { hasText: 'Places' }).click(); await wait(300);
  check(await page.locator('.nb-line.is-absence').count() >= 2, `${name} the notebook shows missing things as dotted lines`);
  await page.locator('.nb-line.is-absence').first().scrollIntoViewIfNeeded(); await shot('03-notebook');
  await closeAll(); await quiet();

  // ── ABSENCE on the charge sheet ─────────────────────────────────────────────────────────────────────
  await run(() => { const r = window.KESI.run; for (const l of r.locations()) if (r.visited.has(l.id)) for (const x of r.expectedAt(l.id)) r.checkExpected(l.id, x.id);
    for (const bl of r.blanks) { if (bl.category === 'strip') for (const e of bl.strip.events) r.placeEvent(bl.id, e.id, e.slot); else if (bl.id !== 'missing') r.setBlank(bl.id, bl.answer); } });
  await page.reload(); await wait(1400); await quiet();
  await page.locator('.dock-charge').click(); await wait(500); await quiet();
  check(/shows that/.test(await page.locator('.cs-sentence').textContent()), `${name} the sheet asks what was missing, and what it shows`);
  await page.locator('.cs-blank[data-blank="missing"]').click(); await wait(150);
  const opts = await page.locator('.bank .chip--word').allTextContents();
  check(opts.length >= 5 && opts.some(t => /bark/.test(t)), `${name} the absence bank lists what you found missing`, opts.join(' · '));
  await page.locator('.bank .chip--word', { hasText: /climbing/ }).click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(900);
  const r1 = await run(() => ({ passed: [...window.KESI.run.passed], wrong: window.KESI.run.s.wrong }));
  check(!r1.passed.includes('g_absence') && r1.wrong === 1, `${name} no climbing marks → the dogs knew him: returned`, `accepted: ${r1.passed.join(', ')}`);
  check(await page.locator('.cs-result').filter({ hasText: /climb|dogs knew|robbery/i }).count() >= 1, `${name} Halima says what that absence does and doesn't prove`);
  await shot('04-returned');
  await page.locator('.cs-blank[data-blank="missing"]').click(); await wait(150);
  await page.locator('.bank .chip--word', { hasText: /bark/ }).click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(2600); await quiet();
  check(await run(() => !!window.KESI.run?.s?.solved || !!document.querySelector('.verdict')), `${name} the dogs didn't bark → someone they knew: accepted, case closed`);
  check(await wide() <= 0, `${name} nothing wider than the screen (verdict)`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
