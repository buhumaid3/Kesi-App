// Small working views for exhibits whose case beat asks the player to *do* something with them (ui.beats):
//   listening (case 88): an audio clip as a waveform to scrub, its marked moments as captions;
//   countingAsEvidence (case 32): the pencil sum when a record gives a starting amount and a later count;
//   animalDataAlibi (case 54): collar positions as two tracks on a small plan, moved with a time slider.
// Each draws only what the exhibit's own text says; nothing is added.
import { h } from './ui.js';

const toMin = t => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const fmt = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

export function exhibitExtras(ev) {
  const b = ev.body || {}, out = [];
  if (typeof b.audio === 'string') out.push(listening(b.audio, b.video));
  if (Array.isArray(b.rows)) { const s = countSum(b.rows.map(r => r.entry || Object.values(r).join(' '))); if (s) out.push(s); }
  if (typeof b.lionesses === 'string' || /collar/i.test(ev.title || '')) { const t = collarTracks(Object.values(b).join(' ')); if (t) out.push(t); }
  return out;
}

// ── Listening ─────────────────────────────────────────────────────────────────────────────────────────
function listening(audio, video) {
  // The clip runs over the times named in the audio and video notes; loud moments are the audio's marked times.
  const times = [...`${audio} ${video || ''}`.matchAll(/(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?/g)];
  if (!times.length) return null;
  const all = times.flatMap(m => [toMin(m[1]), m[2] ? toMin(m[2]) : toMin(m[1])]);
  const t0 = Math.min(...all), t1 = Math.max(...all, t0 + 10);
  // Audio events: each "HH:MM(–HH:MM): what" in the audio note.
  // Each marked moment runs from its "HH:MM(–HH:MM):" to the next one.
  const marks0 = [...audio.matchAll(/(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?:\s*/g)];
  const events = marks0.map((m, i) => ({ a: toMin(m[1]), b: m[2] ? toMin(m[2]) : toMin(m[1]),
    text: audio.slice(m.index + m[0].length, i + 1 < marks0.length ? marks0[i + 1].index : undefined).trim().replace(/[.\s]+$/, '') }));
  const W = 320, H = 70, N = 160, x = m => ((m - t0) / (t1 - t0)) * W;
  let bars = '';
  for (let i = 0; i < N; i++) {
    const m = t0 + (i / (N - 1)) * (t1 - t0);
    const loud = events.some(e => m >= e.a - 0.4 && m <= e.b + 0.6);
    const base = 0.12 + 0.1 * Math.abs(Math.sin(i * 1.7) * Math.sin(i * 0.37));   // the room: quiet, a voice singing
    const v = loud ? 0.75 + 0.2 * Math.abs(Math.sin(i * 2.3)) : base;
    const bh = v * H * 0.9;
    bars += `<rect x="${(i / N * W).toFixed(1)}" y="${((H - bh) / 2).toFixed(1)}" width="${(W / N * 0.7).toFixed(2)}" height="${bh.toFixed(1)}" rx="1"/>`;
  }
  const marks = events.map(e => `<path d="M${x(e.a).toFixed(1)} 0V${H}" stroke="#B3261E" stroke-width="1" stroke-dasharray="3 2"/>`).join('');
  const cap = h('p', { class: 'wf-cap', 'aria-live': 'polite' }, 'Drag along the clip to listen.');
  const head = h('div', { class: 'wf-head' });
  const svg = h('div', { class: 'wf-svg', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><g fill="#4E4B57">${bars}</g>${marks}</svg>` });
  const time = h('span', { class: 'wf-time' }, fmt(t0));
  const slider = h('input', { type: 'range', class: 'wf-range', min: String(t0), max: String(t1), step: '0.25', value: String(t0), 'aria-label': 'Position in the clip',
    oninput: e => { const m = +e.target.value; head.style.left = `${(x(m) / W) * 100}%`; time.textContent = fmt(Math.floor(m));
      const hit = [...events].reverse().find(ev => m >= ev.a - 0.5 && m <= ev.b + 0.5); /* where two overlap, the later one */ cap.textContent = hit ? `${fmt(hit.a)}${hit.b !== hit.a ? `–${fmt(hit.b)}` : ''}: ${hit.text}` : 'Quiet: the room, singing.'; } });
  return h('figure', { class: 'wf', 'aria-label': 'Audio clip' }, h('figcaption', { class: 'wf-label' }, h('b', {}, 'Audio'), time), h('div', { class: 'wf-track' }, svg, head), slider, cap,
    h('ol', { class: 'wf-list' }, events.map(e => h('li', {}, h('b', {}, `${fmt(e.a)}${e.b !== e.a ? `–${fmt(e.b)}` : ''} `), e.text))));
}

// ── The pencil sum ────────────────────────────────────────────────────────────────────────────────────
export function countSum(lines) {
  const q = lines.map(t => { const m = String(t).match(/(\d[\d,]*(?:\.\d+)?)\s?(ml|l|litres?|kg|g|bags?|sacks?|bottles?|tins?)\b/i); return m ? { v: +m[1].replace(/,/g, ''), u: m[2].toLowerCase(), t: String(t) } : null; });
  const start = q.find(x => x && /open|start|issued|received|full|stock/i.test(x.t)), count = [...q].reverse().find(x => x && /count|found|left|remain/i.test(x.t));
  if (!start || !count || start === count || start.u !== count.u || count.v >= start.v) return null;
  const d = +(start.v - count.v).toFixed(2);
  return h('p', { class: 'pencil-sum hand' }, `${start.v} ${start.u} − ${count.v} ${count.u} = `, h('b', {}, `${d} ${start.u}`), ' unaccounted for');
}

// ── Collar tracks ─────────────────────────────────────────────────────────────────────────────────────
function collarTracks(text) {
  const span = text.match(/(\d+(?:\.\d+)?)\s?km\s+([a-z-]+)\s+of[^.]*?from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i), reach = text.match(/reached[^.]*?at\s+(\d{1,2}:\d{2})/i);
  if (!span || !reach) return null;
  const km = +span[1], dir = span[2].toLowerCase(), a = toMin(span[3]), b0 = toMin(span[4]);
  let r = toMin(reach[1]); const b = b0 < a ? b0 + 1440 : b0; if (r < a) r += 1440;
  const DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0], 'north-east': [.71, -.71], 'north-west': [-.71, -.71], 'south-east': [.71, .71], 'south-west': [-.71, .71] };
  const [dx, dy] = DIRS[dir] || [.71, -.71];
  const W = 300, H = 200, kx = 70, ky = 150, s = 14, fx = kx + dx * km * s, fy = ky + dy * km * s;
  const pos = (m, k) => { const off = k ? [8, 6] : [0, 0]; if (m <= b) return [fx + off[0], fy + off[1]]; const t = Math.min(1, (m - b) / Math.max(1, r - b)); return [fx + (kx - fx) * t + off[0] * (1 - t), fy + (ky - fy) * t + off[1] * (1 - t)]; };
  const svg = h('div', { class: 'ct-svg' });
  const time = h('span', { class: 'ct-time' }, fmt(a));
  const draw = m => {
    const [x1, y1] = pos(m, 0), [x2, y2] = pos(m, 1);
    svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Collar positions at ${fmt(Math.floor(m))}">
      <path d="M${fx} ${fy}L${kx} ${ky}" stroke="#A44A2A" stroke-width="1.4" stroke-dasharray="4 3" fill="none"/>
      <g transform="translate(${kx} ${ky})"><path d="M-6 -6l12 12M6 -6l-12 12" stroke="#B3261E" stroke-width="2.4"/><text x="10" y="16" class="ct-l">zebra kill</text></g>
      <text x="${fx - 30}" y="${fy - 12}" class="ct-l">${km} km ${dir}</text>
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="5.5" fill="#D9A441" stroke="#2A221B"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="5.5" fill="#D9A441" stroke="#2A221B"/>
      <g transform="translate(${W - 24} 30)"><path d="M0 -14l5 12h-10z" fill="#2A221B"/><text y="12" text-anchor="middle" class="ct-l">N</text></g></svg>`;
    time.textContent = fmt(Math.floor(m));
  };
  draw(a);
  const slider = h('input', { type: 'range', class: 'ct-range', min: String(a), max: String(r + 20), step: '5', value: String(a), 'aria-label': 'Time', oninput: e => draw(+e.target.value) });
  return h('figure', { class: 'ct' }, h('figcaption', { class: 'wf-label' }, h('b', {}, 'Collar positions'), time), svg, slider,
    h('p', { class: 'hand dim' }, `Both collars: ${km} km ${dir} from ${fmt(a)} to ${fmt(b)}, at the kill at ${fmt(r)}.`));
}
