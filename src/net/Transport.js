// Taşıyıcılar: PeerJS (WebRTC veri kanalı, internet üzerinden; sinyalleşme PeerJS bulut sunucusu)
// ve BroadcastChannel (aynı tarayıcıda çoklu sekme: geliştirme/test). Ortak arayüz:
//   startHost(code) · connect(code) · send(pid, msg) · sendHost(msg) · close()
//   olaylar: onPeerOpen(pid) · onPeerData(pid, msg) · onPeerClose(pid) · onHostData(msg) · onHostClose()
import { uid } from '../core/util.js';

export const PEER_PREFIX = 'kiyametten-once-v1-';
const TIMEOUT = 45000;

class Base {
  constructor() {
    this.onPeerOpen = () => {}; this.onPeerData = () => {}; this.onPeerClose = () => {};
    this.onHostData = () => {}; this.onHostClose = () => {}; this.onCall = null;
    this.closed = false;
  }
}

// ============================================================================ BroadcastChannel
export class LocalTransport extends Base {
  constructor() {
    super();
    this.kind = 'local';
    this.id = 'L' + uid();
    this.peers = new Map(); // pid → lastSeen
    this.hostId = null;
    this.ch = null;
    this._hb = null;
    this._unload = () => this.post({ k: 'close', from: this.id });
    window.addEventListener('beforeunload', this._unload);
  }

  post(m) { if (this.ch && !this.closed) try { this.ch.postMessage(m); } catch { /* kanal kapanmış */ } }

  async startHost(code) {
    this.ch = new BroadcastChannel('kiyamet-room-' + code);
    // aynı kodla açık oda var mı?
    const taken = await new Promise((res) => {
      const t = setTimeout(() => res(false), 300);
      this.ch.onmessage = (ev) => { if (ev.data.k === 'host_here' && ev.data.to === this.id) { clearTimeout(t); res(true); } };
      this.post({ k: 'probe', from: this.id });
    });
    if (taken) { this.ch.close(); throw Object.assign(new Error('Kod kullanımda'), { type: 'unavailable-id' }); }
    this.isHost = true;
    this.hostId = this.id;
    this.ch.onmessage = (ev) => {
      const m = ev.data;
      if (m.to && m.to !== this.id) return;
      if (m.k === 'probe') this.post({ k: 'host_here', to: m.from, from: this.id });
      else if (m.k === 'connect') { this.peers.set(m.from, performance.now()); this.post({ k: 'accept', to: m.from, from: this.id }); this.onPeerOpen(m.from); }
      else if (m.k === 'data' && this.peers.has(m.from)) { this.peers.set(m.from, performance.now()); this.onPeerData(m.from, m.d); }
      else if (m.k === 'data' && m.to === this.id) this.post({ k: 'close', from: this.id, to: m.from }); // düşürülmüş eş: yeniden bağlansın
      else if (m.k === 'hb' && this.peers.has(m.from)) this.peers.set(m.from, performance.now());
      else if (m.k === 'close' && this.peers.has(m.from)) { this.peers.delete(m.from); this.onPeerClose(m.from); }
    };
    this._hb = setInterval(() => {
      this.post({ k: 'hb', from: this.id });
      const now = performance.now();
      // yüklenirken ana iş parçacığı uzun süre meşgul olabilir: cömert zaman aşımı
      for (const [pid, t] of this.peers) if (now - t > TIMEOUT) { this.peers.delete(pid); this.onPeerClose(pid); }
    }, 1500);
  }

  connect(code) {
    return new Promise((res, rej) => {
      this.ch = new BroadcastChannel('kiyamet-room-' + code);
      const t = setTimeout(() => { this.ch.close(); rej(new Error('Oda bulunamadı. Kodu kontrol et (yerel test modunda oda aynı tarayıcıda açık olmalı).')); }, 2500);
      this.lastHost = performance.now();
      this.ch.onmessage = (ev) => {
        const m = ev.data;
        if (m.to && m.to !== this.id) return;
        if (m.k === 'accept' && !this.hostId) { this.hostId = m.from; clearTimeout(t); res(); return; }
        if (m.from !== this.hostId) return;
        this.lastHost = performance.now();
        if (m.k === 'data') this.onHostData(m.d);
        else if (m.k === 'close') { this.hostId = null; this.onHostClose(); }
      };
      this.post({ k: 'connect', from: this.id });
      this._hb = setInterval(() => {
        if (!this.hostId) return;
        this.post({ k: 'hb', from: this.id, to: this.hostId });
        if (performance.now() - this.lastHost > TIMEOUT) { this.hostId = null; this.onHostClose(); }
      }, 1500);
    });
  }

