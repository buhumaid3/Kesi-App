// UI primitives: element builder, the sheet stack (papers laid on the desk), voice-notes, popovers,
// typewriter text, stamps and the synthesized desk sounds.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
// append that skips null/false, so conditional children never print "null"
export function put(el, ...kids) { el.append(...kids.flat(Infinity).filter(k => k != null && k !== false)); return el; }
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function reducedMotion(settings) {
  if (settings?.motion === 'reduce') return true;
  if (settings?.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── The sheet stack: every screen above the desk is a paper slid on top ─────────────────────────────
const stack = [];
export function openSheet({ id, className = '', label, build, onClose, wide = false }) {
  const layer = $('#sheets');
  const existing = stack.find(s => s.id === id);
  if (existing && id) { existing.rebuild(); return existing; }
  const wrap = h('section', { class: `sheet ${className} ${wide ? 'sheet--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || id });
  const close = h('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Close' }, h('span', { 'aria-hidden': 'true' }, '×'));
  const body = h('div', { class: 'sheet-body' });
  wrap.append(close, body);
  const entry = { id, el: wrap, body, onClose, rebuild: () => { const y = body.scrollTop; body.replaceChildren(); build(body, entry); body.scrollTop = y; } };
  close.addEventListener('click', () => closeSheet(entry));
  build(body, entry);
  layer.append(wrap);
  stack.push(entry);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  setTimeout(() => close.focus({ preventScroll: true }), 30);
  syncSheetState();
  return entry;
}
export function closeSheet(entry) {
  const i = stack.indexOf(entry); if (i < 0) return;
  stack.splice(i, 1);
  entry.el.classList.remove('is-in'); entry.el.classList.add('is-out');
  setTimeout(() => entry.el.remove(), 230);
  syncSheetState();
  entry.onClose?.();
}
function syncSheetState() {
  document.body.classList.toggle('has-sheet', stack.length > 0);
  document.body.classList.toggle('has-wide', stack.some(s => s.el.classList.contains('sheet--wide')));
}
// Tapping the dimmed desk behind a sheet puts the top sheet away.
document.addEventListener('click', e => { if (e.target.id === 'scrim' && stack.length) closeSheet(stack[stack.length - 1]); });
export function closeAllSheets() { for (const s of [...stack].reverse()) closeSheet(s); }
export function topSheet() { return stack[stack.length - 1]; }
export function rebuildSheets() { for (const s of stack) s.rebuild(); }
export function sheetOpen(id) { return stack.some(s => s.id === id); }
addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) closeSheet(stack[stack.length - 1]); });

// ── Voice-notes and notices: a phone notification sliding over the desk ───────────────────────────────
const queue = []; let showing = false;
export function voiceNote({ from = 'Mwalimu', line, kind = 'voice', onDone, sticky = false, play = null, stop = null }) {
  // Notebook notices never pile up: a newer one replaces any still waiting.
  if (kind === 'info') for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'info') queue.splice(i, 1);
  queue.push({ from, line, kind, onDone, sticky, play, stop });
  if (!showing) nextNote();
}
function nextNote() {
  const n = queue.shift(); if (!n) { showing = false; return; }
  showing = true;
  const layer = $('#notes');
  const icon = n.kind === 'voice' ? '▶' : n.kind === 'text' ? '✉' : '•';
  const card = h('button', { class: `note note--${n.kind}`, type: 'button', 'aria-live': 'polite' },
    h('span', { class: 'note-from' }, h('span', { class: 'note-ic', 'aria-hidden': 'true' }, icon), n.from, n.kind === 'voice' ? ' · voice-note' : ''),
    h('span', { class: 'note-line' }, n.line),
    h('span', { class: 'note-tap' }, 'Tap to dismiss'));
  layer.append(card);
  requestAnimationFrame(() => card.classList.add('is-in'));
  let done = false;
  const finish = () => { if (done) return; done = true; n.stop?.(); card.classList.remove('is-in'); setTimeout(() => { card.remove(); n.onDone?.(); nextNote(); }, 200); };
  card.addEventListener('click', finish);
  const timed = () => { if (!n.sticky) setTimeout(finish, n.kind === 'info' ? 2600 : Math.max(5000, n.line.length * 70)); };
  // A recorded line keeps its note up until it has been said, then lingers a moment.
  if (n.play) n.play().then(spoke => { if (spoke) { card.classList.add('is-spoken'); setTimeout(finish, 1400); } else timed(); });
  else timed();
  if (n.kind === 'info' && queue.length) setTimeout(finish, 1200);
}

export function toast(text) { voiceNote({ from: 'Notebook', line: text, kind: 'info' }); }
export function clearNotices() { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'info') queue.splice(i, 1); }

// ── In-page dialog (native confirm/prompt are blocked in some web views and look foreign on iOS) ──
export function ask({ title, text = '', input = false, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const field = input ? h('textarea', { class: 'ask-input', id: 'ask-input', rows: '3', maxlength: '140', 'aria-label': title }) : null;
    const done = v => { wrap.remove(); resolve(v); };
    const wrap = h('div', { class: 'ask-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'ask-card' }, h('h2', {}, title), text ? h('p', {}, text) : null, field,
        h('div', { class: 'ask-btns' },
          h('button', { class: 'btn', type: 'button', onclick: () => done(input ? null : false) }, cancel),
          h('button', { class: `btn ${danger ? 'btn--danger' : 'is-on'}`, type: 'button', onclick: () => done(input ? (field.value.trim() || null) : true) }, ok))));
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(input ? null : false); } });
    document.body.append(wrap);
    setTimeout(() => (field || wrap.querySelector('.btn:last-child')).focus(), 20);
  });
}

// ── Popover (glossary definitions) ───────────────────────────────────────────────────────────────────
export function popover(anchor, title, text) {
  $$('.pop').forEach(p => p.remove());
  const r = anchor.getBoundingClientRect();
  const pop = h('div', { class: 'pop', role: 'tooltip' }, h('b', {}, title), h('span', {}, text));
  document.body.append(pop);
  const w = pop.offsetWidth;
  pop.style.left = Math.max(10, Math.min(innerWidth - w - 10, r.left + r.width / 2 - w / 2)) + 'px';
  pop.style.top = (r.bottom + 8 + scrollY) + 'px';
  const off = e => { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off, true); } };
  setTimeout(() => addEventListener('pointerdown', off, true), 0);
}

// ── Typewriter (§5.5): about 45 characters a second; one tap completes ──────────────────────────────
export function typewrite(el, text, { cps = 45, reduced = false, sound } = {}) {
  if (reduced) { el.textContent = text; return Promise.resolve(); }
  return new Promise(resolve => {
    let i = 0; let stop = false;
    const caret = h('span', { class: 'caret', 'aria-hidden': 'true' });
    el.textContent = ''; el.append(caret);
    el.setAttribute('aria-label', text);
    const finish = () => { stop = true; el.textContent = text; el.removeAttribute('aria-label'); el.removeEventListener('click', finish); resolve(); };
    el.addEventListener('click', finish);
    const step = () => {
      if (stop) return;
      i++;
      caret.before(text[i - 1]);
      if (i % 3 === 0) sound?.('key');
      if (i >= text.length) return finish();
      setTimeout(step, 1000 / cps * (/[.,:;]/.test(text[i - 1]) ? 3 : 1));
    };
    step();
  });
}

// ── Sounds: synthesized, no audio files (key click, stamp thump, pin, phone) ──────────────────────────
let ctx = null;
// Superseded by engine/audio.js (kept for older callers).
export function makeSound(getOn) {
  return (kind) => {
    if (!getOn()) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime;
      const g = ctx.createGain(); g.connect(ctx.destination);
      const noise = (dur, vol, freq) => {
        const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate); const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const s = ctx.createBufferSource(); s.buffer = b;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
        const gg = ctx.createGain(); gg.gain.value = vol;
        s.connect(f); f.connect(gg); gg.connect(ctx.destination); s.start(t);
      };
      if (kind === 'key') noise(0.03, 0.12, 2400);
      else if (kind === 'stamp') {
        noise(0.12, 0.5, 300);
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
        g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); o.start(t); o.stop(t + 0.2);
      } else if (kind === 'pin') noise(0.05, 0.25, 1500);
      else if (kind === 'paper') noise(0.14, 0.08, 900);
      else if (kind === 'phone') {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); o.start(t); o.stop(t + 0.3);
      }
    } catch { /* audio is optional */ }
  };
}

// A stamp lands: thump, ink spread, micro-shake (§5.5).
export function stamp(el, sound, reduced) {
  sound?.('stamp');
  if (reduced) { el.classList.add('is-stamped'); return; }
  el.classList.add('is-stamping');
  setTimeout(() => { el.classList.remove('is-stamping'); el.classList.add('is-stamped'); }, 160);
  const room = $('#app'); room.classList.add('shake'); setTimeout(() => room.classList.remove('shake'), 120);
}
