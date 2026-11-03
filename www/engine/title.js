// The title sequence when the app opens (B8 §7). About 8 seconds the first time, about 3.5 after; a tap skips.
//   0.0  the launch image: the case folder on the desk under the lamp (the same picture as the iOS splash)
//   1.2  the camera pushes into the folder and comes out in Nairobi at night: case 1's matatu stage, in 2.5D,
//        a slow push in, rain falling through the sodium lamp light
//   2.6  a typewriter types KESI · 4.3 the title stamps on with a thud · 4.9 KENYA CASE FILES in stencil
//   5.4  Mwalimu: "Detective. We have a case."   · 7.4 fade, then the cabinet
// Reduce Motion: one still frame (the finished title over the photo), no rain, no push, no shake.
// Every frame is a pure function of time (render(t)), so tools/title-frames.html can show any moment as a still.
export const TITLE_PHOTO = 'img/cases/001/loc_stage.webp';
export const TITLE_LINE = 'Detective. We have a case.';
const FULL = { folderOut: 1.2, photoIn: 2.2, keys: [2.6, 2.95, 3.3, 3.65], stamp: 4.3, stencil: 4.9, line: 5.4, fade: 7.4, end: 8.0 };
const SHORT = { folderOut: -1, photoIn: 0, keys: [0.35, 0.55, 0.75, 0.95], stamp: 1.3, stencil: 1.7, line: 99, fade: 3.0, end: 3.5 };

const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
// Cover-fit the 3:2 photo to the screen (scale), zoom in slowly (zoom), shift near things more than far ones (off).
const FRAG = `precision mediump float;
varying vec2 uv; uniform sampler2D img; uniform sampler2D dep; uniform vec2 off; uniform float zoom; uniform vec2 scale; uniform vec2 centre;
void main(){
  vec2 c = centre + (uv - vec2(.5)) * scale / zoom;
  float d = texture2D(dep, c).r; vec2 q = c + off * (d - .45);
  d = texture2D(dep, q).r; q = c + off * (d - .45);
  vec3 col = texture2D(img, clamp(q, vec2(.001), vec2(.999))).rgb;
  gl_FragColor = vec4(col, 1.);
}`;

const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
const span = (t, a, b) => ease((t - a) / (b - a));

