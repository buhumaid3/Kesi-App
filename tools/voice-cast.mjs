// Voice casting for every speaking character (design doc §10.4).
// 538 people speak across the 100 cases, and Google keeps at most 200 designed voices per project, so the
// game works like a radio-drama company: a repertory of designed Kenyan voices, grouped by gender and age,
// cast case by case so that no two people in the same case share a voice and nobody sounds like the
// person in the case before. Recurring characters keep one voice for the whole campaign.
import fs from 'node:fs';
import path from 'node:path';
import { characterKey, spokenText } from '../www/engine/voicekey.js';

// Gender for the speakers whose image brief and bio don't say (authored with the cases; first names).
const FEMALE = new Set(['Mercy Chebet', 'Wanjiru Gathoni', 'Nancy Akinyi', 'Mwikali Nzioka', 'Selina Waweru', 'Grace Adhiambo', 'Janet Achieng', 'Fatuma Ali',
  'Cynthia Awino', 'Sophie Adongo', 'Zaituni Omar', 'Chiku Rashidi (Mama Chiku)', 'Neema Chai', 'Leah Wawira', 'Gladys Chepkemoi', 'Ivy Njenga', 'Tabitha Wangui',
  'Nelly Chepkurui', 'Brenda Cherono', 'Agnetta Rutto', 'Peris Wanjugu', 'Pamela Mukhwana', 'Priscilla Kibiwott', 'Hannah Chesang', 'Benta Ayieko', 'Seline Awuor',
  'Rispa Nyamogo', 'Sabina Akeyo', 'Rose Ogolla', 'Turfosa Okal', 'Nyakerario Gati', 'Norah Ayuma', 'Lorna Anyim', 'Nkirote Mwiti', 'Mumbi Gachoki', 'Nasieku Mpaayei',
  'Dr. Nalangu Sipitiek', 'Naipanoi Lemiso', 'Dr. Joan Chelimo', 'Nashilu Sironka', 'Advocate Philomena Gakii', 'Faith Wanjiru', 'Rhoda Njoki', 'Josphine Nyaguthii', 'Grace Makena']);

const AGE_BANDS = [['young', 0, 29, 'in their twenties'], ['adult', 30, 44, 'in their thirties or early forties'], ['middle', 45, 59, 'in their late forties or fifties'], ['elder', 60, 200, 'in their sixties or older']];
const TIMBRES = ['warm, mid pitch, easy and natural', 'low and slightly rough, unhurried', 'bright and quick, a little restless', 'soft-spoken and measured',
  'deep and slow, with weight to every word', 'clear and direct, a working voice', 'light, with nervous energy', 'husky, tired, plain-spoken'];

export function genderOf(p) {
  const b = p.image?.brief || '';
  if (/\b(woman|girl|grandmother|mother|wife|widow)\b/i.test(b)) return 'f';
  if (/\b(man|boy|grandfather|father|husband)\b/i.test(b)) return 'm';
  if (FEMALE.has(p.name)) return 'f';
  const bio = p.bio || '';
  const f = (bio.match(/\b(she|her|hers|herself)\b/gi) || []).length, m = (bio.match(/\b(he|him|his|himself)\b/gi) || []).length;
  return f > m ? 'f' : 'm';
}
export const heritageOf = p => /Asian/.test(p.image?.brief || '') ? 'asian' : /European/.test(p.image?.brief || '') ? 'european' : null;
const bandOf = age => (AGE_BANDS.find(([, lo, hi]) => (age ?? 40) >= lo && (age ?? 40) <= hi) || AGE_BANDS[1])[0];
const norm = s => s.toLowerCase().replace(/^(dr|mr|mrs|ms|advocate|insp|ch\. insp|cpl|sgt|senior prosecutor|prosecutor|fr)\.?\s+/g, '').replace(/\s*\(.*\)/, '').trim();

