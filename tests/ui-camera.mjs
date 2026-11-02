// Place camera: every region 1 place at five screen sizes. For every pin: tap it, check that the camera zoomed in,
// the card is fully inside the photo and the screen, the card does not cover the pin, and nothing scrolls
// sideways; use ‹ › once; close with Esc and check the camera is back out. Also pinch-free manual zoom by
// double-tap, and a screenshot of an open card per size. Usage: node tests/ui-camera.mjs http://127.0.0.1:8765 outdir
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8765', out = process.argv[3] || 'cam';
fs.mkdirSync(out, { recursive: true });
const SIZES = [['iphone', 390, 844, true], ['se1', 320, 568, true], ['landscape', 844, 390, true], ['ipad', 1024, 768, true], ['desktop', 1440, 900, false]].filter(s => !process.env.ONLY || process.env.ONLY.split(',').includes(s[0]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
let fails = 0, checks = 0; const errors = [];
const fail = m => { fails++; console.log('FAIL ' + m); };
for (const [name, w, h, touch] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 1000, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  let shot = false;
  for (let n = 1; n <= 10; n++) {
    await page.goto(`${base}/index.html?reset&playtest&case=${n}`); await wait(900);
    await page.locator('.case-intro').click({ timeout: 1200 }).catch(() => {}); await wait(300);
    for (const note of await page.locator('#notes .note').all()) await note.click().catch(() => {});
    await page.waitForSelector('.visit-card', { timeout: 20000 }).catch(() => {});   // the OB types itself out first
    for (const note of await page.locator('#notes .note').all()) await note.click().catch(() => {});
    const places = await page.locator('.visit-card').count();
    if (!places) fail(`${name} case ${n}: no places on the desk`);
    for (let v = 0; v < places; v++) {
      await page.locator('.visit-card').nth(v).click(); await wait(500);
      const pins = await page.locator('.sheet--location .cam .pin').count();
      for (let i = 0; i < pins; i++) {
        if (await page.locator('.cam.has-card').count()) { await page.keyboard.press('Escape'); await wait(450); }
        // Pins still at the default spot (not yet placed with  npm run place ) can sit on top of each other:
        // then open it from the "Look at" list, which does the same thing.
        const pin = page.locator('.sheet--location .cam .pin').nth(i);
        if (await pin.click({ trial: true, timeout: 800 }).then(() => true, () => false)) await pin.click();
        else await page.locator('.sheet--location .hs-btn').nth(i).click();
        await wait(650);
        checks++;
        const r = await page.evaluate(() => {
          const f = document.querySelector('.sheet--location .cam'), c = f.querySelector('.cam-card'), p = f.querySelector('.pin.is-active');
          const fr = f.getBoundingClientRect(), cr = c.getBoundingClientRect(), pr = p.getBoundingClientRect();
          const overlap = !(pr.right < cr.left + 2 || pr.left > cr.right - 2 || pr.bottom < cr.top + 2 || pr.top > cr.bottom - 2);
          const z = parseFloat(getComputedStyle(f).getPropertyValue('--z')) || 1;
          return { inFrame: cr.left >= fr.left - 1 && cr.right <= fr.right + 1 && cr.top >= fr.top - 1 && cr.bottom <= fr.bottom + 1,
            onScreen: cr.left >= -1 && cr.right <= innerWidth + 1, pinInFrame: pr.left >= fr.left - 2 && pr.right <= fr.right + 2 && pr.top >= fr.top - 2 && pr.bottom <= fr.bottom + 2,
            overlap, z, sw: document.scrollingElement.scrollWidth, sheetSw: document.querySelector('.sheet--location .sheet-body').scrollWidth, sheetW: document.querySelector('.sheet--location .sheet-body').clientWidth,
            focus: document.activeElement === c, label: f.querySelector('.cam-body h3')?.textContent };
        });
        const where = `${name} case ${n} place ${v + 1} pin ${i + 1} (${r.label})`;
        if (!r.inFrame) fail(`${where}: card not inside the photo`);
        if (!r.onScreen) fail(`${where}: card off screen`);
        if (r.overlap) fail(`${where}: card covers the pin`);
        if (!r.pinInFrame) fail(`${where}: pin outside the photo`);
        if (r.z < 1.5) fail(`${where}: camera did not zoom (z ${r.z})`);
        if (r.sw > w + 1 || r.sheetSw > r.sheetW + 1) fail(`${where}: sideways scroll (${r.sw}/${w}, sheet ${r.sheetSw}/${r.sheetW})`);
        if (!r.focus) fail(`${where}: focus did not move to the card`);
        if (!shot) { await page.screenshot({ path: `${out}/cam-${name}.png` }); shot = true; }
      }
      if (pins > 1) {   // ‹ › moves to the next pin without closing
        await page.locator('.cam-card .cam-nav[aria-label="Next"]').click(); await wait(600); checks++;
        if (!(await page.locator('.cam.has-card').count())) fail(`${name} case ${n}: Next closed the card`);
      }
      await page.keyboard.press('Escape'); await wait(500); checks++;
      const after = await page.evaluate(() => { const f = document.querySelector('.sheet--location .cam'); return f ? { z: parseFloat(getComputedStyle(f).getPropertyValue('--z')) || 1, card: f.classList.contains('has-card'), sheet: true } : { sheet: false }; });
      if (!after.sheet) fail(`${name} case ${n}: Esc closed the whole sheet instead of the card`);
      else if (after.card || after.z > 1.01) fail(`${name} case ${n}: Esc did not zoom back out (z ${after.z})`);
      // Manual zoom: double-tap the photo, then the ✕.
      if (n === 1 && v === 0) {
        for (let k = 0; k < 10 && await page.locator('#notes .note').count(); k++) { await page.locator('#notes .note').first().click().catch(() => {}); await wait(260); }
        const fb = await page.locator('.sheet--location .cam').boundingBox();
        await page.mouse.dblclick(fb.x + fb.width * 0.5, fb.y + fb.height * 0.3); await wait(600); checks++;
        const z = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sheet--location .cam')).getPropertyValue('--z')));
        if (!(z > 2)) fail(`${name}: double-tap did not zoom (z ${z})`);
        await page.screenshot({ path: `${out}/cam-${name}-manual.png` });
        await page.locator('.cam-x').click({ timeout: 2000 }).catch(() => fail(`${name}: the ✕ in the photo corner could not be pressed`)); await wait(500);
        const z2 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sheet--location .cam')).getPropertyValue('--z')));
        if (z2 > 1.01) fail(`${name}: ✕ did not zoom out (z ${z2})`);
      }
      await page.keyboard.press('Escape'); await wait(300);   // close the place sheet
    }
  }
  await ctx.close();
}
await b.close();
for (const e of errors) console.log('ERROR ' + e);
console.log(fails || errors.length ? `${fails} failures, ${errors.length} page errors in ${checks} checks.` : `All ${checks} camera checks passed.`);
process.exit(fails || errors.length ? 1 : 0);
