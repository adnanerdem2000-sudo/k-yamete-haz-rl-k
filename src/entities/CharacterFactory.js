// Karakter üretimi: Quaternius CC0 iskeletli insan tabanları (erkek: "Adventurer", kadın: "Hooded Adventurer").
// Yüklemede taban modelin tüm parçaları tek bir deri ağında birleştirilir (tek çizim çağrısı) ve her köşeye
// bir "renk yuvası" atanır (ten, kol, el, saç, sakal, üst, kol yeni, pantolon, ayakkabı, çanta...).
// Görünüm köşe renkleriyle boyanır; saç/sakal/çanta gibi parçalar dizin tamponuyla gösterilir ya da gizlenir.
// Şapka, gözlük, çanta ve aksesuarlar kemiklere bağlı küçük 3D parçalardır.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterRig, computeRest } from './CharacterRig.js';
import { RNG, hash2 } from '../core/util.js';

export const CHAR_SCALE = 1; // modeller metre ölçeğinde (~1.8 m)

export const BASE_FACES = { male: 'Erkek', female: 'Kadın' };
/** Eski kayıtlardaki taban adlarını yeni gövdelere çevir */
export function baseOf(look) { return look && /female/.test(look.base || '') ? 'female' : 'male'; }

export const OPTIONS = {
  hairStyle: { short: 'Kısa', messy: 'Dağınık', spiky: 'Diken Diken', mohawk: 'Mohikan', ponytail: 'At Kuyruğu', bun: 'Topuz', long: 'Uzun', pigtails: 'İki Örgü', curly: 'Kıvırcık', bald: 'Kel' },
  beard: { none: 'Yok', stubble: 'Kirli Sakal', full: 'Gür Sakal', goatee: 'Keçi Sakal', mustache: 'Bıyık' },
  hat: { none: 'Yok', cap: 'Kasket', capBack: 'Ters Kasket', beanie: 'Bere', hardhat: 'Baret', boonie: 'Avcı Şapkası', cowboy: 'Kovboy Şapkası', helmet: 'Askerî Kask', bandana: 'Bandana', goggleband: 'Gözlüklü Bant' },
  topStyle: { tshirt: 'Tişört', longsleeve: 'Uzun Kollu', jacket: 'İş Ceketi', hoodie: 'Kapüşonlu', tank: 'Atlet', coat: 'Doktor Önlüğü', vest: 'Taktik Yelek', flannel: 'Oduncu Gömleği', uniform: 'Kamuflaj', sport: 'Sporcu Üstü' },
  pantsStyle: { jeans: 'Kot', cargo: 'Kargo', shorts: 'Şort', overalls: 'Tulum', sweat: 'Eşofman', camo: 'Kamuflaj' },
  backpack: { none: 'Yok', small: 'Küçük Çanta', hiking: 'Kamp Çantası', tactical: 'Taktik Çanta', doctor: 'Doktor Çantası', toolbag: 'Alet Çantası' },
  glasses: { none: 'Yok', round: 'Yuvarlak', square: 'Kare', sunglasses: 'Güneş Gözlüğü', goggles: 'Koruyucu Gözlük' },
  gloves: { none: 'Yok', work: 'İş Eldiveni', tactical: 'Taktik Eldiven', medical: 'Tıbbi Eldiven' },
  accessory: { none: 'Yok', scarf: 'Atkı', bandolier: 'Fişeklik', binoculars: 'Dürbün', radio: 'Telsiz', stethoscope: 'Steteskop', toolbelt: 'Alet Kemeri', watch: 'Kol Saati', necklace: 'Kolye' },
};

