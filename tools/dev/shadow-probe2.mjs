// Gölge sondası 2: Orta kalitede orman sahnesi; gölge haritası boyutu, bitki gölge bandı ve sapma (bias) değişkeleri.
// Her değişke için alt yarının ortalama parlaklığı + standart sapması (desenli gölge → yüksek sapma) ve görüntü.
import fs from 'node:fs';
import { QUALITY_PRESETS } from '../../src/core/Settings.js';
export default async ({ page, url, evalJS, log }) => {
  const Q = process.env.PROBE_Q || 'medium';
  await page.addInitScript(([q, preset]) => {
    try { const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphics = { ...(s.graphics || {}), quality: q, ...preset, autoScale: false }; localStorage.setItem(k, JSON.stringify(s)); } catch { /* yoksay */ }
  }, [Q, QUALITY_PRESETS[Q]]);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const r = await evalJS(page, async () => {
    const g = window.__game, T = g.world.terrain, cam = g.gfx.camera, R = g.gfx.renderer, gl = R.getContext(), sun = g.env.sun;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    const { windUniforms } = await import('/src/world/Vegetation.js');
    const grab = () => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, s2 = 0, n = 0;
      for (let y = 0; y < Math.floor(h * 0.45); y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const l = (px[i] + px[i + 1] + px[i + 2]) / 3; s += l; s2 += l * l; n++; }
      const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x2 = c.getContext('2d'); const id = x2.createImageData(w, h);
      for (let y = 0; y < h; y++) id.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      x2.putImageData(id, 0, 0);
      return { mean: +mean.toFixed(1), sd: +sd.toFixed(1), png: c.toDataURL('image/png') };
    };
    const draw = (q) => {
      g.env.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
      g.env.envT = 0; g.env._envMs = 0;
      g.env.update(0.016, 1000, 10 * 60, cam.position, null);
      g.world.vegetation.last = null;
      g.world.vegetation.update(cam.position, 420, true, 1, q || g.settings.get('graphics.quality'));
      g.world.instancer.cull(cam.position, 420);
      windUniforms.uTime.value = 1000;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, 1000);
      return grab();
    };
    const c = [-262, 1.8, -150], t = [-205, 3, -105];
    cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]); cam.updateMatrixWorld();
    const setMap = (n) => { sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } };
    const out = { q: g.settings.get('graphics.quality'), bias: sun.shadow.bias, normalBias: sun.shadow.normalBias, radius: sun.shadow.radius, cam: { l: sun.shadow.camera.left, r: sun.shadow.camera.right, near: sun.shadow.camera.near, far: sun.shadow.camera.far } };
    const v = {};
    v.a_default = draw();
    setMap(4096); v.b_map4096 = draw(); setMap(2048);
    v.c_ultraBand = draw('ultra');
    const b0 = sun.shadow.bias, nb0 = sun.shadow.normalBias;
    sun.shadow.bias = -0.002; v.d_bias002 = draw(); sun.shadow.bias = b0;
    sun.shadow.normalBias = 0.12; v.e_nbias012 = draw(); sun.shadow.normalBias = nb0;
    out.v = {};
    const imgs = {};
    for (const [k, x] of Object.entries(v)) { out.v[k] = { mean: x.mean, sd: x.sd }; imgs[k] = x.png; }
    out.imgs = imgs;
    return out;
  });
  for (const [k, d] of Object.entries(r.imgs)) fs.writeFileSync(`/tmp/probe/shadow-${Q}-${k}.png`, Buffer.from(d.split(',')[1], 'base64'));
  delete r.imgs;
  log('gölge sondası 2', JSON.stringify(r));
};
