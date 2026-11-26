// Launch sequence v2 prototypes (polish P1, brief §5). Two storyboards, each a pure function of t drawn on one
// canvas, so any moment can be reviewed as a still and a frame strip:
//   'lamp'   — "Lamp on" (recommended): rain in the dark, a lamp blooms over the desk, a folder slides in and
//              opens, the camera pushes into the clipped photo of Nairobi at night, KESI is painted on as a sign,
//              Mwalimu's line types onto an OB ledger strip, and the camera pulls back to the desk.
//   'string' — "Red string": a dark map of Kenya; ten region pins light; red string links them and snaps taut
//              into the word KESI.
// Nothing here is wired into the app yet: the owner picks one, then P2 builds it with sound, haptics and the splash.
import { KENYA } from './sitemap.js';

export const LAUNCH = {
  lamp: { end: 6.4, still: 4.9 },
  string: { end: 6.4, still: 5.0 },
};
export const LAUNCH_PHOTO = 'img/cases/001/loc_stage.webp';
export const LAUNCH_LINE = 'Detective. We have a case.';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = x => { x = clamp(x); return 1 - Math.pow(1 - x, 3); };
const easeIO = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const span = (t, a, b) => clamp((t - a) / (b - a));
// A landing with weight: overshoot then settle (damped spring), as a function of progress 0..1.
const land = x => { x = clamp(x); return 1 - Math.exp(-6 * x) * Math.cos(9 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = s => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// Short version (every launch after the first): 2.5 s, starting in the street as the title is painted,
// played a little faster, ending with the pull back to the desk. A tap skips either version.
const SHORT = { from: 3.35, speed: 1.2, end: 2.5 };
// Sounds and the voice line at their moments in the full sequence (seconds). Fired once, never during a still.
const CUES = [[0.0, 'rain'], [0.5, 'lamp'], [1.2, 'slide'], [1.72, 'thud'], [1.95, 'paper'], [2.35, 'clip'], [2.6, 'rise'], [3.6, 'hit'], [4.4, 'line'], [5.3, 'paper']];

export function createLaunch(root, { variant = 'lamp', still = null, reduced = false, short = false, sound = () => {}, rain = () => ({ stop() {} }), speak = () => Promise.resolve(false), onDone = () => {} } = {}) {
  const T = LAUNCH[variant];
  const el = document.createElement('div');
  el.className = `launch title-seq ${reduced ? 'is-still' : ''}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Kesi: Kenya Case Files. Detective. We have a case.');
  el.innerHTML = '<canvas class="launch-c" aria-hidden="true"></canvas><button class="ts-skip launch-skip" type="button">Tap to skip</button>';
  root.append(el);
  const cv = el.querySelector('canvas');
  const img = new Image(); img.src = new URL(`../${LAUNCH_PHOTO}`, import.meta.url).href;
  const ready = Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  let wood = null;

  function render(t) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); wood = null; }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) t = T.still;
    el.dataset.frame = t.toFixed(2);
    if (variant === 'string') renderString(x, w, h, t, reduced);
    else { wood ||= woodTexture(cv.width, cv.height, dpr); renderLamp(x, w, h, t, img, wood, reduced); }
  }

  let raf = 0, t0 = 0, done = false, fired = 0, rainH = null;
  const fire = name => {
    if (name === 'rain') rainH = rain();
    else if (name === 'line') speak('mwalimu', LAUNCH_LINE);
    else sound(name);
    if (name === 'hit') rainH?.stop(2.5);
  };
  function finish(skipped = false) {
    if (done) return; done = true; cancelAnimationFrame(raf); rainH?.stop(0.4);
    el.classList.add('is-out');
    setTimeout(() => { el.remove(); onDone(skipped); }, reduced ? 120 : 320);
  }
  const full = ts => short ? SHORT.from + ts * SHORT.speed : ts;
  const end = short ? SHORT.end : T.end;
  if (short) fired = CUES.findIndex(c => c[0] >= SHORT.from);
  function loop(now) {
    const ts = (now - t0) / 1000, t = full(ts);
    while (fired >= 0 && fired < CUES.length && CUES[fired][0] <= t) { const [, name] = CUES[fired++]; if (!(short && name === 'line')) fire(name); }
    render(t);
    if (ts >= end) return finish();
    raf = requestAnimationFrame(loop);
  }
  el.addEventListener('click', () => finish(true));
  el.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(true); });
  ready.then(() => {
    if (still != null) return render(still);
    if (reduced) { render(T.still); setTimeout(finish, 2600); return; }
    t0 = performance.now(); raf = requestAnimationFrame(loop);
  });
  return { el, render, finish, ready, duration: end };
}

// ── "Lamp on" ───────────────────────────────────────────────────────────────────────────────────────────
// Desk space: the folder's size and place are in screen units so both phone and iPad compose well.
function folderGeom(w, h) {
  const fw = Math.min(w * 0.82, h * 0.52), fh = fw * 1.28;
  return { fw, fh, cx: w / 2, cy: h * 0.52 };
}
// The clipped photo on the folder's inside page: where it sits (relative to the folder centre) and its size.
function photoOnPage(g) { const pw = g.fw * 0.74, ph = pw * (2 / 3); return { x: -pw / 2 + g.fw * 0.02, y: -g.fh * 0.28, w: pw, h: ph }; }
// The part of the photo the camera ends on: the calm top-left (night sky and dark buildings), with the road,
// the matatu to the right. u,v are fractions of the photo; the window keeps the screen's aspect.
function photoWindow(w, h) {
  const a = w / h, ph = 1;                           // full photo height in photo units (photo is 1.5 wide)
  let vw = a * ph, vh = ph; if (vw > 1.5) { vw = 1.5; vh = 1.5 / a; }
  const cx = clamp(0.16 * 1.5, vw / 2, 1.5 - vw / 2), cy = clamp(0.5, vh / 2, 1 - vh / 2);
  return { u0: (cx - vw / 2) / 1.5, v0: cy - vh / 2, uw: vw / 1.5, vh };
}

function renderLamp(x, w, h, t, img, wood, reduced) {
  const g = folderGeom(w, h), P = photoOnPage(g);
  // Camera: 0 = the desk, 1 = inside the photo window filling the screen. Push 2.6→3.6, pull back 5.2→6.0.
  const push = easeIO(span(t, 2.6, 3.6)) * (1 - easeIO(span(t, 5.25, 6.05)));
  const win = photoWindow(w, h);
  // The window's rect in desk coordinates (the folder open, photo on the page).
  const rx = g.cx + P.x + win.u0 * P.w, ry = g.cy + P.y + win.v0 * P.h, rw = win.uw * P.w, rh = win.vh * P.h;
  const S = lerp(1, w / rw, push) * (1 + 0.04 * span(t, 3.6, 5.2) * (1 - span(t, 5.25, 6)));   // slow drift in the street
  const camX = lerp(w / 2, rx + rw / 2, push), camY = lerp(h / 2, ry + rh / 2, push);

  x.save();
  x.fillStyle = '#060504'; x.fillRect(0, 0, w, h);
  x.translate(w / 2, h / 2); x.scale(S, S); x.translate(-camX, -camY);

  // The desk and the lamp. Before 0.5 s: dark, only the cold window light and its rain.
  const lamp = reduced ? 1 : flicker(t);
  x.globalAlpha = 0.18 + 0.82 * lamp;
  x.drawImage(wood.c, 0, 0, w, h);
  x.globalAlpha = 1;
  const pool = x.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
  pool.addColorStop(0, `rgba(255, 200, 125, ${0.5 * lamp})`); pool.addColorStop(0.35, `rgba(200, 120, 55, ${0.22 * lamp})`); pool.addColorStop(0.75, 'rgba(0,0,0,0.55)'); pool.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = pool; x.fillRect(0, 0, w, h);
  windowRain(x, w, h, t, 1 - 0.65 * lamp);
  dust(x, w, h, t, lamp);

  // The folder: slides in 1.2→1.75 with weight, opens 1.9→2.5, closes 5.35→5.95.
  const slide = reduced ? 1 : land(span(t, 1.2, 1.9));
  if (t >= 1.2 || reduced) {
    const fx = g.cx + (1 - slide) * w * 0.9, fy = g.cy + (1 - slide) * h * 0.18, rot = (1 - slide) * 0.22 - 0.025;
    const open = reduced ? 1 : easeIO(span(t, 1.9, 2.5)) * (1 - easeIO(span(t, 5.35, 5.95)));
    x.save(); x.translate(fx, fy); x.rotate(rot * (1 - push));
    folder(x, g, open, img, P, t);
    x.restore();
  }
  x.restore();

  // In the street: rain over the photo and a sodium haze, faded with the push.
  if (push > 0.6) { x.globalAlpha = (push - 0.6) / 0.4; streetRain(x, w, h, t); x.globalAlpha = 1; }
  // The title, painted on 3.6→4.3, held, gone with the pull back.
  const out = 1 - span(t, 5.1, 5.45);
  if (t >= 3.6 || reduced) signTitle(x, w, h, reduced ? 1 : span(t, 3.6, 4.35), out, '#F2A33A');
  // Mwalimu's line on an OB ledger strip, typed from 4.4.
  if (t >= 4.4 || reduced) ledger(x, w, h, reduced ? 1 : span(t, 4.4, 5.1), reduced ? 1 : out * span(t, 4.3, 4.5));
  vignette(x, w, h, 0.55);
}
function flicker(t) {
  if (t < 0.5) return 0;
  const k = span(t, 0.5, 0.95);
  const fl = t < 0.75 ? (Math.sin(t * 90) > 0.2 ? 1 : 0.35) : 1;   // the bulb catches, twice
  return ease(k) * fl;
}
function woodTexture(W, H, dpr) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), w = W / dpr, h = H / dpr; x.scale(dpr, dpr);
  const base = x.createLinearGradient(0, 0, w, h); base.addColorStop(0, '#3B2416'); base.addColorStop(1, '#2A180E');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  // Planks, then grain lines that wander, with a few knots. Deterministic.
  const plank = Math.max(90, w / 4.2);
  for (let p = 0; p * plank < w + plank; p++) {
    const px = p * plank;
    x.fillStyle = `rgba(${p % 2 ? 70 : 40}, ${p % 2 ? 40 : 22}, 18, .25)`; x.fillRect(px, 0, plank, h);
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke();
    for (let i = 0; i < 26; i++) {
      const gx = px + rnd(p * 31 + i) * plank, amp = 2 + rnd(i * 7 + p) * 5, ph = rnd(i + p * 3) * 6;
      x.strokeStyle = `rgba(${20 + rnd(i * 3) * 30 | 0}, ${10 + rnd(i * 5) * 14 | 0}, 6, ${0.18 + rnd(i * 9 + p) * 0.25})`;
      x.lineWidth = 0.5 + rnd(i * 11) * 1.2; x.beginPath();
      for (let y = 0; y <= h; y += 12) { const xx = gx + Math.sin(y / 60 + ph) * amp + Math.sin(y / 23 + ph * 2) * amp * .3; y ? x.lineTo(xx, y) : x.moveTo(xx, y); }
      x.stroke();
    }
    const ky = rnd(p * 13) * h, kx = px + plank * (0.3 + rnd(p * 17) * 0.4);
    for (let r = 2; r < 18; r += 3) { x.strokeStyle = `rgba(15,8,4,${0.35 - r / 60})`; x.beginPath(); x.ellipse(kx, ky, r * 0.6, r * 1.6, 0, 0, Math.PI * 2); x.stroke(); }
  }
  // Varnish sheen.
  const sh = x.createLinearGradient(0, 0, w, 0); sh.addColorStop(0.3, 'rgba(255,220,170,0)'); sh.addColorStop(0.5, 'rgba(255,220,170,.06)'); sh.addColorStop(0.7, 'rgba(255,220,170,0)');
  x.fillStyle = sh; x.fillRect(0, 0, w, h);
  return { c };
}
// Window rain reflected faintly in the varnish: cold streaks falling slowly in the top half.
function windowRain(x, w, h, t, amt) {
  x.save(); x.globalCompositeOperation = 'screen';
  const g = x.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, `rgba(90,120,170,${0.22 * amt})`); g.addColorStop(1, 'rgba(90,120,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h * 0.6);
  x.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const px = rnd(i * 3.3) * w, sp = 0.05 + rnd(i * 1.7) * 0.12, y = ((rnd(i * 7.1) + t * sp) % 1) * h * 0.6, len = 6 + rnd(i * 5) * 16;
    x.strokeStyle = `rgba(170,200,240,${(0.12 + rnd(i) * 0.2) * amt})`; x.lineWidth = 0.6 + rnd(i * 9) * 0.8;
    x.beginPath(); x.moveTo(px, y); x.lineTo(px + 0.5, y + len); x.stroke();
  }
  x.restore();
}
function dust(x, w, h, t, lamp) {
  if (lamp <= 0.02) return;
  x.save(); x.globalCompositeOperation = 'screen';
  for (let i = 0; i < 46; i++) {
    const px = (rnd(i * 2.1) * w + Math.sin(t * 0.4 + i) * 14 + t * 6) % w, py = (rnd(i * 4.3) * h * 0.8 + Math.cos(t * 0.3 + i * 2) * 10 - t * 4 + h) % h;
    const d = Math.hypot(px / w - 0.5, py / h - 0.42), a = Math.max(0, 0.9 - d * 2.2) * lamp;
    x.fillStyle = `rgba(255,225,180,${a * 0.55})`; x.beginPath(); x.arc(px, py, 0.6 + rnd(i * 7) * 1.3, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}
// The folder, drawn around (0,0). open: 0 closed → 1 cover laid flat to the left (it pivots on the left spine).
function folder(x, g, open, img, P, t) {
  const { fw, fh } = g, L = -fw / 2, Tp = -fh / 2;
  // Shadow on the desk.
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 28; x.shadowOffsetY = 14;
  x.fillStyle = '#C9A46B'; roundRect(x, L, Tp, fw, fh, 6); x.fill(); x.restore();
  // Back board and its tab.
  x.fillStyle = '#C9A46B'; roundRect(x, L, Tp, fw, fh, 6); x.fill();
  x.fillStyle = '#BE9860'; roundRect(x, L + fw * 0.58, Tp - fh * 0.05, fw * 0.34, fh * 0.08, 5); x.fill();
  x.fillStyle = '#3A2A18'; x.font = `700 ${fw * 0.034}px "IBM Plex Mono", monospace`; x.textAlign = 'center';
  x.fillText('CASE FILES', L + fw * 0.75, Tp - fh * 0.015);
  // The inside page with the clipped photo (visible once the cover lifts).
  if (open > 0.02) {
    x.fillStyle = '#F3EDDF'; x.fillRect(L + fw * 0.06, Tp + fh * 0.04, fw * 0.88, fh * 0.92);
    x.strokeStyle = 'rgba(60,40,20,.12)'; x.lineWidth = 1;
    for (let y = Tp + fh * 0.5; y < Tp + fh * 0.92; y += fh * 0.035) { x.beginPath(); x.moveTo(L + fw * 0.12, y); x.lineTo(L + fw * 0.88, y); x.stroke(); }
    x.fillStyle = '#2B2520'; x.font = `700 ${fw * 0.04}px "Courier Prime", monospace`; x.textAlign = 'left';
    x.fillText('OB 001 · NAIROBI CBD', L + fw * 0.12, Tp + fh * 0.1);
    // Photo with a white print border and a paper clip.
    x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
    x.fillStyle = '#FBF8F1'; x.fillRect(P.x - 5, P.y - 5, P.w + 10, P.h + 10); x.restore();
    if (img.naturalWidth) x.drawImage(img, P.x, P.y, P.w, P.h); else { x.fillStyle = '#222'; x.fillRect(P.x, P.y, P.w, P.h); }
    x.strokeStyle = '#9AA0A6'; x.lineWidth = Math.max(1.5, fw * 0.007); x.beginPath();
    const cx0 = P.x + P.w * 0.86, cy0 = P.y - 12;
    x.moveTo(cx0, cy0 + 34); x.lineTo(cx0, cy0 + 4); x.arc(cx0 + 6, cy0 + 4, 6, Math.PI, 0); x.lineTo(cx0 + 12, cy0 + 28); x.arc(cx0 + 8, cy0 + 28, 4, 0, Math.PI); x.lineTo(cx0 + 4, cy0 + 10); x.stroke();
    // Typed lines under the photo.
    x.fillStyle = 'rgba(43,37,32,.8)'; x.font = `400 ${fw * 0.03}px "Courier Prime", monospace`;
    ['Scene: matatu stage, Tom Mboya St.', 'Time reported: 21:40', 'Reported by: stage marshal'].forEach((s, i) => x.fillText(s, L + fw * 0.12, Tp + fh * 0.62 + i * fh * 0.05));
  }
  // The cover: pivots on the left edge; foreshortened by cos(angle); past 90° we see its inside on the left.
  const a = open * Math.PI, cw = fw * Math.cos(a);
  x.save();
  if (cw >= 0) {
    x.fillStyle = shade('#D8B57A', 1 - open * 0.25); roundRect(x, L, Tp, cw, fh, 6); x.fill();
    if (open < 0.3) {
      x.globalAlpha = 1 - open / 0.3;
      const s = cw / fw; x.translate(L, 0); x.scale(Math.max(0.001, s), 1); x.translate(-L, 0);
      coverPrint(x, g);
    }
  } else {
    x.fillStyle = shade('#C79F63', 0.75 + 0.25 * open); roundRect(x, L + cw, Tp, -cw, fh, 6); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.moveTo(L, Tp); x.lineTo(L, Tp + fh); x.stroke();
  }
  x.restore();
}
function coverPrint(x, g) {
  const { fw, fh } = g, L = -fw / 2, Tp = -fh / 2;
  x.fillStyle = '#F3EDDF'; x.fillRect(L + fw * 0.14, Tp + fh * 0.12, fw * 0.72, fh * 0.2);
  x.strokeStyle = '#2B2520'; x.lineWidth = 1; x.strokeRect(L + fw * 0.14, Tp + fh * 0.12, fw * 0.72, fh * 0.2);
  x.fillStyle = '#2B2520'; x.textAlign = 'center';
  x.font = `900 ${fw * 0.13}px "Big Shoulders Display", sans-serif`; x.fillText('KESI', 0, Tp + fh * 0.235);
  x.font = `500 ${fw * 0.032}px "IBM Plex Mono", monospace`; x.fillText('NAIROBI · SCU · OB 001', 0, Tp + fh * 0.29);
  x.save(); x.translate(fw * 0.18, fh * 0.2); x.rotate(-0.12);
  x.strokeStyle = 'rgba(179,38,30,.85)'; x.lineWidth = 3; x.strokeRect(-fw * 0.2, -fh * 0.035, fw * 0.4, fh * 0.07);
  x.fillStyle = 'rgba(179,38,30,.85)'; x.font = `800 ${fw * 0.05}px "Big Shoulders Stencil", sans-serif`; x.fillText('CONFIDENTIAL', 0, fh * 0.017);
  x.restore();
}
function streetRain(x, w, h, t) {
  const hz = x.createLinearGradient(0, 0, 0, h); hz.addColorStop(0, 'rgba(242,163,58,.10)'); hz.addColorStop(0.5, 'rgba(242,163,58,0)');
  x.fillStyle = hz; x.fillRect(0, 0, w, h);
  x.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const z = 0.35 + rnd(i * 1.3) * 0.65, y = ((rnd(i * 7.7) + t * (0.9 + z * 1.4)) % 1.15) * h - 0.1 * h, px = ((rnd(i * 3.1) + t * 0.06 * z) % 1) * w, len = (14 + 28 * z) * (0.5 + rnd(i * 5.9));
    x.strokeStyle = `rgba(255,215,170,${0.1 + 0.16 * z})`; x.lineWidth = 0.6 + z * 0.9;
    x.beginPath(); x.moveTo(px, y); x.lineTo(px - len * 0.12, y + len); x.stroke();
  }
}
// KESI as a hand-painted sign: white letter, ink outline, offset accent and ink shadows (sign.css), each
// letter painted on in turn with a brush-wipe reveal; then KENYA CASE FILES in stencil at a readable size.
// Where the title sits (for the contrast test): the letters' box in CSS pixels.
export function titleBox(w, h) { const size = Math.min(w * 0.36, h * 0.2), y = h * 0.2 + size * 0.5; return { x: w / 2 - size * 1.15, y: y - size * 0.78, w: size * 2.3, h: size * 0.78 }; }
function signTitle(x, w, h, k, alpha, accent) {
  if (alpha <= 0) return;
  const size = Math.min(w * 0.36, h * 0.2), y = h * 0.2 + size * 0.5, letters = 'KESI';
  x.save(); x.globalAlpha = alpha; x.textBaseline = 'alphabetic';
  x.font = `900 ${size}px "Big Shoulders Display", sans-serif`;
  const widths = [...letters].map(c => x.measureText(c).width), gap = size * 0.03, tw = widths.reduce((a, b) => a + b, 0) + gap * 3;
  // A soft dark plate behind so the title always reads, whatever the photo does.
  const pg = x.createRadialGradient(w / 2, y - size * 0.2, size * 0.2, w / 2, y - size * 0.2, Math.max(tw * 0.85, size * 1.4));
  pg.addColorStop(0, `rgba(5,4,8,${0.7 * ease(k * 2)})`); pg.addColorStop(0.6, `rgba(5,4,8,${0.45 * ease(k * 2)})`); pg.addColorStop(1, 'rgba(5,4,8,0)');
  x.fillStyle = pg; x.fillRect(0, 0, w, h);
  if (globalThis.__launchPlateOnly) { x.restore(); return; }   // test hook: the background the letters sit on
  let lx = w / 2 - tw / 2; const off = Math.max(3, size * 0.045);
  [...letters].forEach((c, i) => {
    const p = clamp(k * 4.4 - i * 0.95);                          // each letter's own brush stroke
    if (p <= 0) { lx += widths[i] + gap; return; }
    x.save(); x.beginPath(); x.rect(lx - off, y - size, (widths[i] + off * 3) * ease(p), size * 1.3); x.clip();
    x.fillStyle = '#111'; x.fillText(c, lx + off * 2, y + off * 2);
    x.fillStyle = accent; x.fillText(c, lx + off, y + off);
    x.lineWidth = Math.max(2, size * 0.035); x.strokeStyle = '#111'; x.lineJoin = 'round'; x.strokeText(c, lx, y);
    x.fillStyle = '#FFF8EC'; x.fillText(c, lx, y);
    x.restore(); lx += widths[i] + gap;
  });
  const sub = clamp(k * 2.2 - 1.1);
  if (sub > 0) {
    const ss = Math.max(15, size * 0.17);
    x.globalAlpha = alpha * ease(sub); x.font = `800 ${ss}px "Big Shoulders Stencil", sans-serif`; x.textAlign = 'center';
    x.letterSpacing = `${(0.32 - 0.12 * ease(sub)).toFixed(2)}em`;
    x.fillStyle = '#111'; x.fillText('KENYA CASE FILES', w / 2 + 2, y + ss * 1.6 + 2);
    x.fillStyle = '#FFF8EC'; x.fillText('KENYA CASE FILES', w / 2, y + ss * 1.6);
    x.letterSpacing = '0px';
  }
  x.restore();
}
// The OB ledger strip: ruled paper at the bottom, a red margin, the time, and the line typed in.
function ledger(x, w, h, k, alpha) {
  if (alpha <= 0) return;
  const sh = Math.max(70, Math.min(110, h * 0.12)), y = h - sh - Math.max(18, h * 0.04), m = Math.max(16, w * 0.05), sw = w - m * 2;
  x.save(); x.globalAlpha = alpha; x.translate(0, (1 - ease(alpha)) * 30);
  x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 16; x.shadowOffsetY = 6;
  x.fillStyle = '#F1E8D4'; x.fillRect(m, y, sw, sh); x.shadowColor = 'transparent';
  x.strokeStyle = 'rgba(42,94,134,.3)'; x.lineWidth = 1;
  for (let ly = y + sh * 0.36; ly < y + sh; ly += sh * 0.3) { x.beginPath(); x.moveTo(m, ly); x.lineTo(m + sw, ly); x.stroke(); }
  const col = m + Math.min(70, sw * 0.18);
  x.strokeStyle = 'rgba(179,38,30,.6)'; x.beginPath(); x.moveTo(col, y); x.lineTo(col, y + sh); x.stroke();
  const fs = Math.max(13, Math.min(19, sw * 0.045));
  x.fillStyle = '#5A4A3A'; x.font = `500 ${fs * 0.72}px "IBM Plex Mono", monospace`; x.textAlign = 'left';
  x.fillText('21:52', m + 8, y + sh * 0.3); x.fillText('MWALIMU', col + 8, y + sh * 0.3);
  const line = LAUNCH_LINE.slice(0, Math.round(LAUNCH_LINE.length * k));
  x.fillStyle = '#1E1A16'; x.font = `700 ${fs}px "Courier Prime", monospace`;
  x.fillText(line, col + 8, y + sh * 0.68);
  if (k < 1) { const cw = x.measureText(line).width; x.fillRect(col + 10 + cw, y + sh * 0.68 - fs * 0.8, fs * 0.5, fs * 0.95); }
  x.restore();
}
function vignette(x, w, h, a) {
  const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${a})`); x.fillStyle = v; x.fillRect(0, 0, w, h);
}

// ── "Red string" ────────────────────────────────────────────────────────────────────────────────────────
// The ten regions as pins (lon, lat), in campaign order; the four Nairobi files sit in a tight knot.
const PINS = [[36.82, -1.28], [36.95, -1.30], [39.67, -4.06], [36.07, -0.30], [34.76, -0.09], [35.10, -1.50], [36.95, -0.42], [37.99, 2.33], [36.72, -1.22], [36.84, -1.20]];
// KESI drawn as one continuous string (unit box 0..4 × 0..1.4, y down), so it can morph from the pin path.
const WORD = [
  [0, 0], [0, 1.4], [0, 0.7], [0.66, 1.4], [0, 0.7], [0.62, 0],                       // K (ends top right)
  [1.52, 0], [0.92, 0], [0.92, 0.7], [1.38, 0.7], [0.92, 0.7], [0.92, 1.4], [1.52, 1.4],   // E (the hop runs along its top bar)
  [1.72, 1.24], [1.86, 1.36], [2.08, 1.4], [2.3, 1.34], [2.42, 1.14], [2.4, 0.92], [2.24, 0.74], [1.96, 0.58], [1.8, 0.42], [1.78, 0.22], [1.88, 0.06], [2.08, 0], [2.3, 0.02], [2.44, 0.12],  // S, bottom to top
  [2.9, 0], [2.9, 1.4],                                                                  // I
];
function resample(pts, n) {
  const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[d.length - 1], out = []; let j = 0;
  for (let i = 0; i < n; i++) { const s = (i / (n - 1)) * L; while (j < d.length - 2 && d[j + 1] < s) j++; const k = (s - d[j]) / (d[j + 1] - d[j] || 1); out.push([lerp(pts[j][0], pts[j + 1][0], k), lerp(pts[j][1], pts[j + 1][1], k)]); }
  return out;
}
function renderString(x, w, h, t, reduced) {
  // Map frame: fit Kenya into the screen with margins; the title sits below on a phone, over the north on iPad.
  const lon0 = 33.8, lon1 = 42, lat0 = -4.8, lat1 = 5.6, mw = w * 0.86, mh = h * 0.56;
  const s = Math.min(mw / (lon1 - lon0), mh / (lat1 - lat0)), ox = w / 2 - (lon1 + lon0) / 2 * s, oy = h * 0.36 + (lat1 + lat0) / 2 * s;
  const P = ([lo, la]) => [ox + lo * s, oy - la * s];
  // Cork-dark board, Kenya in chalk-blue ink, faint graticule.
  const bg = x.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, Math.max(w, h) * 0.8);
  bg.addColorStop(0, '#1C1A22'); bg.addColorStop(1, '#08070A'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
  const mapIn = reduced ? 1 : ease(span(t, 0.1, 0.9));
  x.save(); x.globalAlpha = mapIn;
  x.strokeStyle = 'rgba(160,190,220,.08)'; x.lineWidth = 1;
  for (let lo = 34; lo <= 42; lo++) { const [a] = P([lo, 0]); x.beginPath(); x.moveTo(a, 0); x.lineTo(a, h); x.stroke(); }
  for (let la = -5; la <= 6; la++) { const [, b] = P([0, la]); x.beginPath(); x.moveTo(0, b); x.lineTo(w, b); x.stroke(); }
  x.beginPath(); KENYA.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath();
  x.fillStyle = 'rgba(70,90,120,.16)'; x.fill(); x.strokeStyle = 'rgba(170,200,235,.55)'; x.lineWidth = 1.4; x.setLineDash([]); x.stroke();
  // The coast and the lake as small ink notes.
  x.fillStyle = 'rgba(170,200,235,.5)'; x.font = `500 ${Math.max(9, s * 0.16)}px "IBM Plex Mono", monospace`; x.textAlign = 'left';
  x.fillText('INDIAN OCEAN', ...P([40.2, -3.9])); x.fillText('L. VICTORIA', ...P([33.95, -0.55]));
  x.restore();

  // Pins light one by one 0.7→2.5; the string runs through them 2.0→3.6 (back and forth through Nairobi).
  const pins = PINS.map(P), order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const lit = i => reduced ? 1 : ease(span(t, 0.7 + i * 0.18, 0.95 + i * 0.18));
  const path = []; order.forEach((i, k) => { path.push(pins[i]); if (k && k < 9 && ![0, 1, 8, 9].includes(i)) path.push(pins[0]); });
  const N = 220, from = resample(path, N);
  // The word's box: centred below the map on tall screens.
  const ww = Math.min(w * 0.78, h * 0.42), us = ww / 3.3, wx = w / 2 - ww / 2, wy = h * 0.38 - 0.7 * us;
  const to = resample(WORD.map(([a, b]) => [wx + a * us, wy + b * us]), N);
  const draw = reduced ? 1 : easeIO(span(t, 2.0, 3.5));
  const morph = reduced ? 1 : span(t, 3.7, 4.9);
  const m = morph <= 0 ? 0 : easeIO(morph) + Math.sin(clamp(morph) * Math.PI) * 0.05 * (1 - morph);
  const pts = from.map((p, i) => [lerp(p[0], to[i][0], m), lerp(p[1], to[i][1], m)]);
  if (morph > 0) { x.fillStyle = `rgba(6,5,8,${0.6 * clamp(morph * 1.4)})`; x.fillRect(0, 0, w, h); }
  // Pins fade back as the string leaves them.
  pins.forEach((p, i) => pin(x, p, lit(i) * (1 - 0.65 * clamp(morph * 1.5)), Math.max(6, s * 0.18)));
  if (draw > 0) {
    const upto = Math.max(2, Math.round(N * draw));
    // Slack while drawing (a sag that tightens), taut once linked.
    const sag = (1 - clamp(morph * 2)) * (1 - draw * 0.6) * s * 0.25;
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = lerp(4, Math.max(7, us * 0.12), clamp(morph)); strokePts(x, pts, upto, sag, 2.5);
    x.strokeStyle = '#C8231F'; x.lineWidth = lerp(Math.max(2.4, s * 0.05), Math.max(5, us * 0.09), clamp(morph)); strokePts(x, pts, upto, sag, 0);
    x.strokeStyle = 'rgba(255,140,120,.5)'; x.lineWidth = 1; strokePts(x, pts, upto, sag, -0.6);
    x.restore();
  }
  // KENYA CASE FILES, then the same ledger line.
  const sub = reduced ? 1 : span(t, 4.6, 5.2);
  if (sub > 0) {
    const ss = Math.max(15, ww * 0.075);
    x.save(); x.globalAlpha = ease(sub); x.textAlign = 'center'; x.font = `800 ${ss}px "Big Shoulders Stencil", sans-serif`;
    x.letterSpacing = `${(0.3 - 0.1 * ease(sub)).toFixed(2)}em`; x.fillStyle = '#F1E8D4';
    x.fillText('KENYA CASE FILES', w / 2, wy + 1.4 * us + ss * 1.7); x.letterSpacing = '0px'; x.restore();
  }
  if (t >= 5.0 || reduced) ledger(x, w, h, reduced ? 1 : span(t, 5.0, 5.8), reduced ? 1 : span(t, 4.9, 5.1));
  vignette(x, w, h, 0.5);
}
function pin(x, [a, b], k, r) {
  if (k <= 0) return;
  x.save(); x.globalAlpha = clamp(k * 1.4);
  const glow = x.createRadialGradient(a, b, 0, a, b, r * 3); glow.addColorStop(0, `rgba(242,163,58,${0.5 * k})`); glow.addColorStop(1, 'rgba(242,163,58,0)');
  x.fillStyle = glow; x.beginPath(); x.arc(a, b, r * 3, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.arc(a + 2, b + 3, r * 0.75, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#E8B040'; x.beginPath(); x.arc(a, b, r * 0.75 * (0.6 + 0.4 * k), 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc(a - r * 0.22, b - r * 0.22, r * 0.2, 0, Math.PI * 2); x.fill();
  x.restore();
}
function strokePts(x, pts, upto, sag, dy) {
  x.beginPath();
  for (let i = 0; i < upto; i++) { const s = Math.sin((i / 22) * Math.PI) ** 2 * sag; i ? x.lineTo(pts[i][0], pts[i][1] + s + dy) : x.moveTo(pts[i][0], pts[i][1] + dy); }
  x.stroke();
}

function roundRect(x, a, b, w, h, r) { r = Math.min(r, Math.abs(w) / 2, h / 2); x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; }
