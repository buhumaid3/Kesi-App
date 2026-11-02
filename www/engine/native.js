// The iOS app shell (Capacitor). In a browser every function here quietly does nothing, so the same code
// runs in the Codespace preview, the artifact preview and the app.
// No bundler: native plugins are reached through Capacitor's own global (registerPlugin), which the iOS
// app injects before this script runs.
const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
export const isNative = !!cap?.isNativePlatform?.();
const plugin = name => { try { return isNative ? cap.registerPlugin(name) : null; } catch { return null; } };
const Preferences = plugin('Preferences'), StatusBar = plugin('StatusBar'), SplashScreen = plugin('SplashScreen'), Haptics = plugin('Haptics');

// ── Save storage: iOS can clear a web view's localStorage when space runs low; Preferences (UserDefaults)
// is never cleared. The game keeps reading localStorage (fast, synchronous) and mirrors every write here;
// at launch, the Preferences copy is put back into localStorage if it's newer or localStorage was emptied.
export async function restoreSave(key) {
  if (!Preferences) return false;
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return false;
    const local = localStorage.getItem(key);
    const t = s => { try { return JSON.parse(s)?.savedAt || 0; } catch { return 0; } };
    if (!local || t(value) > t(local)) { localStorage.setItem(key, value); return true; }
  } catch { /* keep going with what we have */ }
  return false;
}
export function mirrorSave(key, json) { if (Preferences) Preferences.set({ key, value: json }).catch(() => {}); }
export function eraseSave(key) { if (Preferences) Preferences.remove({ key }).catch(() => {}); }

// ── Look and feel ───────────────────────────────────────────────────────────────────────────────────────
export function appReady() {
  if (!isNative) return;
  document.documentElement.classList.add('is-native');
  // An app doesn't pinch-zoom its whole page (photos zoom themselves, see camera.js).
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no');
  StatusBar?.setStyle({ style: 'DARK' }).catch(() => {});       // light text: the desk is dark
  SplashScreen?.hide({ fadeOutDuration: 250 }).catch(() => {});
}
// A small tap of the Taptic Engine for the moments that land: a stamp, an accepted sheet.
export function haptic(kind = 'light', enabled = true) {
  if (!Haptics || !enabled) return;
  const style = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' }[kind];
  if (style) Haptics.impact({ style }).catch(() => {});
  else if (kind === 'success' || kind === 'warning') Haptics.notification({ type: kind.toUpperCase() }).catch(() => {});
}
