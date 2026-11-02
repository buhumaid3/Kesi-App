// Document templates (design doc §5.8). Every card is drawn in code from the case data, so text stays
// sharp, accessible and translatable; generated photos only ever show places, faces and objects.
import { h, $, openSheet } from './ui.js';
import { esc, pad3, tilt } from './text.js';

const LEDGER = new Set(['tallyBook', 'visitorRegister', 'logBook', 'ticketBook', 'jobBook', 'orderBook', 'feeBook', 'ledger']);
const SLIP = new Set(['receipt', 'ticket', 'collectionSlip', 'tag']);
const PRINT = new Set(['manifest', 'timetable', 'mastRecord', 'pesapapStatement', 'phoneLog']);
const HANDWRITTEN_KEYS = new Set(['footer', 'margin', 'note', 'backPage', 'back', 'text']);

export const imgPath = (n, id) => `img/cases/${pad3(n)}/${id}.webp`;
const human = k => k.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const TITLE = {
  statement: 'Witness statement', sceneNote: 'Scene of crime note', object: 'Exhibit', tallyBook: "Stage marshal's tally book",
  visitorRegister: 'Register', ticket: 'Ticket', ticketBook: 'Ticket book', manifest: 'Manifest', logBook: 'Log book', receipt: 'Receipt',
  note: 'Handwritten note', sketch: 'Scene sketch', form: 'Report form', tag: 'Tag', jobBook: 'Job book', calendar: 'Wall calendar',
  board: 'Notice board', timetable: 'Timetable', feeBook: 'Fee book', photo: 'Found photograph', orderBook: 'Order book',
  collectionSlip: 'Collection slip', ledger: 'Cash book',
};

// ── The case-photo treatment (§5.6): border, grain, tilt, clip or tape, a label in Amani's hand ────────
export function photo({ src, label, kind = 'object', id, onZoom, small = false }) {
  const fig = h('figure', { class: `photo photo--${kind} ${small ? 'photo--small' : ''}`, style: { '--tilt': `${tilt(id || src)}deg` } });
  const frame = h('div', { class: 'photo-img' });
  const img = h('img', { src, alt: label || '', loading: 'lazy', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => { frame.classList.add('is-pending'); img.remove(); frame.append(h('span', { class: 'pending' }, 'Photo pending')); });
  frame.append(img);
  if (kind === 'portrait') fig.append(h('span', { class: 'clip', 'aria-hidden': 'true' }));
  if (kind === 'location') fig.append(h('span', { class: 'tape tape--l', 'aria-hidden': 'true' }), h('span', { class: 'tape tape--r', 'aria-hidden': 'true' }));
  fig.append(frame);
  if (label) fig.append(h('figcaption', {}, label));
  if (onZoom) { fig.tabIndex = 0; fig.setAttribute('role', 'button'); fig.setAttribute('aria-label', `${label || 'Photo'}: open full size`); fig.addEventListener('click', () => onZoom(src, label)); }
  return fig;
}

// Full-size photo with zoom (case 9 teaches it: the green figure is only visible zoomed in).
export function zoomPhoto(src, label) {
  openSheet({ id: 'zoom', className: 'sheet--zoom', label: `${label}, full size`, build(body) {
    let z = 1;
    const img = h('img', { src, alt: label, draggable: 'false' });
    const pane = h('div', { class: 'zoom-pane' }, img);
    const set = v => { z = Math.max(1, Math.min(4, v)); img.style.width = `${z * 100}%`; zl.textContent = `${Math.round(z * 100)}%`; };
    const zl = h('span', { class: 'zoom-level' }, '100%');
    img.addEventListener('dblclick', e => { const r = img.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; set(z >= 3 ? 1 : z + 1); requestAnimationFrame(() => { pane.scrollLeft = fx * img.offsetWidth - pane.clientWidth / 2; pane.scrollTop = fy * img.offsetHeight - pane.clientHeight / 2; }); });
    // Pinch (two pointers) on touch screens.
    const pts = new Map(); let d0 = 0, z0 = 1;
    pane.addEventListener('pointerdown', e => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); z0 = z; } });
    pane.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pts.size === 2 && d0) { const [a, b] = [...pts.values()]; set(z0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / d0); } });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; };
    pane.addEventListener('pointerup', up); pane.addEventListener('pointercancel', up);
    body.append(h('h2', { class: 'zoom-title' }, label),
      pane,
      h('div', { class: 'zoom-bar' },
        h('button', { class: 'btn', type: 'button', onclick: () => set(z - 0.5), 'aria-label': 'Zoom out' }, '−'), zl,
        h('button', { class: 'btn', type: 'button', onclick: () => set(z + 0.5), 'aria-label': 'Zoom in' }, '+'),
        h('span', { class: 'zoom-hint' }, 'Double-tap or pinch to look closer')));
  } });
}

