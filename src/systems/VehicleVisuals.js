// Araç görselleri (Aşama 5): kabin içi (koltuklar, gösterge paneli, direksiyon), yarı saydam camlar, kapı ve bagaj
// kanatları (binince/inince ve bagaj açılınca sallanır), far/stop ışıma yüzeyleri, hasar görselleri (göçükler,
// çizik/is koyulaşması, çatlak cam, bozuk far). Hepsi araç kökü (root) altında; fizik ya da ağ durumunu değiştirmez.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { repairNormals } from '../core/NormalRepair.js';
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
  // Assets.model() klonları malzemeleri paylaşır: cam malzemesi araç başına klonlanır (çatlak cam yalnız o araçta)
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    let changed = false;
    const out = mats.map((m) => {
      if (!m || !/window|glass/i.test(m.name)) return m;
      if (m.userData.vehGlass && m.userData.owner === model) return m;
      const c = m.clone();
      c.userData.vehGlass = true; c.userData.owner = model;
      c.transparent = true; c.opacity = 0.42; c.depthWrite = false;
      c.color.lerp(new THREE.Color(0x9fc6e0), 0.5);
      c.roughness = 0.1; c.metalness = 0.15; c.side = THREE.DoubleSide;
      changed = true;
      return c;
    });
    if (changed) o.material = Array.isArray(o.material) ? out : out[0];
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
    // boya malzemesi bulunamayan (tek doku atlaslı: pikap, askerî kamyon, motosiklet) modellerde gövde kabuğunun
    // malzemesi araç başına klonlanır: hasar koyulaşması ve boya bu araçlarda da çalışır
    if (!v.bodyMats.length && !d.water) {
      const sh = this.bodyShell();
      if (sh && !Array.isArray(sh.material)) { sh.material = sh.material.clone(); sh.material.userData.vehShell = true; v.bodyMats.push(sh.material); }
    }
    if (!d.water) {
      this.buildCabin(L, W, H);
      this.buildDoors(L, W, H);
      this.buildTrunk(L, W, H);
      this.buildLightGlow(L, W, H);
      this.mergeStatic();
    }
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }

  /**
   * Çizim çağrısı tasarrufu: kabine göre hareket etmeyen parçalar (koltuklar, gösterge paneli, konsol, direksiyon
   * kolonu; userData.static) malzemeye göre tek ağda birleştirilir. Araç başına ~20 ayrı çizim 3'e iner; terk edilmiş
   * arabalar da gerçek araç olunca otoparkta onlarca araç yan yana durabiliyor.
   */
  mergeStatic() {
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const byMat = new Map(), gone = [];
    this.group.traverse((o) => {
      if (!o.isMesh || !o.userData.static) return;
      const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
      gone.push(o);
    });
    for (const o of gone) { o.parent.remove(o); o.geometry.dispose(); }
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat); m.name = 'cabin-static';
      this.group.add(m);
    }
    this.seatMeshes = this.group.children.filter((o) => o.name === 'cabin-static');
  }

  /** Kabin: koltuklar (sıra başına iki), gösterge paneli, direksiyon (sürücü solda, +X), orta konsol */
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
          base.userData.static = back.userData.static = head.userData.static = true;
          this.seatCount = (this.seatCount || 0) + 1;
        }
      }
    }
    // gösterge paneli ve direksiyon (ön sıranın önünde)
    const dashZ = rowZ0 + 0.62, dashY = seatY + 0.5;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(cabinW, 0.18, 0.34), MAT.dash); dash.position.set(0, dashY, dashZ); this.group.add(dash);
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.5), MAT.dash); console_.position.set(0, seatY + 0.14, dashZ - 0.35); this.group.add(console_);
    dash.userData.static = console_.userData.static = true;
    // direksiyon sürücü tarafında: araç +Z'ye bakar, +X aracın solu; sürücü koltuğu Vehicles.seatLocal(0) x = +W·0,2.
    // Simit üstü panele doğru ~29° eğik; üç kol, dönüşün görünmesi için (kolsuz halka kendi ekseninde dönünce fark
    // edilmiyordu). Eğik gövde (tilt) sabit, içindeki simit (steer) direksiyon açısıyla kendi ekseninde döner.
    const tilt = new THREE.Group();
    tilt.position.set(cabinW * 0.3, dashY - 0.02, dashZ - 0.28); tilt.rotation.x = 0.5;
    // simit + üç kol + göbek tek geometri (tek çizim); dönen parça bu ağın kendisi
    const parts = [new THREE.TorusGeometry(0.17, 0.022, 8, 20)];
    for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
      parts.push(new THREE.BoxGeometry(0.15, 0.026, 0.016).applyMatrix4(new THREE.Matrix4().makeRotationZ(a).setPosition(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0)));
    }
    parts.push(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12).rotateX(Math.PI / 2));
    const wheel = new THREE.Mesh(mergeGeometries(parts, false), MAT.wheel);
    for (const g of parts) g.dispose();
    tilt.add(wheel);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 8), MAT.dash); column.rotation.x = Math.PI / 2; column.position.z = 0.14; tilt.add(column);
    column.userData.static = true;
    this.group.add(tilt);
    this.steer = wheel;
  }

  /** Kapı kanatları: gövdenin yan yüzünde ince panel (boya rengi, gövde renginde kol); menteşe ön kenarda.
   *  Panel ve kol tek geometri (kapı başına tek çizim); kapı camı ayrı saydam ağdı (çift yüzlü saydam = iki çizim),
   *  gövdenin kendi camı zaten göründüğü için kaldırıldı (cam inik). */
  buildDoors(L, W, H) {
    const v = this.v, d = v.def;
    if (d.bike) return;
    const paint = v.bodyMats[0] && !v.bodyMats[0].map ? v.bodyMats[0] : new THREE.MeshStandardMaterial({ color: 0x888888 });
    const doorH = clamp(H * 0.55, 0.7, 1.25), doorW = clamp(L * 0.24, 0.8, 1.25), y0 = clamp(H * 0.2, 0.25, 0.6);
    const rows = Math.min(2, Math.max(1, Math.ceil(d.seats / 2)));
    for (let r = 0; r < rows; r++) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        const zFront = L * 0.06 + 0.62 - r * (doorW + 0.06); // menteşe: ön kenar
        pivot.position.set(side * (W * 0.5 + 0.015), y0, zFront);
        const pg = new THREE.BoxGeometry(0.03, doorH * 0.58, doorW).translate(0, doorH * 0.29, -doorW / 2);
        const hg = new THREE.BoxGeometry(0.03, 0.03, 0.16).translate(side * 0.02, doorH * 0.5, -doorW * 0.78);
        const panel = new THREE.Mesh(mergeGeometries([pg, hg], false), paint);
        pg.dispose(); hg.dispose();
        pivot.add(panel);
        this.group.add(pivot);
        this.doors.push({ pivot, side, row: r, ang: 0, target: 0, t: 0 });
      }
    }
  }

  /** Bagaj kapağı: arka üst kenardan yukarı açılır */
  buildTrunk(L, W, H) {
    const v = this.v, d = v.def;
    if (d.bike || d.trunk <= 0) return;
    const paint = v.bodyMats[0] && !v.bodyMats[0].map ? v.bodyMats[0] : new THREE.MeshStandardMaterial({ color: 0x888888 });
    const pivot = new THREE.Group();
    const lidH = clamp(H * 0.32, 0.3, 0.7), lidW = W * 0.8;
    pivot.position.set(0, clamp(H * 0.62, 0.7, 1.6), -L * 0.5 + 0.02);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(lidW, lidH, 0.03), paint);
    lid.position.set(0, -lidH / 2, 0);
    pivot.add(lid);
    this.group.add(pivot);
    this.trunk = { pivot, ang: 0, target: 0 };
  }

  /** Far camları: ışıyan küçük paneller (far açıkken parlar; bozuk far sönük).
   *  Panel, modelin ön yüzüne önden ışın atılarak oturtulur (def.len modelin gerçek boyundan farklı olabildiği için
   *  sabit z'de panel ya gövdenin içinde kalıyor ya önünde havada duruyordu); far ışığı (SpotLight) da panele taşınır. */
  buildLightGlow(L, W, H) {
    const v = this.v;
    v.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(v.root.matrixWorld).invert();
    const box = new THREE.Box3();
    v.model.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    if (box.isEmpty()) box.set(new THREE.Vector3(-W / 2, 0, -L / 2), new THREE.Vector3(W / 2, H, L / 2));
    const bw = box.max.x - box.min.x, bh = box.max.y - box.min.y;
    const y = box.min.y + clamp(bh * 0.38, 0.45, 1.1), front = box.max.z;
    const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(0, 0, -1).transformDirection(v.root.matrixWorld);
    const targets = [];
    v.model.traverse((q) => { if (q.isMesh && ![].concat(q.material).some((m) => m && m.userData.vehGlass)) targets.push(q); });
    for (const s of [-1, 1]) {
      const x = box.min.x + bw / 2 + s * bw * 0.33;
      // önden arkaya ışın: ilk çarpılan yüzey ön yüz (tampon/ızgara); ışın gövdenin yarısını geçerse yüzey sayılmaz
      o.set(x, y, front + 1).applyMatrix4(v.root.matrixWorld);
      rc.set(o, d); rc.far = 1 + (box.max.z - box.min.z) * 0.5;
      const hit = rc.intersectObjects(targets, false)[0];
      const z = hit ? _v.copy(hit.point).applyMatrix4(inv).z + 0.012 : front + 0.012;
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.02), MAT.headGlow.clone());
      g.position.set(x, y, z);
      this.group.add(g);
      this.headGlows.push({ mesh: g, side: s, broken: false });
      // Vehicles.build farları [-1, 1] sırasıyla kurar: ışık kaynağı panelin hemen önüne
      const sl = v.headlights && v.headlights[s < 0 ? 0 : 1];
      if (sl) sl.position.set(x, y, z + 0.08);
    }
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

  /** Göçük uygulanacak gövde kabuğu: modelin boyalı, saydam/ışık olmayan en hacimli ağı (bir kez seçilir).
   *  Eskiden adı /body/ geçen İLK ağ alınıyordu; çok parçalı Kenney gövdelerinde bu cam ya da küçük bir parça olabiliyordu. */
  bodyShell() {
    if (this._shell !== undefined) return this._shell;
    const v = this.v, paint = new Set(v.bodyMats);
    v.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(v.root.matrixWorld).invert(), M = new THREE.Matrix4(), bb = new THREE.Box3(), sz = new THREE.Vector3();
    let best = null, bestScore = 0;
    v.model.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = [].concat(o.material);
      if (mats.some((m) => !m || m.userData.vehGlass || m.transparent || /glass|window|light|lamp/i.test(m.name || ''))) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bb.copy(o.geometry.boundingBox).applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld)).getSize(sz);
      const score = sz.x * sz.y * sz.z * (mats.some((m) => paint.has(m)) ? 8 : 1) * (/body/i.test(o.name) ? 1.5 : 1);
      if (score > bestScore) { bestScore = score; best = o; }
    });
    this._shell = best;
    return best;
  }

  /** Göçük: gövde ağının köşeleri bir merkez etrafında içe itilir (geometri araç başına kopyalanır).
   *  Hesap araç kökü çerçevesinde yapılır (çarpma yönü orada tanımlı: +Z ön); ağın kendi döndürme/ölçeği dönüşümle aşılır.
   *  Çok malzemeli gövdelerde (boya/cam/plastik ayrı ağ) aynı göçük kardeş ağlara da uygulanır ve itme miktarı köşe
   *  konumundan türetilir (rastgele değil): ortak dikişteki çift köşeler aynı yere gider, gövdede yarık açılmaz. */
  dent(impactDir) {
    const v = this.v;
    const body = this.bodyShell();
    if (!body) return;
    // kardeş parçalar yalnız gövde bir alt grubun içindeyse (model kökü ya da araç kökü değil: oradaki stop lambası
    // kutuları ezilmesin)
    const parts = body !== v.model && body.parent && body.parent !== v.model && body.parent !== v.root ? body.parent.children.filter((o) => o.isMesh && o.geometry && o.geometry.attributes.position) : [body];
    v.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(v.root.matrixWorld).invert();
    // göçük merkezi ve büyüklüğü kabuğun araç çerçevesindeki kutusundan
    if (!body.geometry.boundingBox) body.geometry.computeBoundingBox();
    const bb = body.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, body.matrixWorld)), size = bb.getSize(new THREE.Vector3());
    // çarpma yönü verildiyse o taraf, yoksa rastgele ön/arka/yan
    const dir = impactDir || [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]][Math.floor(Math.random() * 4)];
    const c = new THREE.Vector3(bb.min.x + size.x * (0.5 + dir[0] * 0.5), bb.min.y + size.y * (0.35 + Math.random() * 0.3), bb.min.z + size.z * (0.5 + dir[2] * 0.5));
    const R = Math.max(size.x, size.z) * 0.22, depth = Math.min(size.x, size.z) * 0.06;
    for (const o of parts) {
      if (!o.userData.dentGeo) {
        o.geometry = o.geometry.clone(); o.userData.dentGeo = true;
        o.userData.pos0 = o.geometry.attributes.position.array.slice();
        if (o.geometry.attributes.normal) o.userData.nrm0 = o.geometry.attributes.normal.array.slice();
      }
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
      const M = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld), Mi = M.clone().invert(); // ağ yerel ↔ araç kökü
      let moved = false;
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(M);
        const dd = _v.distanceTo(c);
        if (dd > R) continue;
        const h = Math.sin(_v.x * 12.9898 + _v.y * 78.233 + _v.z * 37.719) * 43758.5453; // konumdan sözde rastgele
        const k = (1 - dd / R) ** 2 * depth * (0.6 + (h - Math.floor(h)) * 0.6);
        _v.set(_v.x - dir[0] * k, _v.y - k * 0.3, _v.z - dir[2] * k).applyMatrix4(Mi);
        P.setXYZ(i, _v.x, _v.y, _v.z); moved = true;
      }
      if (!moved) continue;
      P.needsUpdate = true;
      // yeniden hesaplanan normaller alanı sıfır üçgenlerin köşelerinde sıfır uzunlukta kalır → gölgelendiricide NaN,
      // parlama bulanıklığıyla bütün ekran kararıyordu (hasarlı doğan araçlar): onarılır
      if (N) { g.computeVertexNormals(); repairNormals(g); }
      g.computeBoundingBox(); g.computeBoundingSphere();
    }
  }

  resetBody() {
    const v = this.v;
    v.model.traverse((o) => {
      if (o.isMesh && o.userData.dentGeo && o.userData.pos0) {
        const g = o.geometry;
        g.attributes.position.array.set(o.userData.pos0); g.attributes.position.needsUpdate = true;
        // özgün (modeldeki) normaller geri yüklenir; yeniden hesaplama hem görünümü değiştirir hem sıfır normal üretebilir
        if (o.userData.nrm0 && g.attributes.normal) { g.attributes.normal.array.set(o.userData.nrm0); g.attributes.normal.needsUpdate = true; } else { g.computeVertexNormals(); repairNormals(g); }
        g.computeBoundingSphere();
      }
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
      d.pivot.rotation.y = -d.side * d.ang; // dışa açılır (sağ kapı −Y, sol kapı +Y)
    }
    if (this.trunk) { this.trunk.ang = damp(this.trunk.ang, this.trunk.target, 6, dt); this.trunk.pivot.rotation.x = this.trunk.ang; } // yukarı-geriye açılır
    if (this.steer && !v.def.bike) this.steer.rotation.z = -(v.steer || 0) * 2.6;
    else if (this.steer) this.steer.rotation.y = (v.steer || 0) * 0.8;
    const lit = v.lights && v.seats && v.seats[0];
    for (const h of this.headGlows) {
      h.mesh.material.emissiveIntensity = lit && !h.broken ? 2.2 : 0;
      // bozuk farın ışığı da yanmaz (Vehicles.update yoğunluğu bu çağrıdan hemen önce yazar)
      if (h.broken) { const sl = v.headlights && v.headlights[h.side < 0 ? 0 : 1]; if (sl) sl.intensity = 0; }
    }
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    for (const h of this.headGlows) h.mesh.material.dispose(); // araç başına klonlanan far camı malzemesi
    for (const m of this.v.bodyMats) if (m.userData.vehShell) m.dispose();
    if (this.v.model) this.v.model.traverse((o) => { if (o.isMesh && o.userData.dentGeo) { o.geometry.dispose(); o.userData.dentGeo = false; } if (o.isMesh) for (const m of [].concat(o.material)) if (m && m.userData.vehGlass && m.userData.owner === this.v.model) m.dispose(); });
    this.v.root.remove(this.group);
  }
}
