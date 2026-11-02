// Gündüz yağma, gece zombi: gündüz doğal zombi doğmaz; alacakaranlıkta zombiler oyuncunun yakınında topraktan çıkar
// ('emerge'); şafakta yaşayanlar toprağa döner ('burrow'), öldürülmüş sayılmadan bölge nüfusuna geri eklenir; gündüz
// olay zombisi o gecenin alacakaranlığına ertelenir; gündüz tehditleri (yağmacı devriyesi, başıboş köpekler, güneş
// çarpması) çalışır; gece açıkta uyku yavaş geçer. Oyun döngüsü durdurulur, 1/60 sn adımlarla ilerletilir.
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
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    window.__step = (frames) => { const inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); S.update(1 / 60); inp.endFrame(); } };
    window.__setTime = (h, m = 0) => { S.time.set((S.time.day - 1) * 1440 + h * 60 + m); };
    window.__natural = () => [...S.zombies.list.values()].filter((z) => !z.dead && !z.def.human);
    // şehir merkezinde açıkta dur (zombi bölgesi, yağmacı bölgesi)
    const x = 95, z = -30;
    S.local.spawnAt(x, S.world.physics.groundHeight(x, z) + 0.05, z, 0);
    S.dayThreats.t = 1e9; // gündüz tehditlerini bu adımda elle tetikleyeceğiz
  });

  // 1) öğlen: doğal nüfus çalışsa da zombi doğmaz
  const noon = await evalJS(page, () => {
    const S = window.__game.session;
    window.__setTime(12, 0);
    for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    window.__step(60 * 25);
    return { saat: S.time.hour, dogal: window.__natural().length };
  });
  log('öğlen', noon);
  check(noon.dogal === 0, 'gündüz doğal zombi doğmamalı', noon);

  // 2) gündüz olay zombisi geceye ertelenir
  const defer = await evalJS(page, () => {
    const S = window.__game.session, p = S.local.pos;
    const r = S.events.zSpawn('normal', p.x + 30, p.z + 10, {});
    const e = S.events.schedule.find((q) => q.kind === 'zspawn');
    return { donen: r, plan: e ? { saat: Math.round((e.at % 1440) / 6) / 10, adet: e.list.length } : null, dogal: window.__natural().length };
  });
  log('ertelenen olay', defer);
  check(defer.donen === null && defer.plan && defer.plan.saat >= 20.5 && defer.plan.saat < 21 && defer.dogal === 0, 'gündüz olay zombisi bu gece alacakaranlığa ertelenmeli', defer);

  // 3) alacakaranlık: zombiler oyuncunun yakınında topraktan çıkar; ertelenen olay zombisi de çıkar
  const dusk = await evalJS(page, () => {
    const S = window.__game.session, p = S.local.pos;
    window.__setTime(20, 34);
    let emerged = 0, nearest = Infinity, maxSink = 0;
    for (let k = 0; k < 40; k++) {
      window.__step(30);
      for (const zb of window.__natural()) if (zb.state === 'emerge') { emerged++; nearest = Math.min(nearest, Math.hypot(zb.x - p.x, zb.z - p.z)); }
      for (const v of S.zombies.views.values()) maxSink = Math.min(maxSink, v.sink || 0);
    }
    return { saat: S.time.hour + ':' + S.time.minute, dogal: window.__natural().length, cikis: emerged, enYakin: +nearest.toFixed(1), batma: +maxSink.toFixed(2), planKaldi: S.events.schedule.filter((q) => q.kind === 'zspawn').length };
  });
  log('alacakaranlık', dusk);
  check(dusk.dogal > 0 && dusk.cikis > 0 && dusk.enYakin < 65 && dusk.batma < -0.3, 'alacakaranlıkta zombiler yakında topraktan çıkmalı (görünüm yerin altından yükselir)', dusk);
  check(dusk.planKaldi === 0, 'ertelenen olay zombisi alacakaranlıkta doğmalı', dusk);
  await evalJS(page, () => { const g = window.__game, S = g.session, c = g.gfx.camera, zb = window.__natural()[0]; if (zb) { c.position.set(zb.x + 4, zb.y + 2, zb.z + 4); c.lookAt(zb.x, zb.y + 0.8, zb.z); g.gfx.render(0.016, g.time); } void S; });
  await shot(page, '/tmp/daynight-dusk.png');

  // 4) şafak: yaşayanlar toprağa döner, öldürülmüş sayılmaz, nüfusa geri eklenir
  const dawn = await evalJS(page, () => {
    const S = window.__game.session, Z = S.zombies;
    const alive0 = window.__natural().length;
    const pop0 = Z.zones.reduce((a, z) => a + z.pop, 0), killed0 = Z.zones.reduce((a, z) => a + z.killed, 0);
    window.__setTime(5, 59);
    window.__step(5);
    window.__setTime(6, 1);
    window.__step(5);
    const marked = window.__natural().filter((z) => z.burrowAt).length;
    // testi kısaltmak için dönüş zamanları öne çekilir (oyunda 3–90 sn yayılır)
    for (const zb of window.__natural()) zb.burrowAt = S.t;
    let sawBurrow = 0;
    for (let k = 0; k < 20; k++) { window.__step(15); sawBurrow += window.__natural().filter((z) => z.state === 'burrow').length; }
    const pop1 = Z.zones.reduce((a, z) => a + z.pop, 0), killed1 = Z.zones.reduce((a, z) => a + z.killed, 0);
    return { once: alive0, isaretli: marked, gomulme: sawBurrow, kalan: window.__natural().length, nufusArtisi: pop1 - pop0, olu: killed1 - killed0, dawn: Z.lastDawn };
  });
  log('şafak', dawn);
  check(dawn.once > 0 && dawn.isaretli === dawn.once, 'şafakta yaşayan bütün zombilere toprağa dönüş zamanı verilmeli', dawn);
  check(dawn.gomulme > 0 && dawn.kalan === 0 && dawn.olu === 0 && dawn.nufusArtisi > 0, 'zombiler toprağa dönmeli (öldürülmüş sayılmadan nüfusa eklenerek)', dawn);

  // 5) gündüz tehditleri: yağmacı devriyesi ve başıboş köpek sürüsü
  const day = await evalJS(page, () => {
    const S = window.__game.session, p = S.local.pos;
    window.__setTime(11, 0);
    const pl = { x: p.x, z: p.z, id: S.localId };
    const n = S.dayThreats.spawnPatrol(pl, S.time.day);
    const raiders = [...S.zombies.list.values()].filter((z) => z.def.human && z.patrol);
    S.npcs.spawnPack('husky', p, 3, null, 50);
    window.__step(10);
    const dogs = S.npcs.animals.filter((a) => !a.dead && a.def.stray);
    // akşam çekilme: oyuncudan uzak devriyeler kaldırılır
    window.__setTime(20, 10);
    for (const zb of raiders) { zb.x = p.x + 120; zb.z = p.z; zb.state = 'idle'; }
    S.dayThreats.withdraw();
    const left = [...S.zombies.list.values()].filter((z) => z.patrol && !z.dead).length;
    return { devriye: n, yagmaci: raiders.length, uzaklik: raiders.length ? Math.round(Math.hypot(raiders[0].x - p.x, raiders[0].z - p.z)) : null, kopek: dogs.length, kopekAdi: dogs[0] && dogs[0].def.name, cekilmeSonrasi: left };
  });
  log('gündüz tehditleri', day);
  check(day.devriye >= 2 && day.yagmaci >= 2, 'gündüz yağmacı devriyesi doğmalı', day);
  check(day.kopek >= 2 && day.kopekAdi === 'Başıboş Köpek', 'başıboş köpek sürüsü doğmalı', day);
  check(day.cekilmeSonrasi === 0, 'akşam uzaktaki devriyeler çekilmeli', day);

  // 6) güneş çarpması: sıcak havada öğleden sonra açıkta vücut ısısı yükselir; içeride yükselmez
  const heat = await evalJS(page, () => {
    const S = window.__game.session, st = S.localStats;
    window.__setTime(13, 30);
    S.weather.set('heat', 600);
    st.temp = 37; st.thirst = 90; st.hunger = 90;
    const t0 = st.temp;
    for (let i = 0; i < 12; i++) S.tickNeeds(10);
    const outside = { temp: +st.temp.toFixed(2), gunes: +S.sunExposure.toFixed(2), hava: +S.weather.temperature.toFixed(1) };
    // bir binanın içinde
    const b = S.world.buildingById.pharmacy;
    const c = b.rooms[0];
    S.local.spawnAt((c.minX + c.maxX) / 2, b.floorY + 0.05, (c.minZ + c.maxZ) / 2, 0);
    window.__step(3);
    st.temp = 37;
    for (let i = 0; i < 12; i++) S.tickNeeds(10);
    return { t0, disarida: outside, iceride: { temp: +st.temp.toFixed(2), gunes: +S.sunExposure.toFixed(2), bina: S.local.inside && S.local.inside.id } };
  });
  log('güneş çarpması', heat);
  check(heat.disarida.gunes > 0.5 && heat.disarida.temp > 38.6, 'sıcak öğleden sonra açıkta vücut ısısı yükselmeli (güneş çarpması)', heat);
  check(heat.iceride.gunes === 0 && heat.iceride.temp < 38, 'bina içinde güneş çarpması olmamalı', heat);

  // 7) gece açıkta uyku yavaş geçer (sığınak/korunaklı üs değil)
  const sleep = await evalJS(page, () => {
    const S = window.__game.session;
    S.weather.set('clear', 600);
    const x = 95, z = -30;
    S.local.spawnAt(x, S.world.physics.groundHeight(x, z) + 0.05, z, 0);
    window.__setTime(23, 0);
    for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    S.zombies.threatLevel = 0;
    S.trySleep(null);
    const ff = S.time.ff;
    S.wake();
    return { ff, gece: S.time.isNight };
  });
  log('açıkta uyku', sleep);
  check(sleep.gece && sleep.ff > 1 && sleep.ff <= 10, 'gece açıkta uyku yavaş geçmeli', sleep);

  // 8) akşamüstü açıkta yatılırsa gündüz hızlı (×40) başlar, alacakaranlıkta yavaşlar; hasar uyandırır ve oyu geri çeker
  const nap = await evalJS(page, () => {
    const S = window.__game.session;
    window.__setTime(19, 0);
    S.trySleep(null);
    const gunduz = S.time.ff;
    window.__setTime(20, 31);
    window.__step(3);
    const gece = S.time.ff;
    S.damageLocal(5, 'zombie');
    window.__step(3);
    return { gunduz, gece, uyandi: S.local.mode !== 'sleep', oy: S.sleepVotes.size, hiz: S.time.ff };
  });
  log('akşamüstü uyku', nap);
  check(nap.gunduz === 40 && nap.gece > 1 && nap.gece <= 10, 'akşamüstü başlayan açık hava uykusu alacakaranlıkta yavaşlamalı', nap);
  check(nap.uyandi && nap.oy === 0 && nap.hiz === 1, 'hasarla uyanınca uyku oyu geri çekilmeli, zaman normal akmalı', nap);
};
