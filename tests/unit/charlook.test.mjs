// Karakter görünümü birim testleri (oyundaki CharacterFactory, gerçek modeller): göz/kaş sınıflandırması (kadın
// kafalarında 'Brown' göz, 'Black' göz değil), iris/göz bebeği göz kutusunun ön yüzünün önünde, her ayakkabıda taban
// yuvası ve taban rengi, gövdenin ikinci kumaşı (top2), bilek kesiti ve kol saati, gözlük camları göz merkezlerinde,
// sırt çantası askıları ve omuz çantası kayışı gövdeye gömülmüyor (deri ağırlıklı ağ), koleksiyon ve karakter verisi.
// Modeller assets/models/rigged/{men,women}.glb'den three'nin GLTFLoader'ı ve meshopt çözücüsüyle yüklenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/meshopt/meshopt_decoder.module.js';
import { CharacterFactory, OUTFIT_SETS, SLOT, CHARACTERS, CHARACTER_IDS, COLLECTIONS, OPTIONS, raiderLook, isFemaleBase, migrateLook } from '../../src/entities/CharacterFactory.js';
import { NPCS } from '../../src/data/story.js';
import { ZOMBIE_TYPES } from '../../src/data/zombies.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
async function loadGLB(name) {
  const buf = fs.readFileSync(path.join(root, `assets/models/rigged/${name}.glb`));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}
const cf = new CharacterFactory({ rigged: { men: await loadGLB('men'), women: await loadGLB('women') }, anims: {} });
const G = [['men', 'male'], ['women', 'female']];
const _v = new THREE.Vector3();
const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };
/** Gövde + bacak üçgenlerinin (x, y) noktasındaki en öndeki ve en arkadaki z'si (bağlama pozu, tam tarama) */
function bodySlab(c, x, y) {
  const P = c.geo.attributes.position.array, I = c.geo.index.array;
  let f = -Infinity, b = Infinity;
  for (let t = 0; t < I.length; t += 3) {
    if (c.part[I[t]] !== 1 && c.part[I[t]] !== 2) continue;
    const a = I[t] * 3, q = I[t + 1] * 3, r = I[t + 2] * 3;
    const den = (P[q + 1] - P[r + 1]) * (P[a] - P[r]) + (P[r] - P[q]) * (P[a + 1] - P[r + 1]);
    if (Math.abs(den) < 1e-12) continue;
    const l1 = ((P[q + 1] - P[r + 1]) * (x - P[r]) + (P[r] - P[q]) * (y - P[r + 1])) / den, l2 = ((P[r + 1] - P[a + 1]) * (x - P[r]) + (P[a] - P[r]) * (y - P[r + 1])) / den, l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const z = l1 * P[a + 2] + l2 * P[q + 2] + l3 * P[r + 2];
    if (z > f) f = z;
    if (z < b) b = z;
  }
  return [f, b];
}

test('Görünüm: zombi kurulumu yüzey verisini (bilek/gövde ızgarası) hesaplamaz (tembel, yalnız aksesuarda)', () => {
  // ilk test: başka bir test aynı kombinasyona aksesuar kurmadan önce
  const z = Object.values(ZOMBIE_TYPES).find((t) => !t.dog);
  const ch = cf.create(null, { zombie: z, seed: 11 });
  assert.equal(ch.combo.surf, null);
  const h = cf.create({ base: 'male', outfit: { head: 'Casual_2', body: 'Casual_2' }, backpack: 'small' });
  assert.ok(h.combo.surf && h.combo.surf.torso, 'çantalı insanda gövde yüzeyi ölçülmeli');
});

