// Envanter modeli (saf mantık, DOM/three bağımsız → Node testleriyle test edilir).
// Yuvalar: yığın nesneleri {id, qty, dur?, ammo?, fuel?, noteId?} ya da null. İlk 6 yuva hızlı erişim çubuğudur.
import { ITEMS, makeStack } from '../data/items.js';

export const HOTBAR = 6;

export function stackWeight(s) {
  if (!s) return 0;
  const def = ITEMS[s.id];
  return (def ? def.weight : 0) * s.qty + (s.fuel ? s.fuel * 0.75 : 0);
}

/** Yiyecek yığınları birleşirken eski olanın tazeliği geçerli olur */
function olderT0(into, from) { if (from.t0 !== undefined && (into.t0 === undefined || from.t0 < into.t0)) into.t0 = from.t0; }

function stackable(a, b) {
  if (!a || !b || a.id !== b.id) return false;
  const def = ITEMS[a.id];
  if (!def || def.stack <= 1) return false;
  return a.noteId === b.noteId && a.dur === b.dur;
}

export class Inventory {
  constructor(size = 30, maxWeight = 32) {
    this.slots = new Array(size).fill(null);
    this.maxWeight = maxWeight;
    this.version = 0;
    this.onChange = null;
  }

  changed() { this.version++; if (this.onChange) this.onChange(this); }
  get size() { return this.slots.length; }
  weight() { let w = 0; for (const s of this.slots) w += stackWeight(s); return w; }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.qty; return n; }
  has(id, n = 1) { return this.count(id) >= n; }
  freeSlots() { return this.slots.filter((s) => !s).length; }
  firstSlotOf(id) { return this.slots.findIndex((s) => s && s.id === id); }
  items() { return this.slots.filter(Boolean); }

  /** qty adedinden ne kadarının eklenebileceği (ağırlık sınırı dahil) */
  canAdd(id, qty = 1, ignoreWeight = false) {
    const def = ITEMS[id];
    if (!def) return 0;
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += def.stack;
      else if (s.id === id && def.stack > 1 && !s.noteId) room += def.stack - s.qty;
      if (room >= qty) break;
    }
    let n = Math.min(qty, room);
    if (!ignoreWeight && def.weight > 0) {
      const free = this.maxWeight - this.weight();
      n = Math.min(n, Math.max(0, Math.floor((free + 1e-6) / def.weight)));
    }
    return n;
  }

  /** Yığın ekle. Dönüş: eklenemeyen kalan miktar (0 = hepsi eklendi) */
  addStack(stack, ignoreWeight = false) {
    const def = ITEMS[stack.id];
    if (!def) return stack.qty;
    let left = stack.qty;
    if (!ignoreWeight) left = Math.min(left, this.canAdd(stack.id, left));
    const refused = stack.qty - left;
    // önce mevcut yığınlara
    if (def.stack > 1) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && stackable(s, stack)) {
          const add = Math.min(def.stack - s.qty, left);
          if (add > 0) olderT0(s, stack);
          s.qty += add; left -= add;
        }
      }
    }
    // sonra boş yuvalara (hızlı erişim çubuğu silah/alet için öncelikli)
    const order = [...this.slots.keys()];
    const prefersHotbar = def.melee || def.gun || def.tool || def.cat === 'med' || def.throwable;
    if (!prefersHotbar) order.sort((a, b) => (a < HOTBAR ? 1 : 0) - (b < HOTBAR ? 1 : 0) || a - b);
    for (const i of order) {
      if (left <= 0) break;
      if (!this.slots[i]) {
        const add = Math.min(def.stack, left);
        this.slots[i] = { ...stack, qty: add };
        left -= add;
      }
    }
    if (left !== stack.qty || refused) this.changed();
    return left + refused;
  }

  add(id, qty = 1, data = null, ignoreWeight = false) {
    return this.addStack(makeStack(id, qty, data), ignoreWeight);
  }

  /** id'den qty kadar çıkar (hızlı erişim dışındakilerden başlayarak). Dönüş: çıkarılan miktar */
  remove(id, qty = 1) {
    let left = qty;
    const order = [...this.slots.keys()].sort((a, b) => (a < HOTBAR ? 1 : 0) - (b < HOTBAR ? 1 : 0) || b - a);
    for (const i of order) {
      const s = this.slots[i];
      if (!s || s.id !== id || left <= 0) continue;
      const take = Math.min(s.qty, left);
      s.qty -= take; left -= take;
      if (s.qty <= 0) this.slots[i] = null;
    }
    if (left !== qty) this.changed();
    return qty - left;
  }

  /** Yuvadan qty kadar çıkar, çıkan yığını döndür */
  takeAt(i, qty = Infinity) {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(qty, s.qty);
    const out = { ...s, qty: n };
    s.qty -= n;
    if (s.qty <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  /** Yuva taşıma: birleştir ya da yer değiştir */
  move(from, to) {
    if (from === to) return;
    const a = this.slots[from], b = this.slots[to];
    if (!a) return;
    if (b && stackable(a, b)) {
      const max = ITEMS[a.id].stack;
      const add = Math.min(max - b.qty, a.qty);
      if (add > 0) olderT0(b, a);
      b.qty += add; a.qty -= add;
      if (a.qty <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b; this.slots[to] = a;
    }
    this.changed();
  }

  /** Yığını ikiye böl */
  split(i) {
    const s = this.slots[i];
    if (!s || s.qty < 2) return false;
    const empty = this.slots.findIndex((x, k) => !x && k >= HOTBAR);
    const e2 = empty >= 0 ? empty : this.slots.findIndex((x) => !x);
    if (e2 < 0) return false;
    const half = Math.floor(s.qty / 2);
    s.qty -= half;
    this.slots[e2] = { ...s, qty: half };
    this.changed();
    return true;
  }

  /** Kategoriye göre sırala (hızlı erişim çubuğu korunur) */
  sort() {
    const keep = this.slots.slice(0, HOTBAR);
    const rest = this.slots.slice(HOTBAR).filter(Boolean);
    const order = ['weapon', 'ammo', 'tool', 'med', 'food', 'drink', 'build', 'car', 'wear', 'misc'];
    rest.sort((a, b) => order.indexOf(ITEMS[a.id].cat) - order.indexOf(ITEMS[b.id].cat) || a.id.localeCompare(b.id));
    // aynı yığınları birleştir
    const merged = [];
    for (const s of rest) {
      const last = merged[merged.length - 1];
      if (last && stackable(last, s) && last.qty < ITEMS[s.id].stack) {
        const add = Math.min(ITEMS[s.id].stack - last.qty, s.qty);
        last.qty += add; s.qty -= add;
        if (s.qty > 0) merged.push(s);
      } else merged.push(s);
    }
    this.slots = [...keep, ...merged, ...new Array(this.slots.length - HOTBAR - merged.length).fill(null)];
    this.changed();
  }

  resize(size) {
    if (size === this.slots.length) return [];
    const overflow = [];
    if (size < this.slots.length) {
      for (let i = size; i < this.slots.length; i++) if (this.slots[i]) overflow.push(this.slots[i]);
      this.slots = this.slots.slice(0, size);
      for (const s of overflow) { const left = this.addStack(s, true); if (left > 0) { /* taşan */ } }
    } else this.slots = [...this.slots, ...new Array(size - this.slots.length).fill(null)];
    this.changed();
    return overflow;
  }

  serialize() { return { slots: this.slots.map((s) => (s ? { ...s } : null)), maxWeight: this.maxWeight }; }
  static deserialize(o, size = 30) {
    const inv = new Inventory(Math.max(size, o.slots.length), o.maxWeight);
    o.slots.forEach((s, i) => { inv.slots[i] = s && ITEMS[s.id] ? { ...s } : null; });
    return inv;
  }
}
