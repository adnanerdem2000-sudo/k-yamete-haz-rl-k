// Oyun içi paneller: depo/ganimet, takas, diyalog, olay kartı, inşa menüsü, araç geliştirme,
// takım, duraklatma, not, ifade çarkı ve durum katmanları (yere düşme, uyku, izleme, sonuç).
import { h, clear, slotView, portrait, bar, button, banner } from './dom.js';
import { ITEMS } from '../data/items.js';
import { BUILDABLES, BUILD_CATS, PROJECTS } from '../data/buildables.js';
import { ENDINGS } from '../data/story.js';
import { CHARACTERS } from '../entities/CharacterFactory.js';
import { UPGRADES } from '../systems/Vehicles.js';
import { SaveSystem, SLOT_NAMES } from '../systems/SaveSystem.js';
import { toolName } from '../systems/Build.js';
import { RNG, dist, formatKg } from '../core/util.js';
import { HOTBAR } from '../systems/Inventory.js';

const TRADE_STOCK = {
  hasan: ['canned_food', 'bread', 'water_bottle', 'bandage', 'nails', 'plank', 'seeds', 'rope', 'cloth', 'painkiller', 'hammer', 'tea'],
  riza: ['ammo_9mm', 'shells', 'pistol', 'jerrycan', 'engine_part', 'car_battery', 'tire', 'repair_kit', 'antibiotics', 'first_aid', 'electronics', 'metal_sheet', 'screws', 'duct_tape', 'mre', 'energy_drink', 'backpack_large', 'flashlight', 'battery'],
  // Dağ köyü (köy kurtarılınca): kiler, kaynak suyu, yün ve av malzemesi
  omer: ['bread', 'honey', 'cheese', 'apple', 'corn', 'water_bottle', 'warm_jacket', 'leather', 'rope', 'seeds', 'bow', 'arrow', 'lighter', 'sleeping_bag'],
};

