// Ağ yöneticisi (NetworkManager): oda/lobi, host-otoriter oyun eşitlemesi, yeniden bağlanma, sesli sohbet.
// Protokol (JSON):
//  lobi   C→H hello{token,name,charId,look,ver} · lobby_set{charId,look,ready,name}
//         H→C room{room,you,token} · reject{reason} · start · welcome{w} · kick
//  oyun   C→H req{type,p} · st{oyuncu durumu} · hold{id} · qhook{type,arg} · save{d} · joined · ping{ts} · bye
//         H→C evt{e} · snap{tm,ff,pl,z,b} · pjoin{info} · pleave{id} · pong{ts} · host_left
import * as THREE from 'three';
import { roomCode, uid } from '../core/util.js';
import { Settings } from '../core/Settings.js';
import { CHARACTERS, CHARACTER_IDS } from '../entities/CharacterFactory.js';
import { LocalTransport, PeerTransport } from './Transport.js';
import { Voice } from './Voice.js';

export const PROTOCOL = 5; // 5: dünya yerleşimi değişti (girilebilir yeni binalar, gerçek araç olan terk edilmiş arabalar); 4: hayvan anlık görüntüsü, takas eşitlemesi, eylem başlangıç zamanı (actT)
export const MAX_PLAYERS = 6;
const RECENT_KEY = 'kiyamet_recent_rooms';

function myToken() {
  // Sekme başına benzersiz, aynı sekmede yeniden yüklemede korunur; kalıcı taban localStorage'da
  let base = null;
  try { base = localStorage.getItem('kiyamet_token'); if (!base) { base = uid(); localStorage.setItem('kiyamet_token', base); } } catch { base = uid(); }
  let t = null;
  try { t = sessionStorage.getItem('kiyamet_tab_token'); } catch { /* yoksay */ }
  if (!t) { t = base; try { sessionStorage.setItem('kiyamet_tab_token', t); } catch { /* yoksay */ } }
  return t;
}

export class Net {
  constructor(game) {
    this.game = game;
    this.mode = 'off'; // off | host | client
    this.phase = 'idle'; // idle | lobby | game
    this.transport = null;
    this.room = null;
    this.session = null;
    this.peers = new Map(); // host: pid → peer kaydı
    this.myId = null;
    this.token = myToken();
    this.listeners = new Set();
    this.pending = [];
    this.sendT = 0; this.snapT = 0; this.saveT = 0; this.pingT = 0;
    this.rtt = 0;
    this.voice = new Voice(this);
    this.reconnecting = false;
    this.lobbyBeacon = null;
    this.setupBeacon();
  }

