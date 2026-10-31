// Bitki örtüsü: Quaternius "Stylized Nature MegaKit" (CC0) modelleri — dokulu ağaçlar (meşe, çam, dev çam, huş,
// kıvrık, ölü, sakura), çalılar, kayalar, çim, eğrelti, çiçek, mantar, çakıl (tools/pack-nature.mjs → nature.glb).
// Çizim: model parçası (gövde/yaprak) başına InstancedMesh; örnekler 64 m'lik hücrelerde tutulur ve kamera
// hareket ettikçe mesafeye göre bantlara yeniden dağıtılır: ağaçlar 42 m içinde gölgeli tam model, 85 m'ye
// kadar gölgesiz tam model, ötesinde "impostor" kartı (yüklemede her ağaç modeli bir doku atlasına çizilir;
// uzak ağaç kameraya dönük tek dörtgen, tek çizim çağrısı). Küçük bitkiler belli mesafeden sonra çizilmez.
// Rüzgâr köşe gölgelendiricisinde: yükseklikle artan salınım, yapraklarda ek titreşim.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { forestMask, BIOME } from './Terrain.js';
import { WORLD, LAKES } from './WorldLayout.js';
import { onRoad } from './Roads.js';

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
const CELL = 64;

// tür → modeller, ölçek aralığı (kit modelleri gerçek boyuttan büyük/küçük), çarpışma yarıçapı, katman
const TYPES = {
  oak: { models: ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'], scale: [0.95, 1.25], r: 0.32, kind: 'tree' },
  oak2: { models: ['CommonTree_1', 'CommonTree_2', 'TwistedTree_1', 'TwistedTree_3'], scale: [0.9, 1.15], perModel: { TwistedTree_1: 0.55, TwistedTree_3: 0.55 }, r: 0.38, kind: 'tree' },
  pine: { models: ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4'], scale: [0.95, 1.3], r: 0.28, kind: 'tree' },
  pineTall: { models: ['GiantPine_1', 'GiantPine_3', 'TallThick_1', 'TallThick_2'], scale: [0.7, 0.95], r: 0.38, kind: 'tree' },
  birch: { models: ['Birch_1', 'Birch_3', 'Birch_5'], scale: [0.62, 0.82], r: 0.22, kind: 'tree' },
  autumn: { models: ['CommonTree_1', 'CommonTree_3', 'Birch_3'], scale: [0.9, 1.15], perModel: { Birch_3: 0.7 }, r: 0.3, kind: 'tree', leaf: '#c8782a' },
  autumn2: { models: ['CommonTree_2', 'CommonTree_4', 'Birch_1'], scale: [0.9, 1.15], perModel: { Birch_1: 0.7 }, r: 0.3, kind: 'tree', leaf: '#d9a23a' },
  dead: { models: ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4'], scale: [0.5, 0.72], r: 0.3, kind: 'tree' },
  cherry: { models: ['CherryBlossom_2'], scale: [0.45, 0.6], r: 0.35, kind: 'tree' },
  bush: { models: ['Bush_Common', 'Bush_Long_1', 'Bush_Large'], scale: [0.55, 0.8], perModel: { Bush_Large: 0.42, Bush_Long_1: 0.6 }, r: 0, kind: 'bush' },
  flowerBush: { models: ['Bush_Common_Flowers', 'Bush_Large_Flowers'], scale: [0.55, 0.75], perModel: { Bush_Large_Flowers: 0.42 }, r: 0, kind: 'bush' },
  rock: { models: ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Rock_Medium_4'], scale: [0.32, 0.5], r: 1.0, kind: 'rock' },
  boulder: { models: ['Rock_Big_1', 'Rock_Big_2'], scale: [0.4, 0.62], r: 2.2, kind: 'rock' },
  grass: { models: ['Grass_Common_Short', 'Grass_Wide_Short', 'Grass_Wispy_Short', 'Grass_Common_Tall', 'Grass_Wispy_Tall'], scale: [0.28, 0.42], r: 0, kind: 'grass' },
  wheat: { models: ['Grass_Wheat'], scale: [0.45, 0.6], r: 0, kind: 'grass' },
  fern: { models: ['Fern_1', 'Fern_2'], scale: [0.45, 0.7], r: 0, kind: 'ground' },
  plant: { models: ['Plant_1', 'Plant_2', 'Plant_5', 'Clover_1', 'Plant_7'], scale: [0.35, 0.55], r: 0, kind: 'ground' },
  flowers: { models: ['Flower_1_Group', 'Flower_2_Group', 'Flower_3_Group', 'Flower_4_Group', 'Flower_7_Group'], scale: [0.26, 0.36], r: 0, kind: 'ground' },
  mushroom: { models: ['Mushroom_Common', 'Mushroom_RedCap'], scale: [0.22, 0.34], r: 0, kind: 'ground' },
  pebble: { models: ['Pebble_Round_1', 'Pebble_Round_3', 'Pebble_Square_2'], scale: [0.7, 1.2], r: 0, kind: 'ground' },
};
// grafik kalitesine göre çizim bantları (m): [gölgeli tam model sınırı, tam model sınırı]; ötesi: ağaçta kart,
// diğerlerinde çizilmez. thin: çim/zemin örtüsünün çizilen oranı (düşük kalitede seyreltilir)
const RANGES = {
  low: { tree: [16, 38], bush: [0, 60], rock: [18, 180], grass: [0, 26], ground: [0, 32], thin: 0.5 },
  medium: { tree: [30, 58], bush: [0, 80], rock: [30, 240], grass: [0, 38], ground: [0, 46], thin: 1 },
  high: { tree: [42, 85], bush: [0, 100], rock: [40, 300], grass: [0, 48], ground: [0, 58], thin: 1 },
};
const TILE = 256; // impostor atlas karesi (piksel)
// rüzgâr: pivot (m, bu yüksekliğin altı sabit), genlik (yükseklik başına), yaprak titreşimi
const WIND = { tree: [1.2, 0.022, 1], bush: [0.15, 0.05, 1], grass: [0.0, 0.3, 0], ground: [0.0, 0.12, 0], rock: null };

/** Nicemlenmiş (meshopt/KHR_mesh_quantization: normalize tamsayı) özniteliği kayan noktaya çevir */
function toFloat(attr) {
  if (attr.array instanceof Float32Array && !attr.normalized && !attr.isInterleavedBufferAttribute) return attr;
  const n = attr.count, k = attr.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, k);
}

/** Modelin parçaları: [{geometry (model uzayına dönüştürülmüş), material}] */
function partsOf(root) {
  const out = [];
  if (!root) return out;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    // konum/normal nicemlenmiş olabilir (aralık [-1,1]; ölçek düğüm matrisinde): önce kayan noktaya çevir,
    // yoksa matris uygulanırken değerler kırpılır ve model küpe ezilir
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(o.geometry.attributes)) g.setAttribute(name, name === 'position' || name === 'normal' ? toFloat(a) : a);
    if (o.geometry.index) g.setIndex(o.geometry.index);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    g.computeBoundingSphere();
    out.push({ geometry: g, material: o.material });
  });
  return out;
}

