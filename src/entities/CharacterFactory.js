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
  backpack: { none: 'Yok', small: 'Küçük Çanta', hiking: 'Kamp Çantası', tactical: 'Taktik Çanta', doctor: 'Doktor Çantası', toolbag: 'Alet Çantası', satchel: 'Omuz Çantası' },
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
 * korunur: kafa parçası karakterin kendisinin kalır, başlık/kask (İşçi baret, Askerî kask) şapka yuvasından gelir.
 * outfit.{men,women}: body (legs/feet verilmezse body'yi izler); top/pants.color null = setin özgün rengi.
 * top.color2: null ve soleColor: null karakterin ikinci renginin (gömlek/yelek) ve taban renginin koleksiyona
 * taşmasını önler (setin özgün rengi).
 */
export const COLLECTIONS = {
  // Günlük: bej tişört + kot (iki cinsiyet); Sportif: erkekte kapüşonlu, kadında Punk gövdesi (açık bel, kolluk) + dar
  // siyah pantolon + spor ayakkabı (eskiden kadında iki koleksiyon aynı Casual setiydi, yalnız mavi tonu farklı)
  Günlük: { outfit: { men: { body: 'Casual_2' }, women: { body: 'Casual' } }, top: { color: '#c7b8a1', color2: null }, pants: { color: '#4a6fa5' }, shoes: null, soleColor: null, hat: 'none', glasses: 'none', gloves: 'none', backpack: 'small', backpackColor: '#3a3a40', accessory: 'watch', dirt: 0.15 },
  Sportif: { outfit: { men: { body: 'Casual_Hoodie' }, women: { body: 'Punk', legs: 'Suit', feet: 'Casual' } }, top: { color: '#2980b9', color2: null }, pants: { color: '#2c2c2c' }, shoes: '#ecf0f1', soleColor: null, hat: 'capBack', hatColor: '#c0392b', glasses: 'none', gloves: 'none', backpack: 'small', backpackColor: '#2c2c2c', accessory: 'none', dirt: 0.1 },
  İşçi: { outfit: { men: { body: 'Worker' }, women: { body: 'Worker' } }, top: { color: null, color2: null }, pants: { color: null }, shoes: null, soleColor: null, hat: 'hardhat', hatColor: '#f1c40f', glasses: 'none', gloves: 'work', gloveColor: '#c9a86a', backpack: 'toolbag', backpackColor: '#8a5a2b', accessory: 'toolbelt', dirt: 0.4 },
  Askerî: { outfit: { men: { body: 'Worker' }, women: { body: 'Worker' } }, top: { color: '#556b2f', color2: null }, pants: { color: '#4b5320' }, shoes: '#2c2c2c', soleColor: null, hat: 'helmet', hatColor: '#4b5320', glasses: 'none', gloves: 'tactical', backpack: 'tactical', backpackColor: '#4a4a3a', accessory: 'bandolier', dirt: 0.3 },
  Kampçı: { outfit: { men: { body: 'Farmer', legs: 'Farmer', feet: 'Worker' }, women: { body: 'Casual', legs: 'Worker', feet: 'Worker' } }, top: { color: '#c0392b', color2: null }, pants: { color: '#6b4f2a' }, shoes: '#6b4226', soleColor: null, hat: 'boonie', hatColor: '#8a7a50', glasses: 'none', gloves: 'none', backpack: 'hiking', backpackColor: '#556b2f', accessory: 'binoculars', dirt: 0.35 },
  Doktor: { outfit: { men: { body: 'Suit', legs: 'Suit', feet: 'Casual_2' }, women: { body: 'Suit', legs: 'Suit', feet: 'Casual' } }, top: { color: '#eef3f3', color2: null }, pants: { color: '#34495e' }, shoes: null, soleColor: null, hat: 'none', glasses: 'round', gloves: 'medical', backpack: 'doctor', backpackColor: '#c0392b', accessory: 'stethoscope', dirt: 0.05 },
  'Kıyamet Sonrası': { outfit: { men: { body: 'Punk' }, women: { body: 'Punk' } }, top: { color: '#3a3a3a', color2: null }, pants: { color: '#4a4a3a' }, shoes: '#2c2c2c', soleColor: null, hat: 'bandana', hatColor: '#7a2020', glasses: 'goggles', gloves: 'tactical', backpack: 'tactical', backpackColor: '#3a3a30', accessory: 'scarf', dirt: 0.8 },
  Komik: { outfit: { men: { body: 'Beach' }, women: { body: 'Formal' } }, top: { color: '#f39c12', color2: null }, pants: { color: '#e88fb4' }, shoes: '#2ec4b6', soleColor: null, hat: 'beanie', hatColor: '#2ec4b6', glasses: 'sunglasses', gloves: 'none', backpack: 'none', accessory: 'necklace', dirt: 0 },
};

// ------------------------------------------------------------------- eski varsayılanlar
/**
 * Kaldırılmış eski varsayılan değerler. Kayıtlar (Session.localData) ve özelleştirme profilleri görünümü karakter
 * varsayılanıyla birleştirilmiş hâliyle saklar; sonradan kaldırılan bir varsayılan orada kalır ve yeni modelde başka
 * bir parçayı boyar (Mert'in eski sarı ikinci rengi Farmer önlüğünü sarıya boyuyordu). Görünüm okunurken temizlenir.
 * Değer seçim paletlerinde yok: oyuncunun bilerek seçtiği bir renk silinmez.
 */
const LEGACY_LOOK = { mert: { top: { color2: '#e0b13a' } } };
/** Görünümden eski varsayılanları ayıkla (değişiklik yoksa aynı nesne döner) */
export function migrateLook(charId, look) {
  const L = LEGACY_LOOK[charId];
  if (!L || !look) return look;
  let out = look;
  for (const [k, fields] of Object.entries(L)) {
    const cur = out[k];
    if (!cur || typeof cur !== 'object') continue;
    for (const [f, v] of Object.entries(fields)) {
      if (out[k][f] !== v) continue;
      if (out === look) out = { ...look };
      if (out[k] === cur) out[k] = { ...cur };
      delete out[k][f];
    }
  }
  return out;
}

// ------------------------------------------------------------------- 6 ana karakter
export const CHARACTERS = {
  mert: {
    id: 'mert', name: 'MERT', role: 'Mekanik', color: '#f39c12',
    bio: 'Mahallenin tamircisi. Paslı bir motoru bile konuşturur. Az konuşur, çok iş yapar.',
    perks: ['Araç tamirinde %40 daha hızlı', 'Mekanik üretimde ek malzeme tasarrufu', 'Araç parçalarını daha verimli kullanır'],
    start: [['repair_kit', 1], ['screwdriver', 1], ['hammer', 1], ['wrench', 1]],
    stats: { health: 100, stamina: 100, speed: 1.0, melee: 1.05, aim: 1.0, build: 1.1, repair: 1.4, heal: 1.0, stealth: 1.0, lockpick: 1.0, hunt: 1.0 },
    look: { base: 'male', outfit: { head: 'Casual_2', body: 'Farmer', legs: 'Farmer', feet: 'Worker' }, skin: '#e0a07a', hairStyle: 'short', hairColor: '#3b2314', beard: 'none', hat: 'cap', hatColor: '#6f7880', top: { style: 'jacket', color: '#2c4a74' }, pants: { style: 'overalls', color: '#2c4a74' }, shoes: '#5a3a22', backpack: 'toolbag', backpackColor: '#8a5a2b', glasses: 'none', gloves: 'none', accessory: 'toolbelt', build: 1.04, dirt: 0.35, persona: 'relaxed' },
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
export const SLOT = { skin: 0, arm: 1, hand: 2, hair: 3, beard: 4, brows: 5, eyes: 6, top: 7, top2: 8, sleeve: 9, collar: 10, pants: 11, pants2: 12, shoes: 13, soles: 14, pack: 15, pack2: 16, metal: 17, bracer: 18, mouth: 19, hat: 20, detail: 21 };
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
// ayakkabının asıl (boyanan) malzemesi köşe sayısıyla seçilemeyen setler: Casual_Hoodie'de 'White' taban + burun
// (567 köşe) gövdeden ('Purple', 515) çok; ayakkabı rengi gövdeye gitmeli
const FEET_PRIMARY = { men: { Casual_Hoodie: 'Purple' } };

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
    const secondary = {}; // gövdede ikinci kumaş (gömlek/yelek/kol bandı): look.top.color2 ile boyanır (SLOT.top2)
    for (const [k, c] of Object.entries(counts)) {
      const ord = Object.entries(c).sort((a, b) => b[1] - a[1]);
      primary[k] = ord[0][0];
      if (/_Body$/.test(k) && ord[1] && ord[1][1] >= 200) secondary[k] = ord[1][0];
    }
    for (const [set, m] of Object.entries(FEET_PRIMARY[name] || {})) if (counts[set + '_Feet'] && counts[set + '_Feet'][m]) primary[set + '_Feet'] = m;
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
      // secondary: gövdenin ikinci kumaşı (arayüz "İkinci renk" satırını yalnız bu parçalarda gösterir)
      const pr = (this.parts[key] = this.parts[key] || { set: part.set, type: part.type, tris: [], headwear: false, secondary: secondary[key] || null });
      const v0 = vbase;
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
        const slot = classifyModular(fem ? 'women' : 'men', part, mn, sk.bones[best].name, primary[key], secondary[key]);
        if (slot === SLOT.hat) pr.headwear = true;
        map[i] = vbase++;
        P.push(_v.x, _v.y, _v.z); N.push(_n.x, _n.y, _n.z);
        for (let k = 0; k < 4; k++) { SI.push(bIndex.get(sk.bones[si.getComponent(i, k)]) || 0); SW.push(sw.getComponent(i, k)); }
        SL.push(slot);
        OC.push(col.r, col.g, col.b);
      }
      refineSlots(fem ? 'women' : 'men', part, mn, primary[key], P, SL, OC, v0, pos.count, g.index);
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
    // sol bilek ve dirsek eklemleri (bağlama pozu = pişirilmiş köşelerin pozu): kol saati kayışı için ön kol kesiti
    // surface() içinde ölçülür (ön kol ekseni dirsek → bilek; LowerArmL bağlantı noktasının dinlenmedeki +X'i)
    this.wristL = bones.WristL ? bones.WristL.getWorldPosition(new THREE.Vector3()) : null;
    this.elbowL = bones.LowerArmL ? bones.LowerArmL.getWorldPosition(new THREE.Vector3()) : null;
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
      // göz kutusunun ön yüzü (düz gölgeli: ön yüz köşelerinin normali öne bakar): iris/göz bebeği bu yüzün üstüne oturur.
      // Kutu merkezine (z) konan iris ön yüzün ≈ 9 mm gerisinde kalıp görünmüyordu
      let fx = 0, fy = 0, fz = 0, nx = 0, ny = 0, nz = 0, fn = 0;
      for (const i of ix) if (N[i * 3 + 2] > 0.7) { fx += P[i * 3]; fy += P[i * 3 + 1]; fz += P[i * 3 + 2]; nx += N[i * 3]; ny += N[i * 3 + 1]; nz += N[i * 3 + 2]; fn++; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      const front = fn ? { x: fx / fn, y: fy / fn, z: fz / fn, nx: nx / nl, ny: ny / nl, nz: nz / nl } : { x, y: yy, z: z + r * 0.6, nx: 0, ny: 0, nz: 1 };
      return { x, y: yy, z, r: Math.max(0.008, r), front };
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
    const c = { key, outfit: o, geo, slot, orig, y, grime, part, hairY: h0 < h1 ? [h0, h1] : null, face, headwear: !!(this.parts[o.head + '_Head'] || {}).headwear, surf: null };
    this.combos.set(key, c);
    return c;
  }

  /**
   * Kombinasyonun yüzey verisi (tembel: ilk aksesuar kurulumunda bir kez hesaplanır, combo.surf'te saklanır).
   * Zombiler aksesuar kurmadığından bu maliyeti hiç ödemez. Dönüş: { wrist, torso }
   *  - wrist: sol bilek kesiti (kol saati kayışı için): bilek ekleminin WATCH_AT gerisindeki, ön kola dik düzlemde
   *    gövde parçası üçgenlerinin (ön kol derisi, kol yeni, manşet) kesit çokgeni; az köşeli kolda köşe bandı boş
   *    kalabildiğinden kenar–düzlem kesişimi. Ön kol eksenine dik: y (yukarı = el sırtı) ve h (ileri = başparmak yanı)
   *    aralıkları, metre
   *  - torso: gövde yüzeyi (kayış şeritleri için): gövde + bacak parçası üçgenleri 1 cm XY ızgarasına taranır (ön = en
   *    büyük z, arka = en küçük z; hücredeki en öndeki/en arkadaki üçgen de saklanır: kayış köşeleri onun deri
   *    ağırlıklarını alır); omuz üstü: x sütununda gövde köşelerinin en büyük y'si (orta derinlikte)
   */
  surface(c) {
    if (c.surf) return c.surf;
    const P = c.geo.attributes.position.array, tris = c.geo.index.array, part = c.part, n = c.slot.length;
    let wrist = null;
    const W = this.wristL, El = this.elbowL;
    if (W && El) {
      // ön kol çerçevesi: F dirsek → bilek, U yukarıya en yakın dik eksen (el sırtı), H = F × U (ileri, başparmak yanı);
      // T-pozda (dinlenme) F = +X, U = +Y, H = +Z: LowerArmL bağlantı noktasının eksenleri
      const Fv = W.clone().sub(El).normalize(), Uv = new THREE.Vector3(0, 1, 0).addScaledVector(Fv, -Fv.y).normalize(), Hv = Fv.clone().cross(Uv);
      const al = (k) => (P[k * 3] - W.x) * Fv.x + (P[k * 3 + 1] - W.y) * Fv.y + (P[k * 3 + 2] - W.z) * Fv.z;
      let y0 = Infinity, y1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      const cut = (a, b, ta, tb) => {
        const t = (-WATCH_AT - ta) / (tb - ta);
        const px = P[a * 3] + (P[b * 3] - P[a * 3]) * t - W.x, py = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t - W.y, pz = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t - W.z;
        const u = px * Uv.x + py * Uv.y + pz * Uv.z, q = px * Hv.x + py * Hv.y + pz * Hv.z;
        if (Math.abs(u) > 0.09 || Math.abs(q) > 0.09) return; // gövde/el değil
        y0 = Math.min(y0, u); y1 = Math.max(y1, u); q0 = Math.min(q0, q); q1 = Math.max(q1, q);
      };
      for (let t = 0; t < tris.length; t += 3) {
        const a = tris[t], b = tris[t + 1], c3 = tris[t + 2];
        if (part[a] !== 1 || P[a * 3] < W.x - 0.12) continue; // yalnız gövde parçası, sol ön kol çevresi
        const ta = al(a), tb = al(b), tc = al(c3);
        if (Math.max(ta, tb, tc) < -WATCH_AT || Math.min(ta, tb, tc) > -WATCH_AT) continue;
        if ((ta + WATCH_AT) * (tb + WATCH_AT) <= 0 && ta !== tb) cut(a, b, ta, tb);
        if ((tb + WATCH_AT) * (tc + WATCH_AT) <= 0 && tb !== tc) cut(b, c3, tb, tc);
        if ((tc + WATCH_AT) * (ta + WATCH_AT) <= 0 && tc !== ta) cut(c3, a, tc, ta);
      }
      if (y1 > y0) wrist = { y0, y1, h0: q0, h1: q1 };
    }
    const TG = TORSO_GRID, fz = new Float32Array(TG.nx * TG.ny).fill(-Infinity), bz = new Float32Array(TG.nx * TG.ny).fill(Infinity), ty = new Float32Array(TG.nx).fill(-Infinity);
    const ft = new Int32Array(TG.nx * TG.ny).fill(-1), bt = new Int32Array(TG.nx * TG.ny).fill(-1);
    for (let i = 0; i < n; i++) if (part[i] === 1 && Math.abs(P[i * 3 + 2] - 0.04) < 0.06) {
      const gx = Math.round((P[i * 3] - TG.x0) / TG.s);
      if (gx >= 0 && gx < TG.nx && P[i * 3 + 1] > ty[gx]) ty[gx] = P[i * 3 + 1];
    }
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c3 = tris[t + 2] * 3;
      if ((part[tris[t]] !== 1 && part[tris[t]] !== 2)) continue;
      const den = (P[b + 1] - P[c3 + 1]) * (P[a] - P[c3]) + (P[c3] - P[b]) * (P[a + 1] - P[c3 + 1]);
      if (Math.abs(den) < 1e-12) continue;
      const gx0 = Math.max(0, Math.ceil((Math.min(P[a], P[b], P[c3]) - TG.x0) / TG.s)), gx1 = Math.min(TG.nx - 1, Math.floor((Math.max(P[a], P[b], P[c3]) - TG.x0) / TG.s));
      const gy0 = Math.max(0, Math.ceil((Math.min(P[a + 1], P[b + 1], P[c3 + 1]) - TG.y0) / TG.s)), gy1 = Math.min(TG.ny - 1, Math.floor((Math.max(P[a + 1], P[b + 1], P[c3 + 1]) - TG.y0) / TG.s));
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const px = TG.x0 + gx * TG.s, py = TG.y0 + gy * TG.s;
        const l1 = ((P[b + 1] - P[c3 + 1]) * (px - P[c3]) + (P[c3] - P[b]) * (py - P[c3 + 1])) / den, l2 = ((P[c3 + 1] - P[a + 1]) * (px - P[c3]) + (P[a] - P[c3]) * (py - P[c3 + 1])) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const z = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c3 + 2], k = gy * TG.nx + gx;
        if (z > fz[k]) { fz[k] = z; ft[k] = t; }
        if (z < bz[k]) { bz[k] = z; bt[k] = t; }
      }
    }
    return (c.surf = { wrist, torso: { fz, bz, ty, ft, bt } });
  }
}

