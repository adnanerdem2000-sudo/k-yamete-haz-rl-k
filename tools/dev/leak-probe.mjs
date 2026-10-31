// Bellek sızıntısı tanısı: şüpheli işlemleri tekrar tekrar çalıştırıp GPU kaynak sayıları ve yığın boyutunu ölçer
export default async ({ page, url, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1000);
  const snap = (label) => evalJS(page, (label) => {
    const g = window.__game, m = g.gfx.renderer.info.memory, p = g.gfx.renderer.info.programs;
    return { label, geo: m.geometries, tex: m.textures, prog: p ? p.length : -1, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) };
  }, label);
  log(await snap('başlangıç'));
  await evalJS(page, () => { cancelAnimationFrame(window.__game.raf); window.__game.loop = () => {}; });
  // 1) ortam haritası 100 kez
  await evalJS(page, () => { const e = window.__game.env; for (let i = 0; i < 100; i++) e.updateEnvMap('k' + i, { sun: 1, hemi: 1 }, false, 0); });
  log(await snap('ortam haritası x100'));
  // 2) oturum adımı (render yok) 600 kare
  await evalJS(page, () => { const S = window.__game.session; for (let i = 0; i < 600; i++) S.update(1 / 60); });
  log(await snap('S.update x600'));
  // 3) çizimli kare 120
  await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 120; i++) { g.session.update(1 / 60); g.gfx.render(1 / 60, g.time); } });
  log(await snap('update+render x120'));
  // 4) zaman atlatma (uyku benzeri): 2 saat oyun zamanı
  await evalJS(page, () => { const S = window.__game.session; S.time.ff = 30; for (let i = 0; i < 600; i++) S.update(1 / 60); S.time.ff = 1; });
  log(await snap('hızlı zaman x600'));
};