/** Rüzgâr salınımlı malzeme (aynı kod gölge derinlik malzemesine de uygulanır) */
function windPatch(mat, kind) {
  const w = WIND[kind];
  if (!w) return mat;
  const leaf = /leaf|leaves|grass|flower|fern|plant|clover/i.test(mat.name) ? w[2] : 0;
  const code = `#include <begin_vertex>
    #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float isc = length(instanceMatrix[1].xyz);
    #else
      vec3 ip = vec3(0.0); float isc = 1.0;
    #endif
    float hgt = max(0.0, position.y * isc - ${w[0].toFixed(2)});
    float ph = uTime * 1.5 + ip.x * 0.13 + ip.z * 0.11;
    float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * ${w[1].toFixed(3)} * uWind * hgt / max(isc, 0.2);
    float flut = ${leaf.toFixed(1)} * sin(uTime * 7.0 + position.x * 4.0 + position.z * 3.0 + ip.x) * 0.012 * uWind * min(hgt, 3.0);
    transformed.x += sway + flut;
    transformed.z += sway * 0.55 - flut * 0.5;
    transformed.y += flut * 0.4;`;
  // kitin köşe rengi: gövdede ortam kapanması (0..1), çimde kökten uca geçiş → yumuşatılmış çarpan
  const vc = kind === 'grass' ? 0.38 : 0.3;
  const patch = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;').replace('#include <begin_vertex>', code);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
      diffuseColor.rgb *= ${vc.toFixed(2)} + ${(1 - vc).toFixed(2)} * vColor.r;
    #endif`);
  };
  mat.onBeforeCompile = patch;
  mat.customProgramCacheKey = () => `wind:${kind}:${leaf}`;
  return mat;
}

