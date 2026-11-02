// Araçlar: Rapier ışınlı süspansiyon fiziği (motor, fren, el freni, hıza duyarlı direksiyon, yol dışı tutunma,
// devrilme önleyici, çarpışma hasarı), yakıt, bagaj, tamir, geliştirme, farlar, korna, zombilere çarpma.
// Sürücü istemci aracın fiziğinde otoritedir; diğerleri aracı ağdan kinematik olarak izler.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleVisuals, prepareWindowMaterials } from './VehicleVisuals.js';
import { ITEMS } from '../data/items.js';
import { clamp, damp, dampAngle, wrapAngle, dist, uid, lerp } from '../core/util.js';
import { G, ALL, groups, quatYaw, yawOf } from '../physics/PhysicsWorld.js';
import { Collider } from '../world/Physics.js';

// park etmiş (sürücüsüz) kara aracı: oyuncu itmesi ve patlama sonrası kayma çabuk söner
const PARK_DAMP = 2.2, PARK_ADAMP = 2.5;

/** Yüzeye göre sürüş: tutunma çarpanı, yuvarlanma direnci, toz; ıslakta çamur/kar daha kaygan */
export const SURFACES = {
  asphalt: { grip: 1.0, roll: 0.0, dust: 0, wet: 0.82 },
  concrete: { grip: 0.95, roll: 0.0, dust: 0.2, wet: 0.85 },
  dirt: { grip: 0.78, roll: 0.04, dust: 1.0, wet: 0.6 },
  grass: { grip: 0.7, roll: 0.06, dust: 0.5, wet: 0.65 },
  sand: { grip: 0.6, roll: 0.14, dust: 1.2, wet: 0.8 },
  rock: { grip: 0.85, roll: 0.03, dust: 0.3, wet: 0.7 },
  snow: { grip: 0.42, roll: 0.1, dust: 0.4, wet: 0.9 },
};

export const VEHICLE_TYPES = {
  sedan: { name: 'Aile Arabası', mass: 1250, drive: 'fwd', model: 'sedan', scale: 1.7, maxSpeed: 27, accel: 7.5, fuelCap: 45, trunk: 16, hp: 100, grip: 1.0, offroad: 0.55, seats: 4, len: 4.2, wid: 2.2 },
  pickup: { name: 'Pikap', mass: 1700, drive: 'rwd', model: 'vehicle-truck-red', scale: 1.75, maxSpeed: 25, accel: 7.5, fuelCap: 60, trunk: 30, hp: 140, grip: 0.95, offroad: 0.85, seats: 2, len: 4.6, wid: 2.3, needs: [['tire', 1], ['engine_part', 1]] },
  police: { name: 'Polis Arabası', mass: 1450, drive: 'rwd', model: 'police-car', scale: 1.65, maxSpeed: 31, accel: 9, fuelCap: 50, trunk: 14, hp: 110, grip: 1.05, offroad: 0.5, seats: 4, len: 4.6, wid: 2.2, siren: true },
  ambulance: { name: 'Ambulans', mass: 2900, drive: 'rwd', model: 'ambulance', scale: 1.75, maxSpeed: 24, accel: 6.5, fuelCap: 60, trunk: 30, hp: 140, grip: 0.95, offroad: 0.6, seats: 4, len: 5.2, wid: 2.4, siren: true },
  van: { name: 'Minibüs', mass: 2300, drive: 'rwd', model: 'van', scale: 1.85, maxSpeed: 22, accel: 5.8, fuelCap: 70, trunk: 40, hp: 150, grip: 0.9, offroad: 0.6, seats: 6, len: 5.6, wid: 2.6 },
  rv: { name: 'Karavan', mass: 3200, drive: 'rwd', model: 'citroen-old-van', scale: 1.6, maxSpeed: 19, accel: 4.6, fuelCap: 80, trunk: 50, hp: 160, grip: 0.85, offroad: 0.5, seats: 4, len: 5.4, wid: 2.8 },
  offroad: { name: 'Arazi Aracı', mass: 2000, drive: 'awd', susp: 0.42, model: 'suv', scale: 1.75, maxSpeed: 25, accel: 8.2, fuelCap: 60, trunk: 24, hp: 170, grip: 1.0, offroad: 1.0, seats: 4, len: 4.7, wid: 2.4, needs: [['engine_part', 1], ['car_battery', 1]] },
  motorcycle: { name: 'Motosiklet', mass: 280, drive: 'rwd', susp: 0.3, model: 'vehicle-motorcycle', scale: 1.3, maxSpeed: 33, accel: 12, fuelCap: 15, trunk: 4, hp: 60, grip: 1.1, offroad: 0.7, seats: 2, len: 3.0, wid: 1.2, bike: true, sound: 'engine-motorcycle' },
  military: { name: 'Askerî Kamyon', mass: 6200, drive: 'awd', susp: 0.45, model: 'vehicle-truck-green', scale: 2.0, maxSpeed: 23, accel: 6.5, fuelCap: 90, trunk: 40, hp: 260, grip: 0.95, offroad: 1.0, seats: 6, len: 5.4, wid: 2.7, armor: 0.3 },
  armored: { name: 'Zırhlı Minibüs', mass: 5600, drive: 'awd', susp: 0.4, model: 'delivery-truck', scale: 1.85, maxSpeed: 20, accel: 5, fuelCap: 80, trunk: 30, hp: 320, grip: 0.9, offroad: 0.7, seats: 6, len: 5.8, wid: 2.7, armor: 0.5, needs: [['car_battery', 1], ['engine_part', 2]] },
  tractor: { name: 'Traktör', mass: 3400, drive: 'rwd', susp: 0.4, model: 'tractor', scale: 1.7, maxSpeed: 11, accel: 4.2, fuelCap: 50, trunk: 12, hp: 200, grip: 1.25, offroad: 1.0, seats: 1, len: 3.8, wid: 2.3 },
  // terk edilmiş şehir arabaları (eskiden sürülemez dekor): Kenney binek modelleri, aynı fizik/görsel boru hattı
  hatchback: { name: 'Hatchback', mass: 1100, drive: 'fwd', model: 'hatchback', scale: 1.7, maxSpeed: 27, accel: 8, fuelCap: 40, trunk: 12, hp: 90, grip: 1.0, offroad: 0.5, seats: 4, len: 4.6, wid: 2.0 },
  // taksi modelinin kendisi diğer binek modellerinden 1,3 kat büyük: ölçek 1,7 yerine 1,3 (6,0 m yerine 4,6 m boy)
  taxi: { name: 'Taksi', mass: 1300, drive: 'fwd', model: 'taxi', scale: 1.3, maxSpeed: 27, accel: 7.5, fuelCap: 45, trunk: 14, hp: 100, grip: 1.0, offroad: 0.5, seats: 4, len: 4.5, wid: 2.2 },
  sports: { name: 'Spor Sedan', mass: 1250, drive: 'rwd', model: 'sports-sedan', scale: 1.7, maxSpeed: 33, accel: 9.5, fuelCap: 45, trunk: 8, hp: 85, grip: 1.08, offroad: 0.35, seats: 2, len: 4.2, wid: 2.0 },
  suvlux: { name: 'Lüks SUV', mass: 1900, drive: 'awd', susp: 0.38, model: 'suv-luxury', scale: 1.7, maxSpeed: 27, accel: 7.8, fuelCap: 60, trunk: 20, hp: 130, grip: 1.0, offroad: 0.8, seats: 4, len: 4.7, wid: 2.25 },
  boat: { name: 'Martı Teknesi', mass: 1800, model: 'boat-large', scale: 3.4, maxSpeed: 15, accel: 4, fuelCap: 60, trunk: 20, hp: 100, grip: 0.6, offroad: 0, seats: 6, len: 6, wid: 3, water: true, needs: [['engine_part', 1], ['repair_kit', 1]] },
};

export const UPGRADES = {
  armor: { name: 'Zırh Plakaları', cost: [['armor_kit', 1]], desc: 'Hasarı %40 azaltır, zombi çarpışmasında daha az hasar.', ws: true },
  bumper: { name: 'Çelik Tampon', cost: [['metal_sheet', 2], ['screws', 10]], desc: 'Zombilere 2 kat çarpma hasarı.', ws: true },
  rack: { name: 'Tavan Bagajı', cost: [['plank', 4], ['rope', 2], ['scrap_metal', 2]], desc: 'Bagaj +10 yuva.' },
  tank: { name: 'Ek Yakıt Deposu', cost: [['jerrycan', 1], ['metal_sheet', 1], ['duct_tape', 1]], desc: 'Yakıt kapasitesi +%50.' },
  lights: { name: 'Far Geliştirmesi', cost: [['electronics', 1], ['wire', 2], ['glass', 1]], desc: 'Daha güçlü farlar.' },
  tires: { name: 'Arazi Lastikleri', cost: [['tire', 2]], desc: 'Arazi performansı ve yol tutuşu +.' },
  engine: { name: 'Motor Geliştirmesi', cost: [['engine_part', 2], ['electronics', 1]], desc: 'Azami hız +%15, ivme +%20.', ws: true },
  paint: { name: 'Boya', cost: [['plastic', 1]], desc: 'Aracın rengini değiştir.' },
  sticker: { name: 'Çıkartma', cost: [['cloth', 1]], desc: 'Kendine özgü bir çıkartma.' },
};
const PAINTS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#2c3e50', '#ecf0f1', '#556b2f', '#d35400', '#e88fb4'];

const _res = { x: 0, z: 0, hit: false, hits: [] };
const UP = new THREE.Vector3(0, 1, 0);
const _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _ax = new THREE.Vector3(), _qq = new THREE.Quaternion();
const _rt = new THREE.Vector3();
const HEADLIGHT_POOL = 4;
// yakıt tüketim çarpanı: eskiden 6 (≈62 m/L; %20 yakıtla doğan aile arabası 560 m gidebiliyordu), şimdi 2 (≈190 m/L)
const FUEL_USE = 2;
const VIS_LOD2 = 40 * 40; // boş aracın görsel ayrıntılarının (kabin, kapı/bagaj kanatları, far camları, stop lambaları) çizildiği en uzak mesafe²

