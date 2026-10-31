// Menü ekranları: ana menü (tahta tabelalar), tek oyuncu, arkadaşlarla oyna (oda kur/katıl/liste),
// oda lobisi, karakterler, özelleştirme (3B vitrin), ayarlar, nasıl oynanır, krediler.
import { h, clear, portrait, bar, button, banner } from './dom.js';
import { Settings, DEFAULT_BINDINGS, ACTION_LABELS } from '../core/Settings.js';
import { keyLabel } from '../core/Input.js';
import { CHARACTERS, CHARACTER_IDS, OPTIONS, PALETTES, COLLECTIONS, BASE_FACES, OUTFIT_SETS, OUTFIT_NAMES } from '../entities/CharacterFactory.js';
import { SaveSystem, SLOT_NAMES } from '../systems/SaveSystem.js';
import { MAX_PLAYERS } from '../net/Net.js';
import { DIFFICULTY } from '../Session.js';

const DAY_OPTS = [12, 24, 36, 48];

function charStats4(c) {
  const s = c.stats;
  return [['❤️', s.health / 130, 'Sağlık'], ['⚡', s.speed / 1.15 * (s.stamina / 115), 'Hız & Dayanıklılık'], ['⚔️', (s.melee + s.aim) / 2.6, 'Savaş'], ['★', Math.max(s.repair, s.heal, s.build, s.hunt, s.lockpick) / 2, 'Uzmanlık']];
}

