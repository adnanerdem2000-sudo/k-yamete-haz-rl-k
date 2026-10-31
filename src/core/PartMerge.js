// Kit modellerinin parçalarını çizim çağrısı azaltmak için birleştirir (Instancer'ın kullandığı parça listesi).
//  - Aynı malzemeyi paylaşan parçalar tek geometriye birleşir.
//  - Dokusuz, opak, düz renkli malzemeler (Kenney araçları: boya, cam, lastik, far…) TEK malzemede toplanır:
//    renk köşe rengine, pürüzlülük/metallik ve ışıma köşe özniteliğine pişirilir; gölgelendirici bunları malzeme
//    sabitleri yerine okur. Görünüm aynı kalır, araç başına 7–10 yerine 1 çizim çağrısı.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const IDENT = new THREE.Matrix4();
const _c = new THREE.Color();

/** Doku, saydamlık ya da özel gölgelendirici içermeyen standart malzeme mi */
export function isFlatMaterial(m) {
  return !!m && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.transparent && m.opacity >= 1 && !(m.alphaTest > 0) && !Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')
    && !m.map && !m.normalMap && !m.roughnessMap && !m.metalnessMap && !m.emissiveMap && !m.aoMap && !m.alphaMap && !m.bumpMap && !m.displacementMap && !m.lightMap && !m.wireframe;
}

/** Nicemlenmiş/aralıklı öznitelik → düz Float32 (birleştirme ve matris uygulama için) */
function toFloat(attr) {
  if (attr.array instanceof Float32Array && !attr.normalized && !attr.isInterleavedBufferAttribute) return attr.clone();
  const n = attr.count, k = attr.itemSize, out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, k);
}

/** Parçayı model uzayına taşı; keep: tutulacak öznitelikler (null: hepsi) */
function bakeGeometry(p, keep) {
  const src = p.geometry;
  if (src.morphAttributes && Object.keys(src.morphAttributes).length) return null;
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) if (!keep || keep.includes(name)) g.setAttribute(name, toFloat(a));
  if (!g.attributes.position) return null;
  if (src.index) g.setIndex(Array.from(src.index.array));
  else g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  g.applyMatrix4(p.matrix);
  // aynalı dönüşüm (negatif ölçek) üçgen yönünü çevirir: sarımı düzelt
  if (p.matrix.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Düz malzemeyi köşelere pişir: color (malzeme rengi × varsa köşe rengi), aRM (pürüzlülük, metallik), aEmi (ışıma) */
function bakeFlat(p) {
  const m = p.material;
  const src = p.geometry;
  const g = bakeGeometry(p, ['position', 'normal']);
  if (!g) return null;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), rm = new Float32Array(n * 2), emi = new Float32Array(n * 3);
  const vc = m.vertexColors && src.attributes.color ? src.attributes.color : null;
  _c.copy(m.emissive).multiplyScalar(m.emissiveIntensity);
  for (let i = 0; i < n; i++) {
    const r = vc ? vc.getX(i) : 1, gg = vc ? vc.getY(i) : 1, b = vc ? vc.getZ(i) : 1;
    col[i * 3] = m.color.r * r; col[i * 3 + 1] = m.color.g * gg; col[i * 3 + 2] = m.color.b * b;
    rm[i * 2] = m.roughness; rm[i * 2 + 1] = m.metalness;
    emi[i * 3] = _c.r; emi[i * 3 + 1] = _c.g; emi[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  g.setAttribute('aEmi', new THREE.BufferAttribute(emi, 3));
  return g;
}

const FLAT = new Map();
/** Pişirilmiş düz parçaların ortak malzemesi (yüz yönü ve düz gölgelemeye göre) */
export function flatMaterial(side = THREE.FrontSide, flatShading = false) {
  const key = side + ':' + flatShading;
  if (FLAT.has(key)) return FLAT.get(key);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side, flatShading, roughness: 1, metalness: 0 });
  m.name = 'kit_flat';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM; attribute vec3 aEmi; varying vec2 vRM; varying vec3 vEmi;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM; vEmi = aEmi;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM; varying vec3 vEmi;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmi;');
  };
  m.customProgramCacheKey = () => 'kit_flat';
  FLAT.set(key, m);
  return m;
}

/**
 * parts: [{ geometry, material, matrix }] → birleştirilmiş liste (matris birim). Birleştirilemeyen parçalar
 * (uyumsuz öznitelikler, morf hedefleri) olduğu gibi kalır.
 */
export function mergeParts(parts) {
  if (!parts || parts.length < 2) return parts;
  const groups = new Map();
  for (const p of parts) {
    const m = p.material;
    const flat = isFlatMaterial(m);
    const key = flat ? `flat:${m.side}:${m.flatShading}` : 'mat:' + m.uuid;
    if (!groups.has(key)) groups.set(key, { flat, items: [] });
    groups.get(key).items.push(p);
  }
  if (groups.size === parts.length) return parts;
  const out = [];
  for (const g of groups.values()) {
    if (g.items.length === 1) { out.push(g.items[0]); continue; }
    const geos = g.items.map((p) => (g.flat ? bakeFlat(p) : bakeGeometry(p, null)));
    const ok = geos.every(Boolean) && geos.every((x) => sameAttributes(x, geos[0]));
    const merged = ok ? mergeGeometries(geos, false) : null;
    if (!merged) { out.push(...g.items); continue; }
    merged.computeBoundingSphere();
    const m0 = g.items[0].material;
    out.push({ geometry: merged, material: g.flat ? flatMaterial(m0.side, m0.flatShading) : m0, matrix: IDENT.clone(), merged: g.items.length });
  }
  return out;
}

/** Yanmış görünüm: kömürleşmiş koyu gövde, yer yer pas; ışıklar sönük, pürüzlü yüzey */
export function burntParts(parts) {
  const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
  return parts.map((p) => {
    const g = p.geometry.clone();
    if (g.attributes.color && g.attributes.aRM) {
      const c = g.attributes.color, rm = g.attributes.aRM, e = g.attributes.aEmi, pos = g.attributes.position;
      for (let i = 0; i < c.count; i++) {
        const n = hash(Math.round(pos.getX(i) * 3), Math.round(pos.getY(i) * 3), Math.round(pos.getZ(i) * 3));
        // kömür karası taban, yer yer pas (turuncu-kahve) ve kül grisi lekeler
        const k = 0.022 + 0.05 * n, rust = n > 0.5 ? (n - 0.5) * 0.55 : 0, ash = n < 0.12 ? 0.06 : 0;
        c.setXYZ(i, k + rust + ash, k * 0.8 + rust * 0.42 + ash, k * 0.7 + rust * 0.16 + ash);
        rm.setXY(i, 0.95, 0.2);
        if (e) e.setXYZ(i, 0, 0, 0);
      }
      return { ...p, geometry: g };
    }
    const m = p.material.clone();
    m.color = m.color.clone().multiplyScalar(0.1);
    m.roughness = 1;
    if (m.emissive) m.emissive.setScalar(0);
    return { ...p, geometry: g, material: m };
  });
}

function sameAttributes(a, b) {
  const ka = Object.keys(a.attributes).sort().join(), kb = Object.keys(b.attributes).sort().join();
  if (ka !== kb) return false;
  for (const k of Object.keys(a.attributes)) if (a.attributes[k].itemSize !== b.attributes[k].itemSize) return false;
  return true;
}
