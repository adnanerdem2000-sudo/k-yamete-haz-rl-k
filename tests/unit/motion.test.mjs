// Animasyon paketi (AnimPack) ve hareket denetleyicisi (Motion) birim testleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { encodePack, decodePack, packToClips } from '../../src/entities/AnimPack.js';
import { Motion } from '../../src/entities/Motion.js';
import { Avatar } from '../../src/entities/Avatar.js';
import { Pose, RIG_BONES } from '../../src/entities/CharacterRig.js';
import { Bots } from '../../src/systems/Bots.js';
import { wrapAngle } from '../../src/core/util.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('AnimPack: kodla-çöz gidiş dönüşü (nicemleme hatası sınırlı, anahtar zamanları doğru)', () => {
  const frames = [0, 3, 7, 12, 20];
  const q = [], p = [];
  for (const f of frames) {
    const e = new THREE.Quaternion().setFromEuler(new THREE.Euler(f * 0.05, f * -0.03, 0.2));
    q.push(e.x, e.y, e.z, e.w); p.push(f * 0.01, 0.9 - f * 0.002, -f * 0.004);
  }
  const pack = { bones: ['Hips', 'Body'], clips: [{ name: 'Test_Loop', duration: 20 / 30, fps: 30, frames: 21, loop: true, rm: [0, 0, 0], v: [0, 1.2], ph: 0.25, tracks: [{ bone: 0, q: true, frames, values: q }, { bone: 1, q: false, frames, values: p }, { bone: 0, q: true, frames: [0], values: [0, 0, 0, 1] }] }] };
  const back = decodePack(encodePack(pack));
  const c = back.clips[0];
  assert.equal(c.name, 'Test_Loop');
  assert.equal(c.loop, true);
  assert.equal(c.ph, 0.25);
  assert.deepEqual(Array.from(c.tracks[0].times, (t) => Math.round(t * 30)), frames);
  for (let i = 0; i < q.length; i++) assert.ok(Math.abs(c.tracks[0].values[i] - q[i]) < 1e-4, 'dörtlü ' + i);
  for (let i = 0; i < p.length; i++) assert.ok(Math.abs(c.tracks[1].values[i] - p[i]) < 2e-4, 'konum ' + i);
  assert.equal(c.tracks[2].times.length, 1);
});

test('AnimPack: oyundaki paketler açılır, temel klipler ve ölçümler mevcut', () => {
  for (const b of ['men', 'women']) {
    const buf = fs.readFileSync(path.join(root, `assets/models/rigged/anims_${b}.kan`));
    const pack = decodePack(new Uint8Array(zlib.gunzipSync(buf)));
    const clips = packToClips(pack, THREE);
    for (const n of ['Idle_Loop', 'Walk_Fwd_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop', 'Crawl_Fwd_Loop', 'Swim_Fwd_Loop', 'Climb_Up_Loop', 'Jump_Loop', 'Driving_Loop', 'Death01', 'Zombie_Walk_Fwd_Loop', 'Zombie_Scratch', 'PickUp_Kneeling', 'Fixing_Kneeling']) assert.ok(clips[n], `${b}: ${n} yok`);
    // ölçülen yürüyüş hızları makul (m/s) ve sıralı: yürüme < koşu < depar
    const sp = (n) => clips[n].userData.speed;
    assert.ok(sp('Walk_Fwd_Loop') > 0.7 && sp('Walk_Fwd_Loop') < 1.6, 'yürüme hızı ' + sp('Walk_Fwd_Loop'));
    assert.ok(sp('Jog_Fwd_Loop') > sp('Walk_Fwd_Loop') * 3, 'koşu hızı');
    assert.ok(sp('Sprint_Loop') > sp('Jog_Fwd_Loop'), 'depar hızı');
    // her klip tüm eşlenen kemikleri sürer (karışımda eksik kemik bağlama pozuna kaçmasın)
    const n0 = clips.Idle_Loop.tracks.length;
    for (const c of Object.values(clips)) assert.equal(c.tracks.length, n0, c.name);
  }
});

/** En küçük sahte karakter: Body + Hips + iki bacak kemiği; tek klip kütüphanesi */
function fakeChar() {
  const model = new THREE.Group();
  const body = new THREE.Bone(); body.name = 'Body'; body.position.set(0, 0.9, 0); model.add(body);
  const hips = new THREE.Bone(); hips.name = 'Hips'; body.add(hips);
  const mk = (name, dur, speed, ph, rotY) => {
    const c = new THREE.AnimationClip(name, dur, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, dur], [...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY).toArray(), ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY).toArray()]),
      new THREE.VectorKeyframeTrack('Body.position', [0, dur], [0, 0.9, 0, 0, 0.9, 0]),
    ]);
    c.userData = { loop: true, speed, ph, v: [0, speed] };
    return c;
  };
  const anim = {};
  for (const n of ['Idle_Loop', 'Idle_LookAround_Loop']) anim[n] = mk(n, 2, 0, 0, 0);
  anim.Idle_FoldArms_Loop = mk('Idle_FoldArms_Loop', 2.5, 0, 0, 0.7); // ayırt edilebilir kalça dönüşü
  ['Walk_Fwd_Loop', 'Walk_Fwd_L_Loop', 'Walk_L_Loop', 'Walk_Bwd_L_Loop', 'Walk_Bwd_Loop', 'Walk_Bwd_R_Loop', 'Walk_R_Loop', 'Walk_Fwd_R_Loop'].forEach((n, i) => { anim[n] = mk(n, 1.2, 1.0, 0.1, i * 0.1); });
  anim.Walk_Formal_Loop = mk('Walk_Formal_Loop', 1.2, 1.0, 0.1, 0.5); // Walk_Fwd ile eş süreli/eş fazlı
  ['Jog_Fwd_Loop', 'Jog_Fwd_L_Loop', 'Jog_Left_Loop', 'Jog_Bwd_L_Loop', 'Jog_Bwd_Loop', 'Jog_Bwd_R_Loop', 'Jog_Right_Loop', 'Jog_Fwd_R_Loop'].forEach((n) => { anim[n] = mk(n, 0.9, 5.0, 0.2, 1.0); });
  anim.Sprint_Loop = mk('Sprint_Loop', 0.7, 8, 0.1, 1.5);
  anim.Crouch_Idle_Loop = mk('Crouch_Idle_Loop', 2, 0, 0, 0.5);
  anim.Death01 = mk('Death01', 2, 0, 0, 2.5);
  return { model, anim };
}

test('Motion: 8 yön ağırlıkları komşu iki yöne paylaşılır, eksik yönler dağıtılır', () => {
  const m = new Motion(fakeChar());
  const set8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let d = m._dirs(Math.PI / 8, set8);
  assert.ok(Math.abs(d[0] - 0.5) < 1e-6 && Math.abs(d[1] - 0.5) < 1e-6);
  d = m._dirs(-Math.PI / 2, set8); // sağ = 6. dizin
  assert.ok(Math.abs(d[6] - 1) < 1e-6);
  const set4 = ['a', null, 'c', null, 'e', null, 'g', null];
  d = m._dirs(Math.PI / 4, set4); // çapraz → ileri ve sol yarı yarıya
  assert.ok(Math.abs(d[0] - 0.5) < 1e-6 && Math.abs(d[2] - 0.5) < 1e-6 && d[1] === 0);
});

