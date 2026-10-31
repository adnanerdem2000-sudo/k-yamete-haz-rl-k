// Prosedürel, içine girilebilen binalar: dış/iç duvarlar, kapılar, pencereler, zemin,
// çatı (içerideyken gizlenir), tabelalar, mobilya ve yağmalanabilir konteynerler.
import * as THREE from 'three';
import { Geo, materials } from './Geo.js';
import { signTexture } from './TextureFactory.js';
import { TEMPLATES } from './BuildingTemplates.js';
import { furnishRoom } from './Furnish.js';
import { NAV } from './NavGrid.js';
import { RNG } from '../core/util.js';

export const FLOOR_LIFT = 0.3;
const EXT_T = 0.25, INT_T = 0.15, DOOR_H = 2.15;

let DOOR_ID = 1, WIN_ID = 1;

export class Door {
  constructor(o) {
    Object.assign(this, o);
    this.id = 'd' + (DOOR_ID++);
    this.open01 = 0; this.target = 0;
    this.maxHp = o.kind === 'metal' ? 320 : o.kind === 'garage' ? 400 : o.kind === 'glass2' ? 120 : 160;
    this.hp = this.maxHp;
    this.barricade = 0; this.broken = false;
    this.locked = !!o.locked;
  }
  get isOpen() { return this.target > 0.5 || this.broken; }
  get blocking() { return !this.broken && this.open01 < 0.5; }
}

export class WindowPane {
  constructor(o) { Object.assign(this, o); this.id = 'w' + (WIN_ID++); this.maxHp = 40; this.hp = 40; this.broken = false; this.barricade = 0; }
}

export class Building {
  constructor(spec, tpl) {
    this.spec = spec; this.tpl = tpl; this.id = spec.id;
    this.name = spec.name || spec.sign || tpl.label || 'Bina';
    this.doors = []; this.windows = []; this.containers = []; this.rooms = []; this.colliders = [];
    this.roof = new THREE.Group();
    this.shell = new THREE.Group();
    this.interiorLights = [];
  }
  /** Dünya noktası binanın içinde mi */
  contains(x, z, y = null) {
    const b = this.box;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    if (y !== null && (y < this.floorY - 1.2 || y > this.floorY + this.tpl.H + 0.5)) return false;
    return true;
  }
  roomAt(x, z) {
    for (const r of this.rooms) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r;
    return null;
  }
}

/** Şablon koordinatı → dünya dönüşümü yardımcıları */
class Frame {
  constructor(spec, tpl, baseY) {
    this.cx = spec.x; this.cz = spec.z; this.rot = spec.rot || 0; this.w = tpl.w; this.d = tpl.d; this.baseY = baseY;
    this.theta = this.rot * Math.PI / 2;
    this.c = Math.round(Math.cos(this.theta)); this.s = Math.round(Math.sin(this.theta));
    this.matrix = new THREE.Matrix4().makeRotationY(this.theta).setPosition(this.cx, baseY, this.cz);
    this.matrix.multiply(new THREE.Matrix4().makeTranslation(-tpl.w / 2, 0, -tpl.d / 2));
  }
  /** şablon (tx, tz) → dünya {x, z} */
  pt(tx, tz) {
    const lx = tx - this.w / 2, lz = tz - this.d / 2;
    return { x: this.cx + lx * this.c + lz * this.s, z: this.cz - lx * this.s + lz * this.c };
  }
  /** şablon kutusu → dünya AABB */
  box(x0, z0, x1, z1) {
    const a = this.pt(x0, z0), b = this.pt(x1, z1);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  }
  /** şablon yönü (dx, dz) → dünya yönü */
  dir(dx, dz) { return { x: dx * this.c + dz * this.s, z: -dx * this.s + dz * this.c }; }
  angle(a) { return a + this.theta; }
}

/**
 * Bir binayı inşa eder. ctx: {assets, physics, instancer, terrain, panes:[], scene}
 */
