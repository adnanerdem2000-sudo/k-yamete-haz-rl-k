// Final sistemi: 30. gün "Son Işık". Yedi alternatif final (sığınak, askerî tahliye, deniz, dağ,
// köprü konvoyu, uçak, son savunma), hazırlık kontrolleri, final sekansları, epilog ve sonuç ekranı.
import * as THREE from 'three';
import { ENDINGS } from '../data/story.js';
import { ITEMS } from '../data/items.js';
import { dist, clamp } from '../core/util.js';
import { BRIDGE } from '../world/WorldLayout.js';

export { BRIDGE };

export class Endings {
  constructor(session) {
    this.s = session;
    this.active = false; // final gecesi başladı mı
    this.finished = false;
    this.chosen = null;
    this.escaped = new Set();
    this.heli = null;
    const S = session;
    S.on('ending_choose', (p) => S.emit({ k: 'ending_choose', id: p.id }));
    S.onEvt('ending_choose', (e) => { this.chosen = e.id; S.ui.toast(`Final planı: ${ENDINGS[e.id].name}`, 'story', 5); });
    S.on('escape', (p, from) => { S.emit({ k: 'escaped', id: from, how: p.how }); });
    S.onEvt('escaped', (e) => { this.escaped.add(e.id); this.escapedHow = this.escapedHow || e.how; if (e.id === S.localId) this.localEscaped(e.how); this.checkAllDone(); });
    S.on('final_result', (p) => S.emit({ k: 'final_result', ...p }));
    S.onEvt('final_result', (e) => this.showResults(e));
    S.on('lab_gate', () => S.emit({ k: 'lab_gate' }));
    S.onEvt('lab_gate', () => {
      const g = S.world.labGate;
      if (!g || g.open) return;
      g.open = true; S.world.physics.setEnabled(g.collider, false);
      g.mesh.position.y -= 2.3;
      S.audio.play('success', { vol: 0.6 });
      S.ui.toast('Güvenlik kapısı açıldı.', 'good');
    });
  }

  /** Final hazırlık durumu */
  readiness() {
    const S = this.s;
    const out = {};
    const storeCount = (cat) => {
      let n = 0;
      for (const st of S.build.storages()) for (const s of st.data.slots || []) if (s && ITEMS[s.id].cat === cat) n += s.qty;
      for (const s of S.inventory.items()) if (ITEMS[s.id].cat === cat) n += s.qty;
      return n;
    };
    const food = storeCount('food'), water = storeCount('drink');
    out.bunker = { ok: S.build.bunker.stage >= 4 && S.build.gen.fixed && food >= 15 && water >= 15, detail: `Sığınak ${S.build.bunker.stage}/4 · Jeneratör ${S.build.gen.fixed ? '✓' : '✗'} · Yiyecek ${food}/15 · Su ${water}/15` };
    out.military = { ok: !!S.flags.antenna_built && (S.relations.military || 0) >= 50, detail: `Anten ${S.flags.antenna_built ? '✓' : '✗'} · Askerî ilişki ${S.relations.military || 0}/50` };
    const boat = S.vehicles.byId('boat');
    const map = S.inventory.has('sea_map') || S.build.storages().some((st) => (st.data.slots || []).some((s) => s && s.id === 'sea_map'));
    // fener yandı ve gemi cevap verdiyse: gemiye ulaşmak yeter (daha az yakıt, harita gerekmez)
    const ship = !!S.flags.ship_contact, needFuel = ship ? 20 : 40;
    out.sea = { ok: !!boat && !boat.broken && boat.fuel >= needFuel && (map || ship), detail: `Tekne ${boat && !boat.broken ? '✓' : '✗'} · Yakıt ${boat ? Math.round(boat.fuel) : 0}/${needFuel} L · ${ship ? 'Gemi bekliyor ✓' : `Harita ${map ? '✓' : '✗'}`}` };
    out.mountain = { ok: (S.flags.mountain_food || 0) >= 20 && !!S.flags.mountain_cabin, detail: `Kamp erzağı ${S.flags.mountain_food || 0}/20 · Kulübe ${S.flags.mountain_cabin ? '✓' : '✗'}` };
    const vReady = S.vehicles.list.find((v) => !v.def.water && !v.broken && !v.wrecked && v.health / v.maxHealth >= 0.6 && v.fuel / v.maxFuel >= 0.7 && v.upgrades.armor);
    out.convoy = { ok: !!vReady, detail: vReady ? `${vReady.def.name} hazır` : 'Zırhlı, %60+ sağlıklı, %70+ yakıtlı araç yok' };
    const pilot = S.npcs.byId('aydin');
    const pilotOk = !!S.flags.pilot_joined && !!pilot && pilot.alive;
    const pf = S.flags.plane_fuel || 0;
    out.plane = { ok: !!S.flags.plane_repaired && pf >= 60 && !!S.flags.runway_clear && pilotOk, detail: `Onarım ${S.flags.plane_repaired ? '✓' : '✗'} · Yakıt ${pf}/60 L · Pist ${S.flags.runway_clear ? '✓' : '✗'} · Pilot ${pilotOk ? '✓' : '✗'}` };
    out.defense = { ok: true, detail: `Üs savunması ${S.build.defenseScore()} · Seviye ${S.build.baseLevel()}` };
    if (S.timeline) for (const [k, v] of Object.entries(out)) if (v.ok && k !== 'defense') S.timeline.onReady(k);
    if (S.isHost) {
      const any = Object.entries(out).some(([k, v]) => k !== 'defense' && v.ok);
      if (any && !S.flags.ending_ready) S.applyAction('flag', { flag: 'ending_ready', value: 1 }, null);
      if (vReady && !S.flags.vehicle_ready) S.applyAction('flag', { flag: 'vehicle_ready', value: 1 }, null);
    }
    return out;
  }

