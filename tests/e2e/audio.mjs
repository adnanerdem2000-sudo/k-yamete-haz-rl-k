// Ses testi: ayak sesleri (zemin türleri), HRTF konumlandırma, oklüzyon, iç mekân yankısı, savaş teması.
// Oyun döngüsü durdurulur, oturum sabit 1/60 sn adımlarla ilerletilir.
export default async ({ page, url, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  log('ses', await S(async () => {
    const g = window.__game, A = g.audio;
    await A.init();
    cancelAnimationFrame(g.raf); g.raf = 0;
    const S = g.session;
    window.__step = (n, keys = []) => { for (let i = 0; i < n; i++) { g.input.down.clear(); for (const k of keys) g.input.down.add(k); S.update(1 / 60); g.input.endFrame(); } g.input.down.clear(); };
    // ayak sesi sayacı
    const steps = [];
    const orig = A.footstep.bind(A);
    A.footstep = (at, surface, speed, crouch) => { steps.push([surface, Math.round(speed * 10) / 10, crouch]); orig(at, surface, speed, crouch); };
    let panners = 0;
    const cp = A.ctx.createPanner.bind(A.ctx);
    A.ctx.createPanner = () => { panners++; return cp(); };
    return { state: A.ctx.state, hrtf: A.hrtf, verb: !!A.verb, battle: !!A.battleEl };
  }));
  // çimde yürüme, yolda koşma, evde yürüme
  log('ayak sesleri', await S(() => {
    const g = window.__game, S = g.session, T = S.world.terrain, out = {};
    const run = (x, z, yaw, frames, keys) => {
      S.local.spawnAt(x, T.heightAt(x, z) + 0.1, z, yaw);
      window.__step(20);
      const A = g.audio, before = A._stepLog ? A._stepLog.length : 0;
      const log0 = [];
      const f = A.footstep;
      A.footstep = (at, surface, speed, crouch) => { log0.push(surface); f(at, surface, speed, crouch); };
      window.__step(frames, keys);
      A.footstep = f;
      void before;
      return { n: log0.length, surfaces: [...new Set(log0)] };
    };
    out.grass = run(-230, 120, 0, 120, ['KeyW']);
    out.road = run(-200, 170, Math.PI / 2, 120, ['KeyW', 'ShiftLeft']);
    out.crouch = run(-230, 125, 0, 120, ['KeyW', 'KeyC']);
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
  }));
  // oklüzyon: duvarın arkasındaki ses
  log('oklüzyon', await S(() => {
    const g = window.__game, S = g.session, A = g.audio;
    const h = S.world.home;
    const inside = h.frame.pt(5, 8);
    const outside = h.frame.pt(5, -12);
    A.setListener(outside.x, h.floorY + 1.6, outside.z, 0);
    A.occBudget = 10;
    const blocked = A.occluded({ x: inside.x, y: h.floorY + 0.8, z: inside.z });
    A.occBudget = 10;
    const open = A.occluded({ x: outside.x + 6, y: h.floorY + 0.8, z: outside.z + 2 });
    A.play('groan', { at: { x: inside.x, y: h.floorY, z: inside.z }, vol: 0.5, range: 40 });
    return { blocked, open };
  }));
  // savaş teması: yoğunluk yüksek kalınca açılır
  log('savaş müziği', await S(() => {
    const A = window.__game.audio;
    A.musicMode = 'game';
    for (let i = 0; i < 25; i++) A.updateBattle(0.9);
    const on = A.battleOn;
    for (let i = 0; i < 60; i++) A.updateBattle(0.1);
    return { on, off: !A.battleOn };
  }));
  await S(() => { const g = window.__game; g.last = performance.now(); g.raf = requestAnimationFrame(() => g.loop()); });
  await wait(1000);
};
