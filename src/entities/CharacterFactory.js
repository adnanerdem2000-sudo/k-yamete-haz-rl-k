// Karakter üretimi: Quaternius CC0 iskeletli insan tabanları (erkek: "Adventurer", kadın: "Hooded Adventurer").
// Yüklemede taban modelin tüm parçaları tek bir deri ağında birleştirilir (tek çizim çağrısı) ve her köşeye
// bir "renk yuvası" atanır (ten, kol, el, saç, sakal, üst, kol yeni, pantolon, ayakkabı, çanta...).
// Görünüm köşe renkleriyle boyanır; saç/sakal/çanta gibi parçalar dizin tamponuyla gösterilir ya da gizlenir.
// Şapka, gözlük, çanta ve aksesuarlar kemiklere bağlı küçük 3D parçalardır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CharacterRig, computeRest } from './CharacterRig.js';
import { RNG, hash2 } from '../core/util.js';

export const CHAR_SCALE = 1; // modeller metre ölçeğinde (~1.8 m)

export const BASE_FACES = { male: 'Erkek', female: 'Kadın' };
/**
 * Görünümün kullanacağı gövde tabanı: modüler tabanlar (men/women: Quaternius Ultimate Modular, gerçek kıyafet
 * siluetleri). Eski kayıtlardaki kıyafetsiz görünümler varsayılan sete düşer (renkleri korunur).
 */
export function baseOf(look) {
  // tüm insanlar modüler tabanda; kıyafeti olmayan eski görünümler varsayılan setle giyinir
  return look && /female/.test(look.base || '') ? 'women' : 'men';
}
export const isFemaleBase = (name) => name === 'female' || name === 'women';

/** Modüler kıyafet setleri (parça adı: <Set>_<Head|Body|Legs|Feet>) */
export const OUTFIT_SETS = {
  men: {
    head: ['Casual_2', 'Casual_Hoodie', 'Suit', 'Beach', 'Adventurer', 'Punk', 'Farmer', 'Worker', 'Swat'],
    body: ['Casual_2', 'Casual_Hoodie', 'Worker', 'Farmer', 'Punk', 'Suit', 'Beach'],
  },
  women: {
    head: ['Casual', 'Suit', 'Soldier', 'Adventurer', 'Formal', 'Punk', 'SciFi', 'Worker'],
    body: ['Casual', 'Worker', 'Punk', 'Suit', 'Formal'],
  },
};
export const OUTFIT_NAMES = {
  Casual_2: 'Gündelik', Casual_Hoodie: 'Kapüşonlu', Suit: 'Takım', Beach: 'Plaj', Adventurer: 'Gezgin', Punk: 'Punk', Farmer: 'Çiftçi',
  Worker: 'İşçi', Swat: 'Özel Tim', Casual: 'Gündelik', Soldier: 'Asker', Formal: 'Resmî', SciFi: 'Kulaklıklı',
};
/** Başlığı/kaskı olan kafalar (prosedürel şapka eklenmez) */
const HEADWEAR = new Set(['Worker', 'Farmer', 'Swat']);

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

/**
 * Hazır kıyafet koleksiyonları: gerçek model farkı (modüler set, cinsiyete göre) + renk ve aksesuar. Yüz ve saç
 * korunur. outfit.{men,women}: head/body (legs/feet verilmezse body'yi izler); top/pants.color null = setin
 * özgün rengi.
 */
export const COLLECTIONS = {
  Günlük: { outfit: { men: { head: 'Casual_2', body: 'Casual_2' }, women: { head: 'Casual', body: 'Casual' } }, top: { color: '#4a6fa5' }, pants: { color: '#34495e' }, shoes: null, hat: 'none', glasses: 'none', gloves: 'none', backpack: 'small', backpackColor: '#3a3a40', accessory: 'watch', dirt: 0.15 },
  Sportif: { outfit: { men: { head: 'Casual_Hoodie', body: 'Casual_Hoodie' }, women: { head: 'Casual', body: 'Casual' } }, top: { color: '#2980b9' }, pants: { color: '#2c2c2c' }, shoes: '#ecf0f1', hat: 'capBack', hatColor: '#c0392b', glasses: 'none', gloves: 'none', backpack: 'small', backpackColor: '#2c2c2c', accessory: 'none', dirt: 0.1 },
  İşçi: { outfit: { men: { head: 'Worker', body: 'Worker' }, women: { head: 'Worker', body: 'Worker' } }, top: { color: null }, pants: { color: null }, shoes: null, hat: 'none', glasses: 'none', gloves: 'work', gloveColor: '#c9a86a', backpack: 'toolbag', backpackColor: '#8a5a2b', accessory: 'toolbelt', dirt: 0.4 },
  Askerî: { outfit: { men: { head: 'Swat', body: 'Worker' }, women: { head: 'Soldier', body: 'Worker' } }, top: { color: '#556b2f' }, pants: { color: '#4b5320' }, shoes: '#2c2c2c', hat: 'none', glasses: 'none', gloves: 'tactical', backpack: 'tactical', backpackColor: '#4a4a3a', accessory: 'bandolier', dirt: 0.3 },
  Kampçı: { outfit: { men: { head: 'Adventurer', body: 'Farmer', legs: 'Farmer', feet: 'Worker' }, women: { head: 'Adventurer', body: 'Casual', legs: 'Worker', feet: 'Worker' } }, top: { color: '#c0392b' }, pants: { color: '#6b4f2a' }, shoes: '#6b4226', hat: 'boonie', hatColor: '#8a7a50', glasses: 'none', gloves: 'none', backpack: 'hiking', backpackColor: '#556b2f', accessory: 'binoculars', dirt: 0.35 },
  Doktor: { outfit: { men: { head: 'Suit', body: 'Suit', legs: 'Suit', feet: 'Casual_2' }, women: { head: 'Suit', body: 'Suit', legs: 'Suit', feet: 'Casual' } }, top: { color: '#eef3f3' }, pants: { color: '#34495e' }, shoes: null, hat: 'none', glasses: 'round', gloves: 'medical', backpack: 'doctor', backpackColor: '#c0392b', accessory: 'stethoscope', dirt: 0.05 },
  'Kıyamet Sonrası': { outfit: { men: { head: 'Punk', body: 'Punk' }, women: { head: 'Punk', body: 'Punk' } }, top: { color: '#3a3a3a' }, pants: { color: '#4a4a3a' }, shoes: '#2c2c2c', hat: 'bandana', hatColor: '#7a2020', glasses: 'goggles', gloves: 'tactical', backpack: 'tactical', backpackColor: '#3a3a30', accessory: 'scarf', dirt: 0.8 },
  Komik: { outfit: { men: { head: 'Beach', body: 'Beach' }, women: { head: 'Formal', body: 'Formal' } }, top: { color: '#f39c12' }, pants: { color: '#e88fb4' }, shoes: '#2ec4b6', hat: 'beanie', hatColor: '#2ec4b6', glasses: 'sunglasses', gloves: 'none', backpack: 'none', accessory: 'necklace', dirt: 0 },
};

