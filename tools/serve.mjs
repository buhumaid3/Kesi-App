// Local server for playtesting and the hotspot placement pass. No dependencies.
//
//   npm run play                 serve the game (www/) on port 5173
//   npm run place                also open the placement tool at /place, which saves hotspot
//                                positions straight into www/cases/case-NNN.json
//
// In a Codespace, the port appears under PORTS; open it in the browser (or a phone on the same
// account) to play. The placement tool writes files, so it only runs when started with --place.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');
const args = process.argv.slice(2);
const place = args.includes('--place');
const port = +(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg' };

function send(res, code, body, type = 'text/plain; charset=utf-8') { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); }

function serveFile(res, base, rel) {
  const file = path.resolve(base, '.' + rel);
  if (!file.startsWith(base)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err) return send(res, 404, 'Not found');
    const f = st.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(f, (e, data) => e ? send(res, 404, 'Not found') : send(res, 200, data, TYPES[path.extname(f)] || 'application/octet-stream'));
  });
}

// Save one location's hotspot positions: { case: 1, location: "loc_stage", positions: { hs_body: [62, 58], … } }
function saveHotspots(body) {
  const { case: n, location, positions } = JSON.parse(body);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error('bad case number');
  const file = path.join(www, 'cases', `case-${String(n).padStart(3, '0')}.json`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const loc = c.locations.find(l => l.id === location);
  if (!loc) throw new Error(`no location ${location} in case ${n}`);
  let changed = 0;
  for (const h of loc.hotspots || []) {
    const p = positions[h.id];
    if (!p) continue;
    const x = Math.round(Math.max(0, Math.min(100, p[0]))), y = Math.round(Math.max(0, Math.min(100, p[1])));
    if (!h.pos || h.pos[0] !== x || h.pos[1] !== y) { h.pos = [x, y]; changed++; }
  }
  loc.hotspotsPlaced = true;
  delete loc.hotspotsAuto;            // checked by a person now
  fs.writeFileSync(file, JSON.stringify(c, null, 2));
  return changed;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (place && req.method === 'POST' && url.pathname === '/api/hotspots') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try { const n = saveHotspots(body); console.log(`saved ${n} hotspot position(s)`); send(res, 200, JSON.stringify({ ok: true, changed: n }), TYPES['.json']); }
      catch (e) { send(res, 400, JSON.stringify({ ok: false, error: e.message }), TYPES['.json']); }
    });
    return;
  }
  if (place && (url.pathname === '/place' || url.pathname === '/place/')) return serveFile(res, path.join(root, 'tools'), '/place-hotspots.html');
  // Review pages and samples written by the generators (review/ is git-ignored).
  if (url.pathname.startsWith('/review/')) return serveFile(res, path.join(root, 'review'), decodeURIComponent(url.pathname.slice('/review'.length)));
  serveFile(res, www, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
}).listen(port, '0.0.0.0', () => {
  console.log(`Kesi on http://localhost:${port}/`);
  if (place) console.log(`Hotspot placement tool on http://localhost:${port}/place  (saves into www/cases/)`);
  console.log('In a Codespace: open the PORTS tab and click the globe icon next to the port. Ctrl+C to stop.');
});
