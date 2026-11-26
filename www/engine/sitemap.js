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

// ═══ The printed map (B13b) ═══════════════════════════════════════════════════════════════════════════
// A field sheet in the manner of a topographic map: land cover for the region (savanna, tea and forest,
// desert and lava, farmland, town streets, suburban plots, or a building's site plan), contours and spot
// heights, rivers, dry luggas and lakes, roads by surface with bridges and fords, map symbols for each kind
// of site, a grid with coordinates, a north arrow or compass rose, a scale bar, and a Kenya locator inset.
// Everything is generated from the case file and a seed, so a case always prints the same sheet. Terrain
// never depends on what the player has found (it doesn't move or give anything away); only the routes and
// site symbols you know are drawn. Pure: returns SVG text and geometry, no DOM.

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = s => { let v = 2166136261; for (const ch of String(s)) v = Math.imul(v ^ ch.charCodeAt(0), 16777619) >>> 0; return v; };
function noise2(seed) {
  const h = (x, y) => { let v = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y) => (n(x, y) + n(x * 2.03 + 17, y * 2.03 + 9) / 2 + n(x * 4.1 + 41, y * 4.1 + 23) / 4) / 1.75;
}
const f1 = v => (Math.round(v * 10) / 10).toString();
const esc = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Kenya, from Natural Earth 1:50m (public domain), simplified to 67 points; lon/lat.
export const KENYA = [[33.9,-1],[33.94,0.17],[34.16,0.6],[34.41,0.87],[34.48,1.04],[34.6,1.16],[34.8,1.25],[34.79,1.38],[34.97,1.64],[34.98,1.77],[34.86,2.59],[34.74,2.82],[34.59,2.92],[34.52,3.12],[34.45,3.16],[34.4,3.41],[34.44,3.65],[34.17,3.81],[34.18,3.87],[34.13,3.89],[33.98,4.22],[35.27,5.49],[35.26,5.41],[35.33,5.36],[35.47,5.42],[35.75,5.34],[35.8,5.16],[35.76,4.81],[36.02,4.47],[36.91,4.41],[38.09,3.65],[39.49,3.46],[39.66,3.58],[39.84,3.85],[40.77,4.27],[41.14,3.96],[41.88,3.98],[41.34,3.2],[40.96,2.81],[40.98,-0.87],[41.52,-1.57],[41.53,-1.7],[41.27,-1.95],[41.11,-1.98],[41,-1.95],[40.95,-2.06],[40.89,-2.02],[40.9,-2.27],[40.64,-2.54],[40.41,-2.56],[40.22,-2.69],[40.18,-2.82],[40.2,-3.02],[40.12,-3.25],[39.99,-3.35],[39.86,-3.58],[39.73,-3.99],[39.38,-4.63],[39.29,-4.61],[39.19,-4.68],[37.8,-3.67],[37.71,-3.54],[37.61,-3.5],[37.68,-3.31],[37.64,-3.05],[34.05,-1.04],[33.9,-1]];
// Approximate positions of the towns and areas the cases name (lat, lon), for the locator and the margins.
const GAZ = [['talek', -1.45, 35.22], ['sekenani', -1.56, 35.36], ['narok', -1.08, 35.87], ['mara', -1.49, 35.14], ['karatina', -0.48, 37.13], ['mukurwe', -0.56, 37.05],
  ['othaya', -0.55, 36.94], ['tetu', -0.43, 36.88], ['nyeri', -0.42, 36.95], ['runyenjes', -0.42, 37.57], ['embu', -0.53, 37.45], ['chuka', -0.33, 37.65], ['timau', 0.09, 37.24],
  ['naro moru', -0.16, 37.02], ['nanyuki', 0.01, 37.07], ['kerugoya', -0.5, 37.28], ['sagana', -0.67, 37.21], ['meru', 0.05, 37.65], ['loiyangalani', 2.76, 36.72],
  ["archer's post", 0.64, 37.67], ['garba tula', 0.53, 38.52], ['logologo', 1.98, 37.92], ['marsabit', 2.33, 37.99], ['bakuli', 2.3, 37.97], ['kalacha', 3.12, 37.42], ['chalbi', 3.0, 37.3],
  ['lokichar', 2.38, 35.65], ['moyale', 3.52, 39.05], ['wabera', 0.35, 37.58], ['bula pesa', 0.36, 37.59], ['isiolo', 0.35, 37.58], ['karen', -1.32, 36.71], ['lavington', -1.28, 36.77],
  ['westlands', -1.27, 36.81], ['runda', -1.22, 36.81], ['kilimani', -1.29, 36.79], ['riverside', -1.27, 36.8], ['kileleshwa', -1.28, 36.78], ['south b', -1.31, 36.84],
  ['mombasa road', -1.33, 36.87], ['jkia', -1.32, 36.93], ['kitengela', -1.47, 36.96], ['kirinyaga road', -1.28, 36.83], ['busia', 0.46, 34.11], ['bahati', -0.15, 36.15],
  ['nakuru', -0.3, 36.07], ['dunga', -0.14, 34.74], ['riat', -0.07, 34.7], ['kisumu', -0.09, 34.77], ['aberdare', -0.33, 36.9], ['nairobi', -1.29, 36.82]];
const REGION_AT = { 6: [-1.42, 35.18], 7: [-0.4, 37.1], 8: [1.5, 37.8], 9: [-1.29, 36.78], 10: [-1.29, 36.82] };
// Walking 4.5 km/h, a 4×4 on murram 25, a car on tarmac 45: rough straight-line kilometres for the scale bar.
const KMH = { road: 45, car: 45, '4x4': 25, 'game vehicle': 20, 'bank track': 15, foot: 4.5, boda: 25, lift: 1.5, stairs: 1.2 };

// Which kind of sheet a case gets.
export function mapTheme(c) {
  const region = c.meta.regionNumber, nodes = c.map.nodes.map(id => [...c.locations, ...(c.places || [])].find(x => x.id === id)).filter(Boolean);
  const names = nodes.map(x => x.name.toLowerCase()).join(' | '), by = new Set(c.map.edges.map(e => e.by)), maxMin = Math.max(...c.map.edges.map(e => e.minutes));
  const land = region === 6 ? 'savanna' : region === 7 ? 'highland' : region === 8 ? 'arid' : region === 9 ? 'urban' : /busia|bahati|nakuru|kisumu|dunga|riat/.test(names) ? 'farmland' : 'urban';
  let kind = land;
  const indoors = by.has('lift') || by.has('stairs');
  if (indoors) kind = maxMin <= 5 ? 'building' : 'urban';
  else if (maxMin > 60 && region >= 9) kind = 'farmland';
  else if (region === 9 || /karen|runda|lavington|westlands|kilimani|kileleshwa|riverside|south b|milimani/.test(names)) kind = 'suburb';
  else {
    // A town sheet when the sites are a short walk apart (median route about a kilometre or less).
    const km = c.map.edges.map(e => e.minutes / 60 * (KMH[e.by] || 20) * 0.75).sort((a, b) => a - b);
    if (km[Math.floor(km.length / 2)] <= 1.0 && !/reserve|kill|plain|drop/.test(names)) kind = 'town';
  }
  return { kind, land, region };
}
// What a site is, for its map symbol.
export function siteKind(x) {
  const n = `${x.name}`.toLowerCase();
  if (x.kind === 'scene') return 'scene';
  if (/airstrip|\bstrip\b|jkia|departures/.test(n)) return 'airstrip';
  if (/camp|tent|lodge(?! store)|guesthouse/.test(n)) return 'camp';
  if (/gate|checkpoint|boom/.test(n)) return 'gate';
  if (/manyatta|enkang|boma|village|homestead/.test(n)) return 'village';
  if (/market|pens|stall|kiosk|stage/.test(n)) return 'market';
  if (/church|parish|mission/.test(n)) return 'church';
  if (/hospital|dispensary|casualty|heart centre|chemist/.test(n)) return 'hospital';
  if (/police|cell|impound/.test(n)) return 'police';
  if (/school/.test(n)) return 'school';
  if (/house|home|flat|cottage|compound|maisonette|farm|quarters|room\b/.test(n)) return 'house';
  if (/river|bridge|crossing|lugga|laga|beach|bank\b/.test(n)) return 'water';
  if (/office|registry|hq|post|store|shop|motors|factory|club|studio|hotel|yard|centre|bar|annex|towers|plaza|foundation|lands house|desk/.test(n)) return 'building';
  return 'point';
}