/** Modüler parçada köşe → renk yuvası */
function classifyModular(gender, part, mat, bone, primary, secondary = null) {
  const fem = gender === 'women';
  if (part.type === 'Head') {
    const hm = (HEAD_MAP[gender] || {})[part.set] || {};
    if ((hm.hair || []).includes(mat)) return SLOT.hair;
    if ((hm.hat || []).includes(mat)) return SLOT.hat;
    if (/^Skin/.test(mat)) return SLOT.skin;
    // göz: erkekte 'Eye', kadında 'Brown' (Formal kafasında kaşlar da bu malzemede: refineSlots bileşen şekliyle ayırır).
    // Kadın kafasındaki 'Black' göz değildir (Punk: dudak halkası + boyun bandı, SciFi: boyunluk) → detail (özgün koyu renk)
    if (mat === 'Eye' || (fem && mat === 'Brown')) return SLOT.eyes;
    if (mat === 'Eyebrows') return SLOT.brows;
    if (mat === 'Moustache') return SLOT.beard;
    if (/^Hair/.test(mat)) return SLOT.hair;
    if (mat === 'Earrings' || mat === 'Gold') return SLOT.metal;
    return SLOT.detail;
  }
  if (/^Skin/.test(mat)) return HAND_RE.test(bone) ? SLOT.hand : ARM_RE.test(bone) ? SLOT.arm : SLOT.skin;
  if (part.type === 'Body' && mat === secondary) return SLOT.top2;
  if (mat !== primary) return SLOT.detail;
  if (part.type === 'Body') return ARM_RE.test(bone) || HAND_RE.test(bone) ? SLOT.sleeve : SLOT.top;
  if (part.type === 'Legs') return SLOT.pants;
  return SLOT.shoes;
}