export class GamePanels {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.storage = null;
    this.buildCat = 'walls';
  }
  get S() { return this.ui.S; }

  // ======================================================================= depo / ganimet / bagaj
  storageModel(o) {
    const S = this.S;
    if (o.kind === 'container') {
      const st = S.loot.get(o.id) || { slots: [] };
      return {
        slots: st.slots || [],
        take: (i) => S.act('loot_take', { id: o.id, slot: i }),
        takeAll: () => S.act('loot_take_all', { id: o.id }),
        put: (stack) => S.act('loot_put', { id: o.id, stack, cap: S.loot.capacity(S.loot.byId.get(o.id)) }),
        cap: Math.max((st.slots || []).length, S.loot.capacity(S.loot.byId.get(o.id) || {})),
        pos: S.loot.byId.get(o.id),
      };
    }
    if (o.kind === 'struct') {
      const st = S.build.structures.get(o.id);
      if (!st) return null;
      const cap = BUILDABLES[st.type].storage;
      const slots = st.data.slots || [];
      return { slots, cap, take: (i) => S.act('store_take', { id: o.id, slot: i }), takeAll: () => S.act('store_take_all', { id: o.id }), put: (stack) => S.act('store_put', { id: o.id, stack }), pos: st };
    }
    if (o.kind === 'trunk') {
      const v = S.vehicles.byId(o.id);
      if (!v) return null;
      return { slots: v.trunk, cap: v.trunkSize, take: (i) => S.act('trunk_take', { id: o.id, slot: i }), takeAll: () => { v.trunk.forEach((s, i) => s && S.act('trunk_take', { id: o.id, slot: i })); }, put: (stack) => S.act('trunk_put', { id: o.id, stack }), pos: v.pos };
    }
    return null;
  }

  openStorage(o) {
    const S = this.S;
    if (!S) return;
    this.storage = o;
    const el = h('div.panel.storage');
    this.ui.openPanel('storage', el, { onClose: () => { this.storage = null; } });
    this.renderStorage();
    this.game.audio.play('open', { vol: 0.5 });
  }

  renderStorage() {
    const S = this.S;
    const p = this.ui.panel;
    if (!p || p.name !== 'storage' || !this.storage) return;
    const el = p.el;
    const o = this.storage;
    const m = this.storageModel(o);
    if (!m) { this.ui.closePanel(); return; }
    clear(el);
    const invGrid = h('div.inv-grid.small');
    S.inventory.slots.forEach((s, i) => {
      const sv = slotView(this.game, s, { index: i, hotkey: i < HOTBAR ? i + 1 : null, cls: i < HOTBAR ? 'hot' : '' });
      this.ui.dnd(sv, { src: 'inv', index: i }, (from) => { if (from.src === 'inv') S.inventory.move(from.index, i); else if (from.src === 'store') m.take(from.index); this.renderStorage(); });
      sv.addEventListener('click', (e) => { if (!s) return; const st = S.inventory.takeAt(i, e.ctrlKey ? 1 : Infinity); if (st) m.put(st); this.renderStorage(); });
      invGrid.appendChild(sv);
    });
    const stGrid = h('div.inv-grid.small.store');
    const n = Math.max(m.cap || 0, m.slots.length);
    for (let i = 0; i < n; i++) {
      const s = m.slots[i] || null;
      const sv = slotView(this.game, s, { index: i });
      this.ui.dnd(sv, { src: 'store', index: i }, (from) => { if (from.src === 'inv') { const st = S.inventory.takeAt(from.index); if (st) m.put(st); } this.renderStorage(); });
      sv.addEventListener('click', () => { if (s) { m.take(i); } });
      stGrid.appendChild(sv);
    }
    const w = S.inventory.weight(), mw = S.inventory.maxWeight;
    el.append(
      h('div.panel-head', banner(o.label || 'Depo'), h('button.close', { type: 'button', on: { click: () => this.ui.closePanel() } }, '✕')),
      h('div.storage-body',
        h('div.storage-col', h('h3', 'Envanterin'), invGrid, h('div.weight', h('span', `🎒 ${formatKg(w)} / ${formatKg(mw)} kg`), bar(w, mw, w > mw ? 'over' : 'wt'))),
        h('div.storage-mid', h('div.arrows', '⇄'), button('Hepsini Al', () => m.takeAll(), 'green'), button('Yiyecekleri Koy', () => { for (let i = HOTBAR; i < S.inventory.size; i++) { const s = S.inventory.slots[i]; if (s && ['food', 'drink'].includes(ITEMS[s.id].cat)) { const st = S.inventory.takeAt(i); m.put(st); } } this.renderStorage(); }, 'small'), button('Malzemeleri Koy', () => { for (let i = HOTBAR; i < S.inventory.size; i++) { const s = S.inventory.slots[i]; if (s && ['build', 'car'].includes(ITEMS[s.id].cat)) { const st = S.inventory.takeAt(i); m.put(st); } } this.renderStorage(); }, 'small')),
        h('div.storage-col', h('h3', o.label || 'Depo'), m.slots.some(Boolean) || n ? stGrid : h('p.muted', 'Boş.'))),
      h('div.hint', 'Tıkla: aktar · Sürükle-bırak: taşı · Ctrl+tık: tek adet koy'));
  }

  refreshStorage(id) { if (this.storage && (!id || this.storage.id === id)) this.renderStorage(); }

  /** Depodan uzaklaşınca kapat */
  update() {
    const S = this.S;
    if (!S || !this.storage || !this.ui.panel || this.ui.panel.name !== 'storage') return;
    const m = this.storageModel(this.storage);
    if (!m || !m.pos) return;
    const p = m.pos;
    if (dist(p.x, p.z, S.local.pos.x, S.local.pos.z) > 5.5 && !(S.local.vehicle && this.storage.kind === 'trunk')) this.ui.closePanel();
  }

  // ======================================================================= takas
  stock(n) {
    const S = this.S;
    S._trade = S._trade || {};
    const key = n.id + ':' + S.time.day;
    if (!S._trade[key]) {
      const rng = new RNG(S.seed + key);
      const pool = (TRADE_STOCK[n.id] || TRADE_STOCK.hasan).filter((id) => ITEMS[id]);
      const items = rng.shuffle([...pool]).slice(0, 8).map((id) => ({ id, qty: ITEMS[id].stack > 1 ? rng.int(2, Math.min(ITEMS[id].stack, 12)) : 1 }));
      S._trade[key] = items;
    }
    return S._trade[key];
  }

  openTrade(n) {
    const S = this.S;
    const el = h('div.panel.trade');
    this.ui.openPanel('trade', el);
    const render = () => {
      clear(el);
      const money = S.inventory.count('money');
      const rel = S.relations.traders || 0;
      const disc = rel >= 40 ? 0.85 : rel <= -20 ? 1.3 : 1;
      const stock = this.stock(n);
      const buy = h('div.trade-list');
      for (const it of stock) {
        if (it.qty <= 0) continue;
        const price = Math.ceil(S.npcs.priceOf(it.id) * disc);
        buy.append(h('div.trade-row', this.ui.icon(it.id), h('div.trade-name', h('b', ITEMS[it.id].name), h('small', `Stok: ${it.qty}`)), h('span.price', `💰 ${price}`),
          button('Satın Al', () => { if (S.inventory.count('money') < price) { S.ui.toast('Yeterli paran yok.', 'warn'); return; } S.inventory.remove('money', price); S.giveLocal(it.id, 1); it.qty--; this.game.audio.play('pickup', { vol: 0.6 }); render(); }, money >= price ? 'small green' : 'small disabled')));
      }
      const sell = h('div.trade-list');
      S.inventory.slots.forEach((s, i) => {
        if (!s || s.id === 'money' || ITEMS[s.id].rarity === 'story') return;
        const price = Math.max(1, Math.floor(S.npcs.priceOf(s.id) * 0.45 / disc));
        sell.append(h('div.trade-row', this.ui.icon(s.id), h('div.trade-name', h('b', ITEMS[s.id].name), h('small', `x${s.qty}`)), h('span.price', `💰 ${price}`),
          button('Sat', () => { S.inventory.takeAt(i, 1); S.giveLocal('money', price); this.game.audio.play('pickup', { vol: 0.6 }); render(); }, 'small')));
      });
      el.append(h('div.panel-head', banner(`${n.def.name} — Takas`), h('div.money', `💰 ${money}`), h('button.close', { type: 'button', on: { click: () => this.ui.closePanel() } }, '✕')),
        h('div.trade-body', h('div.trade-col', h('h3', 'Satılık'), buy), h('div.trade-col', h('h3', 'Senin Eşyaların (Sat)'), sell)),
        h('div.hint', rel >= 40 ? 'Tüccarlarla iyi ilişkin sayesinde %15 indirim!' : 'Fiyatlar tüccarlarla ilişkine göre değişir.'));
    };
    render();
  }

  // ======================================================================= diyalog
  openDialog(d) {
    const el = h('div.panel.dialog');
    const choices = h('div.choices');
    (d.choices || [{ text: 'Tamam', onSelect: () => this.ui.closePanel() }]).forEach((c, i) => {
      choices.append(h('button.choice', { type: 'button', on: { click: () => { this.game.audio.play('click', { vol: 0.5 }); c.onSelect && c.onSelect(); } } }, h('span.num', String(i + 1)), c.text));
    });
    const initial = (d.speaker || '?').trim().charAt(0);
    el.append(h('div.dialog-head', h('div.dialog-avatar', initial), h('div.dialog-speaker', d.speaker || '')), h('p.dialog-text', d.text || ''), choices);
    this.ui.openPanel('dialog', el, { keys: (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= 9 && d.choices && d.choices[n - 1]) { d.choices[n - 1].onSelect(); return true; } return false; } });
  }

  closeDialog() { if (this.ui.panel && this.ui.panel.name === 'dialog') this.ui.closePanel(); }

  // ======================================================================= olay kartı
  openEvent(e) {
    const el = h('div.panel.event-card');
    const choices = h('div.choices');
    e.choices.forEach((c, i) => {
      const cost = c.cost ? ' (' + c.cost.map(([it, n]) => `${ITEMS[it].name} x${n}`).join(', ') + ')' : '';
      const b = h('button.choice' + (c.affordable === false ? '.disabled' : ''), { type: 'button', on: { click: () => { if (c.affordable === false) { this.S.ui.toast('Gerekli eşyalar yok.', 'warn'); return; } c.onSelect(); } } }, h('span.num', String(i + 1)), c.text + cost);
      choices.append(b);
    });
    el.append(
      e.img ? h('div.event-img', { style: { backgroundImage: `url(assets/img/events/${e.img}.jpg)` } }) : null,
      h('div.event-body', h('div.event-kicker', 'RASTGELE OLAY'), h('h2', e.title), h('p', e.text), choices));
    this.ui.openPanel('event', el, { modal: true, keys: (ev) => { const n = parseInt(ev.key, 10); if (n >= 1 && n <= e.choices.length) { e.choices[n - 1].onSelect(); return true; } return false; }, noEsc: true });
  }

  closeEvent() { if (this.ui.panel && this.ui.panel.name === 'event') this.ui.closePanel(); }

  // ======================================================================= inşa menüsü
  openBuildMenu() {
    const S = this.S;
    const el = h('div.panel.build-menu');
    this.ui.openPanel('build', el);
    const render = () => {
      clear(el);
      const side = h('div.side-list', Object.entries(BUILD_CATS).map(([k, c]) => h('button.side-item' + (k === this.buildCat ? '.active' : ''), { type: 'button', on: { click: () => { this.buildCat = k; render(); } } }, h('span', c.icon), c.name)));
      const grid = h('div.build-grid');
      const mul = S.build.costMul();
      for (const def of Object.values(BUILDABLES).filter((d) => d.cat === this.buildCat)) {
        const aff = S.build.canAfford(def);
        const cost = def.cost.map(([id, n]) => { const need = Math.max(1, Math.ceil(n * mul)); const have = S.inventory.count(id); return h('span.ing' + (have >= need ? '.ok' : '.miss'), this.ui.icon(id), `${have}/${need}`); });
        const tools = (def.tools || []).map((t) => h('span.tool' + (S.build.hasTool(t) ? '.ok' : '.miss'), toolName(t)));
        grid.append(h('div.build-card' + (aff.ok ? '' : '.locked'), { on: { click: () => { this.ui.closePanel(); S.build.startPlacing(def.id); } } },
          h('b', def.name), h('p', def.desc || ''), h('div.cost', cost), h('div.tools', tools),
          h('small', [def.score.def ? `🛡️+${def.score.def} ` : '', def.score.comfort ? `🛋️+${def.score.comfort} ` : '', def.score.util ? `⚙️+${def.score.util}` : ''].join(''))));
      }
      const projects = h('div.projects', h('h3', 'Özel Projeler'),
        h('p', `⚡ ${PROJECTS.generator.name}: ${PROJECTS.generator.desc} (Bahçedeki jeneratörün yanında E)`),
        h('p', `🕳️ ${PROJECTS.bunker.name}: ${PROJECTS.bunker.desc} (Arka bahçedeki kapak, şu an ${S.build.bunker.stage}/4)`),
        h('p', '🪟 Pencere/kapı güçlendirme: pencereye bakıp E basılı tut (2 tahta + 4 çivi).'));
      el.append(h('div.panel-head', banner('ÜS GELİŞTİRME'), h('div.base-lvl', `Üs Seviyesi ${S.build.baseLevel()} · 🛡️ ${S.build.defenseScore()}`), h('button.close', { type: 'button', on: { click: () => this.ui.closePanel() } }, '✕')),
        h('div.build-body', side, h('div.build-main', grid, projects)),
        h('div.hint', 'Bir yapı seç → yerleştir (sol tık) → çekiçle E basılı tutarak inşa et. Arkadaşlarınla birlikte daha hızlı.'));
    };
    render();
  }

  // ======================================================================= araç
  openVehicle(v) {
    const S = this.S;
    const el = h('div.panel.vehicle-panel');
    this.ui.openPanel('vehicle', el);
    const render = () => {
      clear(el);
      const ups = h('div.upgrade-list');
      for (const [k, up] of Object.entries(UPGRADES)) {
        const have = k !== 'paint' && k !== 'sticker' && v.upgrades[k];
        const cost = up.cost.map(([id, n]) => h('span.ing' + (S.inventory.has(id, n) ? '.ok' : '.miss'), this.ui.icon(id), `${S.inventory.count(id)}/${n}`));
        ups.append(h('div.upgrade-row' + (have ? '.have' : ''), h('div', h('b', up.name), h('small', up.desc)), h('div.cost', cost),
          have ? h('span.ok', '✔ Takılı') : button(k === 'paint' ? 'Boya' : 'Tak', () => { S.vehicles.applyUpgrade(v, k); setTimeout(render, 80); }, 'small green')));
      }
      el.append(h('div.panel-head', banner(`ARAÇ — ${v.def.name}`), h('button.close', { type: 'button', on: { click: () => this.ui.closePanel() } }, '✕')),
        h('div.vehicle-body',
          h('div.veh-stats',
            h('div.stat-line', h('span', '🔧 Sağlık'), bar(v.health, v.maxHealth, 'hp'), h('b', `%${Math.round(v.health / v.maxHealth * 100)}`)),
            h('div.stat-line', h('span', '⛽ Yakıt'), bar(v.fuel, v.maxFuel, 'fu'), h('b', `${Math.round(v.fuel)}/${Math.round(v.maxFuel)} L`)),
            h('div.stat-line', h('span', '🏎️ Azami hız'), h('b', `${Math.round(v.def.maxSpeed * 3.6 * (v.upgrades.engine ? 1.15 : 1))} km/s`)),
            h('div.stat-line', h('span', '📦 Bagaj'), h('b', `${v.trunkSize} yuva`)),
            h('div.stat-line', h('span', '💺 Koltuk'), h('b', String(v.def.seats))),
            v.broken ? h('p.why', 'Araç bozuk: ' + (v.def.needs || []).map(([id, n]) => `${ITEMS[id].name} x${n}`).join(', ')) : null),
          ups));
    };
    render();
  }

  // ======================================================================= takım
  openTeam() {
    const S = this.S;
    const net = this.game.net;
    const el = h('div.panel.team-panel');
    this.ui.openPanel('team', el);
    const render = () => {
      clear(el);
      const rows = h('div.team-list');
      for (const m of S.teamList()) {
        const d = m.isLocal ? 0 : Math.round(dist(m.pos.x, m.pos.z, S.local.pos.x, S.local.pos.z));
        const orders = m.isBot ? h('div.orders', Object.entries(S.bots.orders()).map(([k, n]) => button(n, () => { S.act('bot_order', { id: m.id, order: k }); setTimeout(render, 50); }, 'small' + ((S.bots.byId(m.id) || {}).order === k ? ' active' : '')))) : null;
        const kick = net.isHost && !m.isLocal && !m.isBot ? button('Odadan At', () => this.ui.confirm(`${m.name} odadan atılsın mı?`, () => net.kick(m.id)), 'small red') : null;
        rows.append(h('div.team-card' + (m.downed ? '.downed' : ''), { style: { '--c': CHARACTERS[m.charId]?.color } },
          portrait(m.charId), h('div.team-card-info', h('b', `${m.name}${m.isLocal ? ' (sen)' : ''}${m.isBot ? ' 🤖' : ''}`), h('small', `${CHARACTERS[m.charId]?.role || ''} · ${m.isLocal ? 'burada' : d + ' m uzakta'}${m.downed ? ' · YERDE!' : ''}`),
            h('div.mini-bars', h('span', '❤️'), bar(m.health, 1, 'hp'), h('span', '🍖'), bar(m.hunger, 1, 'hu'), h('span', '💧'), bar(m.thirst, 1, 'th'))), orders, kick));
      }
      const mp = net.active ? h('div.mp-box',
        h('h3', `Oda: ${net.room ? net.room.code : ''}`), h('div.invite', h('input', { value: net.inviteLink(), readOnly: true }), button('Kopyala', () => { navigator.clipboard && navigator.clipboard.writeText(net.inviteLink()); this.S.ui.toast('Davet bağlantısı kopyalandı.', 'good'); }, 'small')),
        h('div.voice-box', h('span', '🎙️ Sesli sohbet: '), net.voice.enabled ? h('b', `Açık (${net.voice.openMic ? 'açık mikrofon' : `bas-konuş: ${this.game.input.label('voice')}`})`) : h('b', 'Kapalı'),
          net.voice.enabled ? button(net.voice.openMic ? 'Bas-konuşa geç' : 'Açık mikrofona geç', () => { net.voice.openMic = !net.voice.openMic; render(); }, 'small') : button('Mikrofonu Aç', async () => { const ok = await net.voice.enable(); if (!ok) this.S.ui.toast(net.voice.error, 'warn'); render(); }, 'small green'),
          net.voice.enabled ? button('Kapat', () => { net.voice.disable(); render(); }, 'small') : null)) : h('div.mp-box', h('p.muted', 'Tek oyunculu oyun. Yapay zekâ takım arkadaşlarına emir verebilirsin.'));
      el.append(h('div.panel-head', banner('TAKIM'), h('button.close', { type: 'button', on: { click: () => this.ui.closePanel() } }, '✕')), rows, mp);
    };
    render();
  }

  // ======================================================================= duraklatma
  openPause() {
    const S = this.S;
    const net = this.game.net;
    const el = h('div.panel.pause');
    if (!net.active) S.paused = true;
    this.ui.openPanel('pause', el, { onClose: () => { if (this.S) this.S.paused = false; } });
    const saveRow = S.isHost ? h('div.save-row', h('span', '💾 Kaydet:'), ['1', '2', '3'].map((slot) => button(SLOT_NAMES[slot], () => { S.saves.save(slot); }, 'small'))) : h('p.muted', 'Kayıt oda sahibi tarafından alınır.');
    el.append(
      h('div.pause-logo', h('span', 'KIYAMETTEN'), h('span', 'ÖNCE')),
      h('div.pause-info', `Gün ${S.time.day} · ${S.region ? S.region.name : 'Yabani alan'}${net.active ? ` · Oda ${net.room ? net.room.code : ''}` : ''}${!net.active ? ' · Duraklatıldı' : ''}`),
      h('div.pause-buttons',
        button('Devam Et', () => this.ui.closePanel(), 'big orange'),
        saveRow,
        button('Ayarlar', () => this.ui.menus.openSettings(true), 'big'),
        button('Nasıl Oynanır?', () => this.ui.menus.openHowTo(true), 'big'),
        net.active ? button('Takım / Davet', () => this.openTeam(), 'big') : null,
        button('Ana Menüye Dön', () => this.ui.confirm(S.isHost ? 'Ana menüye dönülsün mü? Kaydedilmemiş ilerleme kaybolur.' + (net.active ? ' Oda kapanacak.' : '') : 'Odadan ayrılmak istiyor musun?', () => { this.ui.closePanel(); this.game.endSession(true); }), 'big brown')));
  }

  // ======================================================================= not
  openNote(n, html = false) {
    const el = h('div.panel.note');
    const text = h('div.note-text');
    if (html) text.innerHTML = n.text; else text.textContent = n.text;
    el.append(h('div.note-paper', h('h2', n.title), n.src ? h('div.note-src', n.src) : null, text), button('Kapat', () => this.ui.closePanel(), 'brown'));
    this.ui.openPanel('note', el);
    this.game.audio.play('pickup', { vol: 0.4, rate: 0.7 });
  }

  // ======================================================================= ifade çarkı
  openEmotes() {
    const S = this.S;
    const el = h('div.panel.emotes');
    const list = [['wave', '👋', 'El salla'], ['cheer', '🙌', 'Sevin'], ['dance', '💃', 'Dans'], ['laugh', '😂', 'Gül'], ['point', '👉', 'Göster']];
    const wheel = h('div.wheel');
    list.forEach(([k, ic, n], i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      wheel.append(h('button.wheel-item', { type: 'button', style: { left: `calc(50% + ${Math.cos(a) * 110}px)`, top: `calc(50% + ${Math.sin(a) * 110}px)` }, on: { click: () => { this.ui.closePanel(); S.local.avatar.play(k, 2.4); S.local.emote = k === 'point' || k === 'laugh' ? null : k; clearTimeout(this._em); this._em = setTimeout(() => { if (this.S) this.S.local.emote = null; }, 2600); } } }, h('span', ic), h('small', n)));
    });
    wheel.append(h('div.wheel-center', 'İfade'));
    el.append(wheel);
    this.ui.openPanel('emotes', el);
  }

  // ======================================================================= sonuç ekranı
  showResults(e) {
    const E = ENDINGS[e.ending] || { name: 'Son', icon: '🏁', desc: '' };
    const win = e.survivors > 0;
    const el = h('div.results' + (win ? '.win' : '.lose'),
      h('div.results-kicker', win ? 'HAYATTA KALDINIZ' : 'SON IŞIK HERKESİ YUTTU'),
      h('h1', `${E.icon} ${E.name}`),
      h('p.results-reason', `${E.desc} ${{ escaped: win ? 'Takımınız kaçış planını başarıyla tamamladı.' : '', dawn: win ? 'Şafak söktü — Son Işık geçti ve siz hâlâ ayaktasınız.' : 'Şafak söktü ama kimse ayakta kalamadı.' }[e.reason] || ''}`),
      h('div.rating', h('span', 'Derece'), h('b.rank-' + e.rating, e.rating), h('small', `${e.score} puan`)),
      e.epilogue && e.epilogue.length ? h('div.epilogue', h('h3', 'Sonrası'), e.epilogue.map((c) => h('p', c))) : null,
      h('div.results-grid',
        ...[['Hayatta kalan', `${e.survivors}/${e.total}`], ['Geçen gün', e.days], ['Üs seviyesi', e.baseLevel], ['Öldürülen zombi', e.kills], ['Aranan yer', e.searched], ['Toplanan kaynak', e.resources], ['Tamamlanan görev', e.quests], ['Kurtarılan kişi', e.rescued], ['İnşa edilen yapı', e.built], ['Yere düşme', e.deaths]].map(([k, v]) => h('div.res-cell', h('small', k), h('b', String(v))))),
      e.vehicles && e.vehicles.length ? h('p.muted', 'Kullanılan araçlar: ' + e.vehicles.join(', ')) : null,
      e.choices && e.choices.length ? h('div.choices-log', h('h3', 'Önemli Kararlar'), e.choices.map((c) => h('div', '• ' + c))) : null,
      h('div.results-buttons', button('Ana Menü', () => { el.remove(); this.game.endSession(true); }, 'big orange')));
    this.ui.overlay.append(el);
    this.game.input.releaseLock();
  }
}
