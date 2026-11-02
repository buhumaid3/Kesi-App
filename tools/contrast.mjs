// Contrast check for www/styles/tokens.css (WCAG 2.2 relative luminance).
// Text pairs need 4.5:1 (body) or 3:1 (display ≥ 24px / bold ≥ 18.66px); UI shapes need 3:1.
// Usage: node tools/contrast.mjs [www/styles/tokens.css]   exit 1 if any required pair fails.
import fs from 'node:fs';

const css = fs.readFileSync(process.argv[2] || 'www/styles/tokens.css', 'utf8');
const block = (re) => { const m = css.match(re); return m ? m[1] : ''; };
const vars = (txt) => Object.fromEntries([...txt.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
const light = vars(block(/:root\s*{([\s\S]*?)\n}/));
const dark = { ...light, ...vars(block(/prefers-color-scheme: dark\)\s*{\s*:root\s*{([\s\S]*?)}/)) };
const regions = [...css.matchAll(/\[data-region="(\d+)"\]\s*{([^}]*)}/g)].map(m => {
  const v = vars(m[2]); const acc = (m[2].match(/--region-accent:\s*var\(--([\w-]+)\)/) || [])[1];
  return { n: +m[1], region: v.region, ink: v['region-ink'], accent: v['region-accent'] || light[acc] };
});

const lum = (hex) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, use]
const pairs = (t, mode) => [
  ['ink', 'paper', 4.5, 'document body'], ['ink', 'ledger', 4.5, 'OB ledger entry'], ['ink', 'manila', 4.5, 'folder label'],
  ['ink', 'kraft', 4.5, 'evidence-bag label'], ['ink', 'paper-lo', 4.5, 'second sheet'],
  ['ink-soft', 'paper', 4.5, 'meta lines'], ['ink-soft', 'ledger', 4.5, 'ledger meta'],
  ['carbon', 'paper', 4.5, 'carbon-copy text'], ['pencil', 'paper', 4.5, "Amani's notes"], ['pencil', 'manila', 4.5, 'notes on a folder'],
  ['stamp', 'paper', 4.5, 'stamp words on paper'], ['stamp', 'manila', 3, 'stamp on a folder (display)'],
  ['ob-green', 'paper', 4.5, 'ACCEPTED stamp'], ['ink', 'highlighter', 4.5, 'highlighted text'],
  ['paper', 'desk', 4.5, 'paper text on the desk (captions)'], ['signwhite', 'desk', 4.5, 'desk captions'],
  ['sodium', 'desk', 3, 'case clock (display)'], ['lamp', 'desk', 3, 'lamp-lit display'],
  ['matatu-pink', 'desk', 3, 'display accent'], ['matatu-lime', 'desk', 3, 'display accent'], ['matatu-cyan', 'desk', 3, 'focus ring on desk (UI)'],
  ['matatu-cyan', 'paper', 1.0, 'focus ring on paper: needs the 2px ink outline (see doc)'],
  ['string', 'cork', 1.0, 'string on cork: pinned shape, not colour (informational)'],
].map(([f, b, min, use]) => ({ mode, f, b, min, use, r: ratio(t[f], t[b]) }));

const rows = [...pairs(light, 'paper'), ...pairs(dark, 'night')];
for (const g of regions) {
  rows.push({ mode: 'region', f: `region-ink`, b: `region ${g.n}`, min: 4.5, use: 'folder tab label', r: ratio(g.ink, g.region) });
  rows.push({ mode: 'region', f: `region ${g.n}`, b: 'desk', min: 1.0, use: 'tab against desk (informational)', r: ratio(g.region, light.desk) });
}
let fail = 0;
const out = rows.map(x => { const ok = x.r >= x.min; if (!ok) fail++; return `${ok ? 'pass' : 'FAIL'}  ${x.r.toFixed(2).padStart(5)}:1  (min ${x.min})  ${x.mode.padEnd(6)} ${x.f} on ${x.b} — ${x.use}`; });
console.log(out.join('\n'));
console.log(`\n${rows.length} pairs · ${fail} failing`);
process.exit(fail ? 1 : 0);