export function buildBuilding(spec, ctx) {
  const tplFn = TEMPLATES[spec.tpl];
  if (!tplFn) throw new Error('Bilinmeyen bina şablonu: ' + spec.tpl);
  const rng = new RNG('bld:' + spec.id);
  const tpl = tplFn(spec, rng);
  const baseY = spec.y ?? ctx.terrain.heightAt(spec.x, spec.z);
  const fr = new Frame(spec, tpl, baseY);
  const B = new Building(spec, tpl);
  B.frame = fr;
  B.floorY = baseY + FLOOR_LIFT;
  B.rng = rng;
  const geo = new Geo();
  const roofGeo = new Geo();
  const st = tpl.style;
  const extKey = st.ext || 'siding';
  const extCol = spec.paint || st.extColor || '#e8dcc0';
  const intCol = st.intColor || '#efe7da';
  const trimCol = st.trimColor || '#f4f1ea';
  const F = FLOOR_LIFT;
  const H = tpl.H;
  const { w, d } = tpl;
  const physics = ctx.physics;

  // ---------------------------------------------------------- temel & zemin
  geo.box('concrete', -0.15, -1.6, -0.15, w + 0.15, F - 0.02, d + 0.15, st.baseColor || '#9c968c', 63 & ~8);
  for (const r of tpl.rooms) {
    const fk = r.floor || floorFor(r.type, st.floor);
    geo.box(fk, r.x0, F - 0.02, r.z0, r.x1, F, r.z1, r.floorColor || floorColor(fk, r.type), 4);
    const wb = fr.box(r.x0, r.z0, r.x1, r.z1);
    B.rooms.push({ ...r, ...wb, label: r.name || roomLabel(r.type) });
  }
  const fb = fr.box(0, 0, w, d);
  B.box = fb;
  B.colliders.push(physics.addFloor(fb.minX, fb.minZ, fb.maxX, fb.maxZ, B.floorY, { owner: B }));

  // ---------------------------------------------------------- dış duvarlar
  const openings = { F: [], B: [], L: [], R: [] };
  for (const door of tpl.extDoors || []) openings[door.side].push({ s: door.at - door.w / 2, e: door.at + door.w / 2, y0: 0, y1: door.kind === 'garage' ? 2.7 : DOOR_H, door });
  const wins = tpl.windows === 'auto' || !tpl.windows ? autoWindows(tpl, openings) : tpl.windows;
  for (const win of wins) openings[win.side].push({ s: win.at - win.w / 2, e: win.at + win.w / 2, y0: win.sill, y1: win.sill + win.h, win });

  const sideLen = { F: w, B: w, L: d, R: d };
  const doorOps = [], winOps = [];
  for (const side of ['F', 'B', 'L', 'R']) {
    const ops = openings[side].sort((a, b) => a.s - b.s);
    const sg = sideGeom(side, 0, w, d, EXT_T);
    for (const op of ops) (op.door ? doorOps : winOps).push({ axis: sg.axis, c: sg.c, s: op.s, e: op.e, exterior: true });
    buildWall(geo, side, sideLen[side], ops, { w, d, H, F, t: EXT_T, ext: true, extKey, extCol, intCol, trimCol }, (box, solidFull) => {
      if (!solidFull) return;
      const wb = fr.box(box.x0, box.z0, box.x1, box.z1);
      B.colliders.push(physics.addBox(wb.minX, wb.minZ, wb.maxX, wb.maxZ, baseY + F + box.y0, baseY + F + box.y1, { kind: 'wall', owner: B, walkable: box.y1 + F < 1.2 }));
    });
    for (const op of ops) {
      if (op.door) createDoor(B, fr, side, op, tpl, ctx, true);
      if (op.win) createWindow(B, fr, side, op, ctx, geo, trimCol);
    }
  }

  // ---------------------------------------------------------- iç duvarlar
  const segs = interiorSegments(tpl);
  const links = tpl.links || [];
  for (const seg of segs) {
    const ops = [];
    for (const L of links) {
      const ra = tpl.rooms.find((r) => r.id === L[0]), rb = tpl.rooms.find((r) => r.id === L[1]);
      if (!ra || !rb) continue;
      const sh = sharedEdge(ra, rb);
      if (!sh || sh.axis !== seg.axis || Math.abs(sh.c - seg.c) > 0.01) continue;
      if (sh.e < seg.s + 0.3 || sh.s > seg.e - 0.3) continue;
      const kind = L[2] || 'wood';
      const ow = kind === 'arch' ? Math.min(2.4, sh.e - sh.s - 0.4) : kind === 'double' ? 1.8 : 1.0;
      const mid = L[3] !== undefined ? L[3] : (Math.max(sh.s, seg.s) + Math.min(sh.e, seg.e)) / 2;
      ops.push({ s: mid - ow / 2, e: mid + ow / 2, y0: 0, y1: DOOR_H + (kind === 'arch' ? 0.3 : 0), door: kind === 'arch' ? null : { kind: kind === 'double' ? 'wood' : kind, locked: !!L[4], lockLevel: L[4] || 0, interior: true, w: ow } });
    }
    ops.sort((a, b) => a.s - b.s);
    for (const op of ops) doorOps.push({ axis: seg.axis, c: seg.c, s: op.s, e: op.e, exterior: false });
    buildInteriorWall(geo, seg, ops, { H, F, intCol, trimCol }, (box) => {
      const wb = fr.box(box.x0, box.z0, box.x1, box.z1);
      B.colliders.push(physics.addBox(wb.minX, wb.minZ, wb.maxX, wb.maxZ, baseY + F + box.y0, baseY + F + box.y1, { kind: 'wall', owner: B, walkable: false }));
    });
    for (const op of ops) if (op.door) createInteriorDoor(B, fr, seg, op, ctx);
  }

  // ---------------------------------------------------------- çatı
  buildRoof(roofGeo, tpl, st, H, F);

  // ---------------------------------------------------------- ekstralar (veranda, garaj içi, tabela)
  if (tpl.porch) {
    const p = tpl.porch;
    geo.box('wood', p.x0, F - 0.25, p.z0, p.x1, F - 0.05, p.z1, '#a77b52');
    const pb = fr.box(p.x0, p.z0, p.x1, p.z1);
    B.colliders.push(physics.addFloor(pb.minX, pb.minZ, pb.maxX, pb.maxZ, baseY + F - 0.05, { owner: B }));
    if (p.roof) {
      for (const px of [p.x0 + 0.15, p.x1 - 0.15]) geo.box('wood', px - 0.08, F, p.z1 - 0.25, px + 0.08, H - 0.2, p.z1 - 0.09, trimCol);
      roofGeo.box('wood', p.x0 - 0.2, H - 0.2, p.z0, p.x1 + 0.2, H - 0.05, p.z1 + 0.25, st.roofColor || '#7a3a2a');
    }
  }
  if (tpl.sign || spec.sign) addSign(B, fr, tpl, spec.sign || tpl.sign, ctx, H, F);

  // ---------------------------------------------------------- mobilya
  const furnCtx = { geo, B, fr, ctx, rng, F, H, openings, baseY, doorOps, winOps, tpl };
  for (const r of tpl.rooms) furnishRoom(r, furnCtx);
  if (tpl.extra) tpl.extra(furnCtx);

  // ---------------------------------------------------------- ağlar
  for (const m of geo.toMeshes(fr.matrix)) B.shell.add(m);
  for (const m of roofGeo.toMeshes(fr.matrix)) B.roof.add(m);
  B.shell.name = 'building:' + spec.id;
  B.roof.name = 'roof:' + spec.id;
  B.roofTopY = baseY + F + H + (tpl.roofRise || 0.3);
  ctx.scene.add(B.shell);
  ctx.scene.add(B.roof);
  return B;
}

