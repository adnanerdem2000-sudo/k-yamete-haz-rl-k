// Yağma sistemi: konteyner durumları (host otoritesi). İçerik ilk aramada üretilir ve kaydedilir:
// aynı eşya sürekli yeniden ortaya çıkmaz. Bölge tehlikesi ve takvim olayları içeriği etkiler.
import { LOOT, SPECIAL_LOOT } from '../data/loot.js';
import { ITEMS } from '../data/items.js';
import { RANDOM_NOTES } from '../data/story.js';
import { RNG } from '../core/util.js';

// belge taşıyabilen konteynerler (oda belgeleri için)
const DOC_HOLDERS = new Set(['desk', 'filing_cabinet', 'radio_desk', 'server']);
// şablon odası docs etiketi → belge (nesne: bina ya da oda kimliğine göre)
const ROOM_DOCS = {
  hospital: 'hospital_records', military: 'military_orders', lab: 'lab_doc1', lab_secret: 'lab_secret', factory: 'factory_memo', port: 'port_log', checkpoint: 'checkpoint_note',
  airfield: { terminal: 'airfield_log', tower: 'tower_log' }, dam: { control: 'dam_report', office: 'engineer_note' },
};
// bina kimliği → belge(ler) (types yoksa binadaki ilk aranan konteyner)
const BUILDING_DOCS = {
  police: [{ doc: 'cctv', types: ['desk'] }],
  bank: [{ doc: 'bank_note', types: ['desk'], extra: [['vault_code', 1]] }],
  prison_admin: [{ doc: 'prison_log', types: ['desk', 'filing_cabinet', 'bookshelf'] }],
  hotel: [{ doc: 'hotel_manager', types: ['desk', 'filing_cabinet', 'bookshelf'] }, { doc: 'resort_guestbook' }],
  keeper: [{ doc: 'lighthouse_log' }],
  vil_cafe: [{ doc: 'village_note' }],
  vil3: [{ doc: 'kizilcam_origin' }],
  barn: [{ doc: 'farm_diary' }],
};

export class Loot {
  constructor(session) {
    this.s = session;
    this.list = session.world.containers;
    this.byId = new Map(this.list.map((c) => [c.id, c]));
    this.state = new Map(); // id → {searched, slots:[], locked}
    // açık tutulan konteynerler (arama sürüyor ya da depo paneli açık): dolap kapağı/çekmece herkeste açık görünsün.
    // Host kimin açtığını tutar (users), herkes sayıyı (inUse) olaydan alır. Geçici durum: kayda girmez.
    this.inUse = new Map(); // id → kullanan sayısı
    this.users = new Map(); // (host) id → Set(oyuncu/bot kimliği)
    const S = session;
    S.on('cont_use', (p, from) => {
      if (!this.byId.has(p.id)) return;
      const set = this.users.get(p.id) || new Set();
      if (p.on) set.add(from); else set.delete(from);
      if (set.size) this.users.set(p.id, set); else this.users.delete(p.id);
      S.emit({ k: 'cont_use', id: p.id, n: set.size });
    });
    S.onEvt('cont_use', (e) => { if (e.n > 0) this.inUse.set(e.id, e.n); else this.inUse.delete(e.id); });
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
    // hikâye belgeleri: boş çıkma zarından önce (belge odası tek konteynerliyse de bulunsun)
    const story = this.storyDocs(c);
    for (const [id, n, data] of story) put(id, n, data);
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
      // bozulabilir yiyecekler: bulunduğunda bir süredir raftadır
      if (ITEMS[id].spoil) data.t0 = Math.round(S.time.total - rng.next() * ITEMS[id].spoil * 0.5 * 1440);
      put(id, qty, data);
    }
    return { searched: false, slots, locked: c.locked || 0 };
  }

  /**
   * Bu konteynere düşen hikâye belgeleri (her belge oyunda bir kez yerleşir).
   * Oda belgeleri: şablonda docs etiketi olan odadaki masa/dosya dolabı/telsiz masası/sunucu.
   * Bina belgeleri: belirli binalardaki ilk uygun konteyner.
   */
  storyDocs(c) {
    const S = this.s, out = [];
    const once = (doc, extra = []) => {
      if (!doc || S.flags['placed:' + doc]) return;
      S.flags['placed:' + doc] = 1;
      out.push(['note', 1, { noteId: doc }], ...extra);
    };
    const b = c.building && S.world.buildingById[c.building];
    if (b && c.room && DOC_HOLDERS.has(c.type)) {
      const room = b.tpl.rooms.find((r) => r.id === c.room);
      let doc = room && ROOM_DOCS[room.docs];
      if (doc && typeof doc === 'object') doc = doc[c.building] || doc[c.room];
      if (doc) once(doc, doc === 'hospital_records' ? [['keycard', 1]] : doc === 'port_log' ? [['sea_map', 1]] : []);
    }
    for (const bd of (c.building && BUILDING_DOCS[c.building]) || []) {
      if (!bd.types || bd.types.includes(c.type)) { const n = out.length; once(bd.doc, bd.extra || []); if (out.length > n) break; }
    }
    return out;
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

  /** (host) Oyundan kopan oyuncunun açık tuttuğu konteynerler kapanır */
  dropUser(pid) {
    for (const [id, set] of [...this.users]) if (set.delete(pid)) { if (!set.size) this.users.delete(id); this.s.emit({ k: 'cont_use', id, n: set.size }); }
  }

  /** Hoş geldin paketi: o an açık tutulan konteynerler */
  usageSnapshot() { return [...this.inUse].map(([id, n]) => [id, n]); }
  applyUsage(arr) { this.inUse.clear(); for (const [id, n] of arr || []) if (n > 0) this.inUse.set(id, n); }

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
