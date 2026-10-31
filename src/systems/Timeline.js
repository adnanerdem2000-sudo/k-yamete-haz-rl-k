// Zaman Çizelgesi: 30 günlük hayatta kalma hikâyesinin kronolojisi. Takvim kilometre taşları, telsiz
// yayınları, rastgele olaylar ve verilen kararlar, görevler, bulunan belgeler, tanışılan kişiler,
// keşfedilen bölgeler, sürü saldırıları, yaralanmalar, kurtarmalar ve final hazırlıkları tek listede.
// Her istemci olay akışından kendi çizelgesini tutar; host'un çizelgesi kayda yazılır.
import { QUESTS, NOTES, EVENTS, NPCS, ENDINGS } from '../data/story.js';
import { REGION_BY_ID } from '../world/WorldLayout.js';

export const TL_KINDS = {
  day: { icon: '🌅', label: 'Gün' },
  calendar: { icon: '📅', label: 'Takvim' },
  broadcast: { icon: '📻', label: 'Yayın' },
  event: { icon: '⚡', label: 'Olay' },
  quest: { icon: '📜', label: 'Görev' },
  questDone: { icon: '✅', label: 'Görev' },
  note: { icon: '📄', label: 'Belge' },
  npc: { icon: '🗣️', label: 'Karşılaşma' },
  region: { icon: '🧭', label: 'Keşif' },
  horde: { icon: '🧟', label: 'Sürü' },
  danger: { icon: '🩸', label: 'Tehlike' },
  rescue: { icon: '🤝', label: 'Kurtarma' },
  ending: { icon: '🏁', label: 'Kaçış Planı' },
  combat: { icon: '⚔️', label: 'Savaş' },
  base: { icon: '🏠', label: 'Üs' },
  world: { icon: '🌍', label: 'Dünya' },
  choice: { icon: '⚖️', label: 'Karar' },
};

export class Timeline {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.seenNpc = new Set();
    this.killMarks = new Set();
    this.readyMarks = new Set();
    const S = session;
    S.onEvt('broadcast', (e) => this.add(/GÜN —/.test(e.title) ? 'calendar' : 'broadcast', e.title, e.text));
    S.onEvt('event_result', (e) => this.add('event', EVENTS[e.id] ? EVENTS[e.id].title : 'Olay', `Karar: ${e.choiceText} — ${e.text}`));
    S.onEvt('quest', (e) => {
      const def = QUESTS[e.id] || (S.quests && S.quests.dyn[e.id]);
      if (!def) return;
      const key = e.id + ':' + e.state;
      if (this.list.some((x) => x.key === key)) return;
      if (e.state === 'active') this.add('quest', def.title, def.desc, { key });
      else if (e.state === 'done') this.add('questDone', def.title, 'Görev tamamlandı.', { key });
    });
    S.onEvt('note', (e) => { const n = NOTES[e.id]; if (n && !this.list.some((x) => x.key === 'note:' + e.id)) this.add('note', n.title, n.src ? `Bulunduğu yer: ${n.src}` : '', { key: 'note:' + e.id }); });
    S.onEvt('tl', (e) => this.add(e.kind, e.title, e.text, e.key ? { key: e.key } : {}));
    S.onEvt('zdie', () => {
      const k = S.results.kills;
      for (const m of [1, 10, 50, 100, 250, 500]) if (k >= m && !this.killMarks.has(m)) { this.killMarks.add(m); if (m > 1) this.add('combat', `${m}. zombi`, `Takım toplam ${m} zombiyi etkisiz hale getirdi.`); else this.add('combat', 'İlk kan', 'Takımın ilk zombisi düştü. Artık geri dönüş yok.'); }
    });
  }

  /** Yeni kayıt (oyun saatiyle) */
  add(kind, title, text = '', extra = {}) {
    const T = this.s.time;
    const e = { t: Math.round(T.total), day: T.day, kind, title, text, ...extra };
    this.list.push(e);
    if (this.list.length > 600) this.list.splice(0, this.list.length - 600);
    this.s.ui && this.s.ui.refreshTimeline && this.s.ui.refreshTimeline();
    return e;
  }

  /** Host: tüm istemcilerin çizelgesine kayıt düş */
  post(kind, title, text = '', key = null) { this.s.emit({ k: 'tl', kind, title, text, ...(key ? { key } : {}) }); }

  // ---- doğrudan kancalar (Session, NPC'ler, harita, final)
  onDayStart(day) { this.add('day', `${day}. gün başladı`, day === 30 ? 'Son Işık bu gece 22:00\'de.' : `Son Işık'a ${30 - day} gün kaldı.`); }
  onRegion(id) { const r = REGION_BY_ID[id]; if (r && !this.list.some((x) => x.key === 'region:' + id)) this.add('region', `${r.name} keşfedildi`, r.desc || '', { key: 'region:' + id }); }
  onNpc(id) {
    if (this.seenNpc.has(id)) return;
    this.seenNpc.add(id);
    const n = NPCS[id];
    if (n) this.add('npc', `${n.name} ile tanışıldı`, n.role || '');
  }
  onHorde(n) { this.add('horde', 'Sürü saldırısı', `${n}+ zombilik bir sürü üsse yöneldi.`); }
  onDowned(name) { this.add('danger', `${name} yere düştü`, 'Takım arkadaşları yardıma koştu.'); }
  onRescue(text) { this.add('rescue', 'Kurtarma', text); }
  onBase(text) { this.add('base', 'Üs gelişti', text); }
  onReady(id) {
    if (this.readyMarks.has(id)) return;
    this.readyMarks.add(id);
    const E = ENDINGS[id];
    if (E) this.add('ending', `${E.name} hazır`, E.desc);
  }

  /** Belirli bir gündeki kayıtlar */
  forDay(day) { return this.list.filter((e) => e.day === day); }

  serialize() { return this.list.slice(-400).map(({ t, day, kind, title, text, key }) => ({ t, day, kind, title, text, key })); }
  load(arr) {
    this.list = Array.isArray(arr) ? arr.slice() : [];
    for (const e of this.list) {
      if (e.kind === 'npc') { for (const [id, n] of Object.entries(NPCS)) if (e.title.startsWith(n.name)) this.seenNpc.add(id); }
      if (e.kind === 'combat') { const m = parseInt(e.title, 10); if (m) this.killMarks.add(m); else this.killMarks.add(1); }
      if (e.kind === 'ending') for (const [id, E] of Object.entries(ENDINGS)) if (e.title.startsWith(E.name)) this.readyMarks.add(id);
    }
  }
}
