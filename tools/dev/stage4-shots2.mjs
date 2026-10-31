// Aşama 4 yakın plan görsel kontrolü (menü dünyası): bina çerçevesinden hesaplanan kamera konumları.
// kırma çatılı ev, ev ön cephesi (panjur/subasman/oluk), tenteli dükkân + asma tabela, tuğla köşe (köşe taşı,
// korniş), yangın merdiveni, gece iç mekân (lamba ışığı), dağ biyomu, uçuşan kâğıtlar. → /tmp/s4b-*.png
export default async ({ page, url, evalJS, log, shot, errors }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, async () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    g.menu.group.visible = false;
    const { HangingSigns, Papers } = await import('/src/world/StreetLife.js');
    const T = g.world.terrain, hang = [];
    (g.world.signSpots || []).forEach((sp, i) => {
      if (sp.kind !== 'sign' || i % 2) return;
      const side = (i >> 1) % 2 ? 1 : -1, ax = Math.cos(sp.ry) * side, az = -Math.sin(sp.ry) * side;
      hang.push({ x: sp.x + ax * 1.6, y: Math.min(sp.y - 0.2, T.heightAt(sp.x, sp.z) + 3.1), z: sp.z + az * 1.6, ry: sp.ry });
    });
    window.__signs = new HangingSigns(g.scene, hang);
    window.__papers = new Papers(g.scene, 40, (x, z) => T.heightAt(x, z), () => true);
    window.__hang = hang.length;
  });
  log('asma tabela', await evalJS(page, () => window.__hang));
  const render = (c, t, hour) => evalJS(page, ([c, t, hour]) => {
    const g = window.__game, cam = g.gfx.camera;
    cam.position.set(c[0], c[1], c[2]); cam.lookAt(t[0], t[1], t[2]);
    g.world.vegetation.update(cam.position, 420, true, 1);
    g.world.cullInteriors(cam.position, 1);
    g.world.instancer.cull(cam.position, 420);
    window.__signs.update(0.4, 1.5);
    g.env.update(0.016, g.time, hour * 60, cam.position, null);
    if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
    g.gfx.render(0.016, g.time);
  }, [c, t, hour]);
  // bina çerçevesinden kamera: pick(b) → {c,t}
  const views = await evalJS(page, () => {
    const g = window.__game, W = g.world, T = W.terrain;
    const out = [];
    const cam = (b, tx, tz, hAdd, lx, lz, lh) => { const fr = b.frame, c = fr.pt(tx, tz), t = fr.pt(lx, lz); return { c: [c.x, T.heightAt(c.x, c.z) + hAdd, c.z], t: [t.x, b.floorY + lh, t.z] }; };
    const hip = W.buildings.find((b) => b.tpl.roofType === 'hip' && b.spec.region === 'mahalle');
    if (hip) out.push(['hip-house', hip.id, cam(hip, hip.tpl.w / 2 - 5, hip.tpl.d + 10, 2.2, hip.tpl.w / 2, hip.tpl.d / 2, 2.2), 11]);
    const gable = W.buildings.find((b) => b.tpl.roofType === 'gable' && b.spec.region === 'mahalle' && b.id !== 'home');
    if (gable) out.push(['house-front', gable.id, cam(gable, gable.tpl.w / 2, gable.tpl.d + 6, 1.6, gable.tpl.w / 2, gable.tpl.d, 1.5), 10]);
    const shop = W.buildings.find((b) => b.awning);
    if (shop) out.push(['shop-awning', shop.id, cam(shop, shop.tpl.w / 2 + 4, shop.tpl.d + 8, 1.7, shop.tpl.w / 2, shop.tpl.d, 2.2), 11]);
    const brick = W.buildings.filter((b) => b.tpl.style.ext === 'brick' && b.tpl.roofType === 'flat' && b.spec.region === 'sehir').sort((a, b) => b.tpl.H - a.tpl.H)[0];
    if (brick) {
      out.push(['brick-corner', brick.id, cam(brick, -7, brick.tpl.d + 7, 1.7, brick.tpl.w * 0.3, brick.tpl.d * 0.5, brick.tpl.H * 0.5), 15]);
      out.push(['brick-left', brick.id, cam(brick, -9, brick.tpl.d / 2, 1.7, 0, brick.tpl.d / 2, brick.tpl.H * 0.5), 15]);
      out.push(['brick-right', brick.id, cam(brick, brick.tpl.w + 9, brick.tpl.d / 2, 1.7, brick.tpl.w, brick.tpl.d / 2, brick.tpl.H * 0.5), 15]);
    }
    return out;
  });
  for (const [name, id, v, hour] of views) { log(name, id); await render(v.c, v.t, hour); await shot(page, `/tmp/s4b-${name}.png`); }
  // gece iç mekân: yağmalanmış ev oturma odası, lamba ışığı
  const inside = await evalJS(page, () => {
    const W = window.__game.world;
    const b = W.buildings.find((q) => q.state === 'looted' && q.spec.region === 'mahalle' && q.rooms.some((r) => r.type === 'living'));
    if (!b) return null;
    const r = b.rooms.find((q) => q.type === 'living');
    W.setRoofHidden && W.setRoofHidden(b);
    return { c: [r.minX + 0.6, b.floorY + 1.5, r.minZ + 0.6], t: [(r.minX + r.maxX) / 2 + 0.5, b.floorY + 1.0, (r.minZ + r.maxZ) / 2 + 0.5], lamps: b.lamps.length };
  });
  log('iç gece', inside);
  if (inside) {
    await render(inside.c, inside.t, 23);
    log('ışık havuzu', await evalJS(page, () => window.__game.env.lightPool.filter((l) => l.intensity > 0).map((l) => ({ i: +l.intensity.toFixed(1), r: l.distance }))));
    await shot(page, '/tmp/s4b-interior-night.png');
  }
  // dağ biyomu: dağ platosunda eğimi düşük, bitki yoğun bir nokta
  const mtn = await evalJS(page, async () => {
    const { REGIONS } = await import('/src/world/WorldLayout.js');
    const W = window.__game.world, T = W.terrain, reg = REGIONS.find((r) => r.id === 'dag') || REGIONS.find((r) => r.theme === 'mountain');
    if (!reg) return null;
    const [x0, z0, x1, z1] = reg.plateau;
    const inst = W.vegetation.instances;
    let best = null;
    for (let x = x0 + 10; x < x1 - 10; x += 12) for (let z = z0 + 10; z < z1 - 10; z += 12) {
      if (T.slopeAt(x, z) > 0.3) continue;
      let n = 0; for (const p of inst) if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25) n++;
      if (!best || n > best.n) best = { x, z, n };
    }
    if (!best) return null;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dx = cx - best.x, dz = cz - best.z, l = Math.hypot(dx, dz) || 1;
    return { c: [best.x, T.heightAt(best.x, best.z) + 2.2, best.z], t: [best.x + dx / l * 20, T.heightAt(best.x + dx / l * 20, best.z + dz / l * 20) + 1, best.z + dz / l * 20], n: best.n, reg: reg.id };
  });
  log('dağ', mtn && { n: mtn.n, reg: mtn.reg });
  if (mtn) { await render(mtn.c, mtn.t, 12); await shot(page, '/tmp/s4b-mountain.png'); }
  // uçuşan kâğıtlar: şehir caddesi, esinti zorla
  await evalJS(page, () => { const P = window.__papers; const c = { x: 100, z: -30 }; P.update(0.1, c, 1); P.gust = 1.3; P.gustT = 9; for (let i = 0; i < 25; i++) P.update(0.08, c, 1); });
  const flying = await evalJS(page, () => window.__papers.items.filter((p) => p.alive && p.air > 0).length);
  log('havadaki kâğıt', flying);
  if (!(flying > 3)) errors.push('[assert] esintide kâğıt kalkmadı ' + flying);
  await render([92, 1.9, -32], [112, 1.0, -30], 11);
  await shot(page, '/tmp/s4b-papers.png');
};
