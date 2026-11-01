// Sesli sohbet: PeerJS medya çağrıları ile oyuncular arası örgü (mesh). Bas-konuş (V) varsayılan;
// "açık mikrofon" seçeneğinde ses eşiği (VAD) ile konuşma algılanır. Yalnızca PeerJS taşıyıcısında çalışır.
import * as THREE from 'three';
import { Settings } from '../core/Settings.js';

const _fw = new THREE.Vector3();

export class Voice {
  constructor(net) {
    this.net = net;
    this.stream = null;
    this.enabled = false;
    this.talking = false;
    this.calls = new Map(); // peerId → call
    this.audios = new Map(); // peerId → HTMLAudioElement
    this.level = 0;
    this.openMic = false;
    this.error = null;
    Settings.onChange((p) => { if (p === '*' || p.startsWith('audio')) { const v = Math.min(1, Settings.get('audio.voice') * Settings.get('audio.master')); for (const a of this.audios.values()) a.volume = v; if (this.spatial) for (const sp of this.spatial.values()) sp.gain.gain.value = v; } });
  }

  get supported() { return this.net.transport && this.net.transport.kind === 'peer' && !!navigator.mediaDevices; }

  async enable() {
    if (this.enabled) return true;
    if (!this.supported) { this.error = 'Sesli sohbet yalnızca çevrimiçi odalarda kullanılabilir.'; return false; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      this.error = 'Mikrofon izni verilmedi.';
      return false;
    }
    this.enabled = true;
    this.setTalking(false);
    // seviye ölçer (konuşma göstergesi ve açık mikrofon için)
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      this.meterStream = this.stream.clone(); // konuşma kapalıyken de seviye ölçülebilsin
      const src = ac.createMediaStreamSource(this.meterStream);
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.buf = new Uint8Array(this.analyser.fftSize);
      this.ac = ac;
    } catch { /* yoksay */ }
    this.net.transport.onCall = (call) => this.answer(call);
    this.sync();
    return true;
  }

  disable() {
    for (const c of this.calls.values()) try { c.close(); } catch { /* yoksay */ }
    this.calls.clear();
    for (const a of this.audios.values()) { a.srcObject = null; a.remove(); }
    this.audios.clear();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    if (this.meterStream) for (const t of this.meterStream.getTracks()) t.stop();
    this.stream = null; this.meterStream = null;
    this.enabled = false;
    if (this.ac) { this.ac.close(); this.ac = null; }
  }

  setTalking(on) {
    this.talking = on;
    if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = on;
  }

  /** Odadaki herkesle çağrı kur: kimliği küçük olan arar (çift çağrıyı önler) */
  sync() {
    if (!this.enabled || !this.net.room) return;
    const me = this.net.transport.id;
    for (const p of this.net.room.players) {
      if (!p.pid || p.pid === me || this.calls.has(p.pid)) continue;
      if (me < p.pid) {
        const call = this.net.transport.peer.call(p.pid, this.stream);
        if (call) this.track(call);
      }
    }
  }

  answer(call) {
    if (!this.enabled) { call.close(); return; }
    call.answer(this.stream);
    this.track(call);
  }

  track(call) {
    this.calls.set(call.peer, call);
    call.on('stream', (s) => {
      let a = this.audios.get(call.peer);
      if (!a) { a = document.createElement('audio'); a.autoplay = true; a.style.display = 'none'; document.body.appendChild(a); this.audios.set(call.peer, a); }
      a.srcObject = s;
      a.volume = Math.min(1, Settings.get('audio.voice') * Settings.get('audio.master'));
      a.play().catch(() => {});
      this.spatialize(call.peer, s, a);
    });
    call.on('close', () => { this.calls.delete(call.peer); const a = this.audios.get(call.peer); if (a) { a.srcObject = null; a.remove(); this.audios.delete(call.peer); } const sp = this.spatial && this.spatial.get(call.peer); if (sp) { try { sp.src.disconnect(); } catch { /* yoksay */ } this.spatial.delete(call.peer); } });
    call.on('error', () => this.calls.delete(call.peer));
  }

  /**
   * Yakınlık sesi: uzak oyuncunun sesi Web Audio ile 3B konumlandırılır (PannerNode, ters mesafe modeli).
   * <audio> ögesi sessize alınır (WebRTC sesinin akması için gerekli), ses grafikten çıkar. Telsiz: iki tarafta
   * da telsiz varsa mesafe sınırı yok (gain 1, yön yok).
   */
  spatialize(pid, stream, audioEl) {
    try {
      const ac = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      this.spatial = this.spatial || new Map();
      const src = ac.createMediaStreamSource(stream);
      const gain = ac.createGain();
      gain.gain.value = Math.min(1, Settings.get('audio.voice') * Settings.get('audio.master'));
      const pan = ac.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.maxDistance = 40; pan.rolloffFactor = 1.4;
      src.connect(gain); gain.connect(pan); pan.connect(ac.destination);
      audioEl.muted = true;
      this.spatial.set(pid, { src, gain, pan, radio: false, d: 0 });
    } catch (e) { /* Web Audio yoksa <audio> sesi olduğu gibi çalar */ }
  }

  /** Her kare: dinleyici = kamera; her uzak oyuncu için konum/gain (telsiz: mesafesiz) */
  updateSpatial(session) {
    if (!this.spatial || !this.spatial.size || !session || !this.ac) return;
    const cam = session.game.gfx.camera, L = this.ac.listener;
    const vol = Math.min(1, Settings.get('audio.voice') * Settings.get('audio.master'));
    const fw = cam.getWorldDirection(_fw);
    if (L.positionX) { L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z; L.forwardX.value = fw.x; L.forwardY.value = fw.y; L.forwardZ.value = fw.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); if (L.setOrientation) L.setOrientation(fw.x, fw.y, fw.z, 0, 1, 0); }
    const myRadio = session.inventory && session.inventory.has && session.inventory.has('radio');
    for (const [pid, sp] of this.spatial) {
      const p = this.net.room && this.net.room.players.find((q) => q.pid === pid);
      const rec = p && session.players.get(p.id);
      if (!rec) { sp.gain.gain.value = vol; continue; }
      const pos = rec.isLocal ? session.local.pos : rec.pos;
      const radio = myRadio && rec.summary && rec.summary.radio;
      sp.radio = !!radio;
      const d = Math.hypot(pos.x - cam.position.x, pos.z - cam.position.z);
      sp.d = d;
      if (radio) { sp.pan.positionX ? (sp.pan.positionX.value = cam.position.x, sp.pan.positionY.value = cam.position.y, sp.pan.positionZ.value = cam.position.z) : sp.pan.setPosition(cam.position.x, cam.position.y, cam.position.z); sp.gain.gain.value = vol * 0.9; }
      else { sp.pan.positionX ? (sp.pan.positionX.value = pos.x, sp.pan.positionY.value = pos.y + 1.5, sp.pan.positionZ.value = pos.z) : sp.pan.setPosition(pos.x, pos.y + 1.5, pos.z); sp.gain.gain.value = vol * (d > 35 ? 0 : 1); }
    }
  }

  /** Her kare: bas-konuş tuşu / açık mikrofon */
  update(input, typing) {
    if (!this.enabled) return;
    let want = false;
    if (this.openMic) {
      if (this.analyser) {
        this.analyser.getByteTimeDomainData(this.buf);
        let s = 0; for (const v of this.buf) s += ((v - 128) / 128) ** 2;
        this.level = Math.sqrt(s / this.buf.length);
        want = this.level > Settings.get('audio.micGate');
      }
    } else want = !typing && input.isDown('voice');
    if (want !== this.talking) this.setTalking(want);
  }
}
