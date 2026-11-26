// Motion v2 (polish P1, brief §6.1): named easings and durations, physical presets on the Web Animations API.
// Every preset animation is interruptible (a new one on the same element replaces it; a tap finishes the
// running story moments at once), and Reduce Motion maps each preset to a short fade or an instant change.
// Pure parts (EASE, DUR, PRESETS, keyframes) are exported for tests and for the frame-strip tools.
export const EASE = {
  out: 'cubic-bezier(.2,.8,.2,1)',          // things arriving
  in: 'cubic-bezier(.5,0,.75,0)',           // things leaving
  inOut: 'cubic-bezier(.65,0,.35,1)',       // camera moves
  settle: 'cubic-bezier(.2,.9,.25,1.25)',   // light paper: a small overshoot
  heavy: 'cubic-bezier(.3,1.25,.4,1)',      // a folder landing with weight
  impact: 'cubic-bezier(.6,0,.9,.3)',       // a stamp coming down
  linear: 'linear',
};
export const DUR = { instant: 0, tap: 120, quick: 200, base: 320, slow: 480, story: 900 };
// Each preset: frames for "in" (arrive) and "out" (leave), a duration and easing. `common` presets sit on
// common paths (case open, sheet change, word drop) and must stay within the 600 ms budget.
export const PRESETS = {
  paper: { common: true, dur: 280, ease: EASE.settle,
    in: o => [{ transform: `translate(${o.dx ?? 0}px, ${o.dy ?? 24}px) rotate(${o.rot ?? -1.2}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    out: o => [{ transform: 'none', opacity: 1 }, { transform: `translate(${o.dx ?? 0}px, ${o.dy ?? -16}px) rotate(${o.rot ?? 1}deg)`, opacity: 0 }] },
  folder: { common: true, dur: 460, ease: EASE.heavy,
    in: o => [{ transform: `translate(${o.dx ?? 0}px, ${o.dy ?? 90}px) rotate(${o.rot ?? 4}deg) scale(1.04)`, opacity: 0, offset: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1, offset: 1 }],
    out: o => [{ transform: 'none', opacity: 1 }, { transform: `translate(${o.dx ?? 0}px, ${o.dy ?? 70}px) rotate(${o.rot ?? -3}deg)`, opacity: 0 }] },
  stamp: { common: true, dur: 340, ease: EASE.impact,
    in: o => [{ transform: `scale(${o.from ?? 1.9}) rotate(${o.rot ?? -6}deg)`, opacity: 0, filter: 'blur(1px)', offset: 0 }, { transform: `scale(.96) rotate(${o.rot ?? -6}deg)`, opacity: 1, filter: 'none', offset: 0.55 }, { transform: `scale(1) rotate(${o.rot ?? -6}deg)`, opacity: 1, filter: 'none', offset: 1 }],
    out: () => [{ opacity: 1 }, { opacity: 0 }] },
  card: { common: true, dur: 260, ease: EASE.out,
    in: o => [{ transform: `translate(${o.dx ?? -18}px, ${o.dy ?? 14}px) rotate(${o.rot ?? -3}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    out: o => [{ transform: 'none', opacity: 1 }, { transform: `translate(${o.dx ?? 18}px, ${o.dy ?? -8}px) rotate(${o.rot ?? 2}deg)`, opacity: 0 }] },
  drawer: { common: true, dur: 420, ease: EASE.settle,
    in: o => [{ transform: `translateY(${o.dy ?? -40}px) scaleY(.96)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }],
    out: o => [{ transform: 'none', opacity: 1 }, { transform: `translateY(${o.dy ?? -40}px) scaleY(.96)`, opacity: 0 }] },
  string: { common: false, dur: 620, ease: EASE.settle,
    in: () => [{ strokeDashoffset: 1, offset: 0 }, { strokeDashoffset: -0.04, offset: 0.8 }, { strokeDashoffset: 0, offset: 1 }],
    out: () => [{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }] },
  camera: { common: false, dur: 900, ease: EASE.inOut,
    in: o => [{ transform: `scale(${o.from ?? 1}) translate(${o.fx ?? 0}px, ${o.fy ?? 0}px)` }, { transform: `scale(${o.to ?? 1.15}) translate(${o.tx ?? 0}px, ${o.ty ?? 0}px)` }],
    out: o => [{ transform: `scale(${o.to ?? 1.15}) translate(${o.tx ?? 0}px, ${o.ty ?? 0}px)` }, { transform: `scale(${o.from ?? 1}) translate(${o.fx ?? 0}px, ${o.fy ?? 0}px)` }] },
};
// The frames and timing for one preset, honouring Reduce Motion: movement becomes a 120 ms fade, and
// presets that only move (camera, string) become an instant change.
export function keyframes(name, dir = 'in', o = {}, reduced = false) {
  const p = PRESETS[name]; if (!p) throw new Error(`motion: no preset ${name}`);
  if (reduced) {
    if (name === 'camera' || name === 'string') { const f = p[dir](o); return { frames: [f[f.length - 1], f[f.length - 1]], duration: 0, easing: EASE.linear }; }
    return { frames: dir === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], duration: DUR.tap, easing: EASE.linear };
  }
  return { frames: p[dir](o), duration: o.duration ?? p.dur, easing: o.easing ?? p.ease };
}

// Motion v1 (kept): physical, fast, never decorative (design doc §2.13, §5.5). Everything animates transform and
// opacity only, every animation can be interrupted, and Reduce Motion turns movement into a fade or a cut.
//   deal      cards dealt onto the desk in a quick stagger
//   flyTo     an exhibit tag or a fact slip flies from where it was found to the notebook
//   bump      an object on the desk nods when something lands on it
//   shake     a returned sheet shivers
//   lamp      the desk lamp's pool of light drifts toward whatever you touch
//   motes     dust turning slowly in the lamp light
export function createMotion(reduced) {
  const lampEl = document.getElementById('lamp');
  let lampTimer = null;

  function deal(root, selector, { step = 38, max = 14 } = {}) {
    if (!root || reduced()) return;
    root.querySelectorAll(selector).forEach((el, i) => {
      el.style.setProperty('--deal-i', Math.min(i, max));
      el.style.setProperty('--deal-step', `${step}ms`);
      el.classList.add('deal');
      el.addEventListener('animationend', () => el.classList.remove('deal'), { once: true });
    });
  }

  function bump(el) {
    if (!el || reduced()) return;
    el.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-6px) scale(1.12)' }, { transform: 'translateY(0) scale(1)' }],
      { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1.3)' });
  }

  function shake(el) {
    if (!el || reduced()) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px) rotate(-.4deg)' }, { transform: 'translateX(6px) rotate(.3deg)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'ease-out' });
  }

  // A tag or slip flies along a curve from a point (or element) to a target element, then the target nods.
  function flyTo(from, to, { label = '', kind = 'tag', delay = 0 } = {}) {
    if (!to) return Promise.resolve();
    const fr = from instanceof Element ? from.getBoundingClientRect() : from;
    const tr = to.getBoundingClientRect();
    if (!fr || reduced() || !tr.width) { bump(to); return Promise.resolve(); }
    const ghost = document.createElement('div');
    ghost.className = `flyer flyer--${kind}`;
    ghost.textContent = label;
    ghost.setAttribute('aria-hidden', 'true');
    document.body.append(ghost);
    const gw = ghost.offsetWidth, gh = ghost.offsetHeight;
    const x0 = fr.left + (fr.width || 0) / 2 - gw / 2, y0 = fr.top + (fr.height || 0) / 2 - gh / 2;
    const x1 = tr.left + tr.width / 2 - gw / 2, y1 = tr.top + tr.height / 2 - gh / 2;
    const mx = (x0 + x1) / 2 + (x1 > x0 ? -40 : 40), my = Math.min(y0, y1) - 80;
    const pt = t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1];
    const frames = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, [x, y] = pt(t);
      const s = i === 0 ? 0.6 : i < 3 ? 1.08 : 1 - t * 0.55;
      frames.push({ transform: `translate(${x}px, ${y}px) rotate(${(1 - t) * -8 + t * 6}deg) scale(${s})`, opacity: i === 0 ? 0 : i === 12 ? 0.2 : 1 });
    }
    return new Promise(res => {
      const a = ghost.animate(frames, { duration: 720, delay, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' });
      a.onfinish = () => { ghost.remove(); bump(to); res(); };
      a.oncancel = () => { ghost.remove(); res(); };
    });
  }

  // The lamp's pool of light eases toward the last touch, then drifts home.
  function lamp(x, y) {
    if (!lampEl || reduced()) return;
    const W = innerWidth, H = innerHeight;
    const dx = Math.max(-0.35, Math.min(0.15, (x - W * 0.8) / W)) * W * 0.6;
    const dy = Math.max(-0.05, Math.min(0.6, (y - H * 0.05) / H)) * H * 0.35;
    lampEl.style.transform = `translate(${dx}px, ${dy}px)`;
    clearTimeout(lampTimer);
    lampTimer = setTimeout(() => { lampEl.style.transform = ''; }, 6000);
  }
  addEventListener('pointerdown', e => lamp(e.clientX, e.clientY), { passive: true });

  // Dust in the lamp light: a few dozen specks, 30 frames a second, paused when hidden or Reduce Motion.
  function motes() {
    const c = document.getElementById('motes'); if (!c) return;
    const g = c.getContext('2d');
    let W = 0, H = 0, dpr = 1, run = false, last = 0;
    const N = 26, ps = [];
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; };
    size(); addEventListener('resize', size);
    for (let i = 0; i < N; i++) ps.push({ x: Math.random(), y: Math.random() * 0.6, r: 0.6 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.004, vy: (Math.random() - 0.3) * 0.003, p: Math.random() * 6 });
    function frame(t) {
      if (!run) return;
      requestAnimationFrame(frame);
      if (t - last < 33) return; last = t;
      g.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.x += p.vx * 0.3; p.y += p.vy * 0.3 + Math.sin((t / 1800) + p.p) * 0.0004;
        if (p.x < -0.05) p.x = 1.05; if (p.x > 1.05) p.x = -0.05; if (p.y < -0.05) p.y = 0.65; if (p.y > 0.7) p.y = -0.02;
        // Bright only inside the lamp's pool (top right), invisible in the dark of the room.
        const lx = 0.8, ly = 0.08, d = Math.hypot((p.x - lx) * 1.2, (p.y - ly) * 1.6);
        const a = Math.max(0, 0.55 - d) * (0.6 + 0.4 * Math.sin(t / 900 + p.p));
        if (a <= 0.01) continue;
        g.fillStyle = `rgba(255, 226, 170, ${a.toFixed(3)})`;
        g.beginPath(); g.arc(p.x * W, p.y * H, p.r * dpr, 0, 6.283); g.fill();
      }
    }
    const toggle = () => {
      const should = !document.hidden && !reduced();
      if (should && !run) { run = true; requestAnimationFrame(frame); }
      else if (!should) { run = false; g.clearRect(0, 0, W, H); }
    };
    document.addEventListener('visibilitychange', toggle);
    toggle();
    return toggle;
  }

  // v2: play a preset on an element. A new animation on the same element cancels the old one (it never
  // queues); story moments (opts.story) finish at once when the player taps. Resolves when done or cut short.
  const running = new WeakMap(), story = new Set();
  function play(el, name, opts = {}) {
    if (!el) return Promise.resolve();
    const { dir = 'in', delay = 0, fill = 'none' } = opts;
    const k = keyframes(name, dir, opts, reduced());
    running.get(el)?.cancel();
    if (k.duration === 0) { const last = k.frames[k.frames.length - 1]; if (fill !== 'none') Object.assign(el.style, last); return Promise.resolve(); }
    const a = el.animate(k.frames, { duration: k.duration, easing: k.easing, delay, fill });
    running.set(el, a); if (opts.story) story.add(a);
    return new Promise(res => { const done = () => { story.delete(a); if (running.get(el) === a) running.delete(el); res(); }; a.onfinish = done; a.oncancel = done; });
  }
  // Several plays in a stagger (a deal of cards, drawers rolling out).
  function stagger(els, name, { step = 40, max = 12, ...opts } = {}) {
    return Promise.all([...els].map((el, i) => play(el, name, { ...opts, delay: (opts.delay || 0) + Math.min(i, max) * (reduced() ? 0 : step) })));
  }
  // A tap always wins: jump every running story moment to its end.
  function skipStory() { for (const a of [...story]) { try { a.finish(); } catch { a.cancel(); } } }
  addEventListener('pointerdown', () => { if (story.size) skipStory(); }, { passive: true, capture: true });

  return { deal, bump, shake, flyTo, lamp, motes, play, stagger, skipStory };
}
