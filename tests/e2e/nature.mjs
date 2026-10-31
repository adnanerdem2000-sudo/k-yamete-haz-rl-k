// Bitki örtüsü testi: orman içi (göz hizası), orman kenarı ve uzak kartlar (tepeden), çayır, tarla, dağ.
// Her görünüm için çizim çağrısı, üçgen sayısı ve kare çizim süresi ölçülür. → /tmp/nat-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const info = await evalJS(page, () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    g.menu.group.visible = false;
    g.gfx.camera.far = 900; g.gfx.camera.updateProjectionMatrix();
    const V = g.world.vegetation;
    const kinds = {};
    for (const i of V.instances) kinds[i.type] = (kinds[i.type] || 0) + 1;
    return { instances: V.instances.length, groups: V.meshes.length, impostorVariants: V.impKeys.size, kinds };
  });
  log('bitki örtüsü', info);
  // [ad, x, z, kamera ofseti (x, y, z), bakış hedefi ofseti (x, y, z), saat]
  const views = [
    ['forest-eye', -235, -160, [0, 1.7, 0], [0, 1.4, -20], 11],
    ['forest-edge', -235, -160, [-60, 22, 120], [0, 0, 0], 10],
    ['forest-far', -235, -160, [120, 70, 360], [0, 0, 0], 15],
    ['meadow-eye', -230, 150, [0, 1.7, 0], [-14, 0.8, -12], 12],
    ['farm', -640, 120, [30, 6, 40], [0, 0, 0], 9],
    ['mountain', -350, -380, [60, 30, 70], [0, 10, 0], 13],
    ['forest-dusk', -235, -160, [5, 1.7, 5], [-10, 2.5, -25], 19],
    ['city-street', 95, -30, [0, 1.7, 0], [40, 3, 2], 11], // c_zm caddesi (önceki konum bir binanın içindeydi)
    ['city-avenue', 140, 10, [0, 1.7, 0], [0, 3, -60], 15],
    ['city-above', 100, -10, [-40, 28, -50], [0, 0, 0], 16],
    ['houses', -175, 172, [12, 2.0, 18], [0, 2, 0], 10],
    ['city-facade', 100, -80, [0, 2.0, -34], [0, 9, 0], 10],
    ['city-facade2', 30, 75, [-27, 2.0, -6], [0, 10, 0], 15],
  ];
  for (const [name, x, z, off, look, hour] of views) {
    const r = await evalJS(page, ([x, z, off, look, hour]) => {
      const g = window.__game, T = g.world.terrain;
      const c = g.gfx.camera;
      const y = T.heightAt(x + off[0], z + off[2]);
      c.position.set(x + off[0], y + off[1], z + off[2]);
      c.lookAt(x + look[0], T.heightAt(x + look[0], z + look[2]) + look[1], z + look[2]);
      g.world.vegetation.update(c.position, 420, true, 1);
      g.world.cullInteriors(c.position, 1);
      g.world.instancer.cull(c.position, 420);
      g.env.update(0.016, g.time, hour * 60, c.position, null);
      const R = g.gfx.renderer;
      R.info.autoReset = false; R.info.reset();
      const t0 = performance.now();
      g.gfx.render(0.016, g.time);
      R.getContext().finish();
      const ms = performance.now() - t0;
      const out = { calls: R.info.render.calls, tris: R.info.render.triangles, ms: Math.round(ms) };
      R.info.autoReset = true;
      const V = g.world.vegetation;
      out.veg = V.meshes.reduce((a, m) => a + (m.n > 0 ? m.ims.length : 0), 0);
      // bitki türü/bant başına üçgen (bin)
      const by = {};
      for (const m of V.meshes) {
        if (!m.n) continue;
        const k = m.kind + ':' + m.band;
        for (const im of m.ims) by[k] = (by[k] || 0) + (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3 * m.n;
      }
      out.vegK = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1000)]));
      out.impostors = V.imp ? V.imp.im.count : -1;
      return out;
    }, [x, z, off, look, hour]);
    log(name, r);
    await shot(page, `/tmp/nat-${name}.png`);
  }
  log('tamam');
};
