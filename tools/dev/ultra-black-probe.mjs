// Ultra kara kare sondası: görsel testteki "araç dışı" sahnesi Ultra'da (AO + su yansıması) tamamen siyah çıktı.
// Aynı kamera konumunda AO ve su yansıması ayrı ayrı açılıp kapatılarak ortalama parlaklık ölçülür.
export default async ({ page, url, evalJS, log }) => {
  await page.addInitScript(() => {
    try { const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphics = { ...(s.graphics || {}), quality: 'ultra', shadows: true, bloom: true, grass: true, ao: true, waterRefl: true, renderScale: 1, autoScale: false, viewDistance: 700 }; localStorage.setItem(k, JSON.stringify(s)); } catch { /* yoksay */ }
  });
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => { const g = window.__game; g.ui.onLockChange = () => {}; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  const r = await evalJS(page, async () => {
    const g = window.__game, S = g.session, cam = g.gfx.camera, THREE = await import('three');
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    const P = S.local.pos;
    const v = S.vehicles.list.filter((q) => !q.wrecked && !q.water && !q.def.bike && !(S.world.buildingAt && S.world.buildingAt(q.pos.x, q.pos.z))).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))[0];
    v.root.updateMatrixWorld(true);
    const W = v.def.wid, L = v.def.len;
    cam.position.copy(v.root.localToWorld(new THREE.Vector3(W * 1.5, 1.45, L * 1.25))); cam.lookAt(v.root.localToWorld(new THREE.Vector3(0, 0.6, 0))); cam.updateMatrixWorld();
    const Settings = (await import('/src/core/Settings.js')).Settings;
    const gl = g.gfx.renderer.getContext();
    const lum = () => {
      g.gfx.render(0.016, 1000);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
      return +(s / (w * h * 3)).toFixed(1);
    };
    const out = { car: v.type, pos: [Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z)], water: g.world.water.pickWater(cam.position) ? 'su seçildi' : 'su yok' };
    for (const [ao, wr] of [[true, true], [false, true], [true, false], [false, false]]) {
      Settings.setMany('graphics', { ao, waterRefl: wr });
      g.world.water._pickT = 0;
      lum(); out[`ao=${ao} su=${wr}`] = lum();
    }
    // GTAO çıktısı tek başına: NaN var mı?
    Settings.setMany('graphics', { ao: true, waterRefl: false });
    const p = g.gfx.gtaoPass;
    out.gtaoParams = p ? { blend: p.blendIntensity, out: p.output, size: [p.width, p.height] } : null;
    return out;
  });
  log('ultra kara kare', r);
};
