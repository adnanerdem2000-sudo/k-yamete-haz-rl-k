// Kayıt sistemi: localStorage yuvaları (otomatik + 3 manuel), dışa/içe aktarma (JSON dosyası).
// Kayıt verisi host'ta Session.serialize() ile üretilir; çok oyunculuda istemcilerin envanter/durumları
// host kaydında jeton (token) ile saklanır ve geri bağlandıklarında iade edilir.
import { DIFFICULTY } from '../data/difficulty.js';

const PREFIX = 'kiyamet_save_';
const INDEX = 'kiyamet_saves_index';
export const SLOTS = ['auto', '1', '2', '3'];
export const SLOT_NAMES = { auto: 'Otomatik Kayıt', 1: 'Kayıt 1', 2: 'Kayıt 2', 3: 'Kayıt 3' };

function readIndex() { try { return JSON.parse(localStorage.getItem(INDEX) || '{}'); } catch { return {}; } }
function writeIndex(ix) { try { localStorage.setItem(INDEX, JSON.stringify(ix)); } catch { /* yoksay */ } }

export class SaveSystem {
  constructor(session) {
    this.s = session;
  }

  /**
   * Kayıt verisi yüklenebilir mi: sürüm 1, sayısal zaman, en az bir oyuncu kaydı. Eksik/bozuk ayarlar (cfg) ve
   * oyuncu kayıtsız host jetonu varsayılanla tamamlanır: elle düzenlenmiş ya da eski bir dosya menüde çökmeden
   * yüklenir. Yüklenemeyecek veri için null döner.
   */
  static normalize(data) {
    if (!data || typeof data !== 'object' || data.v !== 1) return null;
    if (!data.time || typeof data.time !== 'object' || !Number.isFinite(data.time.total) || data.time.total < 0) return null;
    if (!data.players || typeof data.players !== 'object') return null;
    const tokens = Object.keys(data.players).filter((k) => data.players[k] && typeof data.players[k] === 'object');
    if (!tokens.length) return null;
    const cfg = data.cfg && typeof data.cfg === 'object' ? data.cfg : {};
    const dm = Number.isFinite(cfg.dayMinutes) && cfg.dayMinutes > 0 ? cfg.dayMinutes : Number.isFinite(data.time.dayMinutes) && data.time.dayMinutes > 0 ? data.time.dayMinutes : 24;
    data.cfg = { ...cfg, difficulty: Object.hasOwn(DIFFICULTY, cfg.difficulty) ? cfg.difficulty : 'normal', dayMinutes: dm, aiTeammates: Number.isFinite(cfg.aiTeammates) ? cfg.aiTeammates : 0 };
    if (!data.players[data.hostToken]) data.hostToken = tokens[0];
    return data;
  }

  /** Kayıt meta bilgisi */
  static meta(data) {
    const host = data.players[data.hostToken] || Object.values(data.players)[0] || {};
    const total = data.time.total;
    return {
      day: Math.floor(total / 1440) + 1, minute: Math.floor(total % 1440), savedAt: data.savedAt, charId: host.charId, name: host.name,
      players: Object.keys(data.players).length, difficulty: data.cfg?.difficulty || 'normal', multiplayer: Object.keys(data.players).length > 1,
    };
  }

  static list() {
    const ix = readIndex();
    return SLOTS.map((slot) => ({ slot, name: SLOT_NAMES[slot], meta: ix[slot] || null }));
  }

  /** Yuvadaki kaydı oku; bozuk/eksik kayıt → null (yükleme ekranı uyarı verir, oyun çökmez) */
  static read(slot) {
    try { const raw = localStorage.getItem(PREFIX + slot); return raw ? SaveSystem.normalize(JSON.parse(raw)) : null; } catch { return null; }
  }

  static write(slot, data) {
    const raw = JSON.stringify(data);
    localStorage.setItem(PREFIX + slot, raw);
    const ix = readIndex();
    ix[slot] = { ...SaveSystem.meta(data), size: raw.length };
    writeIndex(ix);
    return raw.length;
  }

  static remove(slot) {
    localStorage.removeItem(PREFIX + slot);
    const ix = readIndex(); delete ix[slot]; writeIndex(ix);
  }

  static hasAny() { return SLOTS.some((s) => readIndex()[s]); }

  /** JSON dosyası olarak indir */
  static exportFile(slot) {
    const data = SaveSystem.read(slot);
    if (!data) return false;
    const m = SaveSystem.meta(data);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kiyametten-once-gun${m.day}-${slot}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  }

  /** Dosyadan içe aktar → yuvaya yaz */
  static async importFile(file, slot = '3') {
    const text = await file.text();
    let data = null;
    try { data = SaveSystem.normalize(JSON.parse(text)); } catch { data = null; }
    if (!data) throw new Error('Geçersiz kayıt dosyası');
    SaveSystem.write(slot, data);
    return data;
  }

  // ---------------------------------------------------------------- oturum içi
  save(slot = '1') {
    const S = this.s;
    if (!S.isHost) { S.ui.toast('Kaydı oda sahibi (host) alır.', 'warn'); return false; }
    if (S.endings.finished) return false;
    try {
      const data = S.serialize();
      SaveSystem.write(slot, data);
      if (slot !== 'auto') S.ui.toast(`Oyun kaydedildi (${SLOT_NAMES[slot]}).`, 'good');
      return true;
    } catch (e) {
      console.error(e);
      S.ui.toast('Kayıt başarısız: depolama alanı dolu olabilir.', 'danger');
      return false;
    }
  }

  autosave() {
    if (!this.s.isHost) return;
    if (this.save('auto')) this.s.ui.toast('💾 Otomatik kayıt alındı.', 'info', 2);
  }

  clearAutosave() { if (this.s.isHost) SaveSystem.remove('auto'); }
}
