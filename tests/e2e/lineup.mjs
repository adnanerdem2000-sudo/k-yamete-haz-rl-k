// Karakter dizilimi: 6 ana karakteri farklı animasyon durumlarında yakından görüntüler (görsel kontrol).
// Kullanım: node tools/scenario.mjs tests/e2e/lineup.mjs  → /tmp/lineup-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(800);
  await evalJS(page, async () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf);
    g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { CHARACTERS, CHARACTER_IDS } = await import('/src/entities/CharacterFactory.js');
    const { ZOMBIE_TYPES } = await import('/src/data/zombies.js');
    for (const { av } of g.menu.avatars) av.root.visible = false;
    const T = g.world.terrain;
    const F = g.menu.F;
    // engelsiz düz alan bul (14 x 12 m)
    const P = g.world.physics;
    let base = null;
    for (let r = 10; r < 200 && !base; r += 5) for (let a = 0; a < 6.28 && !base; a += 0.3) {
      const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, h = T.heightAt(x, z);
      if (T.waterLevelAt(x, z) > h - 0.3) continue;
      let ok = true;
      for (let dx = -7; dx <= 7 && ok; dx += 1.5) for (let dz = -7; dz <= 6 && ok; dz += 1.5) { if (Math.abs(T.heightAt(x + dx, z + dz) - h) > 0.35 || g.world.buildingAt(x + dx, z + dz)) ok = false; }
      if (ok && !P.overlapsBox(x - 7, z - 7, x + 7, z + 6, h + 0.1, h + 3)) base = { x, z };
    }
    base = base || { x: F.x + 6, z: F.z + 10 };
    const avs = CHARACTER_IDS.map((id, i) => {
      const av = new Avatar(g, CHARACTERS[id].look, { name: CHARACTERS[id].name, color: CHARACTERS[id].color });
      const x = base.x + (i - 2.5) * 1.1, z = base.z;
      av.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(av.root);
      return av;
    });
    // zombiler
    const ztypes = Object.keys(ZOMBIE_TYPES).filter((k) => !ZOMBIE_TYPES[k].dog);
    const zs = ztypes.slice(0, 6).map((k, i) => {
      const ch = g.charFactory.create(null, { zombie: ZOMBIE_TYPES[k], seed: i * 7 + 3 });
      const x = base.x + (i - 2.5) * 1.1, z = base.z + 3;
      ch.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(ch.root);
      return { ch, type: k };
    });
    window.__lineup = { avs, zs, base, T };
    window.__shoot = (state, cam, frames = 30, extra = null) => {
      const L = window.__lineup;
      for (let f = 0; f < frames; f++) {
        L.avs.forEach((av, i) => { const st = typeof state === 'function' ? state(i, av) : state; av.update(1 / 30, { yaw: Math.PI, ...st }); });
        if (extra) extra(f);
      }
      const c = g.gfx.camera;
      const by = T.heightAt(L.base.x, L.base.z);
      c.position.set(L.base.x + cam[0], by + cam[1], L.base.z + cam[2]);
      c.lookAt(L.base.x + cam[3], by + cam[4], L.base.z + cam[5]);
      g.env.update(0.016, g.time, 13 * 60, c.position, null);
      g.gfx.render(0.016, g.time);
    };
  });
  const views = {
    front: [0, 1.0, -4.3, 0, 0.85, 0],
    back: [0, 1.1, 4.3, 0, 0.85, 0],
    close: [-1.65, 1.55, -1.5, -1.65, 1.45, 0],
    side: [-4.5, 1.0, -0.2, 0, 0.85, 0],
    trioL: [-1.65, 1.25, -2.7, -1.65, 1.0, 0],
    trioR: [1.65, 1.25, -2.7, 1.65, 1.0, 0],
    zombies: [0, 1.0, -1.5, 0, 0.85, 3],
  };
  const states = [
    ['idle', { mode: 'ground', speed: 0 }, 'front'],
    ['idle-back', { mode: 'ground', speed: 0 }, 'back'],
    ['idle-side', { mode: 'ground', speed: 0 }, 'side'],
    ['face', { mode: 'ground', speed: 0 }, 'close'],
    ['trioL', { mode: 'ground', speed: 0 }, 'trioL'],
    ['trioR', { mode: 'ground', speed: 0 }, 'trioR'],
    ['walk', { mode: 'ground', speed: 1.6 }, 'front'],
    ['run', { mode: 'ground', speed: 4.3 }, 'front'],
    ['run-side', { mode: 'ground', speed: 4.3 }, 'side'],
    ['sprint', { mode: 'ground', speed: 6.6, sprint: true }, 'front'],
    ['strafe', (i) => ({ mode: 'ground', speed: 3, moveAngle: i % 2 ? Math.PI / 2 : -Math.PI / 2 }), 'front'],
    ['crouch', { mode: 'crouch', speed: 0 }, 'front'],
    ['crouchwalk', { mode: 'crouch', speed: 1.8 }, 'side'],
    ['air', { mode: 'air', speed: 3, vy: 2 }, 'front'],
    ['seat', { mode: 'drive', speed: 0, steer: 0.3 }, 'side'],
    ['prone', { mode: 'prone', speed: 0.8 }, 'side'],
    ['downed', { mode: 'downed', speed: 0 }, 'front'],
    ['swim', { mode: 'swim', speed: 1.5 }, 'side'],
    ['dead', { mode: 'dead', speed: 0 }, 'front'],
  ];
  for (const [name, st, view] of states) {
    await evalJS(page, ([s, v]) => window.__shoot(s.fn ? eval(s.fn) : s, v, 40), [typeof st === 'function' ? { fn: st.toString() } : st, views[view]]);
    await shot(page, `/tmp/lineup-${name}.png`);
  }
  // eşya tutma + nişan
  await evalJS(page, () => {
    const items = ['pistol', 'rifle', 'bat', 'axe', 'flashlight', 'bow'];
    window.__lineup.avs.forEach((av, i) => av.hold(items[i]));
  });
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0 }, v, 40), views.front);
  await shot(page, '/tmp/lineup-hold.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0 }, v, 2), views.trioL);
  await shot(page, '/tmp/lineup-holdL.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0 }, v, 2), views.trioR);
  await shot(page, '/tmp/lineup-holdR.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 40), views.front);
  await shot(page, '/tmp/lineup-aim.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 2), views.trioL);
  await shot(page, '/tmp/lineup-aimL.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 2), views.trioR);
  await shot(page, '/tmp/lineup-aimR.png');
  await evalJS(page, (v) => window.__shoot({ mode: 'ground', speed: 3.5 }, v, 40), views.front);
  await shot(page, '/tmp/lineup-holdrun.png');
  // vuruş klipleri
  await evalJS(page, (v) => { window.__lineup.avs.forEach((av) => av.play('melee', 0.55)); window.__shoot({ mode: 'ground', speed: 0 }, v, 9); }, views.front);
  await shot(page, '/tmp/lineup-melee.png');
  // zombiler (prosedürel yürüyüş)
  await evalJS(page, async (v) => {
    const A = await import('/src/entities/Animations.js');
    const { Pose } = await import('/src/entities/CharacterRig.js');
    const p = new Pose();
    window.__shoot({ mode: 'ground', speed: 0 }, v, 1, (f) => { window.__lineup.zs.forEach(({ ch }, i) => { A.zombieWalk(p, f * 0.2 + i, 0.3, f / 30, i); ch.rig.apply(p); ch.root.rotation.y = Math.PI; }); });
  }, views.zombies);
  await shot(page, '/tmp/lineup-zombies.png');
  log('tamam');
};
