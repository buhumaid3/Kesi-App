// B12 checks on case 043 through the real UI: the timeline strip on the charge sheet (tap a card, tap a
// time; tap a placed card to take it off; drag a card onto a time), a wrong order returned, the right
// order accepted, and the timeline rail on the board, at three phone sizes.
// The investigation itself goes through the engine (ui-region1 covers investigating through the UI).
//   npm run play  then  node tests/ui-b12.mjs http://127.0.0.1:5173 [shots-dir]
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
  page.setDefaultTimeout(4000);
  page.on('pageerror', e => { fail++; console.log(`FAIL ${name} page error: ${e.message}`); });
  const shot = async f => { if (shots) await page.screenshot({ path: `${shots}/${name}-${f}.png` }); };
  const quiet = () => page.evaluate(() => { document.querySelectorAll('#notes .note').forEach(n => n.click()); document.querySelectorAll('.region-card-wrap').forEach(n => n.remove()); });
  const run = fn => page.evaluate(fn);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await run(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html?case=43`); await wait(1400); await quiet();
  await run(() => {
    const r = window.KESI.run;
    for (let i = 0; i < 20; i++) {
      for (const l of r.locations()) { r.visit(l.id); for (const h of r.hotspots(l.id)) { const x = r.tapHotspot(l.id, h.id); if (x?.gated?.ready) r.file(x.gated.id, h.id); } }
      for (const g of r.requests()) r.file(g.id);
      for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); }
      for (const k of r.contradictions) { const pid = r.claimOwner.get(k.claim), by = k.brokenBy.find(f => r.kF.has(f)); if (by && r.kF.has(k.claim) && !r.claimState(k.claim)) r.press(pid, k.claim, by); }
      for (const l of r.labsReady()) r.submitLab(l.id);
      if (r.labsPending().length) r.wait();
    }
    const c = r.c;
    for (const b of r.blanks) if (b.category !== 'strip') r.setBlank(b.id, b.answer);
  });
  await page.reload(); await wait(1400); await quiet();
  // The charge sheet.
  await page.locator('.dock-charge').click(); await wait(500); await quiet();
  check(await page.locator('.cs-strip .tl-slot').count() === 4, `${name} the charge sheet has the sequence of events with 4 times`);
  check(await page.locator('.cs-strip .tl-loose .tl-card').count() === 3, `${name} three event cards wait in the tray`);
  check(await page.locator('.card-btn--submit').isDisabled(), `${name} it can't be sent with cards off the strip`);
  await page.locator('.cs-strip').scrollIntoViewIfNeeded(); await shot('01-strip-empty');
  const strip = await run(() => window.KESI.run.blanks.find(b => b.category === 'strip').strip);
  const slotEl = id => page.locator(`.tl-slot[data-slot="${id}"]`);
  const cardEl = id => page.locator(`.tl-card[data-event="${id}"]`);
  // Tap a card, then a time: the act into a decoy time first (wrong), the others where they belong.
  const act = strip.events.find(e => e.act), decoy = strip.slots.find(s => !strip.events.some(e => e.slot === s.id));
  await cardEl(act.id).click(); await wait(150);
  check(await page.locator('.tl-slot.is-target').count() >= 1, `${name} with a card picked up, the empty times say "Put it here"`);
  await slotEl(decoy.id).click(); await wait(200);
  check(await slotEl(decoy.id).locator(`.tl-card[data-event="${act.id}"]`).count() === 1, `${name} tap a card, then a time: it goes there`);
  // Tap the placed card, then the tray: it comes off again.
  await cardEl(act.id).click(); await wait(150); await page.locator('.tl-tray .bank-h').click(); await wait(200);
  check(await page.locator(`.tl-loose .tl-card[data-event="${act.id}"]`).count() === 1, `${name} tap a placed card, then the tray: it comes off`);
  // Drag works too.
  const others = strip.events.filter(e => !e.act);
  { const a = await cardEl(others[0].id).boundingBox(); await slotEl(others[0].slot).scrollIntoViewIfNeeded(); const t = await slotEl(others[0].slot).boundingBox();
    const a2 = await cardEl(others[0].id).boundingBox();
    await page.mouse.move(a2.x + 20, a2.y + 10); await page.mouse.down(); await page.mouse.move(a2.x + 40, a2.y + 30, { steps: 4 }); await page.mouse.move(t.x + t.width - 30, t.y + t.height / 2, { steps: 8 }); await page.mouse.up(); await wait(250); }
  check(await slotEl(others[0].slot).locator(`.tl-card[data-event="${others[0].id}"]`).count() === 1, `${name} drag a card onto a time: it goes there`);
  for (const e of others.slice(1)) { await cardEl(e.id).click(); await wait(100); await slotEl(e.slot).click(); await wait(150); }
  await cardEl(act.id).click(); await wait(100); await slotEl(decoy.id).click(); await wait(200);
  check(await page.locator('.card-btn--submit').isEnabled(), `${name} with every card on the strip it can be sent`);
  await page.locator('.cs-strip').scrollIntoViewIfNeeded(); await shot('02-strip-wrong');
  await page.locator('.card-btn--submit').click(); await wait(900);
  const r1 = await run(() => { const r = window.KESI.run; return { wrong: r.s.wrong, passed: [...r.passed] }; });
  check(r1.wrong === 1 && !r1.passed.includes('g_when'), `${name} the act in the wrong time: the strip is returned`, `others accepted: ${r1.passed.join(', ')}`);
  check(await page.locator('.cs-result .st--ret').count() >= 1, `${name} RETURNED with Halima's line`);
  await shot('03-returned');
  // Move the act to its time: dropping it on a taken slot would swap; its own slot is empty.
  await cardEl(act.id).click(); await wait(100); await slotEl(act.slot).click(); await wait(200);
  check(await page.locator('.tl-slot .tl-card').count() === 3 && await slotEl(decoy.id).locator('.tl-card').count() === 0, `${name} moved: the decoy time is empty again`);
  check(await wide() <= 0, `${name} nothing wider than the screen (charge sheet)`);
  await page.locator('.card-btn--submit').click(); await wait(2600); await quiet();
  check(await run(() => window.KESI.run?.s?.solved ?? document.querySelector('.verdict') != null), `${name} the right order: accepted, case closed`);
  await shot('04-verdict');
  // The rail, on a fresh visit to case 43 (the board is in the closed case too, but open it on a fresh one).
  await page.goto(`${base}/index.html?case=43`); await wait(1200); await quiet();
  await run(() => { const r = window.KESI.run; for (const l of r.locations()) { r.visit(l.id); for (const h of r.hotspots(l.id)) r.tapHotspot(l.id, h.id); } for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); } });
  await page.locator('.dock-cork').click(); await wait(700); await quiet();
  const rail = await page.locator('.tl-rail .tl-fact').count();
  check(rail >= 3, `${name} the board has a timeline rail of times found`, `${rail} times`);
  const times = await page.locator('.tl-rail .tl-at').allTextContents();
  check(times[0] && times[0].startsWith('1') && !times[0].startsWith('0'), `${name} the rail starts the evening before the OB entry, not at midnight`, times.slice(0, 4).join(' · '));
  await page.locator('.tl-rail .tl-fact').first().click(); await wait(300);
  check(await page.locator('.tl-rail .tl-fact.is-pinned').count() === 1, `${name} tap a time on the rail: it's pinned`);
  await shot('05-rail');
  check(await wide() <= 0, `${name} nothing wider than the screen (board)`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