export const PALETTES = {
  skin: ['#f6d0b1', '#efb994', '#e0a07a', '#c98a5e', '#a86b45', '#7d4b2e', '#5a3420'],
  hair: ['#1d1410', '#3b2314', '#6b4226', '#a0522d', '#d4a256', '#e8d5a0', '#b0b0b0', '#ff4fa3', '#7d3cff', '#2ec4b6', '#e8432e', '#5b8c3a'],
  cloth: ['#2f3e4e', '#3a5a40', '#6b4f2a', '#8a5a2b', '#c0392b', '#d35400', '#f39c12', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#ecf0f1', '#95a5a6', '#2c2c2c', '#b5a27a', '#c7b8a1', '#e88fb4', '#556b2f', '#4a6fa5'],
};

/** Hazır kıyafet koleksiyonları (Komik, Sportif, Klasik, İşçi, Askerî, Kampçı, Kıyamet sonrası) */
export const COLLECTIONS = {
  Komik: { top: { style: 'tshirt', color: '#f39c12', color2: '#8e44ad' }, pants: { style: 'shorts', color: '#e88fb4' }, hat: 'beanie', hatColor: '#2ec4b6', glasses: 'sunglasses', accessory: 'necklace' },
  Sportif: { top: { style: 'sport', color: '#2980b9', color2: '#ecf0f1' }, pants: { style: 'sweat', color: '#2c2c2c' }, hat: 'capBack', hatColor: '#c0392b', backpack: 'small' },
  Klasik: { top: { style: 'longsleeve', color: '#ecf0f1', color2: '#2f3e4e' }, pants: { style: 'jeans', color: '#4a6fa5' }, hat: 'none', glasses: 'square' },
  İşçi: { top: { style: 'jacket', color: '#d35400', color2: '#2f3e4e' }, pants: { style: 'overalls', color: '#2f4f6f' }, hat: 'hardhat', hatColor: '#f1c40f', gloves: 'work', accessory: 'toolbelt', backpack: 'toolbag' },
  Askerî: { top: { style: 'uniform', color: '#556b2f', color2: '#3a4a2a' }, pants: { style: 'camo', color: '#556b2f' }, hat: 'helmet', hatColor: '#4b5320', gloves: 'tactical', backpack: 'tactical', accessory: 'bandolier' },
  Kampçı: { top: { style: 'flannel', color: '#c0392b', color2: '#2c2c2c' }, pants: { style: 'cargo', color: '#6b4f2a' }, hat: 'boonie', hatColor: '#8a7a50', backpack: 'hiking', accessory: 'binoculars' },
  'Kıyamet Sonrası': { top: { style: 'vest', color: '#3a3a3a', color2: '#8a5a2b' }, pants: { style: 'cargo', color: '#4a4a3a' }, hat: 'bandana', hatColor: '#7a2020', glasses: 'goggles', gloves: 'tactical', backpack: 'tactical', accessory: 'scarf', dirt: 0.8 },
};

// ------------------------------------------------------------------- 6 ana karakter
export const CHARACTERS = {
  mert: {
    id: 'mert', name: 'MERT', role: 'Mekanik', color: '#f39c12',
    bio: 'Mahallenin tamircisi. Paslı bir motoru bile konuşturur. Az konuşur, çok iş yapar.',
    perks: ['Araç tamirinde %40 daha hızlı', 'Mekanik üretimde ek malzeme tasarrufu', 'Araç parçalarını daha verimli kullanır'],
    start: [['repair_kit', 1], ['screwdriver', 1], ['hammer', 1], ['wrench', 1]],
    stats: { health: 100, stamina: 100, speed: 1.0, melee: 1.05, aim: 1.0, build: 1.1, repair: 1.4, heal: 1.0, stealth: 1.0, lockpick: 1.0, hunt: 1.0 },
    look: { base: 'male', skin: '#e0a07a', hairStyle: 'short', hairColor: '#3b2314', beard: 'full', hat: 'cap', hatColor: '#6f7880', top: { style: 'jacket', color: '#2c4a74', color2: '#e0b13a' }, pants: { style: 'cargo', color: '#4a4036' }, shoes: '#5a3a22', backpack: 'toolbag', backpackColor: '#8a5a2b', glasses: 'none', gloves: 'none', accessory: 'toolbelt', build: 1.04, dirt: 0.35 },
  },
  zulal: {
    id: 'zulal', name: 'ZÜLAL', role: 'Kaşif', color: '#ff4fa3',
    bio: 'Mahallenin en hızlısı. Kilitli kapı ona sadece bir bulmaca. Sessiz ve meraklı.',
    perks: ['%12 daha hızlı hareket', 'Sessiz hareket (zombiler daha geç fark eder)', 'Kilit açmada çok başarılı'],
    start: [['flashlight', 1], ['lockpick', 3], ['energy_drink', 1]],
    stats: { health: 90, stamina: 115, speed: 1.12, melee: 0.95, aim: 1.0, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.5, lockpick: 2.0, hunt: 1.0 },
    look: { base: 'female', skin: '#efb994', hairStyle: 'messy', hairColor: '#ff4fa3', beard: 'none', hat: 'none', top: { style: 'tank', color: '#6a3d7a', color2: '#2c2c2c' }, pants: { style: 'cargo', color: '#3a3a40' }, shoes: '#2c2c2c', backpack: 'small', backpackColor: '#3a3a40', glasses: 'none', gloves: 'none', accessory: 'necklace', build: 0.94, dirt: 0.25 },
  },
  deniz: {
    id: 'deniz', name: 'DENİZ', role: 'Savaşçı', color: '#e8432e',
    bio: 'Kick-boks şampiyonu. Takımını korumak için her zaman en önde. Gözlüğü hep alnında.',
    perks: ['Silah kullanımında isabet ve hasar bonusu', 'Daha yüksek başlangıç dayanıklılığı', 'Savunmada daha az hasar alır'],
    start: [['vest', 1], ['bat', 1], ['bandage', 2]],
    stats: { health: 125, stamina: 110, speed: 1.0, melee: 1.25, aim: 1.2, build: 1.0, repair: 1.0, heal: 1.0, stealth: 0.9, lockpick: 1.0, hunt: 1.0, armor: 0.85 },
    look: { base: 'male', skin: '#efb994', hairStyle: 'messy', hairColor: '#1d1410', beard: 'none', hat: 'goggleband', hatColor: '#3a3a3a', top: { style: 'hoodie', color: '#b8952e', color2: '#7f8c8d' }, pants: { style: 'jeans', color: '#3d4f6a' }, shoes: '#ecf0f1', backpack: 'tactical', backpackColor: '#4a4a3a', glasses: 'none', gloves: 'tactical', accessory: 'none', build: 1.0, dirt: 0.3 },
  },
  elif: {
    id: 'elif', name: 'ELİF', role: 'Avcı', color: '#27ae60',
    bio: 'Dağlarda büyüdü. İz sürer, uzaktan nişan alır, ormanda kaybolmaz.',
    perks: ['Avlanmada ve balıkçılıkta avantaj', 'Hayvan izlerini ve kaynakları haritada görür', 'Uzak mesafe atışlarda isabet bonusu'],
    start: [['binoculars', 1], ['bow', 1], ['arrow', 12], ['knife', 1]],
    stats: { health: 100, stamina: 110, speed: 1.05, melee: 1.0, aim: 1.3, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.25, lockpick: 1.0, hunt: 1.8 },
    look: { base: 'female', skin: '#f6d0b1', hairStyle: 'ponytail', hairColor: '#7a2a1a', beard: 'none', hat: 'cap', hatColor: '#d35400', top: { style: 'tshirt', color: '#c9a83a', color2: '#5b4636' }, pants: { style: 'cargo', color: '#5b5036' }, shoes: '#6b4226', backpack: 'hiking', backpackColor: '#556b2f', glasses: 'none', gloves: 'none', accessory: 'binoculars', build: 0.95, dirt: 0.3 },
  },
  bora: {
    id: 'bora', name: 'BORA', role: 'İnşaatçı', color: '#d35400',
    bio: 'Koca yürekli usta. Bir çekiç ve birkaç tahtayla kale yapar.',
    perks: ['Barikatları %50 daha hızlı kurar', 'Üs geliştirmede ek dayanıklılık', 'İnşaat malzemelerinden %25 tasarruf'],
    start: [['hammer', 1], ['nails', 20], ['plank', 6], ['work_gloves', 1]],
    stats: { health: 130, stamina: 95, speed: 0.95, melee: 1.2, aim: 0.95, build: 1.5, repair: 1.1, heal: 1.0, stealth: 0.8, lockpick: 1.0, hunt: 1.0, carry: 1.25 },
    look: { base: 'male', skin: '#c98a5e', hairStyle: 'short', hairColor: '#1d1410', beard: 'full', hat: 'none', top: { style: 'tshirt', color: '#3a3f47', color2: '#6b4f2a' }, pants: { style: 'cargo', color: '#2f3640' }, shoes: '#3b2b1d', backpack: 'none', glasses: 'none', gloves: 'work', gloveColor: '#7a4a2a', accessory: 'bandolier', build: 1.16, dirt: 0.35 },
  },
  ceren: {
    id: 'ceren', name: 'CEREN', role: 'Doktor', color: '#2ec4b6',
    bio: 'Acil servis doktoru. Paniğe kapılmaz; yaraları hızlı sarar, takımı hayatta tutar.',
    perks: ['Yaraları %60 daha hızlı tedavi eder', 'İlaçlardan %50 daha fazla etki', 'Enfeksiyon ve hastalık tedavisinde uzman'],
    start: [['first_aid', 1], ['bandage', 3], ['antiseptic', 1], ['painkiller', 2]],
    stats: { health: 95, stamina: 100, speed: 1.0, melee: 0.9, aim: 1.0, build: 1.0, repair: 1.0, heal: 1.6, stealth: 1.0, lockpick: 1.0, hunt: 1.0 },
    look: { base: 'female', skin: '#f6d0b1', hairStyle: 'bun', hairColor: '#5b3420', beard: 'none', hat: 'none', top: { style: 'coat', color: '#f4f6f6', color2: '#a33a3a' }, pants: { style: 'jeans', color: '#34495e' }, shoes: '#ecf0f1', backpack: 'doctor', backpackColor: '#c0392b', glasses: 'round', gloves: 'none', accessory: 'stethoscope', build: 0.95, dirt: 0.1 },
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

// ------------------------------------------------------------------- renk yuvaları
const SLOT = { skin: 0, arm: 1, hand: 2, hair: 3, beard: 4, brows: 5, eyes: 6, top: 7, top2: 8, sleeve: 9, collar: 10, pants: 11, pants2: 12, shoes: 13, soles: 14, pack: 15, pack2: 16, metal: 17, bracer: 18, mouth: 19 };
const NSLOT = 20;
// parça bayrakları (görünürlük)
const PART = { base: 0, hair: 1, beard: 2, pack: 3 };
const ARM_RE = /^(UpperArm|LowerArm|Shoulder)/;
const HAND_RE = /^(Wrist|Index|Middle|Ring|Pinky|Thumb)/;

/** Malzeme + baskın kemik + konum → [yuva, parça] (null: gizli) */
function classify(base, meshName, mat, bone, p) {
  if (base === 'male') {
    if (/Feet/.test(meshName)) return [mat === 'Grey' ? SLOT.soles : SLOT.shoes, PART.base];
    if (/Legs/.test(meshName)) return [mat === 'Brown2' ? SLOT.pants2 : SLOT.pants, PART.base];
    if (/Backpack/.test(meshName)) return [mat === 'Brown' ? SLOT.pack : mat === 'Gold' ? SLOT.metal : SLOT.pack2, PART.pack];
    if (/Head/.test(meshName)) {
      if (mat === 'Eyebrows') return [SLOT.brows, PART.base];
      if (mat === 'Eye') return [SLOT.eyes, PART.base];
      if (mat === 'Hair') return p.y < 1.64 && p.z > 0.115 ? [SLOT.beard, PART.beard] : [SLOT.hair, PART.hair];
      return [SLOT.skin, PART.base];
    }
    // gövde
    if (mat === 'Skin') return [HAND_RE.test(bone) ? SLOT.hand : ARM_RE.test(bone) ? SLOT.arm : SLOT.skin, PART.base];
    if (mat === 'Green') return [ARM_RE.test(bone) ? SLOT.sleeve : SLOT.top, PART.base];
    return [SLOT.top2, PART.base];
  }
  // kadın
  if (/Feet/.test(meshName)) return [mat === 'DarkBrown' ? SLOT.soles : SLOT.shoes, PART.base];
  if (/Legs/.test(meshName)) return [SLOT.pants, PART.base];
  if (/Head/.test(meshName)) {
    if (mat === 'DarkBrown') return null; // kapüşon
    if (mat === 'White') return [SLOT.hair, PART.hair];
    if (mat === 'Brown') return [SLOT.brows, PART.base];
    if (mat === 'Black') return [SLOT.eyes, PART.base];
    return [SLOT.skin, PART.base];
  }
  if (mat === 'Metal') return null; // omuz zırhı
  if (mat === 'Skin') return [HAND_RE.test(bone) ? SLOT.hand : ARM_RE.test(bone) ? SLOT.arm : SLOT.skin, PART.base];
  if (mat === 'Black') return [ARM_RE.test(bone) || HAND_RE.test(bone) ? SLOT.sleeve : SLOT.collar, PART.base];
  if (mat === 'LightBrown') return [/^(LowerArm|Wrist)/.test(bone) ? SLOT.bracer : SLOT.top2, PART.base];
  if (mat === 'DarkBrown') return [SLOT.top, PART.base];
  if (mat === 'Gold') return [SLOT.metal, PART.base];
  return [SLOT.top2, PART.base];
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _p0 = new THREE.Vector3(), _n0 = new THREE.Vector3(), _t = new THREE.Vector3();

/** Bir taban modelin işlenmiş hali: birleşik deri ağı, yuvalar, T-poz verisi, klipler */
class HumanBase {
  constructor(name, gltf) {
    this.name = name;
    const scene = gltf.scene;
    scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); scene.scale.set(1, 1, 1);
    scene.updateMatrixWorld(true);
    const bones = {};
    scene.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
    const meshes = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const boneList = meshes[0].skeleton.bones.slice();
    for (const m of meshes) for (const b of m.skeleton.bones) if (!boneList.includes(b)) boneList.push(b);
    const bIndex = new Map(boneList.map((b, i) => [b, i]));
    const P = [], N = [], SI = [], SW = [], SL = [], TRI = [[], [], [], []];
    let vbase = 0;
    for (const m of meshes) {
      const g = m.geometry;
      const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material).name;
      const meshName = m.name + '|' + (m.parent ? m.parent.name : '');
      const sk = m.skeleton;
      const map = new Int32Array(pos.count).fill(-1);
      // kemik başına deri matrisi: düğüm pozu (kemikDünya) · ters bağlama · bağlama matrisi
      const skinM = sk.bones.map((bn, j) => new THREE.Matrix4().multiplyMatrices(bn.matrixWorld, sk.boneInverses[j]).multiply(m.bindMatrix));
      const skinN = skinM.map((M) => new THREE.Matrix3().getNormalMatrix(M));
      for (let i = 0; i < pos.count; i++) {
        // baskın kemik (bölge sınıflandırması için)
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        // model uzayı konum/normal: doğrusal karışımlı deri (düğüm pozu yeni bağlama pozu olur)
        _p0.fromBufferAttribute(pos, i); _n0.fromBufferAttribute(nor, i);
        _v.set(0, 0, 0); _n.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (w <= 0) continue;
          const j = si.getComponent(i, k);
          _v.addScaledVector(_t.copy(_p0).applyMatrix4(skinM[j]), w);
          _n.addScaledVector(_t.copy(_n0).applyMatrix3(skinN[j]), w);
        }
        _n.normalize();
        const c = classify(name, meshName, mat, sk.bones[best].name, _v);
        if (!c) continue;
        map[i] = vbase++;
        P.push(_v.x, _v.y, _v.z); N.push(_n.x, _n.y, _n.z);
        for (let k = 0; k < 4; k++) { SI.push(bIndex.get(sk.bones[si.getComponent(i, k)]) || 0); SW.push(sw.getComponent(i, k)); }
        SL.push(c[0] * 4 + c[1]);
      }
      const idx = g.index;
      const tc = idx ? idx.count : pos.count;
      for (let t = 0; t < tc; t += 3) {
        const a = map[idx ? idx.getX(t) : t], b = map[idx ? idx.getX(t + 1) : t + 1], c = map[idx ? idx.getX(t + 2) : t + 2];
        if (a < 0 || b < 0 || c < 0) continue;
        TRI[SL[a] & 3].push(a, b, c);
      }
    }
    const nv = vbase;
    this.slot = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) this.slot[i] = SL[i] >> 2;
    this.y = new Float32Array(nv);
    this.grime = new Float32Array(nv);
    for (let i = 0; i < nv; i++) { this.y[i] = P[i * 3 + 1]; this.grime[i] = hash2(Math.round(P[i * 3] * 40), Math.round(P[i * 3 + 2] * 40 + P[i * 3 + 1] * 17), 9); }
    this.tris = TRI.map((t) => new Uint32Array(t));
    this.indexCache = new Map();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nv * 3).fill(0.8), 3));
    geo.computeBoundingSphere();
    this.geo = geo;
    // eski parçaları kaldır, birleşik ağı bağla
    for (const m of meshes) m.parent.remove(m);
    const inv = boneList.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert());
    const skel = new THREE.Skeleton(boneList, inv);
    const mesh = new THREE.SkinnedMesh(geo, HumanBase.material());
    mesh.name = 'body';
    scene.add(mesh);
    mesh.bind(skel, new THREE.Matrix4());
    this.template = scene;
    this.rest = computeRest(bones, scene);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    // klip yürüyüş ölçüleri (metre/döngü; araçla ölçüldü: yer hızı × süre)
    this.gait = name === 'female' ? { walk: 1.78, run: 2.4 } : { walk: 1.84, run: 2.38 };
  }

  static material() {
    if (!HumanBase._mat) HumanBase._mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
    return HumanBase._mat;
  }

  /** Görünürlük anahtarına göre dizin tamponu (paylaşılan) */
  index(key) {
    if (this.indexCache.has(key)) return this.indexCache.get(key);
    const parts = [PART.base];
    if (key.includes('H')) parts.push(PART.hair);
    if (key.includes('B')) parts.push(PART.beard);
    if (key.includes('P')) parts.push(PART.pack);
    let n = 0;
    for (const p of parts) n += this.tris[p].length;
    const arr = new Uint32Array(n);
    let o = 0;
    for (const p of parts) { arr.set(this.tris[p], o); o += this.tris[p].length; }
    const attr = new THREE.BufferAttribute(arr, 1);
    this.indexCache.set(key, attr);
    return attr;
  }
}