  get active() { return this.mode !== 'off'; }
  get isHost() { return this.mode === 'host'; }
  get inGame() { return this.phase === 'game'; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) try { fn(this.room); } catch (e) { console.error(e); } }

  profile() {
    const pl = Settings.get('player');
    const charId = CHARACTERS[pl.characterId] ? pl.characterId : 'mert';
    return { name: (pl.name || 'Oyuncu').slice(0, 16), charId, look: (pl.appearance || {})[charId] || {} };
  }

  // ======================================================================= yerel oda listesi (aynı tarayıcı) + son odalar
  setupBeacon() {
    try {
      this.lobbyBeacon = new BroadcastChannel('kiyamet-lobby');
      this.localRooms = new Map();
      this.lobbyBeacon.onmessage = (ev) => {
        const m = ev.data;
        if (m.k === 'room') this.localRooms.set(m.code, { ...m, seen: performance.now() });
        if (m.k === 'room_gone') this.localRooms.delete(m.code);
        if (m.k === 'who' && this.isHost && this.room && this.room.settings.public) this.announce();
      };
    } catch { this.lobbyBeacon = null; this.localRooms = new Map(); }
  }

  announce() {
    if (!this.lobbyBeacon || !this.room) return;
    this.lobbyBeacon.postMessage({ k: 'room', code: this.room.code, host: this.room.players[0]?.name, count: this.room.players.length, max: this.room.settings.maxPlayers, local: this.transport.kind === 'local', inGame: this.inGame, day: this.session ? this.session.time.day : 1 });
  }

  listRooms() {
    if (this.lobbyBeacon) this.lobbyBeacon.postMessage({ k: 'who' });
    const now = performance.now();
    const local = [...this.localRooms.values()].filter((r) => now - r.seen < 8000);
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { recent = []; }
    return { local, recent };
  }

  rememberRoom(code, local) {
    try {
      const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((r) => r.code !== code);
      arr.unshift({ code, local: !!local, at: Date.now() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 6)));
    } catch { /* yoksay */ }
  }

  inviteLink() {
    if (!this.room) return '';
    const local = this.transport && this.transport.kind === 'local';
    return `${location.origin}${location.pathname}#oda=${this.room.code}${local ? '&yerel=1' : ''}`;
  }

  // ======================================================================= HOST
  async host(opts = {}) {
    this.leave();
    const local = !!opts.local;
    let code = opts.code || roomCode();
    for (let tries = 0; tries < 4; tries++) {
      this.transport = local ? new LocalTransport() : new PeerTransport();
      try { await this.transport.startHost(code); break; } catch (e) {
        this.transport.close();
        if (e.type === 'unavailable-id' && tries < 3) { code = roomCode(); continue; }
        this.transport = null;
        throw e;
      }
    }
    this.mode = 'host';
    this.phase = 'lobby';
    const prof = this.profile();
    this.myId = 'p_' + this.token;
    this.room = {
      code,
      settings: { difficulty: 'normal', dayMinutes: Settings.get('gameplay.dayMinutes') || 24, maxPlayers: MAX_PLAYERS, aiFill: 0, public: true, ...(opts.settings || {}) },
      players: [{ id: this.myId, pid: this.transport.id, token: this.token, name: prof.name, charId: prof.charId, look: prof.look, ready: true, isHost: true, online: true }],
      saveName: null,
    };
    this.saveData = opts.save || null;
    if (this.saveData) this.room.saveName = `Kayıtlı oyun — ${Math.floor(this.saveData.time.total / 1440) + 1}. gün`;
    const t = this.transport;
    t.onPeerOpen = (pid) => this.peers.set(pid, { pid, id: null, token: null, inGame: false, lastSeen: performance.now() });
    t.timeoutFor = (pid) => this.peerTimeout(pid);
    t.onPeerData = (pid, msg) => this.onPeerMsg(pid, msg);
    t.onPeerClose = (pid) => this.dropPeer(pid, false);
    this.rememberRoom(code, local);
    if (this.room.settings.public) this.announce();
    this._announceT = setInterval(() => { if (this.room && this.room.settings.public) this.announce(); }, 3000);
    this.changed();
    return code;
  }

  updateSettings(part) {
    if (!this.isHost || !this.room) return;
    Object.assign(this.room.settings, part);
    this.pushRoom();
  }

  setLobby(part) {
    if (!this.room) return;
    if (this.isHost) {
      const me = this.room.players[0];
      if (part.charId && this.charTaken(part.charId, me.id)) return;
      Object.assign(me, part);
      this.pushRoom();
    } else this.transport.sendHost({ t: 'lobby_set', ...part });
  }

  charTaken(charId, exceptId) { return this.room.players.some((p) => p.charId === charId && p.id !== exceptId); }

  freeChar(pref) {
    if (!this.charTaken(pref)) return pref;
    return CHARACTER_IDS.find((c) => !this.charTaken(c)) || pref;
  }

  pushRoom() {
    for (const peer of this.peers.values()) if (peer.id) this.transport.send(peer.pid, { t: 'room', room: this.room, you: peer.id, token: peer.token, inGame: this.inGame });
    if (this.room.settings.public) this.announce();
    this.changed();
  }

  kick(id) {
    const peer = [...this.peers.values()].find((p) => p.id === id);
    if (!peer) return;
    this.transport.send(peer.pid, { t: 'kick' });
    setTimeout(() => { this.transport.drop && this.transport.drop(peer.pid); this.dropPeer(peer.pid, true); }, 300);
  }

  canStart() {
    if (!this.isHost || !this.room) return false;
    return this.room.players.every((p) => p.ready);
  }

  async startGame() {
    if (!this.isHost) return;
    const r = this.room;
    const me = r.players[0];
    const s = r.settings;
    for (const peer of this.peers.values()) if (peer.id) this.transport.send(peer.pid, { t: 'start' });
    const humans = r.players.length;
    await this.game.startSession({
      mode: 'host', difficulty: s.difficulty, dayMinutes: s.dayMinutes, aiTeammates: Math.min(s.aiFill || 0, MAX_PLAYERS - humans),
      localId: this.myId, token: this.saveData ? this.saveData.hostToken : this.token, local: { name: me.name, charId: me.charId, look: me.look }, save: this.saveData, seed: this.saveData ? this.saveData.seed : undefined,
    });
  }

  onPeerMsg(pid, msg) {
    const peer = this.peers.get(pid);
    if (!peer || !msg || typeof msg !== 'object') return;
    peer.lastSeen = performance.now();
    const S = this.session;
    switch (msg.t) {
      case 'hello': this.onHello(peer, msg); break;
      case 'lobby_set': {
        const p = this.room.players.find((q) => q.id === peer.id);
        if (!p) break;
        if (msg.charId && CHARACTERS[msg.charId] && !this.charTaken(msg.charId, p.id)) p.charId = msg.charId;
        if (msg.look) p.look = msg.look;
        if (msg.name) p.name = String(msg.name).slice(0, 16);
        if (msg.ready !== undefined) p.ready = !!msg.ready;
        this.pushRoom();
        break;
      }
      case 'joined': this.onClientJoined(peer); break;
      case 'req': if (S && peer.inGame) S.applyAction(msg.type, msg.p || {}, peer.id); break;
      case 'st': { peer.stCount = (peer.stCount || 0) + 1; if (msg.n !== undefined) { if (peer.stSeq !== undefined && msg.n > peer.stSeq + 1) peer.stLost = (peer.stLost || 0) + (msg.n - peer.stSeq - 1); peer.stSeq = msg.n; } if (S && peer.inGame) this.onRemoteState(peer, msg); break; }
      case 'hold': { const rec = S && S.players.get(peer.id); if (rec) { rec.held = msg.id; rec.avatar && rec.avatar.hold(msg.id); } break; }
      case 'qhook': if (S) S.quests.hook(msg.type, msg.arg); break;
      case 'save': { const rec = S && S.players.get(peer.id); if (rec) rec.saved = msg.d; break; }
      case 'downed': break;
      case 'ping': this.transport.send(pid, { t: 'pong', ts: msg.ts }); break;
      case 'pong': peer.rtt = performance.now() - msg.ts; peer.pingOut = 0; break;
      case 'bye': this.dropPeer(pid, true); break;
      default: break;
    }
  }

  onHello(peer, msg) {
    const r = this.room;
    if (msg.ver !== PROTOCOL) { this.transport.send(peer.pid, { t: 'reject', reason: 'Oyun sürümleri farklı. Sayfayı yenileyip tekrar dene.' }); return; }
    // yeniden bağlanma: aynı jeton (şu an bağlı biri kullanıyorsa aynı tarayıcıdan ikinci sekmedir → ek al)
    let token = String(msg.token || uid());
    // yeniden bağlanma: host eski bağlantının kapandığını henüz görmemiş olabilir → aynı jetonlu eski eşi düşür
    if (msg.rejoin && token !== this.token) {
      const old = [...this.peers.values()].find((p) => p !== peer && p.token === token);
      if (old) { if (this.transport.drop) this.transport.drop(old.pid); this.dropPeer(old.pid, false); }
    }
    const isLive = (tk) => tk === this.token || [...this.peers.values()].some((p) => p !== peer && p.token === tk);
    if (isLive(token)) { let n = 2; while (isLive(token + '-' + n)) n++; token = token + '-' + n; }
    const rejoining = r.players.find((p) => p.token === token);
    if (!rejoining && r.players.length >= r.settings.maxPlayers) { this.transport.send(peer.pid, { t: 'reject', reason: 'Oda dolu.' }); return; }
    peer.token = token;
    peer.id = 'p_' + token;
    const saved = this.session ? (this.session.offlinePlayers || {})[token] : this.saveData && this.saveData.players[token];
    if (rejoining) {
      rejoining.pid = peer.pid; rejoining.online = true;
    } else {
      const charId = this.freeChar(saved ? saved.charId : CHARACTERS[msg.charId] ? msg.charId : 'mert');
      r.players.push({ id: peer.id, pid: peer.pid, token, name: String(msg.name || 'Oyuncu').slice(0, 16), charId, look: msg.look || {}, ready: false, isHost: false, online: true });
    }
    this.pushRoom();
    if (this.inGame) {
      // oyun sürüyor: doğrudan katıl
      const p = r.players.find((q) => q.id === peer.id);
      p.ready = true;
      this.sendWelcome(peer);
    }
    if (this.session) this.session.ui.toast(`${msg.name || 'Bir oyuncu'} odaya bağlanıyor…`, 'info', 2);
  }

  /** Tam durum: yeni gelen istemci için */
  buildWelcome(peer) {
    const S = this.session;
    const p = this.room.players.find((q) => q.id === peer.id);
    const you = (S.players.get(peer.id) || {}).saved || (S.offlinePlayers || {})[peer.token] || null;
    const players = [];
    for (const q of S.players.values()) {
      if (q.id === peer.id) continue;
      const pos = q.isLocal ? S.local.pos : q.pos;
      players.push({ id: q.id, name: q.name, charId: q.charId, look: q.look, x: pos.x, y: pos.y, z: pos.z });
    }
    return {
      seed: S.seed, time: S.time.serialize(), flags: S.flags, relations: S.relations, difficulty: S.cfg.difficulty,
      loot: S.loot.serialize(), lootUse: S.loot.usageSnapshot(), ground: S.ground.serialize(), build: S.build.serialize(), shelters: S.shelters ? S.shelters.serialize() : null, vehicles: S.vehicles.serialize(), npcs: S.npcs.serialize(),
      quests: S.quests.serialize(), events: S.events.serialize(), weather: S.weather.serialize(), doors: S.serializeDoors(), story: S.storyWorld.serialize(),
      env: { streetPower: S.env.streetPower, doom: S.env.doom, redMist: S.env.redMist },
      props: S.props && S.props.serializeDynamic ? S.props.serializeDynamic() : null,
      trade: S._trade || {},
      zones: S.zombies && S.zombies.serialize ? S.zombies.serialize().zones : null,
      players, you, charId: p ? p.charId : 'mert', name: p ? p.name : 'Oyuncu', look: p ? p.look : {},
    };
  }

  sendWelcome(peer) {
    if (!this.session || !peer.id) return;
    peer.welcomed = true;
    this.transport.send(peer.pid, { t: 'welcome', w: this.buildWelcome(peer), you: peer.id, token: peer.token });
  }

  onClientJoined(peer) {
    const S = this.session;
    if (!S) return;
    const p = this.room.players.find((q) => q.id === peer.id);
    if (!p) return;
    peer.inGame = true;
    peer.joinedAt = performance.now();
    const sp = S.world.spawn;
    const info = { id: p.id, name: p.name, charId: p.charId, look: p.look, token: p.token, x: sp.x, y: sp.y, z: sp.z };
    const rec = S.addRemotePlayer(info);
    rec.token = p.token;
    rec.peer = peer.pid;
    for (const other of this.peers.values()) if (other !== peer && other.inGame) this.transport.send(other.pid, { t: 'pjoin', info });
    if (S.offlinePlayers) delete S.offlinePlayers[p.token];
    this.voice.sync();
  }

  onRemoteState(peer, m) {
    const rec = this.session.players.get(peer.id);
    if (!rec) return;
    if (!rec.target) rec.target = new THREE.Vector3();
    rec.target.set(m.p[0], m.p[1], m.p[2]);
    rec.anim = m.a;
    rec.vehicleId = m.v || null;
    rec.seat = m.s || 0;
    rec.summary = m.h;
    rec.speaking = !!m.spk;
    if (m.held !== undefined && rec.held !== m.held) { rec.held = m.held; rec.avatar && rec.avatar.hold(m.held); }
  }

  dropPeer(pid, intentional) {
    const peer = this.peers.get(pid);
    if (!peer) return;
    this.peers.delete(pid);
    if (!this.room) return;
    const S = this.session;
    const p = this.room.players.find((q) => q.id === peer.id);
    if (S && peer.id) {
      const rec = S.players.get(peer.id);
      if (rec) {
        // kayıt için sakla (geri dönerse iade)
        S.offlinePlayers = S.offlinePlayers || {};
        if (rec.saved) S.offlinePlayers[peer.token] = rec.saved;
        for (const v of S.vehicles.list) { const si = v.seats.indexOf(peer.id); if (si >= 0) S.emit({ k: 'veh_seat', id: v.id, seat: si, player: null }); }
        if (S.loot && S.loot.dropUser) S.loot.dropUser(peer.id); // açık bıraktığı dolap/çekmeceler kapanır
        S.removeRemotePlayer(peer.id);
        for (const o of this.peers.values()) if (o.inGame) this.transport.send(o.pid, { t: 'pleave', id: peer.id });
      }
    }
    if (p) {
      if (this.inGame && !intentional) p.online = false; // yeniden bağlanabilir
      else this.room.players.splice(this.room.players.indexOf(p), 1);
    }
    this.pushRoom();
  }

  // ======================================================================= İSTEMCİ
  async join(code, opts = {}) {
    if (!opts.reconnect) this.leave();
    code = String(code).toUpperCase().trim();
    const local = !!opts.local;
    this.transport = local ? new LocalTransport() : new PeerTransport();
    this.mode = 'client';
    this.joinCode = code;
    this.joinLocal = local;
    const t = this.transport;
    try {
      await t.connect(code);
    } catch (e) {
      this.transport.close(); this.transport = null; this.mode = 'off';
      throw e;
    }
    this.phase = this.phase === 'game' ? 'game' : 'lobby';
    // kapatılmış (ayrılınca/yeniden bağlanınca değişen) taşıyıcıdan gecikmeli gelen ileti ve kapanış yok sayılır
    t.onHostData = (m) => { if (this.transport === t) this.onHostMsg(m); };
    t.onHostClose = (reason) => { if (this.transport === t) this.onHostLost(reason); };
    t.onCall = (call) => this.voice.answer && this.voice.answer(call);
    const prof = this.profile();
    const answer = new Promise((res, rej) => { this._joinWait = { res, rej }; setTimeout(() => { if (this._joinWait) { this._joinWait = null; rej(new Error('Oda yanıt vermedi.')); } }, 10000); });
    t.sendHost({ t: 'hello', ver: PROTOCOL, token: this.token, name: prof.name, charId: prof.charId, look: prof.look, rejoin: !!opts.reconnect });
    this.rememberRoom(code, local);
    await answer;
    return this.room;
  }

  onHostMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.lastHost = performance.now();
    switch (m.t) {
      case 'room': {
        this.room = m.room; this.myId = m.you;
        if (m.token && m.token !== this.token) { this.token = m.token; try { sessionStorage.setItem('kiyamet_tab_token', m.token); } catch { /* yoksay */ } }
        if (this._joinWait) { this._joinWait.res(); this._joinWait = null; }
        this.voice.sync();
        this.changed();
        break;
      }
      case 'reject': if (this._joinWait) { this._joinWait.rej(new Error(m.reason)); this._joinWait = null; } this.leave(); break;
      case 'start': this.game.ui.showLoadingOverlay('Oyun başlıyor…'); break;
      case 'welcome': this.myId = m.you; this.startClientSession(m.w); break;
      case 'evt': if (this.session) this.session.applyEvent(m.e); else this.pending.push(m.e); break;
      case 'snap': this.applySnap(m); break;
      case 'pjoin': if (this.session) this.session.addRemotePlayer(m.info); break;
      case 'pleave': if (this.session) this.session.removeRemotePlayer(m.id); break;
      case 'pong': this.rtt = performance.now() - m.ts; this.pingOut = 0; break;
      case 'ping': if (this.transport) this.transport.sendHost({ t: 'pong', ts: m.ts }); break;
      case 'pdata': if (this.session) { this.session.offlinePlayers = m.d || {}; if (m.zz) this.session.zoneState = m.zz; } break;
      case 'migrate': this.migrateHint = m; break;
      case 'kick': this.game.ui.alert('Oda sahibi seni odadan çıkardı.'); this.backToMenu(); break;
      case 'host_left': this.game.ui.alert('Oda sahibi oyunu kapattı.'); this.backToMenu(); break;
      default: break;
    }
  }

  async startClientSession(w) {
    const g = this.game;
    // yeni/yeniden kurulan host oturumu: eski host'un sıra numaraları ve kayıp istatistiği sıfırlanır
    this.snapSeq = undefined; this.snapLost = 0; this.snapCount = 0; this.loss = 0; this.lossT = 5; this.lastSnap = performance.now(); this.pingOut = 0; this.rtt = 0; this._pingAt = 0;
    if (g.session) { g.session.dispose(); g.session = null; }
    this.session = null;
    this.reconnecting = false;
    g.ui.hideReconnect && g.ui.hideReconnect();
    await g.startSession({ mode: 'client', welcome: w, localId: this.myId, token: this.token, local: { name: w.name, charId: w.charId, look: w.look }, difficulty: w.difficulty, dayMinutes: w.time.dayMinutes, seed: w.seed });
  }

  applySnap(m) {
    const S = this.session;
    if (!S) return;
    this.snapCount = (this.snapCount || 0) + 1;
    if (m.n !== undefined) { if (this.snapSeq !== undefined && m.n > this.snapSeq + 1) this.snapLost = (this.snapLost || 0) + (m.n - this.snapSeq - 1); this.snapSeq = m.n; }
    this.lastSnap = performance.now();
    const drift = m.tm - S.time.total;
    if (Math.abs(drift) > 4) S.time.set(m.tm); else S.time.total += drift * 0.15;
    S.time.ff = m.ff || 1;
    for (const a of m.pl) {
      if (a[0] === S.localId) continue;
      const rec = S.players.get(a[0]);
      if (!rec || !rec.avatar) continue;
      if (!rec.target) rec.target = new THREE.Vector3();
      rec.target.set(a[1], a[2], a[3]);
      rec.anim = a[4];
      if (rec.held !== a[5]) { rec.held = a[5]; rec.avatar.hold(a[5]); }
      rec.vehicleId = a[6] || null; rec.seat = a[7] || 0;
      rec.summary = a[8];
      rec.speaking = !!a[9];
    }
    if (m.z) S.zombies.applySnapshot(m.z);
    if (m.b) S.bots.applySnapshot(m.b);
    if (m.an && S.npcs && S.npcs.applyAnimalSnapshot) S.npcs.applyAnimalSnapshot(m.an);
  }

  onHostLost(reason = 'closed') {
    if (this.mode !== 'client') return;
    if (this.phase !== 'game' || !this.session) { this.game.ui.alert('Oda ile bağlantı kesildi.'); this.leave(); this.game.ui.showMainMenu(); return; }
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.reconnectFails = 0;
    this.lostReason = reason; this.lostAt = performance.now();
    this.game.ui.showReconnect && this.game.ui.showReconnect();
    // önce yeniden bağlanmayı dene (geçici takılma/ağ kopması olabilir); host gerçekten yoksa (iki başarısız deneme)
    // oda sırasına göre ilk çevrimiçi istemci yeni host olur, diğerleri aynı kodla ona bağlanır
    this.tryReconnect(0);
  }

  async tryReconnect(n) {
    if (!this.reconnecting) return;
    if (n >= 40) { this.reconnecting = false; this.game.ui.alert('Oda sahibine yeniden bağlanılamadı. Oda kapanmış olabilir.'); this.backToMenu(); return; }
    try {
      if (this.transport) this.transport.close();
      await this.join(this.joinCode, { local: this.joinLocal, reconnect: true });
      // welcome mesajı gelince oturum yeniden kurulur
    } catch (e) {
      this.reconnectFails = (this.reconnectFails || 0) + 1;
      // göç: sekme kapanışı gibi kesin kayıpta 5 sn + 2 başarısız deneme; sessizlikte (host takılmış olabilir:
      // yükleme, uzun kare) 90 sn beklenir; bu istemci oyunu yüklerken asla (host da yükleniyor olabilir)
      const since = performance.now() - (this.lostAt || 0);
      const sure = this.lostReason === 'closed' ? since > 5000 : since > 90000;
      if (this.reconnectFails >= 2 && sure && this.game.state === 'playing' && this.successor() === this.myId) {
        try { await this.migrateToHost(); return; } catch (err) { console.warn('Host göçü başarısız, yeniden denenecek', err); }
      }
      setTimeout(() => this.tryReconnect(n + 1), 3000);
    }
  }

  /**
   * Yerel taşıyıcı zaman aşımı: hoş geldin almış ama oturumunu kurmakta olan eş (henüz 'joined' yok) ve katıldıktan
   * sonraki ilk 2 dk içindeki eş 4 dk, diğerleri 45 sn. Katılımdan hemen sonraki ilk kareler zayıf makinede (gölgelendirici
   * derlemesi) uzun sürebilir: iz sondası, yeni katılan istemcinin 45 sn susup düşürüldüğünü ve yeniden bağlandığını gösterdi.
   */
  peerTimeout(pid) {
    const p = this.peers.get(pid);
    if (!p || !p.welcomed) return 45000;
    return !p.inGame || performance.now() - (p.joinedAt || 0) < 120000 ? 240000 : 45000;
  }

  /** Göç adayı: oda listesinde host olmayan, çevrimiçi oyuncular arasında kimliği en küçük olan */
  successor() {
    if (!this.room) return null;
    const c = this.room.players.filter((p) => !p.isHost && p.online !== false).map((p) => p.id).sort();
    return c[0] || null;
  }

  /** Bu istemci yeni host olur: aynı oda kodu, mevcut oturum (durum korunur), diğerleri yeniden bağlanır */
  async migrateToHost() {
    const S = this.session, g = this.game;
    if (!S) throw new Error('oturum yok');
    const code = this.joinCode, local = this.joinLocal, oldRoom = this.room;
    const oldHostId = (oldRoom.players.find((p) => p.isHost) || {}).id;
    try { if (this.transport) this.transport.close(); } catch { /* yoksay */ }
    this.transport = local ? new LocalTransport() : new PeerTransport();
    // eski host'un kimliği (PeerJS) hemen boşalmayabilir: birkaç deneme
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      try { await this.transport.startHost(code); ok = true; } catch (e) { if (i === 9) { try { this.transport.close(); } catch { /* yoksay */ } this.transport = null; throw e; } await new Promise((r) => setTimeout(r, 2000)); }
    }
    this.mode = 'host'; this.phase = 'game'; this.reconnecting = false;
    this.room = { ...oldRoom, players: oldRoom.players.filter((p) => p.id !== oldHostId).map((p) => ({ ...p, isHost: p.id === this.myId, online: p.id === this.myId, pid: p.id === this.myId ? this.transport.id : null })) };
    const t = this.transport;
    t.onPeerOpen = (pid) => this.peers.set(pid, { pid, id: null, token: null, inGame: false, lastSeen: performance.now() });
    t.timeoutFor = (pid) => this.peerTimeout(pid);
    t.onPeerData = (pid, msg) => this.onPeerMsg(pid, msg);
    t.onPeerClose = (pid) => this.dropPeer(pid, false);
    t.onCall = (call) => this.voice.answer && this.voice.answer(call);
    // oturum: host yetkisine geç; eski host ve diğer oyuncular yeniden bağlanana dek çevrimdışı sayılır
    if (oldHostId) S.removeRemotePlayer(oldHostId);
    for (const q of [...S.players.values()]) if (!q.isLocal) { if (q.saved && q.token) { S.offlinePlayers = S.offlinePlayers || {}; S.offlinePlayers[q.token] = q.saved; } S.removeRemotePlayer(q.id); }
    S.becomeHost();
    this.session = S;
    this.snapT = 0.1; this.pingT = 2;
    this.rememberRoom(code, local);
    g.ui.hideReconnect && g.ui.hideReconnect();
    S.ui.toast('Oda sahibi ayrıldı — oda sana devredildi. Diğerleri yeniden bağlanıyor…', 'warn', 5);
    this.changed();
  }

  backToMenu() {
    const g = this.game;
    this.reconnecting = false;
    if (g.session) g.endSession(true); else { this.leave(); g.ui.showMainMenu(); }
  }

  // ======================================================================= oturum bağlantısı
  attachSession(session) {
    this.session = session;
    this.phase = 'game';
    if (this.isHost) {
      for (const peer of this.peers.values()) if (peer.id) this.sendWelcome(peer);
      for (const p of this.room.players) p.ready = true;
      this.pushRoom();
    } else {
      this.transport.sendHost({ t: 'joined' });
      const evs = this.pending; this.pending = [];
      for (const e of evs) session.applyEvent(e);
    }
  }

  sendToHost(msg) {
    if (this.mode !== 'client' || !this.transport) return;
    this.transport.sendHost(msg);
  }

  broadcast(msg, except = null) {
    if (!this.isHost || !this.transport) return;
    // kişiye özel olaylar yalnızca o oyuncuya
    const to = msg.t === 'evt' && msg.e && msg.e.to ? msg.e.to : null;
    for (const peer of this.peers.values()) {
      if (!peer.welcomed) continue;
      if (!peer.inGame && msg.t !== 'evt') continue;
      if (!peer.id || peer.id === except) continue;
      if (to && peer.id !== to) continue;
      this.transport.send(peer.pid, msg);
    }
  }

  update(dt) {
    if (this.mode === 'off') return;
    const S = this.session;
    const typing = this.game.ui && this.game.ui.isTyping && this.game.ui.isTyping();
    this.voice.update(this.game.input, typing);
    if (!S || this.phase !== 'game') return;
    if (this.voice.updateSpatial) this.voice.updateSpatial(S);
    if (this.isHost) {
      this.snapT -= dt;
      if (this.snapT <= 0) { this.snapT = 0.1; this.sendSnapshots(); }
      // eşlere ping (gecikme) ve 5 sn'de bir durum paketi sayımı (kayıp tahmini: beklenen 15/sn)
      // ping: 2 sn'de bir, duvar saatiyle (yavaş karelerde oyun zamanı yavaş akar); cevapsız en eski ping tutulur
      const nowMs = performance.now();
      if (nowMs - (this._pingAt || 0) >= 2000) {
        this._pingAt = nowMs;
        for (const peer of this.peers.values()) if (peer.inGame) { this.transport.send(peer.pid, { t: 'ping', ts: nowMs }); if (!peer.pingOut) peer.pingOut = nowMs; }
      }
      this.lossT = (this.lossT ?? 5) - dt;
      if (this.lossT <= 0) {
        this.lossT = 5;
        // kayıp = atlanan sıra numarası / (gelen + atlanan): gönderim sıklığından bağımsız
        for (const peer of this.peers.values()) { if (peer.inGame) { const got = peer.stCount || 0, lost = peer.stLost || 0; peer.loss = got + lost ? lost / (got + lost) : 0; } peer.stCount = 0; peer.stLost = 0; }
      }
      // tüm oyuncuların kayıt verisi herkeste yedeklenir: host düşerse yeni host envanterleri iade edebilir
      this.pdataT = (this.pdataT ?? 6) - dt;
      if (this.pdataT <= 0) {
        this.pdataT = 8;
        const d = { ...(S.offlinePlayers || {}) };
        d[this.token] = S.localData();
        for (const q of S.players.values()) if (!q.isLocal && q.token && q.saved) d[q.token] = q.saved;
        // + zombi bölge nüfusu/öldürülen sayıları: host düşerse yeni host ölenleri geri getirmez
        this.broadcast({ t: 'pdata', d, zz: S.zombies && S.zombies.serialize ? S.zombies.serialize().zones : null });
      }
    } else {
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = 1 / 15; this.sendState(); }
      this.saveT -= dt;
      if (this.saveT <= 0) { this.saveT = 8; this.transport.sendHost({ t: 'save', d: S.localData() }); }
      const nowMs = performance.now();
      if (nowMs - (this._pingAt || 0) >= 2000) { this._pingAt = nowMs; this.transport.sendHost({ t: 'ping', ts: nowMs }); if (!this.pingOut) this.pingOut = nowMs; }
      // anlık görüntü kaybı (beklenen 10/sn) ve bayatlık
      this.lossT = (this.lossT ?? 5) - dt;
      if (this.lossT <= 0) { this.lossT = 5; const got = this.snapCount || 0, lost = this.snapLost || 0; this.loss = got + lost ? lost / (got + lost) : 0; this.snapCount = 0; this.snapLost = 0; }
    }
  }

  /** Ağ göstergesi için özet: gecikme (ms), kayıp (0–1), bayatlık (sn), eşler */
  netStats() {
    const now = performance.now();
    if (this.isHost) {
      const peers = [...this.peers.values()].filter((p) => p.inGame).map((p) => ({ id: p.id, rtt: Math.round(Math.max(p.rtt || 0, p.pingOut ? now - p.pingOut : 0)), loss: +(p.loss || 0).toFixed(2), stale: +((now - (p.lastSeen || now)) / 1000).toFixed(1) }));
      const worst = peers.reduce((a, p) => Math.max(a, p.rtt), 0), loss = peers.reduce((a, p) => Math.max(a, p.loss), 0);
      return { host: true, rtt: worst, loss, stale: peers.reduce((a, p) => Math.max(a, p.stale), 0), peers };
    }
    return { host: false, rtt: Math.round(Math.max(this.rtt || 0, this.pingOut ? now - this.pingOut : 0)), loss: +(this.loss || 0).toFixed(2), stale: +((now - (this.lastSnap || now)) / 1000).toFixed(1), peers: [] };
  }

  /** Bağlantı kalitesi sınıfı: good / warn / bad */
  netQuality() {
    const n = this.netStats();
    if (n.stale > 2 || n.loss > 0.3 || n.rtt > 350) return 'bad';
    if (n.loss > 0.08 || n.rtt > 150 || n.stale > 0.8) return 'warn';
    return 'good';
  }

  summaryOf(st) { const S = this.session; return { health: Math.round(st.health), maxHealth: st.maxHealth, hunger: Math.round(st.hunger), thirst: Math.round(st.thirst), downed: !!st.downed, radio: S && S.inventory && S.inventory.has && S.inventory.has('radio') ? 1 : 0 }; }

  compactAnim(a) {
    return { mode: a.mode, speed: Math.round(a.speed * 10) / 10, vy: Math.round((a.vy || 0) * 10) / 10, yaw: Math.round(a.yaw * 100) / 100, pitch: Math.round((a.pitch || 0) * 100) / 100, aim: !!a.aim, steer: Math.round((a.steer || 0) * 100) / 100, emote: a.emote || null, carrying: !!a.carrying, moveAngle: Math.round((a.moveAngle || 0) * 100) / 100, roll: a.roll ? 1 : 0, tired: a.tired ? 1 : 0, carryBox: a.carryBox ? 1 : 0, act: a.act || null, actT: a.act ? Math.round((a.actT || 0) * 100) / 100 : 0 };
  }

  sendState() {
    const S = this.session;
    const pl = S.local;
    this.transport.sendHost({
      t: 'st', n: (this.stSeq = (this.stSeq || 0) + 1), p: [Math.round(pl.pos.x * 100) / 100, Math.round(pl.pos.y * 100) / 100, Math.round(pl.pos.z * 100) / 100],
      a: this.compactAnim(pl.animState()), v: pl.vehicle ? pl.vehicle.id : 0, s: pl.seat || 0, h: this.summaryOf(S.localStats),
      held: pl.avatar.heldId, spk: this.voice.talking ? 1 : 0,
    });
  }

  sendSnapshots() {
    const S = this.session;
    const pl = [];
    const L = S.local;
    pl.push([S.localId, +L.pos.x.toFixed(2), +L.pos.y.toFixed(2), +L.pos.z.toFixed(2), this.compactAnim(L.animState()), L.avatar.heldId, L.vehicle ? L.vehicle.id : 0, L.seat || 0, this.summaryOf(S.localStats), this.voice.talking ? 1 : 0]);
    for (const p of S.players.values()) {
      if (p.isLocal || !p.avatar) continue;
      pl.push([p.id, +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), p.anim || { mode: 'ground', speed: 0, yaw: 0 }, p.held || null, p.vehicleId || 0, p.seat || 0, p.summary || null, p.speaking ? 1 : 0]);
    }
    const bots = S.bots.snapshot();
    const seq = (this.snapSeqOut = (this.snapSeqOut || 0) + 1);
    const withAn = seq % 2 === 0 && S.npcs && S.npcs.animalSnapshotFor; // hayvanlar 5/sn yeter
    for (const peer of this.peers.values()) {
      if (!peer.inGame) continue;
      const rec = S.players.get(peer.id);
      const pos = rec ? rec.pos : S.local.pos;
      this.transport.send(peer.pid, { t: 'snap', n: seq, tm: Math.round(S.time.total * 100) / 100, ff: S.time.ff, pl, z: S.zombies.snapshotFor(pos.x, pos.z), b: bots, an: withAn ? S.npcs.animalSnapshotFor(pos.x, pos.z) : undefined });
    }
  }

  leave() {
    if (this.mode === 'off' && !this.transport && !this.room && !this.session && this.phase === 'idle') return;
    this.reconnecting = false;
    try {
      if (this.mode === 'client' && this.transport) this.transport.sendHost({ t: 'bye' });
      if (this.mode === 'host' && this.transport) {
        for (const peer of this.peers.values()) this.transport.send(peer.pid, { t: 'host_left' });
        if (this.lobbyBeacon && this.room) this.lobbyBeacon.postMessage({ k: 'room_gone', code: this.room.code });
      }
    } catch { /* yoksay */ }
    clearInterval(this._announceT);
    this.voice.disable();
    const t = this.transport;
    this.transport = null;
    if (t) setTimeout(() => t.close(), 100);
    this.mode = 'off';
    this.phase = 'idle';
    this.room = null;
    this.session = null;
    this.snapSeq = undefined; this.snapLost = 0; this.snapCount = 0; this.loss = 0; this.snapSeqOut = 0; this.stSeq = 0; this.pingOut = 0; this.rtt = 0; this._pingAt = 0;
    this.peers.clear();
    this.pending = [];
    this.saveData = null;
    this.changed();
  }
}
