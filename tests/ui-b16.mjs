// B16 checks through the real UI, at three phone sizes: case 090 reviewed by Rukia Hassan (the sheet, a
// returned group, the verdict); case 100 closed, then the ending (the epilogue cards, Joseph's file typed and
// stamped CLOSED, Mwalimu's last voice-note, a new folder, back to the cabinet); the cabinet with all ten
// regions. The investigation itself goes through the engine (ui-region1 covers investigating through the UI).
//   npm run play  then  node tests/ui-b16.mjs http://127.0.0.1:5173 [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', shots = process.argv[3] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const SIZES = [['se1', 320, 568], ['iphone', 390, 844], ['landscape', 844, 390]];
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(3, '0');
const pinsBefore = n => { const K = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8')), out = [...K.patternFile.openingPins];
  for (let m = 1; m < n; m++) for (const f of JSON.parse(fs.readFileSync(`www/cases/case-${pad(m)}.json`, 'utf8')).facts) if (f.spine) out.push(`case-${pad(m)}:${f.id}`); return out; };
const EXPLORE = `() => {
  const r = window.KESI.run;
  for (let i = 0; i < 40; i++) {
    for (const l of r.locations()) { r.visit(l.id); for (const x of r.expectedAt(l.id)) r.checkExpected(l.id, x.id); for (const h of r.hotspots(l.id)) { const x = r.tapHotspot(l.id, h.id); if (x?.gated?.ready) r.file(x.gated.id, h.id); } }
    for (const g of r.requests()) r.file(g.id);
    for (const p of r.people()) if (r.lawyered(p.id)) { const f = r.interrogation.get(p.id).lawyered.reopenedBy.find(x => r.kF.has(x)); if (f) r.reopen(p.id, f); }
    for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); }
    for (const k of r.contradictions) { const pid = r.claimOwner.get(k.claim), by = k.brokenBy.find(f => r.kF.has(f)); if (by && r.kF.has(k.claim) && !r.claimState(k.claim)) r.press(pid, k.claim, by); }
    for (const l of r.labsReady()) r.submitLab(l.id);
    if (r.labsPending().length) r.wait();
    const next = r.samples.find(e => !r.kE.has(e.id) && !r.s.everDetained.includes(e.detention));
    if (next && i > 12) { if (r.s.detained) r.release(); if (r.detain(next.detention)) { for (const e of r.samplesFor(next.detention)) r.sample(e.id); for (const l of r.labsReady()) r.submitLab(l.id); while (r.labsPending().length && r.s.detained) r.wait(); } }
  }
  for (const b of r.blanks) { if (b.category === 'strip') for (const e of b.strip.events) r.placeEvent(b.id, e.id, e.slot); else r.setBlank(b.id, b.answer); }
}`;
const b = await chromium.launch();

