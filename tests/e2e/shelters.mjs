// Yer altı sığınakları: 8 sığınağın her birine yüzey girişinden inilir (kilitliyse levye/kart ile açılır), oyuncu
// odanın zemininde durur ve yürür, kamera tavan ile zemin arasında kalır, iç mekân sayılır, yağmur ve deniz düzlemi
// görünmez; bütün odalar, konteynerler, çıkış ve jeneratör merdiven dibinden yürüyerek erişilebilir (eşyalar geçit
// kapatmaz); yüzeydeki çıkış noktası boştur; E basılı tutularak inilip çıkılır; takipçi bot da iner ve çıkar; yüzeydeki
// zombi yer altındaki oyuncuyu algılamaz; jeneratör ana ışıkları yakar; sığınakta ganimet var; gece sığınakta uyku hızlı
// geçer; çıkış yüzeye; kayıt/yükleme durumu korur; ev sığınağı (inşa edilince) aynı bölge hattıyla çalışır.
// Oyun döngüsü durdurulur, 1/60 sn adımlarla ilerletilir.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  const inv = await evalJS(page, () => {
    const g = window.__game; cancelAnimationFrame(g.raf); g.loop = () => {};
    const S = g.session;
    g.ui.onLockChange = () => {};
    for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel();
    S.zombies.cap = 0; for (const id of [...S.zombies.list.keys()]) S.zombies.removeZombie(id);
    S.dayThreats.t = 1e9;
    window.__step = (frames, keys = []) => { const inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); inp.endFrame(); } };
    const W = S.world, T = W.terrain, ph = W.physics;
    // merdiven dibinden yürüyerek erişim (0,25 m ızgara; 0,56 m üstü engel sayılır: basamak yüksekliğini aşan eşya geçit kapatır)
    const reach = (sh) => {
      const Z = sh.zone, fy = sh.floorY, st = 0.25;
      const nx = Math.ceil((Z.maxX - Z.minX) / st) + 1, nz = Math.ceil((Z.maxZ - Z.minZ) / st) + 1;
      const free = new Uint8Array(nx * nz), seen = new Uint8Array(nx * nz);
      const X = (i) => Z.minX + i * st, Y = (j) => Z.minZ + j * st;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = X(i), z = Y(j);
        if (W.under.zoneAt(x, fy + 0.5, z) !== Z) continue;
        if (ph.overlapsBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, fy + 0.56, fy + 1.7)) continue;
        free[i * nz + j] = 1;
      }
      const si = Math.round((Z.spawn.x - Z.minX) / st), sj = Math.round((Z.spawn.z - Z.minZ) / st);
      if (!free[si * nz + sj]) return { basla: false };
      const q = [si * nz + sj]; seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const i = Math.floor(q[h] / nz), j = q[h] % nz;
        for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a * nz + b; if (free[k] && !seen[k]) { seen[k] = 1; q.push(k); } }
      }
      const near = (x, z, r) => { for (const k of q) if (Math.hypot(X(Math.floor(k / nz)) - x, Y(k % nz) - z) < r) return true; return false; };
      const inRoom = (r) => { for (const k of q) { const x = X(Math.floor(k / nz)), z = Y(k % nz); if (x > r.minX + 0.3 && x < r.maxX - 0.3 && z > r.minZ + 0.3 && z < r.maxZ - 0.3) return true; } return false; };
      const conts = W.containers.filter((c) => c.id.startsWith(`sh:${sh.def.id}:`));
      const its = (k) => W.interactables.filter((q2) => q2.id.startsWith(`sh:${sh.def.id}:${k}`));
      return { basla: true, oda: Z.rooms.filter(inRoom).length + '/' + Z.rooms.length, konteyner: conts.filter((c) => near(c.x, c.z, 1.6)).length + '/' + conts.length,
        cikis: its('exit').every((e) => near(e.x, e.z, 2.0)), jenerator: its('power').every((e) => near(e.x, e.z, 1.8)), yatak: its('bed').every((e) => near(e.x, e.z, 1.8)) };
    };
    return W.shelters.map((sh) => {
      const e = sh.entry, o = e.out, it = W.interactables.find((q) => q.id === `sh:${sh.def.id}:enter`);
      const conts = W.containers.filter((c) => c.id.startsWith(`sh:${sh.def.id}:`)).length;
      const blk = ph.overlapsBox(o.x - 0.35, o.z - 0.35, o.x + 0.35, o.z + 0.35, o.y + 0.3, o.y + 1.8);
      return { id: sh.def.id, kilit: sh.def.lock, bina: !!W.buildingAt(e.x, e.z), su: T.isWater(e.x, e.z), giris: !!it, derinlik: +(T.heightAt(e.x, e.z) - sh.floorY).toFixed(1), oda: sh.zone.rooms.length, konteyner: conts,
        cikisBos: !blk, cikisZemin: +(ph.groundHeight(o.x, o.z, o.y + 3) - T.heightAt(o.x, o.z)).toFixed(2), erisim: reach(sh) };
    });
  });
  for (const s of inv) log('sığınak', s);
  check(inv.length === 8, '8 yer altı sığınağı kurulmalı', inv.length);
  for (const s of inv) {
    check(!s.bina && !s.su && s.giris && s.derinlik >= 8 && s.oda >= 2 && s.konteyner >= 2, `${s.id}: giriş açık arazide, oda en az 8 m derinde, ganimet var`, s);
    check(s.cikisBos && Math.abs(s.cikisZemin) < 0.6, `${s.id}: yüzeydeki çıkış noktası boş ve yerde olmalı`, s);
    const r = s.erisim, full = (t) => t && t.split('/')[0] === t.split('/')[1];
    check(r.basla && full(r.oda) && full(r.konteyner) && r.cikis && r.jenerator && r.yatak, `${s.id}: bütün odalar, konteynerler, çıkış, jeneratör ve yatak merdiven dibinden yürüyerek erişilebilir olmalı`, r);
  }

  const res = [];
  for (const s of inv) {
    const r = await evalJS(page, (id) => {
      const g = window.__game, S = g.session, W = S.world, sh = W.shelters.find((q) => q.def.id === id);
      const o = sh.entry.out;
      S.local.spawnAt(o.x, W.physics.groundHeight(o.x, o.z, o.y + 3) + 0.05, o.z, 0);
      window.__step(5);
      const it = W.interactables.find((q) => q.id === `sh:${id}:enter`);
      const lockedLabel = S.shelters.describe(it).label;
      // kilit: gerekli aleti ver, kapıyı aç
      if (S.shelters.state.get(id).locked) { S.inventory.add(sh.def.lock >= 2 ? 'keycard' : 'crowbar', 1, null, true); S.shelters.use(it); }
      const unlocked = !S.shelters.state.get(id).locked;
      S.shelters.use(it); // in
      window.__step(20);
      const P = S.local.pos, Z = S.local.zone;
      const inZone = !!Z && Z.id === id;
      const y0 = P.y;
      // odada yürü: düşmemeli, bölgede kalmalı
      S.local.camYaw = sh.def.rot + Math.PI;
      window.__step(90, ['KeyW']);
      const after = { y: S.local.pos.y, zone: S.local.zone && S.local.zone.id };
      const cam = g.gfx.camera.position;
      return {
        id, kilitEtiketi: lockedLabel, acildi: unlocked, bolgede: inZone, ic: !!(S.local.inside || S.local.zone),
        zemin: +(y0 - sh.floorY).toFixed(2), yuruyunce: { dy: +(after.y - sh.floorY).toFixed(2), bolge: after.zone },
        kamera: { y: +cam.y.toFixed(2), zemin: +sh.floorY.toFixed(2), tavan: +sh.ceilY.toFixed(2) },
      };
    }, s.id);
    res.push(r);
  }
  for (const r of res) log('iniş', r);
  for (const r of res) {
    check(r.acildi && r.bolgede && r.ic, `${r.id}: kapıdan inilebilmeli (kilitliyse açılıp), oyuncu sığınak bölgesinde`, r);
    check(Math.abs(r.zemin) < 0.5 && Math.abs(r.yuruyunce.dy) < 0.5 && r.yuruyunce.bolge === r.id, `${r.id}: oyuncu oda zemininde durmalı ve yürüyünce düşmemeli`, r);
    check(r.kamera.y > r.kamera.zemin + 0.2 && r.kamera.y < r.kamera.tavan, `${r.id}: kamera tavan ile zemin arasında kalmalı`, r);
  }
  check(res.find((r) => r.id === 'askeri').kilitEtiketi.includes('kilitli') && res.find((r) => r.id === 'lab').kilitEtiketi.includes('kart'), 'kilitli sığınaklar kilit etiketi göstermeli', res.map((r) => r.kilitEtiketi));

  // halk sığınağında: yağmur, zombi algısı, jeneratör/ışık, ganimet, uyku, çıkış
  const deep = await evalJS(page, () => {
    const g = window.__game, S = g.session, W = S.world, sh = W.shelters.find((q) => q.def.id === 'sehir');
    const enter = W.interactables.find((q) => q.id === 'sh:sehir:enter');
    S.shelters.use(enter); window.__step(10);
    // yağmur
    S.weather.set('rain', 300); window.__step(30);
    const rain = S.env.rain ? S.env.rain.visible : null;
    // zombi tam üstte, yüzeyde: oyuncuyu algılamamalı
    const p = S.local.pos;
    const zb = S.zombies.spawn('normal', p.x + 2, p.z + 2);
    let seen = null;
    if (zb) { zb.x = p.x + 2; zb.z = p.z + 2; zb.y = W.terrain.heightAt(zb.x, zb.z); zb.alert = 1; zb.yaw = Math.atan2(p.x - zb.x, p.z - zb.z); S.zombies.perceive(zb, S.zombies.targets(), true, 0); seen = !!(zb.target && zb.target.kind === 'player'); S.zombies.removeZombie(zb.id); }
    // jeneratör: ana ışıklar; lamba havuzu yalnız bu sığınağın ışıkları
    const pw = W.interactables.find((q) => q.id === 'sh:sehir:power');
    const lightsBefore = sh.lights.filter((l) => l.main && l.on).length;
    S.shelters.use(pw); window.__step(10);
    const lightsAfter = sh.lights.filter((l) => l.main && l.on).length;
    // ganimet: bir sığınak konteynerini ara
    const ct = W.containers.find((c) => c.id === 'sh:sehir:c0');
    S.applyAction('search_done', { id: ct.id }, S.localId);
    const st = S.loot.state.get(ct.id);
    window.__game.ui.closePanel();
    // gece sığınakta uyku: hızlı (güvenli)
    S.time.set((S.time.day - 1) * 1440 + 23 * 60);
    S.zombies.threatLevel = 0;
    S.trySleep(null);
    const ff = S.time.ff;
    S.wake();
    // çıkış
    const ex = W.interactables.find((q) => q.id === 'sh:sehir:exit');
    S.shelters.use(ex); window.__step(10);
    const out = { zone: S.local.zone ? S.local.zone.id : null, yuzeyFarki: +(S.local.pos.y - W.terrain.heightAt(S.local.pos.x, S.local.pos.z)).toFixed(2) };
    S.weather.set('clear', 300);
    return { yagmurGorunur: rain, zombiGordu: seen, isikOnce: lightsBefore, isikSonra: lightsAfter, ganimet: st ? st.slots.filter(Boolean).length : null, aranmis: st && st.searched, uykuHizi: ff, cikis: out };
  });
  log('halk sığınağı', deep);
  check(deep.yagmurGorunur === false, 'yer altında yağmur görünmemeli', deep);
  check(deep.zombiGordu === false, 'yüzeydeki zombi yer altındaki oyuncuyu algılamamalı', deep);
  check(deep.isikOnce === 0 && deep.isikSonra > 0, 'jeneratör sığınağın ana ışıklarını yakmalı', deep);
  check(deep.aranmis, 'sığınak konteyneri aranabilmeli', deep);
  check(deep.uykuHizi === 40, 'gece sığınakta uyku hızlı geçmeli (güvenli yer)', deep);
  check(deep.cikis.zone === null && Math.abs(deep.cikis.yuzeyFarki) < 0.6, 'çıkış yüzeye olmalı', deep);

  // gerçek etkileşim: girişe dönük E basılı tut → in; merdivene dönük E basılı tut → çık. Takipçi bot da iner/çıkar.
  const play = await evalJS(page, () => {
    const g = window.__game, S = g.session, W = S.world, sh = W.shelters.find((q) => q.def.id === 'hastane');
    S.bots.spawn(1);
    const b = S.bots.list[S.bots.list.length - 1]; b.order = 'follow';
    const o = sh.entry.out;
    // merdiven evinin kapısının önü (yerel z −1,5): girişe dönük
    const R = sh.def.rot, fx = sh.def.x - 1.5 * Math.sin(R), fz = sh.def.z - 1.5 * Math.cos(R);
    S.local.spawnAt(fx, W.physics.groundHeight(fx, fz, o.y + 3) + 0.05, fz, R);
    S.local.camYaw = R + Math.PI;
    b.pos.set(o.x + 1.5, W.physics.groundHeight(o.x + 1.5, o.z, o.y + 3), o.z);
    window.__step(5);
    const t1 = S.interact.findTarget();
    g.input.pressed.add('KeyE'); // tuşa basış (kenar) + basılı tutma
    window.__step(70, ['KeyE']);
    const z1 = S.local.zone && S.local.zone.id;
    window.__step(150);
    const bz1 = W.under.zoneAt(b.pos.x, b.pos.y + 0.5, b.pos.z);
    // merdivene dön, E basılı tut
    S.local.yaw = sh.def.rot + Math.PI; S.local.camYaw = sh.def.rot;
    window.__step(5);
    const t2 = S.interact.findTarget();
    g.input.pressed.add('KeyE');
    window.__step(60, ['KeyE']);
    const z2 = S.local.zone ? S.local.zone.id : null, dy = S.local.pos.y - W.terrain.heightAt(S.local.pos.x, S.local.pos.z);
    window.__step(150);
    const bz2 = W.under.zoneAt(b.pos.x, b.pos.y + 0.5, b.pos.z);
    const res = { girisEtiketi: t1 && t1.label, indi: z1, botAsagida: bz1 && bz1.id, cikisEtiketi: t2 && t2.label, cikti: z2, yuzeyFarki: +dy.toFixed(2), botYukarida: bz2 ? bz2.id : null, botYuzeyFarki: +(b.pos.y - W.terrain.heightAt(b.pos.x, b.pos.z)).toFixed(2), botUzaklik: +Math.hypot(b.pos.x - S.local.pos.x, b.pos.z - S.local.pos.z).toFixed(1) };
    S.bots.list.splice(S.bots.list.indexOf(b), 1); if (b.avatar) g.gfx.scene.remove(b.avatar.root);
    // deniz düzlemi: deniz seviyesinin altına inen sığınakta çizilmez, yüzeyde yine çizilir
    S.shelters.enter('lab'); window.__step(10);
    res.denizAsagida = W.water.meshes.map((m) => m.material.visible);
    S.shelters.exit('lab'); window.__step(10);
    res.denizYukarida = W.water.meshes.map((m) => m.material.visible);
    return res;
  });
  log('etkileşim ve bot', play);
  check(/Sığınağa in/.test(play.girisEtiketi || '') && play.indi === 'hastane', 'girişe dönük E basılı tutunca sığınağa inilmeli', play);
  check(/yukarı çık/.test(play.cikisEtiketi || '') && play.cikti === null && Math.abs(play.yuzeyFarki) < 0.6, 'merdivene dönük E basılı tutunca yüzeye çıkılmalı', play);
  check(play.botAsagida === 'hastane' && play.botYukarida === null && Math.abs(play.botYuzeyFarki) < 0.8 && play.botUzaklik < 8, 'takipçi bot oyuncuyla sığınağa inmeli ve çıkmalı', play);
  check(play.denizAsagida.every((v) => v === false) && play.denizYukarida.every(Boolean), 'yer altında deniz/göl düzlemi çizilmemeli, yüzeyde çizilmeli', play);

  // kayıt/yükleme: kilit ve jeneratör durumu korunur
  const save = await evalJS(page, () => {
    const S = window.__game.session;
    const o = S.shelters.serialize();
    for (const st of S.shelters.state.values()) { st.locked = 2; st.power = false; }
    S.shelters.load(o);
    return { askeriKilit: S.shelters.state.get('askeri').locked, sehirGuc: S.shelters.state.get('sehir').power };
  });
  log('kayıt/yükleme', save);
  check(save.askeriKilit === 0 && save.sehirGuc === true, 'sığınak durumu kayıttan geri yüklenmeli', save);

  // ev sığınağı: inşa edilince bölge kaydı, ışınlamalı giriş/çıkış
  const home = await evalJS(page, () => {
    const S = window.__game.session, W = S.world;
    S.applyAction('bunker', { stage: 4, progress: 0 }, S.localId);
    window.__step(5);
    S.build.enterBunker(); window.__step(15);
    const z1 = S.local.zone && S.local.zone.id, cam = window.__game.gfx.camera.position.y, by = S.build.bunkerY;
    const ex = W.interactables.find((q) => q.id === 'bunker_exit');
    if (ex) S.shelters.use(ex);
    window.__step(10);
    return { iceride: z1, kamera: +(cam - by).toFixed(2), cikisTuru: ex && ex.type, sonra: S.local.zone ? S.local.zone.id : null, yuzeyFarki: +(S.local.pos.y - W.terrain.heightAt(S.local.pos.x, S.local.pos.z)).toFixed(2) };
  });
  log('ev sığınağı', home);
  check(home.iceride === 'ev' && home.kamera > 0.2 && home.kamera < 3, 'ev sığınağı bölge olarak tanınmalı, kamera odada', home);
  check(home.cikisTuru === 'shelter_exit' && home.sonra === null && Math.abs(home.yuzeyFarki) < 0.6, 'ev sığınağından ışınlamayla yüzeye çıkılmalı', home);

  // final gecesi kızıl sisi: herhangi bir yer altı sığınağında hasar yok, açıkta var
  const mist = await evalJS(page, () => {
    const S = window.__game.session, E = S.endings, st = S.localStats;
    const keep = { active: E.active, waveT: E.waveT, t: S.time.total };
    S.time.set(29 * 1440 + 23 * 60); // 30. gün 23:00 (sis tam)
    E.active = true; E.waveT = 1e9;
    S.shelters.enter('dag'); window.__step(3);
    st.health = st.maxHealth; let h0 = st.health; E.update(1.2); E.update(1.2);
    const inShelter = h0 - st.health, zone = S.local.zone && S.local.zone.id;
    // açıkta: şehirde (dağ platosu 34 m'nin üstünde, sis oraya çıkmaz)
    S.shelters.exit('sehir'); window.__step(3);
    st.health = st.maxHealth; h0 = st.health; E.update(1.2); E.update(1.2);
    const outside = h0 - st.health;
    E.active = keep.active; E.waveT = keep.waveT; S.time.set(keep.t); st.health = st.maxHealth;
    return { bolge: zone, siginakta: +inShelter.toFixed(2), acikta: +outside.toFixed(2) };
  });
  log('kızıl sis', mist);
  check(mist.bolge === 'dag' && mist.siginakta === 0 && mist.acikta > 0, 'final gecesi kızıl sis sığınakta hasar vermemeli, açıkta vermeli', mist);

  // görsel: halk sığınağının içi (jeneratör açık)
  await evalJS(page, () => {
    const g = window.__game, S = g.session, W = S.world;
    S.shelters.use(W.interactables.find((q) => q.id === 'sh:sehir:enter'));
    window.__step(30);
    g.gfx.render(0.016, g.time); g.gfx.render(0.016, g.time);
  });
  await shot(page, '/tmp/shelter-sehir.png');
};
