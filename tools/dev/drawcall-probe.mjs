// Çizim çağrısı dökümü: renderBufferDirect sarılır, her çağrı nesnenin sahnedeki üst grubuna ve malzemesine göre
// sayılır (gölge geçişi ayrı). Kullanım: node tools/scenario.mjs tools/dev/drawcall-probe.mjs <url>  (PROBE_VIEW=city-street)
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const views = {
    'city-street': [95, -30, [0, 1.7, 0], [40, 3, 2], 11],
    'city-avenue': [140, 10, [0, 1.7, 0], [0, 3, -60], 15],
    'city-above': [100, -10, [-40, 28, -50], [0, 0, 0], 16],
    'city-facade': [100, -80, [0, 2.0, -34], [0, 9, 0], 10],
    'houses': [-175, 172, [12, 2.0, 18], [0, 2, 0], 10],
  };
  // varsayılan oyuncu ayarları (orta kalite, gölgeler açık); PROBE_LOW=1 ile test ayarlarında kalır
  if (!process.env.PROBE_LOW) {
    log('ayarlar', await evalJS(page, async () => {
      const { Settings } = await import('/src/core/Settings.js');
      Settings.set('graphics.shadows', true); Settings.set('graphics.quality', 'medium'); Settings.set('graphics.bloom', true); Settings.set('graphics.viewDistance', 420);
      return Settings.get('graphics');
    }));
  }
  for (const [name, v] of Object.entries(views)) {
    const r = await evalJS(page, ([x, z, off, look, hour]) => {
      const g = window.__game, T = g.world.terrain, c = g.gfx.camera, R = g.gfx.renderer;
      cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none';
      g.menu.group.visible = false;
      const y = T.heightAt(x + off[0], z + off[2]);
      c.position.set(x + off[0], y + off[1], z + off[2]);
      c.lookAt(x + look[0], T.heightAt(x + look[0], z + look[2]) + look[1], z + look[2]);
      g.world.vegetation.update(c.position, 420, true, 1);
      g.world.cullInteriors(c.position, 1);
      g.world.instancer.cull(c.position, 420);
      g.env.update(0.016, g.time, hour * 60, c.position, null);
      const cat = (o) => {
        const chain = [];
        for (let p = o; p && p.parent; p = p.parent) chain.push(p.name || p.type);
        chain.reverse();
        return chain.slice(0, 2).join('/') || o.type;
      };
      const by = {}, mats = {}, sh = {};
      const orig = R.renderBufferDirect;
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const k = cat(object) + (object.isInstancedMesh ? '' : '');
        if (scene === null) sh[k] = (sh[k] || 0) + 1;
        else { by[k] = (by[k] || 0) + 1; const mk = k + ' :: ' + (material.name || material.type); mats[mk] = (mats[mk] || 0) + 1; }
        return orig.apply(this, arguments);
      };
      R.info.autoReset = false; R.info.reset();
      g.gfx.render(0.016, g.time);
      R.renderBufferDirect = orig;
      const calls = R.info.render.calls, tris = R.info.render.triangles;
      R.info.autoReset = true;
      const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
      // sistem başına toplam (inst:<kit>, shells, roof, sign, …)
      const sys = {}, sysSh = {};
      const key = (k) => { const s = k.split('/')[1] || k; return s.startsWith('inst:') ? s.split('/')[0] : s.replace(/:.*/, ''); };
      for (const [k, n] of Object.entries(by)) sys[key(k)] = (sys[key(k)] || 0) + n;
      for (const [k, n] of Object.entries(sh)) sysSh[key(k)] = (sysSh[key(k)] || 0) + n;
      const mainN = Object.values(by).reduce((a, b) => a + b, 0), shN = Object.values(sh).reduce((a, b) => a + b, 0);
      return { calls, tris, mainN, shN, sys: top(sys, 20), sysShadow: top(sysSh, 10), main: top(by, 10) };
    }, v);
    log(name, JSON.stringify(r));
    if (process.env.PROBE_SHOTS) await shot(page, `/tmp/dc-${name}.png`);
  }
};