/**
 * Malzeme adının yetmediği yerde geometriye dayalı yuva düzeltmesi (pişirilmiş model uzayı köşeleriyle, yerinde):
 *  - göz malzemesi (erkek 'Eye', kadın 'Brown'): konumdan kaynaklı bileşenler; göz kutusu en≈boy, kaş yassı şerit
 *    (en > 1,6 × boy) → kaş. Kadın Formal kafasında gözler ve kaşlar aynı 'Brown' ağındadır.
 *  - ayakkabı (Feet, ten dışı; düz gölgeli: her köşe tek yüz düzlemine ait): ana malzemede bütün üçgenleri yerden
 *    SOLE_Y'den alçak kalan köşeler taban ve özgün rengin koyusunu (SOLE_DARK) alır; ayrı bir taban malzemesinde
 *    (ana malzeme değil, yere değiyor: Worker/Farmer/Casual_2 erkek, Punk kadın platformu) yere inen yüzlerin hepsi.
 */
const SOLE_Y = 0.032, SOLE_DARK = 0.62;
const WATCH_AT = 0.02; // kol saati: bilek ekleminin bu kadar gerisinde (m)
const GLASS_DZ = 0.028; // gözlük camı düzlemi: göz merkezinin önünde (göz kutusu ön yüzü ≈ +1,4 cm)
const GLASS_TEMPLE = { male: 0.107, female: 0.111 }; // gözlük sapının şakaktaki ucu: |x| (m, model uzayı; z 0,075)
const FACE_LAYER = [0.001, 0.0016, 0.0022]; // iris, göz bebeği, parıltı merkezleri: göz kutusu ön yüzünün önünde (m)
const TORSO_GRID = { x0: -0.26, y0: 0.8, s: 0.01, nx: 53, ny: 81 }; // gövde yüzeyi ızgarası: x −0,26…0,26, y 0,8…1,6 m, 1 cm
function refineSlots(gender, part, mat, primary, P, SL, OC, v0, n, index) {
  if (!index) return;
  if (part.type === 'Head' && (mat === 'Eye' || (gender === 'women' && mat === 'Brown'))) {
    const key = new Map(), par = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (v0 + i) * 3, k = Math.round(P[j] * 2000) + ',' + Math.round(P[j + 1] * 2000) + ',' + Math.round(P[j + 2] * 2000);
      if (!key.has(k)) key.set(k, i);
      par[i] = key.get(k);
    }
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < index.count; t += 3) { const a = find(index.getX(t)), b = find(index.getX(t + 1)), c = find(index.getX(t + 2)); par[a] = b; par[find(c)] = find(b); }
    const box = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i), j = (v0 + i) * 3;
      let bb = box.get(r);
      if (!bb) box.set(r, (bb = [Infinity, -Infinity, Infinity, -Infinity]));
      bb[0] = Math.min(bb[0], P[j]); bb[1] = Math.max(bb[1], P[j]); bb[2] = Math.min(bb[2], P[j + 1]); bb[3] = Math.max(bb[3], P[j + 1]);
    }
    for (let i = 0; i < n; i++) { const bb = box.get(find(i)); SL[v0 + i] = bb[1] - bb[0] > 1.6 * (bb[3] - bb[2]) ? SLOT.brows : SLOT.eyes; }
  } else if (part.type === 'Feet' && !/^Skin/.test(mat)) {
    // flat-shaded: her köşe tek bir yüz düzlemine ait → üçgen ölçütü köşe başına keskin sınır verir
    const lo = new Float32Array(n).fill(Infinity), hi = new Float32Array(n).fill(-Infinity);
    let minY = Infinity;
    for (let i = 0; i < n; i++) minY = Math.min(minY, P[(v0 + i) * 3 + 1]);
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
      const ya = P[(v0 + a) * 3 + 1], yb = P[(v0 + b) * 3 + 1], yc = P[(v0 + c) * 3 + 1];
      const mn = Math.min(ya, yb, yc), mx = Math.max(ya, yb, yc);
      for (const k of [a, b, c]) { if (mn < lo[k]) lo[k] = mn; if (mx > hi[k]) hi[k] = mx; }
    }
    // ayrı taban malzemesi (ana malzeme değil, yere değiyor): yere inen yüzlerin hepsi taban (kalın platform dahil);
    // ana malzemede: tamamı taban bandında kalan yüzler
    const own = mat !== primary && minY < 0.005;
    for (let i = 0; i < n; i++) {
      if (!(own ? lo[i] < SOLE_Y : hi[i] < SOLE_Y)) continue;
      SL[v0 + i] = SLOT.soles;
      if (!own) for (let k = 0; k < 3; k++) OC[(v0 + i) * 3 + k] *= SOLE_DARK;
    }
  }
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
  if (look.top && look.top.color2) col[SLOT.top2] = lin(look.top.color2);
  if (look.pants && look.pants.color) col[SLOT.pants] = lin(look.pants.color);
  if (look.shoes) col[SLOT.shoes] = lin(look.shoes);
  if (look.soleColor) col[SLOT.soles] = lin(look.soleColor);
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
   * Gövde setinde look.top.color2 ile boyanan ikinci kumaş (gömlek/yelek, SLOT.top2) var mı: true/false; taban
   * yüklenemiyorsa null (bilinmiyor). Özelleştirme ekranı "İkinci renk" satırını buna göre gösterir.
   */
  bodySecondary(gender, set) {
    let B = null;
    try { B = this.base(gender); } catch { return null; }
    const p = B.parts[set + '_Body'];
    return p ? !!p.secondary : null;
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
      handR: rig.makeAnchor('WristR', 'handR'), handL: rig.makeAnchor('WristL', 'handL'), foreL: rig.makeAnchor('LowerArmL', 'foreL'),
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
  const E = restEntry(ch, 'Head');
  if (!E) return;
  const fem = isFemaleBase(ch.base.name);
  const geos = [];
  const col = new THREE.Color();
  const add = (geo, hex, x, y, z, sx = 1, sy = 1, sz = 1, quat = null) => {
    geo.scale(sx, sy, sz);
    if (quat) geo.applyQuaternion(quat);
    geo.translate(x - E.wpos.x, y - E.wpos.y, z - E.wpos.z);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    col.set(hex);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (geo.index) geo.deleteAttribute('uv');
    geos.push(geo);
  };
  const iris = look.eyeColor || (fem ? '#3f5a3a' : '#4a3321');
  const q = new THREE.Quaternion(), Zp = new THREE.Vector3(0, 0, 1), nrm = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
  for (const e of f.eyes) {
    const r = e.r, F = e.front;
    // göz kutusunun ön yüzüne yaslı yassı diskler, yüz normali yönünde katman katman (iris, bebek, parıltı:
    // FACE_LAYER m önde; derinlik tamponu hassasiyeti için ≥ 0,6 mm aralık). Yüz eğik (normal ≈ (0,30, −0,17, 0,94)):
    // düzlem içi kaydırmalar da yüzün kendi eksenleriyle (U, V) yapılır, yoksa üst kenardaki çizgi yüzün gerisine düşer
    nrm.set(F.nx, F.ny, F.nz); q.setFromUnitVectors(Zp, nrm);
    U.set(1, 0, 0).applyQuaternion(q); V.set(0, 1, 0).applyQuaternion(q);
    const at = (d, du = 0, dv = 0) => [F.x + nrm.x * d + U.x * du + V.x * dv, F.y + nrm.y * d + U.y * du + V.y * dv, F.z + nrm.z * d + U.z * du + V.z * dv];
    add(new THREE.SphereGeometry(r * 0.4, 12, 8), iris, ...at(FACE_LAYER[0], 0, -r * 0.03), 1, 1, 0.12, q);
    add(new THREE.SphereGeometry(r * 0.2, 8, 6), '#0c0c0c', ...at(FACE_LAYER[1], 0, -r * 0.03), 1, 1, 0.12, q);
    add(new THREE.SphereGeometry(r * 0.08, 6, 5), '#ffffff', ...at(FACE_LAYER[2], r * 0.12, r * 0.1), 1, 1, 0.3, q);
    // üst göz kapağı/kirpik çizgisi: ön yüzün üst kenarında (kadında belirgin, erkekte ince gölge; irisle çakışmaz)
    add(new THREE.SphereGeometry(r * 0.75, 10, 6), fem ? '#2a1a16' : '#3a2a22', ...at(FACE_LAYER[0], 0, r * 0.52), 1, fem ? 0.16 : 0.09, 0.1, q);
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

/**
 * Yağmacı görünümü (ZombieView): yelek, kargo pantolon, bandana/bere, taktik çanta, fişeklik. fem: karakterin tabanı
 * (zombieLook tohumla seçer); görünümün tabanı onunla aynı olmalı, yoksa applyLook kurulumu yarıda bırakır.
 */
export function raiderLook(fem = false) {
  const tops = ['#1b1b1b', '#3a2a2a', '#2c3a2c', '#4a3a2a'];
  return {
    base: fem ? 'female' : 'male', skin: ['#e0a07a', '#c98a5e', '#a86b45'][Math.floor(Math.random() * 3)], hairStyle: 'short', hairColor: '#1d1410',
    beard: fem ? 'none' : Math.random() < 0.6 ? 'stubble' : 'full', hat: Math.random() < 0.6 ? 'bandana' : 'beanie', hatColor: '#7a1a1a',
    top: { style: 'vest', color: tops[Math.floor(Math.random() * tops.length)], color2: '#5a3a2a' }, pants: { style: 'cargo', color: '#2c2c2c' }, shoes: '#1b1b1b',
    backpack: 'tactical', backpackColor: '#2c2c2c', glasses: Math.random() < 0.4 ? 'sunglasses' : 'none', gloves: 'tactical', accessory: 'bandolier', build: fem ? 0.98 : 1.05, dirt: 0.6,
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
// baş: saç hacmi dahil (şapkalar saçın üstüne oturur). Gözlükler sabit ölçekle değil yüz verisinden (combo.face) yerleşir
const HEAD_FIT = { male: { s: [0.37, 0.41, 0.38], p: [0, -0.012, -0.012] }, female: { s: [0.34, 0.39, 0.36], p: [0, -0.012, -0.012] } };
const BODY_FIT = {
  back: { s: [0.62, 0.62, 0.62], p: [0, -0.02, -0.03] }, backF: { s: [0.55, 0.58, 0.58], p: [0, -0.02, -0.02] },
  hips: { s: [0.66, 0.66, 0.66], p: [0, 0.02, 0] }, hipsF: { s: [0.6, 0.62, 0.6], p: [0, 0.02, 0] },
  chest: { s: [0.62, 0.62, 0.62], p: [0, -0.05, 0.0] }, chestF: { s: [0.56, 0.58, 0.58], p: [0, -0.05, 0.0] },
};

/** Dinlenme (T-poz) verisinde kemik kaydı (yoksa null) */
function restEntry(ch, name) { return ch.rig.restData.entries.find((e) => e && e.name === name) || null; }
/** Gövde yüzeyi (surface().torso): y satırında sol (+x) yarı genişlik (yüzeyi olan en dış hücre); yoksa varsayılan */
function torsoHalfWidth(T, y, def) {
  const TG = TORSO_GRID;
  if (!T) return def;
  const gy = Math.round((y - TG.y0) / TG.s);
  if (gy < 0 || gy >= TG.ny) return def;
  let w = -Infinity;
  for (let gx = 0; gx < TG.nx; gx++) { const x = TG.x0 + gx * TG.s; if (x > 0 && Number.isFinite(T.fz[gy * TG.nx + gx])) w = Math.max(w, x); }
  return Number.isFinite(w) ? w : def;
}
/**
 * Gövde yüzeyi, tek ızgara sütunu: göğüs hizasından (y 1,3) yukarı kesintisiz yüzeyin üstü (omuz üstü). Kopuk parçalar
 * (Punk boyun tasması gibi) sayılmaz; 1 cm satırın içinde aynı sütunun köşe yüksekliğiyle (ty) inceltilir. Yoksa −∞
 */
function columnTop(T, cx) {
  const TG = TORSO_GRID;
  if (cx < 0 || cx >= TG.nx) return -Infinity;
  let gy = Math.round((1.3 - TG.y0) / TG.s);
  if (!Number.isFinite(T.fz[gy * TG.nx + cx])) return -Infinity;
  while (gy + 1 < TG.ny && Number.isFinite(T.fz[(gy + 1) * TG.nx + cx])) gy++;
  const y = TG.y0 + gy * TG.s;
  return T.ty[cx] > y && T.ty[cx] < y + TG.s ? T.ty[cx] : y;
}
/** Gövde yüzeyi: x sütununda (±1 cm) omuz üstü; yoksa 1,47 m */
function shoulderTop(T, x) {
  const TG = TORSO_GRID;
  if (!T) return 1.47;
  const gx = Math.round((x - TG.x0) / TG.s);
  let r = -Infinity;
  for (let d = -1; d <= 1; d++) r = Math.max(r, columnTop(T, gx + d));
  return Number.isFinite(r) ? r : 1.47;
}
/**
 * Gövde yüzeyi: (x, y) noktasında ön/arka yüzey z'si; gövde dışıysa null. Noktayı çevreleyen 2×2 hücrenin en öndeki
 * (ön) ya da en arkadaki (arka) değeri alınır: eğik yüzeyde (kalça, omuz yanı) en yakın hücre noktayı gövdeye gömebilirdi
 */
function torsoZ(T, x, y, front) {
  const TG = TORSO_GRID;
  if (!T) return null;
  const fx = (x - TG.x0) / TG.s, fy = (y - TG.y0) / TG.s, A = front ? T.fz : T.bz;
  let r = null;
  for (const gx of [Math.floor(fx), Math.ceil(fx)]) for (const gy of [Math.floor(fy), Math.ceil(fy)]) {
    if (gx < 0 || gy < 0 || gx >= TG.nx || gy >= TG.ny) continue;
    const v = A[gy * TG.nx + gx];
    if (Number.isFinite(v) && (r === null || (front ? v > r : v < r))) r = v;
  }
  return r;
}
/**
 * Gövdeyi izleyen kayış şeridi: model uzayında A→B doğrusu boyunca yüzeyden 'lift' kadar önde (front) ya da arkada
 * örnekleri alınan, w genişliğinde yassı şerit. Dönüş: strapMesh için şerit tanımı (köşe çiftleri, model uzayı;
 * bağlama pozu). T: gövde yüzeyi ızgarası (surface().torso); yoksa null.
 */
function strapRibbon(T, ax, ay, bx, by, front, w, lift = 0.006, nSeg = 16) {
  if (!T) return null;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, px = -dy / L * w / 2, py = dx / L * w / 2;
  const rows = [];
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg, x = ax + dx * t, y = ay + dy * t;
    // gövde dışına taşan kenar (omuz üstü, kalça yanı): öteki kenarın yüzeyi
    const zs = [-1, 1].map((sgn) => torsoZ(T, x + sgn * px, y + sgn * py, front));
    rows.push({ x, y, z: [zs[0] ?? zs[1], zs[1] ?? zs[0]] });
  }
  // iki kenarı da gövde dışında kalan örnek: en yakın dolu örneğin yüzeyi
  const ok = rows.map((r, i) => (r.z[0] !== null ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return null;
  const pts = [];
  rows.forEach((r, i) => {
    const src = r.z[0] !== null ? r : rows[ok.reduce((b, j) => (Math.abs(j - i) < Math.abs(b - i) ? j : b), ok[0])];
    for (let k = 0; k < 2; k++) pts.push([r.x + (k ? px : -px), r.y + (k ? py : -py), src.z[k] + (front ? lift : -lift), front]);
  });
  // dış yüz: ön şerit +Z'ye, arka şerit −Z'ye bakar (MeshStandardMaterial tek yüzlü)
  return { pts, out: front ? 'front' : 'back' };
}
/**
 * Omuz üstünden geçen kayış parçası: x sütununda ön yüzeyde yF yüksekliğinden omuz üstüne çıkar, arka yüzeyde yB'ye
 * iner. Profil gövde yüzeyi ızgarasının 1 cm satırlarından alınır (şerit genişliğindeki sütunların en öndeki/en arkadaki
 * yüzeyi + lift: omzun YZ kesitindeki dış çizgisi). Ön/arka kayış şeritlerinin üst uçlarını birleştirir.
 */
function shoulderStrap(T, x, yF, yB, w, lift = 0.006) {
  const TG = TORSO_GRID;
  if (!T) return null;
  // her kenar kendi sütunlarından: trapez kası boyundan dışa doğru alçalır; iki kenar şeridin
  // en yüksek sütununa göre aynı yükseklikte kurulunca dış kenar eğimli omzun 2–3 cm üstünde havada duruyordu.
  // İki kenar aynı ızgara satırlarında eşlenir; kendi omuz üstünü geçmiş kenar o satırlarda kendi tepe noktasında kalır
  // (köşeler yalnız gerçek profil noktalarında: ara kirişe nokta konmaz, yuvarlak omuz köşesine gömülmez)
  const edge = (ex, inward) => {
    // kenarın iki yanındaki sütunlar ve 1 cm içerisi (yuvarlak omuz tepesinde arka yüzey 1 cm içinde 2 cm değişir)
    const u = (ex - TG.x0) / TG.s, g1 = Math.round((ex + inward * 0.01 - TG.x0) / TG.s);
    const gx0 = Math.max(0, Math.min(Math.floor(u), g1)), gx1 = Math.min(TG.nx - 1, Math.max(Math.ceil(u), g1));
    const row = (gy) => {
      let f = -Infinity, b = Infinity;
      for (let gx = gx0; gx <= gx1; gx++) { const k = gy * TG.nx + gx; if (T.fz[k] > f) f = T.fz[k]; if (T.bz[k] < b) b = T.bz[k]; }
      return Number.isFinite(f) && Number.isFinite(b) ? [f, b] : null;
    };
    // omuz üstü: kenar sütunlarının kesintisiz yüzey üstlerinin en yükseği (boyun tasması gibi kopuk parçalar hariç)
    let top = -Infinity;
    for (let gx = gx0; gx <= gx1; gx++) top = Math.max(top, columnTop(T, gx));
    if (!Number.isFinite(top)) return null;
    const gTop = Math.floor((top - TG.y0) / TG.s + 1e-6);
    let mid = null;
    for (let gy = gTop; gy >= 0 && mid === null; gy--) { const r = row(gy); if (r) mid = (r[0] + r[1]) / 2; }
    if (mid === null) return null;
    // başlangıç (yF, ön kayışın üst ucu): çevreleyen iki satırın öndeki yüzeyi (göğüs aşağı doğru öne çıkıyorsa gömülmesin)
    const r0 = row(Math.max(0, Math.floor((yF - TG.y0) / TG.s)));
    return { row, top, gTop, mid, f0: r0 ? r0[0] + lift : -Infinity };
  };
  let ea = edge(x - w / 2, 1), eb = edge(x + w / 2, -1);
  if (!ea && !eb) return null;
  ea = ea || eb; eb = eb || ea; // bir kenarın altında yüzey yoksa diğerininki (eski tek profil davranışı)
  const xa = x - w / 2, xb = x + w / 2, pts = [];
  const gStart = Math.max(0, Math.ceil((yF - TG.y0) / TG.s)), gMax = Math.max(ea.gTop, eb.gTop);
  const topPt = (e) => [e.top + lift, e.mid, true];
  // ön (aşağıdan yukarı): her kenar kendi satırında ön yüzeyin lift önünde; kendi tepesinin üstündeki satırlarda tepesinde
  const fa = [], fb = [];
  for (let gy = gStart; gy <= gMax; gy++) {
    const y = TG.y0 + gy * TG.s;
    const ra = gy <= ea.gTop ? ea.row(gy) : null, rb = gy <= eb.gTop ? eb.row(gy) : null;
    if (!ra && !rb) continue;
    fa.push(ra ? [y, ra[0] + lift, true] : gy > ea.gTop ? topPt(ea) : fa.length ? fa[fa.length - 1] : null);
    fb.push(rb ? [y, rb[0] + lift, true] : gy > eb.gTop ? topPt(eb) : fb.length ? fb[fb.length - 1] : null);
  }
  // satırı olmayan kenarın baştaki boşlukları ilk gerçek noktasıyla doldurulur
  for (const arr of [fa, fb]) { const first = arr.find(Boolean); for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = first; }
  if (!fa.length || !fa[0] || !fb[0]) return null;
  pts.push([xa, yF, Math.max(fa[0][1], ea.f0), true], [xb, yF, Math.max(fb[0][1], eb.f0), true]);
  for (let i = 0; i < fa.length; i++) pts.push([xa, ...fa[i]], [xb, ...fb[i]]);
  pts.push([xa, ...topPt(ea)], [xb, ...topPt(eb)]);
  // arka (yukarıdan aşağı): kendi tepesinin üstündeki satırlarda kenar tepesinde bekler
  for (let gy = gMax; gy >= 0 && TG.y0 + gy * TG.s >= yB; gy--) {
    const y = TG.y0 + gy * TG.s;
    const ra = gy <= ea.gTop ? ea.row(gy) : null, rb = gy <= eb.gTop ? eb.row(gy) : null;
    if (!ra && !rb) continue;
    const pa = ra ? [y, ra[1] - lift, false] : gy > ea.gTop ? topPt(ea) : null, pb = rb ? [y, rb[1] - lift, false] : gy > eb.gTop ? topPt(eb) : null;
    const la = pts[pts.length - 2], lb = pts[pts.length - 1];
    pts.push(pa ? [xa, ...pa] : la, pb ? [xb, ...pb] : lb);
  }
  // önden arkaya ilerleyen şeritte dış yüz arka şeridinkiyle aynı sırada (önceki sol, önceki sağ, şimdiki sol)
  return { pts, out: 'back' };
}
/**
 * Gövde yüzeyindeki (x, y) noktasının deri ağırlıkları: ızgara hücresinin en öndeki (front) ya da en arkadaki
 * üçgeninden ağırlık merkezli (XY) karışım; en büyük 4 kemik. Hücre boşsa 3 hücreye kadar komşulara bakılır.
 */
function skinAt(c, T, x, y, front) {
  const TG = TORSO_GRID, tris = c.geo.index.array, P = c.geo.attributes.position.array;
  const SI = c.geo.attributes.skinIndex.array, SW = c.geo.attributes.skinWeight.array;
  const gx = Math.round((x - TG.x0) / TG.s), gy = Math.round((y - TG.y0) / TG.s);
  let t = -1;
  for (let r = 0; r <= 3 && t < 0; r++) for (let dy = -r; dy <= r && t < 0; dy++) for (let dx = -r; dx <= r && t < 0; dx++) {
    const cx = gx + dx, cy = gy + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || cx < 0 || cy < 0 || cx >= TG.nx || cy >= TG.ny) continue;
    t = (front ? T.ft : T.bt)[cy * TG.nx + cx];
  }
  if (t < 0) return null;
  const v = [tris[t], tris[t + 1], tris[t + 2]], X = v.map((i) => P[i * 3]), Y = v.map((i) => P[i * 3 + 1]);
  const den = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]);
  let l = [1 / 3, 1 / 3, 1 / 3];
  if (Math.abs(den) > 1e-12) {
    const l1 = ((Y[1] - Y[2]) * (x - X[2]) + (X[2] - X[1]) * (y - Y[2])) / den, l2 = ((Y[2] - Y[0]) * (x - X[2]) + (X[0] - X[2]) * (y - Y[2])) / den;
    l = [l1, l2, 1 - l1 - l2].map((q) => Math.max(0, q));
    const sum = l[0] + l[1] + l[2] || 1;
    l = l.map((q) => q / sum);
  }
  const acc = new Map();
  for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) { const w = SW[v[j] * 4 + k] * l[j]; if (w > 0) acc.set(SI[v[j] * 4 + k], (acc.get(SI[v[j] * 4 + k]) || 0) + w); }
  const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((q, e) => q + e[1], 0) || 1;
  return { i: [0, 1, 2, 3].map((k) => (top[k] ? top[k][0] : 0)), w: [0, 1, 2, 3].map((k) => (top[k] ? top[k][1] / sum : 0)) };
}
/**
 * Kayış şeritlerini tek derili ağda birleştirir (tek çizim çağrısı): köşeler altlarındaki gövde yüzeyinin deri
 * ağırlıklarını alır, gövdeyle aynı iskelete bağlanır. Böylece kayış omuz, göğüs ve karın kemikleriyle birlikte bükülür
 * (göğse katı bağlı şerit bekleme pozunda bile omuz başında gövdeye gömülüyordu). Bulunamayan köşe Chest kemiğine bağlanır.
 */
function strapMesh(ch, strips, mat) {
  const c = ch.combo, T = c && c.surf && c.surf.torso, skel = ch.mesh && ch.mesh.skeleton;
  strips = strips.filter(Boolean);
  if (!T || !skel || !strips.length) return null;
  const chestI = Math.max(0, skel.bones.findIndex((b) => b.name === 'Chest'));
  const pos = [], si = [], sw = [], idx = [];
  for (const s of strips) {
    const base = pos.length / 3;
    for (const [x, y, z, f] of s.pts) {
      pos.push(x, y, z);
      const k = skinAt(c, T, x, y, f);
      if (k) { si.push(...k.i); sw.push(...k.w); } else { si.push(chestI, 0, 0, 0); sw.push(1, 0, 0, 0); }
    }
    for (let r = 1; r < s.pts.length / 2; r++) {
      const a = base + (r - 1) * 2;
      if (s.out === 'front') idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.SkinnedMesh(g, mat);
  m.name = 'straps';
  // gövdenin bağlama matrisiyle (birim): iskeletin ters matrisleri yeniden hesaplanmaz; ağın kendi konumu önemsizdir
  m.bind(skel, ch.mesh.bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}
/**
 * Gövdeye yaslı (sallanmayan) aksesuar grubu: Avatar.secondary sırt/kalça/göğüs gruplarını koşarken sallar; gövde
 * yüzeyini izleyen kayış şeritleri sallanırsa göğse gömülür ya da havada kalır (userData.fixed: sallanma yok)
 */
function fixedGroup(anchor) { const g = accGroup(anchor); g.userData.fixed = true; return g; }
function buildAccessories(ch, look) {
  // Aksesuar ölçüleri eski (iri başlı) modelin birimlerinde yazılmıştır: gruplar yeni bedene ölçeklenir.
  const fem = isFemaleBase(ch.base.name);
  const fit = fem ? 'female' : 'male';
  const modular = !!ch.base.modular;
  const head = accGroup(ch.anchors.head, HEAD_FIT[fit]);
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
  // ---- gözlük: göz merkezlerinden (combo.face; buildFace ile aynı veri, Head noktasına göre metre). Eski sabit konum
  // (FACE_FIT, y 0,28 / z 0,335) modüler kafalarda gözlerin ≈ 4 cm altında ve yüzün ≈ 3 cm içinde kalıyordu.
  // Yüz verisi yoksa (Swat kaskı: göz yok) gözlük çizilmez.
  const F = ch.combo && ch.combo.face, EH = restEntry(ch, 'Head');
  if (look.glasses && look.glasses !== 'none' && F && EH) {
    const g = accGroup(ch.anchors.head);
    g.name = 'glasses';
    const sun = look.glasses === 'sunglasses', round = look.glasses === 'round', gog = look.glasses === 'goggles';
    const gm = M(sun ? '#111' : '#2c2c2c', { metalness: 0.4, roughness: 0.35 });
    const lensM = M(sun ? '#1a1a1a' : '#bfe4ff', { transparent: !sun, opacity: 0.45, roughness: 0.05, metalness: 0.3 });
    const ey = (F.eyes[0].y + F.eyes[1].y) / 2 + 0.002 - EH.wpos.y, ez = Math.max(F.eyes[0].z, F.eyes[1].z) + GLASS_DZ - EH.wpos.z;
    const R = Math.max(0.017, F.eyes[0].r * 1.15), TW = fem ? GLASS_TEMPLE.female : GLASS_TEMPLE.male;
    const xs = F.eyes.map((e) => e.x - EH.wpos.x);
    if (gog) {
      for (const x of xs) {
        g.add(mesh(new THREE.CylinderGeometry(R * 1.1, R * 1.1, 0.014, 14), M('#4a5a3a'), x, ey, ez - 0.004, Math.PI / 2));
        g.add(mesh(new THREE.CircleGeometry(R * 0.95, 14), lensM, x, ey, ez + 0.0035));
      }
      // kayış: baş çevresinde göz hizasında basık halka (arkası saçın içinde kalabilir)
      const zb = (fem ? -0.07 : -0.065) - EH.wpos.z, zf = ez - 0.01;
      g.add(mesh(new THREE.TorusGeometry(1, 0.08, 4, 24), M('#2c2c2c'), 0, ey, (zf + zb) / 2, Math.PI / 2, 0, 0, TW + 0.004, (zf - zb) / 2, 0.12));
    } else {
      // kare çerçeve/cam: dörtgen önce 45° döndürülüp sonra en/boy ölçeklenir (dikdörtgen; ters sırada eğik eşkenar dörtgen olurdu)
      const sq = (geo) => geo.rotateZ(Math.PI / 4);
      for (const [i, x] of xs.entries()) {
        const out = Math.sign(x) || (i ? 1 : -1);
        if (round) {
          g.add(mesh(new THREE.TorusGeometry(R, 0.0022, 6, 18), gm, x, ey, ez));
          g.add(mesh(new THREE.CircleGeometry(R * 0.96, 18), lensM, x, ey, ez - 0.0008));
        } else {
          g.add(mesh(sq(new THREE.TorusGeometry(R * 1.05, 0.0022, 4, 4)), gm, x, ey, ez, 0, 0, 0, 1.15, 0.85, 1));
          g.add(mesh(sq(new THREE.CircleGeometry(R, 4)), lensM, x, ey, ez - 0.0008, 0, 0, 0, 1.15, 0.85, 1));
        }
        // sap: çerçevenin dış kenarından (cam düzlemi) şakağa (kulak yönüne, geriye) doğru; kafa yanına yaslanır
        const x0 = x + out * R * (round ? 1 : 0.854), x1 = out * TW - EH.wpos.x, z1 = 0.075 - EH.wpos.z, len = Math.hypot(x1 - x0, ez - z1);
        g.add(mesh(new THREE.BoxGeometry(0.003, 0.003, len), gm, (x0 + x1) / 2, ey + 0.004, (ez + z1) / 2, 0, Math.atan2(x1 - x0, z1 - ez), 0));
      }
      // köprü (burun üstü)
      g.add(mesh(new THREE.BoxGeometry(Math.abs(xs[0] - xs[1]) - 2 * R + 0.002, 0.003, 0.003), gm, (xs[0] + xs[1]) / 2, ey + 0.004, ez - 0.001));
    }
  }
  // ---- sırt çantaları (UpperChest noktası: sırt yüzeyi z ≈ -0.14)
  const bpc = look.backpackColor || '#556b2f';
  const bpM = M(bpc), bpM2 = M(shade(bpc, -0.15));
  const strapM = M('#2c2c2c');
  // gövde yüzeyi ve bilek kesiti (tembel: yalnız kayış, omuz çantası ya da kol saati istendiğinde ölçülür)
  let surf = null;
  const S = () => surf || (surf = ch.combo && ch.base.surface ? ch.base.surface(ch.combo) : { wrist: null, torso: null });
  const straps = () => {
    for (const s of [-1, 1]) back.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.34), strapM, s * 0.12, -0.08, -0.02));
    // ön askılar: göğüs yüzeyini izleyen şerit (kutu askıların ön yüzü göğsün 2–6 cm içinde kalıyordu: önden
    // görünmüyordu); omuz üstünden sırta geçen parça ön askıyı arkadaki askıya bağlar
    const T = S().torso, strips = [];
    for (const s of [-1, 1]) {
      const x = s * (fem ? 0.072 : 0.078), top = shoulderTop(T, x) - 0.02;
      strips.push(strapRibbon(T, x, top, s * (fem ? 0.08 : 0.088), fem ? 1.22 : 1.2, true, 0.04), shoulderStrap(T, x, top, top - 0.1, 0.04));
    }
    const m = strapMesh(ch, strips, strapM);
    if (m) fixedGroup(ch.anchors.chest).add(m);
  };
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
    case 'satchel': {
      // omuz çantası: sağ omuzdan (x −) sol kalçaya (x +) çapraz kayış; ön ve arka şeritler gövde yüzeyini izler
      // (surface().torso), omuz üstünden geçen parça ikisini birleştirir; yassı çanta sol kalçada (Hips noktası, metre)
      const T = S().torso;
      const sx = fem ? -0.085 : -0.095, sy = shoulderTop(T, sx) - 0.025;
      const hx = fem ? 0.12 : 0.15, hy = fem ? 1.0 : 0.92;
      const m = strapMesh(ch, [strapRibbon(T, sx, sy, hx, hy, true, 0.045), strapRibbon(T, sx, sy, hx, hy, false, 0.045), shoulderStrap(T, sx, sy, sy, 0.045)], M(shade(bpc, -0.25)));
      if (m) fixedGroup(ch.anchors.chest).add(m);
      // çanta: kayışın ucunda, sol kalçanın dış yüzeyine yaslı (kalça yarı genişliği gövde yüzeyinden; metre, Hips noktasına
      // göre). Kalçanın arka yarısında (z −0,17…0,07): bekleme pozunda sol el (bilek z ≈ 0,13–0,15) çantanın önünde kalır
      const EHp = restEntry(ch, 'Hips');
      if (EHp) {
        // kalça yarı genişliği çantanın tüm yüksekliği boyunca (yalnız orta satırda ölçülünce Formal/Suit kalçası çantanın
        // alt kenarında 1 cm içeri giriyordu); çanta kayış gibi sabit grup: ikincil salınım onu uyluğa gömüyor, kayışın
        // ucundan da ayırıyordu (Avatar.secondary userData.fixed grupları atlar)
        const by = hy - 0.09, bz = -0.05;
        let hwid = 0;
        for (let y = by - 0.1; y <= by + 0.1 + 1e-6; y += 0.02) hwid = Math.max(hwid, torsoHalfWidth(T, y, fem ? 0.17 : 0.16));
        const bx = hwid + 0.012 + 0.03;
        const bag = fixedGroup(ch.anchors.hips);
        bag.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.24), bpM, bx - EHp.wpos.x, by - EHp.wpos.y, bz - EHp.wpos.z));
        bag.add(mesh(new THREE.BoxGeometry(0.066, 0.09, 0.246), bpM2, bx + 0.003 - EHp.wpos.x, by + 0.06 - EHp.wpos.y, bz - EHp.wpos.z));
      }
      break;
    }
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
    case 'watch': {
      // kol saati: sol ön kol (LowerArmL noktası; dinlenmede +X dirsekten bileğe, +Y el sırtı, +Z başparmak yanı),
      // bilek ekleminin WATCH_AT gerisinde. Oradaki deri tamamen ön kol kemiğine bağlı: saat bileğe değil ön kola takılır
      // (bilek bükülünce kola gömülmesin). Kayış kombinasyonun kesitine oturur (çıplak bilek, kol yeni, manşet: surface().wrist)
      const wr = S().wrist || (fem ? { y0: -0.02, y1: 0.016, h0: -0.03, h1: 0.03 } : { y0: -0.024, y1: 0.02, h0: -0.034, h1: 0.034 });
      const ef = restEntry(ch, 'LowerArmL'), ew = restEntry(ch, 'WristL');
      const ax = (ef && ew ? ef.wpos.distanceTo(ew.wpos) : 0.26) - WATCH_AT;
      const cy = (wr.y0 + wr.y1) / 2, cz = (wr.h0 + wr.h1) / 2, ry = (wr.y1 - wr.y0) / 2 + 0.0025, rz = (wr.h1 - wr.h0) / 2 + 0.0025;
      const w = accGroup(ch.anchors.foreL || ch.anchors.handL);
      w.name = 'watch';
      w.add(mesh(new THREE.TorusGeometry(1, 0.11, 5, 24), M('#2a2622', { roughness: 0.7 }), ax, cy, cz, 0, Math.PI / 2, 0, rz, ry, 0.06));
      w.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), M('#c8ccd0', { metalness: 0.7, roughness: 0.3 }), ax, cy + ry + 0.003, cz));
      w.add(mesh(new THREE.CircleGeometry(0.0095, 16), M('#10202a', { roughness: 0.12, metalness: 0.2, emissive: '#0b1c26' }), ax, cy + ry + 0.0062, cz, -Math.PI / 2));
      break;
    }
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