test('Motion: faz hızı gerçek hıza göre ilerler (ayak kayması önleme) ve sınırlıdır', () => {
  const m = new Motion(fakeChar());
  m.phase.stand = 0;
  // 1 m/s yürüme: döngü mesafesi 1.0 m/s × 1.2 s = 1.2 m → 0.5 sn'de faz 0.5/1.2 ≈ 0.4167 ilerler
  for (let i = 0; i < 50; i++) m.update(0.01, { mode: 'ground', speed: 1.0, moveAngle: 0 });
  assert.ok(Math.abs(m.phase.stand - 0.5 / 1.2) < 0.02, 'faz ' + m.phase.stand);
  // çok yavaş hareket: oynatma alt sınırı (0.5 / süre)
  m.phase.stand = 0;
  for (let i = 0; i < 50; i++) m.update(0.01, { mode: 'ground', speed: 0.55, moveAngle: 0 });
  assert.ok(m.phase.stand >= 0.5 * 0.5 / 1.2 - 0.02, 'alt sınır ' + m.phase.stand);
});

test('Motion: durum geçişi yumuşak, tek seferlik klip bekler ve durdurulunca söner', () => {
  const ch = fakeChar();
  const m = new Motion(ch);
  m.update(0.016, { mode: 'ground', speed: 0 });
  m.update(0.016, { mode: 'crouch', speed: 0 });
  assert.ok(m.sw.crouch > 0 && m.sw.crouch < 1, 'eğilmeye geçiş kademeli');
  for (let i = 0; i < 60; i++) m.update(0.016, { mode: 'crouch', speed: 0 });
  assert.ok(m.sw.crouch > 0.99);
  const shot = m.play('Death01', { hold: true, group: 'death', fadeIn: 0.1 });
  for (let i = 0; i < 200; i++) m.update(0.016, { mode: 'ground', speed: 0 });
  assert.ok(m.playing('death') && shot.cur > 0.99 && Math.abs(shot.t - shot.to) < 1e-6, 'sonda bekler');
  const hips = ch.model.getObjectByName('Hips');
  const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.5);
  assert.ok(hips.quaternion.angleTo(want) < 1e-3, 'tam gövde klip pozu uygulanır');
  m.stop('death');
  for (let i = 0; i < 40; i++) m.update(0.016, { mode: 'ground', speed: 0 });
  assert.equal(m.shots.length, 0, 'durdurulan klip kaldırılır');
  assert.equal(m.play('Olmayan_Klip'), null);
});

