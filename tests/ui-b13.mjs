// B13 checks through the real UI: the site map on the folder (case 051): sites appear as they're found,
// tapping a site drives there (the clock moves on by the route's minutes) and opens it, the place cards say
// the drive time, the 4×4 moves; the WHERE line on the charge sheet (a wrong place returned, the right one
// accepted); and case 060's phone call after the verdict. At three phone sizes.
// The investigation itself goes through the engine (ui-region1 covers investigating through the UI).
//   npm run play  then  node tests/ui-b13.mjs http://127.0.0.1:5173 [shots-dir]
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
  const closeAll = async () => { for (let i = 0; i < 4 && await page.locator('#sheets .sheet-close').count(); i++) { await page.locator('#sheets .sheet-close').last().click().catch(() => {}); await wait(200); } };
  const run = fn => page.evaluate(fn);
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const toMap = () => page.evaluate(() => document.querySelector('.sm-wrap')?.scrollIntoView({ block: 'center' }));
  await page.goto(`${base}/index.html?reset&playtest`); await wait(600);
  await run(() => { window.KESI.save.settings.intros = 'off'; });
  await page.goto(`${base}/index.html?case=51`); await wait(1400); await quiet();

  // ── The map at the start ───────────────────────────────────────────────────────────────────────────
  check(await page.locator('.site-map svg').count() === 1, `${name} the folder has a site map`);
  const ids0 = await page.$$eval('.sm-site[data-site]', els => els.map(e => e.dataset.site));
  check(ids0.length === 2 && ids0.includes('loc_landing') && ids0.includes('loc_camp') && !ids0.includes('loc_launch'), `${name} only the sites you know are drawn`, ids0.join(' '));
  check(await page.locator('.sm-site.is-here[data-site="loc_landing"]').count() === 1 && await page.locator('.sm-site.is-scene[data-site="loc_landing"]').count() === 1, `${name} you start at the landing site, marked as the scene`);
  check(await page.locator('.sm-time').count() === 1 && /45 min/.test(await page.locator('.sm-time').textContent()), `${name} the route shows its drive time`);
  check(/DRIVE · 45 MIN/.test(await page.locator('.visit-card[data-lid="loc_camp"]').textContent()) && /HERE/.test(await page.locator('.visit-card[data-lid="loc_landing"]').textContent()), `${name} the place cards say "here" and the drive time`);
  await toMap(); await shot('01-map-start');
  // Look round the landing site: no drive.
  await page.locator('.visit-card[data-lid="loc_landing"]').click(); await wait(500); await quiet();
  const h1 = await run(() => window.KESI.run.s.hours);
  check(h1 === 1 && await run(() => window.KESI.run.s.driven) === 0, `${name} looking round where you are: 1 h, no drive`);
  await closeAll(); await quiet();
  // Tap the camp on the map: drive, then the camp opens.
  await toMap();
  await page.locator('.sm-site[data-site="loc_camp"]').click(); await wait(800);
  const s1 = await run(() => { const r = window.KESI.run; return { site: r.s.site, hours: r.s.hours, view: r.s.view?.id, clock: document.querySelector('.clock-t')?.textContent }; });
  check(s1.site === 'loc_camp' && s1.view === 'loc_camp', `${name} tap a site on the map: you drive there and it opens`);
  check(s1.hours === 2.75 && /:45$/.test(s1.clock || ''), `${name} the drive and the look round move the clock 1 h 45 min`, s1.clock);
  check(await page.locator('#notes, .toast, [role="status"]').filter({ hasText: '45 min by 4×4' }).count() >= 1, `${name} a note says how long the drive took`);
  await shot('02-arrived');
  await closeAll(); await quiet();
  await toMap();
  const car = await page.locator('.sm-car').getAttribute('transform'), campAt = await page.locator('.sm-site[data-site="loc_camp"]').getAttribute('transform');
  const num = t => (t.match(/-?[\d.]+/g) || []).map(Number);
  check(Math.abs(num(car)[0] - 15 - num(campAt)[0]) < 1, `${name} the 4×4 is parked at the camp now`);
  check(/Driven 45 min/.test(await page.locator('.sm-cap').textContent()) && /HERE/.test(await page.locator('.visit-card[data-lid="loc_camp"]').textContent()), `${name} "Driven 45 min", and the camp card says you're here`);

  // ── All sites found: investigate through the engine, then reload ─────────────────────────────────────
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
    r.visit('loc_camp');
  });
  await page.reload(); await wait(1400); await quiet();
  const ids1 = await page.$$eval('.sm-site[data-site]', els => els.map(e => e.dataset.site));
  check(ids1.length === 4, `${name} every site found is on the map`, ids1.join(' '));
  check(/DRIVE · 20 MIN: THE LAUNCH SITE|BACK · 20 MIN: THE LAUNCH SITE/.test(await page.locator('.visit-card[data-lid="loc_launch"]').textContent()), `${name} the launch site card: 20 min from the camp`);
  await toMap(); await shot('03-map-all');
  check(await wide() <= 0, `${name} nothing wider than the screen (folder)`);
  // The place card drives too; the switcher in the place sheet shows times.
  const hb = await run(() => window.KESI.run.s.hours);
  await page.locator('.visit-card[data-lid="loc_launch"]').click(); await wait(700); await quiet();
  const s2 = await run(() => ({ site: window.KESI.run.s.site, hours: window.KESI.run.s.hours }));
  check(s2.site === 'loc_launch' && Math.abs(s2.hours - hb - 20 / 60 - 1) < 1e-6, `${name} the place card drives the 20 min and opens the launch site`);
  check(await page.locator('.switcher--places .sw-drive').count() >= 2, `${name} the places switcher shows drive times`);
  await shot('04-launch');
  check(await wide() <= 0, `${name} nothing wider than the screen (place)`);
  await closeAll(); await quiet();
  // Keyboard: Enter on a site.
  await toMap();
  await page.locator('.sm-site[data-site="loc_talek"]').focus(); await page.keyboard.press('Enter'); await wait(700); await quiet();
  check(await run(() => window.KESI.run.s.site) === 'loc_talek', `${name} a site can be driven to from the keyboard`);
  await closeAll(); await quiet();

  // ── WHERE on the charge sheet ───────────────────────────────────────────────────────────────────────
  await run(() => {
    const r = window.KESI.run;
    for (const b of r.blanks) {
      if (b.category === 'strip') { for (const e of b.strip.events) r.placeEvent(b.id, e.id, e.slot); }
      else if (b.category !== 'place') r.setBlank(b.id, b.answer);
    }
  });
  await page.reload(); await wait(1400); await quiet();
  await page.locator('.dock-charge').click(); await wait(500); await quiet();
  await page.locator('.cs-blank[data-blank="where"]').click(); await wait(200);
  const bank = await page.locator('.bank .chip--word').allTextContents();
  check(/place/i.test(await page.locator('.bank > .bank-h').textContent()) && bank.length >= 4, `${name} the WHERE blank has its own bank of places`, bank.join(' · '));
  await page.locator('.bank .chip--word', { hasText: /landing/i }).first().click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(900);
  const r1 = await run(() => ({ wrong: window.KESI.run.s.wrong, passed: [...window.KESI.run.passed] }));
  check(r1.wrong === 1 && !r1.passed.includes('g_where'), `${name} the landing site (where she was found) is returned`, `accepted: ${r1.passed.join(', ')}`);
  check(await page.locator('.cs-result').filter({ hasText: /red soil|boots|06:52/i }).count() >= 1, `${name} Halima says why`);
  await shot('05-where-returned');
  await page.locator('.cs-blank[data-blank="where"]').click(); await wait(200);
  await page.locator('.bank .chip--word', { hasText: /launch/i }).first().click(); await wait(200);
  await page.locator('.card-btn--submit').click(); await wait(2600); await quiet();
  check(await run(() => !!window.KESI.run?.s?.solved || !!document.querySelector('.verdict')), `${name} the launch site: accepted, case closed`);
  check(await wide() <= 0, `${name} nothing wider than the screen (verdict)`);

  // ── Case 060: the phone call after the verdict ─────────────────────────────────────────────────────
  if (name !== 'landscape') {
    // The Pattern File as a player who solved 1–59 has it (the last blank needs a pin from earlier cases).
    const pinsBefore = (() => { const K = JSON.parse(fs.readFileSync('www/cases/_campaign.json', 'utf8')), out = [...(K.patternFile.openingPins || [])];
      for (let m = 1; m < 60; m++) for (const f of JSON.parse(fs.readFileSync(`www/cases/case-${String(m).padStart(3, '0')}.json`, 'utf8')).facts) if (f.spine) out.push(`case-${String(m).padStart(3, '0')}:${f.id}`);
      return out; })();
    await page.evaluate(pins => { const pr = window.KESI.save.progress; pr.flags.patternFile = true; pr.pattern = [...new Set([...(pr.pattern || []), ...pins])]; }, pinsBefore);
    await page.goto(`${base}/index.html?case=60`); await wait(1400); await quiet();
    await run(() => {
      const r = window.KESI.run;
      for (let i = 0; i < 25; i++) {
        for (const l of r.locations()) { r.visit(l.id); for (const h of r.hotspots(l.id)) { const x = r.tapHotspot(l.id, h.id); if (x?.gated?.ready) r.file(x.gated.id, h.id); } }
        for (const g of r.requests()) r.file(g.id);
        for (const p of r.people()) if (r.canInterview(p.id)) { r.interview(p.id); for (const t of r.topics(p.id)) r.ask(p.id, t.about); }
        for (const k of r.contradictions) { const pid = r.claimOwner.get(k.claim), by = k.brokenBy.find(f => r.kF.has(f)); if (by && r.kF.has(k.claim) && !r.claimState(k.claim)) r.press(pid, k.claim, by); }
        for (const l of r.labsReady()) r.submitLab(l.id);
        if (r.labsPending().length) r.wait();
        const next = r.samples.find(e => !r.kE.has(e.id) && !r.s.everDetained.includes(e.detention));
        if (next && i > 8) { if (r.s.detained) r.release(); if (r.detain(next.detention)) for (const e of r.samplesFor(next.detention)) r.sample(e.id); }
      }
      for (const b of r.blanks) { if (b.category === 'strip') for (const e of b.strip.events) r.placeEvent(b.id, e.id, e.slot); else r.setBlank(b.id, b.answer); }
    });
    await page.reload(); await wait(1400); await quiet();
    await page.locator('.dock-charge').click(); await wait(500); await quiet();
    await page.locator('.card-btn--submit').click(); await wait(3000); await quiet();
    const onVerdict = await page.locator('.verdict').count();
    check(onVerdict === 1, `${name} case 060 closes on the verdict`);
    await page.evaluate(() => document.querySelector('.after-choice')?.scrollIntoView({ block: 'center' }));
    check(await page.locator('.after-choice .after-opts .btn').count() === 2, `${name} the desk phone rings: Answer or Let it ring`);
    await shot('06-phone');
    await page.locator('.after-choice .btn[data-choice="let_ring"]').click(); await wait(300);
    check(await page.locator('.after-result').filter({ hasText: /voice-note/ }).count() === 1 && await run(() => window.KESI.save.progress.choices?.ch_answer_mwalimu) === 'let_ring', `${name} let it ring: a voice-note arrives; the choice is kept`);
    await shot('07-phone-after');
    check(await wide() <= 0, `${name} nothing wider than the screen (case 060 verdict)`);
  }
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
