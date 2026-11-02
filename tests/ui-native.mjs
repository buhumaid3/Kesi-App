// The iOS shell, tested in Chromium with a stand-in for Capacitor's native bridge:
// · every save is mirrored to Preferences; a wiped localStorage is restored from it at launch
// · the splash screen is hidden and the status bar set once the game has booted
// · haptics fire on a stamp; the Vibration setting turns them off
// · recorded lines play through decoded buffers (fetch + decodeAudioData) and report when they end
// Usage: node tests/ui-native.mjs http://127.0.0.1:8765
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8765';
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
let fails = 0; const errors = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
// The stand-in bridge keeps its "native" storage in sessionStorage, which survives reloads but is separate
// from localStorage, like UserDefaults is in the real app.
await ctx.addInitScript(() => {
  const calls = (window.__native = { calls: [] });
  const store = { get: k => sessionStorage.getItem('pref:' + k), set: (k, v) => sessionStorage.setItem('pref:' + k, v), del: k => sessionStorage.removeItem('pref:' + k) };
  const plugins = {
    Preferences: { get: async ({ key }) => ({ value: store.get(key) }), set: async ({ key, value }) => { calls.calls.push('pref.set'); store.set(key, value); }, remove: async ({ key }) => { store.del(key); } },
    StatusBar: { setStyle: async o => { calls.calls.push('status:' + o.style); } },
    SplashScreen: { hide: async () => { calls.calls.push('splash.hide'); } },
    Haptics: { impact: async o => { calls.calls.push('haptic:' + o.style); }, notification: async o => { calls.calls.push('haptic:' + o.type); } },
  };
  window.Capacitor = { isNativePlatform: () => true, registerPlugin: name => plugins[name] };
});
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(base + '/index.html?reset&playtest&case=1'); await page.waitForSelector('.visit-card', { timeout: 20000 });
let calls = await page.evaluate(() => window.__native.calls);
check(calls.includes('splash.hide'), 'splash screen hidden after boot');
check(calls.includes('status:DARK'), 'status bar set to light text');
check(await page.evaluate(() => document.documentElement.classList.contains('is-native')), 'is-native class on <html>');
await page.locator('.visit-card').first().click(); await wait(400);
await page.locator('.sheet--location .hs-btn').first().click(); await wait(800);
calls = await page.evaluate(() => window.__native.calls);
check(calls.includes('pref.set'), 'save mirrored to Preferences');
check(calls.some(c => c.startsWith('haptic:')), 'haptic on a pin');
const tapped = await page.evaluate(() => [...window.KESI.run.tapped]);

// iOS clears the web view's storage: the game must come back from Preferences.
await page.evaluate(() => { window.KESI.save.settings.haptics = false; });
await page.evaluate(() => localStorage.clear());
await page.goto(base + '/index.html'); await wait(2500);
const restored = await page.evaluate(() => ({ lastCase: window.KESI.save.progress.lastCase, tapped: window.KESI.run ? [...window.KESI.run.tapped] : [] }));
check(restored.lastCase === 1 && tapped.every(t => restored.tapped.includes(t)), `progress restored from Preferences after localStorage was cleared (case ${restored.lastCase}, ${restored.tapped.length} spots examined)`);

// Vibration off: no more haptics.
await page.evaluate(() => { window.__native.calls.length = 0; window.KESI.save.settings.haptics = false; window.KESI.sound('stamp'); });
calls = await page.evaluate(() => window.__native.calls);
check(!calls.some(c => c.startsWith('haptic:')), 'Vibration off stops haptics');

// A recorded line plays from a decoded buffer and resolves true when it ends (only when the manifest has the
// test line: the local test setup adds one; a real checkout skips this).
const spoke = await page.evaluate(async () => {
  const { voiceKey } = await import('./engine/voicekey.js');
  if (!window.KESI.audio.hasVoice('mwalimu', 'Test line.')) return 'skipped';
  window.KESI.audio.unlock(); await new Promise(r => setTimeout(r, 300));
  const t = performance.now(); const ok = await window.KESI.audio.speak('mwalimu', 'Test line.');
  return { ok, ms: Math.round(performance.now() - t), key: voiceKey('mwalimu', 'Test line.') };
});
if (spoke !== 'skipped') check(spoke.ok && spoke.ms > 500, `recorded line played from a decoded buffer and ended (${spoke.ms} ms)`);

await b.close();
for (const e of errors) { console.log('ERROR ' + e); fails++; }
console.log(fails ? `${fails} problems.` : 'Native shell checks passed.');
process.exit(fails ? 1 : 0);
