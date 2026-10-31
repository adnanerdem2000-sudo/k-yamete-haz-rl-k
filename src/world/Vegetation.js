// Stilize bitki örtüsü: prosedürel ağaçlar (meşe, çam, huş, çalı), kayalar, çim öbekleri ve çiçekler.
// Rüzgârda sallanma köşe gölgelendiricisinde yapılır; parça (chunk) bazlı InstancedMesh + 2 LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, smoothstep } from '../core/util.js';
import { forestMask, BIOME } from './Terrain.js';
import { WORLD, REGIONS, LAKE } from './WorldLayout.js';
import { onRoad } from './Roads.js';

const CHUNK = 160;
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function colorize(geo, color, jitter = 0.06, rng) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  // düz gölgeleme için yüz başına renk (indekssiz geometride üçlü köşeler)
  for (let i = 0; i < n; i += 3) {
    tmp.copy(c).offsetHSL((rng.next() - 0.5) * jitter * 0.3, 0, (rng.next() - 0.5) * jitter);
    for (let k = 0; k < 3 && i + k < n; k++) { arr[(i + k) * 3] = tmp.r; arr[(i + k) * 3 + 1] = tmp.g; arr[(i + k) * 3 + 2] = tmp.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function blob(r, detail, x, y, z, color, rng, sy = 1) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g = g.toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rng.next() - 0.5) * 0.18;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
  }
  g.translate(x, y, z);
  return colorize(g, color, 0.12, rng);
}
function trunk(r, h, color, rng, seg = 6) {
  const g = new THREE.CylinderGeometry(r * 0.7, r, h, seg, 1).toNonIndexed();
  g.translate(0, h / 2, 0);
  return colorize(g, color, 0.08, rng);
}
function cone(r, h, y, color, rng, seg = 7) {
  const g = new THREE.ConeGeometry(r, h, seg, 1).toNonIndexed();
  g.translate(0, y + h / 2, 0);
  return colorize(g, color, 0.1, rng);
}
function prep(list) {
  const g = mergeGeometries(list.map((x) => { x.deleteAttribute('uv'); return x; }));
  g.computeVertexNormals();
  return g;
}

