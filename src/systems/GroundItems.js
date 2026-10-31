// Yere bırakılan eşyalar: Rapier katı cismi olarak düşer, yuvarlanır, sekip durur; durunca
// gövde kaldırılır (performans) ve eşya parıldayarak bekler. Araçlar ve oyuncu eşyaları itebilir.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { uid } from '../core/util.js';
import { G } from '../physics/PhysicsWorld.js';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _c = new THREE.Vector3();

export class GroundItems {
  constructor(session) {
    this.s = session;
    this.items = new Map(); // id → {id, stack, x,y,z, obj, ring, rest, body}
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

  add(id, stack, x, y, z, v = [0, 0, 0], resting = false) {
    if (this.items.has(id)) return;
    const S = this.s;
    const model = S.game.itemModels.make(stack.id);
    // modeli kendi merkezine al (fizik gövdesi kütle merkezinde döner)
    _box.setFromObject(model);
    _box.getSize(_size); _box.getCenter(_c);
    model.position.sub(_c);
    const holder = new THREE.Group();
    holder.add(model);
    holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 20), new THREE.MeshBasicMaterial({ color: ITEMS[stack.id].rarity === 'story' ? 0xffb347 : 0xfff3c4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    S.game.scene.add(ring);
    S.game.scene.add(holder);
    const it = { id, stack, x, y, z, obj: holder, ring, rest: false, age: 0, half: { x: Math.max(0.05, _size.x / 2), y: Math.max(0.04, _size.y / 2), z: Math.max(0.05, _size.z / 2) }, body: null };
    this.items.set(id, it);
    const pw = S.game.phys;
    if (pw && !resting) {
      const h = it.half;
      const vol = h.x * h.y * h.z * 8;
      const mass = Math.max(0.3, (ITEMS[stack.id].weight || 0.5) * Math.min(stack.qty, 5));
      it.body = pw.addDynamic(holder, { type: 'box', hx: h.x, hy: h.y, hz: h.z }, x, y, z, {
        vel: { x: v[0], y: v[1], z: v[2] }, spin: { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 6 },
        density: mass / Math.max(0.002, vol), friction: 0.8, bounce: 0.2, group: G.DEBRIS, ccd: true,
        onSleep: () => this.settle(it),
      });
      it.body.onLost = () => this.settle(it, true);
    } else {
      holder.position.set(x, y + it.half.y, z);
      holder.rotation.y = Math.random() * 6;
      this.settle(it);
    }
  }

  /** Durdu: fizik gövdesini bırak, parıltı halkasını göster */
  settle(it, lost = false) {
    const S = this.s;
    if (it.body) {
      const t = it.body.body.translation();
      if (!lost) { it.x = t.x; it.y = t.y - it.half.y; it.z = t.z; }
      S.game.phys.removeDynamic(it.body);
      it.body = null;
    }
    if (lost) { // haritadan düştü: en yakın zemine geri koy
      it.y = S.world.physics.groundHeight(it.x, it.z, 200);
      it.obj.position.set(it.x, it.y + it.half.y, it.z);
    }
    if (!Number.isFinite(it.y)) it.y = S.world.physics.groundHeight(it.x, it.z, 200);
    it.baseY = it.obj.position.y;
    it.rest = true;
    it.ring.visible = true;
    it.ring.position.set(it.x, it.y + 0.03, it.z);
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    if (it.body) this.s.game.phys.removeDynamic(it.body);
    this.s.game.scene.remove(it.obj);
    this.s.game.scene.remove(it.ring);
    this.items.delete(id);
  }

  update(dt) {
    for (const it of this.items.values()) {
      it.age += dt;
      if (!it.rest) {
        // yuvarlanırken konumu izle (etkileşim/kayıt için)
        if (it.body) { const t = it.body.body.translation(); it.x = t.x; it.y = t.y - it.half.y; it.z = t.z; }
        if (it.age > 12 && it.body) this.settle(it); // hiç uyumazsa
      } else {
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
    for (const o of arr || []) this.add(o.id, o.s, o.p[0], o.p[1], o.p[2], [0, 0, 0], true);
  }
  dispose() { for (const id of [...this.items.keys()]) this.remove(id); }
}
