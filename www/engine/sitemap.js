// The site map's layout (region 6). The case files give routes and minutes, not coordinates, so the map is
// drawn from the drive times: stress majorization (Kamada–Kawai style) over the shortest-route distances,
// with longer drives drawn longer (square-root scaled so a 3-minute walk and a 2-hour road both fit).
// Deterministic: the same case always draws the same map, and every node, hidden or not, is placed from the
// start, so the map never jumps when a new site appears. Pure: no DOM, testable in node.

export function layoutSites(nodes, edges, { start = nodes[0], width = 340, height = 210, pad = 46 } = {}) {
  const n = nodes.length, idx = new Map(nodes.map((id, i) => [id, i]));
  if (!n) return {};
  if (n === 1) return { [nodes[0]]: [width / 2, height / 2] };
  // All-pairs shortest routes over drawn lengths.
  const L = m => 1 + Math.sqrt(Math.max(0, m));
  const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const e of edges) { const a = idx.get(e.a), b = idx.get(e.b); if (a == null || b == null) continue; const d = L(e.minutes); if (d < D[a][b]) D[a][b] = D[b][a] = d; }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
  const finite = D.flat().filter(x => x > 0 && isFinite(x)), big = (finite.length ? Math.max(...finite) : 1) * 1.2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (!isFinite(D[i][j])) D[i][j] = big;   // disconnected: keep apart
  // Start on a circle, the start site on the left.
  const s0 = idx.get(start) ?? 0;
  let X = nodes.map((_, i) => { const a = Math.PI + (2 * Math.PI * ((i - s0 + n) % n)) / n; return [Math.cos(a) * big / 2, Math.sin(a) * big / 2 * 0.9 + (i % 2 ? 0.01 : -0.01)]; });
  // SMACOF iterations.
  for (let it = 0; it < 300; it++) {
    const Y = X.map((xi, i) => {
      let sx = 0, sy = 0, sw = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = 1 / (D[i][j] * D[i][j]), dx = xi[0] - X[j][0], dy = xi[1] - X[j][1], r = Math.hypot(dx, dy) || 1e-6;
        sx += w * (X[j][0] + D[i][j] * dx / r); sy += w * (X[j][1] + D[i][j] * dy / r); sw += w;
      }
      return [sx / sw, sy / sw];
    });
    X = Y;
  }
  // Turn the widest spread horizontal, and put the start on the left.
  const mx = X.reduce((a, p) => a + p[0], 0) / n, my = X.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of X) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(-th), s = Math.sin(-th);
  X = X.map(([x, y]) => [(x - mx) * c - (y - my) * s, (x - mx) * s + (y - my) * c]);
  if (X[s0][0] > 0) X = X.map(([x, y]) => [-x, y]);
  // Fit into the box, keeping the proportions, with room for labels.
  const xs = X.map(p => p[0]), ys = X.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) || 1, hgt = Math.max(...ys) - Math.min(...ys) || 1;
  const k = Math.min((width - 2 * pad) / w, (height - 2 * pad + 10) / hgt);
  const ox = (width - w * k) / 2 - Math.min(...xs) * k, oy = (height - hgt * k) / 2 - Math.min(...ys) * k - 6;
  let P = X.map(([x, y]) => [x * k + ox, y * k + oy]);
  // Sites a few minutes' walk apart would sit on each other's labels: nudge them apart, inside the box.
  const minSep = 70;
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], d = Math.hypot(dx, dy) || 0.01;
      if (d >= minSep) continue;
      const push = (minSep - d) / 2, ux = dx / d, uy = dy / d;
      P[i] = [P[i][0] - ux * push, P[i][1] - uy * push]; P[j] = [P[j][0] + ux * push, P[j][1] + uy * push]; moved = true;
    }
    P = P.map(([x, y]) => [Math.min(width - pad, Math.max(pad, x)), Math.min(height - 34, Math.max(22, y))]);
    if (!moved) break;
  }
  const out = {};
  nodes.forEach((id, i) => { out[id] = [Math.round(P[i][0] * 10) / 10, Math.round(P[i][1] * 10) / 10]; });
  return out;
}

// How a route is travelled, in words.
export const BY = { '4x4': '4×4', road: 'road', foot: 'on foot', 'bank track': 'bank track', 'game vehicle': 'game vehicle' };
export const byWords = b => BY[b] || b;
