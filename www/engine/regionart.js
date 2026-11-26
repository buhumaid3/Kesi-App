// Region title art (polish P1): each region's card as a piece of key art, drawn in code. Two styles are
// offered for the owner to choose between:
//   'sign'   — sign-painted matatu art: a night scene in flat saturated shapes, a sunburst, painted trims and
//              the region name lettered like a shop or matatu sign (the street half of the §5 concept).
//   'survey' — an engraved survey sheet: ink line art with hatching, contours, a cartouche with the name,
//              a compass, grid ticks (the institution half: Joseph was a surveyor).
// Pure: returns SVG text. Deterministic per region. The same art serves the region card and drawer fronts.
import { rng } from './sitemap.js';

const f = v => (Math.round(v * 10) / 10).toString();
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// Region colours (§5.3): material, accent, and a deep night tone for the sign style.
const RC = {
  1: { mat: '#8C8A84', acc: '#F2A33A', night: '#141A2E', glow: '#E07B2C' },
  2: { mat: '#4F6D7A', acc: '#E8358A', night: '#15192B', glow: '#E8358A' },
  3: { mat: '#D8C3A0', acc: '#1F7FB0', night: '#0F2236', glow: '#3FA7D6' },
  4: { mat: '#A44A2A', acc: '#E5B53A', night: '#1F1410', glow: '#E5733A' },
  5: { mat: '#3E6E73', acc: '#BFC9CC', night: '#0E1E24', glow: '#E59A4A' },
  6: { mat: '#C1272D', acc: '#D9A441', night: '#1A0F14', glow: '#E8692E' },
  7: { mat: '#3F6B2F', acc: '#B3263A', night: '#0F1A14', glow: '#8FB06A' },
  8: { mat: '#3A3633', acc: '#2FA58C', night: '#16120F', glow: '#E0823A' },
  9: { mat: '#6E55A8', acc: '#9EC8E0', night: '#141026', glow: '#A77BE0' },
  10: { mat: '#2F5D46', acc: '#B3261E', night: '#0C1712', glow: '#B3261E' },
};

export const REGION_COLOURS = RC;
export function regionArt(region, style = 'sign', { w = 360, h = 480, title = true, band = false } = {}) {
  const n = region.number, c = RC[n] || RC[1], R = rng(9000 + n * 17 + (style === 'sign' ? 0 : 5));
  const svg = style === 'survey' ? survey(region, c, R, w, h, band ? false : title) : sign(region, c, R, w, h, band ? false : title);
  // band: a wide strip round the horizon (the scene's heart), for drawer fronts. Same drawing, cropped by the viewBox.
  return band ? svg.replace(`viewBox="0 0 ${w} ${h}"`, `viewBox="12 ${Math.round(h * .46)} ${w - 24} ${Math.round(h * .3)}" preserveAspectRatio="xMidYMid slice"`).replace('class="region-art ', 'class="region-art region-art--band ') : svg;
}

