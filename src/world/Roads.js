// Yol şeritleri: araziyi takip eden, Catmull-Rom ile yumuşatılmış asfalt/toprak yollar,
// şerit çizgileri ve kentsel bölgelerde kaldırımlar.
import * as THREE from 'three';
import { ROADS } from './WorldLayout.js';
import { materials } from './Geo.js';

const UP = 0.07;

export function roadCenterline(road, step = 2) {
  const pts = road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  let curvePts;
  if (pts.length > 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const len = curve.getLength();
    curvePts = curve.getSpacedPoints(Math.max(2, Math.ceil(len / step)));
  } else {
    const len = pts[0].distanceTo(pts[1]);
    const n = Math.max(2, Math.ceil(len / step));
    curvePts = [];
    for (let i = 0; i <= n; i++) curvePts.push(pts[0].clone().lerp(pts[1], i / n));
  }
  return curvePts;
}

function ribbon(terrain, line, halfW, offset = 0, lift = UP, color, segsAcross = 2) {
  const pos = [], col = [], uv = [], idx = [];
  const c = new THREE.Color(color);
  let dist = 0;
  const across = segsAcross + 1;
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    if (i > 0) dist += Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z);
    for (let k = 0; k < across; k++) {
      const t = -1 + (2 * k) / segsAcross;
      const o = offset + t * halfW;
      const x = p.x + nx * o, z = p.z + nz * o;
      const y = terrain.heightAt(x, z) + lift;
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      uv.push((t * halfW) / 3, dist / 3);
    }
    if (i > 0) {
      const base = (i - 1) * across;
      for (let k = 0; k < segsAcross; k++) {
        const a0 = base + k, a1 = base + k + 1, b0 = base + across + k, b1 = base + across + k + 1;
        idx.push(a0, b1, b0, a0, a1, b1);
      }
    }
  }
  return { pos, col, uv, idx };
}

function merge(parts) {
  const pos = [], col = [], uv = [], idx = [];
  let off = 0;
  for (const p of parts) {
    pos.push(...p.pos); col.push(...p.col); uv.push(...p.uv);
    for (const i of p.idx) idx.push(i + off);
    off += p.pos.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Yol çizgisi: kesik orta şerit (dash) */
function dashes(terrain, line, color, dashLen = 3, gap = 3, halfW = 0.12, offset = 0) {
  const parts = [];
  let acc = 0, on = true, seg = [];
  for (let i = 0; i < line.length; i++) {
    if (i > 0) acc += line[i].distanceTo(line[i - 1]);
    seg.push(line[i]);
    if ((on && acc >= dashLen) || (!on && acc >= gap)) {
      if (on && seg.length > 1) parts.push(ribbon(terrain, seg, halfW, offset, UP + 0.02, color, 1));
      seg = [line[i]]; acc = 0; on = !on;
    }
  }
  return parts;
}

export function buildRoads(terrain, scene, urbanTest) {
  const asphalt = [], dirt = [], marks = [], walks = [];
  for (const road of ROADS) {
    const line = roadCenterline(road);
    road.line = line;
    const hw = road.w / 2;
    if (road.type === 'asphalt') {
      asphalt.push(ribbon(terrain, line, hw, 0, UP, '#4a4a4f', 2));
      if (road.w >= 8) marks.push(...dashes(terrain, line, '#f4f1e3'));
      // kenar çizgileri
      if (road.w >= 9) {
        marks.push(ribbon(terrain, line, 0.08, hw - 0.35, UP + 0.02, '#e8e4d6', 1));
        marks.push(ribbon(terrain, line, 0.08, -hw + 0.35, UP + 0.02, '#e8e4d6', 1));
      }
      // kentsel kaldırım
      if (urbanTest(line[Math.floor(line.length / 2)])) {
        walks.push(ribbon(terrain, line, 1.1, hw + 1.1, UP + 0.05, '#b8b2a7', 1));
        walks.push(ribbon(terrain, line, 1.1, -hw - 1.1, UP + 0.05, '#b8b2a7', 1));
      }
    } else {
      dirt.push(ribbon(terrain, line, hw, 0, UP - 0.02, road.type === 'path' ? '#a98b62' : '#8f6f4a', 2));
    }
  }
  const M = materials();
  const out = [];
  const add = (parts, mat, name) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);
    out.push(mesh);
  };
  const roadMat = M.asphalt.clone();
  roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -2; roadMat.polygonOffsetUnits = -2;
  const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: M.concrete.map, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const walkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: M.concrete.map, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  add(asphalt, roadMat, 'roads');
  add(dirt, dirtMat, 'dirtroads');
  add(marks, markMat, 'roadmarks');
  add(walks, walkMat, 'sidewalks');
  return { meshes: out, roadMaterial: roadMat };
}

/** Bir noktanın herhangi bir yol üzerinde olup olmadığı (asfalt/toprak) */
export function onRoad(x, z, margin = 0) {
  for (const road of ROADS) {
    const line = road.line;
    if (!line) continue;
    const hw = road.w / 2 + margin;
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i], b = line[i + 1];
      const vx = b.x - a.x, vz = b.z - a.z;
      const L2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t, pz = a.z + vz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 < hw * hw) return road;
    }
  }
  return null;
}
