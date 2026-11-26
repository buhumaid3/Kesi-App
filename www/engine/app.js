// Kesi: Kenya Case Files — the game shell. Region 1 vertical slice (cases 1–10).
// Screens: prologue → cabinet → case desk (folder + dock) → verdict. Everything above the desk opens as a
// sheet of paper: a place, a person, an exhibit, the notebook, the board, the phone, the charge sheet.
import { CaseRun, groupFacts, timeRows, genericReply, fmtHours } from './state.js';
import { layoutSites, byWords, renderMap, LEGEND } from './sitemap.js';
import { load, persist, wipe, defaultSave, restore } from './store.js';
import { appReady, haptic, isNative } from './native.js';
import { createLaunch } from './launch.js';
import { h, $, $$, put, clearNotices, ask, openSheet, closeSheet, closeAllSheets, rebuildSheets, sheetOpen, voiceNote, toast, popover, typewrite, makeSound, stamp, reducedMotion } from './ui.js';
import { esc, pad3, tilt, makeGlossary, shortFact } from './text.js';
import { renderEvidence, photo, zoomPhoto, imgPath } from './docs.js';
import { createAudio } from './audio.js';
import { createMotion } from './motion.js';
import { regionArt } from './regionart.js';
import { attachDepth, enableTilt } from './depth.js';
import { openPhoneApp, cleanText } from './phone.js';
import { createCamera } from './camera.js';

const SLICE_LAST = 100;                      // the whole campaign
const K = { campaign: null, save: load(), run: null, gloss: null, cases: new Map() };
K.audio = createAudio(() => K.save.settings);
const HAPTIC = { stamp: 'medium', accepted: 'success', returned: 'warning', pin: 'light', closed: 'heavy', thud: 'light', hit: 'medium', drawer: 'light' };
K.sound = kind => { K.audio.sfx(kind); if (HAPTIC[kind]) haptic(HAPTIC[kind], K.save.settings.haptics !== false); };
K.reduced = () => reducedMotion(K.save.settings);
K.motion = createMotion(K.reduced);
window.KESI = K;                             // for the playtest console and automated tests

// ── Boot ─────────────────────────────────────────────────────────────────────────────────────────────
async function boot() {
  if (await restore()) K.save = load();          // iOS app: the save kept in Preferences
  applySettings();
  K.motesToggle = K.motion.motes();
  [K.campaign, K.coach] = await Promise.all([fetchJSON('cases/_campaign.json'), fetchJSON('cases/_coach.json').catch(() => ({ beats: {}, core: {} }))]);
  document.addEventListener('click', e => {
    const t = e.target.closest('.term');
    if (t) { e.preventDefault(); e.stopPropagation(); popover(t, t.textContent, K.gloss?.defs.get(t.dataset.term) || (K.campaign.lexicon.includes(t.dataset.term) ? '' : '')); }
  });
  const q = new URLSearchParams(location.search);
  if (q.has('reset')) { wipe(); K.save = defaultSave(); }
  if (q.has('playtest')) { K.save.settings.playtest = true; K.save.progress.prologue = true; }
  if (q.get('case')) return openCase(+q.get('case'));
  // Automated test browsers skip it (they test it on purpose with ?title, see tests/ui-title.mjs).
  const auto = navigator.webdriver && !q.has('title');
  if (K.save.settings.titleSeq !== false && !auto && !q.has('notitle') && !q.has('playtest')) await playTitle();
  if (!K.save.progress.prologue) return showPrologue();
  // Quit anywhere, come back to exactly that place (§2.1).
  const lc = K.save.progress.lastCase;
  if (lc && K.save.cases[lc] && !K.save.cases[lc].solved && lc <= unlockedTo()) return openCase(lc);
  showCabinet();
}
// The launch sequence (launch.js, "Lamp on"): in full the first time (6.4 s), 2.5 s after, a tap skips it, a still frame with Reduce
// Motion. The app's splash is the sequence's first frame, so it is hidden as soon as the sequence is on screen.
// Sound starts with it where the device allows (the iOS app does); in a browser it stays silent until a tap.
function playTitle() {
  const short = !!K.save.progress.titleSeen;
  return new Promise(resolve => {
    createLaunch(document.body, {
      short, reduced: K.reduced(),
      sound: kind => K.sound(kind),
      rain: () => K.audio.rain(),
      speak: (sp, line) => K.audio.speak(sp, line, { tag: 'title' }),
      onDone: skipped => { if (skipped) K.audio.stopVoice('title'); K.save.progress.titleSeen = true; save(); resolve(); },
    });
    appReady();
  });
}
async function fetchJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }
async function getCase(n) {
  if (!K.cases.has(n)) K.cases.set(n, await fetchJSON(`cases/case-${pad3(n)}.json`));
  return K.cases.get(n);
}
function save(now = false) {
  if (K.run) K.save.cases[K.run.n] = K.run.toJSON();
  persist(K.save, now);
}
addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

function applySettings() {
  const s = K.save.settings, root = document.documentElement;
  K.motesToggle?.();
  root.style.setProperty('--scale', s.scale);
  root.dataset.plain = s.plain ? '1' : '0';
  root.dataset.motion = K.reduced() ? 'reduce' : 'full';
}
function screen(el, cls) {
  const sc = $('#screen');
  closeAllSheets(); clearNotices();
  sc.className = `${cls || ''} ${K.reduced() ? '' : 'is-entering'}`;
  document.body.dataset.screen = cls || '';
  sc.replaceChildren(el);
  setTimeout(() => sc.classList.remove('is-entering'), 500);
  sc.scrollTop = 0; scrollTo(0, 0);
}
const unlockedTo = () => K.save.settings.playtest ? SLICE_LAST : Math.min(SLICE_LAST, K.save.progress.unlockedTo);
const regionOf = n => K.campaign.regions.find(r => n >= r.cases[0] && n <= r.cases[1]);
const stars = (k, of = 3) => h('span', { class: 'stars', 'aria-label': `${k} of ${of} stars` }, '★'.repeat(k), h('span', { class: 'stars-off', 'aria-hidden': 'true' }, '☆'.repeat(of - k)));

// ── Prologue (campaign.prologue, under 3 minutes, skippable) ───────────────────────────────────────────
function showPrologue() {
  const P = K.campaign.prologue.beats;
  const get = id => P.find(b => b.id === id);
  const stage = h('div', { class: 'prologue' });
  const skip = h('button', { class: 'link skip', type: 'button', onclick: finish }, 'Skip');
  screen(h('div', { class: 'prologue-wrap' }, stage, skip), 'scr-prologue');
  K.audio.music('cabinet');
  const say = (speaker, line) => { K.audio.speak('mwalimu', line, { tag: 'prologue' }); return h('p', { class: 'subtitle' }, h('b', {}, speaker), ' ', line); };
  const next = (label, fn) => h('button', { class: 'card-btn', type: 'button', onclick: fn }, label, h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
  let step = 0;
  const beats = [
    () => { stage.className = 'prologue is-dark'; K.sound('key'); setTimeout(() => { stage.classList.add('lamp-on'); K.sound('stamp'); }, K.reduced() ? 0 : 500);
      stage.replaceChildren(h('div', { class: 'pro-desk', 'aria-hidden': 'true' }, h('span', { class: 'pro-blotter' }), h('span', { class: 'pro-phone' }), h('span', { class: 'pro-tray' })));
      setTimeout(advance, K.reduced() ? 300 : 1500); },
    () => { const p = h('p', { class: 'pro-type' }); put(stage, h('div', { class: 'pro-page' }, p)); typewrite(p, get('pr2').text, { reduced: K.reduced(), sound: K.sound }).then(() => setTimeout(advance, 600)); },
    () => { put(stage, h('div', { class: 'pro-folder', 'aria-hidden': 'true' }, h('span', { class: 'pro-tab' }, 'NGARA'))); K.sound('paper');
      put(stage, say('Mwalimu:', get('pr3').voice.line), next('Continue', advance)); },
    () => { $$('.subtitle, .card-btn', stage).forEach(x => x.remove()); put(stage, say('Mwalimu:', get('pr4').voice.line),
      h('div', { class: 'pro-choice' }, next('Open the folder', () => { step = beats.length - 2; advance(); }), h('button', { class: 'card-btn card-btn--ghost', type: 'button', onclick: advance }, 'Open the desk drawer'))); },
    () => { $$('.subtitle, .pro-choice', stage).forEach(x => x.remove());
      put(stage, h('div', { class: 'old-folder', style: { '--tilt': '-2deg' } },
        h('span', { class: 'old-tab' }, 'Mwenda, J.'), h('span', { class: 'stamp-closed' }, 'CLOSED'),
        h('div', { class: 'ledger-strip' }, h('span', { class: 'ledger-t' }, '12 yrs'), h('p', {}, get('pr6').text)),
        h('p', { class: 'nfa' }, 'Investigation note: NFA.')),
        next('Close the drawer', advance)); K.sound('paper'); K.save.progress.flags.drawerRead = true; },
    () => { $$('.old-folder, .card-btn', stage).forEach(x => x.remove()); put(stage, say('Mwalimu:', get('pr7').voice.line), next('Open case 001', finish)); },
  ];
  function advance() { if (step < beats.length) beats[step++](); }
  function finish() { K.audio.stopVoice('prologue'); K.save.progress.prologue = true; save(true); openCase(1); }
  advance();
}

// ── The cabinet (home): one drawer per region, a folder per case ──────────────────────────────────────
function showCabinet() {
  K.run = null; K.gloss = null;
  const pr = K.save.progress;
  const last = pr.lastCase && !pr.solved[pr.lastCase] && pr.lastCase <= unlockedTo() ? pr.lastCase : null;
  const next = Math.min(unlockedTo(), SLICE_LAST);
  const regions = K.campaign.regions;
  const el = h('div', { class: 'cabinet' },
    h('header', { class: 'cab-head' },
      h('div', { class: 'title-board', 'data-region': '1' }, h('span', { class: 'sign' }, 'Kesi'), h('small', {}, 'Kenya Case Files · ', K.campaign.unit.station)),
      h('button', { class: 'icon-btn', type: 'button', onclick: showSettings, 'aria-label': 'Settings' }, h('span', { class: 'clipboard-ic', 'aria-hidden': 'true' }), 'Settings')),
    last || !pr.solved[next] ? h('button', { class: 'card-btn card-btn--big', type: 'button', onclick: () => openCase(last || firstOpen()) },
      h('span', {}, last ? 'CONTINUE: ' : 'OPEN: ', h('b', {}, `CASE ${pad3(last || firstOpen())}`), K.cases.get(last || firstOpen()) ? ` · ${K.cases.get(last || firstOpen()).meta.title}` : ''), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')) : null,
    // One drawer per region in this build. The drawer with the case you're on is open; the others fold shut.
    regions.filter(r => r.cases[0] <= SLICE_LAST).map(r => {
      const [a, b] = r.cases, cur = last || firstOpen(), count = Object.keys(pr.solved).filter(n => +n >= a && +n <= b).length;
      const open = cur >= a && cur <= b, reached = a <= unlockedTo();
      return h('details', { class: 'drawer', 'data-region': String(r.number), open: open ? '' : null },
        h('summary', { class: 'drawer-label drawer-front', 'aria-label': `Region ${r.number}, ${r.name}, ${reached ? `${count} of ${b - a + 1} closed` : 'sealed'}` },
          h('span', { class: 'drawer-art', 'aria-hidden': 'true', html: regionArt(r, 'sign', { band: true }) }),
          h('span', { class: 'drawer-holder' },
            h('span', { class: 'drawer-no' }, String(r.number).padStart(2, '0')), h('span', { class: 'drawer-name' }, r.name),
            h('span', { class: 'drawer-count' }, reached ? `${count}/${b - a + 1} closed` : `Opens after case ${pad3(a - 1)}`)),
          h('span', { class: 'drawer-pull', 'aria-hidden': 'true' })),
        h('div', { class: 'folders' }, Array.from({ length: b - a + 1 }, (_, i) => folderCard(a + i))));
    }),
    h('section', { class: 'desk-shelf', 'aria-label': 'Your desk' },
      h('h2', { class: 'shelf-h' }, 'On the desk'),
      h('div', { class: 'shelf' },
        pr.flags.patternFile ? h('button', { class: 'shelf-item shelf-item--cork', type: 'button', onclick: showPatternFile }, h('b', {}, 'Pattern File'), h('span', {}, `${pr.pattern.length} pins`)) : null,
        pr.collectibles.map(c => { const col = K.campaign.collectibles.find(x => x.id === c); return h('div', { class: 'shelf-item shelf-item--object' }, h('b', {}, col?.name), h('span', {}, col?.desc)); }),
        h('button', { class: 'shelf-item shelf-item--drawer', type: 'button', onclick: showOldFolder }, h('b', {}, 'The desk drawer'), h('span', {}, 'An old folder: Mwenda, J.')),
        pr.desk.length ? h('ul', { class: 'desk-notes' }, pr.desk.map(d => h('li', {}, d))) : h('p', { class: 'desk-empty' }, 'A wooden desk, a green blotter, a desk phone, a wire in-tray.'))),
    h('section', { class: 'drawers-locked', 'aria-label': 'Later regions' },
      regions.filter(r => r.cases[0] > SLICE_LAST).map(r => h('div', { class: 'drawer drawer--shut', 'data-region': String(r.number) },
        h('div', { class: 'drawer-label' }, h('span', { class: 'drawer-no' }, String(r.number).padStart(2, '0')), h('span', { class: 'drawer-name' }, r.name), h('span', { class: 'drawer-count' }, 'Not in this build'))))),
    h('p', { class: 'fine' }, 'Every case in Kesi is fiction. Streets and slang are real; the crimes, people and companies are invented.'));
  screen(el, 'scr-cabinet');
  K.audio.music('cabinet');
  K.motion.deal(el, '.folder-card', { step: 45 });
  el.querySelectorAll('details.drawer').forEach(d => d.addEventListener('toggle', () => { if (d.open) { K.sound('drawer'); K.motion.play(d.querySelector('.folders'), 'drawer'); K.motion.stagger(d.querySelectorAll('.folder-card'), 'card', { step: 30, delay: 120 }); } }));
  if (!pr.regionCardSeen) { regionCard(1); pr.regionCardSeen = true; save(); }
}
function firstOpen() { for (let n = 1; n <= unlockedTo(); n++) if (!K.save.progress.solved[n]) return n; return 1; }
function folderCard(n) {
  const pr = K.save.progress, solved = pr.solved[n], open = n <= unlockedTo();
  const meta = K.cases.get(n)?.meta;
  const title = meta?.title || '';
  const btn = h('button', { class: `folder-card ${solved ? 'is-closed' : ''} ${open ? '' : 'is-locked'}`, type: 'button', disabled: !open, style: { '--tilt': `${tilt('f' + n, 1.2)}deg` },
    onclick: () => open && openCase(n), 'aria-label': open ? `Case ${pad3(n)}${title ? ', ' + title : ''}${solved ? `, closed, ${solved.stars} stars` : ''}` : `Case ${pad3(n)}, sealed until case ${pad3(n - 1)} is closed` },
    h('span', { class: 'folder-tab' }, meta?.folderTab || pad3(n)),
    h('span', { class: 'folder-no' }, `CASE ${pad3(n)}`),
    h('span', { class: 'folder-title' }, open ? title || '…' : 'Sealed'),
    solved ? h('span', { class: 'folder-stars' }, stars(solved.stars)) : null,
    solved ? h('span', { class: 'mini-stamp' }, 'CLOSED') : null);
  if (!meta && open) getCase(n).then(c => { btn.querySelector('.folder-tab').textContent = c.meta.folderTab; btn.querySelector('.folder-title').textContent = c.meta.title; }).catch(() => {});
  return btn;
}
function regionCard(num) {
  const r = K.campaign.regions[num - 1];
  // The region's key art (polish P2): the scene slides in, the name is painted on letter by letter.
  const card = h('div', { class: 'region-card-wrap', role: 'dialog', 'aria-label': `Region ${num}: ${r.name}, cases ${r.cases[0]} to ${r.cases[1]}, ${r.months}` },
    h('div', { class: 'region-art-card is-entering', 'data-region': String(num), html: regionArt(r, 'sign') }),
    h('p', { class: 'region-months' }, r.months),
    h('p', { class: 'tap-on' }, 'Tap to continue'));
  const close = () => { if (!card.isConnected) return; K.motion.play(card, 'paper', { dir: 'out' }).then(() => card.remove()); };
  card.addEventListener('click', close);
  document.body.append(card);
  K.sound('region');
  K.motion.play(card.querySelector('.region-art-card'), 'folder');
  setTimeout(close, 5200);
}
function showOldFolder() {
  const pr6 = K.campaign.prologue.beats.find(b => b.id === 'pr6');
  openSheet({ id: 'old', label: 'Old folder: Mwenda, J.', build(body) {
    put(body, h('div', { class: 'old-folder old-folder--sheet' }, h('span', { class: 'old-tab' }, 'Mwenda, J.'), h('span', { class: 'stamp-closed' }, 'CLOSED'),
      h('div', { class: 'ledger-strip' }, h('span', { class: 'ledger-t' }, '12 yrs'), h('p', {}, pr6.text)), h('p', { class: 'nfa' }, 'Investigation note: NFA.'),
      h('p', { class: 'hand' }, 'It is thin enough to feel.')));
  } });
}

// ── Opening a case ─────────────────────────────────────────────────────────────────────────────────────
async function openCase(n) {
  const c = await getCase(n);
  const saved = K.save.cases[n];
  const pins = new Set(K.save.progress.pattern);
  K.run = new CaseRun(c, saved && !saved.solved ? saved : saved?.solved ? saved : null, { patternPins: pins, clock: K.campaign.clock, regionRules: regionOf(n) });
  K.gloss = makeGlossary(c);
  K.save.progress.lastCase = n;
  const fresh = !saved;
  save();
  K.audio.music(c.meta.regionNumber);
  const reg = regionOf(n), seen = K.save.progress.regionsSeen = K.save.progress.regionsSeen || [1];
  if (reg && !seen.includes(reg.number)) { seen.push(reg.number); save(); regionCard(reg.number); await new Promise(r => setTimeout(r, K.reduced() ? 600 : 2400)); }
  const mode = K.save.settings.intros;
  if (mode === 'always' || (mode === 'first' && fresh)) await caseIntro(c);
  showDesk(true);
  if (!K.run.s.solved) {
    const line = K.run.tutorial('caseOpen'); if (line) setTimeout(() => mwalimu(line), 900);
    else setTimeout(() => coach('caseOpen'), 900);
    // Resume where the player left off (§2.1).
    const v = K.run.s.view;
    if (v) setTimeout(() => reopenView(v), 50);
  }
}
function reopenView(v) {
  if (v.sheet === 'location') openLocation(v.id);
  else if (v.sheet === 'person') openPerson(v.id);
  else if (v.sheet === 'evidence') openEvidence(v.id);
  else if (v.sheet === 'notebook') openNotebook(v.tab);
  else if (v.sheet === 'board') openBoard();
  else if (v.sheet === 'phone') openPhone();
  else if (v.sheet === 'charge') openCharge();
  else if (v.sheet === 'map') openMapSheet();
}
const setView = v => { if (K.run) { K.run.s.view = v; save(); } };
const clearView = () => setView(null);

let noteSeq = 0;
function mwalimu(line, opts = {}) {
  K.sound('phone');
  const msg = { from: 'Mwalimu', line, kind: 'voice', case: K.run?.n, at: Date.now() };
  K.save.progress.messages.push(msg);
  // Each note's line has its own tag: dismissing the note stops that line only, never someone else's.
  const tag = `note${++noteSeq}`;
  voiceNote({ from: 'Mwalimu', line, kind: 'voice', play: () => K.audio.speak('mwalimu', line, { tag }), stop: () => K.audio.stopVoice(tag), ...opts });
  save();
}

// ── Mwalimu's first-time tips (cases/_coach.json): one per interface beat, each fired once ─────────────
function coach(trigger, extra = {}) {
  const run = K.run; if (!run || run.s.solved || !K.coach) return;
  const f = K.save.progress.flags; f.coach = f.coach || {}; f.coachCore = f.coachCore || {};
  for (const beat of run.c.ui?.beats || []) {
    const d = K.coach.beats?.[beat];
    if (!d || d.trigger !== trigger || f.coach[beat]) continue;
    if (d.renders && !d.renders.includes(extra.render)) continue;
    f.coach[beat] = run.n;
    return setTimeout(() => mwalimu(d.line), 500);
  }
  // Players who start somewhere other than case 1 (playtest mode) still get the four basics once.
  const core = K.coach.core?.[trigger];
  if (core && run.n !== 1 && !K.save.progress.solved[1] && !f.coachCore[trigger]) { f.coachCore[trigger] = true; setTimeout(() => mwalimu(core), 500); }
}

// ── The case intro: a few seconds of title sequence, skippable with one tap ───────────────────────────
function caseIntro(c) {
  return new Promise(resolve => {
    const m = c.meta, loc = c.locations.find(l => l.kind === 'scene') || c.locations[0];
    const reduced = K.reduced();
    const img = h('img', { src: imgPath(m.number, loc.id), alt: '', draggable: 'false', 'data-depth': '1' });
    img.addEventListener('error', () => img.remove());
    const typed = h('p', { class: 'ci-ob' });
    const stampEl = h('span', { class: 'st st--ob ci-stamp' }, c.ob.number);
    const el = h('div', { class: `case-intro ${reduced ? 'is-still' : ''}`, 'data-region': String(m.regionNumber), role: 'dialog', 'aria-label': `Case ${pad3(m.number)}: ${m.title}` },
      h('div', { class: 'ci-photo', 'aria-hidden': 'true' }, img),
      h('div', { class: 'ci-veil', 'aria-hidden': 'true' }),
      h('div', { class: 'ci-top' }, h('span', { class: 'ci-tab' }, m.folderTab), h('span', { class: 'ci-no' }, `CASE ${pad3(m.number)} · ${regionOf(m.number).name.toUpperCase()}`)),
      h('h1', { class: 'ci-title sign' }, m.title),
      h('div', { class: 'ci-foot' }, h('p', { class: 'ci-place' }, `${loc.name.split(' (')[0]} · ${c.ob.date || m.date || ''}`), typed, stampEl),
      h('button', { class: 'link ci-skip', type: 'button' }, 'Skip'));
    document.body.append(el);
    attachDepth(el, K);
    let done = false;
    const finish = () => { if (done) return; done = true; el.classList.add('is-leaving'); setTimeout(() => { el.remove(); resolve(); }, reduced ? 0 : 320); };
    el.addEventListener('click', finish);
    K.sound('intro');
    const line = `${c.ob.time} · ${c.ob.reportedBy.split(',')[0]} reports`;
    setTimeout(() => typewrite(typed, line, { reduced, sound: K.sound }).then(() => setTimeout(() => !done && stamp(stampEl, K.sound, reduced), 250)), reduced ? 0 : 1300);
    setTimeout(finish, reduced ? 2600 : 5600);
  });
}

// ── The case desk: the folder, and the objects along the desk edge ────────────────────────────────────
function deskNode({ opening = false, typing = false } = {}) {
  const run = K.run, c = run.c, m = c.meta;
  const ledgerP = h('p', { class: 'ob-text' });
  if (!typing) ledgerP.innerHTML = K.gloss.rich(c.ob.text, { inline: K.save.settings.inlineGloss });
  const folder = h('article', { class: `folder ${opening ? 'is-opening' : ''}`, 'data-region': String(m.regionNumber) },
    h('span', { class: 'folder-tab-big' }, m.folderTab),
    h('span', { class: 'received', 'aria-hidden': 'true' }, 'NAIROBI', h('br'), 'SCU', h('br'), (c.ob.date || '').split(' ').slice(1).join(' ').slice(0, 6).toUpperCase()),
    h('div', { class: 'folder-head' }, h('b', {}, c.ob.number), h('span', {}, `Case ${pad3(m.number)} · ${m.date || ''}`)),
    run.credibilityOn() ? credStamps() : null,
    clockPlate(),
    h('h1', { class: 'case-title' }, m.title),
    h('div', { class: 'ledger-strip ob' }, h('span', { class: 'ledger-t' }, c.ob.time), ledgerP, h('span', { class: 'ob-by' }, `Reported by ${c.ob.reportedBy}`)),
    section('Places', siteMap(), run.locations().map(visitCard)),
    section('People', h('div', { class: 'people-grid' }, run.people().filter(p => !p.statementOnly).map(personCard))),
    paperworkSection(),
    labSection(),
    run.kE.size ? section('Exhibits', h('div', { class: 'exhibits' }, [...run.kE].map((id, i) => exhibitTag(id, i + 1)))) : null,
    run.s.solved ? h('button', { class: 'card-btn', type: 'button', onclick: () => showVerdict(false) }, 'Read the verdict again', h('span', { class: 'arrow' }, '→')) : null);
  const top = h('header', { class: 'topbar' },
    h('button', { class: 'link back', type: 'button', onclick: () => { save(true); showCabinet(); } }, '← Cabinet'),
    h('span', { class: 'topbar-mid' }, `Case ${pad3(m.number)}`),
    h('button', { class: 'link', type: 'button', onclick: showSettings }, 'Settings'));
  const hint = h('div', { class: 'workspace-hint', 'aria-hidden': 'true' }, h('b', {}, 'The desk'), h('span', {}, 'Open a place, a person, an exhibit or the notebook. It lies here, beside the folder.'));
  return { node: h('div', { class: 'desk' }, top, folder, hint, dock()), ledgerP };
}
function showDesk(first = false) {
  const run = K.run, typing = !run.s.obTyped && !run.s.solved;
  const { node, ledgerP } = deskNode({ opening: first && !K.reduced(), typing });
  screen(node, 'scr-desk');
  if (first) K.motion.deal(node, '.fsec, .visit-card, .id-card, .ex-tag, .dock-obj', { step: 34 });
  if (typing) typewrite(ledgerP, run.c.ob.text, { reduced: K.reduced(), sound: K.sound }).then(() => {
    run.s.obTyped = true; ledgerP.innerHTML = K.gloss.rich(run.c.ob.text, { inline: K.save.settings.inlineGloss }); save();
  });
}
// ── Credibility (§2.5): the stamps on the folder ─────────────────────────────────────────────────────
function credStamps({ small = false } = {}) {
  const run = K.run, n = run.s.credibility;
  return h('div', { class: `cred ${small ? 'cred--small' : ''} ${run.s.superior ? 'is-superior' : ''}`, role: 'img', 'aria-label': `Credibility: ${n} of 5 stamps${run.s.superior ? '. Mwalimu is signing your paperwork' : ''}` },
    h('span', { class: 'cred-l' }, 'Credibility'),
    h('span', { class: 'cred-row', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4].map(i => h('span', { class: `cred-s ${i < n ? 'is-on' : ''}` }))),
    !small ? h('button', { class: 'link tiny', type: 'button', onclick: e => popover(e.currentTarget, 'Credibility', 'Five stamps per case. A warrant or a court order costs one; so does pressing someone with a fact that doesn\'t contradict them, and every returned charge sheet. At zero the case goes on: Mwalimu signs your paperwork, and the case can earn one star.') }, 'What is this?') : null);
}
// Warrants and court orders (§2.5). A records request needs no place: its form waits on the folder once you have grounds.
function paperworkSection() {
  const run = K.run, reqs = run.requests();
  if (!reqs.length) return null;
  coach('requests');
  return section('Court orders', h('p', { class: 'hand dim' }, 'You have grounds to ask a magistrate for these.'), reqs.map(g => paperwork(g)));
}
function paperwork(g, { src = null, onDone = null } = {}) {
  const run = K.run;
  const kind = g.action === 'warrant' ? 'Search warrant' : 'Court order for records';
  const ground = g.grounds.map(id => run.byId.get(id)).find(f => f && run.kF.has(f.id));
  const noStamps = run.s.credibility < g.cost;
  return h('div', { class: `paper-form ${g.ready ? '' : 'is-waiting'}` },
    h('span', { class: 'pf-kind' }, kind),
    h('b', { class: 'pf-title' }, g.title),
    g.ready
      ? h('p', { class: 'pf-grounds' }, h('span', { class: 'doc-k' }, 'Grounds'), h('span', { html: K.gloss.rich(ground?.text || '') }))
      : h('p', { class: 'pf-grounds hand dim' }, g.action === 'warrant' ? 'No grounds yet. A magistrate needs a reason to let you search here: something you know that points to it.' : 'No grounds yet.'),
    g.ready ? h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
      if (noStamps && !(await ask({ title: 'No credibility left', text: 'Mwalimu will sign it for you. The case can then earn one star at most.', ok: 'Ask Mwalimu' }))) return;
      const r = run.file(g.id, src);
      if (!r) return;
      K.sound('stamp'); after(r);
      if (r.evidence) toast(`${kind} granted. Exhibit ${exhibitNo(r.evidence)}: ${run.byId.get(r.evidence).title}. ${r.facts.length} fact${r.facts.length === 1 ? '' : 's'} to the notebook.`);
      if (r.superior) mwalimu('I signed it. Next time, keep your stamps for when you need them.');
      onDone?.(r); rebuildSheets();
    } }, noStamps ? 'Ask Mwalimu to sign it' : `Apply · ${g.cost} stamp${g.cost > 1 ? 's' : ''}`) : null);
}