// ------------------------------------------------------------------- 6 ana karakter
export const CHARACTERS = {
  mert: {
    id: 'mert', name: 'MERT', role: 'Mekanik', color: '#f39c12',
    bio: 'Mahallenin tamircisi. Paslı bir motoru bile konuşturur. Az konuşur, çok iş yapar.',
    perks: ['Araç tamirinde %40 daha hızlı', 'Mekanik üretimde ek malzeme tasarrufu', 'Araç parçalarını daha verimli kullanır'],
    start: [['repair_kit', 1], ['screwdriver', 1], ['hammer', 1], ['wrench', 1]],
    stats: { health: 100, stamina: 100, speed: 1.0, melee: 1.05, aim: 1.0, build: 1.1, repair: 1.4, heal: 1.0, stealth: 1.0, lockpick: 1.0, hunt: 1.0 },
    look: { base: 'male', outfit: { head: 'Casual_2', body: 'Farmer', legs: 'Farmer', feet: 'Worker' }, skin: '#e0a07a', hairStyle: 'short', hairColor: '#3b2314', beard: 'none', hat: 'cap', hatColor: '#6f7880', top: { style: 'jacket', color: '#2c4a74', color2: '#e0b13a' }, pants: { style: 'overalls', color: '#2c4a74' }, shoes: '#5a3a22', backpack: 'toolbag', backpackColor: '#8a5a2b', glasses: 'none', gloves: 'none', accessory: 'toolbelt', build: 1.04, dirt: 0.35, persona: 'relaxed' },
  },
  zulal: {
    id: 'zulal', name: 'ZÜLAL', role: 'Kaşif', color: '#ff4fa3',
    bio: 'Mahallenin en hızlısı. Kilitli kapı ona sadece bir bulmaca. Sessiz ve meraklı.',
    perks: ['%12 daha hızlı hareket', 'Sessiz hareket (zombiler daha geç fark eder)', 'Kilit açmada çok başarılı'],
    start: [['flashlight', 1], ['lockpick', 3], ['energy_drink', 1]],
    stats: { health: 90, stamina: 115, speed: 1.12, melee: 0.95, aim: 1.0, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.5, lockpick: 2.0, hunt: 1.0 },
    look: { base: 'female', outfit: { head: 'Punk', body: 'Punk', legs: 'Punk', feet: 'Punk' }, skin: '#efb994', hairStyle: 'messy', hairColor: '#ff4fa3', beard: 'none', hat: 'none', top: { style: 'tank' }, pants: { style: 'cargo' }, backpack: 'small', backpackColor: '#3a3a40', glasses: 'none', gloves: 'none', accessory: 'necklace', build: 0.94, dirt: 0.25, persona: 'agile' },
  },
  deniz: {
    id: 'deniz', name: 'DENİZ', role: 'Savaşçı', color: '#e8432e',
    bio: 'Kick-boks şampiyonu. Takımını korumak için her zaman en önde. Gözlüğü hep alnında.',
    perks: ['Silah kullanımında isabet ve hasar bonusu', 'Daha yüksek başlangıç dayanıklılığı', 'Savunmada daha az hasar alır'],
    start: [['vest', 1], ['bat', 1], ['bandage', 2]],
    stats: { health: 125, stamina: 110, speed: 1.0, melee: 1.25, aim: 1.2, build: 1.0, repair: 1.0, heal: 1.0, stealth: 0.9, lockpick: 1.0, hunt: 1.0, armor: 0.85 },
    look: { base: 'male', outfit: { head: 'Casual_Hoodie', body: 'Casual_Hoodie', legs: 'Casual_2', feet: 'Casual_2' }, skin: '#efb994', hairStyle: 'messy', hairColor: '#1d1410', beard: 'none', hat: 'goggleband', hatColor: '#3a3a3a', top: { style: 'hoodie', color: '#b8952e', color2: '#7f8c8d' }, pants: { style: 'jeans', color: '#3d4f6a' }, shoes: '#ecf0f1', backpack: 'tactical', backpackColor: '#4a4a3a', glasses: 'none', gloves: 'tactical', accessory: 'none', build: 1.05, dirt: 0.3, persona: 'confident' },
  },
  elif: {
    id: 'elif', name: 'ELİF', role: 'Avcı', color: '#27ae60',
    bio: 'Dağlarda büyüdü. İz sürer, uzaktan nişan alır, ormanda kaybolmaz.',
    perks: ['Avlanmada ve balıkçılıkta avantaj', 'Hayvan izlerini ve kaynakları haritada görür', 'Uzak mesafe atışlarda isabet bonusu'],
    start: [['binoculars', 1], ['bow', 1], ['arrow', 12], ['knife', 1]],
    stats: { health: 100, stamina: 110, speed: 1.05, melee: 1.0, aim: 1.3, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.25, lockpick: 1.0, hunt: 1.8 },
    look: { base: 'female', outfit: { head: 'Soldier', body: 'Casual', legs: 'Worker', feet: 'Worker' }, skin: '#f6d0b1', hairStyle: 'ponytail', hairColor: '#7a2a1a', beard: 'none', hat: 'cap', hatColor: '#d35400', top: { style: 'tshirt', color: '#7a8a4a', color2: '#5b4636' }, pants: { style: 'cargo', color: '#5b5036' }, shoes: '#6b4226', backpack: 'hiking', backpackColor: '#556b2f', glasses: 'none', gloves: 'none', accessory: 'binoculars', build: 0.95, dirt: 0.3, persona: 'observer' },
  },
  bora: {
    id: 'bora', name: 'BORA', role: 'İnşaatçı', color: '#d35400',
    bio: 'Koca yürekli usta. Bir çekiç ve birkaç tahtayla kale yapar.',
    perks: ['Barikatları %50 daha hızlı kurar', 'Üs geliştirmede ek dayanıklılık', 'İnşaat malzemelerinden %25 tasarruf'],
    start: [['hammer', 1], ['nails', 20], ['plank', 6], ['work_gloves', 1]],
    stats: { health: 130, stamina: 95, speed: 0.95, melee: 1.2, aim: 0.95, build: 1.5, repair: 1.1, heal: 1.0, stealth: 0.8, lockpick: 1.0, hunt: 1.0, carry: 1.25 },
    look: { base: 'male', outfit: { head: 'Worker', body: 'Worker', legs: 'Worker', feet: 'Worker' }, skin: '#c98a5e', hairStyle: 'short', hairColor: '#1d1410', beard: 'full', hat: 'none', top: { style: 'tshirt' }, pants: { style: 'cargo' }, backpack: 'none', glasses: 'none', gloves: 'work', gloveColor: '#7a4a2a', accessory: 'none', build: 1.16, dirt: 0.35, persona: 'heavy' },
  },
  ceren: {
    id: 'ceren', name: 'CEREN', role: 'Doktor', color: '#2ec4b6',
    bio: 'Acil servis doktoru. Paniğe kapılmaz; yaraları hızlı sarar, takımı hayatta tutar.',
    perks: ['Yaraları %60 daha hızlı tedavi eder', 'İlaçlardan %50 daha fazla etki', 'Enfeksiyon ve hastalık tedavisinde uzman'],
    start: [['first_aid', 1], ['bandage', 3], ['antiseptic', 1], ['painkiller', 2]],
    stats: { health: 95, stamina: 100, speed: 1.0, melee: 0.9, aim: 1.0, build: 1.0, repair: 1.0, heal: 1.6, stealth: 1.0, lockpick: 1.0, hunt: 1.0 },
    look: { base: 'female', outfit: { head: 'Suit', body: 'Suit', legs: 'Suit', feet: 'Casual' }, skin: '#f6d0b1', hairStyle: 'bun', hairColor: '#5b3420', beard: 'none', hat: 'none', top: { style: 'coat', color: '#eef3f3', color2: '#a33a3a' }, pants: { style: 'jeans', color: '#34495e' }, backpack: 'doctor', backpackColor: '#c0392b', glasses: 'round', gloves: 'none', accessory: 'stethoscope', build: 0.95, dirt: 0.1, persona: 'calm' },
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

// ------------------------------------------------------------------- renk yuvaları
const SLOT = { skin: 0, arm: 1, hand: 2, hair: 3, beard: 4, brows: 5, eyes: 6, top: 7, top2: 8, sleeve: 9, collar: 10, pants: 11, pants2: 12, shoes: 13, soles: 14, pack: 15, pack2: 16, metal: 17, bracer: 18, mouth: 19, hat: 20, detail: 21 };
const NSLOT = 22;
// kemik grupları (kol/el yuvaları)
const ARM_RE = /^(UpperArm|LowerArm|Shoulder)/;
const HAND_RE = /^(Wrist|Index|Middle|Ring|Pinky|Thumb)/;

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _p0 = new THREE.Vector3(), _n0 = new THREE.Vector3(), _t = new THREE.Vector3();

/**
 * İnsan deri/kıyafet malzemesi: köşe renkleri (ten, kıyafet, saç; karakter başına boyanır) + köşe başına
 * pürüzlülük (aRough: ten yarı mat, göz ıslak, kumaş mat, metal parlak). Tek malzeme, tek çizim çağrısı.
 */
function skinMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough; varying float vRough;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'char_skin';
  m.name = 'char_skin';
  return m;
}
let SKIN_MAT = null;
function sharedSkin() { return SKIN_MAT || (SKIN_MAT = skinMaterial()); }
// yuva → pürüzlülük
const SLOT_ROUGH = new Float32Array(NSLOT).fill(0.9);
for (const [k, v] of Object.entries({ skin: 0.62, arm: 0.62, hand: 0.66, hair: 0.58, beard: 0.6, brows: 0.6, eyes: 0.18, shoes: 0.72, soles: 0.8, metal: 0.35, mouth: 0.45, detail: 0.8 })) SLOT_ROUGH[SLOT[k]] = v;

// ------------------------------------------------------------------- modüler taban (kıyafet parçaları)
// Kafa parçalarında saç/şapka malzemeleri (setlere göre); listede olmayan diğer renkler özgün kalır.
const HEAD_MAP = {
  men: {
    Adventurer: { hair: ['Hair'] }, Beach: { hair: ['Hair'] }, Casual_2: { hair: ['Hair'] }, Casual_Hoodie: { hair: ['Hair'] },
    Farmer: { hat: ['Beige'] }, Punk: { hair: ['Red_Dark', 'Red'] }, Suit: { hair: ['Hair'] }, Swat: { hat: ['Swat', 'Swat_Black'] }, Worker: { hat: ['Worker_Yellow'] },
  },
  women: {
    Adventurer: { hair: ['Hair_Brown'] }, Casual: { hair: ['Hair_Brown', 'Hair_Blond'] }, Formal: { hair: ['Red'] }, Punk: { hair: ['Pink', 'Hair_Brown'] },
    SciFi: { hair: ['Hair_Black'] }, Soldier: { hair: ['Hair_Brown'] }, Suit: { hair: ['Hair_Brown', 'Hair_Blond'] }, Worker: { hair: ['DarkBrown'], hat: ['Worker_Yellow'] },
  },
};
const PART_RE = /^(.+)_(Head|Body|Legs|Feet)$/;

/** Bir nesne zincirinde "<Set>_<Parça>" adlı düğümü bul */
function partOf(o) {
  for (let n = o; n; n = n.parent) { const m = PART_RE.exec(n.name); if (m) return { set: m[1], type: m[2] }; }
  return null;
}

/**
 * Quaternius Ultimate Modular Men/Women: tek iskelet + set başına kafa/gövde/bacak/ayak parçaları.
 * Tüm parçalar düğüm pozunda (doğrusal karışımlı deri) model uzayına pişirilir; bir kıyafet kombinasyonu
 * seçilince yalnızca o parçaların köşelerinden sıkıştırılmış, paylaşılan bir geometri üretilir (önbellekli).
 * Köşe başına: renk yuvası (deri, saç, kaş, göz, üst, alt, ayakkabı, şapka, ayrıntı) + özgün malzeme rengi.
 */
class ModularBase {
  constructor(name, gltf, anims = null) {
    this.name = name;
    this.modular = true;
    const fem = name === 'women';
    const scene = gltf.scene;
    scene.position.set(0, 0, 0); scene.rotation.set(0, 0, 0); scene.scale.set(1, 1, 1);
    scene.updateMatrixWorld(true);
    const bones = {};
    scene.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
    const meshes = [];
    scene.traverse((o) => { if (o.isSkinnedMesh && partOf(o)) meshes.push(o); });
    const boneList = meshes[0].skeleton.bones.slice();
    for (const m of meshes) for (const b of m.skeleton.bones) if (!boneList.includes(b)) boneList.push(b);
    const bIndex = new Map(boneList.map((b, i) => [b, i]));
    // 1. geçiş: parça başına baskın kumaş malzemesi (deri/saç/göz/kaş hariç en çok köşeli malzeme)
    const matName = (m) => ((Array.isArray(m.material) ? m.material[0] : m.material).name || '').replace(/\.\d+$/, '');
    const counts = {};
    for (const m of meshes) {
      const p = partOf(m), k = p.set + '_' + p.type, mn = matName(m);
      if (/^Skin|^Hair|^Eye|^Moustache|^Earrings|^Gold$/.test(mn)) continue;
      (counts[k] = counts[k] || {})[mn] = (counts[k][mn] || 0) + m.geometry.attributes.position.count;
    }
    const primary = {};
    for (const [k, c] of Object.entries(counts)) primary[k] = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    // 2. geçiş: köşeleri pişir
    const P = [], N = [], SI = [], SW = [], SL = [], OC = [];
    this.parts = {};
    let vbase = 0;
    const col = new THREE.Color();
    for (const m of meshes) {
      const g = m.geometry, part = partOf(m), key = part.set + '_' + part.type;
      const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const mn = matName(m);
      col.copy(mat.color || col.set(0.7, 0.7, 0.7));
      const sk = m.skeleton;
      const skinM = sk.bones.map((bn, j) => new THREE.Matrix4().multiplyMatrices(bn.matrixWorld, sk.boneInverses[j]).multiply(m.bindMatrix));
      const skinN = skinM.map((M2) => new THREE.Matrix3().getNormalMatrix(M2));
      const map = new Int32Array(pos.count).fill(-1);
      const pr = (this.parts[key] = this.parts[key] || { set: part.set, type: part.type, tris: [], headwear: false });
      for (let i = 0; i < pos.count; i++) {
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
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
        const slot = classifyModular(fem ? 'women' : 'men', part, mn, sk.bones[best].name, primary[key]);
        if (slot === SLOT.hat) pr.headwear = true;
        map[i] = vbase++;
        P.push(_v.x, _v.y, _v.z); N.push(_n.x, _n.y, _n.z);
        for (let k = 0; k < 4; k++) { SI.push(bIndex.get(sk.bones[si.getComponent(i, k)]) || 0); SW.push(sw.getComponent(i, k)); }
        SL.push(slot);
        OC.push(col.r, col.g, col.b);
      }
      const idx = g.index;
      const tc = idx ? idx.count : pos.count;
      for (let t = 0; t < tc; t += 3) {
        const a = map[idx ? idx.getX(t) : t], b = map[idx ? idx.getX(t + 1) : t + 1], c = map[idx ? idx.getX(t + 2) : t + 2];
        if (a < 0 || b < 0 || c < 0) continue;
        pr.tris.push(a, b, c);
      }
    }
    this.P = new Float32Array(P); this.N = new Float32Array(N); this.SI = new Uint16Array(SI); this.SW = new Float32Array(SW);
    this.SL = new Uint8Array(SL); this.OC = new Float32Array(OC);
    this.combos = new Map();
    for (const m of meshes) m.parent.remove(m);
    // birleşik tek deri ağı (geometrisi karakter başına kombinasyondan gelir)
    const inv = boneList.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert());
    const skel = new THREE.Skeleton(boneList, inv);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), sharedSkin());
    mesh.name = 'body';
    scene.add(mesh);
    mesh.bind(skel, new THREE.Matrix4());
    this.template = scene;
    this.rest = computeRest(bones, scene);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name.split('|').pop()] = c;
    // aktarılmış hareket kütüphanesi (UAL): ayrı ad alanı (bazı adlar özgün kliplerle çakışır: Roll, Interact)
    this.anim = anims || null;
    this.gait = fem ? { walk: 1.78, run: 2.4 } : { walk: 1.84, run: 2.38 };
  }

  /** Mevcut setler (parça türüne göre) */
  sets(type) { return Object.values(this.parts).filter((p) => p.type === type).map((p) => p.set); }
  has(set, type) { return !!this.parts[set + '_' + type]; }

  /** Kıyafet → geçerli parça seçimi (eksik parçada setin ilkine düşer) */
  resolve(outfit) {
    outfit = outfit || {};
    const pick = (type, want, fallback) => (want && this.has(want, type) ? want : this.has(fallback, type) ? fallback : this.sets(type)[0]);
    const body = pick('Body', outfit.body, this.name === 'women' ? 'Casual' : 'Casual_2');
    return {
      head: pick('Head', outfit.head, body),
      body,
      legs: pick('Legs', outfit.legs || body, body),
      feet: pick('Feet', outfit.feet || outfit.legs || body, body),
    };
  }

  /** Kombinasyon geometrisi (paylaşılan) */
  combo(outfit) {
    const o = this.resolve(outfit);
    const key = `${o.head}|${o.body}|${o.legs}|${o.feet}`;
    if (this.combos.has(key)) return this.combos.get(key);
    const parts = [this.parts[o.head + '_Head'], this.parts[o.body + '_Body'], this.parts[o.legs + '_Legs'], this.parts[o.feet + '_Feet']].filter(Boolean);
    const remap = new Map();
    const tris = [];
    const PT = { Head: 0, Body: 1, Legs: 2, Feet: 3 }, partIdx = [];
    for (const p of parts) for (const v of p.tris) { let r = remap.get(v); if (r === undefined) { r = remap.size; remap.set(v, r); partIdx[r] = PT[p.type]; } tris.push(r); }
    const n = remap.size;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    const slot = new Uint8Array(n), orig = new Float32Array(n * 3), y = new Float32Array(n), grime = new Float32Array(n);
    for (const [src, dst] of remap) {
      P.set(this.P.subarray(src * 3, src * 3 + 3), dst * 3); N.set(this.N.subarray(src * 3, src * 3 + 3), dst * 3);
      SI.set(this.SI.subarray(src * 4, src * 4 + 4), dst * 4); SW.set(this.SW.subarray(src * 4, src * 4 + 4), dst * 4);
      slot[dst] = this.SL[src]; orig.set(this.OC.subarray(src * 3, src * 3 + 3), dst * 3);
      y[dst] = this.P[src * 3 + 1];
      grime[dst] = hash2(Math.round(this.P[src * 3] * 40), Math.round(this.P[src * 3 + 2] * 40 + this.P[src * 3 + 1] * 17), 9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(tris) : new Uint16Array(tris), 1));
    // köşe başına pürüzlülük (yuvadan)
    const rough = new Float32Array(n);
    for (let i = 0; i < n; i++) rough[i] = SLOT_ROUGH[slot[i]];
    geo.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
    geo.computeBoundingSphere();
    const part = Uint8Array.from(partIdx);
    // saç yükseklik aralığı (kökler koyu, uçlar açık) ve yüz verisi (göz merkezleri, ağız yeri) — veriye dayalı:
    // kafa setleri farklı olsa da göz/ağız geometriden ölçülür
    let h0 = Infinity, h1 = -Infinity;
    const eyeL = [], eyeR = [];
    for (let i = 0; i < n; i++) {
      if (slot[i] === SLOT.hair) { h0 = Math.min(h0, y[i]); h1 = Math.max(h1, y[i]); }
      if (slot[i] === SLOT.eyes && part[i] === 0) (P[i * 3] >= 0 ? eyeL : eyeR).push(i);
    }
    const eye = (ix) => {
      if (ix.length < 3) return null;
      let x = 0, yy = 0, z = 0;
      for (const i of ix) { x += P[i * 3]; yy += P[i * 3 + 1]; z += P[i * 3 + 2]; }
      x /= ix.length; yy /= ix.length; z /= ix.length;
      let r = 0;
      for (const i of ix) r = Math.max(r, Math.hypot(P[i * 3] - x, P[i * 3 + 1] - yy));
      return { x, y: yy, z, r: Math.max(0.008, r) };
    };
    const eyes = [eye(eyeL), eye(eyeR)].filter(Boolean);
    let face = null;
    if (eyes.length === 2) {
      const ey = (eyes[0].y + eyes[1].y) / 2, ex = (eyes[0].x + eyes[1].x) / 2;
      // ağız: burun altındaki deri yüzeyinin en öndeki noktaları
      const cand = [];
      for (let i = 0; i < n; i++) if (slot[i] === SLOT.skin && part[i] === 0 && Math.abs(P[i * 3] - ex) < 0.02 && y[i] < ey - 0.035 && y[i] > ey - 0.09) cand.push(i);
      cand.sort((a, b) => P[b * 3 + 2] - P[a * 3 + 2]);
      const top = cand.slice(0, 6);
      let mx = ex, my = ey - 0.06, mz = eyes[0].z;
      if (top.length) { mx = 0; my = 0; mz = 0; for (const i of top) { mx += P[i * 3]; my += P[i * 3 + 1]; mz += P[i * 3 + 2]; } mx /= top.length; my /= top.length; mz /= top.length; }
      face = { eyes, mouth: { x: mx, y: my, z: mz }, eyeDist: Math.abs(eyes[0].x - eyes[1].x) };
    }
    const c = { key, outfit: o, geo, slot, orig, y, grime, part, hairY: h0 < h1 ? [h0, h1] : null, face, headwear: !!(this.parts[o.head + '_Head'] || {}).headwear };
    this.combos.set(key, c);
    return c;
  }
}

