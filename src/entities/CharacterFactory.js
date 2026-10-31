// Karakter üretimi: Kenney CC0 iskeletli modeli + prosedürel doku boyama (ten, saç, kıyafet)
// + kemiklere bağlı 3D aksesuarlar (saç modelleri, şapka, gözlük, çanta...).
// Tüm Kenney karakterleri aynı ağı ve UV düzenini paylaşır; görünüm tamamen dokuyla değişir.
import * as THREE from 'three';
import { CharacterRig } from './CharacterRig.js';
import { RNG } from '../core/util.js';

export const CHAR_SCALE = 0.74; // 2.41 birim → ~1.78 m

// UV bölgeleri (0..1)
const UV = {
  head: [0, 0, 0.625, 0.48], shirt: [0, 0.48, 0.6, 1.0], torsoFront: [0.16, 0.74, 0.47, 1.0], torsoBack: [0.16, 0.48, 0.47, 0.74],
  armL: [0, 0.48, 0.16, 1.0], armR: [0.47, 0.48, 0.6, 1.0], shoes: [0.625, 0, 0.8, 0.51], hands: [0.8, 0, 1.0, 0.51],
  misc: [0.6, 0.51, 1.0, 0.75], pants: [0.6, 0.75, 1.0, 1.0],
};

export const BASE_FACES = {
  'survivor-male': 'Sakin', 'male': 'Sert Bakışlı', 'skater-male': 'Neşeli', 'survivor-female': 'Kararlı', 'skater-female': 'Asi', 'cyborg-female': 'Siber (Kıyamet)',
};

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
    look: { base: 'survivor-male', skin: '#e0a07a', hairStyle: 'short', hairColor: '#3b2314', beard: 'full', hat: 'cap', hatColor: '#6f7880', top: { style: 'jacket', color: '#2c4a74', color2: '#e0b13a' }, pants: { style: 'cargo', color: '#4a4036' }, shoes: '#5a3a22', backpack: 'toolbag', backpackColor: '#8a5a2b', glasses: 'none', gloves: 'none', accessory: 'toolbelt', build: 1.04, dirt: 0.35 },
  },
  zulal: {
    id: 'zulal', name: 'ZÜLAL', role: 'Kaşif', color: '#ff4fa3',
    bio: 'Mahallenin en hızlısı. Kilitli kapı ona sadece bir bulmaca. Sessiz ve meraklı.',
    perks: ['%12 daha hızlı hareket', 'Sessiz hareket (zombiler daha geç fark eder)', 'Kilit açmada çok başarılı'],
    start: [['flashlight', 1], ['lockpick', 3], ['energy_drink', 1]],
    stats: { health: 90, stamina: 115, speed: 1.12, melee: 0.95, aim: 1.0, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.5, lockpick: 2.0, hunt: 1.0 },
    look: { base: 'skater-female', skin: '#efb994', hairStyle: 'messy', hairColor: '#ff4fa3', beard: 'none', hat: 'none', top: { style: 'tank', color: '#6a3d7a', color2: '#2c2c2c' }, pants: { style: 'cargo', color: '#3a3a40' }, shoes: '#2c2c2c', backpack: 'small', backpackColor: '#3a3a40', glasses: 'none', gloves: 'none', accessory: 'necklace', build: 0.94, dirt: 0.25 },
  },
  deniz: {
    id: 'deniz', name: 'DENİZ', role: 'Savaşçı', color: '#e8432e',
    bio: 'Kick-boks şampiyonu. Takımını korumak için her zaman en önde. Gözlüğü hep alnında.',
    perks: ['Silah kullanımında isabet ve hasar bonusu', 'Daha yüksek başlangıç dayanıklılığı', 'Savunmada daha az hasar alır'],
    start: [['vest', 1], ['bat', 1], ['bandage', 2]],
    stats: { health: 125, stamina: 110, speed: 1.0, melee: 1.25, aim: 1.2, build: 1.0, repair: 1.0, heal: 1.0, stealth: 0.9, lockpick: 1.0, hunt: 1.0, armor: 0.85 },
    look: { base: 'skater-male', skin: '#efb994', hairStyle: 'messy', hairColor: '#1d1410', beard: 'none', hat: 'goggleband', hatColor: '#3a3a3a', top: { style: 'hoodie', color: '#b8952e', color2: '#7f8c8d' }, pants: { style: 'jeans', color: '#3d4f6a' }, shoes: '#ecf0f1', backpack: 'tactical', backpackColor: '#4a4a3a', glasses: 'none', gloves: 'tactical', accessory: 'none', build: 1.0, dirt: 0.3 },
  },
  elif: {
    id: 'elif', name: 'ELİF', role: 'Avcı', color: '#27ae60',
    bio: 'Dağlarda büyüdü. İz sürer, uzaktan nişan alır, ormanda kaybolmaz.',
    perks: ['Avlanmada ve balıkçılıkta avantaj', 'Hayvan izlerini ve kaynakları haritada görür', 'Uzak mesafe atışlarda isabet bonusu'],
    start: [['binoculars', 1], ['bow', 1], ['arrow', 12], ['knife', 1]],
    stats: { health: 100, stamina: 110, speed: 1.05, melee: 1.0, aim: 1.3, build: 1.0, repair: 1.0, heal: 1.0, stealth: 1.25, lockpick: 1.0, hunt: 1.8 },
    look: { base: 'survivor-female', skin: '#f6d0b1', hairStyle: 'ponytail', hairColor: '#7a2a1a', beard: 'none', hat: 'cap', hatColor: '#d35400', top: { style: 'tshirt', color: '#c9a83a', color2: '#5b4636' }, pants: { style: 'cargo', color: '#5b5036' }, shoes: '#6b4226', backpack: 'hiking', backpackColor: '#556b2f', glasses: 'none', gloves: 'none', accessory: 'binoculars', build: 0.95, dirt: 0.3 },
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
    look: { base: 'survivor-female', skin: '#f6d0b1', hairStyle: 'bun', hairColor: '#5b3420', beard: 'none', hat: 'none', top: { style: 'coat', color: '#f4f6f6', color2: '#a33a3a' }, pants: { style: 'jeans', color: '#34495e' }, shoes: '#ecf0f1', backpack: 'doctor', backpackColor: '#c0392b', glasses: 'round', gloves: 'none', accessory: 'stethoscope', build: 0.95, dirt: 0.1 },
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

// ------------------------------------------------------------------- doku boyama
// Not: THREE.Color doğrusal (linear) çalışır; tuval işlemleri sRGB uzayında yapılmalı.
function hexRgb(h) { const c = new THREE.Color(h); const o = {}; c.getRGB(o, THREE.SRGBColorSpace); return [o.r * 255, o.g * 255, o.b * 255]; }
function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

export class CharacterFactory {
  constructor(assets) {
    this.assets = assets;
    this.baseImages = {};
    this.headMasks = {};
    this.cache = new Map();
    this.S = 512;
  }

  /** Kenney modelindeki gömülü dokuyu al */
  baseImage(base) {
    if (this.baseImages[base]) return this.baseImages[base];
    const src = this.assets.index['chars/' + base];
    let img = null;
    src.traverse((o) => { if (o.isMesh && o.material && o.material.map) img = o.material.map.image; });
    const c = document.createElement('canvas');
    c.width = c.height = this.S;
    const g = c.getContext('2d');
    if (img) g.drawImage(img, 0, 0, this.S, this.S);
    const data = g.getImageData(0, 0, this.S, this.S);
    this.baseImages[base] = { canvas: c, data };
    return this.baseImages[base];
  }

  /** Baş bölgesi maskesi: 0 diğer, 1 ten, 2 saç, 3 yüz detayı */
  headMask(base) {
    if (this.headMasks[base]) return this.headMasks[base];
    const S = this.S;
    const { data } = this.baseImage(base);
    const d = data.data;
    const W = Math.floor(UV.head[2] * S), H = Math.floor(UV.head[3] * S);
    const mask = new Uint8Array(S * S);
    // ten rengi: boyun bölgesinden örnek
    const sx = Math.floor(0.31 * S), sy = Math.floor(0.42 * S);
    const k0 = (sy * S + sx) * 4;
    const skin = [d[k0], d[k0 + 1], d[k0 + 2]];
    const near = (k, t = 40) => Math.abs(d[k] - skin[0]) + Math.abs(d[k + 1] - skin[1]) + Math.abs(d[k + 2] - skin[2]) < t;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * S + x) * 4; if (near(k, 60)) mask[y * S + x] = 1; }
    // saç: üst kenardan ten olmayan piksellerde taşma doldurma
    const stack = [];
    for (let x = 0; x < W; x++) if (!mask[x]) stack.push(x);
    for (let y = 0; y < H; y++) { if (!mask[y * S]) stack.push(y * S); if (!mask[y * S + W - 1]) stack.push(y * S + W - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (mask[p]) continue;
      mask[p] = 2;
      const x = p % S, y = (p / S) | 0;
      if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - S); if (y < H - 1) stack.push(p + S);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!mask[y * S + x]) mask[y * S + x] = 3;
    this.headMasks[base] = { mask, skin };
    return this.headMasks[base];
  }

  paint(look) {
    const key = JSON.stringify(look);
    if (this.cache.has(key)) return this.cache.get(key);
    const S = this.S;
    const base = look.base || 'survivor-male';
    const { data } = this.baseImage(base);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const out = g.createImageData(S, S);
    const od = out.data, sd = data.data;
    const { mask, skin } = this.headMask(base);
    const skinT = hexRgb(look.skin || '#e0a07a');
    const hairT = hexRgb(look.hairColor || '#3b2314');
    const skinL = Math.max(20, lum(...skin));
    // saç ortalaması (ışıklık referansı)
    let hl = 0, hn = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] === 2) { hl += lum(sd[i * 4], sd[i * 4 + 1], sd[i * 4 + 2]); hn++; }
    const hairL = Math.max(15, hn ? hl / hn : 60);
    for (let i = 0; i < S * S; i++) {
      const k = i * 4;
      const m = mask[i];
      const L = lum(sd[k], sd[k + 1], sd[k + 2]);
      if (m === 1 || (m === 2 && look.hairStyle === 'bald')) {
        const f = Math.min(1.35, (m === 1 ? L / skinL : 0.92));
        od[k] = skinT[0] * f; od[k + 1] = skinT[1] * f; od[k + 2] = skinT[2] * f;
      } else if (m === 2) {
        const f = Math.min(1.6, 0.75 + (L / hairL) * 0.35);
        od[k] = hairT[0] * f; od[k + 1] = hairT[1] * f; od[k + 2] = hairT[2] * f;
      } else {
        od[k] = sd[k]; od[k + 1] = sd[k + 1]; od[k + 2] = sd[k + 2];
      }
      od[k + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    const R = (r, col) => { g.fillStyle = col; g.fillRect(r[0] * S, r[1] * S, (r[2] - r[0]) * S, (r[3] - r[1]) * S); };
    const X = (u) => u * S, Y = (v) => v * S;
    const skinHex = look.skin || '#e0a07a';
    // ---- sakal
    const bc = shade(look.hairColor || '#3b2314', -0.05);
    if (look.beard && look.beard !== 'none') {
      g.fillStyle = bc;
      g.globalAlpha = look.beard === 'stubble' ? 0.45 : 1;
      if (look.beard === 'full' || look.beard === 'stubble') {
        g.beginPath(); g.ellipse(X(0.315), Y(0.305), X(0.105), Y(0.075), 0, 0, Math.PI * 2); g.fill();
        g.fillRect(X(0.205), Y(0.2), X(0.035), Y(0.1)); g.fillRect(X(0.39), Y(0.2), X(0.035), Y(0.1));
        g.fillRect(X(0.21), Y(0.26), X(0.21), Y(0.06));
        g.globalAlpha = 1;
        if (look.beard === 'full') { g.fillStyle = skinHex; g.beginPath(); g.ellipse(X(0.315), Y(0.262), X(0.03), Y(0.009), 0, 0, Math.PI * 2); g.fill(); }
      } else if (look.beard === 'goatee') {
        g.beginPath(); g.ellipse(X(0.315), Y(0.3), X(0.035), Y(0.04), 0, 0, Math.PI * 2); g.fill();
        g.fillRect(X(0.285), Y(0.245), X(0.06), Y(0.012));
      } else if (look.beard === 'mustache') {
        g.beginPath(); g.ellipse(X(0.3), Y(0.248), X(0.024), Y(0.009), 0.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(X(0.33), Y(0.248), X(0.024), Y(0.009), -0.2, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // ---- üst kıyafet
    const top = look.top || { style: 'tshirt', color: '#2980b9' };
    const tc = top.color, tc2 = top.color2 || shade(tc, -0.25);
    R(UV.shirt, tc);
    const sleeveSkin = (u0a, u1a, u0b, u1b) => { g.fillStyle = skinHex; g.fillRect(X(u0a), Y(0.48), X(u1a - u0a), Y(0.52)); g.fillRect(X(u0b), Y(0.48), X(u1b - u0b), Y(0.52)); };
    switch (top.style) {
      case 'tshirt': case 'sport':
        sleeveSkin(0, 0.1, 0.5, 0.6);
        g.fillStyle = shade(tc, -0.2); g.fillRect(X(0.1), Y(0.48), X(0.012), Y(0.52)); g.fillRect(X(0.488), Y(0.48), X(0.012), Y(0.52));
        neckline(g, S, skinHex, 'round');
        if (top.style === 'sport') { g.fillStyle = tc2; g.fillRect(X(0.16), Y(0.8), X(0.31), Y(0.04)); g.fillRect(X(0.16), Y(0.55), X(0.31), Y(0.04)); }
        else { g.fillStyle = tc2; g.beginPath(); g.arc(X(0.315), Y(0.86), X(0.035), 0, Math.PI * 2); g.fill(); }
        break;
      case 'longsleeve':
        neckline(g, S, skinHex, 'round');
        g.fillStyle = shade(tc, -0.15); g.fillRect(0, Y(0.48), X(0.012), Y(0.52)); g.fillRect(X(0.588), Y(0.48), X(0.012), Y(0.52));
        break;
      case 'tank':
        sleeveSkin(0, 0.165, 0.47, 0.6);
        g.fillStyle = skinHex; g.fillRect(X(0.16), Y(0.74), X(0.05), Y(0.03)); g.fillRect(X(0.42), Y(0.74), X(0.05), Y(0.03));
        neckline(g, S, skinHex, 'deep');
        g.fillStyle = tc2; g.fillRect(X(0.16), Y(0.96), X(0.31), Y(0.04));
        break;
      case 'jacket': case 'vest': {
        if (top.style === 'vest') { R(UV.armL, tc2); R(UV.armR, tc2); sleeveSkin(0, 0.08, 0.52, 0.6); }
        // iç tişört üçgeni
        g.fillStyle = top.style === 'vest' ? tc2 : tc2; g.beginPath(); g.moveTo(X(0.27), Y(0.74)); g.lineTo(X(0.36), Y(0.74)); g.lineTo(X(0.315), Y(0.83)); g.closePath(); g.fill();
        g.fillStyle = shade(tc, -0.35); g.fillRect(X(0.312), Y(0.83), X(0.006), Y(0.17)); // fermuar
        g.fillStyle = shade(tc, -0.15); g.fillRect(X(0.19), Y(0.88), X(0.07), Y(0.06)); g.fillRect(X(0.37), Y(0.88), X(0.07), Y(0.06)); // cepler
        g.fillStyle = shade(tc, -0.25); g.fillRect(X(0.16), Y(0.735), X(0.31), Y(0.018)); // yaka
        if (top.style === 'vest') { for (let i = 0; i < 3; i++) { g.fillStyle = shade(tc, 0.12); g.fillRect(X(0.18 + i * 0.1), Y(0.92), X(0.07), Y(0.06)); } }
        else { g.fillStyle = shade(tc, -0.2); g.fillRect(0, Y(0.48), X(0.015), Y(0.52)); g.fillRect(X(0.585), Y(0.48), X(0.015), Y(0.52)); }
        break;
      }
      case 'hoodie':
        neckline(g, S, skinHex, 'round');
        g.fillStyle = shade(tc, -0.12); g.fillRect(X(0.21), Y(0.9), X(0.21), Y(0.09)); // kanguru cebi
        g.fillStyle = '#f0f0f0'; g.fillRect(X(0.295), Y(0.76), X(0.005), Y(0.07)); g.fillRect(X(0.33), Y(0.76), X(0.005), Y(0.07));
        g.fillStyle = shade(tc, -0.22); g.fillRect(X(0.16), Y(0.66), X(0.31), Y(0.08)); // kapüşon sırtta
        g.fillStyle = shade(tc, -0.2); g.fillRect(0, Y(0.48), X(0.015), Y(0.52)); g.fillRect(X(0.585), Y(0.48), X(0.015), Y(0.52));
        break;
      case 'coat':
        g.fillStyle = tc2; g.beginPath(); g.moveTo(X(0.26), Y(0.74)); g.lineTo(X(0.37), Y(0.74)); g.lineTo(X(0.315), Y(0.9)); g.closePath(); g.fill();
        g.fillStyle = shade(tc, -0.12); g.beginPath(); g.moveTo(X(0.25), Y(0.74)); g.lineTo(X(0.27), Y(0.74)); g.lineTo(X(0.315), Y(0.92)); g.lineTo(X(0.305), Y(0.94)); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(X(0.38), Y(0.74)); g.lineTo(X(0.36), Y(0.74)); g.lineTo(X(0.315), Y(0.92)); g.lineTo(X(0.325), Y(0.94)); g.closePath(); g.fill();
        g.fillStyle = shade(tc, -0.1); g.fillRect(X(0.19), Y(0.9), X(0.06), Y(0.05)); g.fillRect(X(0.38), Y(0.9), X(0.06), Y(0.05));
        g.fillStyle = '#3498db'; g.fillRect(X(0.39), Y(0.82), X(0.012), Y(0.04));
        break;
      case 'flannel': {
        neckline(g, S, skinHex, 'v');
        g.globalAlpha = 0.55; g.fillStyle = tc2;
        for (let u = 0; u < 0.6; u += 0.04) g.fillRect(X(u), Y(0.48), X(0.012), Y(0.52));
        for (let v = 0.48; v < 1; v += 0.04) g.fillRect(0, Y(v), X(0.6), Y(0.012));
        g.globalAlpha = 1;
        break;
      }
      case 'uniform': case 'camo': {
        camo(g, S, UV.shirt, tc, tc2);
        neckline(g, S, skinHex, 'v');
        break;
      }
    }
    // ---- alt kıyafet
    const pants = look.pants || { style: 'jeans', color: '#34495e' };
    const pc = pants.color;
    R(UV.pants, pc);
    if (pants.style === 'jeans') {
      g.fillStyle = shade(pc, 0.12); g.fillRect(X(0.66), Y(0.88), X(0.06), Y(0.05)); g.fillRect(X(0.86), Y(0.88), X(0.06), Y(0.05));
      g.fillStyle = shade(pc, -0.2); for (const u of [0.7, 0.9]) g.fillRect(X(u), Y(0.75), X(0.004), Y(0.25));
    } else if (pants.style === 'cargo') {
      g.fillStyle = shade(pc, -0.15); g.fillRect(X(0.62), Y(0.84), X(0.05), Y(0.06)); g.fillRect(X(0.93), Y(0.84), X(0.05), Y(0.06));
    } else if (pants.style === 'shorts') {
      g.fillStyle = skinHex; g.fillRect(X(0.6), Y(0.87), X(0.4), Y(0.13));
    } else if (pants.style === 'sweat') {
      g.fillStyle = '#ecf0f1'; g.fillRect(X(0.6), Y(0.75), X(0.006), Y(0.25)); g.fillRect(X(0.8), Y(0.75), X(0.006), Y(0.25)); g.fillRect(X(0.994), Y(0.75), X(0.006), Y(0.25));
    } else if (pants.style === 'camo') {
      camo(g, S, UV.pants, pc, shade(pc, -0.3));
    } else if (pants.style === 'overalls') {
      g.fillStyle = pc; g.fillRect(X(0.2), Y(0.84), X(0.23), Y(0.16)); g.fillRect(X(0.21), Y(0.74), X(0.03), Y(0.1)); g.fillRect(X(0.39), Y(0.74), X(0.03), Y(0.1));
      g.fillRect(X(0.21), Y(0.48), X(0.03), Y(0.26)); g.fillRect(X(0.39), Y(0.48), X(0.03), Y(0.26));
      g.fillStyle = '#d4af37'; g.fillRect(X(0.215), Y(0.845), X(0.02), Y(0.012)); g.fillRect(X(0.395), Y(0.845), X(0.02), Y(0.012));
    }
    if (top.style === 'coat') { g.fillStyle = tc; g.fillRect(X(0.6), Y(0.75), X(0.4), Y(0.06)); }
    // kemer
    if (['jeans', 'cargo'].includes(pants.style) && top.style !== 'coat') { g.fillStyle = '#3b2a1e'; g.fillRect(X(0.16), Y(0.985), X(0.31), Y(0.015)); g.fillRect(X(0.6), Y(0.75), X(0.4), Y(0.012)); }
    // ---- ayakkabı & eller
    const shoe = look.shoes || '#3b2b1d';
    R(UV.shoes, shoe);
    g.fillStyle = shade(shoe, -0.35); g.fillRect(X(0.625), 0, X(0.175), Y(0.12));
    g.fillStyle = '#f2f2f2'; for (let i = 0; i < 3; i++) { g.fillRect(X(0.69), Y(0.18 + i * 0.03), X(0.04), Y(0.006)); g.fillRect(X(0.69), Y(0.36 + i * 0.03), X(0.04), Y(0.006)); }
    const glove = look.gloves && look.gloves !== 'none' ? (look.gloveColor || { work: '#c9a86a', tactical: '#2c2c2c', medical: '#7ec8e3' }[look.gloves]) : skinHex;
    R(UV.hands, glove);
    R(UV.misc, skinHex);
    if (look.gloves && look.gloves !== 'none') { g.fillStyle = glove; g.fillRect(0, Y(0.48), X(0.012), Y(0.52)); g.fillRect(X(0.588), Y(0.48), X(0.012), Y(0.52)); }
    // ---- kirlilik (kıyamet havası)
    const dirt = look.dirt ?? 0.2;
    if (dirt > 0) {
      const rng = new RNG('dirt' + key.length);
      for (let i = 0; i < 40 * dirt; i++) {
        g.fillStyle = `rgba(70,50,30,${0.12 + rng.next() * 0.2})`;
        const u = rng.chance(0.6) ? 0.6 * rng.next() : 0.6 + 0.4 * rng.next(), v = rng.chance(0.6) ? 0.5 + 0.5 * rng.next() : 0.75 + 0.25 * rng.next();
        g.beginPath(); g.ellipse(X(u), Y(v), X(0.006 + rng.next() * 0.015), Y(0.005 + rng.next() * 0.012), rng.next() * 3, 0, Math.PI * 2); g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.cache.set(key, tex);
    if (this.cache.size > 64) { const first = this.cache.keys().next().value; this.cache.get(first).dispose(); this.cache.delete(first); }
    return tex;
  }

  /** Zombi dokusu: zombi tabanını renk tonuna kaydır */
  zombieTexture(variant) {
    const key = 'zombie:' + variant.id;
    if (this.cache.has(key)) return this.cache.get(key);
    const S = this.S;
    const { data } = this.baseImage(variant.base);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const tint = hexRgb(variant.tint).map((v) => v / 255), cloth = hexRgb(variant.cloth || '#ffffff').map((v) => v / 255);
    const tmp = new THREE.Color();
    for (let i = 0; i < S * S; i++) {
      const k = i * 4;
      const r = data.data[k] / 255, gg = data.data[k + 1] / 255, b = data.data[k + 2] / 255;
      tmp.setRGB(r, gg, b, THREE.SRGBColorSpace);
      const hsl = {}; tmp.getHSL(hsl, THREE.SRGBColorSpace);
      const u = (i % S) / S, v = Math.floor(i / S) / S;
      const isHead = u < 0.625 && v < 0.48;
      const isSkinish = hsl.s < 0.35 && hsl.l > 0.45; // zombi derisi grimsi
      let o;
      if (isHead || isSkinish || (u > 0.8 && v < 0.51)) { const f = 0.45 + hsl.l * 0.75; o = [tint[0] * f, tint[1] * f, tint[2] * f]; }
      else o = [r * cloth[0], gg * cloth[1], b * cloth[2]];
      img.data[k] = Math.min(255, o[0] * 255); img.data[k + 1] = Math.min(255, o[1] * 255); img.data[k + 2] = Math.min(255, o[2] * 255); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // parlayan gözler (gece/özel türler)
    if (variant.eyes) {
      g.fillStyle = variant.eyes;
      for (const u of [0.287, 0.343]) { g.beginPath(); g.ellipse(u * S, 0.205 * S, 0.012 * S, 0.009 * S, 0, 0, Math.PI * 2); g.fill(); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Karakter oluştur. look: görünüm tanımı. Dönüş: {root, model, rig, mesh, anchors, material, setLook}
   */
  create(look, opts = {}) {
    const model = this.assets.model('chars', opts.zombie ? opts.zombie.base : (look.base || 'survivor-male'));
    let mesh = null;
    model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    const material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
    mesh.material = material;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const rig = new CharacterRig(model);
    const root = new THREE.Group();
    root.add(model);
    model.scale.setScalar(CHAR_SCALE);
    const anchors = {
      handR: rig.makeAnchor('RightHand', 'handR'), handL: rig.makeAnchor('LeftHand', 'handL'),
      head: rig.makeAnchor('Head', 'head'), back: rig.makeAnchor('UpperChest', 'back'), hips: rig.makeAnchor('Hips', 'hips'), chest: rig.makeAnchor('Chest', 'chest'),
    };
    const ch = { root, model, rig, mesh, anchors, material, accessories: new THREE.Group(), look: null };
    anchors.head.add(new THREE.Group());
    if (opts.zombie) {
      material.map = this.zombieTexture(opts.zombie);
      material.needsUpdate = true;
      const b = opts.zombie.build || [1, 1, 1];
      model.scale.set(CHAR_SCALE * b[0], CHAR_SCALE * b[1], CHAR_SCALE * b[2]);
      if (opts.zombie.emissive) { material.emissive = new THREE.Color(opts.zombie.emissive); material.emissiveIntensity = 0.25; }
      buildZombieExtras(ch, opts.zombie);
    } else {
      this.applyLook(ch, look);
    }
    return ch;
  }

  applyLook(ch, look) {
    ch.look = look;
    ch.material.map = this.paint(look);
    ch.material.needsUpdate = true;
    const b = look.build || 1;
    ch.model.scale.set(CHAR_SCALE * b, CHAR_SCALE * (0.97 + b * 0.03), CHAR_SCALE * b);
    // eski aksesuarları temizle
    for (const a of Object.values(ch.anchors)) for (const child of [...a.children]) if (child.userData.acc) { a.remove(child); disposeTree(child); }
    buildAccessories(ch, look);
  }
}

function neckline(g, S, skin, kind) {
  g.fillStyle = skin;
  if (kind === 'round') { g.beginPath(); g.ellipse(0.315 * S, 0.742 * S, 0.045 * S, 0.016 * S, 0, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'v') { g.beginPath(); g.moveTo(0.28 * S, 0.74 * S); g.lineTo(0.35 * S, 0.74 * S); g.lineTo(0.315 * S, 0.8 * S); g.closePath(); g.fill(); }
  else { g.beginPath(); g.ellipse(0.315 * S, 0.745 * S, 0.06 * S, 0.03 * S, 0, 0, Math.PI * 2); g.fill(); }
}
function camo(g, S, r, c1, c2) {
  const rng = new RNG('camo');
  g.fillStyle = c1; g.fillRect(r[0] * S, r[1] * S, (r[2] - r[0]) * S, (r[3] - r[1]) * S);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = [c2, shade(c1, 0.18), '#4a3b2a'][i % 3];
    const u = r[0] + rng.next() * (r[2] - r[0]), v = r[1] + rng.next() * (r[3] - r[1]);
    g.beginPath(); g.ellipse(u * S, v * S, (0.01 + rng.next() * 0.025) * S, (0.006 + rng.next() * 0.015) * S, rng.next() * 3, 0, Math.PI * 2); g.fill();
  }
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
function accGroup(anchor) { const g = new THREE.Group(); g.userData.acc = true; anchor.add(g); return g; }

function buildAccessories(ch, look) {
  const head = accGroup(ch.anchors.head);
  const back = accGroup(ch.anchors.back);
  const hips = accGroup(ch.anchors.hips);
  const chest = accGroup(ch.anchors.chest);
  const hairM = M(look.hairColor || '#3b2314', { roughness: 0.9 });
  const HY = 0.31; // baş merkezi
  // ---- saç modelleri
  const hs = look.hairStyle || 'short';
  if (hs === 'ponytail') {
    head.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), hairM, 0, HY + 0.18, -0.36));
    head.add(mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 8), hairM, 0, HY - 0.08, -0.42, 0.35));
  } else if (hs === 'bun') {
    head.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), hairM, 0, HY + 0.4, -0.18));
  } else if (hs === 'mohawk') {
    head.add(mesh(new THREE.BoxGeometry(0.08, 0.2, 0.62), hairM, 0, HY + 0.42, -0.02));
  } else if (hs === 'spiky') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; head.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 5), hairM, Math.cos(a) * 0.14, HY + 0.42, Math.sin(a) * 0.14 - 0.03, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4)); }
  } else if (hs === 'messy') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; head.add(mesh(new THREE.SphereGeometry(0.12, 7, 6), hairM, Math.cos(a) * 0.17, HY + 0.36 + (i % 2) * 0.04, Math.sin(a) * 0.17 - 0.02, 0, 0, 0, 1.1, 0.7, 1)); }
    head.add(mesh(new THREE.SphereGeometry(0.1, 7, 6), hairM, 0.12, HY + 0.3, 0.25, 0.5, 0, 0.6, 1.3, 0.6, 0.8));
  } else if (hs === 'long') {
    head.add(mesh(new THREE.BoxGeometry(0.56, 0.5, 0.16), hairM, 0, HY - 0.08, -0.33));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), hairM, 0.29, HY - 0.02, -0.08));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), hairM, -0.29, HY - 0.02, -0.08));
  } else if (hs === 'pigtails') {
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), hairM, s * 0.32, HY + 0.05, -0.1));
  } else if (hs === 'curly') {
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; head.add(mesh(new THREE.SphereGeometry(0.11, 7, 6), hairM, Math.cos(a) * 0.24, HY + 0.3 + Math.sin(i) * 0.05, Math.sin(a) * 0.26 - 0.03)); }
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
      head.add(mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 20), M('#2c2c2c'), 0, y, -0.01, Math.PI / 2, 0, 0, 1, 1.15, 1));
      for (const s of [-1, 1]) { head.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), M('#4a5a3a'), s * 0.11, y, z, Math.PI / 2)); head.add(mesh(new THREE.CircleGeometry(0.06, 14), lensM, s * 0.11, y, z + 0.035)); }
    } else {
      for (const s of [-1, 1]) {
        const geo = look.glasses === 'round' ? new THREE.TorusGeometry(0.065, 0.012, 6, 16) : new THREE.TorusGeometry(0.07, 0.012, 4, 4);
        head.add(mesh(geo, gm, s * 0.105, y, z, 0, 0, look.glasses === 'round' ? 0 : Math.PI / 4));
        head.add(mesh(new THREE.CircleGeometry(look.glasses === 'round' ? 0.06 : 0.065, look.glasses === 'round' ? 14 : 4), lensM, s * 0.105, y, z - 0.004, 0, 0, look.glasses === 'round' ? 0 : Math.PI / 4));
        head.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), gm, s * 0.25, y + 0.02, z - 0.15));
      }
      head.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), gm, 0, y + 0.01, z));
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
  const head = accGroup(ch.anchors.head);
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
    const chest = accGroup(ch.anchors.chest);
    const rng = new RNG(z.id);
    for (let i = 0; i < 9; i++) chest.add(mesh(new THREE.SphereGeometry(0.04 + rng.next() * 0.05, 7, 6), pm, (rng.next() - 0.5) * 0.4, rng.next() * 0.25 - 0.05, (rng.next() > 0.5 ? 1 : -1) * (0.14 + rng.next() * 0.04)));
  }
  if (z.hunch) {
    const back = accGroup(ch.anchors.back);
    back.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), M(z.tint), 0, 0.02, -0.12, 0, 0, 0, 1.3, 0.9, 0.9));
  }
}
