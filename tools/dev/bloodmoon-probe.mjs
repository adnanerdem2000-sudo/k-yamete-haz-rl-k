// Kanlı Ay bellek sondası: oyun içinde bloodmoon olayı + 240 sabit adım; her 20 adımda yığın, sahne nesnesi, zombi,
// geometri/doku sayıları ve fizik gövde sayısı günlüklenir (hikâye senaryosundaki tarayıcı çökmesini bulmak için)
export default async ({ page, url, evalJS, log, wait }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  const snap = (label) => evalJS(page, (label) => {
    const g = window.__game, S = g.session, inf = g.gfx.renderer.info;
    let objs = 0, inst = 0; g.scene.traverse((o) => { objs++; if (o.isInstancedMesh) inst += o.count; });
    return { label, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, objs, inst, zombiList: S.zombies.list.size, zombiView: S.zombies.views.size, geos: inf.memory.geometries, tex: inf.memory.textures, bodies: g.phys && g.phys.w ? g.phys.w.bodies.len() : null, colliders: g.phys && g.phys.w ? g.phys.w.colliders.len() : null, props: S.props ? S.props.props.length : 0, debris: S.props && S.props.debris ? S.props.debris.length : null, fx: S.fx && S.fx.parts ? S.fx.parts.length : null, lights: S.env.extraLights ? S.env.extraLights.length : null, pending: S.interact.pending ? S.interact.pending.length : 0, frenzy: S.zombies.frenzy, blood: S.env._blood };
  }, label);
  await evalJS(page, () => { const g = window.__game, S = g.session; cancelAnimationFrame(g.raf); g.loop = () => {}; window.__step = (n) => { for (let i = 0; i < n; i++) { g.input.down.clear(); S.update(1 / 60); g.input.endFrame(); } }; });
  log('başlangıç', await snap('başlangıç'));
  await evalJS(page, () => { window.__step(60); });
  log('60 adım (normal)', await snap('normal'));
  await evalJS(page, () => { const S = window.__game.session; S.emit({ k: 'bloodmoon', on: true }); });
  for (let i = 1; i <= 12; i++) {
    const r = await evalJS(page, () => { const t = performance.now(); window.__step(20); return +(performance.now() - t).toFixed(0); });
    log(`kanlı ay +${i * 20} adım (${r} ms)`, await snap('bm' + i));
  }
  await evalJS(page, () => { const S = window.__game.session; S.emit({ k: 'bloodmoon', on: false }); });
};