test('Görünüm: her kafada (Swat hariç) iki göz; göz yuvasında 1,67 m altında köşe yok; Formal kafasında 48 göz + 80 kaş köşesi', () => {
  for (const [g] of G) {
    const B = cf.base(g);
    for (const head of B.sets('Head')) {
      const c = B.combo({ head, body: g === 'women' ? 'Casual' : 'Casual_2' });
      let low = 0;
      for (let i = 0; i < c.slot.length; i++) if (c.slot[i] === SLOT.eyes && c.part[i] === 0 && c.y[i] < 1.67) low++;
      // kadın Punk/SciFi kafalarının 'Black' malzemesi (dudak halkası, boyun bandı/boyunluk) göz sayılmamalı
      assert.equal(low, 0, `${g} ${head}: ${low} göz köşesi 1,67 m altında (çene/boyun göz sayılmış)`);
      if (head === 'Swat') { assert.equal(c.face, null, 'Swat kaskında yüz verisi olmamalı'); continue; }
      assert.ok(c.face && c.face.eyes.length === 2, `${g} ${head}: iki göz bulunamadı`);
      for (const e of c.face.eyes) {
        assert.ok(Math.abs(Math.abs(e.x) - 0.045) <= 0.006, `${g} ${head}: göz x ${e.x.toFixed(3)}`);
        assert.ok(e.y > 1.68 && e.y < 1.71, `${g} ${head}: göz y ${e.y.toFixed(3)}`);
        // ön yüz: göz kutusu merkezinin önünde, normali öne bakıyor
        assert.ok(e.front.z > e.z + 0.004 && e.front.nz > 0.7, `${g} ${head}: göz ön yüzü ${JSON.stringify(e.front)}`);
      }
      assert.ok(Math.sign(c.face.eyes[0].x) !== Math.sign(c.face.eyes[1].x), `${g} ${head}: gözler iki yanda olmalı`);
    }
  }
  // kadın Formal kafası: gözler ve kaşlar aynı 'Brown' ağında; bileşen şekliyle ayrılır
  const c = cf.base('women').combo({ head: 'Formal', body: 'Formal' });
  let eyes = 0, brows = 0;
  for (let i = 0; i < c.slot.length; i++) if (c.part[i] === 0) { if (c.slot[i] === SLOT.eyes) eyes++; else if (c.slot[i] === SLOT.brows) brows++; }
  assert.equal(eyes, 48);
  assert.equal(brows, 80);
});

test('Görünüm: iris, göz bebeği ve parıltı göz kutusunun ön yüzünün önünde (yüz normali yönünde)', () => {
  for (const [g, base] of G) for (const head of OUTFIT_SETS[g].head) {
    if (head === 'Swat') continue;
    const ch = cf.create({ base, outfit: { head }, eyeColor: '#00ff00', skin: '#e0a07a' });
    ch.root.updateMatrixWorld(true);
    const fm = ch.anchors.head.children.find((o) => o.name === 'face');
    assert.ok(fm, `${g} ${head}: yüz ağı yok`);
    const pos = fm.geometry.attributes.position, col = fm.geometry.attributes.color;
    const box = [new THREE.Box3(), new THREE.Box3()], dark = [new THREE.Box3(), new THREE.Box3()];
    for (let i = 0; i < pos.count; i++) {
      fm.localToWorld(_v.fromBufferAttribute(pos, i));
      const side = _v.x >= 0 ? 0 : 1;
      if (col.getY(i) > 0.9 && col.getX(i) < 0.1) box[side].expandByPoint(_v); // iris (yeşil)
      else if (col.getX(i) < 0.02 && col.getY(i) < 0.02 && col.getZ(i) < 0.02) dark[side].expandByPoint(_v); // göz bebeği
    }
    for (const e of ch.combo.face.eyes) {
      const side = e.x >= 0 ? 0 : 1, F = e.front, n = new THREE.Vector3(F.nx, F.ny, F.nz);
      for (const [name, b, min] of [['iris', box[side], 0.0005], ['göz bebeği', dark[side], 0.001]]) {
        assert.ok(!b.isEmpty(), `${g} ${head}: ${name} yok`);
        const c = b.getCenter(new THREE.Vector3()), d = c.clone().sub(new THREE.Vector3(F.x, F.y, F.z)).dot(n);
        assert.ok(d > min && d < 0.004, `${g} ${head}: ${name} ön yüzden ${(d * 1000).toFixed(2)} mm (ön yüzün önünde olmalı)`);
        // disk göz kutusunun ön yüzünde: merkezden yana kayma göz yarıçapından küçük
        assert.ok(Math.hypot(c.x - F.x, c.y - F.y) < e.r * 0.5, `${g} ${head}: ${name} ön yüzün dışında`);
      }
    }
  }
});

