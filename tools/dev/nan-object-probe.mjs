// NaN nesne sondası: görsel testin "araç dışı" sahnesinde NaN veren pikselin üstündeki nesneyi bul (ışın), sahnede
// tekil dönüşümlü (determinant ~0 / NaN) ve sıfır uzunluklu/NaN normalli ağları listele. PROBE_Q=ultra|medium
import { QUALITY_PRESETS } from '../../src/core/Settings.js';
export default async ({ page, url, evalJS, log }) => {
  const Q = process.env.PROBE_Q || 'ultra';
  await page.addInitScript(([q, preset]) => {
    try { const k = 'kiyamet_settings_v1', s = JSON.parse(localStorage.getItem(k) || '{}'); s.graphics = { ...(s.graphics || {}), quality: q, ...preset, autoScale: false }; localStorage.setItem(k, JSON.stringify(s)); } catch { /* yoksay */ }
    let s = 1;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    window.__seed = (n) => { s = (n >>> 0) || 1; Math.random = rnd; };
  }, [Q, QUALITY_PRESETS[Q]]);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game;
    g.ui.onLockChange = () => {};
    const { windUniforms } = await import('/src/world/Vegetation.js');
    window.__wind = windUniforms;
    window.__freeze = () => { cancelAnimationFrame(g.raf); g.loop = () => {}; g.gfx.autoScale = () => {}; g.gfx.dynScale = 1; g.gfx.pixelRatio = g.gfx.basePixelRatio; g.gfx.resize(); };
    window.__draw = (hour, cam) => {
      g.env.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
      g.env.update(0.016, 1000, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      window.__wind.uTime.value = 1000;
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, 1000);
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
    const P = S.local.pos;
    window.__seed(23);
    const v = S.vehicles.list.filter((q) => !q.wrecked && !q.water && !q.def.bike && !(S.world.buildingAt && S.world.buildingAt(q.pos.x, q.pos.z))).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))[0];
    v.root.updateMatrixWorld(true);
    const W = v.def.wid, Lh = v.def.len;
    const loc = (x, y, z) => v.root.localToWorld(new THREE.Vector3(x, y, z));
    cam.position.copy(loc(W * 1.5, 1.45, Lh * 1.25)); cam.lookAt(loc(0, 0.6, 0)); cam.updateMatrixWorld();
    g.world.cullInteriors(cam.position, 1);
    window.__draw(12, cam);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.root.getWorldQuaternion(new THREE.Quaternion()));
    const out = { q: g.settings.get('graphics.quality'), car: { id: v.id, type: v.type, up: up.toArray().map((x) => +x.toFixed(3)), damage: v.damage, hp: v.hp, doors: v.doors ? Object.keys(v.doors) : null } };
    const path = (o) => { const a = []; for (let p = o; p && a.length < 6; p = p.parent) a.push(p.name || p.type); return a.join(' < '); };
    const scl = (o) => { const s = new THREE.Vector3(); o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.toArray().map((x) => +x.toFixed(4)); };
    // NaN pikselinin üstündeki nesneler (piksel, sol alt kökenli)
    const hits = [];
    for (const [px, py] of [[455, 267], [454, 266], [453, 265], [480, 270]]) {
      const ndc = new THREE.Vector2((px + 0.5) / 960 * 2 - 1, (py + 0.5) / 540 * 2 - 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
      const hs = rc.intersectObjects(S.world.scene ? S.world.scene.children : g.gfx.scene.children, true).slice(0, 4);
      hits.push({ px: [px, py], objs: hs.map((h) => ({ path: path(h.object), dist: +h.distance.toFixed(2), mat: h.object.material && (h.object.material.type + ':' + (h.object.material.name || '')), scale: scl(h.object), det: +h.object.matrixWorld.determinant().toExponential(2), faceN: h.face ? h.face.normal.toArray().map((x) => +x.toFixed(3)) : null })) });
    }
    out.hits = hits;
    // sahne taraması: görünür ağlar arasında tekil/NaN dönüşüm ve sıfır/NaN normal
    const bad = [];
    let meshes = 0;
    g.gfx.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      meshes++;
      const det = o.matrixWorld.determinant();
      const e = o.matrixWorld.elements;
      const nanM = e.some((x) => !Number.isFinite(x));
      const nrm = o.geometry && o.geometry.attributes.normal;
      let zeroN = 0, nanN = 0;
      if (nrm && !o.isInstancedMesh && nrm.count < 200000) {
        for (let i = 0; i < nrm.count; i++) {
          const x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i);
          if (!Number.isFinite(x + y + z)) nanN++; else if (x * x + y * y + z * z < 1e-12) zeroN++;
        }
      }
      let instBad = 0;
      if (o.isInstancedMesh) { const m = new THREE.Matrix4(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const d = m.determinant(); if (!Number.isFinite(d) || Math.abs(d) < 1e-9) instBad++; } }
      if (nanM || Math.abs(det) < 1e-9 || zeroN || nanN || instBad) {
        const c = o.geometry.boundingSphere ? o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld) : null;
        bad.push({ path: path(o), det: +det.toExponential(2), nanM, zeroN, nanN, instBad, scale: scl(o), mat: o.material && (o.material.type + ':' + (o.material.name || '')), distToCam: c ? +c.distanceTo(cam.position).toFixed(1) : null });
      }
    });
    out.meshes = meshes;
    out.bad = bad.sort((a, b) => (a.distToCam ?? 1e9) - (b.distToCam ?? 1e9)).slice(0, 25);
    out.badCount = bad.length;
    return out;
  });
  log('NaN nesne', JSON.stringify(r, null, 1));
};
