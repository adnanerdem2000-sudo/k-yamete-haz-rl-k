// Hareket kütüphanesi testi (Motion): oyuncu karakterlerinin eylem klipleri ve zombi görünümleri oyunun gerçek
// sınıflarıyla (Avatar, ZombieView) sürülür; her durum için ekran görüntüsü + kare başına güncelleme süresi ölçümü.
// Kullanım: node tools/scenario.mjs tests/e2e/motion.mjs  → /tmp/motion-*.png
export default async ({ page, url, wait, evalJS, log, shot }) => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(600);
  const ok = await evalJS(page, async () => {
    const g = window.__game;
    cancelAnimationFrame(g.raf);
    g.loop = () => {};
    document.getElementById('ui-root').style.display = 'none';
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { ZombieView } = await import('/src/entities/ZombieView.js');
    const { CHARACTERS, CHARACTER_IDS } = await import('/src/entities/CharacterFactory.js');
    const { ZOMBIE_TYPES } = await import('/src/data/zombies.js');
    for (const { av } of g.menu.avatars) av.root.visible = false;
    const T = g.world.terrain, F = g.menu.F, P = g.world.physics;
    let base = null;
    for (let r = 10; r < 200 && !base; r += 5) for (let a = 0; a < 6.28 && !base; a += 0.3) {
      const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r, h = T.heightAt(x, z);
      if (T.waterLevelAt(x, z) > h - 0.3) continue;
      let flat = true;
      for (let dx = -7; dx <= 7 && flat; dx += 1.5) for (let dz = -7; dz <= 6 && flat; dz += 1.5) if (Math.abs(T.heightAt(x + dx, z + dz) - h) > 0.35 || g.world.buildingAt(x + dx, z + dz)) flat = false;
      if (flat && !P.overlapsBox(x - 7, z - 7, x + 7, z + 6, h + 0.1, h + 3)) base = { x, z };
    }
    base = base || { x: F.x + 6, z: F.z + 10 };
    const avs = CHARACTER_IDS.map((id, i) => {
      const av = new Avatar(g, CHARACTERS[id].look, {});
      const x = base.x + (i - 2.5) * 1.25, z = base.z;
      av.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(av.root);
      return av;
    });
    const ztypes = ['normal', 'runner', 'heavy', 'screamer', 'bloater', 'riot', 'crawler', 'special'];
    const zs = ztypes.map((k, i) => {
      const v = new ZombieView(g, ZOMBIE_TYPES[k], i * 13 + 5);
      const x = base.x + (i - 3.5) * 1.3, z = base.z + 3.2;
      v.root.position.set(x, T.heightAt(x, z), z);
      g.scene.add(v.root);
      return { v, k };
    });
    window.__m = { avs, zs, base, T, g, motion: avs.every((a) => !!a.motion), zmotion: zs.every(({ v }) => !!v.motion || !!v.animal) };
    /** state(i) → anim durumu; zstate(i) → zombi durumu; frames kare (1/30 sn) */
    window.__run = (state, zstate, frames, cam, onFrame) => {
      const M = window.__m;
      const t0 = performance.now();
      let nA = 0, nZ = 0, tA = 0, tZ = 0;
      for (let f = 0; f < frames; f++) {
        if (onFrame) onFrame(f);
        M.avs.forEach((av, i) => { const s = typeof state === 'function' ? state(i, f) : state; const a0 = performance.now(); av.update(1 / 30, { yaw: Math.PI, ...s }); tA += performance.now() - a0; nA++; });
        M.zs.forEach(({ v }, i) => { const s = typeof zstate === 'function' ? zstate(i, f) : zstate; const a0 = performance.now(); v.update(1 / 30, { state: 'idle', speed: 0, yaw: Math.PI, dead: false, ...s }); tZ += performance.now() - a0; nZ++; });
      }
      const c = M.g.gfx.camera, by = M.T.heightAt(M.base.x, M.base.z);
      c.position.set(M.base.x + cam[0], by + cam[1], M.base.z + cam[2]);
      c.lookAt(M.base.x + cam[3], by + cam[4], M.base.z + cam[5]);
      M.g.env.update(0.016, M.g.time, 13 * 60, c.position, null);
      M.g.gfx.render(0.016, M.g.time);
      return { msAvatar: +(tA / nA).toFixed(3), msZombie: +(tZ / nZ).toFixed(3), total: +(performance.now() - t0).toFixed(0) };
    };
    return { motion: window.__m.motion, zmotion: window.__m.zmotion };
  });
  log('motion etkin', ok);
  const front = [0, 1.25, -5.6, 0, 0.9, 1.2], zcam = [0, 1.35, -3.4, 0, 0.85, 3.2], side = [-6.5, 1.1, 0.4, 0, 0.8, 0.4];
  const run = async (name, fnSrc, zfnSrc, frames, cam, before = null) => {
    if (before) await evalJS(page, before);
    const r = await evalJS(page, ([a, z, n, c]) => window.__run(eval(a), eval(z), n, c), [fnSrc, zfnSrc, frames, cam]);
    log(name, r);
    await shot(page, `/tmp/motion-${name}.png`);
  };
  const idleZ = "() => ({ state: 'idle', speed: 0 })";
  // ---- insan eylemleri (her karakter farklı eylem)
  await run('idle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 60, front);
  await run('actions1', "() => ({ mode: 'ground', speed: 0 })", idleZ, 22, front, () => {
    const A = window.__m.avs;
    A[0].play('pickup', 0.5); A[1].play('search', 4, 'low'); A[2].play('bandage', 3); A[3].play('drink', 2); A[4].play('hammer', 3); A[5].play('consume', 2);
  });
  await run('actions2', "() => ({ mode: 'ground', speed: 0 })", idleZ, 25, front, () => {
    const A = window.__m.avs;
    A[0].play('throw', 0.5); A[1].play('cheer', 2.4); A[2].play('dance', 2.4); A[3].play('revive', 4); A[4].play('kick', 0.9); A[5].play('fish', 6);
  });
  await run('actions3', "() => ({ mode: 'ground', speed: 0 })", idleZ, 12, front, () => {
    const A = window.__m.avs;
    A[0].hold('pistol'); A[0].play('reload', 1.6); A[1].hold('bat'); A[1].play('melee', 0.55); A[2].play('melee', 0.55); A[3].flinch(1); A[4].play('roll', 0.72); A[5].play('vault', 0.6);
  });
  await run('sleep', "(i) => ({ mode: i < 3 ? 'sleep' : 'dead', speed: 0 })", idleZ, 50, front, () => { window.__m.avs.forEach((a) => { a.hold(null); a.action = null; }); });
  await run('wake', "() => ({ mode: 'ground', speed: 0 })", idleZ, 14, front);
  await run('climb', "(i) => ({ mode: 'climb', speed: 1.2, vy: i % 2 ? 1.6 : -1.6 })", idleZ, 30, side);
  await run('prone-enter', "(i) => ({ mode: i % 2 ? 'prone' : 'crouch', speed: 0 })", idleZ, 9, side);
  // ---- ayak IK'sı: her karakterin sol ayağının altında 0.22 m'lik basamak (önden görünüş); IK kapalı/açık
  const stepInfo = await evalJS(page, async () => {
    const M = window.__m, THREE = await import('three');
    const g = M.g, P = g.world.physics;
    const by = M.T.heightAt(M.base.x, M.base.z), top = by + 0.22;
    M.steps = [];
    for (const a of M.avs) {
      a.root.visible = true; a.hold(null); a.action = null; a.root.position.y = by;
      // yön π (−Z'ye bakar): karakterin solu −X tarafı → basamak kökün solunda
      const x = a.root.position.x, z = M.base.z;
      const c = P.addBox(x - 0.62, z - 0.5, x - 0.01, z + 0.5, by - 1, top, { walkable: true, kind: 'prop' });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.24, 1.0), new THREE.MeshStandardMaterial({ color: '#8a8f99' }));
      mesh.position.set(x - 0.315, top - 0.12, z); mesh.receiveShadow = true; g.scene.add(mesh);
      M.steps.push([c, mesh]);
    }
    return { by, top };
  });
  log('basamak', stepInfo);
  const stepCam = [0, 0.75, -4.6, 0, 0.55, 0];
  await run('ik-off', "() => ({ mode: 'ground', speed: 0 })", idleZ, 30, stepCam, () => { for (const a of window.__m.avs) { a._ikSave = a.footIK; a.footIK = null; } });
  await run('ik-on', "() => ({ mode: 'ground', speed: 0 })", idleZ, 40, stepCam, () => { for (const a of window.__m.avs) a.footIK = a._ikSave; });
  const ikState = await evalJS(page, () => window.__m.avs.map((a) => a.footIK ? [+a.footIK.pelvis.toFixed(3), +a.footIK.legs[0].dy.toFixed(3), +a.footIK.legs[1].dy.toFixed(3)] : null));
  log('IK (kalça, sol dy, sağ dy)', ikState);
  await evalJS(page, () => { const M = window.__m; for (const [c, mesh] of M.steps) { M.g.world.physics.remove(c); M.g.scene.remove(mesh); } });
  // ---- kişilik kıpırdanmaları (elde alet: Mert anahtar, Elif dürbün) + zamanlayıcının kendi kendine tetiklenmesi
  await run('settle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 60, front, () => { window.__m.avs.forEach((a) => { a.root.visible = true; a.hold(null); a.action = null; }); });
  await run('fidget', "() => ({ mode: 'ground', speed: 0 })", idleZ, 36, front, () => {
    const kinds = ['tinker', 'peek', 'boxing', 'binoculars', 'stretch', 'watch'];
    window.__m.avs.forEach((a, i) => a.startFidget(kinds[i]));
  });
  const fid = await evalJS(page, () => window.__m.avs.map((a) => ({ kind: a.fidget && a.fidget.kind, prop: !!(a.fidget && a.fidget.prop), vis: !!(a.fidget && a.fidget.prop && a.fidget.prop.visible) })));
  log('kıpırdanma', fid);
  const auto = await evalJS(page, () => {
    const a = window.__m.avs[0];
    a.endFidget(); a.fidget.next = 0.2;
    for (let f = 0; f < 15; f++) a.update(1 / 30, { mode: 'ground', speed: 0, yaw: Math.PI });
    const started = a.fidget.kind;
    for (let f = 0; f < 30; f++) a.update(1 / 30, { mode: 'ground', speed: 2.5, yaw: Math.PI }); // yürüyünce kesilir
    return { started, afterWalk: a.fidget.kind, persona: a.ch.look.persona };
  });
  log('kıpırdanma zamanlayıcı', auto);
  // ---- ayak IK'sı eğimde: yakındaki bir yamaç (15–28°) bulunur, karakterler eş yükselti boyunca dizilir;
  // her iki bileğin zemine göre yüksekliği aynı olmalı (düz zeminde olduğu gibi)
  const slope = await evalJS(page, async () => {
    const M = window.__m, T = M.T, g = M.g, THREE = await import('three');
    let best = null;
    const centers = [[M.base.x, M.base.z], [-350, -380], [-640, 120], [330, 300]];
    for (const [cx0, cz0] of centers) for (let r = 4; r < 300 && !best; r += 4) for (let a = 0; a < 6.28 && !best; a += 0.25) {
      const x = cx0 + Math.cos(a) * r, z = cz0 + Math.sin(a) * r;
      const h = T.heightAt(x, z), gx = (T.heightAt(x + 1, z) - T.heightAt(x - 1, z)) / 2, gz = (T.heightAt(x, z + 1) - T.heightAt(x, z - 1)) / 2;
      const gr = Math.hypot(gx, gz);
      if (gr < 0.22 || gr > 0.6 || T.waterLevelAt(x, z) > h - 0.5 || g.world.buildingAt(x, z)) continue;
      let ok = true;
      for (let d = -4; d <= 4 && ok; d += 1) { const px = x - gz / gr * d, pz = z + gx / gr * d; const g2 = Math.hypot((T.heightAt(px + 1, pz) - T.heightAt(px - 1, pz)) / 2, (T.heightAt(px, pz + 1) - T.heightAt(px, pz - 1)) / 2); if (g2 < 0.2 || g.world.buildingAt(px, pz)) ok = false; }
      if (ok) best = { x, z, gx, gz, gr };
    }
    if (!best) return null;
    const tx = -best.gz / best.gr, tz = best.gx / best.gr; // eş yükselti yönü
    M.avs.forEach((a, i) => { const d = (i - 2.5) * 1.2; const x = best.x + tx * d, z = best.z + tz * d; a.root.position.set(x, T.heightAt(x, z), z); a.root.rotation.y = Math.atan2(-best.gx, -best.gz); });
    for (let f = 0; f < 45; f++) M.avs.forEach((a) => a.update(1 / 30, { mode: 'ground', speed: 0, yaw: Math.atan2(-best.gx, -best.gz) }));
    const out = M.avs.map((a) => {
      if (!a.footIK || !a.footIK.ok) return null;
      const res = a.footIK.legs.map((L) => { const p = new THREE.Vector3().copy(L.ankle).applyMatrix4(L.ll.matrixWorld); return +(p.y - T.heightAt(p.x, p.z)).toFixed(3); });
      return { L: res[0], R: res[1], fark: +Math.abs(res[0] - res[1]).toFixed(3), kalca: +a.footIK.pelvis.toFixed(3) };
    });
    const c = g.gfx.camera, by = T.heightAt(best.x, best.z);
    c.position.set(best.x - best.gx / best.gr * 5.5, by + 1.6, best.z - best.gz / best.gr * 5.5); // yokuş aşağıdan (karakterlerin önünden)
    c.lookAt(best.x, by + 0.8, best.z);
    g.env.update(0.016, g.time, 13 * 60, c.position, null);
    g.gfx.render(0.016, g.time);
    return { egim: +(Math.atan(best.gr) * 180 / Math.PI).toFixed(1), ayaklar: out };
  });
  log('eğimde ayak IK', slope);
  await shot(page, '/tmp/motion-slope.png');
  await evalJS(page, () => { const M = window.__m; M.avs.forEach((a, i) => { const x = M.base.x + (i - 2.5) * 1.25, z = M.base.z; a.root.position.set(x, M.T.heightAt(x, z), z); a.root.rotation.y = 0; }); });
  // ---- zombiler (insanlar gizlenir: kamera zombilerin önünde)
  await evalJS(page, () => { for (const a of window.__m.avs) a.root.visible = false; });
  await run('z-idle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 40, zcam);
  await run('z-walk', "() => ({ mode: 'ground', speed: 0 })", "(i) => ({ state: 'chase', speed: i === 1 ? 4.5 : 1.0 })", 40, zcam);
  await run('z-run', "() => ({ mode: 'ground', speed: 0 })", "() => ({ state: 'chase', speed: 4.2 })", 40, zcam);
  await run('z-attack', "() => ({ mode: 'ground', speed: 0 })", idleZ, 10, zcam, () => { window.__m.zs.forEach(({ v }) => v.attack()); });
  await run('z-bash', "() => ({ mode: 'ground', speed: 0 })", "(i) => ({ state: i === 3 ? 'scream' : 'bash', speed: 0, bashing: i !== 3 })", 30, zcam);
  await run('z-hit', "() => ({ mode: 'ground', speed: 0 })", idleZ, 5, zcam, () => { window.__m.zs.forEach(({ v }) => v.flinch()); });
  await run('z-dead', "() => ({ mode: 'ground', speed: 0 })", "() => ({ state: 'idle', speed: 0, dead: true })", 60, zcam);
  log('tamam');
};