// ------------------------------------------------------------------- doku yerine renk paleti
const _c = new THREE.Color(), _c2 = new THREE.Color();
function lin(hex) { return new THREE.Color(hex); }
const LONG_SLEEVES = new Set(['longsleeve', 'jacket', 'hoodie', 'coat', 'flannel', 'uniform', 'sport']);

/** Görünüm → yuva renkleri (doğrusal) ve görünürlük anahtarı */
function lookColors(base, look) {
  const col = new Array(NSLOT);
  const skin = lin(look.skin || '#e0a07a');
  const hairC = lin(look.hairColor || '#3b2314');
  const top = look.top || { style: 'tshirt', color: '#2980b9' };
  const topC = lin(top.color || '#2980b9');
  const top2 = lin(top.color2 || shade(top.color || '#2980b9', -0.2));
  const pants = lin((look.pants && look.pants.color) || '#34495e');
  const shoes = lin(look.shoes || '#3b2b1d');
  const glove = look.gloves && look.gloves !== 'none' ? lin(look.gloveColor || { work: '#c9a86a', tactical: '#2c2c2c', medical: '#7ec8e3' }[look.gloves] || '#555555') : null;
  const style = top.style || 'tshirt';
  const longS = LONG_SLEEVES.has(style);
  col[SLOT.skin] = skin;
  col[SLOT.hand] = glove || skin;
  col[SLOT.hair] = hairC;
  col[SLOT.beard] = look.beard === 'stubble' ? skin.clone().lerp(hairC, 0.55) : hairC.clone().multiplyScalar(0.92);
  col[SLOT.brows] = hairC.clone().multiplyScalar(0.75);
  col[SLOT.eyes] = lin('#151210');
  col[SLOT.mouth] = lin('#7a3b33');
  col[SLOT.top] = topC;
  col[SLOT.top2] = top2;
  col[SLOT.collar] = top2;
  if (base === 'male') {
    col[SLOT.sleeve] = style === 'tank' ? skin : style === 'vest' ? top2 : topC;
    col[SLOT.arm] = longS ? (style === 'coat' || style === 'sport' ? topC : topC.clone().multiplyScalar(0.95)) : skin;
  } else {
    col[SLOT.sleeve] = longS ? topC.clone().multiplyScalar(0.95) : style === 'vest' ? top2 : skin;
    col[SLOT.arm] = skin;
  }
  col[SLOT.bracer] = glove || top2;
  col[SLOT.pants] = pants;
  col[SLOT.pants2] = (look.pants && look.pants.style === 'overalls') ? pants : lin('#3b2a1e');
  col[SLOT.shoes] = shoes;
  col[SLOT.soles] = shoes.clone().multiplyScalar(0.45);
  const bp = lin(look.backpackColor || '#556b2f');
  col[SLOT.pack] = bp;
  col[SLOT.pack2] = bp.clone().multiplyScalar(0.7);
  col[SLOT.metal] = lin('#9a8256');
  let key = '';
  if (look.hairStyle !== 'bald') key += 'H';
  if (base === 'male' && look.beard && look.beard !== 'none') key += 'B';
  if (base === 'male' && look.backpack === 'hiking') key += 'P';
  return { col, key };
}

