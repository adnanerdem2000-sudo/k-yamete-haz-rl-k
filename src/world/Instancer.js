// Tekrarlanan modelleri (mobilya, ağaç, çit, sokak lambası...) InstancedMesh ile çizer.
// Görünürlük ayıklaması için dünya 512 m'lik parçalara bölünür (256 m kaydırılmış: şehir merkezi tek parçaya
// düşer, model başına tek çağrı); iç mekân eşyaları (interior) 64 m'lik hücrelerde tutulur ve yalnız yakında
// (INTERIOR_DIST) çizilir: duvar ardında, en fazla pencereden görünürler.
import * as THREE from 'three';

const CHUNK = 512, CHUNK_OFF = 256, ICHUNK = 64, INTERIOR_DIST = 50;
const _m = new THREE.Matrix4();

export class Instancer {
  constructor(assets, parent) {
    this.assets = assets;
    this.parent = parent;
    this.groups = new Map(); // anahtar → {kit, name, matrices: [], shadow}
    this.meshes = [];
  }

  /** Model örneği ekle. matrix: dünya dönüşümü */
  add(kit, name, matrix, opts = {}) {
    const e = matrix.elements;
    const C = opts.interior ? ICHUNK : CHUNK, off = opts.interior ? 0 : CHUNK_OFF;
    const cx = Math.floor((e[12] + off) / C), cz = Math.floor((e[14] + off) / C);
    const key = `${kit}/${name}@${cx},${cz}${opts.noShadow ? '!' : ''}${opts.interior ? '#i' : ''}`;
    let g = this.groups.get(key);
    if (!g) { g = { kit, name, matrices: [], shadow: !opts.noShadow, recv: opts.receive !== false, interior: !!opts.interior }; this.groups.set(key, g); }
    g.matrices.push(matrix.clone());
    return g.matrices.length - 1;
  }

  /** Konum/dönüş/ölçekle kolay ekleme */
  place(kit, name, x, y, z, rotY = 0, scale = 1, opts = {}) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
    );
    return this.add(kit, name, m, opts);
  }

  build() {
    for (const g of this.groups.values()) {
      const parts = this.assets.parts(g.kit, g.name);
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, g.matrices.length);
        for (let i = 0; i < g.matrices.length; i++) {
          _m.multiplyMatrices(g.matrices[i], p.matrix);
          im.setMatrixAt(i, _m);
        }
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = g.shadow;
        im.receiveShadow = g.recv;
        im.computeBoundingSphere();
        im.name = `inst:${g.kit}/${g.name}`;
        im.userData.interior = g.interior;
        this.parent.add(im);
        this.meshes.push(im);
      }
    }
  }

  /** Uzak parçaları gizle (çizim mesafesi) */
  cull(camPos, maxDist) {
    for (const im of this.meshes) {
      const s = im.boundingSphere;
      if (!s) continue;
      const dx = s.center.x - camPos.x, dz = s.center.z - camPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) - s.radius;
      im.visible = d < (im.userData.interior ? Math.min(maxDist, INTERIOR_DIST) : maxDist);
    }
  }
}
