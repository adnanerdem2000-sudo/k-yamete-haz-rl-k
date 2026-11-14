// Yaratık dizilimi: tüm zombi türleri ve hayvanlar (görsel kontrol). → /tmp/mobs-*.png
// Denetimler: 12 zombi türü ve 6 hayvan boş olmayan modelle kurulur, her çekimde çizim yapılır ve yaratıklar gerçekten
// çizime girer (gizleyince çizim çağrısı azalır), sol/sağ ve hayvan çekimleri hepsini görüş alanında gösterir, kemik
// matrislerinde NaN yok; zombiler yürüme/çığlık/ölüm kliplerini, hayvanlar yürüme/dörtnal/saldırı/ölüm kliplerini oynatır.
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await wait(800);
  const setup = await evalJS(page, async () => {
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
    // denetim yoklaması (çizimden hemen sonra; çizim yapmaz, görüntüyü değiştirmez): çizim sayaçları, görüş alanı
    // (kök + 0,8 m çevresinde 0,7 m'lik küre), NaN, klip durumları, son yoklamadan beri en büyük kemik dönüşü (derece)
    const THREE = await import('three');
    const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), inv = new THREE.Matrix4(), tv = new THREE.Vector3(), sph = new THREE.Sphere();
    const meshInfo = (root) => {
      let n = 0, verts = 0, fin = true, vis = true;
      root.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.attributes.position) { n++; verts += o.geometry.attributes.position.count; }
        if (fin && !o.matrixWorld.elements.every(Number.isFinite)) fin = false;
      });
      for (let p = root; p; p = p.parent) if (!p.visible) vis = false;
      return { n, verts, fin, vis };
    };
    const prev = new Map();
    const turn = (key, root) => {
      const cur = [];
      root.traverse((o) => { if (o.isBone) cur.push(o.quaternion.clone()); });
      const old = prev.get(key);
      prev.set(key, cur);
      if (!old || old.length !== cur.length) return null;
      let m = 0;
      for (let i = 0; i < cur.length; i++) m = Math.max(m, 2 * Math.acos(Math.min(1, Math.abs(cur[i].dot(old[i])))));
      return +(m * 180 / Math.PI).toFixed(2);
    };
    window.__mprobe = () => {
      const c = g.gfx.camera, R = g.gfx.renderer;
      c.updateMatrixWorld();
      fr.setFromProjectionMatrix(pm.multiplyMatrices(c.projectionMatrix, inv.copy(c.matrixWorld).invert()));
      const inView = (root) => { root.getWorldPosition(tv); tv.y += 0.8; return fr.intersectsSphere(sph.set(tv, 0.7)); };
      return {
        calls: R.info.render.calls, tris: R.info.render.triangles,
        z: zs.map(({ v, k }) => ({
          k, ...meshInfo(v.root), view: inView(v.root), turn: turn(k, v.root),
          st: v.motion ? v.motion.state : null, scream: v.motion ? v.motion.playing('scream') : null,
          death: v.motion ? v.motion.playing('death') : null, dogDead: v.animal ? v.animal.dead : null,
        })),
        a: an.map((a) => {
          const da = a.clips.Death && a.mixer.existingAction(a.clips.Death);
          return {
            k: a.kind, ...meshInfo(a.root), view: inView(a.root), turn: turn('a:' + a.kind, a.root),
            walk: a.loco.walk ? +a.loco.walk.getEffectiveWeight().toFixed(2) : null, run: a.loco.run ? +a.loco.run.getEffectiveWeight().toFixed(2) : null,
            shot: a.oneShot ? a.oneShot.action.getClip().name : null, atk: a.cfg.attack, dead: a.dead, deathW: da ? +da.getEffectiveWeight().toFixed(2) : 0,
          };
        }),
      };
    };
    return { base, types: types.length };
  });
  log(setup);
  const L = [-4.2, 1.1, -3.4, -4.2, 0.85, 0], R = [3.4, 1.1, -3.4, 3.4, 0.85, 0], AN = [0, 1.4, -1.5, 0, 0.5, 5];
  const pL = await evalJS(page, (c) => { window.__mshot({ speed: 1.0, state: 'chase' }, { speed: 0 }, c, 30); return window.__mprobe(); }, L); await shot(page, '/tmp/mobs-zL.png');
  const pR = await evalJS(page, (c) => { window.__mshot({ speed: 1.0, state: 'chase' }, { speed: 0 }, c, 2); return window.__mprobe(); }, R); await shot(page, '/tmp/mobs-zR.png');
  const pW = await evalJS(page, (c) => { window.__mshot({ speed: 0, state: 'scream' }, { speed: 1.4 }, c, 20); return window.__mprobe(); }, AN); await shot(page, '/tmp/mobs-animals-walk.png');
  const pRun = await evalJS(page, (c) => { window.__mshot({ speed: 3.5, state: 'chase' }, { speed: 7 }, c, 20); return window.__mprobe(); }, AN); await shot(page, '/tmp/mobs-animals-run.png');
  const pA = await evalJS(page, (c) => { window.__mobs.an.forEach((a) => a.attack(0.7)); window.__mshot({ speed: 0 }, { speed: 0 }, c, 8); return window.__mprobe(); }, AN); await shot(page, '/tmp/mobs-animals-attack.png');
  const pD = await evalJS(page, (c) => { window.__mobs.an.forEach((a) => a.die()); window.__mshot({ speed: 0, dead: true }, { speed: 0 }, c, 45); return window.__mprobe(); }, AN); await shot(page, '/tmp/mobs-dead.png');
  const pZD = await evalJS(page, (c) => { window.__mshot({ speed: 0, dead: true }, { speed: 0 }, c, 2); return window.__mprobe(); }, [0, 1.6, -4.5, 0, 0.3, 0]); await shot(page, '/tmp/mobs-zdead.png');
  // çizime katkı (son görüntüden sonra): hepsini gören geniş açıdan yaratıklar açıkken ve gizliyken çizim çağrısı
  const contrib = await evalJS(page, () => {
    const g = window.__game, M = window.__mobs;
    if (!M || !M.base) return null;
    const c = g.gfx.camera, R = g.gfx.renderer, by = M.T.heightAt(M.base.x, M.base.z);
    c.position.set(M.base.x, by + 4, M.base.z - 14); c.lookAt(M.base.x, by + 0.6, M.base.z + 2);
    const roots = [...M.zs.map(({ v }) => v.root), ...M.an.map((a) => a.root)];
    g.gfx.render(0.016, g.time); const on = R.info.render.calls;
    roots.forEach((r) => { r.visible = false; }); g.gfx.render(0.016, g.time); const off = R.info.render.calls;
    roots.forEach((r) => { r.visible = true; }); g.gfx.render(0.016, g.time);
    return { on, off, fark: on - off, n: roots.length };
  });
  log('çizime katkı', contrib);

  const shots = { zL: pL, zR: pR, yurume: pW, kosu: pRun, saldiri: pA, olum: pD, zOlum: pZD };
  const ok = (p) => !!(p && Array.isArray(p.z) && p.z.length === 12 && Array.isArray(p.a) && p.a.length === 6);
  const mobsOf = (p) => (ok(p) ? [...p.z, ...p.a] : []);
  check(!!(setup && setup.base) && setup.types === 12 && ok(pL) && mobsOf(pL).every((m) => m.n > 0 && m.verts > 0 && m.vis),
    'düz alan bulunmalı; 12 zombi türü ve 6 hayvan görünür, boş olmayan modelle kurulmalı', { setup, mobs: mobsOf(pL).map((m) => [m.k, m.n, m.verts, m.vis]) });
  check(Object.values(shots).every((p) => ok(p) && p.calls > 0 && p.tris > 0) && !!contrib && contrib.fark >= contrib.n,
    'her çekimde çizim yapılmalı ve yaratıklar çizime girmeli (gizlenince çizim çağrısı en az yaratık sayısı kadar azalmalı)', { cekimler: Object.fromEntries(Object.entries(shots).map(([n, p]) => [n, p && [p.calls, p.tris]])), contrib });
  const zIn = ok(pL) && ok(pR) ? pL.z.map((m, i) => m.view || pR.z[i].view) : [];
  const nan = Object.entries(shots).map(([n, p]) => [n, mobsOf(p).filter((m) => !m.fin).map((m) => m.k)]).filter(([, l]) => l.length);
  check(zIn.length === 12 && zIn.every(Boolean) && ok(pW) && pW.a.every((m) => m.view) && nan.length === 0 && Object.values(shots).every(ok),
    'sol+sağ çekimler 12 zombinin, hayvan çekimi 6 hayvanın hepsini görüş alanında göstermeli; kemik/konum matrislerinde NaN olmamalı', { zombi: zIn, hayvan: ok(pW) ? pW.a.map((m) => m.view) : null, nan });
  // kovalama (1 m/sn): sürünen yüzüstü ('prone'), diğerleri ayakta; R çekiminin 2 karesinde bile kemikler dönmeli
  check(ok(pL) && ok(pR) && pL.z.every((m) => m.k === 'dog' || m.st === (m.k === 'crawler' ? 'prone' : 'stand')) && pR.z.every((m) => m.turn > 0.3),
    'kovalayan zombiler yürüme kliplerini oynatmalı (doğru kip, kemikler her karede dönmeli)', ok(pR) ? pR.z.map((m, i) => [m.k, pL.z[i].st, m.turn]) : null);
  check(ok(pW) && pW.z.filter((m) => m.k !== 'dog').every((m) => m.scream === true),
    'çığlık durumunda köpek dışındaki 11 zombi çığlık klibini oynatmalı', ok(pW) ? pW.z.map((m) => [m.k, m.scream]) : null);
  check(ok(pZD) && pZD.z.filter((m) => m.k !== 'dog' && m.k !== 'crawler').every((m) => m.death === true) && pZD.z.some((m) => m.k === 'dog' && m.dogDead === true),
    'ölü zombiler ölüm klibinde kalmalı (sürünen hariç), zombi köpek ölü olmalı', ok(pZD) ? pZD.z.map((m) => [m.k, m.death, m.dogDead]) : null);
  check(ok(pW) && ok(pRun) && ok(pA) && ok(pD) && pW.a.every((m) => m.walk > 0.5) && pRun.a.every((m) => m.run > 0.5) && pA.a.every((m) => m.shot === m.atk) && pD.a.every((m) => m.dead && m.deathW > 0.5),
    'hayvanlar yürüme (1,4 m/sn), dörtnal (7 m/sn), saldırı ve ölüm kliplerini oynatmalı',
    { yurume: ok(pW) ? pW.a.map((m) => [m.k, m.walk]) : null, kosu: ok(pRun) ? pRun.a.map((m) => [m.k, m.run]) : null, saldiri: ok(pA) ? pA.a.map((m) => [m.k, m.shot]) : null, olum: ok(pD) ? pD.a.map((m) => [m.k, m.dead, m.deathW]) : null });
};