  startFinalDay() {
    const S = this.s;
    S.emit({ k: 'toast', text: 'SON GÜN. Görevler > Kaçış Planları ekranından planınızı seçin.', kind: 'story', dur: 8 });
    S.emit({ k: 'env', doom: 0.9 });
  }

  // ======================================================================= etkileşimler
  boatInfo() {
    const S = this.s;
    const boat = S.vehicles.byId('boat');
    if (!boat) return null;
    if (boat.broken) return { label: 'Martı Teknesi (bozuk) — Tekneye yaklaş ve onar' };
    return { label: S.time.day >= 30 && S.time.hour >= 20 ? '⛵ Tekneyle Kaç!' : 'Martı Teknesi — Yakıt: ' + Math.round(boat.fuel) + ' L' };
  }

  useBoat() {
    const S = this.s;
    const r = this.readiness().sea;
    if (S.time.day >= 30 && S.time.hour >= 20) {
      if (!r.ok) { S.ui.toast('Tekne hazır değil: ' + r.detail, 'warn', 5); return; }
      S.act('vehicle_enter', { id: 'boat', seat: 0 });
      S.ui.toast('Açık denize sür! (Adadan uzaklaş)', 'story', 5);
      this.seaMode = true;
      return;
    }
    S.ui.toast(r.detail, 'info', 5);
  }

