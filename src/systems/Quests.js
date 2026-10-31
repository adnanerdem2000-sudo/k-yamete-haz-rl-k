// Görev sistemi: ana hikâye zinciri, yan görevler (NPC'ler), rastgele görevler. Takım geneli (host).
// Hedef türleri: collect, deliver, goto, kill, build, craft, interact, flag, survive, talk, repair, search.
import { QUESTS, NOTES } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { POIS } from '../world/WorldLayout.js';
import { dist } from '../core/util.js';

const MATCH = {
  kill: (o, cur, a) => (!o.zombie || o.zombie === a ? cur + 1 : cur),
  build: (o, cur, a) => (o.item === a ? cur + 1 : cur),
  craft: (o, cur, a) => (o.item === a ? cur + 1 : cur),
  interact: (o, cur, a) => (o.target === a ? 1 : null),
  repair: (o, cur, a) => (o.target === a ? 1 : null),
  talk: (o, cur, a) => (o.npc === a ? 1 : null),
  search: (o, cur, a) => (!o.building || o.building === a ? cur + 1 : cur),
};

export class Quests {
  constructor(session) {
    this.s = session;
    this.st = {}; // qid → {state:'active'|'done', prog:[...]}
    this.notesRead = new Set();
    this.tracked = null;
    const S = session;
    S.on('quest_start', (p) => { const def = this.def(p.id); if (!this.st[p.id] && def) S.emit({ k: 'quest', id: p.id, state: 'active', prog: def.objs.map(() => 0), dyn: this.dyn[p.id] || undefined }); });
    S.on('quest_prog', (p) => {
      const q = this.st[p.id];
      if (!q || q.state !== 'active') return;
      const prog = [...q.prog];
      prog[p.i] = p.value;
      const def = this.def(p.id);
      if (!def) return;
      const done = def.objs.every((o, i) => prog[i] >= (o.count || 1));
      S.emit({ k: 'quest', id: p.id, state: done ? 'done' : 'active', prog });
      if (done) this.complete(p.id);
    });
    S.on('quest_deliver', (p) => {
      const q = this.st[p.id];
      if (!q) return;
      const def = this.def(p.id);
      if (!def) return;
      def.objs.forEach((o, i) => { if (o.t === 'deliver' && (o.item === p.item)) S.applyAction('quest_prog', { id: p.id, i, value: o.count }, null); });
    });
    S.onEvt('quest', (e) => {
      if (e.dyn && !this.dyn[e.id]) this.dyn[e.id] = e.dyn;
      const was = this.st[e.id];
      this.st[e.id] = { state: e.state, prog: e.prog };
      const def = QUESTS[e.id] || this.dyn[e.id];
      if (!def) return;
      if (!was && e.state === 'active') {
        S.ui.questBanner('YENİ GÖREV', def.title); S.audio.play('success', { vol: 0.4 }); if (!this.tracked || def.kind === 'main') this.tracked = e.id;
        // görev başlamadan önce gerçekleşmiş bayrak hedefleri (okunmuş belge, kurulmuş anten…) hemen sayılır
        if (S.isHost) {
          const recheck = () => { for (const o of def.objs) if (o.t === 'flag') this.onFlag(o.flag); };
          if (S.later) S.later(0, recheck); else recheck(); // bir sonraki karede (çizelgede "başladı" önce görünsün)
        }
      }
      if (e.state === 'done' && (!was || was.state !== 'done')) { S.ui.questBanner('GÖREV TAMAMLANDI', def.title, 'good'); S.audio.play('success', { vol: 0.7 }); if (this.tracked === e.id) this.tracked = this.firstActive(); }
      S.ui.refreshQuests && S.ui.refreshQuests();
    });
    S.on('note_read', (p) => S.emit({ k: 'note', id: p.id }));
    S.onEvt('note', (e) => { this.notesRead.add(e.id); S.flags['note:' + e.id] = 1; this.onFlag('note:' + e.id); });
    this.dyn = {};
  }

  init() {
    this.s.applyAction('quest_start', { id: 'm1_home' }, null);
    this.s.applyAction('quest_start', { id: 's_bunker' }, null);
  }

  state(id) { return this.st[id] ? this.st[id].state : null; }
  firstActive() { const a = Object.keys(this.st).find((k) => this.st[k].state === 'active' && (QUESTS[k] || {}).kind === 'main'); return a || Object.keys(this.st).find((k) => this.st[k].state === 'active') || null; }
  active() { return Object.entries(this.st).filter(([, v]) => v.state === 'active').map(([k]) => k); }
  def(id) { return QUESTS[id] || this.dyn[id]; }

  complete(id) {
    const S = this.s;
    const def = this.def(id);
    S.results.quests++;
    for (const [it, n, data] of def.reward || []) {
      for (const p of S.players.values()) S.emit({ k: 'grant', to: p.id, items: [{ id: it, qty: n, ...(data || {}) }] });
    }
    if (def.rel) S.applyAction('rel', { faction: def.rel[0], delta: def.rel[1] }, null);
    if (def.morale) S.applyAction('team_morale', { amount: def.morale }, null);
    for (const nx of def.next || []) {
      const nd = QUESTS[nx];
      if (nd && nd.unlockDay && S.time.day < nd.unlockDay) { this.pendingUnlock = { id: nx, day: nd.unlockDay }; continue; }
      S.applyAction('quest_start', { id: nx }, null);
    }
    if (def.ending) S.applyAction('flag', { flag: 'ending_ready', value: 1 }, null);
    if (def.flag) S.applyAction('flag', { flag: def.flag, value: 1 }, null);
  }