class Vehicle {
  constructor(session, spec) {
    this.s = session;
    this.id = spec.id || 'v' + uid();
    this.type = spec.type;
    this.def = VEHICLE_TYPES[spec.type];
    this.pos = new THREE.Vector3(spec.x, spec.y ?? session.world.terrain.heightAt(spec.x, spec.z), spec.z);
    this.yaw = spec.rot || 0;
    this.speed = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.steer = 0;
    this.health = (spec.health ?? 1) * this.def.hp;
    this.fuel = (spec.fuel ?? 0.5) * this.def.fuelCap;
    this.broken = !!spec.broken;
    // araç başına arıza: tür varsayılanı yerine (ör. terk edilmiş arabada patlak lastik / bitik akü)
    this.needs = spec.needs || null;
    this.fault = spec.fault || null;
    this.abandoned = !!spec.abandoned;
    this.upgrades = spec.upgrades || {};
    this.paint = spec.paint || null;
    this.trunk = spec.trunk || new Array(this.def.trunk).fill(null);
    this.seats = new Array(this.def.seats).fill(null);
    this.lights = false;
    this.pitch = 0; this.roll = 0;
    this.wrecked = this.health <= 0;
    this.water = !!this.def.water;
    this.quat = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
    if (spec.q) this.quat.set(spec.q[0], spec.q[1], spec.q[2], spec.q[3]);
    this.prevPos = this.pos.clone(); this.prevQuat = this.quat.clone();
    this.vis = this.pos.clone();
    this.inThr = 0; this.inSteer = 0; this.inHB = false;
    this.upsideT = 0;
    this.build();
    this.setupPhysics();
  }

  get maxFuel() { return this.def.fuelCap * (this.upgrades.tank ? 1.5 : 1); }
  get maxHealth() { return this.def.hp * (this.upgrades.armor ? 1.5 : 1); }
  get trunkSize() { return this.def.trunk + (this.upgrades.rack ? 10 : 0); }

  build() {
    const S = this.s;
    const g = new THREE.Group();
    const m = S.game.assets.model('vehicles', this.def.model);
    m.scale.setScalar(this.def.scale);
    // pivotu merkeze al ve tekerlekleri döndürülebilir yap
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    g.add(m);
    g.updateMatrixWorld(true);
    this.wheels = [];
    const wheelNodes = [];
    m.traverse((o) => { if (o.isMesh && /wheel/i.test(o.name + (o.parent ? o.parent.name : ''))) wheelNodes.push(o); });
    // lastik + jant gibi aynı tekerleğe ait parçaları konuma göre grupla (her tekerlek tek fizik tekerleği)
    const wgroups = [];
    for (const w of wheelNodes) {
      const wc = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
      const gw = wgroups.find((x) => x.c.distanceTo(wc) < 0.4);
      if (gw) gw.meshes.push(w); else wgroups.push({ c: wc, meshes: [w] });
    }
    // yedek lastik (gövdeye asılı 'wheel_back' / 'spare'): en alçak tekerlek merkezinden 0,35 m yukarıdaysa fizik tekerleği değil
    const lowestY = wgroups.length ? Math.min(...wgroups.map((x) => x.c.y)) : 0;
    for (const gw of wgroups.filter((x) => x.c.y - lowestY < 0.35 && !x.meshes.some((w) => /spare/i.test(w.name + (w.parent ? w.parent.name : '')) || /^wheel_back$/.test(w.name) || (w.parent && /^wheel_back$/.test(w.parent.name))))) {
      const wb = new THREE.Box3();
      for (const w of gw.meshes) wb.expandByObject(w);
      const wc = wb.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(wc);
      g.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      g.updateMatrixWorld(true);
      for (const w of gw.meshes) spin.attach(w);
      this.wheels.push({ pivot, spin, front: wc.z > 0, mesh: gw.meshes[0], local: wc.clone(), radius: Math.max(0.2, (wb.max.y - wb.min.y) / 2), base: wc.y, halfW: (wb.max.x - wb.min.x) / 2 });
    }
    this.modelH = box.max.y - box.min.y;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.model = m;
    this.bodyMats = [];
    m.traverse((o) => { if (o.isMesh && o.material && /paint|body|car/i.test(o.material.name)) { o.material = o.material.clone(); this.bodyMats.push(o.material); } });
    if (this.paint) this.applyPaint(this.paint);
    // farlar: araç başına gerçek SpotLight yerine "sanal far" (araç yerel konum/hedef, yoğunluk, menzil). Sahnede sabit
    // sayıda havuz ışığı vardır; her kare kameraya en yakın, farı açık araçlara atanır (Vehicles.updateHeadlightPool).
    // Eskiden araç başına iki SpotLight vardı (21 araç = 42 ışık): three.js kapalı (yoğunluk 0) ışıkları da her
    // malzemenin gölgelendiricisinde döngüye katar; havuzla ışık sayısı 4'te sabit, far açıp kapamak derleme tetiklemez.
    this.headlights = [];
    for (const s of [-1, 1]) {
      this.headlights.push({ intensity: 0, distance: 40, position: new THREE.Vector3(s * this.def.wid * 0.3, 0.9, this.def.len * 0.45), target: new THREE.Vector3(s * 0.6, 0, this.def.len * 0.45 + 12) });
    }
    // stop/fren ve geri vites lambaları: arka köşelerde ışıyan paneller (yayılım parlaklığı + bloom)
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x4a0606, emissive: 0xff0600, emissiveIntensity: 0.1, roughness: 0.4 });
    this.revMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, emissive: 0xfff4e0, emissiveIntensity: 0, roughness: 0.4 });
    // grup uzayı: model merkezlenmiş (taban y=0), ön +Z → arka yüz min z
    const rearZ = box.min.z - c.z - 0.02, ly = (box.max.y - box.min.y) * 0.5, lx = (box.max.x - box.min.x) * 0.36;
    // iki stop + iki geri vites lambası malzeme başına tek ağ (2 çizim); uzaktaki boş araçta gizlenir (Vehicles.update)
    const tg = [-1, 1].map((sx) => new THREE.BoxGeometry(0.26, 0.12, 0.04).translate(sx * lx, ly, rearZ));
    const rg = [-1, 1].map((sx) => new THREE.BoxGeometry(0.1, 0.08, 0.04).translate(sx * (lx - 0.2), ly - 0.1, rearZ));
    const tl = new THREE.Mesh(mergeGeometries(tg, false), this.tailMat), rl = new THREE.Mesh(mergeGeometries(rg, false), this.revMat);
    for (const q of [...tg, ...rg]) q.dispose();
    g.add(tl, rl);
    this.tailMeshes = [tl, rl];
    this.brakeGlow = 0;
    this.root = g;
    this.armorVis = null;
    this.updateUpgradeVisuals();
    // kabin, kapı/bagaj kanatları, far ışıması, hasar görselleri; camlar yarı saydam
    prepareWindowMaterials(m);
    try { this.visuals = new VehicleVisuals(this); this.visuals.applyDamage(this.health / this.maxHealth); } catch (e) { console.warn('Araç görselleri kurulamadı', this.id, e); this.visuals = null; }
    // boya malzemesi olmayan (dokulu) modellerde boyanacak kabuk görsellerde klonlanır: boya ondan sonra da uygulanır
    // (yoksa kayıttan yüklemede ve sonradan katılanda boya kayboluyordu)
    if (this.paint && this.visuals) this.applyPaint(this.paint);
    S.game.scene.add(g);
    this.sync();
  }

  applyPaint(col) {
    this.paint = col;
    // hasar tonlaması temel rengi userData.base'te tutar: boya o tabanı da değiştirmeli, yoksa onarım eski renge döner
    for (const m of this.bodyMats) { m.color.set(col); if (m.userData.base) m.userData.base.color.set(col); }
    if (this.visuals) this.visuals.applyDamage(this.health / this.maxHealth); // mevcut hasar koyulaşması yeni renge uygulanır
  }

  updateUpgradeVisuals() {
    if (this.armorVis) { this.root.remove(this.armorVis); this.armorVis = null; }
    const grp = new THREE.Group();
    const M = new THREE.MeshStandardMaterial({ color: 0x6d7478, metalness: 0.5, roughness: 0.5 });
    const L = this.def.len, W = this.def.wid;
    if (this.upgrades.armor) {
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, L * 0.7), M); p.position.set(s * W * 0.5, 0.9, 0); grp.add(p); }
      const w = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.35, 0.06), M); w.position.set(0, 1.55, L * 0.18); w.rotation.x = -0.4; grp.add(w);
    }
    if (this.upgrades.bumper) { const b = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.3, 0.25), M); b.position.set(0, 0.55, L * 0.52); grp.add(b); for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), M); sp.rotation.x = Math.PI / 2; sp.position.set(-W * 0.35 + i * W * 0.23, 0.55, L * 0.52 + 0.25); grp.add(sp); } }
    if (this.upgrades.rack) { const r = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.08, L * 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3a3a })); r.position.set(0, 2.0, -L * 0.05); grp.add(r); for (let i = 0; i < 3; i++) { const bx = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: [0x8d6e45, 0xc0392b, 0x556b2f][i] })); bx.position.set(-0.5 + i * 0.5, 2.25, -L * 0.05); grp.add(bx); } }
    if (this.upgrades.sticker) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill(); g.fillStyle = '#1b1b1b'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('30', 64, 66); const tex = new THREE.CanvasTexture(c); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: tex, transparent: true })); p.position.set(s * (W * 0.5 + 0.02), 1.0, 0); p.rotation.y = s * Math.PI / 2; grp.add(p); } }
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.armorVis = grp;
    this.root.add(grp);
    for (const h of this.headlights) h.distance = this.upgrades.lights ? 70 : 40;
  }

  sync() {
    this.root.position.copy(this.vis || this.pos);
    if (this.quat) this.root.quaternion.copy(this.visQuat || this.quat);
    else { this.root.rotation.set(0, 0, 0); this.root.rotateY(this.yaw); }
    this.root.updateMatrixWorld(true);
  }

  /** Rapier gövdesi: kara araçlarında ışınlı süspansiyonlu araç denetleyicisi, teknede kinematik gövde */
  setupPhysics() {
    const pw = this.s.game.phys;
    if (!pw) return;
    const R = pw.R, d = this.def;
    const H = this.modelH || 1.6;
    this.mass = d.mass || 1400;
    const q = { x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w };
    if (this.water) {
      this.body = pw.w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(q));
      this.col = pw.w.createCollider(R.ColliderDesc.cuboid(d.wid * 0.45, H * 0.3, d.len * 0.48).setTranslation(0, H * 0.3, 0).setCollisionGroups(groups(G.VEHICLE)), this.body);
      return;
    }
    const lift = d.susp ?? 0.34;
    this.body = pw.w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(this.pos.x, this.pos.y + 0.05, this.pos.z).setRotation(q)
      .setLinearDamping(PARK_DAMP).setAngularDamping(PARK_ADAMP).setCcdEnabled(true).setCanSleep(true));
    this._parked = true;
    const hy = Math.max(0.22, H * 0.27);
    this.col = pw.w.createCollider(R.ColliderDesc.cuboid(d.wid * 0.46, hy, d.len * 0.47).setTranslation(0, H * 0.24 + hy, 0)
      .setMass(this.mass).setFriction(0.35).setRestitution(0.04).setCollisionGroups(groups(G.VEHICLE)), this.body);
    const ctrl = pw.w.createVehicleController(this.body);
    ctrl.indexUpAxis = 1;
    ctrl.setIndexForwardAxis = 2;
    // fizik tekerlekleri görsel tekerleklerden; bulunamazsa ölçülerden
    let ws = this.wheels.map((w) => ({ x: w.local.x, y: w.local.y, z: w.local.z, r: w.radius, front: w.front, vis: w }));
    if (ws.length < 2) ws = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ x: sx * d.wid * 0.4, y: 0.4, z: sz * d.len * 0.33, r: 0.4, front: sz > 0, vis: null }));
    if (d.bike) ws = ws.flatMap((w) => [{ ...w, x: -0.3 }, { ...w, x: 0.3, vis: null }]); // motosiklet: dengeleyici çift tekerlek
    // orta hatta tek "tekerlek" görünen geniş aks (karavan modelinde iki teker tek düğüm): gerçek iz genişliğinde iki
    // fizik tekerleği (yoksa araç iki noktada durup yana yatıyordu)
    else ws = ws.flatMap((w) => (w.vis && w.vis.halfW > d.wid * 0.25 && Math.abs(w.x) < 0.3 ? [{ ...w, x: -(w.vis.halfW - 0.15) }, { ...w, x: w.vis.halfW - 0.15, vis: null }] : [w]));
    this.pw = [];
    for (const w of ws) {
      ctrl.addWheel({ x: w.x, y: w.y + lift * 0.75, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, lift, w.r);
      this.pw.push(w);
    }
    const k = clamp(this.mass / 1400, 0.4, 5);
    for (let i = 0; i < ws.length; i++) {
      ctrl.setWheelSuspensionStiffness(i, 26 + 6 * Math.min(k, 3));
      ctrl.setWheelSuspensionCompression(i, 3.0);
      ctrl.setWheelSuspensionRelaxation(i, 2.4);
      ctrl.setWheelMaxSuspensionTravel(i, lift * 0.85);
      ctrl.setWheelMaxSuspensionForce(i, this.mass * 45);
      ctrl.setWheelFrictionSlip(i, 2.3 * d.grip);
      ctrl.setWheelSideFrictionStiffness(i, 1.0);
    }
    this.ctrl = ctrl;
    let zMin = Infinity, zMax = -Infinity;
    for (const w of ws) { zMin = Math.min(zMin, w.z); zMax = Math.max(zMax, w.z); }
    this.wheelbase = clamp(zMax - zMin, 1.2, 5);
    this.driveIdx = ws.map((w, i) => (d.drive === 'awd' || (d.drive === 'fwd' ? w.front : !w.front) ? i : -1)).filter((i) => i >= 0);
    pw.vehicleBodies = pw.vehicleBodies || new Set();
    pw.vehicleBodies.add(this.body);
    // sürücüsüz araçları yalnız host simüle eder; istemcide kinematik gövde host'un yayımladığı konumu izler (oyuncu
    // itmesi, çarpma, patlama her eşte farklı sonuç verip araç konumları ayrışmasın)
    if (!this.s.isHost) this.setRemote(true);
    this.lastVel = { x: 0, y: 0, z: 0 };
  }

  /** Aracı doğrudan yerleştir (hızlar sıfırlanır) */
  teleport(x, y, z, yaw = this.yaw) {
    this.yaw = yaw;
    this.quat.setFromAxisAngle(UP, yaw);
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat); this.vis.copy(this.pos);
    if (this.body) {
      this.body.setTranslation({ x, y, z }, true);
      this.body.setRotation({ x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w }, true);
      if (!this.body.isKinematic()) { this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    }
    if (this.lastVel) { this.lastVel.x = 0; this.lastVel.y = 0; this.lastVel.z = 0; }
    this.sync();
  }

  /** Gövde türü: yerel sürücü/park = dinamik, uzak sürücü = kinematik (ağdan izlenir) */
  setRemote(remote) {
    if (!this.body || this.water) return;
    const R = this.s.game.phys.R;
    const want = remote ? R.RigidBodyType.KinematicPositionBased : R.RigidBodyType.Dynamic;
    if (this.body.bodyType() !== want) this.body.setBodyType(want, true);
  }

  /** Model üzerindeki koltuk konumları (yerel) */
  seatLocal(i) {
    const W = this.def.wid, L = this.def.len;
    if (this.def.bike) return new THREE.Vector3(0, 0.62, i === 0 ? -0.1 : -0.7);
    const row = Math.floor(i / 2), side = i % 2 === 0 ? 1 : -1;
    // koltuk yüzeyi: araç gövde yüksekliğine göre (binek ~0.38 m, kamyon daha yüksek)
    const seatY = clamp((this.modelH || 1.5) * 0.25, 0.32, 0.85);
    return new THREE.Vector3(side * W * 0.2, seatY, L * 0.06 - row * 1.0);
  }

  seatPlayer(avatar, i) {
    const lp = this.seatLocal(i).applyMatrix4(this.root.matrixWorld);
    avatar.root.position.copy(lp);
    avatar.visYaw = this.yaw;
    avatar.root.rotation.y = this.yaw;
  }

  dispose() {
    if (this.visuals) { this.visuals.dispose(); this.visuals = null; }
    for (const m of this.tailMeshes || []) m.geometry.dispose();
    if (this.tailMat) { this.tailMat.dispose(); this.revMat.dispose(); }
    this.s.game.scene.remove(this.root);
    const pw = this.s.game.phys;
    // Rapier araç denetleyicisi dünyada ayrıca tutulur: gövdeyle birlikte silinmezse her oturumda birikir
    if (pw && this.ctrl) { try { pw.w.removeVehicleController(this.ctrl); } catch { /* yoksay */ } this.ctrl = null; }
    if (pw && this.body) { try { pw.w.removeRigidBody(this.body); } catch { /* zaten silinmiş */ } if (pw.vehicleBodies) pw.vehicleBodies.delete(this.body); this.body = null; }
    // çarpışma dünyası vekili (dünya oturumlar arasında kalır)
    if (this.proxy) { for (const c of this.proxy) this.s.world.physics.remove(c); this.proxy = null; }
  }

  /** Sürücü binince sürüş sönümü, inince park sönümü (park etmiş araç oyuncu itmesiyle kaymaz, eş konumları ayrışmaz) */
  setParked(parked) {
    if (!this.body || this.water || this._parked === parked) return;
    this._parked = parked;
    this.body.setLinearDamping(parked ? PARK_DAMP : 0.04);
    this.body.setAngularDamping(parked ? PARK_ADAMP : 0.85);
  }

  /** Çarpışma dünyası vekili (araç boyunca 2–3 daire): kurşun, görüş hattı, ses örtmesi ve zombi/bot/NPC çarpışması
   *  aracı bilsin. Rapier'e aynalanmaz (gövde zaten orada). Dolu araç görüşü/kurşunu kesmez (sürücü görünür, vurulur). */
  updateProxy() {
    if (this.water) return;
    const P = this.s.world.physics;
    const occupied = this.seats.some(Boolean);
    const L = this.def.len, W = this.def.wid, r = W * 0.46;
    if (!this.proxy) {
      const n = L > W * 2.2 ? 3 : 2;
      this.proxy = [];
      for (let i = 0; i < n; i++) { const c = new Collider({ shape: 'circle', x: this.pos.x, z: this.pos.z, r, minY: this.pos.y, maxY: this.pos.y + 1, kind: 'vehicle', walkable: false, blocksNav: false, owner: this }); c.noPhysics = true; P.add(c); this.proxy.push(c); }
      this._px = null;
    }
    const q = this._px;
    if (q && Math.abs(q.x - this.pos.x) < 0.06 && Math.abs(q.z - this.pos.z) < 0.06 && Math.abs(q.y - this.pos.y) < 0.08 && Math.abs(wrapAngle(q.yaw - this.yaw)) < 0.025 && q.occ === occupied) return;
    this._px = { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, occ: occupied };
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), n = this.proxy.length, span = Math.max(0, L / 2 - r);
    const H = Math.max(1.2, Math.min(3.4, this.modelH || 1.6));
    for (let i = 0; i < n; i++) {
      const c = this.proxy[i], t = -span + (2 * span * i) / (n - 1);
      const x = this.pos.x + fx * t, z = this.pos.z + fz * t;
      c.x = x; c.z = z; c.minY = this.pos.y - 0.3; c.maxY = this.pos.y + H;
      c.blocksSight = !occupied; c.blocksBullets = !occupied;
      P.move(c, x - r, z - r, x + r, z + r);
    }
  }
}

