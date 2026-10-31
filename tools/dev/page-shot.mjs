// Bir geliştirme sayfasının ekran görüntüsü: node tools/dev/page-shot.mjs <yol?sorgu> <çıkış.png> [g] [y]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [p, out = '/tmp/page.png', w = '1600', h = '900'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error('[sayfa]', e.message));
await page.goto('http://localhost:8080/' + p);
await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await page.screenshot({ path: out });
console.log(out);
await browser.close();
