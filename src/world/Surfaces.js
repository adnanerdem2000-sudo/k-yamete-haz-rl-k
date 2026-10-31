// Yüzey dokuları kaydı: PBR dokular (Quaternius Downtown City MegaKit + Stylized Nature MegaKit kayası, CC0;
// tools/pack-textures.mjs → assets/textures). Renk dokuları "nötr ayrıntı" (gri, sRGB ortalaması ~0.8): renk
// köşe renginden gelir. Assets yükler; Geo (bina malzemeleri) ve Terrain (arazi katmanları) kullanır.
import * as THREE from 'three';

export const SURF = {}; // ad → THREE.Texture (ör. brick_c, brick_n)
export const SURFACE_FILES = ['dirt_c', 'dirt_n', 'concrete_c', 'concrete_n', 'asphalt_c', 'brick_c', 'brick_n', 'roofslate_c', 'roofslate_n', 'rock_c'];
// nötr ayrıntı dokusunun doğrusal ortalaması (sRGB 0.8 → doğrusal ~0.6): çarpan 1/0.6 ile ortalama 1 olur
export const NEUTRAL_GAIN = 1.65;

export async function loadSurfaces(base = '') {
  const L = new THREE.TextureLoader();
  await Promise.all(SURFACE_FILES.map(async (n) => {
    try {
      const t = await L.loadAsync(`${base}assets/textures/${n}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = n.endsWith('_n') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.name = n;
      SURF[n] = t;
    } catch (e) { console.warn('Yüzey dokusu yüklenemedi', n, e); }
  }));
  return SURF;
}
