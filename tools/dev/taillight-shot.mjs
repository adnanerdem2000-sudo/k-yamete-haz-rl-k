// Araç arka lamba görsel kontrolü: alacakaranlıkta frende bir aracı arkadan çeker → /tmp/tail.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  const r = await evalJS(page, () => {
    const g = window.__game, S = g.session, c = g.gfx.camera;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    const v = S.vehicles.list.find((x) => x.id === 'police_car') || S.vehicles.list.find((x) => !x.wrecked);
    v.seats[0] = 'test'; v.lights = true; v.brakeGlow = 1; v.speed = 0;
    S.vehicles.updateTailLights(v, 0.016, false);
    v.brakeGlow = 1; v.tailMat.emissiveIntensity = 0.6 + 2.6;
    const back = new (v.root.position.constructor)(-Math.sin(v.yaw) * 6 + Math.cos(v.yaw) * 2, 1.8, -Math.cos(v.yaw) * 6 - Math.sin(v.yaw) * 2);
    c.position.copy(v.root.position).add(back);
    c.lookAt(v.root.position.x, v.root.position.y + 0.8, v.root.position.z);
    g.env.update(0.016, g.time, 19.4 * 60, c.position, null);
    g.gfx.render(0.016, g.time);
    return { id: v.id, type: v.type, tail: v.tailMat.emissiveIntensity };
  });
  log('araç', r);
  await shot(page, '/tmp/tail.png');
};
