// Fizik ölçüm testi: oyun döngüsü durdurulur, oturum sabit 1/60 sn adımlarla ilerletilir.
// Ölçülenler: yürüme/koşma hızı, zıplama yüksekliği ve süresi, düşme hasarı, basamak çıkma,
// eğik yüzeyde durma, eşya düşürme/yerleşme, fiziksel nesneler, araç hızlanma/fren/dönüş/devrilme.
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  // döngüyü durdur, sabit adım yardımcılarını kur
  await evalJS(page, () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf);
    g.loop = () => {};
    const S = g.session;
    window.__step = (frames, keys = [], each = null) => {
      const inp = g.input;
      for (let i = 0; i < frames; i++) {
        inp.down.clear();
        for (const k of (typeof keys === 'function' ? keys(i) : keys)) inp.down.add(k);
        S.update(1 / 60);
        if (each) each(i);
        inp.endFrame();
      }
    };
    window.__press = (code) => { g.input.pressed.add(code); };
    // düz, engelsiz bir alan bul (oyuncu yakınında)
    window.__flat = (len = 16, hw = 0.8) => {
      const T = S.world.terrain, P = S.world.physics;
      const p0 = S.local.pos;
      for (let r = 10; r < 220; r += 6) {
        for (let a = 0; a < 6.28; a += 0.4) {
          const x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r;
          const h = T.heightAt(x, z);
          if (T.waterLevelAt(x, z) > h - 0.2) continue;
          let ok = true;
          for (let s = -2; s <= len + 2 && ok; s += 1) {
            if (Math.abs(T.heightAt(x + s, z) - h) > 0.06 * Math.abs(s) + 0.05) ok = false;
            if (P.overlapsBox(x + s - 0.6, z - hw, x + s + 0.6, z + hw, h + 0.05, h + 2)) ok = false;
            if (hw > 1 && S.props.props.some((p) => { if (!p.alive) return false; const t = p.d.body.translation(); return Math.abs(t.x - x - s) < 1.2 && Math.abs(t.z - z) < hw + 0.6; })) ok = false;
            if (S.world.buildingAt(x + s, z)) ok = false;
          }
          if (ok) return { x, z, y: h };
        }
      }
      return null;
    };
  });
  const res = {};
  // ---- yürüme / koşma
  res.walk = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const f = window.__flat(20);
    if (!f) return 'düz alan yok';
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(30);
    const y0 = pl.pos.y;
    const x0 = pl.pos.x;
    window.__step(120, ['KeyW']);
    const walk = (pl.pos.x - x0) / 2;
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(20);
    const x1 = pl.pos.x;
    S.localStats.stamina = 100;
    window.__step(120, ['KeyW', 'ShiftLeft']);
    const sprint = (pl.pos.x - x1) / 2;
    // durma mesafesi
    const xs = pl.pos.x;
    window.__step(60);
    const stop = pl.pos.x - xs;
    return { at: [f.x.toFixed(1), f.z.toFixed(1)], groundGap: +(y0 - S.world.terrain.heightAt(f.x, f.z)).toFixed(3), walk: +walk.toFixed(2), sprint: +sprint.toFixed(2), stopDist: +stop.toFixed(2), mode: pl.mode };
  });
  log('yürüme', res.walk);
  // ---- zıplama
  res.jump = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const f = window.__flat(4);
    pl.spawnAt(f.x, f.y + 0.05, f.z, 0);
    window.__step(30);
    S.localStats.stamina = 100;
    const y0 = pl.pos.y;
    let peak = y0, air = 0, landed = -1;
    window.__press('Space');
    window.__step(90, [], (i) => { peak = Math.max(peak, pl.body.feet.y); if (!pl.onGround) air++; else if (air > 0 && landed < 0) landed = i; });
    return { height: +(peak - y0).toFixed(3), airTime: +(air / 60).toFixed(3), endGap: +(pl.pos.y - y0).toFixed(3), mode: pl.mode };
  });
  log('zıplama', res.jump);
  // ---- takla (koşarken eğil)
  res.roll = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const f = window.__flat(14);
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(20);
    S.localStats.stamina = 100;
    window.__step(40, ['KeyW', 'ShiftLeft']);
    const x0 = pl.pos.x, st0 = S.localStats.stamina;
    window.__press('KeyC');
    let rolled = false, minH = 9;
    window.__step(50, ['KeyW', 'ShiftLeft'], () => { if (pl.roll) rolled = true; minH = Math.min(minH, pl.body.height); });
    return { rolled, dist: +(pl.pos.x - x0).toFixed(2), stamina: +(st0 - S.localStats.stamina).toFixed(1), capsuleMin: minH, endMode: pl.mode, endHeight: pl.body.height };
  });
  log('takla', res.roll);
  // ---- düşme hasarı
  res.fall = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const out = [];
    for (const hgt of [2.5, 5, 9]) {
      const f = window.__flat(4);
      S.localStats.health = 100;
      pl.spawnAt(f.x, f.y + hgt, f.z, 0);
      pl.fallStartY = f.y + hgt;
      window.__step(150);
      out.push({ h: hgt, hp: +S.localStats.health.toFixed(1), gap: +(pl.pos.y - f.y).toFixed(3) });
    }
    S.localStats.health = 100;
    S.localStats.cond.injury = 0;
    return out;
  });
  log('düşme', res.fall);
  // ---- basamak / veranda: ev girişine yürü (verandaya basamak çıkma)
  res.step = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    // bir basamak kutusu oluştur: 0.35 m ve 0.6 m yükseklikte iki blok
    const f = window.__flat(14);
    const P = S.world.physics;
    const b1 = P.addBox(f.x + 3, f.z - 1.5, f.x + 6, f.z + 1.5, f.y - 0.5, f.y + 0.35, { kind: 'prop', walkable: true, isFloor: true });
    const b2 = P.addBox(f.x + 6, f.z - 1.5, f.x + 9, f.z + 1.5, f.y - 0.5, f.y + 0.7, { kind: 'prop', walkable: true, isFloor: true });
    const wall = P.addBox(f.x + 12, f.z - 1.5, f.x + 12.4, f.z + 1.5, f.y - 0.5, f.y + 1.4, { kind: 'wall' });
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(20);
    let maxY = 0;
    window.__step(200, ['KeyW'], () => { maxY = Math.max(maxY, pl.pos.y - f.y); });
    const r = { reachedTopOfStep2: +maxY.toFixed(2), finalX: +(pl.pos.x - f.x).toFixed(2), stoppedByWall: pl.pos.x - f.x < 12 };
    P.remove(b1); P.remove(b2); P.remove(wall);
    // tek seferde 0.75 m'lik blok: basamak sayılmamalı (tırmanılamaz)
    const hi = P.addBox(f.x + 3, f.z - 1.5, f.x + 6, f.z + 1.5, f.y - 0.5, f.y + 0.75, { kind: 'prop', walkable: true, isFloor: true });
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(20);
    window.__step(120, ['KeyW']);
    r.highBlockClimbed = pl.pos.y - f.y > 0.5;
    r.highBlockX = +(pl.pos.x - f.x).toFixed(2);
    P.remove(hi);
    return r;
  });
  log('basamak', res.step);
  // ---- eğilme ve tavan
  res.crouch = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const f = window.__flat(8);
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(20);
    window.__press('KeyC');
    window.__step(10);
    const m1 = pl.mode, h1 = pl.body.height;
    const P = S.world.physics;
    const roof = P.addBox(f.x - 2, f.z - 2, f.x + 2, f.z + 2, f.y + 1.45, f.y + 1.8, { kind: 'wall' });
    window.__step(1); // yeni çarpıştırıcı bir adım sonra sorgulara girer
    window.__press('KeyC'); // kalkmaya çalış: tavan var
    window.__step(10);
    const m2 = pl.mode;
    P.remove(roof);
    window.__press('KeyC');
    window.__step(10);
    return { crouchMode: m1, crouchH: h1, underRoof: m2, afterRoof: pl.mode, height: pl.body.height };
  });
  log('eğilme', res.crouch);
  // ---- eşya düşürme
  res.drop = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const f = window.__flat(4);
    pl.spawnAt(f.x, f.y + 0.05, f.z, 0);
    window.__step(10);
    S.applyAction('ground_drop', { stack: { id: 'canned_food', qty: 1 }, x: f.x + 1, y: f.y, z: f.z }, S.localId);
    let it = null;
    window.__step(5);
    for (const v of S.ground.items.values()) it = v;
    const y0 = it.y;
    window.__step(400);
    return { rest: it.rest, y: +(it.y - S.world.terrain.heightAt(it.x, it.z)).toFixed(3), fell: +(y0 - it.y).toFixed(2), bodies: S.game.phys.dynamic.size };
  });
  log('eşya', res.drop);
  // ---- fiziksel nesneler
  res.props = await evalJS(page, () => {
    const S = window.__game.session;
    const n = S.props.props.length;
    const kinds = {};
    for (const p of S.props.props) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    // ilk kırmızı varili patlat
    const red = S.props.props.find((p) => p.def.explosive && p.alive);
    let exploded = false;
    if (red) {
      const t = red.d.body.translation();
      S.local.spawnAt(t.x + 25, S.world.physics.groundHeight(t.x + 25, t.z, 200), t.z, 0);
      window.__step(5);
      S.props.shoot(red, t, { x: -1, y: 0, z: 0 }, 2);
      window.__step(30);
      exploded = !red.alive;
    }
    return { count: n, kinds, exploded, debris: S.props.debris.length };
  });
  log('nesneler', res.props);
  // ---- araç
  await evalJS(page, () => { window.__carTest = () => {
    const S = window.__game.session, pl = S.local;
    const V = S.vehicles;
    const out = {};
    for (const type of ['sedan', 'pickup', 'police', 'motorcycle', 'military']) {
      const v = V.list.find((x) => x.type === type && !x.wrecked);
      if (!v) { out[type] = 'yok'; continue; }
      v.fuel = v.maxFuel; v.broken = false; v.health = v.maxHealth;
      // aracı uzun, düz bir yola taşı: oyuncunun yakınındaki en düz alan
      const f = window.__flat(70, 2.2);
      if (!f) { out[type] = 'alan yok'; continue; }
      v.teleport(f.x, f.y + 1, f.z, Math.PI / 2);
      window.__step(60);
      S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
      window.__step(5);
      const r = { mode: pl.mode };
      const p0 = { x: v.pos.x, z: v.pos.z };
      let t100 = -1, vmax = 0;
      window.__step(240, ['KeyW'], (i) => { const sp = Math.abs(v.speed || 0); vmax = Math.max(vmax, sp); if (t100 < 0 && sp >= 100 / 3.6) t100 = i / 60; });
      r.dist4s = +Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z).toFixed(1);
      r.vmaxKmh = +(vmax * 3.6).toFixed(1);
      r.t100 = t100 > 0 ? +t100.toFixed(2) : null;
      // fren
      const sp0 = Math.abs(v.speed);
      const b0 = { x: v.pos.x, z: v.pos.z };
      let tStop = -1;
      const hpB = v.health;
      let bDist = 0;
      window.__step(300, () => (tStop < 0 ? ['KeyS'] : []), (i) => { if (tStop < 0) { bDist = Math.hypot(v.pos.x - b0.x, v.pos.z - b0.z); if (Math.abs(v.speed) < 0.5) tStop = i / 60; } });
      r.brakeDmg = +(hpB - v.health).toFixed(1);
      r.brakeFromKmh = +(sp0 * 3.6).toFixed(1);
      r.brakeDist = +bDist.toFixed(1);
      r.brakeTime = tStop;
      // dönüş: sabit hızda direksiyon
      window.__step(120, ['KeyW']);
      const yaw0 = v.yaw;
      window.__step(120, ['KeyW', 'KeyA']);
      let dy = v.yaw - yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.turnDeg2s = +((dy * 180) / Math.PI).toFixed(1);
      r.turnSpeedKmh = +(Math.abs(v.speed) * 3.6).toFixed(1);
      // devrilme / dik durma
      const q = v.quat;
      r.upright = +(1 - 2 * (q.x * q.x + q.z * q.z)).toFixed(3);
      r.wheelsGround = v.ctrl ? Array.from({ length: v.ctrl.numWheels() }, (_, i) => v.ctrl.wheelIsInContact(i) ? 1 : 0).join('') : null;
      r.health = +v.health.toFixed(1);
      // duvara çarpma: ~45 km/s, CCD ile içinden geçmemeli
      const g = window.__flat(40, 2.2);
      if (g) {
        v.teleport(g.x, g.y + 0.8, g.z, Math.PI / 2);
        window.__step(30);
        const P = S.world.physics;
        const wall = P.addBox(g.x + 30, g.z - 4, g.x + 31, g.z + 4, g.y - 1, g.y + 3, { kind: 'wall' });
        const hp0 = v.health;
        let hitV = 0;
        window.__step(300, ['KeyW'], () => { if (v.pos.x < g.x + 27) hitV = Math.max(hitV, Math.abs(v.speed)); });
        r.crash = { atKmh: +(hitV * 3.6).toFixed(1), dmg: +(hp0 - v.health).toFixed(1), passedThrough: v.pos.x > g.x + 31, gapToWall: +(g.x + 30 - v.pos.x).toFixed(2) };
        P.remove(wall);
      }
      V.exitLocal();
      window.__step(20);
      r.afterExit = pl.mode;
      out[type] = r;
    }
    return out;
  }; });
  res.car = await evalJS(page, () => { try { return window.__carTest(); } catch (e) { return 'HATA ' + e.stack; } });
  log('araç', res.car);
  await evalJS(page, () => { const g = window.__game; g.gfx.render(0.016, g.time); });
  await shot(page, '/tmp/phys-end.png');
};
