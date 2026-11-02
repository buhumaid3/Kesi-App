// Kesi: Kenya Case Files — the game shell. Region 1 vertical slice (cases 1–10).
// Screens: prologue → cabinet → case desk (folder + dock) → verdict. Everything above the desk opens as a
// sheet of paper: a place, a person, an exhibit, the notebook, the board, the phone, the charge sheet.
import { CaseRun, groupFacts, timeRows, genericReply } from './state.js';
import { load, persist, wipe, defaultSave } from './store.js';
import { h, $, $$, put, clearNotices, ask, openSheet, closeSheet, closeAllSheets, rebuildSheets, sheetOpen, voiceNote, toast, popover, typewrite, makeSound, stamp, reducedMotion } from './ui.js';
import { esc, pad3, tilt, makeGlossary, shortFact } from './text.js';
import { renderEvidence, photo, zoomPhoto, imgPath } from './docs.js';
import { createAudio } from './audio.js';
import { createMotion } from './motion.js';
import { attachDepth, enableTilt } from './depth.js';
import { openPhoneApp, cleanText } from './phone.js';

const SLICE_LAST = 10;                       // this build plays region 1
const K = { campaign: null, save: load(), run: null, gloss: null, cases: new Map() };
K.audio = createAudio(() => K.save.settings);
K.sound = kind => K.audio.sfx(kind);
K.reduced = () => reducedMotion(K.save.settings);
K.motion = createMotion(K.reduced);
window.KESI = K;                             // for the playtest console and automated tests

// ── Boot ─────────────────────────────────────────────────────────────────────────────────────────────
async function boot() {
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
  if (!K.save.progress.prologue) return showPrologue();
  // Quit anywhere, come back to exactly that place (§2.1).
  const lc = K.save.progress.lastCase;
  if (lc && K.save.cases[lc] && !K.save.cases[lc].solved && lc <= unlockedTo()) return openCase(lc);
  showCabinet();
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
  const say = (speaker, line) => { K.audio.speak('mwalimu', line); return h('p', { class: 'subtitle' }, h('b', {}, speaker), ' ', line); };
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
  function finish() { K.save.progress.prologue = true; save(true); openCase(1); }
  advance();
}

