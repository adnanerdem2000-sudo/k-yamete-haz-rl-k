// Olay sistemi: 30 günlük takvim kilometre taşları + rastgele olaylar (seçimli, oyun içi sahnelerle)
// + radyo/telsiz yayınları. Tüm kararlar host tarafından uygulanır.
import * as THREE from 'three';
import { CALENDAR, EVENTS, NPCS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { RNG, dist } from '../core/util.js';
import { Avatar } from '../entities/Avatar.js';
import { REGION_BY_ID } from '../world/WorldLayout.js';

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
      if (e.requires === 'generator_fixed' && !S.flags.generator_fixed) return false;
      if (e.requires === 'has_security' && !S.flags.has_security) return false;
      if (e.requires === 'driving') return false;
      if (e.mp && S.players.size < 2) return false;
      if (this.done.has(id) && ['storm', 'trader_visit', 'horde_near', 'distress_call'].indexOf(id) < 0) return false;
      return true;
    });
    if (!list.length) return null;
    return this.rng.pick(list)[0];
  }

  applyEffect(eff, day) {
    const S = this.s;
    const [k, arg] = eff.split(':');
    const hz = S.zombies.zones;
    switch (k) {
      case 'tutorial': S.emit({ k: 'toast', text: 'İpucu: Evdeki dolapları ara (E basılı tut), Tab ile envanteri aç, B ile inşa et.', kind: 'info', dur: 8 }); break;
      case 'power_out': S.emit({ k: 'env', streetPower: false }); break;
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
    if (hour === 19) S.emit({ k: 'toast', text: 'Akşam oluyor. Geceleri zombiler daha tehlikeli — üsse dönmeyi düşün.', kind: 'info', dur: 4 });
  }

  update(dt) {
    const S = this.s;
    if (!S.isHost) return;
    const now = S.time.total;
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      const e = this.schedule[i];
      if (now < e.at) continue;
      this.schedule.splice(i, 1);
      if (e.kind === 'event') this.trigger(e.id);
      else if (e.kind === 'horde') { const n = S.zombies.spawnHorde(e.size, null, e.leader); S.emit({ k: 'toast', text: `🧟 SÜRÜ GELİYOR! (${n}+ zombi)`, kind: 'danger', dur: 6 }); S.emit({ k: 'broadcast', day: S.time.day, title: 'ACİL', text: 'Sürü mahalleye ulaştı! Savunma pozisyonu alın!' }); }
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
    if (f.reward) for (const p of S.players.values()) S.emit({ k: 'grant', to: p.id, items: f.reward.map(([it, n]) => ({ id: it, qty: n, ...(it === 'note' ? { noteId: 'random_diary2' } : {}) })) });
    if (f.horde) S.zombies.spawnHorde(f.horde, null, false);
    if (f.horde_at_player) { const p = S.players.get(from); if (p) S.zombies.spawnHorde(f.horde_at_player, { x: p.pos.x, z: p.pos.z }, false); }
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
    if (f.allies) { S.applyAction('flag', { flag: 'allies', add: f.allies }, null); this.spawnAllies(f.allies); S.results.rescued += f.allies; }
    if (f.carDamage) { const v = S.vehicles.list.find((x) => x.seats[0]); if (v) S.applyAction('vehicle_damage', { id: v.id, dmg: v.maxHealth * f.carDamage }, null); }
    if (f.spawnNear) S.zombies.spawnHorde(f.spawnNear, null, false);
    S.emit({ k: 'event_result', id, text: c.result, choiceText: c.text });
    if (id === 'injured_kid' && ci === 0) S.results.rescued += 2;
    this.schedule.push({ at: S.time.total + 120, kind: 'cleanup' });
  }

  marker(kind) {
    const S = this.s;
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
    S.zombies.spawnHorde(12, { x: 62, z: 302 }, false);
    S.emit({ k: 'marker', x: 62, z: 302, label: 'Yardım Çağrısı', icon: 'quest' });
    S.results.rescued += 3;
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
  }

  serialize() { return { done: [...this.done], schedule: this.schedule, broadcasts: this.broadcasts.slice(0, 20) }; }
  load(o) { if (!o) return; this.done = new Set(o.done || []); this.schedule = o.schedule || []; this.broadcasts = o.broadcasts || []; }
  dispose() { this.cleanupTemp(); }
}

export { dist, REGION_BY_ID };
