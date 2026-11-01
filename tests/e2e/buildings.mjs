// Binalar: dünyadaki HER binaya yürüyerek girilebilmeli. Her bina için bir dış kapının 2,2 m önüne ışınlanılır,
// kapı açılır (kilitliyse test için kilidi kaldırılır), kapıya doğru yürünür; oyuncu binanın içinde (S.local.inside)
// olmalı. Ek denetimler: kit kabuklu kulelerde tavan kamerayı içeride tutar; yeni binalarda konteyner var; dekor
// listesinde girilemeyen bina kalmadı; yeni binaların kapı/pencere kimlikleri bina adlı (eski kimlikler kaymaz).
// Oyun döngüsü durdurulur, sabit 1/60 sn adımlarla ilerletilir.
export default async ({ page, url, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  const ids = await evalJS(page, () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    const S = g.session;
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    S.time.minute = 12 * 60;
    window.__step = (frames, keys = []) => {
      const inp = g.input;
      for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); inp.endFrame(); }
    };
    // zombiler testi bölmesin: üst sınır 0, var olanlar kaldırılır
    S.zombies.cap = 0;
    for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    return S.world.buildings.map((b) => b.id);
  });
  const static_ = await evalJS(page, async () => {
    const { DECOR_BUILDINGS } = await import('/src/world/WorldLayout.js');
    const W = window.__game.session.world;
    const late = W.buildings.filter((b) => b.spec.localIds);
    const badIds = late.filter((b) => b.doors.some((d) => !d.id.startsWith(b.id + '.d')) || b.windows.some((w) => !w.id.startsWith(b.id + '.w'))).map((b) => b.id);
    return {
      bina: W.buildings.length, yeni: late.length, kit: W.buildings.filter((b) => b.kit).length,
      dekorBina: DECOR_BUILDINGS.filter((d) => /house|Building_/.test(d.model)).map((d) => d.model),
      yeniKonteynersiz: late.filter((b) => !b.containers.length).map((b) => b.id), kimlikHatali: badIds,
      eskiKapiSon: W.doors.filter((d) => /^d\d+$/.test(d.id)).length,
    };
  });
  log('binalar', static_);
  check(static_.dekorBina.length === 0, 'dekor listesinde girilemeyen ev/kule kalmamalı', static_);
  check(static_.kit === 11 && static_.yeni >= 17, 'şehir kuleleri ve yeni evler bina olarak kurulmalı', static_);
  check(static_.yeniKonteynersiz.length === 0, 'yeni binalarda konteyner olmalı', static_);
  check(static_.kimlikHatali.length === 0 && static_.eskiKapiSon === 240, 'yeni binaların kimlikleri bina adlı, eski 240 kapı kimliği aynı', static_);

  const fails = [], kitCam = [];
  for (const id of ids) {
    // 1) kapının önüne ışınla, kapıyı aç (kapı fiziği motoru mikro görevle yenilenir: adımlar ayrı değerlendirmede)
    const prep = await evalJS(page, (id) => {
      const S = window.__game.session, W = S.world, b = W.buildingById[id];
      const doors = b.doors.filter((d) => d.exterior).sort((a, c) => (a.kind === 'garage') - (c.kind === 'garage') || a.locked - c.locked);
      const d = doors[0];
      if (!d) return { id, err: 'dış kapı yok' };
      if (d.locked) d.locked = false; // test: kilit sistemi ayrı senaryolarda; burada yalnız girilebilirlik
      if (d.barricade) d.barricade = 0;
      const ox = d.center.x - d.inward.x * 2.2, oz = d.center.z - d.inward.z * 2.2;
      S.local.spawnAt(ox, W.physics.groundHeight(ox, oz, b.floorY + 2) + 0.05, oz, 0);
      S.local.camYaw = Math.atan2(d.inward.x, d.inward.z) + Math.PI;
      S.applyAction('door', { id: d.id, open: true }, S.localId);
      window.__cur = { id, d };
      return { id, door: d.id, kind: d.kind };
    }, id);
    if (prep.err) { fails.push(prep); continue; }
    await evalJS(page, () => window.__step(30));
    // 2) kapıya doğru yürü (en çok 4 sn), içeride mi
    const r = await evalJS(page, () => {
      const g = window.__game, S = g.session, { id, d } = window.__cur, b = S.world.buildingById[id];
      let inside = false, t = 0;
      for (; t < 240 && !inside; t += 10) {
        S.local.camYaw = Math.atan2(d.inward.x, d.inward.z) + Math.PI;
        window.__step(10, ['KeyW']);
        inside = S.local.inside === b;
      }
      window.__step(20, ['KeyW']);
      const cam = g.gfx.camera.position;
      const P = S.local.pos;
      return { id, door: d.id, kind: d.kind, inside: S.local.inside === b || inside, frames: t, kit: b.kit || null, camY: +cam.y.toFixed(2), ceil: +(b.floorY + b.tpl.H).toFixed(2), at: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)] };
    });
    if (!r.inside) fails.push(r);
    if (r.kit) kitCam.push(r);
  }
  log('girilemeyen', fails);
  log('kule kamerası', kitCam.map((k) => [k.id, k.camY, k.ceil]));
  check(fails.length === 0, 'her binaya kapıdan yürüyerek girilebilmeli', fails);
  check(kitCam.length === 11 && kitCam.every((k) => k.camY < k.ceil + 0.05), 'kule içinde kamera tavanın altında kalmalı', kitCam);
};
