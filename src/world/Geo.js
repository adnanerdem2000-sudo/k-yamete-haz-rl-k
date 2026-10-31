// Geometri biriktirici: kutu/dörtgen/üçgen ekleyip malzeme başına tek bir ağ üretir.
// Köşe renkleri (vertex color) ile boyama yapılır; UV'ler dünya ölçeğindedir.
import * as THREE from 'three';
import { getTexture } from './TextureFactory.js';
import { SURF, NEUTRAL_GAIN } from './Surfaces.js';

let MATS = null;
/** Paylaşılan bina malzemeleri */
export function materials() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o });
  // PBR yüzey dokusu varsa (nötr ayrıntı + normal haritası) onu, yoksa prosedürel canvas dokusunu kullan
  const surf = (c, n, canvasName, o = {}, ns = 0.9) => (SURF[c]
    ? std({ map: SURF[c], normalMap: n && SURF[n] ? SURF[n] : null, normalScale: new THREE.Vector2(ns, ns), color: new THREE.Color().setScalar(NEUTRAL_GAIN), ...o })
    : std({ map: getTexture(canvasName), ...o }));
  MATS = {
    siding: std({ map: getTexture('siding') }),
    brick: surf('brick_c', 'brick_n', 'brick', {}, 1.0),
    plaster: std({ map: getTexture('plaster') }),
    concrete: surf('concrete_c', 'concrete_n', 'concrete', { roughness: 0.92 }, 0.7),
    metal: std({ map: getTexture('metal'), roughness: 0.6, metalness: 0.25 }),
    interior: std({ map: getTexture('plaster'), roughness: 0.92 }),
    woodfloor: std({ map: getTexture('woodfloor'), roughness: 0.7 }),
    tiles: std({ map: getTexture('tiles'), roughness: 0.4 }),
    carpet: std({ map: getTexture('carpet'), roughness: 1 }),
    shingles: surf('roofslate_c', 'roofslate_n', 'shingles', { roughness: 0.88 }, 1.0),
    trim: std({ roughness: 0.7 }),
    wood: std({ map: getTexture('wood'), roughness: 0.8 }),
    plain: std({ roughness: 0.8 }),
    shiny: std({ roughness: 0.3, metalness: 0.4 }),
    asphalt: surf('asphalt_c', 'concrete_n', 'asphalt', { roughness: 0.93 }, 0.35),
    emissive: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd4ef, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }),
  };
  for (const [k, m] of Object.entries(MATS)) m.name = 'geo_' + k;
  return MATS;
}

// Malzeme başına UV ölçeği (1 doku tekrarı kaç metre)
const UVS = { siding: 0.5, brick: 0.45, plaster: 0.35, concrete: 0.25, metal: 0.4, interior: 0.35, woodfloor: 0.45, tiles: 0.6, carpet: 0.5, shingles: 0.6, wood: 0.8, asphalt: 0.12 };

const _c = new THREE.Color();

class Bucket {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
}

export class Geo {
  constructor() { this.buckets = new Map(); }

  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) { b = new Bucket(); this.buckets.set(key, b); }
    return b;
  }

  /** 4 noktalı yüz (saat yönünün tersine, normal dışa bakar) */
  quad(key, p0, p1, p2, p3, color, uvMode = null) {
    const b = this.bucket(key);
    _c.set(color);
    const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    const e2x = p3[0] - p0[0], e2y = p3[1] - p0[1], e2z = p3[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const s = UVS[key] || 0.5;
    const pts = [p0, p1, p2, p3];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    for (const p of pts) {
      b.pos.push(p[0], p[1], p[2]);
      b.nrm.push(nx, ny, nz);
      b.col.push(_c.r, _c.g, _c.b);
      let u, v;
      if (uvMode === 'edge') {
        // dörtgen kenarlarına göre (çatı eğimleri)
        const l1 = Math.hypot(e1x, e1y, e1z) || 1, l2 = Math.hypot(e2x, e2y, e2z) || 1;
        const dx = p[0] - p0[0], dy = p[1] - p0[1], dz = p[2] - p0[2];
        u = (dx * e1x + dy * e1y + dz * e1z) / l1;
        v = (dx * e2x + dy * e2y + dz * e2z) / l2;
      } else if (ay >= ax && ay >= az) { u = p[0]; v = p[2]; }
      else if (ax >= az) { u = p[2]; v = p[1]; }
      else { u = p[0]; v = p[1]; }
      b.uv.push(u * s, v * s);
    }
    const n = b.n;
    b.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    b.n += 4;
  }

  tri(key, p0, p1, p2, color) {
    const b = this.bucket(key);
    _c.set(color);
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const s = UVS[key] || 0.5;
    const ax = Math.abs(nx), az = Math.abs(nz);
    for (const p of [p0, p1, p2]) {
      b.pos.push(p[0], p[1], p[2]);
      b.nrm.push(nx, ny, nz);
      b.col.push(_c.r, _c.g, _c.b);
      if (ax >= az) b.uv.push(p[2] * s, p[1] * s); else b.uv.push(p[0] * s, p[1] * s);
    }
    b.idx.push(b.n, b.n + 1, b.n + 2);
    b.n += 3;
  }

  /**
   * Eksen hizalı kutu. faces bit maskesi: 1:+X 2:-X 4:+Y 8:-Y 16:+Z 32:-Z
   * keyOverride: {px:'malzeme', nx:..., ...} yüz başına malzeme
   */
  box(key, x0, y0, z0, x1, y1, z1, color, faces = 63, keyOverride = null) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const K = (f) => (keyOverride && keyOverride[f]) || key;
    if (faces & 1) this.quad(K('px'), [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
    if (faces & 2) this.quad(K('nx'), [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
    if (faces & 4) this.quad(K('py'), [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color);
    if (faces & 8) this.quad(K('ny'), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    if (faces & 16) this.quad(K('pz'), [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
    if (faces & 32) this.quad(K('nz'), [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
  }

  /** Silindir (yaklaşık, n kenarlı) — direkler, variller, borular */
  cylinder(key, cx, y0, cz, r, h, color, n = 10, caps = true) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      this.quad(key, [x1, y0, z1], [x0, y0, z0], [x0, y0 + h, z0], [x1, y0 + h, z1], color);
      if (caps) {
        this.tri(key, [cx, y0 + h, cz], [x1, y0 + h, z1], [x0, y0 + h, z0], color);
        this.tri(key, [cx, y0, cz], [x0, y0, z0], [x1, y0, z1], color);
      }
    }
  }

  isEmpty() { return this.buckets.size === 0; }

  /** Malzeme başına ağ üret. matrix: tüm köşelere uygulanacak dönüşüm */
  toMeshes(matrix = null, opts = {}) {
    const M = materials();
    const out = [];
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    for (const [key, b] of this.buckets) {
      if (!b.n) continue;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(b.pos), nrm = new Float32Array(b.nrm);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      g.setIndex(b.n > 65000 ? new THREE.BufferAttribute(new Uint32Array(b.idx), 1) : new THREE.BufferAttribute(new Uint16Array(b.idx), 1));
      if (matrix) { g.applyMatrix4(matrix); }
      g.computeBoundingSphere();
      const mat = M[key] || M.plain;
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = key !== 'glass' && opts.castShadow !== false;
      mesh.receiveShadow = key !== 'glass';
      mesh.name = 'geo:' + key;
      if (key === 'glass') mesh.renderOrder = 2;
      out.push(mesh);
    }
    void nm;
    return out;
  }
}