export class Vegetation {
  constructor(world) {
    this.world = world;
    this.kit = world.assets && world.assets.nature ? world.assets.nature.scene : null;
    this.instances = []; // {type, m (model), x, y, z, rot, s}
    this.mats = new Map(); // kit malzemesi + tür renk tonu → malzeme
    this.parts = new Map(); // "model|lod|tint" → parçalar
    this.meshes = []; // çizim kümeleri
    this.cells = new Map();
    this.last = null;
    this.t = 0;
  }

  /** Tek bitki ekle (tür adı; model türün listesinden konuma göre seçilir) */
  add(type, x, z, rot = 0, s = 1, y = null) {
    const T = TYPES[type];
    if (!T) return;
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const model = T.models[Math.floor(h * T.models.length) % T.models.length];
    const base = T.scale[0] + (T.scale[1] - T.scale[0]) * ((h * 7.31) % 1);
    const sc = base * s * ((T.perModel && T.perModel[model]) || 1);
    const yy = y ?? this.world.terrain.heightAt(x, z) - (T.kind === 'tree' ? 0.12 : 0.04);
    this.instances.push({ type, model, x, y: yy, z, rot, s: sc, thin: (h * 13.7) % 1 });
    if (T.r > 0) {
      const rock = T.kind === 'rock';
      // kaya: yarıçap gerçek boyutla (ölçek / türün ortalama ölçeği); ağaç: gövde yarıçapı
      const r = rock ? T.r * sc / ((T.scale[0] + T.scale[1]) / 2) : T.r * s;
      this.world.physics.add({ shape: 'circle', x, z, r, minY: yy - 1, maxY: yy + (rock ? 2.4 * sc : 8 * s), kind: rock ? 'rock' : 'tree', walkable: rock, blocksSight: !rock || sc > 0.6 });
    }
  }

