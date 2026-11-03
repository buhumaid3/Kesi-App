// Save state. One JSON blob, written on every change (debounced) so a player can quit anywhere,
// including mid-interview, and resume exactly there (design doc §2.1).
// In the iOS app every write is also mirrored to Capacitor Preferences, which iOS never purges
// (localStorage in a web view can be cleared under storage pressure); see native.js.
import { mirrorSave, eraseSave, restoreSave } from './native.js';

const KEY = 'kesi.save.v1';

export function defaultSave() {
  return {
    v: 1,
    settings: { scale: 1, plain: false, inlineGloss: false, motion: 'system', playtest: false, music: 60, sfx: 80, voice: 90, intros: 'first', depth: true, haptics: true, onSilent: true, titleSeq: true },
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
  const write = () => {
    save.savedAt = Date.now();
    const json = JSON.stringify(save);
    try { localStorage.setItem(KEY, json); } catch { /* private mode or full: the game still runs */ }
    mirrorSave(KEY, json);
  };
  clearTimeout(timer);
  if (now) write(); else timer = setTimeout(write, 250);
}

export function wipe() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } eraseSave(KEY); }
// In the app: bring back the Preferences copy if it's newer. True if the save in localStorage changed.
export const restore = () => restoreSave(KEY);
