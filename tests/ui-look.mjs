// The look fixes (polish P6): a readable board on a phone, folded "nothing" answers and the sticky face in
// interviews, the highlighter per line, the quiet send button, region edges on sheets, the verdict ceremony,
// and the store frames tool's output sizes if it has been run.   node tests/ui-look.mjs http://127.0.0.1:5173
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const check = (ok, l, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${x ? '  ' + x : ''}`); };
const b = await chromium.launch(); const errs = [];
const page = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
page.on('pageerror', e => errs.push(e.message));
const quiet = () => page.evaluate(() => document.querySelectorAll('#notes .note, .region-card-wrap').forEach(n => n.remove()));
const closeAll = async () => { for (let i = 0; i < 5; i++) { const x = page.locator('#sheets .sheet.is-in .sheet-close').last(); if (!(await x.count())) break; await x.click(); await wait(250); } };
await page.goto(`${base}/index.html?reset&playtest`); await wait(700);
await page.evaluate(() => { const s = window.KESI.save; s.settings.titleSeq = false; s.settings.intros = 'off'; s.progress.prologue = true; s.progress.regionCardSeen = true; localStorage.setItem('kesi.save.v1', JSON.stringify(s)); });
await page.goto(`${base}/index.html?case=1`); await wait(1400); await quiet();
await page.locator('.dock-charge').click(); await wait(400); await quiet();
const sub = await page.locator('.card-btn--submit').evaluate(e => ({ dis: e.disabled || e.classList.contains('is-disabled'), bg: getComputedStyle(e).backgroundColor, border: getComputedStyle(e).borderStyle }));
check(sub.dis && /rgba\(0, 0, 0, 0\)|transparent/.test(sub.bg) && sub.border === 'dashed', 'the send button is quiet while the sheet isn\'t ready', JSON.stringify(sub));
const edge = await page.evaluate(() => getComputedStyle(document.querySelector('#sheets .sheet.is-in'), '::before').content);
check(edge && edge !== 'none', 'sheets in a case carry the region\'s colour along the top edge');
await closeAll();
await page.locator('.visit-card').first().click(); await wait(500); await quiet();
for (let i = 0; i < 2; i++) { const n = await page.locator('.hs-btn').count(); for (let j = 0; j < n; j++) await page.locator('.hs-btn').nth(j).click({ timeout: 2000 }).catch(() => {}); }
await closeAll(); await quiet();
await page.locator('.id-card').nth(1).click(); await wait(400); await quiet();
const chips = await page.locator('.ask .chip').count();
for (let j = 0; j < Math.min(chips, 5); j++) { await page.locator('.ask .chip:not(.is-asked)').first().click().catch(() => {}); await wait(120); }
const t = await page.evaluate(() => ({ none: document.querySelectorAll('.sheet--person .qa--none').length, qa: document.querySelectorAll('.sheet--person .qa').length, last: !!document.querySelector('.sheet--person .qa.is-last .a') }));
check(t.last && t.qa >= 1, 'the question just asked shows its answer in full', JSON.stringify(t));
await page.locator('#sheets .sheet--person .sheet-body').evaluate(b => { b.scrollTop = b.scrollHeight; }); await wait(300);
check(await page.locator('.person-mini.is-on').count() === 1, 'scrolled down an interview, the face and name stay at the top');
await closeAll();
await page.locator('.dock-note').click(); await wait(400); await quiet();
check(await page.locator('.nb-text .hl').count() > 0, 'the highlighter follows each line of handwriting');
await closeAll();
await page.locator('.dock-cork').click(); await wait(600); await quiet();
const z = await page.evaluate(() => +document.querySelector('.cork-view').dataset.z);
check(z >= 0.6, 'the board opens at a readable size on a phone', `${Math.round(z * 100)}%`);
await closeAll();
await page.locator('.dock-charge').click(); await wait(400); await quiet();
await page.locator('.chip--word', { hasText: 'Peter Kamau' }).click();
for (let k = 0; k < 2; k++) { await page.locator('.card-btn--submit').click(); await wait(400); }
await wait(2400);
check(await page.locator('.verdict.is-fresh .v-read').count() === 1, 'the verdict opens as a ceremony with "Read the file"');
await page.locator('.v-read').click(); await wait(400);
const rt = await page.evaluate(() => document.querySelector('.recon').getBoundingClientRect().top);
check(rt < 200, '"Read the file" brings the reconstruction up', `${Math.round(rt)} px from the top`);
await b.close();
check(!errs.length, 'no page errors', errs.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
