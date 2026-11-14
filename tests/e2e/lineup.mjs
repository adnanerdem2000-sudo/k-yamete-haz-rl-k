// Karakter dizilimi: 6 ana karakteri farklı animasyon durumlarında yakından görüntüler (görsel kontrol).
// Kullanım: node tools/scenario.mjs tests/e2e/lineup.mjs  → /tmp/lineup-*.png
// Denetimler: 6 karakter ve 6 zombi boş olmayan modelle kurulur ve gerçekten çizilir (gizleyince çizim çağrısı azalır),
// önden/arkadan/yandan çekimlerde hepsi görüş alanında, kemik matrislerinde NaN yok; her durumda hareket denetleyicisi
// istenen kipte; pozlar klipten gelir (eğilince/otururken/yatınca/ölünce baş alçalır, yürürken/koşarken/havada bacaklar
// bekleme pozundan ayrılır); eşyalar doğru ele takılır, nişanda kollar kalkar, vuruş klibi oynar; zombilere yürüme pozu
// uygulanır. Eşikler çevrimdışı ölçülen klip pozlarına göre geniş tutuldu (ör. eğilme başı ≈ 0,6×, sürünme ≈ 0,2×).
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
    const found = !!base;
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
    // denetim yoklaması (çizimden hemen sonra; çizim yapmaz, görüntüyü değiştirmez): çizim sayaçları, görüş alanı
    // (kök + 0,8 m çevresinde 0,7 m'lik küre), NaN, hareket kipi, baş yüksekliği, bacak/kol kemikleri, eldeki eşya
    const THREE = await import('three');
    const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), inv = new THREE.Matrix4(), tv = new THREE.Vector3(), sph = new THREE.Sphere();
    const LEGS = ['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR'], ARMS = ['UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR'];
    const quats = (ch, names) => names.map((n) => (ch.rig.bones[n] ? ch.rig.bones[n].quaternion.toArray().map((x) => +x.toFixed(4)) : null));
    const meshInfo = (root) => {
      let n = 0, verts = 0, fin = true, vis = true;
      root.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.attributes.position) { n++; verts += o.geometry.attributes.position.count; }
        if (fin && !o.matrixWorld.elements.every(Number.isFinite)) fin = false;
      });
      for (let p = root; p; p = p.parent) if (!p.visible) vis = false;
      return { n, verts, fin, vis };
    };
    window.__probe = () => {
      const L = window.__lineup, c = g.gfx.camera, R = g.gfx.renderer;
      c.updateMatrixWorld();
      fr.setFromProjectionMatrix(pm.multiplyMatrices(c.projectionMatrix, inv.copy(c.matrixWorld).invert()));
      const inView = (root) => { root.getWorldPosition(tv); tv.y += 0.8; return fr.intersectsSphere(sph.set(tv, 0.7)); };
      return {
        calls: R.info.render.calls, tris: R.info.render.triangles,
        avs: L.avs.map((av) => {
          const head = av.ch.anchors.head.getWorldPosition(tv).y - av.root.position.y;
          const held = av.heldObj;
          return {
            ...meshInfo(av.root), view: inView(av.root), st: av.motion ? av.motion.state : null, head: +head.toFixed(3),
            legs: quats(av.ch, LEGS), arms: quats(av.ch, ARMS),
            death: !!(av.motion && av.motion.playing('death')), atk: !!(av.motion && av.motion.playing('attack')), aim: +av.blend.aim.toFixed(2),
            held: av.heldId || null, hand: held ? (held.parent === av.ch.anchors.handL ? 'L' : held.parent === av.ch.anchors.handR ? 'R' : '?') : null, heldMesh: held ? meshInfo(held).n : 0,
          };
        }),
        zs: L.zs.map(({ ch, type }) => ({ type, ...meshInfo(ch.root), view: inView(ch.root), q: quats(ch, [...LEGS, ...ARMS]) })),
      };
    };
    return { alanBulundu: found, base: { x: +base.x.toFixed(1), z: +base.z.toFixed(1) }, avs: avs.length, zs: zs.length, zRest: zs.map(({ ch }) => quats(ch, [...LEGS, ...ARMS])) };
  });
  log('dizilim', setup && { alanBulundu: setup.alanBulundu, base: setup.base, karakter: setup.avs, zombi: setup.zs });
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
  const P = {}; // çekim adı → yoklama
  for (const [name, st, view] of states) {
    P[name] = await evalJS(page, ([s, v]) => { window.__shoot(s.fn ? eval(s.fn) : s, v, 40); return window.__probe(); }, [typeof st === 'function' ? { fn: st.toString() } : st, views[view]]);
    await shot(page, `/tmp/lineup-${name}.png`);
  }
  // eşya tutma + nişan
  await evalJS(page, () => {
    const items = ['pistol', 'rifle', 'bat', 'axe', 'flashlight', 'bow'];
    window.__lineup.avs.forEach((av, i) => av.hold(items[i]));
  });
  P.hold = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0 }, v, 40); return window.__probe(); }, views.front);
  await shot(page, '/tmp/lineup-hold.png');
  P.holdL = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0 }, v, 2); return window.__probe(); }, views.trioL);
  await shot(page, '/tmp/lineup-holdL.png');
  P.holdR = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0 }, v, 2); return window.__probe(); }, views.trioR);
  await shot(page, '/tmp/lineup-holdR.png');
  P.aim = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 40); return window.__probe(); }, views.front);
  await shot(page, '/tmp/lineup-aim.png');
  P.aimL = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 2); return window.__probe(); }, views.trioL);
  await shot(page, '/tmp/lineup-aimL.png');
  P.aimR = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 0, aim: true, pitch: 0.1 }, v, 2); return window.__probe(); }, views.trioR);
  await shot(page, '/tmp/lineup-aimR.png');
  P.holdrun = await evalJS(page, (v) => { window.__shoot({ mode: 'ground', speed: 3.5 }, v, 40); return window.__probe(); }, views.front);
  await shot(page, '/tmp/lineup-holdrun.png');
  // vuruş klipleri
  P.melee = await evalJS(page, (v) => { window.__lineup.avs.forEach((av) => av.play('melee', 0.55)); window.__shoot({ mode: 'ground', speed: 0 }, v, 9); return window.__probe(); }, views.front);
  await shot(page, '/tmp/lineup-melee.png');
  // zombiler (prosedürel yürüyüş)
  P.zombies = await evalJS(page, async (v) => {
    const A = await import('/src/entities/Animations.js');
    const { Pose } = await import('/src/entities/CharacterRig.js');
    const p = new Pose();
    window.__shoot({ mode: 'ground', speed: 0 }, v, 1, (f) => { window.__lineup.zs.forEach(({ ch }, i) => { A.zombieWalk(p, f * 0.2 + i, 0.3, f / 30, i); ch.rig.apply(p); ch.root.rotation.y = Math.PI; }); });
    return window.__probe();
  }, views.zombies);
  await shot(page, '/tmp/lineup-zombies.png');
  log('tamam');
  // çizime katkı (son görüntüden sonra): hepsini gören geniş açıdan karakterler açıkken ve gizliyken çizim çağrısı
  const contrib = await evalJS(page, () => {
    const g = window.__game, L = window.__lineup;
    if (!L) return null;
    const c = g.gfx.camera, R = g.gfx.renderer, by = L.T.heightAt(L.base.x, L.base.z);
    c.position.set(L.base.x, by + 3, L.base.z - 9); c.lookAt(L.base.x, by + 0.8, L.base.z + 1.5);
    const roots = [...L.avs.map((av) => av.root), ...L.zs.map(({ ch }) => ch.root)];
    g.gfx.render(0.016, g.time); const on = R.info.render.calls;
    roots.forEach((r) => { r.visible = false; }); g.gfx.render(0.016, g.time); const off = R.info.render.calls;
    roots.forEach((r) => { r.visible = true; }); g.gfx.render(0.016, g.time);
    return { on, off, fark: on - off, n: roots.length };
  });
  log('çizime katkı', contrib);

  const HELD = ['pistol', 'rifle', 'bat', 'axe', 'flashlight', 'bow'];
  const okP = (p) => !!(p && Array.isArray(p.avs) && p.avs.length === 6 && Array.isArray(p.zs) && p.zs.length === 6);
  const deg = (a, b) => (a && b ? 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI : 0);
  const maxDeg = (A, B) => (Array.isArray(A) && Array.isArray(B) ? Math.max(0, ...A.map((q, i) => deg(q, B[i]))) : 0);
  const shots = Object.entries(P);
  // 1) kurulum
  check(!!setup && setup.avs === 6 && setup.zs === 6 && okP(P.idle) && P.idle.avs.every((a) => a.n > 0 && a.verts > 0 && a.vis) && P.idle.zs.every((z) => z.n > 0 && z.verts > 0 && z.vis),
    '6 ana karakter ve 6 zombi görünür, boş olmayan modelle kurulmalı', { setup: setup && { avs: setup.avs, zs: setup.zs }, avs: okP(P.idle) ? P.idle.avs.map((a) => [a.n, a.verts, a.vis]) : null, zs: okP(P.idle) ? P.idle.zs.map((z) => [z.type, z.n, z.verts, z.vis]) : null });
  // 2) çizim: her çekimde çizim çağrısı/üçgen, karakterler gerçekten çizime giriyor
  check(shots.length === 28 && shots.every(([, p]) => p && p.calls > 0 && p.tris > 0) && !!contrib && contrib.fark >= contrib.n,
    'her çekimde çizim yapılmalı ve karakterler çizime girmeli (gizlenince çizim çağrısı en az karakter sayısı kadar azalmalı)', { cekim: shots.length, bos: shots.filter(([, p]) => !(p && p.calls > 0 && p.tris > 0)).map(([n]) => n), contrib });
  // 3) görüş alanı (önden/arkadan/yandan çekimler, zombi çekimi) ve NaN
  const wide = states.filter(([, , v]) => ['front', 'back', 'side'].includes(v)).map(([n]) => n).concat(['hold', 'aim', 'holdrun', 'melee']);
  const outOfView = wide.filter((n) => !(okP(P[n]) && P[n].avs.every((a) => a.view)));
  const nan = shots.filter(([, p]) => !(okP(p) && p.avs.every((a) => a.fin) && p.zs.every((z) => z.fin))).map(([n]) => n);
  check(outOfView.length === 0 && okP(P.zombies) && P.zombies.zs.every((z) => z.view) && nan.length === 0,
    'geniş çekimlerde 6 karakterin, zombi çekiminde 6 zombinin hepsi görüş alanında olmalı; kemik/konum matrislerinde NaN olmamalı', { outOfView, zombi: okP(P.zombies) ? P.zombies.zs.map((z) => z.view) : null, nan });
  // 4) hareket denetleyicisi: her durumda istenen kip (ölüde ölüm klibi, başka durumda yok)
  const WANT = { crouch: 'crouch', crouchwalk: 'crouch', air: 'air', seat: 'drive', prone: 'prone', downed: 'downed', swim: 'swim' };
  const badSt = states.map(([n]) => n).filter((n) => !(okP(P[n]) && P[n].avs.every((a) => a.st === (WANT[n] || 'stand') && a.death === (n === 'dead'))));
  check(badSt.length === 0, 'her animasyon durumunda 6 karakterin hareket denetleyicisi istenen kipte olmalı (ölüde ölüm klibi)', badSt.map((n) => [n, okP(P[n]) ? P[n].avs.map((a) => [a.st, a.death]) : null]));
  // 5) poz: ayakta baş ≈ 1,5 m; klip ölçümleri: eğilme ≈ 0,6×, oturma ≈ 0,5×, sürünme/yaralı ≈ 0,2×, yüzme < 0,1×, ölüm (1,3 sn) < 0,15×
  const H0 = okP(P.idle) ? P.idle.avs.map((a) => a.head) : [];
  const LOW = { crouch: 0.8, crouchwalk: 0.8, seat: 0.75, prone: 0.5, downed: 0.5, swim: 0.5, dead: 0.5 };
  const badPose = Object.entries(LOW).filter(([n, k]) => !(okP(P[n]) && P[n].avs.every((a, i) => a.head < H0[i] * k)));
  check(H0.length === 6 && H0.every((h) => h > 1.2 && h < 2.1) && badPose.length === 0,
    'pozlar kliplerden gelmeli: ayakta baş 1,2–2,1 m; eğilince, otururken, yatınca, yüzerken ve ölünce baş belirgin alçalmalı', { H0, badPose: badPose.map(([n]) => [n, okP(P[n]) ? P[n].avs.map((a) => a.head) : null]) });
  // 6) bacaklar: yürüme/koşu/depar/yan adım/havada bacak kemikleri bekleme pozundan > 20° ayrılmalı (ölçülen en az ≈ 41°)
  const MOVING = ['walk', 'run', 'run-side', 'sprint', 'strafe', 'air'];
  const legDeg = MOVING.map((n) => [n, okP(P[n]) && okP(P.idle) ? P[n].avs.map((a, i) => +maxDeg(a.legs, P.idle.avs[i].legs).toFixed(1)) : null]);
  check(legDeg.every(([, d]) => Array.isArray(d) && d.every((x) => x > 20)), 'yürüme, koşu, depar, yan adım ve havada kliplerinde bacaklar bekleme pozundan belirgin ayrılmalı (> 20°)', legDeg);
  // 7) eşya, nişan, vuruş: doğru ele takılı (yay sol, diğerleri sağ el), nişanda kollar kalkar, kılıç klibi oynar.
  // Kol değişimi: tabanca (kol aşağıdan öne ≈ 70°+) ve yay (sol kol yukarı ≈ 60°+) için > 10°; tüfek zaten hazır duruşta
  // (namlu aşağı → düz: sağ kol ≈ 22°, tutuş ağırlığı 0,85 → 1), bu yüzden yalnız belirgin bir oynama (> 3°) aranır.
  const holdOk = okP(P.hold) && P.hold.avs.every((a, i) => a.held === HELD[i] && a.hand === (HELD[i] === 'bow' ? 'L' : 'R') && a.heldMesh > 0);
  const armDeg = okP(P.hold) && okP(P.aim) ? Object.fromEntries([['tabanca', 0], ['tufek', 1], ['yay', 5]].map(([k, i]) => [k, +maxDeg(P.aim.avs[i].arms, P.hold.avs[i].arms).toFixed(1)])) : null;
  const aimOk = okP(P.aim) && P.aim.avs.every((a) => a.aim > 0.9) && !!armDeg && armDeg.tabanca > 10 && armDeg.yay > 10 && armDeg.tufek > 3;
  const meleeOk = okP(P.melee) && P.melee.avs.every((a) => a.atk);
  check(holdOk && aimOk && meleeOk, 'eşyalar doğru ele takılmalı; nişanda tabanca/tüfek/yay kolları kalkmalı; vuruş klibi 6 karakterde oynamalı',
    { tutus: okP(P.hold) ? P.hold.avs.map((a) => [a.held, a.hand, a.heldMesh]) : null, nisan: okP(P.aim) ? P.aim.avs.map((a) => a.aim) : null, kolDerece: armDeg, vurus: okP(P.melee) ? P.melee.avs.map((a) => a.atk) : null });
  // 8) zombiler: prosedürel yürüme pozu uygulanmalı (kollar öne uzanır, bacaklar adım atar)
  const zDeg = okP(P.zombies) && setup && Array.isArray(setup.zRest) ? P.zombies.zs.map((z, i) => +maxDeg(z.q, setup.zRest[i]).toFixed(1)) : null;
  check(Array.isArray(zDeg) && zDeg.length === 6 && zDeg.every((x) => x > 10), 'zombilere prosedürel yürüme pozu uygulanmalı (kemikler dinlenme pozundan > 10° ayrılmalı)', zDeg);
};