// ── Sign-painted matatu art ─────────────────────────────────────────────────────────────────────────────
function sign(r, c, R, W, H, title) {
  const n = r.number, d = [], id = `ra${n}s`;
  const horizon = H * 0.62;
  d.push(`<defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.night}"/><stop offset=".62" stop-color="${mix(c.night, c.glow, .55)}"/><stop offset="1" stop-color="${c.glow}"/></linearGradient>
    <radialGradient id="${id}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3C4"/><stop offset=".55" stop-color="${c.acc}"/><stop offset="1" stop-color="${c.acc}" stop-opacity="0"/></radialGradient>
    <pattern id="${id}chk" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#111"/><rect width="6" height="6" fill="#F6F0E0"/><rect x="6" y="6" width="6" height="6" fill="#F6F0E0"/></pattern>
    <clipPath id="${id}clip"><rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="14"/></clipPath>
  </defs>`);
  d.push(`<rect width="${W}" height="${H}" rx="18" fill="#111"/>`);
  d.push(`<g clip-path="url(#${id}clip)"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#${id}sky)"/>`);
  // Sunburst rays from the horizon, as painted on matatu tailgates.
  const cx = W * 0.5, cy = horizon - 6;
  let rays = '';
  for (let i = 0; i < 22; i++) { const a0 = Math.PI + (i / 22) * Math.PI, a1 = a0 + Math.PI / 44; rays += `M${f(cx)} ${f(cy)}L${f(cx + Math.cos(a0) * W)} ${f(cy + Math.sin(a0) * W)}L${f(cx + Math.cos(a1) * W)} ${f(cy + Math.sin(a1) * W)}Z`; }
  d.push(`<path d="${rays}" fill="${c.acc}" opacity=".16"/>`);
  d.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(W * 0.3)}" fill="url(#${id}sun)" opacity=".9"/>`);
  // Stars.
  let st = ''; for (let i = 0; i < 40; i++) { const x = R() * W, y = R() * horizon * 0.6, s = 0.6 + R() * 1.4; st += `M${f(x)} ${f(y - s * 2)}L${f(x + s * .5)} ${f(y - s * .5)}L${f(x + s * 2)} ${f(y)}L${f(x + s * .5)} ${f(y + s * .5)}L${f(x)} ${f(y + s * 2)}L${f(x - s * .5)} ${f(y + s * .5)}L${f(x - s * 2)} ${f(y)}L${f(x - s * .5)} ${f(y - s * .5)}Z`; }
  d.push(`<path d="${st}" fill="#FFF8EC" opacity=".8"/>`);
  d.push((SCENES[n] || nairobiSign)(c, R, W, H, horizon));
  d.push('</g>');
  // Painted trims: a checker band, a stripe, chevrons, the border.
  d.push(`<rect x="10" y="${H - 64}" width="${W - 20}" height="12" fill="url(#${id}chk)"/>`);
  d.push(`<rect x="10" y="${H - 52}" width="${W - 20}" height="42" fill="${c.mat}"/>`);
  let chev = ''; for (let x = 18; x < W - 18; x += 18) if (x < 70 || x > W - 82) chev += `M${x} ${H - 40}l6 6l-6 6`;
  d.push(`<path d="${chev}" stroke="${c.acc}" stroke-width="3" fill="none" stroke-linejoin="round" opacity=".9"/>`);
  d.push(`<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="16" fill="none" stroke="${c.acc}" stroke-width="4"/>`);
  d.push(`<rect x="13" y="13" width="${W - 26}" height="${H - 26}" rx="11" fill="none" stroke="#FFF8EC" stroke-width="1.5" opacity=".6"/>`);
  if (title) {
    // The name, lettered like a sign: white fill, ink outline, offset shadow in the accent.
    const name = r.name.toUpperCase(), size = name.length > 14 ? 40 : 52, ty = 92;
    const lines = name.length > 14 && name.includes(' ') ? splitTwo(name) : [name];
    lines.forEach((ln, i) => {
      const y = ty + i * (size * 0.95);
      d.push(`<text x="${W / 2 + 4}" y="${y + 4}" text-anchor="middle" class="ra-sign" font-size="${size}" fill="#111">${esc(ln)}</text>`);
      d.push(`<text x="${W / 2 + 2.5}" y="${y + 2.5}" text-anchor="middle" class="ra-sign" font-size="${size}" fill="${c.acc}">${esc(ln)}</text>`);
      d.push(`<text x="${W / 2}" y="${y}" text-anchor="middle" class="ra-sign" font-size="${size}" fill="#FFF8EC" stroke="#111" stroke-width="1.6" paint-order="stroke">${esc(ln)}</text>`);
    });
    d.push(`<text x="${W / 2}" y="${H - 25}" text-anchor="middle" class="ra-plate" fill="${lum(c.mat) > .45 ? '#1E1A16' : '#FFF8EC'}">REGION ${String(n).padStart(2, '0')} · CASES ${r.cases[0]}–${r.cases[1]}</text>`);
  }
  return `<svg class="region-art region-art--sign" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.name)}">${d.join('')}</svg>`;
}
function nairobiSign(c, R, W, H, hz) {
  const out = [];
  // Skyline: blocks with lit windows, and the round conference tower with its saucer roof.
  let bl = '', win = '';
  let x = -10;
  while (x < W + 10) {
    const bw = 22 + R() * 30, bh = 40 + R() * 110, y = hz - bh;
    bl += `M${f(x)} ${f(hz)}V${f(y)}H${f(x + bw)}V${f(hz)}Z`;
    for (let wy = y + 6; wy < hz - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 5; wx += 7) if (R() < 0.35) win += `M${f(wx)} ${f(wy)}h3v4h-3z`;
    x += bw + 2;
  }
  const tx = W * 0.68, tb = hz, tt = hz - 200;
  bl += `M${f(tx - 13)} ${f(tb)}V${f(tt + 20)}H${f(tx + 13)}V${f(tb)}Z`;
  out.push(`<path d="${bl}" fill="${mix(c.night, '#000', .35)}"/>`);
  out.push(`<ellipse cx="${f(tx)}" cy="${f(tt + 18)}" rx="26" ry="6" fill="${mix(c.night, '#000', .35)}"/><path d="M${f(tx - 2)} ${f(tt + 12)}V${f(tt - 4)}" stroke="${mix(c.night, '#000', .35)}" stroke-width="3"/>`);
  for (let wy = tt + 30; wy < tb - 8; wy += 8) if (R() < 0.7) win += `M${f(tx - 9)} ${f(wy)}h18v2.5h-18z`;
  out.push(`<path d="${win}" fill="${c.acc}" opacity=".85"/>`);
  // Street, a sodium lamp and its cone, rain.
  out.push(`<rect x="0" y="${f(hz)}" width="${W}" height="${f(H - hz)}" fill="#0D0D12"/>`);
  out.push(`<path d="M${f(W * 0.18)} ${f(hz + 70)}V${f(hz - 90)}q0 -10 14 -10h16" stroke="#222" stroke-width="5" fill="none"/><ellipse cx="${f(W * 0.18 + 32)}" cy="${f(hz - 98)}" rx="10" ry="4" fill="${c.acc}"/>`);
  out.push(`<path d="M${f(W * 0.18 + 22)} ${f(hz - 96)}L${f(W * 0.18 - 40)} ${f(hz + 70)}H${f(W * 0.18 + 110)}Z" fill="${c.acc}" opacity=".16"/>`);
  out.push(matatu(W * 0.52, hz + 66, c, R));
  let rain = ''; for (let i = 0; i < 90; i++) { const rx = R() * W, ry = R() * (H - 70); rain += `M${f(rx)} ${f(ry)}l-3 11`; }
  out.push(`<path d="${rain}" stroke="#CFE2FF" stroke-width="1" opacity=".28"/>`);
  out.push(`<path d="M0 ${f(hz + 74)}H${W}" stroke="${c.acc}" stroke-width="2" opacity=".35"/>`);
  return out.join('');
}
// A matatu in side view: flat body, painted stripes, a star, the windows lit.
function matatu(cx, by, c, R) {
  const w = 230, h = 78, x = cx - w / 2, y = by - h;
  const body = `M${f(x + 10)} ${f(by)}H${f(x + w - 4)}Q${f(x + w + 2)} ${f(by)} ${f(x + w)} ${f(by - 12)}L${f(x + w - 6)} ${f(y + 18)}Q${f(x + w - 10)} ${f(y)} ${f(x + w - 34)} ${f(y)}H${f(x + 14)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + 14)}V${f(by - 10)}Q${f(x)} ${f(by)} ${f(x + 10)} ${f(by)}Z`;
  let wins = ''; for (let i = 0; i < 6; i++) wins += `<rect x="${f(x + 12 + i * 30)}" y="${f(y + 8)}" width="24" height="20" rx="3" fill="${i === 5 ? '#9FC3E0' : '#F7D27A'}" opacity="${i === 5 ? .7 : .85}"/>`;
  return `<g class="ra-matatu"><path d="${body}" fill="#F6F0E0"/>
    <path d="M${f(x)} ${f(y + 36)}H${f(x + w - 2)}" stroke="${c.acc}" stroke-width="9"/><path d="M${f(x)} ${f(y + 47)}H${f(x + w)}" stroke="#E8358A" stroke-width="5"/><path d="M${f(x)} ${f(y + 55)}H${f(x + w + 1)}" stroke="#19B5D6" stroke-width="4"/>
    <path d="M${f(x + 16)} ${f(y - 3)}H${f(x + w - 44)}" stroke="#111" stroke-width="3"/><path d="M${f(x + 30)} ${f(y - 3)}v3M${f(x + 80)} ${f(y - 3)}v3M${f(x + 130)} ${f(y - 3)}v3" stroke="#111" stroke-width="2"/>
    ${wins}
    <path d="M${f(x + 150)} ${f(y + 60)}l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#A6D930" stroke="#111" stroke-width="1"/>
    <path d="M${f(x + 20)} ${f(y + 64)}c18 -8 36 8 54 0s36 -8 54 0" stroke="#111" stroke-width="2" fill="none"/>
    <circle cx="${f(x + 48)}" cy="${f(by)}" r="15" fill="#111"/><circle cx="${f(x + 48)}" cy="${f(by)}" r="6" fill="#bbb"/>
    <circle cx="${f(x + w - 48)}" cy="${f(by)}" r="15" fill="#111"/><circle cx="${f(x + w - 48)}" cy="${f(by)}" r="6" fill="#bbb"/>
    <rect x="${f(x + w - 8)}" y="${f(by - 26)}" width="8" height="6" rx="2" fill="#FFE9A8"/></g>`;
}
function maraSign(c, R, W, H, hz) {
  const out = [];
  // Distant hills, the plain, acacias and a 4×4 with its lights on.
  out.push(`<path d="M0 ${f(hz - 30)}Q${f(W * .2)} ${f(hz - 70)} ${f(W * .42)} ${f(hz - 34)}T${f(W * .8)} ${f(hz - 50)}T${W} ${f(hz - 36)}V${f(hz)}H0Z" fill="${mix(c.night, c.mat, .35)}" opacity=".9"/>`);
  out.push(`<rect x="0" y="${f(hz)}" width="${W}" height="${f(H - hz)}" fill="${mix(c.night, '#000', .2)}"/>`);
  let grass = ''; for (let i = 0; i < 120; i++) { const x = R() * W, y = hz + 30 + R() * (H - hz - 130), s = 3 + R() * 6; grass += `M${f(x)} ${f(y)}l-1.5 ${f(-s)}M${f(x + 2)} ${f(y)}l1 ${f(-s * 1.2)}`; }
  out.push(`<path d="${grass}" stroke="${mix(c.mat, c.acc, .4)}" stroke-width="1.2" opacity=".35"/>`);
  out.push(acacia(W * 0.22, hz + 8, 1.3, '#0C0709'), acacia(W * 0.86, hz + 2, 0.8, '#0C0709'), acacia(W * 0.62, hz - 2, 0.55, mix(c.night, '#000', .3)));
  // Giraffes as silhouettes against the sun (one tall, one small).
  out.push(giraffe(W * 0.5, hz + 4, 1, '#0C0709'), giraffe(W * 0.6, hz + 2, 0.72, '#0C0709'));
  // Shuka check border inset at the top of the ground.
  out.push(`<g opacity=".95">${Array.from({ length: Math.ceil(W / 16) }, (_, i) => `<rect x="${i * 16}" y="${f(H - 92)}" width="16" height="16" fill="${i % 2 ? c.mat : '#1E3A8A'}"/><rect x="${i * 16}" y="${f(H - 92)}" width="16" height="4" fill="#111" opacity=".35"/>`).join('')}</g>`);
  // Beadwork dots along the hills.
  let beads = ''; for (let i = 0; i < 26; i++) beads += `<circle cx="${f(14 + i * ((W - 28) / 25))}" cy="${f(H - 100)}" r="3" fill="${['#F6F0E0', c.acc, '#1E3A8A', c.mat, '#2F7D5B'][i % 5]}"/>`;
  out.push(beads);
  return out.join('');
}
function acacia(x, by, s, col) {
  return `<g transform="translate(${f(x)} ${f(by)}) scale(${s})"><path d="M0 0C2 -30 -6 -46 -18 -58M0 -26C8 -40 18 -50 30 -58M-2 -8c-6 -10 -14 -16 -24 -20" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M-62 -60C-40 -80 40 -80 66 -60C40 -54 -40 -54 -62 -60Z" fill="${col}"/></g>`;
}
function giraffe(x, by, s, col) {
  return `<g transform="translate(${f(x)} ${f(by)}) scale(${s})"><path d="M-14 0V-34M-6 0V-34M10 0V-36M17 0V-36" stroke="${col}" stroke-width="4" stroke-linecap="round"/>
    <path d="M-18 -32C-18 -46 20 -48 22 -36L20 -30C8 -26 -10 -26 -18 -32Z" fill="${col}"/>
    <path d="M14 -40L34 -92L40 -90L24 -40Z" fill="${col}"/><path d="M32 -94C36 -100 48 -98 52 -92L48 -88C44 -90 38 -88 34 -88Z" fill="${col}"/>
    <path d="M35 -96l-1 -6M39 -97l1 -6" stroke="${col}" stroke-width="2"/></g>`;
}

