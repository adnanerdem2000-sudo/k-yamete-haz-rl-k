// Fener/gece bellek sondası (hikâye senaryosundaki çökme): santral + fener + saat 22:00 + fener yakınına ışınlanma,
// sonra 240 sabit adım; 20 adımda bir yığın ve alt sistem süreleri (sarmalanmış update'ler) günlüklenir.
export default async ({ page, url, evalJS, log, wait }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => {
    const g = window.__game, S = g.session;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    window.__step = (n) => { for (let i = 0; i < n; i++) { g.input.down.clear(); S.update(1 / 60); g.input.endFrame(); } };
    // alt sistem sarmalayıcıları
    window.__prof = {};
    const wrap = (obj, name, label) => { if (!obj || typeof obj[name] !== 'function') return; const o = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const r = o(...a); window.__prof[label] = (window.__prof[label] || 0) + performance.now() - t; return r; }; };
    wrap(g.phys, 'update', 'phys'); wrap(S.zombies, 'update', 'zombies'); wrap(S.doorPhys, 'update', 'doorPhys'); wrap(S.drawers, 'update', 'drawers');
    wrap(S.props, 'update', 'props'); wrap(S.vehicles, 'update', 'vehicles'); wrap(S.env, 'update', 'env'); wrap(S.bots, 'update', 'bots'); wrap(S.npcs, 'update', 'npcs');
    wrap(S.living.birds, 'update', 'birds'); wrap(S.living.papers, 'update', 'papers'); wrap(S.living.signs, 'update', 'signs'); wrap(S.living.smoke, 'update', 'smoke');
    wrap(S.storyWorld, 'update', 'storyWorld'); wrap(S.events, 'update', 'events'); wrap(S.interact, 'update', 'interact'); wrap(S.fx, 'update', 'fx'); wrap(S.combat, 'update', 'combat'); wrap(S.world.vegetation, 'update', 'veg'); wrap(S.world, 'cullInteriors', 'cull');
    wrap(S.local, 'update', 'player'); wrap(S.audio, 'update', 'audio'); wrap(S.quests, 'update', 'quests'); wrap(S.ground, 'update', 'ground'); wrap(S.build, 'update', 'build'); wrap(S.weather, 'update', 'weather'); wrap(S.time, 'update', 'time');
    if (S.contacts) wrap(S.contacts, 'drain', 'contacts');
    // hikâye adımları: santral, fener, gece, fener yakınına ışınlanma
    S.act('quest_start', { id: 's_power' });
    S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2);
    S.act('power_restore', {});
    S.act('lighthouse_lit', {});
    S.act('flag', { flag: 'ship_contact', value: 1 });
    S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay));
    S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4);
  });
  await wait(1500);
  const snap = () => evalJS(page, () => { const g = window.__game, S = g.session, inf = g.gfx.renderer.info; let objs = 0; g.scene.traverse(() => objs++); const prof = Object.fromEntries(Object.entries(window.__prof).map(([k, v]) => [k, Math.round(v)])); window.__prof = {}; return { heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, objs, zombi: S.zombies.list.size, geos: inf.memory.geometries, bodies: g.phys.w.bodies.len(), props: S.props.props.length, debris: S.props.debris ? S.props.debris.length : null, fxN: S.fx.parts ? S.fx.parts.length : (S.fx.count || null), prof }; });
  log('fener gece başlangıç', await snap());
  for (let i = 1; i <= 6; i++) {
    const ms = await evalJS(page, () => { const t = performance.now(); window.__step(20); return Math.round(performance.now() - t); });
    log(`+${i * 20} adım (${ms} ms)`, await snap());
  }
  // kanlı ay
  await evalJS(page, () => { window.__game.session.emit({ k: 'bloodmoon', on: true }); });
  for (let i = 1; i <= 6; i++) {
    const ms = await evalJS(page, () => { const t = performance.now(); window.__step(20); return Math.round(performance.now() - t); });
    log(`kanlı ay +${i * 20} adım (${ms} ms)`, await snap());
  }
};