  /** Dünya genelinde dağıtım */
  scatter(blocked) {
    const terrain = this.world.terrain;
    const rng = new RNG('veg');
    const H = WORLD.half - 40;
    const step = 6.5;
    for (let z = -H; z < H; z += step) {
      for (let x = -H; x < H; x += step) {
        const px = x + (rng.next() - 0.5) * step * 0.9, pz = z + (rng.next() - 0.5) * step * 0.9;
        const h = terrain.heightAt(px, pz);
        if (h < 1.8) continue;
        if (LAKES.some((L) => Math.hypot(px - L.x, pz - L.z) < L.r + 4)) continue;
        const reg = terrain.regionAt(px, pz);
        if (reg && reg.id !== 'orman') continue;
        const fm = forestMask(px, pz);
        const slope = terrain.slopeAt(px, pz);
        if (slope > 0.45) continue;
        let p = fm * 0.75 + 0.025;
        if (h > 50) p *= 0.5;
        if (rng.next() > p) {
          // seyrek çalı/kaya/ölü ağaç (kurak açıklık)
          const r2 = rng.next();
          if (r2 < 0.05 && !blocked(px, pz, 1.5)) this.add(rng.chance(0.3) ? 'flowerBush' : 'bush', px, pz, rng.next() * 6, 0.8 + rng.next() * 0.6);
          else if (r2 < 0.07 + (h > 30 ? 0.05 : 0) && !blocked(px, pz, 2.5)) this.add(rng.chance(0.25) ? 'boulder' : 'rock', px, pz, rng.next() * 6, 0.6 + rng.next() * 0.9);
          else if (r2 < 0.078 && !onRoad(px, pz, 3) && !blocked(px, pz, 2)) this.add('dead', px, pz, rng.next() * 6, 0.85 + rng.next() * 0.4);
          continue;
        }
        if (onRoad(px, pz, 2.5) || blocked(px, pz, 2)) continue;
        let type;
        if (h > 34) type = rng.chance(0.75) ? 'pineTall' : 'pine';
        else if (fm > 0.75) type = rng.weighted([['pineTall', 3], ['pine', 3], ['oak', 2], ['oak2', 1], ['birch', 1], ['dead', 0.25]]);
        else type = rng.weighted([['oak', 3], ['oak2', 2], ['pine', 2], ['birch', 2], ['autumn', 0.5], ['autumn2', 0.35], ['dead', 0.2]]);
        this.add(type, px, pz, rng.next() * 6, 0.85 + rng.next() * 0.45);
        // orman tabanı: çalı, eğrelti, mantar
        if (rng.chance(0.25)) {
          const bx = px + (rng.next() - 0.5) * 4, bz = pz + (rng.next() - 0.5) * 4;
          if (!blocked(bx, bz, 1)) this.add('bush', bx, bz, rng.next() * 6, 0.7 + rng.next() * 0.5);
        }
        if (fm > 0.5 && rng.chance(0.55)) {
          const bx = px + (rng.next() - 0.5) * 5, bz = pz + (rng.next() - 0.5) * 5;
          if (!blocked(bx, bz, 0.5)) this.add(rng.chance(0.7) ? 'fern' : rng.chance(0.6) ? 'plant' : 'mushroom', bx, bz, rng.next() * 6, 0.8 + rng.next() * 0.5);
        }
      }
    }
    // zemin örtüsü: çayır/çimen/tarla biyomlarında çim öbekleri, çiçek ve ot
    const gstep = 3.0;
    for (let z = -H; z < H; z += gstep) {
      for (let x = -H; x < H; x += gstep) {
        const px = x + (rng.next() - 0.5) * gstep, pz = z + (rng.next() - 0.5) * gstep;
        const b = terrain.biome[terrain.idx(Math.round((px + WORLD.half) / WORLD.cell), Math.round((pz + WORLD.half) / WORLD.cell))];
        if (!(b === BIOME.GRASS || b === BIOME.LAWN || b === BIOME.FOREST || b === BIOME.FIELD)) continue;
        if (rng.next() > (b === BIOME.LAWN ? 0.45 : 0.62)) continue;
        if (onRoad(px, pz, 1) || blocked(px, pz, 0.5)) continue;
        const r = rng.next();
        const type = b === BIOME.FIELD ? (r < 0.55 ? 'wheat' : 'grass') : r < 0.06 ? 'flowers' : r < 0.1 ? 'plant' : r < 0.12 && b !== BIOME.LAWN ? 'pebble' : 'grass';
        this.add(type, px, pz, rng.next() * 6, 0.8 + rng.next() * 0.5, terrain.heightAt(px, pz) - 0.03);
      }
    }
  }

