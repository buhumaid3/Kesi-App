// Text helpers: escaping, glossary terms, seeded tilt, names.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const pad3 = n => String(n).padStart(3, '0');

// A card always lies at the same angle (design doc §5.5): a hash of its id, within ±2.5°.
export function tilt(id, max = 2.5) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return ((h % 1000) / 1000 * 2 - 1) * max;
}

// Glossary: wrap every Swahili/Sheng term from the case's glossary in a tappable button. People's
// names are protected first, as the validator does, so "Riziki Chai" never offers a definition of chai.
export function makeGlossary(c) {
  const terms = (c.glossary || []).slice().sort((a, b) => b.term.length - a.term.length);
  const names = (c.people || []).flatMap(p => [p.name, ...p.name.split(/\s+/).filter(w => w.length > 3)]);
  const defs = new Map(terms.map(t => [t.term.toLowerCase(), t.def]));
  const re = terms.length ? new RegExp(`(^|[^\\p{L}])(${terms.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}])`, 'giu') : null;
  return {
    defs,
    rich(text, { inline = false } = {}) {
      let s = esc(text);
      if (!re) return s;
      const keep = [];
      for (const n of names) {
        if (!n) continue;
        const e = esc(n);
        s = s.split(e).join(`\u0000${keep.push(e) - 1}\u0000`);
      }
      s = s.replace(re, (m, pre, term) => {
        const d = defs.get(term.toLowerCase()); if (!d) return m;
        return `${pre}<button class="term" type="button" data-term="${esc(term.toLowerCase())}" aria-label="${esc(term)}: ${esc(d)}">${term}</button>${inline ? `<span class="term-inline"> (${esc(d)})</span>` : ''}`;
      });
      return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
    },
  };
}

export function personName(run, id) { return run.byId.get(id)?.name || id; }
export function thingName(run, id) {
  const x = run.byId.get(id);
  if (!x) return id;
  return x.name || x.title || x.text || id;
}
export function shortFact(text, max = 60) { return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : text; }
