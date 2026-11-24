// B17: the rest of the paper (design doc §5.8). Bespoke templates for the documents that used to fall back
// to the generic table: records printouts (calls, mast log, PesaPap statement, SMS log), a phone's message
// thread and its call list, letters, report forms, written log books, video and CCTV stills, a wall
// calendar. The case files hold these as short summaries ("Biashara 12:30–13:20; Mwembe Tayari from
// 13:28"), so each template lays the summary out the way the real paper looks, splitting it into rows only
// where the pattern is certain and keeping the words as written otherwise. Nothing is added that the case
// file doesn't say. The parsers are pure (no DOM) and tested in node.
import { h } from './ui.js';

const TIME = /\b(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* )?(\d{1,2}:\d{2})\b/;
const RANGE = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/;
const KSH = /KSh\s?[\d,]+/;

// Split a summary into its parts: "; " always, ". " only before a capital or digit (not "Ref. 12").
export function parts(s) {
  // Never after an initial ("M. Ogola", "S. Waweru") or a short abbreviation ("No. 4", "St. Mary").
  return String(s || '').split(/;\s+|(?<!\b[A-Z]|\bNo|\bSt|\bMt|\bDr|\bMr|\bMrs|\bMs)\.\s+(?=[A-Z0-9"])/).map(x => x.trim().replace(/\.$/, '')).filter(Boolean);
}
// Mast (cell-site) log: "Day: Mast HH:MM–HH:MM", "Mast from HH:MM", "Mast until HH:MM". Others stay notes.
export function mastRows(s) {
  let day = '';
  return parts(s).map(p => {
    const d = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*(?: night)?:\s*/i.exec(p); if (d) { day = d[0].replace(/:\s*$/, ''); p = p.slice(d[0].length); }
    let m = /^(.+?)\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})(.*)$/.exec(p);
    if (m && !/\d/.test(m[1])) return { day, mast: m[1].replace(/ mast$/i, ''), from: m[2], to: m[3], note: m[4].replace(/^[\s,(]+|[)\s]+$/g, '') };
    m = /^(.+?)\s+from\s+(\d{1,2}:\d{2})(.*)$/.exec(p);
    if (m && !/\d/.test(m[1])) return { day, mast: m[1].replace(/ mast$/i, ''), from: m[2], to: '', note: m[3].replace(/^[\s,(]+|[)\s]+$/g, '') };
    m = /^(.+?)\s+until\s+(\d{1,2}:\d{2})(.*)$/.exec(p);
    if (m && !/\d/.test(m[1])) return { day, mast: m[1].replace(/ mast$/i, ''), from: '', to: m[2], note: m[3].replace(/^[\s,(]+|[)\s]+$/g, '') };
    return { day, note: p };
  });
}
// Money lines: a time or date, an amount, the rest as details. Lines without an amount stay notes.
export function moneyRows(s) {
  return parts(s).map(p => {
    const amt = KSH.exec(p)?.[0] || '', t = TIME.exec(p), date = /\b(\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December))\b/.exec(p);
    const when = t ? t[0] : date ? date[1] : /^(Last month|Three days ago|Yesterday|Today|Monthly)/i.exec(p)?.[1] || '';
    const dir = /\b(received|from|in from|incoming|deposit)\b/i.test(p) && !/\bsent to\b|\bto\b(?! the)/i.test(p.replace(/from .*$/i, '')) ? 'in' : /\b(sent|to|withdrawal|paid|payment)\b/i.test(p) ? 'out' : '';
    let details = p.replace(when, '').replace(amt, '').replace(/^[\s:—–,-]+|[\s,—–-]+$/g, '').replace(/\s{2,}/g, ' ');
    if (!details) details = p;
    return amt ? { when, details, amount: amt, dir } : { note: p };
  });
}
// Calls: rows from the case's own objects, or the summary's parts with their time.
export function callRows(v) {
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? { when: x.time || '', who: x.from ? `From ${x.from}` : x.to ? `To ${x.to}` : '', len: x.duration || '', note: x.note || '' } : { note: String(x) });
  return parts(v).map(p => { const t = TIME.exec(p); return t ? { when: t[0], who: '', len: /(\d+\s?(?:s|min))\b/.exec(p)?.[1] || '', note: p.replace(t[0], '').replace(/,\s*\d+\s?(?:s|min)\b/, '').replace(/^[\s,:—–-]+|[\s,—–-]+$/g, '') } : { note: p }; });
}
// Messages: {time, from|to, text} or plain strings (system messages such as PesaPap confirmations).
export function messageRows(v) {
  const list = Array.isArray(v) ? v : [v];
  return list.map(x => typeof x === 'object' ? { time: x.time || '', side: x.to ? 'out' : x.from ? 'in' : 'sys', who: x.to || x.from || '', text: x.text || '' } : { time: '', side: 'sys', who: '', text: String(x) });
}
// Notes with times in them ("23:12 the oud player stands… 23:19 he returns"): one mark per time.
export function timeMarks(s) {
  const out = [], re = /(\d{1,2}:\d{2})\s*([^]*?)(?=\s\d{1,2}:\d{2}\b|$)/g; let m;
  const str = String(s || '');
  while ((m = re.exec(str))) out.push({ at: m[1], text: m[2].trim().replace(/^[,.:;\s]+|[,;\s]+$/g, '') });
  return out.length ? out : [{ at: '', text: str }];
}
const toMin = t => { const m = /(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

// ── Templates ────────────────────────────────────────────────────────────────────────────────────────
const sec = (title, ...kids) => h('section', { class: 'rp-sec' }, h('h3', { class: 'rp-h' }, title), ...kids);
const note = (t, gloss) => h('p', { class: 'rp-note', html: gloss(t) });

// A records printout from the carrier and PesaPap, obtained under a court order.
export function recordsPrintout(ev, b, { gloss, caseNo, gated }) {
  const out = [];
  const who = /\(([^)]+)\)/.exec(ev.title)?.[1] || '', num = /07xx xxx \d{3}/.exec(ev.title)?.[0] || '';
  out.push(h('div', { class: 'rp-head' },
    h('span', { class: 'rp-org' }, 'SUBSCRIBER RECORDS · PRINTOUT'),
    h('span', {}, num ? `MSISDN ${num}` : ''), h('span', {}, who ? `Subscriber: ${who}` : ''),
    h('span', {}, `Ref. SCU/REC/${caseNo}`), gated ? h('span', { class: 'rp-court' }, 'Obtained under court order') : null));
  const used = new Set();
  const M = b.masts ?? b.mast;
  if (M != null) { used.add('masts'); used.add('mast');
    const rows = mastRows(M), timed = rows.filter(r => r.mast), days = rows.some(r => r.day);
    out.push(sec('Cell site (mast) log',
      timed.length >= 2 ? mastBars(timed) : null,
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl rp-tbl' }, h('thead', {}, h('tr', {}, [days ? 'Day' : null, 'Mast', 'From', 'To'].filter(Boolean).map(x => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, rows.map(r => r.mast ? h('tr', {}, days ? h('td', { class: 'rp-t' }, r.day || '') : null, h('td', {}, h('b', {}, r.mast), r.note ? h('small', { class: 'rp-sub' }, ` ${r.note}`) : null), h('td', { class: 'rp-t' }, r.from || '…'), h('td', { class: 'rp-t' }, r.to || '…'))
          : h('tr', { class: 'rp-row-note' }, h('td', { colspan: days ? '4' : '3', html: gloss(r.note) })))))))); }
  const C = b.calls ?? b.call;
  if (C != null) { used.add('calls'); used.add('call');
    const rows = callRows(C);
    out.push(sec('Call detail record', h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl rp-tbl' }, h('thead', {}, h('tr', {}, ['Time', 'Number / name', 'Duration'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows.map(r => h('tr', {}, h('td', { class: 'rp-t' }, r.when || ''), h('td', { html: gloss([r.who, r.note].filter(Boolean).join(' · ')) }), h('td', { class: 'rp-t' }, r.len || '')))))))); }
  const P = b.pesapap ?? b.pay;
  if (P != null) { used.add('pesapap'); used.add('pay'); out.push(pesapapStatement(P, gloss)); }
  const S = b.messages ?? b.message;
  if (S != null) { used.add('messages'); used.add('message');
    out.push(sec('SMS log', h('ol', { class: 'rp-sms' }, messageRows(S).map(m => h('li', {}, h('span', { class: 'rp-t' }, m.time || '—'), h('span', { class: 'rp-dir' }, m.side === 'out' ? `→ ${m.who}` : m.side === 'in' ? `← ${m.who}` : 'SYSTEM'), h('span', { html: gloss(m.text) })))))); }
  if (b.chat != null) { used.add('chat'); out.push(sec('Chat', note(String(b.chat), gloss))); }
  if (b.text != null) { used.add('text'); out.push(note(String(b.text), gloss)); }
  out.push(h('p', { class: 'rp-end' }, '*** END OF PRINTOUT ***'));
  return { nodes: out, used };
}
function pesapapStatement(P, gloss) {
  const rows = moneyRows(P);
  return h('section', { class: 'rp-sec rp-pesapap' }, h('h3', { class: 'rp-h' }, h('span', { class: 'pp-mark', 'aria-hidden': 'true' }, 'P'), 'PesaPap statement'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl rp-tbl' }, h('thead', {}, h('tr', {}, ['When', 'Details', 'Paid in', 'Paid out'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows.map(r => r.amount ? h('tr', {}, h('td', { class: 'rp-t' }, r.when || ''), h('td', { html: gloss(r.details) }), h('td', { class: 'rp-amt' }, r.dir === 'in' ? r.amount : ''), h('td', { class: 'rp-amt' }, r.dir !== 'in' ? r.amount : ''))
        : h('tr', { class: 'rp-row-note' }, h('td', { colspan: '4', html: gloss(r.note) })))))));
}
// A small coverage diagram: each mast as a bar across the hours it held the phone.
function mastBars(rows) {
  const ts = rows.flatMap(r => [toMin(r.from), toMin(r.to)]).filter(x => x != null);
  let a = Math.min(...ts), z = Math.max(...ts); if (z - a < 30) { a -= 15; z += 15; }
  const span = z - a || 1, masts = [...new Set(rows.map(r => r.mast))];
  return h('div', { class: 'rp-bars', role: 'img', 'aria-label': 'Which mast the phone was on, over time' },
    masts.map(mn => h('div', { class: 'rp-bar-row' }, h('span', { class: 'rp-bar-l' }, mn),
      h('div', { class: 'rp-bar-track' }, rows.filter(r => r.mast === mn).map(r => {
        const f = toMin(r.from) ?? a, t = toMin(r.to) ?? z;
        return h('span', { class: `rp-bar ${!r.from ? 'is-open-l' : ''} ${!r.to ? 'is-open-r' : ''}`, style: { left: `${(f - a) / span * 100}%`, width: `${Math.max(2, (t - f) / span * 100)}%` }, title: `${r.from || '…'}–${r.to || '…'}` });
      })))),
    h('div', { class: 'rp-bar-axis' }, h('span', {}, fmt(a)), h('span', {}, fmt(z))));
}
const fmt = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// A phone screen: a message thread (smsThread) or the call list (phoneLog).
export function phoneScreen(ev, b, { gloss, kind }) {
  const used = new Set(['messages', 'message', 'calls', 'chat', 'pesapap', 'masts']);
  const owner = /^(.+?)['’]s phone/.exec(ev.title)?.[1] || '';
  const screen = h('div', { class: 'ps-screen' },
    h('div', { class: 'ps-bar' }, h('span', {}, 'SCU NET'), h('span', {}, owner ? `${owner}'s phone` : 'Phone')),
    h('div', { class: 'ps-title' }, (t => t ? t[0].toUpperCase() + t.slice(1) : kind === 'smsThread' ? 'Messages' : 'Recents')(ev.title.replace(/^.+?['’]s phone:?\s*/, '').replace(/^\((.*)\)$/, '$1'))));
  const S = b.messages ?? b.message;
  if (S != null) screen.append(h('div', { class: 'ps-thread' }, messageRows(S).map(m => h('div', { class: `ps-msg ps-${m.side}` },
    m.side === 'sys' ? h('span', { class: 'ps-from' }, /PesaPap|Confirmed|KSh/.test(m.text) ? 'PesaPap' : 'Message') : m.who && m.side === 'in' ? h('span', { class: 'ps-from' }, m.who) : null,
    h('span', { class: 'ps-text', html: gloss(m.text) }), m.time ? h('span', { class: 'ps-time' }, m.time) : null))));
  if (b.calls != null) screen.append(h('ul', { class: 'ps-calls' }, callRows(b.calls).map(r => h('li', {},
    h('span', { class: 'ps-call-ico', 'aria-hidden': 'true' }, '☎'), h('span', { class: 'ps-call-who', html: gloss([r.who, r.note].filter(Boolean).join(' · ') || 'Call') }), h('span', { class: 'ps-time' }, [r.when, r.len].filter(Boolean).join(' · '))))));
  if (b.chat != null) screen.append(h('div', { class: 'ps-thread' }, h('div', { class: 'ps-msg ps-in' }, h('span', { class: 'ps-from' }, 'Chat'), h('span', { class: 'ps-text', html: gloss(String(b.chat)) }))));
  const extra = [];
  if (b.pesapap != null) extra.push(pesapapStatement(b.pesapap, gloss));
  if (b.masts != null) extra.push(...recordsPrintout({ title: '' }, { masts: b.masts }, { gloss, caseNo: '', gated: false }).nodes.filter(n => n.classList?.contains('rp-sec')));
  return { nodes: [h('div', { class: 'ps-phone' }, screen), ...extra], used };
}

// A letter: a letterhead, the body, any reply in another hand.
export function letter(ev, b, { gloss, date }) {
  const used = new Set(['text', 'reply', 'memo', 'family']);
  const body = String(b.text || b.memo || '');
  const q = /^(.*?)(?:\s*(?:Reply|Salaton's reply|Her reply|His reply)[^:]*:\s*)("?.*)$/.exec(body);
  return { used, nodes: [h('div', { class: 'lt-head' }, h('span', { class: 'lt-org' }, ev.title.toUpperCase()), h('span', { class: 'lt-date' }, date || '')),
    h('p', { class: 'lt-body', html: gloss(q ? q[1] : body) }),
    q ? h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, 'Reply'), h('p', { class: 'other-hand', html: gloss(q[2].replace(/^"|"$/g, '')) })) : null,
    b.reply ? h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, 'Reply'), h('p', { class: 'other-hand', html: gloss(String(b.reply)) })) : null,
    b.family ? h('div', { class: 'doc-kv' }, h('span', { class: 'doc-k' }, 'Family'), h('span', { class: 'doc-v', html: gloss(String(b.family)) })) : null] };
}

// A report form: a boxed field grid, typed answers, the long text in a particulars box, a signature line.
export function form(ev, b, { gloss, human }) {
  const used = new Set(Object.keys(b));
  const fields = Object.entries(b).filter(([k, v]) => !['text', 'note', 'signed', 'rows'].includes(k) && v != null && typeof v !== 'object');
  return { used: new Set([...used].filter(k => k !== 'rows')), nodes: [
    fields.length ? h('div', { class: 'fm-grid' }, fields.map(([k, v]) => h('div', { class: `fm-box ${String(v).length > 34 ? 'is-wide' : ''}` }, h('span', { class: 'fm-k' }, human(k)), h('span', { class: 'fm-v', html: gloss(String(v)) })))) : null,
    b.text ? h('div', { class: 'fm-box is-wide fm-part' }, h('span', { class: 'fm-k' }, 'Particulars'), h('p', { class: 'fm-v', html: gloss(String(b.text)).replace(/\n/g, '<br>') })) : null,
    b.note ? h('div', { class: 'doc-hand' }, h('span', { class: 'doc-k' }, 'Added by hand'), h('p', { class: 'other-hand', html: gloss(String(b.note)) })) : null,
    h('div', { class: 'fm-sign' }, h('span', { class: 'doc-k' }, 'Signed'), b.signed ? h('span', { class: 'other-hand sig', html: gloss(String(b.signed)) }) : h('span', { class: 'fm-line' }))] };
}

// A log book written in prose: one ruled line per entry, the time in the margin column.
export function writtenLog(text, gloss) {
  // A time goes in the margin only when the entry starts with it; times inside the words stay there.
  return h('ol', { class: 'lg-lines' }, parts(text).map(p => { const t = TIME.exec(p), lead = t && t.index === 0;
    return h('li', {}, h('span', { class: 'lg-t' }, lead ? t[0] : ''), h('span', { class: 'lg-x', html: gloss(lead ? p.slice(t[0].length).replace(/^[\s:—–,-]+/, '') : p) })); }));
}

// Video and CCTV: a dark frame with the camera's timestamp, a scrubber with a mark at each time, the notes.
export function footage(ev, b, { gloss, kind }) {
  const used = new Set(['from', 'to', 'notes', 'frames', 'bay']);
  const txt = String(b.notes || b.frames || ''), led = /^\s*\d{1,2}:\d{2}/.test(txt);
  // Lines: by time when the notes are written that way, otherwise as written. Marks: every time mentioned.
  const marks = led ? timeMarks(txt) : parts(txt).map(p => ({ at: '', text: p }));
  const ticks = [...txt.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(m => ({ at: m[1] }));
  const a = toMin(b.from) ?? toMin(ticks[0]?.at), z = toMin(b.to) ?? toMin(ticks.at(-1)?.at);
  const span = a != null && z != null && z > a ? z - a : null;
  return { used, nodes: [h('div', { class: `ft-screen ${kind === 'cctv' ? 'is-cctv' : ''}` },
      h('span', { class: 'ft-rec' }, kind === 'cctv' ? 'CAM 02' : '● REC'), h('span', { class: 'ft-ts' }, b.from || ticks[0]?.at || ''),
      h('span', { class: 'ft-cap' }, kind === 'cctv' ? 'Still frames' : 'Phone video')),
    span ? h('div', { class: 'ft-scrub', role: 'img', 'aria-label': `Footage from ${b.from || fmt(a)} to ${b.to || fmt(z)}` },
      h('div', { class: 'ft-track' }, ticks.map(m => h('span', { class: 'ft-mark', style: { left: `${(toMin(m.at) - a) / span * 100}%` }, title: m.at }))),
      h('div', { class: 'ft-axis' }, h('span', {}, b.from || fmt(a)), h('span', {}, b.to || fmt(z)))) : null,
    h('ol', { class: `lg-lines ft-notes ${led ? '' : 'is-plain'}` }, marks.map(m => h('li', {}, led ? h('span', { class: 'lg-t' }, m.at) : null, h('span', { class: 'lg-x', html: gloss(m.text) })))),
    b.bay ? h('div', { class: 'doc-kv' }, h('span', { class: 'doc-k' }, 'Also in frame'), h('span', { class: 'doc-v', html: gloss(String(b.bay)) })) : null] };
}

// A wall calendar: the company's header, its lines, the month.
export function calendar(ev, b, { gloss }) {
  return { used: new Set(['header', 'lines', 'month', 'page']), nodes: [h('div', { class: 'cal' },
    b.header ? h('div', { class: 'cal-head' }, b.header) : null,
    (b.lines || []).length ? h('div', { class: 'cal-lines' }, (b.lines || []).map(l => h('span', { html: gloss(String(l)) }))) : null,
    h('div', { class: 'cal-month' }, b.month || ''),
    h('div', { class: 'cal-grid', 'aria-hidden': 'true' }, Array.from({ length: 35 }, () => h('span'))),
    b.page ? h('p', { class: 'other-hand cal-note', html: gloss(String(b.page)) }) : null)] };
}