/** Modüler parçada köşe → renk yuvası */
function classifyModular(gender, part, mat, bone, primary) {
  const fem = gender === 'women';
  if (part.type === 'Head') {
    const hm = (HEAD_MAP[gender] || {})[part.set] || {};
    if ((hm.hair || []).includes(mat)) return SLOT.hair;
    if ((hm.hat || []).includes(mat)) return SLOT.hat;
    if (/^Skin/.test(mat)) return SLOT.skin;
    if (mat === 'Eye' || (fem && mat === 'Black')) return SLOT.eyes;
    if (mat === 'Eyebrows' || (fem && mat === 'Brown')) return SLOT.brows;
    if (mat === 'Moustache') return SLOT.beard;
    if (/^Hair/.test(mat)) return SLOT.hair;
    if (mat === 'Earrings' || mat === 'Gold') return SLOT.metal;
    return SLOT.detail;
  }
  if (/^Skin/.test(mat)) return HAND_RE.test(bone) ? SLOT.hand : ARM_RE.test(bone) ? SLOT.arm : SLOT.skin;
  if (mat !== primary) return SLOT.detail;
  if (part.type === 'Body') return ARM_RE.test(bone) || HAND_RE.test(bone) ? SLOT.sleeve : SLOT.top;
  if (part.type === 'Legs') return SLOT.pants;
  return SLOT.shoes;
}