export function createTitle(root, { short = false, reduced = false, still = null, sound = () => {}, speak = () => Promise.resolve(false), onDone = () => {} } = {}) {
  const T = short ? SHORT : FULL;
  const el = document.createElement('div');
  el.className = `title-seq ${reduced ? 'is-still' : ''}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Kesi: Kenya Case Files');
  el.innerHTML = `
    <div class="ts-photo"><img class="ts-img" alt="" src="${TITLE_PHOTO}"><canvas class="ts-gl" aria-hidden="true"></canvas><canvas class="ts-rain" aria-hidden="true"></canvas><div class="ts-lamp"></div><div class="ts-vignette"></div></div>
    <div class="ts-folder" aria-hidden="true">${folderArt()}</div>
    <div class="ts-type" aria-hidden="true"><span class="ts-typed"></span><span class="ts-caret"></span></div>
    <div class="ts-stamp" aria-hidden="true"><span>KESI</span></div>
    <div class="ts-stencil" aria-hidden="true">KENYA CASE FILES</div>
    <p class="ts-line"><b>Mwalimu</b> ${TITLE_LINE}</p>
    <button class="ts-skip" type="button">Tap to skip</button>
    <div class="ts-black"></div>`;
  root.append(el);
  const $ = s => el.querySelector(s);
  const img = $('.ts-img'), gl = setupGL($('.ts-gl'), img), rain = $('.ts-rain');
  const drops = Array.from({ length: 140 }, (_, i) => ({ x: rnd(i * 3.1), y: rnd(i * 7.7), z: 0.35 + rnd(i * 1.3) * 0.65, l: 0.5 + rnd(i * 5.9) }));

  function render(t) {
    const r = reduced;
    // Folder (the launch image) → photo
    const out = r ? 1 : T.folderOut < 0 ? 1 : span(t, T.folderOut, T.photoIn);
    const folder = $('.ts-folder');
    folder.style.opacity = String(1 - out);
    folder.style.transform = `scale(${1 + out * 2.4})`;
    folder.style.filter = `blur(${out * 6}px)`;
    $('.ts-photo').style.opacity = String(r ? 1 : T.folderOut < 0 ? span(t, -0.2, 0.5) : span(t, T.folderOut + 0.3, T.photoIn));
    // Slow push in and a little drift: near things move more than far ones
    const p = r ? 0 : Math.max(0, Math.min(1, (t - (T.folderOut < 0 ? 0 : T.folderOut)) / (T.end - T.folderOut)));
    // On a tall screen only a third of the photo's width shows: travel from the lamp and the kiosk (right) to the matatu.
    const pan = r ? 0.6 : 0.78 - span(p, 0, 0.75) * 0.2;
    gl?.draw({ zoom: 1.02 + p * 0.14, pan, off: r ? [0, 0] : [-0.018 + p * 0.03, -0.006 + p * 0.008] });
    if (!gl?.on) { img.style.objectPosition = `${(pan * 100).toFixed(1)}% 50%`; img.style.transform = `scale(${1.02 + p * 0.14})`; }
    drawRain(rain, drops, r ? 0 : t, r ? 0 : span(t, T.photoIn - 0.6, T.photoIn + 0.8) * (1 - span(t, T.fade, T.end)));
    // Typing, then the stamp
    const typed = r ? 0 : T.keys.filter(k => t >= k).length;
    $('.ts-typed').textContent = 'KESI'.slice(0, typed);
    const stamped = r || t >= T.stamp;
    $('.ts-type').style.opacity = !r && t >= T.keys[0] - 0.3 && !stamped ? '1' : '0';
    $('.ts-caret').style.opacity = Math.floor(t * 2.4) % 2 ? '1' : '0.15';
    const st = r ? 1 : span(t, T.stamp, T.stamp + 0.16);
    const stamp = $('.ts-stamp');
    stamp.style.opacity = stamped ? String(Math.min(1, st * 1.5)) : '0';
    stamp.style.transform = `translate(-50%, -50%) rotate(-4deg) scale(${1.9 - 0.9 * st})`;
    const shake = !r && t > T.stamp && t < T.stamp + 0.22 ? Math.sin((t - T.stamp) * 90) * 5 * (1 - (t - T.stamp) / 0.22) : 0;
    el.style.setProperty('--shake', `${shake.toFixed(2)}px`);
    const sc = r ? 1 : span(t, T.stencil, T.stencil + 0.7);
    const stencil = $('.ts-stencil');
    stencil.style.opacity = String(sc);
    stencil.style.letterSpacing = `${0.62 - sc * 0.3}em`;
    stencil.style.clipPath = `inset(0 ${50 - sc * 50}% 0 ${50 - sc * 50}%)`;
    const ln = r ? 1 : span(t, T.line, T.line + 0.5) * (1 - span(t, T.fade - 0.2, T.fade + 0.3));
    $('.ts-line').style.opacity = String(ln);
    $('.ts-black').style.opacity = String(r ? 0 : span(t, T.fade, T.end));
  }

  // Sounds fire once when their moment passes (never while showing a still).
  const cues = [...T.keys.map(k => [k, () => sound('key')]), [T.stamp, () => sound('stamp')], [T.stamp + 0.05, () => sound('closed')], [T.line, () => speak('mwalimu', TITLE_LINE)]];
  let raf = 0, t0 = 0, done = false, fired = 0;
  function finish() {
    if (done) return; done = true; cancelAnimationFrame(raf);
    el.classList.add('is-out');
    setTimeout(() => { el.remove(); onDone(); }, reduced ? 120 : 380);
  }
  function loop(now) {
    const t = (now - t0) / 1000;
    while (fired < cues.length && cues[fired][0] <= t) cues[fired++][1]();
    render(t);
    if (t >= T.end) return finish();
    raf = requestAnimationFrame(loop);
  }
  el.addEventListener('click', finish);
  el.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); });
  const start = () => {
    if (still != null) { render(still); return; }
    if (reduced) { render(0); setTimeout(finish, 2600); return; }
    t0 = performance.now(); raf = requestAnimationFrame(loop);
  };
  // Wait for the photo (and its depth map) so the first frame is never blank; give up after a second.
  Promise.race([Promise.all([decoded(img), gl?.ready]), new Promise(r => setTimeout(r, 1000))]).then(start);
  return { el, render, finish, duration: T.end };
}

const rnd = s => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const decoded = img => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise(r => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }));

// Rain: thin streaks, brighter where they cross the lamp light (the sodium lamps at the top of the photo).
function drawRain(c, drops, t, amount) {
  const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  if (amount <= 0.01) return;
  x.lineCap = 'round';
  for (const d of drops) {
    const speed = 0.9 + d.z * 1.4;                                  // screens per second
    const y = ((d.y + t * speed) % 1.15) * h - 0.1 * h;
    const px = ((d.x + t * 0.06 * d.z) % 1) * w;
    const len = (14 + 28 * d.z) * d.l;
    const lamp = Math.max(0, 1 - Math.hypot(px / w - 0.78, y / h - 0.12) * 1.8) + Math.max(0, 1 - Math.hypot(px / w - 0.24, y / h - 0.05) * 2.2);
    x.strokeStyle = `rgba(255, ${200 + lamp * 30 | 0}, ${150 + lamp * 40 | 0}, ${(0.08 + 0.12 * d.z + lamp * 0.35) * amount})`;
    x.lineWidth = 0.6 + d.z * 0.9;
    x.beginPath(); x.moveTo(px, y); x.lineTo(px - len * 0.12, y + len); x.stroke();
  }
}

function setupGL(canvas, img) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const prog = gl.createProgram(); const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!v || !f) return null;
  gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit, source) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
  const U = n => gl.getUniformLocation(prog, n);
  gl.uniform1i(U('img'), 0); gl.uniform1i(U('dep'), 1);
  let ok = false;
  const dimg = new Image();
  const ready = Promise.all([decoded(img), new Promise(r => { dimg.onload = r; dimg.onerror = r; dimg.src = TITLE_PHOTO.replace(/\.webp$/, '.depth.webp'); })]).then(() => {
    if (!img.naturalWidth) return;
    tex(0, img);
    if (dimg.naturalWidth) tex(1, dimg); else { const c = document.createElement('canvas'); c.width = c.height = 2; tex(1, c); }   // no depth map: flat
    ok = true; canvas.classList.add('is-on');
  });
  return {
    ready,
    get on() { return ok; },
    draw({ zoom, off, pan = 0.6 }) {
      if (!ok) return;
      const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); gl.viewport(0, 0, canvas.width, canvas.height); }
      // cover: the photo (aspect a) fills the screen (aspect s); show the middle, a little right of centre (the matatu and the lamp).
      const a = img.naturalWidth / img.naturalHeight, s = w / h;
      const scale = s < a ? [s / a, 1] : [1, a / s];
      const cx = Math.min(1 - scale[0] / 2, Math.max(scale[0] / 2, pan));
      gl.uniform2f(U('scale'), scale[0], scale[1]); gl.uniform2f(U('centre'), cx, 0.5);
      gl.uniform1f(U('zoom'), zoom); gl.uniform2f(U('off'), off[0], off[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// The launch image as artwork: a manila case folder on the dark desk under the lamp. tools/make-splash.mjs
// renders this same picture at 2732 × 2732 for the iOS splash, so the app opens straight into frame one.
export function folderArt() {
  return `<div class="tf-desk"><div class="tf-lamp"></div>
    <div class="tf-folder">
      <div class="tf-back"></div><div class="tf-tab">CASE FILES</div>
      <div class="tf-front">
        <div class="tf-label"><span class="tf-k">KESI</span><span class="tf-rule"></span><span class="tf-sub">NAIROBI · SCU · OB 001</span></div>
        <div class="tf-received">RECEIVED<br>SCU<br>NAIROBI</div>
        <div class="tf-conf">CONFIDENTIAL</div>
        <div class="tf-clip"></div>
      </div>
    </div></div>`;
}
