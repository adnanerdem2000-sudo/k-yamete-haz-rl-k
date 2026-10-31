// Yağma sistemi: konteyner durumları (host otoritesi). İçerik ilk aramada üretilir ve kaydedilir:
// aynı eşya sürekli yeniden ortaya çıkmaz. Bölge tehlikesi ve takvim olayları içeriği etkiler.
import { LOOT, SPECIAL_LOOT } from '../data/loot.js';
import { ITEMS } from '../data/items.js';
import { RANDOM_NOTES } from '../data/story.js';
import { RNG } from '../core/util.js';

export class Loot {
  constructor(session) {
    this.s = session;
    this.list = session.world.containers;
    this.byId = new Map(this.list.map((c) => [c.id, c]));
    this.state = new Map(); // id → {searched, slots:[], locked}
    const S = session;
    // ---- eylemler (host)
    S.on('search_done', (p, from) => {
      const c = this.byId.get(p.id);
      if (!c) return;
      let st = this.state.get(p.id);
      if (!st) { st = this.generate(c); this.state.set(p.id, st); S.results.searched++; }
      st.searched = true;
      if (p.forced) st.locked = 0;
      S.emit({ k: 'container', id: p.id, slots: st.slots, searched: true, locked: st.locked || 0, open: from });
      S.quests.onSearch(c, from);
    });
    S.on('loot_take', (p, from) => {
      const st = this.state.get(p.id);
      if (!st) return;
      const idx = p.slot;
      const s = st.slots[idx];
      if (!s) return;
      const qty = Math.min(p.qty || s.qty, s.qty);
      const taken = { ...s, qty };
      s.qty -= qty;
      if (s.qty <= 0) st.slots[idx] = null;
      S.emit({ k: 'container', id: p.id, slots: st.slots });
      S.emit({ k: 'grant', to: from, items: [taken] });
    });
    S.on('loot_take_all', (p, from) => {
      const st = this.state.get(p.id);
      if (!st) return;
      const items = st.slots.filter(Boolean);
      st.slots = st.slots.map(() => null);
      S.emit({ k: 'container', id: p.id, slots: st.slots });
      if (items.length) S.emit({ k: 'grant', to: from, items });
    });
    S.on('loot_put', (p, from) => {
      let st = this.state.get(p.id);
      if (!st) { st = { searched: true, slots: new Array(this.capacity(this.byId.get(p.id) || p)).fill(null) }; this.state.set(p.id, st); }
      const stack = p.stack;
      // birleştir/boş yuva
      const def = ITEMS[stack.id];
      let left = stack.qty;
      if (def.stack > 1) for (const s of st.slots) { if (s && s.id === stack.id && !s.noteId && left > 0) { const add = Math.min(def.stack - s.qty, left); s.qty += add; left -= add; } }
      for (let i = 0; i < st.slots.length && left > 0; i++) if (!st.slots[i]) { const add = Math.min(def.stack, left); st.slots[i] = { ...stack, qty: add }; left -= add; }
      S.emit({ k: 'container', id: p.id, slots: st.slots });
      if (left > 0) S.emit({ k: 'grant', to: from, items: [{ ...stack, qty: left }], silent: true });
    });
    S.on('unlock', (p) => {
      const st = this.state.get(p.id) || this.generate(this.byId.get(p.id));
      st.locked = 0;
      this.state.set(p.id, st);
      S.emit({ k: 'container', id: p.id, slots: st.slots, locked: 0 });
    });
    // ---- olay uygulama (herkes)
    S.onEvt('container', (e) => {
      let st = this.state.get(e.id);
      if (!st) { st = { searched: false, slots: [] }; this.state.set(e.id, st); }
      st.slots = e.slots;
      if (e.searched) st.searched = true;
      if (e.locked !== undefined) st.locked = e.locked;
      if (e.open && e.open === S.localId) S.ui.openStorage({ kind: 'container', id: e.id, label: (this.byId.get(e.id) || {}).label || 'Depo' });
      S.ui.refreshStorage && S.ui.refreshStorage(e.id);
    });
  }

  init() {
    // kilitli konteynerler (kasalar) ve 3. gün yağmalama hazırlığı
    for (const c of this.list) if (c.type === 'safe' || c.locked) this.state.set(c.id, { searched: false, slots: [], locked: c.type === 'safe' ? 2 : c.locked });
  }

  capacity(c) {
    if (!c) return 12;
    if (c.storage) return c.storage;
    return 12;
  }

  regionDanger(c) {
    const r = this.s.world.regionAt(c.x, c.z);
    return r ? r.danger || 1 : 1;
  }

