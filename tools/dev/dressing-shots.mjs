// Sokak dokusu görsel kontrolü (menü dünyası, kamera elle): caddeler, yanmış araç, kaldırım yakın plan. → /tmp/dr-*.png
export default async ({ page, url, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  log('doku', await evalJS(page, () => { const d = window.__game.world.dressing; return { izler: d.count, ot: d.weeds, cop: d.litter, torba: d.bagCount, cephe: d.facadeCount }; }));
  const only = process.env.SHOTS ? process.env.SHOTS.split(',') : null;
  const views = [
    ['street', [60, 1.7, -27.5], [100, 0.5, -31], 11],
    ['burnt', [146, 2.2, 9], [140, 0.4, 5], 15],
    ['walk', [70.5 + 6, 0.9, 10], [76, 0.1, 0], 10],
    ['avenue', [140, 2.0, 30], [140, 1, -40], 17],
    ['mahalle', [-250, 1.7, 165], [-200, 0.5, 165], 9],
    ['night', [100, 2.0, -26], [150, 1, -31], 22.5],
    ['fac-market', [35, 1.8, -52], [35, 2.5, -72], 11],
    ['fac-police', [118, 1.8, -36], [105, 2.5, -52], 15],
    ['fac-pharmacy', [8, 1.8, 36], [20, 2.2, 20], 10],
    ['fac-house', [-250, 1.8, 140], [-262, 2, 150], 12],
  ];
  for (const [name, c, t, hour] of views) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    await evalJS(page, ([c, t, hour]) => {
      const g = window.__game, T = g.world.terrain, cam = g.gfx.camera;
      cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none';
      g.menu.group.visible = false;
      cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]);
      cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]);
      g.world.vegetation.update(cam.position, 420, true, 1);
      g.world.cullInteriors(cam.position, 1);
      g.world.instancer.cull(cam.position, 420);
      g.env.update(0.016, g.time, hour * 60, cam.position, null);
      if (g.env.updateLamps) g.env.updateLamps(0.5, hour * 60, cam);
      g.gfx.render(0.016, g.time);
    }, [c, t, hour]);
    await shot(page, `/tmp/dr-${name}.png`);
  }
};