test('Motion: gidip gelen döngü loopFrom…to aralığında kalır; durdurulunca çıkış klibi oynar, sonra söner', () => {
  const m = new Motion(fakeChar());
  // Death01 (2 sn): 0 → to (1,5 sn) ilerler, sonra 1,5 ↔ 0,5 sn arasında gidip gelir (başa sarmaz)
  const shot = m.play('Death01', { loop: true, loopFrom: 0.25, to: 0.75, pingpong: true, exitTo: 1, group: 'act', fadeIn: 0.1 });
  assert.ok(shot.pp && shot.lf === 0.5 && shot.to === 1.5 && shot.exitTo === 2, 'aralık sn cinsinden');
  let reached = false, minAfter = Infinity, maxT = -Infinity, flips = 0, dir = 1;
  for (let i = 0; i < 300; i++) {
    m.update(0.02, { mode: 'ground', speed: 0 });
    maxT = Math.max(maxT, shot.t);
    if (shot.dir !== dir) { flips++; dir = shot.dir; }
    if (shot.dir < 0) reached = true;
    if (reached) minAfter = Math.min(minAfter, shot.t);
  }
  assert.ok(reached && flips >= 4, 'uçlarda yön değiştirir: ' + flips);
  assert.ok(maxT <= 1.5 + 1e-6, 'to aşılmaz (ayağa kalkış döngüye girmez): ' + maxT);
  assert.ok(minAfter >= 0.5 - 1e-6, 'loopFrom altına inmez (diz çökme tekrarlanmaz): ' + minAfter);
  assert.ok(shot.cur > 0.99 && m.fullW > 0.99, 'döngü tam ağırlıkta');
  // durdurma: çıkış klibi aynı klibin to…exitTo kısmını '<grup>/exit' grubunda oynar, döngü çapraz sönümlenir
  const ex = m.stopShot(shot);
  assert.ok(ex && ex.group === 'act/exit' && ex.name === 'Death01' && ex.isExit, 'çıkış klibi');
  assert.ok(Math.abs(ex.t - 1.5) < 1e-6 && Math.abs(ex.to - 2) < 1e-6 && !ex.loop, 'çıkış to → exitTo');
  assert.ok(shot.out > 0 && m.stopShot(shot) === null, 'döngü söner; ikinci durdurma etkisiz');
  for (let i = 0; i < 15; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(!m.shots.includes(shot), 'döngü kaldırıldı');
  assert.ok(m.shots.includes(ex) && ex.cur > 0.5, 'çıkış oynuyor ' + ex.cur);
  for (let i = 0; i < 60; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.equal(m.shots.length, 0, 'çıkış bitince kaldırılır');
  // düz döngü loopFrom'a sarar; exit = false (yürürken / yeni eylem gelince): çıkış klibi yok
  const s2 = m.play('Death01', { loop: true, loopFrom: 0.25, to: 0.75, exitTo: 1, group: 'act' });
  for (let i = 0; i < 100; i++) { m.update(0.02, { mode: 'ground', speed: 0 }); assert.ok(s2.t <= 1.5 + 1e-6 && (i < 75 || s2.t >= 0.5 - 1e-6), 'düz döngü aralıkta: ' + s2.t); }
  assert.equal(m.stopShot(s2, false), null, 'exit = false: çıkış yok');
  assert.ok(!m.shots.some((x) => x.isExit), 'çıkış klibi oluşmadı');
  // stopExits: süren çıkış klibini keser (yürümeye başlayınca)
  const ex3 = m.stopShot(m.play('Death01', { loop: true, to: 0.75, exitTo: 1, group: 'act' }));
  m.stopExits();
  assert.ok(ex3 && ex3.out > 0, 'stopExits çıkışı söndürür');
  // döngü aralığına varmadan (t < loopFrom: diz çökme sürerken, erken bırakılan arama) durdurma: çıkış yok, klip yalnız
  // söner — ayaktaki karakter çıkış için diz çöküp yeniden kalkmasın; aralığa varınca çıkış oynar
  const early = m.play('Death01', { loop: true, loopFrom: 0.25, to: 0.75, pingpong: true, exitTo: 1, group: 'act' });
  m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(early.t < early.lf, 'giriş sürüyor');
  assert.equal(m.stopShot(early), null, 'döngü aralığına varmadan çıkış klibi yok');
  assert.ok(early.out > 0 && !m.shots.some((x) => x.isExit && !x.out), 'döngü yalnız söner');
  const ranged = m.play('Death01', { loop: true, loopFrom: 0.25, to: 0.75, pingpong: true, exitTo: 1, group: 'act' });
  for (let i = 0; i < 30; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(ranged.t >= ranged.lf && m.stopShot(ranged) !== null, 'aralığa varınca çıkış oynar');
});

test('Motion: kendi bekleme zamanlayıcısı yok; setIdleVariant çeşidi oynatır, null kişiliğin beklemesine döner', () => {
  const ch = fakeChar();
  const m = new Motion(ch);
  const hips = ch.model.getObjectByName('Hips');
  const yaw = () => 2 * Math.atan2(hips.quaternion.y, hips.quaternion.w);
  // 60 sn ayakta bekleme: istenen bekleme hiç değişmez (eskiden Motion 6–17 sn'de bir kendi çeşidine geçiyordu)
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { m.update(0.02, { mode: 'ground', speed: 0 }); seen.add(m.idle.cur); }
  assert.equal(m.idle.cur, m.persona.idle);
  assert.deepEqual([...seen], [m.persona.idle], 'zamanlayıcı yok: ' + [...seen]);
  assert.ok(Math.abs(yaw()) < 1e-3, 'kişiliğin beklemesi oynuyor');
  // kıpırdanma çeşidi (Avatar.updateFidget seçer): 0,6 sn çapraz sönüm, sonra tam ağırlık
  m.setIdleVariant('Idle_FoldArms_Loop');
  m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.cur === 'Idle_FoldArms_Loop' && m.idle.x > 0 && m.idle.x < 0.2, 'geçiş başladı ' + m.idle.x);
  for (let i = 0; i < 40; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.cur === 'Idle_FoldArms_Loop' && m.idle.x === 1, 'çeşit tam ağırlıkta ' + m.idle.x);
  assert.ok(Math.abs(yaw() - 0.7) < 1e-3, 'çeşidin pozu uygulanır ' + yaw());
  // aynı çeşit sürerken de zamanlayıcı yok; null → kişiliğin beklemesi
  for (let i = 0; i < 1000; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.equal(m.idle.cur, 'Idle_FoldArms_Loop');
  m.setIdleVariant(null);
  for (let i = 0; i < 40; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.cur === m.persona.idle && m.idle.x === 1 && Math.abs(yaw()) < 1e-3, 'kişiliğin beklemesine döndü');
  // art arda değişim (geçiş bitmeden üçüncü bekleme): yarım kalan geçiş kesilmez, üçü birlikte sönümlenir (sıçrama yok)
  m.setIdleVariant('Idle_FoldArms_Loop');
  for (let i = 0; i < 10; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  const fold = m.idle.w.get('Idle_FoldArms_Loop').w;
  m.setIdleVariant('Idle_LookAround_Loop');
  m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.w.size === 3 && Math.abs(m.idle.w.get('Idle_FoldArms_Loop').w - (fold - 0.02 / 0.6)) < 1e-9, 'üç bekleme birlikte sönümleniyor ' + m.idle.w.size);
});

test('Motion: yürüyüşle biten kıpırdanma çeşidi bir sonraki duruşta yeniden belirmez (bekleme haritası yürürken de söner)', () => {
  const ch = fakeChar();
  const m = new Motion(ch);
  const hips = ch.model.getObjectByName('Hips');
  const yaw = () => 2 * Math.atan2(hips.quaternion.y, hips.quaternion.w);
  for (let i = 0; i < 20; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  m.setIdleVariant('Idle_FoldArms_Loop');
  for (let i = 0; i < 50; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.x === 1 && Math.abs(yaw() - 0.7) < 1e-3, 'kollarını kavuşturuyor');
  // yürümeye başlar → kıpırdanma biter (Avatar.endFidget → setIdleVariant(null)); 1 sn yürür, sonra durur
  for (let i = 0; i < 5; i++) m.update(0.02, { mode: 'ground', speed: 1.5 });
  m.setIdleVariant(null);
  for (let i = 0; i < 50; i++) m.update(0.02, { mode: 'ground', speed: 1.5 });
  assert.deepEqual([...m.idle.w.keys()], [m.persona.idle], 'çeşit yürürken söndü');
  m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(Math.abs(yaw()) < 1e-3, 'durunca kollarını kavuşturma pozu yeniden belirmez: ' + yaw());
});

test('Motion: kişilik — kollarını kavuşturan bekleme elde eşya varken serbest beklemeye döner; karışık yürüyüş iki klibi birlikte oynar', () => {
  const ch = fakeChar();
  const m = new Motion(ch, { persona: 'confident' });
  assert.equal(m.persona.idle, 'Idle_FoldArms_Loop');
  for (let i = 0; i < 40; i++) m.update(0.02, { mode: 'ground', speed: 0, busy: true });
  assert.ok(m.idle.cur === 'Idle_Loop' && m.idle.x === 1, 'elde eşya: idleFree');
  for (let i = 0; i < 40; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(m.idle.cur === 'Idle_FoldArms_Loop' && m.idle.x === 1, 'eller boş: kişiliğin beklemesi');
  // gözcü: ileri yürüyüş Walk_Fwd (0,4) + Walk_Formal (0,6) karışımı → kalça dönüşü ağırlıklı ortalama (0 ile 0,5 arası)
  const ch2 = fakeChar();
  const w = new Motion(ch2, { persona: 'observer' });
  for (let i = 0; i < 60; i++) w.update(0.02, { mode: 'ground', speed: 1.0, moveAngle: 0 });
  const hq = ch2.model.getObjectByName('Hips').quaternion, ang = 2 * Math.atan2(hq.y, hq.w);
  assert.ok(Math.abs(ang - 0.3) < 0.03, 'karışık yürüyüş ' + ang);
  // altı ana karakterin temel beklemesi ve yürüyüşü (klip/karışım + tempo) birbirinden farklı
  const P = ['relaxed', 'agile', 'confident', 'observer', 'heavy', 'calm'].map((p) => new Motion(fakeChar(), { persona: p }).persona);
  assert.equal(new Set(P.map((q) => JSON.stringify(q.idle))).size, 6, 'bekleme ayrışmalı');
  assert.equal(new Set(P.map((q) => JSON.stringify([q.walk, q.rate || 1]))).size, 6, 'yürüyüş ayrışmalı');
  assert.ok(P.every((q) => (q.rate || 1) >= 0.92 && (q.rate || 1) <= 1.08), 'tempo ±%8 içinde (ayak kayması)');
});

test("Motion: 'lower' maskesi kalçayı, bacakları ve IK ayaklarını (konum dahil) yazar, kollara dokunmaz; tam/üst ağırlığa sayılmaz", () => {
  const model = new THREE.Group();
  const mkBone = (name, parent) => { const b = new THREE.Bone(); b.name = name; parent.add(b); return b; };
  const body = mkBone('Body', model); body.position.set(0, 0.9, 0);
  const hips = mkBone('Hips', body), chest = mkBone('Chest', hips), arm = mkBone('UpperArmL', chest), leg = mkBone('UpperLegL', hips);
  const foot = mkBone('FootL', model); // gerçek iskelette olduğu gibi kökün çocuğu (IK ayağı, konumla sürülür)
  const qY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).toArray();
  const qX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a).toArray();
  const mk = (name, dur, hipsY, armX, footP, loop) => {
    const c = new THREE.AnimationClip(name, dur, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, dur], [...qY(hipsY), ...qY(hipsY)]),
      new THREE.QuaternionKeyframeTrack('UpperArmL.quaternion', [0, dur], [...qX(armX), ...qX(armX)]),
      new THREE.QuaternionKeyframeTrack('UpperLegL.quaternion', [0, dur], [...qX(armX * 0.5), ...qX(armX * 0.5)]),
      new THREE.VectorKeyframeTrack('Body.position', [0, dur], [0, 0.9, 0, 0, 0.9, 0]),
      new THREE.VectorKeyframeTrack('FootL.position', [0, dur], [...footP, ...footP]),
    ]);
    c.userData = { loop, speed: 0, ph: 0 };
    return c;
  };
  const anim = { Idle_Loop: mk('Idle_Loop', 2, 0, 0, [0.1, 0.05, 0.2], true), Turn90_L: mk('Turn90_L', 2, 0.4, 1.0, [0.3, 0.1, -0.1], false) };
  void chest; void leg;
  const m = new Motion({ model, anim });
  m.update(0.02, { mode: 'ground', speed: 0 });
  const shot = m.play('Turn90_L', { mask: 'lower', group: 'turn', fadeIn: 0.001, dur: 1 });
  for (let i = 0; i < 5; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(shot.pos && !shot.full, 'konum izleri yazılır');
  assert.ok(foot.position.distanceTo(new THREE.Vector3(0.3, 0.1, -0.1)) < 1e-4, 'IK ayağı klipten: ' + foot.position.toArray());
  assert.ok(hips.quaternion.angleTo(new THREE.Quaternion().fromArray(qY(0.4))) < 1e-3, 'kalça klipten');
  assert.ok(arm.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'kol bekleme pozunda kalır');
  assert.ok(m.fullW === 0 && m.upperW === 0 && m.lowerW > 0.99, `ağırlıklar ${m.fullW} ${m.upperW} ${m.lowerW}`);
  // soft tam gövde klibi (depardan duruş adımı): pozu yazar ama tam gövde ağırlığına sayılmaz (tutuşlar geri çekilmez)
  m.stop('turn');
  const soft = m.play('Turn90_L', { mask: 'full', group: 'stopstep', w: 0.4, fadeIn: 0.001, dur: 1, soft: true });
  for (let i = 0; i < 20; i++) m.update(0.02, { mode: 'ground', speed: 0 });
  assert.ok(soft.cur > 0.39 && m.fullW === 0 && arm.quaternion.angleTo(new THREE.Quaternion()) > 0.3, `soft ${soft.cur} ${m.fullW}`);
});

/**
 * Eylem katmanı testleri için gövdesiz avatar: gerçek Avatar yöntemleri (play/playMotion/resolveKind/endMotionAct,
 * kıpırdanma), sahte karakterin Motion'ı ve eylem klipleri (adlar oyundaki paketle aynı). speed: yumuşatılmış hız
 * (m/sn); opts: Avatar seçenekleri (remote…); persona: Motion kişiliği.
 */
function actor(speed = 0, opts = {}, persona = undefined) {
  const ch = fakeChar();
  const clip = (n, dur) => {
    const c = new THREE.AnimationClip(n, dur, [new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0, 1]), new THREE.VectorKeyframeTrack('Body.position', [0, dur], [0, 0.5, 0, 0, 0.5, 0])]);
    c.userData = {};
    return c;
  };
  for (const [n, d] of [['Fixing_Kneeling', 5.2], ['Chest_Open', 1.37], ['Interact', 2], ['PickUp_Kneeling', 1.93], ['PickUp_Table', 0.83], ['Celebration', 4], ['Bandage_Loop', 0.67],
    ['Fish_Cast', 1.83], ['Fish_Cast_Idle_Loop', 2.33], ['Fish_Reel', 2.3], ['Punch_Jab', 0.87], ['Punch_Cross', 1], ['Sword_Regular_A', 1], ['Sword_Regular_B', 1], ['Hit_Stomach', 0.67],
    ['Hit_Knockback', 0.83], ['KipUp', 1.17], ['Jump_Land', 1.27], ['Idle_TalkingPhone_Loop', 2.93]]) ch.anim[n] = clip(n, d);
  const av = Object.create(Avatar.prototype);
  Object.assign(av, { game: {}, opts, motion: new Motion(ch, { persona }), t: 0, speedSm: speed, heldId: null, holdKind: null, action: null, _mAct: null, overlays: [], _mode: 'ground', _dead: false, _sleep: false });
  return av;
}
const live = (av) => av.motion.shots.filter((x) => !x.out).map((x) => x.group + ':' + x.name);

