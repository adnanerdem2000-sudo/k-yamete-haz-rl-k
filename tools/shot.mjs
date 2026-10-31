// Geliştirme yardımcısı: bir sayfayı başsız Chromium'da açıp ekran görüntüsü alır.
// Kullanım: node tools/shot.mjs <url> <çıktı.png> [bekleme_ms] [genişlik] [yükseklik] [js_ifadesi]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const [url, out = '/tmp/shot.png', waitMs = '4000', w = '1280', h = '720', expr] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(waitMs));
if (expr) {
  try { const r = await page.evaluate(expr); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); } catch (e) { logs.push('[eval-error] ' + e.message); }
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
console.log(logs.slice(-60).join('\n'));
await browser.close();
