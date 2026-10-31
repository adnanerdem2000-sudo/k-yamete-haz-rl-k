// Yaşayan dünya testi: oyunda karga sürüleri ve duman sütunları (görüntü + gürültüyle ürkme kontrolü). → /tmp/liv-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 150000 });
  await wait(1500);
  const r = await evalJS(page, () => {
    const S = window.__game.session;
    if (!S || !S.living) return { ok: false };
    const g = window.__game, c = g.gfx.camera, T = S.world.terrain;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    // şehirde bir duman sütununa ve sürüye bakış
    const view = (x, z, h, tx, ty, tz) => { c.position.set(x, T.heightAt(x, z) + h, z); c.lookAt(tx, T.heightAt(tx, tz) + ty, tz); };
    for (let i = 0; i < 90; i++) { S.living.birds.update(1 / 30, (x, z) => T.heightAt(x, z)); S.living.smoke.update(1 / 30); }
    view(60, -40, 6, 140, 18, 5);
    g.env.update(0.016, g.time, 15 * 60, c.position, null);
    g.world.vegetation.update(c.position, 420, true, 1);
    g.gfx.render(0.016, g.time);
    const f = S.living.birds.flocks[0];
    const y0 = S.living.birds.mesh.instanceMatrix.array[13];
    S.emit({ k: 'noise', x: f.x, z: f.z, r: 60, src: 'test' });
    for (let i = 0; i < 60; i++) S.living.birds.update(1 / 30, (x, z) => T.heightAt(x, z));
    const y1 = S.living.birds.mesh.instanceMatrix.array[13];
    return { ok: true, flocks: S.living.birds.flocks.length, birds: S.living.birds.mesh.count, puffs: S.living.smoke.mesh.count, scare: +f.scare.toFixed(2), rise: +(y1 - y0).toFixed(1) };
  });
  log('yaşayan dünya', r);
  await shot(page, '/tmp/liv-city.png');
  await evalJS(page, () => {
    const S = window.__game.session, g = window.__game, c = g.gfx.camera, T = S.world.terrain;
    c.position.set(100, T.heightAt(100, -20) + 30, 20); c.lookAt(100, T.heightAt(100, -20) + 42, -20);
    g.gfx.render(0.016, g.time);
  });
  await shot(page, '/tmp/liv-birds.png');
};