test('Avatar eylem katmanı: başka gruptaki yeni eylem eskisini ve devam klibini söndürür (yetim döngü kalmaz)', () => {
  const av = actor();
  av.play('search', 4, 'low');
  assert.deepEqual(live(av), ['act:Fixing_Kneeling']);
  av.play('cheer', 2.4); // 'emote' grubu: eskiden arama döngüsü durdurulmadan kalıyordu
  assert.deepEqual(live(av), ['emote:Celebration'], 'ifadeyle değişen arama klibi sönmeli');
  assert.ok(av.action.type === 'cheer' && av._mAct === av.action);
  // olta: atış kendi hızında (eylem süresine yayılmaz), devam klibi ('act2') yeni eylemle söner
  av.play('fish', 6);
  assert.ok(Math.abs(av.action.shot.rate - 1.83 / 1.8) < 1e-6 && av.action.dur === 6, 'atış ~1,8 sn, eylem 6 sn');
  av.action.next = av.motion.play('Fish_Cast_Idle_Loop', { loop: true, group: 'act2' });
  av.play('bandage', 3);
  assert.deepEqual(live(av), ['act:Bandage_Loop'], 'olta bekleme döngüsü sönmeli');
  // klibi olmayan (prosedürel) eylem de süren klip eylemini bitirir; gülme yansıtılır
  av.play('search', 4);
  av.play('laugh', 2);
  assert.deepEqual(live(av), []);
  assert.ok(av.action.type === 'laugh' && !av.action.motion && av._mAct === null);
  assert.equal(av.lastAct[1], 'laugh');
  // ağdan durdurma: dururken diz çökme döngüsü ayağa kalkma çıkışıyla biter (diz çökme bittiyse: döngü aralığında)
  av.play('search', 4, 'low');
  for (let i = 0; i < 50; i++) av.motion.update(0.02, { mode: 'ground', speed: 0 }); // 1 sn: loopFrom 0,13 × 5,2 sn geçildi
  av.play('stop', 0, null, 0.05, 99);
  assert.deepEqual(live(av), ['act/exit:Fixing_Kneeling']);
  assert.equal(av.action, null);
  // hemen bırakılan arama (E'ye dokunup bırakma; diz çökme sürerken): çıkış yok, döngü yalnız söner (eskiden ayaktaki
  // karakter çıkış klibiyle yarı diz çöküp yeniden kalkıyordu)
  const tap = actor();
  tap.play('search', 4, 'low');
  tap.play('stop', 0, null, 0.05, 100);
  assert.deepEqual(live(tap), [], 'giriş sürerken durdurma: çıkış klibi yok');
});

