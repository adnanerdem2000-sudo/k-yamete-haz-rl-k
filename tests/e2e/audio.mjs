// Ses testi: ayak sesleri (zemin türleri), HRTF konumlandırma, oklüzyon, iç mekân yankısı, savaş teması.
// Oyun döngüsü durdurulur, oturum sabit 1/60 sn adımlarla ilerletilir.
// Denetimler: ses bağlamı çalışır (HRTF, yankı, savaş teması, çözülmüş örnekler); çimde yürüyüş 'grass', yolda koşu
// 'hard' ve daha hızlı adım; eğilerek yürüyüş eğik (kısık) ve daha yavaş adım; evde iç mekân yankısı ve ahşap zemin;
// zemin sondası (göl su, toprak yol çakıl); duvar arkasındaki ses kapalı, açıktaki açık sayılır ve konumsal ses HRTF
// panner düğümü kurar; savaş teması yoğunlukla açılıp söner.
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
    // çim koşusu x = -229,5'te: -230 zemin ızgarasında (4 m) tam hücre sınırıydı (Math.round(198,5)); f32 fizik
    // sapmasıyla adımlar yandaki yol hücresine ('hard') düşebiliyordu (önceki koşuda eğilme koşusu öyle oldu).
    // 0,5 m doğu çim hücresinin içinde kalır, yürüyüş yolu eskisiyle neredeyse aynı.
    out.grass = run(-229.5, 120, 0, 120, ['KeyW']);
    out.road = run(-200, 170, Math.PI / 2, 120, ['KeyW', 'ShiftLeft']);
    out.crouch = run(-230, 125, 0, 120, ['KeyW', 'KeyC'], 'KeyC');
    // tekrar ayağa kalk (iç mekân yürüyüşü ayakta)
    g.input.pressed.add('KeyC'); window.__step(10);
    out.standAfter = S.local.mode;
    const h = S.world.home;
    const ip = h.frame.pt(5, 8);
    S.local.spawnAt(ip.x, h.floorY + 0.1, ip.z, 0);
    window.__step(20);
    out.indoorEnv = g.audio.indoor;
    const lg = [];
    const f = g.audio.footstep;
    g.audio.footstep = (at, surface, speed, crouch) => { lg.push(surface); f(at, surface, speed, crouch); };
    window.__step(90, ['KeyW']);
    g.audio.footstep = f;
    out.indoor = [...new Set(lg)];
    out.surfaceProbe = { beach: S.surfaceAt({ x: -150, y: T.heightAt(-150, 760), z: 760 }), lake: S.surfaceAt({ x: -196, y: T.heightAt(-196, -100), z: -100 }), dirtRoad: S.surfaceAt({ x: -326, y: T.heightAt(-326, 100), z: 100 }) };
    return out;
  });
  log('ayak sesleri', ayak);
  const ay = ayak || {};
  check(ay.grass && ay.grass.local > 0 && ay.grass.surfaces.includes('grass') && ay.grass.crouch === 0 && ay.road && ay.road.local > 0 && ay.road.surfaces.includes('hard') && ay.road.maxSpeed > ay.grass.maxSpeed,
    'zemine göre ayak sesi: çimde yürüyüş \'grass\', asfaltta koşu \'hard\' ve yürüyüşten hızlı adım çalmalı', { grass: ay.grass, road: ay.road });
  check(ay.crouch && ay.crouch.mode === 'crouch' && ay.crouch.local > 0 && ay.crouch.crouch === ay.crouch.local && ay.grass && ay.crouch.maxSpeed < ay.grass.maxSpeed && ay.standAfter === 'ground',
    'eğilerek yürüyüşte oyuncu eğilmeli; her adım eğik (kısık) ve yürüyüşten yavaş çalmalı; C ile tekrar ayağa kalkmalı', { crouch: ay.crouch, standAfter: ay.standAfter });
  check(ay.indoorEnv === true && Array.isArray(ay.indoor) && ay.indoor.includes('wood'), 'evde iç mekân yankısı açılmalı ve ahşap zemin adımı çalmalı', { indoorEnv: ay.indoorEnv, indoor: ay.indoor });
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
