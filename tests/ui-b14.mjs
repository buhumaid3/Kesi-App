// B14 checks through the real UI, at three phone sizes:
//  case 062: a lawyered suspect (the advocate block, a wrong fact costs a stamp, the right one reopens the
//  interview), documents side by side (flip on a phone, two columns when wide), the FORGERY line (a genuine
//  document returned, the forged one with its tell accepted);
//  case 070: the kitchen-table scene after the verdict, and the Pattern File notes it files.
// The investigation itself goes through the engine (ui-region1 covers investigating through the UI).
//   npm run play  then  node tests/ui-b14.mjs http://127.0.0.1:5173 [shots-dir]
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
// Everything a player can do, in the page; reopening lawyered suspects only if asked.
const EXPLORE = `(reopen) => {
  const r = window.KESI.run;
  for (let i = 0; i < 30; i++) {
    for (const l of r.locations()) { r.visit(l.id); for (const h of r.hotspots(l.id)) { const x = r.tapHotspot(l.id, h.id); if (x?.gated?.ready) r.file(x.gated.id, h.id); } }
    for (const g of r.requests()) r.file(g.id);
    if (reopen) for (const p of r.people()) if (r.lawyered(p.id)) { const f = r.interrogation.get(p.id).lawyered.reopenedBy.find(x => r.kF.has(x)); if (f) r.reopen(p.id, f); }
    for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); }
    for (const k of r.contradictions) { const pid = r.claimOwner.get(k.claim), by = k.brokenBy.find(f => r.kF.has(f)); if (by && r.kF.has(k.claim) && !r.claimState(k.claim)) r.press(pid, k.claim, by); }
    for (const l of r.labsReady()) r.submitLab(l.id);
    if (r.labsPending().length) r.wait();
    const next = r.samples.find(e => !r.kE.has(e.id) && !r.s.everDetained.includes(e.detention));
    if (next && i > 10) { if (r.s.detained) r.release(); if (r.detain(next.detention)) for (const e of r.samplesFor(next.detention)) r.sample(e.id); }
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

  // ── Case 062: the advocate ──────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/index.html?case=62`); await wait(1400); await quiet();
  await page.evaluate(`(${EXPLORE})(false)`);
  await page.reload(); await wait(1400); await quiet();
  await page.evaluate(() => [...document.querySelectorAll('.id-card')].find(c => c.getAttribute('aria-label').startsWith('Thuo'))?.click()); await wait(500); await quiet();
  check(await page.locator('.sheet--person .advocate').count() === 1 && /Muchiri/.test(await page.locator('.adv-name').textContent()) && await page.locator('.sheet--person .ask').count() === 0,
    `${name} Thuo is represented: Advocate Muchiri answers, no questions`);
  check(await page.locator('.adv-face').count() === 1, `${name} the advocate's portrait`);
  await page.locator('.advocate').scrollIntoViewIfNeeded(); await shot('01-advocate');
  const st0 = await run(() => window.KESI.run.s.credibility);
  await page.locator('.advocate .btn--primary').click(); await wait(400);
  check(await page.locator('.sheet--press .press-fact').count() >= 5, `${name} "Present something" opens the facts you know`);
  const wrong = await run(() => { const r = window.KESI.run, ok = r.interrogation.get('p_thuo').lawyered.reopenedBy; return [...r.kF].find(f => !ok.includes(f) && document.querySelector(`.press-fact[data-fact="${f}"]`)); });
  await page.locator(`.press-fact[data-fact="${wrong}"]`).click(); await wait(400);
  check(await run(() => window.KESI.run.s.credibility) === st0 - 1 && await page.locator(`.press-fact[data-fact="${wrong}"]`).isDisabled(), `${name} a wrong fact: one stamp gone, and it's marked "changed nothing"`);
  await shot('02-wrong');
  await page.locator('.sheet--press .nb-search').fill('death'); await wait(200);
  await page.locator('.press-fact[data-fact="f_death_reg"]').click(); await wait(1200); await quiet();
  check(await page.locator('.sheet--person .advocate').count() === 0 && await page.locator('.sheet--person .ask').count() === 1 && await run(() => window.KESI.run.canInterview('p_thuo')),
    `${name} the death register: the advocate lets Thuo answer, the interview opens`);
  await shot('03-reopened');
  check(await wide() <= 0, `${name} nothing wider than the screen (person)`);
  await closeAll(); await quiet();

  // ── Documents side by side ──────────────────────────────────────────────────────────────────────────
  await page.evaluate(`(${EXPLORE})(true)`);
  await page.reload(); await wait(1400); await quiet();
  await page.evaluate(() => [...document.querySelectorAll('.ex-tag')].find(t => /codicil/i.test(t.textContent))?.click()); await wait(500); await quiet();
  check(await page.locator('.doc-actions .btn', { hasText: 'Compare side by side' }).count() === 1, `${name} a document offers "Compare side by side"`);
  await page.locator('.doc-actions .btn', { hasText: 'Compare side by side' }).click(); await wait(500); await quiet();
  const cols = await page.locator('.sheet--compare .cmp-col').count(), hidden = await page.locator('.sheet--compare .cmp-col.is-hidden').count();
  const isWide = w >= 760;
  check(cols === 2 && hidden === (isWide ? 0 : 1), `${name} two documents: ${isWide ? 'side by side' : 'one at a time, to flip'}`);
  const titles = await page.$$eval('.sheet--compare .cmp-pick', s => s.map(x => x.selectedOptions[0].textContent));
  check(/codicil/i.test(titles[0]) && /will/i.test(titles[1]), `${name} the codicil beside the will`, titles.join(' | '));
  await shot('04-compare');
  if (!isWide) {
    await page.locator('.cmp-flip .nb-tab').nth(1).click(); await wait(250);
    check(await page.locator('.cmp-col[data-which="b"]:not(.is-hidden)').count() === 1, `${name} flip: the other document in the same place`);
    await shot('05-compare-flip');
  }
  const opts = await page.$$eval('.sheet--compare .cmp-pick', s => s[1].options.length);
  check(opts >= 3, `${name} either side can be any document in hand`, `${opts} to choose from`);
  check(await wide() <= 0, `${name} nothing wider than the screen (compare)`);
  await closeAll(); await quiet();

  // ── FORGERY on the charge sheet ─────────────────────────────────────────────────────────────────────
  await run(() => { const r = window.KESI.run; for (const bl of r.blanks) { if (bl.category === 'strip') for (const e of bl.strip.events) r.placeEvent(bl.id, e.id, e.slot); else if (bl.id !== 'document') r.setBlank(bl.id, bl.answer); } });
  await page.reload(); await wait(1400); await quiet();
  await page.locator('.dock-charge').click(); await wait(500); await quiet();
  check(/was forged, as shown by/.test(await page.locator('.cs-sentence').textContent()), `${name} the sheet asks which document was forged, and what shows it`);
  await page.locator('.cs-blank[data-blank="document"]').click(); await wait(150);
  const docs = await page.locator('.bank .chip--word').allTextContents();
  check(docs.length >= 5, `${name} the document bank`, docs.join(' · '));
  await page.locator('.bank .chip--word', { hasText: /February will/i }).first().click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(900);
  const r1 = await run(() => ({ passed: [...window.KESI.run.passed], wrong: window.KESI.run.s.wrong }));
  check(!r1.passed.includes('g_forgery') && r1.wrong === 1, `${name} a genuine document named as the forgery: returned`, `accepted: ${r1.passed.join(', ')}`);
  await shot('06-forgery-returned');
  await page.locator('.cs-blank[data-blank="document"]').click(); await wait(150);
  await page.locator('.bank .chip--word', { hasText: /codicil/i }).first().click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(2600); await quiet();
  check(await run(() => !!window.KESI.run?.s?.solved || !!document.querySelector('.verdict')), `${name} the codicil, with its tell: accepted, case closed`);
  check(await wide() <= 0, `${name} nothing wider than the screen (verdict)`);

  // ── Case 070: the kitchen table ─────────────────────────────────────────────────────────────────────
  if (name !== 'landscape') {
    await page.evaluate(pins => { const pr = window.KESI.save.progress; pr.flags.patternFile = true; pr.pattern = [...new Set([...(pr.pattern || []), ...pins])]; pr.choices = { ch_answer_mwalimu: 'answer' }; }, pinsBefore(70));
    await page.goto(`${base}/index.html?case=70`); await wait(1400); await quiet();
    await page.evaluate(`(${EXPLORE})(true)`);
    await run(() => { const r = window.KESI.run; for (const bl of r.blanks) { if (bl.category === 'strip') for (const e of bl.strip.events) r.placeEvent(bl.id, e.id, e.slot); else r.setBlank(bl.id, bl.answer); } });
    await page.reload(); await wait(1400); await quiet();
    await page.locator('.dock-charge').click(); await wait(500); await quiet();
    await page.locator('.card-btn--submit').click(); await wait(3200); await quiet();
    check(await page.locator('.verdict').count() === 1, `${name} case 070 closes on the verdict`);
    await page.evaluate(() => document.querySelector('.after-scene')?.scrollIntoView({ block: 'center' }));
    check(await page.locator('.after-scene .scene-next').count() === 1 && await page.locator('.after-scene .scene-line').count() === 0, `${name} the kitchen table: nothing until you sit down`);
    for (let i = 0; i < 7; i++) { await page.locator('.after-scene .scene-next').click(); await wait(120); }
    check(await page.locator('.after-scene .scene-line').count() === 7 && await page.locator('.after-scene .scene-next').count() === 0, `${name} seven quiet beats, one tap each, then it ends`);
    check(await page.locator('.after-scene .after-files li').count() === 2, `${name} what she said goes to the Pattern File`);
    await shot('07-kitchen');
    const notes = await run(() => (window.KESI.save.progress.patternNotes || []).filter(x => x.case === 70).length);
    check(notes === 4, `${name} four Pattern File notes filed from case 070`, `${notes}`);
    check(await wide() <= 0, `${name} nothing wider than the screen (case 070 verdict)`);
    // The Pattern File shows them.
    await page.goto(`${base}/index.html`); await wait(1200); await quiet();
    const shelf = page.locator('.shelf-item--cork'); if (await shelf.count()) { await shelf.click(); await wait(900); }
    check(await page.locator('.sheet--board .ppin.is-note').count() >= 4, `${name} the Pattern File shows the notes`);
    await shot('08-pattern');
  }
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
