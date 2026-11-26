// The magnifier (polish, ui.beats magnifierOnStamps, portraitAsEvidence, signsAsEvidence, dustOverlay,
// cutVersusTorn, colourAsEvidence): a round lens that follows the finger over a document or photo at 2.5×,
// drawn from a copy of what's under it, held a little above the finger on touch so the finger never hides it.
// attachLoupe(target) → { on(), off(), toggle(), active }. Keyboard: arrow keys move it, Esc puts it away.
export function attachLoupe(target, { zoom = 2.5, size = 150 } = {}) {
  let lens = null, inner = null, pos = { x: 0.5, y: 0.35 }, active = false, touch = false;
  const place = () => {
    if (!lens) return;
    const r = target.getBoundingClientRect(), x = pos.x * r.width, y = pos.y * r.height;
    const lift = touch ? size * 0.75 : 0;
    lens.style.transform = `translate(${x - size / 2}px, ${y - size / 2 - lift}px)`;
    inner.style.transform = `translate(${size / 2 - x * zoom}px, ${size / 2 - y * zoom}px) scale(${zoom})`;
  };
  const move = e => {
    const r = target.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
    touch = e.pointerType === 'touch' || !!e.touches;
    pos = { x: Math.max(0, Math.min(1, (p.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (p.clientY - r.top) / r.height)) };
    place();
  };
  const down = e => { if (!active) return; e.preventDefault(); target.setPointerCapture?.(e.pointerId); move(e); };
  const key = e => {
    if (!active) return;
    const d = e.shiftKey ? 0.08 : 0.02;
    if (e.key === 'Escape') { off(); return; }
    const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (k) { e.preventDefault(); touch = false; pos = { x: Math.max(0, Math.min(1, pos.x + k[0])), y: Math.max(0, Math.min(1, pos.y + k[1])) }; place(); }
  };
  function on() {
    if (active) return; active = true;
    const r = target.getBoundingClientRect();
    lens = document.createElement('div'); lens.className = 'loupe'; lens.setAttribute('aria-hidden', 'true');
    lens.style.width = lens.style.height = `${size}px`;
    inner = target.cloneNode(true); inner.className += ' loupe-copy'; inner.removeAttribute('id');
    inner.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    inner.querySelectorAll('canvas').forEach(c => c.remove());
    Object.assign(inner.style, { width: `${r.width}px`, position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', margin: '0', pointerEvents: 'none' });
    lens.append(inner);
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.append(lens); target.classList.add('has-loupe'); target.tabIndex = 0;
    target.addEventListener('pointermove', move); target.addEventListener('pointerdown', down); target.addEventListener('keydown', key);
    place(); target.focus({ preventScroll: true });
  }
  function off() {
    if (!active) return; active = false;
    lens?.remove(); lens = inner = null; target.classList.remove('has-loupe');
    target.removeEventListener('pointermove', move); target.removeEventListener('pointerdown', down); target.removeEventListener('keydown', key);
  }
  return { on, off, toggle() { active ? off() : on(); return active; }, get active() { return active; } };
}