test('Görünüm: her ayakkabıda taban (SLOT.soles) yerde; taban rengi yalnız tabanı boyar; kapüşonlu setin ayakkabı rengi gövdeye gider', () => {
  for (const [g, base] of G) {
    const B = cf.base(g);
    for (const feet of B.sets('Feet')) {
      const c = B.combo({ feet });
      let soles = 0, high = 0, shoes = 0;
      for (let i = 0; i < c.slot.length; i++) {
        if (c.part[i] !== 3) continue;
        if (c.slot[i] === SLOT.soles) { soles++; if (c.y[i] >= 0.11) high++; } else if (c.slot[i] === SLOT.shoes) shoes++;
      }
      assert.ok(soles >= 100, `${g} ${feet}: taban köşesi ${soles}`);
      assert.equal(high, 0, `${g} ${feet}: ${high} taban köşesi 11 cm üstünde`);
      assert.ok(shoes > 0 || (g === 'men' && feet === 'Worker') || (g === 'men' && feet === 'Farmer'), `${g} ${feet}: ayakkabı gövdesi boyanacak köşe yok`);
      // taban rengi: dirt 0 ile taban köşeleri kırmızı, ayakkabı gövdesi mavi
      const ch = cf.create({ base, outfit: { feet }, shoes: '#0000ff', soleColor: '#ff0000', dirt: 0 });
      const out = ch.mesh.geometry.attributes.color.array, s = ch.combo.slot;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === SLOT.soles) assert.ok(out[i * 3] > 0.85 && out[i * 3 + 2] < 0.05, `${g} ${feet}: taban rengi uygulanmadı`);
        else if (s[i] === SLOT.shoes) assert.ok(out[i * 3 + 2] > 0.85 && out[i * 3] < 0.05, `${g} ${feet}: ayakkabı rengi tabana karıştı`);
      }
    }
  }
  // erkek Casual_Hoodie ayakkabısı: köşe sayısı fazla olan beyaz taban + burun değil, mor gövde ayakkabı rengini alır
  const c = cf.base('men').combo({ feet: 'Casual_Hoodie' }), purple = new THREE.Color('#47375b');
  let n = 0;
  for (let i = 0; i < c.slot.length; i++) if (c.part[i] === 3 && c.slot[i] === SLOT.shoes) { n++; assert.ok(Math.abs(c.orig[i * 3] - purple.r) < 0.01 && Math.abs(c.orig[i * 3 + 2] - purple.b) < 0.01, 'Casual_Hoodie ayakkabı yuvası mor gövde değil'); }
  assert.ok(n > 100);
});

test('Görünüm: gövdenin ikinci kumaşı (gömlek/yelek, SLOT.top2) yalnız ikinci kumaşı olan setlerde; look.top.color2 yalnız onu boyar', () => {
  const want = { men: ['Farmer', 'Punk', 'Suit', 'Worker'], women: ['Punk', 'Suit', 'Worker'] };
  for (const [g, base] of G) {
    const B = cf.base(g);
    for (const body of OUTFIT_SETS[g].body) {
      const c = B.combo({ body });
      let top2 = 0;
      for (let i = 0; i < c.slot.length; i++) if (c.slot[i] === SLOT.top2) { top2++; assert.equal(c.part[i], 1); }
      const has = want[g].includes(body);
      assert.equal(top2 > 0, has, `${g} ${body}: top2 köşesi ${top2}`);
      assert.equal(cf.bodySecondary(g, body), has, `${g} ${body}: arayüz ikinci renk satırı`);
      if (!has) continue;
      const ch = cf.create({ base, outfit: { body }, top: { color: '#0000ff', color2: '#ff0000' }, dirt: 0 });
      const out = ch.mesh.geometry.attributes.color.array, s = ch.combo.slot;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === SLOT.top2) assert.ok(out[i * 3] > 0.85 && out[i * 3 + 2] < 0.05, `${g} ${body}: ikinci renk uygulanmadı`);
        else if (s[i] === SLOT.top) assert.ok(out[i * 3 + 2] > 0.85 && out[i * 3] < 0.05, `${g} ${body}: üst rengi ikinci kumaşa karıştı`);
      }
    }
  }
});