export class Vehicles {
  constructor(session) {
    this.s = session;
    this.list = [];
    this.local = null; // sürülen araç
    const S = session;
    const pw = S.game.phys;
    if (pw) { pw.addHook((h) => this.physicsStep(h)); pw.addAfter(() => this.afterStep()); }
    // far ışığı havuzu: en yakın iki aracın iki farı (sayı sabit → gölgelendirici yeniden derlenmez)
    this.lightPool = [];
    for (let i = 0; i < HEADLIGHT_POOL; i++) {
      const sl = new THREE.SpotLight(0xfff4d6, 0, 40, 0.5, 0.5, 1.2);
      sl.castShadow = false; sl.name = 'headlight-pool-' + i;
      S.game.scene.add(sl); S.game.scene.add(sl.target);
      this.lightPool.push(sl);
    }
    S.on('vehicle_enter', (p, from) => {
      const v = this.byId(p.id);
      if (!v) return;
      const seat = p.seat === 0 && !v.seats[0] ? 0 : v.seats.findIndex((x, i) => !x && i > 0);
      if (seat < 0) return;
      S.emit({ k: 'veh_seat', id: v.id, seat, player: from });
    });
    S.on('vehicle_exit', (p, from) => { const v = this.byId(p.id); if (v) { const seat = v.seats.indexOf(from); if (seat >= 0) S.emit({ k: 'veh_seat', id: v.id, seat, player: null }); } });
    // sürücü durumu: host kendi sürdüğü aracın durumunu da bu işleyiciden geçirir (S.act → applyAction); applyState
    // gövdeyi kinematiğe (ağdan izlenen) çevirdiği için host kendi aracını süremiyordu → yalnız uzak sürücüde uygula
    S.on('vehicle_state', (p, from) => { const v = this.byId(p.id); if (v && v.seats[0] === from) { if (from !== S.localId) this.applyState(v, p); S.net.active && S.net.broadcast({ t: 'evt', e: { k: 'veh_state', ...p } }, from); } });
    S.on('vehicle_damage', (p) => { const v = this.byId(p.id); if (v) S.emit({ k: 'veh_set', id: v.id, health: Math.max(0, v.health - p.dmg * (1 - (v.upgrades.armor ? 0.4 : 0) - (v.def.armor || 0))), dir: p.dir || null }); });
    // araçla yapıya/kapıya/pencereye çarpma: yerel sürücü tespit eder, host hasarı uygular
    S.on('vehicle_ram', (p, from) => {
      if (p.struct) S.applyAction('struct_damage', { id: p.struct, dmg: p.dmg }, from);
      if (p.door) { const d = S.interact && S.interact.doorById ? S.interact.doorById.get(p.door) : null; if (d && !d.broken) { const hp = Math.max(0, d.hp - p.dmg); S.emit(hp <= 0 ? { k: 'door', id: d.id, hp: 0, broken: true, barricade: 0 } : { k: 'door', id: d.id, hp }); } }
      if (p.window) { const w = S.interact && S.interact.winById ? S.interact.winById.get(p.window) : null; if (w && !w.broken) S.emit({ k: 'window', id: w.id, broken: true, barricade: 0, hp: 0 }); }
    });
    S.on('vehicle_set', (p) => S.emit({ k: 'veh_set', ...p }));
    S.on('trunk_take', (p, from) => {
      const v = this.byId(p.id); if (!v) return;
      const s = v.trunk[p.slot]; if (!s) return;
      v.trunk[p.slot] = null;
      S.emit({ k: 'veh_set', id: v.id, trunk: v.trunk });
      S.emit({ k: 'grant', to: from, items: [s] });
    });
    S.on('trunk_put', (p, from) => {
      const v = this.byId(p.id); if (!v) return;
      const def = ITEMS[p.stack.id]; let left = p.stack.qty;
      if (def.stack > 1) for (const s of v.trunk) if (s && s.id === p.stack.id && left > 0) { const a = Math.min(def.stack - s.qty, left); s.qty += a; left -= a; }
      for (let i = 0; i < v.trunkSize && left > 0; i++) if (!v.trunk[i]) { const a = Math.min(def.stack, left); v.trunk[i] = { ...p.stack, qty: a }; left -= a; }
      S.emit({ k: 'veh_set', id: v.id, trunk: v.trunk });
      if (left > 0) S.emit({ k: 'grant', to: from, items: [{ ...p.stack, qty: left }], silent: true });
    });
    S.onEvt('veh_seat', (e) => this.onSeat(e));
    // sürücünün yayımladığı durum: kendi sürdüğüm araç dışındaki her araca uygulanır (yolcu koltuğundaki istemci de
    // aracın hareketini görür; eskiden 'this.local' yolcuyu da kapsadığı için araç onun ekranında yerinde kalıyordu)
    S.onEvt('veh_state', (e) => { const v = this.byId(e.id); if (v && v.seats[0] !== S.localId) this.applyState(v, e); });
    S.onEvt('veh_set', (e) => {
      const v = this.byId(e.id); if (!v) return;
      if (e.trunkOpen !== undefined) { v.trunkOpen = !!e.trunkOpen; if (v.visuals) v.visuals.setTrunkOpen(v.trunkOpen); if (v.trunkOpen) S.audio.play('door', { at: v.pos, vol: 0.5, rate: 0.9 }); }
      if (e.health !== undefined) {
        const prevH = v.health;
        v.health = e.health;
        if (v.visuals && Math.abs(prevH - v.health) > 0.01) v.visuals.applyDamage(v.health / v.maxHealth, e.dir || null);
        if (v.health <= 0 && !v.wrecked) {
          v.wrecked = true;
          if (v === this.local) { this.exitLocal(); S.ui.toast('Araç kullanılamaz hale geldi!', 'danger'); }
          // yakıt deposu tutuşur: patlama, itki ve uzun süreli yangın
          S.fx.fire(v.pos.x, v.pos.y + 1, v.pos.z, 30, 1.2);
          if (!v.def.water && v.fuel > 0.5) S.props.explosion(v.pos.x, v.pos.y + 0.6, v.pos.z, 6);
          else S.audio.play('explosion', { at: v.pos, vol: 0.8 });
        }
      }
      if (e.fuel !== undefined) v.fuel = e.fuel;
      if (e.broken !== undefined) v.broken = e.broken;
      if (e.fault !== undefined) v.fault = e.fault;
      if (e.upgrades) { v.upgrades = e.upgrades; v.updateUpgradeVisuals(); }
      if (e.paint) v.applyPaint(e.paint);
      if (e.trunk) { v.trunk = e.trunk; S.ui.refreshStorage && S.ui.refreshStorage(v.id); }
      if (e.wrecked === false) v.wrecked = false;
    });
    S.onEvt('veh_add', (e) => { if (!this.byId(e.id)) this.list.push(new Vehicle(S, e)); });
  }

