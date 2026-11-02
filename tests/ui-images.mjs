// Nothing missing on screen: plays each region 1 case open (every place, spot, person and question, through the
// game's own state), then opens every person, place and exhibit through the interface and fails if anything
// shows "Photo pending", initials instead of a portrait, or a broken image.
// Needs the real images (your Codespace, or the build); in a checkout without images every one fails.
// Usage: node tests/ui-images.mjs http://127.0.0.1:5173 [from] [to]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', from = +(process.argv[3] || 1), to = +(process.argv[4] || 10);
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
// Record every placeholder the moment it appears, with what it belonged to.
await ctx.addInitScript(() => {
  window.__missing = new Set();
  const note = el => {
    const fig = el.closest('figure, .id-card, .person-head, .doc, .sheet');
    const what = fig?.querySelector('figcaption')?.textContent || fig?.getAttribute('aria-label') || fig?.querySelector('h2, .id-name, .doc-title')?.textContent || '?';
    const kind = el.classList.contains('no-portrait') ? 'initials instead of a portrait' : 'photo pending';
    const src = el.closest('.photo')?.dataset.src || '';
    window.__missing.add(`${kind}: ${what.trim().slice(0, 60)}${src ? ` (${src})` : ''}`);
  };
  new MutationObserver(ms => { for (const m of ms) for (const n of [m.target, ...m.addedNodes]) if (n.nodeType === 1) {
    if (n.matches?.('.no-portrait, .photo-img.is-pending')) note(n);
    n.querySelectorAll?.('.no-portrait, .photo-img.is-pending').forEach(note);
  } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let total = 0; const missing = new Set();
for (let n = from; n <= to; n++) {
  await page.goto(`${base}/index.html?reset&playtest&case=${n}`); await page.waitForSelector('.visit-card', { timeout: 20000 });
  // Open the whole case through the game's own rules, then reload so the desk shows everything.
  await page.evaluate(() => {
    const run = window.KESI.run;
    for (let pass = 0; pass < 30; pass++) {
      const before = run.kF.size + run.kE.size + run.kP.size + run.kL.size;
      for (const l of run.locations()) { run.visit(l.id); for (const h of run.hotspots(l.id)) run.tapHotspot(l.id, h.id); }
      for (const p of run.people()) if (run.canInterview(p.id)) { run.interview(p.id); for (const t of run.topics(p.id)) run.ask(p.id, t.about); }
      if (run.kF.size + run.kE.size + run.kP.size + run.kL.size === before) break;
    }
    run.s.obTyped = true;
    window.KESI.save.cases[run.n] = run.toJSON();
    localStorage.setItem('kesi.save.v1', JSON.stringify(window.KESI.save));
  });
  await page.goto(`${base}/index.html?case=${n}`); await page.waitForSelector('.visit-card', { timeout: 20000 }); await wait(800);
  const close = async () => { for (let i = 0; i < 4 && await page.locator('#sheets .sheet').count(); i++) { await page.keyboard.press('Escape'); await wait(150); } };
  const open = async (sel) => {
    const c = await page.locator(sel).count();
    for (let i = 0; i < c; i++) { await page.locator(sel).nth(i).click({ timeout: 3000 }).catch(() => {}); await wait(450); await close(); total++; }
  };
  await open('.id-card'); await open('.visit-card'); await open('.ex-tag');
  for (const m of await page.evaluate(() => [...window.__missing])) missing.add(`case ${n} · ${m}`);
}
await b.close();
for (const m of missing) console.log('MISSING ' + m);
for (const e of errors) console.log('ERROR ' + e);
console.log(missing.size || errors.length ? `${missing.size} missing images, ${errors.length} page errors across cases ${from}–${to}.` : `Every person, place and exhibit in cases ${from}–${to} has its picture (${total} opened).`);
process.exit(missing.size || errors.length ? 1 : 0);