// ======================================================================= duvarlar

function sideGeom(side, len, w, d, t) {
  // Duvar merkez çizgisi ve iç yön
  switch (side) {
    case 'F': return { axis: 'x', c: d, from: -t / 2, to: w + t / 2, inward: -1 };
    case 'B': return { axis: 'x', c: 0, from: -t / 2, to: w + t / 2, inward: 1 };
    case 'L': return { axis: 'z', c: 0, from: t / 2, to: d - t / 2, inward: 1 };
    default: return { axis: 'z', c: w, from: t / 2, to: d - t / 2, inward: -1 };
  }
}

/** Duvarı açıklıklarla parçalara ayırıp kutular üretir */
function wallPieces(from, to, ops, H) {
  const pieces = [];
  let cur = from;
  for (const op of ops) {
    if (op.s > cur) pieces.push({ a: cur, b: op.s, y0: 0, y1: H, full: true });
    if (op.y0 > 0.01) pieces.push({ a: op.s, b: op.e, y0: 0, y1: op.y0, full: false, sill: true });
    if (op.y1 < H - 0.01) pieces.push({ a: op.s, b: op.e, y0: op.y1, y1: H, full: false });
    cur = Math.max(cur, op.e);
  }
  if (cur < to) pieces.push({ a: cur, b: to, y0: 0, y1: H, full: true });
  return pieces;
}

function buildWall(geo, side, len, ops, o, onCollider) {
  const g = sideGeom(side, len, o.w, o.d, o.t);
  const t = o.t;
  const pieces = wallPieces(g.from, g.to, ops, o.H);
  for (const p of pieces) {
    // dış yarı ve iç yarı ayrı malzeme
    const inw = g.inward;
    const outerMin = inw > 0 ? g.c - t / 2 : g.c, outerMax = inw > 0 ? g.c : g.c + t / 2;
    const innerMin = inw > 0 ? g.c : g.c - t / 2, innerMax = inw > 0 ? g.c + t / 2 : g.c;
    const y0 = o.F + p.y0, y1 = o.F + p.y1;
    if (g.axis === 'x') {
      geo.box(o.extKey, p.a, y0, outerMin, p.b, y1, outerMax, o.extCol);
      geo.box('interior', p.a, y0, innerMin, p.b, y1, innerMax, o.intCol);
      onCollider({ x0: p.a, x1: p.b, z0: g.c - t / 2, z1: g.c + t / 2, y0: p.y0, y1: p.y1 }, p.full || p.y0 > 0.01);
    } else {
      geo.box(o.extKey, outerMin, y0, p.a, outerMax, y1, p.b, o.extCol);
      geo.box('interior', innerMin, y0, p.a, innerMax, y1, p.b, o.intCol);
      onCollider({ x0: g.c - t / 2, x1: g.c + t / 2, z0: p.a, z1: p.b, y0: p.y0, y1: p.y1 }, p.full || p.y0 > 0.01);
    }
  }
  // köşe pervazları ve saçak bandı
  if (side === 'F' || side === 'B') {
    const z = g.c + (side === 'F' ? t / 2 : -t / 2);
    geo.box('trim', -t / 2 - 0.04, o.F + o.H - 0.18, Math.min(z, z + (side === 'F' ? 0.05 : -0.05)), o.w + t / 2 + 0.04, o.F + o.H, Math.max(z, z + (side === 'F' ? 0.05 : -0.05)), o.trimCol);
    for (const x of [-t / 2, o.w + t / 2]) geo.box('trim', x - 0.07, o.F, z - 0.07, x + 0.07, o.F + o.H, z + 0.07, o.trimCol);
  }
  // açıklık pervazları
  for (const op of ops) {
    const fw = 0.08, depth = t / 2 + 0.05;
    const y0 = o.F + op.y0, y1 = o.F + op.y1;
    if (g.axis === 'x') {
      geo.box('trim', op.s - fw, y0, g.c - depth, op.s, y1 + fw, g.c + depth, o.trimCol);
      geo.box('trim', op.e, y0, g.c - depth, op.e + fw, y1 + fw, g.c + depth, o.trimCol);
      geo.box('trim', op.s - fw, y1, g.c - depth, op.e + fw, y1 + fw, g.c + depth, o.trimCol);
      if (op.win) geo.box('trim', op.s - fw, y0 - 0.06, g.c - depth - 0.06, op.e + fw, y0, g.c + depth + 0.06, o.trimCol);
    } else {
      geo.box('trim', g.c - depth, y0, op.s - fw, g.c + depth, y1 + fw, op.s, o.trimCol);
      geo.box('trim', g.c - depth, y0, op.e, g.c + depth, y1 + fw, op.e + fw, o.trimCol);
      geo.box('trim', g.c - depth, y1, op.s - fw, g.c + depth, y1 + fw, op.e + fw, o.trimCol);
      if (op.win) geo.box('trim', g.c - depth - 0.06, y0 - 0.06, op.s - fw, g.c + depth + 0.06, y0, op.e + fw, o.trimCol);
    }
  }
}