/** Modüler görünüm: yalnızca istenen yuvalar değişir, diğerleri özgün kalır (null = özgün renk) */
function modularColors(look, z = null) {
  const col = new Array(NSLOT).fill(null);
  if (look.skin) { const s = lin(look.skin); col[SLOT.skin] = s; col[SLOT.arm] = s; col[SLOT.hand] = s; }
  if (look.gloves && look.gloves !== 'none') col[SLOT.hand] = lin(look.gloveColor || { work: '#c9a86a', tactical: '#2c2c2c', medical: '#7ec8e3' }[look.gloves] || '#555555');
  if (look.hairColor) { const h = lin(look.hairColor); col[SLOT.hair] = h; col[SLOT.beard] = h.clone().multiplyScalar(0.92); col[SLOT.brows] = h.clone().multiplyScalar(0.7); }
  // insan gözü: taban geometrisi göz akı olur, iris/göz bebeği buildFace ile önüne eklenir
  if (!z) col[SLOT.eyes] = lin('#e3e0da');
  if (look.top && look.top.color) { const t = lin(look.top.color); col[SLOT.top] = t; col[SLOT.sleeve] = t.clone().multiplyScalar(0.96); }
  if (look.pants && look.pants.color) col[SLOT.pants] = lin(look.pants.color);
  if (look.shoes) col[SLOT.shoes] = lin(look.shoes);
  if (look.headwearColor) col[SLOT.hat] = lin(look.headwearColor);
  if (z) {
    const tint = lin(z.tint || '#7d8f6a');
    col[SLOT.skin] = tint; col[SLOT.arm] = tint; col[SLOT.hand] = tint.clone().multiplyScalar(0.9);
    col[SLOT.eyes] = lin(z.eyes || '#d8d2a0'); col[SLOT.brows] = tint.clone().multiplyScalar(0.6);
  }
  return col;
}