  /** Konteyner içeriği üret */
  generate(c) {
    const S = this.s;
    const rng = new RNG(S.seed + ':' + c.id);
    const slots = new Array(12).fill(null);
    const put = (id, qty, data) => {
      if (!ITEMS[id]) return;
      const i = slots.findIndex((x) => !x);
      if (i >= 0) slots[i] = { id, qty, ...(data || {}) };
    };
    if (c.special && SPECIAL_LOOT[c.special]) {
      for (const [id, n, data] of SPECIAL_LOOT[c.special]) put(id, n, data);
      return { searched: false, slots, locked: c.locked || 0 };
    }
    const T = LOOT[c.type] || LOOT.crate;
    const danger = this.regionDanger(c);
    const day = S.time.day;
    let empty = T.empty * (day >= 3 && ['shelf_food', 'shelf_drinks', 'fridge', 'kitchen_cabinet'].includes(c.type) ? 1.35 : 1) * (1 / S.diff.loot);
    if (c.building === 'home') empty *= 0.5;
    if (rng.next() < Math.min(0.8, empty)) return { searched: false, slots, locked: c.locked || 0 };
    const rolls = rng.int(T.rolls[0], T.rolls[1]) + (danger >= 3 && rng.chance(0.4) ? 1 : 0);
    for (let r = 0; r < Math.max(1, rolls); r++) {
      const list = T.list.map(([id, w, mn, mx]) => {
        const def = ITEMS[id];
        let ww = w;
        if (!def) ww = 0;
        else if (def.rarity === 'rare') ww *= 0.6 + danger * 0.18;
        else if (def.rarity === 'epic') ww *= 0.3 + danger * 0.15;
        if (day >= 11 && id === 'jerrycan') ww *= 0.4;
        return [[id, mn, mx], ww];
      }).filter(([, w]) => w > 0);
      if (!list.length) break;
      const [id, mn, mx] = rng.weighted(list);
      let qty = rng.int(mn, mx);
      if (id === 'money') qty = Math.round(qty * (0.6 + danger * 0.2));
      const data = {};
      if (id === 'note') data.noteId = rng.pick(RANDOM_NOTES);
      if (ITEMS[id].gun) data.ammo = rng.int(0, Math.ceil(ITEMS[id].gun.mag / 2));
      if (ITEMS[id].durability) data.dur = Math.round(ITEMS[id].durability * (0.4 + rng.next() * 0.6));
      if (id === 'jerrycan') data.fuel = rng.int(0, 12);
      put(id, qty, data);
    }
    // bölgesel hikâye notları
    if (c.room && this.s.world.buildingById[c.building]) {
      const b = this.s.world.buildingById[c.building];
      if (b.docRoom === c.room && c.type === 'desk' || c.type === 'filing_cabinet' && b.docRoom) {
        const docs = { hospital: 'hospital_records', military: 'military_orders', lab: 'lab_doc1', lab_secret: 'lab_secret', factory: 'factory_memo', port: 'port_log', checkpoint: 'checkpoint_note' };
        const room = b.tpl.rooms.find((r) => r.id === c.room);
        const doc = room && docs[room.docs];
        if (doc && !this.s.flags['placed:' + doc]) { this.s.flags['placed:' + doc] = 1; put('note', 1, { noteId: doc }); if (doc === 'hospital_records') put('keycard', 1); if (doc === 'port_log') put('sea_map', 1); }
      }
    }
    if (c.building === 'police' && c.type === 'desk' && !this.s.flags['placed:cctv']) { this.s.flags['placed:cctv'] = 1; put('note', 1, { noteId: 'cctv' }); }
    if (c.building === 'bank' && c.type === 'desk' && !this.s.flags['placed:bank']) { this.s.flags['placed:bank'] = 1; put('vault_code', 1); put('note', 1, { noteId: 'bank_note' }); }
    return { searched: false, slots, locked: c.locked || 0 };
  }

  get(id) { return this.state.get(id); }
  searched(id) { const s = this.state.get(id); return !!(s && s.searched); }

  /** Takvim olayları: 3. günde yağmalama (bazı evler boşalır) */
  onDay(day) {
    if (!this.s.isHost) return;
    if (day === 3 || day === 12 || day === 20) {
      const rng = new RNG(this.s.seed + ':loot' + day);
      for (const c of this.list) {
        if (this.state.get(c.id)?.searched) continue;
        if (c.building === 'home') continue;
        if (rng.chance(day === 3 ? 0.15 : 0.12)) this.state.set(c.id, { searched: false, slots: new Array(12).fill(null), looted: true });
      }
    }
  }

  serialize() {
    const out = {};
    for (const [id, st] of this.state) out[id] = { s: st.searched ? 1 : 0, l: st.locked || 0, i: st.slots.map((x) => x || 0) };
    return out;
  }
  load(o) {
    this.state.clear();
    for (const [id, st] of Object.entries(o || {})) this.state.set(id, { searched: !!st.s, locked: st.l, slots: (st.i || []).map((x) => x || null) });
  }
}