function buildInteriorWall(geo, seg, ops, o, onCollider) {
  const t = INT_T;
  const pieces = wallPieces(seg.s, seg.e, ops, o.H);
  for (const p of pieces) {
    const y0 = o.F + p.y0, y1 = o.F + p.y1;
    if (seg.axis === 'x') geo.box('interior', p.a, y0, seg.c - t / 2, p.b, y1, seg.c + t / 2, o.intCol);
    else geo.box('interior', seg.c - t / 2, y0, p.a, seg.c + t / 2, y1, p.b, o.intCol);
    if (p.full || p.y0 > 0.01) {
      if (seg.axis === 'x') onCollider({ x0: p.a, x1: p.b, z0: seg.c - t / 2, z1: seg.c + t / 2, y0: p.y0, y1: p.y1 });
      else onCollider({ x0: seg.c - t / 2, x1: seg.c + t / 2, z0: p.a, z1: p.b, y0: p.y0, y1: p.y1 });
    }
  }
  for (const op of ops) {
    const fw = 0.07, dd = t / 2 + 0.03;
    const y1 = o.F + op.y1;
    if (seg.axis === 'x') {
      geo.box('trim', op.s - fw, o.F, seg.c - dd, op.s, y1 + fw, seg.c + dd, o.trimCol);
      geo.box('trim', op.e, o.F, seg.c - dd, op.e + fw, y1 + fw, seg.c + dd, o.trimCol);
      geo.box('trim', op.s - fw, y1, seg.c - dd, op.e + fw, y1 + fw, seg.c + dd, o.trimCol);
    } else {
      geo.box('trim', seg.c - dd, o.F, op.s - fw, seg.c + dd, y1 + fw, op.s, o.trimCol);
      geo.box('trim', seg.c - dd, o.F, op.e, seg.c + dd, y1 + fw, op.e + fw, o.trimCol);
      geo.box('trim', seg.c - dd, y1, op.s - fw, seg.c + dd, y1 + fw, op.e + fw, o.trimCol);
    }
  }
}

/** Odaların ortak iç kenarlarını birleştirilmiş duvar parçalarına çevir */
function interiorSegments(tpl) {
  const { w, d } = tpl;
  const map = new Map();
  const add = (axis, c, s, e) => {
    if (e - s < 0.05) return;
    const k = axis + ':' + c.toFixed(2);
    if (!map.has(k)) map.set(k, { axis, c, iv: [] });
    map.get(k).iv.push([s, e]);
  };
  for (const r of tpl.rooms) {
    if (r.noWalls) continue;
    if (r.z0 > 0.01) add('x', r.z0, r.x0, r.x1);
    if (r.z1 < d - 0.01) add('x', r.z1, r.x0, r.x1);
    if (r.x0 > 0.01) add('z', r.x0, r.z0, r.z1);
    if (r.x1 < w - 0.01) add('z', r.x1, r.z0, r.z1);
  }
  const out = [];
  for (const { axis, c, iv } of map.values()) {
    iv.sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const [s, e] of iv) {
      if (!cur || s > cur[1] + 0.01) { if (cur) out.push({ axis, c, s: cur[0], e: cur[1] }); cur = [s, e]; } else cur[1] = Math.max(cur[1], e);
    }
    if (cur) out.push({ axis, c, s: cur[0], e: cur[1] });
  }
  // dış duvarlarla çakışmayı önlemek için uçları kırp
  for (const s of out) {
    const lim = s.axis === 'x' ? w : d;
    s.s = Math.max(s.s, EXT_T / 2); s.e = Math.min(s.e, lim - EXT_T / 2);
  }
  return out.filter((s) => s.e - s.s > 0.1);
}

function sharedEdge(a, b) {
  const eps = 0.01;
  if (Math.abs(a.x1 - b.x0) < eps || Math.abs(a.x0 - b.x1) < eps) {
    const c = Math.abs(a.x1 - b.x0) < eps ? a.x1 : a.x0;
    const s = Math.max(a.z0, b.z0), e = Math.min(a.z1, b.z1);
    if (e - s > 0.8) return { axis: 'z', c, s, e };
  }
  if (Math.abs(a.z1 - b.z0) < eps || Math.abs(a.z0 - b.z1) < eps) {
    const c = Math.abs(a.z1 - b.z0) < eps ? a.z1 : a.z0;
    const s = Math.max(a.x0, b.x0), e = Math.min(a.x1, b.x1);
    if (e - s > 0.8) return { axis: 'x', c, s, e };
  }
  return null;
}

