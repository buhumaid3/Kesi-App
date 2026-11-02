// Save state. One JSON blob, written on every change (debounced) so a player can quit anywhere,
// including mid-interview, and resume exactly there (design doc §2.1).
// In the iOS build this moves to @capacitor/preferences, which iOS never purges; localStorage in a
// WKWebView can be cleared under storage pressure. The API below stays the same.

const KEY = 'kesi.save.v1';

export function defaultSave() {
  return {
    v: 1,
    settings: { scale: 1, plain: false, inlineGloss: false, motion: 'system', playtest: false, music: 60, sfx: 80, voice: 90, intros: 'first' },
    progress: { prologue: false, regionCardSeen: false, solved: {}, unlockedTo: 1, desk: [], messages: [], pattern: [], collectibles: [], lastCase: null, flags: {} },
    cases: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    const d = defaultSave();
    return { ...d, ...s, settings: { ...d.settings, ...s.settings }, progress: { ...d.progress, ...s.progress } };
  } catch { return defaultSave(); }
}

let timer = null;
export function persist(save, now = false) {
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode or full: the game still runs */ } };
  clearTimeout(timer);
  if (now) write(); else timer = setTimeout(write, 250);
}

export function wipe() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