  /** Uçak: onarım, yakıt, durum ve 30. gün kalkış */
  usePlane() {
    const S = this.s, inv = S.inventory;
    const r = this.readiness().plane;
    const choices = [];
    if (S.storyWorld.flight) return;
    if (!S.flags.plane_repaired) {
      const need = [['engine_part', 2], ['repair_kit', 1], ['wire', 3]];
      const ok = need.every(([id, n]) => inv.has(id, n));
      choices.push({ text: `🔧 Onar (2 motor parçası, 1 tamir seti, 3 kablo)${ok ? '' : ' — eksik'}`, onSelect: () => {
        S.ui.closeDialog();
        if (!ok) { S.ui.toast('Onarım için parçalar eksik.', 'warn'); return; }
        S.ui.progress('Uçak motoru onarılıyor…', 8, () => {
          if (!need.every(([id, n]) => inv.has(id, n))) { S.ui.toast('Parçalar eksik.', 'warn'); return; }
          for (const [id, n] of need) inv.remove(id, n);
          S.act('flag', { flag: 'plane_repaired', value: 1 });
          S.ui.toast('Motor öksürerek çalıştı ve sustu. Uçak uçuşa hazır — yakıt lazım.', 'good', 5);
          S.audio.play('success', { vol: 0.6 });
        });
      } });
    }
    const cans = inv.slots.map((s, i) => [s, i]).filter(([s]) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
    const have = cans.reduce((a, [s]) => a + (s.fuel || 0), 0);
    const pf = S.flags.plane_fuel || 0;
    if (pf < 60) choices.push({ text: `⛽ Yakıt koy (bidonlarda ${Math.round(have)} L)`, onSelect: () => {
      S.ui.closeDialog();
      if (have <= 0) { S.ui.toast('Dolu yakıt bidonun yok. Önlükteki tanktan doldurabilirsin.', 'warn'); return; }
      let add = 0;
      for (const [s] of cans) { const take = Math.min(s.fuel, 60 - pf - add); s.fuel -= take; add += take; if (pf + add >= 60) break; }
      inv.changed();
      S.act('flag', { flag: 'plane_fuel', add: Math.round(add) });
      S.ui.toast(`Uçağa ${Math.round(add)} L yakıt kondu (${Math.min(60, Math.round(pf + add))}/60 L).`, 'good');
    } });
    if (S.time.day >= 30 && S.time.hour >= 20 && r.ok) choices.push({ text: '✈️ Havalan! (yakındaki herkes uçağa biner)', onSelect: () => { S.ui.closeDialog(); S.act('plane_takeoff', {}); } });
    choices.push({ text: 'Kapat', onSelect: () => S.ui.closeDialog() });
    S.ui.openDialog({
      speaker: 'Tek Motorlu Uçak',
      text: `${r.detail}. ${r.ok ? (S.time.day >= 30 && S.time.hour >= 20 ? 'Aydın motoru ısıtıyor. Herkes uçağın yanına!' : 'Uçak hazır! 30. gün 20:00\'den sonra havalanabiliriz.') : 'Kalkış için: onarım, 60 L yakıt, temiz pist ve pilot gerekli.'}`,
      choices,
    });
  }

  helipad() {
    const S = this.s;
    const r = this.readiness().military;
    if (S.time.day < 30) { S.ui.toast('Tahliye helikopteri 30. gün 20:00\'de burada olacak.', 'info'); return; }
    if (!this.heli) { S.ui.toast('Helikopter henüz gelmedi (20:00).', 'info'); return; }
    if (!r.ok) { S.ui.toast('Adınız listede değil! ' + r.detail, 'danger', 5); return; }
    if (dist(S.local.pos.x, S.local.pos.z, this.heli.x, this.heli.z) < 12) S.act('escape', { how: 'military' });
  }

  useMountainCamp() {
    const S = this.s;
    const inv = S.inventory;
    const choices = [];
    const foodN = inv.items().filter((s) => ['food', 'drink'].includes(ITEMS[s.id].cat)).reduce((a, s) => a + s.qty, 0);
    if (foodN > 0) choices.push({ text: `Tüm yiyecek/içeceği kampa bırak (${foodN})`, onSelect: () => { let n = 0; for (let i = 0; i < inv.size; i++) { const s = inv.slots[i]; if (s && ['food', 'drink'].includes(ITEMS[s.id].cat)) { n += s.qty; inv.slots[i] = null; } } inv.changed(); S.act('flag', { flag: 'mountain_food', add: n }); S.ui.closeDialog(); S.ui.toast(`${n} erzak kampa bırakıldı.`, 'good'); } });
    if (!S.flags.mountain_cabin) choices.push({ text: 'Kulübe kapısını güçlendir (4 tahta, 8 çivi)', onSelect: () => { if (inv.has('plank', 4) && inv.has('nails', 8)) { inv.remove('plank', 4); inv.remove('nails', 8); S.act('flag', { flag: 'mountain_cabin', value: 1 }); S.ui.toast('Kulübe güçlendirildi.', 'good'); } else S.ui.toast('Malzeme yetersiz.', 'warn'); S.ui.closeDialog(); } });
    if (S.time.day >= 30 && S.time.hour >= 20 && this.readiness().mountain.ok) choices.push({ text: '⛰️ Burada kal: Son Işık\'ı dağda bekle', onSelect: () => { S.ui.closeDialog(); S.act('escape', { how: 'mountain' }); } });
    choices.push({ text: 'Kapat', onSelect: () => S.ui.closeDialog() });
    S.ui.openDialog({ speaker: 'Dağ Kampı', text: `Sis yükseklere çıkamaz. Durum: ${this.readiness().mountain.detail}`, choices });
  }

  // ======================================================================= final gecesi
  update(dt) {
    const S = this.s;
    if (this.finished) return;
    const day = S.time.day, m = S.time.minuteOfDay;
    if (day >= 30 && m >= 20 * 60 && !this.active) this.beginNight();
    if (day >= 31 && !this.active) this.beginNight();
    if (!this.active) return;
    // kızıl sis
    const mist = day >= 31 ? 1 : clamp((m - 22 * 60) / 30, 0, 1);
    if (S.isHost && Math.abs((S.env.redMist || 0) - mist) > 0.05) S.emit({ k: 'env', redMist: mist });
    // dalgalar
    if (S.isHost) {
      this.waveT = (this.waveT || 0) - dt;
      if (this.waveT <= 0) {
        this.waveT = 35;
        const tgt = this.chosen === 'defense' || !this.chosen ? null : null;
        S.zombies.spawnHorde(10 + S.players.size * 4, tgt, Math.random() < 0.25);
      }
    }
    // sis hasarı (güvenli yerler hariç)
    if (mist > 0.5 && !this.escaped.has(S.localId)) {
      const p = S.local.pos;
      const safeHigh = p.y > 34;
      const inBunker = S.build.bunkerY !== undefined && Math.abs(p.y - S.build.bunkerY) < 2;
      const sealed = S.local.inside === S.world.home && S.build.defenseScore() >= 20;
      if (!safeHigh && !inBunker && !sealed) { this._mistT = (this._mistT || 0) + dt; if (this._mistT > 1) { this._mistT = 0; S.damageLocal(4, 'internal'); } }
    }
    // helikopter
    if (this.heli) this.updateHeli(dt);
    // deniz kaçışı
    if (this.seaMode && S.local.vehicle && S.local.vehicle.type === 'boat' && ((Math.hypot(S.local.pos.x, S.local.pos.z) > 760 && S.world.terrain.heightAt(S.local.pos.x, S.local.pos.z) < -6) || (S.flags.ship_contact && S.storyWorld.nearShip(S.local.pos, 45)))) { this.seaMode = false; S.act('escape', { how: 'sea' }); }
    // köprü
    const v = S.local.vehicle;
    if (v && !v.def.water && S.time.minuteOfDay >= 21 * 60 && dist(S.local.pos.x, S.local.pos.z, BRIDGE.end.x, BRIDGE.end.z) < BRIDGE.exitR && this.readiness().convoy.ok) S.act('escape', { how: 'convoy' });
    // sığınak
    if (S.build.bunkerY !== undefined && S.build.bunker.stage >= 4 && Math.abs(S.local.pos.y - S.build.bunkerY) < 2 && m >= 22 * 60 && !this.escaped.has(S.localId) && this.readiness().bunker.ok) S.act('escape', { how: 'bunker' });
    // şafak: son savunma sonucu
    if (S.isHost && day >= 31 && S.time.minuteOfDay >= 6 * 60) this.finish('dawn');
  }

  beginNight() {
    const S = this.s;
    this.active = true;
    S.ui.toast('🔴 SON IŞIK BAŞLADI! Sürüler her yerden geliyor. 22:00\'de kızıl sis inecek!', 'danger', 8);
    S.audio.play('siren', { vol: 1 });
    if (S.isHost) {
      // son gece daha hızlı akar (~10 dk)
      S.time.dayMinutes = Math.min(S.time.dayMinutes, 14);
      const r = this.readiness();
      if (r.military.ok || S.flags.antenna_built) this.spawnHeli();
    }
  }

  spawnHeli() {
    const S = this.s;
    const g = new THREE.Group();
    const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3.2, 6, 12), M(0x4b5320)); body.rotation.x = Math.PI / 2; body.position.y = 2; g.add(body);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fd4ef, transparent: true, opacity: 0.6 })); glass.position.set(0, 2.4, 1.9); glass.rotation.x = Math.PI / 2.3; g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), M(0x4b5320)); tail.position.set(0, 2.4, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.8), M(0x3a4018)); fin.position.set(0, 3, -6.5); g.add(fin);
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 4), M(0x222222)); sk.position.set(s * 1.2, 0.2, 0); g.add(sk); }
    const rotor = new THREE.Group(); rotor.position.y = 3.7;
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 6.5), M(0x1b1b1b)); b.rotation.y = (i * Math.PI) / 4 * 2 / 2; rotor.add(b); }
    g.add(rotor);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(366, 80, -150);
    S.game.scene.add(g);
    this.heli = { g, rotor, x: 366, z: -248, y: 9, t: 0, landed: false };
    S.emit({ k: 'marker', x: 366, z: -248, label: 'TAHLİYE HELİKOPTERİ', icon: 'heli' });
  }

  updateHeli(dt) {
    const S = this.s;
    const h = this.heli;
    h.t += dt;
    h.rotor.rotation.y += dt * 25;
    const p = h.g.position;
    if (!h.landed) {
      p.x += (h.x - p.x) * Math.min(1, dt * 0.4); p.z += (h.z - p.z) * Math.min(1, dt * 0.4);
      p.y += (h.y + 0.2 - p.y) * Math.min(1, dt * 0.3);
      if (Math.abs(p.y - h.y) < 1 && dist(p.x, p.z, h.x, h.z) < 2) { h.landed = true; S.ui.toast('🚁 Helikopter indi! Pist üzerinde E ile bin!', 'good', 6); }
    }
    S.audio.loop('heli', 'wind', { at: p, vol: 0.9, range: 120 });
  }

  localEscaped(how) {
    const S = this.s;
    const names = { military: 'Helikoptere bindin!', sea: S.flags.ship_contact ? 'Yük gemisine çıktın!' : 'Açık denizdesin!', mountain: 'Dağ kampında güvendesin.', convoy: 'Köprüyü geçtin!', bunker: 'Sığınak kapakları kapandı.', plane: 'Uçak havalandı! Aşağıda ada kızıla boğuluyor…' };
    S.ui.toast(names[how] || 'Kurtuldun!', 'good', 6);
    if ((how === 'military' && this.heli) || how === 'plane') { S.local.root.visible = false; }
    S.ui.showSpectate(names[how]);
  }

  checkAllDone() {
    const S = this.s;
    if (!S.isHost || this.finished) return;
    const humans = [...S.players.values()];
    const allOut = humans.every((p) => this.escaped.has(p.id) || (p.isLocal ? S.localStats.downed : p.summary && p.summary.downed));
    if (allOut) this.finish('escaped');
  }

  finish(reason) {
    const S = this.s;
    if (this.finished) return;
    this.finished = true;
    const humans = [...S.players.values()];
    const survivors = humans.filter((p) => this.escaped.has(p.id) || !(p.isLocal ? S.localStats.downed : p.summary && p.summary.downed)).length;
    const how = this.escaped.size ? this.lastHow() : 'defense';
    const res = this.computeResults(survivors, humans.length, how, reason);
    S.applyAction('final_result', res, null);
  }

  lastHow() {
    // gerçekleşen kaçış, plan ekranında seçilenden önceliklidir
    return this.escapedHow || (this.chosen && this.chosen !== 'defense' ? this.chosen : 'defense');
  }

  computeResults(survivors, total, how, reason) {
    const S = this.s;
    const r = S.results;
    const baseLevel = S.build.baseLevel();
    let score = (survivors / Math.max(1, total)) * 40 + baseLevel * 3 + r.quests * 2 + r.rescued * 2 + Math.min(15, r.resources / 40) + Math.min(10, r.kills / 15);
    if (how !== 'defense' && survivors > 0) score += 10;
    score = Math.round(clamp(score, 0, 100));
    if (S.flags.truth_broadcast) score = Math.min(100, score + 5);
    const rating = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D';
    return {
      ending: how, reason, survivors, total, score, rating, baseLevel, kills: r.kills, searched: r.searched, resources: r.resources, quests: r.quests, rescued: r.rescued,
      vehicles: [...r.vehicles], choices: r.choices.slice(-8), built: r.built, deaths: r.deaths, days: S.time.day, epilogue: this.epilogue(how, survivors),
    };
  }

  /** Hikâyenin sonu: verilen kararlara göre epilog satırları */
  epilogue(how, survivors) {
    const S = this.s, F = S.flags, out = [];
    if (F.truth_broadcast) out.push('📻 147.30\'dan yapılan yayın anakarada duyuldu. Kızılçam dosyası meclise taşındı; Son Işık\'ın gerçek amacı artık bir sır değil.');
    else if (F['note:lab_secret']) out.push('🗂️ Kızılçam\'ın sırrını öğrendiniz ama dünya duymadı. Kızıl sis kanıtlarla birlikte her şeyi örttü.');
    else out.push('❓ Salgının nereden çıktığı hiçbir zaman öğrenilemedi.');
    if (F.power_restored) out.push('⚡ Son gece adada yanan tek ışıklar sizin yaktığınız şebekeydi.');
    if (F.lighthouse_lit) out.push(F.ship_contact ? '🔆 Fenerin ışığını gören yük gemisi, kıyıdan kaçan onlarca sivili de aldı.' : '🔆 Fener son ana kadar döndü; karanlıkta yolunu kaybeden birkaç tekne onu izleyerek kıyıya ulaştı.');
    if (F.pilot_joined) out.push(how === 'plane' ? '✈️ Pilot Aydın sizi anakaraya indirdi ve ifade vermek için ilk karakola gitti.' : '✈️ Pilot Aydın uçağının başında son ana kadar bekledi.');
    if (F.family_home) out.push('👧 Defne, kurtulduğu gece çizdiği resmi hâlâ saklıyor: bir fener ve yanında sizler.');
    if (F.prisoners_free) out.push('🔓 Serbest bırakılan mahkûmlardan öğretmen Seda, yıllar sonra bu hikâyeyi bir kitapta anlattı.');
    else if (F.prison_decided) out.push('🔒 Cezaevi kararınız Necla\'nın vicdanında bir yük olarak kaldı.');
    if (F.village_safe) out.push('🕌 Dağ köyü kızıl sisin üzerinde kaldı; Muhtar Ömer her yıl o gece için bir çeşme yaptırdı.');
    const hasan = S.npcs.byId('hasan');
    if (hasan && !hasan.alive) out.push('🥀 Hasan Amca\'yı kurtaramadınız. Evinin önündeki çiçekler kurudu.');
    if (S.npcs.dog && S.npcs.dog.found) out.push('🐕 Karabaş, Can\'ın yanından hiç ayrılmadı.');
    if (!survivors) out.push('🩸 Kimse Son Işık\'tan sağ çıkamadı.');
    return out;
  }

  showResults(e) {
    const S = this.s;
    this.finished = true;
    S.ui.showResults(e);
    S.audio.setIntensity(0);
    S.saves.clearAutosave && S.saves.clearAutosave();
  }

  /** Gün 30'dan önce hepsi yere düşerse/oyun bitiş kontrolü */
  dispose() { if (this.heli) this.s.game.scene.remove(this.heli.g); this.s.audio.stopLoop('heli'); }
}