function autoWindows(tpl, openings) {
  const out = [];
  const spacing = tpl.windowSpacing || 3.6;
  const { w, d } = tpl;
  const sides = [['F', 'x', d], ['B', 'x', 0], ['L', 'z', 0], ['R', 'z', w]];
  for (const [side, axis, c] of sides) {
    for (const r of tpl.rooms) {
      // oda bu kenara değiyor mu
      let s, e;
      if (axis === 'x') { if (Math.abs((side === 'F' ? r.z1 : r.z0) - c) > 0.01) continue; s = r.x0; e = r.x1; }
      else { if (Math.abs((side === 'L' ? r.x0 : r.x1) - c) > 0.01) continue; s = r.z0; e = r.z1; }
      const len = e - s;
      if (len < 2.2) continue;
      const small = ['bathroom', 'garage', 'storage', 'vault', 'cells', 'server', 'armory'].includes(r.type);
      if (r.noWindows) continue;
      const shop = tpl.storefront && side === 'F';
      const n = shop ? Math.max(1, Math.floor(len / 3.2)) : Math.max(1, Math.floor(len / spacing));
      for (let k = 0; k < n; k++) {
        const at = s + (len * (k + 0.5)) / n;
        const ww = shop ? 2.2 : small ? 0.9 : 1.4;
        const conflict = openings[side].some((o) => at + ww / 2 + 0.5 > o.s && at - ww / 2 - 0.5 < o.e);
        if (conflict) continue;
        out.push({ side, at, w: ww, h: shop ? 2.0 : small ? 0.6 : 1.25, sill: shop ? 0.35 : small ? 1.55 : 0.95 });
      }
    }
  }
  return out;
}

// ======================================================================= kapılar & pencereler

function createDoor(B, fr, side, op, tpl, ctx, exterior) {
  const g = sideGeom(side, 0, tpl.w, tpl.d, EXT_T);
  const width = op.e - op.s;
  const kind = op.door.kind || 'wood';
  const mid = (op.s + op.e) / 2;
  const tc = g.axis === 'x' ? { x: mid, z: g.c } : { x: g.c, z: mid };
  const center = fr.pt(tc.x, tc.z);
  const inward = g.axis === 'x' ? fr.dir(0, g.inward) : fr.dir(g.inward, 0);
  const along = g.axis === 'x' ? fr.dir(1, 0) : fr.dir(0, 1);
  makeDoorObject(B, ctx, { kind, width, height: op.y1, center, inward, along, exterior, locked: op.door.locked, lockLevel: op.door.lockLevel || (op.door.locked ? 1 : 0), name: op.door.name });
}

function createInteriorDoor(B, fr, seg, op, ctx) {
  const mid = (op.s + op.e) / 2;
  const tc = seg.axis === 'x' ? { x: mid, z: seg.c } : { x: seg.c, z: mid };
  const center = fr.pt(tc.x, tc.z);
  const inward = seg.axis === 'x' ? fr.dir(0, 1) : fr.dir(1, 0);
  const along = seg.axis === 'x' ? fr.dir(1, 0) : fr.dir(0, 1);
  makeDoorObject(B, ctx, { kind: op.door.kind || 'wood', width: op.e - op.s, height: op.y1, center, inward, along, exterior: false, locked: op.door.locked, lockLevel: op.door.lockLevel });
}

const DOOR_COLORS = { wood: '#8a5a33', metal: '#7d8a8f', glass2: '#d8dde0', garage: '#e6e1d6', cell: '#5f676b', vault: '#8c8f93', lab: '#cfd8dc' };

function makeDoorObject(B, ctx, o) {
  const y0 = B.floorY;
  const hingeOff = o.width / 2;
  const baseRot = Math.atan2(o.along.x, o.along.z) - Math.PI / 2;
  const hinge = o.kind === 'garage' ? { x: o.center.x, z: o.center.z } : { x: o.center.x - o.along.x * hingeOff, z: o.center.z - o.along.z * hingeOff };
  const door = new Door({
    building: B, kind: o.kind, width: o.width, height: o.height, center: o.center, inward: o.inward, along: o.along,
    exterior: o.exterior, locked: o.locked, lockLevel: o.lockLevel || 0, hinge, baseRot, y0, leafW: o.kind === 'glass2' || o.kind === 'garage' ? o.width : o.width - 0.04,
  });
  // çarpışma kutusu (kapalıyken)
  const hw = o.width / 2, ht = 0.12;
  const ax = Math.abs(o.along.x) > 0.5;
  const minX = ax ? o.center.x - hw : o.center.x - ht, maxX = ax ? o.center.x + hw : o.center.x + ht;
  const minZ = ax ? o.center.z - ht : o.center.z - hw, maxZ = ax ? o.center.z + ht : o.center.z + hw;
  door.collider = ctx.physics.addBox(minX, minZ, maxX, maxZ, y0, y0 + o.height, { kind: 'door', owner: door, walkable: false, navType: NAV.DOOR, blocksSight: o.kind !== 'glass2' && o.kind !== 'cell' });
  door.collider.navType = NAV.DOOR;
  door.swing = (o.along.z * o.inward.x - o.along.x * o.inward.z) >= 0 ? 1 : -1;
  B.doors.push(door);
  ctx.doors.push(door);
  return door;
}

function doorTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = DOOR_COLORS[kind] || DOOR_COLORS.wood;
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  if (kind === 'wood' || kind === 'metal' || kind === 'lab') {
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 5;
    g.strokeRect(18, 18, 92, 92); g.strokeRect(18, 134, 92, 100);
    if (kind === 'lab') { g.fillStyle = '#6c3483'; g.fillRect(0, 120, 128, 16); }
    if (kind === 'metal') { g.fillStyle = 'rgba(30,40,50,0.6)'; g.fillRect(44, 30, 40, 60); }
    g.fillStyle = '#d4af37'; g.beginPath(); g.arc(105, 128, 7, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 128, 40);
  } else if (kind === 'garage') {
    for (let y = 0; y < 256; y += 32) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y + 26, 128, 6); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, y, 128, 4); }
    g.fillStyle = '#555'; g.fillRect(52, 236, 24, 8);
  } else if (kind === 'vault') {
    g.strokeStyle = '#5d6d7e'; g.lineWidth = 10; g.beginPath(); g.arc(64, 128, 36, 0, 7); g.stroke();
    for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(64, 128); g.lineTo(64 + Math.cos(a) * 36, 128 + Math.sin(a) * 36); g.stroke(); }
  } else if (kind === 'cell') {
    g.clearRect(0, 0, 128, 256);
    g.fillStyle = base; for (let x = 4; x < 128; x += 20) g.fillRect(x, 0, 8, 256);
    g.fillRect(0, 0, 128, 10); g.fillRect(0, 120, 128, 10); g.fillRect(0, 246, 128, 10);
  } else if (kind === 'glass2') {
    g.clearRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(170,215,240,0.35)'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#8e9aa3'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10); g.fillRect(0, 0, 10, 256); g.fillRect(118, 0, 10, 256); g.fillRect(0, 118, 128, 10);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dp = new THREE.Vector3(), _ds = new THREE.Vector3(), _dY = new THREE.Vector3(0, 1, 0);

/** Tüm kapıları tür başına tek InstancedMesh ile çizer */
export class DoorRenderer {
  constructor(doors, parent) {
    this.byKind = new Map();
    for (const d of doors) {
      if (!this.byKind.has(d.kind)) this.byKind.set(d.kind, []);
      this.byKind.get(d.kind).push(d);
    }
    this.meshes = [];
    for (const [kind, list] of this.byKind) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(kind === 'garage' ? 0 : 0.5, 0.5, 0);
      const transparent = kind === 'glass2' || kind === 'cell';
      const mat = new THREE.MeshStandardMaterial({ map: doorTexture(kind), roughness: kind === 'glass2' ? 0.1 : 0.7, metalness: kind === 'metal' || kind === 'vault' || kind === 'cell' ? 0.4 : 0, transparent, alphaTest: kind === 'cell' ? 0.5 : 0, side: transparent ? THREE.DoubleSide : THREE.FrontSide, depthWrite: kind !== 'glass2' });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = !transparent;
      im.receiveShadow = true;
      im.name = 'doors:' + kind;
      list.forEach((d, i) => { d.renderIndex = i; d.renderMesh = im; this.updateDoor(d); });
      im.computeBoundingSphere();
      im.frustumCulled = false;
      parent.add(im);
      this.meshes.push(im);
    }
  }
  updateDoor(d) {
    const im = d.renderMesh;
    if (!im) return;
    if (d.kind === 'garage') {
      const k = d.broken ? 1 : d.open01;
      _dp.set(d.center.x, d.y0 + k * d.height * 0.82, d.center.z);
      _dq.setFromAxisAngle(_dY, d.baseRot);
      _ds.set(d.leafW, Math.max(0.12, d.height * (1 - k * 0.82)), 0.08);
    } else if (d.broken) {
      _dp.set(d.hinge.x, d.y0 + 0.05, d.hinge.z);
      _dq.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.1, d.baseRot + 0.4, 0, 'YXZ'));
      _ds.set(d.leafW, d.height - 0.04, 0.07);
    } else {
      const swing = d.swing || 1;
      _dp.set(d.hinge.x, d.y0, d.hinge.z);
      _dq.setFromAxisAngle(_dY, d.baseRot + swing * d.open01 * Math.PI * 0.52);
      _ds.set(d.leafW, d.height - 0.04, 0.07);
    }
    _dm.compose(_dp, _dq, _ds);
    im.setMatrixAt(d.renderIndex, _dm);
    im.instanceMatrix.needsUpdate = true;
  }
}

