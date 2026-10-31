// Aşama 4 görsel kontrolü (menü dünyası, kamera elle): cephe ayrıntıları, kırma çatılar, tente ve asma tabelalar,
// iç mekân dokusu (perde/lamba/halı/dağınıklık), gece iç ışıması, biyom bitkileri. → /tmp/s4-*.png
// Kullanım: node tools/scenario.mjs tools/dev/stage4-shots.mjs http://localhost:8092/   (SHOTS=ad,ad ile süzgeç)
export default async ({ page, url, evalJS, log, shot, errors }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const info = await evalJS(page, () => {
    const g = window.__game, W = g.world;
    const states = {}, roofs = {};
    for (const b of W.buildings) { states[b.state || '?'] = (states[b.state || '?'] || 0) + 1; roofs[b.tpl.roofType || '?'] = (roofs[b.tpl.roofType || '?'] || 0) + 1; }
    const d = W.dressing;
    return { bina: W.buildings.length, durum: states, cati: roofs, biyomBitki: W.biomePlants, icIz: d.indoor, izler: d.count, tabela: W.signSpots.length, pencereKirik: W.windows.filter((w) => w.initBroken).length, pencereTahta: W.windows.filter((w) => w.initBarricade).length };
  });
  log('aşama 4 dünya', info);
  if (!(info.cati.hip > 0)) errors.push('[assert] kırma çatı yok ' + JSON.stringify(info.cati));
  if (!(info.biyomBitki > 500)) errors.push('[assert] biyom bitkileri az ' + info.biyomBitki);
  if (!(info.icIz > 50)) errors.push('[assert] iç mekân dağınıklık izi az ' + info.icIz);
  if (!(info.pencereKirik + info.pencereTahta > 10)) errors.push('[assert] pencere başlangıç durumları yok');
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  // ev içi görünüm için: mahalledeki ilk yaşanır/yağmalanmış ev
  const views = [
    ['houses', [-262, 1.7, 182], [-230, 2.5, 160], 11],
    ['house-close', [-250, 1.6, 150], [-262, 2.4, 140], 15],
    ['city-shops', [70, 1.7, -28], [96, 3, -36], 11],
    ['city-side', [120, 1.8, -20], [150, 4, -30], 16],
    ['avenue', [140, 2.2, 32], [140, 2, -40], 17],
    ['coast', [330, 2.0, 300], [360, 1, 330], 10],
    ['mountain', [-350, 3, -380], [-320, 6, -420], 12],
  ];
  for (const [name, c, t, hour] of views) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    await evalJS(page, ([c, t, hour]) => {
      const g = window.__game, T = g.world.terrain, cam = g.gfx.camera;
      cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none';
      g.menu.group.visible = false;
      cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]);
      cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]);
      g.world.vegetation.update(cam.position, 420, true, 1);
      g.world.cullInteriors(cam.position, 1);
      g.world.instancer.cull(cam.position, 420);
      g.env.update(0.016, g.time, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      g.gfx.render(0.016, g.time);
    }, [c, t, hour]);
    await shot(page, `/tmp/s4-${name}.png`);
  }
  // iç mekân: yağmalanmış ya da barikatlı bir bina bul (mahalle), kamerayı oturma odasına koy (gündüz ve gece)
  const inside = await evalJS(page, () => {
    const g = window.__game, W = g.world;
    const pick = (st) => W.buildings.find((b) => b.state === st && b.spec.region === 'mahalle' && b.rooms.some((r) => r.type === 'living' || r.type === 'bedroom'));
    const b = pick('looted') || pick('barricaded') || pick('lived');
    if (!b) return null;
    const r = b.rooms.find((q) => q.type === 'living' || q.type === 'bedroom');
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    window.__s4 = { b, r, cx, cz };
    return { id: b.id, state: b.state, room: r.type, clutter: b.clutter.length, w: +(r.maxX - r.minX).toFixed(1), d: +(r.maxZ - r.minZ).toFixed(1) };
  });
  log('iç mekân', inside);
  if (inside) {
    for (const [name, hour] of [['interior-day', 13], ['interior-night', 23]]) {
      if (only && !only.some((o) => name.startsWith(o))) continue;
      await evalJS(page, (hour) => {
        const g = window.__game, cam = g.gfx.camera, { b, r, cx, cz } = window.__s4;
        const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
        cam.position.set(r.minX + 0.5, b.floorY + 1.55, r.minZ + 0.5);
        cam.lookAt(cx + w * 0.2, b.floorY + 1.1, cz + d * 0.2);
        g.world.setRoofHidden && g.world.setRoofHidden(b);
        g.world.cullInteriors(cam.position, 1);
        g.world.instancer.cull(cam.position, 420);
        g.env.update(0.016, g.time, hour * 60, cam.position, null);
        if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
        g.gfx.render(0.016, g.time);
      }, hour);
      await shot(page, `/tmp/s4-${name}.png`);
    }
  }
  log('ışıma', await evalJS(page, async () => { const { materials } = await import('/src/world/Geo.js'); return { emissive: +materials().emissive.emissiveIntensity.toFixed(2) }; }));
};