/** Modüler köşe boyası: yuva rengi ya da özgün renk + kir/kan (zombide soluk kumaş) */
function paintModular(c, colors, out, dirt = 0.2, blood = 0, faded = false) {
  const { slot: s, orig: O, grime: gr, y: Y } = c;
  const mud = lin('#4a3a28'), red = lin('#5a0f0c');
  const skinLike = (k) => k === SLOT.skin || k === SLOT.arm || k === SLOT.hand || k === SLOT.eyes || k === SLOT.brows || k === SLOT.hair || k === SLOT.beard;
  const hy = c.hairY, hInv = hy ? 1 / Math.max(0.01, hy[1] - hy[0]) : 0;
  for (let i = 0; i < s.length; i++) {
    const cc = colors[s[i]];
    let r = cc ? cc.r : O[i * 3], g = cc ? cc.g : O[i * 3 + 1], b = cc ? cc.b : O[i * 3 + 2];
    if (s[i] === SLOT.hair && hy) {
      // saç: kökler koyu, uçlar açık + tel tel ton farkı (düz tek renk blok görünmesin)
      const t = (Y[i] - hy[0]) * hInv, f = 0.76 + 0.36 * t + (gr[i] - 0.5) * 0.16;
      r *= f; g *= f; b *= f;
    } else if (s[i] === SLOT.skin && c.part && c.part[i] === 0) {
      // yüz: yanaklarda hafif kan rengi, çene/alın hafif koyu (düz plastik ten görünmesin)
      const f = 0.97 + (gr[i] - 0.5) * 0.05;
      r = r * f + 0.012; g *= f; b *= f * 0.995;
    }
    if (!skinLike(s[i])) {
      if (faded) { const l = r * 0.3 + g * 0.55 + b * 0.15; r = (r * 0.55 + l * 0.45) * 0.78; g = (g * 0.55 + l * 0.45) * 0.78; b = (b * 0.55 + l * 0.45) * 0.78; }
      const low = Math.max(0, 1 - Y[i] / 1.2);
      const k = dirt * (0.16 + low * 0.5) * gr[i];
      r += (mud.r - r) * k; g += (mud.g - g) * k; b += (mud.b - b) * k;
      if (blood > 0 && gr[i] > 1 - blood * 0.35) { r = red.r; g = red.g; b = red.b; }
      const v = 0.94 + gr[i] * 0.08;
      r *= v; g *= v; b *= v;
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
}

// ------------------------------------------------------------------- doku yerine renk paleti
const _c = new THREE.Color(), _c2 = new THREE.Color();
function lin(hex) { return new THREE.Color(hex); }
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
      this.bases[name] = new ModularBase(name, g, this.assets.anims[name]);
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (z && z.emissive) mesh.material = skinMaterial({ emissive: new THREE.Color(z.emissive), emissiveIntensity: 0.22 });
    const rig = new CharacterRig(model, B.rest);
    const root = new THREE.Group();
    root.add(model);
    const anchors = {
      handR: rig.makeAnchor('WristR', 'handR'), handL: rig.makeAnchor('WristL', 'handL'),
      head: rig.makeAnchor('Head', 'head'), back: rig.makeAnchor('Chest', 'back'), hips: rig.makeAnchor('Hips', 'hips'), chest: rig.makeAnchor('Chest', 'chest'),
    };
    const ch = { root, model, rig, mesh, anchors, base: B, clips: B.clips, anim: B.anim, gait: B.gait, look: null, zombie: z };
    if (z) {
      this.paint(ch, L, z);
      const b = z.build || [1, 1, 1];
      model.scale.set(b[0], b[1], b[2]);
      buildZombieExtras(ch, z);
    } else this.applyLook(ch, L);
    return ch;
  }

  /** Modüler: kıyafet kombinasyonunu ağ geometrisine bağla (gerekirse yenisiyle değiştir) */
  setCombo(ch, look) {
    const c = ch.base.combo(look.outfit || {});
    if (ch.combo === c) return c;
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'aRough']) geo.setAttribute(k, c.geo.attributes[k]);
    geo.setIndex(c.geo.index);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c.slot.length * 3), 3));
    geo.boundingSphere = c.geo.boundingSphere;
    const old = ch.mesh.geometry;
    ch.mesh.geometry = geo;
    if (old && old !== geo) old.dispose();
    ch.combo = c;
    return c;
  }

  paint(ch, look, z = null) {
    const c = this.setCombo(ch, look);
    const out = ch.mesh.geometry.attributes.color;
    paintModular(c, modularColors(look, z && !z.human ? z : null), out.array, z ? 0.9 : (look.dirt ?? 0.2), z ? (z.blood ?? 0.5) : 0, !!z && !z.human);
    out.needsUpdate = true;
  }

  applyLook(ch, look) {
    look = look || {};
    if (baseOf(look) !== ch.base.name) {
      // taban değişti (erkek ↔ kadın ya da eski ↔ modüler): Avatar.setLook karakteri yeniden kurar
      ch.needsRebuild = true;
      ch.look = look;
      return;
    }
    ch.look = look;
    this.paint(ch, look);
    const b = look.build || 1;
    ch.model.scale.set(b, 0.97 + b * 0.03, b);
    for (const a of Object.values(ch.anchors)) for (const child of [...a.children]) if (child.userData.acc) { a.remove(child); disposeTree(child); }
    buildAccessories(ch, look);
    buildFace(ch, look);
  }
}

