// Araçlar 2 (Aşama 5): kabin/kapı/bagaj görselleri, kapı sallanması (bin/in), bagaj kapağı (panel), farlar,
// yüzeye göre tutunma (asfalt ↔ çim), zıplama/batma yok, çarpışma hasar görselleri (göçük, boya, cam), araçla
// kapıya çarpma. Oyun döngüsü durdurulur, sabit 1/60 sn adımlarla ilerletilir (physics senaryosu gibi).
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    const S = g.session;
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    window.__step = (frames, keys = [], each = null) => {
      const inp = g.input;
      for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of (typeof keys === 'function' ? keys(i) : keys)) inp.down.add(k); S.update(1 / 60); if (each) each(i); inp.endFrame(); }
    };
    // düz, engelsiz ve istenen yüzeyde şerit (uzunluk len, yarı genişlik hw)
    window.__flat = (len = 16, hw = 0.8, surf = null) => {
      const T = S.world.terrain, P = S.world.physics, p0 = S.local.pos;
      for (let r = 10; r < 400; r += 6) for (let a = 0; a < 6.28; a += 0.35) {
        const x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r, h = T.heightAt(x, z);
        if (T.waterLevelAt(x, z) > h - 0.2) continue;
        let ok = true;
        for (let s = -2; s <= len + 2 && ok; s += 1) {
          if (Math.abs(T.heightAt(x + s, z) - h) > 0.06 * Math.abs(s) + 0.05) ok = false;
          if (surf && T.surfaceAt(x + s, z) !== surf) ok = false;
          if (P.overlapsBox(x + s - 0.6, z - hw, x + s + 0.6, z + hw, h + 0.05, h + 2)) ok = false;
          if (S.world.buildingAt(x + s, z)) ok = false;
        }
        if (ok) return { x, z, y: h };
      }
      return null;
    };
    window.__car = (type) => { const v = S.vehicles.list.find((x) => x.type === type && !x.wrecked); if (v) { v.fuel = v.maxFuel; v.broken = false; } return v; };
  });
  // 1) görseller
  const vis = await evalJS(page, () => {
    const S = window.__game.session, v = window.__car('sedan');
    if (!v || !v.visuals) return null;
    let glass = 0, glassT = 0;
    v.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && /window|glass/i.test(m.name)) { glass++; if (m.transparent && m.opacity < 1) glassT++; } });
    return { kapi: v.visuals.doors.length, bagaj: !!v.visuals.trunk, direksiyon: !!v.visuals.steer, koltuk: v.visuals.seatMeshes.length, farCam: v.visuals.headGlows.length, cam: glass, saydamCam: glassT };
  });
  log('görseller', vis);
  check(vis && vis.kapi >= 2 && vis.bagaj && vis.direksiyon && vis.koltuk >= 6 && vis.farCam === 2, 'kabin/kapı/bagaj/far görselleri', vis);
  check(vis && vis.cam > 0 && vis.saydamCam === vis.cam, 'araç camları yarı saydam', vis);
  // 2) binme → kapı sallanır; bagaj paneli → kapak açılır; farlar
  const doors = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, v = window.__car('sedan');
    const f = window.__flat(40, 2.2, 'asphalt') || window.__flat(40, 2.2);
    if (!f) return { err: 'alan yok' };
    v.teleport(f.x, f.y + 0.6, f.z, Math.PI / 2);
    window.__step(60);
    S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
    let maxAng = 0;
    window.__step(20, [], () => { maxAng = Math.max(maxAng, ...v.visuals.doors.map((d) => d.ang)); });
    const open = maxAng;
    window.__step(130);
    const closed = Math.max(...v.visuals.doors.map((d) => d.ang));
    // farlar
    v.lights = true; window.__step(5);
    const glowOn = v.visuals.headGlows[0].mesh.material.emissiveIntensity, spotOn = v.headlights[0].intensity;
    v.lights = false; window.__step(5);
    const glowOff = v.visuals.headGlows[0].mesh.material.emissiveIntensity;
    // bagaj: in, bagaj panelini aç
    S.vehicles.exitLocal(); window.__step(10);
    S.vehicles.useOption(v, { act: 'trunk' });
    window.__step(60);
    const trunkOpen = v.visuals.trunk.ang, panel = S.ui.panel && S.ui.panel.name;
    S.ui.closePanel && S.ui.closePanel(); window.__step(90);
    const trunkClosed = v.visuals.trunk.ang;
    return { mode: pl.mode, open: +open.toFixed(2), closed: +closed.toFixed(2), glowOn, spotOn, glowOff, trunkOpen: +trunkOpen.toFixed(2), panel, trunkClosed: +trunkClosed.toFixed(2) };
  });
  log('kapı/bagaj/far', doors);
  check(doors.open > 0.5, 'binince kapı açılmalı', doors);
  check(doors.closed < 0.15, 'kapı 2,5 sn içinde kapanmalı', doors);
  check(doors.glowOn > 1 && doors.spotOn > 0 && doors.glowOff === 0, 'far ışıması F ile', doors);
  check(doors.trunkOpen > 0.6 && doors.trunkClosed < 0.2, 'bagaj kapağı panelle açılıp kapanmalı', doors);
  // 3) yüzey: asfalt ↔ çim hızlanma, zıplama/batma yok
  const surf = await evalJS(page, () => {
    const S = window.__game.session, T = S.world.terrain;
    const run = (type, surfWant) => {
      const v = window.__car(type); if (!v) return null;
      const f = window.__flat(70, 2.2, surfWant); if (!f) return { err: 'alan yok ' + surfWant };
      v.teleport(f.x, f.y + 0.6, f.z, Math.PI / 2);
      window.__step(90);
      const yRest = [], ground = [];
      window.__step(120, [], () => { yRest.push(v.pos.y); ground.push(Array.from({ length: v.ctrl.numWheels() }, (_, i) => v.ctrl.wheelIsInContact(i) ? 1 : 0).join('')); });
      const yVar = Math.max(...yRest) - Math.min(...yRest);
      S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
      const p0 = { x: v.pos.x, z: v.pos.z };
      let maxDy = 0, prevY = v.pos.y, minY = v.pos.y, maxSkid = 0;
      window.__step(180, ['KeyW'], () => { maxDy = Math.max(maxDy, Math.abs(v.pos.y - prevY)); prevY = v.pos.y; minY = Math.min(minY, v.pos.y); maxSkid = Math.max(maxSkid, v.skid || 0); });
      const dist = Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z);
      const r = { surf: v.surface, dist3s: +dist.toFixed(1), kmh: +(Math.abs(v.speed) * 3.6).toFixed(1), yVarRest: +yVar.toFixed(3), tekerYerde: ground[ground.length - 1], maxDy: +maxDy.toFixed(3), sink: +(yRest[0] - minY).toFixed(3), skid: +maxSkid.toFixed(2) };
      S.vehicles.exitLocal(); window.__step(10);
      return r;
    };
    return { sedanAsfalt: run('sedan', 'asphalt'), sedanCim: run('sedan', 'grass'), offroadCim: run('offroad', 'grass') };
  });
  log('yüzey', surf);
  const sa = surf.sedanAsfalt, sc = surf.sedanCim, oc = surf.offroadCim;
  check(sa && !sa.err && sa.surf === 'asphalt' && sc && !sc.err && sc.surf === 'grass', 'yüzey sınıfı asfalt/çim bulunmalı', surf);
  if (sa && sc && !sa.err && !sc.err) {
    check(sa.dist3s > sc.dist3s * 1.04, 'çimde hızlanma asfalttan düşük olmalı', { asfalt: sa.dist3s, cim: sc.dist3s });
    check(sa.yVarRest < 0.03 && sc.yVarRest < 0.03, 'dururken zıplama yok', { a: sa.yVarRest, c: sc.yVarRest });
    check(sa.tekerYerde === '1111' && sc.tekerYerde === '1111', 'dört teker yerde', { a: sa.tekerYerde, c: sc.tekerYerde });
    check(sa.maxDy < 0.12 && sc.maxDy < 0.15, 'sürüşte sıçrama yok', { a: sa.maxDy, c: sc.maxDy });
    check(sa.sink < 0.3 && sc.sink < 0.3, 'batma yok', { a: sa.sink, c: sc.sink });
  }
  if (oc && !oc.err && sc && !sc.err) check(oc.dist3s > sc.dist3s * 0.98, 'arazi aracı çimde aile arabasından geri kalmamalı', { offroad: oc.dist3s, sedan: sc.dist3s });
  // 4) çarpışma: duvara ~45 km/s → hasar, göçük, boya koyulaşması; ağır hasarda çatlak cam
  const crash = await evalJS(page, () => {
    const S = window.__game.session, v = window.__car('sedan');
    const f = window.__flat(44, 2.2); if (!f) return { err: 'alan yok' };
    v.health = v.maxHealth; v.visuals.resetBody(); v.visuals.applyDamage(1);
    v.teleport(f.x, f.y + 0.6, f.z, Math.PI / 2); window.__step(30);
    const P = S.world.physics;
    const wall = P.addBox(f.x + 34, f.z - 4, f.x + 35, f.z + 4, f.y - 1, f.y + 3, { kind: 'wall' });
    const col0 = v.bodyMats[0].color.clone();
    S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
    let hitV = 0;
    window.__step(300, ['KeyW'], () => { if (v.pos.x < f.x + 31) hitV = Math.max(hitV, Math.abs(v.speed)); });
    window.__step(30);
    const r = { atKmh: +(hitV * 3.6).toFixed(1), health: +v.health.toFixed(1), dents: v.visuals.dents, cracked: v.visuals.cracked, paintDark: +(col0.r - v.bodyMats[0].color.r).toFixed(3), gap: +(f.x + 34 - v.pos.x).toFixed(2) };
    // ağır hasar: doğrudan %20'ye düşür → çatlak cam + bozuk far
    S.applyAction('vehicle_set', { id: v.id, health: v.maxHealth * 0.2 }, S.localId); window.__step(2);
    r.heavy = { dents: v.visuals.dents, cracked: v.visuals.cracked, brokenHead: v.visuals.headGlows.filter((h) => h.broken).length };
    // onarım → sıfırlanır
    S.applyAction('vehicle_set', { id: v.id, health: v.maxHealth, wrecked: false }, S.localId); window.__step(2);
    r.repaired = { dents: v.visuals.dents, cracked: v.visuals.cracked };
    S.vehicles.exitLocal(); window.__step(10); P.remove(wall);
    return r;
  });
  log('çarpışma', crash);
  check(crash.atKmh > 25 && crash.health < 100, 'duvara çarpınca hasar almalı', crash);
  check(crash.dents >= 1 && crash.paintDark > 0.005, 'göçük ve boya koyulaşması', crash);
  check(crash.heavy && crash.heavy.cracked && crash.heavy.brokenHead === 1 && crash.heavy.dents >= 3, 'ağır hasar: çatlak cam, bozuk far, göçükler', crash);
  check(crash.repaired && crash.repaired.dents === 0 && !crash.repaired.cracked, 'onarım görselleri sıfırlar', crash);
  // 5) araçla kapıya çarpma: evin dış kapısı önünden 9 m geri, içeri sür
  const ram = await evalJS(page, () => {
    const S = window.__game.session, v = window.__car('pickup') || window.__car('sedan');
    const home = S.world.home;
    const d = home.doors.find((q) => q.exterior && !q.locked) || S.world.doors.find((q) => !q.locked && q.exterior);
    if (!d) return { err: 'kapı yok' };
    const T = S.world.terrain;
    const sx = d.center.x - d.inward.x * 10, sz = d.center.z - d.inward.z * 10;
    v.health = v.maxHealth; v.teleport(sx, T.heightAt(sx, sz) + 0.6, sz, Math.atan2(d.inward.x, d.inward.z));
    window.__step(30);
    const hp0 = d.hp;
    S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
    let hitV = 0;
    window.__step(240, ['KeyW'], () => { hitV = Math.max(hitV, Math.abs(v.speed)); });
    const r = { kapi: d.id, hp0, hp: d.hp, broken: d.broken, kmh: +(hitV * 3.6).toFixed(1), mesafe: +Math.hypot(v.pos.x - d.center.x, v.pos.z - d.center.z).toFixed(2) };
    S.vehicles.exitLocal(); window.__step(10);
    return r;
  });
  log('kapıya çarpma', ram);
  check(ram && !ram.err && (ram.hp < ram.hp0 || ram.broken), 'araç çarpınca kapı hasar almalı', ram);
  await evalJS(page, () => { const g = window.__game, S = g.session, v = window.__car('sedan'); const cam = g.gfx.camera; cam.position.set(v.pos.x + 3, v.pos.y + 1.6, v.pos.z + 4); cam.lookAt(v.pos.x, v.pos.y + 0.8, v.pos.z); g.gfx.render(0.016, g.time); void S; });
  await shot(page, '/tmp/veh2-car.png');
};
