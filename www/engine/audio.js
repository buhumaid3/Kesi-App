// Kesi audio: three buses (music, effects, voices), each with its own volume.
// · Music: one loop per region from www/audio/music/ (listed in its manifest.json). Until a region has
//   a track, a quiet procedural room tone plays instead: the desk at night, distant traffic, the lamp.
// · Effects: synthesized (typewriter keys, stamps, pins, phone) plus short musical cues.
// · Voices: recorded lines from www/audio/voice/ (manifest.json maps voiceKey → file). A line without a
//   recording simply isn't voiced; the text is always on screen.
// iOS ignores <audio>.volume, so every file plays through Web Audio gain nodes.
import { voiceKey, characterKey, spokenText } from './voicekey.js';

export function createAudio(getSettings) {
  let ctx = null, buses = null, roomTone = null, musicEl = null, musicSrc = null, currentRegion = null;
  let voiceEl = null, voiceSrc = null;
  const manifests = { music: {}, voice: {}, cast: {} };
  const vol = k => Math.max(0, Math.min(1, (getSettings()[k] ?? 70) / 100));

  fetch('audio/music/manifest.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.music = m || {}; }).catch(() => {});
  fetch('audio/voice/manifest.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.voice = m || {}; }).catch(() => {});
  fetch('audio/voice/cast.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.cast = m || {}; }).catch(() => {});

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const mk = v => { const g = ctx.createGain(); g.gain.value = v; g.connect(ctx.destination); return g; };
    buses = { music: mk(vol('music') * 0.6), sfx: mk(vol('sfx')), voice: mk(vol('voice')) };
    return ctx;
  }
  // Browsers (and iOS) only start audio after a tap.
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (currentRegion && !musicEl && !roomTone) startMusic(currentRegion);
  }
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

  function setVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    buses.music.gain.setTargetAtTime(vol('music') * 0.6 * (speaking ? 0.35 : 1), t, 0.05);
    buses.sfx.gain.setTargetAtTime(vol('sfx'), t, 0.05);
    buses.voice.gain.setTargetAtTime(vol('voice'), t, 0.05);
  }

  // ── Music ────────────────────────────────────────────────────────────────────────────────────────
  function music(region) {
    if (currentRegion === region) return;
    stopMusic();
    currentRegion = region;
    if (ctx && ctx.state === 'running') startMusic(region);
  }
  function startMusic(region) {
    if (!ensure()) return;
    const file = manifests.music[String(region)];
    if (file) {
      musicEl = new Audio(`audio/music/${file}`);
      musicEl.loop = true; musicEl.crossOrigin = 'anonymous'; musicEl.preload = 'auto';
      musicSrc = ctx.createMediaElementSource(musicEl);
      musicSrc.connect(buses.music);
      musicEl.play().catch(() => {});
    } else roomTone = makeRoomTone();
  }
  function stopMusic() {
    if (musicEl) { musicEl.pause(); musicSrc?.disconnect(); musicEl = null; musicSrc = null; }
    if (roomTone) { roomTone.stop(); roomTone = null; }
    currentRegion = null;
  }
  // The desk at night: brown noise far away (traffic), a low lamp hum, a slow swell.
  function makeRoomTone() {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    // Cross-fade the loop seam.
    for (let i = 0; i < 2000; i++) { const a = i / 2000; d[i] = d[i] * a + d[len - 2000 + i] * (1 - a); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.05; lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    const hum = ctx.createOscillator(), humG = ctx.createGain(); hum.frequency.value = 50; humG.gain.value = 0.012;
    src.connect(lp); lp.connect(g); hum.connect(humG); humG.connect(g); g.connect(buses.music);
    const t = ctx.currentTime; g.gain.exponentialRampToValueAtTime(0.18, t + 2.5);
    src.start(); lfo.start(); hum.start();
    return { stop() { const t2 = ctx.currentTime; g.gain.setTargetAtTime(0.0001, t2, 0.4); setTimeout(() => { try { src.stop(); lfo.stop(); hum.stop(); } catch { /* stopped */ } g.disconnect(); }, 1600); } };
  }

  // ── Effects and cues ───────────────────────────────────────────────────────────────────────────────
  function sfx(kind) {
    if (!ensure() || ctx.state !== 'running' || vol('sfx') === 0) return;
    const t = ctx.currentTime, out = buses.sfx;
    const noise = (dur, v, freq, at = t) => {
      const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = v;
      s.connect(f); f.connect(g); g.connect(out); s.start(at);
    };
    // A soft struck note (sine + a little third harmonic), like a muted piano or a marimba bar.
    const note = (freq, at, dur = 1.2, v = 0.18, type = 'sine') => {
      const o = ctx.createOscillator(), o3 = ctx.createOscillator(), g = ctx.createGain(), g3 = ctx.createGain();
      o.type = type; o.frequency.value = freq; o3.type = 'sine'; o3.frequency.value = freq * 3; g3.gain.value = 0.08;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(v, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); o3.connect(g3); g3.connect(g); g.connect(out); o.start(at); o3.start(at); o.stop(at + dur + 0.05); o3.stop(at + dur + 0.05);
    };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    if (kind === 'key') noise(0.03, 0.12, 2400);
    else if (kind === 'stamp') {
      noise(0.12, 0.5, 300);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
    } else if (kind === 'pin') noise(0.05, 0.25, 1500);
    else if (kind === 'paper') noise(0.14, 0.08, 900);
    else if (kind === 'phone') { note(hz(81), t, 0.25, 0.1); note(hz(81), t + 0.32, 0.25, 0.1); }
    else if (kind === 'intro') {          // case intro: a low drum, then a minor chord opening slowly
      noise(0.25, 0.4, 120);
      [45, 52, 57, 60].forEach((m, i) => note(hz(m), t + 0.15 + i * 0.09, 2.6, 0.1));
    } else if (kind === 'accepted') [60, 64, 67, 72].forEach((m, i) => note(hz(m), t + i * 0.11, 1.4, 0.13));
    else if (kind === 'returned') { note(hz(57), t, 0.6, 0.14); note(hz(53), t + 0.22, 1.0, 0.14); }
    else if (kind === 'closed') { [48, 55, 60, 64, 67].forEach((m, i) => note(hz(m), t + i * 0.08, 2.2, 0.1)); }
    else if (kind === 'clue') { note(hz(76), t, 0.5, 0.06); note(hz(83), t + 0.07, 0.6, 0.05); }
  }

  // ── Voices ──────────────────────────────────────────────────────────────────────────────────────────
  let speaking = false;
  function hasVoice(speaker, text) { return !!manifests.voice[voiceKey(speaker, text)]; }
  function speak(speaker, text) {
    const file = manifests.voice[voiceKey(speaker, text)];
    if (!file || !ensure() || ctx.state !== 'running' || vol('voice') === 0) return Promise.resolve(false);
    stopVoice();
    return new Promise(resolve => {
      voiceEl = new Audio(`audio/voice/${file}`);
      voiceEl.crossOrigin = 'anonymous';
      voiceSrc = ctx.createMediaElementSource(voiceEl);
      voiceSrc.connect(buses.voice);
      speaking = true; setVolumes();
      const end = () => { speaking = false; setVolumes(); resolve(true); };
      voiceEl.addEventListener('ended', end, { once: true });
      voiceEl.addEventListener('error', () => { speaking = false; setVolumes(); resolve(false); }, { once: true });
      voiceEl.play().catch(() => { speaking = false; setVolumes(); resolve(false); });
    });
  }
  function stopVoice() { if (voiceEl) { voiceEl.pause(); voiceSrc?.disconnect(); voiceEl = null; voiceSrc = null; speaking = false; setVolumes(); } }

  // A character's line: only the words they say out loud (narration in an intro is never voiced).
  // "I don't know" answers belong to the voice, not the character, and are recorded once per voice.
  function character(caseNo, personId, kind, text, { generic = false } = {}) {
    const key = characterKey(caseNo, personId);
    if (generic) { const slot = manifests.cast[key]; return slot ? speak(slot, text) : Promise.resolve(false); }
    const said = spokenText(kind, text);
    return said ? speak(key, said) : Promise.resolve(false);
  }
  function hasCharacter(caseNo, personId, kind, text) { const said = spokenText(kind, text); return !!said && hasVoice(characterKey(caseNo, personId), said); }

  return { character, hasCharacter, unlock, music, stopMusic, sfx, speak, stopVoice, hasVoice, setVolumes, get running() { return ctx?.state === 'running'; } };
}
