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
  graphics: { quality: 'high', shadows: true, renderScale: 1, viewDistance: 420, fov: 70, bloom: true, grass: true, fpsCounter: false },
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
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* depolama kapalı olabilir */ } }
  reset() { this.data = deepMerge(DEFAULTS, { player: this.data.player }); this.save(); for (const fn of this.listeners) fn('*', null); }
}

export const Settings = new SettingsStore();