// ── Body renderers ───────────────────────────────────────────────────────────────────────────────────
function table(rows, cls = '') {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return h('div', { class: 'tbl-wrap' }, h('table', { class: `tbl ${cls}` },
    h('thead', {}, h('tr', {}, cols.map(c => h('th', { scope: 'col' }, human(c))))),
    h('tbody', {}, rows.map(r => h('tr', {}, cols.map(c => h('td', {}, r[c] == null || r[c] === '' ? '' : String(r[c]))))))));
}
function kv(body, skip, gloss) {
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (skip.has(k) || v == null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'object') out.push(h('div', { class: 'doc-sub' }, h('span', { class: 'doc-k' }, human(k)), table(v)));
      else out.push(h('div', { class: 'doc-kv' }, h('span', { class: 'doc-k' }, human(k)), h('ul', { class: 'doc-lines' }, v.map(x => h('li', { html: gloss(String(x)) })))));
    } else if (typeof v === 'object') out.push(...kv(v, new Set(), gloss));
    else if (HANDWRITTEN_KEYS.has(k)) out.push(h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, human(k)), h('p', { class: 'other-hand', html: gloss(String(v)).replace(/\n/g, '<br>') })));
    else out.push(h('div', { class: 'doc-kv' }, h('span', { class: 'doc-k' }, human(k)), h('span', { class: 'doc-v', html: gloss(String(v)) })));
  }
  return out;
}