// ── The engraved survey sheet ───────────────────────────────────────────────────────────────────────────
function survey(r, c, R, W, H, title) {
  const n = r.number, d = [], id = `ra${n}v`, ink = '#2A241E', paper = '#F1E8D4';
  d.push(`<defs><pattern id="${id}hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0V4" stroke="${ink}" stroke-width=".7"/></pattern>
    <pattern id="${id}hatch2" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" stroke="${ink}" stroke-width=".55"/></pattern>
    <clipPath id="${id}clip"><rect x="26" y="26" width="${W - 52}" height="${H - 52}"/></clipPath></defs>`);
  d.push(`<rect width="${W}" height="${H}" fill="${paper}"/>`);
  // Contours across the whole sheet (the land itself), faint.
  d.push(`<g clip-path="url(#${id}clip)">`);
  const ph = R() * 6;
  for (let k = 0; k < 16; k++) {
    let p = ''; for (let x = 0; x <= W; x += 8) { const y = 40 + k * 28 + 10 * Math.sin(x / 47 + ph + k * .6) + 6 * Math.sin(x / 17 + k); p += `${x ? 'L' : 'M'}${x} ${f(y)}`; }
    d.push(`<path d="${p}" stroke="#A9784A" stroke-width="${k % 5 === 0 ? 1.1 : .5}" fill="none" opacity=".45"/>`);
  }
  d.push(n === 6 ? maraSurvey(ink, `${id}hatch`, `${id}hatch2`, R, W, H) : nairobiSurvey(ink, `${id}hatch`, `${id}hatch2`, R, W, H));
  d.push('</g>');
  // Frame: neat line, a graduated border with ticks and numbers, corner ornaments.
  d.push(`<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${ink}" stroke-width="1"/>`);
  d.push(`<rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${ink}" stroke-width="1.6"/>`);
  let band = ''; for (let x = 26; x < W - 26; x += 24) band += `<rect x="${x}" y="18" width="12" height="8" fill="${ink}"/><rect x="${x}" y="${H - 26}" width="12" height="8" fill="${ink}"/>`;
  for (let y = 26; y < H - 26; y += 24) band += `<rect x="18" y="${y}" width="8" height="12" fill="${ink}"/><rect x="${W - 26}" y="${y}" width="8" height="12" fill="${ink}"/>`;
  d.push(band);
  // Compass, small, top right.
  d.push(`<g transform="translate(${W - 62} 66)" stroke="${ink}" fill="none"><circle r="20" stroke-width=".8"/><circle r="16" stroke-width=".5"/><path d="M0 -26L5 -4L0 0L-5 -4Z" fill="${ink}"/><path d="M0 26L5 4L0 0L-5 4Z"/><path d="M-26 0L-4 -5L0 0L-4 5ZM26 0L4 -5L0 0L4 5Z"/><text y="-30" text-anchor="middle" class="ra-eng" font-size="10" fill="${ink}" stroke="none">N</text></g>`);
  if (title) {
    // The cartouche: a framed plate with the name in engraved capitals.
    const name = r.name.toUpperCase(), cw = W - 96, cy = H - 132, ch = 84;
    const lines = name.length > 16 && name.includes(' ') ? splitTwo(name) : [name], fs = lines.length > 1 ? 22 : 26;
    const foot = `CASES ${r.cases[0]}–${r.cases[1]} · ${String(r.months || '').toUpperCase()}`;
    d.push(`<g><rect x="48" y="${cy}" width="${cw}" height="${ch}" fill="${paper}" stroke="${ink}" stroke-width="1.6"/><rect x="53" y="${cy + 5}" width="${cw - 10}" height="${ch - 10}" fill="none" stroke="${ink}" stroke-width=".6"/>
      ${[[48, cy], [48 + cw, cy], [48, cy + ch], [48 + cw, cy + ch]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${paper}" stroke="${ink}" stroke-width="1.2"/>`).join('')}
      <text x="${W / 2}" y="${cy + 18}" text-anchor="middle" class="ra-eng" font-size="8.5" fill="${ink}" letter-spacing="3">REGION ${String(n).padStart(2, '0')} · FIELD SHEET</text>
      ${lines.map((ln, i) => `<text x="${W / 2}" y="${cy + 46 + i * 22 - (lines.length - 1) * 8}" text-anchor="middle" class="ra-eng-title" font-size="${fs}" fill="${ink}" letter-spacing="4">${esc(ln)}</text>`).join('')}
      <text x="${W / 2}" y="${cy + ch - 10}" text-anchor="middle" class="ra-eng" font-size="${foot.length > 34 ? 7 : 8.5}" fill="${ink}" letter-spacing="${foot.length > 34 ? 1 : 2}">${esc(foot)}</text></g>`);
    // A scale bar under the cartouche.
    d.push(`<g transform="translate(${W / 2 - 50} ${H - 38})"><rect width="25" height="4" fill="${ink}"/><rect x="25" width="25" height="4" fill="${paper}" stroke="${ink}" stroke-width=".6"/><rect x="50" width="25" height="4" fill="${ink}"/><rect x="75" width="25" height="4" fill="${paper}" stroke="${ink}" stroke-width=".6"/></g>`);
  }
  return `<svg class="region-art region-art--survey" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.name)}">${d.join('')}</svg>`;
}
function nairobiSurvey(ink, hatch, hatch2, R, W, H) {
  const out = [], hz = H * 0.56;
  // The skyline in line art: each block outlined, shaded on one side with hatching, windows as ticks.
  let x = 30;
  while (x < W - 30) {
    const bw = 20 + R() * 28, bh = 50 + R() * 120, y = hz - bh;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" fill="${'#F1E8D4'}" stroke="${ink}" stroke-width=".9"/>`);
    out.push(`<rect x="${f(x + bw * 0.62)}" y="${f(y)}" width="${f(bw * 0.38)}" height="${f(bh)}" fill="url(#${hatch})"/>`);
    let w = ''; for (let wy = y + 7; wy < hz - 6; wy += 8) w += `M${f(x + 4)} ${f(wy)}h${f(bw * 0.5)}`;
    out.push(`<path d="${w}" stroke="${ink}" stroke-width=".45" stroke-dasharray="2 2"/>`);
    x += bw + 3;
  }
  const tx = W * 0.66, tt = hz - 210;
  out.push(`<rect x="${f(tx - 12)}" y="${f(tt + 22)}" width="24" height="${f(hz - tt - 22)}" fill="#F1E8D4" stroke="${ink}" stroke-width="1"/><rect x="${f(tx + 2)}" y="${f(tt + 22)}" width="10" height="${f(hz - tt - 22)}" fill="url(#${hatch2})"/>`);
  out.push(`<ellipse cx="${f(tx)}" cy="${f(tt + 20)}" rx="27" ry="6.5" fill="#F1E8D4" stroke="${ink}" stroke-width="1"/><path d="M${f(tx)} ${f(tt + 14)}V${f(tt - 4)}" stroke="${ink}"/>`);
  // Ground: road lines in perspective, a survey traverse with stations.
  out.push(`<path d="M30 ${f(hz)}H${W - 30}" stroke="${ink}" stroke-width="1.4"/>`);
  out.push(`<path d="M${f(W * .5)} ${f(hz)}L${f(W * .2)} ${f(H - 140)}M${f(W * .5)} ${f(hz)}L${f(W * .8)} ${f(H - 140)}" stroke="${ink}" stroke-width=".8"/>`);
  out.push(`<path d="M60 ${f(hz + 40)}L${f(W * .4)} ${f(hz + 62)}L${f(W * .62)} ${f(hz + 30)}L${W - 70} ${f(hz + 70)}" stroke="#B3261E" stroke-width="1" stroke-dasharray="5 3" fill="none"/>`);
  out.push([[60, hz + 40], [W * .4, hz + 62], [W * .62, hz + 30], [W - 70, hz + 70]].map(([a, b], i) => `<g transform="translate(${f(a)} ${f(b)})"><path d="M0 -5L4.3 2.5H-4.3Z" fill="none" stroke="#B3261E" stroke-width="1"/><text x="6" y="-4" class="ra-eng" font-size="7" fill="#B3261E">S${i + 1}</text></g>`).join(''));
  return out.join('');
}
function maraSurvey(ink, hatch, hatch2, R, W, H) {
  const out = [], hz = H * 0.5;
  // Hills in profile with hatching on the shaded flanks; a river winding through the plain.
  out.push(`<path d="M26 ${f(hz)}Q${f(W * .25)} ${f(hz - 70)} ${f(W * .45)} ${f(hz - 20)}T${f(W * .85)} ${f(hz - 40)}L${W - 26} ${f(hz - 10)}V${f(hz)}Z" fill="#F1E8D4" stroke="${ink}" stroke-width="1"/>`);
  out.push(`<path d="M${f(W * .25)} ${f(hz - 52)}Q${f(W * .36)} ${f(hz - 30)} ${f(W * .45)} ${f(hz - 20)}L${f(W * .45)} ${f(hz)}H${f(W * .3)}Z" fill="url(#${hatch})" opacity=".8"/>`);
  out.push(`<path d="M26 ${f(hz)}H${W - 26}" stroke="${ink}" stroke-width="1.2"/>`);
  out.push(`<path d="M${f(W * .1)} ${f(H - 140)}C${f(W * .3)} ${f(hz + 40)} ${f(W * .55)} ${f(hz + 110)} ${f(W * .7)} ${f(hz + 30)}S${f(W * .9)} ${f(hz + 20)} ${W - 26} ${f(hz + 14)}" stroke="#2A5E86" stroke-width="2.2" fill="none"/>`);
  out.push(`<text x="${f(W * .6)}" y="${f(hz + 92)}" class="ra-eng" font-size="8" font-style="italic" fill="#2A5E86" transform="rotate(-28 ${f(W * .6)} ${f(hz + 92)})">Mara R.</text>`);
  // Acacias in engraving: trunk lines, a flat crown hatched underneath.
  for (const [x, y, s] of [[W * .22, hz + 70, 1.1], [W * .75, hz + 52, .8], [W * .5, hz + 20, .5], [W * .86, hz + 96, 1]]) {
    out.push(`<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path d="M0 0C2 -26 -4 -40 -14 -50M0 -24C6 -36 14 -44 24 -50" stroke="${ink}" stroke-width="1.4" fill="none"/>
      <path d="M-52 -52C-32 -70 34 -70 56 -52C34 -46 -32 -46 -52 -52Z" fill="#F1E8D4" stroke="${ink}" stroke-width="1"/><path d="M-46 -51C-28 -47 30 -47 50 -51C30 -49 -28 -49 -46 -51Z" fill="url(#${hatch2})"/>
      <path d="M-20 2h44" stroke="${ink}" stroke-width=".5" stroke-dasharray="1 2"/></g>`);
  }
  // Grass as stipple and tufts.
  let st = ''; for (let i = 0; i < 300; i++) { const x = 30 + R() * (W - 60), y = hz + 6 + R() * (H - hz - 150); st += `M${f(x)} ${f(y)}l-1 -3M${f(x + 1.5)} ${f(y)}l.6 -3.4`; }
  out.push(`<path d="${st}" stroke="${ink}" stroke-width=".5" opacity=".55"/>`);
  // Birds and a cloud bank, engraved.
  let birds = ''; for (let i = 0; i < 7; i++) { const x = W * .3 + R() * W * .45, y = 90 + R() * 70, s = 4 + R() * 4; birds += `M${f(x - s)} ${f(y)}q${f(s / 2)} ${f(-s / 2)} ${f(s)} 0q${f(s / 2)} ${f(-s / 2)} ${f(s)} 0`; }
  out.push(`<path d="${birds}" stroke="${ink}" stroke-width=".9" fill="none"/>`);
  out.push(`<path d="M50 ${f(hz - 120)}q20 -22 44 -8q14 -20 38 -6q22 -10 34 8q14 2 12 14H50Z" fill="#F1E8D4" stroke="${ink}" stroke-width=".8"/><path d="M54 ${f(hz - 112)}H176" stroke="${ink}" stroke-width=".4"/><path d="M60 ${f(hz - 108)}H170" stroke="${ink}" stroke-width=".4"/>`);
  // A spot height and a trig beacon on the hill.
  out.push(`<g transform="translate(${f(W * .25)} ${f(hz - 60)})"><path d="M0 -6L5 3H-5Z" fill="${ink}"/><text x="8" y="2" class="ra-eng" font-size="8" fill="${ink}">1712</text></g>`);
  return out.join('');
}