test('Görünüm: sol bilek kesiti her gövdede ölçülür; kol saati kayışı ön kolda kesitin merkezinde ve onu sarar', () => {
  for (const [g, base] of G) {
    const B = cf.base(g);
    const W = B.wristL, El = B.elbowL, F = W.clone().sub(El).normalize(), U = new THREE.Vector3(0, 1, 0).addScaledVector(F, -F.y).normalize(), H = F.clone().cross(U);
    for (const body of OUTFIT_SETS[g].body) {
      const ch = cf.create({ base, outfit: { body }, accessory: 'watch' });
      const wr = ch.combo.surf && ch.combo.surf.wrist;
      assert.ok(wr, `${g} ${body}: bilek kesiti yok`);
      assert.ok(wr.y1 - wr.y0 >= 0.03 && wr.y1 - wr.y0 <= 0.1, `${g} ${body}: bilek yüksekliği ${(wr.y1 - wr.y0).toFixed(3)}`);
      assert.ok(wr.h1 - wr.h0 >= 0.03 && wr.h1 - wr.h0 <= 0.12, `${g} ${body}: bilek genişliği ${(wr.h1 - wr.h0).toFixed(3)}`);
      // saat ön kol bağlantı noktasında; bağlama pozunda kayış merkezi = bileğin 2 cm gerisinde kesit merkezi
      const grp = ch.anchors.foreL.children.find((o) => o.name === 'watch');
      assert.ok(grp, `${g} ${body}: kol saati ön kola takılmamış`);
      ch.root.updateMatrixWorld(true);
      const band = grp.children[0], bc = band.getWorldPosition(new THREE.Vector3());
      const want = W.clone().addScaledVector(F, -0.02).addScaledVector(U, (wr.y0 + wr.y1) / 2).addScaledVector(H, (wr.h0 + wr.h1) / 2);
      assert.ok(bc.distanceTo(want) < 0.004, `${g} ${body}: kayış merkezi kesit merkezinden ${(bc.distanceTo(want) * 1000).toFixed(1)} mm uzak`);
      // kayış elipsi kesiti sarar (yarı eksenler kesit yarı boyutlarından büyük, en çok 6 mm fazla)
      const ry = band.scale.y, rz = band.scale.x;
      assert.ok(ry > (wr.y1 - wr.y0) / 2 && ry < (wr.y1 - wr.y0) / 2 + 0.006 && rz > (wr.h1 - wr.h0) / 2 && rz < (wr.h1 - wr.h0) / 2 + 0.006, `${g} ${body}: kayış ölçüsü`);
    }
  }
});

test('Görünüm: gözlük camları göz merkezlerinde (x/y 1 cm içinde) ve göz ön yüzünün önünde; gözsüz Swat kaskında gözlük yok', () => {
  for (const [g, base] of G) for (const head of OUTFIT_SETS[g].head) for (const glasses of Object.keys(OPTIONS.glasses).filter((k) => k !== 'none')) {
    const ch = cf.create({ base, outfit: { head }, glasses });
    ch.root.updateMatrixWorld(true);
    const grp = ch.anchors.head.children.find((o) => o.name === 'glasses');
    const F = ch.combo.face;
    if (!F) { assert.equal(grp, undefined, `${g} ${head}: yüzsüz kafada gözlük`); continue; }
    assert.ok(grp, `${g} ${head} ${glasses}: gözlük yok`);
    const lenses = grp.children.filter((o) => o.geometry && o.geometry.type === 'CircleGeometry').map((o) => o.getWorldPosition(new THREE.Vector3()));
    assert.equal(lenses.length, 2, `${g} ${head} ${glasses}: cam sayısı`);
    for (const p of lenses) {
      const e = F.eyes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      assert.ok(Math.abs(p.x - e.x) < 0.01 && Math.abs(p.y - e.y) < 0.01, `${g} ${head} ${glasses}: cam gözden uzak (${((p.x - e.x) * 100).toFixed(1)}, ${((p.y - e.y) * 100).toFixed(1)} cm)`);
      assert.ok(p.z > e.front.z + 0.005, `${g} ${head} ${glasses}: cam gözün önünde değil`);
    }
    for (const o of grp.children) assert.ok(finite(o.geometry.attributes.position.array) && o.matrixWorld.elements.every(Number.isFinite), `${g} ${head} ${glasses}: NaN`);
  }
});