export function renderEvidence(K, ev, { exhibitNo } = {}) {
  const run = K.run, c = run.c, n = run.n, gloss = s => K.gloss.rich(s, { inline: K.save.settings.inlineGloss });
  const r = ev.render;
  const kindClass = LEDGER.has(r) ? 'doc--ledger' : SLIP.has(r) ? 'doc--slip' : PRINT.has(r) ? 'doc--print' : r === 'note' ? 'doc--note' : r === 'board' ? 'doc--board' : r === 'object' || r === 'sceneNote' ? 'doc--exhibit' : 'doc--paper';
  const doc = h('article', { class: `doc ${kindClass} doc-r-${r}`, 'aria-label': ev.title });
  const no = exhibitNo ? `EXHIBIT ${exhibitNo}` : '';
  doc.append(h('header', { class: 'doc-head' },
    h('span', { class: 'doc-kind' }, TITLE[r] || human(r)),
    h('h2', { class: 'doc-title' }, ev.title),
    h('span', { class: 'doc-meta' }, [no, `Case ${pad3(n)}`, c.ob.number].filter(Boolean).join(' · '))));

  const b = ev.body || {};
  const imgOf = ev.image ? imgPath(n, ev.id) : null;
  const zoom = (src, label) => zoomPhoto(src, label);

  if (r === 'statement') {
    const p = run.byId.get(b.speaker);
    const channel = b.channel === 'radio' ? 'Taken by two-way radio' : b.channel === 'phone' ? 'Taken by phone' : 'Taken in person';
    doc.append(h('div', { class: 'stmt-head' },
      h('div', {}, h('span', { class: 'doc-k' }, 'Name'), h('b', {}, p?.name || '—')),
      h('div', {}, h('span', { class: 'doc-k' }, 'Age'), h('span', {}, p?.age ?? '—')),
      h('div', { class: 'wide' }, h('span', { class: 'doc-k' }, 'Occupation'), h('span', {}, p?.occupation || '—')),
      h('div', { class: 'wide' }, h('span', { class: 'doc-k' }, 'Recorded by'), h('span', {}, `Det. A. Mwenda · ${channel} · ${c.meta.date || ''}`))));
    doc.append(h('ol', { class: 'stmt-body' }, (ev.facts || []).map(fid => h('li', { html: gloss(stripSpeaker(run.byId.get(fid)?.text || '', p)) }))));
    const initials = (p?.name || '').split(/\s+/).map(w => w[0]).join('.') + '.';
    doc.append(h('div', { class: 'stmt-sign' }, h('span', { class: 'doc-k' }, 'Signed'), h('span', { class: 'other-hand sig' }, initials)));
  } else if (r === 'sceneNote') {
    if (imgOf) doc.append(photo({ src: imgOf, label: `${run.byId.get(c.locations[0].id)?.name?.split(',')[0] || 'Scene'}, ${c.ob.time}`, kind: 'scene', id: ev.id, onZoom: zoom }));
    doc.append(h('p', { class: 'doc-note' }, 'Observations at the scene. Report language only.'));
    doc.append(h('ul', { class: 'obs' }, (ev.facts || []).map(fid => h('li', { html: gloss(run.byId.get(fid)?.text || '') }))));
  } else if (r === 'object') {
    if (imgOf) doc.append(photo({ src: imgOf, label: no || ev.title, kind: 'evidence', id: ev.id, onZoom: zoom }));
    doc.append(h('div', { class: 'exhibit-tag', style: { '--tilt': `${tilt(ev.id + 't', 2)}deg` } },
      h('b', {}, no || 'EXHIBIT'), h('span', { html: gloss(b.label || ev.title) })));
    if (b.note) doc.append(h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, 'Note found with it'), h('p', { class: 'other-hand', html: gloss(b.note).replace(/\n/g, '<br>') })));
  } else if (r === 'photo') {
    if (imgOf) doc.append(photo({ src: imgOf, label: no || 'Found photograph', kind: 'evidence', id: ev.id, onZoom: zoom }));
    if (b.front) doc.append(h('div', { class: 'doc-kv' }, h('span', { class: 'doc-k' }, imgOf ? 'What the print shows' : 'The print'), h('span', { class: 'doc-v', html: gloss(b.front) })));
    if (b.back) doc.append(h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, 'On the back'), h('p', { class: 'other-hand' }, b.back)));
  } else if (r === 'note') {
    doc.append(h('div', { class: 'lined other-hand', html: gloss(b.text || '').replace(/\n/g, '<br>') }));
    doc.append(...kv(b, new Set(['text']), gloss));
    if (imgOf) doc.append(photo({ src: imgOf, label: no, kind: 'evidence', id: ev.id, onZoom: zoom, small: true }));
  } else {
    if (imgOf) doc.append(photo({ src: imgOf, label: no || ev.title, kind: 'evidence', id: ev.id, onZoom: zoom, small: true }));
    if (Array.isArray(b.rows)) doc.append(table(b.rows, LEDGER.has(r) ? 'tbl--ledger' : ''));
    doc.append(...kv(b, new Set(['rows']), gloss));
  }

  // What Amani noted from this card: every fact on it is in the notebook already (§2.2).
  if (r !== 'statement' && r !== 'sceneNote') {
    doc.append(h('div', { class: 'noted' }, h('span', { class: 'noted-h' }, 'Noted'),
      h('ul', {}, (ev.facts || []).map(fid => h('li', { class: 'hand', html: gloss(run.byId.get(fid)?.text || '') })))));
  }
  return doc;
}

// Statements are written in the first person on the form; the fact texts carry "Kassim: …" prefixes
// for the notebook. Strip "Name:" when it is the speaker's own name.
function stripSpeaker(text, p) {
  if (!p) return text;
  const first = p.name.split(/\s+/)[0];
  return text.replace(new RegExp(`^(${p.name}|${first}|Mzee ${first}|Mama ${first}|Pastor ${first}):\\s*`), '');
}

export function evidenceTitle(ev) { return ev.title; }
export { esc };
