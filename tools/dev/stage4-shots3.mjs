// Aşama 4 ek kontroller: uzun tuğla binanın kırmızı zemin bandı nedir (ışın ile nesne/malzeme), asma tabela yakın
// plan, uçuşan kâğıtlar (doğru kamera yüksekliği). → /tmp/s4c-*.png
export default async ({ page, url, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    const { HangingSigns, Papers } = await import('/src/world/StreetLife.js');
    const T = g.world.terrain, hang = [];
    (g.world.signSpots || []).forEach((sp, i) => {
      if (sp.kind !== 'sign' || i % 2) return;
      const side = (i >> 1) % 2 ? 1 : -1, ax = Math.cos(sp.ry) * side, az = -Math.sin(sp.ry) * side;
      hang.push({ x: sp.x + ax * 1.6, y: Math.min(sp.y - 0.2, T.heightAt(sp.x, sp.z) + 3.1), z: sp.z + az * 1.6, ry: sp.ry });
    });
    window.__hang = hang; window.__signs = new HangingSigns(g.scene, hang);
    window.__papers = new Papers(g.scene, 40, (x, z) => T.heightAt(x, z), () => true);
  });
  const render = (c, t, hour) => evalJS(page, ([c, t, hour]) => {
    const g = window.__game, cam = g.gfx.camera, T = g.world.terrain;
    cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]);
    g.world.vegetation.update(cam.position, 420, true, 1); g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420);
    window.__signs.update(0.4, 1.5);
    g.env.update(0.016, g.time, hour * 60, cam.position, null); if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
    g.gfx.render(0.016, g.time);
  }, [c, t, hour]);
  // 1) uzun tuğla bina: city-side görünümündeki kamera (120,-20 → 150,-30) ile ekran ortasına ışın
  await render([120, 1.8, -20], [150, 1.0, -30], 16);
  log('ışın', await evalJS(page, async () => {
    const THREE = await import('three');
    const g = window.__game, cam = g.gfx.camera, rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(0.35, -0.05), cam);
    const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible).slice(0, 3);
    return hits.map((h) => { const m = h.object.material; const mats = [].concat(m); const mi = h.face && h.face.materialIndex || 0; const mm = mats[mi] || mats[0]; const col = h.object.geometry.attributes.color; let vc = null; if (col && h.face) { vc = [col.getX(h.face.a), col.getY(h.face.a), col.getZ(h.face.a)].map((v) => +v.toFixed(2)); } return { obj: h.object.name, type: h.object.type, mat: mm && mm.name, map: !!(mm && mm.map), emissive: mm && mm.emissive ? '#' + mm.emissive.getHexString() : null, ei: mm && mm.emissiveIntensity, vc, p: [Math.round(h.point.x), +h.point.y.toFixed(1), Math.round(h.point.z)] }; });
  }));
  await render([150, 1.6, -18], [158, 1.0, -30], 16);
  await shot(page, '/tmp/s4c-brick-base.png');
  // 2) asma tabela yakın plan: ilk tabelanın 4 m önünden
  const hs = await evalJS(page, () => { const h = window.__hang[0]; return h && { x: h.x, y: h.y, z: h.z, ry: h.ry }; });
  log('asma tabela', hs);
  if (hs) {
    await evalJS(page, ([h]) => { const g = window.__game, cam = g.gfx.camera; cam.position.set(h.x + Math.sin(h.ry) * 4.5 + Math.cos(h.ry) * 1.5, h.y - 1.0, h.z + Math.cos(h.ry) * 4.5 - Math.sin(h.ry) * 1.5); cam.lookAt(h.x + Math.sin(h.ry) * 0.3, h.y - 0.7, h.z + Math.cos(h.ry) * 0.3); g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420); window.__signs.update(0.4, 1.5); g.env.update(0.016, g.time, 11 * 60, cam.position, null); g.gfx.render(0.016, g.time); }, [hs]);
    await shot(page, '/tmp/s4c-hanging-sign.png');
  }
  // 3) kâğıtlar: şehir caddesi, esinti
  await evalJS(page, () => { const P = window.__papers, c = { x: 100, z: -30 }; P.update(0.1, c, 1); P.gust = 1.3; P.gustT = 9; for (let i = 0; i < 18; i++) P.update(0.08, c, 1); });
  await render([88, 1.8, -31], [112, 1.5, -30], 11);
  await shot(page, '/tmp/s4c-papers.png');
};
