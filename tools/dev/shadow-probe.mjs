// Gölge sondası: görsel testin orman ve bina içi sahnelerinde (menü dünyası) kalite seviyesine göre gölge var mı?
// Gölge açık/kapalı ortalama parlaklık farkı, gölge haritası boyutu, gölge kamerası konumu, gölge düşüren ağ sayısı.
// PROBE_Q=medium|ultra
import { QUALITY_PRESETS } from '../../src/core/Settings.js';
export default async ({ page, url, evalJS, log }) => {
  const Q = process.env.PROBE_Q || 'medium';
  await page.addInitScript(([q, preset]) => {
    try { const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphics = { ...(s.graphics || {}), quality: q, ...preset, autoScale: false }; localStorage.setItem(k, JSON.stringify(s)); } catch { /* yoksay */ }
  }, [Q, QUALITY_PRESETS[Q]]);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const r = await evalJS(page, async () => {
    const g = window.__game, T = g.world.terrain, cam = g.gfx.camera, R = g.gfx.renderer, gl = R.getContext();
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    const { windUniforms } = await import('/src/world/Vegetation.js');
    const lum = (y0, y1) => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, n = 0; for (let y = Math.floor(h * y0); y < Math.floor(h * y1); y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; s += px[i] + px[i + 1] + px[i + 2]; n++; }
      return +(s / (n * 3)).toFixed(1);
    };
    const draw = (hour) => {
      g.env.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
      g.env.envT = 0; g.env._envMs = 0;
      g.env.update(0.016, 1000, hour * 60, cam.position, null);
      windUniforms.uTime.value = 1000;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, 1000);
    };
    const out = { q: g.settings.get('graphics.quality'), enabled: R.shadowMap.enabled, type: R.shadowMap.type, autoUpdate: R.shadowMap.autoUpdate, sunCast: g.env.sun.castShadow, mapSize: g.env.sun.shadow.mapSize.x };
    // orman sahnesi (görsel test 06)
    const c = [-262, 1.8, -150], t = [-205, 3, -105];
    cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]); cam.updateMatrixWorld();
    const vd = g.settings.get('graphics.viewDistance');
    g.world.vegetation.update(cam.position, vd, g.settings.get('graphics.grass'), 1, g.settings.get('graphics.quality'));
    g.world.instancer.cull(cam.position, vd);
    draw(10);
    out.forest = { lumLower: lum(0, 0.45), hasMap: !!g.env.sun.shadow.map, mapRT: g.env.sun.shadow.map ? [g.env.sun.shadow.map.width, g.env.sun.shadow.map.height] : null, shadowCam: g.env.sun.position.toArray().map((v) => Math.round(v)), target: g.env.sun.target.position.toArray().map((v) => Math.round(v)) };
    let casters = 0, castersNear = 0;
    g.gfx.scene.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh) && o.castShadow) { casters++; if (o.isInstancedMesh && o.count > 0) castersNear++; } });
    out.forest.casters = casters; out.forest.instancedCasters = castersNear;
    out.forest.vegShadowBand = g.world.vegetation.meshes ? g.world.vegetation.meshes.filter((m) => m.band === 'shadow').map((m) => m.ims.reduce((a, im) => a + im.count, 0)).reduce((a, b) => a + b, 0) : null;
    // gölgeler kapalıyken aynı kare
    R.shadowMap.enabled = false; g.gfx.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m) m.needsUpdate = true; });
    draw(10);
    out.forest.lumNoShadow = lum(0, 0.45);
    R.shadowMap.enabled = true; g.gfx.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m) m.needsUpdate = true; });
    draw(10);
    out.forest.lumAgain = lum(0, 0.45);
    return out;
  });
  log('gölge sondası', JSON.stringify(r));
};
