// Kare süresi sondası (oyun içi): hangi alt sistem kareyi yavaşlatıyor? Her yapılandırmada ≤ 6 kare ya da 12 sn
// ölçülür: kare süresi, fizik adımı/sn, session.update ve gfx.render süreleri, çizim çağrısı ve üçgen sayısı.
// Kullanım: node tools/scenario.mjs tools/dev/perf-probe.mjs http://localhost:8092/
export default async ({ page, url, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) g.ui.closePanel && g.ui.closePanel(); });
  // ölçüm sarmalayıcıları
  await evalJS(page, () => {
    const g = window.__game, S = g.session;
    window.__pf = { upd: 0, ren: 0, frames: 0 };
    const u0 = S.update.bind(S), r0 = g.gfx.render.bind(g.gfx);
    S.update = (dt) => { const t = performance.now(); u0(dt); window.__pf.upd += performance.now() - t; };
    g.gfx.render = (dt, t) => { const a = performance.now(); r0(dt, t); window.__pf.ren += performance.now() - a; window.__pf.frames++; };
  });
  const measure = (label) => evalJS(page, async (label) => {
    const g = window.__game, P = g.session.game.phys, pf = window.__pf;
    pf.upd = pf.ren = pf.frames = 0;
    const s0 = P.steps, t0 = performance.now();
    await new Promise((res) => { const tick = () => { if (pf.frames >= 6 || performance.now() - t0 > 12000) res(); else setTimeout(tick, 50); }; tick(); });
    const dtMs = performance.now() - t0, fr = Math.max(1, pf.frames);
    const inf = g.gfx.renderer.info.render;
    return { label, kare: pf.frames, msKare: Math.round(dtMs / fr), update: Math.round(pf.upd / fr), render: Math.round(pf.ren / fr), adimPerSn: +((P.steps - s0) / (dtMs / 1000)).toFixed(1), cizim: inf.calls, ucgen: Math.round(inf.triangles / 1000) + 'k' };
  }, label);
  log('ısınma', await measure('ısınma'));
  log('temel', await measure('temel'));
  const toggles = [
    ['bitki gizli', () => { const g = window.__game; g.world.vegetation.update = () => {}; g.scene.traverse((o) => { if (o.isInstancedMesh && /^veg:/.test(o.name)) o.visible = false; }); }],
    ['yaşayan dünya gizli', () => { const S = window.__game.session; for (const l of Object.values(S.living)) l.mesh.visible = false; }],
    ['kapı/çekmece/su fiziği kapalı', () => { const S = window.__game.session; S.doorPhys.update = () => {}; S.drawers.update = () => {}; if (S.buoyancyOff) { S.buoyancyOff(); S.buoyancyOff = null; } }],
    ['izler/cephe gizli', () => { const W = window.__game.world; W.dressing.decals.mesh.visible = false; W.dressing.facade.mesh.visible = false; W.dressing.bags.mesh.visible = false; }],
    ['iç mekân gizli', () => { const W = window.__game.world; W.root.traverse((o) => { if (o.isMesh && /geo_(interior|woodfloor|tiles|carpet|decor)/.test(o.material && o.material.name)) o.visible = false; }); }],
    ['gölge kapalı', () => { window.__game.gfx.renderer.shadowMap.enabled = false; }],
    ['zombi/bot kapalı', () => { const S = window.__game.session; S.zombies.update = () => {}; if (S.bots) S.bots.update = () => {}; }],
  ];
  for (const [label, fn] of toggles) {
    await evalJS(page, fn);
    log(label, await measure(label));
  }
  log('sahne', await evalJS(page, () => { const g = window.__game; let im = 0, inst = 0, mesh = 0; g.scene.traverse((o) => { if (o.isInstancedMesh && o.visible) { im++; inst += o.count; } else if (o.isMesh && o.visible) mesh++; }); return { instancedMesh: im, ornek: inst, mesh }; }));
};
