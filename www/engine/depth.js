// 2.5D: a photo with a depth map moves like a real scene. Near things shift more than far ones as the
// player drags across the photo, tilts the phone (optional) or just waits (a slow drift).
// Depth maps are greyscale WebP files next to each photo (white = near), made by tools/make-depth.py and
// listed in img/depth.json. A photo without a depth map, or a device without WebGL, stays a still photo.
const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `precision mediump float;
varying vec2 uv; uniform sampler2D img; uniform sampler2D dep; uniform vec2 off; uniform float zoom; uniform float focus;
void main(){
  vec2 c = vec2(.5) + (uv - vec2(.5)) / zoom;
  // Three steps of parallax mapping: look up depth where the shifted ray lands, refine.
  float d = texture2D(dep, c).r;
  vec2 q = c + off * (d - focus);
  d = texture2D(dep, q).r; q = c + off * (d - focus);
  d = texture2D(dep, q).r; q = c + off * (d - focus);
  gl_FragColor = texture2D(img, clamp(q, vec2(.001), vec2(.999)));
}`;

let available = null;            // Set of image paths that have a depth map
const live = new Set();
const MAX_LIVE = 4;              // iOS allows a limited number of WebGL contexts; old ones are released

export async function loadDepthIndex() {
  if (available) return available;
  try { const r = await fetch('img/depth.json'); available = new Set(r.ok ? await r.json() : []); } catch { available = new Set(); }
  return available;
}

let tilt = { x: 0, y: 0, on: false };
export function enableTilt() {
  const go = () => {
    tilt.on = true;
    addEventListener('deviceorientation', e => { if (e.gamma == null) return; tilt.x = Math.max(-1, Math.min(1, e.gamma / 25)); tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 25)); });
  };
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') return D.requestPermission().then(s => { if (s === 'granted') go(); return s === 'granted'; }).catch(() => false);
  if (D) { go(); return Promise.resolve(true); }
  return Promise.resolve(false);
}

// Upgrade every depth-capable photo inside root.
export async function attachDepth(root, K) {
  if (!root || K.save.settings.depth === false) return;
  const set = await loadDepthIndex();
  if (!set.size) return;
  for (const img of root.querySelectorAll('img[data-depth]')) {
    const src = img.getAttribute('src');
    if (!set.has(src) || img.dataset.depthOn) continue;
    img.dataset.depthOn = '1';
    const start = () => mount(img, src.replace(/\.webp$/, '.depth.webp'), K);
    if (img.complete && img.naturalWidth) start(); else img.addEventListener('load', start, { once: true });
  }
}

function mount(img, depthSrc, K) {
  const frame = img.parentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'depth-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return;
  const dimg = new Image();
  dimg.decoding = 'async';
  dimg.onload = () => {
    if (!img.isConnected) return;
    const prog = program(gl); if (!prog) return;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    texture(gl, 0, img); texture(gl, 1, dimg);
    gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'dep'), 1);
    const uOff = gl.getUniformLocation(prog, 'off'), uZoom = gl.getUniformLocation(prog, 'zoom'), uFocus = gl.getUniformLocation(prog, 'focus');
    gl.uniform1f(uZoom, 1.05); gl.uniform1f(uFocus, 0.42);
    frame.append(canvas);
    frame.classList.add('has-depth');
    const entry = { canvas, gl, stop: false };
    live.add(entry);
    if (live.size > MAX_LIVE) release([...live][0]);

    let tx = 0, ty = 0, x = 0, y = 0, touched = 0, visible = true, last = 0;
    const size = () => {
      // When the place camera zooms in (stage data-res), draw at a higher resolution so it stays sharp.
      const res = Math.max(1, Math.min(3, parseFloat(frame.dataset.res) || 1));
      const dpr = Math.min(2, devicePixelRatio || 1), w = frame.clientWidth, h = frame.clientHeight;
      if (!w || !h) return;
      const k = Math.min(dpr * res, 4096 / w, 4096 / h);
      canvas.width = Math.round(w * k); canvas.height = Math.round(h * k); gl.viewport(0, 0, canvas.width, canvas.height);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(frame);
    frame.addEventListener('depthres', size);
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(frame);
    // Drag across the photo to look around; a tap still reaches the hotspot pins on top.
    frame.addEventListener('pointermove', e => {
      const r = frame.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; touched = performance.now();
    }, { passive: true });
    frame.addEventListener('pointerleave', () => { touched = 0; }, { passive: true });
    const strength = 0.022;
    function frameLoop(t) {
      if (entry.stop) return;
      if (!canvas.isConnected) { release(entry); ro.disconnect(); io.disconnect(); return; }
      requestAnimationFrame(frameLoop);
      if (!visible || document.hidden || t - last < 30) return;
      last = t;
      const reduced = K.reduced();
      let gx = 0, gy = 0;
      if (reduced) { gx = 0; gy = 0; }
      else if (touched && t - touched < 2500) { gx = tx; gy = ty; }
      else if (tilt.on) { gx = tilt.x; gy = tilt.y; }
      else { gx = Math.sin(t / 3100) * 0.55; gy = Math.sin(t / 4300 + 1) * 0.35; }   // idle drift
      x += (gx - x) * 0.08; y += (gy - y) * 0.08;
      gl.uniform2f(uOff, -x * strength, -y * strength * 0.7);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frameLoop);
    canvas.addEventListener('webglcontextlost', () => { release(entry); canvas.remove(); frame.classList.remove('has-depth'); });
  };
  dimg.onerror = () => {};
  dimg.src = depthSrc;
}

function release(entry) {
  if (!entry || entry.stop) return;
  entry.stop = true; live.delete(entry);
  entry.gl.getExtension('WEBGL_lose_context')?.loseContext();
  entry.canvas.parentElement?.classList.remove('has-depth');
  entry.canvas.remove();
}
function texture(gl, unit, source) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
}
function program(gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG); if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p); return p;
}
