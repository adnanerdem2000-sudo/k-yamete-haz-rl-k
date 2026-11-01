// Ultra kara kare sondası 2: görsel testin oyun içi akışı birebir (tohumlu rastgelelik, öğle ışığı, önce yüz sahnesi,
// sonra araç dışı). Kare karanlıksa AO / su yansıması / bloom tek tek kapatılarak kaynak bulunur; bileşik tamponlarda
// NaN/sonsuz değer sayılır (yarım duyarlıklı kayan nokta: üs 0x1F).
import { QUALITY_PRESETS } from '../../src/core/Settings.js';
export default async ({ page, url, evalJS, log, wait }) => {
  await page.addInitScript((preset) => {
    try { const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphics = { ...(s.graphics || {}), quality: 'ultra', ...preset, autoScale: false }; localStorage.setItem(k, JSON.stringify(s)); } catch { /* yoksay */ }
    let s = 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    window.__seed = (n) => { s = (n >>> 0) || 1; Math.random = rnd; };
  }, QUALITY_PRESETS.ultra);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game;
    g.ui.onLockChange = () => {};
    const { windUniforms } = await import('/src/world/Vegetation.js');
    window.__wind = windUniforms;
    window.__loop0 = g.loop;
    window.__freeze = () => { cancelAnimationFrame(g.raf); g.loop = () => {}; g.gfx.autoScale = () => {}; g.gfx.dynScale = 1; g.gfx.pixelRatio = g.gfx.basePixelRatio; g.gfx.resize(); };
    window.__clear = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
    window.__draw = (hour, cam) => {
      const T = 1000;
      g.env.weather = window.__clear;
      g.env.update(0.016, T, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      window.__wind.uTime.value = T;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, T);
    };
    window.__THREE = await import('three');
    g.ui.menus.opts.ai = 0;
    return g.ui.menus.startSingle();
  });
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.session, null, { timeout: 300000 });
  await page.waitForFunction(() => window.__game.phys && window.__game.phys.steps > 120, null, { timeout: 300000 }).catch(() => {});
  const r = await evalJS(page, async () => {
    const g = window.__game, S = g.session, cam = g.gfx.camera, THREE = window.__THREE;
    window.__freeze();
    document.getElementById('ui-root').style.display = 'none';
    const gl = g.gfx.renderer.getContext(), R = g.gfx.renderer;
    const lum = () => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
      return +(s / (w * h * 3)).toFixed(1);
    };
    // yarım duyarlıklı hedefte NaN/sonsuz sayısı
    const bad = (rt) => {
      if (!rt) return null;
      const w = rt.width, h = rt.height, type = rt.texture.type;
      if (type !== THREE.HalfFloatType && type !== THREE.FloatType) return 'tip ' + type;
      const arr = type === THREE.HalfFloatType ? new Uint16Array(w * h * 4) : new Float32Array(w * h * 4);
      try { R.readRenderTargetPixels(rt, 0, 0, w, h, arr); } catch (e) { return 'okunamadı ' + e.message; }
      let nan = 0, inf = 0, first = null;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (type === THREE.HalfFloatType) { if ((v & 0x7c00) === 0x7c00) { if (v & 0x3ff) { nan++; if (first === null) first = [(i >> 2) % w, Math.floor((i >> 2) / w), i & 3]; } else inf++; } }
        else if (Number.isNaN(v)) { nan++; if (first === null) first = [(i >> 2) % w, Math.floor((i >> 2) / w), i & 3]; } else if (!Number.isFinite(v)) inf++;
      }
      return { w, h, nan, inf, first };
    };
    const P = S.local.pos;
    const out = {};
    // 1) yüz sahnesi (görsel testteki gibi)
    window.__seed(23);
    {
      const yaw = S.local.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), hy = P.y + 1.6;
      cam.position.set(P.x + fx * 1.05, hy + 0.04, P.z + fz * 1.05); cam.lookAt(P.x, hy, P.z); cam.updateMatrixWorld();
      window.__draw(15, cam);
      out.face = lum();
    }
    // 2) araç dışı
    window.__seed(23);
    const v = S.vehicles.list.filter((q) => !q.wrecked && !q.water && !q.def.bike && !(S.world.buildingAt && S.world.buildingAt(q.pos.x, q.pos.z))).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))[0];
    v.root.updateMatrixWorld(true);
    const W = v.def.wid, Lh = v.def.len;
    const loc = (x, y, z) => v.root.localToWorld(new THREE.Vector3(x, y, z));
    cam.position.copy(loc(W * 1.5, 1.45, Lh * 1.25)); cam.lookAt(loc(0, 0.6, 0)); cam.updateMatrixWorld();
    g.world.cullInteriors(cam.position, 1);
    window.__draw(12, cam);
    out.car = { type: v.type, pos: cam.position.toArray().map((q) => +q.toFixed(1)), water: g.world.water.pickWater ? !!g.world.water.pickWater(cam.position) : '?' };
    out.carLum = lum();
    const C = g.gfx.composer;
    out.buffers = { read: bad(C.readBuffer), write: bad(C.writeBuffer) };
    const gp = g.gfx.gtaoPass;
    if (gp) out.gtao = { enabled: gp.enabled, gtaoRT: bad(gp.gtaoRenderTarget), pdRT: bad(gp.pdRenderTarget), normalRT: bad(gp.normalRenderTarget) };
    out.normalFixes = g.assets && g.assets.normalFixes;
    // parlama NaN koruması: kameranın önüne NaN yayan küçük bir ağ koy; kare kararmamalı
    {
      const mat = new THREE.ShaderMaterial({ uniforms: { uZero: { value: 0 } }, vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform float uZero; void main(){ gl_FragColor = vec4(uZero / uZero); }' });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), mat);
      const d = new THREE.Vector3(); cam.getWorldDirection(d);
      q.position.copy(cam.position).addScaledVector(d, 1.0); q.quaternion.copy(cam.quaternion);
      g.gfx.scene.add(q);
      window.__draw(12, cam);
      out.nanInjected = { lum: lum(), buffers: bad(C.readBuffer) };
      g.gfx.scene.remove(q); q.geometry.dispose(); mat.dispose();
      window.__draw(12, cam);
    }
    const Settings = (await import('/src/core/Settings.js')).Settings;
    const tries = [['ao kapalı', { ao: false }], ['su kapalı', { ao: true, waterRefl: false }], ['bloom kapalı', { ao: true, waterRefl: true, bloom: false }], ['hepsi açık', { ao: true, waterRefl: true, bloom: true }]];
    for (const [name, o] of tries) {
      Settings.setMany('graphics', o);
      window.__freeze();
      if (g.world.water) g.world.water._pickT = 0;
      window.__draw(12, cam);
      out[name] = lum();
      if (name === 'bloom kapalı') out.buffersNoBloom = { read: bad(C.readBuffer), write: bad(C.writeBuffer) };
    }
    return out;
  });
  log('ultra kara kare 2', r);
};
