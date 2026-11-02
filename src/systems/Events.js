// Olay sistemi: 30 günlük takvim kilometre taşları + rastgele olaylar (seçimli, oyun içi sahnelerle)
// + radyo/telsiz yayınları. Tüm kararlar host tarafından uygulanır.
import * as THREE from 'three';
import { CALENDAR, EVENTS, NPCS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { RNG, dist } from '../core/util.js';
import { Avatar } from '../entities/Avatar.js';
import { REGION_BY_ID } from '../world/WorldLayout.js';
import { ZOMBIE_TYPES } from '../data/zombies.js';
import { DUSK } from './TimeSystem.js';

export class Events {
  constructor(session) {
    this.s = session;
    this.rng = new RNG(session.seed + ':ev');
    this.done = new Set();
    this.schedule = []; // {at: totalMinutes, kind, id}
    this.broadcasts = [];
    this.active = null;
    this.temp = [];
    const S = session;
    S.on('event_choice', (p, from) => this.applyChoice(p.id, p.choice, from));
    S.on('broadcast_truth', () => {
      S.emit({ k: 'broadcast', day: S.time.day, title: '📻 147.30 — CANLI YAYIN', text: '"Burası Kızılçam adası. Elimizde kargo manifestoları, santral raporları ve denek listeleri var. Bu bir kaza değildi. Son Işık bir temizlik değil, bir örtbas…"' });
      S.applyAction('team_morale', { amount: 15 }, null);
      S.applyAction('rel', { faction: 'military', delta: -20 }, null);
      S.timeline.post('choice', 'Gerçek yayınlandı', 'Kızılçam kanıtları 147.30 frekansından anakaraya duyuruldu.');
      S.results.choices.push('Gerçek anakaraya yayınlandı');
    });
    S.onEvt('event_show', (e) => this.show(e));
    S.onEvt('event_result', (e) => { if (this.active && this.active.id === e.id) { S.ui.closeEvent(); this.active = null; } S.ui.toast(e.text, 'story', 5); S.results.choices.push(`${EVENTS[e.id]?.title || e.id}: ${e.choiceText}`); });
    S.onEvt('broadcast', (e) => { this.broadcasts.unshift({ day: e.day, text: e.text, title: e.title }); S.ui.broadcast(e.title, e.text); S.audio.play('radio', { vol: 0.8 }); });
    S.onEvt('env', (e) => { const env = S.env; if (e.streetPower !== undefined) env.streetPower = e.streetPower; if (e.doom !== undefined) env.doom = e.doom; if (e.redMist !== undefined) env.redMist = e.redMist; });
    S.onEvt('marker', (e) => S.map.addMarker(e.x, e.z, e.label, e.icon || 'quest'));
    S.onEvt('poison', () => { S.localStats.cond.poisoned = 150; S.ui.toast('Bozuk yiyecek! Zehirlendin.', 'danger'); });
  }

  init() {
    this.onDay(1);
  }

  // ======================================================================= takvim
  onDay(day) {
    const S = this.s;
    if (!S.isHost) return;
    const c = CALENDAR[day];
    if (c) {
      S.emit({ k: 'broadcast', day, title: `${day}. GÜN — ${c.title}`, text: c.broadcast });
      for (const eff of c.effects) this.applyEffect(eff, day);
    }
    // günün rastgele olayları
    const n = day <= 1 ? 0 : this.rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const id = this.pickEvent(day);
      if (!id) continue;
      const hour = EVENTS[id].night ? this.rng.int(21, 23) : this.rng.int(9, 20);
      this.schedule.push({ at: (day - 1) * 1440 + hour * 60 + this.rng.int(0, 50), kind: 'event', id });
    }
  }

  pickEvent(day) {
    const S = this.s;
    const list = Object.entries(EVENTS).filter(([id, e]) => {
      if (e.minDay && day < e.minDay) return false;
      if (e.maxDay && day > e.maxDay) return false;
      if (e.requires && !this.meets(e.requires)) return false;
      if (e.avoid && this.meets(e.avoid)) return false;
      if (e.mp && S.players.size < 2) return false;
      if (this.done.has(id) && !e.repeat && ['storm', 'trader_visit', 'horde_near', 'distress_call'].indexOf(id) < 0) return false;
      if (this.schedule.some((x) => x.id === id)) return false;
      return true;
    });
    if (!list.length) return null;
    return this.rng.pick(list)[0];
  }

  /** Olay koşulu: 'generator_fixed' | 'has_security' | 'driving' | 'flag:x' | 'noflag:x' | 'quest:id' | 'npc:id' */
  meets(req) {
    const S = this.s;
    const [k, arg] = req.split(':');
    switch (k) {
      case 'generator_fixed': return !!S.flags.generator_fixed;
      case 'has_security': return !!S.flags.has_security;
      case 'driving': return false;
      case 'flag': return !!S.flags[arg];
      case 'noflag': return !S.flags[arg];
      case 'quest': return S.quests.state(arg) === 'active';
      case 'npc': { const n = S.npcs.byId(arg); return !!(n && n.alive); }
      default: return true;
    }
  }

  applyEffect(eff, day) {
    const S = this.s;
    const [k, arg] = eff.split(':');
    const hz = S.zombies.zones;
    switch (k) {
      case 'tutorial': S.emit({ k: 'toast', text: 'İpucu: Evdeki dolapları ara (E basılı tut), Tab ile envanteri aç, B ile inşa et.', kind: 'info', dur: 8 }); break;
      case 'power_out': if (!S.flags.power_restored) S.emit({ k: 'env', streetPower: false }); break;
      case 'dam_call':
        if (S.flags.power_restored) break;
        S.emit({ k: 'broadcast', day, title: 'TELSİZ — Baraj Santrali', text: '"Burası santral, ben Mühendis Zeynep. Türbin 2 sağlam, birkaç parçayla şebekeyi geri getirebilirim. Batıdaki barajdayım!"' });
        S.emit({ k: 'marker', x: -466, z: -200, label: 'Mühendis Zeynep (Santral)', icon: 'quest' });
        break;
      case 'resort_call':
        S.emit({ k: 'broadcast', day, title: 'TELSİZ — Otel Mavi Koy', text: '"…kimse duyuyor mu? Ben Murat. Kızımla otelde, 103 numaralı odadayız. Kapıyı dolapla kapattık. Lütfen…"' });
        S.applyAction('quest_start', { id: 's_resort' }, null);
        S.emit({ k: 'marker', x: -180, z: 688, label: 'Otel Mavi Koy — Oda 103', icon: 'quest' });
        break;
      case 'pilot_call':
        S.emit({ k: 'broadcast', day, title: 'TELSİZ — Havaalanı Kulesi', text: '"Kuleden sesleniyorum, Pilot Aydın. Bacağım yaralı. Önlükte uçuşa hazır bir uçak var… pist kapalı. Yardım edin, birlikte çıkalım."' });
        S.emit({ k: 'marker', x: -60, z: -716, label: 'Pilot Aydın (Kule)', icon: 'plane' });
        break;
      case 'prison_break':
        this.prisonRiot();
        S.emit({ k: 'broadcast', day, title: 'TELSİZ — Cezaevi', text: '"Burası cezaevi, Gardiyan Necla. Dış kapı düştü, avlu dolu. B koğuşunda sekiz kişi var. Biri gelsin!"' });
        break;
      case 'leaflets': this.trigger('leaflets'); break;
      case 'lighthouse_hint':
        if (S.flags.lighthouse_lit) break;
        S.emit({ k: 'broadcast', day, title: 'TELSİZ — Deniz Feneri', text: '"Fener bekçisi İsmail… Gemi hâlâ açıkta, her gece ışık veriyor. Feneri yakabilirsek bizi görecekler."' });
        S.emit({ k: 'marker', x: -598, z: 544, label: 'Deniz Feneri', icon: 'lighthouse' });
        break;
      case 'ship_rumor': S.emit({ k: 'toast', text: S.flags.ship_contact ? 'Gemi hâlâ bekliyor. Son gece tekneyle açığa çıkın!' : 'Dedikodu: Batıdaki yük gemisi, fener yanarsa sivilleri alacakmış…', kind: 'story', dur: 7 }); break;
      case 'bloodmoon': this.schedule.push({ at: (day - 1) * 1440 + 21 * 60, kind: 'event', id: 'blood_moon' }); break;
      case 'hospital_evac': { const z = hz.find((q) => q.region === 'hastane'); if (z) z.base += 8; break; }
      case 'horde': this.schedule.push({ at: (day - 1) * 1440 + 22 * 60, kind: 'horde', size: arg === '2' ? 34 : 20, leader: arg === '2' }); S.emit({ k: 'toast', text: '⚠️ Bu gece büyük bir sürü bekleniyor! Üssü güçlendirin.', kind: 'danger', dur: 7 }); break;
      case 'radio_mystery': S.emit({ k: 'broadcast', day, title: 'GİZEMLİ YAYIN — 147.30', text: '"…su deposu… bilerek yapıldı… kuzeydeki tesis… Kızılçam… kimse adayı terk etmeyecek…"' }); break;
      case 'evac_announce': for (const q of ['s_antenna', 's_convoy', 's_boat', 's_mountain']) S.applyAction('quest_start', { id: q }, null); S.emit({ k: 'marker', x: 366, z: -248, label: 'Tahliye: Helikopter Pisti', icon: 'heli' }); break;
      case 'fuel_shortage': S.emit({ k: 'toast', text: 'Benzin pompaları artık elektriksiz çalışmıyor. Tankerleri ve bidonları kullan.', kind: 'warn' }); break;
      case 'city_clashes': this.spawnRaiders(100, 0, 4); break;
      case 'comms_down': S.applyAction('flag', { flag: 'comms_down', value: 1 }, null); break;
      case 'storm': this.schedule.push({ at: (day - 1) * 1440 + 18 * 60, kind: 'weather', w: 'storm' }); break;
      case 'raider_attack': this.schedule.push({ at: (day - 1) * 1440 + 20 * 60, kind: 'raiders' }); break;
      case 'lab_reveal': S.emit({ k: 'marker', x: -20, z: -455, label: 'Araştırma Tesisi', icon: 'lab' }); S.emit({ k: 'marker', x: -85, z: -38, label: 'Dr. Selin (Hastane)', icon: 'quest' }); break;
      case 'military_open': S.emit({ k: 'marker', x: 345, z: -248, label: 'Askerî Bölge', icon: 'military' }); break;
      case 'city_fall': { const z = hz.find((q) => q.region === 'sehir'); if (z) z.base += 16; break; }
      case 'cold': S.weather.coldOffset = -8; break;
      case 'migration': this.spawnMigrants(); break;
      case 'doom': S.emit({ k: 'env', doom: arg === '2' ? 0.75 : 0.4 }); break;
      case 'final': S.endings.startFinalDay(); break;
      default: break;
    }
  }

  onHour(hour, day) {
    const S = this.s;
    void day;
    if (!S.isHost) return;
    // akşam uyarısı
    if (hour === 19) S.emit({ k: 'toast', text: 'Akşam oluyor. 20.30\'da ölüler topraktan çıkacak — üsse ya da bir sığınağa dönmeyi düşün.', kind: 'info', dur: 4 });
    // Kanlı Ay şafakta biter
    if (hour === 6 && S.zombies.frenzy) { S.emit({ k: 'bloodmoon', on: false }); S.emit({ k: 'toast', text: 'Şafak söktü. Kanlı Ay geçti.', kind: 'good', dur: 4 }); }
  }

  /** Bu gecenin alacakaranlığı (mutlak oyun dakikası): gece zaten başladıysa şimdi */
  tonight() { const S = this.s; return S.time.isNight ? S.time.total : (S.time.day - 1) * 1440 + DUSK + 5; }
  /** Gündüz zombi doğmaz: olay zombisi şimdi gündüzse bu gece alacakaranlıkta aynı yerde topraktan çıkar. İnsanlar
   *  (yağmacı) hemen gelir. Gece, Kanlı Ay ve final gecesinde doğrudan doğar. */
  zSpawn(type, x, z, opts = {}) {
    const S = this.s;
    if ((ZOMBIE_TYPES[type] && ZOMBIE_TYPES[type].human) || S.time.isNight || S.zombies.frenzy || (S.endings && S.endings.active)) return S.zombies.spawn(type, x, z, opts);
    const at = this.tonight();
    const e = this.schedule.find((q) => q.kind === 'zspawn' && q.at === at);
    const item = [type, x, z, opts.horde ? { horde: opts.horde } : {}];
    if (e) e.list.push(item); else this.schedule.push({ at, kind: 'zspawn', list: [item] });
    if (!this._deferMsgDay || this._deferMsgDay !== S.time.day) { this._deferMsgDay = S.time.day; S.emit({ k: 'toast', text: 'Ölüler gün ışığında toprağın altında… ama bu gece buraya dönecekler.', kind: 'warn', dur: 5 }); }
    return null;
  }
  /** Sürü: gündüzse bu geceye ertelenir */
  zHorde(size, around = null, leader = false) {
    const S = this.s;
    if (S.time.isNight || S.zombies.frenzy || (S.endings && S.endings.active)) return S.zombies.spawnHorde(size, around, leader);
    this.schedule.push({ at: this.tonight() + 20, kind: 'horde', size, leader, around });
    S.emit({ k: 'toast', text: `⚠️ Bir sürü toplanıyor: bu gece ${around ? 'o bölgeye' : 'mahalleye'} gelecek!`, kind: 'danger', dur: 6 });
    return 0;
  }

  update(dt) {
    const S = this.s;
    if (!S.isHost) return;
    const now = S.time.total;
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      const e = this.schedule[i];
      if (now < e.at) continue;
      // gündüz zombi doğmaz: vakti gelmiş (ör. göçte devralınan eski plan) zombi/sürü girdisi bu geceye kayar
      if ((e.kind === 'zspawn' || e.kind === 'horde') && !S.time.isNight && !S.zombies.frenzy && !(S.endings && S.endings.active)) { e.at = this.tonight(); continue; }
      this.schedule.splice(i, 1);
      if (e.kind === 'event') this.trigger(e.id);
      else if (e.kind === 'zspawn') { for (const [type, x, z, o] of e.list) S.zombies.spawn(type, x, z, { ...o, emerge: true }); }
      else if (e.kind === 'horde') { const n = S.zombies.spawnHorde(e.size, e.around || null, e.leader); S.timeline.onHorde(n); S.emit({ k: 'toast', text: `🧟 SÜRÜ GELİYOR! (${n}+ zombi)`, kind: 'danger', dur: 6 }); S.emit({ k: 'broadcast', day: S.time.day, title: 'ACİL', text: 'Sürü mahalleye ulaştı! Savunma pozisyonu alın!' }); }
      else if (e.kind === 'weather') S.weather.set(e.w, 240);
      else if (e.kind === 'raiders') this.raiderAttack();
      else if (e.kind === 'cleanup') this.cleanupTemp();
      else if (e.kind === 'event_fixpower') S.applyAction('flag', { flag: 'power_fail', value: 0 }, null);
    }
    // geçici NPC'ler
    for (const t of this.temp) { t.av.update(dt, { mode: t.mode || 'ground', speed: t.speed || 0, yaw: t.yaw || 0 }); if (t.walk) { t.pos.x += Math.sin(t.yaw) * t.speed * dt; t.pos.z += Math.cos(t.yaw) * t.speed * dt; t.pos.y = S.world.terrain.heightAt(t.pos.x, t.pos.z); t.av.root.position.copy(t.pos); } }
  }

  // ======================================================================= rastgele olaylar
  trigger(id) {
    const S = this.s;
    const ev = EVENTS[id];
    if (!ev) return;
    this.done.add(id);
    this.scene(id, ev);
    S.emit({ k: 'event_show', id });
  }

  show(e) {
    const S = this.s;
    const ev = EVENTS[e.id];
    this.active = { id: e.id };
    S.ui.openEvent({
      id: e.id, title: ev.title, text: ev.text, img: ev.img,
      choices: ev.choices.map((c, i) => ({ text: c.text, cost: c.cost, affordable: (c.cost || []).every(([it, n]) => S.inventory.has(it, n)), onSelect: () => {
        if (c.cost) for (const [it, n] of c.cost) S.inventory.remove(it, n);
        S.act('event_choice', { id: e.id, choice: i });
      } })),
    });
    S.audio.play('alert', { vol: 0.6 });
  }

  applyChoice(id, ci, from) {
    const S = this.s;
    const ev = EVENTS[id];
    if (!ev || this.resolved === id + ':' + S.time.day) return;
    this.resolved = id + ':' + S.time.day;
    const c = ev.choices[ci];
    const f = c.effects || {};
    if (f.morale) S.applyAction('team_morale', { amount: f.morale }, null);
    if (f.rel) S.applyAction('rel', { faction: f.rel[0], delta: f.rel[1] }, null);
    if (f.reward) for (const p of S.players.values()) S.emit({ k: 'grant', to: p.id, items: f.reward.map(([it, n, extra]) => ({ id: it, qty: n, ...(it === 'note' ? { noteId: extra || 'random_diary2' } : {}) })) });
    if (f.note) for (const p of S.players.values()) S.emit({ k: 'grant', to: p.id, items: [{ id: 'note', qty: 1, noteId: f.note }] });
    if (f.horde) this.zHorde(f.horde, null, false);
    if (f.horde_at_player) { const p = S.players.get(from); if (p) this.zHorde(f.horde_at_player, { x: p.pos.x, z: p.pos.z }, false); }
    if (f.raiders) this.spawnRaiders(S.world.home.spec.x + 18, S.world.home.spec.z + 4, f.raiders);
    if (f.weather) S.weather.set(f.weather, 240);
    if (f.fixGenerator) S.applyAction('gen', { on: true }, null);
    if (f.generatorOffHours) S.applyAction('gen', { on: false }, null);
    if (f.fixPower) S.applyAction('flag', { flag: 'power_fail', value: 0 }, null);
    if (f.powerOffHours) { S.applyAction('flag', { flag: 'power_fail', value: 1 }, null); this.schedule.push({ at: S.time.total + f.powerOffHours * 60, kind: 'event_fixpower' }); }
    if (f.trade) { S.applyAction('flag', { flag: 'trader_here', value: 1 }, null); S.applyAction('npc_state', { id: 'riza', visible: true, x: S.world.home.spec.x + 6, z: S.world.home.spec.z + 14 }, null); }
    if (f.noise === 'gas') { S.applyAction('noise', { x: 60, z: 300, r: 220, src: 'explosion' }, null); S.emit({ k: 'fire_area', x: 60, y: 4, z: 300, r: 6, life: 60 }); }
    if (f.noise === 'player') { const p = S.players.get(from); if (p) S.applyAction('noise', { x: p.pos.x, z: p.pos.z, r: 70, src: 'alarm' }, null); }
    if (f.marker) this.marker(f.marker);
    if (f.loseFood) { for (const st of S.build.storages()) { const i = (st.data.slots || []).findIndex((s) => s && ITEMS[s.id].cat === 'food'); if (i >= 0) { st.data.slots[i] = null; S.applyAction('struct_data', { id: st.id, data: { slots: st.data.slots } }, null); break; } } }
    if (f.poisonRandom) S.emit({ k: 'poison', to: from });
    if (f.quest === 'q_distress') this.distressQuest();
    else if (f.quest) S.applyAction('quest_start', { id: f.quest }, null);
    if (f.questDyn === 'q_hiker') this.hikerQuest();
    if (f.flag) S.applyAction('flag', { flag: f.flag, value: 1 }, null);
    if (f.airdrop) S.storyWorld.hostAirdrop();
    if (f.planeCrash) S.storyWorld.hostCrash(f.planeCrash !== 'nomark');
    if (f.tremor) S.storyWorld.hostTremor();
    if (f.cache) S.storyWorld.hostCache(f.cache, f.guards || 0);
    if (f.bloodMoon) S.emit({ k: 'bloodmoon', on: true });
    if (f.stealth) S.emit({ k: 'stealth', until: S.time.total + f.stealth });
    if (f.wolves) { const p = this.playerPos(from); S.npcs.spawnPack('wolf', p, f.wolves, from); }
    if (f.animals) { const h = S.world.home.spec; S.npcs.spawnPack(f.animals[0], { x: h.x + 10, z: h.z - 70 }, f.animals[1], null, 0); }
    if (f.dogs) { const p = this.playerPos(from); for (let i = 0; i < f.dogs; i++) this.zSpawn('dog', p.x + 30 + i * 2, p.z + 24 - i * 3, { chase: from }); }
    if (f.raidersAtPlayer) { const p = this.playerPos(from); this.spawnRaiders(p.x + 26, p.z + 18, f.raidersAtPlayer); }
    if (f.raidersAt) this.spawnRaiders(f.raidersAt[0], f.raidersAt[1], f.raidersAt[2]);
    if (f.sickChance) { const ids = [...S.players.keys()]; const id = ids[Math.floor(this.rng.next() * ids.length)]; if (this.rng.next() < f.sickChance) S.emit({ k: 'infect', to: id, amount: 35 }); }
    if (f.trap) this.cryingVoice(from);
    if (f.advance) S.time.advance(f.advance);
    if (f.riot) this.prisonRiot();
    if (f.fireAt) { const [x, z] = f.fireAt; S.emit({ k: 'fire_area', x, y: S.world.terrain.heightAt(x, z) + 0.3, z, r: 7, life: 120 }); }
    if (f.noiseAt) S.applyAction('noise', { x: f.noiseAt[0], z: f.noiseAt[1], r: 230, src: 'explosion' }, null);
    if (f.refugees) this.refugeeBoat();
    if (f.powerCut) { S.applyAction('flag', { flag: 'power_restored', value: 0 }, null); S.emit({ k: 'power', on: false }); S.timeline.post('world', 'Elektrik yine kesildi', 'Kablo hırsızları santrali soydu. Türbini yeniden bağlamak için 3 kablo gerekiyor.'); }
    if (f.hasanTurns) this.hasanTurns();
    if (f.tradeAt) { S.applyAction('flag', { flag: 'trader_here', value: 1 }, null); S.applyAction('npc_state', { id: 'riza', visible: true, x: f.tradeAt[0], z: f.tradeAt[1] }, null); S.emit({ k: 'marker', x: f.tradeAt[0], z: f.tradeAt[1], label: 'Kara Borsa (Rıza)', icon: 'shop' }); }
    if (f.allies) { S.applyAction('flag', { flag: 'allies', add: f.allies }, null); this.spawnAllies(f.allies); S.results.rescued += f.allies; }
    if (f.carDamage) { const v = S.vehicles.list.find((x) => x.seats[0]); if (v) S.applyAction('vehicle_damage', { id: v.id, dmg: v.maxHealth * f.carDamage }, null); }
    if (f.spawnNear) this.zHorde(f.spawnNear, null, false);
    S.emit({ k: 'event_result', id, text: c.result, choiceText: c.text });
    if (id === 'injured_kid' && ci === 0) S.results.rescued += 2;
    this.schedule.push({ at: S.time.total + 120, kind: 'cleanup' });
  }

  /** Seçimi yapan oyuncunun (yoksa yerel oyuncunun) konumu */
  playerPos(from) {
    const S = this.s;
    const p = S.players.get(from);
    const pos = p ? (p.isLocal ? S.local.pos : p.pos) : S.local.pos;
    return { x: pos.x, z: pos.z };
  }

  marker(kind) {
    const S = this.s;
    if (Array.isArray(kind)) { S.emit({ k: 'marker', x: kind[0], z: kind[1], label: kind[2], icon: kind[3] || 'quest' }); return; }
    const M = { lost_camp: [-232, -26, 'Kayıp Kamp'], soldier_body: [-95, -300, 'Asker Cesedi'], research_trace: [-150, -180, 'Araştırma İzleri'], cave_stash: [-300, -196, 'Mağara Zulası'] };
    const m = M[kind];
    if (m) S.emit({ k: 'marker', x: m[0], z: m[1], label: m[2], icon: 'quest' });
  }

  /** Olayın oyun içi karşılığı (NPC, efekt, çevre değişimi) */
  scene(id, ev) {
    const S = this.s;
    const home = S.world.home;
    const door = home.frame.pt(5, 15.5);
    switch (ev.scene) {
      case 'npc_at_door': {
        this.spawnTemp(NPCS.hasan.look ? { ...NPCS.hasan.look, hairColor: '#2c1a10', beard: 'stubble', top: { style: 'tshirt', color: '#7f8c8d' }, glasses: 'none', dirt: 0.8 } : {}, door.x + 0.6, door.z + 1.5, Math.PI, 'ground');
        this.spawnTemp(NPCS.can.look, door.x - 0.6, door.z + 1.7, Math.PI, 'ground', 0.75);
        S.audio.play('bash', { at: { x: door.x, y: home.floorY, z: door.z }, vol: 0.5 });
        break;
      }
      case 'generator_break': S.applyAction('gen', { on: false }, null); S.fx.smoke(-268, 8, 137.5, 20, '#444'); S.audio.play('explosion', { at: { x: -268, y: 7, z: 137.5 }, vol: 0.4 }); break;
      case 'storm': S.weather.set('storm', 200); break;
      case 'gas_explosion': S.fx.fire(60, 4.5, 300, 90, 2.5); S.audio.play('explosion', { vol: 0.9 }); break;
      case 'alarm': S.audio.play('alert', { vol: 1 }); break;
      case 'animal': this.spawnFox(); break;
      case 'raiders_car': break;
      case 'heli_flyby': S.emit({ k: 'heli_flyby' }); break;
      case 'npc_visit': this.spawnTemp({ base: 'male', skin: '#efb994', hairStyle: 'messy', hairColor: '#3b2314', beard: 'stubble', hat: 'none', top: { style: 'coat', color: '#ecf0f1', color2: '#2c3e50' }, pants: { style: 'jeans', color: '#34495e' }, shoes: '#2c2c2c', backpack: 'none', glasses: 'square', dirt: 0.7 }, door.x + 0.8, door.z + 2.2, Math.PI, 'ground'); break;
      default: break;
    }
  }

  spawnTemp(look, x, z, yaw, mode = 'ground', scale = 1) {
    const S = this.s;
    const av = new Avatar(S.game, look);
    const pos = new THREE.Vector3(x, S.world.physics.groundHeight(x, z, 1e9), z);
    av.root.position.copy(pos);
    av.root.scale.setScalar(scale);
    S.game.scene.add(av.root);
    const t = { av, pos, yaw, mode };
    this.temp.push(t);
    return t;
  }

  cleanupTemp() { for (const t of this.temp) t.av.dispose(); this.temp = []; }

  spawnFox() {
    const S = this.s;
    const h = S.world.home.spec;
    S.npcs.spawnAnimal('fox', h.x + 4, h.z - 20);
  }

  spawnRaiders(x, z, n) {
    const S = this.s;
    for (let i = 0; i < n; i++) S.zombies.spawn('raider', x + (this.rng.next() - 0.5) * 10, z + (this.rng.next() - 0.5) * 10, { chase: [...S.players.keys()][0] });
  }

  raiderAttack() {
    const S = this.s;
    const h = S.world.home.spec;
    const rel = S.relations.raiders || 0;
    S.applyAction('npc_state', { id: 'kurt', visible: true, x: h.x + 24, z: h.z + 18 }, null);
    S.emit({ k: 'toast', text: rel > 10 ? 'Yağmacılar geldi… Kurt konuşmak istiyor.' : '🔫 YAĞMACI SALDIRISI! Kurt ve adamları üsse geliyor!', kind: 'danger', dur: 6 });
    if (rel <= 10) this.spawnRaiders(h.x + 30, h.z + 20, 4 + Math.min(3, S.players.size));
  }

  raiderNegotiation() {
    const S = this.s;
    S.ui.openDialog({
      speaker: '"Kurt" — Yağmacı Lideri', text: 'Herkes hayatta kalmak istiyor. Bize erzak verin, mahallenize dokunmayalım. Ya da… zor yoldan halledelim.',
      choices: [
        { text: '5 konserve + 5 su ver', onSelect: () => { if (S.inventory.count('canned_food') >= 5 && S.inventory.count('water_bottle') >= 5) { S.inventory.remove('canned_food', 5); S.inventory.remove('water_bottle', 5); S.act('rel', { faction: 'raiders', delta: 40 }); S.act('npc_state', { id: 'kurt', visible: false }); S.ui.toast('Kurt erzağı alıp gitti. "Akıllıca."', 'info', 4); S.results.choices.push('Yağmacılarla anlaşıldı'); } else S.ui.toast('Yeterli erzağın yok!', 'warn'); S.ui.closeDialog(); } },
        { text: 'Defol buradan!', onSelect: () => { S.ui.closeDialog(); S.act('rel', { faction: 'raiders', delta: -40 }); S.act('npc_state', { id: 'kurt', visible: false }); this.s.isHost ? this.spawnRaiders(S.world.home.spec.x + 25, S.world.home.spec.z + 18, 5) : null; S.results.choices.push('Yağmacılara karşı koyuldu'); } },
      ],
    });
  }

  distressQuest() {
    const S = this.s;
    S.quests.addDynamic('q_distress', { kind: 'random', title: 'Benzinlikteki Mahsurlar', desc: 'Benzin istasyonu marketinde mahsur kalanları kurtar: çevredeki zombileri temizle.', objs: [{ t: 'goto', poi: 'gas', r: 25, label: 'Benzinliğe git' }, { t: 'kill', count: 8, label: 'Zombileri temizle (8)' }], reward: [['first_aid', 1], ['jerrycan', 1, { fuel: 20 }]], rel: ['neighbors', 15], morale: 10 });
    this.zHorde(12, { x: 62, z: 302 }, false);
    S.emit({ k: 'marker', x: 62, z: 302, label: 'Yardım Çağrısı', icon: 'quest' });
    S.results.rescued += 3;
  }

  hikerQuest() {
    const S = this.s;
    const x = -322, z = -296;
    S.quests.addDynamic('q_hiker', { kind: 'random', title: 'Dağdaki Yürüyüşçü', desc: 'Dağ kampının altındaki kayalıklarda ayağı kırık bir yürüyüşçü mahsur. Etrafını temizle ve çantasını kurtar.', objs: [{ t: 'goto', poi: 'mountain', r: 60, label: 'Dağ kampının altına git' }, { t: 'kill', count: 6, label: 'Etrafındaki zombileri temizle (6)' }], reward: [['first_aid', 1], ['binoculars', 1]], rel: ['neighbors', 10], morale: 8 });
    for (let i = 0; i < 6; i++) this.zSpawn(i < 2 ? 'runner' : 'normal', x + (this.rng.next() - 0.5) * 18, z + (this.rng.next() - 0.5) * 18, {});
    S.emit({ k: 'dyn_cont', ct: { id: 'dyn:hiker', type: 'backpack', label: 'Yürüyüşçünün Çantası', x, y: S.world.terrain.heightAt(x, z) + 0.4, z, special: 'hiker_pack' } });
    S.emit({ k: 'marker', x, z, label: 'Mahsur Yürüyüşçü', icon: 'quest' });
    S.results.rescued += 1;
  }

  /** Gecenin içindeki ağlama sesi: yarı yarıya tuzak (çığlıkçı + sürü) ya da gerçekten bir çocuk */
  cryingVoice(from) {
    const S = this.s;
    const p = this.playerPos(from);
    const a = this.rng.next() * Math.PI * 2;
    const x = p.x + Math.cos(a) * 45, z = p.z + Math.sin(a) * 45;
    if (this.rng.next() < 0.55) {
      this.zSpawn('screamer', x, z, { chase: from });
      for (let i = 0; i < 7; i++) this.zSpawn(i % 3 ? 'normal' : 'runner', x + (this.rng.next() - 0.5) * 14, z + (this.rng.next() - 0.5) * 14, { horde: p });
      S.emit({ k: 'toast', text: 'Ses bir çığlığa dönüştü… BU BİR TUZAKTI!', kind: 'danger', dur: 5 });
    } else {
      this.spawnTemp(NPCS.defne ? { ...NPCS.defne.look, top: { style: 'tshirt', color: '#7f8c8d' }, dirt: 0.8 } : NPCS.can.look, x, z, Math.PI, 'ground', 0.75);
      S.applyAction('team_morale', { amount: 10 }, null);
      S.results.rescued += 1;
      S.emit({ k: 'toast', text: 'Gerçekten bir çocuktu! Onu sakinleştirip üsse getirdiniz. (+Moral)', kind: 'good', dur: 5 });
      S.timeline.post('rescue', 'Karanlıktaki çocuk', 'Gece ağlayan sesin peşine düşüldü: bir çocuk kurtarıldı.');
    }
  }

  prisonRiot() {
    const S = this.s;
    if (S.flags.prison_riot) return;
    S.applyAction('flag', { flag: 'prison_riot', value: 1 }, null);
    for (let i = 0; i < 6; i++) this.zSpawn('riot', 640 + this.rng.next() * 110, -110 + this.rng.next() * 100, {});
    this.spawnRaiders(600, -60, 3);
    S.emit({ k: 'marker', x: 700, z: -60, label: 'Cezaevi İsyanı', icon: 'danger' });
  }

  refugeeBoat() {
    const S = this.s;
    const x = -150, z = 748;
    S.emit({ k: 'marker', x, z, label: 'Kıyıya Vuran Bot', icon: 'quest' });
    if (this.rng.next() < 0.5) {
      S.applyAction('flag', { flag: 'allies', add: 2 }, null);
      S.results.rescued += 2;
      S.applyAction('team_morale', { amount: 6 }, null);
      S.emit({ k: 'toast', text: 'Botta iki bitkin hayatta kalan vardı. Üsse katıldılar!', kind: 'good', dur: 5 });
      S.timeline.post('rescue', 'Kıyıdaki sağ kalanlar', 'Tatil köyü sahiline vuran bottan iki kişi kurtarıldı.');
    } else {
      for (let i = 0; i < 7; i++) this.zSpawn(i % 2 ? 'normal2' : 'normal', x + (this.rng.next() - 0.5) * 16, z - this.rng.next() * 10, {});
      S.emit({ k: 'toast', text: 'Bottakiler çoktan dönüşmüştü… Sahil enfekte dolu!', kind: 'danger', dur: 5 });
    }
  }

  /** Hasan Amca ilaçsız kaldı: gece dönüşür */
  hasanTurns() {
    const S = this.s;
    const n = S.npcs.byId('hasan');
    if (!n || !n.alive) return;
    S.later(40, () => {
      if (!n.alive) return;
      S.applyAction('npc_state', { id: 'hasan', alive: false }, null);
      const zb = this.zSpawn('normal', n.pos.x, n.pos.z, {});
      if (zb) zb.boost = 1.1;
      S.emit({ k: 'toast', text: 'Hasan Amca\'nın evinden bir inilti… Artık o değil.', kind: 'danger', dur: 6 });
      S.timeline.post('danger', 'Hasan Amca dönüştü', 'İlaç bulunamadı. Kırk yıllık komşu artık sokakta yürüyor.');
    });
  }

  spawnMigrants() {
    const S = this.s;
    const looks = [NPCS.hasan.look, NPCS.ayse.look, NPCS.can.look, NPCS.selin.look];
    for (let i = 0; i < 6; i++) {
      const t = this.spawnTemp({ ...looks[i % looks.length], backpack: 'hiking', dirt: 0.7 }, -300 + i * 1.6, 168 + (i % 2) * 1.5, Math.PI / 2, 'ground', i === 2 ? 0.75 : 1);
      t.walk = true; t.speed = 1.4;
    }
    this.schedule.push({ at: S.time.total + 600, kind: 'cleanup' });
  }

  spawnAllies(n) {
    const S = this.s;
    const h = S.world.home.frame.pt(12, 17);
    for (let i = 0; i < n; i++) this.spawnTemp({ base: 'survivor-male', skin: '#e0a07a', hairStyle: 'short', hairColor: '#3b2314', top: { style: i ? 'coat' : 'flannel', color: i ? '#f4f6f6' : '#c0392b', color2: '#2c2c2c' }, pants: { style: 'jeans', color: '#34495e' }, shoes: '#3b2b1d', backpack: 'none', dirt: 0.5 }, h.x + i * 1.5, h.z, Math.PI, 'ground');
  }

  /** Telsiz: yayınları dinle */
  useRadio(antenna = false) {
    const S = this.s;
    const lines = this.broadcasts.slice(0, 6).map((b) => `<b>${b.title}</b><br>${b.text}`);
    if (S.time.day >= 9) lines.unshift('<b>147.30 MHz</b><br>' + (antenna || S.flags.antenna_built ? (S.relations.military >= 50 ? '"Kayıtlı siviller: 30. gün 20:00 helikopter pisti. Köprü konvoyu 21:00." (Tahliye listesindesiniz!)' : '"Askerî tahliye yalnızca kayıtlı siviller içindir. Künye ya da numune getirin."') : 'Sinyal zayıf… Bir telsiz anteni kurmalısın.'));
    S.ui.openNote({ title: 'Telsiz Yayınları', src: 'Telsiz', text: lines.join('<hr>') || 'Parazit…' }, true);
    S.audio.play('radio', { vol: 0.6 });
    S.act('flag', { flag: 'radio_heard', value: 1 });
    // Son Yayın: kanıtlar toplandı ve anten kuruldu → gerçeği anakaraya duyur
    if (S.quests.state('m_broadcast') === 'active' && S.flags.antenna_built && !S.flags.truth_broadcast) {
      S.ui.openDialog({
        speaker: 'Telsiz — 147.30 MHz',
        text: 'Anten hazır, kanıtlar elinde: kargo manifestosu, santral raporu, gardiyan defteri. Anakara basını bu frekansı dinliyor. Askerler bundan hiç hoşlanmayacak (askerî ilişki −20). Mikrofonu açacak mısın?',
        choices: [
          { text: '📻 Gerçeği yayınla', onSelect: () => { S.ui.closeDialog(); S.ui.progress('Yayın yapılıyor…', 6, () => { S.act('flag', { flag: 'truth_broadcast', value: 1 }); S.act('broadcast_truth', {}); }); } },
          { text: 'Henüz değil', onSelect: () => S.ui.closeDialog() },
        ],
      });
    }
  }

  serialize() { return { done: [...this.done], schedule: this.schedule, broadcasts: this.broadcasts.slice(0, 20) }; }
  load(o) { if (!o) return; this.done = new Set(o.done || []); this.schedule = o.schedule || []; this.broadcasts = o.broadcasts || []; }
  dispose() { this.cleanupTemp(); }
}

export { dist, REGION_BY_ID };