const CLOTH_SLOTS = new Set([SLOT.top, SLOT.top2, SLOT.sleeve, SLOT.collar, SLOT.pants, SLOT.pants2, SLOT.shoes, SLOT.pack, SLOT.pack2, SLOT.bracer]);

/** Köşe renklerini doldur (kir/kan lekeleri dahil) */
function paintVertices(B, colors, out, dirt = 0.2, blood = 0) {
  const s = B.slot, gr = B.grime, Y = B.y;
  const mud = lin('#4a3a28'), red = lin('#5a0f0c');
  for (let i = 0; i < s.length; i++) {
    const c = colors[s[i]];
    let r = c.r, g = c.g, b = c.b;
    if (CLOTH_SLOTS.has(s[i])) {
      // kir: alt kısımlarda daha yoğun, köşe başına gürültü
      const low = Math.max(0, 1 - Y[i] / 1.2);
      const k = dirt * (0.18 + low * 0.5) * gr[i];
      r += (mud.r - r) * k; g += (mud.g - g) * k; b += (mud.b - b) * k;
      if (blood > 0 && gr[i] > 1 - blood * 0.35) { r = red.r; g = red.g; b = red.b; }
      const v = 0.94 + gr[i] * 0.08;
      r *= v; g *= v; b *= v;
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
}


// ------------------------------------------------------------------- fabrika
export class CharacterFactory {
  constructor(assets) {
    this.assets = assets;
    this.bases = {};
  }

  base(name) {
    if (!this.bases[name]) {
      const g = this.assets.rigged[name];
      if (!g) throw new Error('İnsan tabanı yüklenmedi: ' + name);
      this.bases[name] = new HumanBase(name, g);
    }
    return this.bases[name];
  }

  /**
   * Karakter oluştur. look: görünüm; opts.zombie: zombi türü tanımı.
   * Dönüş: {root, model, rig, mesh, anchors, base, clips, look}
   */
  create(look, opts = {}) {
    const z = opts.zombie || null;
    const zlook = z ? zombieLook(z, opts.seed) : null;
    const L = zlook || look || {};
    const B = this.base(baseOf(L));
    const model = SkeletonUtils.clone(B.template);
    let mesh = null;
    model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(k, B.geo.attributes[k]);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(B.slot.length * 3), 3));
    geo.boundingSphere = B.geo.boundingSphere;
    mesh.geometry = geo;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (z && z.emissive) { mesh.material = HumanBase.material().clone(); mesh.material.emissive = new THREE.Color(z.emissive); mesh.material.emissiveIntensity = 0.22; }
    const rig = new CharacterRig(model, B.rest);
    const root = new THREE.Group();
    root.add(model);
    const anchors = {
      handR: rig.makeAnchor('WristR', 'handR'), handL: rig.makeAnchor('WristL', 'handL'),
      head: rig.makeAnchor('Head', 'head'), back: rig.makeAnchor('Chest', 'back'), hips: rig.makeAnchor('Hips', 'hips'), chest: rig.makeAnchor('Chest', 'chest'),
    };
    const ch = { root, model, rig, mesh, anchors, base: B, clips: B.clips, gait: B.gait, look: null, zombie: z };
    if (z) {
      this.paint(ch, L, z);
      const b = z.build || [1, 1, 1];
      model.scale.set(b[0], b[1], b[2]);
      buildZombieExtras(ch, z);
    } else this.applyLook(ch, L);
    return ch;
  }

  paint(ch, look, z = null) {
    const { col, key } = lookColors(ch.base.name, look);
    if (z) {
      const tint = lin(z.tint || '#7d8f6a');
      col[SLOT.skin] = tint; col[SLOT.arm] = col[SLOT.sleeve] === col[SLOT.skin] ? tint : col[SLOT.arm]; col[SLOT.hand] = tint.clone().multiplyScalar(0.9);
      if (col[SLOT.sleeve] && look.top && look.top.style === 'tank') col[SLOT.sleeve] = tint;
      if (!LONG_SLEEVES.has((look.top || {}).style)) col[SLOT.arm] = tint;
      col[SLOT.eyes] = lin(z.eyes || '#d8d2a0');
      col[SLOT.brows] = tint.clone().multiplyScalar(0.6);
    }
    const out = ch.mesh.geometry.attributes.color;
    paintVertices(ch.base, col, out.array, z ? 0.9 : (look.dirt ?? 0.2), z ? (z.blood ?? 0.5) : 0);
    out.needsUpdate = true;
    ch.mesh.geometry.setIndex(ch.base.index(key));
  }

  applyLook(ch, look) {
    look = look || {};
    if (baseOf(look) !== ch.base.name) {
      // taban değişti (erkek ↔ kadın): yeni karakter gerekir — çağıran Avatar.setLook yeniden kurar
      ch.needsRebuild = true;
    }
    ch.look = look;
    this.paint(ch, look);
    const b = look.build || 1;
    ch.model.scale.set(b, 0.97 + b * 0.03, b);
    for (const a of Object.values(ch.anchors)) for (const child of [...a.children]) if (child.userData.acc) { a.remove(child); disposeTree(child); }
    buildAccessories(ch, look);
  }
}

