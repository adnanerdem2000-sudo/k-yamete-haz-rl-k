// Sızıntı tanısı 3: yalnız çizim; nesne grupları gizlenerek karşılaştırma (fazlar /tmp/leak-phase)
import fs from 'node:fs';
export default async ({ page, url, wait, evalJS }) => {
  const phase = (p) => fs.writeFileSync('/tmp/leak-phase', p);
  phase('yükleme');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await evalJS(page, () => { cancelAnimationFrame(window.__game.raf); window.__game.loop = () => {}; });
  const loop = async (name, setupSrc) => {
    await evalJS(page, (src) => { eval(src); }, setupSrc);
    phase(name);
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 10; i++) g.gfx.render(1 / 60, g.time); });
  };
  const vegVis = (v) => `{ const s = window.__game.scene; s.traverse((o) => { if (o.name && o.name.startsWith('veg:')) o.visible = ${v} && o.count > 0; }); }`;
  await loop('A-hepsi', '0');
  await loop('B-bitkisiz', vegVis(false));
  await loop('C-bitkili-ortamsiz', vegVis(true) + "; window.__game.scene.environment = null;");
  await loop('D-ortamsiz-canlisiz', "{ const S = window.__game.session; S.living.birds.mesh.visible = false; S.living.smoke.mesh.visible = false; }");
  phase('bitti');
};
