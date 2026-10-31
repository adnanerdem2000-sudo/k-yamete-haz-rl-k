// Yere bırakılan eşyalar: fiziksel olarak düşer, sekip durur, parıldar; toplanabilir.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { uid } from '../core/util.js';

export class GroundItems {
  constructor(session) {
    this.s = session;
    this.items = new Map(); // id → {id, stack, x,y,z, vx,vy,vz, obj, rest}
    const S = session;
    S.on('ground_drop', (p) => {
      const id = 'g' + uid();
      S.emit({ k: 'ground_add', id, stack: p.stack, x: p.x, y: p.y + 0.9, z: p.z, v: p.v || [(Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2] });
    });
    S.on('ground_drop_many', (p) => {
      for (const st of p.stacks) {
        const id = 'g' + uid();
        S.emit({ k: 'ground_add', id, stack: st, x: p.x + (Math.random() - 0.5) * 1.2, y: p.y + 1.0, z: p.z + (Math.random() - 0.5) * 1.2, v: [(Math.random() - 0.5) * 4, 3 + Math.random() * 2, (Math.random() - 0.5) * 4] });
      }
    });
    S.on('ground_pickup', (p, from) => {
      const it = this.items.get(p.id);
      if (!it) return;
      S.emit({ k: 'ground_remove', id: p.id });
      S.emit({ k: 'grant', to: from, items: [it.stack] });
    });
    S.onEvt('ground_add', (e) => this.add(e.id, e.stack, e.x, e.y, e.z, e.v));
    S.onEvt('ground_remove', (e) => this.remove(e.id));
  }

  add(id, stack, x, y, z, v = [0, 0, 0]) {
    if (this.items.has(id)) return;
    const obj = this.s.game.itemModels.make(stack.id);
    const holder = new THREE.Group();
    holder.add(obj);
    // parıltı halkası
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 20), new THREE.MeshBasicMaterial({ color: ITEMS[stack.id].rarity === 'story' ? 0xffb347 : 0xfff3c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    holder.add(ring);
    holder.position.set(x, y, z);
    holder.rotation.y = Math.random() * 6;
    this.s.game.scene.add(holder);
    this.items.set(id, { id, stack, x, y, z, vx: v[0], vy: v[1], vz: v[2], obj: holder, ring, rest: false, spin: (Math.random() - 0.5) * 8, age: 0 });
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.s.game.scene.remove(it.obj);
    this.items.delete(id);
  }

  update(dt) {
    const phys = this.s.world.physics;
    for (const it of this.items.values()) {
      it.age += dt;
      if (!it.rest) {
        it.vy -= 16 * dt;
        let nx = it.x + it.vx * dt, nz = it.z + it.vz * dt, ny = it.y + it.vy * dt;
        const r = phys.resolveCircle(nx, nz, 0.12, it.y, it.y + 0.3, 0.2);
        nx = r.x; nz = r.z;
        if (r.hit) { it.vx *= -0.3; it.vz *= -0.3; }
        const g = phys.groundHeight(nx, nz, it.y + 0.2, 0.3);
        if (ny <= g + 0.08) {
          ny = g + 0.08;
          if (Math.abs(it.vy) > 1.5) { it.vy = -it.vy * 0.35; it.vx *= 0.6; it.vz *= 0.6; }
          else { it.vy = 0; it.vx *= 0.8; it.vz *= 0.8; if (Math.hypot(it.vx, it.vz) < 0.2) it.rest = true; }
        }
        it.x = nx; it.y = ny; it.z = nz;
        it.obj.rotation.y += it.spin * dt;
        it.obj.position.set(it.x, it.y, it.z);
      } else {
        it.obj.position.y = it.y + Math.sin(it.age * 2.5) * 0.03;
        it.ring.material.opacity = 0.35 + Math.sin(it.age * 3) * 0.2;
      }
    }
  }

  nearest(x, z, r = 1.6) {
    let best = null, bd = r * r;
    for (const it of this.items.values()) {
      const d = (it.x - x) ** 2 + (it.z - z) ** 2;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  serialize() { return [...this.items.values()].map((it) => ({ id: it.id, s: it.stack, p: [Math.round(it.x * 100) / 100, Math.round(it.y * 100) / 100, Math.round(it.z * 100) / 100] })); }
  load(arr) {
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const o of arr || []) { this.add(o.id, o.s, o.p[0], o.p[1], o.p[2], [0, 0, 0]); const it = this.items.get(o.id); if (it) it.rest = true; }
  }
  dispose() { for (const id of [...this.items.keys()]) this.remove(id); }
}
