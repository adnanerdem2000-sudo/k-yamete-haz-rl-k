// Dinamik hava durumu (host otoriter). Takvime bağlı eğilim + rastgele geçişler.
// Görsel değerler Environment.weather nesnesine yumuşak geçişle yazılır; sıcaklık ihtiyaç sistemini etkiler.
import { RNG, clamp, lerp } from '../core/util.js';

export const WEATHER_TYPES = {
  clear: { name: 'Güneşli', icon: '☀️', rain: 0, cloud: 0.18, fog: 0, wind: 1, snow: 0, storm: 0, temp: 1 },
  cloudy: { name: 'Bulutlu', icon: '☁️', rain: 0, cloud: 0.72, fog: 0.05, wind: 1.3, snow: 0, storm: 0, temp: -2 },
  rain: { name: 'Yağmurlu', icon: '🌧️', rain: 0.75, cloud: 0.85, fog: 0.12, wind: 1.5, snow: 0, storm: 0, temp: -4 },
  storm: { name: 'Fırtınalı', icon: '⛈️', rain: 1, cloud: 0.95, fog: 0.18, wind: 2.6, snow: 0, storm: 1, temp: -6 },
  fog: { name: 'Sisli', icon: '🌫️', rain: 0, cloud: 0.55, fog: 1, wind: 0.4, snow: 0, storm: 0, temp: -3 },
  snow: { name: 'Karlı', icon: '❄️', rain: 0, cloud: 0.8, fog: 0.3, wind: 1.2, snow: 1, storm: 0, temp: -16 },
  heat: { name: 'Aşırı Sıcak', icon: '🔥', rain: 0, cloud: 0.04, fog: 0, wind: 0.5, snow: 0, storm: 0, temp: 13 },
};
const ALIAS = { güneşli: 'clear', sunny: 'clear', yağmur: 'rain', fırtına: 'storm', sis: 'fog', kar: 'snow', sicak: 'heat', hot: 'heat' };

export class Weather {
  constructor(session) {
    this.s = session;
    this.rng = new RNG(session.seed + ':wx');
    this.type = 'clear';
    this.remaining = 300; // oyun dakikası
    this.coldOffset = 0;
    this.forecast = [];
    this._sentCold = 0;
    session.onEvt('weather', (e) => {
      const changed = e.type !== this.type;
      this.type = e.type;
      this.remaining = e.rem;
      this.coldOffset = e.cold || 0;
      if (changed && !e.silent) this.announce();
    });
  }

  get def() { return WEATHER_TYPES[this.type] || WEATHER_TYPES.clear; }

  /** Ortam sıcaklığı (°C): günlük döngü + mevsim (gün ilerledikçe serinler) + hava + olay + yükseklik */
  get temperature() {
    const S = this.s;
    const m = S.time.minuteOfDay;
    const daily = Math.sin(((m - 9 * 60) / 1440) * Math.PI * 2) * 7;
    const season = -S.time.day * 0.18;
    const alt = S.local ? Math.max(0, S.local.pos.y - 20) * -0.14 : 0;
    return Math.round((17 + daily + season + this.def.temp + this.coldOffset + alt) * 10) / 10;
  }

  set(type, minutes = 240) {
    type = ALIAS[type] || type;
    if (!WEATHER_TYPES[type]) type = 'clear';
    if (!this.s.isHost) return;
    this.s.emit({ k: 'weather', type, rem: minutes, cold: this.coldOffset });
  }

  /** Yeni hava seçimi: günler ilerledikçe fırtına/sis artar, soğuk dalgasında kar mümkün */
  pick() {
    const S = this.s;
    const d = S.time.day;
    const cur = this.type;
    const w = [
      ['clear', cur === 'clear' ? 3 : 5],
      ['cloudy', 4],
      ['rain', 2.5 + d * 0.06],
      ['storm', d > 6 ? 0.6 + d * 0.04 : 0.2],
      ['fog', d > 4 ? 1.4 + d * 0.03 : 0.5],
      ['snow', this.coldOffset < -4 ? 2.5 : 0],
      ['heat', d < 12 && cur !== 'heat' ? 0.8 : 0.1],
    ].filter(([, v]) => v > 0);
    return this.rng.weighted(w);
  }

  update(dt, mins) {
    const S = this.s;
    if (S.isHost) {
      this.remaining -= mins;
      if (this.remaining <= 0) {
        const next = this.pick();
        const dur = next === 'storm' ? this.rng.int(90, 200) : next === 'heat' ? this.rng.int(240, 480) : this.rng.int(180, 420);
        this.set(next, dur);
      }
      if (this.coldOffset !== this._sentCold) { this._sentCold = this.coldOffset; S.emit({ k: 'weather', type: this.type, rem: this.remaining, cold: this.coldOffset, silent: true }); }
    }
    this.blend(dt);
  }

  /** İstemci de çağırır: Environment.weather değerlerine yumuşak geçiş */
  blend(dt) {
    const W = this.s.env.weather;
    const t = this.def;
    const k = Math.min(1, dt * 0.25);
    W.type = this.type;
    for (const key of ['rain', 'cloud', 'fog', 'wind', 'snow', 'storm']) W[key] = lerp(W[key] ?? 0, t[key], k);
    // final gecesi kızıl sis varken yağmur hafifler
    if (this.s.env.redMist > 0.3) W.rain = Math.min(W.rain, 0.3);
    W.rain = clamp(W.rain, 0, 1);
  }

  announce() {
    const S = this.s;
    const d = this.def;
    const tips = {
      rain: 'Yağmur başladı. Islanma vücut ısını düşürür — yağmurluk giy ya da içeride kal. Yağmur varilleri doluyor.',
      storm: 'FIRTINA! Görüş azaldı, sesler bastırılıyor. Zombiler seni daha zor duyar ama sen de onları.',
      fog: 'Yoğun sis çöktü. Görüş mesafesi çok kısa — dikkatli ol.',
      snow: 'Kar yağıyor! Soğuk çok tehlikeli: ateş yak, kalın giyin.',
      heat: 'Aşırı sıcak! Susuzluk çok daha hızlı artacak.',
      clear: 'Hava açıldı.',
      cloudy: 'Hava bulutlandı.',
    };
    S.ui.toast(`${d.icon} ${d.name}: ${tips[this.type] || ''}`, this.type === 'storm' || this.type === 'snow' ? 'warn' : 'info', 5);
  }

  /** HUD için kısa metin */
  label() { return `${this.def.icon} ${this.def.name} · ${Math.round(this.temperature)}°C`; }

  serialize() { return { type: this.type, rem: this.remaining, cold: this.coldOffset }; }
  load(o) {
    if (!o) return;
    this.type = WEATHER_TYPES[o.type] ? o.type : 'clear';
    this.remaining = o.rem ?? 240;
    this.coldOffset = o.cold || 0;
    this._sentCold = this.coldOffset;
    // görsel değerleri hemen uygula
    const W = this.s.env.weather;
    Object.assign(W, { ...this.def, type: this.type });
  }
}