test('Avatar eylem çeşidi gönderende çözülür, uzak avatar aynen oynar; yumruk sırası ve isabet klibi ağdan', () => {
  const walker = actor(2); // yürüyor: yerden alma yerine masadan alma çeşidi
  walker.play('pickup', 0.5);
  assert.equal(walker.lastAct[3], 'table');
  assert.deepEqual(live(walker), ['act:PickUp_Table']);
  assert.ok(Math.abs(walker.action.dur - 0.95) < 1e-9, 'çeşit, temel türün en kısa süresini (minDur) devralır');
  const still = actor(0);
  still.play('pickup', 0.5);
  assert.equal(still.lastAct[3], null);
  assert.deepEqual(live(still), ['act:PickUp_Kneeling']);
  // uzak avatar dururken de gönderenin çeşidini oynar (kendi hızına bakmaz) ve eylemi yeniden yansıtmaz
  const remote = actor(0);
  remote.play(walker.lastAct[1], walker.lastAct[2], walker.lastAct[3], 0.1, walker.lastAct[0]);
  assert.deepEqual(live(remote), ['act:PickUp_Table']);
  assert.equal(remote.lastAct, undefined);
  // kapaklı sandık: tam gövde döngü; hareket halinde gönderen yüksek uzanmaya çevirir; koşarken iniş klibi yok
  const a = actor(0);
  a.play('search', 3, 'chest');
  assert.deepEqual(live(a), ['act:Chest_Open']);
  assert.ok(a.action.full && a.action.loopish && a.action.shot.pp, 'gidip gelen tam gövde döngü');
  const runner = actor(4);
  runner.play('search', 3, 'chest');
  assert.equal(runner.lastAct[3], 'high');
  assert.deepEqual(live(runner), ['act:Interact']);
  runner.play('land', 0.25);
  assert.equal(runner.lastAct[3], 'skip');
  assert.deepEqual(live(runner), ['act:Interact'], 'iniş klibi oynamaz, arama sürer');
  // yumruk sırası gönderenin vuruş sayacından (act[4]; tek: sol direkt, çift: sağ kroşe), sıra numarasından değil — geç
  // katılan da aynısını görür
  const r2 = actor(0);
  r2.play('melee', 0.55, null, 0.02, 7, 2);
  assert.deepEqual(live(r2), ['attack:Punch_Cross'], 'çift vuruş sayacı: kroşe (sıra numarası tek olsa da)');
  r2.play('melee', 0.55, null, 0.02, 8, 3);
  assert.deepEqual(live(r2), ['attack:Punch_Jab']);
  // isabet tepkisi: eylem yuvasına yazılmaz (süren aramayı uzakta ezmez), kendi sayacıyla [sayaç, dizin] gider; süren
  // eylemi bölmez
  const h = actor(0);
  h.play('search', 4);
  const searchAct = h.lastAct;
  h.play('hit', 0.45, 2);
  assert.equal(h.lastAct, searchAct, 'isabet eylem yuvasını değiştirmez');
  assert.deepEqual(h.lastHit, [1, 2]);
  assert.ok(live(h).includes('hit:Hit_Stomach') && live(h).includes('act:Fixing_Kneeling'));
  h.play('hit', 0.45, 2);
  assert.deepEqual(h.lastHit, [2, 2], 'her isabette sayaç artar');
});

test('Avatar kıpırdanma: tek zamanlayıcı sahibinde; tür eylemle yansır, uzak avatar aynısını oynar ama hiç zamanlamaz', () => {
  const pu = new Pose(), setMask = () => {};
  const tick = (av, dt = 0.1) => av.updateFidget(dt, { mode: 'ground' }, 'ground', 0, false, null, setMask, pu, av.motion);
  // sahibi: süre dolunca kişilik havuzundan tür seçer ve 'fidget' eylemiyle yazar (ağda act)
  const own = actor(0, {}, 'calm');
  tick(own);
  own.fidget.next = 0.05;
  tick(own);
  const k = own.fidget.kind;
  assert.ok(['watch', 'radio', 'lookAround'].includes(k), 'kişilik havuzundan: ' + k);
  assert.deepEqual(own.lastAct.slice(1, 4), ['fidget', own.fidget.dur, k]);
  // klip türü Motion'a bekleme çeşidi olarak gider; bitince geri alınır
  own.startFidget('foldArms', 3.2);
  assert.ok(own.fidget.kind === 'foldArms' && own.motion.variant === 'Idle_FoldArms_Loop');
  own.endFidget();
  assert.equal(own.motion.variant, null);
  // uzak avatar: gelen tür ağdaki geçen süreyle başlar, yeniden yansıtılmaz; kendisi asla seçmez
  own.play('fidget', 3.2, 'foldArms');
  const act = own.lastAct.slice();
  const r = actor(0, { remote: true }, 'calm');
  r.play(act[1], act[2], act[3], 0.1, act[0]);
  assert.ok(r.fidget.kind === 'foldArms' && Math.abs(r.fidget.t - 0.1) < 1e-9 && r.fidget.dur === 3.2 && r.motion.variant === 'Idle_FoldArms_Loop');
  assert.equal(r.lastAct, undefined, 'uzak avatar yansıtmaz');
  r.endFidget();
  for (let i = 0; i < 400; i++) tick(r);
  assert.equal(r.fidget.kind, null, 'uzak avatar zamanlamaz');
  // bitmiş kıpırdanma geç katılana oynatılmaz
  const late = actor(0, { remote: true });
  late.play('fidget', 3, 'stretch', 3.5, 9);
  assert.ok(!late.fidget || late.fidget.kind === null);
  // elde eşya: kolu meşgul eden tür seçilmez; aletli tür esnemeye döner
  const held = actor(0, {}, 'heavy');
  held.heldId = 'bat';
  for (let i = 0; i < 200; i++) assert.notEqual(held.pickFidget(), 'foldArms');
  held.startFidget('tinker');
  assert.equal(held.fidget.kind, 'stretch');
  // gece feneri gündüz seçilmez (oturum yok → gündüz)
  const ag = actor(0, {}, 'agile');
  for (let i = 0; i < 200; i++) assert.notEqual(ag.pickFidget(), 'lantern');
  // saate bakma yalnız kol saati takan karakterde (sakin kişilik: Ceren'in aksesuarı steteskop → saatsiz bileğe bakmaz)
  const calm = actor(0, {}, 'calm');
  calm.ch = { look: { accessory: 'stethoscope' } };
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(calm.pickFidget());
  assert.ok(!seen.has('watch') && seen.has('radio') && seen.has('lookAround'), `saatsiz sakin karakter: ${[...seen]}`);
  calm.ch.look.accessory = 'watch';
  let watch = 0;
  for (let i = 0; i < 300; i++) if (calm.pickFidget() === 'watch') watch++;
  assert.ok(watch > 60, `saat takan sakin karakter saate bakmalı (${watch}/300)`);
});

test('Avatar kıpırdanma: bot vekili türü anlık görüntüden alır (yükselen kenarda başlar, düşen kenarda kısa sönümle biter)', () => {
  const p = actor(0, { remote: true });
  p._calm = true;
  p.netFidget('radio');
  assert.ok(p.fidget.kind === 'radio' && p.fidget.dur === 60 && p.motion.variant === 'Idle_TalkingPhone_Loop');
  p.fidget.t = 1.2;
  p.netFidget('radio'); // aynı tür: yeniden başlamaz
  assert.equal(p.fidget.t, 1.2);
  p.netFidget(null);
  assert.ok(Math.abs(p.fidget.dur - 1.55) < 1e-9, 'sönümle bitiş');
  const busy = actor(0, { remote: true });
  busy._calm = false; // hareket halindeyken gelen tür başlatılmaz (titreme yok)
  busy.netFidget('stretch');
  assert.ok(!busy.fidget || !busy.fidget.kind);
});