  init() {
    for (const sp of this.s.world.vehicleSpawns) this.list.push(this.spawn(sp));
    // karavan kamp alanında
    this.list.push(new Vehicle(this.s, { id: 'rv', type: 'rv', x: -224, z: -38, rot: 0.6, fuel: 0.25, health: 0.7 }));
  }

  /** Host → istemci: sürücüsüz kara araçlarının konumu (anlık görüntüde). Değişenler her seferinde, hepsi ~3 sn'de bir.
   *  Öğe: [id, x, y, z, qx, qy, qz, qw] */
  restSnapshot() {
    const full = (this._vhN = (this._vhN || 0) + 1) % 30 === 0, out = [];
    for (const v of this.list) {
      if (v.water || !v.body || v.seats[0]) continue;
      const p = v.pos, q = v.quat, o = v._vhSent;
      if (!full && o && Math.abs(o[0] - p.x) < 0.02 && Math.abs(o[1] - p.y) < 0.02 && Math.abs(o[2] - p.z) < 0.02 && Math.abs(o[3] - q.x) + Math.abs(o[4] - q.y) + Math.abs(o[5] - q.z) + Math.abs(o[6] - q.w) < 0.002) continue;
      v._vhSent = [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
      out.push([v.id, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100, Math.round(q.x * 1e4) / 1e4, Math.round(q.y * 1e4) / 1e4, Math.round(q.z * 1e4) / 1e4, Math.round(q.w * 1e4) / 1e4]);
    }
    return out;
  }

  /** İstemci: host'un sürücüsüz araç konumları → kinematik hedef */
  applyRest(arr) {
    for (const a of arr) {
      const v = this.byId(a[0]);
      if (!v || v.water || !v.body || v.seats[0]) continue; // sürücülü aracı sürücüsünün durumu taşır
      v.netTarget = { x: a[1], y: a[2], z: a[3], q: new THREE.Quaternion(a[4], a[5], a[6], a[7]) };
      v.setRemote(true);
    }
  }

  /** Dünya doğum noktasından araç; terk edilmiş arabanın bagajı eski "araç bagajı" yağma tablosundan (tohumlu) dolar */
  spawn(sp) {
    const v = new Vehicle(this.s, sp);
    const legacy = sp.legacyTrunk && this.s.loot ? this.s.loot.state.get(sp.legacyTrunk) : null;
    if (legacy) {
      // eski kayıt: bu arabanın yerindeki eski "araç bagajı" konteynerinin durumu bagaja taşınır (boşaltıldıysa boş
      // kalır, içine konanlar kaybolmaz); eski kimlik kayıttan silinir
      const items = (legacy.slots || []).filter(Boolean);
      if (items.length > v.trunk.length) { const n0 = v.trunk.length; v.trunk.length = items.length; v.trunk.fill(null, n0); }
      for (let i = 0; i < items.length; i++) v.trunk[i] = items[i];
      this.s.loot.state.delete(sp.legacyTrunk);
    } else if (sp.loot && !sp.trunk && this.s.loot) {
      try {
        const g = this.s.loot.generate({ id: 'trunk:' + sp.id, type: sp.loot, x: sp.x, z: sp.z });
        const items = g.slots.filter(Boolean);
        for (let i = 0; i < v.trunk.length && i < items.length; i++) v.trunk[i] = items[i];
      } catch (e) { console.warn('Araç bagajı üretilemedi', sp.id, e); }
    }
    return v;
  }

  byId(id) { return this.list.find((v) => v.id === id); }

  /** Etkileşim seçenekleri */
  options(v, pl) {
    const S = this.s;
    const out = [];
    const sideX = v.pos.x + Math.cos(v.yaw) * v.def.wid * 0.55, sideZ = v.pos.z - Math.sin(v.yaw) * v.def.wid * 0.55;
    const backX = v.pos.x - Math.sin(v.yaw) * v.def.len * 0.55, backZ = v.pos.z - Math.cos(v.yaw) * v.def.len * 0.55;
    if (v.wrecked) { out.push({ act: 'repair', label: `${v.def.name}: Hurda (Tamir: 2 tamir seti)`, holdTime: 2, x: v.pos.x, z: v.pos.z, range: 3.5 }); return out; }
    if (v.broken) {
      const need = [...(v.needs || v.def.needs || []).map(([id, n]) => `${ITEMS[id].name} x${n}`), 'İngiliz anahtarı'].join(', ');
      out.push({ act: 'fix', label: `${v.def.name}${v.fault ? ': ' + v.fault : ' bozuk'} — Onar (${need})`, holdTime: 2, x: v.pos.x, z: v.pos.z, range: 3.6 });
    } else if (!v.water || S.local.pos.distanceTo(v.pos) < 6) {
      // binme seçeneği oyuncunun yaklaştığı yanda (eskiden yalnız sürücü yanında: öbür yandan yaklaşınca "Sür" çıkmıyordu)
      const side = pl && pl.pos ? (((pl.pos.x - v.pos.x) * Math.cos(v.yaw) - (pl.pos.z - v.pos.z) * Math.sin(v.yaw)) >= 0 ? 1 : -1) : 1;
      const sx = v.pos.x + Math.cos(v.yaw) * v.def.wid * 0.55 * side, sz = v.pos.z - Math.sin(v.yaw) * v.def.wid * 0.55 * side;
      if (!v.seats[0]) out.push({ act: 'drive', label: `Sür: ${v.def.name} (Yakıt %${Math.round(v.fuel / v.maxFuel * 100)})`, x: sx, z: sz, range: 2.6, bias: -0.3 });
      else if (v.seats.some((s, i) => i > 0 && !s)) out.push({ act: 'ride', label: `Yolcu Ol: ${v.def.name}`, x: sx, z: sz, range: 2.6 });
    }
    out.push({ act: 'trunk', label: `Bagaj: ${v.def.name}`, x: backX, z: backZ, range: 2.0 });
    const jc = S.inventory.slots.find((s) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
    if (jc && v.fuel < v.maxFuel - 1) out.push({ act: 'refuel', label: `Yakıt Doldur (${Math.round(jc.fuel)} L)`, holdTime: 2, x: backX, z: backZ, range: 2.4 });
    if (v.health < v.maxHealth * 0.98 && S.inventory.has('repair_kit')) out.push({ act: 'repair', label: `Tamir Et (Sağlık %${Math.round(v.health / v.maxHealth * 100)})`, holdTime: 3, x: v.pos.x, z: v.pos.z, range: 3.2 });
    out.push({ act: 'upgrade', label: `Araç Geliştirme: ${v.def.name}`, x: v.pos.x + Math.sin(v.yaw) * v.def.len * 0.5, z: v.pos.z + Math.cos(v.yaw) * v.def.len * 0.5, range: 2.2, bias: 0.3 });
    return out;
  }

  useOption(v, opt) {
    const S = this.s;
    const inv = S.inventory;
    switch (opt.act) {
      case 'drive': S.act('vehicle_enter', { id: v.id, seat: 0 }); break;
      case 'ride': S.act('vehicle_enter', { id: v.id, seat: 1 }); break;
      case 'trunk': S.ui.openStorage({ kind: 'trunk', id: v.id, label: `${v.def.name} — Bagaj` }); v._trunkLocal = true; S.act('vehicle_set', { id: v.id, trunkOpen: true }); break;
      case 'refuel': {
        S.interact.startHold('Yakıt aktarılıyor…', 2, () => {
          const jc = inv.slots.find((s) => s && s.id === 'jerrycan' && (s.fuel || 0) > 0);
          if (!jc) return;
          const add = Math.min(jc.fuel, v.maxFuel - v.fuel);
          jc.fuel -= add; inv.changed();
          S.act('vehicle_set', { id: v.id, fuel: v.fuel + add });
          if (v.type === 'boat') S.act('flag', { flag: 'boat_fuel', value: Math.round(v.fuel + add) });
          S.ui.toast(`${Math.round(add)} L yakıt eklendi.`, 'good');
        }, 'search');
        break;
      }
      case 'repair': {
        const kits = v.wrecked ? 2 : 1;
        if (inv.count('repair_kit') < kits) { S.ui.toast(`${kits} tamir seti gerekli.`, 'warn'); return; }
        // Tamirci Murat üsse kurtarıldıysa onarımlar %50 daha etkili
        const mul = (S.localProfile.stats.repair || 1) * (S.flags.mechanic ? 1.5 : 1);
        S.interact.startHold('Araç tamir ediliyor…', 3.5 / mul, () => {
          inv.remove('repair_kit', kits);
          const nh = v.wrecked ? v.maxHealth * 0.4 : Math.min(v.maxHealth, v.health + v.maxHealth * 0.35 * mul);
          S.act('vehicle_set', { id: v.id, health: nh, wrecked: false });
          S.ui.toast('Araç onarıldı.', 'good');
        }, 'hammer');
        break;
      }
      case 'fix': {
        const needs = v.needs || v.def.needs || [];
        const miss = needs.filter(([id, n]) => !inv.has(id, n));
        if (miss.length) { S.ui.toast('Eksik: ' + miss.map(([id, n]) => `${ITEMS[id].name} (${inv.count(id)}/${n})`).join(', '), 'warn', 5); return; }
        if (!S.build.hasTool('wrench')) { S.ui.toast('İngiliz anahtarı gerekli.', 'warn'); return; }
        const mul = S.localProfile.stats.repair || 1;
        const tm = S.interact.timed(20, mul);
        S.interact.startHold(`${v.def.name} onarılıyor…`, tm.real + 2, () => {
          for (const [id, n] of needs) inv.remove(id, n);
          S.act('vehicle_set', { id: v.id, broken: false, fault: null });
          S.quests.onRepair('vehicle:' + v.id);
          if (tm.extra) S.time.advance(tm.extra);
          S.ui.toast(`${v.def.name} çalışıyor!`, 'good', 3);
        }, 'hammer');
        break;
      }
      case 'upgrade': S.ui.openVehicle(v); break;
      default: break;
    }
  }

  applyUpgrade(v, key) {
    const S = this.s;
    const up = UPGRADES[key];
    if (!up) return;
    const inv = S.inventory;
    if (key !== 'paint' && v.upgrades[key]) { S.ui.toast('Bu geliştirme zaten takılı.', 'info'); return; }
    if (up.ws && S.build.stations(S.local.pos).workbench < 1 && !S.isInBase(S.local.pos)) { S.ui.toast('Bu geliştirme için üste/atölye yakınında olmalısın.', 'warn'); return; }
    const miss = up.cost.filter(([id, n]) => !inv.has(id, n));
    if (miss.length) { S.ui.toast('Eksik: ' + miss.map(([id, n]) => `${ITEMS[id].name} ${inv.count(id)}/${n}`).join(', '), 'warn', 4); return; }
    for (const [id, n] of up.cost) inv.remove(id, n);
    if (key === 'paint') { const col = PAINTS[(PAINTS.indexOf(v.paint) + 1) % PAINTS.length]; S.act('vehicle_set', { id: v.id, paint: col }); return; }
    S.act('vehicle_set', { id: v.id, upgrades: { ...v.upgrades, [key]: 1 } });
    S.audio.play('build', { vol: 0.8 });
    S.ui.toast(`${up.name} takıldı!`, 'good');
    S.results.vehicles.add(v.def.name);
  }

  onSeat(e) {
    const S = this.s;
    const v = this.byId(e.id);
    if (!v) return;
    const prev = v.seats[e.seat];
    v.seats[e.seat] = e.player;
    if (v.visuals && (!!e.player) !== (!!prev)) v.visuals.swingDoor(e.seat);
    if (e.seat === 0) {
      v.setParked(!e.player);
      // sürücü uzaktaysa gövde ağdan izlenir; yerel sürücü dinamik; boş araç host'ta dinamik, istemcide host'u izler
      const remote = e.player ? e.player !== S.localId : !S.isHost;
      v.setRemote(remote);
      if (!remote) v.netTarget = null;
      if (e.player && v.body && !v.body.isKinematic()) v.body.wakeUp();
    }
    if (e.player === S.localId) {
      this.local = v;
      if (S.local.body) S.local.body.setEnabled(false);
      S.local.vehicle = v;
      S.local.mode = e.seat === 0 ? 'drive' : 'seat';
      S.local.seat = e.seat;
      S.local.avatar.hold(null);
      S.local.avatar.setFlashlight(false);
      S.results.vehicles.add(v.def.name);
      S.ui.toast(e.seat === 0 ? `${v.def.name}: W/S gaz-fren · A/D direksiyon · Boşluk el freni · H korna · F far · E in` : 'Yolcu koltuğundasın. E ile in.', 'info', 4);
      S.audio.play('door', { at: v.pos, vol: 0.7, rate: 0.7 });
    } else if (prev === S.localId && e.player !== S.localId) {
      // indik
    }
    const rec = S.players.get(e.player);
    if (rec && !rec.isLocal) { rec.vehicleId = v.id; rec.seat = e.seat; }
    if (!e.player && prev) { const r = S.players.get(prev); if (r && !r.isLocal) r.vehicleId = null; }
  }

  exitLocal() {
    const S = this.s;
    const v = this.local;
    if (!v) return;
    // sürücü inerken son konum/yön önce yayımlanır: diğer eşlerin kopyası aynı yerde durup park sönümüne geçer
    if (S.local.seat === 0 && S.net.active) S.act('vehicle_state', this.stateOf(v));
    S.act('vehicle_exit', { id: v.id });
    // yanına in
    const side = S.local.seat % 2 === 0 ? 1 : -1;
    let ex = v.pos.x + Math.cos(v.yaw) * (v.def.wid * 0.5 + 0.8) * side, ez = v.pos.z - Math.sin(v.yaw) * (v.def.wid * 0.5 + 0.8) * side;
    if (S.world.physics.overlapsBox(ex - 0.3, ez - 0.3, ex + 0.3, ez + 0.3, v.pos.y + 0.2, v.pos.y + 1.8, (c) => c.owner !== v)) { ex = v.pos.x - Math.cos(v.yaw) * (v.def.wid * 0.5 + 0.8) * side; ez = v.pos.z + Math.sin(v.yaw) * (v.def.wid * 0.5 + 0.8) * side; }
    if (v.water) { const dock = S.world.interactables.find((i) => i.type === 'boat_dock'); if (dock) { ex = dock.x; ez = dock.z - 3; } }
    v.inThr = 0; v.inSteer = 0; v.inHB = false;
    S.audio.stopLoop('skid_local');
    S.audio.stopLoop('tire_local');
    S.local.spawnAt(ex, S.world.physics.groundHeight(ex, ez, v.pos.y + 2) + 0.05, ez, v.yaw);
    S.local.camYaw = v.yaw + Math.PI;
    S.local.mode = 'ground';
    S.local.vehicle = null;
    this.local = null;
    S.audio.stopLoop('engine_local');
    for (const h of v.headlights) h.intensity = 0;
    S.selectHotbar(S.hotbarIndex);
  }

  /** Sürücü/yolcu: girdi → niyet (fizik adımında uygulanır) */
  updateLocalDriving(dt, input, blocking) {
    const S = this.s;
    const v = this.local;
    const pl = S.local;
    if (!v) { pl.mode = 'ground'; return; }
    if (!blocking && input.locked) {
      const sens = 0.0024 * S.game.settings.get('controls.mouseSens');
      pl.camYaw -= input.mouse.dx * sens;
      pl.camPitch = clamp(pl.camPitch - input.mouse.dy * sens, -1.0, 0.6);
    }
    if (pl.mode === 'drive') {
      let thr = 0, st = 0, hb = false;
      if (!blocking) {
        if (input.isDown('forward')) thr += 1;
        if (input.isDown('back')) thr -= 1;
        if (input.isDown('left')) st += 1;
        if (input.isDown('right')) st -= 1;
        hb = input.isDown('jump');
        if (input.wasPressed('quickHeal')) { S.audio.play('horn', { at: v.pos, vol: 1 }); S.act('noise', { x: v.pos.x, z: v.pos.z, r: 60, src: 'horn' }); }
        if (input.wasPressed('flashlight')) { v.lights = !v.lights; S.audio.play('click', { vol: 0.5 }); }
      }
      v.inThr = thr; v.inSteer = st; v.inHB = hb;
      this._sendT = (this._sendT || 0) - dt;
      if (this._sendT <= 0) { this._sendT = 1 / 15; if (S.net.active) S.act('vehicle_state', this.stateOf(v)); }
      // devrilmiş araç: yavaşça düzelt (oyunda kilitlenme olmasın)
      if (v.upsideT > 2.5 && Math.abs(v.speed) < 1.5) this.flipUpright(v);
    }
    if (input.wasPressed('interact') && !blocking) this.exitLocal();
  }

  /** Fizik sonrası (yerel sürücü/yolcu): koltuk, kamera, motor sesi */
  postPhysicsLocal(dt) {
    const S = this.s;
    const v = this.local;
    const pl = S.local;
    if (!v) { pl.postPhysics(dt); return; }
    this.syncVisual(v, S.game.phys.alpha);
    pl.pos.copy(v.vis);
    v.seatPlayer(pl.avatar, pl.seat);
    pl.yaw = v.yaw;
    pl.avatar.visYaw = v.yaw;
    pl.speed = 0;
    pl.updateCamera(dt);
    const sp = Math.abs(v.speed);
    S.audio.loop('engine_local', v.def.sound || 'engine', { vol: v.broken || v.fuel <= 0 ? 0 : 0.35 + sp / v.def.maxSpeed * 0.4, rate: 0.6 + sp / v.def.maxSpeed * 1.4 });
    if (v.skid > 0.4 && sp > 6) S.audio.loop('skid_local', 'skid', { vol: Math.min(0.5, (v.skid - 0.4) * 0.8), rate: 1 });
    else S.audio.stopLoop('skid_local');
    // lastik: toprak/kum/çimen/kar/kayada yuvarlanma hışırtısı (hızla artar); asfaltta yok
    const loose = v.surface && v.surface !== 'asphalt' && v.surface !== 'concrete' && !v.water;
    if (loose && sp > 2) S.audio.loop('tire_local', 'gravel', { vol: Math.min(0.32, 0.06 + sp / v.def.maxSpeed * 0.3), rate: 0.8 + sp / v.def.maxSpeed * 0.6 });
    else S.audio.stopLoop('tire_local');
    S.local.noise = sp > 2 ? 18 : 6;
  }

  /** Bir fizik adımı: tüm araçlar */
  physicsStep(h) {
    for (const v of this.list) {
      if (!v.body) continue;
      if (v.water) this.stepBoat(v, h);
      else if (v.body.isKinematic()) this.stepRemote(v, h);
      else this.stepCar(v, h);
    }
  }

  /** Kara aracı: motor, fren, direksiyon, tutunma, dengeleme, hasar */
  stepCar(v, h) {
    const S = this.s;
    const d = v.def;
    const ctrl = v.ctrl;
    const T = S.world.terrain;
    const local = v === this.local && S.local.mode === 'drive';
    const t = v.body.translation();
    const inWater = T.heightAt(t.x, t.z) < T.waterLevelAt(t.x, t.z) - 1.0 && t.y < T.waterLevelAt(t.x, t.z) - 0.2;
    const canRun = local && !v.broken && !v.wrecked && v.fuel > 0 && !inWater;
    // park hâlinde uyuyan şasi: sürücü yok ve Rapier gövdeyi uyuttuysa denetleyici (tekerlek ışınları), tork ve hasar
    // hesapları atlanır — uyuyan gövdeyi denetleyici zaten hareket ettirmez. Çarpan bir cisim gövdeyi Rapier'de uyandırır.
    if (!local && v.body.isSleeping()) { v.speed = 0; v.skid = 0; const lvv = v.lastVel; lvv.x = 0; lvv.y = 0; lvv.z = 0; return; }
    const speed = ctrl.currentVehicleSpeed();
    v.speed = speed;
    const hpF = v.health / v.maxHealth;
    const maxSp = d.maxSpeed * (v.upgrades.engine ? 1.15 : 1) * (hpF < 0.3 ? 0.6 : 1);
    const thr = local ? v.inThr : 0, steerIn = local ? v.inSteer : 0, hb = local && v.inHB;
    // uyuyan şasi: araç denetleyicisi uyuyan gövdeyi hareket ettirmez (düz zeminde 2 sn durunca uyur) → sürücü girdi verince uyandır
    if (local && (thr || steerIn || hb) && v.body.isSleeping()) v.body.wakeUp();
    const force = v.mass * d.accel * (v.upgrades.engine ? 1.2 : 1) * 0.62;
    // zemin tipi: yüzey sınıfı (asfalt/beton/toprak/çim/kum/kaya/kar) × aracın arazi yeteneği; ıslakta kayganlaşır
    const surf = T.surfaceAt ? T.surfaceAt(t.x, t.z) : 'asphalt';
    const SF = SURFACES[surf] || SURFACES.asphalt;
    v.surface = surf;
    const offCap = Math.min(1, d.offroad + (v.upgrades.tires ? 0.25 : 0));
    const terrainGrip = surf === 'asphalt' ? 1 : SF.grip + (1 - SF.grip) * offCap * 0.6;
    const snow = S.env.weather.snow > 0.3 ? 0.75 : 1;
    const wet = (S.env.weather.rain > 0.3 ? SF.wet : 1) * snow;
    const onRoad = surf === 'asphalt';
    // yumuşak zemin: çekiş (motor kuvveti) ve azami hız tutunmayla ölçeklenir — çimde/kumda asfalttaki gibi fırlanmaz
    const tractionK = onRoad ? 1 : 0.55 + 0.45 * terrainGrip;
    const maxSpSurf = maxSp * (onRoad ? 1 : 0.72 + 0.28 * terrainGrip);
    let eng = 0, brake = 0;
    // ters yöne basmak fren yapar (motor çalışmasa da); durunca vites değişir
    if (thr > 0) { if (speed < -0.6) brake = 1; else if (canRun && speed < maxSpSurf) eng = force * thr * tractionK; }
    else if (thr < 0) { if (speed > 0.6) brake = 1; else if (canRun && speed > -maxSpSurf * 0.35) eng = force * 0.55 * thr * tractionK; }
    if (!local) brake = 0.35; // park freni
    else if (!eng && !brake) brake = canRun ? 0.06 : 0.14; // yuvarlanma direnci / motor freni
    // yumuşak zemin (kum, çamur, kar): ek yuvarlanma direnci; arazi aracı daha az etkilenir
    if (!onRoad) brake += SF.roll * (1 - Math.min(1, d.offroad) * 0.6); // yumuşak zemin yuvarlanma direnci
    const brakeV = brake * v.mass * 0.036;
    // lastik sürtünme katsayısı (µ): kuru asfaltta ~1.5
    const baseSlip = 1.5 * d.grip * (v.upgrades.tires ? 1.1 : 1) * terrainGrip * wet;
    // hıza ve tutunmaya duyarlı direksiyon: v²/R ≤ µg (biraz fazlasına izin: kayma/drift mümkün)
    const v2 = Math.max(1, speed * speed);
    const sGrip = Math.atan(v.wheelbase * baseSlip * 9.81 * 1.3 / v2);
    const sMax = clamp(Math.min(lerp(0.62, 0.2, clamp(Math.abs(speed) / maxSp, 0, 1)), sGrip), 0.1, 0.62);
    v.steer = damp(v.steer, steerIn * sMax, 6.5, h);
    const n = v.pw.length;
    for (let i = 0; i < n; i++) {
      const w = v.pw[i];
      ctrl.setWheelSteering(i, w.front ? v.steer : 0);
      ctrl.setWheelEngineForce(i, v.driveIdx.includes(i) ? eng / v.driveIdx.length : 0);
      const rearHB = hb && !w.front;
      ctrl.setWheelBrake(i, rearHB ? v.mass * 0.09 : brakeV);
      ctrl.setWheelFrictionSlip(i, baseSlip * (rearHB ? 0.45 : 1));
      ctrl.setWheelSideFrictionStiffness(i, rearHB ? 0.45 : 1.0);
    }
    ctrl.updateVehicle(h, undefined, groups(ALL, G.STATIC | G.VEHICLE | G.PROP), (c) => c !== v.col);
    // devrilme önleyici: gövdeyi dik tut (motosiklette güçlü)
    const r = v.body.rotation();
    _qq.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_qq);
    _ax.crossVectors(_up, UP);
    const tilt = Math.asin(clamp(_ax.length(), 0, 1));
    const strength = d.bike ? 1 : tilt > 0.45 ? 0.35 : 0.08;
    // park hâlinde yalnız devrilmek üzereyken (eğimde hafif yatık park etmiş araç her adım uyandırılıp hiç uyumuyordu)
    if (tilt > 0.02 && _up.y > 0 && (local || tilt > 0.45)) {
      const av = v.body.angvel();
      const k = v.mass * strength * 9;
      v.body.applyTorqueImpulse({ x: (_ax.x * k - av.x * v.mass * 0.6 * strength) * h, y: 0, z: (_ax.z * k - av.z * v.mass * 0.6 * strength) * h }, true);
    }
    v.upsideT = _up.y < 0.35 ? v.upsideT + h : 0;
    // kayma (lastik sesi): yanal hız / hız
    const lv = v.body.linvel();
    _fw.set(0, 0, 1).applyQuaternion(_qq);
    const fwdSp = lv.x * _fw.x + lv.z * _fw.z;
    const lat = Math.hypot(lv.x - _fw.x * fwdSp, lv.z - _fw.z * fwdSp);
    v.skid = damp(v.skid || 0, lat / Math.max(3, Math.abs(fwdSp)) + (hb ? 0.4 : 0), 8, h);
    // çarpışma hasarı: ani hız değişimi (Δv)
    const lvv = v.lastVel;
    const dv = Math.hypot(lv.x - lvv.x, lv.y - lvv.y, lv.z - lvv.z);
    if (local && dv > 5.5 && !v.wrecked) {
      const dmg = (dv - 5.5) * 6 * (v.upgrades.armor ? 0.6 : 1) * (1 - (d.armor || 0));
      // çarpma yönü (araç uzayı): hız değişimi vektörü
      const ddx = lvv.x - lv.x, ddz = lvv.z - lv.z, dl = Math.hypot(ddx, ddz) || 1;
      _rt.set(1, 0, 0).applyQuaternion(_qq);
      const dirF = (ddx * _fw.x + ddz * _fw.z) / dl, dirR = (ddx * _rt.x + ddz * _rt.z) / dl;
      const dir = Math.abs(dirF) > Math.abs(dirR) ? [0, 0, Math.sign(dirF)] : [Math.sign(dirR), 0, 0];
      S.act('vehicle_damage', { id: v.id, dmg, dir });
      this.ramStructures(v, dv, dir);
      S.audio.play('impact', { at: v.pos, vol: clamp(dv / 14, 0.35, 1) });
      S.local.camShake = clamp(dv / 12, 0.2, 1);
      if (dv > 13) { S.localStats.damage((dv - 13) * 2.2, 'fall'); S.ui.toast('Kaza! Yaralandın.', 'danger'); }
      S.fx.sparks(t.x + _fw.x * d.len * 0.5, t.y + 0.8, t.z + _fw.z * d.len * 0.5);
    }
    lvv.x = lv.x; lvv.y = lv.y; lvv.z = lv.z;
    // su: motor durur, batma
    if (inWater) { v.body.setLinearDamping(2.5); if (!v._sunk && local) { v._sunk = true; S.ui.toast('Araç suya battı! Motor stop etti.', 'danger'); S.act('vehicle_damage', { id: v.id, dmg: 40 }); } }
    else if (v._sunk) { v._sunk = false; v.body.setLinearDamping(0.04); }
    // yakıt
    if (canRun && eng) {
      v.fuel = Math.max(0, v.fuel - (Math.abs(speed) * 0.0025 + 0.004) * h * FUEL_USE);
      if (v.fuel <= 0) S.ui.toast('Yakıt bitti! Bagajın arkasından bidonla doldurabilirsin.', 'warn', 5);
    }
    // gaza basılıyor ama motor çalışmıyor: nedenini bir kez söyle
    if (local && thr && !canRun && !v._noRunT) { v._noRunT = 4; S.ui.toast(v.broken ? `${v.def.name} bozuk — önce onarılmalı.` : v.wrecked ? 'Araç hurda.' : inWater ? 'Motor su aldı.' : 'Depo boş — bidonla yakıt doldur.', 'warn', 3); }
    if (v._noRunT > 0) v._noRunT = Math.max(0, v._noRunT - h);
    // zombilere çarpma (yerel sürücü tespit eder, host'a bildirir)
    if (local && Math.abs(speed) > 4) this.hitZombies(v, speed);
  }

  /** Araç çarpması: önündeki/arkasındaki yapı (üs parçası), bina kapısı ya da pencere hasar alır */
  ramStructures(v, dv, dir) {
    const S = this.s;
    const t = v.body.translation();
    const px = t.x + _fw.x * dir[2] * v.def.len * 0.5 + _rt.x * dir[0] * v.def.wid * 0.5;
    const pz = t.z + _fw.z * dir[2] * v.def.len * 0.5 + _rt.z * dir[0] * v.def.wid * 0.5;
    const dmg = Math.round((dv - 4) * (v.mass / 1400) * 14 * (v.upgrades.bumper ? 1.5 : 1));
    if (dmg <= 0) return;
    let best = null, bd = 1.8;
    if (S.build && S.build.structures) for (const st of S.build.structures.values()) { const dd = Math.hypot(st.x - px, st.z - pz); if (dd < bd && Math.abs(st.y - t.y) < 3) { bd = dd; best = { struct: st.id }; } }
    for (const d of S.world.doors) { const dd = Math.hypot(d.center.x - px, d.center.z - pz); if (dd < bd && !d.broken && Math.abs(d.y0 - t.y) < 3) { bd = dd; best = { door: d.id }; } }
    for (const w of S.world.windows) { const dd = Math.hypot(w.center.x - px, w.center.z - pz); if (dd < bd && !w.broken && Math.abs(w.center.y - t.y) < 3) { bd = dd; best = { window: w.id }; } }
    if (best) { S.act('vehicle_ram', { ...best, dmg }); S.fx.sparks(px, t.y + 0.7, pz); S.audio.play('impact', { at: { x: px, y: t.y, z: pz }, vol: 0.9, rate: 0.8 }); }
  }

  hitZombies(v, speed) {
    const S = this.s;
    const L = v.def.len, W = v.def.wid;
    const t = v.body.translation();
    const bumper = v.upgrades.bumper ? 2 : 1;
    for (const [id, zv] of S.zombies.views) {
      if (zv.state.dead || zv.hitCd > S.t) continue;
      const zx = zv.pos.x - (t.x + _fw.x * L * 0.35), zz = zv.pos.z - (t.z + _fw.z * L * 0.35);
      if (zx * zx + zz * zz < (W * 0.62) ** 2 && Math.abs(zv.pos.y - t.y) < 2) {
        zv.hitCd = S.t + 0.6;
        const dmg = Math.round(Math.abs(speed) * 5 * bumper);
        S.act('zombie_hit', { id, dmg, dir: [_fw.x * Math.sign(speed), _fw.z * Math.sign(speed)], kind: 'vehicle', force: Math.abs(speed) });
        S.fx.hit(zv.pos.x, zv.pos.y + 1, zv.pos.z, 'flesh');
        S.audio.play('hit', { at: zv.pos, vol: 1, rate: 0.7 });
        const lv = v.body.linvel();
        const slow = v.upgrades.bumper ? 0.97 : 0.9;
        v.body.setLinvel({ x: lv.x * slow, y: lv.y, z: lv.z * slow }, true);
        S.act('vehicle_damage', { id: v.id, dmg: (zv.type === 'heavy' ? 8 : 2) / bumper });
      }
    }
  }

  /** Uzak sürücünün aracı: ağ hedefine kinematik takip */
  stepRemote(v, h) {
    const tg = v.netTarget;
    if (!tg) return;
    // zemin türü uzaktan sürülen araçta da güncel kalsın (yolcunun lastik sesi asfalt/çim ayrımı)
    const T = this.s.world.terrain;
    if (T.surfaceAt) v.surface = T.surfaceAt(tg.x, tg.z);
    const t = v.body.translation();
    const k = Math.min(1, h * 12);
    v.body.setNextKinematicTranslation({ x: t.x + (tg.x - t.x) * k, y: t.y + (tg.y - t.y) * k, z: t.z + (tg.z - t.z) * k });
    const r = v.body.rotation();
    _qq.set(r.x, r.y, r.z, r.w).slerp(tg.q, k);
    v.body.setNextKinematicRotation({ x: _qq.x, y: _qq.y, z: _qq.z, w: _qq.w });
  }

  /** Tekne: basit su sürüşü (kinematik), dalga salınımı */
  stepBoat(v, h) {
    const S = this.s;
    const local = v === this.local && S.local.mode === 'drive';
    if (!local && v.netTarget) { this.stepRemote(v, h); return; }
    const d = v.def;
    const canRun = local && !v.broken && !v.wrecked && v.fuel > 0;
    const thr = local ? v.inThr : 0;
    if (canRun && thr) v.speed = clamp(v.speed + d.accel * thr * h, -d.maxSpeed * 0.3, d.maxSpeed);
    v.speed -= v.speed * 0.4 * h;
    v.steer = damp(v.steer, (local ? v.inSteer : 0) * 0.6, 4, h);
    v.yaw += v.steer * 0.9 * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 4) * h;
    const T = S.world.terrain;
    let nx = v.pos.x + Math.sin(v.yaw) * v.speed * h, nz = v.pos.z + Math.cos(v.yaw) * v.speed * h;
    if (T.heightAt(nx, nz) > -1.0) { nx = v.pos.x; nz = v.pos.z; v.speed *= -0.3; }
    v.pos.set(nx, 0.15 + Math.sin(S.t * 1.6) * 0.08, nz);
    _qq.setFromEuler(new THREE.Euler(Math.sin(S.t * 1.3) * 0.03, v.yaw, Math.sin(S.t * 1.1) * 0.04, 'YXZ'));
    v.body.setNextKinematicTranslation({ x: v.pos.x, y: v.pos.y, z: v.pos.z });
    v.body.setNextKinematicRotation({ x: _qq.x, y: _qq.y, z: _qq.z, w: _qq.w });
    if (canRun && thr) v.fuel = Math.max(0, v.fuel - (Math.abs(v.speed) * 0.0025 + 0.004) * h * FUEL_USE);
  }

