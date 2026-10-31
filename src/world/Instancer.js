// Tekrarlanan modelleri (mobilya, ağaç, çit, sokak lambası...) InstancedMesh ile çizer.
// Görünürlük ayıklaması için dünya 128 m'lik parçalara bölünür.
import * as THREE from 'three';

const CHUNK = 256;
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
    const cx = Math.floor(e[12] / CHUNK), cz = Math.floor(e[14] / CHUNK);
    const key = `${kit}/${name}@${cx},${cz}${opts.noShadow ? '!' : ''}`;
    let g = this.groups.get(key);
    if (!g) { g = { kit, name, matrices: [], shadow: !opts.noShadow, recv: opts.receive !== false }; this.groups.set(key, g); }
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
        this.parent.add(im);
        this.meshes.push(im);
      }
    }
  }

  /** Uzak parçaları gizle (çizim mesafesi) */
  cull(camPos, maxDist) {
    const m2 = maxDist * maxDist;
    for (const im of this.meshes) {
      const s = im.boundingSphere;
      if (!s) continue;
      const dx = s.center.x - camPos.x, dz = s.center.z - camPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) - s.radius;
      im.visible = d * d < m2 || d < 0;
    }
  }
}
