// B17: every exhibit in all 100 cases drawn by the game's own document templates at phone width (and at the
// narrowest, 320). Fails on a template error, a document wider than its sheet (tables may scroll inside
// their own box; nothing else may), or an empty document.
//   npm run play  then  node tests/ui-paper.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
const b = await chromium.launch();
let fail = 0, total = 0; const kinds = {}, problems = [];
for (const width of [390, 320]) {
  const ctx = await b.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fail++; problems.push(`page error: ${e.message}`); });
  await page.goto(`${base}/index.html?reset&playtest`); await page.waitForTimeout(500);
  await page.evaluate(() => { window.KESI.save.settings.intros = 'off'; });
  for (let n = 1; n <= 100; n++) {
    await page.goto(`${base}/index.html?case=${n}`); await page.waitForTimeout(700);
    const r = await page.evaluate(async () => {
      const { renderEvidence } = await import('./engine/docs.js');
      const K = window.KESI, out = [];
      const box = document.createElement('div'); box.className = 'sheet-body'; box.style.cssText = `width:${Math.min(innerWidth, 600) - 32}px;position:absolute;left:0;top:0;visibility:hidden`;
      document.body.append(box);
      for (const ev of K.run.c.evidence) {
        box.replaceChildren();
        try {
          const doc = renderEvidence(K, ev, { exhibitNo: 1 }); box.append(doc);
          const wide = [...doc.querySelectorAll('*')].some(el => !el.closest('.tbl-wrap') && el.getBoundingClientRect().right > box.getBoundingClientRect().right + 2 && getComputedStyle(el).position !== 'absolute');
          out.push({ id: ev.id, r: ev.render, ok: !wide && doc.textContent.trim().length > 10, wide });
        } catch (e) { out.push({ id: ev.id, r: ev.render, ok: false, err: e.message }); }
      }
      box.remove();
      return out;
    });
    for (const x of r) { total++; kinds[x.r] = (kinds[x.r] || 0) + 1; if (!x.ok) { fail++; problems.push(`${width}px case ${n} ${x.id} (${x.r}): ${x.err || (x.wide ? 'wider than the sheet' : 'empty')}`); } }
  }
  await ctx.close();
}
await b.close();
console.log(problems.slice(0, 40).join('\n'));
console.log(`\n${total} documents drawn (${Object.keys(kinds).length} kinds) at 390 and 320 px: ${fail ? `${fail} problems` : 'all fit'}`);
process.exit(fail ? 1 : 0);