test('Görünüm: sırt çantası askıları ve omuz çantası kayışı gövdeyle bükülen tek derili ağ; bağlama pozunda gövdeye gömülmez', () => {
  for (const [g, base] of G) for (const body of OUTFIT_SETS[g].body) for (const backpack of ['small', 'tactical', 'satchel']) {
    const ch = cf.create({ base, outfit: { body }, backpack, accessory: 'watch' });
    let sm = null;
    ch.anchors.chest.traverse((o) => { if (o.name === 'straps') sm = o; });
    assert.ok(sm && sm.isSkinnedMesh, `${g} ${body} ${backpack}: kayış ağı yok`);
    assert.equal(sm.skeleton, ch.mesh.skeleton, 'kayış gövdenin iskeletine bağlı olmalı');
    assert.ok(sm.parent.userData.acc && sm.parent.userData.fixed, 'kayış grubu aksesuar ve sallanmaz olmalı');
    const P = sm.geometry.attributes.position, SI = sm.geometry.attributes.skinIndex, SW = sm.geometry.attributes.skinWeight;
    assert.ok(P.count >= (backpack === 'satchel' ? 60 : 100) && finite(P.array), `${g} ${body} ${backpack}: köşe ${P.count}`);
    let buried = 0, worst = 0;
    for (let i = 0; i < P.count; i++) {
      const w = SW.getX(i) + SW.getY(i) + SW.getZ(i) + SW.getW(i);
      assert.ok(Math.abs(w - 1) < 1e-4, 'deri ağırlıkları toplamı 1 olmalı');
      for (let k = 0; k < 4; k++) assert.ok(SI.getComponent(i, k) < ch.mesh.skeleton.bones.length);
      const [f, b] = bodySlab(ch.combo, P.getX(i), P.getY(i));
      if (!Number.isFinite(f)) continue;
      const depth = Math.min(f - P.getZ(i), P.getZ(i) - b);
      if (depth > 0.002) buried++;
      worst = Math.max(worst, depth);
    }
    assert.equal(buried, 0, `${g} ${body} ${backpack}: ${buried} kayış köşesi gövdeye gömülü (en derin ${(worst * 1000).toFixed(1)} mm)`);
  }
});

test('Görünüm verisi: koleksiyonlar ikinci rengi sıfırlar; kadın Günlük/Sportif farklı setler; Mert sarıya boyanmaz; NPC ikinci renkleri', () => {
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    assert.ok(c.top && 'color2' in c.top && c.top.color2 === null, `${name}: top.color2 null olmalı`);
    assert.ok('soleColor' in c && c.soleColor === null, `${name}: soleColor null olmalı`);
  }
  // koleksiyon kafa parçası taşımaz (karakterin yüzü ve saçı korunur): fark giysi setinde ve şapkada
  for (const [name, c] of Object.entries(COLLECTIONS)) for (const g of ['men', 'women']) assert.equal(c.outfit[g].head, undefined, `${name}/${g}: kafa parçası olmamalı`);
  const a = COLLECTIONS['Günlük'].outfit.women, b = COLLECTIONS.Sportif.outfit.women;
  const full = (o) => ({ body: o.body, legs: o.legs || o.body, feet: o.feet || o.legs || o.body });
  const diff = ['body', 'legs', 'feet'].filter((k) => full(a)[k] !== full(b)[k]).length;
  assert.ok(diff >= 2 && COLLECTIONS['Günlük'].hat !== COLLECTIONS.Sportif.hat, `kadın Günlük/Sportif yalnız ${diff} giysi parçasında farklı`);
  // kafası başlıklı/kasklı olan eski koleksiyonlar başlığı şapka yuvasından alır
  assert.equal(COLLECTIONS['İşçi'].hat, 'hardhat');
  assert.equal(COLLECTIONS['Askerî'].hat, 'helmet');
  assert.equal(CHARACTERS.mert.look.top.color2, undefined, 'Mert gömleği sarıya boyanmamalı (Deniz ile karışır)');
  assert.equal(NPCS.aydin.look.top.color2, '#ecf0f1');
  // Zeynep: yelek (Worker_Vest, ikinci kumaş) kendi koyu turuncu tonunda kalır; gömlekle aynı renk yeleği siliyordu
  assert.equal(NPCS.zeynep.look.top.color2, null);
  assert.ok(OPTIONS.backpack.satchel && OPTIONS.accessory.watch);
  // ana karakterler kol saati + omuz çantasıyla da kurulur (sonlu geometri)
  for (const id of CHARACTER_IDS) {
    const ch = cf.create({ ...CHARACTERS[id].look, accessory: 'watch', backpack: 'satchel' });
    ch.root.updateMatrixWorld(true);
    ch.root.traverse((o) => { if (o.isMesh) assert.ok(finite(o.geometry.attributes.position.array) && o.matrixWorld.elements.every(Number.isFinite), id); });
  }
});