  /** Model + LOD + tür tonu için parça listesi (malzemeler rüzgârla yamalı, paylaşılır) */
  partsFor(model, lod, T) {
    const key = `${model}|${lod}|${T.leaf || ''}|${T.kind}`;
    if (this.parts.has(key)) return this.parts.get(key);
    let node = this.kit && this.kit.getObjectByName(lod === 'far' ? model + '__far' : model);
    if (!node && lod === 'far') node = this.kit && this.kit.getObjectByName(model);
    const parts = partsOf(node).map((p) => {
      const mk = `${p.material.uuid}|${T.leaf || ''}|${T.kind}`;
      let m = this.mats.get(mk);
      if (!m) {
        m = p.material.clone();
        m.name = p.material.name;
        if (T.leaf && /leaf|leaves/i.test(m.name)) m.color.set(T.leaf);
        // kitin çim dokusu beyaz (rengi kendi gölgelendiricisi verir): çayır yeşili; buğday sarısı
        if (/^grass$/i.test(m.name)) m.color.set(T === TYPES.wheat ? '#c9b25a' : '#79a640');
        if (m.map) m.map.anisotropy = 4;
        m.roughness = Math.max(m.roughness ?? 0.8, 0.85);
        m.metalness = 0;
        if (m.alphaTest > 0) m.alphaToCoverage = false;
        windPatch(m, T.kind);
        this.mats.set(mk, m);
      }
      return { geometry: p.geometry, material: m };
    });
    this.parts.set(key, parts);
    return parts;
  }