/** Ağaç türleri: [yakın LOD, uzak LOD, yarıçap(çarpışma), yükseklik] */
function makeTreeTypes() {
  const rng = new RNG('trees');
  const T = {};
  T.oak = {
    near: prep([trunk(0.28, 2.8, '#6d4c33', rng, 7), blob(1.7, 1, 0, 3.6, 0, '#4caf50', rng), blob(1.35, 1, 0.9, 3.1, 0.4, '#5cb85c', rng), blob(1.3, 1, -0.8, 3.3, -0.5, '#43a047', rng), blob(1.15, 1, 0.1, 4.6, -0.2, '#66bb6a', rng)]),
    far: prep([trunk(0.28, 2.8, '#6d4c33', rng, 4), blob(2.0, 0, 0, 3.7, 0, '#4caf50', rng)]),
    r: 0.35,
  };
  T.oak2 = {
    near: prep([trunk(0.32, 3.2, '#5d4037', rng, 7), blob(2.0, 1, 0, 4.4, 0, '#7cb342', rng, 0.85), blob(1.4, 1, 1.1, 3.7, 0.3, '#8bc34a', rng), blob(1.5, 1, -1.0, 3.9, 0.2, '#689f38', rng)]),
    far: prep([trunk(0.32, 3.2, '#5d4037', rng, 4), blob(2.2, 0, 0, 4.2, 0, '#7cb342', rng)]),
    r: 0.38,
  };
  T.pine = {
    near: prep([trunk(0.25, 1.8, '#5d4037', rng, 6), cone(2.1, 2.8, 1.2, '#2e7d32', rng), cone(1.6, 2.4, 2.9, '#388e3c', rng), cone(1.0, 2.0, 4.5, '#43a047', rng)]),
    far: prep([trunk(0.25, 1.8, '#5d4037', rng, 4), cone(2.0, 5.6, 1.2, '#2e7d32', rng, 5)]),
    r: 0.3,
  };
  T.pineTall = {
    near: prep([trunk(0.3, 2.6, '#4e342e', rng, 6), cone(2.4, 3.2, 1.8, '#1b5e20', rng), cone(1.9, 2.8, 3.8, '#2e7d32', rng), cone(1.3, 2.4, 5.6, '#388e3c', rng), cone(0.7, 1.6, 7.3, '#43a047', rng)]),
    far: prep([trunk(0.3, 2.6, '#4e342e', rng, 4), cone(2.3, 7.2, 1.8, '#1b5e20', rng, 5)]),
    r: 0.34,
  };
  T.birch = {
    near: prep([trunk(0.2, 3.4, '#ece6da', rng, 6), blob(1.3, 1, 0, 4.2, 0, '#9ccc65', rng, 1.2), blob(0.9, 1, 0.6, 3.6, 0.3, '#aed581', rng)]),
    far: prep([trunk(0.2, 3.4, '#ece6da', rng, 4), blob(1.4, 0, 0, 4.1, 0, '#9ccc65', rng, 1.2)]),
    r: 0.25,
  };
  T.autumn = {
    near: prep([trunk(0.28, 2.6, '#6d4c33', rng, 7), blob(1.6, 1, 0, 3.4, 0, '#ef8f2f', rng), blob(1.2, 1, 0.8, 2.9, 0.4, '#f4b33d', rng), blob(1.2, 1, -0.7, 3.2, -0.4, '#e2652c', rng)]),
    far: prep([trunk(0.28, 2.6, '#6d4c33', rng, 4), blob(1.9, 0, 0, 3.5, 0, '#ef8f2f', rng)]),
    r: 0.35,
  };
  T.bush = {
    near: prep([blob(0.8, 1, 0, 0.55, 0, '#558b2f', rng, 0.8), blob(0.65, 1, 0.6, 0.45, 0.2, '#689f38', rng, 0.8), blob(0.6, 1, -0.5, 0.45, -0.3, '#7cb342', rng, 0.8)]),
    far: prep([blob(0.9, 0, 0, 0.5, 0, '#558b2f', rng, 0.8)]),
    r: 0, // çalılar engel değil
  };
  T.flowerBush = {
    near: prep([blob(0.7, 1, 0, 0.5, 0, '#43a047', rng, 0.8), blob(0.18, 0, 0.3, 0.95, 0.2, '#f06292', rng), blob(0.16, 0, -0.35, 0.9, 0.1, '#ffeb3b', rng), blob(0.17, 0, 0.0, 1.0, -0.35, '#ba68c8', rng)]),
    far: prep([blob(0.75, 0, 0, 0.5, 0, '#43a047', rng, 0.8)]),
    r: 0,
  };
  T.rock = {
    near: prep([blob(1.1, 0, 0, 0.5, 0, '#8d8a85', rng, 0.7), blob(0.7, 0, 0.8, 0.35, 0.3, '#9e9b95', rng, 0.7)]),
    far: prep([blob(1.1, 0, 0, 0.5, 0, '#8d8a85', rng, 0.7)]),
    r: 1.1, rock: true,
  };
  T.boulder = {
    near: prep([blob(2.2, 1, 0, 1.0, 0, '#7f7b75', rng, 0.75), blob(1.4, 0, 1.6, 0.6, 0.6, '#8f8b84', rng, 0.7)]),
    far: prep([blob(2.2, 0, 0, 1.0, 0, '#7f7b75', rng, 0.75)]),
    r: 2.2, rock: true,
  };
  // çim öbeği (çapraz yapraklar)
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI + rng.next() * 0.4;
    const h = 0.45 + rng.next() * 0.35;
    const g = new THREE.BufferGeometry();
    const w = 0.07;
    const cx = Math.cos(a) * 0.12, cz = Math.sin(a) * 0.12;
    const px = Math.cos(a + Math.PI / 2) * w, pz = Math.sin(a + Math.PI / 2) * w;
    const lean = (rng.next() - 0.5) * 0.25;
    g.setAttribute('position', new THREE.Float32BufferAttribute([cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + lean, h, cz + lean * 0.5], 3));
    blades.push(colorize(g, rng.pick(['#7cb342', '#8bc34a', '#689f38', '#9ccc65']), 0.15, rng));
  }
  T.grass = { near: prep(blades), far: null, r: 0, grass: true };
  return T;
}

function windMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !opts.smooth, roughness: 0.9, metalness: 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hgt = max(0.0, position.y - ${opts.pivot || '1.2'});
        float ph = uTime * 1.6 + ip.x * 0.13 + ip.z * 0.11;
        float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.25) * ${opts.amp || '0.035'} * uWind * hgt;
        transformed.x += sway;
        transformed.z += sway * 0.55;`);
  };
  return m;
}

export class Vegetation {
  constructor(world) {
    this.world = world;
    this.types = makeTreeTypes();
    this.mats = {
      tree: windMaterial({ amp: '0.028', pivot: '1.5' }),
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
      grass: windMaterial({ amp: '0.35', pivot: '0.0', double: true, smooth: true }),
      bush: windMaterial({ amp: '0.05', pivot: '0.3' }),
    };
    this.chunks = new Map(); // anahtar → {near:[mesh], far:[mesh], cx, cz}
    this.instances = []; // {type, x, y, z, rot, s}
    this.grassInst = [];
  }

  add(type, x, z, rot = 0, s = 1, y = null) {
    const yy = y ?? this.world.terrain.heightAt(x, z) - 0.05;
    this.instances.push({ type, x, y: yy, z, rot, s });
    const t = this.types[type];
    if (t.r > 0) {
      const col = this.world.physics.add({ shape: 'circle', x, z, r: t.r * s, minY: yy - 1, maxY: yy + (t.rock ? 1.6 * s : 8 * s), kind: t.rock ? 'rock' : 'tree', walkable: !!t.rock, blocksSight: !t.rock || s > 1.2 });
      void col;
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
        if (Math.hypot(px - LAKE.x, pz - LAKE.z) < LAKE.r + 4) continue;
        const reg = terrain.regionAt(px, pz);
        if (reg && reg.id !== 'orman') continue;
        const fm = forestMask(px, pz);
        const slope = terrain.slopeAt(px, pz);
        if (slope > 0.45) continue;
        let p = fm * 0.75 + 0.025;
        if (h > 50) p *= 0.5;
        if (rng.next() > p) {
          // seyrek çalı/kaya
          const r2 = rng.next();
          if (r2 < 0.05 && !blocked(px, pz, 1.5)) this.add(rng.chance(0.3) ? 'flowerBush' : 'bush', px, pz, rng.next() * 6, 0.8 + rng.next() * 0.6);
          else if (r2 < 0.07 + (h > 30 ? 0.05 : 0) && !blocked(px, pz, 2.5)) this.add(rng.chance(0.25) ? 'boulder' : 'rock', px, pz, rng.next() * 6, 0.6 + rng.next() * 0.9);
          continue;
        }
        if (onRoad(px, pz, 2.5) || blocked(px, pz, 2)) continue;
        let type;
        if (h > 34) type = rng.chance(0.75) ? 'pineTall' : 'pine';
        else if (fm > 0.75) type = rng.weighted([['pineTall', 3], ['pine', 3], ['oak', 2], ['oak2', 1], ['birch', 1]]);
        else type = rng.weighted([['oak', 3], ['oak2', 2], ['pine', 2], ['birch', 2], ['autumn', 0.6]]);
        this.add(type, px, pz, rng.next() * 6, 0.85 + rng.next() * 0.45);
        if (rng.chance(0.25)) {
          const bx = px + (rng.next() - 0.5) * 4, bz = pz + (rng.next() - 0.5) * 4;
          if (!blocked(bx, bz, 1)) this.add('bush', bx, bz, rng.next() * 6, 0.7 + rng.next() * 0.5);
        }
      }
    }
    // çim öbekleri: çayır/çimen biyomlarında
    const gstep = 3.2;
    for (let z = -H; z < H; z += gstep) {
      for (let x = -H; x < H; x += gstep) {
        const px = x + (rng.next() - 0.5) * gstep, pz = z + (rng.next() - 0.5) * gstep;
        const b = this.world.terrain.biome[this.world.terrain.idx(Math.round((px + WORLD.half) / WORLD.cell), Math.round((pz + WORLD.half) / WORLD.cell))];
        if (!(b === BIOME.GRASS || b === BIOME.LAWN || b === BIOME.FOREST || b === BIOME.FIELD)) continue;
        if (rng.next() > (b === BIOME.LAWN ? 0.45 : 0.6)) continue;
        if (onRoad(px, pz, 1) || blocked(px, pz, 0.5)) continue;
        this.grassInst.push({ x: px, y: terrain.heightAt(px, pz) - 0.02, z: pz, rot: rng.next() * 6, s: 0.8 + rng.next() * 0.7 });
      }
    }
  }

  build(scene) {
    const groups = new Map();
    for (const inst of this.instances) {
      const cx = Math.floor(inst.x / CHUNK), cz = Math.floor(inst.z / CHUNK);
      const key = `${inst.type}@${cx},${cz}`;
      if (!groups.has(key)) groups.set(key, { type: inst.type, cx, cz, list: [] });
      groups.get(key).list.push(inst);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const g of groups.values()) {
      const t = this.types[g.type];
      const mat = t.rock ? this.mats.rock : g.type.includes('ush') ? this.mats.bush : this.mats.tree;
      const ck = `${g.cx},${g.cz}`;
      if (!this.chunks.has(ck)) this.chunks.set(ck, { near: [], far: [], cx: (g.cx + 0.5) * CHUNK, cz: (g.cz + 0.5) * CHUNK });
      const chunk = this.chunks.get(ck);
      for (const lod of ['near', 'far']) {
        const geo = t[lod];
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, mat, g.list.length);
        g.list.forEach((inst, i) => {
          m.compose(p.set(inst.x, inst.y, inst.z), q.setFromAxisAngle(Y, inst.rot), s.setScalar(inst.s));
          im.setMatrixAt(i, m);
        });
        im.castShadow = lod === 'near' && !g.type.includes('ush');
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.visible = lod === 'near';
        im.name = `veg:${g.type}:${lod}`;
        scene.add(im);
        chunk[lod].push(im);
      }
    }
    // çim
    const gg = new Map();
    for (const inst of this.grassInst) {
      const ck = `${Math.floor(inst.x / CHUNK)},${Math.floor(inst.z / CHUNK)}`;
      if (!gg.has(ck)) gg.set(ck, []);
      gg.get(ck).push(inst);
    }
    for (const [ck, list] of gg) {
      const im = new THREE.InstancedMesh(this.types.grass.near, this.mats.grass, list.length);
      list.forEach((inst, i) => { m.compose(p.set(inst.x, inst.y, inst.z), q.setFromAxisAngle(Y, inst.rot), s.setScalar(inst.s)); im.setMatrixAt(i, m); });
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.name = 'veg:grass';
      scene.add(im);
      if (!this.chunks.has(ck)) { const [a, b] = ck.split(',').map(Number); this.chunks.set(ck, { near: [], far: [], cx: (a + 0.5) * CHUNK, cz: (b + 0.5) * CHUNK }); }
      this.chunks.get(ck).grass = im;
    }
  }

  /** LOD ve mesafe ayıklama */
  update(camPos, viewDist, grassOn = true) {
    for (const c of this.chunks.values()) {
      const d = Math.hypot(c.cx - camPos.x, c.cz - camPos.z) - CHUNK * 0.7;
      const near = d < 110, vis = d < viewDist;
      for (const im of c.near) im.visible = vis && near;
      for (const im of c.far) im.visible = vis && !near;
      if (c.grass) c.grass.visible = grassOn && d < 55;
    }
  }
}

export { smoothstep };
void REGIONS;