  send(pid, msg) { this.post({ k: 'data', from: this.id, to: pid, d: msg }); }
  sendHost(msg) { if (this.hostId) this.post({ k: 'data', from: this.id, to: this.hostId, d: msg }); }
  drop(pid) { this.peers.delete(pid); this.post({ k: 'close', from: this.id, to: pid }); }

  close() {
    if (this.closed) return;
    this.post({ k: 'close', from: this.id });
    this.closed = true;
    clearInterval(this._hb);
    window.removeEventListener('beforeunload', this._unload);
    if (this.ch) try { this.ch.close(); } catch { /* yoksay */ }
  }
}

// ============================================================================ PeerJS (WebRTC)
export class PeerTransport extends Base {
  constructor() {
    super();
    this.kind = 'peer';
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
  }

  static available() { return typeof window.Peer === 'function'; }

  makePeer(id) {
    // Varsayılan PeerJS bulut sinyal sunucusu + Google STUN
    return new window.Peer(id, { debug: 1, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } });
  }

  startHost(code) {
    return new Promise((res, rej) => {
      if (!PeerTransport.available()) { rej(new Error('Çok oyunculu kitaplık yüklenemedi. İnternet bağlantını kontrol et.')); return; }
      const peer = this.makePeer(PEER_PREFIX + code);
      this.peer = peer;
      let opened = false;
      const to = setTimeout(() => { if (!opened) { peer.destroy(); rej(new Error('Sinyal sunucusuna bağlanılamadı (zaman aşımı).')); } }, 15000);
      peer.on('open', (id) => { opened = true; clearTimeout(to); this.id = id; res(); });
      peer.on('error', (e) => {
        if (!opened) { clearTimeout(to); peer.destroy(); rej(e); return; }
        console.warn('PeerJS:', e.type, e.message);
      });
      peer.on('connection', (conn) => this.accept(conn));
      peer.on('call', (call) => this.onCall && this.onCall(call));
      peer.on('disconnected', () => { if (!this.closed) try { peer.reconnect(); } catch { /* yoksay */ } });
    });
  }

  accept(conn) {
    conn.on('open', () => { this.conns.set(conn.peer, conn); this.onPeerOpen(conn.peer); });
    conn.on('data', (d) => this.onPeerData(conn.peer, d));
    conn.on('close', () => { if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.onPeerClose(conn.peer); } });
    conn.on('error', (e) => console.warn('Bağlantı hatası', e));
  }

  connect(code) {
    return new Promise((res, rej) => {
      if (!PeerTransport.available()) { rej(new Error('Çok oyunculu kitaplık yüklenemedi. İnternet bağlantını kontrol et.')); return; }
      const peer = this.makePeer(undefined);
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch { /* yoksay */ } rej(new Error(msg)); };
      const to = setTimeout(() => fail('Odaya ulaşılamadı (zaman aşımı). Kod doğru mu, oda sahibi çevrimiçi mi?'), 16000);
      peer.on('open', (id) => {
        this.id = id;
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => { if (done) return; done = true; clearTimeout(to); res(); });
        conn.on('data', (d) => this.onHostData(d));
        conn.on('close', () => { if (!this.closed) this.onHostClose(); });
        conn.on('error', (e) => console.warn('Bağlantı hatası', e));
      });
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fail('Oda bulunamadı. Kodu kontrol et.');
        else if (!done) fail('Bağlantı hatası: ' + (e.message || e.type));
        else console.warn('PeerJS:', e.type);
      });
      peer.on('call', (call) => this.onCall && this.onCall(call));
      peer.on('disconnected', () => { if (!this.closed) try { peer.reconnect(); } catch { /* yoksay */ } });
    });
  }

  send(pid, msg) { const c = this.conns.get(pid); if (c && c.open) c.send(msg); }
  sendHost(msg) { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); }
  drop(pid) { const c = this.conns.get(pid); if (c) { this.conns.delete(pid); c.close(); } }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.conns.values()) try { c.close(); } catch { /* yoksay */ }
    if (this.hostConn) try { this.hostConn.close(); } catch { /* yoksay */ }
    if (this.peer) try { this.peer.destroy(); } catch { /* yoksay */ }
  }
}
