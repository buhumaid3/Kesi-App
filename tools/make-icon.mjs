// Renders the app icon (1024, no transparency, as Apple requires) and the launch screens (2732) from
// tools/icon.html into assets/, where  npx @capacitor/assets generate --ios  picks them up.
// Needs Playwright with Chromium (npx playwright install chromium, once).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const b = await chromium.launch();
for (const [mode, size, file] of [['icon', 1024, 'icon-only.png'], ['splash', 2732, 'splash.png'], ['splash-dark', 2732, 'splash-dark.png']]) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(path.join(root, 'tools/icon.html')).href + `?mode=${mode}`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(root, 'assets', file), omitBackground: false });
  console.log(`assets/${file}`);
}
await b.close();
