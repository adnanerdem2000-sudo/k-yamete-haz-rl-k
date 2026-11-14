// Hareket kütüphanesi testi (Motion): oyuncu karakterlerinin eylem klipleri ve zombi görünümleri oyunun gerçek
// sınıflarıyla (Avatar, ZombieView) sürülür; her durum için ekran görüntüsü + kare başına güncelleme süresi ölçümü.
// Denetimler: istenen eylem ve tam gövde klipleri gerçekten oynar, yeni eylem/ifade eskisini söndürür (yetim döngü
// kalmaz), etkileşim çeşitleri (sandık, tezgâh, dökme, ekme, hasat, masadan alma) kendi kliplerini oynar, gönderenin
// seçtiği çeşit uzak avatarda aynen oynar, ifadeler/isabet/gitar yansıtılır, el sallama bir kez oynar, diz çökme döngüsü
// ayağa kalkışı tekrarlamaz ve çıkışla biter, yürüyünce tam gövde döngü kesilir; temel durumlar (tırmanma/sürünme/
// eğilme) değişir, ayak IK'sı basamakta sol ayağı kaldırır ve yamaçta kalçayı indirir, kıpırdanmalar başlar/kesilir,
// zombi klipleri oynar, kemiklerde NaN yok. Kareler sabit adımla (1/30 sn) ilerletildiği için sonuçlar GPU hızına
// bağlı değildir.
// Kullanım: node tools/scenario.mjs tests/e2e/motion.mjs  → /tmp/motion-*.png
export default async ({ page, url, wait, evalJS, log, shot, errors }) => {
  const check = (ok, msg, data) => { if (!ok) errors.push('[assert] ' + msg + ' ' + JSON.stringify(data)); };
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
    return { motion: window.__m.motion, zmotion: window.__m.zmotion, insan: avs.length, zombi: zs.length };
  });
  log('motion etkin', ok);
  check(ok && ok.motion && ok.zmotion && ok.insan >= 6, 'hareket kütüphanesi (Motion) tüm karakterlerde ve 8 zombi türünde etkin olmalı', ok);
  const front = [0, 1.25, -5.6, 0, 0.9, 1.2], zcam = [0, 1.35, -3.4, 0, 0.85, 3.2], side = [-6.5, 1.1, 0.4, 0, 0.8, 0.4];
  const run = async (name, fnSrc, zfnSrc, frames, cam, before = null) => {
    if (before) await evalJS(page, before);
    const r = await evalJS(page, ([a, z, n, c]) => window.__run(eval(a), eval(z), n, c), [fnSrc, zfnSrc, frames, cam]);
    log(name, r);
    await shot(page, `/tmp/motion-${name}.png`);
  };
  // o anda etkin tek seferlik klipler ("grup:klip"; sönmeye başlamamış, ağırlığı > 0,05) ve temel hareket durumu
  // (Motion.state) — insanlar (av) ve zombiler (z). Yalnız okur: oyun döngüsü durduğu için durum değişmez.
  const klipler = () => evalJS(page, () => {
    const M = window.__m;
    const etkin = (mo) => (mo ? mo.shots.filter((x) => !x.out && (x.cur || 0) > 0.05).map((x) => x.group + ':' + x.name) : []);
    return {
      av: M.avs.map((a) => ({ durum: a.motion ? a.motion.state : null, klip: etkin(a.motion) })),
      z: M.zs.map(({ v, k }) => ({ k, durum: v.motion ? v.motion.state : null, klip: etkin(v.motion) })),
    };
  });
  const oynar = (d, i, ad) => !!(d && d.av && d.av[i] && d.av[i].klip.some((c) => c.includes(ad)));
  const say = (d, f) => (d && d.av ? d.av.filter(f).length : 0);
  const idleZ = "() => ({ state: 'idle', speed: 0 })";
  // ---- insan eylemleri (her karakter farklı eylem)
  await run('idle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 60, front);
  await run('actions1', "() => ({ mode: 'ground', speed: 0 })", idleZ, 22, front, () => {
    const A = window.__m.avs;
    A[0].play('pickup', 0.5); A[1].play('search', 4, 'low'); A[2].play('bandage', 3); A[3].play('drink', 2); A[4].play('hammer', 3); A[5].play('consume', 2);
  });
  const e1 = await klipler();
  await run('actions2', "() => ({ mode: 'ground', speed: 0 })", idleZ, 25, front, () => {
    const A = window.__m.avs;
    A[0].play('throw', 0.5); A[1].play('cheer', 2.4); A[2].play('dance', 2.4); A[3].play('revive', 4); A[4].play('kick', 0.9); A[5].play('fish', 6);
  });
  const e2 = await klipler();
  // ifade (başka Motion grubu) önceki döngü eylemini söndürmeli: eskiden arama/sargı klibi yetim kalıp sonsuza dek dönüyordu
  check(!oynar(e2, 1, 'Fixing_Kneeling') && !oynar(e2, 2, 'Bandage_Loop'), 'ifade başlayınca önceki döngü eylemi sönmeli', e2 && e2.av.slice(1, 3));
  await run('actions3', "() => ({ mode: 'ground', speed: 0 })", idleZ, 12, front, () => {
    const A = window.__m.avs;
    A[0].hold('pistol'); A[0].play('reload', 1.6); A[1].hold('bat'); A[1].play('melee', 0.55); A[2].play('melee', 0.55); A[3].flinch(1); A[4].play('roll', 0.72); A[5].play('vault', 0.6);
  });
  const e3 = await klipler();
  // ---- etkileşim çeşitleri (gönderen seçer): sandık kapağı, tezgâh, dökme, ekme, hasat, masadan alma
  await run('actions4', "() => ({ mode: 'ground', speed: 0 })", idleZ, 25, front, () => {
    const A = window.__m.avs;
    A.forEach((a) => a.hold(null));
    A[0].play('search', 3, 'chest'); A[1].play('search', 3, 'mid'); A[2].play('search', 3, 'pour'); A[3].play('search', 2, 'plant'); A[4].play('search', 2, 'harvest'); A[5].play('pickup', 0.6, 'table');
  });
  const e4 = await klipler();
  const cesit = ['Chest_Open', 'PickUp_Table', 'Farm_Watering', 'Farm_PlantSeed', 'Farm_Harvest', 'PickUp_Table'];
  const cesitOynayan = cesit.filter((ad, i) => oynar(e4, i, ad)).length;
  log('etkileşim çeşitleri', { cesitOynayan, klip: e4 && e4.av.map((a) => a.klip.join(',')) });
  check(cesitOynayan === 6 && !(e4 && e4.av.some((a) => a.klip.some((c) => c.includes('Fixing_Kneeling') || c.includes('PickUp_Kneeling')))), 'arama/alma çeşitleri kendi kliplerini oynamalı (sandık, tezgâh, dökme, ekme, hasat, masadan alma)', e4 && e4.av);
  // ---- gönderende çözülen çeşit uzakta aynen oynar: A0 yürürken alır → 'table' gider; dururken uzak avatar (remote)
  // aynı eylemi PickUp_Table olarak oynar (kendi hızına bakmaz), yeniden yansıtmaz. Yeni uzak avatar ilk karede yönüne
  // oturur (0'dan dönmez); yumruk sırası gönderenin vuruş sayacından (act[4]; tek: sol direkt, çift: sağ kroşe)
  const det = await evalJS(page, async () => {
    const M = window.__m, g = M.g;
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { CHARACTERS, CHARACTER_IDS } = await import('/src/entities/CharacterFactory.js');
    const a0 = M.avs[0];
    for (let f = 0; f < 20; f++) a0.update(1 / 30, { mode: 'ground', speed: 2, yaw: Math.PI });
    a0.play('pickup', 0.5);
    const act = a0.lastAct ? a0.lastAct.slice() : null;
    const r = new Avatar(g, CHARACTERS[CHARACTER_IDS[1]].look, { remote: true });
    r.root.position.set(a0.root.position.x, a0.root.position.y, a0.root.position.z - 2.5);
    g.scene.add(r.root);
    const clips = (av) => av.motion.shots.filter((x) => !x.out && (x.cur || 0) > 0.05).map((x) => x.group + ':' + x.name);
    const st = (extra) => ({ mode: 'ground', speed: 0, yaw: 0.7, ...extra });
    r.update(1 / 30, st({ act, actT: 0.1 }));
    const yaw0 = +r.visYaw.toFixed(4);
    for (let f = 0; f < 5; f++) r.update(1 / 30, st({ act, actT: 0.1 }));
    const pick = clips(r);
    // act[4]: gönderenin vuruş sayacı (yalnız vuruşla artar) — sıra numarasının tek/çiftliği değil (arada isabet/zıplama olur)
    r.update(1 / 30, st({ act: [1002, 'melee', 0.55, null, 3], actT: 0.02 }));
    const jab = clips(r);
    r.update(1 / 30, st({ act: [1005, 'melee', 0.55, null, 4], actT: 0.02 }));
    const cross = clips(r);
    const out = { act, yaw0, pick, jab, cross, rLastAct: r.lastAct === undefined ? null : r.lastAct };
    r.dispose();
    return out;
  });
  log('uzak eylem çeşidi', det);
  check(det && det.act && det.act[1] === 'pickup' && det.act[3] === 'table', 'yürürken alma: gönderen masadan alma çeşidini (table) yansıtmalı', det);
  check(det && det.pick.includes('act:PickUp_Table') && !det.pick.some((c) => c.includes('PickUp_Kneeling')) && det.rLastAct === null, 'uzak avatar dururken de gönderenin çeşidini oynamalı, yeniden yansıtmamalı', det);
  check(det && Math.abs(det.yaw0 - 0.7) < 1e-3, 'yeni avatar ilk karede bakış yönüne oturmalı (0\'dan dönmemeli)', det);
  check(det && det.jab.includes('attack:Punch_Jab') && det.cross.includes('attack:Punch_Cross'), 'yumruk sırası gönderenin vuruş sayacından (act[4]) gelmeli (tek: direkt, çift: kroşe), eylem sıra numarasından değil', det);
  // ---- gülme/gösterme, isabet (dizinle) ve gitar eylem olarak yansıtılır; el sallama ve dans ifade alanından
  await run('emotes', "(i) => ({ mode: 'ground', speed: 0, emote: i === 4 ? 'wave' : i === 5 ? 'dance' : null })", idleZ, 12, front, () => {
    const A = window.__m.avs;
    A.forEach((a) => { a.hold(null); a.action = null; });
    A[0].play('laugh', 2.4); A[1].play('point', 2.4); A[2].play('hit', 0.45, 2); A[3].play('guitar', 4);
    // yazılan eylemler (anim durumunun act alanı): biten eylemin durdurması bunları ancak 0,25 sn sonra izler. İsabet eylem
    // yuvasına yazılmaz: kendi alanında (hit: [sayaç, klip dizini]) gider
    window.__emoteActs = A.slice(0, 4).map((a) => (a.lastAct ? a.lastAct.slice() : null));
    window.__emoteHit = A[2].lastHit ? A[2].lastHit.slice() : null;
  });
  const ifade = await evalJS(page, () => {
    const A = window.__m.avs;
    const clips = (a) => a.motion.shots.filter((x) => !x.out && (x.cur || 0) > 0.05).map((x) => x.group + ':' + x.name);
    const E = window.__emoteActs || [];
    const r = {
      gul: [E[0] && E[0][1], A[0].action && A[0].action.type], goster: [E[1] && E[1][1], A[1].action && A[1].action.type],
      isabet: [window.__emoteHit, clips(A[2]), E[2] && E[2][1]], gitar: [E[3] && E[3][1], A[3].action && A[3].action.type, clips(A[3])],
      el: A[4].overlays.filter((o) => o.name === 'wave').length, dans: clips(A[5]),
    };
    // el sallama bir kez (2,4 sn): ifade alanı 2,7 sn sürse de yeniden başlamaz (eskiden yerelde 4,0, uzakta 3,2 sn)
    let on = r.el > 0, yeniden = 0;
    for (let f = 0; f < 70; f++) {
      A[4].update(1 / 30, { mode: 'ground', speed: 0, yaw: Math.PI, emote: 'wave' });
      const now = A[4].overlays.some((o) => o.name === 'wave');
      if (now && !on) yeniden++;
      on = now;
    }
    r.elYeniden = yeniden; r.elSonda = on;
    // dans ederken yürüyünce tam gövde döngü kesilir (kayarak dans yok), durdurma yansıtılır
    for (let f = 0; f < 15; f++) A[5].update(1 / 30, { mode: 'ground', speed: 2.2, yaw: Math.PI, emote: 'dance' });
    r.dansYuruyus = clips(A[5]); r.dansEylem = A[5].action ? A[5].action.type : null; r.dansDurdur = A[5].lastAct && A[5].lastAct[1];
    // biten eylemin durdurması ile aynı karede gelen isabet birbirini ezmez: isabet eylem yuvasını kullanmaz (kendi sayacı),
    // durdurma hemen yazılır
    const a = A[0], st = { mode: 'ground', speed: 0, yaw: Math.PI };
    a.play('search', 3, 'low');
    for (let f = 0; f < 15; f++) a.update(1 / 30, st);
    const hit0 = a.lastHit ? a.lastHit[0] : 0, act0 = a.lastAct.slice();
    a.action = null; a.play('hit', 0.45, 1);
    a.update(1 / 30, st);
    r.durdurma = [act0, a.lastAct.slice(), a.lastHit ? a.lastHit.slice() : null, hit0];
    return r;
  });
  log('ifadeler', ifade);
  check(ifade && ifade.gul[0] === 'laugh' && ifade.gul[1] === 'laugh' && ifade.goster[0] === 'point' && ifade.goster[1] === 'point', 'gülme ve gösterme eylem olarak yansıtılmalı', ifade);
  check(ifade && ifade.isabet[0] && ifade.isabet[0][1] === 2 && ifade.isabet[1].includes('hit:Hit_Stomach') && ifade.isabet[2] !== 'hit', 'isabet tepkisi kendi alanında klip diziniyle yansıtılmalı (dizin 2 → Hit_Stomach), eylem yuvasına yazılmamalı', ifade);
  check(ifade && ifade.gitar[0] === 'guitar' && ifade.gitar[1] === 'guitar' && !ifade.gitar[2].some((c) => c.includes('Fish_')), 'gitar prosedürel tel vurma pozuyla çalınmalı (olta klibi değil), yansıtılmalı', ifade);
  check(ifade && ifade.el === 1 && ifade.elYeniden === 0 && !ifade.elSonda, 'el sallama ifade boyunca bir kez oynamalı, yeniden başlamamalı', ifade);
  check(ifade && ifade.dans.includes('emote:Dance_Loop') && !ifade.dansYuruyus.some((c) => c.startsWith('emote:')) && ifade.dansEylem === null && ifade.dansDurdur === 'stop', 'dans ifade alanından oynamalı; yürüyünce kesilmeli ve durdurma yansıtılmalı', ifade);
  const dd = ifade && ifade.durdurma;
  check(dd && dd[0][1] === 'search' && dd[1][1] === 'stop' && dd[1][0] === dd[0][0] + 1 && dd[2] && dd[2][0] === dd[3] + 1 && dd[2][1] === 1,
    'biten eylemin durdurması ile aynı karedeki isabet birbirini ezmemeli (durdurma eylem yuvasında hemen, isabet kendi sayacında)', dd);
  // yere serilmeden 0,05 sn içinde ikinci zombinin isabeti (sürüde olağan): eylem yuvasında serilme kalır; ağdan (gerçek
  // Net.compactAnim) giden durumla uzak avatar serilir ve isabeti aynı klip diziniyle bir kez oynar (eskiden isabet serilmeyi
  // ezip uzakta ayakta duran bir sarsılma gösteriyordu)
  const yaris = await evalJS(page, async () => {
    const M = window.__m, g = M.g;
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { CHARACTERS, CHARACTER_IDS } = await import('/src/entities/CharacterFactory.js');
    const mk = (opts, dz) => { const a = new Avatar(g, CHARACTERS[CHARACTER_IDS[2]].look, opts); const p = M.avs[2].root.position; a.root.position.set(p.x, p.y, p.z + dz); g.scene.add(a.root); return a; };
    const own = mk({}, -2.5), r = mk({ remote: true }, -4);
    const st = { mode: 'ground', speed: 0, yaw: Math.PI };
    const pkt = (actT) => g.net.compactAnim({ ...st, act: own.lastAct || null, actT, hit: own.lastHit || null }); // Player.animState → ağ
    const clips = (a) => a.motion.shots.filter((x) => !x.out && (x.cur || 0) > 0.05).map((x) => x.group + ':' + x.name);
    for (let f = 0; f < 4; f++) { own.update(1 / 30, st); r.update(1 / 30, pkt(0)); }
    own.play('hit', 0.45, 1); own.play('knock', 1.95); // ağır darbe: isabet + serilme
    own.update(1 / 30, st);
    own.play('hit', 0.45, 3); // 0,033 sn sonra ikinci zombi
    r.update(1 / 30, pkt(0.04)); // ilk durum paketi ancak şimdi gider
    const seen = new Set(r.motion.shots.filter((x) => x.group === 'hit'));
    const uzakIsabet = [...seen].map((x) => x.name);
    let yeniIsabet = 0; // sonraki paketler aynı sayacı taşır: isabet yeniden oynamamalı
    for (let f = 0; f < 10; f++) {
      own.update(1 / 30, st); r.update(1 / 30, pkt(0.07 + f / 30));
      for (const x of r.motion.shots) if (x.group === 'hit' && !seen.has(x)) { yeniIsabet++; seen.add(x); }
    }
    const out = { act: own.lastAct && own.lastAct.slice(), hit: own.lastHit && own.lastHit.slice(), uzakEylem: r.action ? r.action.type : null, uzakKlip: clips(r), uzakIsabet, yeniIsabet };
    own.dispose(); r.dispose();
    return out;
  });
  log('serilme + 0,03 sn sonra isabet (uzak)', yaris);
  check(yaris && yaris.act && yaris.act[1] === 'knock' && yaris.uzakEylem === 'knock' && yaris.uzakKlip.includes('act:Hit_Knockback') && yaris.uzakIsabet.length === 1 && yaris.uzakIsabet[0] === 'Hit_Shoulder_L' && yaris.yeniIsabet === 0,
    'serilmeden 0,05 sn içinde gelen isabet serilmeyi ezmemeli: uzak avatar serilmeli ve isabet klibini (dizin 3) bir kez oynamalı', yaris);
  // her karakterde istenen eylemin klibi o anda oynuyor olmalı (null: bu anda bitmiş olması beklenen eylem)
  const beklenen = [
    [e1, ['PickUp_Kneeling', 'Fixing_Kneeling', 'Bandage_Loop', 'Drink', 'Mining_Loop', 'Consume']],
    [e2, [null, 'Celebration', 'Dance_Loop', 'Fixing_Kneeling', 'Kick', 'Fish_Cast']], // fırlatma (0,5 sn) 25 karede biter
    [e3, ['Pistol_Reload', 'Sword_Regular', 'Punch_', 'Hit_', 'Roll', 'SafetyVault']], // isabet klibi rastgele: Hit_Chest 0,33 sn
  ];
  let istenen = 0, oynayan = 0;
  const eksik = [];
  beklenen.forEach(([d, adlar], j) => adlar.forEach((ad, i) => {
    if (!ad) return;
    istenen++;
    if (oynar(d, i, ad)) oynayan++;
    else eksik.push(`actions${j + 1}[${i}] ${ad}: ${d && d.av && d.av[i] ? d.av[i].klip.join(',') || '-' : '?'}`);
  }));
  log('eylem klipleri', { oynayan, istenen, eksik });
  check(oynayan >= istenen - 2, 'istenen eylem klipleri oynamalı (alma, arama, sargı, içme, çekiç, ifade, tekme, olta, şarjör, vuruş, takla, atlama)', { oynayan, istenen, eksik });
  await run('sleep', "(i) => ({ mode: i < 3 ? 'sleep' : 'dead', speed: 0 })", idleZ, 50, front, () => { window.__m.avs.forEach((a) => { a.hold(null); a.action = null; }); });
  const uyku = await klipler();
  // eylemler bitirildi (action = null): hiçbir eylem/ifade/devam klibi sürmemeli (eskiden ifadeyle değişen arama ve
  // sargı döngüsü yetim kalıp sonsuza dek dönüyor, ayak IK'sını, kıpırdanmayı ve tutuş pozlarını bastırıyordu)
  const kalan = uyku && uyku.av ? uyku.av.map((a, i) => [i, a.klip.filter((c) => /^(act|act2|emote):/.test(c))]).filter(([, k]) => k.length) : null;
  log('eylem bittikten sonra süren eylem klipleri', kalan);
  check(Array.isArray(kalan) && kalan.length === 0, 'eylem bitince / ifadeyle değişince eski eylem klibi durmalı', kalan);
  await run('wake', "() => ({ mode: 'ground', speed: 0 })", idleZ, 14, front);
  const uyan = await klipler();
  await run('climb', "(i) => ({ mode: 'climb', speed: 1.2, vy: i % 2 ? 1.6 : -1.6 })", idleZ, 30, side);
  const tirman = await klipler();
  await run('prone-enter', "(i) => ({ mode: i % 2 ? 'prone' : 'crouch', speed: 0 })", idleZ, 9, side);
  const yat = await klipler();
  const kip = {
    uyku: say(uyku, (a, i) => a.klip.some((c) => c.startsWith(i < 3 ? 'sleep:IdleToLay' : 'death:Death0'))),
    uyanma: say(uyan, (a, i) => i < 3 && a.klip.some((c) => c.startsWith('wake:LayToIdle'))),
    kalanUykuOlum: say(uyan, (a) => a.klip.some((c) => c.startsWith('sleep:') || c.startsWith('death:'))),
    tirmanma: say(tirman, (a) => a.durum === 'climb'),
    yatma: say(yat, (a, i) => a.durum === (i % 2 ? 'prone' : 'crouch')),
    karakter: tirman && tirman.av ? tirman.av.length : 0,
  };
  log('tam gövde kipleri', kip);
  check(kip.karakter >= 6 && kip.uyku >= 5 && kip.uyanma >= 2 && kip.kalanUykuOlum === 0 && kip.tirmanma === kip.karakter && kip.yatma === kip.karakter,
    'uyku ve ölüm klipleri oynamalı, uyanınca bitmeli (kalkma klibi); tırmanma, sürünme ve eğilme durumlarına geçilmeli', kip);
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
  // bilek (incik ucu) yüksekliği basamak tabanına (by) göre [sol, sağ]; IK kapalıyken saklanan IK nesnesinin bacaklarıyla
  // ölçülür (dünya matrisleri yerel dönüşümlerden yeniden hesaplanır, poz değişmez)
  const bilekler = (by) => evalJS(page, (by) => window.__m.avs.map((a) => {
    const ik = a.footIK || a._ikSave;
    if (!ik || !ik.ok) return null;
    a.root.updateMatrixWorld(true);
    return ik.legs.map((L) => +(L.ankle.clone().applyMatrix4(L.ll.matrixWorld).y - by).toFixed(3));
  }), by);
  const stepCam = [0, 0.75, -4.6, 0, 0.55, 0];
  await run('ik-off', "() => ({ mode: 'ground', speed: 0 })", idleZ, 30, stepCam, () => { for (const a of window.__m.avs) { a._ikSave = a.footIK; a.footIK = null; } });
  const ikKapali = await bilekler(stepInfo && stepInfo.by);
  await run('ik-on', "() => ({ mode: 'ground', speed: 0 })", idleZ, 40, stepCam, () => { for (const a of window.__m.avs) a.footIK = a._ikSave; });
  const ikAcik = await bilekler(stepInfo && stepInfo.by);
  const ikState = await evalJS(page, () => window.__m.avs.map((a) => a.footIK ? [+a.footIK.pelvis.toFixed(3), +a.footIK.legs[0].dy.toFixed(3), +a.footIK.legs[1].dy.toFixed(3)] : null));
  log('IK (kalça, sol dy, sağ dy)', ikState);
  log('basamakta bilek yüksekliği [IK kapalı, IK açık] (sol, sağ)', (ikAcik || []).map((v, i) => [ikKapali ? ikKapali[i] : null, v]));
  // IK açılınca sol bilek basamak kadar (0,22 m) yükselmeli, sağ bilek yerinde kalmalı
  const ikKalkan = (ikAcik || []).filter((v, i) => v && ikKapali && ikKapali[i] && v[0] - ikKapali[i][0] > 0.12 && Math.abs(v[1] - ikKapali[i][1]) < 0.06).length;
  check(ikKalkan === 6, "ayak IK'sı 0,22 m'lik basamaktaki sol ayağı kaldırmalı, sağ ayak yerinde kalmalı (6/6 karakter; eskiden yetim eylem klibi bir karakterde IK'yı bastırıyordu)", { ikKalkan, ikKapali, ikAcik, ikState });
  await evalJS(page, () => { const M = window.__m; for (const [c, mesh] of M.steps) { M.g.world.physics.remove(c); M.g.scene.remove(mesh); } });
  // ---- kişilik kıpırdanmaları (elde alet: Mert anahtar, Elif dürbün) + zamanlayıcının kendi kendine tetiklenmesi
  await run('settle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 60, front, () => { window.__m.avs.forEach((a) => { a.root.visible = true; a.hold(null); a.action = null; }); });
  await run('fidget', "() => ({ mode: 'ground', speed: 0 })", idleZ, 36, front, () => {
    const kinds = ['tinker', 'peek', 'boxing', 'binoculars', 'stretch', 'watch'];
    window.__m.avs.forEach((a, i) => a.startFidget(kinds[i]));
  });
  const fid = await evalJS(page, () => window.__m.avs.map((a) => ({ kind: a.fidget && a.fidget.kind, prop: !!(a.fidget && a.fidget.prop), vis: !!(a.fidget && a.fidget.prop && a.fidget.prop.visible) })));
  log('kıpırdanma', fid);
  const auto = await evalJS(page, async () => {
    const M = window.__m, a = M.avs[0];
    a.endFidget(); a.fidget.next = 0.2;
    for (let f = 0; f < 15; f++) a.update(1 / 30, { mode: 'ground', speed: 0, yaw: Math.PI });
    const started = a.fidget.kind, act = a.lastAct ? a.lastAct.slice() : null;
    // uzak yankı: sahibin yansıttığı kıpırdanma (act) uzak avatarda aynı türle oynar; uzak avatar yeniden yansıtmaz ve
    // kendi kendine kıpırdanma seçmez (zamanlayıcısı süresi dolsa da)
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { CHARACTERS, CHARACTER_IDS } = await import('/src/entities/CharacterFactory.js');
    const r = new Avatar(M.g, CHARACTERS[CHARACTER_IDS[0]].look, { remote: true });
    r.root.position.set(a.root.position.x, a.root.position.y, a.root.position.z - 2.5);
    M.g.scene.add(r.root);
    const st = (x) => ({ mode: 'ground', speed: 0, yaw: Math.PI, ...x });
    r.update(1 / 30, st({ act, actT: 0.1 }));
    const echo = r.fidget ? r.fidget.kind : null, echoT = r.fidget ? +r.fidget.t.toFixed(3) : null;
    r.endFidget(); r.fidget.next = 0;
    for (let f = 0; f < 60; f++) r.update(1 / 30, st({ act, actT: 0.1 }));
    const remoteSelf = r.fidget.kind, remoteLastAct = r.lastAct === undefined ? null : r.lastAct;
    r.dispose();
    for (let f = 0; f < 30; f++) a.update(1 / 30, { mode: 'ground', speed: 2.5, yaw: Math.PI }); // yürüyünce kesilir
    return { started, act, echo, echoT, remoteSelf, remoteLastAct, afterWalk: a.fidget.kind, persona: a.ch.look.persona };
  });
  log('kıpırdanma zamanlayıcı ve uzak yankı', auto);
  const kipir = (fid || []).filter((f) => f.kind).length, aletGorunur = (fid || []).filter((f) => f.prop && f.vis).length;
  check(kipir === 6 && aletGorunur >= 1 && !!(auto && auto.started) && auto.afterWalk === null,
    'kişilik kıpırdanmaları oynamalı (aletli olanda alet elde görünür); zamanlayıcı kıpırdanmayı kendiliğinden başlatmalı, yürüyünce kesmeli', { kipir, aletGorunur, fid, auto });
  check(auto && auto.act && auto.act[1] === 'fidget' && auto.act[3] === auto.started && auto.echo === auto.started && auto.echoT >= 0.1 && auto.echoT < 0.2 && auto.remoteSelf === null && auto.remoteLastAct === null,
    'kıpırdanma sahibinde seçilip eylemle yansımalı; uzak avatar aynı türü (geçen süreyle) oynamalı, kendisi seçmemeli ve yeniden yansıtmamalı', auto);
  // kişilik beklemeleri: Deniz kollarını kavuşturur, Elif etrafı kolaçan eder; altısının beklemesi farklı. Klip türü
  // kıpırdanma Motion bekleme çeşidi olarak oynar (Bora kollarını kavuşturur; Ceren telsizle, Zülal fenerle — eşya elde)
  await run('fidget-clip', "() => ({ mode: 'ground', speed: 0 })", idleZ, 30, front, () => {
    const A = window.__m.avs;
    A.forEach((a) => a.endFidget());
    A[4].startFidget('foldArms'); A[5].startFidget('radio'); A[1].startFidget('lantern');
  });
  const kisilik = await evalJS(page, () => window.__m.avs.map((a) => ({ p: a.ch.look.persona, idle: a.motion.persona.idle, cur: a.motion.idle.cur, x: +a.motion.idle.x.toFixed(2), fid: a.fidget && a.fidget.kind, prop: !!(a.fidget && a.fidget.prop && a.fidget.prop.visible) })));
  log('kişilik beklemeleri ve klip kıpırdanmaları', kisilik);
  const K = kisilik || [];
  check(K.length === 6 && K[2].idle === 'Idle_FoldArms_Loop' && K[3].idle === 'Idle_LookAround_Loop' && new Set(K.map((k) => JSON.stringify(k.idle))).size === 6,
    'kişilik temel beklemeleri: Deniz kollarını kavuşturur, Elif etrafı kolaçan eder; altı karakterin beklemesi farklı olmalı', K);
  check(K.length === 6 && K[4].cur === 'Idle_FoldArms_Loop' && K[4].x > 0.95 && K[5].cur === 'Idle_TalkingPhone_Loop' && K[5].prop && K[1].cur === 'Idle_Lantern_Loop' && K[1].prop,
    'klip kıpırdanmaları bekleme çeşidi olarak oynamalı (Bora kollarını kavuşturur; Ceren telsiz, Zülal fener elde)', K);
  await evalJS(page, () => window.__m.avs.forEach((a) => { a.endFidget(); a.fidget.next = 99; }));
  // ---- ayak IK'sı eğimde: yakındaki bir yamaç (gr 0,22–0,6 ≈ 12–31°) bulunur, karakterler eş yükselti boyunca dizilir ve
  // yokuş aşağı bakar (bekleme duruşunda sol ayak önde, sağ ayak geride). IK kalçayı alçak (öndeki) ayağa indirir, arkadaki
  // ayağı kaldırır: her iki bileğin zemine göre yüksekliği düz zemindeki gibi olur (bekleme klibinde fark ~0,03 m)
  const slope = await evalJS(page, async () => {
    const M = window.__m, T = M.T, g = M.g, THREE = await import('three');
    // düz zeminde (taban) ayak kemiklerinin köke göre yönelimi: yamaçta ayak tabanının zemine yatışı buna göre ölçülür
    const qFlat = M.avs.map((a) => { a.root.updateMatrixWorld(true); const rq = a.root.getWorldQuaternion(new THREE.Quaternion()).invert(); return a.footIK && a.footIK.ok ? a.footIK.legs.map((L) => rq.clone().multiply(L.ft.getWorldQuaternion(new THREE.Quaternion()))) : null; });
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
    // görsel yön de verilir: yalnız kök döndürülürse avatar yönü 0'dan hedefe çekip yerinde dönüş klibi oynatıyordu
    const down = Math.atan2(-best.gx, -best.gz);
    M.avs.forEach((a, i) => { const d = (i - 2.5) * 1.2; const x = best.x + tx * d, z = best.z + tz * d; a.root.position.set(x, T.heightAt(x, z), z); a.root.rotation.y = down; a.visYaw = a.lastYaw = down; });
    // ayak IK'sı yalnız kameraya 30 m'den yakın karakterlerde çalışır (Avatar.updateMotion): kamera güncellemeden ÖNCE
    // yamaca alınır. Önceden döngüden sonra alınıyordu; yamaç tabandan uzak olunca IK hiç çalışmıyor, kalça 0'da kalıyordu
    const c = g.gfx.camera, by = T.heightAt(best.x, best.z);
    c.position.set(best.x - best.gx / best.gr * 5.5, by + 1.6, best.z - best.gz / best.gr * 5.5); // yokuş aşağıdan (karakterlerin önünden)
    c.lookAt(best.x, by + 0.8, best.z);
    for (let f = 0; f < 45; f++) M.avs.forEach((a) => a.update(1 / 30, { mode: 'ground', speed: 0, yaw: down }));
    // zemin normali (arazi, ±0,3 m merkezi fark)
    const nrm = (x, z) => new THREE.Vector3(-(T.heightAt(x + 0.3, z) - T.heightAt(x - 0.3, z)) / 0.6, 1, -(T.heightAt(x, z + 0.3) - T.heightAt(x, z - 0.3)) / 0.6).normalize();
    const out = M.avs.map((a, i) => {
      if (!a.footIK || !a.footIK.ok) return null;
      const res = a.footIK.legs.map((L) => { const p = new THREE.Vector3().copy(L.ankle).applyMatrix4(L.ll.matrixWorld); return +(p.y - T.heightAt(p.x, p.z)).toFixed(3); });
      // ayak tabanı: düz zemindeki yönelimine göre ek dönüşün yukarı vektörü ile zemin normali arasındaki açı (derece);
      // yatırılmasa ≈ eğim açısı. kok: avatarın görsel yönü (yerinde dönüş oynamamalı)
      const rqw = a.root.getWorldQuaternion(new THREE.Quaternion());
      const taban = qFlat[i] ? a.footIK.legs.map((L, j) => {
        const dq = rqw.clone().invert().multiply(L.ft.getWorldQuaternion(new THREE.Quaternion())).multiply(qFlat[i][j].clone().invert());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(dq).applyQuaternion(rqw);
        const p = new THREE.Vector3().copy(L.ankle).applyMatrix4(L.ll.matrixWorld);
        return +(up.angleTo(nrm(p.x, p.z)) * 180 / Math.PI).toFixed(1);
      }) : null;
      return { L: res[0], R: res[1], fark: +Math.abs(res[0] - res[1]).toFixed(3), kalca: +a.footIK.pelvis.toFixed(3), taban, egimOlcum: +(a.footIK.slope || 0).toFixed(3), bel: +(a.spineLean || 0).toFixed(3), donus: !!a.turn };
    });
    g.env.update(0.016, g.time, 13 * 60, c.position, null);
    g.gfx.render(0.016, g.time);
    return { egim: +(Math.atan(best.gr) * 180 / Math.PI).toFixed(1), ayaklar: out };
  });
  log('eğimde ayak IK', slope);
  // ayak tabanı yamaca yatar (D6): yatırılmamış taban ≈ eğim açısı kadar sapar; yatırılınca 12°'nin ve eğimin yarısının
  // altında kalmalı (en az 4/6 karakter); yokuş aşağı bakarken ölçülen eğim negatif, bel geriye yaslanır; dönüş klibi yok
  const tabanUyan = (slope && slope.ayaklar || []).filter((a) => a && a.taban && Math.max(...a.taban) < Math.min(12, slope.egim * 0.5)).length;
  check(!!slope && tabanUyan >= 4, 'yamaçta basan ayakların tabanı zemine yatmalı (zemin normaline açı < 12° ve < eğimin yarısı, en az 4/6)', { tabanUyan, slope });
  check(!!slope && slope.ayaklar.every((a) => a && a.egimOlcum < -0.1 && a.bel < -0.02 && !a.donus), 'yokuş aşağı bakarken eğim negatif ölçülmeli ve bel geriye yaslanmalı; yerinde dönüş oynamamalı', slope && slope.ayaklar);
  // IK'sız (kalça 0) bilek farkı ~0,15 m çıkıyordu; IK ile kalça inmeli (< −0,01 m) ve fark < 0,08 m olmalı
  const ayaklar = slope && Array.isArray(slope.ayaklar) ? slope.ayaklar : [];
  const egimUyan = ayaklar.filter((a) => a && [a.L, a.R, a.kalca].every(Number.isFinite) && a.kalca < -0.01 && a.fark < 0.08 && a.L > -0.05 && a.R > -0.05 && a.L < 0.3 && a.R < 0.3).length;
  check(!!slope && egimUyan === 6, "eğimde ayak IK'sı: kalça inmeli, iki bileğin zemine göre yüksekliği düz zemindeki gibi yakın olmalı (6/6 karakter)", { egimUyan, slope });
  await shot(page, '/tmp/motion-slope.png');
  await evalJS(page, () => { const M = window.__m; M.avs.forEach((a, i) => { const x = M.base.x + (i - 2.5) * 1.25, z = M.base.z; a.root.position.set(x, M.T.heightAt(x, z), z); a.root.rotation.y = 0; a.visYaw = a.lastYaw = Math.PI; }); });
  // ---- zombiler (insanlar gizlenir: kamera zombilerin önünde)
  await evalJS(page, () => { for (const a of window.__m.avs) a.root.visible = false; });
  await run('z-idle', "() => ({ mode: 'ground', speed: 0 })", idleZ, 40, zcam);
  await run('z-walk', "() => ({ mode: 'ground', speed: 0 })", "(i) => ({ state: 'chase', speed: i === 1 ? 4.5 : 1.0 })", 40, zcam);
  await run('z-run', "() => ({ mode: 'ground', speed: 0 })", "() => ({ state: 'chase', speed: 4.2 })", 40, zcam);
  await run('z-attack', "() => ({ mode: 'ground', speed: 0 })", idleZ, 10, zcam, () => { window.__m.zs.forEach(({ v }) => v.attack()); });
  const zs1 = await klipler();
  await run('z-bash', "() => ({ mode: 'ground', speed: 0 })", "(i) => ({ state: i === 3 ? 'scream' : 'bash', speed: 0, bashing: i !== 3 })", 30, zcam);
  const zs2 = await klipler();
  await run('z-hit', "() => ({ mode: 'ground', speed: 0 })", idleZ, 5, zcam, () => { window.__m.zs.forEach(({ v }) => v.flinch()); });
  const zs3 = await klipler();
  await run('z-dead', "() => ({ mode: 'ground', speed: 0 })", "() => ({ state: 'idle', speed: 0, dead: true })", 60, zcam);
  const zs4 = await klipler();
  const zsay = (d, f) => (d && d.z ? d.z.filter(f).length : 0);
  const zk = {
    saldiri: zsay(zs1, (z) => z.klip.some((c) => c.startsWith('attack:Zombie_'))),
    yumrukCiglik: zsay(zs2, (z, i) => z.klip.some((c) => c.startsWith(i === 3 ? 'scream:' : 'bash:'))), // 3: çığlıkçı
    isabet: zsay(zs3, (z) => z.klip.some((c) => c.startsWith('hit:Hit_'))),
    olum: zsay(zs4, (z) => z.k === 'crawler' || z.klip.some((c) => c.startsWith('death:Death0'))), // sürünenin ölüm klibi yok
    surunen: zsay(zs1, (z) => z.k === 'crawler' && z.durum === 'prone'),
  };
  log('zombi klipleri', zk);
  check(zk.saldiri >= 7 && zk.yumrukCiglik >= 7 && zk.isabet >= 7 && zk.olum >= 7 && zk.surunen === 1,
    'zombi klipleri oynamalı: saldırı (ısırma/tırmalama), kapı yumruklama ve çığlık, isabet tepkisi, ölüm (8 türün en az 7si); sürünen sürünme durumunda', zk);
  // ---- uzun diz çökme (Fixing_Kneeling 5,2 sn): döngü diz çökmüş aralıkta gidip gelir (k 0,13–0,8; ayağa kalkış k 0,8–1
  // döngüye girmez); dış sistem bitirince ayağa kalkma çıkışı oynar ve durdurma yansıtılır; yürüyünce döngü kesilir
  const diz = await evalJS(page, () => {
    const a = window.__m.avs[2];
    const st = (s) => ({ mode: 'ground', speed: s, yaw: Math.PI });
    const live = () => a.motion.shots.filter((q) => !q.out).map((q) => q.group + ':' + q.name);
    a.hold(null); a.action = null;
    for (let f = 0; f < 10; f++) a.update(1 / 30, st(0));
    a.play('search', 8, 'low');
    const sh = a.action && a.action.shot;
    if (!sh) return null;
    let maxK = 0, minK = 1, flips = 0, dir = sh.dir;
    for (let f = 0; f < 200; f++) {
      a.update(1 / 30, st(0));
      const k = sh.t / sh.s.dur;
      maxK = Math.max(maxK, k);
      if (sh.dir !== dir) { flips++; dir = sh.dir; }
      if (flips) minK = Math.min(minK, k);
    }
    a.action = null; // basılı tutma tamamlandı (Interact eylemi bitirir)
    a.update(1 / 30, st(0));
    const afterStop = live(), stopAct = a.lastAct && a.lastAct[1];
    for (let f = 0; f < 45; f++) a.update(1 / 30, st(0));
    const afterExit = live();
    a.play('search', 8, 'low');
    for (let f = 0; f < 6; f++) a.update(1 / 30, st(0));
    for (let f = 0; f < 15; f++) a.update(1 / 30, st(2.5));
    return { maxK: +maxK.toFixed(3), minK: +minK.toFixed(3), flips, afterStop, stopAct, afterExit, walk: live(), walkAct: a.action ? a.action.type : null, walkStop: a.lastAct && a.lastAct[1] };
  });
  log('diz çökme döngüsü', diz);
  check(diz && diz.maxK <= 0.801 && diz.flips >= 1 && diz.minK >= 0.129, 'diz çökme döngüsü ayağa kalkışı tekrarlamamalı (k 0,13–0,8 arasında gidip gelmeli)', diz);
  check(diz && diz.afterStop.includes('act/exit:Fixing_Kneeling') && !diz.afterStop.includes('act:Fixing_Kneeling') && diz.stopAct === 'stop' && !diz.afterExit.some((c) => c.includes('Fixing_Kneeling')),
    'eylem bitince ayağa kalkma çıkışı oynamalı, sonra sönmeli; durdurma yansıtılmalı', diz);
  check(diz && !diz.walk.some((c) => c.includes('Fixing_Kneeling')) && diz.walkAct === null && diz.walkStop === 'stop', 'yürüyünce tam gövde diz çökme döngüsü kesilmeli (çıkış oynamadan), durdurma yansıtılmalı', diz);
  // ---- hareket hissi (insanlar yeniden görünür, zombiler gizlenir; karakterler yan döner: yön −X, önden kamerada profil)
  await evalJS(page, () => {
    const M = window.__m;
    for (const { v } of M.zs) v.root.visible = false;
    M.avs.forEach((a) => { a.root.visible = true; a.hold(null); a.action = null; a.endFidget(); a.fidget.next = 99; a.visYaw = a.lastYaw = -Math.PI / 2; });
  });
  const profil = "(i, f) => ({ mode: 'ground', speed: 0, yaw: -Math.PI / 2 })";
  await run('feel-settle', profil, idleZ, 30, front);
  // depardan duruş adımı (D1): 20 kare 6,5 m/sn, sonra dur → 12 kare içinde Sprint_Exit fren adımı (düşük ağırlık)
  await run('sprint-stop', "(i, f) => ({ mode: 'ground', speed: f < 20 ? 6.5 : 0, yaw: -Math.PI / 2 })", idleZ, 28, front);
  const durus = await klipler();
  const durusW = await evalJS(page, () => window.__m.avs.map((a) => { const x = a.motion.shots.find((q) => q.group === 'stopstep' && !q.out); return x ? +(x.cur || 0).toFixed(2) : 0; }));
  log('depardan duruş adımı (ağırlık)', durusW);
  check(say(durus, (a) => a.klip.includes('stopstep:Sprint_Exit')) >= 5 && (durusW || []).every((w) => w <= 0.41),
    'depardan durunca Sprint_Exit fren adımı (stopstep) düşük ağırlıkla (≤ 0,4) oynamalı (en az 5/6)', { durus: durus && durus.av, durusW });
  await run('sprint-stop-end', profil, idleZ, 40, front);
  const durusSon = await klipler();
  check(say(durusSon, (a) => a.klip.some((c) => c.startsWith('stopstep:'))) === 0, 'fren adımı bitince sönmeli', durusSon && durusSon.av);
  // yerinde dönüş (D2): dururken yön 90° sola ve 180° değişir → Turn klibi alt gövdede (kollar serbest), kök yönü
  // klibin ilerleyişiyle döner; 40 karede hedefe oturur
  const donus = await evalJS(page, () => {
    const M = window.__m, A = M.avs;
    const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
    const live = (a) => a.motion.shots.filter((q) => !q.out && (q.cur || 0) > 0.05).map((q) => q.group + ':' + q.name);
    const step = (yaw, n) => { for (let f = 0; f < n; f++) A.forEach((a) => a.update(1 / 30, { mode: 'ground', speed: 0, yaw })); };
    const t90 = -Math.PI / 2 + Math.PI / 2; // sola 90°
    step(t90, 3);
    const k90 = A.map(live), lowerW = A.map((a) => +a.motion.lowerW.toFixed(2)), fullW = A.map((a) => +a.motion.fullW.toFixed(2));
    step(t90, 37);
    const err90 = A.map((a) => +Math.abs(wrap(a.visYaw - t90)).toFixed(3));
    const t180 = t90 + Math.PI;
    step(t180, 3);
    const k180 = A.map(live);
    step(t180, 37);
    const err180 = A.map((a) => +Math.abs(wrap(a.visYaw - t180)).toFixed(3));
    // oyuncu avatarı (player): yön yalnız hareketle döner, dönüş klibi yok
    return { k90, lowerW, fullW, err90, k180, err180 };
  });
  log('yerinde dönüş', donus);
  check(donus && donus.k90.filter((k) => k.includes('turn:Turn90_L')).length >= 5 && donus.lowerW.filter((w) => w > 0.3).length >= 5 && donus.fullW.every((w) => w < 0.05) && donus.err90.every((e) => e < 0.05),
    "dururken 90° sola dönüşte Turn90_L alt gövde ('lower') klibi oynamalı, tam gövde ağırlığı olmamalı; 40 karede yön hedefe oturmalı (< 0,05 rad)", donus);
  check(donus && donus.k180.filter((k) => k.some((c) => c.startsWith('turn:Turn180_'))).length >= 5 && donus.err180.every((e) => e < 0.05),
    'dururken 180° dönüşte Turn180 klibi oynamalı; 40 karede yön hedefe oturmalı', donus);
  await run('turn-mid', profil, idleZ, 1, front, () => {
    const A = window.__m.avs;
    A.forEach((a) => { a.visYaw = a.lastYaw = Math.PI / 2; });
    for (let f = 0; f < 9; f++) A.forEach((a) => a.update(1 / 30, { mode: 'ground', speed: 0, yaw: -Math.PI / 2 }));
  });
  await run('turn-settle', profil, idleZ, 40, front);
  // ivme eğilmesi (D3): aynı karakterin iki eşi aynı hız basamağıyla sürülür; birinde ivme eğilmesi kapalı tutulur →
  // boyun-kalça doğrultusunun öne eğimi farkı hızlanırken öne (+), yavaşlarken geriye (−) en az 2°
  const egilme = await evalJS(page, async () => {
    const M = window.__m, THREE = await import('three');
    const { Avatar } = await import('/src/entities/Avatar.js');
    const { CHARACTERS } = await import('/src/entities/CharacterFactory.js');
    const mk = (dx) => { const a = new Avatar(M.g, CHARACTERS.mert.look, {}); const x = M.base.x + dx, z = M.base.z - 1.5; a.root.position.set(x, M.T.heightAt(x, z), z); M.g.scene.add(a.root); return a; };
    const A = mk(-0.8), B = mk(0.8);
    const yaw = -Math.PI / 2, fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const tilt = (a) => { a.root.updateMatrixWorld(true); const b = (n) => a.motion.bones[a.motion.index.get(n)].getWorldPosition(new THREE.Vector3()); const v = b('Neck').sub(b('Hips')); return Math.atan2(v.dot(fwd), v.y) * 180 / Math.PI; };
    const sync = () => { B.motion.t = A.motion.t; B.motion.phase = { ...A.motion.phase }; B.t = A.t; B.speedSm = A.speedSm; B.angSm = A.angSm; };
    const frame = (speed) => { B._sPrev = undefined; B.accSm = 0; A.update(1 / 30, { mode: 'ground', speed, yaw }); B.update(1 / 30, { mode: 'ground', speed, yaw }); return +(tilt(A) - tilt(B)).toFixed(2); };
    for (const a of [A, B]) { a.fidget = { kind: null, t: 0, dur: 0, next: 99, prop: null }; }
    sync();
    for (let f = 0; f < 30; f++) frame(0);
    sync();
    const hiz = []; for (let f = 0; f < 8; f++) hiz.push(frame(6));
    for (let f = 0; f < 60; f++) frame(6);
    sync();
    const yav = []; for (let f = 0; f < 8; f++) yav.push(frame(0));
    const lean = [A.spineLean, B.spineLean].map((x) => +x.toFixed(3));
    A.dispose(); B.dispose();
    return { hiz, yav, maxHiz: Math.max(...hiz), minYav: Math.min(...yav), lean };
  });
  log('ivme eğilmesi (derece, A − B)', egilme);
  check(egilme && egilme.maxHiz > 2 && egilme.minYav < -2, 'hızlanırken gövde öne, yavaşlarken geriye eğilmeli (en az 2°)', egilme);
  // yere serilme (D4): Hit_Knockback ile sırtüstü düşer, 1 sn'de KipUp ile kalkar, 1,95 sn'de biter
  await run('knock-fall', profil, idleZ, 10, front, () => { window.__m.avs.forEach((a) => a.play('knock', 1.95)); });
  const knock1 = await klipler();
  await run('knock-ground', profil, idleZ, 12, front);
  await run('knock-kipup', profil, idleZ, 18, front);
  const knock2 = await klipler();
  // kalkışın sonu (41.–60. kare, 1,37–2,0 sn): kalçanın köke göre yüksekliği; 1,75–1,95 sn'de (KipUp'ın son sönümü) alttaki
  // yatış pozu yeniden görünmemeli — eskiden karakter kalkıp ~1,9 sn'de yeniden sırtüstü düşüyordu (kalça ~0,05 m)
  const kalkis = await evalJS(page, async () => {
    const M = window.__m, THREE = await import('three');
    const v = new THREE.Vector3();
    const hip = (a) => { a.root.updateMatrixWorld(true); a.motion.bones[a.motion.index.get('Body')].getWorldPosition(v); return v.y - a.root.position.y; };
    const enAz = M.avs.map(() => 9);
    for (let f = 41; f <= 60; f++) {
      M.avs.forEach((a, i) => {
        a.update(1 / 30, { mode: 'ground', speed: 0, yaw: -Math.PI / 2 });
        if (f / 30 >= 1.75 && f / 30 <= 1.95) enAz[i] = Math.min(enAz[i], hip(a));
      });
    }
    return enAz.map((x) => +x.toFixed(3));
  });
  await run('knock-end', profil, idleZ, 10, front);
  const knock3 = await klipler();
  const kn = {
    dusus: say(knock1, (a) => a.klip.includes('act:Hit_Knockback')),
    kalkis: say(knock2, (a) => a.klip.includes('act2:KipUp')),
    bitti: say(knock3, (a) => a.klip.some((c) => c.includes('Hit_Knockback') || c.includes('KipUp'))),
    act: await evalJS(page, () => window.__m.avs.map((a) => a.lastAct && a.lastAct[1])),
    kalkisSonuKalca: kalkis,
  };
  log('yere serilme', kn);
  check(kn.dusus === 6 && kn.kalkis === 6 && kn.bitti === 0 && kn.act.every((x) => x === 'knock'), "yere serilme: Hit_Knockback sonra KipUp oynamalı, 70 karede bitmeli; 'knock' eylemi yansıtılmalı", kn);
  check(Array.isArray(kalkis) && kalkis.length === 6 && kalkis.every((y) => y > 0.6), 'yere serilme: kalkışın sonunda (1,75–1,95 sn) kalça ayakta kalmalı (> 0,6 m), yeniden sırtüstü düşmemeli', kn);
  // ağır yük (D7): taşıma döngüsü ağır tempoda, gövde geriye yaslanır
  await run('carry-heavy', "(i) => ({ mode: 'ground', speed: 1.6, yaw: -Math.PI / 2, carryBox: i % 2 ? 2 : 1 })", idleZ, 40, front);
  const tasima = await evalJS(page, () => window.__m.avs.map((a) => { const x = a.motion.shots.find((q) => q.group === 'carry' && !q.out); return { cb: a._carryBox, rate: x ? +x.rate.toFixed(2) : null, bel: +(a.spineLean || 0).toFixed(3) }; }));
  log('taşıma (1 hafif, 2 ağır)', tasima);
  check(tasima && tasima.every((t, i) => t.rate !== null && (i % 2 ? t.cb === 2 && t.rate < 1 && t.bel < -0.06 : t.cb === 1 && t.rate === 1 && t.bel > -0.03)),
    'ağır yükte taşıma döngüsü yavaş oynamalı ve gövde geriye yaslanmalı; hafif yükte yaslanma olmamalı', tasima);
  await run('carry-end', profil, idleZ, 20, front);
  // ---- kemik dönüş/konumlarında ve kök konumlarında NaN olmamalı (IK ve karışım sonrası)
  const kemik = await evalJS(page, () => {
    const M = window.__m;
    let sayi = 0, bozuk = 0;
    const tara = (root) => root.traverse((o) => { if (!o.isBone) return; sayi++; const q = o.quaternion, p = o.position; if (![q.x, q.y, q.z, q.w, p.x, p.y, p.z].every(Number.isFinite)) bozuk++; });
    for (const a of M.avs) tara(a.root);
    for (const { v } of M.zs) tara(v.root);
    const bozukKok = [...M.avs.map((a) => a.root.position), ...M.zs.map(({ v }) => v.root.position)].filter((p) => ![p.x, p.y, p.z].every(Number.isFinite)).length;
    return { kemik: sayi, bozuk, bozukKok };
  });
  log('kemik denetimi', kemik);
  check(kemik && kemik.kemik > 100 && kemik.bozuk === 0 && kemik.bozukKok === 0, 'kemik dönüş/konumları ve kök konumları sayı olmalı (NaN yok)', kemik);
  log('tamam');
};
