// Yaratık dizilimi: tüm zombi türleri ve hayvanlar (görsel kontrol). → /tmp/mobs-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(800);
  log(await evalJS(page, async () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf);
    g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    const { ZombieView } = await import('/src/entities/ZombieView.js');
    const { AnimalView } = await import('/src/entities/AnimalView.js');
    const { ZOMBIE_TYPES } = await import('/src/data/zombies.js');
    for (const { av } of g.menu.avatars) av.root.visible = false;
    const T = g.world.terrain, F = g.menu.F, P = g.world.physics;
    let base = null;
    for (let r = 10; r < 200 && !base; r += 5) for (let a = 0; a < 6.28 && !base; a += 0.3) {
      const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, h = T.heightAt(x, z);
      if (T.waterLevelAt(x, z) > h - 0.3) continue;
      let ok = true;
      for (let dx = -8; dx <= 8 && ok; dx += 1.5) for (let dz = -6; dz <= 8 && ok; dz += 1.5) if (Math.abs(T.heightAt(x + dx, z + dz) - h) > 0.4 || g.world.buildingAt(x + dx, z + dz)) ok = false;
      if (ok && !P.overlapsBox(x - 8, z - 6, x + 8, z + 8, h + 0.1, h + 3)) base = { x, z };
    }
    const types = ['normal', 'runner', 'heavy', 'night', 'special', 'leader', 'crawler', 'screamer', 'bloater', 'riot', 'dog', 'raider'];
    const zs = types.map((k, i) => {
      const v = new ZombieView(g, ZOMBIE_TYPES[k], 'z' + (i * 13 + 5));
      const x = base.x + (i - (types.length - 1) / 2) * 1.25, z = base.z;
      v.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(v.root);
      return { v, k };
    });
    const kinds = ['wolf', 'deer', 'stag', 'fox', 'husky', 'shiba'];
    const an = kinds.map((k, i) => {
      const a = new AnimalView(g, k);
      const x = base.x + (i - 2.5) * 2.2, z = base.z + 5;
      a.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(a.root);
      return a;
    });
    window.__mobs = { zs, an, base, T };
    window.__mshot = (zst, ast, cam, frames = 30) => {
      for (let f = 0; f < frames; f++) {
        for (const { v } of zs) v.update(1 / 30, { yaw: Math.PI, ...zst });
        for (const a of an) a.update(1 / 30, { yaw: Math.PI / 2, ...ast });
      }
      const c = g.gfx.camera, by = T.heightAt(base.x, base.z);
      c.position.set(base.x + cam[0], by + cam[1], base.z + cam[2]);
      c.lookAt(base.x + cam[3], by + cam[4], base.z + cam[5]);
      g.env.update(0.016, g.time, 13 * 60, c.position, null);
      g.gfx.render(0.016, g.time);
    };
    return { base, types: types.length };
  }));
  const L = [-4.2, 1.1, -3.4, -4.2, 0.85, 0], R = [3.4, 1.1, -3.4, 3.4, 0.85, 0], AN = [0, 1.4, -1.5, 0, 0.5, 5];
  await evalJS(page, (c) => window.__mshot({ speed: 1.0, state: 'chase' }, { speed: 0 }, c, 30), L); await shot(page, '/tmp/mobs-zL.png');
  await evalJS(page, (c) => window.__mshot({ speed: 1.0, state: 'chase' }, { speed: 0 }, c, 2), R); await shot(page, '/tmp/mobs-zR.png');
  await evalJS(page, (c) => window.__mshot({ speed: 0, state: 'scream' }, { speed: 1.4 }, c, 20), AN); await shot(page, '/tmp/mobs-animals-walk.png');
  await evalJS(page, (c) => window.__mshot({ speed: 3.5, state: 'chase' }, { speed: 7 }, c, 20), AN); await shot(page, '/tmp/mobs-animals-run.png');
  await evalJS(page, (c) => { window.__mobs.an.forEach((a) => a.attack(0.7)); window.__mshot({ speed: 0 }, { speed: 0 }, c, 8); }, AN); await shot(page, '/tmp/mobs-animals-attack.png');
  await evalJS(page, (c) => { window.__mobs.an.forEach((a) => a.die()); window.__mshot({ speed: 0, dead: true }, { speed: 0 }, c, 45); }, AN); await shot(page, '/tmp/mobs-dead.png');
  await evalJS(page, (c) => window.__mshot({ speed: 0, dead: true }, { speed: 0 }, c, 2), [0, 1.6, -4.5, 0, 0.3, 0]); await shot(page, '/tmp/mobs-zdead.png');
};
