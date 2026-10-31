// Ses yöneticisi: Web Audio. Kanallar: genel, müzik, efekt, ortam, sesli sohbet.
// CC0 Kenney sesleri + prosedürel sentez (silah, zombi, kapı, cam, siren, rüzgâr, yağmur, ateş, jeneratör)
// + dinamik prosedürel müzik (sakin → keşif → tehlike → savaş).
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

  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

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
      src.connect(this.out(bus, vol, sp.pan));
      src.start();
      return src;
    }
    const fn = this.synth[name];
    if (fn) fn.call(this, vol, sp.pan, o);
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
    S.bark = (v, p) => { const c = self.ctx; for (let i = 0; i < 2; i++) { const t = c.currentTime + i * 0.18; const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.1); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; const g = c.createGain(); self.env(g, t, 0.005, v * 0.35, 0.12); o.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t); o.stop(t + 0.15); } };
    S.door = (v, p) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.6); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 18; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(900 + Math.random() * 400, t + 0.45); const g = c.createGain(); self.env(g, t, 0.05, v * 0.6, 0.45); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.6); };
    S.bash = (v, p) => { S.hit(v * 1.2, p); const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.3); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = c.createGain(); self.env(g, t, 0.002, v * 0.7, 0.25); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random()); n.stop(t + 0.3); };
    S.glass = (v, p) => { const c = self.ctx, t = c.currentTime; for (let i = 0; i < 6; i++) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2500 + Math.random() * 4000; const g = c.createGain(); self.env(g, t + i * 0.02, 0.001, v * 0.12, 0.3 + Math.random() * 0.4); o.connect(g); g.connect(self.out('sfx', 1, p)); o.start(t + i * 0.02); o.stop(t + 1); } const n = self.noiseSrc(0.3); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; const g = c.createGain(); self.env(g, t, 0.001, v * 0.6, 0.25); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t); n.stop(t + 0.3); };
    S.step = (v, p, o = {}) => { const c = self.ctx, t = c.currentTime; const n = self.noiseSrc(0.1); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.surface === 'wood' ? 900 : o.surface === 'hard' ? 2400 : 600; const g = c.createGain(); self.env(g, t, 0.002, v * 0.35, 0.07); n.connect(f); f.connect(g); g.connect(self.out('sfx', 1, p)); n.start(t, Math.random() * 1.5); n.stop(t + 0.1); };
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
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { g.connect(pan); pan.connect(this.bus[o.bus || 'sfx']); } else g.connect(this.bus[o.bus || 'sfx']);
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
      L.kind = kind;
      this.loops.set(id, L);
    }
    const sp = this.spatial(o.at, o.range || 40);
    const target = (o.vol ?? 1) * sp.gain;
    L.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
    if (L.pan) L.pan.pan.setTargetAtTime(sp.pan, this.ctx.currentTime, 0.1);
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
  }

  scheduleMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.08;
    const I = this.intensity;
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
