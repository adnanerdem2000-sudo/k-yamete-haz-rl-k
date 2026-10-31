// Görsel regresyon (Aşama 8): 12 sabit sahne (menü dünyası; sabit saat, hava, rüzgâr ve su zamanı) çizilir, görüntü
// tests/visual/baseline/<ad>.png ile karşılaştırılır (sayfa içi tuval farkı: kanal farkı > 40/255 olan piksel oranı).
// Eşik: %2,5 (yazılım GPU'sunda deterministik; farklı GPU/sürücüde yeniden taban alınmalı).
// Kullanım: node tools/e2e.mjs visual      ·  taban almak: VISUAL_BASELINE=1 node tools/e2e.mjs visual
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = path.join(ROOT, 'tests/visual/baseline');
export const SCENES = [
  ['mahalle-cadde', [-262, 1.7, 182], [-230, 2.5, 160], 11],
  ['ev-on', [-250, 1.6, 150], [-262, 2.4, 140], 15],
  ['sehir-dukkan', [70, 1.7, -28], [96, 3, -36], 11],
  ['sehir-cadde', [140, 2.2, 32], [140, 2, -40], 17],
  ['hastane', [-70, 1.8, -20], [-88, 3, -45], 13],
  ['benzin', [40, 1.8, 290], [62, 2, 302], 12],
  ['orman', [-640, 2.0, 120], [-600, 3, 90], 12],
  ['kiyi', [330, 2.0, 300], [360, 1, 330], 10],
  ['liman', [280, 2.0, 260], [300, 3, 284], 14],
  ['ciftlik', [-590, 1.8, 150], [-600, 3, 166], 9],
  ['gece-sehir', [100, 2.0, -26], [150, 1, -31], 22.5],
  ['ic-mekan', null, null, 13],
];
export default async ({ page, url, evalJS, log, errors }) => {
  const baseline = !!process.env.VISUAL_BASELINE;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    g.gfx.dynScale = 1; g.gfx.pixelRatio = 1; g.gfx.resize();
    const { windUniforms } = await import('/src/world/Vegetation.js');
    window.__wind = windUniforms;
  });
  const results = {};
  for (const [name, c, t, hour] of SCENES) {
    const dataUrl = await evalJS(page, async ([name, c, t, hour]) => {
      const g = window.__game, T = g.world.terrain, cam = g.gfx.camera;
      g.env.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
      if (c) { cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]); g.world.setRoofHidden && g.world.setRoofHidden(null); }
      else { const b = g.world.buildings.find((q) => q.id === 'n1') || g.world.buildings.find((q) => q.rooms.some((r) => r.type === 'living')); const r = b.rooms.find((q) => q.type === 'living') || b.rooms[0]; cam.position.set(r.minX + 0.6, b.floorY + 1.5, r.minZ + 0.6); cam.lookAt((r.minX + r.maxX) / 2, b.floorY + 1.0, (r.minZ + r.maxZ) / 2); g.world.setRoofHidden && g.world.setRoofHidden(b); }
      g.world.vegetation.update(cam.position, 420, true, 1, 'medium');
      g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420);
      const fixedT = 1000; // sabit zaman: su ve rüzgâr animasyonu hep aynı karede
      g.env.update(0.016, fixedT, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      window.__wind.uTime.value = fixedT;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, fixedT);
      return g.gfx.renderer.domElement.toDataURL('image/png');
    }, [name, c, t, hour]);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.mkdirSync('/tmp/visual', { recursive: true });
    fs.writeFileSync(`/tmp/visual/${name}.png`, buf);
    const bp = path.join(BASE, name + '.png');
    if (baseline) { fs.mkdirSync(BASE, { recursive: true }); fs.writeFileSync(bp, buf); results[name] = 'taban alındı'; continue; }
    if (!fs.existsSync(bp)) { results[name] = 'taban yok'; continue; }
    // sayfa içinde karşılaştır: iki görüntü tuvale çizilir, piksel farkı sayılır
    const baseUrl = 'data:image/png;base64,' + fs.readFileSync(bp).toString('base64');
    const diff = await evalJS(page, async ([a, b]) => {
      const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1, why: 'boyut farkı', a: [ia.width, ia.height], b: [ib.width, ib.height] };
      const cv = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const A = cv(ia), B = cv(ib);
      let bad = 0, n = A.length / 4;
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > 40 || Math.abs(A[i + 1] - B[i + 1]) > 40 || Math.abs(A[i + 2] - B[i + 2]) > 40) bad++;
      return { ratio: bad / n, px: n };
    }, [dataUrl, baseUrl]);
    results[name] = +(diff.ratio * 100).toFixed(2) + '%' + (diff.why ? ' ' + diff.why : '');
    if (diff.ratio > 0.025) errors.push(`[assert] görsel fark ${name}: %${(diff.ratio * 100).toFixed(2)} (> %2,5) → /tmp/visual/${name}.png`);
  }
  log(baseline ? 'taban' : 'fark', results);
};
