// Performans ölçümü (Aşama 8): dört sahnede (mahalle, şehir caddesi, orman, iç mekân) kare süresi, çizim çağrısı,
// üçgen sayısı, fizik adımı/sn ve bellek. Menü dünyası + oyun içi (spawn). Sonuç: /tmp/benchmark.json ve günlük.
// Yazılım GPU'sunda mutlak değerler düşüktür; karşılaştırma için göreli kullanılır (aynı ortamda iki sürüm).
import fs from 'node:fs';
export default async ({ page, url, evalJS, log, wait }) => {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  const quality = await evalJS(page, () => window.__game.settings.get('graphics.quality'));
  const scenes = [
    ['mahalle', [-262, 1.7, 182], [-230, 2.5, 160]],
    ['sehir', [70, 1.7, -28], [96, 3, -36]],
    ['orman', [-640, 2.0, 120], [-600, 3, 90]],
    ['ic-mekan', null, null],
  ];
  const out = { quality, when: new Date().toISOString(), scenes: {} };
  for (const [name, c, t] of scenes) {
    const r = await evalJS(page, async ([name, c, t]) => {
      const g = window.__game, T = g.world.terrain, cam = g.gfx.camera;
      cancelAnimationFrame(g.raf); g.loop = () => {};
      document.getElementById('ui-root').style.display = 'none'; g.menu.group.visible = false;
      if (c) { cam.position.set(c[0], T.heightAt(c[0], c[2]) + c[1], c[2]); cam.lookAt(t[0], T.heightAt(t[0], t[2]) + t[1], t[2]); }
      else { const b = g.world.buildings.find((q) => q.rooms.some((r) => r.type === 'living')); const r = b.rooms.find((q) => q.type === 'living'); cam.position.set(r.minX + 0.6, b.floorY + 1.5, r.minZ + 0.6); cam.lookAt((r.minX + r.maxX) / 2, b.floorY + 1.0, (r.minZ + r.maxZ) / 2); g.world.setRoofHidden && g.world.setRoofHidden(b); }
      g.world.vegetation.update(cam.position, g.settings.get('graphics.viewDistance'), true, 1, g.settings.get('graphics.quality'));
      g.world.cullInteriors(cam.position, 1); g.world.instancer.cull(cam.position, 420);
      g.env.update(0.016, g.time, 13 * 60, cam.position, null);
      // ısınma 2 kare, ölçüm 6 kare
      for (let i = 0; i < 2; i++) g.gfx.render(0.016, g.time);
      const info = g.gfx.renderer.info;
      const times = [];
      for (let i = 0; i < 6; i++) { const a = performance.now(); g.gfx.render(0.016, g.time + i * 0.016); g.gfx.renderer.getContext().finish && g.gfx.renderer.getContext().finish(); times.push(performance.now() - a); }
      times.sort((a, b) => a - b);
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      return { name, msMedian: +times[3].toFixed(1), msMin: +times[0].toFixed(1), calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null, heapMB: mem };
    }, [name, c, t]);
    log(name, r);
    out.scenes[name] = r;
  }
  // oyun içi: spawn noktasında 3 sn fizik adımı/sn ve güncelleme süresi
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 300000 });
  await evalJS(page, () => { const g = window.__game; g.ui.menus.opts.ai = 0; return g.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing' && window.__game.session, null, { timeout: 150000 });
  await wait(2000);
  const game = await evalJS(page, async () => {
    const g = window.__game, S = g.session, P = g.phys;
    let upd = 0, n = 0;
    const u0 = S.update.bind(S);
    S.update = (dt) => { const a = performance.now(); u0(dt); upd += performance.now() - a; n++; };
    const s0 = P.steps, t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const dtMs = performance.now() - t0;
    return { adimPerSn: +((P.steps - s0) / (dtMs / 1000)).toFixed(1), updateMs: n ? +(upd / n).toFixed(1) : null, kare: n, zombi: S.zombies.views.size, nesne: S.props ? S.props.props.length : 0, kapi: S.doorPhys ? S.doorPhys.doors.length : 0 };
  });
  log('oyun içi', game);
  out.game = game;
  fs.writeFileSync('/tmp/benchmark.json', JSON.stringify(out, null, 2));
  log('yazıldı', '/tmp/benchmark.json');
};
