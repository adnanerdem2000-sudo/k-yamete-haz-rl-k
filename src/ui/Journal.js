// Günlük paneli: ENVANTER · ÜRETİM · KARAKTER · GÖREVLER · HARİTA (konsept sanattaki sekmeli ekran).
import { h, clear, slotView, portrait, bar, button, fmtTime } from './dom.js';
import { ITEMS, CATEGORIES, RARITY } from '../data/items.js';
import { RECIPE_CATS } from '../data/recipes.js';
import { NOTES, CALENDAR, ENDINGS } from '../data/story.js';
import { CHARACTERS } from '../entities/CharacterFactory.js';
import { HOTBAR } from '../systems/Inventory.js';
import { formatKg, dist } from '../core/util.js';
import { toolName } from '../systems/Build.js';

const TABS = [['inventory', 'ENVANTER'], ['crafting', 'ÜRETİM'], ['character', 'KARAKTER'], ['quests', 'GÖREVLER'], ['map', 'HARİTA']];
const CAT_ICON = { all: '🗂️', food: '🍖', drink: '💧', weapon: '🗡️', ammo: '🔫', build: '🧱', car: '🚗', med: '➕', wear: '👕', tool: '🔧', misc: '📦' };
const EQUIP = [['back', 'Sırt'], ['body', 'Gövde'], ['head', 'Baş'], ['body2', 'Dış Giyim'], ['hands', 'Eller']];
const STAT_LABELS = { health: 'Sağlık', stamina: 'Dayanıklılık', speed: 'Hız', melee: 'Yakın Dövüş', aim: 'Nişancılık', build: 'İnşa', repair: 'Tamir', heal: 'Tedavi', stealth: 'Gizlilik', lockpick: 'Kilit Açma', hunt: 'Avcılık' };
const REL = { neighbors: 'Komşular', military: 'Askerler', traders: 'Tüccarlar', raiders: 'Yağmacılar' };

