// UAL kaynak kliplerinde kök/kalça hareketi taraması (aktarım öncesi çözümleme; geliştirme sunucusu gerekir)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:8080/tests/dev/retarget.html');
await page.waitForFunction(() => window.__ready);
for (const src of ['UAL1', 'UAL2']) {
  const out = await page.evaluate(async (src) => {
    const g = await (async () => { const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); const { MeshoptDecoder } = await import('../../vendor/meshopt/meshopt_decoder.module.js'); const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder); return L.loadAsync(`_preview/${src}.glb`); })();
    const res = [];
    for (const c of g.animations) {
      const rt = c.tracks.find((t) => t.name === 'root.position');
      const pt = c.tracks.find((t) => t.name === 'pelvis.position');
      const span = (t) => { if (!t) return null; const v = t.values, n = v.length / 3; return [0, 1, 2].map((k) => Math.round((v[(n - 1) * 3 + k] - v[k]) * 1000) / 1000); };
      const rng = (t) => { if (!t) return null; const v = t.values, n = v.length / 3; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i * 3 + k]); mx[k] = Math.max(mx[k], v[i * 3 + k]); } return mx.map((x, k) => Math.round((x - mn[k]) * 1000) / 1000); };
      res.push([c.name, Math.round(c.duration * 100) / 100, span(rt), rng(rt), span(pt), rng(pt)]);
    }
    return res;
  }, src);
  for (const r of out) console.log(src, JSON.stringify(r));
}
await browser.close();
