// Fizik ölçüm testi: oyun döngüsü durdurulur, oturum sabit 1/60 sn adımlarla ilerletilir.
// Ölçülenler: yürüme/koşma hızı, zıplama yüksekliği ve süresi, düşme hasarı, basamak çıkma,
// eğik yüzeyde durma, eşya düşürme/yerleşme, fiziksel nesneler, araç hızlanma/fren/dönüş/devrilme.
// Her ölçümün ardından denetim: değerler geniş ama anlamlı sınırlar içinde olmalı (adımlar sabit olduğundan GPU hızı
// sonucu değiştirmez; zombi/enkaz gibi çevre etkileri için araç denetimleri bir araca tolerans tanır).
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
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
  // yürüme hedefi 4,3 m/sn × karakter hız çarpanı (0,95–1,12), depar 6,7 m/sn × çarpan; 2 sn ortalaması duruştan ivmelenmeyi içerir
  const Wk = res.walk && typeof res.walk === 'object' ? res.walk : null;
  check(Wk && Wk.walk > 2.5 && Wk.walk < 6 && Wk.sprint > Wk.walk * 1.2 && Wk.sprint < 9 && Wk.stopDist > -0.1 && Wk.stopDist < 1.5 && Math.abs(Wk.groundGap) < 0.2 && Wk.mode === 'ground',
    'yürüme ve depar hızı makul olmalı (depar daha hızlı), tuş bırakılınca kısa mesafede durulmalı, oyuncu zemine basmalı', res.walk);
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
  const Jp = res.jump, Rl = res.roll;
  check(Jp && Jp.height > 0.4 && Jp.height < 1.8 && Jp.airTime > 0.25 && Jp.airTime < 1.4 && Math.abs(Jp.endGap) < 0.15 && Jp.mode === 'ground' &&
    Rl && Rl.rolled && Rl.dist > 1.5 && Rl.stamina > 0 && Rl.capsuleMin < Rl.endHeight - 0.2 && Rl.endMode === 'ground',
    'zıplama yüksekliği ve havada kalma süresi makul olmalı, oyuncu yere inmeli; koşarken eğilince takla atılmalı (kapsül kısalır, dayanıklılık harcanır), sonunda ayağa kalkılmalı', { ziplama: Jp, takla: Rl });
  // ---- düşme hasarı
  res.fall = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const out = [];
    for (const hgt of [2.5, 5, 9]) {
      const f = window.__flat(4);
      S.localStats.health = 100;
      pl.spawnAt(f.x, f.y + hgt, f.z, 0);
      pl.fallStartY = f.y + hgt;
      let knock = 0, lock = 0;
      window.__step(150, [], () => { knock = Math.max(knock, pl.knockT || 0); lock = Math.max(lock, pl.lockMove || 0); });
      // inişte yansıtılan eylem: 2,5 m hafif iniş, 5 m sert iniş (dururken), 9 m yere serilme
      const act = pl.avatar.lastAct ? [pl.avatar.lastAct[1], pl.avatar.lastAct[3]] : null;
      out.push({ h: hgt, hp: +S.localStats.health.toFixed(1), gap: +(pl.pos.y - f.y).toFixed(3), act, knock: +knock.toFixed(2), lock: +lock.toFixed(2), knockEnd: +(pl.knockT || 0).toFixed(2) });
    }
    S.localStats.health = 100;
    S.localStats.cond.injury = 0;
    return out;
  });
  log('düşme', res.fall);
  // hasar (düşüş − 3,4 m) × 9: 2,5 m zararsız, 5 m ≈ 14, 9 m ≈ 50
  const Fl = Array.isArray(res.fall) ? res.fall : [];
  const canAt = (h) => { const x = Fl.find((f) => f.h === h); return x ? x.hp : NaN; };
  check(Fl.length === 3 && canAt(2.5) >= 99 && canAt(5) < canAt(2.5) - 3 && canAt(9) < canAt(5) - 15 && canAt(9) > 5 && Fl.every((f) => Math.abs(f.gap) < 0.2),
    'düşme hasarı yükseklikle artmalı (2,5 m zararsız, 9 m > 5 m), oyuncu her düşüşte zemine inmeli', res.fall);
  const fAt = (h) => Fl.find((f) => f.h === h) || {};
  check(Fl.length === 3 && fAt(2.5).act && fAt(2.5).act[0] === 'land' && fAt(2.5).act[1] !== 'hard' && fAt(2.5).knock === 0 &&
    fAt(5).act && fAt(5).act[0] === 'land' && fAt(5).act[1] === 'hard' && fAt(5).lock >= 0.29 && fAt(5).knock === 0 &&
    fAt(9).act && fAt(9).act[0] === 'knock' && fAt(9).knock > 1.9 && fAt(9).knockEnd < fAt(9).knock - 1,
  'iniş tepkisi: 2,5 m hafif iniş, 5 m sert iniş (kısa kilit), 9 m yere serilme (1,95 sn süre işler); eylem yansıtılmalı', res.fall);
  // ---- yere serilme: kalktıktan sonra 3,5 sn bağışıklık (geyik hücumu 2,2 sn arayla zincirleyemesin); süre moddan bağımsız
  // işler: serilip 0,1 sn sonra araca binen (geç gelen koltuk) oyuncunun süresi araçta da azalır, inince hemen yürür
  // (eskiden süre araçta donuyor, inince 1,9 sn kilitli kalıyordu)
  res.knock = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, V = S.vehicles;
    const f = window.__flat(20, 2.2);
    const v = V.list.find((x) => x.type === 'sedan' && !x.wrecked);
    if (!f || !v) return 'alan/araç yok';
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    window.__step(270); // önceki ölçümdeki 9 m düşüşün serilmesi ve bağışıklığı bitsin (4,5 sn)
    const first = pl.knockdown();
    window.__step(132); // 2,2 sn
    const up = !(pl.knockT > 0), again = pl.knockdown();
    window.__step(210); // toplam 5,7 sn > 1,95 + 3,5
    const later = pl.knockdown();
    window.__step(280); // + aşağıdaki 60 kare: 5,67 sn > 1,95 + 3,5 (yeniden serilebilir)
    v.fuel = v.maxFuel; v.broken = false; v.health = v.maxHealth;
    v.teleport(f.x + 8, f.y + 1, f.z, Math.PI / 2);
    window.__step(60);
    const car = pl.knockdown();
    window.__step(6);
    S.applyAction('vehicle_enter', { id: v.id, seat: 0 }, S.localId);
    window.__step(5);
    const mode = pl.mode;
    window.__step(180);
    const inCar = +pl.knockT.toFixed(2);
    V.exitLocal();
    window.__step(2);
    const x0 = pl.pos.x, z0 = pl.pos.z, k0 = +pl.knockT.toFixed(2);
    window.__step(30, ['KeyW']);
    return { first, up, again, later, car, mode, inCar, afterExit: k0, moved: +Math.hypot(pl.pos.x - x0, pl.pos.z - z0).toFixed(2), exitMode: pl.mode };
  });
  log('yere serilme', res.knock);
  const Kn = res.knock && typeof res.knock === 'object' ? res.knock : null;
  check(Kn && Kn.first && Kn.up && Kn.again === false && Kn.later && Kn.car && Kn.mode === 'drive' && Kn.inCar === 0 && Kn.afterExit === 0 && Kn.moved > 0.5 && Kn.exitMode === 'ground',
    'yere serilme: 1,95 sn sonra kalkılmalı, 3,5 sn bağışıklıkta yeniden serilmemeli; serilip araca binilince süre araçta işlemeli, inince hemen yürünmeli', res.knock);
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
  const Bs = res.step;
  check(Bs && Bs.reachedTopOfStep2 > 0.55 && Bs.finalX > 9 && Bs.stoppedByWall && !Bs.highBlockClimbed && Bs.highBlockX < 3.2,
    "iki basamak (0,35 m + 0,35 m) yürüyerek çıkılmalı, 1,4 m'lik duvar durdurmalı; tek seferde 0,75 m'lik blok çıkılamamalı", Bs);
  // ---- engel atlama hızı korur: deparla 0,8 m'lik engele koşulur, 0,75 m kala zıplanır (engel atlayışı); inişte hız
  // sıfırlanmamalı (eskiden durup kilitli kalıyordu), W basılı kalınca koşu sürer
  res.vault = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, P = S.world.physics;
    const f = window.__flat(16);
    if (!f) return 'düz alan yok';
    const bx = f.x + 7;
    const box = P.addBox(bx, f.z - 1.5, bx + 0.4, f.z + 1.5, f.y - 0.5, f.y + 0.8, { kind: 'prop', walkable: true });
    pl.spawnAt(f.x, f.y + 0.05, f.z, Math.PI / 2);
    S.localStats.stamina = 100;
    window.__step(20);
    let start = -1, end = -1, pressed = -1, vIn = 0, dur = 0, vAfter = [], xEnd = 0, x01 = 0, lockAfter = 0;
    window.__step(130, (i) => {
      if (start < 0 && pressed < 0 && bx - pl.pos.x < 0.95 && bx - pl.pos.x > 0.5) { window.__press('Space'); pressed = i; vIn = Math.hypot(pl.vel.x, pl.vel.z); }
      return ['KeyW', 'ShiftLeft'];
    }, (i) => {
      if (pl.vault && start < 0) { start = i; dur = pl.vault.dur; }
      if (start >= 0 && end < 0 && !pl.vault) { end = i; xEnd = pl.pos.x; lockAfter = pl.lockMove; }
      if (end >= 0 && i - end < 6) vAfter.push(+Math.hypot(pl.vel.x, pl.vel.z).toFixed(2));
      if (end >= 0 && i - end === 6) x01 = pl.pos.x;
    });
    P.remove(box);
    return { pressed, start, end, vIn: +vIn.toFixed(2), dur: +dur.toFixed(2), vAfter, lockAfter: +lockAfter.toFixed(2), ilerleme01: +(x01 - xEnd).toFixed(2), gecti: +(pl.pos.x - bx).toFixed(2) };
  });
  log('engel atlama', res.vault);
  const Va = res.vault && typeof res.vault === 'object' ? res.vault : null;
  check(Va && Va.start >= 0 && Va.end > Va.start && Va.vIn > 5 && Va.dur < 0.45 && Va.vAfter.length && Math.min(...Va.vAfter) > 3 && Va.lockAfter === 0 && Va.ilerleme01 > 0.3 && Va.gecti > 1,
    'deparla engel atlayışı kısa sürmeli ve hız korunmalı: inişten sonraki 0,1 sn hız > 3 m/sn, girdi kilidi kalkmış, koşu sürmeli', res.vault);
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
  const Eg = res.crouch;
  check(Eg && Eg.crouchMode === 'crouch' && Eg.crouchH < Eg.height - 0.2 && Eg.underRoof === 'crouch' && Eg.afterRoof === 'ground',
    'eğilince kapsül kısalmalı, alçak tavan altında ayağa kalkılamamalı, tavan kalkınca kalkılmalı', Eg);
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
    // fizik uykusu beklenir (açık arazide 24 bırakmada 103–141 adım ≈ 2 sn); oyunun yedeği 12 sn'de zorla yerleştirir,
    // o yüzden pencere 11,5 sn: eşya bu sürede uyumazsa (hiç durmuyorsa) denetim düşer. Rastgele dönüş ve çevredeki başka
    // bir gövdenin dürtmesi bazen 400 adımı aşabiliyordu (2 Kasım ve 14 Kasım koşuları).
    let restAt = null;
    for (let n = 0; n < 690 && restAt === null; n++) { window.__step(1); if (it.rest) restAt = n; }
    return { rest: it.rest, restAt, y: +(it.y - S.world.terrain.heightAt(it.x, it.z)).toFixed(3), fell: +(y0 - it.y).toFixed(2), bodies: S.game.phys.dynamic.size };
  });
  log('eşya', res.drop);
  const Es = res.drop;
  check(Es && Es.rest === true && Math.abs(Es.y) < 0.2 && Es.fell > 0.3, 'bırakılan eşya düşüp zeminde fizik uykusuyla dinlenmeye geçmeli (oyunun 12 sn yedeğinden önce)', Es);
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
    // canlı nesnelerden uyuyan (dinlenen) ve arazinin 1 m'den fazla altına düşmüş olanlar; dünyadan düşüp (y < −40)
    // fizikten silinmiş gövde de düşmüş sayılır (silinmiş gövdeye erişim hata verebilir)
    const T = S.world.terrain, canli = S.props.props.filter((p) => p.alive);
    let uyuyan = 0, dustu = 0;
    for (const p of canli) {
      try {
        if (!S.game.phys.dynamic.has(p.d)) { dustu++; continue; }
        const t = p.d.body.translation();
        if (t.y < T.heightAt(t.x, t.z) - 1) dustu++;
        if (p.d.body.isSleeping()) uyuyan++;
      } catch { dustu++; }
    }
    return { count: n, kinds, exploded, debris: S.props.debris.length, canli: canli.length, uyuyan, dustu };
  });
  log('nesneler', res.props);
  const Ns = res.props;
  check(Ns && Ns.count > 20 && (!(Ns.kinds && Ns.kinds.redbarrel) || (Ns.exploded && Ns.debris > 0)) && Ns.dustu === 0 && Ns.uyuyan >= Ns.canli * 0.6,
    'fiziksel nesneler kurulmalı; vurulan kırmızı varil patlayıp enkaz saçmalı; nesneler zeminin altına düşmemeli, çoğu dinlenmede olmalı', Ns);
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
      const r = { mode: pl.mode, maxKmh: +(v.def.maxSpeed * 3.6).toFixed(1) };
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
  // araç sonucu nesne değilse ('yok', 'alan yok', 'HATA …') o tür sınanmamış sayılır; en az 3 tür sınanmalı
  const araclar = res.car && typeof res.car === 'object' ? Object.entries(res.car).filter(([, r]) => r && typeof r === 'object') : [];
  // binme, temiz şeritte hızlanma (azami hızı aşmadan) ve inme her araçta; dönüş testi frenden sonra şerit dışına taşabildiği
  // için (engel/çarpma) dönme ve dik kalma biri hariç hepsinde
  const surulen = araclar.filter(([, r]) => r.mode === 'drive' && r.dist4s > 15 && r.vmaxKmh > 25 && r.vmaxKmh <= r.maxKmh * 1.1 && r.afterExit !== 'drive' && r.afterExit !== 'seat').map(([k]) => k);
  const donen = araclar.filter(([, r]) => Math.abs(r.turnDeg2s) > 20 && r.upright > 0.9).map(([k]) => k);
  check(araclar.length >= 3 && surulen.length === araclar.length && donen.length >= araclar.length - 1,
    'araçlar sürülebilmeli: binilir, 4 sn gazda hızlanır (azami hızı aşmadan), inilir; direksiyonla döner ve devrilmez', { sinanan: araclar.map(([k]) => k), surulen, donen, car: res.car });
  // fren ve duvar çarpması: yol üstündeki zombi/enkaz bir aracın ölçümünü bozabilir → biri hariç hepsi durmalı/hasar almalı;
  // duvarın içinden geçmek (CCD) hiçbir araçta olmamalı
  const frenleyen = araclar.filter(([, r]) => r.brakeTime > 0 && r.brakeDist < 45).map(([k]) => k);
  const carpan = araclar.filter(([, r]) => r.crash && typeof r.crash === 'object');
  const carpOk = carpan.filter(([, r]) => r.crash.atKmh > 25 && r.crash.dmg > 0 && !r.crash.passedThrough && r.crash.gapToWall > 0).map(([k]) => k);
  const ozet = Object.fromEntries(araclar.map(([k, r]) => [k, { brakeTime: r.brakeTime, brakeDist: r.brakeDist, brakeDmg: r.brakeDmg, crash: r.crash }]));
  check(araclar.length >= 3 && frenleyen.length >= araclar.length - 1 && carpan.length >= 3 && carpOk.length >= carpan.length - 1 && carpan.every(([, r]) => !r.crash.passedThrough),
    'frenle araç 5 sn içinde kısa mesafede durmalı; duvara çarpan araç hasar almalı ve duvarın içinden geçmemeli', { frenleyen, carpOk, ozet });
  await evalJS(page, () => { const g = window.__game; g.gfx.render(0.016, g.time); });
  await shot(page, '/tmp/phys-end.png');
};
