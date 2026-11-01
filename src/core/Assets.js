// Asset yükleyici: GLB kitleri, ses dosyaları ve görseller.
// Kitler tools/pack-assets.mjs ile üretilir; her model kit içinde adıyla bulunur.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../../vendor/meshopt/meshopt_decoder.module.js';
import { unpackBytes, packToClips } from '../entities/AnimPack.js';
import { loadSurfaces } from '../world/Surfaces.js';
import { mergeParts, burntParts } from './PartMerge.js';
import { repairTree } from './NormalRepair.js';

const KITS = ['vehicles', 'buildings', 'furniture', 'kitchen', 'props', 'items', 'city'];
// iskeletli modeller (ayrı dosyalar; animasyonlarıyla birlikte): modüler insan tabanları ve hayvanlar
const RIGGED = ['men', 'women', 'wolf', 'deer', 'stag', 'husky', 'fox', 'shiba'];
// insan tabanlarına aktarılmış animasyon kütüphanesi (Universal Animation Library 1+2, tools/retarget-ual.mjs)
const ANIM_PACKS = ['men', 'women'];
const SOUNDS = ['ambience', 'break', 'engine', 'engine-motorcycle', 'fall', 'impact', 'jump_a', 'land', 'pickup', 'placement-a', 'placement-b', 'removal-a', 'rotate', 'skid', 'toggle', 'walking', 'weapon_change', 'step_hard', 'hurt', 'whoosh', 'downed', 'revive'];

export class Assets {
  constructor(base = '') {
    this.base = base;
    this.kits = {};
    this.index = {}; // "kit/ad" → Object3D
    this.sounds = {}; // ad → ArrayBuffer (çözme AudioManager'da)
    this.partsCache = new Map();
    this.bboxCache = new Map();
    this.rigged = {}; // ad → {scene, animations}
    this.anims = {}; // taban adı → {klip adı → THREE.AnimationClip} (aktarılmış kütüphane)
    this.nature = null; // doğa kiti glTF
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.normalFixes = { meshes: 0, vertices: 0 }; // yüklemede onarılan sıfır/NaN normaller
    this._normalSeen = new WeakSet();
  }