/**
 * Yüz ayrıntısı (tek ağ, tek çizim çağrısı): iris + göz bebeği + parıltı, dudaklar, kadınlarda kirpik çizgisi.
 * Konumlar kafa setinin geometrisinden ölçülür (combo.face), Head kemiğinin bağlantı noktasına bağlanır.
 */
function buildFace(ch, look) {
  const c = ch.combo, f = c && c.face;
  if (!f) return;
  const E = ch.rig.restData.entries.find((e) => e.name === 'Head');
  if (!E) return;
  const fem = isFemaleBase(ch.base.name);
  const geos = [];
  const col = new THREE.Color();
  const add = (geo, hex, x, y, z, sx = 1, sy = 1, sz = 1) => {
    geo.scale(sx, sy, sz);
    geo.translate(x - E.wpos.x, y - E.wpos.y, z - E.wpos.z);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    col.set(hex);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (geo.index) geo.deleteAttribute('uv');
    geos.push(geo);
  };
  const iris = look.eyeColor || (fem ? '#3f5a3a' : '#4a3321');
  for (const e of f.eyes) {
    const r = e.r;
    add(new THREE.SphereGeometry(r * 0.6, 12, 8), iris, e.x, e.y - r * 0.02, e.z + r * 0.08, 1, 1, 0.42);
    add(new THREE.SphereGeometry(r * 0.3, 8, 6), '#0c0c0c', e.x, e.y - r * 0.02, e.z + r * 0.2, 1, 1, 0.4);
    add(new THREE.SphereGeometry(r * 0.11, 6, 5), '#ffffff', e.x + r * 0.17, e.y + r * 0.16, e.z + r * 0.34, 1, 1, 0.5);
    // üst göz kapağı/kirpik çizgisi (kadında belirgin, erkekte ince gölge)
    add(new THREE.SphereGeometry(r * 1.02, 10, 6), fem ? '#2a1a16' : '#3a2a22', e.x, e.y + r * 0.78, e.z + r * 0.05, 1, fem ? 0.16 : 0.09, 0.32);
  }
  // dudaklar: ten renginin kırmızıya çalan koyusu (kadında biraz daha belirgin)
  const skin = new THREE.Color(look.skin || '#e0a07a'), lip = skin.clone().lerp(new THREE.Color('#9c3f3a'), fem ? 0.5 : 0.32);
  const w = f.eyeDist * 0.58;
  const m = f.mouth;
  add(new THREE.SphereGeometry(1, 12, 6), '#' + lip.getHexString(), m.x, m.y + 0.0035, m.z + 0.002, w * 0.5, 0.0038, 0.006);
  add(new THREE.SphereGeometry(1, 12, 6), '#' + lip.clone().multiplyScalar(0.9).getHexString(), m.x, m.y - 0.0035, m.z + 0.0015, w * 0.46, 0.0042, 0.006);
  const merged = mergeGeometries(geos, false);
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, faceMaterial());
  mesh.name = 'face';
  mesh.userData.acc = true;
  mesh.castShadow = false;
  ch.anchors.head.add(mesh);
}
let FACE_MAT = null;
function faceMaterial() { return FACE_MAT || (FACE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 })); }

