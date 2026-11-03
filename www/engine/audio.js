// Kesi audio: three buses (music, effects, voices), each with its own volume.
// · Music: one loop per region from www/audio/music/ (listed in its manifest.json). Until a region has
//   a track, a quiet procedural room tone plays instead: the desk at night, distant traffic, the lamp.
// · Effects: synthesized (typewriter keys, stamps, pins, phone) plus short musical cues.
// · Voices: recorded lines from www/audio/voice/ (manifest.json maps voiceKey → file). A line without a
//   recording simply isn't voiced; the text is always on screen.
// · One voice at a time: every spoken line goes through a single queue. A new line waits for the one playing
//   (with a short breath between); only a tap that asks for a line now (a question, a play button, a call)
//   jumps the queue, and closing a sheet stops only that sheet's lines (tags). Music and effects duck under
//   a voice and come back after it.
// · Loudness: voices are normalised in the build (tools/build.mjs); here a gentle compressor on the voice bus
//   and a limiter on the master keep lines clear on a phone speaker without clipping.
// · iPhone silent switch: Settings → "Play sound when the phone is on silent" (default on) sets the Audio
//   Session to "playback" (Safari 16.4+ / the app's web view); older WebKit gets the same through a silent
//   looping media element, which moves the page into the playback category.
// iOS ignores <audio>.volume, so every file plays through Web Audio gain nodes. Files are fetched and decoded
// into buffers (not streamed through <audio> elements): that works the same in Safari, Chrome and the iOS app's
// web view, where media-element sources from the app's own scheme can play silent.
import { voiceKey, characterKey, spokenText } from './voicekey.js';
import { setAudioSession, onAudioResume } from './native.js';

// 0.1 s of silence (8 kHz, 8-bit mono WAV) for the silent-switch fallback.
const SILENT_WAV = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

