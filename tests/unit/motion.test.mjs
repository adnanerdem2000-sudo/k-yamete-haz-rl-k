// Animasyon paketi (AnimPack) ve hareket denetleyicisi (Motion) birim testleri
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { encodePack, decodePack, packToClips } from '../../src/entities/AnimPack.js';
import { Motion } from '../../src/entities/Motion.js';

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
  ['Walk_Fwd_Loop', 'Walk_Fwd_L_Loop', 'Walk_L_Loop', 'Walk_Bwd_L_Loop', 'Walk_Bwd_Loop', 'Walk_Bwd_R_Loop', 'Walk_R_Loop', 'Walk_Fwd_R_Loop'].forEach((n, i) => { anim[n] = mk(n, 1.2, 1.0, 0.1, i * 0.1); });
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
