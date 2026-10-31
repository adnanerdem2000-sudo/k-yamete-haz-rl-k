// Fizik 2: menteşeli kapılar (motorla aç/kapat, iterek açma → durum eşitleme, kilitli kapı sabit, kırılınca
// kanat düşer), su kaldırma kuvveti (kutu yüzer), çarpışma sesleri (düşen varil → metal darbe). → /tmp/phys2-*.png
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  // yazılım GPU'sunda ilk kareler (gölgelendirici derlemesi) saniyeler sürer: beklemeler fizik adımıyla ölçülür
  const steps = () => evalJS(page, () => window.__game.session.game.phys.steps);
  const simWait = async (n, timeout = 90000) => { const s0 = await steps(); await page.waitForFunction((t) => window.__game.session.game.phys.steps >= t, s0 + n, { timeout, polling: 100 }); };
  const warmup = async () => { let ok = 0; for (let i = 0; i < 60; i++) { const a = await steps(); await wait(1000); ok = (await steps()) - a >= 30 ? ok + 1 : 0; if (ok >= 2) return i; } return -1; };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session && window.__game.session.doorPhys, null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel(); });
  log('ısınma (sn)', await warmup());
  const info = await evalJS(page, () => { const S = window.__game.session, D = S.doorPhys; return { kapi: D.doors.length, sabit: D.doors.filter((r) => r.fixed).length, toplam: S.world.doors.length, uyanik: D.doors.filter((r) => !r.body.isSleeping()).length, doorAppliers: (S.appliers.door || []).length }; });
  log('menteşeli kapılar', info);
  // kare süresi (yazılım GPU'su; fizik adımı sayısı gerçek zamanda ilerliyor mu)
  // yazılım GPU'sunda gölgelendirici derleme takılmaları olabilir: 3 sn pencere, en fazla 3 ölçüm
  let fps = null;
  for (let i = 0; i < 3; i++) {
    fps = await evalJS(page, async () => { const P = window.__game.session.game.phys; const s0 = P.steps, t0 = performance.now(); await new Promise((r) => setTimeout(r, 3000)); return { adimPerSn: +((P.steps - s0) / ((performance.now() - t0) / 1000)).toFixed(1), fps: window.__game.gfx.fps }; });
    log('sim hızı', fps);
    if (fps.adimPerSn > 20) break;
  }
  check(fps.adimPerSn > 20, 'fizik gerçek zamanı izlemeli (yazılım GPU\'sunda ≥20 adım/sn; donanımda 60)', fps);
  check(info.kapi > 50, 'fiziksel kapı sayısı', info);
  // 1) evin dış kapısı: motorla aç → kapat
  const pick = await evalJS(page, () => {
    const S = window.__game.session, D = S.doorPhys;
    const r = D.doors.find((q) => q.d.building === S.world.home && q.d.exterior && !q.d.locked) || D.doors.find((q) => q.d.exterior && !q.d.locked);
    window.__r = r;
    return { id: r.d.id, kind: r.d.kind, open01: r.d.open01, swing: r.d.swing, leafW: +r.d.leafW.toFixed(2), kutle: +r.body.mass().toFixed(1) };
  });
  log('kapı', pick);
  await evalJS(page, () => window.__game.session.act('door', { id: window.__r.d.id, open: true }));
  await simWait(100);
  const o1 = await evalJS(page, () => ({ open01: +window.__r.d.open01.toFixed(2), target: window.__r.d.target, uyuyor: window.__r.body.isSleeping() }));
  log('aç → 1,6 sn', o1);
  check(o1.open01 > 0.75, 'kapı motorla açılmalı', o1);
  await evalJS(page, () => { const S = window.__game.session, d = window.__r.d, pl = S.local; const x = d.center.x - d.inward.x * 2.2, z = d.center.z - d.inward.z * 2.2; pl.spawnAt(x, S.world.terrain.heightAt(x, z) + 0.2, z, Math.atan2(d.inward.x, d.inward.z)); pl.camYaw = pl.yaw + Math.PI; });
  await wait(400);
  await shot(page, '/tmp/phys2-door-open.png');
  await evalJS(page, () => window.__game.session.act('door', { id: window.__r.d.id, open: false }));
  await simWait(120);
  const o2 = await evalJS(page, () => ({ open01: +window.__r.d.open01.toFixed(2), target: window.__r.d.target }));
  log('kapat → 1,8 sn', o2);
  check(o2.open01 < 0.2, 'kapı motorla kapanmalı', o2);
  // 2) iterek açma: kapının dışında 0,9 m, içeri doğru yürü
  await evalJS(page, () => { const S = window.__game.session, d = window.__r.d, pl = S.local; const x = d.center.x - d.inward.x * 0.9, z = d.center.z - d.inward.z * 0.9; pl.spawnAt(x, S.world.terrain.heightAt(x, z) + 0.2, z, Math.atan2(d.inward.x, d.inward.z)); pl.camYaw = pl.yaw + Math.PI; });
  await simWait(20);
  await page.keyboard.down('KeyW'); await simWait(85); await page.keyboard.up('KeyW');
  await simWait(40);
  const o3 = await evalJS(page, () => { const S = window.__game.session, d = window.__r.d, pl = S.local; return { open01: +d.open01.toFixed(2), target: d.target, mesafe: +Math.hypot(pl.pos.x - d.center.x, pl.pos.z - d.center.z).toFixed(2) }; });
  log('iterek → 2 sn', o3);
  check(o3.open01 > 0.25, 'kapı itilince açılmalı', o3);
  check(o3.target === 1, 'itilerek açılan kapının durumu eşitlenmeli (door eylemi)', o3);
  await shot(page, '/tmp/phys2-door-push.png');
  // 3) kilitli kapı sabit gövde, itilemez
  const lk = await evalJS(page, () => {
    const S = window.__game.session, D = S.doorPhys;
    const r = D.doors.find((q) => q.d.locked);
    if (!r) return null;
    r.body.applyImpulse({ x: r.d.inward.x * 400, y: 0, z: r.d.inward.z * 400 }, true);
    return { id: r.d.id, sabit: r.fixed, kinematik: r.body.isFixed ? r.body.isFixed() : null };
  });
  log('kilitli kapı', lk);
  if (lk) check(lk.sabit, 'kilitli kapı sabit gövde olmalı', lk);
  // 4) kırılma: ağır hasar → eklem kopar, kanat düşer
  const br0 = await evalJS(page, () => { const r = window.__r; const t = r.body.translation(); window.__game.session.act('door_damage', { id: r.d.id, dmg: 5000 }); return { y: +t.y.toFixed(2) }; });
  await simWait(150);
  const br1 = await evalJS(page, () => { const r = window.__r; const t = r.body ? r.body.translation() : null; return { broken: r.d.broken, eklem: !!r.joint, y: t ? +t.y.toFixed(2) : null, govde: !!r.body }; });
  log('kırılma', br0, br1);
  check(br1.broken && !br1.eklem, 'kırılınca eklem kopmalı', br1);
  check(br1.y === null || br1.y < br0.y - 0.25, 'kanat yere düşmeli', { br0, br1 });
  await shot(page, '/tmp/phys2-door-broken.png');
  // 5) su: derin suya kutu → yüzer
  const wtr = await evalJS(page, () => {
    const S = window.__game.session, T = S.world.terrain, pl = S.local;
    let best = null;
    for (let r = 20; r < 700 && !best; r += 10) for (let a = 0; a < 6.28 && !best; a += 0.3) {
      const x = pl.pos.x + Math.cos(a) * r, z = pl.pos.z + Math.sin(a) * r;
      const wl = T.waterLevelAt(x, z), h = T.heightAt(x, z);
      if (wl > h + 2.2 && wl > -1e8) best = { x, z, wl, h };
    }
    if (!best) return null;
    const p = S.props.addProp('box', best.x, best.z, 0, 'float_box');
    if (!p) return null;
    p.d.body.setTranslation({ x: best.x, y: best.wl - 1.5, z: best.z }, true); // su altından bırak
    p.d.body.wakeUp();
    window.__fb = p;
    return { ...best, wl: +best.wl.toFixed(2), h: +best.h.toFixed(2), kutleYog: +p.d.col.density().toFixed(1) };
  });
  log('su', wtr);
  if (wtr) {
    await simWait(240);
    const fl = await evalJS(page, () => { const p = window.__fb, t = p.d.body.translation(); return { y: +t.y.toFixed(2), suda: !!p.d.inWater, buoy: p.d.buoy && +p.d.buoy.toFixed(2), hy: p.d.hy && +p.d.hy.toFixed(2) }; });
    log('kutu 4 sn sonra', fl);
    check(fl.y > wtr.h + 0.6 && fl.y > wtr.wl - 0.6 && fl.y < wtr.wl + 0.5, 'kutu su yüzeyinde yüzmeli', { fl, wtr });
  } else log('derin su bulunamadı, yüzme adımı atlandı');
  // 7) çekmece: yakındaki şifonyer/masa; depo paneli açılınca çekmece dışarı kayar, kapanınca geri
  const dr = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local, D = S.drawers;
    if (!D) return null;
    const c = D.cands.map((q) => [Math.hypot(q.x - pl.pos.x, q.z - pl.pos.z), q]).sort((a, b) => a[0] - b[0])[0];
    if (!c) return null;
    const ct = c[1];
    pl.spawnAt(ct.x + 1.2, ct.y - 0.6, ct.z, Math.atan2(ct.x - (ct.x + 1.2), 0));
    D.t = 0; D.update(0.016);
    const r = D.active.get(ct.id);
    window.__dr = r;
    return { type: ct.type, aktif: D.active.size, var: !!r };
  });
  log('çekmece', dr);
  if (dr && dr.var) {
    await evalJS(page, () => { const r = window.__dr; window.__game.session.ui.openStorage({ kind: 'container', id: r.ct.id, label: r.ct.label }); });
    await simWait(90);
    const e1 = await evalJS(page, () => ({ acik: window.__dr.open, uzama: +window.__game.session.drawers.extension(window.__dr).toFixed(3) }));
    log('panel açık → 1,3 sn', e1);
    check(e1.acik && e1.uzama > 0.2, 'çekmece dışarı kaymalı', e1);
    await shot(page, '/tmp/phys2-drawer.png');
    await evalJS(page, () => window.__game.ui.closePanel());
    await simWait(120);
    const e2 = await evalJS(page, () => ({ acik: window.__dr.open, uzama: +window.__game.session.drawers.extension(window.__dr).toFixed(3) }));
    log('panel kapalı → 1,3 sn', e2);
    check(!e2.acik && e2.uzama < 0.08, 'çekmece kapanmalı', e2);
  }
  // 6) çarpışma sesi: 3 m'den düşen varil → metal darbe
  const snd = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    window.__imp = [];
    S.audio.impact = (m, sev, at, mass) => window.__imp.push({ m, sev: +sev.toFixed(2), mass: +mass.toFixed(0) });
    const x = pl.pos.x + Math.sin(pl.yaw) * 2.5, z = pl.pos.z + Math.cos(pl.yaw) * 2.5;
    const p = S.props.addProp('barrel', x, z, 0, 'drop_barrel');
    if (!p) return null;
    const y = S.world.terrain.heightAt(x, z) + 3.2;
    p.d.body.setTranslation({ x, y, z }, true); p.d.body.wakeUp();
    return { aktif: !!S.contacts, kuyruk: !!S.game.phys.eventQueue };
  });
  log('ses kurulumu', snd);
  await simWait(150);
  const imp = await evalJS(page, () => ({ olay: window.__game.session.contacts.count, sesler: window.__imp.slice(0, 6), varilY: +window.__game.session.props.byId.get('drop_barrel').d.body.translation().y.toFixed(2) }));
  log('darbeler', imp);
  check(imp.sesler.length >= 1 && imp.sesler.some((i) => i.m === 'metal'), 'düşen varil metal darbe sesi üretmeli', imp);
};
