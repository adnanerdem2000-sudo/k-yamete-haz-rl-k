// Araçlar 3: terk edilmiş arabalar gerçek araç (binilir, sürülür, bagajı dolu, arızalılar onarılır), iki yandan binme
// seçeneği, far ışığı havuzu (sahnede sabit 4 SpotLight), boya → onarım rengi korur, göçük boyalı gövde kabuğunda,
// park hâlindeki araçlar uyur, uzak araçta kabin ayrıntısı gizlenir, eski kayıtta olmayan araçlar yüklemede eklenir.
// Oyun döngüsü durdurulur, sabit 1/60 sn adımlarla ilerletilir.
export default async ({ page, url, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    const S = g.session;
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    window.__step = (frames, keys = []) => {
      const inp = g.input;
      for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); inp.endFrame(); }
    };
  });

  // 1) envanter: terk edilmiş arabalar gerçek araç; bagajlar dolu; arızalılar türüne uygun
  const inv = await evalJS(page, () => {
    const S = window.__game.session, L = S.vehicles.list, ab = L.filter((v) => v.abandoned);
    let spots = 0; window.__game.scene.traverse((o) => { if (o.isSpotLight) spots++; });
    return {
      toplam: L.length, terk: ab.length, bagajli: ab.filter((v) => v.trunk.some(Boolean)).length,
      bozuk: ab.filter((v) => v.broken).length, bozukIhtiyacli: ab.filter((v) => v.broken && v.needs && v.needs.length && v.fault).length,
      turler: [...new Set(ab.map((v) => v.type))], gecersizTur: ab.filter((v) => !v.def).length,
      yakitAraligi: [Math.min(...ab.map((v) => v.fuel / v.maxFuel)), Math.max(...ab.map((v) => v.fuel / v.maxFuel))],
      spot: spots, havuz: S.vehicles.lightPool.length,
    };
  });
  log('envanter', inv);
  check(inv.terk >= 15 && inv.gecersizTur === 0, 'terk edilmiş arabalar gerçek araç olarak doğmalı', inv);
  check(inv.bagajli >= Math.floor(inv.terk * 0.4), 'terk edilmiş arabaların çoğunun bagajında eşya olmalı', inv);
  check(inv.bozuk === inv.bozukIhtiyacli, 'arızalı terk edilmiş araç arıza adı ve parça ihtiyacı taşımalı', inv);
  check(inv.yakitAraligi[0] > 0.03 && inv.yakitAraligi[1] <= 0.31, 'terk edilmiş arabanın yakıtı az ama sıfır değil', inv);
  check(inv.spot === 4 && inv.havuz === 4, 'sahnede yalnız 4 far ışığı (havuz) olmalı', inv);

  // 2) iki yandan binme seçeneği, binip sürme, yakıt tüketimi
  const drive = await evalJS(page, () => {
    const S = window.__game.session, T = S.world.terrain;
    const v = S.vehicles.list.find((x) => x.abandoned && !x.broken && !x.wrecked && x.health / x.maxHealth > 0.5);
    if (!v) return { err: 'uygun araç yok' };
    const sides = {};
    for (const side of [1, -1]) {
      const px = v.pos.x + Math.cos(v.yaw) * v.def.wid * 1.0 * side, pz = v.pos.z - Math.sin(v.yaw) * v.def.wid * 1.0 * side;
      S.local.spawnAt(px, T.heightAt(px, pz) + 0.1, pz, 0);
      const opts = S.vehicles.options(v, S.local);
      const d = opts.find((o) => o.act === 'drive');
      sides[side] = d ? +Math.hypot(d.x - px, d.z - pz).toFixed(2) : null;
    }
    const fuel0 = v.fuel, p0 = v.pos.clone();
    S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
    window.__step(30);
    const seated = S.local.mode === 'drive' && S.vehicles.local === v;
    window.__step(240, ['KeyW']);
    const moved = +v.pos.distanceTo(p0).toFixed(1), sp = +Math.abs(v.speed).toFixed(1);
    window.__step(90, ['KeyS']);
    const fuel1 = v.fuel;
    S.vehicles.exitLocal && S.vehicles.exitLocal();
    window.__step(20);
    return { id: v.id, tur: v.type, sides, seated, moved, sp, harcanan: +(fuel0 - fuel1).toFixed(3), mod: S.local.mode };
  });
  log('sürüş', drive);
  check(drive.sides && drive.sides[1] != null && drive.sides[-1] != null && drive.sides[1] < 2.6 && drive.sides[-1] < 2.6, 'aracın iki yanından da "Sür" seçeneği yakında çıkmalı', drive);
  check(drive.seated, 'terk edilmiş arabaya binilebilmeli', drive);
  check(drive.moved > 8 && drive.harcanan > 0, 'terk edilmiş araba sürülebilmeli ve yakıt harcamalı', drive);

  // 3) arızalı terk edilmiş araba: arıza seçeneği → parça + İngiliz anahtarıyla onarılır
  const fix = await evalJS(page, async () => {
    const S = window.__game.session, T = S.world.terrain;
    const v = S.vehicles.list.find((x) => x.abandoned && x.broken);
    if (!v) return { yok: true };
    const px = v.pos.x + Math.cos(v.yaw) * v.def.wid, pz = v.pos.z - Math.sin(v.yaw) * v.def.wid;
    S.local.spawnAt(px, T.heightAt(px, pz) + 0.1, pz, 0);
    const opt = S.vehicles.options(v, S.local).find((o) => o.act === 'fix');
    const label = opt && opt.label;
    for (const [id, n] of v.needs) S.inventory.add(id, n, null, true);
    S.inventory.add('wrench', 1, null, true);
    S.vehicles.useOption(v, opt);
    for (let i = 0; i < 60 * 30 && S.interact.hold; i++) window.__step(1, ['KeyE']); // basılı tutma: E bırakılırsa iptal
    window.__step(10);
    return { id: v.id, label, broken: v.broken, fault: v.fault };
  });
  log('arıza onarımı', fix);
  check(fix.yok || (fix.label && /Onar/.test(fix.label) && fix.broken === false && !fix.fault), 'arızalı araba parça ve İngiliz anahtarıyla onarılmalı', fix);

  // 4) far havuzu: farı açık araca iki havuz ışığı yerleşir; kapanınca söner; bozuk far ışık vermez
  const pool = await evalJS(page, () => {
    const S = window.__game.session, V = S.vehicles;
    const v = V.list.find((x) => !x.water && !x.def.bike && x.health / x.maxHealth > 0.8 && !x.broken);
    v.seats[0] = 'test'; v.lights = true;
    window.__step(2);
    const lit = V.lightPool.filter((l) => l.intensity > 0);
    const near = lit.filter((l) => l.position.distanceTo(v.root.position) < v.def.len).length;
    // bir far bozulunca o yanın ışığı söner
    v.visuals.headGlows[0].broken = true;
    window.__step(2);
    const litBroken = V.lightPool.filter((l) => l.intensity > 0).length;
    v.visuals.headGlows[0].broken = false;
    v.seats[0] = null; v.lights = false;
    window.__step(2);
    return { tur: v.type, yanan: lit.length, yakin: near, bozukla: litBroken, sonra: V.lightPool.filter((l) => l.intensity > 0).length };
  });
  log('far havuzu', pool);
  check(pool.yanan === 2 && pool.yakin === 2, 'farı açık araca iki havuz ışığı yerleşmeli', pool);
  check(pool.bozukla === 1 && pool.sonra === 0, 'bozuk far ışık vermemeli, farlar kapanınca havuz sönmeli', pool);

  // 5) boya + hasar + onarım: onarım yeni boyayı korur; göçük boyalı gövde kabuğuna uygulanır
  const paint = await evalJS(page, () => {
    const S = window.__game.session;
    const v = S.vehicles.list.find((x) => x.type === 'sedan' && !x.abandoned) || S.vehicles.list.find((x) => x.bodyMats.length);
    S.applyAction('vehicle_set', { id: v.id, health: v.maxHealth }, S.localId);
    S.applyAction('vehicle_set', { id: v.id, paint: '#2266cc' }, S.localId);
    S.applyAction('vehicle_set', { id: v.id, health: v.maxHealth * 0.2 }, S.localId);
    const shell = v.visuals.bodyShell();
    const P = shell.geometry.attributes.position, p0 = shell.userData.pos0;
    let moved = 0; if (p0) for (let i = 0; i < P.array.length; i++) if (Math.abs(P.array[i] - p0[i]) > 1e-4) moved++;
    const shellPaint = [].concat(shell.material).some((m) => v.bodyMats.includes(m));
    const darkened = v.bodyMats[0].color.getHexString();
    S.applyAction('vehicle_set', { id: v.id, health: v.maxHealth, wrecked: false }, S.localId);
    return { tur: v.type, dents: v.visuals.dents, kabukBoyali: shellPaint, oynayanKose: moved, hasarliRenk: darkened, onarimRengi: v.bodyMats[0].color.getHexString() };
  });
  log('boya/göçük', paint);
  check(paint.kabukBoyali && paint.oynayanKose > 0, 'göçük boyalı gövde kabuğunda köşeleri itmeli', paint);
  check(paint.onarimRengi === '2266cc' && paint.hasarliRenk !== '2266cc', 'onarım yeni boyayı korumalı (eski renge dönmemeli)', paint);

  // 6) park hâlindeki araçlar uyur; uzak boş araçta kabin ayrıntısı gizli
  const park = await evalJS(page, () => {
    const S = window.__game.session, V = S.vehicles;
    window.__step(60 * 6);
    const cars = V.list.filter((v) => v.body && !v.water && !v.body.isKinematic() && !v.seats.some(Boolean));
    const asleep = cars.filter((v) => v.body.isSleeping()).length;
    const cam = window.__game.gfx.camera.position;
    const far = cars.filter((v) => v.root.position.distanceTo(cam) > 80);
    const farHidden = far.filter((v) => v.visuals && !v.visuals.group.visible && !v.tailMeshes[0].visible).length;
    return { park: cars.length, uyuyan: asleep, uzak: far.length, uzakGizli: farHidden };
  });
  log('park/ayrıntı', park);
  check(park.uyuyan >= Math.floor(park.park * 0.8), 'park hâlindeki araçların çoğu uyumalı (her adım uyandırılmamalı)', park);
  check(park.uzak > 5 && park.uzakGizli === park.uzak, 'uzak boş araçta kabin/kanat/stop lambası gizlenmeli', park);

  // 7) eski kayıt: terk edilmiş araçları içermeyen araç listesi yüklenince eksik doğum noktaları eklenir
  const mig = await evalJS(page, () => {
    const S = window.__game.session, V = S.vehicles;
    const before = V.list.length;
    const old = V.serialize().filter((o) => !o.abandoned);
    V.load(old);
    const after = V.list.length, ab = V.list.filter((v) => v.abandoned).length;
    return { once: before, eskiKayit: old.length, sonra: after, terk: ab };
  });
  log('kayıt göçü', mig);
  check(mig.sonra === mig.once && mig.terk > 0, 'eski kayıt yüklenince terk edilmiş araçlar eklenmeli', mig);
};
