// The phone: a handset picked up off the desk. Lock screen → home screen → three apps:
//   Phone (Favourites, Recents, Keypad): calling Mwalimu is how hints are asked for (§2.8);
//   Messages: texts, one thread per sender (Halima's between-case texts);
//   Voice-notes: Mwalimu's notes, with a waveform, a play button and the transcript.
// Hints, stars and messages behave exactly as before; only the way you reach them changed.
import { h, put, openSheet } from './ui.js';
import { pad3 } from './text.js';

const MWALIMU_TAIL = '214';                         // her number is only ever shown as 07•• ••• 214
const fmt = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;
const TIER = ['', 'Where to look', 'What to notice', 'The answer'];
const TIER_L = ['', 'where to look', 'what to notice', 'the answer'];
const GROUP = { who: 'Who did it', why: 'Why', how: 'How', when: 'When', where: 'Where', spine: 'The pattern', forgery: 'The forgery', absence: 'What is missing', accomplice: 'The accomplice', planted: 'The plant', realTarget: 'The real target' };
// Texts already carry their sender ("Prosecutor H. Abdi: …"); the thread shows the sender once, above.
export const cleanText = (from, line) => /Abdi|Hassan|Rukia/.test(from) ? line.replace(/^(Prosecutor\s+|Senior Prosecutor\s+)?(H\. Abdi|R\. Hassan|Rukia Hassan|Halima Abdi):\s*/i, '') : line;