  /** Ters dönmüş aracı tekerlekleri üzerine geri koy */
  flipUpright(v) {
    if (!v.body || v.body.isKinematic()) return;
    const t = v.body.translation();
    const y = this.s.world.physics.groundHeight(t.x, t.z, t.y + 3) + 0.6;
    v.body.setTranslation({ x: t.x, y, z: t.z }, true);
    v.body.setRotation(quatYaw(v.yaw), true);
    v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.upsideT = 0;
    this.s.ui.toast('Araç tekerlekleri üzerine çevrildi.', 'info', 2);
  }

  /** Adım sonrası: önceki/güncel durumları kaydet (enterpolasyon) */
  afterStep() {
    for (const v of this.list) {
      if (!v.body) continue;
      v.prevPos.copy(v.pos); v.prevQuat.copy(v.quat);
      if (!v.water || v.netTarget) {
        const t = v.body.translation(), r = v.body.rotation();
        v.pos.set(t.x, t.y, t.z);
        v.quat.set(r.x, r.y, r.z, r.w);
      } else v.quat.copy(_qq.setFromEuler(new THREE.Euler(0, v.yaw, 0)));
      if (!v.water) v.yaw = yawOf(v.quat);
    }
  }

  /** Görsel: enterpolasyonlu konum/dönüş, tekerlek süspansiyonu ve dönüşü */
  syncVisual(v, alpha) {
    v.vis = v.vis || new THREE.Vector3();
    v.visQuat = v.visQuat || new THREE.Quaternion();
    v.vis.lerpVectors(v.prevPos, v.pos, alpha);
    v.visQuat.slerpQuaternions(v.prevQuat, v.quat, alpha);
    v.sync();
    if (v.ctrl) {
      for (let i = 0; i < v.pw.length; i++) {
        const w = v.pw[i].vis;
        if (!w) continue;
        const sl = v.ctrl.wheelSuspensionLength(i);
        const lift = v.def.susp ?? 0.34;
        if (sl !== null && sl !== undefined) w.pivot.position.y = v.pw[i].y + lift * 0.75 - sl;
        w.pivot.rotation.y = w.front ? v.steer : 0;
        const rot = v.ctrl.wheelRotation(i);
        if (rot !== null && rot !== undefined) w.spin.rotation.x = rot;
      }
    } else for (const w of v.wheels) { w.spin.rotation.x += v.speed * 0.016 / 0.4; if (w.front) w.pivot.rotation.y = v.steer * 0.5; }
  }