/** Zombi görünümü: rastgele (tohumlu) yıpranmış kıyafet ve saç */
const Z_TOPS = ['#4a5560', '#5b4a3a', '#6a2f2f', '#3b4a3b', '#706a5a', '#2f3d55', '#7a6a4a', '#555555', '#8a8070', '#3a3a3a'];
const Z_PANTS = ['#2f3640', '#4a4036', '#3d4f6a', '#3a3a3a', '#5b5036', '#29323c'];
function zombieLook(z, seed) {
  const r = new RNG('z' + (seed ?? Math.floor(Math.random() * 1e9)));
  const female = z.female ?? r.chance(0.35);
  const styles = ['tshirt', 'longsleeve', 'jacket', 'tank', 'hoodie', 'flannel'];
  return {
    base: female ? 'female' : 'male', skin: z.tint, hairStyle: r.chance(0.15) ? 'bald' : 'short', hairColor: r.pick(['#1d1410', '#3b2314', '#6b6b6b', '#2a2a2a', '#5a4630']),
    beard: female ? 'none' : r.pick(['none', 'stubble', 'full']), top: { style: z.human ? 'vest' : r.pick(styles), color: z.cloth || r.pick(Z_TOPS), color2: r.pick(Z_TOPS) },
    pants: { style: 'jeans', color: r.pick(Z_PANTS) }, shoes: r.pick(['#2c2c2c', '#3b2b1d', '#555555']), backpack: 'none', hat: 'none', dirt: 1,
  };
}


