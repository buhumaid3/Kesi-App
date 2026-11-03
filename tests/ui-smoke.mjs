// UI smoke test: plays case 1 through the real interface on an iPhone-sized screen, light and dark,
// and saves screenshots. Usage: node tests/ui-smoke.mjs http://127.0.0.1:8765 outdir
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:8765';
const out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch();
async function session(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[${scheme}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${scheme}] ${e.message}`));
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = ms => new Promise(r => setTimeout(r, ms));
const closeTop = async page => { const b = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (await b.count()) await b.click(); await wait(250); };
const dismissNotes = async page => { for (const n of await page.locator('#notes .note').all()) await n.click().catch(() => {}); await wait(250); };

const { ctx, page } = await session('light');
await page.goto(base + '/index.html?reset');
await wait(600);
await shot(page, '01-prologue');
// Walk the prologue properly, including the drawer.
for (let i = 0; i < 12; i++) {
  const btn = page.locator('.prologue-wrap .card-btn').filter({ hasNotText: 'Open the folder' });
  if (await page.locator('.scr-desk').count()) break;
  if (await page.locator('.case-intro').count()) { await wait(900); await shot(page, '02b-case-intro'); await page.locator('.case-intro').click({ timeout: 1500 }).catch(() => {}); await wait(500); continue; }
  const drawer = page.locator('text=Open the desk drawer');
  if (await drawer.count()) { await drawer.click(); await wait(300); await shot(page, '02-prologue-drawer'); continue; }
  if (await btn.count()) await btn.first().click(); else await wait(700);
  await wait(400);
}
await wait(600);
await dismissNotes(page);
await shot(page, '03-desk-case1');
// Visit the stage and tap every hotspot.
await page.locator('.visit-card').first().click(); await wait(400);
await dismissNotes(page);
await shot(page, '04-location');
for (let pass = 0; pass < 3; pass++) {
  const n = await page.locator('.hs-btn').count();
  for (let i = 0; i < n; i++) { await page.locator('.hs-btn').nth(i).click(); await wait(150); }
}
await shot(page, '05-location-hotspot');
// Open the spanner exhibit from the panel.
await page.locator('.hs-btn', { hasText: 'empty bay' }).click(); await wait(200);
await page.locator('.cam-card .card-btn').click(); await wait(300);
await shot(page, '06-exhibit-spanner');
await closeTop(page); await closeTop(page);
// Interview everyone and ask about everything.
for (let round = 0; round < 3; round++) {
  const cards = await page.locator('.id-card').count();
  for (let i = 0; i < cards; i++) {
    await page.locator('.id-card').nth(i).click(); await wait(300);
    const chips = await page.locator('.ask .chip').count();
    for (let j = 0; j < chips; j++) { await page.locator('.ask .chip').nth(j).click(); await wait(80); }
    if (round === 0 && i === 1) await shot(page, '07-interview');
    await closeTop(page);
  }
  // Re-tap hotspots that appeared later.
  await page.locator('.visit-card').first().click(); await wait(300);
  const n = await page.locator('.hs-btn').count();
  for (let i = 0; i < n; i++) { await page.locator('.hs-btn').nth(i).click(); await wait(100); }
  await closeTop(page);
}
await dismissNotes(page);
await shot(page, '08-desk-after');
// Notebook tabs.
await page.locator('.dock-obj', { hasText: 'Notebook' }).click(); await wait(300);
await shot(page, '09-notebook');
await page.locator('.nb-tab', { hasText: 'Time' }).click(); await wait(200);
await shot(page, '10-notebook-time');
await closeTop(page);
// Board.
await page.locator('.dock-obj', { hasText: 'Board' }).click(); await wait(300);
await page.locator('.board-tools .btn', { hasText: 'Red string' }).click(); await wait(150);
const bc = page.locator('.bcard');
await bc.nth(0).click(); await bc.nth(5).click(); await bc.nth(1).click(); await bc.nth(6).click();
await wait(200); await shot(page, '11-board');
await closeTop(page);
// Phone: one hint call (tier 1).
// Phone: lock screen → home → Phone → keypad (wrong number, then hers) → help pick → hang up while it
// rings (free) → call again → connect (tier 1 used) → card → Recents → Messages / Voice-notes.
const must = async (cond, msg) => { if (!(await cond)) errors.push(`[phone] ${msg}`); };
await dismissNotes(page);
await page.locator('.dock-obj', { hasText: 'Phone' }).click(); await wait(400);
await must(page.locator('.ph-lock').count(), 'no lock screen the first time in a case');
await shot(page, '12a-phone-lock');
await page.locator('.ph-unlock').click(); await wait(300);
await must(page.locator('.ph-grid .ph-app').count().then(n => n === 9), 'home screen should have 9 apps');
await shot(page, '12b-phone-home');
await page.locator('.ph-app--phone').click(); await wait(250);
await page.locator('.ph-tab', { hasText: 'Keypad' }).click(); await wait(200);
for (const d of '0712345678') await page.locator(`.ph-key[aria-label="${d}"]`).click();
await page.locator('.ph-dial').click(); await wait(250);
await must(page.locator('.ph-dialmsg', { hasText: 'not in service' }).count(), 'wrong number should be not in service');
await shot(page, '12c-phone-wrong-number');
for (let i = 0; i < 10; i++) await page.locator('.ph-del').click().catch(() => {});
for (const d of '0700000214') await page.locator(`.ph-key[aria-label="${d}"]`).click();
await page.locator('.ph-dial').click(); await wait(250);
await must(page.locator('.ph-pick').count(), 'her number should open the help pick');
await shot(page, '12d-phone-pick');
const tierBefore = await page.evaluate(() => Object.values(window.KESI.run.s.hints).reduce((a, b) => a + b, 0));
await page.locator('.ph-pick-b').first().click(); await wait(150);
await must(page.locator('.ph-call--ringing').count(), 'call should ring first');
await page.locator('.ph-hangup').click(); await wait(250);
const tierAfterHangup = await page.evaluate(() => Object.values(window.KESI.run.s.hints).reduce((a, b) => a + b, 0));
await must(tierAfterHangup === tierBefore, 'hanging up while ringing must not use a hint');
await page.locator('.ph-row', { hasText: 'Mwalimu' }).click(); await wait(200);
await page.locator('.ph-pick-b').first().click(); await wait(1200);
await must(page.locator('.ph-caption').count(), 'connected call should show captions');
await shot(page, '12e-phone-call');
await page.locator('.ph-hangup').click().catch(() => {}); await wait(300);
const tierAfter = await page.evaluate(() => Object.values(window.KESI.run.s.hints).reduce((a, b) => a + b, 0));
await must(tierAfter === tierBefore + 1, `connected call should use one hint (${tierBefore} → ${tierAfter})`);
await must(page.locator('.ph-call--ended .ph-actions').count(), 'after the call, the card actions should show');
await shot(page, '12f-phone-card');
await page.locator('.ph-cancel', { hasText: 'Done' }).click(); await wait(200);
await page.locator('.ph-tab', { hasText: 'Recents' }).click(); await wait(200);
await must(page.locator('.ph-row', { hasText: 'Where to look' }).count(), 'Recents should list the call');
await page.locator('.ph-home').click(); await wait(200);
await page.locator('.ph-app--voice').click(); await wait(200);
await must(page.locator('.ph-vn').count(), 'Voice-notes should hold Mwalimu\'s case note');
await shot(page, '12g-phone-voicenotes');
await must(page.evaluate(() => window.KESI.save.progress.messages.every(m => m.kind !== 'voice' || m.read)), 'voice-notes should be read after opening the app');
await closeTop(page);
// Charge sheet: wrong first, then right.
await page.locator('.dock-obj', { hasText: 'Charge sheet' }).click(); await wait(300);
await dismissNotes(page);
await page.locator('.chip--word', { hasText: 'Brian Otieno' }).click(); await wait(150);
await page.locator('.card-btn--submit').click(); await wait(300);   // arms (beforeSubmit note)
await dismissNotes(page);
await page.locator('.card-btn--submit').click(); await wait(500);
await shot(page, '13-charge-returned');
await page.locator('.cs-blank').first().click(); await wait(100);
await page.locator('.chip--word', { hasText: 'Peter Kamau' }).click(); await wait(150);
await page.locator('.card-btn--submit').click(); await wait(1600);
await dismissNotes(page);
await shot(page, '14-verdict');
await page.evaluate(() => scrollTo(0, 900)); await wait(200);
await shot(page, '15-verdict-recon');
const stars = await page.locator('.v-stars').getAttribute('aria-label');
console.log('verdict stars:', stars);
// Back to the cabinet: case 2 unlocked?
await page.locator('.v-actions .card-btn--ghost').click(); await wait(600);
await dismissNotes(page);
await shot(page, '16-cabinet');
const c2 = await page.locator('.folder-card').nth(1).isDisabled();
console.log('case 2 locked after solving case 1:', c2);
// Resume: open case 2, visit a place, reload, expect the place sheet back.
await page.locator('.folder-card').nth(1).click(); await wait(800);
if (await page.locator('.case-intro').count()) { await page.locator('.case-intro').click({ timeout: 1500 }).catch(() => {}); await wait(500); }
await dismissNotes(page);
// Case 1 has no text from Halima; put case 2's (it has the "Prosecutor H. Abdi:" prefix) in the history to check it.
await page.evaluate(() => window.KESI.save.progress.messages.push({ from: 'Prosecutor H. Abdi', line: window.KESI.campaign.betweenCases['2'].halima, kind: 'text', case: 2 }));
// Halima's text is in Messages, with her name once (no "Prosecutor H. Abdi:" inside the bubble).
await page.locator('.dock-obj', { hasText: 'Phone' }).click(); await wait(400);
await page.locator('.ph-unlock').click().catch(() => {}); await wait(250);
await page.locator('.ph-app--messages').click(); await wait(200);
await page.locator('.ph-row').first().click(); await wait(250);
const bubble = await page.locator('.ph-bubble').first().textContent().catch(() => '');
if (!bubble || /^(Prosecutor )?H\. Abdi:/.test(bubble)) errors.push(`[phone] Halima's text bubble is wrong: ${bubble}`);
await shot(page, '16c-phone-thread');
await closeTop(page);
await page.locator('.visit-card').first().click(); await wait(300);
await page.locator('.hs-btn').first().click(); await wait(200);
await page.goto(base + '/index.html'); await wait(1500);
console.log('resume reopened the place sheet:', await page.locator('.sheet--location.is-in').count() === 1, '· case on screen:', await page.locator('.topbar-mid').first().textContent());
await ctx.close();

// Dark mode pass: a few screens.
const d = await session('dark');
await d.page.goto(base + '/index.html?reset&playtest&case=10'); await wait(1100);
await shot(d.page, '16b-dark-intro-case10');
if (await d.page.locator('.case-intro').count()) { await d.page.locator('.case-intro').click({ timeout: 1500 }).catch(() => {}); await wait(500); }
await dismissNotes(d.page);
await shot(d.page, '17-dark-desk-case10');
await d.page.locator('.visit-card').first().click(); await wait(400);
await shot(d.page, '18-dark-location-pending');
await d.page.locator('.hs-btn').nth(2).click(); await wait(200);
await d.page.locator('.cam-card .card-btn').click(); await wait(300);
await shot(d.page, '19-dark-orderbook');
await d.ctx.close();
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No console errors.');
process.exit(errors.length ? 1 : 0);