export class Journal {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.tab = 'inventory';
    this.cat = 'all';
    this.rcat = 'all';
    this.sel = null;
    this.qsel = null;
    this.el = null;
  }

  get S() { return this.ui.S; }

  open(tab = 'inventory') {
    const S = this.S;
    if (!S) return;
    if (this.ui.panel && this.ui.panel.name === 'journal') {
      if (this.tab === tab) { this.ui.closePanel(); return; }
      this.tab = tab; this.render(); return;
    }
    this.tab = tab;
    this.el = h('div.panel.journal');
    this.ui.openPanel('journal', this.el, { onClose: () => { this.el = null; this.mapCleanup && this.mapCleanup(); } });
    this.render();
  }

  render() {
    if (!this.el) return;
    this.mapCleanup && this.mapCleanup();
    this.mapCleanup = null;
    clear(this.el);
    const tabs = h('div.tabs', TABS.map(([id, label]) => h('button.tab' + (id === this.tab ? '.active' : ''), { type: 'button', on: { click: () => { this.tab = id; this.render(); } } }, label)),
      h('button.close', { type: 'button', title: 'Kapat (Esc)', on: { click: () => this.ui.closePanel() } }, '✕'));
    const body = h('div.journal-body');
    this.el.append(tabs, body);
    if (this.tab === 'inventory') this.renderInventory(body);
    else if (this.tab === 'crafting') this.renderCrafting(body);
    else if (this.tab === 'character') this.renderCharacter(body);
    else if (this.tab === 'quests') this.renderQuests(body);
    else if (this.tab === 'map') this.renderMap(body);
  }

  refresh() { if (this.el && (this.tab === 'inventory' || this.tab === 'crafting' || this.tab === 'character')) this.render(); }

  // ======================================================================= ENVANTER
  renderInventory(body) {
    const S = this.S;
    const inv = S.inventory;
    const cats = h('div.side-list', Object.entries(CATEGORIES).map(([k, n]) => h('button.side-item' + (k === this.cat ? '.active' : ''), { type: 'button', on: { click: () => { this.cat = k; this.render(); } } }, h('span', CAT_ICON[k] || '•'), n)));
    const grid = h('div.inv-grid');
    inv.slots.forEach((s, i) => {
      const dim = s && this.cat !== 'all' && ITEMS[s.id].cat !== this.cat;
      const el = slotView(this.game, s, { index: i, hotkey: i < HOTBAR ? i + 1 : null, cls: (i === this.sel ? 'sel' : '') + (dim ? ' dim' : '') + (i < HOTBAR ? ' hot' : '') });
      this.ui.dnd(el, { src: 'inv', index: i }, (from) => this.dropOnInv(from, i));
      el.addEventListener('click', () => { this.sel = s ? i : null; this.render(); });
      el.addEventListener('dblclick', () => { if (s) { S.useItem(i); setTimeout(() => this.render(), 50); } });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (s) { S.useItem(i); setTimeout(() => this.render(), 50); } });
      grid.appendChild(el);
    });
    const w = inv.weight(), mw = inv.maxWeight;
    const foot = h('div.inv-foot',
      h('div.weight', h('span', `🎒 ${formatKg(w)} / ${formatKg(mw)} kg`), bar(w, mw, w > mw ? 'over' : 'wt')),
      button('Sırala', () => { inv.sort(); this.render(); }, 'small'),
      h('div.hint', 'Sürükle-bırak: taşı · Çift tık/sağ tık: kullan · Dışarı sürükle: yere bırak'));
    const equip = h('div.equip', EQUIP.map(([k, n]) => {
      const id = S.equipment[k];
      const el = h('div.equip-slot' + (id ? '.filled' : ''), h('small', n), id ? this.ui.icon(id) : h('span.empty', '—'));
      if (id) { el.title = ITEMS[id].name + ' (tıkla: çıkar)'; el.addEventListener('click', () => { S.unequip(k); this.render(); }); }
      return el;
    }));
    const center = h('div.inv-center', grid, foot);
    body.append(cats, center, h('div.inv-right', this.detail(this.sel !== null ? inv.slots[this.sel] : null, this.sel), equip));
    // dışarı sürüklenince yere bırak
    this.ui.dropZone(body, (from) => { if (from.src === 'inv') { S.dropSlot(from.index); this.sel = null; this.render(); } });
  }

  dropOnInv(from, to) {
    const S = this.S;
    if (from.src === 'inv') S.inventory.move(from.index, to);
    this.sel = to;
    this.render();
  }

  detail(s, i) {
    const S = this.S;
    if (!s) return h('div.detail.empty', h('p', 'Bir eşya seç.'), h('p.muted', 'Hızlı erişim çubuğu: ilk 6 yuva (1-6 tuşları).'));
    const def = ITEMS[s.id];
    const rows = [];
    const u = def.use || {};
    const row = (k, v) => rows.push(h('div.stat-row', h('span', k), h('b', v)));
    if (u.hunger) row('🍖 Açlık', (u.hunger > 0 ? '+' : '') + u.hunger);
    if (u.thirst) row('💧 Susuzluk', (u.thirst > 0 ? '+' : '') + u.thirst);
    if (u.heal) row('❤️ Sağlık', '+' + u.heal);
    if (u.energy) row('⚡ Enerji', '+' + u.energy);
    if (u.morale) row('🙂 Moral', '+' + u.morale);
    if (u.poison) row('☠️ Zehir riski', '%' + Math.round(u.poison * 100));
    if (def.melee) { row('⚔️ Hasar', def.melee.dmg); row('Hız', def.melee.speed); row('Ses', def.melee.noise); }
    if (def.gun) { row('🔫 Hasar', def.gun.dmg + (def.gun.pellets ? ` x${def.gun.pellets}` : '')); row('Şarjör', `${s.ammo || 0}/${def.gun.mag}`); row('Mühimmat', ITEMS[def.gun.ammo].name); row('Ses', def.gun.noise); }
    if (def.tool) row('🔧 Alet', def.tool.map(toolName).join(', '));
    if (def.wear) row('👕 Giyilir', { back: 'Sırt', body: 'Gövde', head: 'Baş', body2: 'Dış giyim', hands: 'Eller' }[def.wear.slot] + (def.wear.carry ? ` (+${def.wear.carry} kg)` : ''));
    if (s.dur !== undefined && def.durability) row('Dayanıklılık', `%${Math.round(s.dur / def.durability * 100)}`);
    if (s.fuel !== undefined) row('⛽ Yakıt', `${Math.round(s.fuel)} / ${def.fuelCap} L`);
    if (def.spoil) row('⏳ Bozulma', `${def.spoil} gün`);
    row('⚖️ Ağırlık', formatKg(def.weight * s.qty) + ' kg');
    const acts = [];
    const usable = def.use || def.wear || ['note', 'radio', 'sleeping_bag'].includes(s.id) || s.noteId;
    if (usable) acts.push(button(def.wear ? 'Kuşan' : s.id === 'note' || s.noteId ? 'Oku' : 'Kullan', () => { S.useItem(i); setTimeout(() => this.render(), 60); }, 'green'));
    if (i >= HOTBAR) acts.push(button('Hızlı Çubuğa', () => { const free = S.inventory.slots.findIndex((x, k) => k < HOTBAR && !x); S.inventory.move(i, free >= 0 ? free : S.hotbarIndex); this.sel = null; this.render(); }, 'small'));
    acts.push(button('Bırak', () => { S.dropSlot(i); this.sel = null; this.render(); }, 'brown'));
    if (s.qty > 1) acts.push(button('Böl', () => { S.inventory.split(i); this.render(); }, 'brown'));
    // yakındaki takım arkadaşına ver
    const mates = S.teamList().filter((m) => !m.isLocal && !m.downed && dist(m.pos.x, m.pos.z, S.local.pos.x, S.local.pos.z) < 6);
    for (const m of mates) acts.push(button(`${m.name}'a ver`, () => { const st = S.inventory.takeAt(i, s.qty); if (st) S.act('give', { to: m.id, stack: st }); this.sel = null; this.render(); }, 'small'));
    return h('div.detail',
      h('div.detail-icon', this.ui.icon(s.id, 'item-icon big')),
      h('div.detail-name', def.name, s.qty > 1 ? h('span.muted', ` x${s.qty}`) : null),
      h('div.rarity', { style: { color: RARITY[def.rarity]?.color } }, RARITY[def.rarity]?.name || ''),
      h('p.desc', def.desc || ''),
      h('div.stats', rows),
      h('div.actions', acts));
  }

  // ======================================================================= ÜRETİM
  renderCrafting(body) {
    const S = this.S;
    const C = S.crafting;
    const st = C.stations();
    const cats = h('div.side-list', Object.entries(RECIPE_CATS).map(([k, n]) => h('button.side-item' + (k === this.rcat ? '.active' : ''), { type: 'button', on: { click: () => { this.rcat = k; this.render(); } } }, n)));
    const status = h('div.stations',
      h('span', 'Yakındaki istasyonlar:'),
      h('span' + (st.workbench ? '.ok' : '.no'), st.workbench ? `🔨 Tezgâh Sv.${st.workbench}` : '🔨 Tezgâh yok'),
      h('span' + (st.fire ? '.ok' : '.no'), st.fire ? '🔥 Ateş/Ocak' : '🔥 Ateş yok'),
      h('span' + (st.water_filter ? '.ok' : '.no'), st.water_filter ? '💧 Filtre' : '💧 Filtre yok'));
    const list = h('div.craft-list');
    for (const { r, c } of C.list(this.rcat)) {
      const ins = r.in.map(([id, n]) => {
        const have = S.inventory.count(id);
        return h('div.ing' + (have >= n ? '.ok' : '.miss'), { title: ITEMS[id].name }, this.ui.icon(id), h('span', `${have}/${n}`));
      });
      if (r.fuel) ins.push(h('div.ing' + (C.fuelAvailable() >= r.fuel ? '.ok' : '.miss'), { title: 'Yakıt' }, h('span.emoji', '⛽'), h('span', `${r.fuel}L`)));
      const tools = (r.tools || []).map((t) => h('span.tool' + (S.build.hasTool(t) ? '.ok' : '.miss'), toolName(t)));
      const btn = button(c.ok ? 'Üret' : 'Üretilemez', () => { if (C.craft(r.id)) setTimeout(() => this.render(), 100); }, c.ok ? 'craft' : 'craft disabled');
      if (!c.ok) btn.title = c.why || '';
      list.appendChild(h('div.craft-row' + (c.ok ? '' : '.locked'),
        h('div.craft-out', this.ui.icon(r.out), r.qty > 1 ? h('span.slot-qty', String(C.outputQty(r))) : null),
        h('div.craft-info', h('b', r.name), h('small', `${C.stationLabel(r)} · ${Math.round(C.duration(r))} sn`), h('div.tools', tools), !c.ok && c.why ? h('small.why', c.why) : null),
        h('div.craft-ings', ins), btn));
    }
    body.append(cats, h('div.craft-main', status, list));
  }

  // ======================================================================= KARAKTER
  renderCharacter(body) {
    const S = this.S;
    const p = S.localProfile;
    const def = CHARACTERS[p.charId];
    const st = S.localStats;
    const stats = Object.entries(def.stats).filter(([k]) => STAT_LABELS[k]).map(([k, v]) => {
      const val = k === 'health' || k === 'stamina' ? v / 130 : v / 2;
      return h('div.stat-line', h('span', STAT_LABELS[k]), bar(val, 1, 'stat'), h('b', k === 'health' || k === 'stamina' ? String(v) : `x${v.toFixed(2)}`));
    });
    const needs = [['Sağlık', st.health, st.maxHealth], ['Açlık', st.hunger, 100], ['Susuzluk', st.thirst, 100], ['Enerji', st.energy, 100], ['Moral', st.morale, 100]].map(([n, v, m]) => h('div.stat-line', h('span', n), bar(v, m, 'need'), h('b', String(Math.round(v)))));
    const r = S.results;
    const b = S.build;
    const left = h('div.char-card', portrait(p.charId, 'card'), h('div.char-name', def.name), h('div.char-role', def.role), h('p.bio', def.bio), h('ul.perks', def.perks.map((x) => h('li', x))));
    const mid = h('div.char-mid',
      h('h3', 'Yetenekler'), h('div.stat-lines', stats),
      h('h3', 'Durum'), h('div.stat-lines', needs, h('div.stat-line', h('span', 'Vücut ısısı'), h('b', st.temp.toFixed(1) + '°C'))));
    const rels = Object.entries(REL).map(([k, n]) => { const v = S.relations[k] || 0; return h('div.stat-line', h('span', n), h('div.rel-bar', h('i', { style: { left: (50 + v / 2) + '%' } })), h('b', String(v))); });
    const right = h('div.char-right',
      h('h3', 'Üs'), h('div.base-level', `Seviye ${b.baseLevel()}`), h('div.stat-lines',
        h('div.stat-line', h('span', '🛡️ Savunma'), h('b', String(b.defenseScore()))),
        h('div.stat-line', h('span', '🛋️ Konfor'), h('b', String(b.comfortScore()))),
        h('div.stat-line', h('span', '⚙️ Altyapı'), h('b', String(b.utilScore()))),
        h('div.stat-line', h('span', '⚡ Elektrik'), h('b', b.gen.fixed ? (b.gen.on ? `Açık (${Math.round(b.gen.fuel)} sa yakıt)` : 'Kapalı') : 'Jeneratör bozuk')),
        h('div.stat-line', h('span', '🕳️ Sığınak'), h('b', `${b.bunker.stage}/4`))),
      h('h3', 'İlişkiler'), h('div.stat-lines', rels),
      h('h3', 'İstatistikler'), h('div.stat-lines',
        h('div.stat-line', h('span', 'Öldürülen zombi'), h('b', String(r.kills))),
        h('div.stat-line', h('span', 'Aranan yer'), h('b', String(r.searched))),
        h('div.stat-line', h('span', 'Toplanan kaynak'), h('b', String(r.resources))),
        h('div.stat-line', h('span', 'Üretilen eşya'), h('b', String(r.crafted))),
        h('div.stat-line', h('span', 'Kurtarılan kişi'), h('b', String(r.rescued))),
        h('div.stat-line', h('span', 'Keşfedilen harita'), h('b', `%${Math.round(S.map.exploredPct() * 100)}`))));
    body.append(left, mid, right);
  }

  // ======================================================================= GÖREVLER
  renderQuests(body) {
    const S = this.S;
    const Q = S.quests;
    const groups = { main: 'Ana Hikâye', side: 'Yan Görevler', random: 'Rastgele Görevler' };
    const side = h('div.side-list.quests');
    const all = Object.entries(Q.st).map(([id, st]) => ({ id, st, def: Q.def(id) })).filter((x) => x.def);
    for (const [g, gname] of Object.entries(groups)) {
      const items = all.filter((x) => (x.def.kind || 'random') === g).sort((a, b) => (a.st.state === 'done') - (b.st.state === 'done'));
      if (!items.length) continue;
      side.append(h('div.side-head', gname));
      for (const x of items) side.append(h('button.side-item' + (x.id === this.qsel ? '.active' : '') + (x.st.state === 'done' ? '.done' : ''), { type: 'button', on: { click: () => { this.qsel = x.id; this.render(); } } }, x.st.state === 'done' ? '✔ ' : Q.tracked === x.id ? '★ ' : '• ', x.def.title));
    }
    side.append(h('div.side-head', 'Günlük'));
    for (const [k, n] of [['_notes', `Notlar (${Q.notesRead.size})`], ['_radio', `Telsiz (${S.events.broadcasts.length})`], ['_calendar', '30 Günlük Takvim'], ['_endings', 'Kaçış Planları']]) {
      side.append(h('button.side-item' + (this.qsel === k ? '.active' : ''), { type: 'button', on: { click: () => { this.qsel = k; this.render(); } } }, n));
    }
    const main = h('div.quest-main');
    const sel = this.qsel || Q.tracked || (all[0] && all[0].id);
    if (sel === '_notes') {
      main.append(h('h2', 'Bulunan Notlar'));
      if (!Q.notesRead.size) main.append(h('p.muted', 'Henüz not bulmadın. Dolaplarda, cesetlerde ve masalarda notlar olabilir.'));
      for (const id of Q.notesRead) { const n = NOTES[id]; if (n) main.append(h('div.note-row', { on: { click: () => this.ui.openNote(n) } }, h('b', n.title), h('small', n.src || ''))); }
    } else if (sel === '_radio') {
      main.append(h('h2', 'Telsiz ve Radyo Yayınları'));
      for (const b of S.events.broadcasts) main.append(h('div.broadcast', h('b', b.title), h('p', b.text)));
    } else if (sel === '_calendar') {
      main.append(h('h2', '30 Günlük Takvim'), this.calendar());
    } else if (sel === '_endings') {
      main.append(h('h2', 'Kaçış Planları'), h('p.muted', 'Son Işık 30. gün 22:00\'de başlar. En az bir planı hazırla — birden fazlası daha güvenli.'));
      const rd = S.endings.readiness();
      for (const [k, v] of Object.entries(rd)) { const E = ENDINGS[k] || {}; main.append(h('div.ending-row' + (v.ok ? '.ok' : ''), h('span.ending-ic', E.icon || '•'), h('div', h('b', (v.ok ? '✅ ' : '⬜ ') + (E.name || k)), h('p', E.desc || ''), h('small', 'Gereksinim: ' + (E.req || '')), h('small.state', 'Durum: ' + v.detail)))); }
    } else if (sel && Q.def(sel)) {
      const def = Q.def(sel), st = Q.st[sel];
      main.append(h('div.q-kind', { main: 'ANA HİKÂYE', side: 'YAN GÖREV' }[def.kind] || 'GÖREV'), h('h2', def.title), h('p', def.desc || ''));
      def.objs.forEach((o, i) => {
        const cur = st.prog[i] || 0, max = o.count || 1;
        main.append(h('div.q-obj' + (cur >= max ? '.done' : ''), h('span.q-check', cur >= max ? '✔' : ''), h('span', o.label), max > 1 ? h('b', ` ${Math.min(cur, max)}/${max}`) : null));
      });
      if (def.reward && def.reward.length) main.append(h('div.rewards', h('span', 'Ödül: '), def.reward.map(([id, n]) => h('span.reward', this.ui.icon(id), ` ${ITEMS[id].name} x${n}`))));
      if (def.ending) main.append(h('p.muted', '🏁 Bu görev bir kaçış yoluna (final) bağlıdır.'));
      const wp = Q.waypoint(def);
      if (st.state === 'active') main.append(h('div.actions', button(Q.tracked === sel ? '★ Takip ediliyor' : 'Takip Et', () => { Q.tracked = sel; S.quests.tracked = sel; this.render(); }, 'green'), wp ? button('Haritada Göster', () => { this.mapFocus = wp; this.tab = 'map'; this.render(); }, 'small') : null));
    }
    body.append(side, main);
  }

  calendar() {
    const S = this.S;
    const today = S.time.day;
    const grid = h('div.calendar');
    for (let d = 1; d <= 30; d++) {
      const c = CALENDAR[d];
      const past = d < today, now = d === today;
      const known = past || now || (c && d <= today + 2);
      grid.append(h('div.cal-day' + (past ? '.past' : '') + (now ? '.now' : '') + (d === 30 ? '.final' : ''),
        h('b', String(d)), h('small', known && c ? c.title : d === 30 ? 'SON IŞIK' : c ? '???' : '')));
    }
    return grid;
  }

  // ======================================================================= HARİTA
  renderMap(body) {
    const S = this.S;
    const wrap = h('div.map-wrap');
    const cv = h('canvas.map-canvas');
    const tip = h('div.map-tip.hidden');
    const travel = h('div.travel.hidden');
    let placing = false;
    const v = { cx: this.mapFocus ? this.mapFocus.x : S.local.pos.x, cz: this.mapFocus ? this.mapFocus.z : S.local.pos.z, scale: 1.1, w: 800, h: 600 };
    this.mapFocus = null;
    const toolbar = h('div.map-tools',
      button('📍 İşaret Koy', (e) => { placing = !placing; e.currentTarget.classList.toggle('active', placing); }, 'tool'),
      button('🔍+ Yakınlaştır', () => { v.scale = Math.min(6, v.scale * 1.4); }, 'tool'),
      button('🔍− Uzaklaştır', () => { v.scale = Math.max(0.45, v.scale / 1.4); }, 'tool'),
      button('🧭 Oyuncu Konumu', () => { v.cx = S.local.pos.x; v.cz = S.local.pos.z; }, 'tool'),
      button('🚶 Hızlı Seyahat', () => { this.travelList(travel); travel.classList.toggle('hidden'); }, 'tool'));
    wrap.append(cv, tip, travel, toolbar, h('div.map-legend', h('span', '🏠 Üs'), h('span', '★ Görev'), h('span', '📍 İşaret'), h('span', '⚠️ Tehlike'), h('span', 'Sağ tık: işareti sil')));
    body.append(wrap);
    let drag = null, raf = 0;
    const draw = () => {
      const r = wrap.getBoundingClientRect();
      if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.max(10, Math.round(r.width)); cv.height = Math.max(10, Math.round(r.height)); }
      v.w = cv.width; v.h = cv.height;
      this.ui.mapView.drawFull(cv.getContext('2d'), v, S, { hover: this.hoverPoi });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const k = e.deltaY < 0 ? 1.15 : 1 / 1.15; const before = this.ui.mapView.toWorld(v, e.offsetX, e.offsetY); v.scale = Math.max(0.45, Math.min(6, v.scale * k)); const after = this.ui.mapView.toWorld(v, e.offsetX, e.offsetY); v.cx += before.x - after.x; v.cz += before.z - after.z; }, { passive: false });
    cv.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, cx: v.cx, cz: v.cz, moved: false }; });
    const mm = (e) => {
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; v.cx = drag.cx - dx / v.scale; v.cz = drag.cz - dy / v.scale; }
      const r = cv.getBoundingClientRect();
      const w = this.ui.mapView.toWorld(v, e.clientX - r.left, e.clientY - r.top);
      let near = null, nd = 14 / v.scale;
      for (const p of S.map.pois()) { const d = dist(p.x, p.z, w.x, w.z); if (d < nd) { nd = d; near = p; } }
      this.hoverPoi = near ? near.id : null;
      if (near) { tip.classList.remove('hidden'); tip.textContent = near.name; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px'; } else tip.classList.add('hidden');
    };
    const mu = (e) => {
      if (drag && !drag.moved && placing) {
        const r = cv.getBoundingClientRect();
        const w = this.ui.mapView.toWorld(v, e.clientX - r.left, e.clientY - r.top);
        S.map.addUserMarker(w.x, w.z, `İşaret ${S.map.markers.filter((m) => m.user).length + 1}`);
        S.act('ping', { x: w.x, y: S.world.terrain.heightAt(w.x, w.z), z: w.z, label: 'Buraya!' });
        placing = false; toolbar.firstChild.classList.remove('active');
      }
      drag = null;
    };
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const w = this.ui.mapView.toWorld(v, e.clientX - r.left, e.clientY - r.top);
      const m = S.map.markers.find((q) => q.user && dist(q.x, q.z, w.x, w.z) < 18 / v.scale);
      if (m) S.map.removeMarker(m.id);
    });
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    this.mapCleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }

  travelList(el) {
    const S = this.S;
    clear(el);
    const c = S.map.canFastTravel();
    el.append(h('div.travel-head', 'Hızlı Seyahat'), h('small.muted', c.ok ? `Buradasın: ${c.from.name}` : c.why));
    for (const t of S.map.travelPoints()) {
      const ok = c.ok && t.known && !t.here;
      el.append(button(`${t.known ? '' : '🔒 '}${t.name}${t.here ? ' (buradasın)' : ''}`, () => { if (ok && S.map.fastTravel(t.id)) this.ui.closePanel(); }, ok ? 'small' : 'small disabled'));
    }
  }
}

export { fmtTime };
