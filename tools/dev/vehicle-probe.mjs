// Araç denetimi: araç sayısı (terk edilmiş/bozuk/bagaj dolu), sahnedeki SpotLight sayısı, far havuzu ataması ve
// şehir görünümlerinde çizim çağrısı + ortalama kare süresi (oyun döngüsü durdurulur, kamera sabitlenir).
// Kullanım: node tools/scenario.mjs tools/dev/vehicle-probe.mjs <url>
export default async ({ page, url, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 200000 });
  await wait(3000);
  const info = await evalJS(page, () => {
    const g = window.__game, S = g.session;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    g.ui.onLockChange = () => {};
    const L = S.vehicles.list;
    let spots = 0;
    g.scene.traverse((o) => { if (o.isSpotLight) spots++; });
    const ab = L.filter((v) => v.abandoned);
    return {
      toplam: L.length, terk: ab.length, bozuk: ab.filter((v) => v.broken).map((v) => v.fault), turler: [...new Set(ab.map((v) => v.type))],
      bagajDolu: ab.filter((v) => v.trunk.some(Boolean)).length, yakit: ab.map((v) => Math.round(v.fuel / v.maxFuel * 100)),
      spot: spots, havuz: S.vehicles.lightPool.length,
    };
  });
  log('araçlar', info);
  // far havuzu: bir arabanın farları yakılınca havuz ışığı o araca yerleşmeli
  const pool = await evalJS(page, () => {
    const g = window.__game, S = g.session, v = S.vehicles.list.find((x) => x.abandoned && !x.broken);
    v.seats[0] = 'test'; v.lights = true;
    S.update(1 / 60);
    const lit = S.vehicles.lightPool.filter((l) => l.intensity > 0);
    const d = lit.length ? Math.round(lit[0].position.distanceTo(v.root.position) * 100) / 100 : null;
    v.seats[0] = null; v.lights = false; S.update(1 / 60);
    return { arac: v.id, tur: v.type, yanan: lit.length, uzaklik: d, sonra: S.vehicles.lightPool.filter((l) => l.intensity > 0).length };
  });
  log('far havuzu', pool);
  const views = { 'sehir-cadde': [95, -30, [0, 1.7, 0], [40, 3, 2]], 'sehir-otopark': [28, -48, [0, 2.5, 8], [0, 1, -14]], 'kaza-yeri': [3, -10, [0, 2.5, 10], [0, 1, -10]] };
  for (const [name, v] of Object.entries(views)) {
    const r = await evalJS(page, ([x, z, off, look]) => {
      const g = window.__game, S = g.session, T = g.world.terrain, c = g.gfx.camera, R = g.gfx.renderer;
      const y = T.heightAt(x + off[0], z + off[2]);
      S.local.spawnAt(x, T.heightAt(x, z) + 0.1, z, 0);
      S.update(1 / 60);
      c.position.set(x + off[0], y + off[1], z + off[2]);
      c.lookAt(x + look[0], T.heightAt(x + look[0], z + look[2]) + look[1], z + look[2]);
      c.updateMatrixWorld();
      g.gfx.render(0.016, g.time);
      R.info.autoReset = false; R.info.reset();
      g.gfx.render(0.016, g.time);
      const calls = R.info.render.calls;
      R.info.autoReset = true;
      const t0 = performance.now();
      for (let i = 0; i < 8; i++) g.gfx.render(0.016, g.time);
      R.getContext().finish();
      const ms = (performance.now() - t0) / 8;
      const near = S.vehicles.list.filter((q) => q.root.position.distanceTo(c.position) < 60).length;
      return { cagri: calls, ms: Math.round(ms), yakinArac: near };
    }, v);
    log(name, r);
  }
};