export function loadCases(root) {
  const dir = path.join(root, 'www/cases');
  return fs.readdirSync(dir).filter(f => /^case-\d{3}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function buildCast(root) {
  const cases = loadCases(root);
  const camp = JSON.parse(fs.readFileSync(path.join(root, 'www/cases/_campaign.json'), 'utf8'));
  // People who must keep one voice across cases: the recurring cast and every face in imageContinuity.
  const fixed = new Map();
  for (const rc of camp.recurringCast) fixed.set(norm(rc.name), `rc-${rc.id.replace(/^rc_/, '')}`);
  for (const ic of camp.imageContinuity || []) if (!fixed.has(ic.key)) fixed.set(ic.key, `rc-${ic.key.replace(/\s+/g, '-')}`);

  // Size each bucket by the most same-bucket speakers in any one case, plus two for variety.
  const need = {};
  const speakersOf = c => c.people.filter(p => (c.interrogations || []).some(i => i.person === p.id));
  for (const c of cases) {
    const count = {};
    for (const p of speakersOf(c)) {
      if (fixed.has(norm(p.name))) continue;
      const k = `${heritageOf(p) ? heritageOf(p) + '-' : ''}${genderOf(p)}-${heritageOf(p) ? 'any' : bandOf(p.age)}`;
      count[k] = (count[k] || 0) + 1;
    }
    for (const [k, v] of Object.entries(count)) need[k] = Math.max(need[k] || 0, v);
  }
  const slots = {};
  for (const [k, v] of Object.entries(need).sort()) {
    const n = k.includes('any') ? v + 1 : v + 2;
    const [g, band] = k.split('-').slice(-2);
    const her = k.startsWith('asian') ? 'asian' : k.startsWith('european') ? 'european' : null;
    for (let i = 1; i <= n; i++) {
      const id = `pool-${k}-${i}`;
      const who = g === 'f' ? 'woman' : 'man';
      const age = her ? 'aged between thirty and sixty' : AGE_BANDS.find(b => b[0] === band)[3];
      const origin = her === 'asian' ? `A Kenyan Asian ${who}, born and raised in Nairobi, ${age}. A natural Kenyan English accent.`
        : her === 'european' ? `A Kenyan-born ${who} of European descent, ${age}. English with the softened, unhurried sound of a lifetime in Kenya.`
        : `A Kenyan ${who} ${age}. A natural Kenyan English accent, the way people speak English in Nairobi and the towns.`;
      slots[id] = { gender: g, band, heritage: her, description: `${origin} Voice: ${TIMBRES[(i - 1 + (g === 'f' ? 3 : 0)) % TIMBRES.length]}. Sounds like an ordinary person, never a performer.` };
    }
  }
  // Fixed voices: designed from the character themselves.
  const people = {};
  const assign = {};
  const used = {};
  let prevCase = new Set();
  for (const c of cases) {
    const n = c.meta.number, inCase = new Set();
    for (const p of speakersOf(c)) {
      const key = characterKey(n, p.id), g = genderOf(p), her = heritageOf(p);
      const fx = fixed.get(norm(p.name));
      let slot;
      if (fx) {
        slot = fx;
        if (!slots[slot]) slots[slot] = { gender: g, band: bandOf(p.age), heritage: her, fixed: true,
          description: `${her === 'asian' ? 'A Kenyan Asian' : her === 'european' ? 'A Kenyan-born European' : 'A Kenyan'} ${g === 'f' ? 'woman' : 'man'}, about ${p.age || 45}, ${p.occupation}. ${her === 'european' ? 'English softened by a lifetime in Kenya.' : 'A natural Kenyan English accent.'} Sounds like an ordinary person, never a performer.` };
      } else {
        const k = `${her ? her + '-' : ''}${g}-${her ? 'any' : bandOf(p.age)}`;
        const options = Object.keys(slots).filter(s => s.startsWith(`pool-${k}-`));
        const pick = options.filter(s => !inCase.has(s)).sort((a, b) => (prevCase.has(a) - prevCase.has(b)) || ((used[a] || 0) - (used[b] || 0)) || a.localeCompare(b))[0] || options[0];
        slot = pick;
      }
      inCase.add(slot); used[slot] = (used[slot] || 0) + 1;
      assign[key] = slot;
      people[key] = { case: n, id: p.id, name: p.name, age: p.age, occupation: p.occupation, gender: g, heritage: her, slot,
        stance: (c.interrogations || []).find(i => i.person === p.id)?.stance || 'cooperative' };
    }
    prevCase = inCase;
  }
  return { slots, assign, people, used };
}

// Every line a character speaks in a case, as { key-speaker, text, where, kind }.
export function characterLines(c) {
  const out = [];
  const facts = new Map(c.facts.map(f => [f.id, f]));
  for (const it of c.interrogations || []) {
    const sp = characterKey(c.meta.number, it.person);
    const add = (kind, text, where) => { const t = spokenText(kind, text); if (t) out.push({ speaker: sp, text: t, where: `case ${c.meta.number} ${it.person} ${where}`, kind }); };
    add('intro', it.intro, 'intro');
    for (const t of it.topics || []) add('reply', t.reply, `about ${t.about}`);
    for (const cl of it.claims || []) add('claim', facts.get(cl)?.text, `claim ${cl}`);
    for (const lc of it.laterClaims || []) add('claim', facts.get(lc.claim)?.text, `later claim ${lc.claim}`);
    for (const k of c.contradictions || []) if (k.claim && (it.claims || []).includes(k.claim)) add('reaction', k.reaction, `caught ${k.id}`);
  }
  return out;
}
