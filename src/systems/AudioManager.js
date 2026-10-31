// Ses yöneticisi: Web Audio. Kanallar: genel, müzik, efekt, ortam, sesli sohbet.
// CC0 Kenney sesleri + prosedürel sentez (silah, zombi, kapı, cam, siren, rüzgâr, yağmur, ateş, jeneratör)
// + dinamik prosedürel müzik (sakin → keşif → tehlike → savaş) + çatışmada CC0 savaş teması.
// Konumsal ses: HRTF (baş ilişkili aktarım) ile yön, kendi mesafe eğrimizle kazanç, mesafeyle tiz kaybı
// (hava sönümü), görüş hattı kapalıysa boğuklaşma (oklüzyon), iç mekânda daha güçlü yankı (konvolüsyon).
import { Settings } from '../core/Settings.js';

const SCALE = [57, 60, 62, 64, 67, 69, 72, 74, 76]; // A minör pentatonik (MIDI)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62], [57, 60, 64], [52, 55, 59], [53, 57, 60], [50, 53, 57]];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SOUND_ALIAS = { jump: 'jump_a', craft: 'build', open: 'pickup', close: 'toggle' };

export class AudioManager {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.buffers = {};
    this.loops = new Map();
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.intensity = 0; this.targetIntensity = 0;
    this.musicMode = 'menu';
    this.enabled = true;
    this.occluder = null; // (at) → görüş hattı kapalı mı (oturum bağlar)
    this.occBudget = 0;
    this.indoor = false;
    Settings.onChange((p) => { if (p === '*' || p.startsWith('audio')) this.applyVolumes(); });
  }

  /** Kullanıcı etkileşimiyle başlat (tarayıcı kısıtı) */
  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.comp.connect(this.master);
    this.bus = {};
    for (const k of ['music', 'sfx', 'ambient', 'voice']) { this.bus[k] = c.createGain(); this.bus[k].connect(this.comp); }
    this.applyVolumes();
    this.hrtf = typeof c.createPanner === 'function';
    // yankı: üretilmiş darbe yanıtı (erken yansımalar + üstel sönüm); efekt kanalından gönderme
    this.verb = c.createConvolver();
    this.verb.buffer = this.makeIR(2.0, 3.0);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0.05;
    const vlp = c.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 4500;
    this.bus.sfx.connect(this.verbSend); this.verbSend.connect(this.verb); this.verb.connect(vlp); vlp.connect(this.comp);
    // gürültü tamponu
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // örnekleri çöz
    const raw = this.game.assets.sounds;
    await Promise.all(Object.entries(raw).map(async ([k, ab]) => {
      try { this.buffers[k] = await c.decodeAudioData(ab.slice(0)); } catch (e) { /* desteklenmeyen biçim */ }
    }));
    this.startMusic();
    if (c.state === 'suspended') await c.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const a = Settings.get('audio');
    this.master.gain.value = a.master;
    this.bus.music.gain.value = a.music * 0.55;
    this.bus.sfx.gain.value = a.sfx;
    this.bus.ambient.gain.value = a.ambient * 0.8;
    this.bus.voice.gain.value = a.voice;
  }

  setListener(x, y, z, yaw) {
    const L = this.listener;
    L.x = x; L.y = y; L.z = z; L.yaw = yaw;
    this.occBudget = 6; // kare başına en fazla 6 oklüzyon ışını
    const c = this.ctx;
    if (!c) return;
    const al = c.listener, fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (al.positionX) {
      const t = c.currentTime;
      al.positionX.setValueAtTime(x, t); al.positionY.setValueAtTime(y, t); al.positionZ.setValueAtTime(z, t);
      al.forwardX.setValueAtTime(fx, t); al.forwardY.setValueAtTime(0, t); al.forwardZ.setValueAtTime(fz, t);
      al.upX.setValueAtTime(0, t); al.upY.setValueAtTime(1, t); al.upZ.setValueAtTime(0, t);
    } else if (al.setPosition) { al.setPosition(x, y, z); al.setOrientation(fx, 0, fz, 0, 1, 0); }
  }

  /** İç mekân: yankı daha güçlü (küçük oda), dışarıda hafif */
  setEnvironment(indoor) {
    if (!this.ctx || indoor === this.indoor) return;
    this.indoor = indoor;
    this.verbSend.gain.setTargetAtTime(indoor ? 0.3 : 0.05, this.ctx.currentTime, 0.35);
  }

  /** Darbe yanıtı: stereo, erken yansımalar + üstel sönen gürültü kuyruğu */
  makeIR(seconds, decay) {
    const c = this.ctx, rate = c.sampleRate, len = Math.floor(rate * seconds);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.6; }
      for (let k = 0; k < 7; k++) { const i = Math.floor(rate * (0.008 + k * 0.011 + Math.random() * 0.006)); if (i < len) d[i] += (Math.random() < 0.5 ? -1 : 1) * (0.8 - k * 0.09); }
    }
    return buf;
  }

  /** Görüş hattı kapalı mı (kare başına sınırlı ışın) */
  occluded(at) {
    if (!this.occluder || this.occBudget <= 0) return false;
    this.occBudget--;
    try { return !!this.occluder(at); } catch { return false; }
  }

  /** Panner: konum ayarı (eski tarayıcılar için setPosition) */
  setPannerPos(p, at) {
    const y = at.y ?? this.listener.y;
    if (p.positionX) { const t = this.ctx.currentTime; p.positionX.setValueAtTime(at.x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(at.z, t); } else p.setPosition(at.x, y, at.z);
  }

  /**
   * Konumsal yönlendirme: kaynak → [alçak geçiren: hava sönümü / oklüzyon] → kazanç → HRTF panner → kanal.
   * Dönüş: kaynağın bağlanacağı düğüm.
   */
  route(bus, gainV, at, sp, o = {}) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gainV;
    let head = g;
    const range = o.range || 45;
    if (sp.d > 2.5) {
      const occl = sp.d > 4 && this.occluded(at);
      const cut = (17000 - Math.min(1, sp.d / range) * 13000) * (occl ? 0.1 : 1);
      if (cut < 15000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(260, cut); f.Q.value = 0.5; f.connect(g); head = f; }
      if (occl) g.gain.value = gainV * 0.55;
    }
    if (this.hrtf) {
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 10000;
      this.setPannerPos(p, at);
      g.connect(p); p.connect(this.bus[bus]);
    } else {
      const pn = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pn) { pn.pan.value = sp.pan; g.connect(pn); pn.connect(this.bus[bus]); } else g.connect(this.bus[bus]);
    }
    return head;
  }

  /** Konumsal kazanç ve pan */
  spatial(at, range = 40) {
    if (!at) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = at.x - L.x, dz = at.z - L.z, dy = (at.y || 0) - L.y;
    const d = Math.hypot(dx, dy, dz);
    const gain = Math.max(0, 1 - d / range) ** 1.6;
    const ang = Math.atan2(dx, dz) - L.yaw;
    const pan = Math.max(-1, Math.min(1, Math.sin(ang) * -0.85));
    return { gain, pan, d };
  }

  out(bus, gainV, pan) {
    const cur = this._cur;
    if (cur) return this.route(cur.bus || bus, gainV, cur.at, cur.sp, cur.o);
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gainV;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.bus[bus]); } else g.connect(this.bus[bus]);
    return g;
  }

  /** Örnek ya da sentez sesi çal */
  play(name, o = {}) {
    if (!this.ctx || !this.enabled) return;
    name = SOUND_ALIAS[name] || name;
    const sp = this.spatial(o.at, o.range || 45);
    if (sp.gain <= 0.01) return;
    const vol = (o.vol ?? 1) * sp.gain;
    const bus = o.bus || 'sfx';
    if (this.buffers[name]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.1));
      src.connect(o.at ? this.route(bus, vol, o.at, sp, o) : this.out(bus, vol, sp.pan));
      src.start();
      return src;
    }
    const fn = this.synth[name];
    if (fn) {
      // sentez sesleri out() üzerinden bağlanır: konumluysa aynı HRTF/süzgeç yolundan geçsin
      this._cur = o.at ? { at: o.at, sp, o } : null;
      try { fn.call(this, vol, sp.pan, o); } finally { this._cur = null; }
    }
  }

  /** Ayak sesi: zemine göre örnek ya da sentez; koşarken yüksek, çömelirken kısık */
  footstep(at, surface, speed, crouch) {
    if (!this.ctx) return;
    const vol = (crouch ? 0.1 : speed > 4.2 ? 0.32 : 0.2);
    if ((surface === 'hard' || surface === 'tile' || surface === 'metal') && this.buffers.step_hard) {
      this.play('step_hard', { at, vol: vol * 1.15, rate: surface === 'metal' ? 1.3 : surface === 'tile' ? 1.12 : 0.92, vary: 0.14, range: 26 });
      if (surface === 'metal') this.play('step', { at, vol: vol * 0.5, surface: 'metal', range: 26 });
    } else this.play('step', { at, vol, surface, range: 22 });
    if (surface === 'water') this.play('splash', { at, vol: vol * 1.3, range: 24 });
  }

  env(g, t0, a, peak, dec, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(end, t0 + a + dec);
  }

  noiseSrc(dur, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.playbackRate.value = rate;
    s.loopStart = Math.random(); s.loop = dur > 1.5;
    return s;
  }

  get synth() {
    if (this._synth) return this._synth;
    const S = this._synth = {};
    const self = this;
    const shot = (vol, pan, f0, dur, thump, sharp = 1) => {
      const c = self.ctx, t = c.currentTime;
      const n = self.noiseSrc(dur); const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(f0 * sharp, t); bp.frequency.exponentialRampToValueAtTime(300, t + dur);
      const g = c.createGain(); self.env(g, t, 0.002, vol, dur);
      n.connect(bp); bp.connect(g); g.connect(self.out('sfx', 1, pan)); n.start(t, Math.random()); n.stop(t + dur + 0.05);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g2 = c.createGain(); self.env(g2, t, 0.003, vol * 0.9, 0.22);
      o.connect(g2); g2.connect(self.out('sfx', 1, pan)); o.start(t); o.stop(t + 0.3);
    };
    S.pistol = (v, p) => shot(v * 0.9, p, 5000, 0.35, 150);
    S.rifle = (v, p) => shot(v, p, 7000, 0.6, 110, 1.2);
    S.shotgun = (v, p) => shot(v * 1.1, p, 3500, 0.75, 90);
    S.smg = (v, p) => shot(v * 0.7, p, 6000, 0.22, 160);
    S.bow = (v, p) => { const c = self.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.15); const g = c.createGain(); self.env(g, t, 0.002, v * 0.4, 0.18); o.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.25); S.swing(v * 0.6, p); };
    S.empty = (v, p) => { const c = self.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1800; const g = c.createGain(); self.env(g, t, 0.001, v * 0.15, 0.04); o.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.06); };
    S.swing = (v, p) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.3); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.12); f.frequency.exponentialRampToValueAtTime(600, t + 0.25); const g = c.createGain(); self.env(g, t, 0.05, v * 0.5, 0.2); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.3); };
    S.hit = (v, p) => { const c = self.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12); const g = c.createGain(); self.env(g, t, 0.002, v * 0.9, 0.16); o.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.2); const n = self.noiseSrc(0.1); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; const g2 = c.createGain(); self.env(g2, t, 0.001, v * 0.5, 0.06); n.connect(f); f.connect(g2); g2.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.1); };
    S.groan = (v, p, o = {}) => {
      const c = self.ctx, t = c.currentTime, dur = 0.7 + Math.random() * 0.9;
      const base = (o.pitch || 1) * (70 + Math.random() * 45);
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(base, t); osc.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.5), t + dur);
      const lfo = c.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4; const lg = c.createGain(); lg.gain.value = base * 0.06; lfo.connect(lg); lg.connect(osc.frequency);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 + Math.random() * 300; f1.Q.value = 4;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1400;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.55, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(f1); f1.connect(f2); f2.connect(g); g.connect(self.out('sfx', 1, p));
      osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    };
    S.zattack = (v, p) => S.groan(v * 1.3, p, { pitch: 1.5 });
    S.zdeath = (v, p) => S.groan(v * 1.1, p, { pitch: 0.7 });
    // çığlıkçı: tiz, titreşimli, uzun çığlık + hırıltı
    S.scream = (v, p) => {
      const c = self.ctx, t = c.currentTime, dur = 1.5;
      for (const [f0, f1, type, g0] of [[620, 980, 'sawtooth', 0.22], [1240, 1700, 'square', 0.08]]) {
        const o = c.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + 0.35); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
        const lfo = c.createOscillator(); lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
        const g = c.createGain(); self.env(g, t, 0.04, v * g0, dur);
        o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
      }
      const n = self.noiseSrc(dur); const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2200; const ng = c.createGain(); self.env(ng, t, 0.05, v * 0.12, dur);
      n.connect(nf); nf.connect(ng); ng.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + dur);
    };
    S.bark = (v, p) => { const c = self.ctx; for (let i = 0; i < 2; i++) { const t = c.currentTime + i * 0.18; const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.1); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; const g = c.createGain(); self.env(g, t, 0.005, v * 0.35, 0.12); o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.15); } };
    S.door = (v, p) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.6); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 18; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(900 + Math.random() * 400, t + 0.45); const g = c.createGain(); self.env(g, t, 0.05, v * 0.6, 0.45); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.6); };
    S.bash = (v, p) => { S.hit(v * 1.2, p); const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.3); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); self.env(g, t, 0.002, v * 0.7, 0.25); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.3); };
    S.glass = (v, p) => { const c = self.ctx, t = c.currentTime; for (let i = 0; i < 6; i++) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2500 + Math.random() * 4000; const g = c.createGain(); self.env(g, t + i * 0.02, 0.001, v * 0.12, 0.3 + Math.random() * 0.4); o.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t + i * 0.02); o.stop(t + 1); } const n = self.noiseSrc(0.3); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; const g = c.createGain(); self.env(g, t, 0.001, v * 0.6, 0.25); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t); n.stop(t + 0.3); };
    // ayak sesi: zemine göre süzgeç/uzunluk; ahşapta boğuk tok ses, metalde çınlama, kumda/çimde hışırtı
    const STEP = { grass: ['bandpass', 1900, 0.8, 0.09, 0], dirt: ['lowpass', 1000, 0.7, 0.07, 70], gravel: ['bandpass', 2600, 1.2, 0.08, 60], sand: ['highpass', 2400, 0.6, 0.12, 0], wood: ['lowpass', 750, 1.1, 0.06, 110], hard: ['lowpass', 2400, 0.8, 0.05, 90], tile: ['bandpass', 3000, 1.4, 0.04, 120], metal: ['bandpass', 3400, 9, 0.12, 0], water: ['bandpass', 1300, 1.0, 0.16, 0], snow: ['lowpass', 1400, 0.7, 0.1, 0] };
    S.step = (v, p, o = {}) => {
      const c = self.ctx, t = c.currentTime;
      const [type, fq, q, dur, thump] = STEP[o.surface] || STEP.grass;
      const n = self.noiseSrc(dur + 0.05); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = fq * (0.85 + Math.random() * 0.3); f.Q.value = q;
      const g = c.createGain(); self.env(g, t, 0.003, v * 0.4, dur);
      const dst = self.out('sfx', 1, p);
      n.connect(f); f.connect(g); g.connect(dst); n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
      if (thump) { const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(thump * 1.6, t); o2.frequency.exponentialRampToValueAtTime(thump * 0.6, t + 0.06); const g2 = c.createGain(); self.env(g2, t, 0.002, v * 0.35, 0.07); o2.connect(g2); g2.connect(dst); o2.start(t); o2.stop(t + 0.1); }
    };
    S.click = (v) => { const c = self.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.05); const g = c.createGain(); self.env(g, t, 0.001, v * 0.25, 0.06); o.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.08); };
    S.success = (v) => { const c = self.ctx; [0, 4, 7, 12].forEach((s, i) => { const t = c.currentTime + i * 0.07; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(72 + s); const g = c.createGain(); self.env(g, t, 0.005, v * 0.22, 0.35); o.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.4); }); };
    S.alert = (v) => { const c = self.ctx; [0, 0.25].forEach((d) => { const t = c.currentTime + d; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 880; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2000; const g = c.createGain(); self.env(g, t, 0.01, v * 0.18, 0.18); o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.2); }); };
    S.heartbeat = (v) => { const c = self.ctx; [0, 0.22].forEach((d, i) => { const t = c.currentTime + d; const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(i ? 55 : 65, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.15); const g = c.createGain(); self.env(g, t, 0.01, v * 0.7, 0.18); o.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.25); }); };
    S.thunder = (v) => { const c = self.ctx, t = c.currentTime + 0.4 + Math.random(); const n = self.noiseSrc(4); n.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(80, t + 3); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); n.connect(f); f.connect(g); g.connect(self.out('ambient', 1, Math.random() - 0.5)); n.start(t); n.stop(t + 3.6); };
    S.explosion = (v, p) => { shot(v * 1.4, p, 1500, 1.6, 70); S.thunder(v * 0.5); };
    S.siren = (v, p) => { const c = self.ctx, t = c.currentTime, dur = 5; const o = c.createOscillator(); o.type = 'sine'; const l = c.createOscillator(); l.frequency.value = 0.35; const lg = c.createGain(); lg.gain.value = 220; l.connect(lg); lg.connect(o.frequency); o.frequency.value = 700; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.08, t + 1); g.gain.linearRampToValueAtTime(0.0001, t + dur); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; o.connect(f); f.connect(g); g.connect(self.out('ambient', 1, p)); o.start(t); l.start(t); o.stop(t + dur); l.stop(t + dur); };
    S.radio = (v) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(1.2); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; const g = c.createGain(); self.env(g, t, 0.02, v * 0.25, 1.0); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, 0)); n.start(t, Math.random()); n.stop(t + 1.2); };
    S.eat = (v, p) => { for (let i = 0; i < 3; i++) setTimeout(() => S.step(v * 0.6, p, { surface: 'hard' }), i * 220); };
    S.build = (v, p) => { for (let i = 0; i < 2; i++) setTimeout(() => S.hit(v * 0.6, p), i * 180); };
    S.horn = (v, p) => { const c = self.ctx, t = c.currentTime; for (const fr of [392, 494]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.15, t + 0.02); g.gain.setValueAtTime(v * 0.15, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.6); } };
    S.splash = (v, p) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.5); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; const g = c.createGain(); self.env(g, t, 0.01, v * 0.5, 0.4); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.5); };
    S.error = (v) => { const c = self.ctx; [0, 0.12].forEach((d) => { const t = c.currentTime + d; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 180; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = c.createGain(); self.env(g, t, 0.005, v * 0.2, 0.09); o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.12); }); };
    S.fire_whoosh = (v, p) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.8); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.3); f.frequency.exponentialRampToValueAtTime(400, t + 0.7); const g = c.createGain(); self.env(g, t, 0.08, v * 0.5, 0.6); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.8); };
    S.hover = (v) => { const c = self.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1400; const g = c.createGain(); self.env(g, t, 0.001, v * 0.06, 0.03); o.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.05); };
    S.ready = (v) => { const c = self.ctx; [0, 7].forEach((s, i) => { const t = c.currentTime + i * 0.09; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(67 + s); const g = c.createGain(); self.env(g, t, 0.005, v * 0.2, 0.25); o.connect(g); g.connect(self.out('sfx', 1, 0)); o.start(t); o.stop(t + 0.3); }); };
    return S;
  }

  thunder() { if (this.ctx) this.synth.thunder(0.8); }

  // ---------------------------------------------------------------- sürekli döngüler (motor, jeneratör, yağmur, rüzgâr, ateş)
  loop(id, kind, o = {}) {
    if (!this.ctx) return null;
    let L = this.loops.get(id);
    if (!L) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0;
      let pan = null, hp = null, lp = null;
      if (o.at && this.hrtf) {
        // konumsal döngü: kazanç → alçak geçiren (hava/oklüzyon) → HRTF panner → kanal
        lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000;
        hp = c.createPanner(); hp.panningModel = 'HRTF'; hp.distanceModel = 'linear'; hp.rolloffFactor = 0; hp.refDistance = 1; hp.maxDistance = 10000;
        this.setPannerPos(hp, o.at);
        g.connect(lp); lp.connect(hp); hp.connect(this.bus[o.bus || 'sfx']);
      } else {
        pan = c.createStereoPanner ? c.createStereoPanner() : null;
        if (pan) { g.connect(pan); pan.connect(this.bus[o.bus || 'sfx']); } else g.connect(this.bus[o.bus || 'sfx']);
      }
      let src;
      if (kind === 'engine' || kind === 'engine-motorcycle') {
        src = c.createBufferSource(); src.buffer = this.buffers[kind] || this.buffers.engine; src.loop = true; src.connect(g); src.start();
      } else if (kind === 'rain' || kind === 'wind' || kind === 'fire' || kind === 'static') {
        src = this.noiseSrc(4); src.loop = true;
        const f = c.createBiquadFilter();
        f.type = kind === 'rain' ? 'highpass' : kind === 'wind' ? 'bandpass' : 'bandpass';
        f.frequency.value = kind === 'rain' ? 1800 : kind === 'wind' ? 380 : kind === 'static' ? 2000 : 900;
        f.Q.value = kind === 'wind' ? 0.6 : 1;
        src.connect(f); f.connect(g); src.start();
        L = { g, pan, src, f };
      } else if (kind === 'generator') {
        src = c.createOscillator(); src.type = 'square'; src.frequency.value = 48;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; src.connect(f); f.connect(g); src.start();
      } else if (kind === 'ambience' && this.buffers.ambience) {
        src = c.createBufferSource(); src.buffer = this.buffers.ambience; src.loop = true; src.connect(g); src.start();
      } else return null;
      L = L || { g, pan, src };
      L.pan = pan; L.hp = hp; L.lp = lp;
      L.kind = kind;
      this.loops.set(id, L);
    }
    const sp = this.spatial(o.at, o.range || 40);
    let target = (o.vol ?? 1) * sp.gain;
    const now = this.ctx.currentTime;
    if (L.hp && o.at) {
      this.setPannerPos(L.hp, o.at);
      // oklüzyon: en fazla 0.35 sn'de bir ışın
      if (!(L.occT > now - 0.35)) { L.occT = now; L.occl = sp.gain > 0.01 && sp.d > 4 && this.occluded(o.at); }
      const cut = (17000 - Math.min(1, sp.d / (o.range || 40)) * 12000) * (L.occl ? 0.12 : 1);
      L.lp.frequency.setTargetAtTime(Math.max(300, cut), now, 0.15);
      if (L.occl) target *= 0.6;
    }
    L.g.gain.setTargetAtTime(target, now, 0.12);
    if (L.pan) L.pan.pan.setTargetAtTime(sp.pan, now, 0.1);
    if (o.rate && L.src.playbackRate) L.src.playbackRate.setTargetAtTime(o.rate, this.ctx.currentTime, 0.08);
    if (kind === 'fire' && L.f) L.f.frequency.value = 600 + Math.random() * 900;
    return L;
  }
  stopLoop(id) {
    const L = this.loops.get(id);
    if (!L) return;
    try { L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); setTimeout(() => { try { L.src.stop(); } catch { /* */ } }, 400); } catch { /* */ }
    this.loops.delete(id);
  }
  stopAllLoops() { for (const id of [...this.loops.keys()]) this.stopLoop(id); }

  // ---------------------------------------------------------------- prosedürel müzik
  setIntensity(v) { this.targetIntensity = Math.max(0, Math.min(1, v)); }
  setMusicMode(m) { this.musicMode = m; }

  startMusic() {
    const c = this.ctx;
    this.musicGain = c.createGain(); this.musicGain.gain.value = 1;
    this.musicGain.connect(this.bus.music);
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.musicGain);
    this.delay = c.createDelay(1.0); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.32; this.delay.connect(fb); fb.connect(this.delay);
    const wet = c.createGain(); wet.gain.value = 0.35; this.delay.connect(wet); wet.connect(this.musicGain);
    this.nextBar = c.currentTime + 0.2;
    this.bar = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 200);
    // çatışma teması (CC0, "Battle Theme A" — cynicmusic): akış olarak çalınır, sürü/savaşta açılır
    try {
      const el = new Audio(`${this.game.assets.base || ''}assets/audio/music/battle_theme_a.mp3`);
      el.loop = true; el.preload = 'none';
      this.battleEl = el;
      this.battleGain = c.createGain(); this.battleGain.gain.value = 0;
      c.createMediaElementSource(el).connect(this.battleGain);
      this.battleGain.connect(this.bus.music);
      this.battleHi = 0; this.battleLo = 0;
    } catch { this.battleEl = null; }
  }

  /** Savaş teması: yoğunluk 3 sn yüksek kalırsa açılır, 10 sn düşük kalırsa söner */
  updateBattle(I) {
    const el = this.battleEl, c = this.ctx;
    if (!el) return;
    const fight = this.musicMode !== 'menu' && I > 0.68;
    this.battleHi = fight ? this.battleHi + 0.2 : 0;
    this.battleLo = !fight ? this.battleLo + 0.2 : 0;
    if (this.battleHi > 3 && !this.battleOn) {
      this.battleOn = true;
      el.play().catch(() => { this.battleOn = false; });
      this.battleGain.gain.setTargetAtTime(0.85, c.currentTime, 1.2);
      this.musicGain.gain.setTargetAtTime(0.25, c.currentTime, 1.5);
    } else if (this.battleOn && this.battleLo > 10) {
      this.battleOn = false;
      this.battleGain.gain.setTargetAtTime(0, c.currentTime, 1.6);
      this.musicGain.gain.setTargetAtTime(1, c.currentTime, 2);
      setTimeout(() => { if (!this.battleOn) el.pause(); }, 7000);
    }
  }

  scheduleMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.08;
    const I = this.intensity;
    this.updateBattle(I);
    const barLen = this.musicMode === 'menu' ? 4.8 : I > 0.7 ? 2.0 : I > 0.35 ? 3.2 : 4.4;
    while (this.nextBar < c.currentTime + 0.6) {
      const t = this.nextBar;
      const chord = CHORDS[this.bar % CHORDS.length];
      // ped
      for (const n of chord) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n - 12); o.detune.value = det;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + barLen * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + barLen * 1.05);
          o.connect(g); g.connect(this.padFilter); o.start(t); o.stop(t + barLen * 1.1);
        }
      }
      this.padFilter.frequency.setTargetAtTime(700 + I * 1500, t, 1);
      // melodi (sakin modda seyrek, menüde gitar benzeri)
      const notes = this.musicMode === 'menu' ? 6 : I < 0.4 ? 3 : 4;
      for (let i = 0; i < notes; i++) {
        if (Math.random() < (this.musicMode === 'menu' ? 0.75 : 0.45)) {
          const nt = t + (i * barLen) / notes;
          const m = SCALE[Math.floor(Math.random() * SCALE.length)];
          const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(m);
          const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = midi(m + 12);
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, nt); g.gain.exponentialRampToValueAtTime(0.05, nt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, nt + 1.6);
          o.connect(g); o2.connect(g); g.connect(this.musicGain); g.connect(this.delay);
          o.start(nt); o2.start(nt); o.stop(nt + 1.7); o2.stop(nt + 1.7);
        }
      }
      // gerilim: bas nabzı
      if (I > 0.3 && this.musicMode !== 'menu') {
        const beats = I > 0.7 ? 8 : 4;
        for (let b = 0; b < beats; b++) {
          const bt = t + (b * barLen) / beats;
          const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(midi(chord[0] - 24), bt);
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, bt); g.gain.exponentialRampToValueAtTime(0.09 * I, bt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.3);
          o.connect(g); g.connect(this.musicGain); o.start(bt); o.stop(bt + 0.35);
        }
      }
      // savaş: davul
      if (I > 0.65 && this.musicMode !== 'menu') {
        for (let b = 0; b < 8; b++) {
          const bt = t + (b * barLen) / 8;
          if (b % 4 === 0 || b % 4 === 3) { const o = c.createOscillator(); o.frequency.setValueAtTime(130, bt); o.frequency.exponentialRampToValueAtTime(40, bt + 0.15); const g = c.createGain(); g.gain.setValueAtTime(0.0001, bt); g.gain.exponentialRampToValueAtTime(0.25, bt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.2); o.connect(g); g.connect(this.musicGain); o.start(bt); o.stop(bt + 0.25); }
          if (b % 4 === 2) { const n = this.noiseSrc(0.2); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200; const g = c.createGain(); g.gain.setValueAtTime(0.0001, bt); g.gain.exponentialRampToValueAtTime(0.12, bt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.15); n.connect(f); f.connect(g); g.connect(this.musicGain); n.start(bt, Math.random()); n.stop(bt + 0.2); }
        }
      }
      this.nextBar += barLen;
      this.bar++;
    }
  }
}