  build(scene) {
    this.scene = scene;
    // örnek matrisleri ve hücreler
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const groups = new Map(); // "model|bant|tür" → küme
    const groupFor = (inst, band) => {
      const T = TYPES[inst.type];
      const key = `${inst.model}|${band}|${T.leaf || ''}|${T.kind}`;
      let g = groups.get(key);
      if (!g) { g = { key, band, kind: T.kind, parts: this.partsFor(inst.model, 'near', T), n: 0, ims: [] }; groups.set(key, g); }
      return g;
    };
    this.impKeys = new Map(); // ağaç modeli + ton → atlas karesi
    this.mat16 = new Float32Array(this.instances.length * 16);
    this.instances.forEach((inst, i) => {
      mtx.compose(p.set(inst.x, inst.y, inst.z), q.setFromAxisAngle(Y, inst.rot), sv.setScalar(inst.s));
      mtx.toArray(this.mat16, i * 16);
      const T = TYPES[inst.type];
      inst.kind = T.kind;
      if (T.kind === 'tree' || T.kind === 'rock') { inst.shadow = groupFor(inst, 'shadow'); inst.shadow.n++; }
      inst.near = groupFor(inst, 'near'); inst.near.n++;
      if (T.kind === 'tree') {
        const ik = `${inst.model}|${T.leaf || ''}`;
        if (!this.impKeys.has(ik)) this.impKeys.set(ik, { i: this.impKeys.size, model: inst.model, T });
        inst.tile = this.impKeys.get(ik).i;
      }
      // hücreler: büyükler (ağaç/kaya) ve küçükler (çalı/çim/zemin) ayrı — küçükler yakın hücrelerde aranır
      const small = T.kind !== 'tree' && T.kind !== 'rock';
      const ck = `${small ? 's' : 'b'}${Math.floor(inst.x / CELL)},${Math.floor(inst.z / CELL)}`;
      let c = this.cells.get(ck);
      if (!c) { c = { small, x: (Math.floor(inst.x / CELL) + 0.5) * CELL, z: (Math.floor(inst.z / CELL) + 0.5) * CELL, list: [] }; this.cells.set(ck, c); }
      c.list.push(i);
    });
    // her küme parçası için kapasitesi küme boyutunda örnekli ağ (sayı her güncellemede ayarlanır)
    for (const g of groups.values()) {
      for (const part of g.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, g.n);
        im.count = 0;
        im.frustumCulled = false; // örnekler dünyaya yayılı; sınır küresi yerine hücre ayıklaması
        im.castShadow = g.band === 'shadow';
        im.receiveShadow = true;
        im.name = `veg:${g.key}`;
        im.visible = false;
        scene.add(im);
        g.ims.push(im);
      }
      this.meshes.push(g);
    }
    this.groups = groups;
    this.treeCount = this.instances.filter((x) => x.kind === 'tree').length;
  }

  /**
   * Uzak ağaç kartları: her ağaç modeli (ton dahil) önden ortografik kamerayla ışıksız (yalnız renk) bir atlas
   * karesine çizilir; uzak ağaçlar kameraya dönük dörtgenle bu kareden çizilir. Işık: kartın küresel sahte
   * normaliyle sahne ışıkları (gün/gece uyumlu). Atlası çizmek için oluşturucu gerekir (ilk güncellemede).
   */
  buildImpostors(renderer) {
    const keys = [...this.impKeys.values()].slice(0, 48);
    if (!keys.length) return;
    const cols = Math.ceil(Math.sqrt(keys.length)), rows = Math.ceil(keys.length / cols);
    // mip yok: saydamlık mip seviyelerinde ortalanınca uzak kart kare bir lekeye dönüşüyordu
    const rt = new THREE.WebGLRenderTarget(cols * TILE, rows * TILE, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const sc = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200);
    const tiles = new Float32Array(48 * 4), sizes = new Float32Array(48 * 2);
    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear, prevShadow = renderer.shadowMap.enabled;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x3c5626, 0); // saydam ama yeşil: mip seviyelerinde kenar karartması olmasın
    renderer.clear(true, true, true);
    renderer.autoClear = false;
    renderer.shadowMap.enabled = false;
    keys.forEach((k, idx) => {
      const g = new THREE.Group();
      const box = new THREE.Box3();
      for (const p of this.partsFor(k.model, 'near', k.T)) {
        const src = p.material;
        const m = new THREE.MeshBasicMaterial({ map: src.map, color: src.color, alphaTest: Math.max(0.4, src.alphaTest || 0), side: THREE.DoubleSide, vertexColors: !!src.vertexColors });
        g.add(new THREE.Mesh(p.geometry, m));
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox);
      }
      const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z), h = box.max.y - Math.min(0, box.min.y);
      const S = Math.max(w, h) * 1.02;
      cam.left = -S / 2; cam.right = S / 2; cam.top = S; cam.bottom = 0;
      cam.position.set((box.min.x + box.max.x) / 2, Math.min(0, box.min.y), 100);
      cam.lookAt(cam.position.x, cam.position.y, 0);
      cam.updateProjectionMatrix();
      sc.add(g);
      const cx = idx % cols, cy = Math.floor(idx / cols);
      rt.viewport.set(cx * TILE, cy * TILE, TILE, TILE); // hedefte görünüm alanı hedefin kendisinden okunur
      renderer.setRenderTarget(rt);
      renderer.render(sc, cam);
      sc.remove(g);
      for (const m of g.children) m.material.dispose();
      tiles.set([cx / cols, cy / rows, 1 / cols, 1 / rows], idx * 4);
      sizes.set([S, S], idx * 2);
    });
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.enabled = prevShadow;
    // kart ağı: tek dörtgen (taban ortada), örnek başına kare dizini
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.treeCount), 1);
    geo.setAttribute('aTile', tileAttr);
    const mat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.32, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTiles = { value: tiles };
      sh.uniforms.uSizes = { value: sizes };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile; uniform vec4 uTiles[48]; uniform vec2 uSizes[48];')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  { vec4 tl = uTiles[int(aTile + 0.5)]; vMapUv = tl.xy + uv * tl.zw; }')
        .replace('#include <beginnormal_vertex>', `vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float isc = length(instanceMatrix[1].xyz);
          vec3 toCam = cameraPosition - ipos; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
          vec3 bRight = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          // küresel sahte normal: kartın kenarları yana, üstü yukarı bakar (taç hacmi gibi ışıklanır)
          vec3 objectNormal = normalize(toCam * 0.75 + bRight * position.x * 1.2 + vec3(0.0, 0.35 + position.y * 0.5, 0.0));`)
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(mat3(viewMatrix) * objectNormal);\n#ifdef FLIP_SIDED\n transformedNormal = -transformedNormal;\n#endif')
        .replace('#include <begin_vertex>', 'vec2 sz = uSizes[int(aTile + 0.5)] * isc;\n vec3 transformed = bRight * position.x * sz.x + vec3(0.0, position.y * sz.y, 0.0);')
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(ipos + transformed, 1.0);\n gl_Position = projectionMatrix * mvPosition;');
    };
    mat.customProgramCacheKey = () => 'veg-impostor';
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, this.treeCount));
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    im.name = 'veg:impostor';
    this.scene.add(im);
    this.imp = { im, tileAttr, rt, mat };
  }

  /** Mesafeye göre bantlara dağıt (kamera 8 m'den fazla kaydıkça ya da 1 sn'de bir) */
  update(camPos, viewDist, grassOn = true, dt = 0.016, quality = 'medium') {
    if (!this.groups) return;
    const RANGE = RANGES[quality] || RANGES.medium;
    if (!this.imp && this.renderer && this.impKeys.size) this.buildImpostors(this.renderer);
    this.t += dt;
    if (this.last && this.t < 1.0 && Math.hypot(camPos.x - this.last.x, camPos.z - this.last.z) < 8 && this.last.v === viewDist && this.last.g === grassOn && this.last.i === !!this.imp && this.last.q === quality) return;
    // gerçek zamanla da sınırlı (en sık 0.2 sn): toplu adımlamada/ışınlanmada art arda yüklemeler olmasın
    const nowMs = performance.now();
    if (this.last && this.last.q === quality && this.last.v === viewDist && Math.hypot(camPos.x - this.last.x, camPos.z - this.last.z) < 50 && nowMs - (this._ms || 0) < 200) return;
    this._ms = nowMs;
    this.t = 0;
    this.last = { x: camPos.x, z: camPos.z, v: viewDist, g: grassOn, i: !!this.imp, q: quality };
    for (const g of this.meshes) g.n = 0;
    const M = this.mat16;
    const cx = camPos.x, cz = camPos.z;
    const imp = this.imp;
    let ni = 0;
    const iArr = imp ? imp.im.instanceMatrix.array : null, tArr = imp ? imp.tileAttr.array : null;
    for (const c of this.cells.values()) {
      const dc = Math.hypot(c.x - cx, c.z - cz) - CELL * 0.71;
      if (dc > (c.small ? RANGE.bush[1] : viewDist)) continue;
      for (const i of c.list) {
        const inst = this.instances[i];
        const kind = inst.kind;
        if (kind === 'grass' && !grassOn) continue;
        if ((kind === 'grass' || kind === 'ground') && inst.thin > RANGE.thin) continue;
        const d = Math.hypot(inst.x - cx, inst.z - cz);
        if (d > viewDist) continue;
        const R = RANGE[kind];
        let g = null;
        if (d < R[0] && inst.shadow) g = inst.shadow;
        else if (d < R[1]) g = inst.near;
        else if (kind === 'tree' && imp) { iArr.set(M.subarray(i * 16, i * 16 + 16), ni * 16); tArr[ni] = inst.tile; ni++; continue; }
        else continue;
        for (const im of g.ims) im.instanceMatrix.array.set(M.subarray(i * 16, i * 16 + 16), g.n * 16);
        g.n++;
      }
    }
    // yalnız kullanılan aralığı yükle (kapasite çim için on binlerce örnek: tamamını her seferinde göndermek
    // bant genişliği ve sürücü belleği israfıydı)
    const upload = (attr, n) => { attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(1, n) * attr.itemSize); attr.needsUpdate = true; };
    for (const g of this.meshes) for (const im of g.ims) {
      const was = im.count;
      im.count = g.n;
      im.visible = g.n > 0;
      if (g.n > 0 || was > 0) upload(im.instanceMatrix, g.n);
    }
    if (imp) {
      imp.im.count = ni;
      imp.im.visible = ni > 0;
      upload(imp.im.instanceMatrix, ni);
      upload(imp.tileAttr, ni);
    }
  }
}