test('Görünüm: omuz askısı kenarları eğimli omzu izler (her kenar kendi profili); en büyük boşluk 2 cm', () => {
  // dış kenar eskiden şeridin en yüksek sütununun yüksekliğinde kalıyor, eğimli omzun 2,3–3,4 cm üstünde duruyordu
  // (kapüşonlu gövdede omuz çantası kayışı kapüşon oluğunun üstünde 3,9 cm); şimdi en büyük boşluk ~1,3 cm
  const tri = new THREE.Triangle(), cp = new THREE.Vector3(), p = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (const [g, base] of G) for (const body of OUTFIT_SETS[g].body) for (const backpack of ['small', 'satchel']) {
    const ch = cf.create({ base, outfit: { body }, backpack });
    let sm = null;
    ch.anchors.chest.traverse((o) => { if (o.name === 'straps') sm = o; });
    const P = ch.combo.geo.attributes.position.array, I = ch.combo.geo.index.array, part = ch.combo.part, S = sm.geometry.attributes.position;
    const cand = [];
    for (let t = 0; t < I.length; t += 3) if ((part[I[t]] === 1 || part[I[t]] === 2) && P[I[t] * 3 + 1] > 1.2 && Math.abs(P[I[t] * 3]) < 0.3) cand.push(t);
    let worst = 0;
    for (let i = 0; i < S.count; i++) {
      p.fromBufferAttribute(S, i);
      if (p.y < 1.44) continue; // omuz bölgesi (ön ve arka şeritlerin üst kısmı ve omuz üstü)
      let best = Infinity;
      for (const t of cand) {
        A.fromArray(P, I[t] * 3);
        if (Math.abs(A.x - p.x) > 0.12 || Math.abs(A.y - p.y) > 0.12 || Math.abs(A.z - p.z) > 0.12) continue;
        B.fromArray(P, I[t + 1] * 3); C.fromArray(P, I[t + 2] * 3); tri.set(A, B, C); tri.closestPointToPoint(p, cp);
        best = Math.min(best, cp.distanceToSquared(p));
      }
      worst = Math.max(worst, Math.sqrt(best));
    }
    assert.ok(worst <= 0.02, `${g} ${body} ${backpack}: omuzda kayışla gövde arası en büyük boşluk ${(worst * 1000).toFixed(1)} mm (> 20)`);
  }
});

