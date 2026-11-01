// Kalıcı oyuncu ayarları (localStorage).
const KEY = 'kiyamet_settings_v1';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC', prone: 'KeyZ',
  interact: 'KeyE', reload: 'KeyR', inventory: 'Tab', crafting: 'KeyK', build: 'KeyB',
  map: 'KeyM', quests: 'KeyJ', character: 'KeyO', team: 'KeyP', flashlight: 'KeyF',
  ping: 'KeyQ', voice: 'KeyV', chat: 'KeyT', emote: 'KeyG', quickHeal: 'KeyH', drop: 'KeyX',
  rotate: 'KeyR', pause: 'Escape',
};

export const ACTION_LABELS = {
  forward: 'İleri', back: 'Geri', left: 'Sol', right: 'Sağ', jump: 'Zıpla / Tırman', sprint: 'Koş (Sprint)',
  crouch: 'Eğil', prone: 'Sürün', interact: 'Etkileşim / Ara', reload: 'Şarjör değiştir', inventory: 'Envanter',
  crafting: 'Üretim', build: 'İnşa modu', map: 'Harita', quests: 'Görevler', character: 'Karakter', team: 'Takım',
  flashlight: 'El feneri', ping: 'İşaret (ping)', voice: 'Bas-konuş', chat: 'Sohbet', emote: 'İfade çarkı',
  quickHeal: 'Hızlı tedavi / Korna', drop: 'Elindekini bırak', rotate: 'Döndür (inşa)', pause: 'Duraklat',
};

export const DEFAULTS = {
  graphics: { quality: 'medium', shadows: true, renderScale: 1, autoScale: true, viewDistance: 420, fov: 70, bloom: true, grass: true, ao: false, waterRefl: false, fpsCounter: false },
  controls: { mouseSens: 1, invertY: false, bindings: { ...DEFAULT_BINDINGS } },
  audio: { master: 0.8, music: 0.55, sfx: 0.85, ambient: 0.7, voice: 1, micGate: 0.02 },
  gameplay: { dayMinutes: 24, cameraShake: true, damageNumbers: true, tutorialHints: true },
  player: { name: '', characterId: 'mert', appearance: {} },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

class SettingsStore {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
    this.data = deepMerge(DEFAULTS, saved || {});
    if (!this.data.player.name) this.data.player.name = 'Oyuncu' + Math.floor(100 + Math.random() * 900);
    this.listeners = new Set();
  }
  get(path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), this.data); }
  set(path, value) {
    const keys = path.split('.');
    let o = this.data;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    this.save();
    for (const fn of this.listeners) fn(path, value);
  }
  /** Birden çok anahtarı yaz, dinleyicilere tek bildirim (prefix) gönder: ör. kalite ön ayarı → tek yeniden kurulum */
  setMany(prefix, obj) {
    let o = this.data;
    for (const k of prefix.split('.')) o = o[k];
    Object.assign(o, obj);
    this.save();
    for (const fn of this.listeners) fn(prefix, obj);
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* depolama kapalı olabilir */ } }
  reset() { this.data = deepMerge(DEFAULTS, { player: this.data.player }); this.save(); for (const fn of this.listeners) fn('*', null); }
}

export const Settings = new SettingsStore();

/**
 * Kalite seviyeleri: seçilince alt ayarlar bu değerlere çekilir (sonra tek tek değiştirilebilir).
 * Ayrıca kaliteye göre: gölge haritası (1024/2048/4096/4096), kenar yumuşatma (düşükte kapalı), çözünürlük tavanı
 * (1×/1×/1,5×/2×), bitki örtüsü mesafeleri, zombi sınırı (26/38/50/50), efekt yoğunluğu (%50/%80/%100/%100).
 * AO (ortam kapanması, GTAO) ve gerçek su yansıması (düzlemsel) yalnız Ultra'da varsayılan açık: ikisi de sahneyi
 * bir kez daha çizer (çizim çağrısı ~2×).
 */
export const QUALITY_PRESETS = {
  low: { shadows: false, bloom: false, grass: false, ao: false, waterRefl: false, viewDistance: 300, renderScale: 0.85 },
  medium: { shadows: true, bloom: true, grass: true, ao: false, waterRefl: false, viewDistance: 420, renderScale: 1 },
  high: { shadows: true, bloom: true, grass: true, ao: false, waterRefl: false, viewDistance: 540, renderScale: 1 },
  ultra: { shadows: true, bloom: true, grass: true, ao: true, waterRefl: true, viewDistance: 700, renderScale: 1 },
};
export function applyQualityPreset(q) {
  if (!QUALITY_PRESETS[q]) return;
  Settings.setMany('graphics', { quality: q, ...QUALITY_PRESETS[q] });
}