function createWindow(B, fr, side, op, ctx, geo, trimCol) {
  const g = sideGeom(side, 0, B.tpl.w, B.tpl.d, EXT_T);
  const mid = (op.s + op.e) / 2;
  const tc = g.axis === 'x' ? { x: mid, z: g.c } : { x: g.c, z: mid };
  const center = fr.pt(tc.x, tc.z);
  const width = op.e - op.s, height = op.y1 - op.y0;
  const cy = B.floorY + op.y0 + height / 2;
  const along = g.axis === 'x' ? fr.dir(1, 0) : fr.dir(0, 1);
  const inward = g.axis === 'x' ? fr.dir(0, g.inward) : fr.dir(g.inward, 0);
  // orta kayıt (pencere bölmesi)
  if (g.axis === 'x') geo.box('trim', mid - 0.03, B.floorY - B.frame.baseY + op.y0, g.c - 0.04, mid + 0.03, B.floorY - B.frame.baseY + op.y1, g.c + 0.04, trimCol);
  else geo.box('trim', g.c - 0.04, B.floorY - B.frame.baseY + op.y0, mid - 0.03, g.c + 0.04, B.floorY - B.frame.baseY + op.y1, mid + 0.03, trimCol);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(center.x, cy, center.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(inward.x, inward.z)),
    new THREE.Vector3(width, height, 1),
  );
  const paneIndex = ctx.panes.length;
  ctx.panes.push(m);
  const win = new WindowPane({ building: B, center: { x: center.x, y: cy, z: center.z }, width, height, sill: op.y0, along, inward, paneIndex, y0: B.floorY + op.y0 });
  const hw = width / 2, ht = 0.12, ax = Math.abs(along.x) > 0.5;
  win.collider = ctx.physics.addBox(ax ? center.x - hw : center.x - ht, ax ? center.z - ht : center.z - hw, ax ? center.x + hw : center.x + ht, ax ? center.z + ht : center.z + hw,
    B.floorY - 0.1, B.floorY + op.y0 + height, { kind: 'window', owner: win, walkable: false, blocksSight: false, navType: NAV.WINDOW });
  win.collider.navType = NAV.WINDOW;
  B.windows.push(win);
  ctx.windows.push(win);
}

// ======================================================================= çatı & tabela

function buildRoof(geo, tpl, st, H, F) {
  const { w, d } = tpl;
  const top = F + H;
  const roofCol = st.roofColor || '#8a3a2a';
  const type = st.roof || 'gable';
  if (type === 'flat') {
    geo.box('concrete', -0.2, top, -0.2, w + 0.2, top + 0.22, d + 0.2, '#b9b3a8');
    const ph = 0.55, pt = 0.25;
    geo.box(st.ext || 'plaster', -0.25, top, -0.25, w + 0.25, top + ph, pt - 0.25, st.extColor || '#d8d0c0');
    geo.box(st.ext || 'plaster', -0.25, top, d - pt + 0.25, w + 0.25, top + ph, d + 0.25, st.extColor || '#d8d0c0');
    geo.box(st.ext || 'plaster', -0.25, top, -0.25, pt - 0.25, top + ph, d + 0.25, st.extColor || '#d8d0c0');
    geo.box(st.ext || 'plaster', w - pt + 0.25, top, -0.25, w + 0.25, top + ph, d + 0.25, st.extColor || '#d8d0c0');
    geo.box('trim', -0.3, top + ph, -0.3, w + 0.3, top + ph + 0.06, d + 0.3, '#8f8a82', 4 | 1 | 2 | 16 | 32);
    // klima üniteleri
    const n = Math.max(1, Math.floor((w * d) / 120));
    for (let i = 0; i < n; i++) {
      const x = w * (0.25 + 0.5 * ((i * 0.618) % 1)), z = d * (0.3 + 0.4 * ((i * 0.37) % 1));
      geo.box('metal', x - 0.6, top + 0.22, z - 0.5, x + 0.6, top + 1.0, z + 0.5, '#c9ccce');
    }
    tpl.roofRise = 0.6;
    return;
  }
  const o = 0.55;
  const alongX = w >= d;
  const span = alongX ? d : w;
  const pitch = type === 'shed' ? 0.25 : 0.55;
  const rise = (span / 2 + o) * pitch;
  tpl.roofRise = rise;
  const key = st.roofMat || 'shingles';
  if (alongX) {
    const zc = d / 2;
    const yE = top - o * pitch, yR = top + (span / 2) * pitch + 0.02;
    // iki eğim (üst yüz) + alt yüz (saçak altı)
    geo.quad(key, [-o, yE, d + o], [w + o, yE, d + o], [w + o, yR, zc], [-o, yR, zc], roofCol, 'edge');
    geo.quad(key, [w + o, yE, -o], [-o, yE, -o], [-o, yR, zc], [w + o, yR, zc], roofCol, 'edge');
    geo.quad('trim', [w + o, yE - 0.12, d + o], [-o, yE - 0.12, d + o], [-o, yR - 0.12, zc], [w + o, yR - 0.12, zc], '#d8d2c8');
    geo.quad('trim', [-o, yE - 0.12, -o], [w + o, yE - 0.12, -o], [w + o, yR - 0.12, zc], [-o, yR - 0.12, zc], '#d8d2c8');
    // saçak kenarı
    geo.box('trim', -o, yE - 0.14, d + o - 0.05, w + o, yE + 0.02, d + o + 0.04, st.trimColor || '#f4f1ea');
    geo.box('trim', -o, yE - 0.14, -o - 0.04, w + o, yE + 0.02, -o + 0.05, st.trimColor || '#f4f1ea');
    // kalkan duvarları (üçgen)
    const ext = st.ext || 'siding', ec = st.extColorRoof || st.extColorGable || '#e8dcc0';
    const gy = top;
    geo.tri(ext, [-0.12, gy, d], [-0.12, gy, 0], [-0.12, yR - 0.1, zc], ec);
    geo.tri(ext, [w + 0.12, gy, 0], [w + 0.12, gy, d], [w + 0.12, yR - 0.1, zc], ec);
    // mahya
    geo.box('trim', -o, yR - 0.06, zc - 0.12, w + o, yR + 0.1, zc + 0.12, '#6d6258');
    // baca
    if (tpl.chimney) geo.box('brick', w * 0.72, top, d * 0.3, w * 0.72 + 0.7, yR + 1.0, d * 0.3 + 0.7, '#a0523d');
  } else {
    const xc = w / 2;
    const yE = top - o * pitch, yR = top + (span / 2) * pitch + 0.02;
    geo.quad(key, [-o, yE, -o], [-o, yE, d + o], [xc, yR, d + o], [xc, yR, -o], roofCol, 'edge');
    geo.quad(key, [w + o, yE, d + o], [w + o, yE, -o], [xc, yR, -o], [xc, yR, d + o], roofCol, 'edge');
    geo.quad('trim', [-o, yE - 0.12, d + o], [-o, yE - 0.12, -o], [xc, yR - 0.12, -o], [xc, yR - 0.12, d + o], '#d8d2c8');
    geo.quad('trim', [w + o, yE - 0.12, -o], [w + o, yE - 0.12, d + o], [xc, yR - 0.12, d + o], [xc, yR - 0.12, -o], '#d8d2c8');
    const ext = st.ext || 'siding', ec = st.extColorRoof || '#e8dcc0';
    geo.tri(ext, [0, top, d + 0.12], [w, top, d + 0.12], [xc, yR - 0.1, d + 0.12], ec);
    geo.tri(ext, [w, top, -0.12], [0, top, -0.12], [xc, yR - 0.1, -0.12], ec);
    geo.box('trim', xc - 0.12, yR - 0.06, -o, xc + 0.12, yR + 0.1, d + o, '#6d6258');
  }
}

