// Ses testi: ayak sesleri (zemin türleri), HRTF konumlandırma, oklüzyon, iç mekân yankısı, savaş teması.
// Oyun döngüsü durdurulur, oturum sabit 1/60 sn adımlarla ilerletilir.
// Denetimler: ses bağlamı çalışır (HRTF, yankı, savaş teması, çözülmüş örnekler); çimde yürüyüş her adımda 'grass',
// yolda koşu 'hard' ve daha hızlı adım; eğilerek yürüyüş eğik (kısık) ve daha yavaş adım; evde iç mekân yankısı ve her
// adım ahşap (salonun zemini; çim/arazi değil); tek yüzey sınıflayıcısı (World.surfaceAt) sondaları: evin odaları
// (oyuncu +0,03, bot/NPC +0, ağ gecikmesi −0,15), kapı eşikleri, veranda, sığınaklar (beton/mağara), köprü tabliyesi,
// göl iskelesi, yol/kaldırım/çim, göl su, toprak yol çakıl, kıyı; uzak oyuncu/bot/NPC ve zombi adımı Session yolundan
// aynı zemini çalar; dünyadaki bütün binaların bütün odaları kendi zeminini okur, bütün yüzey etiketleri geçerli;
// duvar arkasındaki ses kapalı, açıktaki açık sayılır ve konumsal ses HRTF panner düğümü kurar; savaş teması yoğunlukla
// açılıp söner.
export default async ({ page, url, wait, evalJS, log, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  const ses = await S(async () => {
    const g = window.__game, A = g.audio;
    await A.init();
    cancelAnimationFrame(g.raf); g.raf = 0;
    const S = g.session;
    window.__step = (n, keys = []) => { for (let i = 0; i < n; i++) { g.input.down.clear(); for (const k of keys) g.input.down.add(k); S.update(1 / 60); g.input.endFrame(); } g.input.down.clear(); };
    // ayak sesi sayacı
    const steps = [];
    const orig = A.footstep.bind(A);
    A.footstep = (at, surface, speed, crouch) => { steps.push([surface, Math.round(speed * 10) / 10, crouch]); orig(at, surface, speed, crouch); };
    // HRTF panner sayacı (konumsal sesler): sonraki adımlar okur
    window.__panners = 0;
    const cp = A.ctx.createPanner.bind(A.ctx);
    A.ctx.createPanner = () => { window.__panners++; return cp(); };
    return { state: A.ctx.state, hrtf: A.hrtf, verb: !!A.verb, battle: !!A.battleEl, samples: Object.keys(A.buffers).length };
  });
  log('ses', ses);
  check(ses && ses.state === 'running' && ses.hrtf && ses.verb && ses.battle && ses.samples > 0,
    'ses bağlamı çalışmalı: HRTF, yankı (convolver), savaş teması öğesi ve çözülmüş ses örnekleri', ses);
  // çimde yürüme, yolda koşma, eğilerek yürüme, evde yürüme
  const ayak = await S(() => {
    const g = window.__game, S = g.session, T = S.world.terrain, out = {};
    // press: duruş tuşları basışla değişir (input.pressed); __step yalnız basılı tutar (input.down), bu yüzden ilk
    // karede basış ayrıca verilir. Yerel oyuncunun adımları konumsuz (at === null) çalınır: yalnız onlar sayılır.
    const run = (x, z, yaw, frames, keys, press = null) => {
      S.local.spawnAt(x, T.heightAt(x, z) + 0.1, z, yaw);
      window.__step(20);
      const A = g.audio, before = A._stepLog ? A._stepLog.length : 0;
      const log0 = [], yerel = [];
      const f = A.footstep;
      A.footstep = (at, surface, speed, crouch) => { log0.push(surface); if (!at) yerel.push([speed, !!crouch]); f(at, surface, speed, crouch); };
      if (press) g.input.pressed.add(press);
      window.__step(frames, keys);
      A.footstep = f;
      void before;
      return { n: log0.length, surfaces: [...new Set(log0)], local: yerel.length, crouch: yerel.filter((s) => s[1]).length, maxSpeed: yerel.length ? +Math.max(...yerel.map((s) => s[0])).toFixed(2) : 0, mode: S.local.mode };
    };
    // çim şeridi: mahalle batı yolunun (mah_w, x = −235, yarı genişlik 4) kaldırımı x = −228,8'e dek uzanır (eski koşu
    // noktaları −229,5/−230 artık kaldırımda, 'hard'). Kaldırımın ötesinde, z 120–131 boyunca her 0,5 m'de sınıflayıcının
    // 'grass' dediği ve engelsiz ilk şerit seçilir: yürüyüş yolu sınıflayıcıyla doğrulanır (ızgara sınırına bağlı değil).
    const W = S.world;
    let gx = null;
    for (let dx = 0; dx <= 6 && gx === null; dx += 0.5) {
      const x = -227.5 + dx;
      let ok = true;
      for (let z = 120; z <= 131 && ok; z += 0.5) {
        const h = T.heightAt(x, z);
        if (W.surfaceAt(x, h + 0.03, z) !== 'grass' || W.physics.overlapsBox(x - 0.4, z - 0.4, x + 0.4, z + 0.4, h + 0.05, h + 2)) ok = false;
      }
      if (ok) gx = x;
    }
    out.grassX = gx;
    out.grass = run(gx ?? -227.5, 120, 0, 120, ['KeyW']);
    out.road = run(-200, 170, Math.PI / 2, 120, ['KeyW', 'ShiftLeft']);
    out.crouch = run(gx ?? -227.5, 125, 0, 120, ['KeyW', 'KeyC'], 'KeyC');
    // tekrar ayağa kalk (iç mekân yürüyüşü ayakta)
    g.input.pressed.add('KeyC'); window.__step(10);
    out.standAfter = S.local.mode;
    const h = S.world.home;
    const ip = h.frame.pt(5, 8);
    S.local.spawnAt(ip.x, h.floorY + 0.1, ip.z, 0);
    window.__step(20);
    out.indoorEnv = g.audio.indoor;
    // yalnız yerel oyuncunun adımları (konumsuz çalınır): yakından geçen NPC'nin dışarıdaki adımı sayılmaz
    const lg = [];
    const f = g.audio.footstep;
    g.audio.footstep = (at, surface, speed, crouch) => { if (!at) lg.push(surface); f(at, surface, speed, crouch); };
    window.__step(90, ['KeyW']);
    g.audio.footstep = f;
    out.indoorSteps = lg.length;
    out.indoor = [...new Set(lg)];
    out.indoorEnd = (() => { const r = h.roomAt(S.local.pos.x, S.local.pos.z); return r ? r.id : null; })();
    // ikinci iç yürüyüş: salondan kemerden mutfağa (şablon +x, kemerin ortası z = 9,75); her adımda ayağın altındaki oda
    {
      const fr0 = h.frame, kp = fr0.pt(2, 9.75), d = fr0.dir(1, 0);
      const tpl = (x, z) => { const dx = x - fr0.cx, dz = z - fr0.cz; return [+(dx * fr0.c - dz * fr0.s + fr0.w / 2).toFixed(2), +(dx * fr0.s + dz * fr0.c + fr0.d / 2).toFixed(2)]; };
      S.local.spawnAt(kp.x, h.floorY + 0.1, kp.z, Math.atan2(d.x, d.z));
      window.__step(20);
      const lk = [];
      g.audio.footstep = (at, surface, speed, crouch) => { if (!at) { const q = S.local.avatar.root.position, r = h.roomAt(q.x, q.z); lk.push([surface, r ? r.id : null, r ? r.surface : null, tpl(q.x, q.z)[0]]); } f(at, surface, speed, crouch); };
      window.__step(270, ['KeyW']);
      g.audio.footstep = f;
      out.archWalk = { steps: lk, end: tpl(S.local.pos.x, S.local.pos.z) };
    }
    out.surfaceProbe = { beach: W.surfaceAt(-150, T.heightAt(-150, 760), 760), lake: W.surfaceAt(-196, T.heightAt(-196, -100), -100), dirtRoad: W.surfaceAt(-326, T.heightAt(-326, 100), 100) };
    // ---- tek yüzey sınıflayıcısı sondaları (World.surfaceAt)
    const fr = h.frame;
    const pr = (tx, tz, y) => { const p = fr.pt(tx, tz); return W.surfaceAt(p.x, y, p.z); };
    // oyuncu ayağı zeminin 3 cm üstünde (karakter denetleyicisi payı), bot/NPC/zombi tam üstünde, uzak oyuncu gecikmeyle altında
    out.home = {
      living: [0.03, 0, -0.15].map((dy) => pr(5, 9, h.floorY + dy)), kitchen: pr(14, 9, h.floorY + 0.03), bath: pr(7.5, 3, h.floorY + 0.03),
      garage: pr(21, 6, h.floorY + 0.03), frontDoor: pr(5, 13.06, h.floorY + 0.03), garageDoor: pr(21.5, 13.06, h.floorY + 0.03),
      porch: pr(5, 14.6, fr.baseY + 0.28),
    };
    const shp = (id) => { const s = W.shelters.find((q) => q.def.id === id); return s ? W.surfaceAt(s.zone.spawn.x, s.floorY + 0.03, s.zone.spawn.z) : null; };
    out.shelter = { sehir: shp('sehir'), orman: shp('orman') };
    out.bridge = W.surfaceAt(630, W.physics.groundHeight(630, -630, 20) + 0.03, -630);
    const fish = W.interactables.find((it) => it.type === 'fishing_spot' && it.water === 'lake');
    out.lakeDock = fish ? W.surfaceAt(fish.x, W.physics.groundHeight(fish.x, fish.z, fish.y) + 0.03, fish.z) : null;
    const st = (x, z) => W.surfaceAt(x, T.heightAt(x, z) + 0.03, z);
    out.street = { road: st(-200, 170), sidewalk: st(-229.5, 120), lawn: st(gx ?? -227.5, 120) };
    // uzak oyuncu / bot / NPC adımı (Session.onAvatarStep, konumlu) ve zombi adımı (onZombieStep, sentez) salonda
    const p9 = fr.pt(5, 9), remote = [], zombie = [];
    const fA = g.audio.footstep, pA = g.audio.play;
    g.audio.footstep = (at, surface) => { remote.push([!!at, surface]); };
    for (const dy of [0.03, 0, -0.15]) S.onAvatarStep({ root: { position: { x: p9.x, y: h.floorY + dy, z: p9.z } } }, 1.4, 'ground');
    g.audio.footstep = fA;
    g.audio.play = (name, o) => { if (name === 'step') zombie.push(o.surface); };
    S._zsFrame = -1;
    S.onZombieStep({ root: { position: { x: p9.x, y: h.floorY, z: p9.z } } }, 1, false);
    g.audio.play = pA;
    out.remote = remote; out.zombie = zombie;
    return out;
  });
  // dünya taraması: bütün binaların bütün odaları (zemin katı, kit kulelerinin yükseltilmiş zemini) oyuncu ayağı
  // yüksekliğinde kendi zemin malzemesini okur; bütün yüzey etiketleri ve basılabilir yüzeylerin sonuçları geçerli malzeme
  const tarama = await S(async () => {
    const { SURFACE_MATERIALS } = await import('./src/world/WorldBuilder.js');
    const MATS = new Set(SURFACE_MATERIALS);
    const W = window.__game.session.world, P = W.physics;
    let rooms = 0, skipped = 0;
    const wrong = [], bad = [], roomMats = {}, tags = {};
    for (const b of W.buildings) {
      for (const r of b.rooms) {
        roomMats[r.surface] = (roomMats[r.surface] || 0) + 1;
        if (!MATS.has(r.surface)) bad.push('oda ' + b.id + '/' + r.id + ':' + r.surface);
        const x = (r.minX + r.maxX) / 2, z = (r.minZ + r.maxZ) / 2, y = b.floorY + 0.03;
        // odanın ortasında alçak eşya (ayağın 0,4 m üstüne kadar) varsa o nokta eşyanın malzemesini okur: atla
        if (P.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3).some((c) => c.walkable && c.kind !== 'floor' && c.maxY > b.floorY + 0.01 && c.maxY <= y + 0.4)) { skipped++; continue; }
        rooms++;
        const m = W.surfaceAt(x, y, z);
        if (m !== r.surface) wrong.push(b.id + '/' + r.id + ':' + m + '≠' + r.surface);
      }
    }
    let walk = 0;
    // yalnız günlük: bina ve sığınak dışındaki yükseltilmiş basılabilir yüzeylerde eski yükseklik kuralı (1,2 m üstü metal,
    // altı ahşap) → yeni malzeme geçişleri; tirmanilir: eskiden metal, şimdi ahşap okunan ve oyuncunun tırmanabileceği
    // (≤ 2,45 m yüksek, ≥ 0,6 m geniş) etiketsiz eşyalar (direk tepeleri gibi ulaşılamayanlar sayılmaz)
    const T = W.terrain, gecis = {}, tirmanilir = [];
    for (const c of P.all) {
      if (c.surface) { tags[c.surface] = (tags[c.surface] || 0) + 1; if (!MATS.has(c.surface)) bad.push('etiket ' + c.kind + ':' + c.surface); }
      if (!c.walkable || !c.enabled) continue;
      const x = c.shape === 'circle' ? c.x : (c.minX + c.maxX) / 2, z = c.shape === 'circle' ? c.z : (c.minZ + c.maxZ) / 2;
      const y = c.maxY + 0.03, m = W.surfaceAt(x, y, z), th = T.heightAt(x, z);
      walk++;
      if (!MATS.has(m)) bad.push('yüzey ' + c.kind + ':' + m);
      if (y - th > 0.35 && y > th - 1 && !W.buildingAt(x, z)) {
        const k = (y - th > 1.2 ? 'metal' : 'wood') + '→' + m + ' (' + c.kind + ')'; gecis[k] = (gecis[k] || 0) + 1;
        const wmin = c.shape === 'circle' ? 2 * c.r : Math.min(c.maxX - c.minX, c.maxZ - c.minZ);
        if (k === 'metal→wood (prop)' && y - th < 2.45 && wmin >= 0.6) tirmanilir.push([Math.round(x), Math.round(z), +(y - th).toFixed(2), +wmin.toFixed(2)]);
      }
    }
    for (const Z of W.under.zones) if (Z.surface && !MATS.has(Z.surface)) bad.push('bölge ' + Z.id + ':' + Z.surface);
    return { buildings: W.buildings.length, rooms, skipped, wrong: wrong.slice(0, 12), nWrong: wrong.length, roomMats, tags, walkable: walk, bad: bad.slice(0, 12), nBad: bad.length, gecis, tirmanilir };
  });
  log('yüzey taraması', tarama);
  log('ayak sesleri', ayak);
  const ay = ayak || {};
  check(ay.grassX !== null && ay.grass && ay.grass.local > 0 && ay.grass.surfaces.length === 1 && ay.grass.surfaces[0] === 'grass' && ay.grass.crouch === 0 && ay.road && ay.road.local > 0 && ay.road.surfaces.includes('hard') && ay.road.maxSpeed > ay.grass.maxSpeed,
    'zemine göre ayak sesi: çim şeridi bulunmalı ve her adımı \'grass\', asfaltta koşu \'hard\' ve yürüyüşten hızlı adım çalmalı', { grassX: ay.grassX, grass: ay.grass, road: ay.road });
  check(ay.crouch && ay.crouch.mode === 'crouch' && ay.crouch.local > 0 && ay.crouch.crouch === ay.crouch.local && ay.grass && ay.crouch.maxSpeed < ay.grass.maxSpeed && ay.standAfter === 'ground',
    'eğilerek yürüyüşte oyuncu eğilmeli; her adım eğik (kısık) ve yürüyüşten yavaş çalmalı; C ile tekrar ayağa kalkmalı', { crouch: ay.crouch, standAfter: ay.standAfter });
  // iç mekân: her adım salonun ahşap zemininden (eskiden zemin araziden 0,30 + 0,03 m yukarıda eşiğin altında kalıyor, adım çimdi)
  check(ay.indoorEnv === true && ay.indoorSteps > 0 && Array.isArray(ay.indoor) && ay.indoor.length === 1 && ay.indoor[0] === 'wood' && ay.indoorEnd === 'living',
    'evde iç mekân yankısı açılmalı ve salondaki her adım ahşap zemin çalmalı (çim/arazi yok)', { indoorEnv: ay.indoorEnv, steps: ay.indoorSteps, indoor: ay.indoor, room: ay.indoorEnd });
  // salon → kemer → mutfak: her adım o an altındaki odanın zemini (ahşap → karo), iki oda da adımlanmış
  const AW = (ay.archWalk && ay.archWalk.steps) || [];
  check(AW.length >= 3 && AW.every(([m, room, want]) => room && m === want) && AW.some(([, room]) => room === 'living') && AW.some(([, room]) => room === 'kitchen'),
    'salondan mutfağa yürüyüşte her adım altındaki odanın zeminini çalmalı (ahşap → karo)', ay.archWalk);
  const H = ay.home || {};
  check(Array.isArray(H.living) && H.living.every((m) => m === 'wood') && H.kitchen === 'tile' && H.bath === 'tile' && H.garage === 'concrete' && H.frontDoor === 'wood' && H.garageDoor === 'concrete' && H.porch === 'wood',
    'ev: salon ahşap (oyuncu/bot/gecikme yüksekliğinde), mutfak ve banyo karo, garaj beton; ön kapı eşiği ahşap, garaj eşiği beton, veranda ahşap', H);
  check(ay.shelter && ay.shelter.sehir === 'concrete' && ay.shelter.orman === 'gravel' && ay.bridge === 'asphalt' && ay.lakeDock === 'wood',
    'sığınak betonu ve mağara çakılı, köprü tabliyesi asfalt (eskiden metal), göl iskelesi ahşap (su değil)', { shelter: ay.shelter, bridge: ay.bridge, lakeDock: ay.lakeDock });
  check(ay.street && ay.street.road === 'asphalt' && ay.street.sidewalk === 'concrete' && ay.street.lawn === 'grass',
    'sokak: yol şeridi asfalt, kentsel kaldırım beton, kaldırımın ötesi çim', ay.street);
  check(Array.isArray(ay.remote) && ay.remote.length === 3 && ay.remote.every(([at, m]) => at && m === 'wood') && Array.isArray(ay.zombie) && ay.zombie.length === 1 && ay.zombie[0] === 'wood',
    'uzak oyuncu/bot/NPC adımı (konumlu) ve zombi adımı salonda ahşap çalmalı', { remote: ay.remote, zombie: ay.zombie });
  const TR = tarama || {};
  check(TR.buildings >= 80 && TR.rooms > 150 && TR.nWrong === 0 && TR.nBad === 0 && TR.walkable > 100,
    'dünya taraması: bütün binaların odaları kendi zeminini okumalı; bütün yüzey etiketleri ve basılabilir yüzey sonuçları geçerli malzeme olmalı', TR);
  const P = ay.surfaceProbe || {};
  // kumsal sondası (-150, 760) kıyıdaki sığ suya düşüyor (arazi deniz seviyesinin altında): kum ya da su kabul edilir
  check(P.lake === 'water' && P.dirtRoad === 'gravel' && ['sand', 'water'].includes(P.beach), 'zemin sondası: göl su, toprak yol çakıl, kıyı kum/su olmalı', P);
  // oklüzyon: duvarın arkasındaki ses
  const okl = await S(() => {
    const g = window.__game, S = g.session, A = g.audio;
    const h = S.world.home;
    const inside = h.frame.pt(5, 8);
    const outside = h.frame.pt(5, -12);
    A.setListener(outside.x, h.floorY + 1.6, outside.z, 0);
    A.occBudget = 10;
    const blocked = A.occluded({ x: inside.x, y: h.floorY + 0.8, z: inside.z });
    A.occBudget = 10;
    const open = A.occluded({ x: outside.x + 6, y: h.floorY + 0.8, z: outside.z + 2 });
    const p0 = window.__panners;
    A.play('groan', { at: { x: inside.x, y: h.floorY, z: inside.z }, vol: 0.5, range: 40 });
    return { blocked, open, panners: window.__panners, groanPanner: window.__panners - p0 };
  });
  log('oklüzyon', okl);
  check(okl && okl.blocked === true && okl.open === false && okl.groanPanner >= 1 && okl.panners > 0,
    'duvar arkasındaki ses kapalı, açıktaki açık sayılmalı; konumsal ses HRTF panner düğümü kurmalı', okl);
  // savaş teması: yoğunluk yüksek kalınca açılır
  const savas = await S(() => {
    const A = window.__game.audio;
    A.musicMode = 'game';
    for (let i = 0; i < 25; i++) A.updateBattle(0.9);
    const on = A.battleOn;
    for (let i = 0; i < 60; i++) A.updateBattle(0.1);
    return { on, off: !A.battleOn };
  });
  log('savaş müziği', savas);
  check(savas && savas.on === true && savas.off === true, 'savaş teması yoğunluk yüksek kalınca açılmalı, düşünce sönmeli', savas);
  await S(() => { const g = window.__game; g.last = performance.now(); g.raf = requestAnimationFrame(() => g.loop()); });
  await wait(1000);
};