// ── The other eight regions' sign-painted scenes ────────────────────────────────────────────────────────
const SCENES = { 1: nairobiSign, 2: eastlandsSign, 3: mombasaSign, 4: riftSign, 5: kisumuSign, 6: maraSign, 7: mtKenyaSign, 8: northSign, 9: westlandsSign, 10: finalSign };
const dark = (c, k = .35) => mix(c.night, '#000', k);
function ground(c, W, H, hz, col) { return `<rect x="0" y="${f(hz)}" width="${W}" height="${f(H - hz)}" fill="${col || dark(c, .2)}"/>`; }
function blocks(R, x0, x1, hz, hmin, hmax, wmin, wmax, col, winCol, winP = .35) {
  let bl = '', win = '', x = x0;
  while (x < x1) {
    const bw = wmin + R() * (wmax - wmin), bh = hmin + R() * (hmax - hmin), y = hz - bh;
    bl += `M${f(x)} ${f(hz)}V${f(y)}H${f(x + bw)}V${f(hz)}Z`;
    for (let wy = y + 6; wy < hz - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 5; wx += 7) if (R() < winP) win += `M${f(wx)} ${f(wy)}h3v4h-3z`;
    x += bw + 2;
  }
  return `<path d="${bl}" fill="${col}"/><path d="${win}" fill="${winCol}" opacity=".85"/>`;
}
function palm(x, by, s, col) {
  return `<g transform="translate(${f(x)} ${f(by)}) scale(${s})"><path d="M0 0C2 -30 -2 -60 6 -92" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${[[-40, -78], [-30, -104], [10, -112], [42, -96], [46, -72], [-14, -70]].map(([a, b]) => `<path d="M6 -92Q${f((a + 6) / 2)} ${f(b - 16)} ${a} ${b}Q${f((a + 6) / 2)} ${f(b - 6)} 6 -90Z" fill="${col}"/>`).join('')}</g>`;
}
function boat(x, y, s, col, sail) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path d="M-40 0H40L30 12H-30Z" fill="${col}"/>${sail ? `<path d="M-4 -2V-62L-30 -6Z" fill="${col}"/><path d="M-4 -62L34 -14L-4 -6Z" fill="${col}" opacity=".9"/>` : `<path d="M-2 0V-24" stroke="${col}" stroke-width="2"/>`}</g>`;
}
function eastlandsSign(c, R, W, H, hz) {
  const o = [];
  o.push(blocks(R, -10, W + 10, hz - 20, 60, 140, 34, 60, dark(c), c.glow, .45));
  // Mabati roofs in the foreground: corrugated sheets catching the light.
  let roofs = '';
  for (let x = -20; x < W + 20; x += 54 + R() * 20) { const y = hz - 10 + R() * 14, w = 60 + R() * 20; roofs += `<path d="M${f(x)} ${f(y + 18)}L${f(x + 8)} ${f(y)}H${f(x + w)}L${f(x + w - 6)} ${f(y + 18)}Z" fill="${mix(c.mat, '#000', .2)}"/>`; for (let k = 4; k < w - 4; k += 4) roofs += `<path d="M${f(x + k + 6)} ${f(y + 1)}l-4 16" stroke="${mix(c.mat, '#fff', .3)}" stroke-width=".8" opacity=".55"/>`; }
  o.push(roofs);
  o.push(ground(c, W, H, hz + 18, '#0D0D12'));
  // Washing lines between the flats, and a pink matatu.
  o.push(`<path d="M0 ${f(hz - 70)}Q${f(W / 2)} ${f(hz - 48)} ${W} ${f(hz - 72)}" stroke="#222" stroke-width="1.2" fill="none"/>`);
  o.push(Array.from({ length: 9 }, (_, i) => { const x = 20 + i * (W - 40) / 8, y = hz - 66 + Math.sin(i / 8 * Math.PI) * 18; return `<rect x="${f(x)}" y="${f(y)}" width="${f(12 + R() * 8)}" height="${f(14 + R() * 10)}" fill="${['#E8358A', '#19B5D6', '#A6D930', '#F6F0E0', c.acc][i % 5]}" opacity=".85"/>`; }).join(''));
  o.push(matatu(W * 0.5, hz + 76, { ...c, acc: '#E8358A' }, R));
  return o.join('');
}
function mombasaSign(c, R, W, H, hz) {
  const o = [];
  // Old Town: coral-stone walls, arches and a minaret against the sea at dusk; dhows on the water.
  o.push(`<rect x="0" y="${f(hz - 6)}" width="${W}" height="${f(H - hz + 6)}" fill="${mix(c.night, c.acc, .3)}"/>`);
  let glints = ''; for (let i = 0; i < 60; i++) { const x = R() * W, y = hz + R() * 60; glints += `M${f(x)} ${f(y)}h${f(4 + R() * 10)}`; }
  o.push(`<path d="${glints}" stroke="${c.glow}" stroke-width="1.2" opacity=".45"/>`);
  o.push(boat(W * .3, hz + 18, .9, dark(c), true), boat(W * .78, hz + 26, .6, dark(c), true));
  const wy = hz + 60, wall = dark(c, .45);
  o.push(`<path d="M0 ${f(H)}V${f(wy)}H${f(W * .18)}V${f(wy - 70)}H${f(W * .34)}V${f(wy)}H${f(W * .62)}V${f(wy - 40)}H${f(W * .74)}V${f(wy - 110)}h6v-24l8 -14l8 14v24h6V${f(wy - 40)}H${W}V${f(H)}Z" fill="${wall}"/>`);
  o.push([W * .2, W * .26, W * .66].map(x => `<path d="M${f(x)} ${f(wy - 16)}v-22a8 8 0 0 1 16 0v22z" fill="${c.glow}" opacity=".75"/>`).join(''));
  o.push(`<path d="M${f(W * .4)} ${f(wy + 30)}v-30a20 20 0 0 1 40 0v30z" fill="#0D0D12"/><path d="M${f(W * .4 + 4)} ${f(wy + 30)}v-28a16 16 0 0 1 32 0v28" fill="none" stroke="${c.acc}" stroke-width="2"/>`);
  o.push(palm(W * .9, wy, .9, '#0C0709'));
  return o.join('');
}
function riftSign(c, R, W, H, hz) {
  const o = [];
  // The escarpment wall, the lake with flamingos, maize in the foreground.
  o.push(`<path d="M0 ${f(hz - 90)}L${f(W * .22)} ${f(hz - 110)}L${f(W * .3)} ${f(hz - 40)}L${f(W * .6)} ${f(hz - 30)}L${f(W * .8)} ${f(hz - 70)}L${W} ${f(hz - 60)}V${f(hz)}H0Z" fill="${dark(c, .25)}"/>`);
  o.push(`<ellipse cx="${f(W * .55)}" cy="${f(hz + 10)}" rx="${f(W * .5)}" ry="22" fill="${mix(c.night, c.glow, .45)}"/>`);
  let fl = ''; for (let i = 0; i < 26; i++) { const x = W * .18 + R() * W * .7, y = hz + 2 + R() * 16; fl += `<path d="M${f(x)} ${f(y)}v-7q0 -4 3 -3l2 -2" stroke="#F08AA0" stroke-width="1.4" fill="none"/><ellipse cx="${f(x - 1)}" cy="${f(y - 8)}" rx="3" ry="2" fill="#F08AA0"/>`; }
  o.push(fl);
  o.push(ground(c, W, H, hz + 28, dark(c, .2)));
  let maize = ''; for (let x = 6; x < W; x += 14 + R() * 6) { const h = 50 + R() * 40, b = H - 92; maize += `<path d="M${f(x)} ${f(b)}V${f(b - h)}" stroke="${mix(c.acc, '#000', .15)}" stroke-width="2.5"/><path d="M${f(x)} ${f(b - h * .6)}q-14 -6 -20 4M${f(x)} ${f(b - h * .4)}q14 -8 20 2M${f(x)} ${f(b - h * .8)}q10 -10 16 -4" stroke="${mix(c.acc, '#3F6B2F', .5)}" stroke-width="2" fill="none"/><path d="M${f(x)} ${f(b - h)}l-3 -10l3 2l3 -2z" fill="${c.acc}"/>`; }
  o.push(maize);
  return o.join('');
}
function kisumuSign(c, R, W, H, hz) {
  const o = [];
  // Lake Victoria at sunset: the sun on the water, fishing boats, papyrus.
  o.push(`<rect x="0" y="${f(hz - 4)}" width="${W}" height="${f(H - hz + 4)}" fill="${mix(c.night, c.mat, .5)}"/>`);
  let path = ''; for (let i = 0; i < 18; i++) { const y = hz + 6 + i * 7, w = 30 + i * 9 + R() * 10; path += `M${f(W / 2 - w / 2 + (R() - .5) * 10)} ${f(y)}h${f(w)}`; }
  o.push(`<path d="${path}" stroke="${c.glow}" stroke-width="2.4" opacity=".55"/>`);
  o.push(boat(W * .3, hz + 40, 1.1, '#0C0709', false), boat(W * .7, hz + 64, .8, '#0C0709', true), boat(W * .52, hz + 18, .5, dark(c), false));
  // Papyrus heads.
  let pap = ''; for (let i = 0; i < 9; i++) { const x = (i < 5 ? 10 + i * 16 : W - 10 - (i - 5) * 16), b = H - 92, h = 70 + R() * 40; pap += `<path d="M${f(x)} ${f(b)}Q${f(x + 4)} ${f(b - h / 2)} ${f(x + 2)} ${f(b - h)}" stroke="#0C0709" stroke-width="2.5" fill="none"/>`; for (let k = -3; k <= 3; k++) pap += `<path d="M${f(x + 2)} ${f(b - h)}l${k * 5} -10" stroke="#0C0709" stroke-width="1.4"/>`; }
  o.push(pap);
  return o.join('');
}
function mtKenyaSign(c, R, W, H, hz) {
  const o = [];
  // The peak with snow, cloud at its waist, tea in rows down the hills.
  o.push(`<path d="M${f(W * .05)} ${f(hz)}L${f(W * .42)} ${f(hz - 140)}L${f(W * .47)} ${f(hz - 160)}L${f(W * .52)} ${f(hz - 146)}L${f(W * .58)} ${f(hz - 130)}L${f(W * .95)} ${f(hz)}Z" fill="${dark(c, .25)}"/>`);
  o.push(`<path d="M${f(W * .4)} ${f(hz - 132)}L${f(W * .47)} ${f(hz - 160)}L${f(W * .55)} ${f(hz - 184)}L${f(W * .5)} ${f(hz - 126)}L${f(W * .46)} ${f(hz - 138)}L${f(W * .43)} ${f(hz - 124)}Z" fill="#F6F0E0"/>`);
  o.push(`<path d="M${f(W * .2)} ${f(hz - 90)}q30 -14 60 -4q30 -16 70 0q26 -8 50 4" stroke="#F6F0E0" stroke-width="10" fill="none" stroke-linecap="round" opacity=".25"/>`);
  for (let k = 0; k < 5; k++) {
    const y = hz + k * 26, col = mix(c.mat, '#000', .5 - k * .08);
    o.push(`<path d="M0 ${f(y + 30)}Q${f(W * .3)} ${f(y - 8)} ${f(W * .6)} ${f(y + 10)}T${W} ${f(y)}V${H}H0Z" fill="${col}"/>`);
    let rows = ''; for (let x = -10; x < W; x += 10) rows += `M${f(x)} ${f(y + 22 + Math.sin(x / 40 + k) * 6)}q5 -6 10 0`;
    o.push(`<path d="${rows}" stroke="${mix(c.mat, '#fff', .25)}" stroke-width="1.4" fill="none" opacity=".5"/>`);
  }
  return o.join('');
}
function northSign(c, R, W, H, hz) {
  const o = [];
  // Basalt ridges, the jade lake, doum palms and a camel line on the horizon.
  o.push(`<path d="M0 ${f(hz - 40)}L${f(W * .18)} ${f(hz - 64)}L${f(W * .3)} ${f(hz - 46)}L${f(W * .55)} ${f(hz - 80)}L${f(W * .7)} ${f(hz - 52)}L${W} ${f(hz - 70)}V${f(hz)}H0Z" fill="${dark(c, .15)}"/>`);
  o.push(`<path d="M${f(W * .35)} ${f(hz - 6)}Q${f(W * .7)} ${f(hz - 16)} ${W} ${f(hz - 8)}V${f(hz + 8)}H${f(W * .3)}Z" fill="${c.acc}" opacity=".85"/>`);
  o.push(ground(c, W, H, hz, mix(c.night, '#7A5A3A', .35)));
  let st = ''; for (let i = 0; i < 90; i++) { const x = R() * W, y = hz + 10 + R() * (H - hz - 110); st += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(2 + R() * 5)}" ry="${f(1 + R() * 2)}" fill="#0C0709" opacity=".5"/>`; }
  o.push(st);
  const camel = (x, s) => `<g transform="translate(${f(x)} ${f(hz - 4)}) scale(${s})"><path d="M-16 0v-14M-8 0v-14M8 0v-14M14 0v-14" stroke="#0C0709" stroke-width="2"/><path d="M-18 -12C-18 -22 -10 -30 -2 -24C4 -32 12 -24 14 -14L22 -22L28 -20L26 -14L18 -10L14 -10C6 -8 -10 -8 -18 -12Z" fill="#0C0709"/></g>`;
  o.push(camel(W * .2, .8), camel(W * .27, .8), camel(W * .34, .7));
  o.push(palm(W * .12, H - 92, 1.1, '#0C0709'), palm(W * .84, H - 96, .9, '#0C0709'));
  return o.join('');
}
function westlandsSign(c, R, W, H, hz) {
  const o = [];
  // Glass towers with lit floors, and jacaranda canopies in full purple flower.
  o.push(blocks(R, -10, W + 10, hz, 90, 210, 30, 54, dark(c, .2), c.acc, .55));
  o.push(ground(c, W, H, hz, '#0D0D12'));
  const jac = (x, by, s) => { let blooms = ''; for (let i = 0; i < 60; i++) { const a = R() * Math.PI, r = R(); blooms += `<circle cx="${f(Math.cos(a) * r * 60)}" cy="${f(-60 - Math.sin(a) * r * 40)}" r="${f(6 + R() * 8)}" fill="${['#8E6CCF', '#A77BE0', '#6E55A8', '#C3A6F0'][i % 4]}" opacity=".9"/>`; } return `<g transform="translate(${f(x)} ${f(by)}) scale(${s})"><path d="M0 0C2 -26 -6 -44 -20 -56M0 -30C10 -44 20 -50 30 -56" stroke="#0C0709" stroke-width="5" fill="none"/>${blooms}</g>`; };
  o.push(jac(W * .2, H - 80, 1.1), jac(W * .78, H - 86, .95));
  let fall = ''; for (let i = 0; i < 40; i++) fall += `<circle cx="${f(R() * W)}" cy="${f(H - 90 - R() * 10)}" r="2" fill="#A77BE0" opacity=".8"/>`;
  o.push(fall);
  return o.join('');
}
function finalSign(c, R, W, H, hz) {
  const o = [];
  // The registry at dawn: a columned building, a stack of files tied with string, the red stamp.
  o.push(blocks(R, -10, W + 10, hz - 10, 40, 100, 30, 50, dark(c, .3), c.glow, .15));
  const bx = W * .2, bw = W * .6, by = hz + 6;
  o.push(`<path d="M${f(bx - 10)} ${f(by - 120)}L${f(bx + bw / 2)} ${f(by - 150)}L${f(bx + bw + 10)} ${f(by - 120)}Z" fill="${dark(c, .1)}"/><rect x="${f(bx)}" y="${f(by - 120)}" width="${f(bw)}" height="120" fill="${dark(c, .15)}"/>`);
  o.push(Array.from({ length: 6 }, (_, i) => `<rect x="${f(bx + 12 + i * (bw - 24) / 5.6)}" y="${f(by - 112)}" width="10" height="104" fill="${mix(c.mat, '#fff', .2)}" opacity=".8"/>`).join(''));
  o.push(ground(c, W, H, by, '#0D0D12'));
  // Files on the steps.
  let files = ''; for (let i = 0; i < 6; i++) files += `<rect x="${f(W * .34 + (R() - .5) * 8)}" y="${f(H - 104 - i * 9)}" width="${f(W * .32)}" height="9" fill="${['#E2C48C', '#C9A66B'][i % 2]}" stroke="#3A2A18" stroke-width=".8"/>`;
  o.push(files, `<path d="M${f(W * .5)} ${f(H - 150)}V${f(H - 95)}" stroke="#C7362B" stroke-width="2"/>`);
  o.push(`<g transform="translate(${f(W * .62)} ${f(H - 132)}) rotate(-10)"><rect x="-34" y="-10" width="68" height="20" fill="none" stroke="${c.acc}" stroke-width="2.4"/><text text-anchor="middle" y="6" class="ra-plate" fill="${c.acc}" font-size="12">CLOSED</text></g>`);
  return o.join('');
}

// Helpers.
function lum(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; }
function splitTwo(s) { const w = s.split(' '); let best = [s], bd = 1e9; for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.abs(a.length - b.length); if (d < bd) { bd = d; best = [a, b]; } } return best; }
function mix(a, b, t) { const full = x => x.length === 4 ? '#' + [...x.slice(1)].map(ch => ch + ch).join('') : x; a = full(a); b = full(b); const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