// ── The cabinet (home): one drawer per region, a folder per case ──────────────────────────────────────
function showCabinet() {
  K.run = null; K.gloss = null;
  const pr = K.save.progress;
  const last = pr.lastCase && !pr.solved[pr.lastCase] && pr.lastCase <= unlockedTo() ? pr.lastCase : null;
  const next = Math.min(unlockedTo(), SLICE_LAST);
  const regions = K.campaign.regions;
  const r1 = regions[0];
  const el = h('div', { class: 'cabinet' },
    h('header', { class: 'cab-head' },
      h('div', { class: 'title-board', 'data-region': '1' }, h('span', { class: 'sign' }, 'Kesi'), h('small', {}, 'Kenya Case Files · ', K.campaign.unit.station)),
      h('button', { class: 'icon-btn', type: 'button', onclick: showSettings, 'aria-label': 'Settings' }, h('span', { class: 'clipboard-ic', 'aria-hidden': 'true' }), 'Settings')),
    last || !pr.solved[next] ? h('button', { class: 'card-btn card-btn--big', type: 'button', onclick: () => openCase(last || firstOpen()) },
      h('span', {}, last ? 'CONTINUE: ' : 'OPEN: ', h('b', {}, `CASE ${pad3(last || firstOpen())}`), K.cases.get(last || firstOpen()) ? ` · ${K.cases.get(last || firstOpen()).meta.title}` : ''), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')) : null,
    h('section', { class: 'drawer', 'data-region': '1', 'aria-label': `Region 1, ${r1.name}` },
      h('div', { class: 'drawer-label' }, h('span', { class: 'drawer-no' }, '01'), h('span', { class: 'drawer-name' }, r1.name), h('span', { class: 'drawer-count' }, `${Object.keys(pr.solved).filter(n => +n <= 10).length}/10 closed`)),
      h('div', { class: 'folders' }, Array.from({ length: 10 }, (_, i) => folderCard(i + 1)))),
    h('section', { class: 'desk-shelf', 'aria-label': 'Your desk' },
      h('h2', { class: 'shelf-h' }, 'On the desk'),
      h('div', { class: 'shelf' },
        pr.flags.patternFile ? h('button', { class: 'shelf-item shelf-item--cork', type: 'button', onclick: showPatternFile }, h('b', {}, 'Pattern File'), h('span', {}, `${pr.pattern.length} pins`)) : null,
        pr.collectibles.map(c => { const col = K.campaign.collectibles.find(x => x.id === c); return h('div', { class: 'shelf-item shelf-item--object' }, h('b', {}, col?.name), h('span', {}, col?.desc)); }),
        h('button', { class: 'shelf-item shelf-item--drawer', type: 'button', onclick: showOldFolder }, h('b', {}, 'The desk drawer'), h('span', {}, 'An old folder: Mwenda, J.')),
        pr.desk.length ? h('ul', { class: 'desk-notes' }, pr.desk.map(d => h('li', {}, d))) : h('p', { class: 'desk-empty' }, 'A wooden desk, a green blotter, a desk phone, a wire in-tray.'))),
    h('section', { class: 'drawers-locked', 'aria-label': 'Later regions' },
      regions.slice(1).map(r => h('div', { class: 'drawer drawer--shut', 'data-region': String(r.number) },
        h('div', { class: 'drawer-label' }, h('span', { class: 'drawer-no' }, String(r.number).padStart(2, '0')), h('span', { class: 'drawer-name' }, r.name), h('span', { class: 'drawer-count' }, 'Not in this build'))))),
    h('p', { class: 'fine' }, 'Every case in Kesi is fiction. Streets and slang are real; the crimes, people and companies are invented.'));
  screen(el, 'scr-cabinet');
  K.audio.music('cabinet');
  K.motion.deal(el, '.folder-card', { step: 45 });
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
  const card = h('div', { class: 'region-card-wrap', role: 'dialog', 'aria-label': `Region ${num}: ${r.name}` },
    h('div', { class: 'sign-card is-entering', 'data-region': String(num) }, h('span', { class: 'sign' }, r.name), h('small', {}, `Region ${num} · cases ${r.cases[0]}–${r.cases[1]} · ${r.months}`)),
    h('p', { class: 'tap-on' }, 'Tap to continue'));
  card.addEventListener('click', () => card.remove());
  document.body.append(card);
  setTimeout(() => card.remove(), 4000);
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
  K.run = new CaseRun(c, saved && !saved.solved ? saved : saved?.solved ? saved : null, { patternPins: pins });
  K.gloss = makeGlossary(c);
  K.save.progress.lastCase = n;
  const fresh = !saved;
  save();
  K.audio.music(c.meta.regionNumber);
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
}
const setView = v => { if (K.run) { K.run.s.view = v; save(); } };
const clearView = () => setView(null);

function mwalimu(line, opts = {}) {
  K.sound('phone');
  const msg = { from: 'Mwalimu', line, kind: 'voice', case: K.run?.n, at: Date.now() };
  K.save.progress.messages.push(msg);
  voiceNote({ from: 'Mwalimu', line, kind: 'voice', play: () => K.audio.speak('mwalimu', line), stop: () => K.audio.stopVoice(), ...opts });
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
    h('h1', { class: 'case-title' }, m.title),
    h('div', { class: 'ledger-strip ob' }, h('span', { class: 'ledger-t' }, c.ob.time), ledgerP, h('span', { class: 'ob-by' }, `Reported by ${c.ob.reportedBy}`)),
    section('Places', run.locations().map(l => h('button', { class: `visit-card ${run.visited.has(l.id) ? '' : 'is-new'}`, type: 'button', onclick: () => openLocation(l.id) },
      h('span', {}, run.visited.has(l.id) ? 'RETURN: ' : 'VISIT: ', h('b', {}, l.name.toUpperCase())), h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')))),
    section('People', h('div', { class: 'people-grid' }, run.people().filter(p => !p.statementOnly).map(personCard))),
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
      if (u.type === 'location') toast(`New place: ${x.name}.`);
    }
  }
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
  run.visit(id); setView({ sheet: 'location', id }); after(null, { quiet: true });
  const line = run.tutorial('sceneOpen'); if (line) setTimeout(() => mwalimu(line), 700); else coach('sceneOpen');
  let active = null;
  openSheet({ id: 'loc', className: 'sheet--location', label: l.name, onClose: clearView, build(body, entry) {
    const hs = run.hotspots(id);
    const pins = hs.map((x, i) => h('button', { class: `pin ${run.tapped.has(x.id) ? 'is-done' : ''} ${active === x.id ? 'is-active' : ''}`, type: 'button',
      style: { left: `${Math.min(95, Math.max(5, x.pos?.[0] ?? 50))}%`, top: `${Math.min(93, Math.max(7, x.pos?.[1] ?? 50))}%` }, 'aria-label': x.label, onclick: e => tap(x.id, e.currentTarget) }, String(i + 1)));
    const pic = photo({ src: imgPath(run.n, id), label: `${l.name.split(' (')[0]}${l.kind === 'scene' ? ', ' + run.c.ob.time : ''}`, kind: 'location', id });
    pic.querySelector('.photo-img').append(...pins);
    setTimeout(() => attachDepth(body, K), 0);
    pic.append(h('button', { class: 'zoom-btn', type: 'button', onclick: () => zoomPhoto(imgPath(run.n, id), l.name), 'aria-label': 'Open the photo full size' }, '⤢ Full size'));
    put(body, h('h2', { class: 'sheet-title' }, l.name), pic,
      h('p', { class: 'loc-desc', html: K.gloss.rich(l.description, { inline: K.save.settings.inlineGloss }) }),
      h('h3', { class: 'sub-h' }, 'Look at'),
      h('ol', { class: 'hs-list' }, hs.map((x, i) => h('li', {}, h('button', { class: `hs-btn ${run.tapped.has(x.id) ? 'is-done' : 'is-new'} ${active === x.id ? 'is-active' : ''}`, type: 'button', onclick: e => tap(x.id, e.currentTarget) },
        h('span', { class: 'hs-no' }, String(i + 1)), h('span', { class: 'hs-l' }, x.label), run.tapped.has(x.id) ? h('span', { class: 'hs-tick', 'aria-label': 'examined' }, '✓') : null)))));
    if (active) {
      const x = hs.find(y => y.id === active);
      const ev = x?.yields ? run.byId.get(x.yields) : null;
      const panel = h('div', { class: 'hs-panel' }, h('h3', {}, x.label), h('p', { class: 'typed', html: K.gloss.rich(x.text, { inline: K.save.settings.inlineGloss }) }),
        ev && run.kE.has(ev.id) ? h('button', { class: 'card-btn', type: 'button', onclick: () => openEvidence(ev.id) }, h('span', {}, `READ EXHIBIT ${exhibitNo(ev.id)}: `, h('b', {}, ev.title)), h('span', { class: 'arrow' }, '→')) : null);
      body.querySelector('.photo').after(panel);
    }
    function tap(hid, src) {
      const from = src?.getBoundingClientRect();
      const first = !run.tapped.has(hid);
      const r = run.tapHotspot(id, hid);
      active = hid;
      K.sound(r?.evidence ? 'paper' : 'pin');
      after(r);
      entry.rebuild();
      if (first) body.querySelectorAll('.pin')[run.hotspots(id).findIndex(x => x.id === hid)]?.classList.add('just-done');
      flyFinds(from, r);
      requestAnimationFrame(() => body.querySelector('.hs-panel')?.scrollIntoView({ block: 'nearest', behavior: K.reduced() ? 'auto' : 'smooth' }));
      attachDepth(body, K);
      if (r?.evidence) setTimeout(() => toast(`Exhibit ${exhibitNo(r.evidence)} bagged: ${run.byId.get(r.evidence).title}. ${r.facts.length} fact${r.facts.length === 1 ? '' : 's'} to the notebook.`), 100);
    }
  } });
}

// ── A person: the interview ───────────────────────────────────────────────────────────────────────────
function openPerson(pid) {
  const run = K.run, p = run.byId.get(pid);
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
  openSheet({ id: 'person', className: 'sheet--person', label: p.name, onClose: () => { K.audio.stopVoice(); clearView(); }, build(body) {
    const it = run.interrogation.get(pid);
    put(body, h('div', { class: 'person-head' },
      p.image ? photo({ src: imgPath(run.n, pid), label: p.name, kind: 'portrait', id: pid, onZoom: zoomPhoto }) : h('span', { class: 'no-portrait big', 'aria-hidden': 'true' }, initials(p.name)),
      h('div', { class: 'person-meta' }, h('h2', {}, p.name), h('p', {}, p.role === 'victim' ? `${p.age} · deceased` : `${p.age} · ${p.occupation}`), h('p', { class: 'bio', html: K.gloss.rich(p.bio, { inline: K.save.settings.inlineGloss }) }))));
    if (p.role === 'victim') { put(body, h('p', { class: 'typed' }, p.occupation)); return; }
    if (!it) { put(body, h('p', { class: 'typed' }, 'Statement only. See the exhibits.')); return; }
    const intro = h('p', { class: 'intro typed' });
    put(body, intro);
    if (!introTyped) { introTyped = true; say('intro', it.intro); typewrite(intro, it.intro, { reduced: K.reduced(), sound: K.sound }).then(() => { intro.innerHTML = K.gloss.rich(it.intro); const b = playBtn('intro', it.intro); if (b) intro.append(' ', b); }); }
    else { intro.innerHTML = K.gloss.rich(it.intro, { inline: K.save.settings.inlineGloss }); const b = playBtn('intro', it.intro); if (b) intro.append(' ', b); }
    const statements = (it.yields || []).filter(e => run.kE.has(e));
    const claims = run.claimsOf(pid);
    if (claims.length || statements.length) put(body, h('div', { class: 'claims' }, h('h3', { class: 'sub-h' }, 'Says'),
      h('ul', {}, claims.map(f => { const li = h('li', { class: 'claim', html: K.gloss.rich(run.byId.get(f).text) }); const b = playBtn('claim', run.byId.get(f).text); if (b) li.append(' ', b); return li; })),
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
  openSheet({ id: 'ev-' + id, className: 'sheet--doc', label: e.title, onClose: () => setView(null), build(body) {
    put(body, renderEvidence(K, e, { exhibitNo: exhibitNo(id) }));
    setTimeout(() => attachDepth(body, K), 0);
    put(body, h('div', { class: 'doc-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => openNotebook('evidence', id) }, 'See in notebook'),
      h('button', { class: 'btn', type: 'button', onclick: () => openBoard() }, 'Pin to board')));
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
      return h('li', { class: `nb-line ${unseenAtOpen.has(f.id) ? 'is-new' : ''} ${f.kind === 'claim' ? 'is-claim' : ''}` },
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
function openBoard() {
  const run = K.run;
  setView({ sheet: 'board' });
  coach('boardOpen');
  const B = run.s.board || (run.s.board = { pos: {}, strings: [], notes: [] });
  let mode = 'move', sel = null, newString = null;
  openSheet({ id: 'board', className: 'sheet--board', wide: true, label: 'Corkboard', onClose: clearView, build(body, entry) {
    const items = [
      ...run.people().filter(p => !p.statementOnly).map(p => ({ id: p.id, kind: 'person', label: p.name, sub: p.role === 'victim' ? 'Deceased' : p.occupation })),
      ...[...run.kE].map(id => ({ id, kind: 'evidence', label: run.byId.get(id).title, sub: `Exhibit ${exhibitNo(id)}` })),
      ...run.s.pinned.map(fid => ({ id: fid, kind: 'fact', label: shortFact(run.byId.get(fid).text, 80), sub: 'Pinned fact' })),
      ...B.notes.map(n => ({ id: n.id, kind: 'note', label: n.text, sub: '' })),
    ];
    const W = 760, H = Math.max(900, 160 + Math.ceil(items.length / 3) * 190);
    items.forEach((it, i) => { if (!B.pos[it.id]) B.pos[it.id] = [24 + (i % 3) * 240 + tilt(it.id, 12), 30 + Math.floor(i / 3) * 190 + tilt(it.id + 'y', 14)]; });
    const cork = h('div', { class: 'cork', style: { width: W + 'px', height: H + 'px' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'strings'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true');
    cork.append(svg);
    const cards = new Map();
    for (const it of items) {
      const [x, y] = B.pos[it.id];
      const card = h('div', { class: `bcard bcard--${it.kind} ${sel === it.id ? 'is-sel' : ''}`, tabIndex: 0, role: 'button', 'aria-label': `${it.label}. ${mode === 'string' ? 'Tap to tie string' : 'Drag to move'}`,
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
      card.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; start = { x: e.clientX, y: e.clientY, p: [...B.pos[it.id]] }; moved = false; card.setPointerCapture(e.pointerId); card.classList.add('is-lifted'); });
      card.addEventListener('pointermove', e => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 6) moved = true;
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
    const tools = h('div', { class: 'board-tools' },
      h('button', { class: `btn ${mode === 'move' ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'move'), onclick: () => { mode = 'move'; sel = null; entry.rebuild(); } }, 'Move / open'),
      h('button', { class: `btn ${mode === 'string' ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(mode === 'string'), onclick: () => { mode = 'string'; sel = null; entry.rebuild(); } }, 'Red string'),
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const text = await ask({ title: 'Sticky note', input: true, ok: 'Pin it' }); if (!text) return;
        const id = 'note_' + Date.now(); B.notes.push({ id, text: text.slice(0, 140) }); save(); entry.rebuild();
      } }, 'Sticky note'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (await ask({ title: 'Tidy the board?', text: 'Cards go back in rows and every string is cut.', ok: 'Tidy' })) { B.pos = {}; B.strings = []; save(); entry.rebuild(); } } }, 'Tidy'));
    put(body, h('h2', { class: 'sheet-title on-dark' }, 'Corkboard'),
      h('p', { class: 'board-help' }, mode === 'string' ? 'Tap two cards to tie a string between them. Tap a string to cut it.' : 'Drag cards anywhere. Tap a card to open it. Nothing here is graded: it is for thinking.'),
      tools, h('div', { class: 'cork-scroll' }, cork));
    drawStrings();
  } });
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
    for (const [t, pins] of byThread) {
      const th = K.campaign.threads.find(x => x.id === t);
      put(wall, h('section', { class: 'thread' }, h('h3', {}, th?.label || t),
        h('div', { class: 'thread-pins' }, pins.sort((a, b) => a.n - b.n).map(({ n, f }) => h('div', { class: 'ppin', style: { '--tilt': `${tilt(f.id)}deg` } }, h('span', { class: 'bpin', 'aria-hidden': 'true' }), h('b', {}, `Case ${pad3(n)}`), h('span', {}, f.text))))));
    }
  } });
}

// ── The phone: a handset over the desk (phone.js). Hint calls, texts and voice-notes ─────────────────
function openPhone() {
  setView({ sheet: 'phone' });
  // Notices wait while the phone is up (the lock screen and the apps show them); her tip is on the home screen.
  openPhoneApp({ K, run: K.run, save, after: () => after(null, { quiet: true }), refreshDesk, clearView,
    openEvidence, openPerson, openNotebook, openCharge, whereToFind });
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
  let selected = run.blanks.find(b => !run.s.charge[b.id] && !run.passed.has(b.group))?.id || run.blanks[0].id;
  let armed = false, lastResult = null, justFilled = null;
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
    function place(blankId, wid) {
      if (!run.setBlank(blankId, wid)) return;
      justFilled = blankId;
      K.sound('key'); armed = false; lastResult = null;
      const nb = run.blanks.find(x => !run.s.charge[x.id] && !run.passed.has(x.group));
      if (nb) selected = nb.id;
      save(); entry.rebuild();
    }
    const results = lastResult ? h('div', { class: 'cs-results' }, lastResult.results.filter(r => !r.already).map(r => {
      const st = h('span', { class: `st ${r.pass ? 'st--acc' : 'st--ret'}` }, r.pass ? 'ACCEPTED' : 'RETURNED');
      requestAnimationFrame(() => stamp(st, K.sound, K.reduced()));
      return h('div', { class: 'cs-result' }, st, h('p', { class: 'halima' }, h('b', {}, 'H. Abdi: '), r.line || ''));
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
        if (said.length) K.audio.speak('halima', said[0]);
        if (r.solved) { K.sound('accepted'); setTimeout(() => { closeAllSheets(); showVerdict(true); }, K.reduced() ? 200 : 1600); entry.rebuild(); return; }
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
        h('div', { class: 'cs-meta' }, h('span', {}, `${run.c.ob.number}`), h('span', {}, `Case ${pad3(run.n)}`), h('span', {}, `Reviewer: ${cs.reviewer ? run.byId.get(cs.reviewer)?.name || 'R. Hassan' : 'H. Abdi, ODPP'}`))),
      h('div', { class: 'cs-offence' }, h('span', { class: 'doc-k' }, 'Statement of offence'), h('span', {}, 'Murder, contrary to section 203 of the Penal Code.')),
      h('div', { class: 'cs-part' }, h('span', { class: 'doc-k' }, 'Particulars of offence'), sentence),
      run.s.wrong ? h('p', { class: 'cs-count' }, `Returned ${run.s.wrong} time${run.s.wrong > 1 ? 's' : ''}.`) : null,
      results, bank, submit,
      h('p', { class: 'cs-help' }, 'Tap a blank, then a word. Or drag a word onto a blank. Only names and things you have actually found are in the bank. The prosecutor confirms a group only when every blank in it is right.')));
  } });
}

// ── The verdict (beat 6): accepted stamp, reconstruction, eliminations, and what changes on the desk ──
function showVerdict(fresh) {
  const run = K.run, c = run.c, n = run.n, pr = K.save.progress;
  const st = run.stars();
  const bc = K.campaign.betweenCases[String(n)] || {};
  if (fresh) {
    const prev = pr.solved[n];
    pr.solved[n] = { stars: Math.max(st, prev?.stars || 0), wrong: run.s.wrong, hints: run.maxHintTier(), at: Date.now() };
    pr.unlockedTo = Math.max(pr.unlockedTo, n + 1);
    if (bc.desk && !pr.desk.includes(bc.desk)) pr.desk.push(bc.desk);
    for (const p of run.spinePins()) if (!pr.pattern.includes(p.key)) pr.pattern.push(p.key);
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
      h('p', { class: 'halima big' }, h('b', {}, 'H. Abdi: '), g0.map(g => g.prosecutor?.pass).filter(Boolean).join(' ')),
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
      c.afterVerdict.map(a => h('p', { class: 'after-beat' }, a.beat))) : null,
    pins.length ? h('section', { class: 'v-pins' }, h('h2', { class: 'fsec-h on-dark' }, pr.flags.patternFile ? 'Filed to the Pattern File' : 'Filed for later'),
      h('ul', {}, pins.map(p => h('li', {}, h('span', { class: 'pin-dot', 'aria-hidden': 'true' }), p.text, p.found ? '' : h('em', {}, ' (you missed this one; it is filed anyway)'))))) : null,
    col ? h('section', { class: 'v-col' }, h('h2', { class: 'fsec-h on-dark' }, 'On your desk now'), h('div', { class: 'shelf-item shelf-item--object big' }, h('b', {}, col.name), h('span', {}, col.desc))) : null,
    bc.desk ? h('p', { class: 'v-desk hand' }, bc.desk) : null,
    h('div', { class: 'v-actions' },
      n < SLICE_LAST ? h('button', { class: 'card-btn card-btn--big', type: 'button', onclick: () => openCase(n + 1) }, h('span', {}, 'NEXT: ', h('b', {}, `CASE ${pad3(n + 1)}`)), h('span', { class: 'arrow' }, '→'))
        : h('div', { class: 'slice-end' }, h('h2', { class: 'sign' }, 'End of region 1'), h('p', {}, 'Region 2, Eastlands, arrives in the next build. Thank you for playing.')),
      h('button', { class: 'card-btn card-btn--ghost', type: 'button', onclick: () => showCabinet() }, 'Back to the cabinet'),
      h('button', { class: 'link', type: 'button', onclick: () => replay(n) }, 'Play this case again')));
  screen(el, 'scr-verdict');
  K.motion.deal(el, '.recon-step, .elims li, .after-beat, .v-pins li', { step: 70, max: 10 });
  attachDepth(el, K);
  if (fresh) {
    const t = run.tutorial('verdict'); if (t) setTimeout(() => mwalimu(t), 1200);
    if (bc.mwalimu) setTimeout(() => mwalimu(bc.mwalimu), t ? 2400 : 1200);
    if (bc.halima) setTimeout(() => voiceNote({ from: 'Prosecutor H. Abdi', line: cleanText('Prosecutor H. Abdi', bc.halima), kind: 'text' }), 2600);
    setTimeout(() => K.sound('closed'), 700);
    if (!K.reduced()) { const s = $('.v-stamp'); s.classList.remove('is-stamped'); setTimeout(() => stamp(s, K.sound, false), 250); }
  }
}
async function replay(n) {
  if (!await ask({ title: `Play case ${pad3(n)} again?`, text: 'You start again from the OB. Your best stars are kept.', ok: 'Start again' })) return;
  delete K.save.cases[n]; save(true); openCase(n);
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
      slider('voice', 'Voices', 'Mwalimu and Halima, where their lines are recorded. Every line is always on screen too.'),
      row('Case intros', h('div', { class: 'seg' }, [['first', 'First time'], ['always', 'Always'], ['off', 'Off']].map(([v, l]) => h('button', { class: `seg-b ${s.intros === v ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(s.intros === v), onclick: () => { s.intros = v; save(); entry.rebuild(); } }, l))), 'The short title sequence when a case opens.'),
      row('Mwalimu\'s tips', h('button', { class: 'btn', type: 'button', onclick: () => { const f = K.save.progress.flags; f.coach = {}; f.coachCore = {}; save(); toast('Tips will play again the next time each one comes up.'); } }, 'Replay'), 'The one-time tips for each new part of the job.'),
      row('Motion', h('div', { class: 'seg' }, [['system', 'System'], ['reduce', 'Reduce'], ['full', 'Full']].map(([v, l]) => h('button', { class: `seg-b ${s.motion === v ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(s.motion === v), onclick: () => { s.motion = v; applySettings(); save(); entry.rebuild(); } }, l))), 'Reduce follows iOS Reduce Motion by default.'),
      row('Depth in photos', toggle('depth'), 'Places and scenes move with real depth when you drag across them.'),
      row('Tilt to look around', h('button', { class: 'btn', type: 'button', onclick: async () => { const ok = await enableTilt(); toast(ok ? 'Tilt the phone to look around a photo.' : 'This device did not allow motion access.'); } }, 'Allow'), 'Uses the phone\'s motion sensor while a photo is open. Asks for permission once.'),
      row('Playtest mode', toggle('playtest', () => {}), 'Opens every region 1 case at once, for testers. Stars still count.'),
      h('div', { class: 'set-danger' },
        h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
          if (!await ask({ title: 'Erase all progress?', text: 'Every case, note, board and star is deleted. This cannot be undone.', ok: 'Erase', danger: true })) return;
          wipe(); K.save = defaultSave(); applySettings(); save(true); location.reload();
        } }, 'Erase all progress')),
      h('p', { class: 'fine dark' }, 'Kesi: Kenya Case Files · region 1 build · every case is fiction. Fonts: Big Shoulders Display, Courier Prime, IBM Plex Mono, Patrick Hand (SIL Open Font License).'));
  } });
}
function refreshAll() { if ($('.scr-desk')) refreshDesk(); }

boot().catch(err => {
  console.error(err);
  $('#screen').replaceChildren(h('div', { class: 'boot-error' }, h('h1', {}, 'The folder would not open.'), h('p', {}, String(err.message || err)),
    h('p', {}, 'If you opened index.html straight from the disk, serve the www folder instead (npm run play).')));
});