// ── The site map and travel (region 6, §2.5) ──────────────────────────────────────────────────────────
// Sites are far apart. The map draws them from the drive times, you are always at one of them, and going to
// another drives the shortest route you know: the clock moves on by its minutes. Places off the map (a
// search, a warrant, a vehicle) are reached without a drive.
function visitCard(l) {
  const run = K.run, seen = run.visited.has(l.id), onMap = run.onMap(l.id), here = onMap && run.s.site === l.id;
  const r = onMap && !here ? run.route(run.s.site, l.id) : null;
  const verb = here ? (seen ? 'HERE: ' : 'YOU\'RE HERE: ') : r ? `${seen ? 'BACK' : 'DRIVE'} · ${fmtHours(r.minutes / 60).toUpperCase()}: ` : seen ? 'RETURN: ' : 'VISIT: ';
  return h('button', { class: `visit-card ${seen ? '' : 'is-new'} ${here ? 'is-here' : ''}`, type: 'button', 'data-lid': l.id, onclick: () => goTo(l.id),
    'aria-label': `${l.name}${here ? ', you are here' : r ? `, ${fmtHours(r.minutes / 60)} by ${r.legs.map(e => byWords(e.by)).filter((x, i, a) => a.indexOf(x) === i).join(' and ')}` : ''}${seen ? '' : ', not visited'}` },
    h('span', {}, verb, h('b', {}, l.name.toUpperCase()), (() => { const n = run.expectedCount(l.id).unchecked; return n && seen ? h('small', { class: 'vc-check' }, ` · ${n} to check`) : null; })()), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
}
// The map is a printed field sheet (sitemap.js renderMap): terrain, water, roads by surface, symbols, grid,
// north, scale and a Kenya locator. The folder carries a small copy; tapping it opens the full sheet.
const mapLayouts = new Map();
let folderMap = null;                     // the folder copy's geometry, for the drive animation
function mapRender(run, { W, H, full }) {
  const key = `${run.n}:${W}x${H}:${full ? 1 : 0}`, map = run.map;
  if (!mapLayouts.has(key)) mapLayouts.set(key, layoutSites(map.nodes, map.edges, { start: map.start, width: W, height: H, pad: full ? 64 : 42 }));
  const P = mapLayouts.get(key);
  return { P, W, H, ...renderMap(run.c, { sites: run.sites(), here: run.s.site }, { W, H, full, P, regionName: regionOf(run.n)?.name || '' }) };
}
function bindSites(root, pick) {
  for (const g of root.querySelectorAll('.sm-site[data-site]')) {
    const id = g.dataset.site;
    g.addEventListener('click', e => { e.stopPropagation(); pick(id); });
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } });
  }
}
const hereLine = run => { const x = run.sites().find(q => q.here); return `You're at ${x?.name.replace(/ \(.*\)$/, '').replace(/^The /, 'the ') || '—'}.`; };
function siteMap() {
  const run = K.run; if (!run.map) return null;
  coach('siteMap');
  // Drawn at the width it is shown, so the lettering keeps its size.
  const W = Math.round(Math.max(290, Math.min(520, innerWidth - 40))), H = Math.round(W * 0.66);
  const r = folderMap = mapRender(run, { W, H, full: false });
  const wrap = h('div', { class: 'site-map', title: 'Open the map' });
  wrap.innerHTML = r.svg;
  bindSites(wrap, goTo);
  wrap.addEventListener('click', () => openMapSheet());
  return h('div', { class: 'sm-wrap' }, wrap,
    h('p', { class: 'sm-cap' }, h('span', {}, hereLine(run)),
      run.s.driven ? h('span', { class: 'sm-driven' }, `Driven ${fmtHours(run.s.driven / 60)}`) : null,
      h('button', { class: 'link tiny sm-open', type: 'button', onclick: () => openMapSheet() }, 'Open the map'),
      h('button', { class: 'link tiny', type: 'button', onclick: e => popover(e.currentTarget, 'The site map', 'Tap a site to drive there. The drive takes the minutes on the route, by the shortest way you know, and the case clock moves on. Looking round a site you\'re already at costs nothing extra; leaving and coming back does. Plan the order. Tap the map anywhere else to open the full sheet.') }, 'How it works')));
}
// The full sheet: title block, the map (pinch or double-tap to zoom, drag to look round), the legend.
function openMapSheet() {
  const run = K.run; if (!run.map) return;
  setView({ sheet: 'map' });
  const entry = openSheet({ id: 'map', className: 'sheet--map', label: 'Site map', onClose: clearView, build(body) {
    const avail = Math.max(300, Math.min(900, (body.clientWidth || Math.min(innerWidth, 900)) - 28));
    const W = Math.round(avail), H = Math.round(W * (W < 560 ? 1.08 : 0.7));
    const r = mapRender(run, { W, H, full: true }), m = run.c.meta;
    const stage = h('div', { class: 'mp-stage' }); stage.innerHTML = r.svg;
    const frame = h('div', { class: 'mp-frame' }, stage);
    bindSites(stage, id => { closeSheet(entry); goTo(id); });
    put(body,
      h('header', { class: 'mp-title' },
        h('span', { class: 'mp-sheetno' }, `Field sheet ${pad3(m.number)}/1 · SCU Nairobi`),
        h('h2', { class: 'mp-title-h' }, r.area || 'Site map'),
        h('span', { class: 'mp-title-sub' }, `Case ${pad3(m.number)} · ${m.title}${m.date ? ` · ${m.date}` : ''}`)),
      frame,
      h('p', { class: 'mp-note' }, `${hereLine(run)}${run.s.driven ? ` Driven ${fmtHours(run.s.driven / 60)}.` : ''} Tap a site to drive there. Pinch or double-tap to zoom.`),
      h('section', { class: 'mp-legend', 'aria-label': 'Legend' }, h('h3', { class: 'mp-legend-h' }, 'Legend'),
        h('div', { class: 'mp-legend-grid' }, r.legend.map(k => LEGEND[k]).filter(Boolean).map(([label, draw]) => h('div', { class: 'mp-key' },
          h('span', { class: 'mp-key-sw', html: `<svg viewBox="0 0 32 14" width="32" height="14" aria-hidden="true">${draw}</svg>` }), h('span', {}, label))))),
      h('p', { class: 'mp-imprint' }, `Compiled from drive times and the case file; positions and distances approximate (scale bar ≈ ${r.unit < 1 ? `${Math.round(r.unit * 1000)} m` : `${r.unit} km`}). Grid and coordinates for reference only. Not for navigation.`));
    requestAnimationFrame(() => createCamera(frame, stage, { reduced: K.reduced, zMax: 4 }));
  } });
}
// Drive to a site and open it. On the folder's map, the 4×4 drives the road first.
let driving = false;
async function goTo(id) {
  const run = K.run;
  if (driving) return;
  if (run.map && run.onMap(id) && run.s.site !== id && run.kL.has(id)) {
    driving = true;
    try { await animateDrive(run.route(run.s.site, id)); } finally { driving = false; }
  }
  openLocation(id);
}
function animateDrive(r) {
  const car = $('.scr-desk .site-map .sm-car');
  if (!r || !car || !folderMap || K.reduced() || r.path.length < 2) return Promise.resolve();
  const rect = car.ownerSVGElement.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > innerHeight) return Promise.resolve();      // map off screen: no point
  const pts = folderMap.routePoints(r); if (pts.length < 2) return Promise.resolve();
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = seg.reduce((a, b) => a + b, 0) || 1;
  const dur = Math.min(1600, 500 + r.minutes * 6);
  K.sound('key');
  return new Promise(res => {
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      let d = e * total, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const f = seg[i] ? Math.min(1, d / seg[i]) : 1, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
      car.setAttribute('transform', `translate(${(x + 15).toFixed(1)} ${(y - 13).toFixed(1)})`);
      if (k < 1) requestAnimationFrame(step); else setTimeout(res, 120);
    };
    requestAnimationFrame(step);
  });
}