  stateOf(v) {
    const q = v.quat;
    return { id: v.id, x: +v.pos.x.toFixed(2), y: +v.pos.y.toFixed(2), z: +v.pos.z.toFixed(2), q: [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)], yaw: +v.yaw.toFixed(3), sp: +v.speed.toFixed(2), st: +v.steer.toFixed(2), f: +v.fuel.toFixed(1), l: v.lights ? 1 : 0 };
  }

  applyState(v, p) {
    const q = p.q ? new THREE.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3]) : new THREE.Quaternion().setFromAxisAngle(UP, p.yaw || 0);
    v.netTarget = { x: p.x, y: p.y, z: p.z, q };
    v.speed = p.sp; v.steer = p.st; v.fuel = p.f; v.lights = !!p.l;
    if (v.water) { v.pos.set(p.x, p.y, p.z); v.yaw = p.yaw || 0; }
    v.setRemote(true);
  }

  /** Araçların içinden geçmeyi önle (oyuncu itme) */
  pushOut(x, z, r, y, includeLocal = false) {
    for (const v of this.list) {
      if (v === this.local && !includeLocal) continue;
      if (v.water) continue;
      const dx = x - v.pos.x, dz = z - v.pos.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      if (y > v.pos.y + 1.7) continue;
      if (y < v.pos.y - 2.5) continue; // aracın çok altındaki (yer altı sığınağındaki) karakteri itme
      // yerel kutu
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      let lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hw = v.def.wid / 2 + r, hl = v.def.len / 2 + r;
      if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
        const ox = hw - Math.abs(lx), oz = hl - Math.abs(lz);
        if (ox < oz) lx = Math.sign(lx) * hw; else lz = Math.sign(lz) * hl;
        x = v.pos.x + (lx * Math.cos(v.yaw) + lz * Math.sin(v.yaw));
        z = v.pos.z + (-lx * Math.sin(v.yaw) + lz * Math.cos(v.yaw));
      }
    }
    return { x, z };
  }

  /** Arka lambalar: fren (girdi ya da hızlı yavaşlama), farlar açıkken kısık stop, geri viteste beyaz */
  updateTailLights(v, dt, local) {
    if (!v.tailMat) return;
    const sp = v.speed || 0, prev = v._tlSpeed ?? sp;
    v._tlSpeed = sp;
    const decel = dt > 0 ? (Math.abs(prev) - Math.abs(sp)) / dt : 0;
    const braking = local ? (v.inThr < 0 && sp > 0.6) || (v.inThr > 0 && sp < -0.6) || v.inHB : decel > 2.5 && Math.abs(sp) > 0.5;
    v.brakeGlow = damp(v.brakeGlow, braking ? 1 : 0, braking ? 30 : 8, dt);
    const on = v.seats && v.seats[0];
    v.tailMat.emissiveIntensity = (on ? (v.lights ? 0.35 : 0.08) : 0.03) + v.brakeGlow * 1.4;
    v.revMat.emissiveIntensity = on && sp < -0.4 ? 1.2 : 0;
  }

  /** Arazide/toprak yolda hızlı giden aracın arkasından toz (asfaltta ve ıslakken yok) */
  dustTrail(v, dt) {
    const sp = Math.abs(v.speed || 0);
    if (sp < 6 || v.def.water || !v.pos) return;
    const S = this.s, T = S.world.terrain;
    if (S.env && S.env.weather && S.env.weather.rain > 0.2) return;
    const ix = Math.round((v.pos.x + T.half) / T.cell), iz = Math.round((v.pos.z + T.half) / T.cell);
    const k = T.idx(clamp(ix, 0, T.N), clamp(iz, 0, T.N));
    if (T.roadMask[k] >= 1) return; // asfalt (yol kenarı/toprak geçişte toz olur)
    const dustK = (SURFACES[v.surface || 'grass'] || SURFACES.grass).dust;
    if (dustK <= 0 || Math.random() > dt * sp * 0.9 * dustK) return;
    const bx = v.pos.x - Math.sin(v.yaw) * v.def.len * 0.45, bz = v.pos.z - Math.cos(v.yaw) * v.def.len * 0.45;
    S.fx.dust(bx + (Math.random() - 0.5) * v.def.wid * 0.8, v.pos.y + 0.25, bz, 2);
  }

  update(dt) {
    const S = this.s;
    const alpha = S.game.phys ? S.game.phys.alpha : 1;
    for (const v of this.list) v.updateProxy();
    const cam = S.game.gfx && S.game.gfx.camera ? S.game.gfx.camera.position : null;
    for (const v of this.list) {
      if (v === this.local) continue;
      this.syncVisual(v, alpha);
      for (const h of v.headlights) h.intensity = v.lights && v.seats[0] ? (v.upgrades.lights ? 60 : 35) : 0;
      this.updateTailLights(v, dt, false);
      // görsel ayrıntı düzeyi: kabin içi, kapı/bagaj kanatları ve far camları ~60 m ötede gizlenir (boş araçlarda);
      // terk edilmiş arabalar da gerçek araç olunca şehirde çizim çağrısı sayısı böyle sınırlanır
      const near = !cam || v.seats.some(Boolean) || v.root.position.distanceToSquared(cam) < VIS_LOD2;
      if (v.tailMeshes && v.tailMeshes[0].visible !== near) for (const m of v.tailMeshes) m.visible = near;
      if (v.visuals) {
        if (v.visuals.group.visible !== near) v.visuals.group.visible = near;
        if (near) v.visuals.update(dt);
      }
      if (v._trunkLocal && !(S.ui.panel && S.ui.panel.name === 'storage' && S.ui.panels.storage && S.ui.panels.storage.id === v.id)) { v._trunkLocal = false; S.act('vehicle_set', { id: v.id, trunkOpen: false }); }
      this.dustTrail(v, dt);
      if (v.seats[0]) S.audio.loop('engine_' + v.id, v.def.sound || 'engine', { at: v.pos, vol: 0.3 + Math.abs(v.speed) / v.def.maxSpeed * 0.4, rate: 0.6 + Math.abs(v.speed) / v.def.maxSpeed * 1.4, range: 60 });
      else S.audio.stopLoop('engine_' + v.id);
      if (v.wrecked && Math.random() < dt * 3) S.fx.smoke(v.pos.x, v.pos.y + 1.5, v.pos.z, 1, '#333333');
      else if (v.health < v.maxHealth * 0.3 && Math.random() < dt * 2) S.fx.smoke(v.pos.x + Math.sin(v.yaw) * v.def.len * 0.4, v.pos.y + 1.2, v.pos.z + Math.cos(v.yaw) * v.def.len * 0.4, 1, '#666666');
    }
    if (this.local) {
      const v = this.local;
      for (const h of v.headlights) h.intensity = v.lights ? (v.upgrades.lights ? 60 : 35) : 0;
      this.updateTailLights(v, dt, true);
      if (v.visuals) v.visuals.update(dt);
      this.dustTrail(v, dt);
      if (v.health < v.maxHealth * 0.3 && Math.random() < dt * 3) S.fx.smoke(v.pos.x + Math.sin(v.yaw) * v.def.len * 0.4, v.pos.y + 1.2, v.pos.z + Math.cos(v.yaw) * v.def.len * 0.4, 1, '#555555');
    }
    this.updateHeadlightPool();
  }

  /** Sanal farları havuz ışıklarına ata: farı yanan araçlar kameraya uzaklığa göre sıralanır, en yakınlar ışık alır.
   *  Uzak araçların far camı (ışıyan panel) yine parlar; yalnız sahneye ışık düşürmez. */
  updateHeadlightPool() {
    const pool = this.lightPool;
    if (!pool || !pool.length) return;
    const cam = this.s.game.gfx && this.s.game.gfx.camera ? this.s.game.gfx.camera.position : null;
    const lit = [];
    for (const v of this.list) if (v.root && v.headlights.some((h) => h.intensity > 0)) lit.push(v);
    if (cam && lit.length > 1) lit.sort((a, b) => a.root.position.distanceToSquared(cam) - b.root.position.distanceToSquared(cam));
    let k = 0;
    for (const v of lit) {
      for (const h of v.headlights) {
        if (k >= pool.length || h.intensity <= 0) continue;
        const sl = pool[k++];
        sl.intensity = h.intensity; sl.distance = h.distance;
        sl.position.copy(h.position).applyMatrix4(v.root.matrixWorld);
        sl.target.position.copy(h.target).applyMatrix4(v.root.matrixWorld);
        sl.updateMatrixWorld(); sl.target.updateMatrixWorld();
      }
    }
    for (; k < pool.length; k++) pool[k].intensity = 0;
  }

  serialize() {
    return this.list.map((v) => ({ id: v.id, type: v.type, x: v.pos.x, y: v.pos.y, z: v.pos.z, rot: v.yaw, q: [v.quat.x, v.quat.y, v.quat.z, v.quat.w], health: v.health / v.def.hp, fuel: v.fuel / v.def.fuelCap, broken: v.broken, needs: v.needs, fault: v.fault, abandoned: v.abandoned, upgrades: v.upgrades, paint: v.paint, trunk: v.trunk, wrecked: v.wrecked }));
  }
  load(arr) {
    for (const v of this.list) v.dispose();
    this.list = [];
    if (!arr) { this.init(); return; }
    for (const o of arr) { if (!VEHICLE_TYPES[o.type]) continue; const v = new Vehicle(this.s, o); if (o.wrecked) v.wrecked = true; this.list.push(v); }
    // eski kayıtlar: o sürümde olmayan doğum noktaları (ör. eskiden sürülemez dekor olan terk edilmiş arabalar) eklenir;
    // araçlar oyunda hiç silinmediği için kayıtta olmayan kimlik = kayıttan sonra eklenmiş araç
    for (const sp of this.s.world.vehicleSpawns) if (!this.byId(sp.id)) this.list.push(this.spawn(sp));
  }
  dispose() {
    for (const v of this.list) v.dispose();
    this.list = [];
    for (const sl of this.lightPool || []) { this.s.game.scene.remove(sl); this.s.game.scene.remove(sl.target); sl.dispose(); }
    this.lightPool = [];
    // oturum Game.endSession dışında kapanırsa da (yeniden bağlanma, host göçü) yerel araç döngüleri susar
    for (const k of ['engine_local', 'skid_local', 'tire_local']) this.s.audio.stopLoop(k);
  }
}

export { wrapAngle };