// Line icons (24×24, stroke = currentColor), so the handset never depends on emoji fonts.
const ICONS = {
  phone: '<path d="M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  chat: '<path d="M4 5h16v10H9l-5 4z"/>',
  wave: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  keypad: '<circle cx="6" cy="5" r="1.3"/><circle cx="12" cy="5" r="1.3"/><circle cx="18" cy="5" r="1.3"/><circle cx="6" cy="11" r="1.3"/><circle cx="12" cy="11" r="1.3"/><circle cx="18" cy="11" r="1.3"/><circle cx="6" cy="17" r="1.3"/><circle cx="12" cy="17" r="1.3"/><circle cx="18" cy="17" r="1.3"/>',
  mute: '<path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  del: '<path d="M9 5h11v14H9l-6-7zM12 9l5 6M17 9l-5 6"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6M12 7.6v.4"/>',
  out: '<path d="M7 17L17 7M9 7h8v8"/>',
};
const icon = (name, cls = '') => h('span', { class: `ph-i ${cls}`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>` });

export function openPhoneApp(ctx) {
  const { K, run } = ctx;
  const pr = K.save.progress;
  pr.calls = pr.calls || [];
  const firstThisCase = pr.phoneCase !== run.n;
  let view = firstThisCase ? 'lock' : 'home';
  let call = null;                                  // { gid, tier?, phase: 'ringing'|'live'|'ended', result, started, muted, speaker }
  let dialed = '', dialMsg = '';
  let recent = null;                                // a past call opened from Recents
  let timers = [], lastView = null;
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  // Speaker: her voice at full volume for this call only; the saved setting comes back when the call ends.
  let savedVoice = null;
  const speaker = on => {
    if (on && savedVoice == null) { savedVoice = K.save.settings.voice; K.save.settings.voice = 100; }
    if (!on && savedVoice != null) { K.save.settings.voice = savedVoice; savedVoice = null; }
    K.audio.setVolumes();
  };

  document.body.classList.add('has-phone');
  return openSheet({ id: 'phone', className: 'sheet--device', label: 'Phone', onClose: () => { document.body.classList.remove('has-phone'); clearTimers(); speaker(false); K.audio.stopVoice(); ctx.clearView(); }, build(body, entry) {
    const go = v => { view = v; entry.rebuild(); };
    const unread = k => pr.messages.filter(m => !m.read && (k ? m.kind === k : true)).length;
    const statusBar = h('div', { class: 'ph-status' },
      h('span', { class: 'ph-time' }, run.c.ob.time),
      h('span', { class: 'ph-notch', 'aria-hidden': 'true' }),
      h('span', { class: 'ph-icons', 'aria-label': 'Full signal, battery 76 percent' },
        h('span', { class: 'ph-bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'ph-batt', 'aria-hidden': 'true' }, h('i'))));
    const home = h('button', { class: 'ph-home', type: 'button', 'aria-label': 'Home screen', onclick: () => { if (call && call.phase !== 'ended') return; go('home'); } });
    const fresh = view !== lastView; lastView = view;
    const screen = h('div', { class: `ph-screen ph-v-${view.split(':')[0]}` }, statusBar, h('div', { class: `ph-body ${fresh ? 'is-new' : ''}` }, render()), home);
    put(body, h('div', { class: 'handset', 'data-region': String(run.region) }, h('span', { class: 'ph-cam', 'aria-hidden': 'true' }), screen));

    function render() {
      if (view === 'lock') return lockScreen();
      if (view === 'home') return homeScreen();
      if (view.startsWith('phone')) return phoneApp(view.split(':')[1] || 'favs');
      if (view === 'pick') return helpPick();
      if (view === 'call') return callScreen();
      if (view === 'messages') return messagesApp();
      if (view.startsWith('thread:')) return thread(view.slice(7));
      if (view === 'voicenotes') return voiceNotes();
      return homeScreen();
    }

    // ── Lock screen: time, date, the notification stack; swipe up or tap to open ───────────────────────
    function lockScreen() {
      const notes = pr.messages.filter(m => !m.read).slice(-4).reverse();
      const unlock = () => { pr.phoneCase = run.n; ctx.save(); K.sound('pin'); go('home'); };
      const el = h('div', { class: 'ph-lock' },
        h('p', { class: 'ph-carrier' }, 'SCU NET'),
        h('p', { class: 'ph-lock-date' }, run.c.meta.date || run.c.ob.date || ''),
        h('p', { class: 'ph-lock-time' }, run.c.ob.time),
        h('div', { class: 'ph-notifs' }, notes.length ? notes.map(m => h('div', { class: 'ph-notif' },
          h('span', { class: `ph-app-dot ph-app-dot--${m.kind}`, 'aria-hidden': 'true' }),
          h('b', {}, m.kind === 'text' ? m.from : `${m.from} · voice-note`), h('span', {}, cleanText(m.from, m.line)))) : h('p', { class: 'ph-quiet' }, 'No new notifications')),
        h('button', { class: 'ph-unlock', type: 'button', onclick: unlock }, h('span', { class: 'ph-unlock-bar', 'aria-hidden': 'true' }), 'Swipe up or tap to open'));
      let y0 = null;
      el.addEventListener('pointerdown', e => { y0 = e.clientY; });
      el.addEventListener('pointerup', e => { if (y0 != null && y0 - e.clientY > 50) unlock(); y0 = null; });
      return el;
    }

    // ── Home screen ─────────────────────────────────────────────────────────────────────────────────────
    function homeScreen() {
      const app = (id, label, cls, badge, v) => h('button', { class: `ph-app ph-app--${cls}`, type: 'button', onclick: () => go(v), 'aria-label': `${label}${badge ? `, ${badge} new` : ''}` },
        h('span', { class: 'ph-app-ic', 'aria-hidden': 'true' }, icon({ phone: 'phone', messages: 'chat', voice: 'wave' }[cls]), badge ? h('span', { class: 'ph-badge' }, String(badge)) : null), h('span', { class: 'ph-app-l' }, label));
      return h('div', { class: 'ph-homescr' },
        h('p', { class: 'ph-home-time' }, run.c.ob.time, h('small', {}, run.c.meta.date || '')),
        h('div', { class: 'ph-grid' },
          app('phone', 'Phone', 'phone', 0, 'phone:favs'),
          app('messages', 'Messages', 'messages', unread('text'), 'messages'),
          app('voice', 'Voice-notes', 'voice', unread('voice'), 'voicenotes')),
        h('p', { class: 'ph-home-hint' }, h('b', {}, 'Mwalimu: '), K.coach?.core?.phoneOpen || 'Call me when you\'re stuck. Each call costs a star, never the case.'));
    }

    // ── Phone app: Favourites, Recents, Keypad ──────────────────────────────────────────────────────────
    function avatar(cls = '') {
      const im = h('img', { src: 'img/ref/rc_mwalimu.webp', alt: '', draggable: 'false' });
      const wrap = h('span', { class: `ph-avatar ${cls}`, 'aria-hidden': 'true' }, im);
      im.addEventListener('error', () => { im.remove(); wrap.textContent = 'EW'; });
      return wrap;
    }
    function phoneApp(tab) {
      const tabs = h('nav', { class: 'ph-tabs', 'aria-label': 'Phone' },
        [['favs', 'Favourites', 'star'], ['recents', 'Recents', 'clock'], ['keypad', 'Keypad', 'keypad']].map(([k, l, ic]) =>
          h('button', { class: `ph-tab ${tab === k ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(tab === k), onclick: () => go(`phone:${k}`) }, icon(ic), l)));
      let main;
      if (tab === 'favs') main = h('div', { class: 'ph-list' }, h('h2', { class: 'ph-h' }, 'Favourites'),
        h('button', { class: 'ph-row', type: 'button', onclick: () => go('pick') }, avatar(), h('span', { class: 'ph-row-t' }, h('b', {}, 'Mwalimu'), h('small', {}, 'Ch. Insp. Esther Wairimu · mobile 07•• ••• 214')), h('span', { class: 'ph-row-call' }, icon('phone'))),
        h('p', { class: 'ph-foot' }, 'She picks up whenever you call. Three kinds of help for each part of the charge sheet: where to look, what to notice, or the answer.'));
      else if (tab === 'recents') {
        const calls = pr.calls.slice().reverse();
        main = h('div', { class: 'ph-list' }, h('h2', { class: 'ph-h' }, 'Recents'),
          calls.length ? calls.slice(0, 40).map((c, i) => h('button', { class: 'ph-row', type: 'button', onclick: () => { recent = c; go('call'); } },
            h('span', { class: 'ph-row-ic' }, icon('out')), h('span', { class: 'ph-row-t' }, h('b', {}, 'Mwalimu'), h('small', {}, `${TIER[c.tier]} · case ${pad3(c.case)} · ${c.time || ''}`)), h('span', { class: 'ph-row-i' }, icon('info'))))
            : h('p', { class: 'ph-foot' }, 'No calls yet.'));
      } else {
        const keys = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
        const shown = dialed.replace(/^(\d{4})(\d{0,3})(\d{0,3}).*$/, (m, a, b, c) => [a, b, c].filter(Boolean).join(' ')) || dialed;
        main = h('div', { class: 'ph-keypad' },
          h('p', { class: 'ph-dialed', 'aria-live': 'polite' }, shown || ' '),
          h('p', { class: 'ph-dialmsg', 'aria-live': 'polite' }, dialMsg || (dialed ? ' ' : 'Mwalimu\'s number ends 214.')),
          h('div', { class: 'ph-keys' }, keys.map(([d, l]) => h('button', { class: 'ph-key', type: 'button', 'aria-label': d, onclick: () => { if (dialed.length < 13) dialed += d; dialMsg = ''; K.sound('key'); go('phone:keypad'); } }, h('b', {}, d), h('small', {}, l)))),
          h('div', { class: 'ph-keyrow' },
            h('span'),
            h('button', { class: 'ph-dial', type: 'button', 'aria-label': 'Call', onclick: dial }, icon('phone')),
            dialed ? h('button', { class: 'ph-del', type: 'button', 'aria-label': 'Delete', onclick: () => { dialed = dialed.slice(0, -1); dialMsg = ''; go('phone:keypad'); } }, icon('del')) : h('span')));
      }
      return h('div', { class: 'ph-app-view' }, main, tabs);
    }
    function dial() {
      const d = dialed.replace(/\D/g, '');
      if (!d) return;
      if (d.endsWith(MWALIMU_TAIL) && d.length >= 4) { dialed = ''; dialMsg = ''; go('pick'); return; }
      dialMsg = 'The number you have dialled is not in service.'; K.sound('returned'); go('phone:keypad');
    }

    // ── Before the call: which help, for which part of the sheet ────────────────────────────────────────
    function helpPick() {
      const groups = run.c.chargeSheet.groups.filter(g => !run.passed.has(g.id));
      return h('div', { class: 'ph-pick' }, avatar('big'), h('h2', {}, 'Mwalimu'), h('p', { class: 'ph-pick-q' }, 'What do you need?'),
        groups.length ? groups.map(g => {
          const tier = run.hintTier(g.id), next = Math.min(3, tier + 1);
          return h('div', { class: 'ph-pick-g' }, h('span', { class: 'ph-pick-l' }, GROUP[g.kind] || g.kind),
            h('button', { class: 'ph-pick-b', type: 'button', onclick: () => startCall(g.id) },
              h('b', {}, tier >= 3 ? 'The answer, another blank' : TIER[next]),
              h('small', {}, next === 3 ? 'Caps this case at ★' : 'Caps this case at ★★')),
            tier ? h('small', { class: 'ph-pick-used' }, `Already asked: ${TIER_L.slice(1, tier + 1).join(', ')}`) : null);
        }) : h('p', { class: 'ph-foot' }, 'Nothing to ask: the prosecutor has accepted the whole sheet.'),
        h('button', { class: 'ph-cancel', type: 'button', onclick: () => go('phone:favs') }, 'Cancel'));
    }

    // ── The call: rings, connects, she says the line (voice if recorded, captions always) ───────────────
    function startCall(gid) {
      clearTimers(); recent = null;
      call = { gid, phase: 'ringing', muted: false, speaker: false };
      go('call');
      const reduced = K.reduced();
      K.sound('phone'); if (!reduced) timers.push(setTimeout(() => call?.phase === 'ringing' && K.sound('phone'), 1100));
      timers.push(setTimeout(connect, reduced ? 600 : 2200));
    }
    function connect() {
      if (!call || call.phase !== 'ringing') return;
      const r = run.hint(call.gid);                  // the star cost is taken only once she has picked up
      if (!r) { call = null; go('phone:favs'); return; }
      r.line = r.line || 'Look again at everything you haven\'t opened.';
      call.result = r; call.phase = 'live'; call.started = Date.now();
      pr.calls.push({ case: run.n, gid: call.gid, tier: r.tier, line: r.line, point: r.point || null, facts: r.facts || null, missing: r.missing || null, blank: r.blank || null, word: r.word || null, time: run.c.ob.time, at: Date.now() });
      ctx.save(); ctx.after();
      entry.rebuild();
      // The call ends when she has finished: after her recording, or after time to read the caption.
      const words = r.line.split(/\s+/).length, live = call;
      const readTime = () => timers.push(setTimeout(() => { if (call === live && call.phase === 'live') hangUp(); }, Math.max(4000, words * 380 + 1800)));
      if (call.muted) readTime();
      else K.audio.speak('mwalimu', r.line).then(ok => { if (call !== live || call.phase !== 'live') return; if (ok) timers.push(setTimeout(hangUp, 700)); else readTime(); });
      tick();
    }
    function tick() {
      if (!call || call.phase !== 'live') return;
      const t = body.querySelector('.ph-call-status');
      if (t) { const s = Math.floor((Date.now() - call.started) / 1000); t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
      timers.push(setTimeout(tick, 500));
    }
    function hangUp() {
      clearTimers(); K.audio.stopVoice(); speaker(false);
      if (!call) { go('phone:favs'); return; }
      if (call.phase === 'ringing') { call = null; go('phone:favs'); return; }   // hung up before she answered: nothing used
      call.phase = 'ended'; call.length = Math.round((Date.now() - call.started) / 1000);
      K.sound('pin'); entry.rebuild();
    }
    function callScreen() {
      const c = call && call.phase !== 'ended' ? call : null;
      const r = recent || call?.result;
      const phase = recent ? 'recent' : call?.phase;
      const status = phase === 'ringing' ? 'calling…' : phase === 'live' ? '00:00' : phase === 'ended' ? `Call ended · ${fmt(call.length)}` : `${TIER[r.tier]} · case ${pad3(r.case)}`;
      const caption = r && phase !== 'ringing' ? h('p', { class: `ph-caption ${phase === 'live' && !K.reduced() ? 'is-live' : ''}`, 'aria-live': 'polite' },
        r.line.split(/\s+/).map((w, i) => h('span', { style: { '--w': i } }, w + ' '))) : null;
      return h('div', { class: `ph-call ph-call--${phase}` },
        avatar(`huge ${phase === 'ringing' ? 'is-ringing' : ''}`),
        h('h2', {}, 'Mwalimu'),
        h('p', { class: 'ph-call-status' }, status),
        caption,
        phase === 'ended' || phase === 'recent' ? actions(r) : null,
        c ? h('div', { class: 'ph-call-btns' },
          h('button', { class: `ph-cbtn ${call.muted ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(call.muted), onclick: () => { call.muted = !call.muted; if (call.muted && call.phase === 'live') { K.audio.stopVoice(); const live = call; timers.push(setTimeout(() => call === live && call.phase === 'live' && hangUp(), 2500)); } entry.rebuild(); } }, icon('mute'), 'mute'),
          h('button', { class: `ph-cbtn ${call.speaker ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(call.speaker), onclick: () => { call.speaker = !call.speaker; speaker(call.speaker); entry.rebuild(); } }, icon('speaker'), 'speaker'),
          h('button', { class: 'ph-cbtn', type: 'button', disabled: true }, icon('keypad'), 'keypad')) : null,
        c ? h('button', { class: 'ph-hangup', type: 'button', 'aria-label': 'End call', onclick: hangUp }, icon('phone'))
          : h('div', { class: 'ph-after' },
            h('button', { class: 'ph-cbtn', type: 'button', onclick: () => K.audio.speak('mwalimu', r.line) }, icon('play'), 'play again'),
            h('button', { class: 'ph-cancel', type: 'button', onclick: () => { call = null; recent = null; go(phase === 'recent' ? 'phone:recents' : 'phone:favs'); } }, 'Done')));
    }
    // What she pointed at, as buttons that open it (same as before the redesign).
    function actions(r) {
      if (!r || (r.case && r.case !== run.n)) return r ? h('p', { class: 'ph-foot' }, `From case ${pad3(r.case)}.`) : null;
      const kids = [];
      if (r.point) {
        const x = run.byId.get(r.point);
        if (run.kE.has(r.point)) kids.push(h('button', { class: 'ph-act', type: 'button', onclick: () => ctx.openEvidence(r.point) }, `Open: ${x.title}`));
        else if (run.kP.has(r.point)) kids.push(h('button', { class: 'ph-act', type: 'button', onclick: () => ctx.openPerson(r.point) }, `Open: ${x.name}`));
        else kids.push(h('p', { class: 'ph-note' }, ctx.whereToFind(r.point)));
      }
      if (r.facts) {
        kids.push(h('ul', { class: 'ph-facts' }, r.facts.filter(f => run.kF.has(f)).map(f => h('li', {}, run.byId.get(f).text))));
        const missing = r.facts.filter(f => !run.kF.has(f));
        if (missing.length) kids.push(h('p', { class: 'ph-note' }, `One of them you haven't found yet. ${ctx.whereToFind(missing[0])}`));
        else kids.push(h('button', { class: 'ph-act', type: 'button', onclick: () => { for (const f of r.facts) if (!run.s.pinned.includes(f)) run.pin(f); ctx.save(); ctx.openNotebook('pinned'); } }, 'Pin both and compare'));
      }
      if (r.tier === 3) kids.push(h('button', { class: 'ph-act', type: 'button', onclick: ctx.openCharge }, 'Open the charge sheet'));
      return kids.length ? h('div', { class: 'ph-actions' }, kids) : null;
    }

    // ── Messages: one thread per sender ─────────────────────────────────────────────────────────────────
    function messagesApp() {
      const texts = pr.messages.filter(m => m.kind === 'text');
      const senders = [...new Set(texts.map(m => m.from))];
      return h('div', { class: 'ph-list' }, h('div', { class: 'ph-bar' }, h('button', { class: 'ph-back', type: 'button', onclick: () => go('home') }, '‹ Home'), h('h2', { class: 'ph-h' }, 'Messages')),
        senders.length ? senders.map(s => {
          const ms = texts.filter(m => m.from === s), last = ms[ms.length - 1], un = ms.filter(m => !m.read).length;
          return h('button', { class: 'ph-row', type: 'button', onclick: () => go(`thread:${s}`) },
            h('span', { class: 'ph-avatar ph-avatar--init', 'aria-hidden': 'true' }, s.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('')),
            h('span', { class: 'ph-row-t' }, h('b', {}, s), h('small', {}, cleanText(s, last.line))),
            un ? h('span', { class: 'ph-dot', 'aria-label': `${un} unread` }) : null);
        }) : h('p', { class: 'ph-foot' }, 'No messages yet. Halima texts after she reads a sheet.'));
    }
    function thread(from) {
      const ms = pr.messages.filter(m => m.kind === 'text' && m.from === from);
      ms.forEach(m => { m.read = true; }); ctx.save(); ctx.refreshDesk();
      const list = h('div', { class: 'ph-thread' }, ms.map(m => [h('p', { class: 'ph-stamp' }, m.case ? `After case ${pad3(m.case)}` : ''), h('p', { class: 'ph-bubble' }, cleanText(from, m.line))]));
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      return h('div', { class: 'ph-app-view' }, h('div', { class: 'ph-bar' }, h('button', { class: 'ph-back', type: 'button', onclick: () => go('messages') }, '‹ Messages'), h('h2', { class: 'ph-h ph-h--small' }, from)), list);
    }

    // ── Voice-notes: Mwalimu's notes with a waveform ────────────────────────────────────────────────────
    function voiceNotes() {
      const ns = pr.messages.filter(m => m.kind === 'voice').slice().reverse();
      ns.forEach(m => { m.read = true; }); ctx.save(); ctx.refreshDesk();
      return h('div', { class: 'ph-list' }, h('div', { class: 'ph-bar' }, h('button', { class: 'ph-back', type: 'button', onclick: () => go('home') }, '‹ Home'), h('h2', { class: 'ph-h' }, 'Voice-notes')),
        ns.length ? ns.slice(0, 60).map(m => {
          const secs = Math.max(2, Math.round(m.line.split(/\s+/).length / 2.6));
          let seed = 0; for (const ch of m.line) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
          const bars = Array.from({ length: 28 }, (_, i) => { seed = (seed * 1103515245 + 12345) >>> 0; return 25 + (seed % 75) * Math.sin((i + 1) / 29 * Math.PI); });
          const wave = h('span', { class: 'ph-wave', 'aria-hidden': 'true' }, bars.map(v => h('i', { style: { height: `${Math.max(12, v)}%` } })));
          return h('div', { class: 'ph-vn' },
            h('button', { class: 'ph-vn-play', type: 'button', 'aria-label': 'Play voice-note', html: '', onclick: async e => {
              const btn = e.currentTarget; btn.classList.add('is-playing'); wave.classList.add('is-playing');
              const ok = await K.audio.speak('mwalimu', m.line);
              if (!ok) { const t = btn.parentElement.querySelector('.ph-vn-len'); if (t) t.textContent = 'not recorded yet'; }
              btn.classList.remove('is-playing'); wave.classList.remove('is-playing');
            } }, icon('play')),
            wave, h('span', { class: 'ph-vn-len' }, `0:${String(secs).padStart(2, '0')}`),
            h('p', { class: 'ph-vn-text' }, m.line), h('small', { class: 'ph-vn-meta' }, m.case ? `Case ${pad3(m.case)}` : ''));
        }) : h('p', { class: 'ph-foot' }, 'No voice-notes yet.'));
    }
  } });
}