function addSign(B, fr, tpl, text, ctx, H, F) {
  const st = tpl.style;
  const colors = { 'SÜPERMARKET': ['#c0392b', '#fff'], MARKET: ['#d35400', '#fff'], ECZANE: ['#c0392b', '#fff'], HASTANE: ['#c0392b', '#fff'], POLİS: ['#1f4e8c', '#fff'], BANKA: ['#1e6b52', '#ffe9a8'], AVM: ['#6c3483', '#fff'] };
  const [bg, fg] = colors[text] || [st.signBg || '#2c3e50', st.signFg || '#ffd88a'];
  const tex = signTexture(text, bg, fg, 512, 128, { icon: text === 'HASTANE' || text === 'ECZANE' ? 'cross' : null });
  const wSign = Math.min(tpl.w * 0.7, Math.max(3, text.length * 0.55));
  const hSign = wSign / 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wSign, hSign), mat);
  const signY = tpl.style.roof === 'flat' ? F + H + 0.3 : F + Math.min(H - 0.2, 2.75) + hSign / 2 - 0.1;
  const atX = tpl.signAt ?? tpl.w / 2;
  const p = fr.pt(atX, tpl.d + EXT_T / 2 + 0.06);
  mesh.position.set(p.x, fr.baseY + signY + (tpl.style.roof === 'flat' ? hSign / 2 : 0), p.z);
  const n = fr.dir(0, 1);
  mesh.rotation.y = Math.atan2(n.x, n.z);
  mesh.name = 'sign';
  B.sign = mesh;
  B.signMat = mat;
  ctx.scene.add(mesh);
}

// ======================================================================= yardımcılar

function floorFor(type, def) {
  if (['bathroom', 'kitchen', 'ward', 'surgery', 'lab', 'lobby_med', 'pharmacy_store', 'shop_hall', 'restaurant_hall', 'cafe_hall', 'cells'].includes(type)) return 'tiles';
  if (['garage', 'storage', 'warehouse_hall', 'factory_hall', 'workshop', 'armory', 'server', 'vault', 'shop_storage', 'barracks_room'].includes(type)) return 'concrete';
  if (type === 'bedroom' || type === 'office') return def === 'carpet' ? 'carpet' : 'woodfloor';
  return def || 'woodfloor';
}
function floorColor(k, type) {
  if (k === 'tiles') return type === 'bathroom' ? '#cfe3ea' : type === 'kitchen' ? '#e9e2d0' : '#e4e4e0';
  if (k === 'concrete') return '#a9a49c';
  if (k === 'carpet') return '#9fb4c8';
  return '#c08a5a';
}
export function roomLabel(type) {
  return ({
    living: 'Salon', kitchen: 'Mutfak', bedroom: 'Yatak Odası', bathroom: 'Banyo', garage: 'Garaj', storage: 'Depo', security: 'Güvenlik Odası',
    shop_hall: 'Satış Alanı', shop_storage: 'Depo', office: 'Ofis', lobby: 'Lobi', lobby_med: 'Acil Servis', ward: 'Hasta Koğuşu', surgery: 'Ameliyathane',
    pharmacy_store: 'İlaç Deposu', lab: 'Laboratuvar', armory: 'Cephanelik', cells: 'Nezarethane', barracks_room: 'Koğuş', warehouse_hall: 'Depo Alanı',
    factory_hall: 'Üretim Alanı', workshop: 'Atölye', restaurant_hall: 'Yemek Salonu', cafe_hall: 'Kafe', bank_hall: 'Banka Salonu', vault: 'Kasa Dairesi',
    server: 'Sunucu Odası', cabin_main: 'Kulübe', radio_room: 'Telsiz Odası', containment: 'Karantina Odası', booth: 'Kontrol Kulübesi',
  })[type] || 'Oda';
}
