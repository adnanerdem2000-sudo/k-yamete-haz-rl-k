// Nesne taşıma testi: oyuncu önündeki kutuyu alır (kinematik), taşır, bırakır ve fırlatır. → /tmp/carry-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  // oyuncunun önüne bir kutu koy
  const r0 = await evalJS(page, () => {
    const S = window.__game.session, pl = S.local;
    const x = pl.pos.x + Math.sin(pl.yaw) * 1.1, z = pl.pos.z + Math.cos(pl.yaw) * 1.1;
    const p = S.props.addProp('box', x, z, 0, 'test_box');
    window.__box = p;
    return { ok: !!p, near: !!S.props.nearestCarryable(pl.pos.x, pl.pos.y, pl.pos.z, pl.yaw) };
  });
  log('kutu', r0);
  // açılış paneli/diyaloğu varsa kapat (girdi engellenmesin)
  const blk = await evalJS(page, () => { const g = window.__game; for (let i = 0; i < 3 && g.ui.isBlocking(); i++) { g.ui.closePanel && g.ui.closePanel(); } return { blocking: g.ui.isBlocking(), panel: g.ui.panel && g.ui.panel.name, modal: !!g.ui.modal }; });
  log('arayüz', blk);
  await wait(800);
  await page.keyboard.down('KeyE'); await wait(120); await page.keyboard.up('KeyE');
  await wait(600);
  const r1 = await evalJS(page, () => { const S = window.__game.session, pl = S.local; return { carrying: !!pl.carryProp, kinematic: !!(window.__box && window.__box.d.carried), anim: !!pl.animState().carryBox }; });
  log('alındı', r1);
  await page.keyboard.down('KeyW'); await wait(1200); await page.keyboard.up('KeyW');
  const r2 = await evalJS(page, () => { const S = window.__game.session, pl = S.local, t = window.__box.d.body.translation(); const o = window.__box.d.obj.position; return { carrying: !!pl.carryProp, mode: pl.mode, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2), h: +(t.y - pl.pos.y).toFixed(2), gorselMesafe: +Math.hypot(o.x - pl.pos.x, o.z - pl.pos.z).toFixed(2), gorselH: +(o.y - pl.pos.y).toFixed(2) }; });
  log('taşınıyor (oyuncuya uzaklık, yükseklik)', r2);
  await shot(page, '/tmp/carry-hold.png');
  // fırlat
  await evalJS(page, () => window.__game.session.local.dropProp(true));
  await wait(1200);
  const r3 = await evalJS(page, () => { const S = window.__game.session, pl = S.local, t = window.__box.d.body.translation(); return { carrying: !!pl.carryProp, dynamic: !window.__box.d.carried, dist: +Math.hypot(t.x - pl.pos.x, t.z - pl.pos.z).toFixed(2) }; });
  log('fırlatıldı', r3);
  await shot(page, '/tmp/carry-throw.png');
};
