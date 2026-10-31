// Bölge turu: yeni bölgeleri havadan eğik açıyla görüntüler (görsel kontrol). → /tmp/reg-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf); g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    g.menu.group.visible = false;
    g.gfx.camera.far = 900; g.gfx.camera.updateProjectionMatrix();
  });
  const views = [
    ['farm', -640, 120, [60, 45, 90]], ['lighthouse', -598, 544, [40, 26, 50]], ['resort', -180, 700, [0, 50, -90]],
    ['prison', 700, -60, [-90, 55, 60]], ['airfield', 120, -760, [0, 80, 150]], ['village', -640, -490, [40, 40, 70]],
    ['dam', -490, -190, [70, 40, 30]], ['bridge', 600, -600, [-80, 50, 60]],
  ];
  for (const [name, x, z, off] of views) {
    await evalJS(page, ([x, z, off]) => {
      const g = window.__game, T = g.world.terrain;
      const y = T.heightAt(x, z);
      const c = g.gfx.camera;
      c.position.set(x + off[0], y + off[1], z + off[2]);
      c.lookAt(x, y, z);
      g.world.vegetation.update(c.position, 420, true);
      g.env.update(0.016, g.time, 11 * 60, c.position, null);
      g.gfx.render(0.016, g.time);
    }, [x, z, off]);
    await shot(page, `/tmp/reg-${name}.png`);
  }
};
