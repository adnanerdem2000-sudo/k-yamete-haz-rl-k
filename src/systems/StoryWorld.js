// Hikâye dünyası: olay örgüsüne bağlı fiziksel ve görsel dünya parçaları.
//  • Pist enkazları: yarım tonluk dinamik gövdeler; araçla itilir ya da halatla (Rapier ip eklemi) çekilir.
//    Enkazı yerinden oynatan istemci son pozu yayar, host pistin temizlendiğine karar verir.
//  • Uçak: 30. gün kalkış sekansı (taksi → kalkış koşusu → tırmanış), yakındaki oyuncular uçağa biner.
//  • Fener: yanınca dönen ışık huzmesi; açıkta bekleyen yük gemisi (cevap gelirse kıyıya yaklaşır).
//  • Santral: türbin yeniden çalışınca adaya elektrik (sokak lambaları, benzin pompaları).
//  • Olay sahneleri: paraşütlü yardım paketi (fiziksel düşüş, rüzgâr), alevler içinde düşen uçak, sarsıntı,
//    helikopter geçişi. Dinamik konteynerler (paket, kargo, zula) kayıtla birlikte saklanır.
import * as THREE from 'three';
import { G } from '../physics/PhysicsWorld.js';
import { Geo } from '../world/Geo.js';
import * as P from '../world/Props.js';
import { planeGeo, propellerGeo } from '../world/RegionsExtra.js';
import { WORLD } from '../world/WorldLayout.js';
import { RNG, dist, clamp } from '../core/util.js';

