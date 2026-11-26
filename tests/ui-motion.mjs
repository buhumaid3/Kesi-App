// Motion across the game (polish P4): each moment happens, common paths stay within 600 ms per animation,
// Reduce Motion removes movement, desk life pauses and switches off, and frame pacing during the busiest moment.
//   node tests/ui-motion.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
// Every finite animation running now: its name (CSS) or keyframe summary, duration and delay.
const ANIMS = () => document.getAnimations().map(a => { const t = a.effect.getTiming(); return { name: a.animationName || a.id || 'waapi', dur: +t.duration || 0, delay: +t.delay || 0, iter: t.iterations, el: a.effect.target?.className?.baseVal ?? a.effect.target?.className ?? '', id: a.effect.target?.id || '' }; }).filter(a => a.iter !== Infinity);
// Case 1 starts with no exhibits: visit the stage and look at everything, then come back to the desk.
async function collect(page) {
  await page.locator('.ledger-strip').first().click().catch(() => {}); await wait(300);   // a tap completes the OB typing
  await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
  await page.locator('.visit-card').first().click(); await wait(500);
  for (let i = 0; i < 2; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click().catch(() => {}); }
  await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
  for (let i = 0; i < 4; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(260); }
  await page.evaluate(() => document.querySelectorAll('.motion-ghost, .flyer').forEach(n => n.remove()));
}
async function setup(reduced) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); page.on('pageerror', e => { fail++; console.log(`FAIL page error: ${e.message}`); });
  await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
  await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
  await page.goto(`${base}/index.html`); await wait(1200);
  await page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
  return { ctx, page };
}
const COMMON_SKIP = /^(deal-in|deal-tilt|ink-strike|thump|glint|flip-in|star-stamp|ink-ring|back-in|cell-pass|lamp-flicker|fan|rain-fall|pin-pulse|blink|screen-in|sign-in)$/;
{
  const { ctx, page } = await setup(false);
  // Case open: the folder lifts out of the drawer and flies to the desk; frame pacing measured through it.
  await page.evaluate(() => { window.__dt = []; let last = performance.now(); const f = t => { window.__dt.push(t - last); last = t; if (window.__dt.length < 90) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.locator('.folder-card').first().click();
  await wait(120);
  check(await page.locator('.motion-ghost').count() === 1, 'opening a case: the folder lifts out of the drawer and flies to the desk');
  let anims = await page.evaluate(ANIMS);
  const lift = anims.filter(a => /motion-ghost/.test(a.el));
  check(lift.length && lift.every(a => a.dur <= 600), 'the folder flight is within 600 ms', lift.map(a => a.dur).join(','));
  await wait(1300);
  const dts = await page.evaluate(() => window.__dt.slice(2)), sorted = [...dts].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)], long = dts.filter(d => d > 50).length;
  console.log(`info frame pacing through case open: median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ${long} frames over 50 ms (headless, software rendering)`);
  check(await page.locator('.folder-tab-big.glint').count() === 1, 'the region tab glints once as the folder lands');
  // Exhibit: arrives in an envelope; the next exhibit slides in.
  await collect(page); await wait(800);
  await page.locator('.ex-tag').first().click(); await wait(60);
  anims = await page.evaluate(ANIMS);
  check(anims.some(a => a.name === 'envelope-away'), 'an exhibit arrives in a kraft envelope that slides away');
  const common1 = anims.filter(a => !COMMON_SKIP.test(a.name) && a.id !== 'lamp');   // the lamp drifting after a touch is ambient
  check(common1.every(a => a.dur <= 600), 'opening an exhibit: every animation ≤ 600 ms', common1.map(a => `${a.name}:${a.dur}`).join(' '));
  if (await page.locator('.sw-step').count()) {
    await page.locator('.sw-step').last().click(); await wait(40);
    check(await page.locator('.sheet-body.is-swap').count() === 1, 'switching exhibits slides the next one in');
    anims = await page.evaluate(ANIMS);
    check(anims.filter(a => a.name === 'swap-in').every(a => a.dur <= 600), 'the swap is within 600 ms');
  }
  await page.locator('#sheets .sheet.is-in .sheet-close').last().click(); await wait(300);
  // Charge sheet: a word flies into its blank; sending it, the sheet goes into an envelope and comes back.
  await page.locator('.dock-charge').click(); await wait(500);
  await page.evaluate(() => document.querySelectorAll('#notes .note').forEach(n => n.click()));
  const word = page.locator('.chip--word').first();
  if (await word.count()) {
    await word.click(); await wait(60);
    check(await page.locator('.flyer--word').count() >= 1, 'a word flies from the bank into its blank');
    anims = await page.evaluate(ANIMS);
    const wf = anims.filter(a => /flyer/.test(a.el));
    check(wf.every(a => a.dur <= 600), 'the word drop is within 600 ms', wf.map(a => a.dur).join(','));
    await wait(700);
    const sub = page.locator('.card-btn--submit');
    if (await sub.isEnabled()) {
      await sub.click(); await wait(200);                                // case 1: the first press arms it (Mwalimu's note)
      if (await page.locator('.verdict').count() === 0 && !(await page.locator('.charge.is-back').count())) { await sub.click(); await wait(60); }
      if (await page.locator('.verdict').count() === 0) {
        const ghost = await page.locator('.motion-ghost').count(), back = await page.locator('.charge.is-back').count();
        check(ghost >= 1 || back >= 1, 'sending the sheet: it goes into an envelope to the prosecutor and comes back stamped', `ghost ${ghost}, back ${back}`);
      }
    }
  }
  // Desk life: on, paused when hidden, off in settings.
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#desk-life')).display !== 'none'), 'desk life is on the desk (fan shadow, lamp flicker)');
  await page.evaluate(() => { document.body.classList.add('is-hidden'); });
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.dl-fan')).animationPlayState === 'paused'), 'desk life pauses when the app is in the background');
  await page.evaluate(() => { document.body.classList.remove('is-hidden'); window.KESI.save.settings.deskLife = false; document.documentElement.dataset.deskLife = 'off'; });
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#desk-life')).display === 'none'), 'Settings → Desk life off removes it');
  await ctx.close();
}
{
  const { ctx, page } = await setup(true);
  await page.locator('.folder-card').first().click(); await wait(80);
  check(await page.locator('.motion-ghost').count() === 0, 'Reduce Motion: no flying folder');
  await wait(1000); await collect(page); await wait(300);
  await page.locator('.ex-tag').first().click(); await wait(60);
  const moving = await page.evaluate(() => document.getAnimations().filter(a => { const k = a.effect.getKeyframes?.() || []; return k.some(f => f.transform && f.transform !== 'none') && (+a.effect.getTiming().duration || 0) > 0; }).map(a => a.animationName || 'waapi'));
  check(moving.length === 0, 'Reduce Motion: nothing moves when an exhibit opens', moving.join(','));
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#desk-life')).display === 'none'), 'Reduce Motion: no desk life');
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
