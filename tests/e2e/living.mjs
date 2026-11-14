// Yaşayan dünya testi: oyunda karga sürüleri ve duman sütunları (görüntü + gürültüyle ürkme kontrolü). → /tmp/liv-*.png
// Denetimler: yaşayan dünya kurulur (sürüler, kargalar, duman pufları); duman sütunları yükselir, pufların çoğu görünür ve
// şehir çekimi bir sütunu gösterir; 60 m'lik gürültü sürüyü ürkütür, kargalar yükselir; iki çekimde de çizim yapılır,
// karga çekiminde sürü görüntüdedir.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  const r = await evalJS(page, () => {
    const S = window.__game.session;
    if (!S || !S.living) return { ok: false };
    const g = window.__game, c = g.gfx.camera, T = S.world.terrain;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    // şehirde bir duman sütununa ve sürüye bakış
    const view = (x, z, h, tx, ty, tz) => { c.position.set(x, T.heightAt(x, z) + h, z); c.lookAt(tx, T.heightAt(tx, tz) + ty, tz); };
    for (let i = 0; i < 90; i++) { S.living.birds.update(1 / 30, (x, z) => T.heightAt(x, z)); S.living.smoke.update(1 / 30); }
    view(60, -40, 6, 140, 18, 5);
    g.env.update(0.016, g.time, 15 * 60, c.position, null);
    g.world.vegetation.update(c.position, 420, true, 1);
    g.gfx.render(0.016, g.time);
    // çizimden hemen sonra: çizim çağrısı, duman pufları (örnek matrislerinden): yükseklik, görünürlük, görüş alanı
    const calls = g.gfx.renderer.info.render.calls;
    c.updateMatrixWorld();
    const sm = S.living.smoke, sa = sm.mesh.instanceMatrix.array, pv = c.position.clone();
    const seen = (x, y, z) => { pv.set(x, y, z).project(c); return Math.abs(pv.x) <= 1 && Math.abs(pv.y) <= 1 && pv.z > -1 && pv.z < 1; };
    let smokeInView = 0, smokeTop = 0, smokeVis = 0;
    sm.puffs.forEach((p, i) => {
      const y = sa[i * 16 + 13];
      if (seen(sa[i * 16 + 12], y, sa[i * 16 + 14])) smokeInView++;
      smokeTop = Math.max(smokeTop, y - p.s.y);
      if (sm.alpha.array[i] > 0.05) smokeVis++;
    });
    const f = S.living.birds.flocks[0];
    const y0 = S.living.birds.mesh.instanceMatrix.array[13];
    S.emit({ k: 'noise', x: f.x, z: f.z, r: 60, src: 'test' });
    for (let i = 0; i < 60; i++) S.living.birds.update(1 / 30, (x, z) => T.heightAt(x, z));
    const y1 = S.living.birds.mesh.instanceMatrix.array[13];
    return { ok: true, flocks: S.living.birds.flocks.length, birds: S.living.birds.mesh.count, puffs: S.living.smoke.mesh.count, scare: +f.scare.toFixed(2), rise: +(y1 - y0).toFixed(1), calls, smokeTop: +smokeTop.toFixed(1), smokeVis, smokeInView };
  });
  log('yaşayan dünya', r);
  await shot(page, '/tmp/liv-city.png');
  const b2 = await evalJS(page, () => {
    const S = window.__game.session, g = window.__game, c = g.gfx.camera, T = S.world.terrain;
    c.position.set(100, T.heightAt(100, -20) + 30, 20); c.lookAt(100, T.heightAt(100, -20) + 42, -20);
    g.gfx.render(0.016, g.time);
    // çizimden hemen sonra: ilk sürünün (şehir) kargalarından kaçı görüş alanında (örnekler sürü sırasıyla dizili)
    const calls = g.gfx.renderer.info.render.calls;
    c.updateMatrixWorld();
    const B = S.living.birds, a = B.mesh.instanceMatrix.array, pv = c.position.clone(), n = B.flocks[0].n;
    let birdsInView = 0;
    for (let i = 0; i < n; i++) { pv.set(a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]).project(c); if (Math.abs(pv.x) <= 1 && Math.abs(pv.y) <= 1 && pv.z > -1 && pv.z < 1) birdsInView++; }
    return { calls, birdsInView, n };
  });
  log('karga çekimi', b2);
  await shot(page, '/tmp/liv-birds.png');
  const rr = r || {}, bb = b2 || {};
  check(rr.ok === true && rr.flocks > 0 && rr.birds >= rr.flocks && rr.puffs > 0, 'yaşayan dünya kurulmalı: karga sürüleri ve duman pufları olmalı', rr);
  // pufların fazı ömür boyunca yayılı: en yüksekleri ≈ 30–45 m, saydamlık > 0,05 olanlar ≈ %94; şehir çekimi doğrudan
  // (140, 5) sütununa bakar (26 puf)
  check(rr.smokeTop > 10 && rr.smokeVis >= rr.puffs / 2 && rr.smokeInView >= 10, 'duman sütunları yükselmeli (> 10 m), pufların çoğu görünür olmalı, şehir çekimi bir sütunu göstermeli', rr);
  // ürkme 0,8 eklenir, 2 sn'de 0,16 söner (≈ 0,64); yükselme ürkme × 22 m (± 3,6 m dalgalanma) → ≈ 10–18 m
  check(rr.scare > 0.3 && rr.rise > 4, '60 m\'lik gürültü sürüyü ürkütmeli ve ürken kargalar yükselmeli', rr);
  // karga çekimi: ürken sürü 36–62 m yarıçapa açılır, uzak yarısı görüntüde (Birds benzetimi, 3000 koşu: en az 4, ortanca 8)
  check(rr.calls > 0 && bb.calls > 0 && bb.birdsInView >= 2, 'iki çekimde de çizim yapılmalı; karga çekiminde sürü görüntüde olmalı', { sehir: rr.calls, karga: b2 });
};