let RENDERS = 0;                         // every drawing gets its own ids (the folder and the sheet share a page)
export function renderMap(c, view, opts = {}) {
  const { W = 340, H = 220, full = false, P, regionName = '' } = opts;
  const theme = mapTheme(c), seed = hashStr(c.meta.id), U = `${seed}x${++RENDERS}`, R = rng(seed), N = noise2(seed % 100000);
  const map = c.map, all = [...c.locations, ...(c.places || [])], get = id => all.find(x => x.id === id);
  const sites = view.sites, byIdS = new Map(sites.map(s => [s.id, s])), shown = id => byIdS.get(id)?.known;
  const out = [], defs = [], legend = new Set();
  const K = theme.kind, L = theme.land;
  const PAL = {
    savanna: { ground: '#E6D9AC', ground2: '#D9CC94', tree: '#6F7F3C', treeDk: '#4C5A24', contour: '#A9784A' },
    highland: { ground: '#D6DFB4', ground2: '#C3D29A', tree: '#3F6B2F', treeDk: '#28481C', contour: '#9A6B3E' },
    arid: { ground: '#EBD7A8', ground2: '#E0C48C', tree: '#7E7B3E', treeDk: '#59562A', contour: '#B07C4C' },
    farmland: { ground: '#E2E0B4', ground2: '#CFD49A', tree: '#557A34', treeDk: '#3A5A22', contour: '#A27848' },
    urban: { ground: '#E7E1D2', ground2: '#D9D2BF', tree: '#5F8040', treeDk: '#3F5C28', contour: '#A68A62' },
  }[L];
  const inMap = (x, y, m = 0) => x >= m && y >= m && x <= W - m && y <= H - m;

  const Pn = P || {}, wout = [], cover = [];
  const tree = (x, y, s, kind = 'round') => kind === 'acacia'
    ? `<g transform="translate(${f1(x)} ${f1(y)})"><path d="M0 0v${f1(3 * s)}" class="mp-trunk"/><ellipse cx="0" cy="0" rx="${f1(4.2 * s)}" ry="${f1(1.5 * s)}" fill="${PAL.tree}"/></g>`
    : kind === 'palm' ? `<g transform="translate(${f1(x)} ${f1(y)})" class="mp-palm"><path d="M0 0l-3 -2M0 0l3 -2M0 0l-2.4 1.2M0 0l2.4 1.2M0 0v3"/></g>`
    : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(2.4 * s)}" fill="${PAL.tree}" stroke="${PAL.treeDk}" stroke-width=".6"/>`;
  // ── Water (worked out first: buildings and trees keep off it) ──────────────────────────────────────────────────────────────────────────────────────────
  const water = [], lakes = [];
  const riverName = x => { const m = /([A-Z][a-z]+) [Rr]iver(?! [Cc]amp)/.exec(`${x.name} ${x.description || ''}`); return m && !/^(The|A|In|On|Of)$/.test(m[1]) ? `${m[1]} River` : null; };
  const LAKES = [[/loiyangalani|turkana|kalokol/, 'Lake Turkana'], [/dunga|kisumu|victoria|homa bay/, 'Lake Victoria'], [/naivasha/, 'Lake Naivasha'], [/nakuru/, 'Lake Nakuru']];
  const nodeSites = map.nodes.map(id => ({ id, x: get(id), p: Pn[id] })).filter(s => s.x && s.p);
  const byName = new Map(), bank = [];
  for (const s of nodeSites) {
    const t = `${s.x.name} ${s.x.description || ''}`.toLowerCase();
    if (/\blake\b|beach/.test(s.x.name.toLowerCase())) {
      const m = /Lake ([A-Z][a-z]+)/.exec(`${s.x.name} ${s.x.description || ''}`), all2 = `${map.nodes.map(id => get(id)?.name || '').join(' ')} ${c.ob.text}`.toLowerCase();
      lakes.push({ s, name: m ? `Lake ${m[1]}` : (LAKES.find(([re]) => re.test(all2))?.[1] || 'Lake') }); continue; }
    const dry = /lugga|laga|dry (river|bed)/.test(t), on = /crossing|bridge|river ?bed|bed\b|lugga|laga/.test(s.x.name.toLowerCase());
    if (/river|lugga|laga|bridge|riverbed|river bank/.test(t) && !/river camp/.test(s.x.name.toLowerCase()) || on && /river|lugga|laga/.test(t)) {
      const name = riverName(s.x) || (dry ? (/laga/.test(t) ? 'Laga' : 'Lugga') : 'River');
      if (!byName.has(name)) byName.set(name, { name, dry, pts: [] });
      byName.get(name).pts.push({ p: s.p, on });
    } else if (/river camp|high bank|\bbend\b|river bank/.test(t)) bank.push(s);
  }
  // Camps on the bank, and bends, sit on the river the sheet already has (or a river of their own).
  for (const s of bank) {
    const main = [...byName.values()].find(r => !r.dry);
    const on = /\bbend\b/.test(s.x.name.toLowerCase());
    if (main) main.pts.push({ p: s.p, on }); else { const name = riverName(s.x) || 'River'; byName.set(name, { name, dry: false, pts: [{ p: s.p, on }] }); }
  }
  // A seasonal stream somewhere on open ground, if the sheet has no river of its own.
  if (!byName.size && !lakes.length && ['savanna', 'highland', 'farmland', 'arid'].includes(K)) {
    let best = null;
    for (let t = 0; t < 12; t++) { const a = R() * Math.PI, cx = W * (0.2 + R() * 0.6), cy = H * (0.2 + R() * 0.6);
      const d = Math.min(...nodeSites.map(s => Math.abs((s.p[0] - cx) * Math.sin(a) - (s.p[1] - cy) * Math.cos(a))), 999);
      if (!best || d > best.d) best = { a, cx, cy, d }; }
    if (best && best.d > 22) byName.set('_stream', { name: L === 'arid' ? 'Lugga' : '', dry: L === 'arid', seasonal: true, pts: [{ p: [best.cx, best.cy], on: true, dir: best.a }] });
  }
  const rivers = [];
  for (const rv of byName.values()) {
    // Through its sites (on them, or beside them on the bank), edge to edge across the sheet, meandering.
    const pts = rv.pts.map(q => q.p);
    const ang = rv.pts[0].dir ?? (pts.length > 1 ? Math.atan2(pts[pts.length - 1][1] - pts[0][1], pts[pts.length - 1][0] - pts[0][0]) : R() * Math.PI - Math.PI / 2);
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const anchors = rv.pts.map(q => q.on ? q.p : [q.p[0] + nx * 13, q.p[1] + ny * 13]).sort((a, b) => (a[0] * ux + a[1] * uy) - (b[0] * ux + b[1] * uy));
    const reach = Math.hypot(W, H);
    const A = [anchors[0][0] - ux * reach, anchors[0][1] - uy * reach], Z = [anchors.at(-1)[0] + ux * reach, anchors.at(-1)[1] + uy * reach];
    const chain = [A, ...anchors, Z], line = [];
    const ph = R() * 10, amp = rv.dry ? 7 : 11;
    for (let k = 0; k < chain.length - 1; k++) {
      const [x0, y0] = chain[k], [x1, y1] = chain[k + 1], len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(2, Math.ceil(len / 6));
      const sx = (x1 - x0) / len, sy = (y1 - y0) / len;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, taper = Math.sin(Math.PI * t), off = amp * taper * (Math.sin((t * len) / 23 + ph) + 0.5 * Math.sin((t * len) / 9 + ph * 2));
        const x = x0 + (x1 - x0) * t - sy * off, y = y0 + (y1 - y0) * t + sx * off;
        if (x > -30 && y > -30 && x < W + 30 && y < H + 30) line.push([x, y]);
      }
    }
    if (line.length < 3) continue;
    if (line[0][0] > line.at(-1)[0]) line.reverse();                  // labels read left to right
    const d = 'M' + line.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L');
    rivers.push({ ...rv, line, d, id: `riv-${U}-${rivers.length}` });
  }
  for (const rv of rivers) {
    if (rv.dry) {
      wout.push(`<path d="${rv.d}" class="mp-lugga-bed"/><path d="${rv.d}" class="mp-lugga" id="${rv.id}"/>`); legend.add('lugga');
      if (L === 'arid' || L === 'savanna') for (let i = 0; i < rv.line.length; i += 3) if (R() < 0.45) { const [x, y] = rv.line[i]; cover.push(tree(x + (R() - 0.5) * 14, y + (R() - 0.5) * 14, 0.9, L === 'arid' ? 'palm' : 'acacia')); }
      if (L === 'arid') legend.add('doum palm');
    } else {
      wout.push(`<path d="${rv.d}" class="mp-river-bank"/><path d="${rv.d}" class="${rv.seasonal ? 'mp-stream' : 'mp-river'}" id="${rv.id}"/>`);
      legend.add(rv.seasonal ? 'seasonal stream' : 'river');
      if (!rv.seasonal) { for (let i = 0; i < rv.line.length; i++) if (R() < 0.55) { const [x, y] = rv.line[i], o = (R() < 0.5 ? -1 : 1) * (5 + R() * 6); cover.push(tree(x + o * 0.7, y + o * 0.7, 0.9)); } legend.add('riverine forest'); }
    }
    water.push(rv);
  }
  for (const lk of lakes) {
    // The shore runs through the beach; the lake fills the side toward the nearest sheet edge.
    const [bx, by] = lk.s.p, dirs = [[bx, -1, 0], [W - bx, 1, 0], [by, 0, -1], [H - by, 0, 1]].sort((a, b) => a[0] - b[0])[0];
    const dx = dirs[1], dy = dirs[2], tx = -dy, ty = dx, shore = [];
    for (let s = -1.4; s <= 1.4; s += 0.05) { const k = s * Math.max(W, H), w = 5 * Math.sin(k / 17) + 3 * Math.sin(k / 7 + 1); shore.push([bx + tx * k + dx * (w - 4), by + ty * k + dy * (w - 4)]); }
    const far = Math.max(W, H) * 2, poly = [...shore, [shore.at(-1)[0] + dx * far, shore.at(-1)[1] + dy * far], [shore[0][0] + dx * far, shore[0][1] + dy * far]];
    const dP = 'M' + poly.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L') + 'Z', dS = 'M' + shore.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L');
    defs.push(`<clipPath id="lk-${U}"><path d="${dP}"/></clipPath>`);
    wout.push(`<path d="${dP}" class="mp-lake"/><g clip-path="url(#lk-${U})">${[5, 10, 16].map((o, i) => `<path d="${dS}" class="mp-waterline" transform="translate(${dx * o} ${dy * o})" opacity="${0.7 - i * 0.2}"/>`).join('')}</g><path d="${dS}" class="mp-shore"/>`);
    // The name inside the water: along a narrow strip, centred and clear of the sheet edge on a wide one.
    const strip = dirs[0], tw = lk.name.length * 9.2, mid = strip / 2;
    let lx, ly, rot = 0;
    if (strip < 70 && dx !== 0) { lx = bx + dx * Math.max(10, mid); ly = Math.min(H - tw / 2 - 8, Math.max(tw / 2 + 8, H / 2)); rot = dx < 0 ? -90 : 90; }
    else if (strip < 70) { ly = by + dy * Math.max(9, mid) + 3; lx = Math.min(W - tw / 2 - 8, Math.max(tw / 2 + 8, W / 2)); }
    else { lx = Math.min(W - tw / 2 - 8, Math.max(tw / 2 + 8, bx + dx * mid + tx * 60)); ly = Math.min(H - 12, Math.max(14, by + dy * mid + ty * 40)); }
    wout.push(`<text class="mp-water-label mp-lake-label" x="${f1(lx)}" y="${f1(ly)}" text-anchor="middle"${rot ? ` transform="rotate(${rot} ${f1(lx)} ${f1(ly)})"` : ''}>${esc(lk.name.toUpperCase())}</text>`);
    lk.poly = poly; legend.add('lake');
  }

  const inPoly = (x, y, poly) => { let c2 = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c2 = !c2; } return c2; };
  const nearWater = (x, y, d = 10) => lakes.some(l => inPoly(x, y, l.poly)) || water.some(rv => rv.line.some(([px, py]) => Math.abs(px - x) < d && Math.abs(py - y) < d && Math.hypot(px - x, py - y) < d));

  // ── Ground and land cover ───────────────────────────────────────────────────────────────────────────
  defs.push(`<clipPath id="mf-${U}"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>`);
  out.push(`<rect class="mp-ground" x="0" y="0" width="${W}" height="${H}" fill="${K === 'building' ? '#E4E0D6' : PAL.ground}"/>`);
  // Large soft patches of a second ground tone (grassland vs. bare, wet vs. dry).
  if (K !== 'building') {
    let blobs = '';
    for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 10) if (N(x / 90 + 3, y / 90 + 7) > 0.62) blobs += `M${x} ${y}h10v10h-10z`;
    out.push(`<path d="${blobs}" fill="${PAL.ground2}" opacity=".55" filter="url(#mp-soft-${U})"/>`);
    defs.push(`<filter id="mp-soft-${U}" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>`);
  }
  if (K === 'savanna' || (K === 'town' && L === 'savanna')) {
    // Scattered acacia, thicker in patches; grass tufts between.
    let tufts = '';
    for (let i = 0; i < W * H / 260; i++) { const x = R() * W, y = R() * H; tufts += `M${f1(x)} ${f1(y)}l1.2 -2.2M${f1(x + 2)} ${f1(y)}l0 -2.6M${f1(x + 4)} ${f1(y)}l-1.2 -2.2`; }
    out.push(`<path d="${tufts}" class="mp-tuft"/>`);
    const n = K === 'town' ? W * H / 3000 : W * H / 1100;
    for (let i = 0; i < n; i++) { const x = R() * W, y = R() * H; if (N(x / 60, y / 60) > 0.42 || R() < 0.25) cover.push(tree(x, y, 0.8 + R() * 0.5, 'acacia')); }
    legend.add('acacia');
    // Thicket: stippled patches.
    let st = ''; for (let y = 0; y < H; y += 5) for (let x = 0; x < W; x += 5) if (N(x / 40 + 11, y / 40 + 3) > 0.74 && R() < 0.6) st += `M${f1(x + R() * 4)} ${f1(y + R() * 4)}h.8`;
    if (st) { out.push(`<path d="${st}" class="mp-stipple" stroke="${PAL.treeDk}"/>`); legend.add('thicket'); }
  }
  if (K === 'highland' || (K === 'town' && L === 'highland')) {
    // Tea in rows on the slopes, forest blocks, smallholder field lines.
    defs.push(`<pattern id="mp-tea-${U}" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(${Math.round(R() * 60 - 30)})"><path d="M0 2q1.5 -1.4 3 0t3 0" fill="none" stroke="#5C8A3A" stroke-width="1.1"/></pattern>`);
    let tea = ''; for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) if (N(x / 70 + 5, y / 70 + 1) > (K === 'town' ? 0.7 : 0.55)) tea += `M${x} ${y}h8v8h-8z`;
    if (tea) { out.push(`<path d="${tea}" fill="url(#mp-tea-${U})" opacity=".85"/>`); legend.add('tea'); }
    for (let i = 0; i < W * H / 220; i++) { const x = R() * W, y = R() * H; if (N(x / 55 + 30, y / 55 + 12) > 0.66) cover.push(tree(x, y, 0.9 + R() * 0.4)); }
    legend.add('forest');
    let fl = ''; for (let i = 0; i < W * H / 2600; i++) { const x = R() * W, y = R() * H, a = R() * Math.PI, l = 14 + R() * 26; fl += `M${f1(x)} ${f1(y)}l${f1(Math.cos(a) * l)} ${f1(Math.sin(a) * l)}`; }
    out.push(`<path d="${fl}" class="mp-field"/>`);
  }
  if (K === 'farmland' || (K === 'town' && L === 'farmland')) {
    const a = R() * 0.6 - 0.3, ca = Math.cos(a), sa = Math.sin(a); let fld = '', alt = '';
    for (let gy = -H; gy < H * 2; gy += 26) for (let gx = -W; gx < W * 2; gx += 34 + Math.floor(R() * 14)) {
      const x = gx * ca - gy * sa, y = gx * sa + gy * ca; if (!inMap(x, y, -40)) continue;
      const d = `M${f1(x)} ${f1(y)}l${f1(34 * ca)} ${f1(34 * sa)}l${f1(-26 * sa)} ${f1(26 * ca)}l${f1(-34 * ca)} ${f1(-34 * sa)}z`;
      if (R() < 0.35) alt += d; fld += d;
    }
    out.push(`<path d="${alt}" fill="#D3D79C" opacity=".7"/><path d="${fld}" class="mp-field" fill="none"/>`);
    for (let i = 0; i < W * H / 900; i++) cover.push(tree(R() * W, R() * H, 0.8));
    legend.add('fields');
  }
  if (K === 'arid' || (K === 'town' && L === 'arid')) {
    let sand = ''; for (let i = 0; i < W * H / 40; i++) sand += `M${f1(R() * W)} ${f1(R() * H)}h.7`;
    out.push(`<path d="${sand}" class="mp-stipple" stroke="#A0804A"/>`);
    defs.push(`<pattern id="mp-lava-${U}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v5M2.5 0v5" stroke="#4A3E36" stroke-width=".9"/></pattern>`);
    let lava = ''; for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) if (N(x / 80 + 50, y / 80 + 20) > 0.7) lava += `M${x} ${y}h8v8h-8z`;
    if (lava && K !== 'town') { out.push(`<path d="${lava}" fill="url(#mp-lava-${U})" opacity=".55"/>`); legend.add('lava'); }
    for (let i = 0; i < W * H / 2600; i++) cover.push(tree(R() * W, R() * H, 0.7, 'acacia'));
    legend.add('sand');
  }
  if (K === 'urban' || K === 'suburb') {
    // Leafy plots: a street grid, a house on each plot, gardens and hedges.
    const a = R() * 0.5 - 0.25, ca = Math.cos(a), sa = Math.sin(a), step = K === 'suburb' ? 38 : 26; let st = '', plots = '', houses = '';
    for (let k = -2 * Math.max(W, H); k < 3 * Math.max(W, H); k += step) {
      st += `M${f1(k * ca - -H * sa)} ${f1(k * sa + -H * ca)}L${f1(k * ca - 2 * H * sa)} ${f1(k * sa + 2 * H * ca)}`;
      st += `M${f1(-W * ca - k * sa)} ${f1(-W * sa + k * ca)}L${f1(2 * W * ca - k * sa)} ${f1(2 * W * sa + k * ca)}`;
    }
    for (let gy = -H; gy < 2 * H; gy += step) for (let gx = -W; gx < 2 * W; gx += step) {
      const cx = gx * ca - gy * sa + step / 2, cy = gx * sa + gy * ca + step / 2; if (!inMap(cx, cy, -10)) continue;
      for (const [ox, oy] of K === 'suburb' ? [[0, 0]] : [[-6, -5], [6, 4]]) {
        const x = cx + ox + (R() - 0.5) * 6, y = cy + oy + (R() - 0.5) * 6, w = K === 'suburb' ? 7 + R() * 4 : 5 + R() * 3, hh = w * (0.6 + R() * 0.3);
        houses += `<rect x="${f1(x - w / 2)}" y="${f1(y - hh / 2)}" width="${f1(w)}" height="${f1(hh)}" transform="rotate(${f1(a * 57.3)} ${f1(x)} ${f1(y)})"/>`;
      }
      if (K === 'suburb') for (let t = 0; t < 3; t++) cover.push(tree(cx + (R() - 0.5) * step * 0.8, cy + (R() - 0.5) * step * 0.8, 0.9 + R() * 0.5));
    }
    out.push(`<path d="${st}" class="mp-street"/><g class="mp-house">${houses}</g>`);
    legend.add('streets'); legend.add('buildings'); if (K === 'suburb') legend.add('gardens');
  }
  if (K === 'town') {
    // A town: streets and building blocks around the sites, open ground of the region around them.
    const a = R() * 0.5 - 0.25, ca = Math.cos(a), sa = Math.sin(a), step = 22; let st = '', bl = '';
    const P0 = Object.fromEntries(Object.entries(P || {}).filter(([id]) => !/chalbi|desert|plain|verge|ditch|drop|kill|crossing|lugga|laga/.test((get(id)?.name || '').toLowerCase()))), reach = Math.max(60, Math.min(W, H) * 0.3);
    const dmin = (x, y) => Math.min(...Object.values(P0).map(([px, py]) => Math.hypot(px - x, py - y)));
    const near = (x, y) => { const d = dmin(x, y); return d < reach && R() > (d / reach) ** 2 * 0.9 && !nearWater(x, y, 13); };
    // Continuous streets inside the built-up area (a soft edge of circles round the sites), blocks between them.
    const clipId = `tw-${U}`;
    defs.push(`<clipPath id="${clipId}">${Object.values(P0).map(([px, py]) => `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(reach * 0.92)}"/>`).join('')}</clipPath>`);
    for (let k = -2 * Math.max(W, H); k < 3 * Math.max(W, H); k += step) {
      st += `M${f1(k * ca + H * sa)} ${f1(k * sa - H * ca)}L${f1(k * ca - 2 * H * sa)} ${f1(k * sa + 2 * H * ca)}`;
      st += `M${f1(-W * ca - k * sa)} ${f1(-W * sa + k * ca)}L${f1(2 * W * ca - k * sa)} ${f1(2 * W * sa + k * ca)}`;
    }
    for (let gy = -H; gy < 2 * H; gy += step) for (let gx = -W; gx < 2 * W; gx += step) {
      const cx = gx * ca - gy * sa + step / 2, cy = gx * sa + gy * ca + step / 2; if (!inMap(cx, cy, -8) || !near(cx, cy) || R() < 0.12) continue;
      for (const [ox, oy] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) if (R() < 0.6) {
        const x = cx + ox * ca - oy * sa, y = cy + ox * sa + oy * ca, w = 5 + R() * 3, hh = 5 + R() * 3;
        bl += `<rect x="${f1(x - w / 2)}" y="${f1(y - hh / 2)}" width="${f1(w)}" height="${f1(hh)}" transform="rotate(${f1(a * 57.3)} ${f1(x)} ${f1(y)})"/>`;
      }
    }
    out.push(`<g clip-path="url(#${clipId})"><path d="${st}" class="mp-street mp-street--town"/></g><g class="mp-house">${bl}</g>`);
    legend.add('streets'); legend.add('buildings');
  }
  if (K === 'building') {
    defs.push(`<pattern id="mp-pave-${U}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#CFC8B8" stroke-width=".7"/></pattern>`);
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#mp-pave-${U})"/>`);
    // The building's footprint round its rooms and floors, with interior walls.
    const ps = Object.values(P || {}); if (ps.length) {
      const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]), x0 = Math.max(8, Math.min(...xs) - 40), y0 = Math.max(8, Math.min(...ys) - 34), x1 = Math.min(W - 8, Math.max(...xs) + 40), y1 = Math.min(H - 8, Math.max(...ys) + 40);
      let walls = ''; for (let x = x0 + 30 + R() * 20; x < x1 - 20; x += 36 + R() * 30) walls += `M${f1(x)} ${f1(y0)}V${f1(y0 + (y1 - y0) * (0.35 + R() * 0.4))}`;
      walls += `M${f1(x0)} ${f1((y0 + y1) / 2)}H${f1(x1 - 30)}`;
      out.push(`<rect class="mp-bldg" x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}"/><path class="mp-wall" d="${walls}"/>`);
      legend.add('building plan');
    }
    for (let i = 0; i < 10; i++) { const x = R() * W, y = R() * H; if (x < 30 || x > W - 30 || y < 20 || y > H - 20) cover.push(tree(x, y, 1)); }
  }

  // Small towns on a landscape sheet: a built-up cluster round each site that is in a town.
  if (['savanna', 'highland', 'arid', 'farmland'].includes(K)) {
    let st = '', bl = '';
    for (const id of map.nodes) {
      const x = get(id), p = Pn[id]; if (!x || !p) continue;
      const nm = x.name.toLowerCase(), town = /town|street|market|registry|police|hospital|chemist|shop|store(?! room)|office|club|hotel|yard|centre|motors|boda|stage|kiosk|curios|mission|dispensary|parish|church/.test(nm) && !/camp|kill|plain|lugga|laga|crossing|strip|verge|ditch|bend|drop|farm|homestead|manyatta|enkang/.test(nm);
      if (!town) continue;
      const a = (hashStr(id) % 60 - 30) / 57.3, ca = Math.cos(a), sa = Math.sin(a), rad = full ? 34 : 24;
      for (let gy = -rad; gy <= rad; gy += 11) for (let gx = -rad; gx <= rad; gx += 11) {
        const d = Math.hypot(gx, gy); if (d > rad || R() < d / rad * 0.8) continue;
        const cx = p[0] + gx * ca - gy * sa, cy = p[1] + gx * sa + gy * ca; if (nearWater(cx, cy, 9) || Math.hypot(cx - p[0], cy - p[1]) < 9) continue;
        const w = 4 + R() * 3, hh = 3.5 + R() * 3;
        bl += `<rect x="${f1(cx - w / 2)}" y="${f1(cy - hh / 2)}" width="${f1(w)}" height="${f1(hh)}" transform="rotate(${f1(a * 57.3)} ${f1(cx)} ${f1(cy)})"/>`;
      }
      st += `M${f1(p[0] - rad * ca)} ${f1(p[1] - rad * sa)}L${f1(p[0] + rad * ca)} ${f1(p[1] + rad * sa)}M${f1(p[0] + rad * sa * 0.7)} ${f1(p[1] - rad * ca * 0.7)}L${f1(p[0] - rad * sa * 0.7)} ${f1(p[1] + rad * ca * 0.7)}`;
    }
    if (bl) { out.push(`<path d="${st}" class="mp-street"/><g class="mp-house">${bl}</g>`); legend.add('buildings'); }
  }

  // ── Contours and spot heights ──────────────────────────────────────────────────────────────────────
  const ELEV = { savanna: [1480, 1720], highland: [1650, 2350], arid: [420, 980], farmland: [1150, 1950], urban: [1620, 1820] }[L];
  const levels = { savanna: 7, highland: 14, arid: 8, farmland: 8, urban: 4, town: 4, suburb: 4, building: 0 };
  const nl = K === 'town' || K === 'suburb' || K === 'building' ? levels[K] : levels[L];
  const hf = (x, y) => { let v = N(x / (W * 0.45) + 100, y / (W * 0.45) + 200); if (L === 'highland') v = v * 0.7 + (x / W) * 0.3; return v; };
  if (nl) {
    const g = full ? 5 : 6, cols = Math.ceil(W / g) + 1, rows = Math.ceil(H / g) + 1, Z = [];
    let zmin = 1, zmax = 0;
    for (let j = 0; j < rows; j++) { Z[j] = []; for (let i = 0; i < cols; i++) { const v = hf(i * g, j * g); Z[j][i] = v; zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); } }
    let thin = '', thick = ''; const labels = [];
    for (let k = 1; k < nl; k++) {
      const lv = zmin + (zmax - zmin) * k / nl, idx = k % 5 === 0;
      let d = '';
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = Z[j][i], b = Z[j][i + 1], cc = Z[j + 1][i + 1], dd = Z[j + 1][i];
        const s = (a > lv) | ((b > lv) << 1) | ((cc > lv) << 2) | ((dd > lv) << 3); if (s === 0 || s === 15) continue;
        const x = i * g, y = j * g, t = (p, q) => (lv - p) / (q - p);
        const T = [x + g * t(a, b), y], Rr = [x + g, y + g * t(b, cc)], B = [x + g * t(dd, cc), y + g], Lf = [x, y + g * t(a, dd)];
        const seg = { 1: [Lf, T], 2: [T, Rr], 3: [Lf, Rr], 4: [Rr, B], 5: [Lf, T, Rr, B], 6: [T, B], 7: [Lf, B], 8: [B, Lf], 9: [T, B], 10: [T, Rr, B, Lf], 11: [Rr, B], 12: [Rr, Lf], 13: [T, Rr], 14: [Lf, T] }[s];
        for (let q = 0; q < seg.length; q += 2) d += `M${f1(seg[q][0])} ${f1(seg[q][1])}L${f1(seg[q + 1][0])} ${f1(seg[q + 1][1])}`;
        if (idx && full && labels.length < 4 && R() < 0.004 && inMap(x, y, 30)) labels.push([x, y, Math.round((ELEV[0] + (ELEV[1] - ELEV[0]) * (lv - zmin) / (zmax - zmin)) / 10) * 10, Math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0])]);
      }
      if (idx) thick += d; else thin += d;
    }
    out.push(`<path d="${thin}" class="mp-contour" stroke="${PAL.contour}"/><path d="${thick}" class="mp-contour mp-contour--idx" stroke="${PAL.contour}"/>`);
    for (const [x, y, v, ang] of labels) { let deg = ang * 57.3; if (deg > 90) deg -= 180; if (deg < -90) deg += 180; out.push(`<text class="mp-clabel" fill="${PAL.contour}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(deg)})">${v}</text>`); }
    legend.add('contours');
    // Spot heights: the highest point gets a trig beacon.
    const cand = []; for (let i = 0; i < 160; i++) { const x = 20 + R() * (W - 40), y = 20 + R() * (H - 40); cand.push([hf(x, y), x, y]); }
    cand.sort((a, b) => b[0] - a[0]);
    const picks = [cand[0], ...cand.filter((_, i) => i % 40 === 7).slice(0, full ? 3 : 1)];
    picks.forEach(([v, x, y], i) => { const m = Math.round(ELEV[0] + (ELEV[1] - ELEV[0]) * (v - zmin) / ((zmax - zmin) || 1));
      out.push(i === 0 ? `<g class="mp-spot" transform="translate(${f1(x)} ${f1(y)})"><path d="M0 -3.5L3 2H-3Z"/><circle r=".9" cy=".2" fill="#fff"/><text x="5" y="3">${m}</text></g>` : `<g class="mp-spot" transform="translate(${f1(x)} ${f1(y)})"><circle r="1"/><text x="3.5" y="3">${m}</text></g>`); });
    legend.add('spot height');
  }

  out.push(...wout);
  // Trees go under the roads and symbols, and never in a lake.
  const keep = cover.filter(t => { const m = /translate\(([\d.-]+) ([\d.-]+)\)|cx="([\d.-]+)" cy="([\d.-]+)"/.exec(t); if (!m) return true; const x = +(m[1] ?? m[3]), y = +(m[2] ?? m[4]); return !lakes.some(l => inPoly(x, y, l.poly)); });
  out.push(`<g class="mp-trees">${keep.join('')}</g>`);
  // Water names along the river, away from the ends.
  for (const rv of water) if (rv.name && !rv.seasonal || rv.name === 'Lugga') {
    out.push(`<text class="mp-water-label" dy="-4"><textPath href="#${rv.id}" startOffset="${rv.dry ? 62 : 22}%">${esc(rv.name)}</textPath></text>`);
  }

  // ── Roads (only the ones you know) ─────────────────────────────────────────────────────────────────
  const curve = e => {
    const [x0, y0] = Pn[e.a], [x1, y1] = Pn[e.b], len = Math.hypot(x1 - x0, y1 - y0) || 1, r2 = rng(hashStr(e.a + e.b));
    const bend = (r2() - 0.5) * 0.32 * len * (e.by === 'lift' || e.by === 'stairs' ? 0 : 1);
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2 - (y1 - y0) / len * bend, cy: (y0 + y1) / 2 + (x1 - x0) / len * bend };
  };
  const bez = (q, t) => [(1 - t) ** 2 * q.x0 + 2 * (1 - t) * t * q.cx + t * t * q.x1, (1 - t) ** 2 * q.y0 + 2 * (1 - t) * t * q.cy + t * t * q.y1];
  const roads = map.edges.filter(e => Pn[e.a] && Pn[e.b] && shown(e.a) && shown(e.b)).map(e => ({ e, q: curve(e) }));
  const order = { foot: 0, stairs: 0, lift: 0, boda: 1, 'bank track': 1, 'game vehicle': 1, '4x4': 2, road: 3, car: 3 };
  roads.sort((a, b) => (order[a.e.by] ?? 1) - (order[b.e.by] ?? 1));
  const rcls = by => ({ road: 'tar', car: 'tar', '4x4': 'murram', foot: 'foot', boda: 'boda', lift: 'lift', stairs: 'lift' }[by] || 'track');
  for (const { e, q } of roads) {
    const d = `M${f1(q.x0)} ${f1(q.y0)}Q${f1(q.cx)} ${f1(q.cy)} ${f1(q.x1)} ${f1(q.y1)}`, k = rcls(e.by);
    if (k === 'tar' || k === 'murram') out.push(`<path d="${d}" class="mp-road-case mp-${k}-case" data-by="${esc(e.by)}"/><path d="${d}" class="mp-road mp-${k}"/>`);
    else out.push(`<path d="${d}" class="mp-road mp-${k}" data-by="${esc(e.by)}"/>`);
    legend.add({ tar: 'tarmac road', murram: 'murram road (4×4)', foot: 'footpath', boda: 'boda route', lift: 'lift / stairs', track: 'game track' }[k]);
    // Bridges and fords where the road meets water.
    if (k !== 'lift') for (const rv of water) {
      let prev = bez(q, 0);
      for (let s = 1; s <= 40; s++) {
        const cur = bez(q, s / 40);
        for (let i = 0; i < rv.line.length - 1; i++) {
          const [ax, ay] = rv.line[i], [bx2, by2] = rv.line[i + 1], den = (cur[0] - prev[0]) * (by2 - ay) - (cur[1] - prev[1]) * (bx2 - ax);
          if (!den) continue;
          const t = ((ax - prev[0]) * (by2 - ay) - (ay - prev[1]) * (bx2 - ax)) / den, u = ((ax - prev[0]) * (cur[1] - prev[1]) - (ay - prev[1]) * (cur[0] - prev[0])) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            const x = prev[0] + t * (cur[0] - prev[0]), y = prev[1] + t * (cur[1] - prev[1]), a = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]) * 57.3;
            if (rv.dry || k === 'track') { out.push(`<text class="mp-ford" x="${f1(x + 5)}" y="${f1(y - 4)}">Ford</text>`); legend.add('ford'); }
            else { out.push(`<g class="mp-bridge" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})"><path d="M-6 -3.6L-3.5 -2.4H3.5L6 -3.6M-6 3.6L-3.5 2.4H3.5L6 3.6"/></g>`); legend.add('bridge'); }
          }
        }
        prev = cur;
      }
    }
  }
  // Route times on the roads.
  for (const { e, q } of roads) {
    const len = Math.hypot(q.x1 - q.x0, q.y1 - q.y0), txt = e.minutes < 60 ? `${e.minutes} min` : `${Math.floor(e.minutes / 60)}h${e.minutes % 60 ? ` ${e.minutes % 60}m` : ''}`, pw = 10 + txt.length * 5.6;
    if (len - 56 < pw) continue;
    const [mx, my] = bez(q, 0.5), [ax, ay] = bez(q, 0.47), [bx2, by2] = bez(q, 0.53), l = Math.hypot(bx2 - ax, by2 - ay) || 1, nx = -(by2 - ay) / l, ny = (bx2 - ax) / l;
    out.push(`<g class="sm-time" transform="translate(${f1(mx + nx * 9)} ${f1(my + ny * 9)})"><rect x="${f1(-pw / 2)}" y="-7" width="${f1(pw)}" height="13" rx="2"/><text y="3">${esc(txt)}</text></g>`);
  }

  // ── Sites ──────────────────────────────────────────────────────────────────────────────────────────
  const SYM = {
    scene: '<circle class="mp-sym-scene" r="7.5"/><path class="sm-x" d="M-3.6 -3.6L3.6 3.6M3.6 -3.6L-3.6 3.6"/>',
    airstrip: '<g transform="rotate(-24)"><rect class="mp-sym" x="-15" y="-3" width="30" height="6"/><path d="M-12 0H12" class="mp-sym-line"/></g><path class="mp-sym-sock" d="M10 -12v6M10 -12l6 1.5-6 1.5"/>',
    camp: '<path class="mp-sym" d="M-7 4L-2 -5L3 4ZM1 4L5 -2L9 4Z"/>',
    gate: '<path class="mp-sym-bar" d="M-8 0H8M-8 -3.5V3.5M8 -3.5V3.5"/>',
    village: '<g class="mp-sym-ring">' + Array.from({ length: 9 }, (_, i) => `<circle r="1.5" cx="${f1(Math.cos(i * 0.698) * 6)}" cy="${f1(Math.sin(i * 0.698) * 6)}"/>`).join('') + '</g>',
    market: '<rect class="mp-sym" x="-5" y="-5" width="10" height="10"/><text class="mp-sym-t" y="3">M</text>',
    church: '<rect class="mp-sym" x="-4.5" y="-4.5" width="9" height="9"/><path class="mp-sym-wline" d="M0 -3V3M-2.4 -1H2.4"/>',
    hospital: '<rect class="mp-sym" x="-5" y="-5" width="10" height="10"/><text class="mp-sym-t" y="3">H</text>',
    police: '<rect class="mp-sym" x="-6.5" y="-4.5" width="13" height="9"/><text class="mp-sym-t mp-sym-t--s" y="2.6">POL</text>',
    school: '<rect class="mp-sym" x="-6.5" y="-4.5" width="13" height="9"/><text class="mp-sym-t mp-sym-t--s" y="2.6">SCH</text>',
    house: '<path class="mp-sym" d="M-5 5V-1L0 -5.5L5 -1V5Z"/>',
    water: '<circle class="mp-sym-water" r="5"/>',
    building: '<rect class="mp-sym" x="-5" y="-5" width="10" height="10"/>',
    point: '<circle class="mp-sym-pt" r="5"/>',
  };
  const sideOf = id => {
    const [x0, y0] = Pn[id];
    const ang = roads.filter(r => r.e.a === id || r.e.b === id).map(r => { const o = r.e.a === id ? [r.q.cx, r.q.cy] : [r.q.cx, r.q.cy]; return Math.atan2(o[1] - y0, o[0] - x0); });
    const clear = a => Math.min(Math.PI, ...ang.map(b => { const dd = Math.abs(a - b) % (2 * Math.PI); return dd > Math.PI ? 2 * Math.PI - dd : dd; }));
    return clear(Math.PI / 2) + 0.25 >= clear(-Math.PI / 2) ? 'below' : 'above';
  };
  const lines = (name, max = 15) => {
    const base = name.replace(/ \(.*\)$/, '').replace(/^The /, ''), words = (base[0].toUpperCase() + base.slice(1)).split(' '), ls = [''];
    for (const w of words) { const cur = ls[ls.length - 1]; if (cur && (cur + ' ' + w).length > max && ls.length < 2) ls.push(w); else ls[ls.length - 1] = cur ? `${cur} ${w}` : w; }
    return ls;
  };
  const kindsUsed = new Set();
  for (const s of sites) {
    if (!s.known || !Pn[s.id]) continue;
    const [cx, cy] = Pn[s.id], x = get(s.id), kind = s.location ? siteKind(x) : 'landmark', ls = lines(s.name, full ? 18 : 15);
    let up = sideOf(s.id) === 'above';
    if (!up && cy + 20 + (ls.length - 1) * 11 > H - 2) up = true;            // keep names on the sheet
    if (up && cy - 20 - (ls.length - 1) * 11 < 2) up = false;
    const half = Math.max(...ls.map(l => l.length)) * 3.1, ax = cx + half > W - 4 ? ['end', 8] : cx - half < 4 ? ['start', -8] : ['middle', 0];
    const r0 = kind === 'airstrip' ? 9 : 8, ty = up ? -(r0 + 6 + (ls.length - 1) * 11) : r0 + 12;
    const t = ls.map((ln, i) => `<tspan x="${ax[1]}" dy="${i ? 11 : 0}">${esc(ln)}</tspan>`).join('');
    if (!s.location) { out.push(`<g class="sm-site is-landmark" transform="translate(${f1(cx)} ${f1(cy)})" aria-hidden="true">${SYM.building}<text class="sm-name" text-anchor="${ax[0]}" y="${ty}">${t}</text></g>`); continue; }
    kindsUsed.add(kind);
    const mins = s.route?.minutes;
    const aria = `${s.name}${s.here ? ', you are here' : mins != null ? `, ${Math.round(mins)} minutes away` : ''}${s.visited ? '' : ', not visited'}`;
    out.push(`<g class="sm-site${s.here ? ' is-here' : ''}${kind === 'scene' ? ' is-scene' : ''}${s.visited ? '' : ' is-new'}" data-site="${s.id}" data-kind="${kind}" transform="translate(${f1(cx)} ${f1(cy)})" role="button" tabindex="0" aria-label="${esc(aria)}">`
      + `<circle class="sm-hit" r="22"/><circle class="sm-ring" r="11"/>${SYM[kind] || SYM.point}<text class="sm-name" text-anchor="${ax[0]}" y="${ty}">${t}</text></g>`);
  }
  // The detective's 4×4.
  const [hx, hy] = Pn[view.here] || [0, 0], carDy = view.here && Pn[view.here] && sideOf(view.here) === 'above' ? 14 : -13;
  out.push(`<g class="sm-car" transform="translate(${f1(hx + 15)} ${f1(hy + carDy)})" aria-hidden="true"><rect x="-9" y="-5" width="18" height="8" rx="2"/><rect class="sm-car-top" x="-5" y="-9" width="10" height="5" rx="1.5"/><circle cx="-5" cy="4" r="2.4"/><circle cx="5" cy="4" r="2.4"/></g>`);

  // ── Area name, grid, north, scale, locator ─────────────────────────────────────────────────────────
  const ob = `${c.ob.text} ${c.locations.map(l => l.description || '').join(' ')}`;
  const am = /\b((?:[A-Z][\w']+ ){1,3}(?:Conservancy|National Reserve|National Park|Game Reserve|Forest|Estate))\b/.exec(ob);
  const at = (() => {
    // The first site (in map order) that names a known place, then the OB entry.
    for (const t of [...map.nodes.map(id => get(id)?.name.toLowerCase() || ''), c.ob.text.toLowerCase()])
      for (const [k, la, lo] of GAZ) if (new RegExp(`(^|[^a-z])${k}($|[^a-z])`).test(t)) return { la, lo, name: k };
    const r = REGION_AT[theme.region] || [-1.29, 36.82]; return { la: r[0], lo: r[1], name: '' }; })();
  const AREA = { mara: 'Maasai Mara National Reserve', sekenani: 'Maasai Mara National Reserve', chalbi: 'Chalbi Desert', jkia: 'Nairobi', 'kirinyaga road': 'Nairobi CBD', 'mombasa road': 'Nairobi', aberdare: 'Aberdare foothills' };
  const area = am ? am[1] : (K === 'savanna' && /reserve/i.test(ob)) ? 'Maasai Mara National Reserve' : at.name ? (AREA[at.name] || at.name.replace(/(^|\s)\w/g, ch => ch.toUpperCase())) : regionName;
  // Emptiest spot for the area name.
  let bestA = null;
  for (let y = H * 0.18; y <= H * 0.86; y += H * 0.12) for (let x = W * 0.3; x <= W * 0.7; x += W * 0.1) {
    const d = Math.min(...Object.values(Pn).map(([px, py]) => Math.hypot((px - x) / 1.8, py - y)));
    if (!bestA || d > bestA.d) bestA = { x, y, d };
  }
  if (area && bestA && K !== 'building') out.push(`<text class="mp-area" x="${f1(bestA.x)}" y="${f1(bestA.y)}" text-anchor="middle" letter-spacing="${full ? 4 : 2.4}">${esc(area.toUpperCase())}</text>`);
  // Scale: kilometres per pixel from the routes (positions come from drive times, so it is approximate).
  const ratios = map.edges.filter(e => Pn[e.a] && Pn[e.b]).map(e => (e.minutes / 60 * (KMH[e.by] || 20) * 0.75) / (Math.hypot(Pn[e.a][0] - Pn[e.b][0], Pn[e.a][1] - Pn[e.b][1]) || 1)).sort((a, b) => a - b);
  const kmPx = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0.05;
  const target = W * 0.24 * kmPx, steps = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  const unit = steps.reduce((b, s) => Math.abs(s - target) < Math.abs(b - target) ? s : b, steps[0]), barPx = unit / kmPx;
  // Grid every scale unit (or a nicer multiple), numbered like a survey grid.
  const gstep = barPx < 40 ? barPx * Math.ceil(40 / barPx) : barPx, gkm = gstep * kmPx;
  let grid = ''; const gx0 = (seed % 97) / 97 * gstep, gy0 = (seed % 89) / 89 * gstep;
  for (let x = gx0; x < W; x += gstep) grid += `M${f1(x)} 0V${H}`;
  for (let y = gy0; y < H; y += gstep) grid += `M0 ${f1(y)}H${W}`;
  out.push(`<path d="${grid}" class="mp-grid"/>`);
  // The north arrow, the scale bar and the locator each take the corner with the fewest sites in it.
  const half2 = barPx / 2, sbw = barPx + 46, iw = Math.min(78, W * 0.17), ih = iw * 1.25;
  const boxes = { inset: full ? [iw + 18, ih + 18] : null, rose: full ? [62, 66] : [30, 32], scale: [sbw + 10, full ? 30 : 26] };
  const cost = (x0, y0, w, h) => sites.filter(q => q.known && Pn[q.id]).reduce((a, q) => { const [px, py] = Pn[q.id];
    const dx = Math.max(x0 - px, 0, px - (x0 + w)), dy = Math.max(y0 - (py + 26), 0, (py - 12) - (y0 + h)); return a + (dx < 26 && dy < 4 ? 1 : 0); }, 0);
  const corner = (k, [w, h]) => ({ TL: [0, 0], TR: [W - w, 0], BL: [0, H - h], BR: [W - w, H - h] }[k]);
  const taken = new Set(), place = {};
  for (const [name, pref] of [['inset', ['BR', 'BL', 'TR', 'TL']], ['rose', ['TR', 'TL', 'BR', 'BL']], ['scale', ['BL', 'BR', 'TL', 'TR']]]) {
    const b = boxes[name]; if (!b) continue;
    const pick = pref.filter(k => !taken.has(k)).map((k, i) => ({ k, c: cost(...corner(k, b), ...b) + i * 0.01 })).sort((a, z) => a.c - z.c)[0];
    taken.add(pick.k); place[name] = corner(pick.k, b);
  }
  // North.
  const nx = place.rose[0] + (full ? 31 : 15), ny = place.rose[1] + (full ? 36 : 18);
  out.push(full
    ? `<g class="mp-rose" transform="translate(${nx} ${ny})"><circle r="19" class="mp-rose-ring"/><path d="M0 -24L4 -4L0 0L-4 -4Z" class="mp-rose-n"/><path d="M0 24L4 4L0 0L-4 4Z" class="mp-rose-s"/><path d="M-24 0L-4 -4L0 0L-4 4ZM24 0L4 -4L0 0L4 4Z" class="mp-rose-s"/><path d="M-12 -12L-2 -2M12 -12L2 -2M-12 12L-2 2M12 12L2 2" class="mp-rose-tick"/><text y="-28" class="mp-rose-l">N</text></g>`
    : `<g class="mp-rose" transform="translate(${nx} ${ny})"><circle r="11" class="mp-rose-plate"/><path d="M0 -9L4 5L0 2L-4 5Z" class="mp-rose-n"/><text y="-12.5" class="mp-rose-l mp-rose-l--s">N</text></g>`);
  // Scale bar.
  const sbx = place.scale[0] + 10, sby = place.scale[1] + (full ? 19 : 15), lab = u => u < 1 ? `${Math.round(u * 1000)} m` : `${u} km`;
  out.push(`<g class="mp-scale" transform="translate(${sbx} ${sby})"><rect class="mp-scale-plate" x="-5" y="-11" width="${f1(barPx + 46)}" height="${full ? 22 : 19}" rx="2"/>`
    + `<rect x="0" y="0" width="${f1(half2)}" height="3.5" class="mp-scale-k"/><rect x="${f1(half2)}" y="0" width="${f1(half2)}" height="3.5" class="mp-scale-w"/>`
    + `<text x="0" y="-3">0</text><text x="${f1(barPx)}" y="-3" text-anchor="middle">${lab(unit)}</text><text x="${f1(barPx + 8)}" y="4" class="mp-scale-approx">≈</text></g>`);
  // Kenya locator (the full sheet only).
  let inset = '';
  if (full) {
    const ix = place.inset[0] + 9, iy = place.inset[1] + 9, [lo0, la0, lo1, la1] = [33.8, -4.8, 42, 5.6];
    const pj = (lo, la) => [ix + (lo - lo0) / (lo1 - lo0) * iw, iy + (la1 - la) / (la1 - la0) * ih];
    const dk = 'M' + KENYA.map(([lo, la]) => pj(lo, la).map(f1).join(' ')).join('L') + 'Z', [px, py] = pj(at.lo, at.la);
    inset = `<g class="mp-inset"><rect x="${f1(ix - 4)}" y="${f1(iy - 4)}" width="${f1(iw + 8)}" height="${f1(ih + 8)}" class="mp-inset-plate"/><path d="${dk}" class="mp-inset-land"/><circle cx="${f1(px)}" cy="${f1(py)}" r="3.2" class="mp-inset-dot"/><text x="${f1(ix + iw / 2)}" y="${f1(iy + ih + 1)}" text-anchor="middle" class="mp-inset-l">KENYA</text></g>`;
    out.push(inset);
  }
  // Frame: neatline, and on the full sheet a graduated border with grid numbers and corner coordinates.
  const m = full ? 18 : 6, TW = W + 2 * m, TH = H + 2 * m;
  const dms = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), mm = Math.round((a - d) * 60); return `${d}°${String(mm).padStart(2, '0')}′${v >= 0 ? pos : neg}`; };
  const kmLa = 110.6, kmLo = 111.3 * Math.cos(at.la * Math.PI / 180), la0 = at.la + (H / 2) * kmPx / kmLa, lo0 = at.lo - (W / 2) * kmPx / kmLo;
  let under = `<rect x="${-m + 0.75}" y="${-m + 0.75}" width="${TW - 1.5}" height="${TH - 1.5}" class="mp-margin"/>`, frame = `<rect x="0" y="0" width="${W}" height="${H}" class="mp-neat"/>`;
  if (full) {
    let gb = '', nums = '';
    let i = 0; for (let x = gx0; x < W; x += gstep, i++) { gb += `<rect x="${f1(x)}" y="-5" width="${f1(Math.min(gstep / 2, W - x))}" height="5"/><rect x="${f1(x)}" y="${H}" width="${f1(Math.min(gstep / 2, W - x))}" height="5"/>`; nums += `<text x="${f1(x)}" y="-8" text-anchor="middle">${String((Math.floor(lo0 * 100) + i * Math.max(1, Math.round(gkm))) % 100).padStart(2, '0')}</text>`; }
    i = 0; for (let y = gy0; y < H; y += gstep, i++) { gb += `<rect x="-5" y="${f1(y)}" width="5" height="${f1(Math.min(gstep / 2, H - y))}"/><rect x="${W}" y="${f1(y)}" width="5" height="${f1(Math.min(gstep / 2, H - y))}"/>`; nums += `<text x="-8" y="${f1(y + 3)}" text-anchor="end">${String((Math.floor(Math.abs(la0) * 100) + i * Math.max(1, Math.round(gkm))) % 100).padStart(2, '0')}</text>`; }
    under += `<rect x="-5" y="-5" width="${W + 10}" height="${H + 10}" class="mp-band"/><g class="mp-band-k">${gb}</g>`;
    frame += `<g class="mp-gridnum">${nums}</g>`
      + `<text class="mp-corner" x="-${m - 2}" y="-${m - 7}">${dms(la0, 'N', 'S')} ${dms(lo0, 'E', 'W')}</text>`
      + `<text class="mp-corner" x="${W + m - 2}" y="${H + m - 3}" text-anchor="end">${dms(la0 - H * kmPx / kmLa, 'N', 'S')} ${dms(lo0 + W * kmPx / kmLo, 'E', 'W')}</text>`;
  }
  const svg = `<svg class="mp-svg sm-svg${full ? ' is-full' : ''}" viewBox="${-m} ${-m} ${TW} ${TH}" role="group" aria-label="Map of ${esc(area || 'the area')}"><defs>${defs.join('')}</defs>`
    + `${under}<g clip-path="url(#mf-${U})">${out.join('')}</g>${frame}</svg>`;
  // Legend: only what this sheet shows.
  const legendItems = [...legend].filter(Boolean);
  for (const k of kindsUsed) legendItems.push(`sym:${k}`);
  // The path between two sites, along the drawn roads (for the drive animation).
  const routePoints = r => {
    const pts = [];
    for (const e of r.legs) {
      const rd = roads.find(x => x.e === e) || { q: curve(e) }, fwd = pts.length ? Math.hypot(pts.at(-1)[0] - rd.q.x0, pts.at(-1)[1] - rd.q.y0) < 1 : e.a === r.from;
      for (let s = 0; s <= 24; s++) pts.push(bez(rd.q, fwd ? s / 24 : 1 - s / 24));
    }
    return pts;
  };
  return { svg, theme, area, legend: legendItems, kmPx, unit, at, routePoints, sideOf, margin: m };
}