export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const h = {}; c.getHSL(h, THREE.SRGBColorSpace);
  c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt)), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}
function disposeTree(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }

// ------------------------------------------------------------------- 3D aksesuarlar
// Bağlantı noktaları T-poz model eksenleriyle hizalıdır (birim: model birimi; 1 ≈ 0.74 m).
// Baş noktası boyun-baş ekleminde: başın üstü +0.68, yüz önü z +0.33, baş merkezi y +0.31.
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function accGroup(anchor, fit = null) {
  const g = new THREE.Group(); g.userData.acc = true;
  if (fit) { g.scale.set(fit.s[0], fit.s[1], fit.s[2]); g.position.set(fit.p[0], fit.p[1], fit.p[2]); }
  anchor.add(g); return g;
}
// eski birim → yeni beden: [ölçek xyz], [konum ofseti (m)]
// baş: saç hacmi dahil (şapkalar saçın üstüne oturur); yüz: gözlük/göz hizası
const HEAD_FIT = { male: { s: [0.37, 0.41, 0.38], p: [0, -0.012, -0.012] }, female: { s: [0.34, 0.39, 0.36], p: [0, -0.012, -0.012] } };
const FACE_FIT = { male: { s: [0.3, 0.29, 0.31], p: [0, -0.012, -0.005] }, female: { s: [0.28, 0.28, 0.3], p: [0, -0.014, -0.006] } };
const BODY_FIT = {
  back: { s: [0.62, 0.62, 0.62], p: [0, -0.02, -0.03] }, backF: { s: [0.55, 0.58, 0.58], p: [0, -0.02, -0.02] },
  hips: { s: [0.66, 0.66, 0.66], p: [0, 0.02, 0] }, hipsF: { s: [0.6, 0.62, 0.6], p: [0, 0.02, 0] },
  chest: { s: [0.62, 0.62, 0.62], p: [0, -0.05, 0.0] }, chestF: { s: [0.56, 0.58, 0.58], p: [0, -0.05, 0.0] },
};