test('Avatar yere serilme ve sert iniş: klipler, süre ve yansıtma', () => {
  const av = actor(0);
  av.play('search', 4, 'low');
  av.play('knock', 1.95);
  assert.deepEqual(live(av), ['act:Hit_Knockback'], 'serilme süren eylemin yerini alır');
  assert.ok(av.action.type === 'knock' && av.action.dur === 1.95 && av.action.then && av.action.then.clip === 'KipUp' && av.action.then.at === 1.0);
  assert.ok(av.action.shot.hold && Math.abs((av.action.shot.to - av.action.shot.from) / av.action.shot.rate - 0.75) < 1e-6, 'düşüş 0,75 sn, sonra yerde bekler');
  assert.deepEqual(av.lastAct.slice(1, 3), ['knock', 1.95]);
  // sert iniş: dururken derin çömelme (0,8 sn); koşarken klip yok
  const st = actor(0);
  st.play('land', 0.8, 'hard');
  assert.ok(live(st).includes('move:Jump_Land') && st.lastAct[3] === 'hard');
  const sh = st.motion.shots.find((x) => x.name === 'Jump_Land');
  assert.ok(Math.abs((sh.to - sh.from) / sh.rate - 0.8) < 1e-6 && sh.to / sh.s.dur > 0.85, 'uzun iniş aralığı');
  const run = actor(3);
  run.play('land', 0.8, 'hard');
  assert.equal(run.lastAct[3], 'skip');
  assert.deepEqual(live(run), []);
});

// ---- gerçek klip paketiyle (erkek) avatar: çıplak iskelet + gerçek Avatar.update/updateMotion (rig ve ayak IK'sı taklit)
let _menClips = null;
const menClips = () => _menClips || (_menClips = packToClips(decodePack(new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(root, 'assets/models/rigged/anims_men.kan'))))), THREE));
function realAvatar(opts = {}, persona = undefined) {
  const model = new THREE.Group(), B = {};
  const mk = (n, p) => { const b = new THREE.Bone(); b.name = n; (p ? B[p] : model).add(b); B[n] = b; };
  mk('Body'); mk('Hips', 'Body'); mk('Abdomen', 'Hips'); mk('Torso', 'Abdomen'); mk('Chest', 'Torso'); mk('Neck', 'Chest'); mk('Head', 'Neck');
  for (const s of ['L', 'R']) { mk('Shoulder' + s, 'Chest'); mk('UpperArm' + s, 'Shoulder' + s); mk('LowerArm' + s, 'UpperArm' + s); mk('Wrist' + s, 'LowerArm' + s); mk('UpperLeg' + s, 'Body'); mk('LowerLeg' + s, 'UpperLeg' + s); mk('Foot' + s); }
  // restData.entries[0]: kalça dinlenme konumu (sürüş/koltukta kalçayı koltuğa hizalamak için okunur)
  const rig = { apply() {}, setArmIK() {}, restData: { entries: [{ wpos: new THREE.Vector3(0, 0.9, 0) }] }, list: [], autoGround: false, hipY: null };
  const ch = { model, anim: menClips(), rig, anchors: {}, look: { persona } };
  const rootG = new THREE.Group(); rootG.add(model);
  const av = Object.create(Avatar.prototype);
  Object.assign(av, {
    game: {}, opts, ch, rig, root: rootG, motion: new Motion(ch, { persona }), footIK: null, pose: new Pose(), tmp: new Pose(), pu: new Pose(),
    weights: new Float32Array(RIG_BONES.length), phase: 0, cycle: 0, t: 0, speedSm: 0, angSm: 0, lean: 0, blend: { full: 0, crouch: 0, air: 0, aim: 0, hold: 0 },
    heldId: null, heldObj: null, holdKind: null, flashlight: null, action: null, yaw: 0, visYaw: 0, lastYaw: 0, pitch: 0, overlays: [], _dead: false, _sleep: false, _emote: null, later: [],
  });
  av.fidget = { kind: null, t: 0, dur: 0, next: 1e9, prop: null, last: null }; // kendiliğinden kıpırdanma yok
  return { av, M: av.motion, B };
}
const DT = 1 / 60, STILL = { mode: 'ground', speed: 0, yaw: 0 };
const wire = (o) => JSON.parse(JSON.stringify(o)); // ağ (JSON) gidiş-dönüşü

test('Avatar yere serilme (gerçek klipler): kalkışın sonunda yeniden sırtüstü düşmez (yerelde ve geç başlayan uzakta)', () => {
  for (const off of [0, 0.5]) {
    const { av, B, M } = realAvatar({ player: true, remote: off > 0 });
    for (let i = 0; i < 30; i++) av.update(DT, STILL);
    if (off) av.play('knock', 1.95, null, off, 7); else av.play('knock', 1.95);
    let t = off, minLying = 9, minEnd = 9;
    while (t < 2.4) {
      av.update(DT, STILL);
      t += DT;
      const y = B.Body.position.y;
      if (t > 0.6 && t < 0.95) minLying = Math.min(minLying, y);
      // KipUp'ın son sönümü (1,75–1,95 sn): eskiden alttaki yatış pozu yeniden görünüyor, kalça 0,03 m'ye iniyordu
      if (t >= 1.75 && t <= 1.95) minEnd = Math.min(minEnd, y);
    }
    if (!off) assert.ok(minLying < 0.15, 'yerde yatar: ' + minLying);
    assert.ok(minEnd > 0.6, `kalkış sonunda kalça ayakta kalmalı (off ${off}): ${minEnd.toFixed(3)} m`);
    assert.ok(av.action === null && !M.shots.some((x) => !x.out && (x.name === 'Hit_Knockback' || x.name === 'KipUp')), 'serilme bitti');
  }
});

test('Avatar yere serilme (gerçek klipler): yaralı düşen, taşınan, yüzen, sürüşteki, uyuyan kalkış klibi oynamaz; havada kesilmez', () => {
  // 0,5 sn'de yaralı düştü (ikinci zombi): serilme çıkışsız biter, KipUp hiç başlamaz, kalça yaralı pozunda kalır (eskiden
  // 1 sn'de ayağa sıçrayıp 2 sn'de yeniden çöküyordu). Kip ağda gittiği için uzak avatar da aynı kuralla biter; durdurma yazılmaz
  for (const remote of [false, true]) {
    const { av, B, M } = realAvatar({ player: true, remote });
    for (let i = 0; i < 30; i++) av.update(DT, STILL);
    if (remote) av.play('knock', 1.95, null, 0.02, 3); else av.play('knock', 1.95);
    const act0 = av.lastAct;
    let kip = false, maxHip = 0;
    for (let t = 0; t < 2.4; t += DT) {
      av.update(DT, { ...STILL, mode: t > 0.5 ? 'downed' : 'ground' });
      if (M.shots.some((x) => x.name === 'KipUp')) kip = true;
      if (t > 0.9) maxHip = Math.max(maxHip, B.Body.position.y);
    }
    assert.ok(!kip && av.action === null, `yaralıyken kalkış klibi oynamamalı (uzak: ${remote})`);
    assert.ok(maxHip < 0.3, 'yaralı pozunda kalmalı: ' + maxHip.toFixed(3));
    assert.equal(av.lastAct, act0, 'durdurma yazılmaz (kip ağda gider)');
  }
  for (const mode of ['carried', 'swim', 'drive', 'sleep', 'air']) {
    const { av, M } = realAvatar({ player: true });
    for (let i = 0; i < 30; i++) av.update(DT, STILL);
    av.play('knock', 1.95);
    let kip = false, actAt06 = null;
    for (let i = 0; i < 96; i++) {
      const t = i * DT;
      // hava: hücum itişi kurbanı kısa süre kaldırır (0,3–0,5 sn), sonra yere iner; diğer kipler sürer
      av.update(DT, { ...STILL, mode: t > 0.3 && (mode !== 'air' || t < 0.5) ? mode : 'ground' });
      if (M.shots.some((x) => x.name === 'KipUp')) kip = true;
      if (i === 36) actAt06 = av.action && av.action.type;
    }
    if (mode === 'air') assert.ok(actAt06 === 'knock' && kip, 'havada serilme sürer, kalkış oynar');
    else assert.ok(actAt06 === null && !kip, `${mode}: serilme biter, kalkış oynamaz`);
  }
});

