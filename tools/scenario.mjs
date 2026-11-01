// Senaryo koşucu: başsız Chromium'da oyunu açar, bir senaryo dosyasındaki adımları çalıştırır.
// Kullanım: node tools/scenario.mjs <senaryo.mjs> [url]
// Senaryo: export default async ({ page, shot, wait, evalJS, log, newPage }) => { ... }
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const [scenarioPath, url = 'http://localhost:8080/'] = process.argv.slice(2);
// Tarayıcı: varsayılan Playwright başsız kabuğu (chrome-headless-shell). PW_CHANNEL=chromium → tam Chromium'un yeni
// başsız modu; PW_ARGS="--a --b" → ek bayraklar. (Eski başsız kabukta iki sekme aura'nın sentetik fare hareketi
// fırtınasını tetikleyip tarayıcı sürecini şişiriyor; bkz. docs/DELIVERY_REPORT.md §2.)
const launchOpts = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(process.env.PW_ARGS || '').split(' ').filter(Boolean)] };
if (process.env.PW_CHANNEL) launchOpts.channel = process.env.PW_CHANNEL;
const browser = await chromium.launch(launchOpts);
const logs = [];
const errors = [];
const pages = [];
let mainCtx = null;
async function newPage(name = 'p' + pages.length, w = 960, h = 540, sameContext = false) {
  if (!mainCtx) mainCtx = await browser.newContext({ viewport: { width: w, height: h } });
  const ctx = sameContext || !pages.length ? mainCtx : await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  // yazılım GPU'sunda (özellikle iki sekmeli senaryolarda) sayfa yüklemesi 30 sn'yi aşabilir
  page.setDefaultNavigationTimeout(120000);
  page.on('console', (m) => { const t = `[${name}:${m.type()}] ${m.text()}`; logs.push(t); if (m.type() === 'error') errors.push(t); });
  page.on('pageerror', (e) => { const t = `[${name}:pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`; logs.push(t); errors.push(t); });
  // sekme çökmesi (ör. yazılım GPU'sunda bellek) başarısızlık sayılır
  page.on('crash', () => { const t = `[${name}:error] sekme çöktü (renderer crash)`; logs.push(t); errors.push(t); });
  // İşaretçi kilidi başsız kabukta kapatılır: kilitliyken Chromium her fare olayında imleci ortaya taşır
  // (MoveCursorToCenter → OnCursorMovedToRootLocation → PostSynthesizeMouseMove); başsız ekranda imleç hiç
  // hareket etmediği için bu sonsuz döngüye girer: saniyede ~40 bin sentetik fare olayı, tarayıcı ana iş parçacığı
  // %90 meşgul, iki sekmede tarayıcı süreci dakikada ~1-2 GB şişip OOM ile çöker, render tarafında GB'larca
  // MouseEvent çöpü (Oilpan). PW_POINTERLOCK=1 ile eski davranış.
  if (!process.env.PW_POINTERLOCK) {
    await page.addInitScript(() => {
      try {
        Element.prototype.requestPointerLock = function () {
          const el = this;
          setTimeout(() => { try { document.dispatchEvent(new Event('pointerlockerror')); } catch { /* yoksay */ } void el; }, 0);
          return Promise.reject(new Error('pointer lock test ortamında kapalı'));
        };
      } catch { /* yoksay */ }
    });
  }
  // grafik ayarlarını hafiflet (yazılım GPU)
  await page.addInitScript(() => {
    try {
      const k = 'kiyamet_settings_v1';
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = { ...(s.graphics || {}), quality: 'low', renderScale: 0.6, shadows: false, bloom: false, grass: false, viewDistance: 260 };
      localStorage.setItem(k, JSON.stringify(s));
    } catch { /* yoksay */ }
  });
  pages.push(page);
  return page;
}
const page = await newPage('p0');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// tarayıcı/sekme çökmesi ya da kapanması her durumda hata sayılır (yalnız 'crash' olayına güvenilmez)
const fatal = (msg) => { if (/Target crashed|has been closed|Browser closed|Target closed/i.test(msg)) errors.push('[fatal] ' + msg); };
const shot = async (p, file) => { try { await p.screenshot({ path: file, timeout: 120000 }); logs.push('[shot] ' + file); } catch (e) { const m = e.message.split('\n')[0]; logs.push('[shot-fail] ' + file + ' ' + m); fatal(m); } };
const evalJS = async (p, fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { const m = e.message.split('\n')[0]; logs.push('[eval-error] ' + m); fatal(m); return undefined; } };
const log = (...a) => logs.push('[log] ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const mod = await import(pathToFileURL(path.resolve(scenarioPath)).href);
let ok = true;
try {
  await mod.default({ page, url, shot, wait, evalJS, log, newPage, errors });
} catch (e) {
  ok = false;
  logs.push('[scenario-error] ' + e.message + '\n' + e.stack);
}
// önemli satırların hepsi (log/hata/görüntü), diğerlerinden yalnızca son 40'ı
const key = /^\[(log|shot|shot-fail|eval-error|scenario-error|p\d+:pageerror|p\d+:error)\]/;
const rest = logs.filter((l) => !key.test(l)).slice(-40);
console.log(logs.filter((l) => key.test(l) || rest.includes(l)).join('\n'));
console.log(`\n== ${ok && !errors.length ? 'OK' : 'HATA'} · ${errors.length} hata`);
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
