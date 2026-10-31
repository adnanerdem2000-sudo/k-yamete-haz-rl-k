// Taşıma yüksekliği ölçümü: her karede oyuncu ayak y, hedef y, gövde y (kinematik hedefin uygulanıp uygulanmadığı)
export default async ({ page, url, wait, evalJS, log }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(1500);
  await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const x = pl.pos.x + Math.sin(pl.yaw) * 1.1, z = pl.pos.z + Math.cos(pl.yaw) * 1.1;
    const p = S.props.addProp('box', x, z, 0, 'probe_box');
    pl.pickProp(p);
    window.__trace = [];
    const orig = pl.updateCarry.bind(pl);
    pl.updateCarry = () => {
      orig();
      const t = p.d.body.translation();
      window.__trace.push({ feet: +pl.pos.y.toFixed(3), body: +t.y.toFixed(3), mode: pl.mode, sleep: p.d.body.isSleeping(), kin: p.d.body.isKinematic(), steps: S.game.phys.steps ?? null });
    };
  });
  await wait(1500);
  log('durgun', await evalJS(page, () => window.__trace.slice(-4)));
  await page.keyboard.down('KeyW'); await wait(1500); await page.keyboard.up('KeyW');
  log('yürürken', await evalJS(page, () => window.__trace.slice(-6)));
  log('alpha/step', await evalJS(page, () => { const P = window.__game.session.game.phys; return { alpha: P.alpha, keys: Object.keys(P).filter((k) => typeof P[k] === 'number') }; }));
};
