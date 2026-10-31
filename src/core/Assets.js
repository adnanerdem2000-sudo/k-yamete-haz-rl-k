// Asset yükleyici: GLB kitleri, ses dosyaları ve görseller.
// Kitler tools/pack-assets.mjs ile üretilir; her model kit içinde adıyla bulunur.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const KITS = ['chars', 'vehicles', 'buildings', 'furniture', 'kitchen', 'props', 'items'];
const SOUNDS = ['ambience', 'break', 'engine', 'engine-motorcycle', 'fall', 'impact', 'jump_a', 'land', 'pickup', 'placement-a', 'placement-b', 'removal-a', 'rotate', 'skid', 'toggle', 'walking', 'weapon_change'];

export class Assets {
  constructor(base = '') {
    this.base = base;
    this.kits = {};
    this.index = {}; // "kit/ad" → Object3D
    this.sounds = {}; // ad → ArrayBuffer (çözme AudioManager'da)
    this.partsCache = new Map();
    this.bboxCache = new Map();
    this.loader = new GLTFLoader();
  }

  async loadAll(onProgress = () => {}) {
    const total = KITS.length + SOUNDS.length;
    let done = 0;
    const tick = (label) => { done++; onProgress(done / total, label); };
    const kitJobs = KITS.map(async (k) => {
      const gltf = await this.loader.loadAsync(`${this.base}assets/models/${k}.glb`);
      const root = gltf.scene;
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
    await Promise.all([...kitJobs, ...soundJobs]);
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
  parts(kit, name) {
    const key = `${kit}/${name}`;
    if (this.partsCache.has(key)) return this.partsCache.get(key);
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
    this.partsCache.set(key, out);
    return out;
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
}
