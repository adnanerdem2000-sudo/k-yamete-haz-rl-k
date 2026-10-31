// Sesli sohbet: PeerJS medya çağrıları ile oyuncular arası örgü (mesh). Bas-konuş (V) varsayılan;
// "açık mikrofon" seçeneğinde ses eşiği (VAD) ile konuşma algılanır. Yalnızca PeerJS taşıyıcısında çalışır.
import { Settings } from '../core/Settings.js';

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
    Settings.onChange((p) => { if (p === '*' || p.startsWith('audio')) for (const a of this.audios.values()) a.volume = Math.min(1, Settings.get('audio.voice') * Settings.get('audio.master')); });
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
    });
    call.on('close', () => { this.calls.delete(call.peer); const a = this.audios.get(call.peer); if (a) { a.srcObject = null; a.remove(); this.audios.delete(call.peer); } });
    call.on('error', () => this.calls.delete(call.peer));
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