test('Avatar yerinde dönüş (gerçek klipler): dönüş bitince yan adım yürüyüşüne geçmez', () => {
  for (const target of [Math.PI / 2, Math.PI * 0.95]) {
    const { av, M } = realAvatar({}); // bot/NPC avatarı (oyuncu değil): yerinde dönüş açık
    for (let i = 0; i < 60; i++) av.update(DT, STILL);
    let prev = M.phase.stand, side = 0, turned = false;
    for (let i = 0; i < 80; i++) {
      av.update(DT, { ...STILL, yaw: target });
      if (av.turn) turned = true;
      // dururken yürüme fazı yalnız yan adımda ilerler: dönüş tanıtıcısı bittikten sonra ilerlememeli (eskiden 6 kare)
      if (!av.turn && Math.abs(M.phase.stand - prev) > 1e-9) side++;
      prev = M.phase.stand;
    }
    assert.ok(turned, 'dönüş klibi oynadı');
    assert.equal(side, 0, `dönüş sonrası yan adım karesi olmamalı (hedef ${target.toFixed(2)})`);
    assert.ok(Math.abs(wrapAngle(av.visYaw - target)) < 0.02, 'hedefe oturur');
  }
});

test('Avatar yerinde dönüş (gerçek klipler): hedef ±π dikişini geçince kök sıçramaz, sarılmadan izlenir', () => {
  // hedef başlangıç yönünün tam arkasında yavaşça kayıp ±π dikişini geçer (yakındaki zombiyi izleyen bot)
  const { av } = realAvatar({});
  for (let i = 0; i < 30; i++) av.update(DT, STILL);
  let prev = av.visYaw, maxJump = 0, yawT = 0;
  for (let i = 0; i < 70; i++) {
    yawT = 3.1 + i * 0.002;
    av.update(DT, { ...STILL, yaw: yawT });
    maxJump = Math.max(maxJump, Math.abs(wrapAngle(av.visYaw - prev)));
    prev = av.visYaw;
  }
  assert.ok(maxJump < 0.2, 'kök bir karede sıçramamalı (eskiden 2,1 rad): ' + maxJump.toFixed(3));
  assert.ok(Math.abs(wrapAngle(av.visYaw - yawT)) < 0.05, 'hedefe oturur');
});

test('Avatar sert iniş (gerçek klipler): kilit bitip koşmaya başlayınca iniş klibi kesilir, dururken sonuna dek oynar', () => {
  // yerel ve uzak (hız ağdan): 0,3 sn kilit, sonra koşu
  for (const remote of [false, true]) {
    const { av, M } = realAvatar({ player: true, remote });
    for (let i = 0; i < 30; i++) av.update(DT, STILL);
    if (remote) av.play('land', 0.8, 'hard', 0.02, 4); else av.play('land', 0.8, 'hard');
    let full05 = null;
    for (let i = 0; i <= 36; i++) {
      const t = i * DT;
      av.update(DT, { ...STILL, speed: t < 0.3 ? 0 : Math.min(4.3, (t - 0.3) * 30) });
      if (i === 30) full05 = M.fullW;
    }
    assert.ok(full05 < 0.6, `0,5 sn'de koşarken tam gövde iniş pozu sönmeli (eskiden 1,0): ${full05.toFixed(2)} (uzak: ${remote})`);
  }
  const { av, M } = realAvatar({ player: true });
  for (let i = 0; i < 30; i++) av.update(DT, STILL);
  av.play('land', 0.8, 'hard');
  for (let i = 0; i <= 30; i++) av.update(DT, STILL);
  assert.ok(M.fullW > 0.9 && M.shots.some((x) => x.name === 'Jump_Land' && !x.out), 'dururken iniş sürer: ' + M.fullW);
});

test('Avatar kıpırdanma: elde eşya belirince kolu meşgul eden / aletli kıpırdanma biter (uzakta da), diğeri sürer', () => {
  const pu = new Pose(), setMask = () => {};
  const tick = (av) => av.updateFidget(0.1, { mode: 'ground' }, 'ground', 0, false, null, setMask, pu, av.motion);
  for (const opts of [{}, { remote: true }]) {
    const fa = actor(0, opts, 'heavy');
    fa.startFidget('foldArms', 7.5);
    tick(fa);
    assert.ok(fa.fidget.kind === 'foldArms' && fa.motion.variant === 'Idle_FoldArms_Loop');
    fa.heldId = 'bat'; // Session.selectHotbar → avatar.hold (uzakta 'held' iletisi / anlık görüntü)
    tick(fa);
    assert.ok(fa.fidget.kind === null && fa.motion.variant === null, 'silah çekince kollar çözülmeli (eskiden 5–8 sn sürüyordu)');
    const tk = actor(0, opts, 'relaxed');
    tk.startFidget('tinker', 3.5);
    tk.heldId = 'pipe';
    tick(tk);
    assert.equal(tk.fidget.kind, null, 'aletli kıpırdanma eldeki eşyayla sürmez');
    const st = actor(0, opts, 'heavy');
    st.startFidget('stretch', 3);
    st.heldId = 'bat';
    tick(st);
    assert.equal(st.fidget.kind, 'stretch', 'kolu meşgul etmeyen kıpırdanma sürer');
  }
});