// ── The lab and the arrest clock (region 4, §2.5) ─────────────────────────────────────────────────────
// No real time: every action moves the case clock on. Lab tests come back hours after they're sent;
// detaining a suspect gives 24 hours to take samples and question them before they walk.
const TEST = { autopsy: 'Post-mortem', fibres: 'Fibre comparison', toxicology: 'Toxicology', prints: 'Fingerprints', soil: 'Soil', toolMarks: 'Tool marks',
  paint: 'Paint', water: 'Water analysis', trace: 'Trace', document: 'Questioned document', handwriting: 'Handwriting', comparison: 'Comparison', clotting: 'Clotting' };
const testName = t => TEST[t] || t.replace(/^./, c => c.toUpperCase());
const firstName = pid => K.run.byId.get(pid)?.name.split(' ')[0] || '';
function clockPlate() {
  const run = K.run; if (!run.clockOn) return null;
  const at = run.clockAt(), d = run.s.detained, left = run.hoursLeft();
  return h('div', { class: `clock ${d ? 'is-custody' : ''} ${d && left <= 6 ? 'is-low' : ''}` },
    h('div', { class: 'clock-row' },
      h('span', { class: 'clock-l' }, 'Case clock'),
      h('b', { class: 'clock-t', 'aria-label': `Case clock: day ${at.day}, ${at.hh}` }, at.label),
      h('button', { class: 'link tiny clock-what', type: 'button', onclick: e => popover(e.currentTarget, 'The case clock', 'Nothing here runs in real time. Every visit, interview, form and lab test moves the clock on by hours, and every drive between sites by its minutes. Detain a suspect and a second clock starts: 24 hours, then they go before a court or walk out. Article 49 of the Constitution of Kenya.') }, 'What is this?')),
    d ? h('button', { class: 'clock-custody', type: 'button', onclick: () => openPerson(d), 'aria-label': `${run.byId.get(d).name} in custody, ${fmtHours(left)} left. Open` },
      h('span', { class: 'cc-who' }, `${firstName(d)} in custody`),
      h('b', { class: 'cc-left' }, `${fmtHours(left)} left`),
      h('span', { class: 'cc-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.max(0, left) / 24 * 100}%` } }))) : null);
}
function labSection() {
  const run = K.run; if (!run.clockOn) return null;
  const ready = run.labsReady(), pending = run.labsPending();
  if (!ready.length && !pending.length) return null;
  coach('labQueue');
  const d = run.s.detained, left = run.hoursLeft();
  return section('The lab',
    h('p', { class: 'hand dim' }, ready.length ? 'Ready to send. Results come back while you keep working.' : 'In the lab.'),
    h('div', { class: 'lab-list' },
      ready.map(l => h('div', { class: 'lab-tag' },
        h('span', { class: 'lab-k' }, testName(l.test)),
        h('b', { class: 'lab-title' }, labItems(l.id)),
        h('span', { class: 'lab-time' }, `Takes ${l.hours} h${run.transport ? ` (${run.transport} h on the road to the county lab)` : ''}`),
        h('button', { class: 'btn', type: 'button', onclick: () => sendLab(l.id) }, 'Send · 1 h'))),
      pending.map(l => h('div', { class: 'lab-tag is-pending' },
        h('span', { class: 'lab-k' }, testName(l.test)),
        h('b', { class: 'lab-title' }, labItems(l.id)),
        h('span', { class: 'lab-time' }, `Back ${run.clockAt(l.due).day !== run.clockAt().day ? `day ${run.clockAt(l.due).day}, ` : ''}${run.clockAt(l.due).hh} · ${fmtHours(l.left)}`),
        run.rushOn ? h('button', { class: 'btn btn--small', type: 'button', onclick: () => rushLab(l.id) }, 'Rush · 1 stamp') : null))),
    pending.length ? h('button', { class: 'btn lab-wait', type: 'button', onclick: waitLab },
      `Wait for the ${testName(pending[0].test).toLowerCase()} result · ${fmtHours(pending[0].left)}`) : null,
    d && pending.length && pending[0].left > left ? h('p', { class: 'hand lab-warn' }, `${firstName(d)} walks before it's back.`) : null);
}
// What goes to the lab, in words: the items the test compares ("Autopsy report + Green sweater").
function labItems(id) {
  const run = K.run, e = run.byId.get(id);
  const items = (e.lab.needs || []).map(x => run.byId.get(x)?.title.replace(/ \((seized|Dr\.[^)]*)\)$/, '')).filter(Boolean);
  return items.length ? items.join(' + ') : e.title.replace(/^Lab: /, '');
}
function sendLab(id) {
  const run = K.run, r = run.submitLab(id); if (!r) return;
  K.sound('stamp'); toast(`Sent to the lab. Back ${run.clockAt(r.due).label}.`);
  after(r); rebuildSheets();
}
async function rushLab(id) {
  const run = K.run, e = run.byId.get(id), none = run.s.credibility < 1;
  if (!(await ask({ title: 'Forensic rush', text: `The lab drops everything for this one. ${none ? 'You have no stamps left: Mwalimu will sign for it, and the case can earn one star at most.' : 'It costs a credibility stamp.'}`, ok: none ? 'Ask Mwalimu' : 'Rush it · 1 stamp' }))) return;
  const r = run.rush(id); if (!r) return;
  K.sound('stamp'); after(r); rebuildSheets();
  toast(`Rushed. ${e.title.replace(/^Lab: /, '')} is back: ${r.facts.length} fact${r.facts.length === 1 ? '' : 's'} to the notebook.`);
  if (r.superior) mwalimu('I signed for the rush. Don\'t make it a habit.');
}
async function waitLab() {
  const run = K.run, next = run.labsPending()[0]; if (!next) return;
  const d = run.s.detained, left = run.hoursLeft();
  if (d && next.left > left && !(await ask({ title: 'Wait?', text: `${run.byId.get(d).name} will be released before the result comes back, and you won't be able to question them again.`, ok: 'Wait anyway' }))) return;
  const r = run.wait();
  K.sound('key'); after(r); rebuildSheets();
}
// What the clock did while you worked: results back, a suspect walking out.
function clockEvents(events) {
  const run = K.run;
  for (const e of events || []) {
    if (e.type === 'lab') {
      const ev = run.byId.get(e.id), autopsy = ev.lab?.test === 'autopsy';
      setTimeout(() => toast(autopsy ? `The post-mortem report is in: ${ev.title}. ${e.facts.length} findings to the notebook.` : `Back from the lab: ${ev.title.replace(/^Lab: /, '')}. ${e.facts.length} fact${e.facts.length === 1 ? '' : 's'} to the notebook.`), 300);
      if (autopsy) { const l = run.tutorial('firstAutopsy'); if (l) setTimeout(() => mwalimu(l), 1200); else coach('autopsy'); }
    } else if (e.type === 'released') {
      const p = run.byId.get(e.pid);
      if (e.expired) { K.sound('returned'); setTimeout(() => toast(`The 24 hours are up. ${p.name} walks out of the cells. No more questions for ${firstName(e.pid)}.`), 300); }
    }
  }
}
// Custody on the person sheet: detain, take samples, release.
function custodyBlock(pid) {
  const run = K.run, p = run.byId.get(pid);
  if (!run.detainOn() || p.role !== 'suspect') return null;
  const first = firstName(pid);
  if (run.s.detained === pid) {
    const left = run.hoursLeft(), samples = run.samplesFor(pid);
    return h('div', { class: `custody is-on ${left <= 6 ? 'is-low' : ''}` },
      h('div', { class: 'custody-h' }, h('span', {}, 'In custody'), h('b', {}, `${fmtHours(left)} left`)),
      h('span', { class: 'cc-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${left / 24 * 100}%` } })),
      samples.length ? h('div', { class: 'samples' }, h('span', { class: 'doc-k' }, 'You can take, without consent, while detained'),
        samples.map(e => h('button', { class: 'btn', type: 'button', onclick: () => takeSample(e.id) }, `Take: ${e.title.replace(/ \(seized\)$/, '')} · 1 h`)))
        : h('p', { class: 'hand dim' }, `Nothing more to take. Ask ${first} what you need while the hours last.`),
      h('button', { class: 'link tiny', type: 'button', onclick: async () => {
        if (!(await ask({ title: `Release ${first}?`, text: 'Once released, they can\'t be questioned or detained again in this case.', ok: 'Release' }))) return;
        run.release(); save(); refreshDesk(); rebuildSheets();
      } }, `Release ${first}`));
  }
  if (run.isReleased(pid)) return h('div', { class: 'custody is-released' }, h('span', { class: 'st st--implicates' }, 'RELEASED'), h('p', { class: 'hand' }, `${first} walked out of the cells. No more questions for ${first} in this case.`));
  coach('detainable');
  const other = run.s.detained;
  if (other) return h('p', { class: 'hand dim custody-note' }, `One detention at a time. ${firstName(other)} is in the cells.`);
  return h('div', { class: 'custody' }, h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
    if (!(await ask({ title: `Detain ${first}?`, text: `${first} goes to the cells and a clock starts: 24 hours to take samples and ask what you need. Then ${first} walks, and can't be questioned again. One detention at a time.`, ok: 'Detain' }))) return;
    const r = run.detain(pid); if (!r) return;
    K.sound('stamp'); after(r); rebuildSheets();
    const l = run.tutorial('firstDetention'); if (l) setTimeout(() => mwalimu(l), 700);
  } }, 'Detain · 24 hours'));
}
function takeSample(id) {
  const run = K.run, r = run.sample(id); if (!r?.evidence) return;
  K.sound('stamp'); after(r); rebuildSheets();
  toast(`Exhibit ${exhibitNo(r.evidence)}: ${run.byId.get(r.evidence).title}.${run.labsReady().length ? ' It can go to the lab now.' : ''}`);
}

function section(title, ...kids) { return h('section', { class: 'fsec' }, h('h2', { class: 'fsec-h' }, title), ...kids); }
function personCard(p) {
  const run = K.run;
  const fresh = run.canInterview(p.id) && !run.talked.has(p.id);
  return h('button', { class: `id-card ${fresh ? 'is-new' : ''}`, type: 'button', onclick: () => openPerson(p.id), 'aria-label': `${p.name}, ${p.role === 'victim' ? 'deceased' : p.occupation}${fresh ? ', not yet interviewed' : ''}` },
    p.image ? photo({ src: imgPath(run.n, p.id), kind: 'portrait', id: p.id, small: true }) : h('span', { class: 'no-portrait', 'aria-hidden': 'true' }, initials(p.name)),
    h('span', { class: 'id-name' }, p.name),
    h('span', { class: 'id-role' }, p.role === 'victim' ? 'Deceased' : p.occupation));
}
const initials = name => name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('');
function exhibitTag(id, no) {
  const run = K.run, e = run.byId.get(id), fresh = !run.seenEvidence.has(id);
  return h('button', { class: `ex-tag ${fresh ? 'is-new' : ''}`, type: 'button', onclick: () => openEvidence(id), style: { '--tilt': `${tilt(id, 1.5)}deg` } },
    h('b', {}, `EXHIBIT ${no}`), h('span', {}, e.title));
}
const exhibitNo = id => [...K.run.kE].indexOf(id) + 1;
function dock() {
  const run = K.run;
  const unseen = run.unseenFacts().length;
  const unread = K.save.progress.messages.filter(m => !m.read).length;
  const obj = (cls, label, fn, badge, badgeLabel) => h('button', { class: `dock-obj dock-${cls}`, type: 'button', onclick: fn, 'aria-label': `${label}${badge ? `, ${badge} ${badgeLabel}` : ''}` },
    h('span', { class: `ic ic-${cls}`, 'aria-hidden': 'true' }, badge ? h('span', { class: 'badge' }, String(badge)) : null), h('span', { class: 'dock-l' }, label));
  return h('nav', { class: 'dock', 'aria-label': 'Desk' },
    obj('note', 'Notebook', () => openNotebook(), unseen, 'new facts'),
    obj('cork', 'Board', openBoard),
    obj('phone', 'Phone', openPhone, unread, 'new messages'),
    obj('charge', 'Charge sheet', openCharge));
}
function refreshDesk() {
  if (!K.run || !$('.scr-desk')) return;
  if (!K.run.s.obTyped && !K.run.s.solved) { $('.dock')?.replaceWith(dock()); return; }   // don't interrupt the OB typing
  const y = scrollY;
  $('#screen').replaceChildren(deskNode().node);   // sheets stay open above it
  scrollTo(0, y);
}

// After any action: save, refresh the desk underneath, announce what's new.
function after(result, { quiet = false } = {}) {
  const run = K.run;
  if (result) {
    const newFacts = result.facts?.length || 0;
    if (newFacts) {
      if (!run.s.firstFactDone) { run.s.firstFactDone = true; const l = run.tutorial('firstFact'); if (l) setTimeout(() => mwalimu(l), 600); }
    }
    if (!quiet) for (const u of result.unlocked || []) {
      const x = run.byId.get(u.id);
      if (u.type === 'person' && !x.statementOnly) toast(`New in the folder: ${x.name}, ${x.occupation.toLowerCase()}.`);
      if (u.type === 'location') toast(run.onMap(u.id) ? `New site on the map: ${x.name}.` : `New place: ${x.name}.`);
    }
  }
  clockEvents([...(result?.events || []), ...run.takeEvents()]);
  save();
  refreshDesk();
}

// What was just found flies to the notebook: an exhibit tag, or a slip per new fact (up to three).
function flyFinds(from, r) {
  if (!from || !r) return;
  const target = $('.dock-note') || $('.dock');
  if (r.evidence) { K.motion.flyTo(from, target, { label: `EXHIBIT ${exhibitNo(r.evidence)}`, kind: 'tag' }); return; }
  (r.facts || []).slice(0, 3).forEach((_, i) => K.motion.flyTo(from, target, { kind: 'slip', delay: i * 110 }));
}

// ── A place: the photo with its hotspots ──────────────────────────────────────────────────────────────
function openLocation(id) {
  const run = K.run, l = run.byId.get(id);
  const v = run.visit(id); setView({ sheet: 'location', id }); after(null, { quiet: true });
  if (v?.travel) toast(`${fmtHours(v.travel.minutes / 60)} by ${v.travel.by.map(byWords).join(' and ')}. ${run.clockAt().label}.`);
  const line = run.tutorial('sceneOpen'); if (line) setTimeout(() => mwalimu(line), 700); else coach('sceneOpen');
  let active = null;                                   // the open pin survives a rebuild (e.g. a text-size change)
  openSheet({ id: 'loc', className: 'sheet--location', label: l.name, onClose: clearView, build(body) {
    const hs = run.hotspots(id);
    const places = run.locations();
    if (places.length > 1) put(body, h('nav', { class: 'switcher switcher--places', 'aria-label': 'Places in this case' }, places.map(x => h('button', {
      class: `sw-chip ${x.id === id ? 'is-on' : ''} ${run.visited.has(x.id) ? '' : 'is-fresh'}`, type: 'button', 'data-lid': x.id, 'aria-current': x.id === id ? 'true' : null,
      onclick: () => { if (x.id !== id) openLocation(x.id); } }, x.name.split(' (')[0],
      run.onMap(x.id) && x.id !== run.s.site ? h('span', { class: 'sw-drive' }, ` · ${fmtHours((run.route(run.s.site, x.id)?.minutes || 0) / 60)}`) : null))));
    const gloss = t => K.gloss.rich(t, { inline: K.save.settings.inlineGloss });
    const pos = x => [Math.min(95, Math.max(5, x.pos?.[0] ?? 50)) / 100, Math.min(93, Math.max(7, x.pos?.[1] ?? 50)) / 100];
    const pinLabel = (x, i) => `${i + 1}. ${x.label}${run.tapped.has(x.id) ? ', examined' : ''}`;
    const pins = hs.map((x, i) => h('button', { class: `pin ${run.tapped.has(x.id) ? 'is-done' : ''}`, type: 'button', 'data-hid': x.id, 'aria-expanded': 'false',
      style: { left: `${pos(x)[0] * 100}%`, top: `${pos(x)[1] * 100}%` }, 'aria-label': pinLabel(x, i), onclick: e => open(x.id, e.currentTarget) }, String(i + 1)));
    const pic = photo({ src: imgPath(run.n, id), label: `${l.name.split(' (')[0]}${l.kind === 'scene' ? ', ' + run.c.ob.time : ''}`, kind: 'location', id });
    const frame = pic.querySelector('.photo-img'), img = frame.querySelector('img');
    // The stage holds the image, its depth canvas and the pins, and moves as one; the frame clips it.
    const stage = h('div', { class: 'cam-stage' }); frame.classList.add('cam'); frame.prepend(stage);
    if (img) stage.append(img); else stage.append(...frame.querySelectorAll('.pending'));
    stage.append(...pins);
    const card = h('div', { class: 'cam-card', role: 'dialog', 'aria-modal': 'false', tabindex: '-1', hidden: true });
    const camX = h('button', { class: 'cam-x', type: 'button', 'aria-label': 'Back to the whole room', onclick: () => close() }, '×');
    frame.append(card, camX);
    const cam = createCamera(frame, stage, { reduced: K.reduced, onTapEmpty: ({ double }) => { if (active || double) close(); } });
    frame.addEventListener('keydown', e => { if (e.key === 'Escape' && (active || cam.state().zoomed)) { e.stopPropagation(); close(); } });
    const list = h('ol', { class: 'hs-list' }, hs.map((x, i) => h('li', {}, h('button', { class: `hs-btn ${run.tapped.has(x.id) ? 'is-done' : 'is-new'}`, type: 'button', 'data-hid': x.id,
      onclick: () => { pic.scrollIntoView({ block: 'nearest', behavior: K.reduced() ? 'auto' : 'smooth' }); open(x.id, pins[i]); } },
      h('span', { class: 'hs-no' }, String(i + 1)), h('span', { class: 'hs-l' }, x.label), h('span', { class: 'hs-tick', 'aria-label': 'examined', hidden: !run.tapped.has(x.id) }, '✓')))));
    put(body, h('h2', { class: 'sheet-title' }, l.name), pic,
      h('p', { class: 'loc-desc', html: gloss(l.description) }),
      h('h3', { class: 'sub-h' }, 'Look at'), list, expectedBlock(id));
    setTimeout(() => attachDepth(body, K), 0);
    if (active) requestAnimationFrame(() => open(active, null, { instant: true, again: true }));

    // ── Open a pin: the camera moves in, the card opens beside the pin ────────────────────────────────
    function open(hid, src, { instant = false, again = false } = {}) {
      const i = hs.findIndex(x => x.id === hid); if (i < 0) return;
      const x = hs[i], [px, py] = pos(x), pin = pins[i];
      if (!again) {
        const from = (src || pin)?.getBoundingClientRect();
        const first = !run.tapped.has(hid);
        const r = run.tapHotspot(id, hid);
        K.sound(r?.evidence ? 'paper' : 'pin');
        after(r);
        if (first) { pin.classList.add('is-done', 'just-done'); pin.setAttribute('aria-label', pinLabel(x, i)); const b = list.querySelector(`[data-hid="${hid}"]`); b?.classList.replace('is-new', 'is-done'); b?.querySelector('.hs-tick')?.removeAttribute('hidden'); }
        flyFinds(from, r);
        if (r?.evidence) setTimeout(() => toast(`Exhibit ${exhibitNo(r.evidence)} bagged: ${run.byId.get(r.evidence).title}. ${r.facts.length} fact${r.facts.length === 1 ? '' : 's'} to the notebook.`), 100);
      }
      const moving = !!active && active !== hid;       // from one pin to the next: pan, don't zoom out first
      active = hid;
      pins.forEach(p => { const on = p === pin; p.classList.toggle('is-active', on); p.setAttribute('aria-expanded', String(on)); });
      list.querySelectorAll('.hs-btn').forEach(b => b.classList.toggle('is-active', b.dataset.hid === hid));
      frame.classList.add('has-card'); pic.classList.add('is-looking');
      fillCard(x, i);
      place(px, py, !instant, moving);
      card.focus({ preventScroll: true });
    }
    function fillCard(x, i) {
      const ev = x.yields ? run.byId.get(x.yields) : null;
      const nav = (d, txt, lbl) => h('button', { class: 'cam-nav', type: 'button', 'aria-label': lbl, onclick: () => { const j = (i + d + hs.length) % hs.length; open(hs[j].id, pins[j]); } }, txt);
      card.replaceChildren(
        h('span', { class: 'cam-pointer', 'aria-hidden': 'true' }),
        h('div', { class: 'cam-head' }, nav(-1, '‹', 'Previous'), h('span', { class: 'cam-count' }, `${i + 1} / ${hs.length}`), nav(1, '›', 'Next'),
          h('button', { class: 'cam-close', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '×')),
        h('div', { class: 'cam-body' },
          h('h3', {}, x.label), h('p', { class: 'typed', html: gloss(x.text) }),
          ev && run.kE.has(ev.id) ? h('button', { class: 'card-btn', type: 'button', onclick: () => openEvidence(ev.id) }, h('span', {}, `READ EXHIBIT ${exhibitNo(ev.id)}: `, h('b', {}, ev.title)), h('span', { class: 'arrow' }, '→'))
            : ev?.gate ? (coach('warrant'), paperwork(run.gateInfo(ev.id), { src: x.id, onDone: () => fillCard(x, i) })) : null));
      card.setAttribute('aria-label', x.label);
      card.hidden = false;
      // Paperwork sits under the description: bring the Apply button into view inside the card.
      if (ev?.gate && !run.kE.has(ev.id)) requestAnimationFrame(() => { const cb = card.querySelector('.cam-body'); if (cb) cb.scrollTop = cb.scrollHeight; });
    }
    // Where the camera goes and where the card sits. Wide frames: the card beside the pin, on the side with
    // room. Narrow frames: the frame grows taller and the card runs along its bottom edge, over the photo.
    function place(px, py, animate, moving) {
      const W = frame.clientWidth, Hs = stage.offsetHeight, side = W >= 520;
      card.classList.remove('is-left', 'is-right', 'is-bottom', 'is-top', 'is-in');
      if (side) {
        const H = Hs, cw = Math.min(330, Math.round(W * 0.46));
        card.style.width = `${cw}px`; card.style.maxHeight = `${H - 16}px`;
        cam.setFrameHeight(null, animate);
        const right = px < 0.5;                      // card on the side away from the pin
        const p = cam.lookAt(px, py, 2.2, right ? W * 0.26 : W * 0.74, H * 0.5, animate);
        const ch = Math.min(card.offsetHeight, H - 16);
        let left = right ? p.x + 30 : p.x - 30 - cw;
        let useRight = right;
        if (left < 8 || left + cw > W - 8) { useRight = !right; left = useRight ? p.x + 30 : p.x - 30 - cw; }
        if (left < 8 || left + cw > W - 8) { bottom(); requestAnimationFrame(() => card.classList.add('is-in')); return; }
        const top = Math.max(8, Math.min(H - ch - 8, p.y - ch / 2));
        Object.assign(card.style, { left: `${left}px`, top: `${top}px`, right: '', bottom: '' });
        card.style.setProperty('--py', `${Math.max(16, Math.min(ch - 16, p.y - top))}px`);
        card.classList.add(useRight ? 'is-right' : 'is-left');
      } else bottom();
      requestAnimationFrame(() => card.classList.add('is-in'));
      // Narrow frames: the frame grows taller and the card runs along the edge away from the pin
      // (the bottom edge for pins in the top half, the top edge for pins in the bottom half).
      function bottom() {
        const vh = innerHeight, Hf = Math.round(Math.max(Hs, Math.min(W * 1.25, vh * 0.7)));
        const atTop = py > 0.5, maxH = Math.round(Hf * 0.56);
        card.style.width = ''; Object.assign(card.style, { left: '8px', right: '8px', top: atTop ? '8px' : '', bottom: atTop ? '' : '8px', maxHeight: `${maxH}px` });
        cam.setFrameHeight(Hf, animate && !moving);
        const ch = Math.min(card.offsetHeight, maxH);
        const zz = Math.min(3, Math.max(2.2, cam.minZoom() * 1.3));     // room to pan the pin clear of the card
        const free = Hf - ch - 16;
        const p = cam.lookAt(px, py, zz, W / 2, atTop ? ch + 16 + free / 2 : free / 2 + 8, animate);
        card.style.setProperty('--px', `${Math.max(18, Math.min(W - 34, p.x - 8))}px`);
        card.classList.add(atTop ? 'is-top' : 'is-bottom');
      }
    }
    function close() {
      const pin = active ? pins[hs.findIndex(x => x.id === active)] : null;
      active = null;
      card.classList.remove('is-in'); frame.classList.remove('has-card'); pic.classList.remove('is-looking');
      setTimeout(() => { if (!active) card.hidden = true; }, K.reduced() ? 0 : 200);
      pins.forEach(p => { p.classList.remove('is-active'); p.setAttribute('aria-expanded', 'false'); });
      list.querySelectorAll('.hs-btn').forEach(b => b.classList.remove('is-active'));
      cam.reset(true);
      pin?.focus({ preventScroll: true });
    }
  } });
}

// ── What should be here (region 8): a checklist of what ought to be at this place, and why ────────────
function expectedBlock(locId) {
  const run = K.run, items = run.expectedAt(locId), l = run.byId.get(locId);
  if (!(l.expected || []).length) return null;
  coach('expectedOpen');
  const hidden = l.expected.length - items.length;
  return h('section', { class: 'expected' },
    h('h3', { class: 'sub-h' }, 'Expected here'),
    h('p', { class: 'hand dim' }, 'What should be at this place, and why you expect it. Check each one: what isn\'t here can be evidence too.'),
    items.length ? h('ul', { class: 'exp-list' }, items.map(x => {
      const because = run.byId.get(x.because);
      return h('li', { class: `exp-item ${x.checked ? (x.present === false ? 'is-missing' : 'is-present') : ''}`, 'data-x': x.id },
        h('div', { class: 'exp-text' }, h('b', {}, x.text), h('span', { class: 'exp-why', html: `Because: ${K.gloss.rich(because?.text || '')}` })),
        x.checked ? h('span', { class: `exp-stamp st ${x.present === false ? 'st--ret' : 'st--acc'} is-stamped` }, x.present === false ? 'MISSING' : 'PRESENT')
          : h('button', { class: 'btn btn--small exp-check', type: 'button', onclick: () => checkItem(locId, x.id) }, 'Check'));
    })) : null,
    hidden ? h('p', { class: 'hand dim exp-more' }, `${hidden === 1 ? 'One more thing' : `${hidden} more things`} you'd expect here, once you know why.`) : null);
}
function checkItem(locId, xId) {
  const run = K.run, r = run.checkExpected(locId, xId); if (!r) return;
  K.sound(r.missing ? 'stamp' : 'pin');
  after(r); rebuildSheets();
  if (r.missing && r.facts.length) { toast(`Missing. Noted: ${run.byId.get(r.fact).text.replace(/^Missing: /, '')}`); coach('absenceFound'); }
  else if (!r.missing) toast('It\'s there, as you\'d expect.');
}

// ── A person: the interview ───────────────────────────────────────────────────────────────────────────
// A row of everyone you can question in this case, at the top of a person's sheet: tap one to switch to them
// without closing (their conversation so far is kept: it lives in the case state, not the sheet).
function peopleStrip(pid) {
  const run = K.run;
  const ps = run.people().filter(p => !p.statementOnly && p.role !== 'victim' && run.interrogation.has(p.id));
  if (ps.length < 2 && ps.every(p => p.id === pid)) return null;
  return h('nav', { class: 'switcher switcher--people', 'aria-label': 'People in this case' }, ps.map(p => {
    const on = p.id === pid, fresh = run.canInterview(p.id) && !run.talked.has(p.id);
    return h('button', { class: `sw-person ${on ? 'is-on' : ''} ${fresh ? 'is-fresh' : ''}`, type: 'button', 'data-pid': p.id, 'aria-current': on ? 'true' : null, 'aria-label': `${p.name}${fresh ? ', not yet interviewed' : ''}`,
      onclick: () => { if (!on) openPerson(p.id); } },
      p.image ? h('img', { src: imgPath(run.n, p.id), alt: '', loading: 'lazy', onerror: e => e.target.replaceWith(h('span', { class: 'sw-ini' }, initials(p.name))) }) : h('span', { class: 'sw-ini' }, initials(p.name)),
      h('span', { class: 'sw-name' }, p.name.split(' ')[0]));
  }));
}
function openPerson(pid) {
  const run = K.run, p = run.byId.get(pid);
  K.audio.stopVoice('person');                       // switching people: the last one stops mid-sentence, like closing
  setView({ sheet: 'person', id: pid });
  let introTyped = run.talked.has(pid);
  if (run.canInterview(pid)) {
    const r = run.interview(pid);
    after(r);
    if (r?.evidence.length) setTimeout(() => toast(`${r.evidence.length === 1 ? 'A new exhibit' : `${r.evidence.length} new exhibits`} from ${p.name.split(' ')[0]}: ${r.evidence.map(e => run.byId.get(e).title.replace(/^Statement: /, 'statement')).join(', ')}.`), 400);
    const l = run.tutorial('firstPerson'); if (l) setTimeout(() => mwalimu(l), 900);
  }
  let lastAsked = null;
  const say = (kind, text, opts) => K.audio.character(run.n, pid, kind, text, opts);
  const playBtn = (kind, text, opts) => K.audio.hasCharacter(run.n, pid, kind, text) ?
    h('button', { class: 'say-btn', type: 'button', 'aria-label': 'Play this line', onclick: e => { e.stopPropagation(); say(kind, text, opts); } }, '▶') : null;
  openSheet({ id: 'person', className: 'sheet--person', label: p.name, onClose: () => { K.audio.stopVoice('person'); clearView(); }, build(body) {
    const it = run.interrogation.get(pid);
    put(body, peopleStrip(pid));
    requestAnimationFrame(() => body.querySelector('.sw-person.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
    put(body, h('div', { class: 'person-head' },
      p.image ? photo({ src: imgPath(run.n, pid), label: p.name, kind: 'portrait', id: pid, onZoom: zoomPhoto }) : h('span', { class: 'no-portrait big', 'aria-hidden': 'true' }, initials(p.name)),
      h('div', { class: 'person-meta' }, h('h2', {}, p.name), h('p', {}, p.role === 'victim' ? `${p.age} · deceased` : `${p.age} · ${p.occupation}`), h('p', { class: 'bio', html: K.gloss.rich(p.bio, { inline: K.save.settings.inlineGloss }) }))));
    if (p.role === 'victim') { put(body, h('p', { class: 'typed' }, p.occupation)); return; }
    if (!it) { put(body, h('p', { class: 'typed' }, 'Statement only. See the exhibits.')); return; }
    put(body, custodyBlock(pid));
    if (run.isReleased(pid)) return;
    if (run.lawyered(pid)) { put(body, advocateBlock(pid)); return; }
    if (!run.canInterview(pid)) {
      coach('guarded');
      put(body, h('p', { class: 'intro typed' }, `${p.name.split(' ')[0]} won't talk. Arms folded, eyes on the door. Come back with something to put in front of them.`));
      return;
    }
    const intro = h('p', { class: 'intro typed' });
    put(body, intro);
    if (!introTyped) { introTyped = true; say('intro', it.intro, { now: false }); typewrite(intro, it.intro, { reduced: K.reduced(), sound: K.sound }).then(() => { intro.innerHTML = K.gloss.rich(it.intro); const b = playBtn('intro', it.intro); if (b) intro.append(' ', b); }); }
    else { intro.innerHTML = K.gloss.rich(it.intro, { inline: K.save.settings.inlineGloss }); const b = playBtn('intro', it.intro); if (b) intro.append(' ', b); }
    const statements = (it.yields || []).filter(e => run.kE.has(e));
    const claims = run.claimsOf(pid);
    if (claims.length || statements.length) put(body, h('div', { class: 'claims' }, h('h3', { class: 'sub-h' }, 'Says'),
      run.pressOn() && claims.length ? (coach('personClaims'), h('p', { class: 'hand dim press-help' }, 'Something here doesn\'t fit what you know? Press it and show them why.')) : null,
      h('ul', {}, claims.map(f => {
        const st = run.claimState(f);
        const li = h('li', { class: `claim ${st ? `is-${st.state} mark-${st.mark}` : ''}` }, h('span', { html: K.gloss.rich(run.byId.get(f).text) }));
        const b = playBtn('claim', run.byId.get(f).text); if (b) li.append(' ', b);
        if (st) li.append(h('span', { class: `claim-stamp st st--${st.mark}` }, st.state === 'greyed' ? 'FELL WITH IT' : { implicates: 'LIE', explains: 'EXPLAINED', mistaken: 'MISTAKEN' }[st.mark] || 'BROKEN'));
        else if (run.pressOn()) li.append(h('button', { class: 'press-btn', type: 'button', 'aria-label': 'Press this claim', onclick: () => pressClaim(pid, f) }, 'Press'));
        return li;
      })),
      pressed.get(pid) ? h('div', { class: `caught mark-${pressed.get(pid).mark}`, 'aria-live': 'polite' }, h('span', { class: 'caught-h' }, 'Caught'), h('p', { class: 'caught-r', html: K.gloss.rich(pressed.get(pid).reaction) })) : null,
      statements.map(e => h('button', { class: 'card-btn card-btn--small', type: 'button', onclick: () => openEvidence(e) }, h('span', {}, `EXHIBIT ${exhibitNo(e)}: `, h('b', {}, run.byId.get(e).title)), h('span', { class: 'arrow' }, '→')))));
    // The conversation so far, oldest first; replies are deterministic, so the transcript is rebuilt from what was asked.
    const asked = [...run.asked].filter(k => k.startsWith(pid + '|')).map(k => k.split('|')[1]);
    if (asked.length) put(body, h('div', { class: 'transcript', 'aria-live': 'polite' }, asked.map(a => {
      const t = (it.topics || []).find(x => x.about === a);
      const reply = t ? t.reply : genericReply(pid, a);
      const ans = h('p', { class: 'a', html: K.gloss.rich(reply, { inline: K.save.settings.inlineGloss }) });
      const b = t ? playBtn('reply', reply) : null; if (b) ans.append(' ', b);
      return h('div', { class: `qa ${a === lastAsked ? 'is-last' : ''}` }, h('p', { class: 'q' }, 'About ', h('b', {}, topicName(a))), ans);
    })));
    const topics = run.topics(pid);
    const groups = [['person', 'People'], ['location', 'Places'], ['evidence', 'Exhibits'], ['fact', 'Things you know']];
    put(body, h('div', { class: 'ask' }, h('h3', { class: 'sub-h' }, `Ask ${p.name.split(' ')[0]} about`),
      groups.map(([k, label]) => { const ts = topics.filter(t => t.kind === k); return ts.length ? h('div', { class: 'ask-group' }, h('span', { class: 'ask-l' }, label),
        h('div', { class: 'chips' }, ts.map(t => h('button', { class: `chip ${t.asked ? 'is-asked' : ''}`, type: 'button', onclick: e => ask(t.about, e.currentTarget) }, k === 'fact' ? shortFact(run.byId.get(t.about).text, 46) : topicName(t.about))))) : null; })));
    function ask(about, src) {
      const from = src?.getBoundingClientRect();
      const r = run.ask(pid, about); lastAsked = about;
      flyFinds(from, r);
      if (r) say('reply', r.reply, { generic: r.generic });
      after(r); K.sound('key');
      rebuildSheets();
      requestAnimationFrame(() => body.querySelector('.qa.is-last')?.scrollIntoView({ block: 'center', behavior: K.reduced() ? 'auto' : 'smooth' }));
      if (r?.facts.length) toast(`${r.facts.length} new fact${r.facts.length > 1 ? 's' : ''} to the notebook.`);
    }
  } });
}
// ── A lawyered suspect (region 7): the advocate answers for them until something reopens it ───────────
function advocateBlock(pid) {
  const run = K.run, p = run.byId.get(pid), it = run.interrogation.get(pid), adv = it.lawyered.advocate || 'Their advocate';
  const first = p.name.split(' ')[0], rc = K.campaign.recurringCast.find(r => r.name === adv);
  coach('lawyered');
  return h('div', { class: 'advocate' },
    h('div', { class: 'adv-head' },
      rc ? h('img', { class: 'adv-face', src: `img/ref/${rc.id}.webp`, alt: '', onerror: e => e.target.remove() }) : null,
      h('div', {}, h('span', { class: 'adv-k' }, 'Represented by'), h('b', { class: 'adv-name' }, adv), rc ? h('span', { class: 'adv-role' }, rc.role.split(';')[0]) : null)),
    h('blockquote', { class: 'adv-line' }, `"${it.lawyered.line || "On my advocate's advice, no comment."}"`),
    h('p', { class: 'hand dim' }, `${first} won't answer a single question while ${adv.split(' ').slice(-1)[0]} sits there. Put something in front of the advocate that changes the case against ${first}, and the interview reopens. The wrong thing costs a credibility stamp.`),
    credStamps({ small: true }),
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => reopenPicker(pid) }, 'Present something to the advocate'));
}
function reopenPicker(pid) {
  const run = K.run, p = run.byId.get(pid), it = run.interrogation.get(pid), adv = it.lawyered.advocate || 'The advocate', advLast = adv.split(' ').slice(-1)[0];
  let q = '';
  openSheet({ id: 'reopen', className: 'sheet--press', label: `Present to ${adv}`, build(body, entry) {
    const list = h('div', { class: 'press-list' });
    put(body, h('h2', { class: 'sheet-title' }, `Present to ${advLast}`),
      h('blockquote', { class: 'press-claim' }, `"${it.lawyered.line || "On my advocate's advice, no comment."}"`),
      h('p', { class: 'hand dim' }, `Which fact would make an advocate tell ${p.name.split(' ')[0]} to start talking? Pick one. The wrong one costs a credibility stamp.`),
      credStamps({ small: true }),
      h('input', { class: 'nb-search', type: 'search', placeholder: 'Search what you know', 'aria-label': 'Search what you know', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
      list);
    const pinned = new Set(run.s.pinned);
    const facts = run.factsKnown().filter(f => run.claimOwner.get(f.id) !== pid);
    facts.sort((a, b) => (pinned.has(b.id) - pinned.has(a.id)) || b.order - a.order);
    function draw() {
      list.replaceChildren(...facts.filter(f => !q || f.text.toLowerCase().includes(q)).slice(0, 80).map(f => {
        const tried = run.s.tried.includes(`reopen|${pid}|${f.id}`);
        return h('button', { class: `press-fact ${pinned.has(f.id) ? 'is-pinned' : ''} ${tried ? 'is-tried' : ''}`, type: 'button', disabled: tried, 'data-fact': f.id, onclick: () => present(f.id) },
          pinned.has(f.id) ? h('span', { class: 'pf-pin', 'aria-label': 'pinned' }, '📌') : null, h('span', { html: K.gloss.rich(f.text) }), tried ? h('small', {}, 'changed nothing') : null);
      }));
    }
    draw();
    async function present(fid) {
      const r = run.reopen(pid, fid); if (!r) return;
      if (!r.ok) {
        K.sound('returned'); save(); refreshDesk();
        toast(`${advLast} reads it and slides it back. "That changes nothing, Detective."${r.cost ? ' One credibility stamp gone.' : ''}`);
        entry.rebuild(); return;
      }
      closeSheet(entry);
      await new Promise(res => setTimeout(res, K.reduced() ? 100 : 600));
      K.sound('stamp');
      toast(`${advLast} reads it twice, then leans to ${p.name.split(' ')[0]} and says something quietly. "My client will answer your questions."`);
      after(r); openPerson(pid);
    }
  } });
}
// ── Pressing a claim (§2.4): pick the fact that contradicts it ─────────────────────────────────────────
const pressed = new Map();          // pid → the last broken contradiction, shown under the claims
function pressClaim(pid, claim) {
  const run = K.run, p = run.byId.get(pid);
  let q = '';
  openSheet({ id: 'press', className: 'sheet--press', label: `Press ${p.name}`, build(body, entry) {
    const list = h('div', { class: 'press-list' });
    put(body, h('h2', { class: 'sheet-title' }, `Press ${p.name.split(' ')[0]}`),
      h('blockquote', { class: 'press-claim', html: K.gloss.rich(run.byId.get(claim).text) }),
      h('p', { class: 'hand dim' }, 'Which fact can\'t be true if this is? Pick one. The wrong one costs a credibility stamp.'),
      credStamps({ small: true }),
      h('input', { class: 'nb-search', type: 'search', placeholder: 'Search what you know', 'aria-label': 'Search what you know', oninput: e => { q = e.target.value.toLowerCase(); draw(); } }),
      list);
    const pinned = new Set(run.s.pinned);
    const facts = run.factsKnown().filter(f => f.id !== claim);
    facts.sort((a, b) => (pinned.has(b.id) - pinned.has(a.id)) || b.order - a.order);
    function draw() {
      list.replaceChildren(...facts.filter(f => !q || f.text.toLowerCase().includes(q)).slice(0, 80).map(f => {
        const tried = run.s.tried.includes(claim + '|' + f.id);
        return h('button', { class: `press-fact ${pinned.has(f.id) ? 'is-pinned' : ''} ${tried ? 'is-tried' : ''}`, type: 'button', disabled: tried, onclick: () => present(f.id) },
          pinned.has(f.id) ? h('span', { class: 'pf-pin', 'aria-label': 'pinned' }, '📌') : null, h('span', { html: K.gloss.rich(f.text) }), tried ? h('small', {}, 'didn\'t hold') : null);
      }));
    }
    draw();
    async function present(fid) {
      const r = run.press(pid, claim, fid);
      if (!r) return;
      if (!r.ok) {
        K.sound('returned'); save(); refreshDesk();
        toast(`${p.name.split(' ')[0]} doesn't blink. That doesn't contradict it${r.cost ? ': one credibility stamp gone' : ''}.`);
        entry.rebuild(); return;
      }
      closeSheet(entry);
      pressed.set(pid, r);
      // A held beat of silence, then the stamp and the reaction (§2.4).
      K.audio.stopVoice('person');
      await new Promise(res => setTimeout(res, K.reduced() ? 100 : 700));
      K.sound('stamp');
      K.audio.character(run.n, pid, 'reaction', r.reaction, { now: true, tag: 'person' });
      after(r); rebuildSheets();
      if (r.k.greys?.length) coach('caughtGreys'); else if (r.mark === 'explains') coach('caughtExplains');
      const n = r.facts.length;
      if (n || r.evidence.length) setTimeout(() => toast(`${n} new fact${n === 1 ? '' : 's'} to the notebook${r.evidence.length ? ` and ${r.evidence.length} new exhibit${r.evidence.length > 1 ? 's' : ''}` : ''}.`), 600);
      requestAnimationFrame(() => $('.sheet--person .caught')?.scrollIntoView({ block: 'center', behavior: K.reduced() ? 'auto' : 'smooth' }));
    }
  } });
}
function topicName(id) {
  const x = K.run.byId.get(id); if (!x) return id;
  if (id.startsWith('ev_')) return x.title;
  if (id.startsWith('f_')) return shortFact(x.text, 46);
  return x.name;
}

// ── An exhibit ────────────────────────────────────────────────────────────────────────────────────────
function openEvidence(id) {
  const run = K.run, e = run.byId.get(id);
  run.seenEvidence.add(id); run.markSeen(e.facts || []);
  coach('evidenceOpen', { render: e.render });
  setView({ sheet: 'evidence', id }); after(null, { quiet: true });
  const all = [...run.kE], at = all.indexOf(id);
  const go = d => { const n = all[(at + d + all.length) % all.length]; if (n && n !== id) openEvidence(n); };
  openSheet({ id: 'ev', className: 'sheet--doc', label: e.title, onClose: () => setView(null), build(body) {
    if (all.length > 1) put(body, h('nav', { class: 'switcher switcher--ex', 'aria-label': 'Exhibits' },
      h('button', { class: 'sw-step', type: 'button', 'aria-label': 'Previous exhibit', onclick: () => go(-1) }, '‹'),
      h('span', { class: 'sw-count' }, `Exhibit ${at + 1} of ${all.length}`),
      h('button', { class: 'sw-step', type: 'button', 'aria-label': 'Next exhibit', onclick: () => go(1) }, '›')));
    put(body, renderEvidence(K, e, { exhibitNo: exhibitNo(id) }));
    setTimeout(() => attachDepth(body, K), 0);
    const others = e.doc ? run.compareWith(id) : [];
    if (e.doc) coach('documentOpen');
    put(body, h('div', { class: 'doc-actions' },
      others.length ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openCompare(id, others[0].id) }, 'Compare side by side') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => openNotebook('evidence', id) }, 'See in notebook'),
      h('button', { class: 'btn', type: 'button', onclick: () => openBoard() }, 'Pin to board')));
  } });
}

// ── Two documents side by side (region 7). On a narrow screen, flip between them in the same place. ──
function openCompare(a, b) {
  const run = K.run;
  let left = a, right = b, showing = 'a';
  openSheet({ id: 'compare', className: 'sheet--compare', wide: true, label: 'Compare documents', build(body, entry) {
    const A = run.byId.get(left), B = run.byId.get(right), wide = innerWidth >= 760;
    const pick = (cur, other, set) => h('select', { class: 'cmp-pick', 'aria-label': 'Choose the document', onchange: ev => { set(ev.target.value); entry.rebuild(); } },
      run.documents().filter(x => x.id !== other).map(x => h('option', { value: x.id, selected: x.id === cur }, x.title)));
    const col = (x, which) => h('div', { class: `cmp-col ${!wide && showing !== which ? 'is-hidden' : ''}`, 'data-which': which },
      h('div', { class: 'cmp-head' }, h('span', { class: 'cmp-tag' }, `EXHIBIT ${exhibitNo(x.id)}`), pick(x.id, which === 'a' ? right : left, v => { if (which === 'a') left = v; else right = v; })),
      renderEvidence(K, x, { exhibitNo: exhibitNo(x.id) }));
    put(body, h('h2', { class: 'sheet-title' }, 'Compare documents'),
      h('p', { class: 'hand dim' }, wide ? 'The same kind of paper, side by side. Look at what should match: numbers, stamps, signatures, dates.' : 'Flip between them. What changes when you flip is what doesn\'t match.'),
      wide ? null : h('div', { class: 'cmp-flip', role: 'tablist' },
        [['a', A], ['b', B]].map(([k, x]) => h('button', { class: `nb-tab ${showing === k ? 'is-on' : ''}`, role: 'tab', 'aria-selected': String(showing === k), type: 'button', onclick: () => { showing = k; const y = body.scrollTop; entry.rebuild(); body.scrollTop = y; } }, x.title.length > 26 ? x.title.slice(0, 25) + '…' : x.title))),
      h('div', { class: `cmp-grid ${wide ? 'is-wide' : ''}` }, col(A, 'a'), col(B, 'b')));
  } });
}

// ── The notebook (§2.7): auto-logged facts by person, place, exhibit and time; pinned tray; glossary ──
function openNotebook(tab = 'person', focus = null) {
  const run = K.run;
  let q = '';
  setView({ sheet: 'notebook', tab });
  const unseenAtOpen = new Set(run.unseenFacts());
  coach('notebookOpen');
  openSheet({ id: 'notebook', className: 'sheet--notebook', label: 'Notebook', onClose: () => { run.markSeen([...run.kF]); clearView(); after(null, { quiet: true }); }, build(body, entry) {
    const tabs = [['person', 'People'], ['place', 'Places'], ['evidence', 'Exhibits'], ['time', 'Time'], ['pinned', `Pinned ${run.s.pinned.length}/6`], ['glossary', 'Words']];
    const search = h('input', { class: 'nb-search', type: 'search', placeholder: 'Search the notebook', value: q, 'aria-label': 'Search the notebook',
      oninput: e => { q = e.target.value; draw(); } });
    const content = h('div', { class: 'nb-content' });
    put(body, h('div', { class: 'nb-cover' }, h('h2', { class: 'nb-title' }, 'Notebook'), h('span', { class: 'nb-count' }, `${run.kF.size} facts`)),
      h('div', { class: 'nb-tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { class: `nb-tab ${tab === k ? 'is-on' : ''}`, role: 'tab', 'aria-selected': String(tab === k), type: 'button', onclick: () => { tab = k; setView({ sheet: 'notebook', tab }); entry.rebuild(); } }, l))),
      tab === 'glossary' || tab === 'time' ? null : search, content);
    function line(f) {
      const pinned = run.s.pinned.includes(f.id);
      return h('li', { class: `nb-line ${unseenAtOpen.has(f.id) ? 'is-new' : ''} ${f.kind === 'claim' ? 'is-claim' : ''} ${run.byId.get(f.id)?.absence ? 'is-absence' : ''}` },
        h('span', { class: 'nb-text', html: K.gloss.rich(f.text, { inline: K.save.settings.inlineGloss }) }),
        h('button', { class: `pin-btn ${pinned ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(pinned), 'aria-label': pinned ? 'Unpin this fact' : 'Pin this fact', onclick: () => { run.pin(f.id); save(); entry.rebuild(); } }, pinned ? '📌' : '＋'));
    }
    const match = f => !q || f.text.toLowerCase().includes(q.toLowerCase());
    function draw() {
      content.replaceChildren();
      if (tab === 'glossary') {
        put(content, h('dl', { class: 'gloss' }, (run.c.glossary || []).map(g => [h('dt', {}, g.term), h('dd', {}, g.def)])));
        return;
      }
      if (tab === 'time') { put(content, timeView(run)); return; }
      if (tab === 'pinned') {
        const ps = run.s.pinned.map(id => run.byId.get(id)).filter(Boolean);
        put(content, ps.length ? h('ul', { class: 'nb-lines' }, ps.map(line)) : h('p', { class: 'hand dim' }, 'Pin up to six facts to keep them side by side. Tap ＋ on any line.'));
        return;
      }
      const g = groupFacts(run)[tab];
      const order = tab === 'person' ? run.c.people.map(p => p.id) : tab === 'place' ? [...run.c.locations.map(l => l.id), ...(run.c.places || []).map(p => p.id)] : [...run.kE];
      const keys = [...g.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      let shown = 0;
      for (const k of keys) {
        const fs = g.get(k).filter(match); if (!fs.length) continue; shown++;
        const name = k.startsWith('ev_') ? `Exhibit ${exhibitNo(k)}: ${run.byId.get(k).title}` : run.byId.get(k)?.name || k;
        put(content, h('div', { class: `nb-group ${focus === k ? 'is-focus' : ''}` }, h('h3', { class: 'nb-h' }, name), h('ul', { class: 'nb-lines' }, fs.map(line))));
      }
      const loose = run.factsKnown().filter(f => !(f.about || []).some(a => /^(p_|loc_|plc_|ev_)/.test(a))).filter(match);
      if (loose.length && tab === 'person') put(content, h('div', { class: 'nb-group' }, h('h3', { class: 'nb-h' }, 'Other'), h('ul', { class: 'nb-lines' }, loose.map(line))));
      if (!shown && !loose.length) put(content, h('p', { class: 'hand dim' }, q ? 'Nothing matches.' : 'Nothing yet.'));
      if (focus) requestAnimationFrame(() => content.querySelector('.is-focus')?.scrollIntoView({ block: 'start' }));
    }
    draw();
  } });
}
function timeView(run) {
  const rows = timeRows(run);
  if (!rows.length) return h('p', { class: 'hand dim' }, 'No times yet. Facts that place someone somewhere at a time line up here.');
  const lo = Math.min(...rows.map(r => r.a ?? r.b)), hi = Math.max(...rows.map(r => r.b ?? r.a));
  const span = Math.max(30, hi - lo);
  const fmt = m => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const pct = m => `${((m - lo) / span) * 100}%`;
  return h('div', { class: 'timeline' },
    h('div', { class: 'tl-scale' }, h('span', {}, fmt(lo)), h('span', {}, fmt(hi))),
    rows.map(r => {
      const a = r.a ?? r.b, b = r.b ?? r.a;
      const who = r.person ? K.run.byId.get(r.person)?.name : '';
      const where = r.place ? (K.run.byId.get(r.place)?.name || '').split(' (')[0] : '';
      return h('div', { class: 'tl-row' },
        h('div', { class: 'tl-label' }, h('b', {}, who), where ? ` · ${where}` : ''),
        h('div', { class: 'tl-track' }, h('span', { class: `tl-bar ${r.b == null || r.a == null ? 'is-open' : ''}`, style: { left: pct(a), width: `max(6px, ${((b - a) / span) * 100}%)` } })),
        h('div', { class: 'tl-times' }, `${r.from || '…'}–${r.to || '…'}`),
        h('div', { class: 'tl-text' }, r.text));
    }));
}

// ── The corkboard (§2.6): free-form, never graded ─────────────────────────────────────────────────────
// The board lies in a viewport: on opening it is fitted whole to the screen (nothing cut off), then pinch,
// the scroll wheel or +/− zoom, dragging the cork pans, and Fit goes back. Card positions are stored in board
// units, so they stay exactly where they were put at any zoom.
function openBoard() {
  const run = K.run;
  setView({ sheet: 'board' });
  coach('boardOpen');
  const B = run.s.board || (run.s.board = { pos: {}, strings: [], notes: [] });
  let mode = 'move', sel = null, newString = null;
  const cam = { z: 1, tx: 0, ty: 0, auto: true };      // auto: still fitted (refits when the screen turns)
  let ro = null;
  openSheet({ id: 'board', className: 'sheet--board', wide: true, label: 'Corkboard', onClose: () => { ro?.disconnect(); clearView(); }, build(body, entry) {
    const items = [
      ...run.people().filter(p => !p.statementOnly).map(p => ({ id: p.id, kind: 'person', label: p.name, sub: p.role === 'victim' ? 'Deceased' : p.occupation })),
      ...[...run.kE].map(id => ({ id, kind: 'evidence', label: run.byId.get(id).title, sub: `Exhibit ${exhibitNo(id)}` })),
      ...run.s.pinned.map(fid => ({ id: fid, kind: run.byId.get(fid).absence ? 'fact bcard--absence' : 'fact', label: shortFact(run.byId.get(fid).text, 80), sub: run.byId.get(fid).absence ? 'Missing' : 'Pinned fact' })),
      ...B.notes.map(n => ({ id: n.id, kind: 'note', label: n.text, sub: '' })),
    ];
    // New cards are laid out in as many columns as suit the screen's shape (3 on a phone held upright, up to 6
    // on its side), so the fitted board is as large as it can be. Cards already placed never move.
    const aspect = innerWidth / Math.max(1, innerHeight - 160);
    const cols = Math.max(3, Math.min(6, Math.round(aspect * 3.2)));
    const placed = Object.keys(B.pos).filter(k => items.some(it => it.id === k)).length;
    let slot = placed;
    items.forEach(it => { if (!B.pos[it.id]) { const i = slot++; B.pos[it.id] = [24 + (i % cols) * 240 + tilt(it.id, 12), 30 + Math.floor(i / cols) * 190 + tilt(it.id + 'y', 14)]; } });
    const W = Math.max(760, 40 + Math.max(...items.map(it => B.pos[it.id][0]), 0) + 200);
    // The board is as tall as its cards need (a card is about 180 × 150), never less than a landscape sheet.
    const H = Math.max(560, 40 + Math.max(0, ...items.map(it => B.pos[it.id][1])) + 190);
    const cork = h('div', { class: 'cork', style: { width: W + 'px', height: H + 'px' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'strings'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('aria-hidden', 'true');
    cork.append(svg);
    const cards = new Map();
    for (const it of items) {
      const [x, y] = B.pos[it.id];
      const card = h('div', { class: `bcard bcard--${it.kind} ${sel === it.id ? 'is-sel' : ''}`, tabIndex: 0, role: 'button', 'data-id': it.id, 'aria-label': `${it.label}. ${mode === 'string' ? 'Tap to tie string' : 'Drag to move'}`,
        style: { transform: `translate(${x}px, ${y}px) rotate(${tilt(it.id)}deg)` } },
        h('span', { class: 'bpin', 'aria-hidden': 'true' }),
        it.kind === 'person' && run.byId.get(it.id).image ? photo({ src: imgPath(run.n, it.id), kind: 'portrait', id: it.id, small: true }) : null,
        h('b', {}, it.label), it.sub ? h('span', {}, it.sub) : null,
        it.kind === 'note' ? h('button', { class: 'link tiny', type: 'button', onclick: e => { e.stopPropagation(); B.notes = B.notes.filter(n => n.id !== it.id); delete B.pos[it.id]; B.strings = B.strings.filter(s => !s.includes(it.id)); save(); entry.rebuild(); } }, 'remove') : null);
      drag(card, it);
      cards.set(it.id, card); cork.append(card);
    }
    const drawStrings = () => {
      svg.replaceChildren();
      for (const [a, b] of B.strings) {
        const pa = B.pos[a], pb = B.pos[b]; if (!pa || !pb) continue;
        const x1 = pa[0] + 90, y1 = pa[1] + 10, x2 = pb[0] + 90, y2 = pb[1] + 10;
        const sag = Math.min(60, Math.hypot(x2 - x1, y2 - y1) * 0.12);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 + sag} ${x2},${y2}`);
        path.setAttribute('class', `string ${newString === `${a}|${b}` ? 'is-new' : ''}`);
        path.addEventListener('click', () => { if (mode === 'string') { B.strings = B.strings.filter(s => !(s[0] === a && s[1] === b)); save(); drawStrings(); } });
        svg.append(path);
      }
    };
    function drag(card, it) {
      let start = null, moved = false;
      card.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.stopPropagation(); start = { x: e.clientX, y: e.clientY, p: [...B.pos[it.id]] }; moved = false; card.setPointerCapture(e.pointerId); card.classList.add('is-lifted'); });
      card.addEventListener('pointermove', e => {
        if (!start) return;
        const dx = (e.clientX - start.x) / cam.z, dy = (e.clientY - start.y) / cam.z;     // screen px → board units
        if (Math.hypot(dx * cam.z, dy * cam.z) > 6) moved = true;
        if (!moved || mode === 'string') return;
        B.pos[it.id] = [Math.max(0, Math.min(W - 180, start.p[0] + dx)), Math.max(0, Math.min(H - 120, start.p[1] + dy))];
        card.style.transform = `translate(${B.pos[it.id][0]}px, ${B.pos[it.id][1]}px) rotate(${tilt(it.id)}deg)`;
        drawStrings();
      });
      const end = () => {
        if (!start) return; card.classList.remove('is-lifted');
        if (!moved || mode === 'string') select(it.id); else { K.sound('pin'); save(); }
        start = null;
      };
      card.addEventListener('pointerup', end); card.addEventListener('pointercancel', () => { start = null; card.classList.remove('is-lifted'); });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(it.id); } });
    }
    function select(id) {
      if (mode !== 'string') { if (id.startsWith('ev_')) openEvidence(id); else if (id.startsWith('p_')) openPerson(id); return; }
      if (!sel) { sel = id; cards.get(id)?.classList.add('is-sel'); return; }
      if (sel !== id && !B.strings.some(s => s.includes(sel) && s.includes(id))) { B.strings.push([sel, id]); newString = `${sel}|${id}`; K.sound('pin'); save(); }
      cards.get(sel)?.classList.remove('is-sel'); sel = null; drawStrings();
    }
    // ── The viewport: fit, zoom, pan ─────────────────────────────────────────────────────────────────
    const view = h('div', { class: 'cork-view', 'aria-label': 'Corkboard. Pinch or use the plus and minus buttons to zoom, drag the cork to move around.' }, cork);
    const PAD = 10;
    const fitZ = () => Math.min((view.clientWidth - PAD * 2) / W, (view.clientHeight - PAD * 2) / H);
    const zMin = () => Math.min(fitZ(), 1) * 0.8, zMax = 2.5;
    function clamp() {
      cam.z = Math.max(zMin(), Math.min(zMax, cam.z));
      const vw = view.clientWidth, vh = view.clientHeight, bw = W * cam.z, bh = H * cam.z;
      // Smaller than the view: centred. Larger: it can be dragged until its edge meets the view's edge.
      cam.tx = bw <= vw ? (vw - bw) / 2 : Math.min(PAD, Math.max(vw - bw - PAD, cam.tx));
      cam.ty = bh <= vh ? (vh - bh) / 2 : Math.min(PAD, Math.max(vh - bh - PAD, cam.ty));
    }
    function apply(animate = false) {
      clamp();
      cork.style.transition = animate && !K.reduced() ? 'transform 300ms cubic-bezier(.2,.8,.2,1)' : 'none';
      cork.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})`;
      view.dataset.z = cam.z.toFixed(3);
      if (zLabel) zLabel.textContent = `${Math.round(cam.z * 100)}%`;
    }
    function fit(animate = false) { cam.z = fitZ(); cam.auto = true; apply(animate); }
    function zoomAt(f, cx = view.clientWidth / 2, cy = view.clientHeight / 2, animate = false) {
      const bx = (cx - cam.tx) / cam.z, by = (cy - cam.ty) / cam.z;
      cam.z = Math.max(zMin(), Math.min(zMax, cam.z * f)); cam.auto = false;
      cam.tx = cx - bx * cam.z; cam.ty = cy - by * cam.z; apply(animate);
    }
    const pts = new Map(); let pan = null, pinch = null;
    view.addEventListener('pointerdown', e => {
      if (e.target.closest('.bcard, button, .string')) return;
      view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) pan = { x: e.clientX, y: e.clientY, tx: cam.tx, ty: cam.ty };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; pan = null; }
    });
    view.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = view.getBoundingClientRect();
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((pinch.z * d / pinch.d) / cam.z, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      } else if (pan) { cam.tx = pan.tx + e.clientX - pan.x; cam.ty = pan.ty + e.clientY - pan.y; cam.auto = false; apply(); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) pan = null; };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('wheel', e => {
      e.preventDefault();
      const r = view.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
      else { cam.tx -= e.deltaX; cam.auto = false; apply(); }
    }, { passive: false });
    view.addEventListener('dblclick', e => { if (e.target.closest('.bcard')) return; const r = view.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top, true); });
    let zLabel = null;
    const zoomCtl = h('div', { class: 'cork-zoom' },
      h('button', { class: 'cz-b', type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomAt(1 / 1.3, undefined, undefined, true) }, '−'),
      zLabel = h('span', { class: 'cz-l', 'aria-live': 'polite' }, ''),
      h('button', { class: 'cz-b', type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomAt(1.3, undefined, undefined, true) }, '+'),
      h('button', { class: 'cz-fit', type: 'button', onclick: () => fit(true) }, 'Fit'));
    const tools = h('div', { class: 'board-tools' },
      h('button', { class: `btn ${mode === 'move' ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'move'), onclick: () => { mode = 'move'; sel = null; entry.rebuild(); } }, 'Move / open'),
      h('button', { class: `btn ${mode === 'string' ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'string'), onclick: () => { mode = 'string'; sel = null; entry.rebuild(); } }, 'Red string'),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const text = await ask({ title: 'Sticky note', input: true, ok: 'Pin it' }); if (!text) return;
        const id = 'note_' + Date.now(); B.notes.push({ id, text: text.slice(0, 140) }); save(); entry.rebuild();
      } }, 'Sticky note'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (await ask({ title: 'Tidy the board?', text: 'Cards go back in rows and every string is cut.', ok: 'Tidy' })) { B.pos = {}; B.strings = []; cam.auto = true; save(); entry.rebuild(); } } }, 'Tidy'));
    put(body, h('div', { class: 'board-top' }, h('h2', { class: 'sheet-title on-dark' }, 'Corkboard'),
      h('p', { class: 'board-help' }, mode === 'string' ? 'Tap two cards to tie a string between them. Tap a string to cut it.' : 'Drag cards anywhere. Tap a card to open it. Pinch or +/− to zoom, drag the cork to move around. Nothing here is graded.'),
      tools), h('div', { class: 'cork-frame' }, view, zoomCtl), timelineRail(entry));
    drawStrings();
    // Size is known once the sheet is laid out; keep fitting while it is still "fitted" (rotation, resizing).
    const first = () => { if (cam.auto) fit(); else apply(); };
    requestAnimationFrame(first);
    ro?.disconnect(); ro = new ResizeObserver(first); ro.observe(view);
  } });
}

// ── The timeline rail (region 5, §2.6): every fact with a time, in order along the bottom of the board.
// Never graded. Times after the OB entry (plus three hours) belong to the night before it.
function railKey(at, ob) {
  const m = t => { const x = /^(\d{1,2}):(\d{2})/.exec(t || ''); return x ? +x[1] * 60 + +x[2] : null; };
  const min = m(at.from) ?? 0, anchor = (m(ob) ?? 480) + 180;
  const day = at.day ? Date.parse(`${at.day} 2026`) / 60000 : 0;
  return (Number.isNaN(day) ? 0 : day) + (at.day ? min : min > anchor ? min - 1440 : min);
}
function timelineRail(entry) {
  const run = K.run;
  if (run.region < 5) return null;
  const facts = run.factsKnown().filter(f => f.at?.from).sort((a, b) => railKey(a.at, run.c.ob.time) - railKey(b.at, run.c.ob.time));
  if (!facts.length) return null;
  coach('timelineRail');
  return h('section', { class: 'tl-rail', 'aria-label': 'Timeline' },
    h('div', { class: 'tl-rail-h' }, h('b', {}, 'Timeline'), h('span', {}, 'Every time you have found, in order. Tap one to pin it.')),
    h('ol', { class: 'tl-rail-list' }, facts.map(f => {
      const on = run.s.pinned.includes(f.id);
      return h('li', {}, h('button', { class: `tl-fact ${on ? 'is-pinned' : ''}`, type: 'button', 'aria-pressed': String(on), onclick: () => { run.pin(f.id); save(); entry.rebuild(); } },
        h('span', { class: 'tl-at' }, f.at.day ? `${f.at.day} · ` : '', f.at.from, f.at.to ? `–${f.at.to}` : ''),
        h('span', { class: 'tl-txt' }, shortFact(f.text, 90))));
    })));
}

// ── The Pattern File (unlocks after case 10): every Kivuli detail, pinned by case ─────────────────────
function showPatternFile() {
  const pr = K.save.progress;
  openSheet({ id: 'pattern', className: 'sheet--board', wide: true, label: 'Pattern File', async build(body) {
    put(body, h('h2', { class: 'sheet-title on-dark' }, 'The Pattern File'), h('p', { class: 'board-help' }, 'Every detail that points the same way, pinned by the case it came from. Nobody files these for you twice.'));
    const wall = h('div', { class: 'pattern' }); put(body, wall);
    const byThread = new Map();
    for (const key of pr.pattern) {
      const [cs, fid] = key.split(':'); const n = +cs.slice(5);
      const c = await getCase(n).catch(() => null); const f = c?.facts.find(x => x.id === fid);
      if (!f) continue;
      const t = f.spine || 'other';
      if (!byThread.has(t)) byThread.set(t, []);
      byThread.get(t).push({ n, f });
    }
    for (const nt of pr.patternNotes || []) { const t = nt.thread || 'other'; if (!byThread.has(t)) byThread.set(t, []); byThread.get(t).push({ n: nt.case, f: { id: `note-${nt.case}-${nt.text.length}`, text: nt.text }, note: true }); }
    for (const [t, pins] of byThread) {
      const th = K.campaign.threads.find(x => x.id === t);
      put(wall, h('section', { class: 'thread' }, h('h3', {}, th?.label || t),
        h('div', { class: 'thread-pins' }, pins.sort((a, b) => a.n - b.n).map(({ n, f, note }) => h('div', { class: `ppin ${note ? 'is-note' : ''}`, style: { '--tilt': `${tilt(f.id)}deg` } }, h('span', { class: 'bpin', 'aria-hidden': 'true' }), h('b', {}, `Case ${pad3(n)}${note ? ' · note' : ''}`), h('span', {}, f.text))))));
    }
  } });
}

// ── The phone: a handset over the desk (phone.js). Hint calls, texts and voice-notes ─────────────────
function openPhone() {
  setView({ sheet: 'phone' });
  // Notices wait while the phone is up (the lock screen and the apps show them); her tip is on the home screen.
  openPhoneApp({ K, run: K.run, save, after: () => after(null, { quiet: true }), refreshDesk, clearView,
    openEvidence, openPerson, openNotebook, openCharge, whereToFind, openLocation, openSettings: showSettings, regionName: regionOf(K.run.n)?.name });
}
// Where a fact or card can be found, said the way Mwalimu would say it.
function whereToFind(id) {
  const run = K.run;
  const ev = id.startsWith('ev_') ? run.byId.get(id) : run.c.evidence.find(e => (e.facts || []).includes(id));
  if (ev) {
    for (const l of run.c.locations) for (const hs of l.hotspots || []) if (hs.yields === ev.id) return `Go back to ${l.name.split(' (')[0]} and look at: ${hs.label}.`;
    for (const it of run.c.interrogations) {
      if ((it.yields || []).includes(ev.id)) return `Talk to ${run.byId.get(it.person).name}.`;
      for (const t of it.topics || []) if ((t.reveals || []).includes(ev.id)) return `Ask ${run.byId.get(it.person).name} the right question.`;
    }
  }
  for (const it of run.c.interrogations) for (const t of it.topics || []) if ((t.reveals || []).includes(id)) return `Ask ${run.byId.get(it.person).name} about ${topicName(t.about)}.`;
  return 'Look again at everything you haven\'t opened.';
}

// ── The charge sheet (§2.3): blanks, a word bank built from discovery, batch confirmation ─────────────
function openCharge() {
  const run = K.run, cs = run.c.chargeSheet;
  setView({ sheet: 'charge' });
  const line = run.tutorial('chargeSheetOpen'); if (line) setTimeout(() => mwalimu(line), 500); else coach('chargeOpen');
  const wordBlanks = run.blanks.filter(b => b.category !== 'strip');
  let selected = wordBlanks.find(b => !run.s.charge[b.id] && !run.passed.has(b.group))?.id || wordBlanks[0]?.id;
  let armed = false, lastResult = null, justFilled = null, card = null;
  openSheet({ id: 'charge', className: 'sheet--charge', label: 'Charge sheet', onClose: clearView, build(body, entry) {
    const parts = cs.template.split(/(\{[a-z0-9_]+\})/i);
    const sentence = h('p', { class: 'cs-sentence' }, parts.map(p => {
      const m = p.match(/^\{(.+)\}$/); if (!m) return p;
      const key = m[1];
      if (cs.fixed && key in cs.fixed) return h('b', { class: 'cs-fixed' }, cs.fixed[key]);
      const b = run.blank(key); if (!b) return p;
      const val = run.s.charge[key], w = val ? run.byId.get(val) : null, locked = run.passed.has(b.group);
      const el = h('button', { class: `cs-blank ${val ? 'is-filled' : ''} ${selected === key ? 'is-sel' : ''} ${locked ? 'is-locked' : ''} ${justFilled === key ? 'just-filled' : ''}`, type: 'button', 'data-blank': key, disabled: locked,
        'aria-label': `${b.category} blank${w ? `: ${w.text}` : ', empty'}${locked ? ', accepted' : ''}`, onclick: () => { selected = key; armed = false; entry.rebuild(); } },
        w ? w.text : `[${b.category.toUpperCase()}]`);
      el.addEventListener('dragover', e => e.preventDefault());
      return el;
    }));
    const b = run.blank(selected);
    const opts = b ? run.options(selected) : [];
    const bank = h('div', { class: 'bank' }, h('span', { class: 'bank-h' }, b ? `Word bank · ${b.category}` : 'Word bank'),
      h('div', { class: 'chips' }, opts.length ? opts.map(w => chip(w)) : h('span', { class: 'hand dim' }, 'Nothing here yet. Names and things join the bank when you discover them.')),
      run.s.charge[selected] && !run.passed.has(b.group) ? h('button', { class: 'link', type: 'button', onclick: () => { run.setBlank(selected, null); save(); entry.rebuild(); } }, 'Clear this blank') : null);
    function chip(w) {
      const on = Object.values(run.s.charge).includes(w.id);
      const c = h('button', { class: `chip chip--word ${on ? 'is-used' : ''}`, type: 'button', onclick: () => place(selected, w.id) }, w.text);
      // Drag a word onto a blank; tapping is the same action for anyone who can't drag (§2.12).
      c.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY; let ghost = null;
        const move = ev => {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
          if (!ghost) { ghost = h('span', { class: 'chip chip--ghost' }, w.text); document.body.append(ghost); }
          ghost.style.transform = `translate(${ev.clientX - 40}px, ${ev.clientY - 20}px)`;
          $$('.cs-blank').forEach(x => x.classList.toggle('is-over', x === document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cs-blank')));
        };
        const upF = ev => {
          removeEventListener('pointermove', move); removeEventListener('pointerup', upF);
          if (!ghost) return;
          ghost.remove();
          const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cs-blank');
          if (t) { ev.preventDefault(); c.dataset.dragged = '1'; place(t.dataset.blank, w.id); }
        };
        addEventListener('pointermove', move); addEventListener('pointerup', upF);
      });
      c.addEventListener('click', e => { if (c.dataset.dragged) { e.stopImmediatePropagation(); delete c.dataset.dragged; } }, true);
      return c;
    }
    // The timeline strip (region 5): tap a card, then a time; or drag the card onto the time. Tap a placed
    // card to pick it up again. Graded as one group, like any other.
    function stripBlock(b) {
      coach('timelineStrip');
      const st = b.strip, events = run.stripEvents(b.id), locked = run.passed.has(b.group), placed = run.stripPlaced(b.id);
      const byId = new Map(events.map(e => [e.id, e]));
      const missing = st.events.length - events.length;
      const evCard = (e, inSlot) => {
        const el = h('button', { class: `tl-card ${card === e.id ? 'is-sel' : ''} ${e.hinted ? 'is-hinted' : ''}`, type: 'button', disabled: locked, 'data-event': e.id,
          'aria-label': `${e.text}${inSlot ? ', placed' : ''}${card === e.id ? ', selected' : ''}`,
          onclick: ev => { if (el.dataset.dragged) { delete el.dataset.dragged; return; } card = card === e.id ? null : e.id; entry.rebuild(); } }, e.text);
        el.addEventListener('pointerdown', ev => {
          if (locked || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
          const sx = ev.clientX, sy = ev.clientY; let ghost = null;
          const move = m => {
            if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) < 8) return;
            if (!ghost) { ghost = h('span', { class: 'tl-card tl-card--ghost' }, e.text); document.body.append(ghost); }
            ghost.style.transform = `translate(${m.clientX - 60}px, ${m.clientY - 20}px)`;
            $$('.tl-slot').forEach(x => x.classList.toggle('is-over', x === document.elementFromPoint(m.clientX, m.clientY)?.closest('.tl-slot')));
          };
          const up = u => {
            removeEventListener('pointermove', move); removeEventListener('pointerup', up);
            if (!ghost) return; ghost.remove(); el.dataset.dragged = '1';
            const t = document.elementFromPoint(u.clientX, u.clientY);
            const slot = t?.closest('.tl-slot'), tray = t?.closest('.tl-tray');
            if (slot) drop(e.id, slot.dataset.slot); else if (tray) drop(e.id, null); else entry.rebuild();
          };
          addEventListener('pointermove', move); addEventListener('pointerup', up);
        });
        return el;
      };
      function drop(eid, sid) {
        if (!run.placeEvent(b.id, eid, sid)) return;
        card = null; K.sound(sid ? 'pin' : 'key'); armed = false; lastResult = null; save(); entry.rebuild();
      }
      const loose = events.filter(e => !placed[e.id]);
      return h('div', { class: `cs-strip ${locked ? 'is-locked' : ''}` },
        h('span', { class: 'doc-k' }, 'Sequence of events'),
        h('ol', { class: 'tl-slots' }, st.slots.map(sl => {
          const eid = Object.keys(placed).find(k => placed[k] === sl.id), e = eid && byId.get(eid);
          return h('li', { class: `tl-slot ${e ? 'is-full' : ''} ${card && !e ? 'is-target' : ''}`, 'data-slot': sl.id,
            onclick: ev => { if (ev.target.closest('.tl-card')) return; if (card) drop(card, sl.id); } },
            h('span', { class: 'tl-time' }, sl.label, sl.day ? h('small', {}, ` ${sl.day}`) : null),
            e ? evCard(e, true) : h('span', { class: 'tl-empty' }, card ? 'Put it here' : '—'));
        })),
        locked ? null : h('div', { class: 'tl-tray', onclick: ev => { if (!ev.target.closest('.tl-card') && card && placed[card]) drop(card, null); } },
          h('span', { class: 'bank-h' }, loose.length ? 'Events · tap one, then a time' : card ? 'Tap here to take it off the strip' : 'Every event is on the strip'),
          h('div', { class: 'tl-loose' }, loose.map(e => evCard(e, false))),
          missing ? h('p', { class: 'hand dim' }, `${missing} more event${missing > 1 ? 's' : ''} to find before this can be sent.`) : null));
    }
    function place(blankId, wid) {
      if (!run.setBlank(blankId, wid)) return;
      justFilled = blankId;
      K.sound('key'); armed = false; lastResult = null;
      const nb = wordBlanks.find(x => !run.s.charge[x.id] && !run.passed.has(x.group));
      if (nb) selected = nb.id;
      save(); entry.rebuild();
    }
    const results = lastResult ? h('div', { class: 'cs-results' }, lastResult.results.filter(r => !r.already).map(r => {
      const st = h('span', { class: `st ${r.pass ? 'st--acc' : 'st--ret'}` }, r.pass ? 'ACCEPTED' : 'RETURNED');
      requestAnimationFrame(() => stamp(st, K.sound, K.reduced()));
      return h('div', { class: 'cs-result' }, st, h('p', { class: 'halima' }, h('b', {}, `${reviewerShort(run.c)}: `), r.line || ''));
    })) : null;
    const submit = h('button', { class: `card-btn card-btn--submit ${run.ready() ? '' : 'is-disabled'}`, type: 'button', disabled: !run.ready() || run.s.solved,
      onclick: () => {
        const l = run.tutorial('beforeSubmit');
        if (l && !armed) { armed = true; mwalimu(l); entry.rebuild(); return; }
        const r = run.submit(); if (!r) return;
        lastResult = r; armed = false;
        save(true);
        // Halima reads her verdict on the sheet out loud when it has been recorded.
        const said = r.results.filter(x => !x.already && x.line).map(x => x.line);
        // A solved case: her line is read on the verdict screen, in its place in the closing sequence.
        if (r.solved) { K.sound('accepted'); setTimeout(() => { closeAllSheets(); showVerdict(true, said[0]); }, K.reduced() ? 200 : 1600); entry.rebuild(); return; }
        if (said.length) K.audio.speak('halima', said[0], { now: true, tag: 'verdict' });
        K.sound('returned'); coach('afterWrong');
        setTimeout(() => K.motion.shake(body.querySelector('.charge')), 120);
        if (run.n >= 7 && !K.save.progress.flags.hintOffer) {
          K.save.progress.flags.hintOffer = true;
          setTimeout(() => mwalimu(K.coach.hintOffer), 1400);
        }
        after(null, { quiet: true }); entry.rebuild();
      } }, h('span', {}, run.s.solved ? 'ACCEPTED' : armed ? 'SEND IT' : 'SEND TO THE PROSECUTOR'), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'));
    put(body, h('article', { class: 'charge' },
      h('header', { class: 'cs-head' }, h('span', { class: 'cs-rep' }, 'REPUBLIC OF KENYA'), h('h2', {}, 'Charge sheet'), h('span', { class: 'cs-copy' }, 'COPY'),
        h('div', { class: 'cs-meta' }, h('span', {}, `${run.c.ob.number}`), h('span', {}, `Case ${pad3(run.n)}`), h('span', {}, `Reviewer: ${cs.reviewer ? `${reviewerShort(run.c)}, ODPP` : 'H. Abdi, ODPP'}`))),
      h('div', { class: 'cs-offence' }, h('span', { class: 'doc-k' }, 'Statement of offence'), h('span', {}, 'Murder, contrary to section 203 of the Penal Code.')),
      h('div', { class: 'cs-part' }, h('span', { class: 'doc-k' }, 'Particulars of offence'), sentence),
      run.blanks.filter(b => b.category === 'strip').map(b => stripBlock(b)),
      run.s.wrong ? h('p', { class: 'cs-count' }, `Returned ${run.s.wrong} time${run.s.wrong > 1 ? 's' : ''}.`) : null,
      results, bank, submit,
      h('p', { class: 'cs-help' }, run.blanks.some(x => x.category === 'strip') ? 'The sequence of events is graded as one: every card in its right time. Not every time has a card. ' : '', 'Tap a blank, then a word. Or drag a word onto a blank. Only names and things you have actually found are in the bank. The prosecutor confirms a group only when every blank in it is right.')));
  } });
}

// ── The verdict (beat 6): accepted stamp, reconstruction, eliminations, and what changes on the desk ──
function showVerdict(fresh, halimaLine = null) {
  const run = K.run, c = run.c, n = run.n, pr = K.save.progress;
  const st = run.stars();
  const bc = K.campaign.betweenCases[String(n)] || {};
  if (fresh) {
    const prev = pr.solved[n];
    pr.solved[n] = { stars: Math.max(st, prev?.stars || 0), wrong: run.s.wrong, hints: run.maxHintTier(), at: Date.now() };
    pr.unlockedTo = Math.max(pr.unlockedTo, n + 1);
    if (bc.desk && !pr.desk.includes(bc.desk)) pr.desk.push(bc.desk);
    for (const p of run.spinePins()) if (!pr.pattern.includes(p.key)) pr.pattern.push(p.key);
    // Pattern File notes filed after the verdict (region 7 on): what people said, not facts.
    pr.patternNotes = pr.patternNotes || [];
    for (const a of c.afterVerdict || []) for (const f of a.files || []) if (!pr.patternNotes.some(x => x.case === n && x.text === f.text)) pr.patternNotes.push({ case: n, thread: f.thread, text: f.text });
    if (n === K.campaign.patternFile.unlocksAfter) { pr.flags.patternFile = true; for (const k of K.campaign.patternFile.openingPins) if (!pr.pattern.includes(k)) pr.pattern.push(k); }
    const col = K.campaign.collectibles.find(x => x.case === n); if (col && !pr.collectibles.includes(col.id)) pr.collectibles.push(col.id);
    if (bc.halima) pr.messages.push({ from: 'Prosecutor H. Abdi', line: bc.halima, kind: 'text', case: n });
    run.s.view = null;
    save(true);
  }
  const region = regionOf(n);
  const g0 = c.chargeSheet.groups;
  const pins = run.spinePins();
  const col = K.campaign.collectibles.find(x => x.case === n);
  const el = h('div', { class: `verdict ${fresh ? 'is-fresh' : ''}`, 'data-region': String(region.number) },
    h('header', { class: 'topbar' }, h('button', { class: 'link back', type: 'button', onclick: () => showCabinet() }, '← Cabinet'), h('span', { class: 'topbar-mid' }, `Case ${pad3(n)}`), h('span')),
    h('div', { class: 'v-sheet' },
      h('span', { class: 'st st--acc is-stamped v-stamp' }, 'ACCEPTED'),
      h('p', { class: 'halima big' }, h('b', {}, `${reviewerShort(c)}: `), g0.map(g => g.prosecutor?.pass).filter(Boolean).join(' ')),
      c.chargeSheet.halima ? h('p', { class: 'halima' }, c.chargeSheet.halima) : null),
    h('div', { class: 'v-closed' }, h('span', { class: 'sign v-sign' }, 'Case closed'), h('h1', { class: 'v-title sign' }, c.meta.title),
      h('div', { class: 'v-stars', 'aria-label': `${st} of 3 stars` }, [1, 2, 3].map(i => h('span', { class: `v-star ${i <= st ? 'on' : 'off'}`, style: { '--n': i - 1 }, 'aria-hidden': 'true' }, i <= st ? '★' : '☆'))), h('p', { class: 'v-reason' }, `${['', 'Closed (by the book)', 'Closed', 'Commended'][st]} · ${run.starReason()}`)),
    h('section', { class: 'recon' }, h('h2', { class: 'fsec-h on-dark' }, 'What happened'),
      c.solution.reconstruction.map((r, i) => h('div', { class: 'recon-step', style: { '--tilt': `${tilt(c.meta.id + i, 1)}deg` } },
        r.image ? photo({ src: imgPath(n, r.image), kind: 'location', id: r.image + i, small: true }) : null,
        h('p', { html: K.gloss.rich(r.text) })))),
    h('section', { class: 'elims' }, h('h2', { class: 'fsec-h on-dark' }, 'Why not the others'),
      h('ul', {}, c.solution.eliminations.map(e => h('li', {}, h('b', {}, run.byId.get(e.word)?.text || e.word), ' — ', e.why)))),
    c.afterVerdict ? h('section', { class: 'after' }, h('h2', { class: 'fsec-h on-dark' }, 'Afterwards'),
      (c.meta.final ? c.afterVerdict.slice(0, 1) : c.afterVerdict).map(a => a.choice ? afterChoice(a) : a.scene ? afterScene(a) : [a.beat ? h('p', { class: 'after-beat' }, a.beat) : null, (a.files || []).length ? h('ul', { class: 'after-files' }, a.files.map(f => h('li', {}, h('span', { class: 'pin-dot', 'aria-hidden': 'true' }), h('b', {}, 'Pattern File: '), f.text))) : null])) : null,
    pins.length ? h('section', { class: 'v-pins' }, h('h2', { class: 'fsec-h on-dark' }, pr.flags.patternFile ? 'Filed to the Pattern File' : 'Filed for later'),
      h('ul', {}, pins.map(p => h('li', {}, h('span', { class: 'pin-dot', 'aria-hidden': 'true' }), p.text, p.found ? '' : h('em', {}, ' (you missed this one; it is filed anyway)'))))) : null,
    col ? h('section', { class: 'v-col' }, h('h2', { class: 'fsec-h on-dark' }, 'On your desk now'), h('div', { class: 'shelf-item shelf-item--object big' }, h('b', {}, col.name), h('span', {}, col.desc))) : null,
    bc.desk ? h('p', { class: 'v-desk hand' }, bc.desk) : null,
    h('div', { class: 'v-actions' },
      c.meta.final ? h('button', { class: 'card-btn card-btn--big card-btn--final', type: 'button', onclick: () => showEnding(c) }, h('span', {}, 'OPEN THE DRAWER: ', h('b', {}, 'MWENDA, J.')), h('span', { class: 'arrow' }, '→')) :
      n < SLICE_LAST ? h('button', { class: 'card-btn card-btn--big', type: 'button', onclick: () => openCase(n + 1) }, h('span', {}, 'NEXT: ', h('b', {}, `CASE ${pad3(n + 1)}`)), h('span', { class: 'arrow' }, '→'))
        : h('div', { class: 'slice-end' }, h('h2', { class: 'sign' }, `End of region ${region.number}`), h('p', {}, `${regionOf(n + 1)?.name || 'The next region'} arrives in the next build. Thank you for playing.`)),
      h('button', { class: 'card-btn card-btn--ghost', type: 'button', onclick: () => showCabinet() }, 'Back to the cabinet'),
      h('button', { class: 'link', type: 'button', onclick: () => replay(n) }, 'Play this case again')));
  screen(el, 'scr-verdict');
  K.motion.deal(el, '.recon-step, .elims li, .after-beat, .v-pins li', { step: 70, max: 10 });
  attachDepth(el, K);
  if (fresh) closingSequence(run, bc, c.chargeSheet.reviewer ? null : halimaLine || g0.map(g => g.prosecutor?.pass).filter(Boolean)[0]);
}
// Who reviews the charge sheet: Halima, except where the case names someone else (case 90: Rukia Hassan,
// while Halima is suspended). "Senior Prosecutor Rukia Hassan" → "R. Hassan".
function reviewerShort(c) {
  const r = c.chargeSheet.reviewer; if (!r) return 'H. Abdi';
  const w = r.replace(/^(Senior |Chief |Deputy )?(Prosecutor|Advocate|Inspector|Judge) /, '').split(' ');
  return `${w[0][0]}. ${w.slice(1).join(' ')}`;
}
// ── The ending (case 100) ─────────────────────────────────────────────────────────────────────────────
// After the last charge sheet: the epilogue in silent cards, the prologue's drawer (the OB entry typed into
// Joseph's file and stamped CLOSED, in red), Mwalimu's last voice-note, and a new folder on the desk. Tap to
// go on; nothing is timed; Reduce Motion shows each step still.
function showEnding(c) {
  const pr = K.save.progress, av = c.afterVerdict || [], reduced = K.reduced();
  pr.flags.finished = true; save(true);
  document.querySelectorAll('#notes .note').forEach(n => n.click());          // the verdict's notices don't follow you in
  const epi = av.find(a => /epilogue strip/i.test(a.beat || ''))?.beat || '';
  const cards = epi.replace(/^[^:]*:\s*/, '').replace(/\.$/, '').split(/;\s*/).filter(Boolean).map(t => t[0].toUpperCase() + t.slice(1));
  const drawer = av.find(a => /prologue's drawer/i.test(a.beat || ''))?.beat || '';
  const ob = (/types: "(.+?)" CLOSED/.exec(drawer) || [])[1] || '';
  const last = av.find(a => /last voice-note/i.test(a.beat || ''))?.beat || '';
  const quotes = [...last.matchAll(/"([^"]+)"/g)].map(m => m[1]), noteLine = quotes[0] || '', nextOb = (quotes[1] || '').replace(/\.$/, '');
  const stars = Object.values(pr.solved).reduce((a, x) => a + (x.stars || 0), 0), closed = Object.keys(pr.solved).length;
  let step = 0;
  const stage = h('div', { class: 'end-stage', 'aria-live': 'polite' });
  const next = h('button', { class: 'card-btn end-next', type: 'button' }, 'Continue');
  const el = h('div', { class: 'ending' },
    h('header', { class: 'topbar' }, h('button', { class: 'link back', type: 'button', onclick: () => showCabinet() }, '← Cabinet'), h('span', { class: 'topbar-mid' }, 'Mwenda, J.'), h('span')),
    stage, next);
  const steps = [
    // 1. The epilogue strip: silent cards.
    () => { stage.replaceChildren(h('h2', { class: 'end-h sign' }, 'Afterwards'), h('div', { class: 'epi-strip' }, cards.map((t, i) => h('figure', { class: 'epi-card', style: { '--n': i, '--tilt': `${tilt('epi' + i, 1.6)}deg` } }, h('div', { class: 'epi-frame', 'aria-hidden': 'true' }), h('figcaption', {}, t))))); K.motion.deal(stage, '.epi-card', { step: 160, max: 12 }); next.textContent = 'The drawer'; },
    // 2. The drawer: Joseph's file, the OB entry, CLOSED.
    async () => {
      const line = h('p', { class: 'end-ob' }), st = h('span', { class: 'st st--ret end-closed' }, 'CLOSED');
      stage.replaceChildren(h('div', { class: 'end-folder' },
        h('div', { class: 'end-tab' }, 'MWENDA, J.'),
        h('p', { class: 'end-meta' }, 'OB 01/05/12 · Nakuru · CLOSED (robbery), twelve years ago'),
        h('div', { class: 'end-ledger' }, line), st,
        h('p', { class: 'end-thick hand' }, 'The folder is thick.')));
      next.disabled = true; next.textContent = 'Close the drawer';
      K.sound('paper');
      await typewrite(line, ob, { reduced, cps: 55, sound: K.sound });
      await new Promise(r => setTimeout(r, reduced ? 100 : 500));
      stamp(st, K.sound, reduced); st.classList.add('is-stamped');
      next.disabled = false;
    },
    // 3. Mwalimu's last voice-note, and a new folder.
    () => {
      stage.replaceChildren(h('div', { class: 'end-last' },
        h('p', { class: 'end-note' }, h('span', { class: 'end-from' }, 'Mwalimu · voice-note'), `"${noteLine}"`),
        h('div', { class: 'end-newfolder' }, h('span', { class: 'end-tab end-tab--new' }, nextOb || 'OB 02/05/12'), h('span', { class: 'hand' }, 'Unopened.')),
        h('div', { class: 'end-credits' },
          h('h2', { class: 'sign' }, 'Kesi'), h('p', {}, 'Kenya Case Files'),
          h('p', { class: 'end-stat' }, `${closed} cases closed · ${stars} of ${closed * 3} stars`),
          h('p', { class: 'hand dim' }, 'Every crime in these files is fiction. The streets, the paper and the way the evidence works are Kenya\'s.'))));
      if (noteLine) K.audio.speak('mwalimu', noteLine, { tag: 'ending' });
      next.textContent = 'Back to the cabinet';
    },
    () => showCabinet(),
  ];
  next.addEventListener('click', () => { K.audio.stopVoice?.('ending'); steps[++step]?.(); scrollTo(0, 0); });
  screen(el, 'scr-ending');
  steps[0]();
  // The epilogue's stills, from the campaign's own photos: Mwalimu, Block 9 (case 40), the Isiolo files (case 80),
  // the seal (case 10), one still from each region, Halima. A missing photo leaves the dark frame.
  (async () => {
    const sceneOf = async n => { try { const cc = await getCase(n), l = cc.locations.find(x => x.kind === 'scene') || cc.locations[0]; return imgPath(n, l.id); } catch { return null; } };
    const srcs = [['img/ref/rc_mwalimu.webp'], [await sceneOf(40)], [await sceneOf(80)], [await sceneOf(10)],
      await Promise.all([10, 20, 30, 40, 50, 60, 70, 80, 90].map(sceneOf)), ['img/ref/rc_halima.webp']];
    stage.querySelectorAll('.epi-frame').forEach((fr, i) => {
      const list = (srcs[i] || []).filter(Boolean); if (!list.length) return;
      fr.classList.toggle('is-mosaic', list.length > 1);
      for (const src of list) fr.append(h('img', { src, alt: '', loading: 'lazy', onerror: e => e.target.remove() }));
    });
  })();
}
// A story choice after the verdict (case 60's phone call). It never changes the solution; the choice is kept
// in progress.choices for later cases to read.
function afterChoice(a) {
  const ch = a.choice, pr = K.save.progress; pr.choices = pr.choices || {};
  const wrap = h('div', { class: 'after-choice' });
  const draw = () => {
    const picked = ch.options.find(o => o.id === pr.choices[ch.id]);
    wrap.replaceChildren(
      h('p', { class: 'after-beat' }, a.beat),
      picked ? h('p', { class: 'after-result' }, picked.result)
        : h('div', { class: 'after-opts', role: 'group', 'aria-label': a.beat }, ch.options.map(o => h('button', { class: 'btn', type: 'button', 'data-choice': o.id,
          onclick: () => { pr.choices[ch.id] = o.id; K.sound(o.id === 'answer' ? 'phone' : 'key'); save(true); draw(); } }, o.label))));
  };
  draw();
  return wrap;
}
// A quiet tap-through scene after the verdict (case 70: Mwalimu's kitchen table). No hints, no choices.
function afterScene(a) {
  let i = 0;
  const wrap = h('div', { class: `after-scene scene-${a.scene}` });
  const draw = () => {
    const done = i >= a.beats.length;
    wrap.replaceChildren(
      h('p', { class: 'after-beat' }, a.beat),
      h('div', { class: 'scene-card', 'aria-live': 'polite' },
        a.beats.slice(0, i).map((b, k) => h('p', { class: `scene-line ${k === i - 1 ? 'is-new' : ''}` }, b)),
        done ? (a.files || []).length ? h('ul', { class: 'after-files' }, a.files.map(f => h('li', {}, h('span', { class: 'pin-dot', 'aria-hidden': 'true' }), h('b', {}, 'Pattern File: '), f.text))) : null
          : h('button', { class: 'btn scene-next', type: 'button', onclick: () => { i++; K.sound('paper'); draw(); wrap.querySelector('.scene-line.is-new')?.scrollIntoView({ block: 'center', behavior: K.reduced() ? 'auto' : 'smooth' }); } }, i === 0 ? 'Sit down' : 'Continue')));
  };
  draw();
  return wrap;
}
// Case closed, in order, each heard in full with a breath between (one voice at a time, see audio.js):
// the ACCEPTED stamp and the closing chord → Halima reads her verdict → Mwalimu's notes → Halima's text.
async function closingSequence(run, bc, halimaLine) {
  const reduced = K.reduced(), wait = ms => new Promise(r => setTimeout(r, ms));
  const s = $('.v-stamp');
  if (!reduced && s) { s.classList.remove('is-stamped'); await wait(250); stamp(s, K.sound, false); } else K.sound('stamp');
  await wait(450); K.sound('closed');
  await wait(reduced ? 600 : 1300);
  const spoke = halimaLine ? await K.audio.speak('halima', halimaLine, { tag: 'verdict' }) : false;
  await wait(spoke ? 700 : 1500);
  const t = run.tutorial('verdict'); if (t) mwalimu(t);
  if (bc.mwalimu) mwalimu(bc.mwalimu);
  if (bc.halima) voiceNote({ from: 'Prosecutor H. Abdi', line: cleanText('Prosecutor H. Abdi', bc.halima), kind: 'text' });
}
async function replay(n) {
  if (!await ask({ title: `Play case ${pad3(n)} again?`, text: 'You start again from the OB. Your best stars are kept.', ok: 'Start again' })) return;
  delete K.save.cases[n]; save(true); openCase(n);
}

// ── Sound check (Settings) ──────────────────────────────────────────────────────────────────────────────
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hasSilentSwitch = () => isNative || 'audioSession' in navigator || isIOS();
function soundTest() {
  const out = h('small', { class: 'set-note', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    btn.disabled = true; out.textContent = 'Playing: a cue, then music, then a voice…';
    const s = K.save.settings, r = await K.audio.test();
    const muted = ['music', 'sfx', 'voice'].filter(k => !s[k]).map(k => ({ music: 'Music', sfx: 'Sound effects', voice: 'Voices' })[k]);
    const notes = [];
    if (!r.ok) notes.push('Sound is blocked. Tap anywhere on the page, then try again.');
    if (muted.length) notes.push(`${muted.join(', ')} ${muted.length > 1 ? 'are' : 'is'} turned down to 0 above.`);
    if (!r.voiced && s.voice) notes.push(r.error ? `The voice didn't play (${r.error}).` : r.lines ? 'The voice didn\'t play.' : 'No recorded lines were found in this build.');
    notes.push(`[sound ${r.state} · ${r.lines || 0} lines${isNative ? ' · app' : ''}]`);
    if (hasSilentSwitch() && s.onSilent === false) notes.push('The ring/silent switch mutes the game while "Play sound when the phone is on silent" is off.');
    if (!isNative && isIOS() && !('audioSession' in navigator)) notes.push('On this iPhone browser the ring/silent switch can mute the game: if you heard nothing, check the switch and the volume buttons.');
    out.textContent = notes.length > 1 ? notes.join(' ') : `You should have heard all three. If not, turn the device volume up. ${notes.join(' ')}`;
    btn.disabled = false;
  } }, 'Play');
  return h('div', { class: 'set-test' }, btn, out);
}