export function createAudio(getSettings) {
  let ctx = null, buses = null, roomTone = null, musicSrc = null, currentRegion = null, musicToken = 0;
  let speaking = false;            // a voice line is playing or queued: music and effects duck
  // Decoded audio, most recently used last; voices are small, music tracks are kept while their region plays.
  const buffers = new Map(), MAX_BUFFERS = 40;
  async function buffer(url) {
    if (buffers.has(url)) { const b = buffers.get(url); buffers.delete(url); buffers.set(url, b); return b; }
    const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const data = await r.arrayBuffer();
    const b = await new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p?.then) p.then(res, rej); });
    buffers.set(url, b);
    while (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value);
    return b;
  }
  const manifests = { music: {}, voice: {}, cast: {}, loudness: {} };
  const vol = k => Math.max(0, Math.min(1, (getSettings()[k] ?? 70) / 100));

  fetch('audio/music/manifest.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.music = m || {}; }).catch(() => {});
  fetch('audio/voice/manifest.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.voice = m || {}; }).catch(() => {});
  fetch('audio/voice/loudness.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.loudness = m || {}; }).catch(() => {});
  fetch('audio/voice/cast.json').then(r => r.ok ? r.json() : {}).then(m => { manifests.cast = m || {}; }).catch(() => {});

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'playback' });
    // master: limiter → speakers. voice: compressor → master. music, sfx → master.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    const master = ctx.createGain(); master.gain.value = 1; master.connect(limiter);
    const voiceComp = ctx.createDynamicsCompressor();
    voiceComp.threshold.value = -22; voiceComp.knee.value = 8; voiceComp.ratio.value = 3; voiceComp.attack.value = 0.005; voiceComp.release.value = 0.2;
    const voiceMakeup = ctx.createGain(); voiceMakeup.gain.value = 1.6;          // about +4 dB after the compressor
    voiceComp.connect(voiceMakeup); voiceMakeup.connect(master);
    const mk = (v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
    buses = { music: mk(vol('music') * 0.55, master), sfx: mk(vol('sfx') * 0.9, master), voice: mk(vol('voice'), voiceComp) };
    ctx.onstatechange = () => { if (ctx.state !== 'running') needsResume = true; };
    return ctx;
  }
  let needsResume = false;
  // ── The iPhone silent switch ───────────────────────────────────────────────────────────────────────
  let silentEl = null, lastSession = null;
  function applySession() {
    const play = getSettings().onSilent !== false;
    if (play !== lastSession) { lastSession = play; setAudioSession(play); }   // the iOS app: AVAudioSession, see AppDelegate.swift
    try { if (navigator.audioSession) navigator.audioSession.type = play ? 'playback' : 'ambient'; } catch { /* not supported */ }
    // Older WebKit: a looping silent media element puts the page in the playback category.
    if (!navigator.audioSession && play && !silentEl) {
      silentEl = new Audio(SILENT_WAV); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.volume = 0.01;
      silentEl.play().catch(() => { silentEl = null; });
    } else if ((!play || navigator.audioSession) && silentEl) { silentEl.pause(); silentEl = null; }
  }
  // Browsers (and iOS) only start audio after a tap; iOS also suspends or "interrupts" it after a call, Siri,
  // the app going to the background, or headphones changing. Every tap and every return brings it back.
  function unlock() {
    if (!ensure()) return;
    applySession();
    if (ctx.state !== 'running') ctx.resume().then(() => { needsResume = false; pump(); }).catch(() => {});
    if (currentRegion && !musicSrc && !roomTone) startMusic(currentRegion);
  }
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('touchend', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });
  const wake = () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else { applySession(); ctx.resume().then(pump).catch(() => {}); } };
  document.addEventListener('visibilitychange', wake);
  addEventListener('pageshow', wake);
  addEventListener('focus', wake);
  onAudioResume(() => { if (ctx) ctx.resume().then(pump).catch(() => {}); });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (ctx) ctx.resume().catch(() => {}); });

  function setVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    buses.music.gain.setTargetAtTime(vol('music') * 0.55 * (speaking ? 0.3 : 1), t, 0.08);
    buses.sfx.gain.setTargetAtTime(vol('sfx') * 0.9 * (speaking ? 0.6 : 1), t, 0.08);
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
    if (!file) { roomTone = makeRoomTone(); return; }
    const token = ++musicToken;
    buffer(`audio/music/${file}`).then(b => {
      if (token !== musicToken || currentRegion !== region) return;
      const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(buses.music);
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.connect(g); src.start();
      g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
      musicSrc = { src, g };
    }).catch(() => { if (token === musicToken) roomTone = makeRoomTone(); });
  }
  function stopMusic() {
    musicToken++;
    if (musicSrc) { const { src, g } = musicSrc; const t = ctx.currentTime; g.gain.setTargetAtTime(0.0001, t, 0.3); setTimeout(() => { try { src.stop(); } catch { /* stopped */ } g.disconnect(); }, 1200); musicSrc = null; }
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

  // ── Voices: one queue ─────────────────────────────────────────────────────────────────────────────
  const queue = [];                 // { url, resolve, tag }
  let current = null;               // { src, resolve, tag }
  let gapUntil = 0;
  const GAP = 350;                  // ms of breath between two lines
  function hasVoice(speaker, text) { return !!manifests.voice[voiceKey(speaker, text)]; }
  // speak(speaker, text, { now, tag }) → Promise<true if heard in full, false if not recorded, muted or stopped>
  //   tag:  who started the line ('person', 'phone', 'note3', 'verdict'…); stopVoice(tag) stops only those.
  //   now:  the player tapped for this line (asked a question, pressed ▶). It replaces any line with the SAME
  //         tag (their tap is the skip) and goes to the front of the queue, but a line from someone else that
  //         is already playing finishes first. Nothing is ever cut off by a line the player didn't ask for.
  function speak(speaker, text, { now = false, tag = 'any' } = {}) {
    const file = manifests.voice[voiceKey(speaker, text)];
    if (!file || !ensure() || vol('voice') === 0) return Promise.resolve(false);
    return new Promise(resolve => {
      const job = { url: `audio/voice/${file}`, gain: manifests.loudness[file] || 0, resolve, tag };
      if (now) { stopVoice(tag); queue.unshift(job); }
      else queue.push(job);
      speaking = true; setVolumes();
      pump();
    });
  }
  async function pump() {
    if (current || !queue.length || !ctx) { if (!current && !queue.length && speaking) { speaking = false; setVolumes(); } return; }
    if (ctx.state !== 'running') return;                     // resumes on the next tap or return to the app
    const wait = gapUntil - performance.now();
    if (wait > 0) { setTimeout(pump, wait); return; }
    const job = queue.shift();
    current = { job, src: null };
    let b;
    try { b = await buffer(job.url); } catch { b = null; }
    if (current?.job !== job) return;                         // stopped while loading
    if (!b) { current = null; job.resolve(false); pump(); return; }
    const src = ctx.createBufferSource(); src.buffer = b;
    // Each line's own level (loudness.json, -16 LUFS); 0 dB when the build already baked it in.
    if (job.gain) { const g = ctx.createGain(); g.gain.value = Math.pow(10, job.gain / 20); src.connect(g); g.connect(buses.voice); }
    else src.connect(buses.voice);
    current.src = src;
    speaking = true; setVolumes();
    const rec = log && { tag: job.tag, url: job.url, start: performance.now(), end: null };
    if (rec) log.push(rec);
    const stopRec = () => { if (rec && rec.end == null) rec.end = performance.now(); };
    current.stopRec = stopRec;
    src.onended = () => {
      stopRec();
      if (current?.src !== src) return;
      current = null; speaking = !!queue.length; setVolumes();
      gapUntil = performance.now() + GAP;
      job.resolve(true); pump();
    };
    src.start();
  }
  function stopCurrent() {
    if (!current) return;
    const { job, src, stopRec } = current; current = null;
    stopRec?.();
    if (src) { src.onended = null; try { src.stop(); } catch { /* not started */ } }
    job.resolve(false);
  }
  // stopVoice(): stop everything. stopVoice('tag'): stop only that tag's line and its queued lines.
  function stopVoice(tag) {
    for (let i = queue.length - 1; i >= 0; i--) if (!tag || queue[i].tag === tag) queue.splice(i, 1)[0].resolve(false);
    if (current && (!tag || current.job.tag === tag)) { stopCurrent(); gapUntil = 0; }
    speaking = !!(current || queue.length); setVolumes();
    pump();
  }
  const isSpeaking = () => !!current;
  // Tests: window.__kesiAudioLog = [] before boot records every line's start and end (tests/ui-sound.mjs).
  const log = typeof window !== 'undefined' && Array.isArray(window.__kesiAudioLog) ? window.__kesiAudioLog : null;

  // A character's line: only the words they say out loud (narration in an intro is never voiced).
  // "I don't know" answers belong to the voice, not the character, and are recorded once per voice.
  function character(caseNo, personId, kind, text, { generic = false, now = true, tag = 'person' } = {}) {
    const key = characterKey(caseNo, personId);
    if (generic) { const slot = manifests.cast[key]; return slot ? speak(slot, text, { now, tag }) : Promise.resolve(false); }
    const said = spokenText(kind, text);
    return said ? speak(key, said, { now, tag }) : Promise.resolve(false);
  }
  // Settings → Test sound: a cue on effects, four seconds of music, then a recorded line if there is one.
  async function test() {
    unlock(); if (!ctx) return { ok: false, why: 'This browser has no Web Audio.' };
    await ctx.resume().catch(() => {});
    sfx('accepted');
    if (!musicSrc && !roomTone) { const region = currentRegion || 1; currentRegion = null; music(region); }
    const key = Object.keys(manifests.voice).find(k => k.startsWith('mwalimu/'));
    let voiced = false;
    if (key) { const file = manifests.voice[key]; stopVoice('test'); voiced = await new Promise(resolve => { queue.unshift({ url: `audio/voice/${file}`, gain: manifests.loudness[file] || 0, resolve, tag: 'test' }); pump(); }); }
    return { ok: ctx.state === 'running', voiced, state: ctx.state };
  }
  function hasCharacter(caseNo, personId, kind, text) { const said = spokenText(kind, text); return !!said && hasVoice(characterKey(caseNo, personId), said); }

  return { character, hasCharacter, unlock, music, stopMusic, sfx, speak, stopVoice, hasVoice, isSpeaking, setVolumes, applySession, test, get running() { return ctx?.state === 'running'; } };
}
