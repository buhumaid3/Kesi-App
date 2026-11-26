// The ten boss collectibles as drawn objects (polish P5): ink line work with flat material fills and a soft
// cast shadow, so each sits on the desk like a real thing. Pure: returns SVG text, 160 × 160 viewBox.
// Used on the desk shelf (small) and in the inspect sheet (large).
const INK = '#2A221B', BRASS = '#C9A24A', BRASS_D = '#8C6A24', BRASS_L = '#E8CF8A', WOOD = '#8B5A33', PAPER = '#F1E8D4', MANILA = '#E2C48C';
const shadow = (cx = 80, cy = 136, rx = 52, ry = 9) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".28" filter="url(#ob-blur)"/>`;
const hatch = (x1, y1, x2, y2, n, dx = 0, dy = 0, w = .7) => Array.from({ length: n }, (_, i) => { const k = i / (n - 1 || 1); return `M${(x1 + (x2 - x1) * k).toFixed(1)} ${(y1 + (y2 - y1) * k).toFixed(1)}l${dx} ${dy}`; }).join('') && `<path d="${Array.from({ length: n }, (_, i) => { const k = i / (n - 1 || 1); return `M${(x1 + (x2 - x1) * k).toFixed(1)} ${(y1 + (y2 - y1) * k).toFixed(1)}l${dx} ${dy}`; }).join('')}" stroke="${INK}" stroke-width="${w}" opacity=".55"/>`;
const ART = {
  // A brass shop stamp: turned wooden handle, brass collar, rubber die (reversed lettering suggested, not readable).
  col_omar_stamp: () => `${shadow(80, 138, 40)}
    <path d="M62 40c0-14 36-14 36 0v34H62z" fill="${WOOD}" stroke="${INK}" stroke-width="1.6"/><ellipse cx="80" cy="34" rx="16" ry="9" fill="#A06B3E" stroke="${INK}" stroke-width="1.4"/>
    ${hatch(66, 44, 66, 72, 8, 6, 0)}
    <path d="M56 74h48v12H56z" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/><path d="M58 77h44" stroke="${BRASS_L}" stroke-width="2"/>
    <path d="M44 86h72l-4 22H48z" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/><path d="M48 92h64" stroke="${BRASS_L}" stroke-width="1.6"/>${hatch(96, 88, 110, 106, 6, -3, 0)}
    <rect x="46" y="108" width="68" height="14" rx="2" fill="#3a2e2a" stroke="${INK}" stroke-width="1.4"/><path d="M52 115h10m4 0h18m4 0h14" stroke="#7a6a60" stroke-width="2.2"/>`,
  // A photocopied ledger page in a plain black frame.
  col_upendo_ledger: () => `${shadow(80, 140, 50)}
    <path d="M30 18h100v118H30z" fill="#1E1A16"/><path d="M36 24h88v106H36z" fill="${PAPER}"/>
    ${Array.from({ length: 12 }, (_, i) => `<path d="M42 ${38 + i * 7.6}h76" stroke="#9DB8A6" stroke-width=".7"/><path d="M46 ${36 + i * 7.6}q6 -3 12 0t12 0q4 -2 9 0" stroke="${INK}" stroke-width=".9" fill="none" opacity=".75"/>`).join('')}
    <path d="M58 30v96" stroke="#C9655B" stroke-width=".9"/><path d="M42 30h76" stroke="${INK}" stroke-width="1.4"/>
    <path d="M36 24l10 6M124 24l-10 6" stroke="#fff" stroke-width="1" opacity=".25"/>`,
  // A brass dhow compass in a turned wooden bowl.
  col_dhow_compass: () => `${shadow(80, 136, 50)}
    <ellipse cx="80" cy="96" rx="52" ry="30" fill="${WOOD}" stroke="${INK}" stroke-width="1.6"/><ellipse cx="80" cy="88" rx="46" ry="26" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/>
    <ellipse cx="80" cy="86" rx="38" ry="21" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
    ${Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return `<path d="M${(80 + Math.cos(a) * 30).toFixed(1)} ${(86 + Math.sin(a) * 16.5).toFixed(1)}L${(80 + Math.cos(a) * 36).toFixed(1)} ${(86 + Math.sin(a) * 20).toFixed(1)}" stroke="${INK}" stroke-width="${i % 4 ? .6 : 1.4}"/>`; }).join('')}
    <path d="M80 70l5 16-5 16-5-16z" fill="#B3261E" stroke="${INK}" stroke-width=".8"/><path d="M80 86l5 16h-10z" fill="${INK}" opacity=".85"/><circle cx="80" cy="86" r="2.4" fill="${BRASS_D}"/>
    <path d="M42 80q38 -22 76 0" stroke="#fff" stroke-width="2" fill="none" opacity=".35"/>`,
  // Joseph's prismatic surveying compass, open in its worn leather case.
  col_joseph_compass: () => `${shadow(80, 138, 54)}
    <path d="M26 100q0-24 54-24t54 24v14q0 14-54 14t-54-14z" fill="#6B3E22" stroke="${INK}" stroke-width="1.6"/>${hatch(32, 104, 128, 104, 14, 0, 10, .6)}
    <circle cx="80" cy="88" r="32" fill="${BRASS}" stroke="${INK}" stroke-width="1.6"/><circle cx="80" cy="88" r="26" fill="#ECE3CC" stroke="${INK}" stroke-width="1"/>
    ${Array.from({ length: 36 }, (_, i) => { const a = i / 36 * Math.PI * 2; return `<path d="M${(80 + Math.cos(a) * 22).toFixed(1)} ${(88 + Math.sin(a) * 22).toFixed(1)}L${(80 + Math.cos(a) * 26).toFixed(1)} ${(88 + Math.sin(a) * 26).toFixed(1)}" stroke="${INK}" stroke-width="${i % 9 ? .5 : 1.2}"/>`; }).join('')}
    <path d="M80 66l3 22-3 22-3-22z" fill="${INK}"/><path d="M106 70l14-12 6 6-14 12z" fill="${BRASS_D}" stroke="${INK}" stroke-width="1.2"/><circle cx="80" cy="88" r="2.4" fill="${BRASS_L}"/>
    <path d="M44 120q10 4 20 2M92 124q12 0 22-4" stroke="#B5523A" stroke-width="1.4" opacity=".7"/>`,
  // A carved wooden fishing float with a tail of old net cord.
  col_walter_float: () => `${shadow(80, 132, 50, 8)}
    <path d="M24 108q-6 10 6 14t30-6" stroke="#8A7A5A" stroke-width="2" fill="none"/>
    <path d="M36 100c0-22 44-48 72-40 20 6 18 30-2 44-24 16-70 24-70-4z" fill="#D9C39A" stroke="${INK}" stroke-width="1.6"/>
    ${hatch(48, 98, 100, 70, 10, 6, 6, .6)}<path d="M50 96c10-12 30-24 52-28" stroke="#fff" stroke-width="2.4" opacity=".4" fill="none"/>
    <circle cx="44" cy="102" r="5" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
  // A steel ranger's whistle on a beaded lanyard (shuka red, white, blue beads).
  col_lemayian_whistle: () => `${shadow(80, 134, 50)}
    <path d="M30 40q20 70 50 70" stroke="#2a2a2a" stroke-width="2" fill="none"/>
    ${Array.from({ length: 14 }, (_, i) => { const t = i / 13, x = 30 + 50 * t * t * 0 + 50 * t, y = 40 + 70 * Math.sin(t * Math.PI / 2) * .95; return `<circle cx="${(30 + (x - 30) * (0.55 + 0.45 * t)).toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${['#C1272D', '#F6F0E0', '#1E3A8A'][i % 3]}" stroke="${INK}" stroke-width=".6"/>`; }).join('')}
    <path d="M78 98h40a12 12 0 0 1 0 24H78z" fill="#B9C0C6" stroke="${INK}" stroke-width="1.6"/><path d="M64 104h16v12H64z" fill="#9AA2A8" stroke="${INK}" stroke-width="1.4"/>
    <circle cx="116" cy="110" r="5" fill="#6E767C" stroke="${INK}" stroke-width="1"/><path d="M82 102h30" stroke="#fff" stroke-width="2" opacity=".6"/><circle cx="74" cy="98" r="4" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
  // Joseph's original file, reopened: a thin manila folder, the red string untied, one sheet sliding out.
  col_joseph_file: () => `${shadow(82, 140, 58)}
    <path d="M24 44h44l6 8h62v80H24z" fill="${MANILA}" stroke="${INK}" stroke-width="1.6"/>
    <path d="M40 34l80 6-4 86-80-6z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>${Array.from({ length: 9 }, (_, i) => `<path d="M48 ${50 + i * 8}l62 4" stroke="${INK}" stroke-width=".7" opacity=".55"/>`).join('')}
    <path d="M24 60h112v72H24z" fill="${MANILA}" stroke="${INK}" stroke-width="1.6" opacity=".96"/>
    <circle cx="80" cy="96" r="4" fill="${INK}"/><path d="M80 96c-14 6-30 2-40 14M80 96c10 10 30 12 44 22" stroke="#C7362B" stroke-width="2" fill="none"/>
    <path d="M34 72h40" stroke="${INK}" stroke-width="1.2"/><path d="M34 80h26" stroke="${INK}" stroke-width="1" opacity=".6"/>`,
  // The key to drawer 14: a long iron key with a brass number tag.
  col_drawer_key: () => `${shadow(80, 132, 54, 8)}
    <circle cx="44" cy="80" r="16" fill="none" stroke="#4A4A50" stroke-width="7"/><circle cx="44" cy="80" r="16" fill="none" stroke="${INK}" stroke-width="1"/>
    <path d="M60 76h64v8H60z" fill="#5A5A60" stroke="${INK}" stroke-width="1.4"/><path d="M110 84v12h6v-6h4v8h4V84z" fill="#5A5A60" stroke="${INK}" stroke-width="1.4"/>
    <path d="M62 78h60" stroke="#9a9aa2" stroke-width="1.6"/>
    <path d="M36 98l-8 24" stroke="#7a6a40" stroke-width="1.6"/><path d="M14 118h30l4 10-4 10H14z" fill="${BRASS}" stroke="${INK}" stroke-width="1.4"/><circle cx="20" cy="128" r="2" fill="${INK}"/><path d="M26 128h14" stroke="${INK}" stroke-width="2"/>`,
  // Halima's fountain pen: black resin, gold clip and nib.
  col_halima_pen: () => `${shadow(80, 130, 60, 8)}
    <g transform="rotate(-28 80 80)"><path d="M18 74h84v12H18z" fill="#141414" stroke="${INK}" stroke-width="1.4"/><path d="M18 74q-8 6 0 12z" fill="#141414"/>
      <path d="M102 74h14l18 6-18 6h-14z" fill="#E2B85A" stroke="${INK}" stroke-width="1.2"/><path d="M116 80h18" stroke="${INK}" stroke-width=".8"/>
      <path d="M40 70h44v4H40z" fill="${BRASS}" stroke="${INK}" stroke-width="1"/><path d="M28 77h68" stroke="#fff" stroke-width="1.4" opacity=".35"/><path d="M96 74v12" stroke="${BRASS}" stroke-width="3"/></g>`,
  // Joseph's file, closed with the truth: the folder shut and tied, a fresh red CLOSED stamp across it.
  col_joseph_closed: () => `${shadow(80, 140, 58)}
    <path d="M24 44h44l6 8h62v84H24z" fill="${MANILA}" stroke="${INK}" stroke-width="1.6"/><path d="M24 58h112" stroke="${INK}" stroke-width="1" opacity=".4"/>
    <path d="M24 98h112" stroke="#C7362B" stroke-width="2"/><circle cx="80" cy="98" r="4" fill="${INK}"/>
    <g transform="rotate(-9 80 82)"><rect x="40" y="70" width="80" height="26" rx="2" fill="none" stroke="#B3261E" stroke-width="3"/><path d="M48 83h64" stroke="#B3261E" stroke-width="6" stroke-dasharray="9 4" opacity=".85"/></g>
    <path d="M34 112h50M34 120h36" stroke="${INK}" stroke-width="1" opacity=".55"/>`,
};
export const COLLECTIBLE_ART = Object.keys(ART);
export function objectArt(id, { size = 120, label = '' } = {}) {
  const body = ART[id]?.(); if (!body) return '';
  return `<svg class="obj-art" viewBox="0 0 160 160" width="${size}" height="${size}" role="img" aria-label="${label.replace(/"/g, '&quot;')}"><defs><filter id="ob-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>${body}</svg>`;
}