/** Zombi görünümü: rastgele (tohumlu) yıpranmış kıyafet ve saç */
function zombieLook(z, seed) {
  const r = new RNG('z' + (seed ?? Math.floor(Math.random() * 1e9)));
  const female = z.female ?? r.chance(0.35);
  const sets = OUTFIT_SETS[female ? 'women' : 'men'];
  const heads = sets.head.filter((h) => z.human || h !== 'Swat'), bodies = sets.body;
  const body = z.outfit || r.pick(bodies);
  return {
    base: female ? 'female' : 'male', outfit: { head: z.head || r.pick(heads), body, legs: r.chance(0.7) ? body : r.pick(bodies), feet: r.pick(bodies) },
    skin: z.tint, hairColor: r.chance(0.5) ? r.pick(['#1d1410', '#3b2314', '#6b6b6b', '#2a2a2a', '#5a4630']) : null, backpack: 'none', hat: 'none', dirt: 1,
    top: z.cloth ? { color: z.cloth } : {}, build: z.build ? 1 : 0.94 + r.next() * 0.14,
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
  const fem = isFemaleBase(ch.base.name);
  const fit = fem ? 'female' : 'male';
  const modular = !!ch.base.modular;
  const head = accGroup(ch.anchors.head, HEAD_FIT[fit]);
  const face = accGroup(ch.anchors.head, FACE_FIT[fit]);
  const back = accGroup(ch.anchors.back, fem ? BODY_FIT.backF : BODY_FIT.back);
  const hips = accGroup(ch.anchors.hips, fem ? BODY_FIT.hipsF : BODY_FIT.hips);
  const chest = accGroup(ch.anchors.chest, fem ? BODY_FIT.chestF : BODY_FIT.chest);
  const hairM = M(look.hairColor || '#3b2314', { roughness: 0.9 });
  const HY = 0.31; // baş merkezi
  // ---- saç modelleri
  const hs = modular ? 'short' : look.hairStyle || 'short'; // modüler kafaların saçı modellidir
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
  switch (modular && ch.combo && ch.combo.headwear ? 'none' : look.hat) {
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
  const head = accGroup(ch.anchors.head, HEAD_FIT[isFemaleBase(ch.base.name) ? 'female' : 'male']);
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
