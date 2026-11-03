// Renders the iOS launch image from the title sequence's first frame (the case folder on the desk), so the app
// opens on exactly the picture the sequence starts from.   npm run splash   (needs the dev server: npm run play)
// Writes assets/splash.png and assets/splash-dark.png (2732 × 2732), then:  npm run ios:assets
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5173';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1366, height: 1366 }, deviceScaleFactor: 2 });
await page.goto(`${base}/title-preview.html?folder`);
await page.waitForSelector('body[data-ready]', { state: 'attached', timeout: 10000 });
for (const f of ['splash.png', 'splash-dark.png']) await page.screenshot({ path: path.join(root, 'assets', f) });
await b.close();
console.log('Wrote assets/splash.png and assets/splash-dark.png (2732 × 2732). Next:  npm run ios:assets');