export const RUNWAY = { x0: -120, x1: 360, z: -770, half: 15 };
const WRECKS = [
  { model: 'car_sedan', x: 188, z: -767, yaw: 0.5 },
  { model: 'car_stationwagon', x: 236, z: -773, yaw: -1.2 },
  { model: 'car_taxi', x: 290, z: -768, yaw: 2.0 },
];
const WRECK_MASS = 520;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class StoryWorld {
  constructor(session) {
    this.s = session;
    this.pw = session.game.phys;
    this.group = new THREE.Group();
    this.group.name = 'storyworld';
    session.game.scene.add(this.group);
    this.rng = new RNG(session.seed + ':story');
    this.wrecks = [];
    this.drops = [];
    this.crashes = [];
    this.dyn = [];
    this.flight = null;
    this.tremorT = 0;
    this.stealthUntil = 0;
    this.n = 0;
    const S = session;
    // ---- eylemler (host)
    S.on('wreck_pose', (p, from) => S.emit({ k: 'wreck_pose', i: p.i, p: p.p, from }));
    S.on('power_restore', (p, from) => this.hostPowerRestore(from));
    S.on('lighthouse_lit', (p, from) => this.hostLighthouse(from));
    S.on('plane_takeoff', () => { if (!this.flight && S.endings.readiness().plane.ok) S.emit({ k: 'plane_takeoff' }); });
    // ---- olaylar (herkes)
    S.onEvt('wreck_pose', (e) => { if (e.from !== S.localId) this.setWreckPose(e.i, e.p); });
    S.onEvt('dyn_cont', (e) => this.addContainer(e.ct));
    S.onEvt('airdrop', (e) => this.spawnAirdrop(e));
    S.onEvt('crash', (e) => this.spawnCrash(e));
    S.onEvt('tremor', () => this.startTremor());
    S.onEvt('heli_flyby', (e) => this.heliFlyby(e));
    S.onEvt('plane_takeoff', () => this.takeoff());
    S.onEvt('bloodmoon', (e) => { S.zombies.frenzy = !!e.on; S.env.bloodMoon = !!e.on; if (e.on) S.audio.play('siren', { vol: 0.5 }); });
    S.onEvt('stealth', (e) => { this.stealthUntil = e.until; });
    S.onEvt('infect', (e) => { const c = S.localStats.cond; c.infection = Math.max(c.infection || 0, e.amount); S.ui.toast('Ateşin yükseliyor… enfeksiyon belirtileri! (Antibiyotik iyi gelir)', 'danger', 5); });
    S.onEvt('power', (e) => this.applyPower(e.on));
  }

  /** Dünya kurulduktan sonra (yeni oyun, kayıt ve istemci için ortak) */
  init() {
    this.buildBeam();
    this.buildShip();
    this.spawnWrecks();
  }

  get stealth() { return this.s.time.total < this.stealthUntil; }

  // ======================================================================= pist enkazları
  spawnWrecks() {
    if (!this.pw) return;
    const S = this.s;
    WRECKS.forEach((w, i) => {
      let m;
      try { m = S.game.assets.model('vehicles', w.model); } catch { return; }
      if (!m) return;
      m.scale.setScalar(4.6);
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      m.position.sub(c);
      // yanmış gövde: koyu, mat
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.3); o.material.roughness = 0.95; o.castShadow = true; o.receiveShadow = true; } });
      const g = new THREE.Group();
      g.add(m);
      this.group.add(g);
      const y = S.world.terrain.heightAt(w.x, w.z) + size.y / 2 + 0.05;
      const shape = { type: 'box', hx: size.x / 2 * 0.96, hy: size.y / 2 * 0.9, hz: size.z / 2 * 0.96 };
      const vol = size.x * size.y * size.z * 0.96 * 0.9 * 0.96;
      _q.setFromAxisAngle(UP, w.yaw);
      const d = this.pw.addDynamic(g, shape, w.x, y, w.z, { quat: { x: _q.x, y: _q.y, z: _q.z, w: _q.w }, density: WRECK_MASS / vol, friction: 0.55, bounce: 0.02, group: G.PROP, linDamp: 0.3, angDamp: 0.9 });
      d.body.sleep();
      const it = { id: 'tow:' + i, type: 'tow_point', x: w.x, y, z: w.z, wreck: i, name: 'Pist Enkazı' };
      S.world.interactables.push(it);
      this.wrecks.push({ i, d, g, size, it, joint: null, rope: null, last: new THREE.Vector3(w.x, y, w.z), sendT: 0 });
    });
  }

  towInfo(it) {
    const w = this.wrecks[it.wreck];
    if (!w) return null;
    if (w.joint) return { label: 'Halatı Çöz', range: 3.4 };
    if (this.s.flags.runway_clear) return null;
    return { label: 'Halat Bağla — enkazı yakındaki araca bağla (İp)', holdTime: 1.2, range: 3.4 };
  }

  useTow(it) {
    const S = this.s, w = this.wrecks[it.wreck];
    if (!w || !this.pw) return;
    if (w.joint) { this.detach(w); S.ui.toast('Halat çözüldü.', 'info'); return; }
    if (!S.inventory.has('rope')) { S.ui.toast('Halat bağlamak için ip gerekli.', 'warn'); return; }
    const t = w.d.body.translation();
    let best = null, bd = 16;
    for (const v of S.vehicles.list) {
      if (!v.body || v.def.water || v.wrecked) continue;
      const d = dist(v.pos.x, v.pos.z, t.x, t.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) { S.ui.toast('16 m içinde halatın bağlanacağı bir araç yok.', 'warn'); return; }
    this.attach(w, best);
    S.ui.toast(`Enkaz ${best.def.name} aracına bağlandı. Bin ve yavaşça çek!`, 'good', 5);
    S.audio.play('pickup', { vol: 0.6 });
  }

  attach(w, v) {
    const R = this.pw.R;
    const t = w.d.body.translation();
    const va = { x: 0, y: 0.35, z: -v.def.len * 0.5 }; // aracın arka tamponu (yerel, +Z ileri)
    const len = clamp(dist(v.pos.x, v.pos.z, t.x, t.z) - 1, 4, 9);
    w.joint = this.pw.w.createImpulseJoint(R.JointData.rope(len, va, { x: 0, y: 0, z: 0 }), v.body, w.d.body, true);
    w.towV = v; w.va = va;
    w.d.body.wakeUp();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    w.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd8c38a }));
    w.rope.frustumCulled = false;
    this.group.add(w.rope);
  }

  detach(w) {
    if (w.joint) { try { this.pw.w.removeImpulseJoint(w.joint, true); } catch { /* gövde silinmiş olabilir */ } }
    w.joint = null; w.towV = null;
    if (w.rope) { this.group.remove(w.rope); w.rope.geometry.dispose(); w.rope = null; }
  }

  setWreckPose(i, p) {
    const w = this.wrecks[i];
    if (!w || !p) return;
    const b = w.d.body;
    b.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    b.setRotation({ x: p[3], y: p[4], z: p[5], w: p[6] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    w.last.set(p[0], p[1], p[2]);
  }

  offRunway(w) {
    const t = w.d.body.translation();
    if (t.y < -20) return true;
    const ext = Math.max(w.size.x, w.size.z) / 2;
    return Math.abs(t.z - RUNWAY.z) > RUNWAY.half + ext * 0.6 || t.x < RUNWAY.x0 - ext || t.x > RUNWAY.x1 + ext;
  }

  updateWrecks(dt) {
    const S = this.s;
    for (const w of this.wrecks) {
      const t = w.d.body.translation();
      w.it.x = t.x; w.it.y = t.y + 0.4; w.it.z = t.z;
      if (w.joint) {
        const v = w.towV;
        if (!v || !v.body) { this.detach(w); continue; }
        const vt = v.body.translation(), vr = v.body.rotation();
        _q.set(vr.x, vr.y, vr.z, vr.w);
        _v.set(w.va.x, w.va.y, w.va.z).applyQuaternion(_q);
        const a = w.rope.geometry.attributes.position;
        a.setXYZ(0, vt.x + _v.x, vt.y + _v.y, vt.z + _v.z);
        a.setXYZ(1, t.x, t.y + 0.2, t.z);
        a.needsUpdate = true;
        w.d.body.wakeUp();
      }
      // bu istemcide yerinden oynadıysa (ve durulduysa) son pozu yay
      w.sendT -= dt;
      if (w.sendT > 0) continue;
      w.sendT = 0.8;
      const moved = Math.hypot(t.x - w.last.x, t.z - w.last.z);
      if (moved < 0.6) continue;
      const lv = w.d.body.linvel();
      const mine = !!w.joint || S.isHost || (S.local.vehicle && dist(S.local.pos.x, S.local.pos.z, t.x, t.z) < 30);
      if (!mine || Math.hypot(lv.x, lv.z) > (w.joint ? 99 : 0.8)) continue;
      const r = w.d.body.rotation();
      w.last.set(t.x, t.y, t.z);
      S.act('wreck_pose', { i: w.i, p: [t.x, t.y, t.z, r.x, r.y, r.z, r.w].map((x) => Math.round(x * 1000) / 1000) });
    }
    // host: pist temiz mi?
    if (S.isHost && !S.flags.runway_clear && this.wrecks.length) {
      this._rwT = (this._rwT || 0) - dt;
      if (this._rwT <= 0) {
        this._rwT = 2;
        if (this.wrecks.every((w) => this.offRunway(w))) {
          S.applyAction('flag', { flag: 'runway_clear', value: 1 }, null);
          S.emit({ k: 'toast', text: '🛬 Pist temizlendi! Uçak kalkabilir.', kind: 'good', dur: 5 });
          S.timeline.post('world', 'Pist temizlendi', 'Enkazlar pistten çekildi; uçak için yol açık.');
        }
      }
    }
  }

  // ======================================================================= santral (elektrik)
  damInfo() {
    const S = this.s;
    if (S.flags.power_restored) return { label: 'Santral: Türbin 2 çalışıyor ⚡' };
    return { label: 'Santral Kontrol Paneli — Türbini Başlat', holdTime: 0 };
  }

  useDam() {
    const S = this.s, inv = S.inventory;
    if (S.flags.power_restored) { S.ui.toast('Türbin dönüyor, şebeke ayakta. Ses onları çekiyor — dikkat!', 'info', 4); return; }
    const relight = !!S.flags.power_was_on; // hırsızlıktan sonra yalnızca kablo gerekir
    const need = relight ? [['wire', 3]] : [['engine_part', 1], ['wire', 3], ['electronics', 2]];
    const ok = need.every(([id, n]) => inv.has(id, n));
    const list = need.map(([id, n]) => `${inv.count(id)}/${n} ${({ engine_part: 'motor parçası', wire: 'kablo', electronics: 'elektronik' })[id]}`).join(' · ');
    S.ui.openDialog({
      speaker: 'Santral Kontrol Paneli',
      text: relight ? `Kablolar sökülmüş. Şebekeyi yeniden bağlamak için: ${list}` : `TÜRBİN 2: DURDU. Yeniden başlatmak için gerekenler: ${list}. Elektrik gelirse sokak lambaları, benzin pompaları, fener ve havaalanı çalışır.`,
      choices: [
        ok ? { text: '⚡ Türbini başlat', onSelect: () => {
          S.ui.closeDialog();
          S.ui.progress('Türbin başlatılıyor…', 5, () => {
            if (!need.every(([id, n]) => inv.has(id, n))) { S.ui.toast('Parçalar eksik.', 'warn'); return; }
            for (const [id, n] of need) inv.remove(id, n);
            S.act('power_restore', {});
            S.quests.onInteract('dam_control');
          });
        } } : { text: 'Parçalar eksik', onSelect: () => S.ui.closeDialog() },
        { text: 'Kapat', onSelect: () => S.ui.closeDialog() },
      ],
    });
  }

  hostPowerRestore(from) {
    const S = this.s;
    if (S.flags.power_restored) return;
    S.applyAction('flag', { flag: 'power_restored', value: 1 }, null);
    S.applyAction('flag', { flag: 'power_was_on', value: 1 }, null);
    S.applyAction('flag', { flag: 'gas_power', value: 1 }, null);
    S.emit({ k: 'power', on: true });
    S.emit({ k: 'broadcast', day: S.time.day, title: '⚡ ELEKTRİK GERİ GELDİ', text: 'Baraj santrali şebekeyi besliyor: sokak lambaları yanıyor, benzin pompaları çalışıyor.' });
    S.applyAction('noise', { x: -470, z: -205, r: 160, src: 'turbine' }, null);
    S.applyAction('team_morale', { amount: 10 }, null);
    S.timeline.post('world', 'Elektrik geri geldi', 'Türbin 2 yeniden çalıştı. Ada yeniden ışıklandı.');
    void from;
  }

  /** Elektrik açık/kapalı (sokak lambaları, santral sesi) */
  applyPower(on) {
    const S = this.s;
    S.env.streetPower = !!on;
    if (!on) S.flags.power_restored = 0;
  }

  // ======================================================================= deniz feneri
  lighthouseInfo() {
    const S = this.s;
    if (S.flags.lighthouse_lit) return { label: 'Fener yanıyor 🔆' };
    return { label: 'Fener Lambası — Yak', holdTime: 0 };
  }

  useLighthouse() {
    const S = this.s, inv = S.inventory;
    if (S.flags.lighthouse_lit) { S.ui.toast('Fener dönüyor. Açıktaki gemi ışığı görüyor olmalı.', 'info', 4); return; }
    const power = !!S.flags.power_restored;
    const need = power ? [['glass', 2]] : [['glass', 2], ['battery', 4]];
    const ok = need.every(([id, n]) => inv.has(id, n));
    const list = need.map(([id, n]) => `${inv.count(id)}/${n} ${id === 'glass' ? 'cam' : 'akü/pil'}`).join(' · ');
    S.ui.openDialog({
      speaker: 'Fener Lambası',
      text: `Mercek kırık, lamba sönük. ${power ? 'Santral elektriği hatta: yalnızca mercek camı gerekiyor.' : 'Elektrik yok: lambayı akülerle besleyebilirsin.'} Gerekli: ${list}`,
      choices: [
        ok ? { text: '🔆 Lambayı yak', onSelect: () => {
          S.ui.closeDialog();
          S.ui.progress('Mercek takılıyor…', 4, () => {
            if (!need.every(([id, n]) => inv.has(id, n))) { S.ui.toast('Malzeme eksik.', 'warn'); return; }
            for (const [id, n] of need) inv.remove(id, n);
            S.act('lighthouse_lit', {});
            S.quests.onInteract('lighthouse');
          });
        } } : { text: 'Malzeme eksik', onSelect: () => S.ui.closeDialog() },
        { text: 'Kapat', onSelect: () => S.ui.closeDialog() },
      ],
    });
  }

  hostLighthouse() {
    const S = this.s;
    if (S.flags.lighthouse_lit) return;
    S.applyAction('flag', { flag: 'lighthouse_lit', value: 1 }, null);
    S.emit({ k: 'toast', text: '🔆 Deniz feneri yeniden yanıyor! Işık kilometrelerce öteden görülecek.', kind: 'good', dur: 6 });
    S.applyAction('team_morale', { amount: 8 }, null);
    S.timeline.post('world', 'Fener yandı', 'Kırk yıllık ışık yeniden dönüyor. Açıktaki gemi cevap verecek mi?');
    // gemi cevabı: ertesi gece
    S.events.schedule.push({ at: (S.time.day) * 1440 + 21 * 60 + 30, kind: 'event', id: 'ship_signal' });
  }

  buildBeam() {
    const L = this.s.world.lighthouse;
    if (!L) return;
    const g = new THREE.Group();
    g.position.set(L.x, L.y + 0.4, L.z);
    g.visible = false;
    // yumuşak hacimsel huzme: kenarlara (bakış açısı) ve uzunluğa doğru sönümlenen eklemeli ışık
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff0b0) }, uOpacity: { value: 0.4 } },
      vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vV;
        void main() {
          vAlong = clamp(position.x / 110.0, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vAlong; varying vec3 vN; varying vec3 vV;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float a = pow(facing, 1.8) * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.03, vAlong) * uOpacity;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.ConeGeometry(7, 110, 32, 1, true);
    geo.translate(0, -55, 0);
    geo.rotateZ(Math.PI / 2); // tepe lambada, huzme +X boyunca açılır
    for (const a of [0, Math.PI]) { const m = new THREE.Mesh(geo, mat); m.rotation.set(0, a, -0.05); g.add(m); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }));
    g.add(lamp);
    const light = new THREE.PointLight(0xffe9a8, 0, 90, 1.6);
    g.add(light);
    this.group.add(g);
    this.beam = { g, mat, light };
  }

  updateBeam(dt) {
    const B = this.beam;
    if (!B) return;
    const on = !!this.s.flags.lighthouse_lit;
    B.g.visible = on;
    if (!on) return;
    const night = this.s.time.isNight;
    B.g.rotation.y += dt * 0.9;
    B.mat.uniforms.uOpacity.value = night ? 0.45 : 0.06;
    B.light.intensity = night ? 3 : 0.3;
  }

  // ======================================================================= açıktaki gemi
  buildShip() {
    const L = this.s.world.lighthouse;
    if (!L) return;
    const T = this.s.world.terrain;
    const len = Math.hypot(L.x, L.z) || 1, ux = L.x / len, uz = L.z / len;
    let r = len;
    for (; r < 1150; r += 8) if (T.heightAt(ux * r, uz * r) < -10) break;
    const geo = new Geo();
    const B = (mat, x0, y0, z0, x1, y1, z1, col) => P.rbox(geo, mat, 0, 0, 0, 0, x0, y0, z0, x1, y1, z1, col);
    B('metal', -5.5, -2.5, -24, 5.5, 3, 24, '#3a2f2c');
    B('metal', -5.6, 2.2, -24, 5.6, 3.1, 24, '#8a2a1a');
    B('metal', -3.8, 3, 26, 3.8, 3.4, 24, '#3a2f2c');
    B('plain', -4.5, 3, -22, 4.5, 11, -13, '#ecf0f1');
    B('glass', -4.6, 9, -21.5, 4.6, 10.2, -13.5, '#9fd4ef');
    B('metal', -1.2, 11, -19, 1.2, 15, -16.5, '#c0392b');
    const cc = ['#2e86c1', '#c0392b', '#27ae60', '#f39c12', '#7f8c8d', '#8e44ad'];
    for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) B('metal', -4.6 + k * 4.7, 3, -10 + i * 5.6, -0.2 + k * 4.7, 5.6, -5 + i * 5.6, cc[(i + k * 3) % cc.length]);
    B('metal', -0.25, 3, 10, 0.25, 18, 10.5, '#2c3e50');
    for (const [x, z] of [[-5.2, -12], [5.2, -12], [0, 23.5]]) B('emissive', x - 0.2, 4, z - 0.2, x + 0.2, 4.4, z + 0.2, '#ffd27f');
    const g = new THREE.Group();
    for (const m of geo.toMeshes()) g.add(m);
    const signal = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    signal.position.set(0, 18.6, 10.25);
    g.add(signal);
    const far = new THREE.Vector3(ux * (r + 90), WORLD.sea - 0.3, uz * (r + 90));
    const near = new THREE.Vector3(ux * (r + 25), WORLD.sea - 0.3, uz * (r + 25));
    g.position.copy(far);
    g.rotation.y = Math.atan2(-uz, ux); // kıyıya paralel
    this.group.add(g);
    this.ship = { g, signal, far, near, t: 0 };
  }

  updateShip(dt) {
    const sh = this.ship;
    if (!sh) return;
    const S = this.s;
    sh.t += dt;
    const target = S.flags.ship_contact ? sh.near : sh.far;
    sh.g.position.lerp(target, Math.min(1, dt * 0.02));
    sh.g.position.y = WORLD.sea - 0.3 + Math.sin(sh.t * 0.6) * 0.25;
    sh.g.rotation.z = Math.sin(sh.t * 0.45) * 0.02;
    // gece üç kısa yanıp sönme, sonra bekleme
    const ph = sh.t % 6;
    sh.signal.visible = S.time.isNight && (ph < 0.3 || (ph > 0.6 && ph < 0.9) || (ph > 1.2 && ph < 1.5));
  }

  nearShip(p, r = 45) { return !!this.ship && dist(p.x, p.z, this.ship.g.position.x, this.ship.g.position.z) < r; }

  // ======================================================================= uçak kalkışı
  takeoff() {
    const S = this.s, PL = S.world.plane;
    if (!PL || !PL.group || this.flight) return;
    for (const c of PL.colliders || []) S.world.physics.setEnabled(c, false);
    const g = PL.group;
    this.flight = { t: 0, phase: 'taxi', speed: 0, pitch: 0, yaw: PL.a, start: g.position.clone(), alt: g.position.y };
    // yakındaki oyuncu uçağa biner
    const p = S.local.pos;
    if (!S.endings.escaped.has(S.localId) && dist(p.x, p.z, g.position.x, g.position.z) < 30 && !S.localStats.downed) {
      if (S.local.vehicle) S.vehicles.exitLocal();
      S.act('escape', { how: 'plane' });
    }
    const pilot = S.npcs.byId('aydin');
    if (pilot) pilot.setVisible(false);
    S.ui.toast('✈️ Aydın: "Kemerler bağlı mı? Gidiyoruz!"', 'story', 5);
  }

  updateFlight(dt) {
    const F = this.flight, S = this.s;
    if (!F) return;
    const g = S.world.plane.group, prop = S.world.plane.prop;
    F.t += dt;
    prop.rotation.z += dt * (8 + F.speed * 3);
    const rz = RUNWAY.z, startX = F.start.x;
    if (F.phase === 'taxi') {
      // önlükten pist eksenine in, burnu doğuya çevir
      const k = Math.min(1, F.t / 6);
      const e = k * k * (3 - 2 * k);
      g.position.x = startX;
      g.position.z = F.start.z + (rz - F.start.z) * e;
      F.yaw = F.yaw + (Math.PI / 2 - F.yaw) * Math.min(1, dt * 1.2);
      if (k >= 1) { F.phase = 'roll'; F.t = 0; }
    } else if (F.phase === 'roll') {
      F.yaw += (Math.PI / 2 - F.yaw) * Math.min(1, dt * 3);
      F.speed = Math.min(48, F.speed + 6.5 * dt);
      g.position.x += F.speed * dt;
      if (F.speed > 33) F.pitch = Math.min(0.2, F.pitch + dt * 0.12);
      if (F.pitch > 0.05) F.alt += F.speed * Math.sin(F.pitch) * dt;
      g.position.y = Math.max(F.alt, S.world.terrain.heightAt(g.position.x, g.position.z) + 1);
      if (g.position.x > startX + 260 || F.alt > F.start.y + 25) { F.phase = 'climb'; F.t = 0; }
    } else if (F.phase === 'climb') {
      F.speed = Math.min(60, F.speed + 3 * dt);
      F.pitch = Math.min(0.28, F.pitch + dt * 0.05);
      g.position.x += Math.cos(F.pitch) * F.speed * dt;
      F.alt += Math.sin(F.pitch) * F.speed * dt;
      g.position.y = F.alt;
      if (F.t > 30) { g.visible = false; S.audio.stopLoop('plane'); this.flight = null; return; }
    }
    g.rotation.set(0, 0, 0);
    g.rotateY(F.yaw);
    g.rotateX(-F.pitch);
    S.audio.loop('plane', 'engine', { at: g.position, vol: 1, range: 260, rate: 1.4 + F.speed / 40 });
  }

  // ======================================================================= dinamik konteynerler
  addContainer(ct) {
    const S = this.s;
    const ex = S.loot.byId.get(ct.id);
    if (ex) { Object.assign(ex, ct); return ex; }
    const c = { building: null, room: null, size: 1, locked: 0, ...ct };
    S.world.containers.push(c);
    S.loot.byId.set(c.id, c);
    this.dyn.push(c);
    return c;
  }

  /** Takımın ağırlık merkezi (olay konumları için) */
  teamCenter() {
    const S = this.s;
    let x = 0, z = 0, n = 0;
    for (const p of S.players.values()) { const pos = p.isLocal ? S.local.pos : p.pos; if (!pos) continue; x += pos.x; z += pos.z; n++; }
    return n ? { x: x / n, z: z / n } : { x: S.local.pos.x, z: S.local.pos.z };
  }

  /** Karada, bina ve su dışında bir nokta */
  pickSite(minR, maxR, around = null) {
    const S = this.s, T = S.world.terrain;
    const c = around || this.teamCenter();
    for (let k = 0; k < 40; k++) {
      const a = this.rng.next() * Math.PI * 2, r = minR + this.rng.next() * (maxR - minR);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(x) > WORLD.size / 2 - 60 || Math.abs(z) > WORLD.size / 2 - 60) continue;
      if (T.isWater(x, z) || T.heightAt(x, z) < 1.2 || S.world.buildingAt(x, z)) continue;
      if (S.world.physics.overlapsBox(x - 2, z - 2, x + 2, z + 2, T.heightAt(x, z) + 0.2, T.heightAt(x, z) + 3)) continue;
      return { x, z, a };
    }
    return null;
  }

  // ======================================================================= yardım paketi (paraşüt)
  hostAirdrop() {
    const S = this.s;
    const site = this.pickSite(140, 260);
    if (!site) return;
    const id = 'drop' + (++this.n) + '_' + Math.round(S.time.total);
    S.emit({ k: 'airdrop', id, x: site.x, z: site.z, a: site.a });
    S.emit({ k: 'marker', x: site.x, z: site.z, label: 'Yardım Paketi', icon: 'quest' });
    S.later(26, () => S.applyAction('noise', { x: site.x, z: site.z, r: 140, src: 'airdrop' }, null));
  }

  spawnAirdrop(e, landed = null) {
    const S = this.s;
    if (this.drops.some((d) => d.id === e.id)) return;
    const gy = S.world.terrain.heightAt(e.x, e.z);
    const crate = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x55613a, roughness: 0.85 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.3), olive);
    box.castShadow = true; box.receiveShadow = true;
    crate.add(box);
    const strapM = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });
    for (const r of [0, Math.PI / 2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.34, 1.04, 0.12), strapM); s.rotation.y = r; crate.add(s); }
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cross.rotation.x = -Math.PI / 2; cross.position.y = 0.521; crate.add(cross);
    this.group.add(crate);
    const chute = this.makeChute();
    this.group.add(chute);
    const ct = this.addContainer({ id: 'dyn:' + e.id, type: 'military_crate', label: 'Yardım Paketi', x: e.x, y: gy + 0.6, z: e.z, special: 'airdrop' });
    const drop = { id: e.id, crate, chute, ct, x: e.x, z: e.z, gy, t: 0, landed: false, smokeT: 0, smokeLeft: 120, d: null };
    const sy = landed ? landed[1] : gy + 115, sx = landed ? landed[0] : e.x - Math.sin(e.a || 0) * 24, sz = landed ? landed[2] : e.z - Math.cos(e.a || 0) * 24;
    if (this.pw) {
      drop.d = this.pw.addDynamic(crate, { type: 'box', hx: 0.65, hy: 0.5, hz: 0.65 }, sx, sy, sz, { density: 95 / 1.69, linDamp: landed ? 0.4 : 1.6, angDamp: 3, group: G.PROP, vel: { x: 0, y: landed ? 0 : -3, z: 0 } });
    } else crate.position.set(sx, sy, sz);
    if (landed) { drop.landed = true; drop.smokeLeft = 0; chute.visible = false; }
    else this.flyover(e.x, e.z, gy + 150, e.a || 0);
    this.drops.push(drop);
  }

  makeChute() {
    const g = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.9, side: THREE.DoubleSide }));
    canopy.scale.y = 0.55;
    canopy.castShadow = true;
    g.add(canopy);
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pts.push(Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6, 0, -4.6, 0); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd })));
    return g;
  }

  updateDrops(dt) {
    const S = this.s;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const pos = d.crate.position;
      if (!d.landed) {
        if (d.d) {
          // rüzgâr + hedefe süzülme (yatay hız ~2 m/s'ye kadar)
          const b = d.d.body, lv = b.linvel(), m = b.mass();
          const tx = clamp((d.x - pos.x) * 0.12, -2.2, 2.2), tz = clamp((d.z - pos.z) * 0.12, -2.2, 2.2);
          b.applyImpulse({ x: (tx - lv.x) * m * 0.04, y: 0, z: (tz - lv.z) * m * 0.04 }, true);
          const ground = S.world.terrain.heightAt(pos.x, pos.z);
          if ((pos.y - ground < 1.0 && Math.abs(lv.y) < 2) || d.t > 70) {
            d.landed = true;
            b.setLinearDamping(0.4);
            S.audio.play('bash', { at: pos, vol: 0.8 });
            S.fx.dust(pos.x, ground + 0.2, pos.z, 14);
          }
        } else { pos.y -= 7 * dt; if (pos.y < d.gy + 0.5) { pos.y = d.gy + 0.5; d.landed = true; } }
        d.chute.position.set(pos.x, pos.y + 4.9, pos.z);
        d.chute.rotation.set(Math.sin(d.t * 1.3) * 0.08, d.t * 0.2, Math.cos(d.t * 1.1) * 0.08);
      } else if (d.chute.visible) {
        // paraşüt sönüp yana yatar
        d.chute.position.y = Math.max(d.gy + 0.3, d.chute.position.y - dt * 3);
        d.chute.scale.y = Math.max(0.08, d.chute.scale.y - dt * 0.6);
        d.chute.position.x += dt * 0.8;
        if (d.chute.scale.y <= 0.08 && d.t > 200) d.chute.visible = false;
      }
      d.ct.x = pos.x; d.ct.y = pos.y + 0.5; d.ct.z = pos.z;
      // kırmızı işaret dumanı
      if (d.landed && d.smokeLeft > 0) {
        d.smokeLeft -= dt;
        d.smokeT -= dt;
        if (d.smokeT <= 0 && dist(pos.x, pos.z, S.local.pos.x, S.local.pos.z) < 400) { d.smokeT = 0.35; S.fx.smoke(pos.x + 0.4, pos.y + 0.6, pos.z, 2, '#d24a3a'); }
      }
    }
  }

  /** Kargo uçağı / helikopter geçişi (görsel + ses) */
  flyover(x, z, y, a = 0, heli = false) {
    const g = new THREE.Group();
    const geo = new Geo();
    planeGeo(geo, false, 0, 0, 0, 0, heli ? { body: '#4b5320', stripe: '#3a4018' } : { body: '#6b7378', stripe: '#3d4448' });
    for (const m of geo.toMeshes()) g.add(m);
    g.scale.setScalar(heli ? 1.2 : 2.6);
    this.group.add(g);
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    this.flyovers = this.flyovers || [];
    this.flyovers.push({ g, from: new THREE.Vector3(x, y, z).addScaledVector(dir, -700), dir, t: 0, dur: 18, speed: 78 });
  }

  updateFlyovers(dt) {
    if (!this.flyovers) return;
    for (let i = this.flyovers.length - 1; i >= 0; i--) {
      const f = this.flyovers[i];
      f.t += dt;
      f.g.position.copy(f.from).addScaledVector(f.dir, f.speed * f.t);
      f.g.rotation.set(0, Math.atan2(f.dir.x, f.dir.z), 0);
      this.s.audio.loop('fly' + i, 'engine', { at: f.g.position, vol: 0.9, range: 420, rate: 0.7 });
      if (f.t > f.dur) { this.s.audio.stopLoop('fly' + i); this.group.remove(f.g); this.flyovers.splice(i, 1); }
    }
  }

  heliFlyby() {
    const c = this.teamCenter();
    const gy = this.s.world.terrain.heightAt(c.x, c.z);
    this.flyover(c.x, c.z, gy + 70, Math.random() * Math.PI * 2, true);
    this.s.audio.play('siren', { vol: 0.25 });
  }

  // ======================================================================= düşen uçak
  hostCrash(mark = true) {
    const S = this.s;
    const site = this.pickSite(130, 260);
    if (!site) return;
    const id = 'crash' + (++this.n) + '_' + Math.round(S.time.total);
    S.emit({ k: 'crash', id, x: site.x, z: site.z, a: site.a });
    if (mark) S.emit({ k: 'marker', x: site.x, z: site.z, label: 'Düşen Uçak', icon: 'danger' });
    const gy = S.world.terrain.heightAt(site.x, site.z);
    S.later(9, () => S.emit({ k: 'fire_area', x: site.x, y: gy + 0.5, z: site.z, r: 6, life: 90 }));
  }

  spawnCrash(e, done = false) {
    const S = this.s;
    if (this.crashes.some((c) => c.id === e.id)) return;
    const gy = S.world.terrain.heightAt(e.x, e.z);
    const g = new THREE.Group();
    const geo = new Geo();
    planeGeo(geo, false, 0, 0, 0, 0, { body: '#5d6166', stripe: '#8a2a1a' });
    for (const m of geo.toMeshes()) g.add(m);
    this.group.add(g);
    const a = e.a || 0;
    const start = new THREE.Vector3(e.x - Math.sin(a) * 420, gy + 130, e.z - Math.cos(a) * 420);
    const end = new THREE.Vector3(e.x, gy + 1.2, e.z);
    const c = { id: e.id, g, start, end, t: 0, dur: 8.5, done: false, x: e.x, z: e.z, gy, a, smokeT: 0, smokeLeft: 180 };
    this.crashes.push(c);
    if (done) this.impact(c, true);
  }

  updateCrashes(dt) {
    const S = this.s;
    for (const c of this.crashes) {
      if (!c.done) {
        c.t += dt;
        const k = Math.min(1, c.t / c.dur);
        c.g.position.lerpVectors(c.start, c.end, k);
        c.g.position.y = c.start.y + (c.end.y - c.start.y) * (k * k * 0.65 + k * 0.35);
        c.g.rotation.set(0, 0, 0);
        c.g.rotateY(c.a);
        c.g.rotateX(0.12 + k * 0.45);
        c.g.rotateZ(Math.sin(c.t * 2.6) * 0.3);
        c.smokeT -= dt;
        if (c.smokeT <= 0) { c.smokeT = 0.07; const p = c.g.position; S.fx.smoke(p.x, p.y + 0.5, p.z, 2, '#1e1e1e'); if (Math.random() < 0.5) S.fx.sparks(p.x, p.y + 0.6, p.z); }
        S.audio.loop('crash' + c.id, 'engine', { at: c.g.position, vol: 1, range: 500, rate: 2.4 - k });
        if (k >= 1) this.impact(c);
      } else if (c.smokeLeft > 0) {
        c.smokeLeft -= dt;
        c.smokeT -= dt;
        if (c.smokeT <= 0 && dist(c.x, c.z, S.local.pos.x, S.local.pos.z) < 500) { c.smokeT = 0.4; S.fx.smoke(c.x, c.gy + 1.5, c.z, 3, '#2a2a2a'); }
      }
    }
  }

  impact(c, silent = false) {
    const S = this.s;
    c.done = true;
    S.audio.stopLoop('crash' + c.id);
    this.group.remove(c.g);
    // enkaz: kırık kanatlı gövde, burnu toprağa gömülü
    const geo = new Geo();
    planeGeo(geo, true, 0, 0, 0, 0, { body: '#3b3d40', stripe: '#1e1e1e' });
    const w = new THREE.Group();
    for (const m of geo.toMeshes()) w.add(m);
    w.position.set(c.x, c.gy - 0.2, c.z);
    w.rotation.set(0.18, c.a, 0.12);
    this.group.add(w);
    c.wreck = w;
    this.addContainer({ id: 'dyn:' + c.id, type: 'body', label: 'Kargo Bölmesi', x: c.x + Math.cos(c.a) * 2.6, y: c.gy + 0.6, z: c.z - Math.sin(c.a) * 2.6, special: 'crash_cargo' });
    if (silent) { c.smokeLeft = 0; return; }
    S.props.explosion(c.x, c.gy + 1, c.z, 9, 'crash');
    S.props.burst(c.x, c.gy + 1.6, c.z, 'metal', 14);
  }

  // ======================================================================= sarsıntı
  startTremor() {
    this.tremorT = 6;
    this.s.audio.play('thunder', { vol: 1 });
    this.s.audio.play('explosion', { vol: 0.35 });
  }

  updateTremor(dt) {
    if (this.tremorT <= 0) return;
    const S = this.s;
    this.tremorT -= dt;
    S.local.camShake = Math.max(S.local.camShake || 0, 0.7 * Math.min(1, this.tremorT / 2));
    this._tq = (this._tq || 0) - dt;
    if (this._tq > 0 || !this.pw) return;
    this._tq = 0.3;
    const p = S.local.pos;
    for (const d of this.pw.dynamic) {
      const t = d.body.translation();
      if (Math.abs(t.x - p.x) > 70 || Math.abs(t.z - p.z) > 70) continue;
      const m = d.body.mass();
      d.body.applyImpulse({ x: (Math.random() - 0.5) * m * 1.4, y: m * (0.25 + Math.random() * 0.5), z: (Math.random() - 0.5) * m * 1.4 }, true);
      d.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.2, y: (Math.random() - 0.5) * m * 0.2, z: (Math.random() - 0.5) * m * 0.2 }, true);
    }
    for (const vb of this.pw.vehicleBodies || []) {
      if (vb.isKinematic()) continue;
      const m = vb.mass();
      vb.applyImpulse({ x: (Math.random() - 0.5) * m * 0.25, y: m * 0.3, z: (Math.random() - 0.5) * m * 0.25 }, true);
    }
  }

  hostTremor() {
    const S = this.s;
    S.emit({ k: 'tremor' });
    // üs yapıları hasar alır
    const list = [...S.build.structures.values()];
    for (let i = 0; i < Math.min(3, list.length); i++) {
      const st = list[Math.floor(this.rng.next() * list.length)];
      S.applyAction('struct_damage', { id: st.id, dmg: 12 + this.rng.int(0, 18) }, null);
    }
  }

  // ======================================================================= zula / kamyon
  hostCache(special, guards = 0) {
    const S = this.s;
    const site = this.pickSite(180, 340);
    if (!site) return;
    const id = 'cache' + (++this.n) + '_' + Math.round(S.time.total);
    const gy = S.world.terrain.heightAt(site.x, site.z);
    const truck = special === 'supply_truck';
    S.emit({ k: 'dyn_cont', ct: { id: 'dyn:' + id, type: truck ? 'military_crate' : 'cabin_chest', label: truck ? 'İkmal Kamyonu Kasası' : 'Gizli Zula', x: site.x, y: gy + 0.7, z: site.z, special, prop: truck ? 'truck' : 'cache', a: site.a } });
    S.emit({ k: 'marker', x: site.x, z: site.z, label: truck ? 'İkmal Kamyonu' : 'Zula', icon: 'quest' });
    // muhafızlar: gündüz yağmacı (silahlı zula bekçileri), gece zombi (gündüz zombi doğmaz)
    for (let i = 0; i < guards; i++) { const night = S.time.isNight; S.zombies.spawn(night ? (this.rng.chance(0.3) ? 'runner' : 'normal') : 'raider', site.x + (this.rng.next() - 0.5) * 16, site.z + (this.rng.next() - 0.5) * 16, {}); }
  }

  /** Dinamik konteyner için görsel (kamyon / sandık) */
  propFor(ct) {
    if (ct._prop || !ct.prop) return;
    const S = this.s;
    const g = new THREE.Group();
    if (ct.prop === 'truck') {
      try { const m = S.game.assets.model('vehicles', 'car_stationwagon'); if (m) { m.scale.setScalar(4.6); m.rotation.z = Math.PI / 2.2; g.add(m); } } catch { /* model yok */ }
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x6e4b1f, roughness: 0.9 }));
      m.position.y = 0.3; m.castShadow = true; g.add(m);
    }
    g.position.set(ct.x + (ct.prop === 'truck' ? 2.4 : 0), S.world.terrain.heightAt(ct.x, ct.z), ct.z);
    g.rotation.y = ct.a || 0;
    this.group.add(g);
    ct._prop = g;
  }

  // ======================================================================= güncelleme
  update(dt) {
    this.updateWrecks(dt);
    this.updateBeam(dt);
    this.updateShip(dt);
    this.updateDrops(dt);
    this.updateCrashes(dt);
    this.updateFlyovers(dt);
    this.updateTremor(dt);
    this.updateFlight(dt);
    for (const ct of this.dyn) if (ct.prop && !ct._prop) this.propFor(ct);
  }

  // ======================================================================= kayıt
  serialize() {
    return {
      n: this.n,
      wrecks: this.wrecks.map((w) => { const t = w.d.body.translation(), r = w.d.body.rotation(); return [t.x, t.y, t.z, r.x, r.y, r.z, r.w].map((x) => Math.round(x * 1000) / 1000); }),
      dyn: this.dyn.map(({ _prop, ...c }) => c),
      drops: this.drops.map((d) => ({ id: d.id, x: d.x, z: d.z, p: [d.crate.position.x, d.crate.position.y, d.crate.position.z] })),
      crashes: this.crashes.map((c) => ({ id: c.id, x: c.x, z: c.z, a: c.a })),
      stealth: this.stealthUntil,
    };
  }

  load(o) {
    if (!o) return;
    this.n = o.n || 0;
    (o.wrecks || []).forEach((p, i) => this.setWreckPose(i, p));
    for (const d of o.drops || []) this.spawnAirdrop({ id: d.id, x: d.x, z: d.z }, d.p);
    for (const c of o.crashes || []) this.spawnCrash(c, true);
    for (const c of o.dyn || []) this.addContainer(c);
    this.stealthUntil = o.stealth || 0;
  }

  /** İstemci katılımı: host'un anlık durumu */
  snapshot() { return this.serialize(); }

  dispose() {
    for (const w of this.wrecks) { this.detach(w); if (this.pw) this.pw.removeDynamic(w.d); }
    for (const d of this.drops) if (d.d && this.pw) this.pw.removeDynamic(d.d);
    this.s.audio.stopLoop('plane');
    for (const c of this.crashes) this.s.audio.stopLoop('crash' + c.id);
    for (let i = 0; i < (this.flyovers || []).length; i++) this.s.audio.stopLoop('fly' + i);
    this.s.game.scene.remove(this.group);
    // dünya oturumlar arasında yeniden kullanılır: eklenenleri çıkar, uçağı yerine koy
    const W = this.s.world;
    for (let i = W.interactables.length - 1; i >= 0; i--) if (W.interactables[i].type === 'tow_point') W.interactables.splice(i, 1);
    for (let i = W.containers.length - 1; i >= 0; i--) if (String(W.containers[i].id).startsWith('dyn:')) W.containers.splice(i, 1);
    const PL = W.plane;
    if (PL && PL.group) {
      PL.group.position.set(PL.x, PL.y, PL.z);
      PL.group.rotation.set(0, PL.a, 0);
      PL.group.visible = true;
      for (const c of PL.colliders || []) W.physics.setEnabled(c, true);
    }
    this.wrecks = []; this.drops = []; this.crashes = []; this.dyn = []; this.flyovers = []; this.flight = null;
  }
}