function buildAccessories(ch, look) {
  // Aksesuar ölçüleri eski (iri başlı) modelin birimlerinde yazılmıştır: gruplar yeni bedene ölçeklenir.
  const fem = ch.base.name === 'female';
  const head = accGroup(ch.anchors.head, HEAD_FIT[ch.base.name]);
  const face = accGroup(ch.anchors.head, FACE_FIT[ch.base.name]);
  const back = accGroup(ch.anchors.back, fem ? BODY_FIT.backF : BODY_FIT.back);
  const hips = accGroup(ch.anchors.hips, fem ? BODY_FIT.hipsF : BODY_FIT.hips);
  const chest = accGroup(ch.anchors.chest, fem ? BODY_FIT.chestF : BODY_FIT.chest);
  const hairM = M(look.hairColor || '#3b2314', { roughness: 0.9 });
  const HY = 0.31; // baş merkezi
  // ---- saç modelleri
  const hs = look.hairStyle || 'short';
  if (hs === 'bald' || hs === 'short' || hs === 'messy' || hs === 'curly' || hs === 'spiky') { /* tabanın kendi saçı */ } else if (hs === 'ponytail') {
    head.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), hairM, 0, HY + 0.18, -0.36));
    head.add(mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 8), hairM, 0, HY - 0.08, -0.42, 0.35));
  } else if (hs === 'bun') {
    head.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), hairM, 0, HY + 0.4, -0.18));
  } else if (hs === 'mohawk') {
    head.add(mesh(new THREE.BoxGeometry(0.08, 0.2, 0.62), hairM, 0, HY + 0.42, -0.02));
  } else if (hs === 'long') {
    head.add(mesh(new THREE.BoxGeometry(0.56, 0.5, 0.16), hairM, 0, HY - 0.08, -0.33));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), hairM, 0.29, HY - 0.02, -0.08));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), hairM, -0.29, HY - 0.02, -0.08));
  } else if (hs === 'pigtails') {
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), hairM, s * 0.32, HY + 0.05, -0.1));
  }
  // ---- şapkalar
  const hc = look.hatColor || '#555';
  const hatM = M(hc);
  switch (look.hat) {
    case 'cap': case 'capBack': {
      const flip = look.hat === 'capBack' ? Math.PI : 0;
      const cap = new THREE.Group(); cap.rotation.y = flip;
      cap.add(mesh(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, HY + 0.24, -0.01, 0, 0, 0, 0.98, 0.72, 1.12));
      cap.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), M(shade(hc, -0.1)), 0, HY + 0.25, 0.32, 0, 0, 0, 1.0, 1, 1.2));
      cap.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), M(shade(hc, -0.2)), 0, HY + 0.48, 0));
      head.add(cap);
      break;
    }
    case 'beanie':
      head.add(mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, HY + 0.2, -0.01, 0, 0, 0, 1, 0.95, 1.1));
      head.add(mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 18), M(shade(hc, -0.12)), 0, HY + 0.2, -0.01, Math.PI / 2, 0, 0, 1, 1.15, 1));
      head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M(shade(hc, 0.2)), 0, HY + 0.53, -0.02));
      break;
    case 'hardhat':
      head.add(mesh(new THREE.SphereGeometry(0.35, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, HY + 0.22, -0.01, 0, 0, 0, 1, 0.85, 1.1));
      head.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.03, 18), hatM, 0, HY + 0.22, 0.02, 0, 0, 0, 1, 1, 1.12));
      head.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.6), M(shade(hc, -0.1)), 0, HY + 0.47, 0));
      break;
    case 'boonie': case 'cowboy':
      head.add(mesh(new THREE.CylinderGeometry(0.26, 0.31, 0.3, 14), hatM, 0, HY + 0.38, -0.01));
      head.add(mesh(new THREE.CylinderGeometry(look.hat === 'cowboy' ? 0.62 : 0.5, look.hat === 'cowboy' ? 0.62 : 0.5, 0.03, 20), M(shade(hc, -0.06)), 0, HY + 0.25, -0.01, look.hat === 'cowboy' ? 0.08 : 0, 0, 0, 1, 1, 1.05));
      head.add(mesh(new THREE.TorusGeometry(0.31, 0.025, 6, 18), M(shade(hc, -0.3)), 0, HY + 0.29, -0.01, Math.PI / 2));
      break;
    case 'helmet':
      head.add(mesh(new THREE.SphereGeometry(0.37, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), hatM, 0, HY + 0.18, -0.02, 0, 0, 0, 1, 0.9, 1.1));
      head.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), M('#1b1b1b'), 0, HY + 0.38, 0.38));
      break;
    case 'bandana':
      head.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 16, 1, true), M(hc, { side: THREE.DoubleSide }), 0, HY + 0.22, -0.01, 0, 0, 0, 1, 1, 1.1));
      head.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.05), M(hc), 0.05, HY + 0.12, -0.36, 0.3, 0, 0.3));
      break;
    case 'goggleband':
      head.add(mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), M('#2c2c2c'), 0, HY + 0.23, -0.01, Math.PI / 2, 0, 0, 1, 1.15, 1));
      for (const s of [-1, 1]) {
        head.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 14), M('#5a5a5a', { metalness: 0.5, roughness: 0.4 }), s * 0.11, HY + 0.25, 0.32, Math.PI / 2));
        head.add(mesh(new THREE.CircleGeometry(0.065, 14), M('#9fd6ff', { metalness: 0.3, roughness: 0.1, emissive: '#1d3d55' }), s * 0.11, HY + 0.25, 0.36));
      }
      break;
    default: break;
  }
  // ---- gözlük
  if (look.glasses && look.glasses !== 'none') {
    const gm = M(look.glasses === 'sunglasses' ? '#111' : '#2c2c2c', { metalness: 0.4, roughness: 0.35 });
    const lensM = M(look.glasses === 'sunglasses' ? '#1a1a1a' : '#bfe4ff', { transparent: look.glasses !== 'sunglasses', opacity: 0.45, roughness: 0.05, metalness: 0.3 });
    const y = 0.28, z = 0.335;
    if (look.glasses === 'goggles') {
      face.add(mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 20), M('#2c2c2c'), 0, y, -0.01, Math.PI / 2, 0, 0, 1, 1.15, 1));
      for (const s of [-1, 1]) { face.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), M('#4a5a3a'), s * 0.11, y, z, Math.PI / 2)); face.add(mesh(new THREE.CircleGeometry(0.06, 14), lensM, s * 0.11, y, z + 0.035)); }
    } else {
      for (const s of [-1, 1]) {
        const geo = look.glasses === 'round' ? new THREE.TorusGeometry(0.065, 0.012, 6, 16) : new THREE.TorusGeometry(0.07, 0.012, 4, 4);
        face.add(mesh(geo, gm, s * 0.105, y, z, 0, 0, look.glasses === 'round' ? 0 : Math.PI / 4));
        face.add(mesh(new THREE.CircleGeometry(look.glasses === 'round' ? 0.06 : 0.065, look.glasses === 'round' ? 14 : 4), lensM, s * 0.105, y, z - 0.004, 0, 0, look.glasses === 'round' ? 0 : Math.PI / 4));
        face.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), gm, s * 0.25, y + 0.02, z - 0.15));
      }
      face.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), gm, 0, y + 0.01, z));
    }
  }
  // ---- sırt çantaları (UpperChest noktası: sırt yüzeyi z ≈ -0.14)
  const bpc = look.backpackColor || '#556b2f';
  const bpM = M(bpc), bpM2 = M(shade(bpc, -0.15));
  const strapM = M('#2c2c2c');
  const straps = () => { for (const s of [-1, 1]) back.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.34), strapM, s * 0.12, -0.08, -0.02)); };
  switch (look.backpack) {
    case 'small': straps(); back.add(mesh(new THREE.BoxGeometry(0.36, 0.38, 0.18), bpM, 0, -0.1, -0.24)); back.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), bpM2, 0, -0.18, -0.35)); break;
    case 'hiking':
      straps();
      back.add(mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), bpM, 0, -0.02, -0.28));
      back.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 10), M('#c0392b'), 0, 0.32, -0.28, 0, 0, Math.PI / 2));
      back.add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), bpM2, 0, -0.16, -0.42));
      break;
    case 'tactical':
      straps();
      back.add(mesh(new THREE.BoxGeometry(0.42, 0.48, 0.22), bpM, 0, -0.06, -0.26));
      for (const s of [-1, 1]) back.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.12), bpM2, s * 0.25, -0.12, -0.26));
      back.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), bpM2, 0, 0.05, -0.39));
      break;
    case 'doctor':
      back.add(mesh(new THREE.BoxGeometry(0.4, 0.28, 0.2), bpM, 0, -0.12, -0.25));
      back.add(mesh(new THREE.BoxGeometry(0.06, 0.18, 0.012), M('#ffffff'), 0, -0.1, -0.355));
      back.add(mesh(new THREE.BoxGeometry(0.18, 0.06, 0.012), M('#ffffff'), 0, -0.1, -0.355));
      straps();
      break;
    case 'toolbag':
      straps();
      back.add(mesh(new THREE.BoxGeometry(0.44, 0.34, 0.2), bpM, 0, -0.08, -0.25));
      back.add(mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), M('#7f8c8d', { metalness: 0.6 }), 0.12, 0.18, -0.25, 0, 0, 0.3));
      back.add(mesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), M('#c0392b'), -0.1, 0.16, -0.25, 0, 0, -0.2));
      break;
    default: break;
  }
  // ---- aksesuarlar
  switch (look.accessory) {
    case 'toolbelt':
      hips.add(mesh(new THREE.TorusGeometry(0.255, 0.035, 6, 20), M('#5b3a1e'), 0, 0.03, 0.03, Math.PI / 2, 0, 0, 1, 0.8, 1));
      hips.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.08), M('#7a4f2a'), 0.22, -0.05, 0.12));
      hips.add(mesh(new THREE.BoxGeometry(0.03, 0.18, 0.03), M('#95a5a6', { metalness: 0.6 }), -0.24, -0.04, 0.1));
      break;
    case 'bandolier':
      chest.add(mesh(new THREE.TorusGeometry(0.27, 0.03, 6, 20), M('#5b3a1e'), 0, 0.02, 0.02, 0, 0, 0.75, 1, 1.35, 1.15));
      break;
    case 'scarf':
      head.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 16), M('#7a2020'), 0, -0.03, 0.02, Math.PI / 2));
      break;
    case 'binoculars':
      chest.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), M('#2c2c2c'), 0, 0.02, 0.22));
      for (const s of [-1, 1]) chest.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), M('#1b1b1b'), s * 0.045, 0.02, 0.28, Math.PI / 2));
      break;
    case 'radio':
      chest.add(mesh(new THREE.BoxGeometry(0.08, 0.14, 0.05), M('#2c2c2c'), 0.13, 0.06, 0.19));
      chest.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), M('#111'), 0.15, 0.18, 0.19));
      break;
    case 'stethoscope':
      chest.add(mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 20, Math.PI * 1.2), M('#2c3e50'), 0, 0.16, 0.08, Math.PI / 2.4, 0, -Math.PI * 0.1));
      chest.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 10), M('#bdc3c7', { metalness: 0.7, roughness: 0.3 }), 0.02, -0.02, 0.2, Math.PI / 2));
      break;
    case 'necklace':
      head.add(mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 18), M('#d4af37', { metalness: 0.8, roughness: 0.3 }), 0, -0.05, 0.04, Math.PI / 2.6));
      break;
    default: break;
  }
}

