// Aşama 4 teşhis: (1) caddedeki bej kutu nedir (ışın), (2) uzun tuğla binanın kırmızı zemin bandı (yakın plan + ışın)
export default async ({ page, url, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
    const { Papers } = await import('/src/world/StreetLife.js');
    const T = g.world.terrain;
    window.__papers = new Papers(g.scene, 40, (x, z) => T.heightAt(x, z), () => true);
    const P = window.__papers, c = { x: 100, z: -30 }; P.update(0.1, c, 1); P.gust = 1.3; P.gustT = 9; for (let i = 0; i < 18; i++) P.update(0.08, c, 1);
  });
  const render = (c, t, hour) => evalJS(page, ([c, t, hour]) => {
    const g = window.__game, cam = g.gfx.camera, T = g.world.terrain;
    cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]);
    g.world.vegetation.update(cam.position, 420, true, 1); g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420);
    g.env.update(0.016, g.time, hour * 60, cam.position, null); if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
    g.gfx.render(0.016, g.time);
  }, [c, t, hour]);
  const ray = (nx, ny) => evalJS(page, async ([nx, ny]) => {
    const THREE = await import('three');
    const g = window.__game, cam = g.gfx.camera, rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), cam);
    const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible).slice(0, 4);
    return hits.map((h) => { const mats = [].concat(h.object.material); const mi = (h.face && h.face.materialIndex) || 0; const mm = mats[mi] || mats[0]; const col = h.object.geometry.attributes.color; let vc = null; if (col && h.face) vc = [col.getX(h.face.a), col.getY(h.face.a), col.getZ(h.face.a)].map((v) => +v.toFixed(2)); return { obj: h.object.name, parent: h.object.parent && h.object.parent.name, type: h.object.type, inst: h.instanceId, mat: mm && mm.name, map: !!(mm && mm.map), color: mm && mm.color ? '#' + mm.color.getHexString() : null, vc, p: [Math.round(h.point.x), +h.point.y.toFixed(1), Math.round(h.point.z)], d: Math.round(h.distance) }; });
  }, [nx, ny]);
  await render([88, 1.8, -31], [112, 1.5, -30], 11);
  log('kutu ışını', await ray(0.0, -0.17));
  log('kutu ışını 2', await ray(0.0, -0.05));
  // uzun binalar
  const tall = await evalJS(page, () => { const W = window.__game.world; return W.buildings.filter((b) => b.tpl.H > 4.5).map((b) => ({ id: b.id, x: Math.round(b.spec.x), z: Math.round(b.spec.z), H: b.tpl.H, ext: b.tpl.style.ext, roof: b.tpl.roofType })); });
  log('uzun binalar', tall);
  const brick = await evalJS(page, () => {
    const W = window.__game.world, T = W.terrain;
    const b = W.buildings.filter((q) => q.tpl.H > 4.5 && q.tpl.style.ext === 'brick').sort((a, c) => c.tpl.H - a.tpl.H)[0];
    if (!b) return null;
    const fr = b.frame, c = fr.pt(b.tpl.w / 2, b.tpl.d + 7), t = fr.pt(b.tpl.w / 2, b.tpl.d);
    return { id: b.id, c: [c.x, 1.5, c.z], t: [t.x, 1.0, t.z], floorY: b.floorY, base: T.heightAt(t.x, t.z) };
  });
  log('tuğla bina', brick);
  if (brick) {
    await render(brick.c, brick.t, 14);
    await shot(page, '/tmp/s4d-brick-base.png');
    log('taban ışını', await ray(0.0, -0.1));
    log('üst ışını', await ray(0.0, 0.25));
  }
};
