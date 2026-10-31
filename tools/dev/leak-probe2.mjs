// Sızıntı tanısı 2: her şüpheli ~20 sn döngüde; dışarıdan süreç belleği örneklenir (fazlar /tmp/leak-phase'e yazılır)
import fs from 'node:fs';
export default async ({ page, url, wait, evalJS, log }) => {
  const phase = (p) => fs.writeFileSync('/tmp/leak-phase', p);
  phase('yükleme');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await evalJS(page, () => { cancelAnimationFrame(window.__game.raf); window.__game.loop = () => {}; });
  const loop = async (name, fnSrc) => {
    phase(name);
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) await evalJS(page, (src) => { const f = eval(src); for (let i = 0; i < 20; i++) f(); }, fnSrc);
  };
  await loop('bos-render', "() => { const g = window.__game; g.gfx.render(1/60, g.time); }");
  await loop('ortam-haritasi', "() => { const e = window.__game.env; e.updateEnvMap('x' + Math.random(), { sun: 1, hemi: 1 }, false, 0); }");
  await loop('bitki-guncelle', "() => { const g = window.__game, c = g.gfx.camera; c.position.x += 7; g.world.vegetation.update(c.position, 420, true, 1, 'medium'); g.gfx.render(1/60, g.time); }");
  await loop('canli-dunya', "() => { const g = window.__game, S = g.session; S.living.birds.update(1/60, (x,z)=>0); S.living.smoke.update(1/60); g.gfx.render(1/60, g.time); }");
  await loop('oturum+render', "() => { const g = window.__game; g.session.update(1/60); g.gfx.render(1/60, g.time); }");
  phase('bitti');
};