export class Menus {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.layer = ui.menuLayer;
    this.opts = { difficulty: 'normal', dayMinutes: Settings.get('gameplay.dayMinutes') || 24, ai: 0 };
    this.mp = { difficulty: 'normal', dayMinutes: Settings.get('gameplay.dayMinutes') || 24, maxPlayers: MAX_PLAYERS, aiFill: 0, public: true, local: false, slot: '' };
    this.game.net.onChange(() => { if (this.screen === 'lobby') this.renderLobby(); });
  }

  get net() { return this.game.net; }
  profile() { const p = Settings.get('player'); return { name: p.name, charId: CHARACTERS[p.characterId] ? p.characterId : 'mert', look: (p.appearance || {})[p.characterId] || {} }; }

  show(el, name) {
    this.screen = name;
    clear(this.layer);
    this.layer.appendChild(el);
    this.layer.classList.remove('hidden');
    if (this.game.menu) { if (name === 'customize') this.game.menu.showcase(this.lookFor(this.custChar)); else this.game.menu.endShowcase(); }
  }

  hide() { this.screen = null; clear(this.layer); this.layer.classList.add('hidden'); if (this.game.menu) this.game.menu.endShowcase(); }

  back() { this.game.audio.play('click', { vol: 0.5 }); this.showMain(); }

  // ======================================================================= ANA MENÜ
  showMain() {
    const p = this.profile();
    const hasAuto = !!SaveSystem.list().find((s) => s.slot === 'auto' && s.meta);
    const plank = (label, fn, cls = '') => h('button.plank' + (cls ? '.' + cls : ''), { type: 'button', on: { click: () => { this.game.audio.play('click', { vol: 0.6 }); fn(); }, mouseenter: () => this.game.audio.play('hover', { vol: 0.4 }) } }, h('span', label));
    const nameIn = h('input.name-input', { value: p.name, maxlength: 16, title: 'Oyuncu adın' });
    nameIn.addEventListener('change', () => Settings.set('player.name', nameIn.value.trim().slice(0, 16) || p.name));
    const el = h('div.main-menu',
      h('div.mm-logo', h('div.logo-main', h('span', 'KIYAMETTEN'), h('span', 'ÖNCE')), h('div.logo-tag', '30 GÜN KALDI')),
      h('div.signpost', h('div.post'),
        hasAuto ? plank('DEVAM ET', () => this.loadSlot('auto'), 'gold') : null,
        plank('TEK OYNA', () => this.openSingle()),
        plank('ARKADAŞLARLA OYNA', () => this.openMulti()),
        plank('KARAKTERLER', () => this.openCharacters()),
        plank('ÖZELLEŞTİRME', () => this.openCustomize()),
        plank('AYARLAR', () => this.openSettings()),
        plank('NASIL OYNANIR?', () => this.openHowTo()),
        plank('KREDİLER', () => this.openCredits()),
        plank('OYUNDAN ÇIK', () => this.quit())),
      h('div.mm-player', portrait(p.charId), h('div', h('small', 'Oyuncu adı'), nameIn, h('small', `Karakter: ${CHARACTERS[p.charId].name} — ${CHARACTERS[p.charId].role}`))),
      h('div.mm-tagline', '30 günün kaldı. Arkadaşlarını topla. Hazırlan. Hayatta kal.'),
      h('div.mm-footer', 'Web sürümü 1.0 · 2–6 oyunculu co-op · Ücretsiz CC0 varlıklarla yapıldı'));
    this.show(el, 'main');
  }

  quit() {
    const el = h('div.screen.quit', h('div.mm-logo', h('div.logo-main', h('span', 'GÖRÜŞÜRÜZ')), h('div.logo-tag', 'HAYATTA KAL')), h('p', 'Oyunu kapatmak için bu sekmeyi kapatabilirsin.'), button('Ana Menüye Dön', () => this.showMain(), 'orange'));
    this.show(el, 'quit');
    try { window.close(); } catch { /* yoksay */ }
  }

  // ======================================================================= ortak: karakter kartları
  charCards(selected, onPick, taken = {}) {
    return h('div.char-cards', CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      const who = taken[id];
      const card = h('button.char-card' + (id === selected ? '.selected' : '') + (who ? '.taken' : ''), { type: 'button', style: { '--c': c.color }, on: { click: () => { if (!who) onPick(id); } } },
        h('div.cc-img', portrait(id, 'card')),
        h('div.cc-name', c.name), h('div.cc-role', c.role),
        h('div.cc-stats', charStats4(c).map(([ic, v, t]) => h('div.cc-stat', { title: t }, h('span', ic), bar(Math.min(1, v), 1, 'cc')))),
        who ? h('div.cc-taken', who) : null);
      return card;
    }));
  }

  choice(label, opts, cur, onSet) {
    return h('div.opt-row', h('span.opt-label', label), h('div.seg', opts.map(([v, n]) => h('button.seg-btn' + (v === cur ? '.active' : ''), { type: 'button', on: { click: () => onSet(v) } }, n))));
  }

  // ======================================================================= TEK OYNA
  openSingle() {
    const p = this.profile();
    const o = this.opts;
    const render = () => {
      const saves = SaveSystem.list().filter((s) => s.meta);
      const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      fileIn.addEventListener('change', async () => { const f = fileIn.files[0]; if (!f) return; try { await SaveSystem.importFile(f, '3'); this.ui.toast('Kayıt içe aktarıldı (Kayıt 3).', 'good'); render(); } catch (e) { this.ui.alert('İçe aktarılamadı: ' + e.message); } });
      const el = h('div.screen.single',
        h('div.screen-head', banner('TEK OYNA'), button('← Geri', () => this.back(), 'ghost')),
        h('h3', 'Karakterini seç'),
        this.charCards(this.profile().charId, (id) => { Settings.set('player.characterId', id); render(); }),
        h('div.single-bottom',
          h('div.opts',
            this.choice('Zorluk', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), o.difficulty, (v) => { o.difficulty = v; render(); }),
            this.choice('Bir gün', DAY_OPTS.map((d) => [d, `${d} dk`]), o.dayMinutes, (v) => { o.dayMinutes = v; Settings.set('gameplay.dayMinutes', v); render(); }),
            this.choice('Yapay zekâ arkadaş', [0, 1, 2, 3, 4, 5].map((n) => [n, String(n)]), o.ai, (v) => { o.ai = v; render(); }),
            h('p.muted', `Zorluk: ${DIFFICULTY[o.difficulty].name} — zombi yoğunluğu x${DIFFICULTY[o.difficulty].zombies}, hasar x${DIFFICULTY[o.difficulty].dmg}. Toplam süre ≈ ${Math.round(o.dayMinutes * 30 / 60)} saat.`),
            button('OYUNA BAŞLA', () => this.startSingle(), 'big orange')),
          h('div.saves', h('h3', 'Kayıtlı Oyunlar'),
            saves.length ? saves.map((s) => h('div.save-row',
              h('div', h('b', s.name), h('small', `${s.meta.day}. gün ${String(Math.floor(s.meta.minute / 60)).padStart(2, '0')}:${String(s.meta.minute % 60).padStart(2, '0')} · ${CHARACTERS[s.meta.charId]?.name || ''}${s.meta.multiplayer ? ` · ${s.meta.players} oyunculu` : ''} · ${new Date(s.meta.savedAt).toLocaleString('tr-TR')}`)),
              button('Yükle', () => this.loadSlot(s.slot), 'small green'), button('⤓', () => SaveSystem.exportFile(s.slot), 'small'), button('🗑', () => this.ui.confirm(`${s.name} silinsin mi?`, () => { SaveSystem.remove(s.slot); render(); }), 'small red'))) : h('p.muted', 'Henüz kayıt yok. Oyun her gün otomatik kaydedilir; Esc menüsünden de kaydedebilirsin.'),
            button('Dosyadan içe aktar…', () => fileIn.click(), 'small'), fileIn)));
      this.show(el, 'single');
    };
    void p;
    render();
  }

  async startSingle() {
    const p = this.profile();
    this.hide();
    await this.game.startSession({ mode: 'single', difficulty: this.opts.difficulty, dayMinutes: this.opts.dayMinutes, aiTeammates: this.opts.ai, local: p, token: this.net.token });
  }

  async loadSlot(slot) {
    const data = SaveSystem.read(slot);
    if (!data) { this.ui.alert('Kayıt okunamadı.'); return; }
    const me = data.players[data.hostToken] || Object.values(data.players)[0];
    this.hide();
    await this.game.startSession({ mode: 'single', difficulty: data.cfg.difficulty, dayMinutes: data.cfg.dayMinutes, aiTeammates: 0, local: { name: me.name, charId: me.charId, look: me.look }, token: data.hostToken, save: data, seed: data.seed });
  }

  // ======================================================================= ARKADAŞLARLA OYNA
  openMulti(prefill = '', local = false) {
    const m = this.mp;
    const status = h('div.mp-status');
    const codeIn = h('input.code-input', { value: prefill, maxlength: 8, placeholder: 'ODA KODU', autocomplete: 'off' });
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    const localJoin = h('input', { type: 'checkbox', checked: local });
    const roomsEl = h('div.room-list');
    const refreshRooms = () => {
      clear(roomsEl);
      const { local: lr, recent } = this.net.listRooms();
      if (!lr.length && !recent.length) roomsEl.append(h('p.muted', 'Görünür oda yok. Arkadaşından oda kodunu ya da davet bağlantısını iste.'));
      for (const r of lr) roomsEl.append(h('div.room-row', h('div', h('b', `${r.code}`), h('small', `${r.host || 'Oda'} · ${r.count}/${r.max} oyuncu${r.inGame ? ` · ${r.day}. gün (oyunda)` : ' · lobide'} · ${r.local ? 'yerel' : 'çevrimiçi'}`)), button('Katıl', () => this.join(r.code, r.local, status), 'small green')));
      if (recent.length) roomsEl.append(h('div.side-head', 'Son girilen odalar'));
      for (const r of recent) roomsEl.append(h('div.room-row', h('div', h('b', r.code), h('small', `${new Date(r.at).toLocaleString('tr-TR')} · ${r.local ? 'yerel' : 'çevrimiçi'}`)), button('Katıl', () => this.join(r.code, r.local, status), 'small')));
    };
    const saves = SaveSystem.list().filter((s) => s.meta);
    const render = () => {
      const el = h('div.screen.multi',
        h('div.screen-head', banner('ARKADAŞLARLA OYNA'), button('← Geri', () => this.back(), 'ghost')),
        h('div.multi-cols',
          h('div.mcol', h('h3', '🏠 Oda Kur'),
            this.choice('Zorluk', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), m.difficulty, (v) => { m.difficulty = v; render(); }),
            this.choice('Bir gün', DAY_OPTS.map((d) => [d, `${d} dk`]), m.dayMinutes, (v) => { m.dayMinutes = v; render(); }),
            this.choice('En fazla', [2, 3, 4, 5, 6].map((n) => [n, `${n}`]), m.maxPlayers, (v) => { m.maxPlayers = v; render(); }),
            this.choice('Boşlara YZ', [0, 1, 2, 3, 4].map((n) => [n, String(n)]), m.aiFill, (v) => { m.aiFill = v; render(); }),
            this.choice('Görünürlük', [[true, 'Herkese açık'], [false, 'Özel']], m.public, (v) => { m.public = v; render(); }),
            this.choice('Bağlantı', [[false, 'Çevrimiçi (P2P)'], [true, 'Yerel test']], m.local, (v) => { m.local = v; render(); }),
            h('div.opt-row', h('span.opt-label', 'Kayıtlı oyun'), h('select', { on: { change: (e) => { m.slot = e.target.value; } } }, h('option', { value: '' }, 'Yeni oyun'), saves.map((s) => h('option', { value: s.slot, selected: m.slot === s.slot }, `${s.name} — ${s.meta.day}. gün`)))),
            button('ODA KUR', () => this.host(status), 'big orange')),
          h('div.mcol', h('h3', '🔑 Odaya Katıl'), h('p.muted', 'Arkadaşının verdiği 6 haneli kodu gir ya da davet bağlantısına tıkla.'), codeIn,
            h('label.check', localJoin, ' Yerel test odası (aynı tarayıcı)'),
            button('KATIL', () => this.join(codeIn.value, localJoin.checked, status), 'big green'), status),
          h('div.mcol', h('h3', '📋 Açık Odalar'), roomsEl, button('Yenile', () => refreshRooms(), 'small'))),
        h('p.muted.mp-note', 'Çevrimiçi odalar WebRTC ile doğrudan (eşler arası) bağlanır; oda sahibi dünyayı yönetir (host). "Yerel test" aynı tarayıcıdaki sekmeler arasında çalışır. Sesli sohbet için lobide mikrofonu aç; oyunda V tuşuna basılı tutarak konuş.'));
      this.show(el, 'multi');
      refreshRooms();
      setTimeout(refreshRooms, 600);
    };
    render();
  }

  openJoin(code, local = /yerel=1/.test(location.hash)) {
    this.openMulti(code, local);
    const status = this.layer.querySelector('.mp-status');
    if (status) status.textContent = `Davet: ${code} — Katıl'a bas.`;
  }

  async host(status) {
    const m = this.mp;
    status.textContent = 'Oda kuruluyor…';
    try {
      const save = m.slot ? SaveSystem.read(m.slot) : null;
      await this.net.host({ local: m.local, settings: { difficulty: save ? save.cfg.difficulty : m.difficulty, dayMinutes: save ? save.cfg.dayMinutes : m.dayMinutes, maxPlayers: m.maxPlayers, aiFill: m.aiFill, public: m.public }, save });
      this.openLobby();
    } catch (e) {
      console.error(e);
      status.textContent = '❌ ' + (e.message || 'Oda kurulamadı.') + (m.local ? '' : ' (İnternet bağlantını kontrol et ya da "Yerel test" seç.)');
    }
  }

  async join(code, local, status) {
    code = String(code || '').toUpperCase().trim();
    if (code.length < 4) { status.textContent = 'Geçerli bir oda kodu gir.'; return; }
    status.textContent = `${code} odasına bağlanılıyor…`;
    try {
      await this.net.join(code, { local });
      if (this.net.inGame || this.screen !== 'multi') return; // oyun sürüyorsa doğrudan katılır
      this.openLobby();
    } catch (e) {
      status.textContent = '❌ ' + (e.message || 'Bağlanılamadı.');
    }
  }

  // ======================================================================= LOBİ
  openLobby() { this.screen = 'lobby'; this.renderLobby(); }

  renderLobby() {
    const net = this.net;
    const r = net.room;
    if (!r) { this.openMulti(); return; }
    const me = r.players.find((p) => p.id === net.myId) || r.players[0];
    const taken = {};
    for (const p of r.players) if (p.id !== me.id) taken[p.charId] = p.name;
    const slots = [];
    for (let i = 0; i < r.settings.maxPlayers; i++) {
      const p = r.players[i];
      if (!p) { slots.push(h('div.lobby-slot.empty', h('span', i < r.players.length + (r.settings.aiFill || 0) ? '🤖 Yapay zekâ' : 'Boş yer — davet et'))); continue; }
      const c = CHARACTERS[p.charId];
      slots.push(h('div.lobby-slot' + (p.ready ? '.ready' : '') + (p.online === false ? '.offline' : ''), { style: { '--c': c.color } },
        portrait(p.charId), h('div', h('b', `${p.isHost ? '👑 ' : ''}${p.name}${p.id === net.myId ? ' (sen)' : ''}`), h('small', `${c.name} — ${c.role}`)),
        h('span.ready-tag', p.online === false ? 'bağlantı koptu' : p.ready ? '✔ Hazır' : '⏳ Bekliyor'),
        net.isHost && !p.isHost ? button('At', () => net.kick(p.id), 'small red') : null));
    }
    const s = r.settings;
    const settingsEl = net.isHost
      ? h('div.opts',
        this.choice('Zorluk', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), s.difficulty, (v) => net.updateSettings({ difficulty: v })),
        this.choice('Bir gün', DAY_OPTS.map((d) => [d, `${d} dk`]), s.dayMinutes, (v) => net.updateSettings({ dayMinutes: v })),
        this.choice('Boşlara YZ', [0, 1, 2, 3, 4].map((n) => [n, String(n)]), s.aiFill || 0, (v) => net.updateSettings({ aiFill: v })))
      : h('div.opts', h('p', `Zorluk: ${DIFFICULTY[s.difficulty].name} · Bir gün: ${s.dayMinutes} dk · YZ: ${s.aiFill || 0}`));
    const voice = net.transport && net.transport.kind === 'peer'
      ? (net.voice.enabled ? h('div.voice-box', '🎙️ Mikrofon açık (oyunda V: bas-konuş)', button('Kapat', () => { net.voice.disable(); this.renderLobby(); }, 'small')) : button('🎙️ Sesli sohbeti aç', async () => { const ok = await net.voice.enable(); if (!ok) this.ui.toast(net.voice.error, 'warn'); this.renderLobby(); }, 'small'))
      : h('small.muted', 'Sesli sohbet yalnızca çevrimiçi odalarda.');
    const link = net.inviteLink();
    const el = h('div.screen.lobby',
      h('div.screen-head', banner('ODA LOBİSİ'), button('← Odadan Ayrıl', () => { net.leave(); this.openMulti(); }, 'ghost')),
      h('div.lobby-code', h('small', 'ODA KODU'), h('b', r.code), button('Kodu Kopyala', () => { navigator.clipboard && navigator.clipboard.writeText(r.code); this.ui.toast('Kod kopyalandı.', 'good'); }, 'small'), button('Davet Bağlantısı', () => { navigator.clipboard && navigator.clipboard.writeText(link); this.ui.toast('Davet bağlantısı kopyalandı: ' + link, 'good', 5); }, 'small'), r.saveName ? h('span.save-tag', '💾 ' + r.saveName) : null),
      h('div.lobby-cols',
        h('div.lobby-players', h('h3', `Oyuncular ${r.players.length}/${s.maxPlayers}`), slots, voice),
        h('div.lobby-right', h('h3', 'Karakterin'),
          this.charCards(me.charId, (id) => { Settings.set('player.characterId', id); net.setLobby({ charId: id, look: (Settings.get('player.appearance') || {})[id] || {} }); }, taken),
          settingsEl,
          h('div.lobby-actions',
            net.isHost ? button(net.canStart() ? 'OYUNU BAŞLAT' : 'Herkesin hazır olmasını bekle…', () => { if (net.canStart()) { this.hide(); net.startGame(); } }, 'big orange' + (net.canStart() ? '' : ' disabled')) : button(me.ready ? 'HAZIR DEĞİLİM' : 'HAZIRIM', () => net.setLobby({ ready: !me.ready }), me.ready ? 'big' : 'big green')))));
    this.show(el, 'lobby');
  }

  // ======================================================================= KARAKTERLER
  openCharacters() {
    const render = () => {
      const sel = this.profile().charId;
      const c = CHARACTERS[sel];
      const el = h('div.screen.characters',
        h('div.screen-head', banner('KARAKTER SEÇİMİ'), button('← Geri', () => this.back(), 'ghost')),
        this.charCards(sel, (id) => { Settings.set('player.characterId', id); render(); }),
        h('div.char-detail', { style: { '--c': c.color } },
          h('div', h('h2', `${c.name} — ${c.role}`), h('p', c.bio), h('ul.perks', c.perks.map((x) => h('li', x)))),
          h('div.cd-start', h('h3', 'Başlangıç eşyaları'), h('div.start-items', c.start.map(([id, n]) => h('span.start-item', this.ui.icon(id), ` x${n}`)))),
          h('div.cd-actions', button('Özelleştir', () => { this.custChar = sel; this.openCustomize(); }, 'orange'), button('Tek Oyna', () => this.openSingle(), 'green'))));
      this.show(el, 'characters');
    };
    render();
  }

  // ======================================================================= ÖZELLEŞTİRME
  lookFor(charId) {
    const c = CHARACTERS[charId] || CHARACTERS.mert;
    const ov = (Settings.get('player.appearance') || {})[charId] || {};
    const look = { ...c.look, ...ov, top: { ...c.look.top, ...(ov.top || {}) }, pants: { ...c.look.pants, ...(ov.pants || {}) } };
    if (c.look.outfit || ov.outfit) look.outfit = { ...(c.look.outfit || {}), ...(ov.outfit || {}) };
    return look;
  }

  saveLook(charId, look) {
    const all = { ...(Settings.get('player.appearance') || {}) };
    all[charId] = look;
    Settings.set('player.appearance', all);
    if (this.game.menu) this.game.menu.showcase(this.lookFor(charId));
  }

  openCustomize() {
    const gender = (look) => (/female/.test(look.base || '') ? 'women' : 'men');
    this.custChar = this.custChar || this.profile().charId;
    this.custTab = this.custTab || 'collections';
    const render = () => {
      const id = this.custChar;
      const look = this.lookFor(id);
      const set = (patch) => this.saveLook(id, { ...((Settings.get('player.appearance') || {})[id] || {}), ...patch });
      const setNested = (k, patch) => set({ [k]: { ...look[k], ...patch } });
      const swatches = (pal, cur, fn) => h('div.swatches', pal.map((col) => h('button.sw' + (col === cur ? '.active' : ''), { type: 'button', style: { background: col }, title: col, on: { click: () => { fn(col); render(); } } })));
      const sel = (label, opts, cur, fn) => h('div.opt-row', h('span.opt-label', label), h('select', { on: { change: (e) => { fn(e.target.value); render(); } } }, Object.entries(opts).map(([k, n]) => h('option', { value: k, selected: k === cur }, n))));
      const tabs = [['collections', 'Koleksiyonlar'], ['face', 'Yüz & Saç'], ['clothes', 'Kıyafet'], ['gear', 'Aksesuar']];
      let body;
      if (this.custTab === 'collections') {
        body = h('div.cust-body', h('p.muted', 'Hazır kıyafet koleksiyonları (karakterin yüzü ve saçı korunur):'),
          h('div.collections', Object.entries(COLLECTIONS).map(([name, c]) => button(name, () => { set({ ...c, top: { ...c.top }, pants: { ...c.pants } }); render(); }, 'coll'))),
          button('Varsayılana Dön', () => { const all = { ...(Settings.get('player.appearance') || {}) }; delete all[id]; Settings.set('player.appearance', all); if (this.game.menu) this.game.menu.showcase(this.lookFor(id)); render(); }, 'small'));
      } else if (this.custTab === 'face') {
        body = h('div.cust-body',
          sel('Beden', BASE_FACES, /female/.test(look.base || '') ? 'female' : 'male', (v) => {
            // modüler kıyafet setleri cinsiyete göre farklıdır: yeni bedenin varsayılan setine geç
            const g = /female/.test(v) ? 'women' : 'men';
            set(look.outfit ? { base: v, outfit: { head: OUTFIT_SETS[g].head[0], body: OUTFIT_SETS[g].body[0], legs: OUTFIT_SETS[g].body[0], feet: OUTFIT_SETS[g].body[0] } } : { base: v });
          }),
          h('div.opt-label', 'Ten rengi'), swatches(PALETTES.skin, look.skin, (v) => set({ skin: v })),
          look.outfit
            ? sel('Kafa / saç', Object.fromEntries(OUTFIT_SETS[gender(look)].head.map((k) => [k, OUTFIT_NAMES[k] || k])), look.outfit.head, (v) => set({ outfit: { ...look.outfit, head: v } }))
            : sel('Saç modeli', OPTIONS.hairStyle, look.hairStyle, (v) => set({ hairStyle: v })),
          h('div.opt-label', 'Saç rengi'), swatches(PALETTES.hair, look.hairColor, (v) => set({ hairColor: v })),
          sel('Sakal', OPTIONS.beard, look.beard || 'none', (v) => set({ beard: v })),
          sel('Gözlük', OPTIONS.glasses, look.glasses || 'none', (v) => set({ glasses: v })),
          h('div.opt-row', h('span.opt-label', 'Kir / yıpranma'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: look.dirt || 0, on: { change: (e) => { set({ dirt: parseFloat(e.target.value) }); render(); } } })));
      } else if (this.custTab === 'clothes' && look.outfit) {
        const G = OUTFIT_SETS[gender(look)];
        const names = Object.fromEntries(G.body.map((k) => [k, OUTFIT_NAMES[k] || k]));
        const orig = (label, fn) => button(label, () => { fn(); render(); }, 'small ghost');
        body = h('div.cust-body',
          sel('Üst', names, look.outfit.body, (v) => set({ outfit: { ...look.outfit, body: v } })),
          h('div.opt-label', 'Üst rengi'), swatches(PALETTES.cloth, look.top.color, (v) => setNested('top', { color: v })), orig('Özgün renk', () => setNested('top', { color: null })),
          sel('Alt', names, look.outfit.legs || look.outfit.body, (v) => set({ outfit: { ...look.outfit, legs: v } })),
          h('div.opt-label', 'Alt rengi'), swatches(PALETTES.cloth, look.pants.color, (v) => setNested('pants', { color: v })), orig('Özgün renk', () => setNested('pants', { color: null })),
          sel('Ayakkabı', names, look.outfit.feet || look.outfit.body, (v) => set({ outfit: { ...look.outfit, feet: v } })),
          h('div.opt-label', 'Ayakkabı rengi'), swatches(PALETTES.cloth, look.shoes, (v) => set({ shoes: v })), orig('Özgün renk', () => set({ shoes: null })));
      } else if (this.custTab === 'clothes') {
        body = h('div.cust-body',
          sel('Üst', OPTIONS.topStyle, look.top.style, (v) => setNested('top', { style: v })),
          h('div.opt-label', 'Üst rengi'), swatches(PALETTES.cloth, look.top.color, (v) => setNested('top', { color: v })),
          h('div.opt-label', 'İkinci renk'), swatches(PALETTES.cloth, look.top.color2, (v) => setNested('top', { color2: v })),
          sel('Alt', OPTIONS.pantsStyle, look.pants.style, (v) => setNested('pants', { style: v })),
          h('div.opt-label', 'Alt rengi'), swatches(PALETTES.cloth, look.pants.color, (v) => setNested('pants', { color: v })),
          h('div.opt-label', 'Ayakkabı'), swatches(PALETTES.cloth, look.shoes, (v) => set({ shoes: v })));
      } else {
        body = h('div.cust-body',
          sel('Şapka', OPTIONS.hat, look.hat || 'none', (v) => set({ hat: v })),
          h('div.opt-label', 'Şapka rengi'), swatches(PALETTES.cloth, look.hatColor, (v) => set({ hatColor: v })),
          sel('Çanta', OPTIONS.backpack, look.backpack || 'none', (v) => set({ backpack: v })),
          h('div.opt-label', 'Çanta rengi'), swatches(PALETTES.cloth, look.backpackColor, (v) => set({ backpackColor: v })),
          sel('Eldiven', OPTIONS.gloves, look.gloves || 'none', (v) => set({ gloves: v })),
          sel('Aksesuar', OPTIONS.accessory, look.accessory || 'none', (v) => set({ accessory: v })));
      }
      const el = h('div.screen.customize',
        h('div.cust-panel',
          h('div.screen-head', banner('ÖZELLEŞTİRME'), button('← Geri', () => this.back(), 'ghost')),
          h('div.cust-chars', CHARACTER_IDS.map((cid) => h('button.cust-char' + (cid === id ? '.active' : ''), { type: 'button', title: CHARACTERS[cid].name, on: { click: () => { this.custChar = cid; if (this.game.menu) this.game.menu.showcase(this.lookFor(cid)); render(); } } }, portrait(cid)))),
          h('div.tabs.small', tabs.map(([k, n]) => h('button.tab' + (k === this.custTab ? '.active' : ''), { type: 'button', on: { click: () => { this.custTab = k; render(); } } }, n))),
          body,
          h('p.muted', 'Değişiklikler otomatik kaydedilir. Karakteri döndürmek için sahneyi sürükle.')),
        h('div.cust-name', `${CHARACTERS[id].name} — ${CHARACTERS[id].role}`));
      this.show(el, 'customize');
    };
    render();
  }

  // ======================================================================= AYARLAR
  openSettings(inGame = false) {
    this.setTab = this.setTab || 'graphics';
    const root = h('div' + (inGame ? '.panel.settings-panel' : '.screen.settings'));
    const render = () => {
      clear(root);
      const g = Settings.get('graphics'), a = Settings.get('audio'), c = Settings.get('controls'), gp = Settings.get('gameplay');
      const slider = (label, path, min, max, step, fmt = (v) => v) => {
        const val = Settings.get(path);
        const out = h('b', String(fmt(val)));
        const inp = h('input', { type: 'range', min, max, step, value: val });
        inp.addEventListener('input', () => { out.textContent = fmt(parseFloat(inp.value)); });
        inp.addEventListener('change', () => Settings.set(path, parseFloat(inp.value)));
        return h('div.opt-row', h('span.opt-label', label), inp, out);
      };
      const toggle = (label, path) => h('div.opt-row', h('span.opt-label', label), h('button.seg-btn' + (Settings.get(path) ? '.active' : ''), { type: 'button', on: { click: () => { Settings.set(path, !Settings.get(path)); render(); } } }, Settings.get(path) ? 'Açık' : 'Kapalı'));
      const tabs = [['graphics', 'Grafik'], ['audio', 'Ses'], ['controls', 'Kontroller'], ['gameplay', 'Oyun']];
      let body;
      if (this.setTab === 'graphics') {
        body = h('div.set-body',
          this.choice('Kalite', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']], g.quality, (v) => { Settings.set('graphics.quality', v); render(); this.ui.toast('Gölge çözünürlüğü ve kenar yumuşatma için oyunu yeniden yükle.', 'info', 4); }),
          toggle('Gölgeler', 'graphics.shadows'), toggle('Parlama (bloom)', 'graphics.bloom'), toggle('Çimen', 'graphics.grass'), toggle('Otomatik çözünürlük (akıcılık)', 'graphics.autoScale'), toggle('FPS göstergesi', 'graphics.fpsCounter'),
          slider('Çözünürlük ölçeği', 'graphics.renderScale', 0.5, 1, 0.05, (v) => `%${Math.round(v * 100)}`),
          slider('Görüş mesafesi', 'graphics.viewDistance', 200, 700, 20, (v) => `${v} m`),
          slider('Görüş açısı (FOV)', 'graphics.fov', 55, 95, 1, (v) => `${v}°`));
      } else if (this.setTab === 'audio') {
        const pct = (v) => `%${Math.round(v * 100)}`;
        body = h('div.set-body', slider('Genel ses', 'audio.master', 0, 1, 0.05, pct), slider('Müzik', 'audio.music', 0, 1, 0.05, pct), slider('Efektler', 'audio.sfx', 0, 1, 0.05, pct), slider('Ortam sesleri', 'audio.ambient', 0, 1, 0.05, pct), slider('Sesli sohbet', 'audio.voice', 0, 1, 0.05, pct), slider('Mikrofon eşiği (açık mik.)', 'audio.micGate', 0.005, 0.1, 0.005, (v) => v.toFixed(3)));
      } else if (this.setTab === 'controls') {
        const binds = c.bindings;
        body = h('div.set-body',
          slider('Fare hassasiyeti', 'controls.mouseSens', 0.2, 3, 0.05, (v) => v.toFixed(2)), toggle('Y eksenini ters çevir', 'controls.invertY'),
          h('div.binds', Object.keys(DEFAULT_BINDINGS).map((act) => h('div.bind-row', h('span', ACTION_LABELS[act] || act), h('button.key-btn', { type: 'button', on: { click: (e) => this.rebind(act, e.currentTarget, render) } }, keyLabel(binds[act]))))),
          button('Tuşları Sıfırla', () => { Settings.set('controls.bindings', { ...DEFAULT_BINDINGS }); render(); }, 'small'));
      } else {
        body = h('div.set-body',
          this.choice('Bir oyun günü', DAY_OPTS.map((d) => [d, `${d} dk`]), gp.dayMinutes, (v) => { Settings.set('gameplay.dayMinutes', v); render(); }),
          toggle('Kamera sarsıntısı', 'gameplay.cameraShake'), toggle('Hasar sayıları', 'gameplay.damageNumbers'), toggle('İpuçları', 'gameplay.tutorialHints'),
          h('p.muted', 'Gün süresi yeni oyunlarda geçerli olur. Kalıcı ölüm kapalıdır: yere düşen oyuncu kaldırılabilir ya da üste döner.'),
          button('Tüm Ayarları Sıfırla', () => this.ui.confirm('Tüm ayarlar varsayılana dönsün mü?', () => { Settings.reset(); render(); }), 'small red'));
      }
      root.append(
        h('div.screen-head', banner('AYARLAR'), inGame ? h('button.close', { type: 'button', on: { click: () => this.ui.panels.openPause() } }, '✕') : button('← Geri', () => this.back(), 'ghost')),
        h('div.tabs.small', tabs.map(([k, n]) => h('button.tab' + (k === this.setTab ? '.active' : ''), { type: 'button', on: { click: () => { this.setTab = k; render(); } } }, n))),
        body);
    };
    render();
    if (inGame) this.ui.openPanel('settings', root); else this.show(root, 'settings');
  }

  rebind(action, btn, render) {
    btn.textContent = 'Bir tuşa bas…';
    btn.classList.add('listening');
    const on = (e) => {
      e.preventDefault(); e.stopPropagation();
      window.removeEventListener('keydown', on, true);
      if (e.code !== 'Escape' || action === 'pause') Settings.set('controls.bindings', { ...Settings.get('controls.bindings'), [action]: e.code });
      render();
    };
    window.addEventListener('keydown', on, true);
  }

  // ======================================================================= NASIL OYNANIR
  openHowTo(inGame = false) {
    const I = this.game.input;
    const k = (a) => h('kbd', I.label(a));
    const sec = (title, ...ps) => h('section', h('h3', title), ...ps.map((p) => (typeof p === 'string' ? h('p', p) : p)));
    const body = h('div.howto',
      sec('🎯 Amaç', 'Ada 30 gün sonra, 30. gün saat 22:00\'de "Son Işık" denen bir felaketle yutulacak. Arkadaşlarınla (ya da yapay zekâ takım arkadaşlarıyla) kaynak topla, üssünü güçlendir ve altı kaçış yolundan en az birini hazırla: Yeraltı sığınağı, askerî helikopter, tekne, dağ kampı, araç konvoyu ya da son savunma.'),
      sec('🎮 Kontroller', h('div.keys-grid',
        h('span', k('forward'), k('left'), k('back'), k('right'), ' Hareket'), h('span', k('sprint'), ' Koş · ', k('crouch'), ' Eğil · ', k('prone'), ' Sürün · ', k('jump'), ' Zıpla/Tırman'), h('span', k('sprint'), '+', k('crouch'), ' Takla (koşarken kaçınma)'),
        h('span', h('kbd', 'Fare'), ' Kamera · ', h('kbd', 'Sol tık'), ' Vur/Ateş · ', h('kbd', 'Sağ tık'), ' Nişan al'), h('span', k('interact'), ' Etkileşim (basılı tut: ara/aç/tamir) · ', k('reload'), ' Şarjör'),
        h('span', h('kbd', '1-6'), ' Hızlı erişim · ', k('inventory'), ' Envanter · ', k('crafting'), ' Üretim · ', k('build'), ' İnşa'), h('span', k('map'), ' Harita · ', k('quests'), ' Görevler · ', k('character'), ' Karakter · ', k('team'), ' Takım'),
        h('span', k('flashlight'), ' Fener · ', k('ping'), ' İşaret · ', k('voice'), ' Bas-konuş · ', k('chat'), ' Sohbet · ', k('emote'), ' İfade'), h('span', k('quickHeal'), ' Hızlı tedavi (araçta korna) · ', k('drop'), ' Bırak · ', k('pause'), ' Menü'))),
      sec('❤️ Hayatta Kalma', 'Sağlık, açlık, susuzluk, enerji, moral ve vücut ısısını takip et. Kirli suyu kaynat ya da filtrele; çiğ et ve bazı mantarlar zehirleyebilir. Kanamayı bandajla, enfeksiyonu antibiyotikle durdur. Islanmak ve soğuk vücut ısını düşürür; ateş başında ısın. Gece uyuyarak (yatak/uyku tulumu) zamanı hızlandırabilirsiniz — takımın yarısı uyumalı.'),
      sec('🔎 Yağma', 'Dolapları, buzdolaplarını, kasaları ve araç bagajlarını E basılı tutarak ara. Aranan yerler boş kalır — her eşya bir kez çıkar. Kilitli yerleri maymuncuk ya da levyeyle aç. Şehir, hastane ve askerî bölge daha değerli ama daha tehlikelidir.'),
      sec('🔨 Üretim ve İnşa', `${I.label('crafting')} ile üretim menüsünü aç: bazı tarifler tezgâh, ateş ya da filtre yanında yapılır. ${I.label('build')} ile üs geliştirme menüsünü aç, yapıyı yerleştir, sonra çekiçle E basılı tutarak inşa et. Pencereleri tahtayla güçlendir; jeneratörü onar; bahçe kur; sığınağı 4 aşamada tamamla.`),
      sec('🧟 Zombiler', 'Normal zombiler yavaş ama kalabalıktır. Koşucular hızlıdır, ağır zombiler kapı ve duvar kırar, gece zombileri karanlıkta güçlenir, özel enfekteler zehir saçar, zombi köpekler kokunu alır. Silah sesleri ve koşmak onları çeker; eğilerek sessiz ilerle. Geceleri üste dön!'),
      sec('🚗 Araçlar', 'Araçları bul, onar (parça + İngiliz anahtarı), yakıt bidonuyla doldur. Bagajları ganimet taşımak için kullan. Zırh, tampon, tavan bagajı gibi geliştirmeler tak. Sür: W/S gaz-fren, A/D direksiyon, Boşluk el freni, F far, H korna.'),
      sec('👥 Çok Oyunculu', 'Arkadaşlarla Oyna → Oda Kur ile oda kodunu ve davet bağlantısını paylaş. Herkes hazır olunca oda sahibi oyunu başlatır. Yere düşen arkadaşını E basılı tutarak kaldır ya da R ile sırtlayıp güvenli bir yere taşı. Envanter kişiseldir; eşyaları sandıklarda paylaşın ya da Envanter → "…\'a ver" ile aktarın. Bağlantı koparsa aynı odaya yeniden bağlanabilirsin.'),
      sec('🏁 Finaller', 'Görevler → Kaçış Planları ekranında her finalin gereksinimlerini gör. 30. gün 20:00 helikopter, 21:00 köprü konvoyu; 22:00\'de Son Işık başlar. Sonuç ekranında hayatta kalanlar, üs seviyesi, kararlarınız ve derece (S–D) gösterilir.'));
    const root = h('div' + (inGame ? '.panel.howto-panel' : '.screen.howto-screen'),
      h('div.screen-head', banner('NASIL OYNANIR?'), inGame ? h('button.close', { type: 'button', on: { click: () => this.ui.panels.openPause() } }, '✕') : button('← Geri', () => this.back(), 'ghost')), body);
    if (inGame) this.ui.openPanel('howto', root); else this.show(root, 'howto');
  }

  // ======================================================================= KREDİLER
  openCredits() {
    const el = h('div.screen.credits',
      h('div.screen-head', banner('KREDİLER'), button('← Geri', () => this.back(), 'ghost')),
      h('div.credits-body',
        h('div.mm-logo.small', h('div.logo-main', h('span', 'KIYAMETTEN'), h('span', 'ÖNCE')), h('div.logo-tag', '30 GÜN KALDI')),
        h('h3', 'Oyun'), h('p', 'Oyun tasarımı, programlama, dünya ve sistemler: Kıyametten Önce ekibi (proje: adnanerdem2000-sudo) — Claude Code ile geliştirildi.'),
        h('p', 'Konsept görseller: proje sahibinin sağladığı tanıtım kolajları (ana menü, karakter seçimi, harita, olaylar).'),
        h('h3', 'Ücretsiz Varlıklar'),
        h('ul',
          h('li', 'Kenney (kenney.nl) — karakterler, araçlar, evler, eşyalar, yiyecekler, ağaçlar ve ses efektleri (pmndrs market & Kenney Starter Kits) — CC0 1.0'),
          h('li', 'KayKit / Kay Lousberg — Furniture, Restaurant, Halloween, Prototype, City Builder, Dungeon Remastered, Character Pack Adventures — CC0 1.0'),
          h('li', 'Quaternius (quaternius.com) — Ultimate Modular Men/Women karakterleri, Universal Animation Library 1+2 hareket kütüphanesi (154 klip), iskeletli hayvanlar — CC0 1.0'),
          h('li', 'Creative Trio — eski karavan, kütüphane, rüzgâr türbini · Sara Vieira — bank · Reuben Sotomayor & Alejandro León — köpek modeli — CC0 1.0 (pmndrs market)'),
          h('li', 'Yazı tipleri: Luckiest Guy (Astigmatic) — Apache 2.0 · Rubik, Rubik Dirt — SIL Open Font License 1.1'),
          h('li', 'three.js — MIT Lisansı · PeerJS — MIT Lisansı · Rapier fizik motoru — Apache 2.0'),
          h('li', 'Müzik ve çoğu ses efekti Web Audio ile prosedürel olarak üretilir.')),
        h('p.muted', 'Tüm üçüncü taraf lisansları CREDITS.md dosyasında listelenmiştir.')));
    this.show(el, 'credits');
  }
}
