// Görev güncellemesi profili: belge adımından sonra Quests.update neden saniyeler sürüyor? Aday işlevler sarmalanır,
// süre ve çağrı sayısı toplanır; aktif görevler ve ilerleme durumları listelenir.
export default async ({ page, url, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  await S(() => { const g = window.__game; cancelAnimationFrame(g.raf); g.raf = 0; });
  log('aktif görevler (önce)', await S(() => { const Q = window.__game.session.quests; return Q.active().map((id) => [id, Q.st[id].prog]); }));
  await S(() => { const S = window.__game.session; const before = { ...S.flags }; for (const c of S.world.containers) { if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue; S.loot.generate(c); } S.flags = before; });
  await S(() => { const S = window.__game.session; S.act('quest_start', { id: 's_power' }); S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2); S.act('power_restore', {}); S.quests.onInteract('dam_control'); });
  log('aktif görevler (sonra)', await S(() => { const Q = window.__game.session.quests; return Q.active().map((id) => [id, Q.st[id].prog, (Q.def(id).objs || []).map((o) => o.t + ':' + (o.item || o.poi || o.flag || ''))]); }));
  const prof = await S(() => {
    const g = window.__game, S = g.session, Q = S.quests, inv = S.inventory;
    const P = {}; const wrap = (obj, name, label) => { if (!obj || typeof obj[name] !== 'function') return; const o = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const r = o(...a); const k = label || name; P[k] = P[k] || { ms: 0, n: 0 }; P[k].ms += performance.now() - t; P[k].n++; return r; }; };
    wrap(S, 'act'); wrap(S, 'applyAction'); wrap(S, 'emit'); wrap(S.ui, 'refreshQuests'); wrap(S.ui, 'questBanner'); wrap(S.build, 'storages'); wrap(inv, 'count', 'inv.count'); wrap(Q, 'complete'); wrap(Q, 'onFlag'); wrap(Q, 'hook'); wrap(S.timeline, 'post', 'timeline.post'); wrap(S.audio, 'play', 'audio.play'); wrap(S.saves, 'autosave'); wrap(S.saves, 'save', 'saves.save'); wrap(S.ui, 'toast');
    if (S.ui.journal) wrap(S.ui.journal, 'render', 'journal.render');
    if (S.ui.hud) wrap(S.ui.hud, 'updateQuest', 'hud.updateQuest');
    Q._t = 0;
    const t0 = performance.now();
    Q.update(1 / 60);
    const total = Math.round(performance.now() - t0);
    const out = Object.fromEntries(Object.entries(P).filter(([, v]) => v.ms > 1 || v.n > 50).map(([k, v]) => [k, { ms: Math.round(v.ms), n: v.n }]));
    return { total, out, active: Q.active().length, stCount: Object.keys(Q.st).length, dyn: Object.keys(Q.dyn || {}).length };
  });
  log('quests.update profili', prof);
  const prof2 = await S(() => { const Q = window.__game.session.quests; Q._t = 0; const t0 = performance.now(); Q.update(1 / 60); return { total: Math.round(performance.now() - t0), st: Object.entries(Q.st).map(([k, v]) => k + ':' + v.state + ':' + v.prog.join('/')) }; });
  log('ikinci çağrı', prof2);
};
