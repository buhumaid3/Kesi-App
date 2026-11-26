// Motion v2: preset table checks (pure; no browser).
import { PRESETS, keyframes, DUR, EASE } from '../www/engine/motion.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
for (const [name, p] of Object.entries(PRESETS)) {
  for (const dir of ['in', 'out']) {
    const k = keyframes(name, dir, {});
    ok(Array.isArray(k.frames) && k.frames.length >= 2, `${name} ${dir} has frames`);
    ok(k.duration > 0 && typeof k.easing === 'string', `${name} ${dir} timing`);
    if (p.common) ok(k.duration <= 600, `${name} is on a common path and must be ≤ 600 ms (${k.duration})`);
    for (const f of k.frames) for (const prop of Object.keys(f)) ok(['transform', 'opacity', 'filter', 'offset', 'strokeDashoffset'].includes(prop), `${name}: only compositor-friendly properties (${prop})`);
    const r = keyframes(name, dir, {}, true);
    ok(r.duration <= DUR.tap, `${name} ${dir} under Reduce Motion is a fade or a cut (${r.duration} ms)`);
    ok(!r.frames.some(f => f.transform && f.transform !== 'none' && r.duration > 0), `${name} ${dir}: no movement under Reduce Motion`);
  }
}
ok(Object.values(EASE).every(e => typeof e === 'string'), 'easings are CSS strings');
let threw = false; try { keyframes('nope'); } catch { threw = true; } ok(threw, 'unknown preset throws');
console.log(fail ? `${fail} motion checks failed` : 'All motion checks passed.'); process.exit(fail ? 1 : 0);