  // ======================================================================= ilerleme kancaları
  // İstemciler fonksiyon değil kanca adı + argüman gönderir; eşleştirme host'ta yapılır.
  hook(type, arg) {
    const S = this.s;
    if (!S.isHost) { S.net.sendToHost({ t: 'qhook', type, arg }); return; }
    const match = MATCH[type];
    if (!match) return;
    for (const id of this.active()) {
      const def = this.def(id);
      def.objs.forEach((o, i) => {
        if (o.t !== type) return;
        const cur = this.st[id].prog[i] || 0;
        const r = match(o, cur, arg);
        if (r !== null && r !== undefined && r !== cur) S.applyAction('quest_prog', { id, i, value: Math.min(r, o.count || 1) }, null);
      });
    }
  }
  onCollect() { this._collectDirty = true; }
  onKill(type) { this.hook('kill', type); }
  onBuild(type) { this.hook('build', type); if (type === 'antenna') this.s.act('flag', { flag: 'antenna_built', value: 1 }); }
  onCraft(item) { this.hook('craft', item); }
  onInteract(target) { this.hook('interact', target); }
  onRepair(target) { this.hook('repair', target); }
  onTalk(npc) { this.hook('talk', npc); }
  onSearch(c) { this.hook('search', c && c.building ? c.building : null); }
  onFlag(flag) {
    const S = this.s;
    if (!S.isHost) return;
    for (const id of this.active()) {
      const def = this.def(id);
      def.objs.forEach((o, i) => {
        if (o.t !== 'flag' || o.flag !== flag && !(flag.startsWith('rel:') && o.flag === flag)) return;
        let v = flag.startsWith('rel:') ? S.relations[flag.slice(4)] || 0 : S.flags[flag];
        if (v === true) v = 1;
        v = Math.min(o.count || 1, Number(v) || 0);
        if (v !== this.st[id].prog[i]) S.applyAction('quest_prog', { id, i, value: v }, null);
      });
    }
  }

  readNote(noteId) {
    const S = this.s;
    const n = NOTES[noteId];
    if (!n) return;
    S.ui.openNote(n);
    S.act('note_read', { id: noteId });
  }

  update(dt) {
    const S = this.s;
    this._t = (this._t || 0) - dt;
    if (this._t > 0) return;
    this._t = 0.7;
    // toplama hedefleri: envanter + üs depoları (yerel değerlendirme)
    const inv = S.inventory;
    for (const id of this.active()) {
      const def = this.def(id);
      def.objs.forEach((o, i) => {
        if (o.t === 'collect') {
          let have = inv.count(o.item);
          for (const a of o.alt || []) have += inv.count(a);
          for (const st of S.build.storages()) for (const s of st.data.slots || []) if (s && (s.id === o.item || (o.alt || []).includes(s.id))) have += s.qty;
          have = Math.min(have, o.count);
          if (have > (this.st[id].prog[i] || 0)) S.act('quest_prog', { id, i, value: have });
        } else if (o.t === 'goto') {
          const poi = POIS.find((p) => p.id === o.poi);
          const p = S.local.pos;
          if (poi && dist(p.x, p.z, poi.x, poi.z) < (o.r || 20) && !(this.st[id].prog[i] >= 1)) S.act('quest_prog', { id, i, value: 1 });
        } else if (o.t === 'survive' && S.isHost) {
          if (S.time.day >= o.day && !(this.st[id].prog[i] >= 1)) S.applyAction('quest_prog', { id, i, value: 1 }, null);
        }
      });
    }
    // gün kilitli görevler
    if (S.isHost && this.pendingUnlock && S.time.day >= this.pendingUnlock.day) { S.applyAction('quest_start', { id: this.pendingUnlock.id }, null); this.pendingUnlock = null; }
  }

  /** HUD için izlenen görev */
  trackedInfo() {
    const id = this.tracked && this.st[this.tracked] && this.st[this.tracked].state === 'active' ? this.tracked : this.firstActive();
    if (!id) return null;
    const def = this.def(id);
    const q = this.st[id];
    return { id, title: def.title, kind: def.kind, objs: def.objs.map((o, i) => ({ label: o.label, cur: q.prog[i] || 0, max: o.count || 1 })), waypoint: this.waypoint(def) };
  }

  waypoint(def) {
    for (const o of def.objs) {
      if (o.poi) { const p = POIS.find((x) => x.id === o.poi); if (p) return p; }
    }
    if (def.waypoint) return POIS.find((x) => x.id === def.waypoint);
    return null;
  }

  /** Rastgele görev ekle (olaylardan) */
  addDynamic(id, def) {
    this.dyn[id] = def;
    this.s.applyAction('quest_start', { id }, null);
  }

  serialize() { return { st: this.st, notes: [...this.notesRead], dyn: this.dyn, tracked: this.tracked, pend: this.pendingUnlock || null }; }
  load(o) { if (!o) return; this.st = o.st || {}; this.notesRead = new Set(o.notes || []); this.dyn = o.dyn || {}; this.tracked = o.tracked; this.pendingUnlock = o.pend; }
}

export { ITEMS };
