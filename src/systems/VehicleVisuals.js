// Araç görselleri (Aşama 5): kabin içi (koltuklar, gösterge paneli, direksiyon), yarı saydam camlar, kapı ve bagaj
// kanatları (binince/inince ve bagaj açılınca sallanır), far/stop ışıma yüzeyleri, hasar görselleri (göçükler,
// çizik/is koyulaşması, çatlak cam, bozuk far). Hepsi araç kökü (root) altında; fizik ya da ağ durumunu değiştirmez.
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

const DOOR_OPEN = 1.05; // rad
const TRUNK_OPEN = 1.15;
const _v = new THREE.Vector3();

const MAT = {
  seat: new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.95 }),
  seatLight: new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.95 }),
  dash: new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.7 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.6 }),
  headGlow: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff4d6, emissiveIntensity: 0, roughness: 0.3 }),
  crack: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 0.2, depthWrite: false }),
};

/** Kenney araç camları: koyu opak yerine yarı saydam mavi-gri (kabin görünür) — kit başına bir kez */
export function prepareWindowMaterials(model) {
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m || !/window|glass/i.test(m.name) || m.userData.vehGlass) continue;
      m.userData.vehGlass = true;
      m.transparent = true; m.opacity = 0.42; m.depthWrite = false;
      m.color.lerp(new THREE.Color(0x9fc6e0), 0.5);
      m.roughness = 0.1; m.metalness = 0.15; m.side = THREE.DoubleSide;
    }
  });
  // saydam camlı ağlar en son çizilsin (kabin önce)
  model.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m && m.userData.vehGlass)) o.renderOrder = 3; });
}

export class VehicleVisuals {
  constructor(v) {
    this.v = v;
    const d = v.def, L = d.len, W = d.wid, H = v.modelH || 1.5;
    this.group = new THREE.Group();
    this.group.name = 'veh-visuals';
    v.root.add(this.group);
    this.doors = []; // {pivot, side, ang, target}
    this.trunk = null;
    this.steer = null;
    this.dents = 0; // uygulanmış göçük eşiği sayısı
    this.cracked = false;
    this.headGlows = [];
    this.seatMeshes = [];
    if (!d.water) {
      this.buildCabin(L, W, H);
      this.buildDoors(L, W, H);
      this.buildTrunk(L, W, H);
      this.buildLightGlow(L, W, H);
    }
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }

  /** Kabin: koltuklar (sıra başına iki), gösterge paneli, direksiyon (sürücü solda), orta konsol */
  buildCabin(L, W, H) {
    const v = this.v, d = v.def;
    if (d.bike) {
      // motosiklet: sele + gidon
      const sele = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.7), MAT.seat); sele.position.set(0, clamp(H * 0.55, 0.6, 0.9), -0.2); this.group.add(sele);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 8), MAT.chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, clamp(H * 0.7, 0.8, 1.1), L * 0.22); this.group.add(bar);
      this.steer = bar;
      return;
    }
    const seatY = clamp(H * 0.25, 0.32, 0.85);
    const rows = Math.max(1, Math.ceil(d.seats / 2));
    const rowZ0 = L * 0.06, rowDz = 1.0;
    const cabinW = W * 0.62;
    for (let r = 0; r < rows; r++) {
      const z = rowZ0 - r * rowDz;
      if (z < -L * 0.42) break;
      for (const side of [-1, 1]) {
        if (r === 0 || d.seats > r * 2 + (side > 0 ? 0 : 1)) {
          const m = r === 0 ? MAT.seat : MAT.seatLight;
          const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.48), m); base.position.set(side * cabinW * 0.3, seatY, z); this.group.add(base);
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.09), m); back.position.set(side * cabinW * 0.3, seatY + 0.3, z - 0.24); back.rotation.x = -0.12; this.group.add(back);
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.08), m); head.position.set(side * cabinW * 0.3, seatY + 0.64, z - 0.27); this.group.add(head);
          this.seatMeshes.push(base, back, head);
        }
      }
    }
    // gösterge paneli ve direksiyon (ön sıranın önünde)
    const dashZ = rowZ0 + 0.62, dashY = seatY + 0.5;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(cabinW, 0.18, 0.34), MAT.dash); dash.position.set(0, dashY, dashZ); this.group.add(dash);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.5), MAT.dash); console_.position.set(0, seatY + 0.14, dashZ - 0.35); this.group.add(console_);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 20), MAT.wheel);
    wheel.position.set(-cabinW * 0.3, dashY - 0.02, dashZ - 0.28); wheel.rotation.x = -1.25;
    this.group.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), MAT.wheel); hub.rotation.x = -1.25 + Math.PI / 2; hub.position.copy(wheel.position).add(new THREE.Vector3(0, -0.02, 0.05)); this.group.add(hub);
    this.steer = wheel;
  }

  /** Kapı kanatları: gövdenin yan yüzünde ince panel (boya rengi + cam şeridi); menteşe ön kenarda */
  buildDoors(L, W, H) {
    const v = this.v, d = v.def;
    if (d.bike) return;
    const paint = v.bodyMats[0] || new THREE.MeshStandardMaterial({ color: 0x888888 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc6e0, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.15, depthWrite: false });
    const doorH = clamp(H * 0.55, 0.7, 1.25), doorW = clamp(L * 0.24, 0.8, 1.25), y0 = clamp(H * 0.2, 0.25, 0.6);
    const rows = Math.min(2, Math.max(1, Math.ceil(d.seats / 2)));
    for (let r = 0; r < rows; r++) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        const zFront = L * 0.06 + 0.62 - r * (doorW + 0.06); // menteşe: ön kenar
        pivot.position.set(side * (W * 0.5 + 0.015), y0, zFront);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, doorH * 0.58, doorW), paint);
        panel.position.set(0, doorH * 0.29, -doorW / 2);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorH * 0.4, doorW * 0.86), glass);
        win.position.set(0, doorH * 0.58 + doorH * 0.2, -doorW / 2);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), MAT.chrome);
        handle.position.set(side * 0.02, doorH * 0.5, -doorW * 0.78);
        pivot.add(panel, win, handle);
        this.group.add(pivot);
        this.doors.push({ pivot, side, row: r, ang: 0, target: 0, t: 0 });
      }
    }
  }

  /** Bagaj kapağı: arka üst kenardan yukarı açılır */
  buildTrunk(L, W, H) {
    const v = this.v, d = v.def;
    if (d.bike || d.trunk <= 0) return;
    const paint = v.bodyMats[0] || new THREE.MeshStandardMaterial({ color: 0x888888 });
    const pivot = new THREE.Group();
    const lidH = clamp(H * 0.32, 0.3, 0.7), lidW = W * 0.8;
    pivot.position.set(0, clamp(H * 0.62, 0.7, 1.6), -L * 0.5 + 0.02);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(lidW, lidH, 0.03), paint);
    lid.position.set(0, -lidH / 2, 0);
    pivot.add(lid);
    this.group.add(pivot);
    this.trunk = { pivot, ang: 0, target: 0 };
  }

  /** Far camları: ışıyan küçük paneller (far açıkken parlar; bozuk far sönük) */
  buildLightGlow(L, W, H) {
    const v = this.v;
    const y = clamp(H * 0.38, 0.45, 1.1), z = L * 0.5 - 0.02;
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.04), MAT.headGlow.clone());
      g.position.set(s * W * 0.33, y, z);
      this.group.add(g);
      this.headGlows.push({ mesh: g, side: s, broken: false });
    }
    void v;
  }

  /** Binme/inme: o taraftaki kapı açılıp kapanır */
  swingDoor(seat) {
    const row = Math.min(1, Math.floor(seat / 2)), side = seat % 2 === 0 ? 1 : -1;
    const d = this.doors.find((q) => q.row === row && q.side === side) || this.doors[0];
    if (!d) return;
    d.target = DOOR_OPEN; d.t = 1.1; // 1,1 sn açık kalır, sonra kapanır
  }

  setTrunkOpen(open) { if (this.trunk) this.trunk.target = open ? TRUNK_OPEN : 0; }

  /** Hasar eşiği geçişleri: göçük (gövde geometrisinde köşe itme), koyulaşma, çatlak cam, bozuk far */
  applyDamage(health01, impactDir = null) {
    const v = this.v;
    const want = health01 < 0.25 ? 3 : health01 < 0.5 ? 2 : health01 < 0.75 ? 1 : 0;
    // boya: sağlık düştükçe matlaşır ve koyulaşır (çizik, is)
    for (const m of v.bodyMats) {
      if (!m.userData.base) m.userData.base = { color: m.color.clone(), rough: m.roughness };
      const k = 1 - health01;
      m.color.copy(m.userData.base.color).multiplyScalar(1 - 0.35 * k).lerp(new THREE.Color(0x3a3a3a), 0.25 * k);
      m.roughness = clamp(m.userData.base.rough + 0.4 * k, 0, 1);
    }
    while (this.dents < want) { this.dents++; this.dent(impactDir); }
    if (want >= 2 && !this.cracked) { this.cracked = true; this.crackGlass(); }
    if (want >= 2 && this.headGlows.length && !this.headGlows.some((h) => h.broken)) {
      const h = this.headGlows[Math.floor(Math.random() * this.headGlows.length)];
      h.broken = true; h.mesh.material.color.set(0x444444);
    }
    if (want === 0 && this.dents > 0) this.resetBody(); // onarıldı
  }

  /** Göçük: gövde ağının köşeleri bir merkez etrafında içe itilir (geometri araç başına kopyalanır) */
  dent(impactDir) {
    const v = this.v, m = v.model;
    let body = null;
    m.traverse((o) => { if (!body && o.isMesh && /body/i.test(o.name) && o.geometry.attributes.position) body = o; });
    if (!body) return;
    if (!body.userData.dentGeo) { body.geometry = body.geometry.clone(); body.userData.dentGeo = true; body.userData.pos0 = body.geometry.attributes.position.array.slice(); }
    const g = body.geometry, P = g.attributes.position, N = g.attributes.normal;
    g.computeBoundingBox();
    const bb = g.boundingBox, size = bb.getSize(new THREE.Vector3());
    // göçük merkezi: çarpma yönü verildiyse o taraf, yoksa rastgele ön/arka/yan
    const dir = impactDir || [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]][Math.floor(Math.random() * 4)];
    _v.set(bb.min.x + size.x * (0.5 + dir[0] * 0.5), bb.min.y + size.y * (0.35 + Math.random() * 0.3), bb.min.z + size.z * (0.5 + dir[2] * 0.5));
    const R = Math.max(size.x, size.z) * 0.22, depth = Math.min(size.x, size.z) * 0.06;
    for (let i = 0; i < P.count; i++) {
      const dx = P.getX(i) - _v.x, dy = P.getY(i) - _v.y, dz = P.getZ(i) - _v.z;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd > R) continue;
      const k = (1 - dd / R) ** 2 * depth * (0.6 + Math.random() * 0.6);
      P.setXYZ(i, P.getX(i) - dir[0] * k, P.getY(i) - k * 0.3, P.getZ(i) - dir[2] * k);
    }
    P.needsUpdate = true;
    if (N) g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  resetBody() {
    const v = this.v;
    v.model.traverse((o) => {
      if (o.isMesh && o.userData.dentGeo && o.userData.pos0) { o.geometry.attributes.position.array.set(o.userData.pos0); o.geometry.attributes.position.needsUpdate = true; o.geometry.computeVertexNormals(); }
    });
    this.dents = 0; this.cracked = false;
    for (const h of this.headGlows) { h.broken = false; h.mesh.material.color.set(0xfff6dc); }
    for (const m of this.v.bodyMats) if (m.userData.base) { m.color.copy(m.userData.base.color); m.roughness = m.userData.base.rough; }
    this.v.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData.vehGlass) { m.opacity = 0.42; m.roughness = 0.1; } });
  }

  /** Çatlak cam: camlar daha opak ve pürüzlü (kırık görünümü) */
  crackGlass() {
    this.v.model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData.vehGlass) { m.opacity = 0.7; m.roughness = 0.55; } });
  }

  /** Her kare: kapı/bagaj açıları, direksiyon, far ışıması */
  update(dt) {
    const v = this.v;
    for (const d of this.doors) {
      if (d.t > 0) { d.t -= dt; if (d.t <= 0) d.target = 0; }
      d.ang = damp(d.ang, d.target, d.target > d.ang ? 9 : 5, dt);
      d.pivot.rotation.y = d.side * d.ang; // dışa açılır
    }
    if (this.trunk) { this.trunk.ang = damp(this.trunk.ang, this.trunk.target, 6, dt); this.trunk.pivot.rotation.x = -this.trunk.ang; }
    if (this.steer && !v.def.bike) this.steer.rotation.z = -(v.steer || 0) * 2.6;
    else if (this.steer) this.steer.rotation.y = (v.steer || 0) * 0.8;
    const lit = v.lights && v.seats && v.seats[0];
    for (const h of this.headGlows) h.mesh.material.emissiveIntensity = lit && !h.broken ? 2.2 : 0;
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.v.root.remove(this.group);
  }
}