  async loadAll(onProgress = () => {}) {
    const total = KITS.length + SOUNDS.length + RIGGED.length + ANIM_PACKS.length + 2;
    let done = 0;
    const tick = (label) => { done++; onProgress(done / total, label); };
    const kitJobs = KITS.map(async (k) => {
      const gltf = await this.loader.loadAsync(`${this.base}assets/models/${k}.glb`);
      const root = gltf.scene;
      repairTree(root, this._normalSeen, this.normalFixes);
      this.kits[k] = root;
      for (const child of root.children) {
        this.index[`${k}/${child.name}`] = child;
        child.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) prepareMaterial(m);
          }
        });
      }
      tick(`Model kiti: ${k}`);
    });
    const soundJobs = SOUNDS.map(async (s) => {
      try {
        const r = await fetch(`${this.base}assets/audio/${s}.ogg`);
        this.sounds[s] = await r.arrayBuffer();
      } catch (e) { console.warn('Ses yüklenemedi', s, e); }
      tick(`Ses: ${s}`);
    });
    const rigJobs = RIGGED.map(async (r) => {
      const gltf = await this.loader.loadAsync(`${this.base}assets/models/rigged/${r}.glb`);
      repairTree(gltf.scene, this._normalSeen, this.normalFixes);
      gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { m.metalness = 0; m.roughness = Math.max(m.roughness ?? 0.8, 0.7); } } });
      this.rigged[r] = gltf;
      tick(`Karakter: ${r}`);
    });
    const animJobs = ANIM_PACKS.map(async (b) => {
      try {
        const r = await fetch(`${this.base}assets/models/rigged/anims_${b}.kan`);
        if (!r.ok) throw new Error(r.status);
        this.anims[b] = packToClips(await unpackBytes(await r.arrayBuffer()), THREE);
      } catch (e) { console.warn('Animasyon paketi yüklenemedi', b, e); }
      tick(`Animasyonlar: ${b}`);
    });
    // doğa kiti (Stylized Nature MegaKit: ağaç, çalı, kaya, çim…; tools/pack-nature.mjs)
    const natureJob = (async () => {
      this.nature = await this.loader.loadAsync(`${this.base}assets/models/nature.glb`);
      repairTree(this.nature.scene, this._normalSeen, this.normalFixes);
      tick('Doğa');
    })();
    const surfJob = loadSurfaces(this.base).then(() => tick('Yüzey dokuları'));
    await Promise.all([...kitJobs, ...soundJobs, ...rigJobs, ...animJobs, natureJob, surfJob]);
  }

  has(kit, name) { return !!this.index[`${kit}/${name}`]; }

  /** Modelin bağımsız bir kopyasını döndürür (iskeletli modeller için SkeletonUtils) */
  model(kit, name) {
    const src = this.index[`${kit}/${name}`];
    if (!src) { console.warn('Model bulunamadı:', kit, name); return new THREE.Group(); }
    let skinned = false;
    src.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    const c = skinned ? SkeletonUtils.clone(src) : src.clone(true);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.scale.set(1, 1, 1);
    return c;
  }

  /** Modeli birleştirilebilir/örneklenebilir parçalara ayırır: [{geometry, material, matrix}] (model uzayında) */
  parts(kit, name, variant = null) {
    const key = `${kit}/${name}${variant ? '#' + variant : ''}`;
    if (this.partsCache.has(key)) return this.partsCache.get(key);
    // görünüm çeşitleri (yanmış araç enkazı vb.) temel parçalardan türetilir
    if (variant) {
      const v = variant === 'burnt' ? burntParts(this.parts(kit, name)) : this.parts(kit, name);
      this.partsCache.set(key, v);
      return v;
    }
    const src = this.index[key];
    const out = [];
    if (src) {
      const tmp = src.clone(true);
      tmp.position.set(0, 0, 0); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
      tmp.updateMatrixWorld(true);
      tmp.traverse((o) => {
        if (o.isMesh && !o.isSkinnedMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.length === 1) out.push({ geometry: o.geometry, material: mats[0], matrix: o.matrixWorld.clone() });
          else {
            for (const g of o.geometry.groups) {
              const sub = o.geometry.clone();
              sub.clearGroups();
              sub.setIndex(Array.from(o.geometry.index.array.slice(g.start, g.start + g.count)));
              out.push({ geometry: sub, material: mats[g.materialIndex], matrix: o.matrixWorld.clone() });
            }
          }
        }
      });
    }
    // aynı malzemeli parçalar ve düz renkli malzemeler birleştirilir (çizim çağrısı)
    const merged = mergeParts(out);
    this.partsCache.set(key, merged);
    return merged;
  }

  /** Modelin model-uzayı sınır kutusu */
  bbox(kit, name) {
    const key = `${kit}/${name}`;
    if (this.bboxCache.has(key)) return this.bboxCache.get(key);
    const src = this.index[key];
    const box = new THREE.Box3();
    if (src) {
      const tmp = src.clone(true);
      tmp.position.set(0, 0, 0); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
      tmp.updateMatrixWorld(true);
      box.setFromObject(tmp);
    }
    this.bboxCache.set(key, box);
    return box;
  }

  listKit(kit) { return Object.keys(this.index).filter((k) => k.startsWith(kit + '/')).map((k) => k.slice(kit.length + 1)); }
}

function prepareMaterial(m) {
  if (!m || m.userData.prepared) return;
  m.userData.prepared = true;
  if ('metalness' in m) {
    m.metalness = Math.min(m.metalness ?? 0, 0.2);
    m.roughness = Math.max(m.roughness ?? 0.8, 0.55);
  }
  if (m.map) { m.map.anisotropy = 4; m.map.colorSpace = THREE.SRGBColorSpace; }
  // Kenney "window" malzemeleri hafif yansıtıcı olsun
  if (/window|glass/i.test(m.name)) { m.roughness = 0.15; m.metalness = 0.1; }
  if (/light/i.test(m.name) && m.color) { m.emissive = m.color.clone(); m.emissiveIntensity = 0.25; }
  // KHR_materials_transmission (araç kitinde 'lightFront', 'lightBlue'): three.js görüş alanında geçirgen bir malzeme
  // varken BÜTÜN opak sahneyi ek bir geçirgenlik tamponuna bir kez daha çizer (çizim çağrısı ×2). Küçük far/tepe
  // lambası camlarında görünür farkı yok: geçirgenlik kapatılır (renk ve ışıma kalır)
  if (m.transmission > 0) { m.transmission = 0; m.thickness = 0; }
}