test('Avatar isabet tepkisi eylem yuvasını kullanmaz: hemen önce yazılan serilme/durdurma/basılı tutma uzakta görünür, isabet kendi sayacıyla bir kez oynar', () => {
  const { av: own } = realAvatar({ player: true });
  const { av: rem, M: RM } = realAvatar({ player: true, remote: true });
  const state = (actT) => wire({ ...STILL, act: own.lastAct || null, actT, hit: own.lastHit || null }); // Player.animState + Net.compactAnim
  for (let i = 0; i < 20; i++) { own.update(DT, STILL); rem.update(DT, state(0)); }
  const hitShots = () => RM.shots.filter((x) => x.group === 'hit');
  assert.equal(hitShots().length, 0);
  // ağır darbe (isabet + serilme), 0,03 sn sonra ikinci zombinin isabeti; ilk durum paketi ancak ondan sonra gider
  own.play('hit', 0.45, 1); own.play('knock', 1.95);
  own.update(DT, STILL); own.update(DT, STILL);
  own.play('hit', 0.45, 3);
  assert.equal(own.lastAct[1], 'knock', 'eylem yuvasında serilme kalır');
  assert.deepEqual(own.lastHit, [2, 3], 'isabetler kendi sayacında');
  rem.update(DT, state(0.03));
  assert.equal(rem.action && rem.action.type, 'knock', 'uzakta serilme oynamalı (eskiden isabet eziyordu)');
  assert.ok(hitShots().length === 1 && hitShots()[0].name === 'Hit_Shoulder_L', 'isabet aynı klip diziniyle bir kez: ' + hitShots().map((x) => x.name));
  for (let i = 0; i < 6; i++) rem.update(DT, state(0.05 + i * DT)); // aynı sayaç (sonraki paketler): yeniden oynamaz
  assert.equal(hitShots().length, 1, 'aynı isabet yeniden oynatılmaz');
  own.play('hit', 0.45, 0);
  rem.update(DT, state(0.2));
  assert.ok(hitShots().length === 2 && hitShots().some((x) => x.name === 'Hit_Chest' && !x.out), 'yeni isabet oynar');
  // basılı tutma bırakıldı ('stop' hemen yazılır), 0,05 sn sonra isabet: durdurma ezilmez
  const { av: o2 } = realAvatar({ player: true });
  o2.play('hammer', 6);
  for (let i = 0; i < 120; i++) o2.update(DT, STILL);
  o2.action = null; // Interact.cancelHold → endHoldAct
  o2.update(DT, STILL);
  const stop = o2.lastAct;
  for (let i = 0; i < 3; i++) o2.update(DT, STILL);
  o2.play('hit', 0.45, 2);
  assert.ok(stop[1] === 'stop' && o2.lastAct === stop, 'isabet durdurmayı ezmemeli: ' + JSON.stringify(o2.lastAct));
  // geç katılan: ilk durum süren levye işini (actT 2 sn) ve önceden alınmış isabeti taşır → iş oynar, eski isabet oynamaz
  const { av: late, M: LM } = realAvatar({ player: true, remote: true });
  late.update(DT, wire({ ...STILL, act: [4, 'search', 8.3, 'pry'], actT: 2, hit: [1, 3] }));
  assert.ok(late.action && late.action.type === 'search' && late.action.kind === 'pry', 'geç katılan süren işi görür');
  assert.ok(!LM.shots.some((x) => x.group === 'hit'), 'ilk görüşte eski isabet oynatılmaz');
  late.update(DT, wire({ ...STILL, act: [4, 'search', 8.3, 'pry'], actT: 2.02, hit: [2, 0] }));
  assert.ok(LM.shots.some((x) => x.group === 'hit' && x.name === 'Hit_Chest') && late.action && late.action.type === 'search', 'sonraki isabet oynar, işi bölmez');
});

test('Yakın dövüş sırası yalnız vuruşla artan sayaçtan: araya giren isabet/eylem bozmaz; sayaç eylemle (act[4]) ve bot olayıyla (bot_fx n) gider', () => {
  const clip = (av) => live(av).filter((c) => c.startsWith('attack:')).pop();
  // oyuncu: vuruş, isabet, vuruş, zıplama, vuruş, iki isabet, vuruş → direkt/kroşe sırası bozulmaz (eskiden aynı yumruk tekrarlanıyordu)
  const own = actor(0);
  const seq = [], acts = [];
  for (const k of ['melee', 'hit', 'melee', 'jump', 'melee', 'hit', 'hit', 'melee']) {
    if (k === 'melee') { own.play('melee', 0.55, 'melee1'); seq.push(clip(own)); acts.push(own.lastAct.slice()); } else own.play(k, 0.45, k === 'hit' ? 2 : null);
  }
  assert.deepEqual(seq, ['attack:Punch_Jab', 'attack:Punch_Cross', 'attack:Punch_Jab', 'attack:Punch_Cross']);
  assert.deepEqual(acts.map((a) => a[4]), [1, 2, 3, 4], 'vuruş sayacı eylemde gider');
  // uzak avatar ve geç katılan eylemdeki sayaçla aynı klibi seçer
  const rem = actor(0, { remote: true });
  const rseq = acts.map((a) => { rem.play(a[1], a[2], a[3], 0.02, a[0], a[4]); return clip(rem); });
  assert.deepEqual(rseq, seq, 'uzakta aynı sıra');
  const late = actor(0, { remote: true });
  late.play(acts[3][1], acts[3][2], acts[3][3], 0.05, acts[3][0], acts[3][4]);
  assert.equal(clip(late), seq[3], 'geç katılan aynı klibi görür');
  // bot: host vuruş sayacını bot_fx olayına koyar; her eş (host'taki bot avatarı, istemcideki vekil, geç katılan vekil) aynı
  // klibi seçer — host'taki botun kıpırdanması (eylem sayacı) sırayı kaydırmaz
  const handlers = {}, sent = [];
  const fakeS = { seed: 1, on() {}, onEvt: (k, fn) => { handlers[k] = fn; }, emit: (e) => { sent.push(e); if (handlers[e.k]) handlers[e.k](e); }, applyAction() {}, audio: { play() {} } };
  const host = new Bots(fakeS);
  const hostAv = actor(0, {}, 'heavy');
  hostAv.heldId = 'hammer';
  const b = { id: 'bot_bora', pos: new THREE.Vector3(), kit: { melee: 'hammer', gun: null }, ammo: 0, cool: 0, def: { stats: {} }, avatar: hostAv, setHeld() {} };
  host.list.push(b);
  const clientS = { seed: 1, on() {}, onEvt() {}, audio: { play() {} } };
  const client = new Bots(clientS), proxyAv = actor(0, { remote: true }, 'heavy');
  proxyAv.heldId = 'hammer';
  client.list.push({ id: 'bot_bora', pos: new THREE.Vector3(), avatar: proxyAv });
  const z = { id: 'z1', x: 1, z: 0 };
  hostAv.play('fidget', 3.2, 'stretch'); // host'taki bot kıpırdandı (vekil bunu eylem olarak saymaz)
  const hseq = [], cseq = [];
  for (let i = 0; i < 4; i++) {
    b.cool = 0;
    host.fight(b, z, 0.016);
    const e = sent[sent.length - 1];
    assert.ok(e.k === 'bot_fx' && e.a === 'melee' && e.n === i + 1, 'olayda vuruş sayacı: ' + JSON.stringify(e));
    hseq.push(clip(hostAv));
    client.onFx(wire(e));
    cseq.push(clip(proxyAv));
  }
  assert.deepEqual(hseq, ['attack:Sword_Regular_A', 'attack:Sword_Regular_B', 'attack:Sword_Regular_A', 'attack:Sword_Regular_B']);
  assert.deepEqual(cseq, hseq, 'host ve istemci aynı sırayı görür');
  const lateClient = new Bots(clientS), lateAv = actor(0, { remote: true }, 'heavy');
  lateAv.heldId = 'hammer';
  lateClient.list.push({ id: 'bot_bora', pos: new THREE.Vector3(), avatar: lateAv });
  lateClient.onFx(wire(sent[sent.length - 1]));
  assert.equal(clip(lateAv), hseq[3], 'geç katılan vekil de aynı klibi görür');
});