// Legend entries: label and a tiny drawing.
export const LEGEND = {
  'tarmac road': ['Tarmac road', '<path d="M2 7H30" stroke="#3B2F2A" stroke-width="5"/><path d="M2 7H30" stroke="#E36B3A" stroke-width="3"/>'],
  'murram road (4×4)': ['Murram road, 4×4', '<path d="M2 7H30" stroke="#7A4A28" stroke-width="4.4"/><path d="M2 7H30" stroke="#F1DDB4" stroke-width="2"/>'],
  'game track': ['Game track', '<path d="M2 7H30" stroke="#7A5A28" stroke-width="1.8" stroke-dasharray="5 3"/>'],
  footpath: ['Footpath', '<path d="M2 7H30" stroke="#2C2420" stroke-width="1.6" stroke-dasharray="1 3.5" stroke-linecap="round"/>'],
  'boda route': ['Boda route', '<path d="M2 7H30" stroke="#2C2420" stroke-width="1.4" stroke-dasharray="4 2"/>'],
  'lift / stairs': ['Lift or stairs', '<path d="M2 7H30" stroke="#555" stroke-width="1.6" stroke-dasharray="2 2"/>'],
  river: ['River', '<path d="M2 8q7 -5 14 0t14 0" stroke="#3E7FB0" stroke-width="2.6" fill="none"/>'],
  'seasonal stream': ['Seasonal stream', '<path d="M2 8q7 -5 14 0t14 0" stroke="#3E7FB0" stroke-width="1.4" stroke-dasharray="4 2" fill="none"/>'],
  lugga: ['Dry river bed (lugga)', '<path d="M2 8q7 -5 14 0t14 0" stroke="#EADBB4" stroke-width="6" fill="none"/><path d="M2 8q7 -5 14 0t14 0" stroke="#3E7FB0" stroke-width="1" stroke-dasharray="3 3" fill="none"/>'],
  lake: ['Lake', '<rect x="2" y="2" width="28" height="10" fill="#A9CBE0" stroke="#3E7FB0"/>'],
  bridge: ['Bridge', '<path d="M8 3L11 5H21L24 3M8 11L11 9H21L24 11" stroke="#2C2420" stroke-width="1.1" fill="none"/>'],
  ford: ['Ford', '<text x="16" y="10" text-anchor="middle" font-size="8" font-style="italic" fill="#2A5E86">Ford</text>'],
  contours: ['Contours, index every fifth', '<path d="M2 4q14 4 28 0M2 10q14 4 28 0" stroke="#A9784A" stroke-width=".7" fill="none"/><path d="M2 7q14 4 28 0" stroke="#A9784A" stroke-width="1.4" fill="none"/>'],
  'spot height': ['Spot height, trig point', '<path d="M8 3.5L11 9H5Z" fill="#2C2420"/><circle cx="20" cy="7" r="1.2" fill="#2C2420"/>'],
  acacia: ['Acacia', '<path d="M16 6v4" stroke="#4C5A24" stroke-width=".8"/><ellipse cx="16" cy="6" rx="5" ry="1.8" fill="#6F7F3C"/>'],
  thicket: ['Thicket', '<path d="M6 5h.8M12 9h.8M18 4h.8M24 8h.8M9 10h.8M21 11h.8" stroke="#4C5A24" stroke-width="1.4" stroke-linecap="round"/>'],
  'riverine forest': ['Riverine forest', '<circle cx="10" cy="7" r="2.6" fill="#6F7F3C" stroke="#4C5A24" stroke-width=".6"/><circle cx="18" cy="6" r="2.6" fill="#6F7F3C" stroke="#4C5A24" stroke-width=".6"/>'],
  forest: ['Forest', '<circle cx="9" cy="7" r="2.6" fill="#3F6B2F" stroke="#28481C" stroke-width=".6"/><circle cx="16" cy="5" r="2.6" fill="#3F6B2F" stroke="#28481C" stroke-width=".6"/><circle cx="22" cy="8" r="2.6" fill="#3F6B2F" stroke="#28481C" stroke-width=".6"/>'],
  tea: ['Tea', '<path d="M2 4q1.5 -1.4 3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0M2 8q1.5 -1.4 3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0M2 12q1.5 -1.4 3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0" stroke="#5C8A3A" fill="none"/>'],
  fields: ['Fields', '<rect x="2" y="2" width="13" height="10" fill="#D3D79C" stroke="#8C8358" stroke-width=".6"/><rect x="15" y="2" width="15" height="10" fill="none" stroke="#8C8358" stroke-width=".6"/>'],
  sand: ['Sand', '<path d="M5 5h.7M10 9h.7M15 4h.7M20 8h.7M25 5h.7M8 11h.7M18 11h.7" stroke="#A0804A" stroke-width="1.2" stroke-linecap="round"/>'],
  lava: ['Lava field', '<rect x="2" y="2" width="28" height="10" fill="none"/><path d="M4 12L10 2M9 12L15 2M14 12L20 2M19 12L25 2M24 12L30 2" stroke="#4A3E36" stroke-width=".9"/>'],
  'doum palm': ['Doum palm', '<path d="M16 7l-3 -2M16 7l3 -2M16 7l-2.4 1.2M16 7l2.4 1.2M16 7v3" stroke="#59562A" stroke-width=".9" fill="none"/>'],
  streets: ['Street', '<path d="M2 7H30" stroke="#FFFDF6" stroke-width="3"/><path d="M2 5.2H30M2 8.8H30" stroke="#B8AE98" stroke-width=".6"/>'],
  buildings: ['Buildings', '<rect x="6" y="4" width="7" height="6" fill="#8F8577"/><rect x="17" y="3" width="9" height="7" fill="#8F8577"/>'],
  gardens: ['Gardens', '<circle cx="12" cy="7" r="2.4" fill="#5F8040"/><circle cx="20" cy="7" r="2.4" fill="#5F8040"/>'],
  'building plan': ['Building, interior walls', '<rect x="3" y="2" width="26" height="10" fill="#F4F0E6" stroke="#2C2420" stroke-width="1.6"/><path d="M14 2V8" stroke="#2C2420"/>'],
  'sym:scene': ['Scene of crime', '<circle cx="16" cy="7" r="5.5" fill="#B3261E" stroke="#5A1410"/><path d="M13.4 4.4L18.6 9.6M18.6 4.4L13.4 9.6" stroke="#fff" stroke-width="1.4"/>'],
  'sym:airstrip': ['Airstrip', '<rect x="4" y="5" width="24" height="5" fill="#3B3631"/><path d="M6 7.5H26" stroke="#fff" stroke-width=".7" stroke-dasharray="2 2"/>'],
  'sym:camp': ['Camp', '<path d="M9 11L13 3L17 11ZM16 11L20 6L24 11Z" fill="#2C2420"/>'],
  'sym:gate': ['Gate or checkpoint', '<path d="M8 7H24M8 4V10M24 4V10" stroke="#B3261E" stroke-width="1.8"/>'],
  'sym:village': ['Manyatta or village', Array.from({ length: 9 }, (_, i) => `<circle r="1.2" cx="${f1(16 + Math.cos(i * 0.698) * 4.6)}" cy="${f1(7 + Math.sin(i * 0.698) * 4.6)}" fill="#2C2420"/>`).join('')],
  'sym:market': ['Market', '<rect x="11" y="2" width="10" height="10" fill="#2C2420"/><text x="16" y="10" text-anchor="middle" font-size="8" fill="#fff">M</text>'],
  'sym:church': ['Church or mission', '<rect x="11.5" y="2.5" width="9" height="9" fill="#2C2420"/><path d="M16 4V10M13.6 6H18.4" stroke="#fff"/>'],
  'sym:hospital': ['Hospital or clinic', '<rect x="11" y="2" width="10" height="10" fill="#2C2420"/><text x="16" y="10" text-anchor="middle" font-size="8" fill="#fff">H</text>'],
  'sym:police': ['Police', '<rect x="9.5" y="2.5" width="13" height="9" fill="#2C2420"/><text x="16" y="9.2" text-anchor="middle" font-size="5" fill="#fff">POL</text>'],
  'sym:school': ['School', '<rect x="9.5" y="2.5" width="13" height="9" fill="#2C2420"/><text x="16" y="9.2" text-anchor="middle" font-size="5" fill="#fff">SCH</text>'],
  'sym:house': ['House or home', '<path d="M11 12V6L16 1.5L21 6V12Z" fill="#2C2420"/>'],
  'sym:water': ['Crossing or river site', '<circle cx="16" cy="7" r="4.5" fill="#fff" stroke="#3E7FB0" stroke-width="2"/>'],
  'sym:building': ['Office, store or other building', '<rect x="11" y="2" width="10" height="10" fill="#2C2420"/>'],
  'sym:point': ['Site', '<circle cx="16" cy="7" r="4.5" fill="#FFF8EC" stroke="#2C2420" stroke-width="2"/>'],
};
