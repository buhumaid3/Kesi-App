// A newsprint halftone of a case photo (polish P5): the photo read as grey, redrawn as ink dots on a 45° screen,
// for the clipping that runs after a case closes. Pure drawing on a canvas; no image files are made.
export function halftone(src, { width = 300, height = 190, cell = 5, ink = '#1d1a17', paper = '#E9E2D0' } = {}) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
  cv.className = 'halftone'; cv.setAttribute('aria-hidden', 'true');
  const x = cv.getContext('2d');
  x.fillStyle = paper; x.fillRect(0, 0, cv.width, cv.height);
  const img = new Image(); img.decoding = 'async'; img.src = src;
  img.onload = () => {
    // Cover-crop the photo into a small grey sample, one value per cell.
    const W = cv.width, H = cv.height, c = cell * dpr, cols = Math.ceil(W / c) + 4, rows = Math.ceil(H / c) + 4;
    const s = document.createElement('canvas'); s.width = cols; s.height = rows;
    const sx = s.getContext('2d', { willReadFrequently: true });
    const a = img.naturalWidth / img.naturalHeight, b = W / H;
    let cw = img.naturalWidth, ch = img.naturalHeight; if (a > b) cw = ch * b; else ch = cw / b;
    sx.drawImage(img, (img.naturalWidth - cw) / 2, (img.naturalHeight - ch) / 2, cw, ch, 0, 0, cols, rows);
    const d = sx.getImageData(0, 0, cols, rows).data;
    x.fillStyle = ink;
    x.save(); x.translate(W / 2, H / 2); x.rotate(Math.PI / 4); x.translate(-W / 2, -H / 2);
    const diag = Math.hypot(W, H);
    for (let gy = -diag / 2; gy < H + diag / 2; gy += c) for (let gx = -diag / 2; gx < W + diag / 2; gx += c) {
      // Where this rotated cell lands in the unrotated picture.
      const cx = gx + c / 2 - W / 2, cy = gy + c / 2 - H / 2, ux = cx * Math.cos(Math.PI / 4) - cy * Math.sin(Math.PI / 4) + W / 2, uy = cx * Math.sin(Math.PI / 4) + cy * Math.cos(Math.PI / 4) + H / 2;
      if (ux < 0 || uy < 0 || ux >= W || uy >= H) continue;
      const i = (Math.floor(uy / H * rows) * cols + Math.floor(ux / W * cols)) * 4;
      const lum = Math.pow((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255, 0.6);   // lifted: night photos would print solid
      const r = c * 0.55 * Math.sqrt(Math.max(0, 1 - lum * 1.08));
      if (r > 0.25) { x.beginPath(); x.arc(gx + c / 2, gy + c / 2, r, 0, Math.PI * 2); x.fill(); }
    }
    x.restore();
    cv.dataset.ready = '1';
  };
  return cv;
}