function buildZombieExtras(ch, z) {
  const head = accGroup(ch.anchors.head, HEAD_FIT[ch.base.name]);
  if (z.glow) {
    const gm = new THREE.MeshBasicMaterial({ color: z.glow });
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), gm, s * 0.1, 0.33, 0.33));
  }
  if (z.leader) {
    const spM = M('#5a1a2a', { emissive: '#5a0a1a', emissiveIntensity: 0.6 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; head.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 5), spM, Math.cos(a) * 0.2, 0.7, Math.sin(a) * 0.2)); }
  }
  if (z.pustules) {
    const pm = M('#7dff4a', { emissive: '#4cff1a', emissiveIntensity: 0.9 });
    const chest = accGroup(ch.anchors.chest, BODY_FIT.chest);
    const rng = new RNG(z.id);
    for (let i = 0; i < 9; i++) chest.add(mesh(new THREE.SphereGeometry(0.04 + rng.next() * 0.05, 7, 6), pm, (rng.next() - 0.5) * 0.4, rng.next() * 0.25 - 0.05, (rng.next() > 0.5 ? 1 : -1) * (0.14 + rng.next() * 0.04)));
  }
  if (z.hunch) {
    const back = accGroup(ch.anchors.back, BODY_FIT.back);
    back.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), M(z.tint), 0, 0.02, -0.12, 0, 0, 0, 1.3, 0.9, 0.9));
  }
}
