// The place-photo camera: the photo is a stage that moves inside its frame. Tapping a pin pushes the camera in
// toward it; pinch, double-tap and drag let the player look around by hand. Only transform and opacity move.
//   frame: the clipping viewport (.photo-img)    stage: image + depth canvas + pins (keeps the photo's 3:2)
export function createCamera(frame, stage, { reduced, zMax = 3, onTapEmpty, onChange } = {}) {
  let z = 1, tx = 0, ty = 0, frameH = null;            // frameH: a taller frame while a card sits along the bottom
  const W = () => frame.clientWidth;
  const Hs = () => stage.offsetHeight || W() / 1.5;    // the stage's own height (untransformed)
  const Hf = () => frameH ?? frame.clientHeight;
  const zMin = () => Math.max(1, Hf() / Hs());

  function clamp() {
    z = Math.max(zMin(), Math.min(zMax, z));
    tx = Math.min(0, Math.max(W() - W() * z, tx));
    ty = Math.min(0, Math.max(Hf() - Hs() * z, ty));
  }
  let fadeT = 0;
  function apply(animate = false, dur = 450) {
    clamp();
    const r = reduced();
    stage.style.transition = animate && !r ? `transform ${dur}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    if (animate && r) {                               // Reduce Motion: no travel, a short fade instead
      stage.style.opacity = '0'; clearTimeout(fadeT);
      requestAnimationFrame(() => { stage.style.transition = 'opacity 160ms ease'; stage.style.opacity = '1'; });
    }
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    frame.style.setProperty('--z', z);
    frame.classList.toggle('is-zoomed', z > 1.02);
    clearTimeout(apply.t); apply.t = setTimeout(() => { stage.dataset.res = z.toFixed(2); stage.dispatchEvent(new Event('depthres')); }, animate ? dur + 30 : 120);
    onChange?.(state());
  }
  const state = () => ({ z, tx, ty, zoomed: z > 1.02, frameH: Hf() });

  // Put image point (px, py) (fractions of the photo) at frame point (ax, ay), at zoom zz.
  function lookAt(px, py, zz, ax, ay, animate = true) {
    z = zz; clamp();
    tx = ax - px * W() * z; ty = ay - py * Hs() * z;
    apply(animate);
    return where(px, py);
  }
  // Where an image point is on screen now (frame coordinates).
  const where = (px, py) => ({ x: px * W() * z + tx, y: py * Hs() * z + ty });
  function setFrameHeight(h, animate = true) {
    const from = frame.clientHeight;
    frameH = h;
    if (h == null) {
      if (!frame.style.height) { frameH = null; return; }
      const target = Hs(); frameH = target;            // clamp against where the frame is going, not where it is
      frame.style.transition = animate && !reduced() ? 'height 400ms cubic-bezier(.2,.8,.2,1)' : 'none';
      frame.style.height = `${target}px`;
      clearTimeout(setFrameHeight.t);
      setFrameHeight.t = setTimeout(() => { if (frameH === target) { frameH = null; frame.style.height = ''; frame.style.transition = ''; apply(false); } }, animate && !reduced() ? 420 : 0);
      return;
    }
    clearTimeout(setFrameHeight.t);
    frame.style.transition = 'none'; frame.style.height = `${from}px`;
    void frame.offsetHeight;
    frame.style.transition = animate && !reduced() ? 'height 400ms cubic-bezier(.2,.8,.2,1)' : 'none';
    frame.style.height = `${h}px`;
  }
  function reset(animate = true) { z = 1; tx = 0; ty = 0; setFrameHeight(null, animate); apply(animate, 400); }
  const minZoom = () => zMin();

  // ── Gestures: drag to pan (when zoomed), pinch, double-tap, ctrl/trackpad wheel ───────────────────────
  const pts = new Map(); let start = null, pinch = null, dragged = false, lastTap = null;
  frame.addEventListener('pointerdown', e => {
    if (e.target.closest('.cam-card, .cam-x')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, tx, ty, t: performance.now() }; dragged = false; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], r = frame.getBoundingClientRect();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, tx, ty };
      dragged = true;
    }
  });
  frame.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], r = frame.getBoundingClientRect();
      const nz = Math.max(zMin(), Math.min(zMax, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const sx = (pinch.mx - pinch.tx) / pinch.z, sy = (pinch.my - pinch.ty) / pinch.z;
      z = nz; tx = mx - sx * z; ty = my - sy * z; apply(false);
      return;
    }
    if (!start || pts.size !== 1) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragged && Math.hypot(dx, dy) > 7 && state().zoomed) { dragged = true; frame.setPointerCapture?.(e.pointerId); }
    if (dragged) { tx = start.tx + dx; ty = start.ty + dy; apply(false); }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size) return;
    if (dragged) { swallowClick(); start = null; return; }
    if (e.type !== 'pointerup' || !start) return;
    const r = frame.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    const onPin = e.target.closest('.pin');
    if (lastTap && now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30 && !onPin) {
      lastTap = null; swallowClick();
      if (state().zoomed) onTapEmpty?.({ double: true });                      // double-tap again: back out
      else { const px = (x - tx) / (W() * z), py = (y - ty) / (Hs() * z); lookAt(px, py, 2.5, x, y); }
      return;
    }
    lastTap = { t: now, x, y };
    if (!onPin) onTapEmpty?.({ double: false });
    start = null;
  };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  function swallowClick() {
    const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
    frame.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => frame.removeEventListener('click', stop, { capture: true }), 350);
  }
  frame.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;                          // plain scrolling scrolls the sheet; pinch on a trackpad zooms
    e.preventDefault();
    const r = frame.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const sx = (x - tx) / z, sy = (y - ty) / z;
    z = Math.max(zMin(), Math.min(zMax, z * Math.exp(-e.deltaY * 0.01)));
    tx = x - sx * z; ty = y - sy * z; apply(false);
  }, { passive: false });

  return { lookAt, where, reset, setFrameHeight, state, minZoom, get z() { return z; }, refresh: () => apply(false) };
}
