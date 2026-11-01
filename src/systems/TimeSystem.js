// 30 günlük geri sayım ve gün/gece saati (saf mantık). Zamanı yalnızca ev sahibi (host) ilerletir;
// istemciler anlık görüntülerle eşitlenir. Bir oyun günü varsayılan 24 gerçek dakika.
export const FINAL_DAY = 30;
export const FINAL_MINUTE = 22 * 60; // 30. gün 22:00 — "Son Işık"
export const DAY_START = 6 * 60, NOON = 12 * 60, EVENING = 17 * 60, NIGHT = 21 * 60;
// zombi saatleri: alacakaranlıkta (20:30) topraktan çıkarlar, şafakta (06:00) toprağa dönerler (isNight ile aynı aralık).
// Gündüz yağma zamanıdır; gündüz tehditleri yağmacılar, başıboş köpekler ve öğle sıcağıdır (DayThreats, PlayerStats).
export const DUSK = NIGHT - 30, DAWN = DAY_START;

export function phaseOf(minuteOfDay) {
  if (minuteOfDay >= DAY_START && minuteOfDay < NOON) return 'Sabah';
  if (minuteOfDay >= NOON && minuteOfDay < EVENING) return 'Öğle';
  if (minuteOfDay >= EVENING && minuteOfDay < NIGHT) return 'Akşam';
  return 'Gece';
}

export class TimeSystem {
  constructor(opts = {}) {
    this.dayMinutes = opts.dayMinutes || 24; // gerçek dakika / oyun günü
    this.total = opts.total ?? ((opts.startDay || 1) - 1) * 1440 + (opts.startMinute ?? 8 * 60);
    this.ff = 1; // hızlandırma (uyku)
    this.paused = false;
    this.listeners = [];
    this._lastHour = this.hourIndex;
    this._lastDay = this.day;
    this._lastPhase = this.phase;
  }
  /** Gerçek saniye başına oyun dakikası */
  get rate() { return 1440 / (this.dayMinutes * 60); }
  get day() { return Math.floor(this.total / 1440) + 1; }
  get minuteOfDay() { return ((this.total % 1440) + 1440) % 1440; }
  get hour() { return Math.floor(this.minuteOfDay / 60); }
  get minute() { return Math.floor(this.minuteOfDay % 60); }
  get hourIndex() { return Math.floor(this.total / 60); }
  get phase() { return phaseOf(this.minuteOfDay); }
  get isNight() { const m = this.minuteOfDay; return m >= DUSK || m < DAWN; }
  get daysLeft() { return Math.max(0, FINAL_DAY - this.day); }
  /** Son Işık'a kalan oyun dakikası */
  get countdown() { return Math.max(0, (FINAL_DAY - 1) * 1440 + FINAL_MINUTE - this.total); }
  /** Günün ışık seviyesi 0..1 (güneş açısı için) */
  get sunT() { return this.minuteOfDay / 1440; }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  /** Gerçek dt (saniye) kadar ilerlet; dönüş: geçen oyun dakikası */
  update(dt) {
    if (this.paused) return 0;
    const mins = dt * this.rate * this.ff;
    this.advance(mins);
    return mins;
  }

  advance(mins) {
    this.total += mins;
    const hi = this.hourIndex;
    if (hi !== this._lastHour) {
      for (let h = this._lastHour + 1; h <= hi; h++) this.emit('hour', { hour: ((h % 24) + 24) % 24, day: Math.floor(h / 24) + 1 });
      this._lastHour = hi;
    }
    if (this.day !== this._lastDay) { for (let d = this._lastDay + 1; d <= this.day; d++) this.emit('day', { day: d }); this._lastDay = this.day; }
    if (this.phase !== this._lastPhase) { this.emit('phase', { phase: this.phase }); this._lastPhase = this.phase; }
  }

  set(total) { this.total = total; this._lastHour = this.hourIndex; this._lastDay = this.day; this._lastPhase = this.phase; }
  serialize() { return { total: this.total, dayMinutes: this.dayMinutes }; }
}