for (const [name, w, hgt] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: w < 800, deviceScaleFactor: shots ? 2 : 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { fail++; console.log(`FAIL ${name} page error: ${e.message}`); });
  const shot = async f => { if (shots) await page.screenshot({ path: `${shots}/${name}-${f}.png` }); };
  const quiet = () => page.evaluate(() => { document.querySelectorAll('#notes .note').forEach(n => n.click()); document.querySelectorAll('.region-card-wrap').forEach(n => n.remove()); });
  const run = fn => page.evaluate(fn);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await page.evaluate(pins => { const K = window.KESI; K.save.settings.intros = 'off'; const pr = K.save.progress; pr.flags.patternFile = true; pr.pattern = [...new Set([...(pr.pattern || []), ...pins])]; }, pinsBefore(100));

  // ── Case 090: Rukia Hassan reviews ──────────────────────────────────────────────────────────────────
  await page.goto(`${base}/index.html?case=90`); await wait(1400); await quiet();
  await page.evaluate(`(${EXPLORE})()`);
  const g90 = await run(() => { const r = window.KESI.run, b = r.blanks.find(x => x.category === 'person' && x.id === 'who'); const wrong = r.options('who').find(w => w.id !== b.answer); r.setBlank('who', wrong.id); return b.answer; });
  await page.reload(); await wait(1400); await quiet();
  await page.locator('.dock-charge').click(); await wait(600); await quiet();
  check(/R\. Hassan/.test(await page.locator('.cs-meta').textContent()), `${name} case 090's sheet: Reviewer R. Hassan`);
  await page.locator('.card-btn--submit').click(); await wait(900);
  check(await page.locator('.cs-result .halima b').filter({ hasText: 'R. Hassan' }).count() >= 1 && await page.locator('.cs-result .halima b').filter({ hasText: 'H. Abdi' }).count() === 0, `${name} returned groups are in Rukia Hassan's name, not Halima's`);
  await shot('01-hassan');
  await page.evaluate(a => window.KESI.run.setBlank('who', a), g90);
  await page.locator('.sheet-close').last().click(); await wait(300); await page.locator('.dock-charge').click(); await wait(500); await quiet();
  await page.locator('.card-btn--submit').click(); await wait(3000); await quiet();
  check(await page.locator('.verdict').count() === 1 && /R\. Hassan/.test(await page.locator('.v-sheet .halima.big b').textContent()), `${name} case 090 closes; the verdict is hers`);
  check(/suspension is lifted/.test(await page.locator('.v-sheet').textContent()), `${name} and Halima is cleared`);
  check(await page.locator('.after-beat:empty').count() === 0, `${name} no empty lines in Afterwards`);

  // ── Case 100 and the ending ─────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/index.html?case=100`); await wait(1500); await quiet();
  await page.evaluate(`(${EXPLORE})()`);
  await page.reload(); await wait(1500); await quiet();
  await page.locator('.dock-charge').click(); await wait(600); await quiet();
  check(await page.locator('.card-btn--submit').isEnabled(), `${name} case 100: the whole sheet filled`);
  await page.locator('.card-btn--submit').click(); await wait(3200); await quiet();
  check(await page.locator('.verdict').count() === 1 && /All of it/.test(await page.locator('.v-sheet').textContent()), `${name} case 100 accepted: "Accepted. All of it. Sign it, Amani."`);
  check(await page.locator('.after-files li').count() === 6, `${name} six threads closed in the Pattern File`);
  check(await page.locator('.after-beat', { hasText: /epilogue strip/ }).count() === 0, `${name} the ending isn't spoiled in the Afterwards list`);
  await page.locator('.card-btn--final').scrollIntoViewIfNeeded(); await shot('02-final-verdict');
  await page.locator('.card-btn--final').click(); await wait(900);
  const cards = await page.locator('.epi-card').count();
  check(await page.locator('.ending').count() === 1 && cards >= 5, `${name} the epilogue: silent cards`, `${cards} cards`);
  check(/Mwalimu in a court corridor/.test(await page.locator('.epi-strip').textContent()), `${name} Mwalimu in a court corridor, first`);
  await shot('03-epilogue');
  check(await wide() <= 0, `${name} nothing wider than the screen (epilogue)`);
  await page.locator('.end-next').click(); await wait(800);
  check(await page.locator('.end-folder .end-tab').filter({ hasText: 'MWENDA, J.' }).count() === 1, `${name} the prologue's drawer: Joseph's folder`);
  check(/Not a robbery\./.test(await page.locator('.end-ob').textContent()) && /Margaret Kabiru/.test(await page.locator('.end-ob').textContent()), `${name} the new OB entry is typed in: the truth, and "Not a robbery."`);
  check(await page.locator('.end-closed.is-stamped').count() === 1 && await page.locator('.end-closed.st--ret').count() === 1, `${name} CLOSED, in red`);
  check(await page.locator('.end-next').isEnabled(), `${name} then it lets you go on`);
  await shot('04-drawer');
  check(await wide() <= 0, `${name} nothing wider than the screen (drawer)`);
  await page.locator('.end-next').click(); await wait(800);
  check(/By the book\./.test(await page.locator('.end-note').textContent()), `${name} Mwalimu's last voice-note`);
  check(/OB 02\/05\/12/.test(await page.locator('.end-newfolder').textContent()), `${name} a new folder: OB 02/05/12, unopened`);
  check(/cases closed/.test(await page.locator('.end-stat').textContent()), `${name} the tally`, await page.locator('.end-stat').textContent());
  await shot('05-last');
  check(await run(() => !!window.KESI.save.progress.flags.finished), `${name} the campaign is marked finished`);
  await page.locator('.end-next').click(); await wait(1000); await quiet();
  const drawers = await page.locator('.drawer, details.drawer, .cab-drawer').count();
  check(await page.locator('.verdict, .ending').count() === 0 && drawers >= 10, `${name} back to the cabinet: all ten regions`, `${drawers} drawers`);
  await shot('06-cabinet');
  check(await wide() <= 0, `${name} nothing wider than the screen (cabinet)`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
