// Tek dosyalık oyun: bütün kod (esbuild ile tek modül) ve bütün varlıklar (base64) tek bir HTML'e gömülür.
// Dosya çift tıklanarak (file://) açılabilir; sunucu gerekmez. Tarayıcılar file:// altında modül ve dosya
// yüklemeyi engellediği için oyunun varlık istekleri (fetch, <img>/<audio> src, CSS url) çalışma anında gömülü
// veriye yönlendirilir (sanal dosya sistemi).
// Kullanım: node tools/build-single.mjs [çıktı.html]   (varsayılan dist/KiyamettenOnce.html; esbuild gerekir)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist/KiyamettenOnce.html'));
const MIME = { '.glb': 'model/gltf-binary', '.kan': 'application/octet-stream', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// ---- 1) kod: tek ES modülü ('three', 'three/addons/…', 'rapier' import map'teki gibi çözülür)
const vendorPlugin = {
  name: 'vendor',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(ROOT, 'vendor/three/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(ROOT, 'vendor/three/addons', a.path.slice('three/addons/'.length)) }));
    b.onResolve({ filter: /^rapier$/ }, () => ({ path: path.join(ROOT, 'vendor/rapier/rapier.mjs') }));
  },
};
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'esm', target: 'es2022', minify: true,
  write: false, plugins: [vendorPlugin], logLevel: 'warning', legalComments: 'none',
});
const bundle = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// ---- 2) varlıklar: assets/ altındaki her dosya (lisans metinleri hariç)
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (MIME[path.extname(f.name).toLowerCase()]) files.push(p); } };
walk(path.join(ROOT, 'assets'));
const index = {};
const blobs = files.map((p, i) => { index[rel(p)] = ['v' + i, MIME[path.extname(p).toLowerCase()]]; return `<script type="application/octet-stream" id="v${i}">${fs.readFileSync(p).toString('base64')}</script>`; });

// ---- 3) CSS: url(...) → data: URI (yazı tipleri, yükleme ekranı görseli)
const cssPath = path.join(ROOT, 'src/ui/style.css');
const css = fs.readFileSync(cssPath, 'utf8').replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
  if (/^(data:|https?:|#)/.test(u)) return m;
  const p = path.resolve(path.dirname(cssPath), u);
  const mime = MIME[path.extname(p).toLowerCase()];
  return fs.existsSync(p) && mime ? `url(data:${mime};base64,${fs.readFileSync(p).toString('base64')})` : m;
});

// ---- 4) sanal dosya sistemi (oyun kodundan önce çalışır)
const vfs = `(function () {
  var idx = ${JSON.stringify(index)};
  var base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  var cache = {};
  function norm(u) {
    if (typeof u !== 'string' || /^(blob:|data:)/.test(u)) return null;
    var p = u;
    try { var a = new URL(u, base).href; if (a.indexOf(base) === 0) p = a.slice(base.length); } catch (e) { /* göreli değil */ }
    p = p.replace(/^\\.\\//, '').replace(/[?#].*$/, '');
    try { p = decodeURIComponent(p); } catch (e) { /* yoksay */ }
    return idx[p] ? p : null;
  }
  function bytes(p) { var s = atob(document.getElementById(idx[p][0]).textContent), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function url(u) { var p = norm(u); if (!p) return u; if (!cache[p]) cache[p] = URL.createObjectURL(new Blob([bytes(p)], { type: idx[p][1] })); return cache[p]; }
  window.__vfsUrl = url;
  var of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var p = norm(typeof input === 'string' ? input : input && input.url);
    if (p) { var b = bytes(p); return Promise.resolve(new Response(new Blob([b], { type: idx[p][1] }), { status: 200, headers: { 'Content-Type': idx[p][1], 'Content-Length': String(b.length) } })); }
    return of(input, init);
  };
  [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLSourceElement].forEach(function (C) {
    var d = C && Object.getOwnPropertyDescriptor(C.prototype, 'src');
    if (d && d.set) Object.defineProperty(C.prototype, 'src', { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, url(v)); } });
  });
  var sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (k, v) { if ((k === 'src' || k === 'href') && typeof v === 'string') v = url(v); return sa.call(this, k, v); };
  function fixCss(v) { return typeof v === 'string' && v.indexOf('url(') >= 0 ? v.replace(/url\\((['"]?)([^'")]+)\\1\\)/g, function (m, q, u) { return 'url(' + q + url(u) + q + ')'; }) : v; }
  ['backgroundImage', 'background'].forEach(function (k) {
    var d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, k);
    if (d && d.set) Object.defineProperty(CSSStyleDeclaration.prototype, k, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, fixCss(v)); } });
  });
  var OA = window.Audio;
  window.Audio = function (src) { return src === undefined ? new OA() : new OA(url(src)); };
  window.Audio.prototype = OA.prototype;
})();`;

// ---- 5) HTML
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, 'assets/img/favicon.svg')).toString('base64')}">`)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script src="vendor\/peerjs\.min\.js"[^>]*><\/script>/, () => `<script>${fs.readFileSync(path.join(ROOT, 'vendor/peerjs.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<script type="module" src="src\/main\.js"><\/script>/, () => `${blobs.join('\n')}\n<script>${vfs}</script>\n<script type="module">${bundle}</script>`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${rel(OUT)}: ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB · ${files.length} varlık · kod ${(bundle.length / 1048576).toFixed(2)} MB`);
