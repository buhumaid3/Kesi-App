// The phone: a handset picked up off the desk. Lock screen → home screen → nine apps:
//   Phone (Favourites, Recents, Keypad): calling Mwalimu is how hints are asked for (§2.8);
//   Messages: texts, one thread per sender (Halima's between-case texts);
//   Voice-notes: Mwalimu's notes, with a waveform, a play button and the transcript;
//   Contacts, Photos, Map, Calendar, Recorder: what you have already found in this case, seen another way
//   (no new puzzles: every one of them only shows the case state);  Settings: the game's settings.
// Fit (B8): every screen that isn't a list (lock, home, keypad, help pick, call) is scaled to fit the handset,
// whatever its size; only lists scroll, inside the app's own area under its title bar.
import { h, put, openSheet } from './ui.js';
import { pad3 } from './text.js';
import { imgPath } from './docs.js';
import { timeRows, genericReply } from './state.js';
import { createCamera } from './camera.js';

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
  person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
  map: '<path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
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
  let ro = null;                                    // keeps the current fixed screen fitted to the handset
  let photoAt = null;                               // the photo open in Photos (full view)
  const seen = run.s.phoneSeen || (run.s.phoneSeen = { photos: [] });
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  // Speaker: her voice at full volume for this call only; the saved setting comes back when the call ends.
  let savedVoice = null;
  const speaker = on => {
    if (on && savedVoice == null) { savedVoice = K.save.settings.voice; K.save.settings.voice = 100; }
    if (!on && savedVoice != null) { K.save.settings.voice = savedVoice; savedVoice = null; }
    K.audio.setVolumes();
  };

  document.body.classList.add('has-phone');
  return openSheet({ id: 'phone', className: 'sheet--device', label: 'Phone', onClose: () => { ro?.disconnect(); document.body.classList.remove('has-phone'); clearTimers(); speaker(false); K.audio.stopVoice('phone'); ctx.clearView(); }, build(body, entry) {
    const go = v => { view = v; entry.rebuild(); };
    const unread = k => pr.messages.filter(m => !m.read && (k ? m.kind === k : true)).length;
    const statusBar = h('div', { class: 'ph-status' },
      h('span', { class: 'ph-time' }, run.c.ob.time),
      h('span', { class: 'ph-notch', 'aria-hidden': 'true' }),
      h('span', { class: 'ph-icons', 'aria-label': 'Full signal, battery 76 percent' },
        h('span', { class: 'ph-bars', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'ph-batt', 'aria-hidden': 'true' }, h('i'))));
    const home = h('button', { class: 'ph-home', type: 'button', 'aria-label': 'Home screen', onclick: () => { if (call && call.phase !== 'ended') return; go('home'); } });
    const fresh = view !== lastView; lastView = view;
    const screen = h('div', { class: `ph-screen ph-v-${view.split(':')[0]}` }, statusBar, h('div', { class: `ph-body ${fresh ? 'is-entering' : ''}` }, render()), home);
    put(body, h('div', { class: 'handset', 'data-region': String(run.region) }, h('span', { class: 'ph-cam', 'aria-hidden': 'true' }), screen));
    ro?.disconnect(); ro = null;
    const fitEl = screen.querySelector('.ph-fit');
    if (fitEl) { const fit = () => fitPhone(fitEl); fit(); ro = new ResizeObserver(fit); ro.observe(fitEl.parentElement); document.fonts?.ready.then(fit); }

    function render() {
      const fit = el => h('div', { class: 'ph-fit' }, el);
      if (view === 'lock') return fit(lockScreen());
      if (view === 'home') return fit(homeScreen());
      if (view.startsWith('phone')) return phoneApp(view.split(':')[1] || 'favs');
      if (view === 'pick') return fit(helpPick());
      if (view === 'call') return fit(callScreen());
      if (view === 'messages') return messagesApp();
      if (view.startsWith('thread:')) return thread(view.slice(7));
      if (view === 'voicenotes') return voiceNotes();
      if (view === 'contacts') return contactsApp();
      if (view === 'photos') return photosApp();
      if (view === 'photo') return photoView();
      if (view === 'map') return mapApp();
      if (view === 'calendar') return calendarApp();
      if (view === 'recorder') return recorderApp();
      if (view.startsWith('rec:')) return recorderPerson(view.slice(4));
      return fit(homeScreen());
    }
    // An app's frame: a title bar that stays put and a body that scrolls on its own.
    function appFrame(title, back, ...kids) {
      return h('div', { class: 'ph-app-view' },
        h('div', { class: 'ph-bar' }, h('button', { class: 'ph-back', type: 'button', onclick: () => go(back[1]) }, `‹ ${back[0]}`), h('h2', { class: 'ph-h' }, title)),
        h('div', { class: 'ph-scroll' }, ...kids));
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
      const app = (id, label, cls, badge, v) => h('button', { class: `ph-app ph-app--${cls}`, type: 'button', 'data-app': cls, onclick: () => typeof v === 'function' ? v() : go(v), 'aria-label': `${label}${badge ? `, ${badge} new` : ''}` },
        h('span', { class: 'ph-app-ic', 'aria-hidden': 'true' }, icon({ phone: 'phone', messages: 'chat', voice: 'wave', contacts: 'person', photos: 'photo', map: 'map', calendar: 'cal', recorder: 'mic', settings: 'gear' }[cls]), badge ? h('span', { class: 'ph-badge' }, String(badge)) : null), h('span', { class: 'ph-app-l' }, label));
      return h('div', { class: 'ph-homescr' },
        h('p', { class: 'ph-home-time' }, run.c.ob.time, h('small', {}, run.c.meta.date || '')),
        h('div', { class: 'ph-grid' },
          app('phone', 'Phone', 'phone', 0, 'phone:favs'),
          app('messages', 'Messages', 'messages', unread('text'), 'messages'),
          app('voice', 'Voice-notes', 'voice', unread('voice'), 'voicenotes'),
          app('contacts', 'Contacts', 'contacts', newPeople().length, 'contacts'),
          app('photos', 'Photos', 'photos', allPhotos().filter(x => !seen.photos.includes(x.key)).length, 'photos'),
          app('map', 'Map', 'map', run.locations().filter(l => !run.visited.has(l.id)).length, 'map'),
          app('calendar', 'Calendar', 'calendar', 0, 'calendar'),
          app('recorder', 'Recorder', 'recorder', 0, 'recorder'),
          app('settings', 'Settings', 'settings', 0, () => ctx.openSettings())),
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
        main = h('div', { class: 'ph-fitbox' }, h('div', { class: 'ph-fit' }, h('div', { class: 'ph-keypad' },
          h('p', { class: 'ph-dialed', 'aria-live': 'polite' }, shown || ' '),
          h('p', { class: 'ph-dialmsg', 'aria-live': 'polite' }, dialMsg || (dialed ? ' ' : 'Mwalimu\'s number ends 214.')),
          h('div', { class: 'ph-keys' }, keys.map(([d, l]) => h('button', { class: 'ph-key', type: 'button', 'aria-label': d, onclick: () => { if (dialed.length < 13) dialed += d; dialMsg = ''; K.sound('key'); go('phone:keypad'); } }, h('b', {}, d), h('small', {}, l)))),
          h('div', { class: 'ph-keyrow' },
            h('span'),
            h('button', { class: 'ph-dial', type: 'button', 'aria-label': 'Call', onclick: dial }, icon('phone')),
            dialed ? h('button', { class: 'ph-del', type: 'button', 'aria-label': 'Delete', onclick: () => { dialed = dialed.slice(0, -1); dialMsg = ''; go('phone:keypad'); } }, icon('del')) : h('span')))));
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
      else K.audio.speak('mwalimu', r.line, { now: true, tag: 'phone' }).then(ok => { if (call !== live || call.phase !== 'live') return; if (ok) timers.push(setTimeout(hangUp, 700)); else readTime(); });
      tick();
    }
    function tick() {
      if (!call || call.phase !== 'live') return;
      const t = body.querySelector('.ph-call-status');
      if (t) { const s = Math.floor((Date.now() - call.started) / 1000); t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
      timers.push(setTimeout(tick, 500));
    }
    function hangUp() {
      clearTimers(); K.audio.stopVoice('phone'); speaker(false);
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
          h('button', { class: `ph-cbtn ${call.muted ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(call.muted), onclick: () => { call.muted = !call.muted; if (call.muted && call.phase === 'live') { K.audio.stopVoice('phone'); const live = call; timers.push(setTimeout(() => call === live && call.phase === 'live' && hangUp(), 2500)); } entry.rebuild(); } }, icon('mute'), 'mute'),
          h('button', { class: `ph-cbtn ${call.speaker ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(call.speaker), onclick: () => { call.speaker = !call.speaker; speaker(call.speaker); entry.rebuild(); } }, icon('speaker'), 'speaker'),
          h('button', { class: 'ph-cbtn', type: 'button', disabled: true }, icon('keypad'), 'keypad')) : null,
        c ? h('button', { class: 'ph-hangup', type: 'button', 'aria-label': 'End call', onclick: hangUp }, icon('phone'))
          : h('div', { class: 'ph-after' },
            h('button', { class: 'ph-cbtn', type: 'button', onclick: () => K.audio.speak('mwalimu', r.line, { now: true, tag: 'phone' }) }, icon('play'), 'play again'),
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
      return appFrame('Messages', ['Home', 'home'], h('div', { class: 'ph-list' },
        senders.length ? senders.map(s => {
          const ms = texts.filter(m => m.from === s), last = ms[ms.length - 1], un = ms.filter(m => !m.read).length;
          return h('button', { class: 'ph-row', type: 'button', onclick: () => go(`thread:${s}`) },
            h('span', { class: 'ph-avatar ph-avatar--init', 'aria-hidden': 'true' }, s.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(-2).map(w => w[0]).join('')),
            h('span', { class: 'ph-row-t' }, h('b', {}, s), h('small', {}, cleanText(s, last.line))),
            un ? h('span', { class: 'ph-dot', 'aria-label': `${un} unread` }) : null);
        }) : h('p', { class: 'ph-foot' }, 'No messages yet. Halima texts after she reads a sheet.')));
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
      return appFrame('Voice-notes', ['Home', 'home'], h('div', { class: 'ph-list' },
        ns.length ? ns.slice(0, 60).map(m => {
          const secs = Math.max(2, Math.round(m.line.split(/\s+/).length / 2.6));
          let seed = 0; for (const ch of m.line) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
          const bars = Array.from({ length: 28 }, (_, i) => { seed = (seed * 1103515245 + 12345) >>> 0; return 25 + (seed % 75) * Math.sin((i + 1) / 29 * Math.PI); });
          const wave = h('span', { class: 'ph-wave', 'aria-hidden': 'true' }, bars.map(v => h('i', { style: { height: `${Math.max(12, v)}%` } })));
          return h('div', { class: 'ph-vn' },
            h('button', { class: 'ph-vn-play', type: 'button', 'aria-label': 'Play voice-note', html: '', onclick: async e => {
              const btn = e.currentTarget; btn.classList.add('is-playing'); wave.classList.add('is-playing');
              const ok = await K.audio.speak('mwalimu', m.line, { now: true, tag: 'phone' });
              if (!ok && !K.audio.hasVoice('mwalimu', m.line)) { const t = btn.parentElement.querySelector('.ph-vn-len'); if (t) t.textContent = 'not recorded yet'; }
              btn.classList.remove('is-playing'); wave.classList.remove('is-playing');
            } }, icon('play')),
            wave, h('span', { class: 'ph-vn-len' }, `0:${String(secs).padStart(2, '0')}`),
            h('p', { class: 'ph-vn-text' }, m.line), h('small', { class: 'ph-vn-meta' }, m.case ? `Case ${pad3(m.case)}` : ''));
        }) : h('p', { class: 'ph-foot' }, 'No voice-notes yet.')));
    }

    // ── Contacts: everyone met in this case, their job and what they have claimed ─────────────────────────
    function newPeople() { return run.people().filter(p => !p.statementOnly && run.canInterview(p.id) && !run.talked.has(p.id)); }
    function portrait(p, cls = '') {
      const ini = p.name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('');
      if (!p.image) return h('span', { class: `ph-avatar ph-avatar--init ${cls}`, 'aria-hidden': 'true' }, ini);
      const im = h('img', { src: imgPath(run.n, p.id), alt: '', loading: 'lazy', draggable: 'false' });
      const w = h('span', { class: `ph-avatar ${cls}`, 'aria-hidden': 'true' }, im);
      im.addEventListener('error', () => { im.remove(); w.classList.add('ph-avatar--init'); w.textContent = ini; });
      return w;
    }
    function contactsApp() {
      const ps = run.people().filter(p => !p.statementOnly);
      const fresh = new Set(newPeople().map(p => p.id));
      return appFrame('Contacts', ['Home', 'home'], h('div', { class: 'ph-list' },
        h('p', { class: 'ph-sub' }, `${ps.length} ${ps.length === 1 ? 'person' : 'people'} in case ${pad3(run.n)}`),
        ps.length ? ps.map(p => {
          const claims = run.claimsOf(p.id).map(f => run.byId.get(f).text);
          return h('button', { class: 'ph-contact', type: 'button', 'data-pid': p.id, onclick: () => ctx.openPerson(p.id) },
            portrait(p), h('span', { class: 'ph-row-t' }, h('b', {}, p.name, fresh.has(p.id) ? h('span', { class: 'ph-dot', 'aria-label': 'not yet interviewed' }) : null),
              h('small', {}, p.role === 'victim' ? `${p.age} · deceased` : p.occupation)),
            claims.length ? h('ul', { class: 'ph-claims' }, claims.map(t => h('li', {}, t)))
              : h('p', { class: 'ph-claims ph-claims--none' }, p.role === 'victim' ? 'The victim.' : run.talked.has(p.id) ? 'No claims yet.' : 'Not interviewed yet.'));
        }) : h('p', { class: 'ph-foot' }, 'Nobody yet.')));
    }

    // ── Photos: every place and exhibit photo found so far, as a camera roll ──────────────────────────────
    function allPhotos() {
      const out = [];
      for (const l of run.locations()) if (l.image && run.visited.has(l.id)) out.push({ key: l.id, id: l.id, kind: 'place', title: l.name.split(' (')[0], src: imgPath(run.n, l.id) });
      for (const id of run.kE) { const e = run.byId.get(id); if (e?.image) out.push({ key: id, id, kind: 'exhibit', title: e.title, src: imgPath(run.n, id) }); }
      return out;
    }
    function photosApp() {
      const ps = allPhotos();
      const fresh = new Set(ps.filter(x => !seen.photos.includes(x.key)).map(x => x.key));
      seen.photos = [...new Set([...seen.photos, ...ps.map(x => x.key)])]; ctx.save();
      return appFrame('Photos', ['Home', 'home'],
        h('p', { class: 'ph-sub' }, ps.length ? `${ps.length} photo${ps.length > 1 ? 's' : ''} · tap one to look closer` : ''),
        ps.length ? h('div', { class: 'ph-roll' }, ps.map(x => h('button', { class: `ph-thumb ${fresh.has(x.key) ? 'is-fresh' : ''}`, type: 'button', 'data-key': x.key, 'aria-label': `${x.kind === 'place' ? 'Place' : 'Exhibit'}: ${x.title}`,
          onclick: () => { photoAt = x; go('photo'); } }, h('img', { src: x.src, alt: '', loading: 'lazy', draggable: 'false', onerror: e => e.target.replaceWith(h('span', { class: 'ph-thumb-x' }, x.title)) }))))
          : h('p', { class: 'ph-foot' }, 'No photos yet. Visit a place or find an exhibit with a photo.'));
    }
    function photoView() {
      const x = photoAt; if (!x) return photosApp();
      const open = () => { if (x.kind === 'place') ctx.openLocation(x.id); else ctx.openEvidence(x.id); };
      const img = h('img', { src: x.src, alt: x.title, draggable: 'false' });
      const stage = h('div', { class: 'cam-stage' }, img);
      const frame = h('div', { class: `ph-full cam ${K.reduced() ? '' : 'is-zooming'}` }, stage);
      // The camera: pinch, double-tap or drag to look closer (camera.js); one tap opens the exhibit or the place.
      requestAnimationFrame(() => { createCamera(frame, stage, { reduced: K.reduced, zMax: 4, onTapEmpty: open }); frame.classList.remove('is-zooming'); });
      return h('div', { class: 'ph-app-view ph-photo' },
        h('div', { class: 'ph-bar' }, h('button', { class: 'ph-back', type: 'button', onclick: () => go('photos') }, '‹ Photos'), h('h2', { class: 'ph-h ph-h--small' }, x.title)),
        h('div', { class: 'ph-photo-body' }, frame,
          h('p', { class: 'ph-foot' }, 'Pinch or double-tap to zoom. Tap the photo to open it.'),
          h('button', { class: 'ph-act', type: 'button', onclick: open }, x.kind === 'place' ? `Go to ${x.title}` : `Open the exhibit: ${x.title}`)));
    }

    // ── Map: the case's places on a hand-drawn sketch of the area (not to scale) ──────────────────────────
    function mapApp() {
      const ls = run.locations();
      const seed = str => { let v = 2166136261; for (const ch of str) v = Math.imul(v ^ ch.charCodeAt(0), 16777619) >>> 0; return v; };
      const n = ls.length, W = 320, H = 400;
      // Places sit around a loose ring, nudged by their names, so each case's sketch is its own and never changes.
      const pts = ls.map((l, i) => {
        const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + ((seed(l.id) % 100) / 100 - 0.5) * 0.6;
        const r = n === 1 ? 0 : 0.62 + ((seed(l.id + 'r') % 100) / 100) * 0.22;
        return { l, x: W / 2 + Math.cos(a) * r * (W / 2 - 46), y: H / 2 + Math.sin(a) * r * (H / 2 - 60) };
      });
      const wob = (a, b, k) => { const mx = (a.x + b.x) / 2 + ((seed(k) % 40) - 20), my = (a.y + b.y) / 2 + ((seed(k + 'y') % 40) - 20); return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`; };
      const roads = pts.map((p, i) => i ? wob(pts[i - 1], p, p.l.id) : '').filter(Boolean);
      if (n > 2) roads.push(wob(pts[n - 1], pts[0], 'loop'));
      const main = `M-10,${H * 0.58} C${W * 0.3},${H * 0.5} ${W * 0.6},${H * 0.68} ${W + 10},${H * 0.55}`;
      const svg = `<svg viewBox="0 0 ${W} ${H}" class="ph-map-svg" aria-hidden="true">
        <defs><filter id="ph-rough"><feTurbulence baseFrequency="0.04" numOctaves="2" seed="${run.n}"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter></defs>
        <g filter="url(#ph-rough)" fill="none" stroke-linecap="round">
          <path d="${main}" stroke="rgba(244,221,98,.32)" stroke-width="9"/>
          ${roads.map(d => `<path d="${d}" stroke="rgba(244,244,246,.34)" stroke-width="2.4" stroke-dasharray="1 0"/>`).join('')}
        </g>
        <g class="ph-map-n" transform="translate(${W - 30},34)"><path d="M0,-14 L5,4 L0,0 L-5,4Z" fill="rgba(244,244,246,.7)"/><text y="16" text-anchor="middle">N</text></g>
      </svg>`;
      const map = h('div', { class: 'ph-map' }, h('div', { html: svg }),
        pts.map(({ l, x, y }) => { const v = run.visited.has(l.id); return h('button', { class: `ph-pinmap ${v ? 'is-visited' : ''}`, type: 'button', 'data-lid': l.id, style: { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` },
          'aria-label': `${l.name}${v ? ', visited' : ', not visited yet'}`, onclick: () => ctx.openLocation(l.id) },
          h('span', { class: 'ph-pinmap-dot', 'aria-hidden': 'true' }, v ? icon('tick') : null), h('span', { class: 'ph-pinmap-l' }, l.name.split(' (')[0])); }),
        h('span', { class: 'ph-map-scale' }, 'sketch · not to scale'));
      return appFrame('Map', ['Home', 'home'], h('p', { class: 'ph-sub' }, `${ctx.regionName || 'The area'} · ${ls.filter(l => run.visited.has(l.id)).length} of ${n} visited`), map,
        h('p', { class: 'ph-foot' }, 'Tap a place to go there.'));
    }

    // ── Calendar: the case timeline as a day view (the same rows as the notebook's Time tab) ────────────
    function calendarApp() {
      const rows = timeRows(run);
      if (!rows.length) return appFrame('Calendar', ['Home', 'home'], h('p', { class: 'ph-foot' }, 'Nothing on the calendar yet. Facts that put someone somewhere at a time show up here.'));
      const lo = Math.floor(Math.min(...rows.map(r => r.a ?? r.b)) / 60) * 60, hi = Math.ceil(Math.max(...rows.map(r => (r.b ?? r.a) + 1)) / 60) * 60;
      const PX = 64 / 60;                                               // 64 px per hour
      const hm = m => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
      // Lanes: an event goes in the first lane free at its start, so overlapping times sit side by side.
      const lanes = [];
      const evs = rows.map(r => {
        const a = r.a ?? r.b, b = Math.max((r.b ?? r.a), a + 20);
        let lane = lanes.findIndex(end => end <= a); if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = b + 4;
        return { r, a, b, lane };
      });
      const L = Math.max(1, lanes.length);
      const hours = []; for (let m = lo; m <= hi; m += 60) hours.push(m);
      const label = r => [r.person ? run.byId.get(r.person)?.name : '', r.place ? (run.byId.get(r.place)?.name || '').split(' (')[0] : ''].filter(Boolean).join(' · ');
      const dayBreak = hours.find(m => m % 1440 === 0 && m > lo);
      return appFrame('Calendar', ['Home', 'home'],
        h('p', { class: 'ph-sub' }, `${run.c.meta.date || run.c.ob.date || ''}${dayBreak ? ' and the night after' : ''} · ${rows.length} times`),
        h('div', { class: 'ph-day', style: { height: `${(hi - lo) * PX + 16}px` } },
          hours.map(m => h('div', { class: `ph-hour ${m % 1440 === 0 && m > lo ? 'is-midnight' : ''}`, style: { top: `${(m - lo) * PX}px` } }, h('span', {}, hm(m)))),
          evs.map(({ r, a, b, lane }) => h('div', { class: `ph-ev ${r.a == null || r.b == null ? 'is-open' : ''}`, style: { top: `${(a - lo) * PX}px`, height: `${Math.max(22, (b - a) * PX - 2)}px`, left: `calc(52px + (100% - 56px) * ${lane / L})`, width: `calc((100% - 56px) / ${L} - 3px)` } },
            h('b', {}, `${r.from || '…'}–${r.to || '…'}`, label(r) ? ` ${label(r)}` : ''), h('span', {}, r.text)))));
    }

    // ── Recorder: replay any line heard in this case, by person ───────────────────────────────────────────
    function heardBy() {
      const out = new Map();
      const add = (id, name, line) => { if (!out.has(id)) out.set(id, { name, lines: [] }); out.get(id).lines.push(line); };
      for (const p of run.people()) {
        const it = run.interrogation.get(p.id);
        if (!it || !run.talked.has(p.id)) continue;
        if (it.intro) add(p.id, p.name, { text: it.intro, label: 'First words', play: () => K.audio.character(run.n, p.id, 'intro', it.intro, { now: true, tag: 'phone' }), has: K.audio.hasCharacter(run.n, p.id, 'intro', it.intro) });
        for (const k of run.asked) {
          const [pid, about] = k.split('|'); if (pid !== p.id) continue;
          const t = (it.topics || []).find(x => x.about === about);
          const text = t ? t.reply : genericReply(pid, about);
          const what = run.byId.get(about); const topic = what ? (what.name || what.title || (what.text || '').slice(0, 40)) : about;
          add(p.id, p.name, { text, label: `About ${topic}`, play: () => K.audio.character(run.n, p.id, 'reply', text, { now: true, tag: 'phone', generic: !t }), has: t ? K.audio.hasCharacter(run.n, p.id, 'reply', text) : true });
        }
      }
      for (const m of pr.messages.filter(m => m.kind === 'voice' && m.case === run.n)) add('mwalimu', 'Mwalimu', { text: m.line, label: 'Voice-note', play: () => K.audio.speak('mwalimu', m.line, { now: true, tag: 'phone' }), has: K.audio.hasVoice('mwalimu', m.line) });
      for (const c of pr.calls.filter(c => c.case === run.n)) add('mwalimu', 'Mwalimu', { text: c.line, label: `Call · ${TIER[c.tier]}`, play: () => K.audio.speak('mwalimu', c.line, { now: true, tag: 'phone' }), has: K.audio.hasVoice('mwalimu', c.line) });
      return out;
    }
    function recorderApp() {
      const by = heardBy();
      return appFrame('Recorder', ['Home', 'home'], h('div', { class: 'ph-list' },
        h('p', { class: 'ph-sub' }, `Everything you've heard in case ${pad3(run.n)}`),
        by.size ? [...by].map(([id, g]) => h('button', { class: 'ph-row', type: 'button', 'data-rec': id, onclick: () => go(`rec:${id}`) },
          id === 'mwalimu' ? avatar() : portrait(run.byId.get(id)), h('span', { class: 'ph-row-t' }, h('b', {}, g.name), h('small', {}, `${g.lines.length} recording${g.lines.length > 1 ? 's' : ''}`)), h('span', { class: 'ph-row-i' }, icon('mic'))))
          : h('p', { class: 'ph-foot' }, 'Nothing recorded yet. Interviews and Mwalimu\'s notes are kept here.')));
    }
    function recorderPerson(id) {
      const g = heardBy().get(id);
      if (!g) return recorderApp();
      return appFrame(g.name, ['Recorder', 'recorder'], h('div', { class: 'ph-list' }, g.lines.map(l => {
        const btn = h('button', { class: 'ph-vn-play', type: 'button', 'aria-label': `Play: ${l.label}`, disabled: !l.has, onclick: async () => {
          btn.classList.add('is-playing'); await l.play(); btn.classList.remove('is-playing'); } }, icon('play'));
        return h('div', { class: 'ph-vn ph-rec' }, btn, h('b', { class: 'ph-rec-l' }, l.label), h('span', { class: 'ph-vn-len' }, l.has ? '' : 'text only'), h('p', { class: 'ph-vn-text' }, l.text));
      })));
    }
  } });
}

// Scale a fixed screen (lock, home, keypad, help pick, call) to fit its box, never scroll it. CSS zoom keeps
// layout and taps exact (unlike a transform). Below 60% the text would be too small: it stops there and the
// box scrolls instead, which only happens with the largest text size on the smallest phones.
export function fitPhone(el) {
  const host = el.parentElement; if (!host || !el.isConnected) return;
  el.style.zoom = '1'; el.style.height = 'auto'; el.style.flex = 'none';
  const need = el.scrollHeight, avail = host.clientHeight;
  if (!need || !avail) { el.style.height = ''; el.style.flex = ''; return; }
  const k = Math.max(0.6, Math.min(1, avail / need));
  el.style.zoom = String(+k.toFixed(3));
  el.style.height = `${avail / k}px`;
  el.dataset.fit = k.toFixed(2);
  host.classList.toggle('is-tight', k <= 0.6 && need * k > avail + 1);
}
