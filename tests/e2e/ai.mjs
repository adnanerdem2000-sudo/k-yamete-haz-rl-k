// Yapay zekâ davranış testi: çığlıkçı, çevik kuvvet zırhı, şişko patlaması, kurt sürüsü, Karabaş.
// Denetimler: çığlıkçı oyuncuyu görünce çığlık atar, çığlık uzaktaki zombiyi çağırır, çığlıkçı mesafesini korur;
// yelek kurşunu azaltır ama yakın dövüşü azaltmaz; şişko patlaması yakındakini yaralar/zehirler, uzaktakine dokunmaz;
// kurt sürüsü saldırır ama sırayla (biri dalar, diğerleri döner); Karabaş zombiye saldırır.
export default async ({ page, url, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1200);
  await evalJS(page, () => {
    const g = window.__game, S = g.session;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    window.__step = (n) => { for (let i = 0; i < n; i++) { S.update(1 / 30); g.input.endFrame(); } };
    // test alanı: oyuncunun yakınında düz, açık bir yer
    const T = S.world.terrain, P = S.world.physics;
    const p0 = S.local.pos;
    let spot = null;
    for (let r = 20; r < 200 && !spot; r += 6) for (let a = 0; a < 6.28 && !spot; a += 0.35) {
      const x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r, h = T.heightAt(x, z);
      if (T.waterLevelAt(x, z) > h - 0.3 || S.isInBase({ x, z })) continue;
      let ok = true;
      for (let dx = -16; dx <= 16 && ok; dx += 2) for (let dz = -16; dz <= 16 && ok; dz += 2) if (Math.abs(T.heightAt(x + dx, z + dz) - h) > 1.2 || S.world.buildingAt(x + dx, z + dz)) ok = false;
      if (ok && !P.overlapsBox(x - 14, z - 14, x + 14, z + 14, h + 0.2, h + 2.5)) spot = { x, z };
    }
    window.__spot = spot;
    S.local.spawnAt(spot.x, T.heightAt(spot.x, spot.z) + 0.05, spot.z, 0);
    window.__clear = () => { for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id); };
    window.__clear();
    S.zombies.populate = () => {}; // test sırasında yeni zombi doğmasın
    S.localStats.health = 100;
  });
  const res = {};
  res.screamer = await evalJS(page, () => {
    const S = window.__game.session, sp = window.__spot;
    let screams = 0;
    S.onEvt('zfx_scream', () => { screams++; });
    const zb = S.zombies.spawn('screamer', sp.x, sp.z + 14);
    const other = S.zombies.spawn('normal', sp.x + 30, sp.z + 40);
    zb.yaw = Math.PI; // oyuncuya baksın
    // ilk adımda algılasın: algı aralığı (think) doğuşta rastgele 0–0,3 sn; o sürede gezinme hedefine dönen zombi
    // oyuncuyu görüş konisinin dışında bırakabiliyordu (çığlık koşuların yaklaşık yarısında hiç atılmıyordu)
    zb.think = 0;
    let states = new Set(), minDist = 99;
    for (let i = 0; i < 120; i++) { window.__step(1); states.add(zb.state); minDist = Math.min(minDist, Math.hypot(zb.x - S.local.pos.x, zb.z - S.local.pos.z)); }
    const d = Math.hypot(zb.x - S.local.pos.x, zb.z - S.local.pos.z);
    return { screams, states: [...states], keptDistance: +d.toFixed(1), minDist: +minDist.toFixed(1), otherState: other.state };
  });
  log('çığlıkçı', res.screamer);
  const sc = res.screamer || {};
  // çığlık 75 m'lik ses: 40 m ötedeki boştaki zombi sesi araştırmaya gelir (oyuncuyu görmez/duymaz: 50 m, oyuncu duruyor).
  // Not: 'scream' durumu adım sonunda görülmez — çığlıkçının kendi çığlık sesi (hearNoise) onu aynı karede 'investigate'
  // durumuna geçiriyor; bu yüzden çığlık olayı (zfx_scream) sayılır, durum listesi denetlenmez.
  check(sc.screams >= 1 && (sc.otherState === 'investigate' || sc.otherState === 'chase'), 'çığlıkçı 14 m\'deki oyuncuyu görünce çığlık atmalı, çığlık 40 m ötedeki zombiyi çağırmalı', sc);
  // çığlıkçı yakın dövüşe girmez: 9–16 m bandında durur (9 m'den yakında kaçar, 16 m'den uzakta yaklaşır)
  check(sc.minDist >= 7 && sc.keptDistance >= 7 && sc.keptDistance <= 20, 'çığlıkçı oyuncuya yaklaşmamalı, mesafesini korumalı (≈ 9–16 m)', sc);
  res.riot = await evalJS(page, () => {
    const S = window.__game.session, sp = window.__spot;
    window.__clear();
    const zb = S.zombies.spawn('riot', sp.x + 6, sp.z);
    const hp0 = zb.hp;
    S.applyAction('zombie_hit', { id: zb.id, dmg: 40, dir: [1, 0], kind: 'gun' }, S.localId);
    const gun = hp0 - zb.hp;
    const hp1 = zb.hp;
    S.applyAction('zombie_hit', { id: zb.id, dmg: 40, dir: [1, 0], kind: 'melee' }, S.localId);
    return { gunDmg: gun, meleeDmg: hp1 - zb.hp };
  });
  log('çevik kuvvet', res.riot);
  const rt = res.riot || {};
  check(rt.gunDmg > 0 && rt.gunDmg < 30 && rt.meleeDmg > rt.gunDmg * 1.5, 'çevik kuvvet yeleği 40\'lık kurşun hasarını belirgin azaltmalı (< 30), yakın dövüş hasarı azalmamalı', rt);
  res.bloater = await evalJS(page, () => {
    const S = window.__game.session, sp = window.__spot;
    window.__clear();
    const b = S.zombies.spawn('bloater', sp.x + 3, sp.z);
    const near = S.zombies.spawn('normal', sp.x + 4.5, sp.z + 1);
    const far = S.zombies.spawn('normal', sp.x + 25, sp.z + 20);
    S.localStats.health = 100; S.localStats.cond.poisoned = 0;
    S.applyAction('zombie_hit', { id: b.id, dmg: 999, dir: [1, 0], kind: 'gun' }, S.localId);
    window.__step(5);
    return { bloaterDead: b.dead, nearHp: near.dead ? 'öldü' : near.hp, farHp: far.hp, playerHp: +S.localStats.health.toFixed(1), poisoned: S.localStats.cond.poisoned > 0, nearHurt: near.dead || near.hp < near.def.hp, farUntouched: !far.dead && far.hp === far.def.hp };
  });
  log('şişko', res.bloater);
  const bl = res.bloater || {};
  // patlama yarıçapı 4,2 m: 1,8 m'deki zombi ağır yara alır/ölür, 28 m'deki zombiye ve 3 m'deki oyuncuya bakılır
  check(bl.bloaterDead === true && bl.nearHurt === true && bl.farUntouched === true, 'şişko ölünce patlamalı: yakındaki zombiyi yaralamalı, uzaktakine dokunmamalı', bl);
  check(bl.playerHp > 0 && bl.playerHp < 100 && bl.poisoned === true, 'şişko patlaması 3 m\'deki oyuncuyu yaralamalı ve zehirlemeli', bl);
  res.wolves = await evalJS(page, () => {
    const S = window.__game.session, sp = window.__spot, N = S.npcs;
    window.__clear();
    for (const a of N.animals) { N.group.remove(a.root); } N.animals.length = 0;
    S.localStats.health = 100;
    S.time.isNight; // noop
    for (let i = 0; i < 3; i++) { N.spawnAnimal('wolf', sp.x + 14 + i * 1.5, sp.z + 6); N.animals[N.animals.length - 1].group = 'test'; N.animals[N.animals.length - 1].slot = i; }
    N._spawnT = 999;
    const hp0 = S.localStats.health;
    let attackers = 0, maxStates = {};
    for (let i = 0; i < 240; i++) { window.__step(1); for (const a of N.animals) maxStates[a.state] = (maxStates[a.state] || 0) + 1; }
    const ds = N.animals.map((a) => +Math.hypot(a.x - S.local.pos.x, a.z - S.local.pos.z).toFixed(1));
    // yalnız testin kurtları (gündüz tehdidi başıboş köpek sürüsü doğurursa onlar ayrı kalsın)
    const testDists = N.animals.filter((a) => a.group === 'test').map((a) => +Math.hypot(a.x - S.local.pos.x, a.z - S.local.pos.z).toFixed(1));
    return { playerDmg: +(hp0 - S.localStats.health).toFixed(1), states: maxStates, dists: ds, testDists, modelled: N.animals.every((a) => !!a.view) };
  });
  log('kurtlar', res.wolves);
  const wf = res.wolves || {};
  const wAtk = (wf.states && wf.states.attack) || 0;
  check(wf.modelled === true && wAtk >= 360 && wf.playerDmg > 0, 'kurt sürüsü (3 kurt, 15 m) saldırıya geçmeli ve oyuncuyu ısırmalı', wf);
  // sürü taktiği: bir kurt dalar, diğerleri 7–9 m'de döner; saldırılar arası en az 1,9 sn → 8 sn'de en çok 4 ısırık (~40)
  const td = Array.isArray(wf.testDists) ? wf.testDists : [];
  check(td.length === 3 && Math.max(...td) > 4 && wf.playerDmg < 65, 'kurtlar sırayla saldırmalı: biri dalarken diğerleri çevrede dönmeli, hasar sınırlı kalmalı', wf);
  res.dog = await evalJS(page, () => {
    const S = window.__game.session, sp = window.__spot, N = S.npcs;
    for (const a of N.animals) { N.group.remove(a.root); } N.animals.length = 0;
    window.__clear();
    S.localStats.health = 100;
    const d = N.dog;
    d.found = true; d.follow = true; d.x = sp.x - 1.5; d.z = sp.z;
    const zb = S.zombies.spawn('normal', sp.x + 4, sp.z + 2);
    zb.state = 'idle';
    const hp0 = zb.hp;
    for (let i = 0; i < 150; i++) window.__step(1);
    return { zombieDmgByDog: hp0 - Math.max(0, zb.hp), zombieDead: zb.dead, dogModel: !!d.view };
  });
  log('karabaş', res.dog);
  const dg = res.dog || {};
  check(dg.dogModel === true && dg.zombieDmgByDog > 0, 'Karabaş sahibinin yanındaki zombiye saldırıp hasar vermeli', dg);
};