// ── Settings: the clipboard ────────────────────────────────────────────────────────────────────────────
function showSettings() {
  const s = K.save.settings;
  openSheet({ id: 'settings', className: 'sheet--clip', label: 'Settings', build(body, entry) {
    const row = (label, ctl, help) => h('div', { class: 'set-row' }, h('div', {}, h('b', {}, label), help ? h('small', {}, help) : null), ctl);
    const toggle = (key, after2) => h('button', { class: `toggle ${s[key] ? 'is-on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(!!s[key]), onclick: () => { s[key] = !s[key]; applySettings(); save(); after2?.(); entry.rebuild(); refreshAll(); } }, s[key] ? 'On' : 'Off');
    const scales = [[0.9, 'S'], [1, 'M'], [1.15, 'L'], [1.3, 'XL']];
    const slider = (key, label, help) => {
      const out = h('output', { for: `set-${key}`, class: 'set-val' }, `${s[key] ?? 0}`);
      const input = h('input', { type: 'range', id: `set-${key}`, min: '0', max: '100', step: '5', value: String(s[key] ?? 0), 'aria-label': label,
        oninput: e => { s[key] = +e.target.value; out.textContent = e.target.value; K.audio.setVolumes(); save(); },
        onchange: () => { if (key === 'sfx') K.sound('accepted'); } });
      return row(label, h('div', { class: 'set-slider' }, input, out), help);
    };
    put(body, h('div', { class: 'clip-top', 'aria-hidden': 'true' }), h('h2', { class: 'sheet-title' }, 'Settings'),
      row('Text size', h('div', { class: 'seg' }, scales.map(([v, l]) => h('button', { class: `seg-b ${s.scale === v ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(s.scale === v), onclick: () => { s.scale = v; applySettings(); save(); entry.rebuild(); } }, l))), 'Every document and note scales.'),
      row('Plain text', toggle('plain'), 'Swap the typewriter and handwriting for the system font.'),
      row('Show word meanings inline', toggle('inlineGloss'), 'Swahili and Sheng words show their meaning in brackets. You can always tap a word instead.'),
      slider('music', 'Music', 'Region music; a quiet room tone where a region has no track yet.'),
      slider('sfx', 'Sound effects', 'Typewriter keys, stamps, the phone, the cues.'),
      slider('voice', 'Voices', 'Mwalimu, Halima and everyone you question, where their lines are recorded. Every line is always on screen too.'),
      hasSilentSwitch() ? row('Play sound when the phone is on silent', toggle('onSilent', () => K.audio.applySession()), 'On: voices and music play even with the ring/silent switch on. Off: the switch mutes the game.') : null,
      row('Test sound', soundTest(), 'Plays a cue, a few seconds of music and a line of Mwalimu\'s.'),
      row('Title sequence', toggle('titleSeq'), 'The title when the app opens: in full the first time, shorter after. Tap it to skip.'),
      row('Case intros', h('div', { class: 'seg' }, [['first', 'First time'], ['always', 'Always'], ['off', 'Off']].map(([v, l]) => h('button', { class: `seg-b ${s.intros === v ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(s.intros === v), onclick: () => { s.intros = v; save(); entry.rebuild(); } }, l))), 'The short title sequence when a case opens.'),
      row('Mwalimu\'s tips', h('button', { class: 'btn', type: 'button', onclick: () => { const f = K.save.progress.flags; f.coach = {}; f.coachCore = {}; save(); toast('Tips will play again the next time each one comes up.'); } }, 'Replay'), 'The one-time tips for each new part of the job.'),
      row('Motion', h('div', { class: 'seg' }, [['system', 'System'], ['reduce', 'Reduce'], ['full', 'Full']].map(([v, l]) => h('button', { class: `seg-b ${s.motion === v ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(s.motion === v), onclick: () => { s.motion = v; applySettings(); save(); entry.rebuild(); } }, l))), 'Reduce follows iOS Reduce Motion by default.'),
      row('Depth in photos', toggle('depth'), 'Places and scenes move with real depth when you drag across them.'),
      row('Tilt to look around', h('button', { class: 'btn', type: 'button', onclick: async () => { const ok = await enableTilt(); toast(ok ? 'Tilt the phone to look around a photo.' : 'This device did not allow motion access.'); } }, 'Allow'), 'Uses the phone\'s motion sensor while a photo is open. Asks for permission once.'),
      isNative ? row('Vibration', toggle('haptics'), 'A small tap when a stamp lands or a sheet is accepted.') : null,
      row('Playtest mode', toggle('playtest', () => {}), 'Opens every region 1 case at once, for testers. Stars still count.'),
      h('div', { class: 'set-danger' },
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
          if (!await ask({ title: 'Erase all progress?', text: 'Every case, note, board and star is deleted. This cannot be undone.', ok: 'Erase', danger: true })) return;
          wipe(); K.save = defaultSave(); applySettings(); save(true); location.reload();
        } }, 'Erase all progress')),
      (() => { const p = h('p', { class: 'fine dark' }); fetch('build.json').then(r => r.ok ? r.json() : null).then(b => { if (b) p.textContent = `Version ${b.version}${b.commit ? ` (${b.commit})` : ''} · built ${b.built.slice(0, 10)}`; }).catch(() => {}); return p; })(),
      h('p', { class: 'fine dark' }, 'Kesi: Kenya Case Files · region 1 build · every case is fiction. Fonts: Big Shoulders Display, Courier Prime, IBM Plex Mono, Patrick Hand (SIL Open Font License).'));
  } });
}
function refreshAll() { if ($('.scr-desk')) refreshDesk(); }

boot().then(appReady, err => {
  appReady();
  console.error(err);
  $('#screen').replaceChildren(h('div', { class: 'boot-error' }, h('h1', {}, 'The folder would not open.'), h('p', {}, String(err.message || err)),
    h('p', {}, 'If you opened index.html straight from the disk, serve the www folder instead (npm run play).')));
});