test('Görünüm: omuz çantası kalçada sabit (sallanmaz) ve iç yüzü bağlama pozunda kalçaya/uyluğa girmez', () => {
  // ikincil salınım çantayı kalça ekleminde döndürüp uyluğa 2,8–3,8 cm gömüyor, sabit kayışın ucundan ayırıyordu;
  // kalça yarı genişliği yalnız çantanın orta satırında ölçülünce Formal/Suit kalçası alt kenarda 1 cm içerideydi
  const latX = (P, I, part, y, z) => {
    let m = -Infinity;
    for (let t = 0; t < I.length; t += 3) {
      if (part[I[t]] !== 1 && part[I[t]] !== 2) continue;
      const a = I[t] * 3, q = I[t + 1] * 3, r = I[t + 2] * 3;
      if (P[a] < 0.05 && P[q] < 0.05 && P[r] < 0.05) continue;
      const den = (P[q + 1] - P[r + 1]) * (P[a + 2] - P[r + 2]) + (P[r + 2] - P[q + 2]) * (P[a + 1] - P[r + 1]);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((P[q + 1] - P[r + 1]) * (z - P[r + 2]) + (P[r + 2] - P[q + 2]) * (y - P[r + 1])) / den;
      const l2 = ((P[r + 1] - P[a + 1]) * (z - P[r + 2]) + (P[a + 2] - P[r + 2]) * (y - P[r + 1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      m = Math.max(m, l1 * P[a] + l2 * P[q] + l3 * P[r]);
    }
    return m;
  };
  const v = new THREE.Vector3();
  for (const [g, base] of G) for (const body of OUTFIT_SETS[g].body) {
    const ch = cf.create({ base, outfit: { body }, backpack: 'satchel' });
    const bag = ch.anchors.hips.children.find((o) => o.userData.acc && o.children.some((m) => m.geometry && m.geometry.type === 'BoxGeometry' && Math.abs(m.geometry.parameters.width - 0.06) < 1e-6));
    assert.ok(bag, `${g} ${body}: omuz çantası yok`);
    assert.equal(bag.userData.fixed, true, `${g} ${body}: çanta sabit grup olmalı (Avatar.secondary sallamaz)`);
    ch.root.updateMatrixWorld(true);
    const box = bag.children[0], gp = box.geometry.parameters, P = ch.combo.geo.attributes.position.array, I = ch.combo.geo.index.array;
    let inside = 0, worst = -Infinity;
    for (let iy = 0; iy <= 8; iy++) for (let iz = 0; iz <= 8; iz++) {
      v.set(-0.5 * gp.width, (iy / 8 - 0.5) * gp.height, (iz / 8 - 0.5) * gp.depth); box.localToWorld(v);
      const mx = latX(P, I, ch.combo.part, v.y, v.z);
      if (!Number.isFinite(mx)) continue;
      worst = Math.max(worst, mx - v.x);
      if (mx - v.x > 0.001) inside++;
    }
    assert.equal(inside, 0, `${g} ${body}: çantanın iç yüzünde ${inside} örnek gövdenin içinde (en derin ${(worst * 1000).toFixed(1)} mm)`);
  }
});

test('Görünüm: kadın tabanlı yağmacılar da yağmacı kitini ve yüz ağını (iris) alır', () => {
  const raider = Object.values(ZOMBIE_TYPES).find((t) => t.human);
  assert.ok(raider, 'yağmacı türü yok');
  let fem = 0;
  for (let seed = 0; seed < 40; seed++) {
    const ch = cf.create(null, { zombie: raider, seed });
    const f = isFemaleBase(ch.base.name);
    if (f) fem++;
    cf.applyLook(ch, raiderLook(f));
    assert.ok(!ch.needsRebuild, `tohum ${seed}: görünüm tabanı karakterle uyuşmalı (kurulum yarıda kalmamalı)`);
    assert.ok(ch.anchors.head.children.some((o) => o.name === 'face'), `tohum ${seed} (${ch.base.name}): yüz ağı (iris/göz bebeği) yok`);
    let bandolier = false;
    ch.root.traverse((o) => { if (o.userData && o.userData.acc) bandolier = true; });
    assert.ok(bandolier, `tohum ${seed}: yağmacı aksesuarları kurulmadı`);
  }
  assert.ok(fem > 0 && fem < 40, `kadın/erkek yağmacı karışımı beklenir (kadın ${fem}/40)`);
});

test('Görünüm verisi: eski kayıttaki Mert görünümünün kaldırılmış sarı ikinci rengi okunurken ayıklanır (önlük boyanmaz)', () => {
  const oldTop = { style: 'jacket', color: '#2c4a74', color2: '#e0b13a' };
  const saved = { ...CHARACTERS.mert.look, top: oldTop };
  const m = migrateLook('mert', saved);
  assert.equal(m.top.color2, undefined, 'eski varsayılan sarı ikinci renk silinmeli');
  assert.equal(m.top.color, '#2c4a74');
  assert.equal(saved.top.color2, '#e0b13a', 'girdi nesnesi değiştirilmemeli');
  // değişiklik yoksa aynı nesne; başka karakterlere ve oyuncunun seçtiği renklere dokunulmaz
  const cur = { ...CHARACTERS.mert.look };
  assert.equal(migrateLook('mert', cur), cur);
  const chosen = { ...CHARACTERS.mert.look, top: { ...oldTop, color2: '#c0392b' } };
  assert.equal(migrateLook('mert', chosen).top.color2, '#c0392b');
  const deniz = { ...CHARACTERS.deniz.look, top: { ...(CHARACTERS.deniz.look.top || {}), color2: '#e0b13a' } };
  assert.equal(migrateLook('deniz', deniz), deniz);
  // boyanan renk: temizlenen eski görünümün önlüğü (SLOT.top2) bugünkü varsayılanla aynı renkte
  const avg = (ch) => {
    const sl = ch.combo.slot, col = ch.mesh.geometry.attributes.color.array;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < sl.length; i++) if (sl[i] === SLOT.top2) { r += col[i * 3]; gg += col[i * 3 + 1]; b += col[i * 3 + 2]; n++; }
    return n ? [r / n, gg / n, b / n] : null;
  };
  const a = avg(cf.create(m)), d = avg(cf.create(CHARACTERS.mert.look)), y = avg(cf.create(saved));
  assert.ok(a && d && y, 'Farmer gövdesinde ikinci kumaş olmalı');
  assert.ok(a.every((x, i) => Math.abs(x - d[i]) < 1e-6), 'temizlenen görünüm varsayılanla aynı boyanmalı');
  assert.ok(y.some((x, i) => Math.abs(x - d[i]) > 0.05), 'test duyarlı olmalı: eski görünüm önlüğü sarıya boyar');
});
