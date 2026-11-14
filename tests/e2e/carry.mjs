// Nesne taşıma testi: oyuncu önündeki kutuyu alır (kinematik), taşır, bırakır ve fırlatır. → /tmp/carry-*.png
// Denetimler: kutu E ile alınır (taşıma durumu, kinematik gövde, taşıma animasyonu); taşırken yürünür ve kutu oyuncunun
// önünde göğüs hizasında kalır; fırlatılan kutu elden çıkıp dinamikleşir, öne savrulup zeminde durur. Oyun döngüsü
// çalışır: yazılım GPU'sunda kare başına en çok 0,1 sn benzetim ilerlediği için beklemeler fizik adımıyla da güvenceye alınır.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const steps = () => evalJS(page, () => window.__game.session.game.phys.steps);
  // fizik adım sayacı en az t olana dek bekle; zaman aşımında false döner (yutulmaz, denetime düşer)
  const stepsAtLeast = (t, timeout) => page.waitForFunction((n) => window.__game.session.game.phys.steps >= n, t, { timeout, polling: 100 }).then(() => true, () => false);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  // oyuncunun önüne bir kutu koy. Doğuş yeri verandada eve bakar: taşırken kutu 0,2 m sonra kapıya dayanıyordu.
  // Oyuncu önce verandadan 5 m geri çekilip evden uzağa döner (açık bahçe), kutu onun önüne konur.
  const r0 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const away = pl.yaw + Math.PI, px = pl.pos.x + Math.sin(away) * 5, pz = pl.pos.z + Math.cos(away) * 5;
    pl.spawnAt(px, S.world.physics.groundHeight(px, pz, pl.pos.y + 3) + 0.05, pz, away);
    const x = pl.pos.x + Math.sin(pl.yaw) * 1.1, z = pl.pos.z + Math.cos(pl.yaw) * 1.1;
    const p = S.props.addProp('box', x, z, 0, 'test_box');
    window.__box = p;
    return { ok: !!p, near: !!S.props.nearestCarryable(pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw) };
  });
  log('kutu', r0);
  check(r0 && r0.ok && r0.near, 'oyuncunun önüne konan kutu taşınabilir nesne olarak bulunmalı', r0);
  // açılış paneli/diyaloğu varsa kapat (girdi engellenmesin)
  const blk = await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) { g.ui.closePanel && g.ui.closePanel(); } return { blocking: g.ui.isBlocking(), panel: g.ui.panel && g.ui.panel.name, modal: !!g.ui.modal }; });
  log('arayüz', blk);
  await wait(800);
  await page.keyboard.down('KeyE'); await wait(120); await page.keyboard.up('KeyE');
  await wait(600);
  // E basışı bir sonraki karede işlenir; yavaş karede 600 ms yetmeyebilir: alma en çok 30 sn beklenir
  const aldi = await page.waitForFunction(() => !!window.__game.session.local.carryProp, null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
  const r1 = await evalJS(page, () => { const S = window.__game.session, pl = S.local; window.__p0 = { x: pl.pos.x, z: pl.pos.z }; return { carrying: !!pl.carryProp, kinematic: !!(window.__box && window.__box.d.carried), anim: !!pl.animState().carryBox }; });
  log('alındı', r1);
  check(aldi && r1 && r1.carrying && r1.kinematic && r1.anim, 'E ile kutu alınmalı: oyuncu taşıyor, gövde kinematik, taşıma animasyonu açık', { aldi, r1, arayuz: blk });
  // W en az 1,2 sn ve en az 45 fizik adımı (0,75 sn benzetim) basılı kalır
  const sW = (await steps()) || 0;
  await page.keyboard.down('KeyW'); await wait(1200);
  const yurudu = await stepsAtLeast(sW + 45, 60000);
  const tasiyor = () => evalJS(page, () => { const S = window.__game.session, pl = S.local, t = window.__box.d.body.translation(); const o = window.__box.d.obj.position, p0 = window.__p0; return { carrying: !!pl.carryProp, mode: pl.mode, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2), h: +(t.y - pl.pos.y).toFixed(2), gorselMesafe: +Math.hypot(o.x - pl.pos.x, o.z - pl.pos.z).toFixed(2), gorselH: +(o.y - pl.pos.y).toFixed(2), yurunen: p0 ? +Math.hypot(pl.pos.x - p0.x, pl.pos.z - p0.z).toFixed(2) : null }; });
  const r2 = await tasiyor();
  await page.keyboard.up('KeyW');
  log('taşınıyor (oyuncuya uzaklık, yükseklik)', r2);
  // taşıma hızı 3,2 × 0,9 ≈ 2,9 m/sn (Player): 0,75 sn benzetimde ≥ 1 m. Taşınan kutu taşıyanın kapsülünü durdurmaz
  // (PhysicsWorld CharacterBody süzgeci); eskiden oyuncu kendi kutusuna dayanıp 0,2–0,6 m yürüyebiliyordu.
  // Kutu tutma noktası (PhysProps.carryTarget, 0,75 m'lik kutu): görsel her karede 0,70 m önde, 1,00 m yukarıda.
  check(yurudu && r2 && r2.carrying && r2.yurunen > 1.0 && Math.abs(r2.gorselMesafe - 0.7) < 0.15 && Math.abs(r2.gorselH - 1.0) < 0.15,
    'kutuyla taşıma hızında yürünebilmeli (≥ 1 m); kutu (görsel) oyuncunun 0,7 m önünde, 1 m yukarıda kalmalı', { yurudu, r2 });
  // kinematik gövde tutma hedefini kare sonunda alır (yürürken bir kare geride: yavaş karede 0,3 m'yi bulur); oyuncu durunca
  // (en az 30 adım) görsele oturmalı
  const sD = (await steps()) || 0;
  const durdu0 = await stepsAtLeast(sD + 30, 60000);
  const r2b = await tasiyor();
  log('durunca (fizik gövdesi)', r2b);
  check(durdu0 && r2b && r2b.carrying && Math.abs(r2b.dist - r2b.gorselMesafe) < 0.08 && Math.abs(r2b.h - r2b.gorselH) < 0.08,
    'oyuncu durunca kutunun fizik gövdesi görselle aynı yerde olmalı (taşıma noktası)', { durdu0, r2b });
  await shot(page, '/tmp/carry-hold.png');
  // fırlat (bırakma noktası kaydedilir)
  await evalJS(page, () => { const t = window.__box.d.body.translation(); window.__birak = { x: t.x, y: t.y, z: t.z }; window.__game.session.local.dropProp(true); });
  const sT = (await steps()) || 0;
  await wait(1200);
  // uçuş, düşüş ve durma için fırlatmadan sonra en az 150 fizik adımı (2,5 sn benzetim)
  const durdu = await stepsAtLeast(sT + 150, 90000);
  const r3 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, b = window.__box.d.body, t = b.translation(), v = b.linvel(), r = window.__birak;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    return {
      carrying: !!pl.carryProp, dynamic: !window.__box.d.carried, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2),
      yerDegisimi: r ? +Math.hypot(t.x - r.x, t.y - r.y, t.z - r.z).toFixed(2) : null, onde: +((t.x - pl.pos.x) * fx + (t.z - pl.pos.z) * fz).toFixed(2),
      hiz: +Math.hypot(v.x, v.y, v.z).toFixed(2), zemin: +(t.y - S.world.terrain.heightAt(t.x, t.z)).toFixed(2), // arazi (veranda/döşeme bunun üstünde)
    };
  });
  log('fırlatıldı', r3);
  // ev cephesine yakın atışta kutu duvara çarpıp önde düşebilir: uzaklık değil, elden çıkıp yer değiştirmesi ve durması denetlenir
  check(durdu && r3 && !r3.carrying && r3.dynamic && r3.yerDegisimi > 0.3 && r3.onde > 0 && r3.hiz < 0.6 && r3.zemin > -0.25,
    'fırlatılan kutu elden çıkıp dinamik olmalı, öne savrulup düşmeli ve arazinin altına geçmeden durmalı', { durdu, r3 });
  await shot(page, '/tmp/carry-throw.png');
  // ---- ağır yük (fıçı, 20 kg): ağır adımla taşınır (hız ≤ 1,75 m/sn), anim durumunda ve ağda carryBox 2, gövde geriye
  // yaslanır. Önünde 6 m açık düz alan bulunan bir yere geçilir (kutunun durduğu yerden uzak)
  const rk = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, T = S.world.terrain, P = S.world.physics;
    let spot = null;
    for (let r = 6; r < 120 && !spot; r += 4) for (let a = 0; a < 6.28 && !spot; a += 0.5) {
      const x = pl.pos.x + Math.cos(a) * r, z = pl.pos.z + Math.sin(a) * r, h = T.heightAt(x, z);
      if (T.waterLevelAt(x, z) > h - 0.2 || S.world.buildingAt(x, z)) continue;
      let ok = true;
      for (let s = -1; s <= 7 && ok; s += 1) if (Math.abs(T.heightAt(x + s, z) - h) > 0.25 || P.overlapsBox(x + s - 0.7, z - 1, x + s + 0.7, z + 1, h + 0.05, h + 2.2) || S.props.props.some((p) => { const t = p.d.body.translation(); return p.alive && Math.abs(t.x - x - s) < 1.3 && Math.abs(t.z - z) < 1.4; })) ok = false;
      if (ok) spot = { x, z, y: h };
    }
    if (!spot) return null;
    pl.spawnAt(spot.x, P.groundHeight(spot.x, spot.z, spot.y + 2) + 0.05, spot.z, Math.PI / 2); // +X'e bakar
    const p = S.props.addProp('keg', spot.x + 1.0, spot.z, 0, 'test_keg');
    pl.pickProp(p);
    window.__p1 = { x: pl.pos.x, z: pl.pos.z };
    window.__vmax = 0;
    const tick = () => { const q = window.__game.session.local; window.__vmax = Math.max(window.__vmax, Math.hypot(q.vel.x, q.vel.z)); window.__vraf = requestAnimationFrame(tick); };
    window.__vraf = requestAnimationFrame(tick);
    const st = pl.animState();
    return { spot: [+spot.x.toFixed(1), +spot.z.toFixed(1)], carrying: pl.carryProp === p, mass: p.def.mass, cb: st.carryBox, net: S.net.compactAnim(st).carryBox };
  });
  log('ağır yük alındı', rk);
  await wait(400);
  const sK = (await steps()) || 0;
  await page.keyboard.down('KeyW'); await wait(1500);
  const yurudu2 = await stepsAtLeast(sK + 60, 60000);
  await page.keyboard.up('KeyW');
  const r4 = await evalJS(page, () => {
    cancelAnimationFrame(window.__vraf);
    const S = window.__game.session, pl = S.local, p0 = window.__p1;
    const r = { carrying: !!pl.carryProp, vmax: +window.__vmax.toFixed(2), cb: pl.animState().carryBox, avatar: pl.avatar._carryBox, bel: +(pl.avatar.spineLean || 0).toFixed(3), yurunen: +Math.hypot(pl.pos.x - p0.x, pl.pos.z - p0.z).toFixed(2) };
    if (pl.carryProp) pl.dropProp(false);
    return r;
  });
  log('ağır yükle yürüme (en yüksek hız m/sn, yaslanma rad)', r4);
  await shot(page, '/tmp/carry-heavy.png');
  check(rk && rk.carrying && rk.mass > 14 && rk.cb === 2 && rk.net === 2 && yurudu2 && r4 && r4.carrying && r4.vmax <= 1.75 && r4.vmax > 1.2 && r4.yurunen > 0.5 && r4.avatar === 2 && r4.bel < -0.06,
    'ağır yük (fıçı) ağır adımla taşınmalı: hız ≤ 1,75 m/sn (yürüyerek ilerlemeli), carryBox 2 anim durumunda ve ağda, gövde geriye yaslanmalı', { rk, yurudu2, r4 });
};
