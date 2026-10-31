// Statik dünyayı kurar: arazi, yollar, binalar, dekor, donanımlar, bitki örtüsü, su, gökyüzü,
// çarpışma dünyası ve yol bulma ızgarası. Dünya bir kez kurulur; oturumlar dinamik durumu taşır.
import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { CollisionWorld } from './Physics.js';
import { NavGrid } from './NavGrid.js';
import { Instancer } from './Instancer.js';
import { buildBuilding, DoorRenderer } from './BuildingGen.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRoads, onRoad } from './Roads.js';
import { Vegetation } from './Vegetation.js';
import { Water } from './Water.js';
import { Sky } from './Sky.js';
import { Geo, materials } from './Geo.js';
import * as P from './Props.js';
import { addContainer } from './Furnish.js';
import { signTexture } from './TextureFactory.js';
import { BUILDINGS, DECOR_BUILDINGS, ROADS, REGIONS, REGION_BY_ID, LAKE, SIGNPOSTS, WORLD, BRIDGE } from './WorldLayout.js';
import { buildExtraRegions } from './RegionsExtra.js';
import { RNG } from '../core/util.js';

const CAR_MODELS = ['car_sedan', 'car_hatchback', 'car_stationwagon', 'car_taxi'];

export class World {
  constructor(assets, scene) {
    this.assets = assets;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.buildings = [];
    this.doors = [];
    this.windows = [];
    this.containers = [];
    this.interactables = [];
    this.lamps = [];
    this.parkingSpots = [];
    this.vehicleSpawns = [];
  }

  async build(progress = () => {}) {
    const step = async (label, fn) => { progress(label); await new Promise((r) => setTimeout(r, 0)); fn(); };
    await step('Ada şekilleniyor…', () => {
      this.terrain = new Terrain();
      this.root.add(this.terrain.buildMesh());
      this.physics = new CollisionWorld(this.terrain);
      this.instancer = new Instancer(this.assets, this.root);
    });
    await step('Yollar döşeniyor…', () => {
      this.roads = buildRoads(this.terrain, this.root, (p) => {
        const r = this.terrain.regionAt(p.x, p.z);
        return r && ['sehir', 'hastane', 'mahalle', 'benzin', 'tatil', 'havaalani', 'cezaevi', 'ciftlik'].includes(r.id);
      });
    });
    await step('Binalar inşa ediliyor…', () => {
      this.ctx = {
        assets: this.assets, physics: this.physics, instancer: this.instancer, terrain: this.terrain, scene: this.root,
        panes: [], doors: this.doors, windows: this.windows, containers: this.containers,
        addAntenna: (c) => { const p = c.fr.pt(c.tpl.w + 2.5, c.tpl.d / 2); const g = new Geo(); P.antennaTower(g, p.x, c.baseY, p.z, 20); this.addGeo(g); this.physics.addBoxC(p.x, p.z, 1, 1, c.baseY, c.baseY + 20, { kind: 'prop' }); },
      };
      for (const spec of BUILDINGS) {
        try { this.buildings.push(buildBuilding(spec, this.ctx)); } catch (e) { console.error('Bina kurulamadı', spec.id, e); }
      }
      this.buildingById = Object.fromEntries(this.buildings.map((b) => [b.id, b]));
      this.home = this.buildingById.home;
      this.mergeShells();
      this.doorRenderer = new DoorRenderer(this.doors, this.root);
    });
    await step('Mahalle ve şehir donanımları…', () => {
      this.geo = new Geo();
      this.decorBuildings();
      this.streetFurniture();
      this.neighborhood();
      this.city();
      this.gasStation();
      this.industrial();
      this.military();
      this.port();
      this.lab();
      this.forest();
      buildExtraRegions(this);
      this.signposts();
      this.addGeo(this.geo);
    });
    await step('Orman büyüyor…', () => {
      this.vegetation = new Vegetation(this);
      this.manualTrees();
      this.vegetation.scatter((x, z, r) => this.blocked(x, z, r));
      this.vegetation.build(this.root);
    });
    await step('Su ve gökyüzü…', () => {
      this.water = new Water(this.terrain, this.root);
      this.sky = new Sky(this.scene);
      this.buildPanes();
      this.instancer.build();
    });
    await step('Zombi yolları hesaplanıyor…', () => {
      this.nav = new NavGrid(this.terrain, this.physics);
      this.nav.buildAll();
      this.physics.onChange = (c) => {
        if (!this.nav || c.isFloor || (!c.blocksNav && !c.navType)) return;
        this.nav.rebuildArea(c.minX - 0.6, c.minZ - 0.6, c.maxX + 0.6, c.maxZ + 0.6);
      };
    });
    this.spawn = this.homeSpawn();
    progress('Dünya hazır');
  }

  /** Bina kabuklarını (statik) malzeme + 256 m parça başına birleştir: çizim çağrısı azaltma */
  mergeShells() {
    const groups = new Map();
    for (const b of this.buildings) {
      b.shell.updateMatrixWorld(true);
      for (const m of b.shell.children) {
        const cx = Math.floor(b.spec.x / 256), cz = Math.floor(b.spec.z / 256);
        const key = m.material.uuid + '@' + cx + ',' + cz;
        if (!groups.has(key)) groups.set(key, { mat: m.material, geos: [], cast: m.castShadow });
        groups.get(key).geos.push(m.geometry);
      }
      this.root.remove(b.shell);
    }
    for (const g of groups.values()) {
      const merged = mergeGeometries(g.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, g.mat);
      mesh.castShadow = g.cast; mesh.receiveShadow = true;
      mesh.name = 'shells';
      if (g.mat.transparent) mesh.renderOrder = 2;
      this.root.add(mesh);
      for (const gg of g.geos) gg.dispose();
    }
  }

  addGeo(geo, parent = this.root) {
    const meshes = geo.toMeshes();
    for (const m of meshes) parent.add(m);
    return meshes;
  }

  /** Bir noktada (yarıçap r) engel ya da bina var mı — bitki yerleşimi için */
  blocked(x, z, r = 1) {
    for (const b of this.buildings) {
      const bx = b.box;
      if (x > bx.minX - r - 2 && x < bx.maxX + r + 2 && z > bx.minZ - r - 2 && z < bx.maxZ + r + 2) return true;
    }
    return !!this.physics.overlapsBox(x - r, z - r, x + r, z + r, this.terrain.heightAt(x, z), this.terrain.heightAt(x, z) + 2);
  }

  regionAt(x, z) { return this.terrain.regionAt(x, z); }

  buildingAt(x, z, y = null) {
    for (const b of this.buildings) if (b.contains(x, z, y)) return b;
    return null;
  }

  homeSpawn() {
    const h = this.home;
    const p = h.frame.pt(5, 14.6);
    return { x: p.x, y: this.terrain.heightAt(p.x, p.z) + 0.4, z: p.z, rot: Math.PI };
  }

  // ----------------------------------------------------------------- yardımcılar
  placeModel(kit, name, x, z, rot = 0, scale = 1, opts = {}) {
    const box = this.assets.bbox(kit, name);
    const s = typeof scale === 'number' ? scale : scale[0];
    // pivotu kutu merkezine taşı (bazı modellerde pivot uzakta)
    const cxm = (box.min.x + box.max.x) / 2, czm = (box.min.z + box.max.z) / 2;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const ox = opts.recenter === false ? 0 : -(cxm * c + czm * sn) * s, oz = opts.recenter === false ? 0 : -(-cxm * sn + czm * c) * s;
    const y = (opts.y ?? this.terrain.heightAt(x, z)) - box.min.y * (typeof scale === 'number' ? scale : scale[1]);
    this.instancer.place(kit, name, x + ox, y, z + oz, rot, typeof scale === 'number' ? scale : new THREE.Vector3(...scale), opts);
    if (opts.collide) {
      const sx = (box.max.x - box.min.x) * s, sz = (box.max.z - box.min.z) * s, sy = (box.max.y - box.min.y) * (typeof scale === 'number' ? scale : scale[1]);
      const q = Math.round(rot / (Math.PI / 2)) & 1;
      const near90 = Math.abs(rot / (Math.PI / 2) - Math.round(rot / (Math.PI / 2))) < 0.08;
      const by = opts.y ?? this.terrain.heightAt(x, z);
      if (near90) {
        const hw = (q ? sz : sx) / 2, hd = (q ? sx : sz) / 2;
        return this.physics.addBoxC(x, z, hw * (opts.shrink || 1), hd * (opts.shrink || 1), by, by + sy * (opts.hFactor || 1), { kind: opts.kind || 'prop', walkable: opts.walkable ?? sy < 2.5 });
      }
      // döndürülmüş: uzunluk boyunca daireler
      const L = Math.max(sx, sz), W = Math.min(sx, sz);
      const along = sz >= sx ? [Math.sin(rot), Math.cos(rot)] : [Math.cos(rot), -Math.sin(rot)];
      const n = Math.max(1, Math.round(L / W));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        this.physics.add({ shape: 'circle', x: x + along[0] * t * L, z: z + along[1] * t * L, r: W / 2, minY: by, maxY: by + sy, kind: opts.kind || 'prop', walkable: true });
      }
    }
    return null;
  }

  container(type, x, z, opts = {}) {
    const y = (opts.y ?? this.terrain.heightAt(x, z)) + (opts.h ?? 0.8);
    const ct = { id: `w:${this.containers.length}`, type, label: opts.label, x, y, z, building: null, room: null, size: opts.size || 1, locked: opts.locked || 0, special: opts.special || null };
    const L = { dumpster: 'Çöp Konteyneri', car_trunk: 'Bagaj', trash_can: 'Çöp Kutusu', mailbox: 'Posta Kutusu', cooler: 'Soğutucu', military_crate: 'Askerî Sandık', fishing_box: 'Balıkçı Sandığı', container: 'Konteyner', backpack: 'Terk Edilmiş Çanta', tent: 'Çadır', barrel: 'Varil', crate: 'Sandık', pallet: 'Palet Yükü', tank: 'Yakıt Tankı', body: 'Ceset', cabin_chest: 'Ahşap Sandık', vending: 'Otomat' };
    ct.label = ct.label || L[type] || 'Konteyner';
    this.containers.push(ct);
    return ct;
  }

  interactable(type, x, y, z, data = {}) {
    const it = { id: `${type}:${this.interactables.length}`, type, x, y, z, ...data };
    this.interactables.push(it);
    return it;
  }

  lamp(x, y, z, kind = 'street', color = 0xffd9a0) { this.lamps.push({ x, y, z, kind, color }); }

  abandonedCar(x, z, rot, rng, crashed = false) {
    const name = rng.pick(CAR_MODELS);
    this.placeModel('vehicles', name, x, z, rot, 4.6, { collide: true, kind: 'vehicle' });
    this.container('car_trunk', x - Math.sin(rot) * 1.8, z - Math.cos(rot) * 1.8, { h: 0.7, label: crashed ? 'Kaza Yapmış Araç' : 'Terk Edilmiş Araç Bagajı' });
  }

  buildPanes() {
    const panes = this.ctx.panes;
    if (!panes.length) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(geo, materials().glass, panes.length);
    panes.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.renderOrder = 2;
    im.name = 'windowPanes';
    this.root.add(im);
    this.paneMesh = im;
    this._paneMats = panes;
  }

  setPaneVisible(index, visible) {
    if (!this.paneMesh) return;
    const m = visible ? this._paneMats[index] : new THREE.Matrix4().makeScale(0, 0, 0);
    this.paneMesh.setMatrixAt(index, m);
    this.paneMesh.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------------- dekor binalar
  decorBuildings() {
    for (const d of DECOR_BUILDINGS) {
      const rot = (d.rot || 0) * Math.PI / 2;
      this.placeModel('buildings', d.model, d.x, d.z, rot, d.s, { collide: true, kind: 'wall', walkable: false });
    }
  }

  // ----------------------------------------------------------------- sokak donanımı (lambalar, direkler)
  streetFurniture() {
    const rng = new RNG('street');
    for (const road of ROADS) {
      if (road.type !== 'asphalt' || !road.line) continue;
      const line = road.line;
      const urban = (p) => { const r = this.terrain.regionAt(p.x, p.z); return r && r.id !== 'orman'; };
      let acc = 0, side = 1, poleAcc = 0;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        const d = a.distanceTo(b);
        acc += d; poleAcc += d;
        const tx = (b.x - a.x) / d, tz = (b.z - a.z) / d;
        const nx = -tz, nz = tx;
        if (acc > 34 && urban(b)) {
          acc = 0; side = -side;
          const off = road.w / 2 + 1.0;
          const x = b.x + nx * off * side, z = b.z + nz * off * side;
          if (!this.buildingAt(x, z) && !this.physics.overlapsBox(x - 0.4, z - 0.4, x + 0.4, z + 0.4, this.terrain.heightAt(x, z), this.terrain.heightAt(x, z) + 3)) {
            // kol yola doğru: modelin -X ekseni yola baksın
            const yaw = Math.atan2(-nz * side, nx * side);
            this.instancer.place('props', 'streetlight', x, this.terrain.heightAt(x, z), z, yaw, 6);
            this.physics.add({ shape: 'circle', x, z, r: 0.18, minY: this.terrain.heightAt(x, z), maxY: this.terrain.heightAt(x, z) + 6, kind: 'prop' });
            const hx = x - nx * side * 1.15, hz = z - nz * side * 1.15;
            this.lamp(hx, this.terrain.heightAt(x, z) + 5.4, hz, 'street');
          }
        }
        // elektrik direkleri (mahalle ve kırsal ana yollar)
        if (poleAcc > 42 && !urban(b) && road.w >= 9) {
          poleAcc = 0;
          const off = road.w / 2 + 3.2;
          const x = b.x - nx * off, z = b.z - nz * off;
          if (!this.blocked(x, z, 0.5)) {
            P.powerPole(this.geo, x, this.terrain.heightAt(x, z), z, Math.atan2(-tz, tx));
            this.physics.add({ shape: 'circle', x, z, r: 0.2, minY: this.terrain.heightAt(x, z), maxY: this.terrain.heightAt(x, z) + 8, kind: 'prop' });
          }
        }
      }
    }
    void rng;
  }

  // ----------------------------------------------------------------- mahalle
  neighborhood() {
    const rng = new RNG('mahalle');
    const g = this.geo;
    const T = this.terrain;
    const home = this.home;
    // --- Ev bahçesi: çit, bahçe parselleri, jeneratör, sığınak kapağı, odun yığını, ateş çukuru
    const fx0 = -300, fx1 = -270.5, fz0 = 104, fz1 = 141.5;
    const fenceLine = (x0, z0, x1, z1, gate = null) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 2.2);
      const rot = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (gate !== null && Math.abs(i - gate) < 0.5) { this.instancer.place('props', 'fence_gate', x, T.heightAt(x, z), z, rot, 0.55); continue; }
        this.instancer.place('props', rng.chance(0.08) ? 'fence_broken' : 'fence', x, T.heightAt(x, z), z, rot, 0.55);
        const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        this.physics.addBoxC(x, z, horiz ? len / n / 2 : 0.12, horiz ? 0.12 : len / n / 2, T.heightAt(x, z), T.heightAt(x, z) + 1.2, { kind: 'fence', walkable: false });
      }
    };
    fenceLine(fx0, fz0, fx1, fz0, 6);
    fenceLine(fx0, fz0, fx0, fz1);
    fenceLine(fx1, fz0, fx1, fz1 - 6);
    // bahçe parselleri (ekim alanı)
    const plots = [];
    for (let i = 0; i < 4; i++) {
      const x = -296 + i * 3.4, z = 110;
      g.box('wood', x - 1.3, T.heightAt(x, z) - 0.1, z - 2.2, x + 1.3, T.heightAt(x, z) + 0.28, z + 2.2, '#8d6e63');
      g.box('plain', x - 1.15, T.heightAt(x, z), z - 2.05, x + 1.15, T.heightAt(x, z) + 0.31, z + 2.05, '#5d4037');
      plots.push(this.interactable('garden_plot', x, T.heightAt(x, z) + 0.3, z, { idx: i }));
    }
    this.gardenPlots = plots;
    // yağmur suyu deposu yeri, jeneratör, sığınak kapağı
    const gx = -268, gz = 137.5;
    P.generatorModel(g, gx, T.heightAt(gx, gz), gz, Math.PI / 2, true);
    this.physics.addBoxC(gx, gz, 0.5, 0.75, T.heightAt(gx, gz), T.heightAt(gx, gz) + 1.15, { kind: 'prop' });
    this.interactable('generator', gx, T.heightAt(gx, gz) + 0.9, gz, { name: 'Eski Jeneratör' });
    const bx = -284, bz = 128;
    P.bunkerHatch(g, bx, T.heightAt(bx, bz), bz);
    this.interactable('bunker', bx, T.heightAt(bx, bz) + 0.4, bz, { name: 'Bodrum Kapağı' });
    this.bunkerPos = { x: bx, z: bz };
    P.woodpile(g, -297.5, T.heightAt(-297.5, 121), 121, 0);
    this.physics.addBoxC(-297.5, 121, 0.9, 1.0, T.heightAt(-297.5, 121), T.heightAt(-297.5, 121) + 1.3, { kind: 'prop' });
    this.container('crate', -297.5, 118.5, { label: 'Odun Yığını', special: 'woodpile', h: 0.6 });
    // ateş çukuru evin arka verandasının önünde (ana menü sahnesiyle aynı yer)
    const FX = -290, FZ = 133;
    P.campfirePit(g, FX, T.heightAt(FX, FZ), FZ);
    this.interactable('campfire_pit', FX, T.heightAt(FX, FZ) + 0.3, FZ, { name: 'Ateş Çukuru' });
    this.firePit = { x: FX, z: FZ };
    for (const [lx, lz, la] of [[FX - 2.6, FZ, Math.PI / 2], [FX + 2.6, FZ, Math.PI / 2], [FX, FZ + 2.8, 0]]) P.logBench(g, lx, T.heightAt(lx, lz), lz, la);
    this.interactable('rain_spot', -272.5, T.heightAt(-272.5, 132) + 0.5, 132, { name: 'Yağmur Suyu Deposu Yeri' });
    // eve ait araç park yeri (garaj) ve eski pikap (tamir gerekli)
    const gp = home.frame.pt(21.5, 6.5);
    this.vehicleSpawns.push({ id: 'family_car', type: 'sedan', x: gp.x, z: gp.z, rot: Math.PI, fuel: 0.45, health: 0.8, owned: true });
    this.vehicleSpawns.push({ id: 'old_pickup', type: 'pickup', x: -243, z: 128, rot: 0.3, fuel: 0.1, health: 0.35, broken: true });
    // posta kutuları ve çöp kutuları ev önlerinde
    for (const b of this.buildings) {
      if (b.spec.region !== 'mahalle' || !b.tpl.label.includes('Ev')) continue;
      const fr = b.frame;
      const p = fr.pt(b.tpl.w - 1.0, b.tpl.d + 5.3);
      const n = fr.dir(0, 1);
      P.mailbox(g, p.x, T.heightAt(p.x, p.z), p.z, Math.atan2(n.x, n.z), rng.pick(['#2c3e50', '#c0392b', '#27ae60', '#2980b9']));
      this.container('mailbox', p.x, p.z, { h: 1.1 });
      const tb = fr.pt(b.tpl.w + 1.2, b.tpl.d - 1);
      this.instancer.place('props', 'trash_A', tb.x, T.heightAt(tb.x, tb.z), tb.z, rng.next() * 6, 6);
      this.container('trash_can', tb.x, tb.z, { h: 0.6 });
    }
    // park
    const px = -194, pz = 212;
    this.instancer.place('buildings', 'pavement-fountain', px, T.heightAt(px, pz), pz, 0, 9);
    this.physics.addBoxC(px, pz, 3.2, 3.2, T.heightAt(px, pz), T.heightAt(px, pz) + 1.2, { kind: 'prop', walkable: true });
    P.playground(g, -210, T.heightAt(-210, 228), 228);
    this.physics.addBoxC(-210, 226.5, 0.8, 2.4, T.heightAt(-210, 228), T.heightAt(-210, 228) + 2.2, { kind: 'prop' });
    for (const [bx2, bz2, br] of [[-186, 200, 0], [-202, 200, 0], [-180, 222, Math.PI / 2], [-176, 205, -Math.PI / 2]]) {
      this.instancer.place('props', 'bench', bx2, T.heightAt(bx2, bz2), bz2, br, 5);
      this.physics.addBoxC(bx2, bz2, br ? 0.4 : 1.0, br ? 1.0 : 0.4, T.heightAt(bx2, bz2), T.heightAt(bx2, bz2) + 0.5, { kind: 'prop' });
    }
    this.container('backpack', -199, 233, { h: 0.3, label: 'Parkta Unutulmuş Çanta' });
    // terk edilmiş arabalar mahalle sokaklarında
    for (const [cx, cz, cr] of [[-200, 166.2, Math.PI / 2 + 0.2], [-120.5, 205, 0.1], [-150, 173.8, -Math.PI / 2 + 0.1], [-236, 238, 0.05]]) this.abandonedCar(cx, cz, cr, rng, rng.chance(0.4));
    // ufak barikatlar ve çöpler
    this.instancer.place('props', 'dumpster', -58, T.heightAt(-58, 160), 160, 0, 6);
    this.physics.addBoxC(-58, 160, 1.7, 1.05, T.heightAt(-58, 160), T.heightAt(-58, 160) + 1.9, { kind: 'prop' });
    this.container('dumpster', -58, 161.5, { h: 1.0 });
    this.instancer.place('props', 'dumpster', -108, T.heightAt(-108, 181), 181, Math.PI, 6);
    this.physics.addBoxC(-108, 181, 1.7, 1.05, T.heightAt(-108, 181), T.heightAt(-108, 181) + 1.9, { kind: 'prop' });
    this.container('dumpster', -108, 179.5, { h: 1.0 });
  }

  // ----------------------------------------------------------------- şehir
  city() {
    const rng = new RNG('city');
    const T = this.terrain;
    const g = this.geo;
    // otoparklar
    const lot = (x0, z0, x1, z1) => {
      const y = T.heightAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.08;
      g.box('asphalt', x0, y - 0.1, z0, x1, y, z1, '#55555a');
      for (let x = x0 + 2.8; x < x1 - 1; x += 2.8) g.box('plain', x - 0.05, y, z0 + 0.5, x + 0.05, y + 0.01, z0 + 5.2, '#f0f0f0');
      this.physics.addFloor(x0, z0, x1, z1, y);
    };
    lot(18, -58, 52, -36);
    lot(92, -42, 120, -34);
    // park edilmiş araçlar
    for (let i = 0; i < 6; i++) if (rng.chance(0.75)) this.abandonedCar(20.2 + i * 2.8 + 1.4, -55, Math.PI + (rng.next() - 0.5) * 0.15, rng);
    this.placeModel('vehicles', 'police-car', 96, -38, 0.1, 1.65, { collide: true, kind: 'vehicle' });
    this.container('car_trunk', 96, -40.6, { h: 0.7, label: 'Polis Aracı Bagajı' });
    this.placeModel('vehicles', 'police-car', 110, -37.5, -0.2, 1.65, { collide: true, kind: 'vehicle' });
    this.vehicleSpawns.push({ id: 'police_car', type: 'police', x: 116, z: -38, rot: Math.PI / 2, fuel: 0.6, health: 0.7 });
    this.vehicleSpawns.push({ id: 'ambulance', type: 'ambulance', x: -60, z: -38, rot: Math.PI / 2, fuel: 0.35, health: 0.6 });
    this.vehicleSpawns.push({ id: 'city_van', type: 'van', x: 66, z: 30, rot: 0, fuel: 0.3, health: 0.55 });
    // kaza yapmış araç yığınları (konsept sanattaki kaotik sokaklar)
    for (const [x, z, r] of [[3, -18, 0.6], [-2, 62, 2.5], [66, -96, 1.2], [140, 5, 0.2], [143, 60, 2.9], [205, -60, 1.7], [35, 98, 1.4], [110, -102, 0.4]]) this.abandonedCar(x, z, r, rng, true);
    // çöp konteynerleri, banklar, yangın muslukları
    for (const [x, z, r] of [[55, -88, 0], [128, -64, 0], [12, 4, Math.PI / 2], [60, 12, 0], [150, 30, 0], [176, -36, 0], [-60, -20, 0]]) {
      this.instancer.place('props', 'dumpster', x, T.heightAt(x, z), z, r, 6);
      this.physics.addBoxC(x, z, r ? 1.05 : 1.7, r ? 1.7 : 1.05, T.heightAt(x, z), T.heightAt(x, z) + 1.9, { kind: 'prop' });
      this.container('dumpster', x, z + (r ? 0 : 1.5), { h: 1.0 });
    }
    for (const [x, z] of [[6, -40], [64, -36], [76, -24], [134, -24], [146, 32], [204, 32], [6, 44], [64, 44]]) {
      this.instancer.place('props', 'firehydrant', x, T.heightAt(x, z), z, 0, 5);
      this.physics.add({ shape: 'circle', x, z, r: 0.3, minY: T.heightAt(x, z), maxY: T.heightAt(x, z) + 1.0, kind: 'prop' });
    }
    // trafik ışıkları kavşaklarda
    for (const x of [0, 70, 140, 210]) for (const z of [-100, -30, 38]) {
      const tx = x + 6.2, tz = z + 6.2;
      this.instancer.place('props', 'trafficlight_A', tx, T.heightAt(tx, tz), tz, rng.next() < 0.5 ? 0 : Math.PI / 2, 5);
      this.physics.add({ shape: 'circle', x: tx, z: tz, r: 0.2, minY: T.heightAt(tx, tz), maxY: T.heightAt(tx, tz) + 3.5, kind: 'prop' });
    }
    // otobüs durakları
    P.busStop(g, 30, T.heightAt(30, 32), 32.5, Math.PI);
    P.busStop(g, 160, T.heightAt(160, -24), -23.5, 0);
    // şehir meydanı: çeşme + ağaç saksıları
    this.instancer.place('buildings', 'pavement-fountain', 35, T.heightAt(35, 55), 55, 0, 10);
    this.physics.addBoxC(35, 55, 3.6, 3.6, T.heightAt(35, 55), T.heightAt(35, 55) + 1.3, { kind: 'prop', walkable: true });
    // polis barikatları
    P.sandbags(g, 96, -30.5, 114, -30.5, T.heightAt(105, -31), 1.0);
    // hastane önü ambulans
    this.placeModel('vehicles', 'ambulance', -60, -52, Math.PI / 2 + 0.2, 1.7, { collide: true, kind: 'vehicle' });
    this.container('car_trunk', -62, -52, { h: 0.8, label: 'Ambulans Arkası', special: 'ambulance' });
    // tahliye kalıntıları: askerî çadırlar ve sandıklar hastane önünde
    this.instancer.place('props', 'decoration-tents', -48, T.heightAt(-48, -12), -12, 0.4, 1.0);
    this.container('medical_cart', -46, -8, { h: 0.8, label: 'Tahliye Sağlık Sandığı' });
  }

  gasStation() {
    const g = this.geo, T = this.terrain;
    const cx = 60, cz = 300;
    const y = T.heightAt(cx, cz);
    P.gasCanopy(g, cx, y, cz, 0);
    for (const [dx, dz] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) {
      const x = cx + dx, z = cz + dz;
      P.fuelPump(g, x, y, z, 0);
      this.physics.addBoxC(x, z, 0.5, 0.35, y, y + 1.9, { kind: 'prop' });
      this.interactable('fuel_pump', x, y + 1.2, z + 0.6, { name: 'Yakıt Pompası' });
    }
    for (const [dx, dz] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) this.physics.add({ shape: 'circle', x: cx + dx, z: cz + dz, r: 0.3, minY: y, maxY: y + 5.2, kind: 'prop' });
    this.lamp(cx, y + 5, cz, 'canopy', 0xfff3d6);
    // tabela direği
    g.box('metal', 104, y, 288, 104.4, y + 7, 288.4, '#7f8c8d');
    const signMat = new THREE.MeshStandardMaterial({ map: signTexture('AKARYAKIT', '#e67e22', '#ffffff'), emissive: 0xffffff, emissiveMap: signTexture('AKARYAKIT', '#e67e22', '#ffffff'), emissiveIntensity: 0.0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), signMat);
    sign.position.set(104.2, y + 7.5, 288.21); sign.rotation.y = 0; sign.name = 'sign';
    const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = 288.19;
    this.root.add(sign, sign2);
    this.extraSigns = [signMat];
    // yakıt tankeri (dekor + yakıt kaynağı)
    this.placeModel('vehicles', 'truck-flat', 30, 296, Math.PI / 2, 1.8, { collide: true, kind: 'vehicle' });
    g.cylinder('metal', 27, y + 1.5, 296, 1.1, 0.01, '#bdc3c7', 6, false);
    this.container('tank', 33, 298.5, { h: 1.0, label: 'Terk Edilmiş Tanker', special: 'fuel' });
    this.abandonedCar(80, 296, 0.3, new RNG('gas1'), false);
    this.abandonedCar(44, 307, Math.PI / 2 + 0.2, new RNG('gas2'), true);
    this.container('cooler', 76.5, 312.8, { h: 0.6, label: 'Buz Dolabı (Dondurma)' });
  }

  industrial() {
    const g = this.geo, T = this.terrain, rng = new RNG('ind');
    for (const [x, z] of [[30, -268], [44, -268], [58, -268]]) {
      const y = T.heightAt(x, z);
      P.fuelTank(g, x, y, z, 4.2, 8);
      this.physics.add({ shape: 'circle', x, z, r: 4.3, minY: y, maxY: y + 8, kind: 'prop', walkable: true });
    }
    this.container('tank', 44, -262.5, { h: 1.2, label: 'Yakıt Tankı Vanası', special: 'fuel' });
    // konteyner yığınları
    const cols = ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d3c98', '#566573'];
    let k = 0;
    for (const [x, z, a] of [[100, -360, 0], [100, -357, 0], [114, -360, 0], [170, -360, Math.PI / 2], [176, -345, Math.PI / 2], [176, -330, Math.PI / 2]]) {
      const y = T.heightAt(x, z);
      P.shippingContainer(g, x, y, z, a, cols[k++ % cols.length]);
      const q = Math.abs(Math.sin(a)) > 0.5;
      this.physics.addBoxC(x, z, q ? 1.22 : 3.05, q ? 3.05 : 1.22, y, y + 2.6, { kind: 'prop', walkable: true });
      if (rng.chance(0.6)) this.container('container', x + (q ? 1.4 : 3.2), z, { h: 1.0, label: 'Konteyner' });
    }
    P.crane(g, 132, T.heightAt(132, -290), -290, Math.PI, 20, 16, '#f1c40f');
    this.physics.addBoxC(132, -290, 1, 1, T.heightAt(132, -290), T.heightAt(132, -290) + 20, { kind: 'prop' });
    for (let i = 0; i < 6; i++) {
      const x = 40 + rng.next() * 120, z = -312 + rng.next() * 6;
      if (this.buildingAt(x, z) || onRoad(x, z, 1)) continue;
      this.instancer.place('props', rng.pick(['Barrel_A', 'Barrel_B', 'Barrel_C']), x, T.heightAt(x, z) + 0.45, z, rng.next() * 6, 0.9);
      this.physics.add({ shape: 'circle', x, z, r: 0.45, minY: T.heightAt(x, z), maxY: T.heightAt(x, z) + 0.95, kind: 'prop', walkable: true });
      this.container('barrel', x, z, { h: 0.9 });
    }
    this.vehicleSpawns.push({ id: 'offroad', type: 'offroad', x: 168, z: -288, rot: Math.PI, fuel: 0.2, health: 0.4, broken: true });
    this.vehicleSpawns.push({ id: 'motorcycle', type: 'motorcycle', x: 150, z: -262, rot: 0, fuel: 0.5, health: 0.75 });
    this.placeModel('vehicles', 'delivery-truck', 92, -318, Math.PI / 2, 1.8, { collide: true, kind: 'vehicle' });
    this.container('car_trunk', 88, -318, { h: 1.0, label: 'Kamyon Kasası' });
    this.placeModel('vehicles', 'tractor', 20, -340, 0.4, 1.7, { collide: true, kind: 'vehicle' });
  }

  military() {
    const g = this.geo, T = this.terrain, reg = REGION_BY_ID.askeri;
    const [x0, z0, x1, z1] = [270, -320, 420, -176];
    const y = reg.h;
    const wall = (ax, az, bx, bz) => {
      P.concreteWall(g, ax, az, bx, bz, y, 3.2, 0.5);
      const minX = Math.min(ax, bx) - 0.25, maxX = Math.max(ax, bx) + 0.25, minZ = Math.min(az, bz) - 0.25, maxZ = Math.max(az, bz) + 0.25;
      this.physics.addBox(minX, minZ, maxX, maxZ, y - 1, y + 3.6, { kind: 'wall', walkable: false });
    };
    // kuzey duvarında köprü kapısı (x 398..414)
    wall(x0, z0, 398, z0); wall(414, z0, x1, z0); wall(x0, z1, x1, z1); wall(x1, z0, x1, z1);
    P.barrierArm(g, 398, y, z0, 0);
    this.bridge();
    wall(x0, z0, x0, -256); wall(x0, -240, x0, z1);
    P.barrierArm(g, x0, y, -256, -Math.PI / 2);
    for (const [tx, tz] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) {
      P.watchTower(g, tx, y, tz, 6);
      for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) this.physics.add({ shape: 'circle', x: tx + dx, z: tz + dz, r: 0.15, minY: y, maxY: y + 6, kind: 'prop' });
      this.physics.addFloor(tx - 1.7, tz - 1.7, tx + 1.7, tz + 1.7, y + 6.15);
      this.interactable('ladder', tx + 1.5, y + 3, tz, { top: y + 6.15, bottom: y, name: 'Gözetleme Kulesi' });
      this.lamp(tx, y + 7.5, tz, 'flood', 0xeaf2ff);
    }
    P.helipad(g, 366, y, -248);
    this.physics.addFloor(357, -257, 375, -239, y + 0.13);
    this.interactable('helipad', 366, y + 0.5, -248, { name: 'Helikopter Pisti' });
    P.sandbags(g, 282, -262, 282, -234, y, 1.1);
    P.sandbags(g, 300, -268, 314, -268, y, 1.0);
    P.sandbags(g, 300, -228, 314, -228, y, 1.0);
    this.physics.addBox(281.6, -262, 282.4, -234, y, y + 1.1, { kind: 'prop' });
    for (const [tx, tz, a] of [[345, -275, 0], [345, -220, Math.PI]]) this.instancer.place('props', 'decoration-tents', tx, y, tz, a, 1.0);
    for (const [x, z] of [[330, -240], [335, -258], [312, -248]]) {
      P.shippingContainer(g, x, y, z, 0, '#556b2f', 4);
      this.physics.addBoxC(x, z, 2, 1.22, y, y + 2.6, { kind: 'prop', walkable: true });
      this.container('military_crate', x + 2.3, z, { h: 0.9 });
    }
    this.vehicleSpawns.push({ id: 'military_truck', type: 'military', x: 300, z: -248, rot: Math.PI / 2, fuel: 0.7, health: 0.9 });
    this.vehicleSpawns.push({ id: 'armored_van', type: 'armored', x: 400, z: -250, rot: -Math.PI / 2, fuel: 0.25, health: 0.5, broken: true });
  }

  /** Anakaraya köprü (araçla kaçış finali): askerî bölgenin kuzey kapısından kuzeydoğuya */
  bridge() {
    const g = this.geo, y = BRIDGE.deck;
    const S0 = BRIDGE.start, E0 = BRIDGE.end;
    const dx = E0.x - S0.x, dz = E0.z - S0.z, L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L; // ileri
    const a = Math.atan2(ux, uz);
    const deck = y + 0.25;
    const W = 4.6; // yarı genişlik
    // tabliye, kaldırımlar, korkuluk
    P.rbox(g, 'asphalt', S0.x, deck, S0.z, a, -W, -0.7, -2, W, 0, L, '#4b4d52');
    for (const sd of [-1, 1]) {
      P.rbox(g, 'concrete', S0.x, deck, S0.z, a, sd > 0 ? W - 0.6 : -W, 0, -2, sd > 0 ? W : -W + 0.6, 0.25, L, '#b9b5a5');
      P.rbox(g, 'metal', S0.x, deck, S0.z, a, sd * (W - 0.15) - 0.06, 1.05, -2, sd * (W - 0.15) + 0.06, 1.15, L, '#c0392b');
      for (let t = 0; t <= L; t += 3) P.rbox(g, 'metal', S0.x, deck, S0.z, a, sd * (W - 0.15) - 0.07, 0.25, t - 0.07, sd * (W - 0.15) + 0.07, 1.1, t + 0.07, '#7f8c8d');
    }
    // şerit çizgisi ve ayaklar (denize kadar)
    for (let t = 2; t < L; t += 6) P.rbox(g, 'plain', S0.x, deck, S0.z, a, -0.1, 0.01, t, 0.1, 0.02, t + 3, '#f5f5f5');
    for (let t = 24; t < L; t += 24) P.rbox(g, 'concrete', S0.x, deck, S0.z, a, -3.2, -deck - 12, t - 0.9, 3.2, -0.7, t + 0.9, '#9a968a');
    // köprü sonu: anakara tabelası + yıkık bölüm önünde beton bariyer (kaçış bölgesi bitişi)
    P.rbox(g, 'metal', E0.x, deck, E0.z, a, -3, 2.4, -1, 3, 3.6, -0.9, '#1e6b3a');
    P.rbox(g, 'concrete', S0.x, deck, S0.z, a, -W, 0, L - 0.4, W, 1.1, L + 0.6, '#d9d4c3');
    for (let k = -W; k <= W; k += 0.8) {
      const bx = S0.x + ux * L - uz * k, bz = S0.z + uz * L + ux * k;
      this.physics.addBoxC(bx, bz, 0.5, 0.5, deck, deck + 1.2, { kind: 'wall', walkable: false });
    }
    // çarpışma: eğik şerit, eksen hizalı küçük zemin karolarıyla
    // (karo aralığı ≤ 1 m ve yarı boyut 3.6 m: korkuluğa kadar boşluksuz kaplar)
    for (let t = -2; t <= L; t += 1.0) {
      const px = S0.x + ux * t, pz = S0.z + uz * t;
      this.physics.addFloor(px - 3.6, pz - 3.6, px + 3.6, pz + 3.6, deck, { kind: 'floor', bridge: true });
    }
    for (let t = 0; t <= L; t += 0.8) {
      const px = S0.x + ux * t, pz = S0.z + uz * t;
      for (const sd of [-1, 1]) {
        const rx = px - uz * sd * (W - 0.1), rz = pz + ux * sd * (W - 0.1);
        this.physics.addBoxC(rx, rz, 0.45, 0.45, deck, deck + 1.2, { kind: 'wall', walkable: false });
      }
    }
    // lambalar
    for (let t = 15; t < L; t += 30) for (const sd of [-1, 1]) {
      const lx = S0.x + ux * t - uz * sd * (W - 0.3), lz = S0.z + uz * t + ux * sd * (W - 0.3);
      P.rbox(g, 'metal', lx, deck, lz, a, -0.08, 0, -0.08, 0.08, 6, 0.08, '#555');
      this.lamp(lx, deck + 6, lz, 'street');
    }
    this.interactable('bridge_end', E0.x, deck + 1, E0.z, { name: 'Anakaraya Köprü' });
  }

  port() {
    const g = this.geo, T = this.terrain, rng = new RNG('port');
    const y = REGION_BY_ID.liman.h;
    for (const [x, len, w] of [[300, 34, 4], [336, 46, 6], [372, 30, 4]]) {
      P.dock(g, x, 344, y, len, w, 0);
      this.physics.addFloor(x - w / 2, 344, x + w / 2, 344 + len, y);
    }
    // iskele sonu: tekne (deniz yoluyla kaçış)
    this.vehicleSpawns.push({ id: 'boat', type: 'boat', x: 345, z: 380, rot: Math.PI, fuel: 0.0, health: 0.45, broken: true, water: true });
    this.interactable('boat_dock', 340, y + 0.4, 384, { name: 'Tekne Rıhtımı' });
    this.placeModel('props', 'ship-wreck', 420, 420, 0.6, 2.5, { y: -1.0 });
    const cols = ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#7d3c98', '#d35400'];
    let k = 0;
    for (const [x, z, st] of [[322, 308, 2], [322, 311, 1], [336, 308, 1], [352, 312, 2], [366, 312, 1], [380, 300, 1], [292, 312, 1]]) {
      for (let s = 0; s < st; s++) {
        P.shippingContainer(g, x, y + s * 2.6, z, 0, cols[k++ % cols.length]);
      }
      this.physics.addBoxC(x, z, 3.05, 1.22, y, y + st * 2.6, { kind: 'prop', walkable: true });
      if (rng.chance(0.7)) this.container('container', x + 3.3, z, { h: 1.0, label: 'Liman Konteyneri' });
    }
    P.crane(g, 395, y, 345, -Math.PI / 2, 24, 22, '#e74c3c');
    this.physics.addBoxC(395, 345, 1, 1, y, y + 24, { kind: 'prop' });
    this.container('fishing_box', 300, 352, { y, h: 0.5, label: 'Balıkçı Sandığı' });
    this.container('fishing_box', 372, 360, { y, h: 0.5, label: 'Balık Ağları' });
    this.interactable('fishing_spot', 336, y + 0.3, 388, { name: 'Balık Tutma Noktası (Deniz)', water: 'sea' });
    this.interactable('fishing_spot', 300, y + 0.3, 376, { name: 'Balık Tutma Noktası (Deniz)', water: 'sea' });
  }

  lab() {
    const g = this.geo, T = this.terrain;
    const y = REGION_BY_ID.lab.h;
    const [x0, z0, x1, z1] = [-62, -482, 22, -410];
    P.chainFence(g, x0, z0, x1, z0, y); P.chainFence(g, x0, z0, x0, z1, y); P.chainFence(g, x1, z0, x1, z1, y);
    P.chainFence(g, x0, z1, -26, z1, y); P.chainFence(g, -14, z1, x1, z1, y);
    for (const [a, b, c, d] of [[x0, z0, x1, z0], [x0, z0, x0, z1], [x1, z0, x1, z1], [x0, z1, -26, z1], [-14, z1, x1, z1]]) {
      this.physics.addBox(Math.min(a, c) - 0.1, Math.min(b, d) - 0.1, Math.max(a, c) + 0.1, Math.max(b, d) + 0.1, y - 1, y + 2.6, { kind: 'fence', walkable: false, blocksSight: false, blocksBullets: false });
    }
    // güvenlik kapısı (kart gerekli)
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x5b2c6f, metalness: 0.5, roughness: 0.4 });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 0.15), gateMat);
    gate.position.set(-20, y + 1.2, z1);
    gate.name = 'lab_gate';
    this.root.add(gate);
    this.labGate = { mesh: gate, collider: this.physics.addBox(-26, z1 - 0.15, -14, z1 + 0.15, y - 1, y + 2.6, { kind: 'door', walkable: false }), open: false };
    this.interactable('lab_gate', -20, y + 1.2, z1 + 0.6, { name: 'Laboratuvar Güvenlik Kapısı' });
    P.satelliteDish(g, 2, y, -470);
    this.physics.add({ shape: 'circle', x: 2, z: -470, r: 0.4, minY: y, maxY: y + 2.4, kind: 'prop' });
    this.lamp(-20, y + 3, z1 - 2, 'flood', 0xd7bde2);
  }

  forest() {
    const g = this.geo, T = this.terrain, rng = new RNG('forest');
    // kamp alanı
    const cx = -232, cz = -26;
    this.instancer.place('props', 'decoration-tents', cx, T.heightAt(cx, cz), cz, 0.3, 0.8);
    P.campfirePit(g, cx + 6, T.heightAt(cx + 6, cz + 4), cz + 4);
    this.interactable('campfire_pit', cx + 6, T.heightAt(cx + 6, cz + 4) + 0.3, cz + 4, { name: 'Kamp Ateşi' });
    this.container('tent', cx - 2, cz + 2, { h: 0.5, label: 'Terk Edilmiş Çadır' });
    this.container('cooler', cx + 3, cz - 3, { h: 0.5, label: 'Kamp Soğutucusu' });
    this.container('backpack', cx + 8, cz + 1, { h: 0.3, label: 'Kampçının Çantası', special: 'diary_camp' });
    // mağara
    const kx = -300, kz = -196;
    P.caveRocks(g, kx, T.heightAt(kx, kz), kz);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * 0.1 + (i / 10) * Math.PI * 1.8;
      const px = kx + Math.cos(a) * 6, pz = kz - Math.sin(a) * 6;
      this.physics.addBoxC(px, pz, 1.8, 1.8, T.heightAt(kx, kz) - 0.5, T.heightAt(kx, kz) + 4, { kind: 'rock', walkable: false });
    }
    this.physics.addBoxC(kx, kz - 1, 7, 6, T.heightAt(kx, kz) + 4, T.heightAt(kx, kz) + 5.5, { kind: 'rock', walkable: true, blocksNav: false });
    this.container('cabin_chest', kx, kz - 2.5, { h: 0.5, label: 'Gizli Zula', special: 'cave_stash' });
    // göl iskelesi ve sandal
    const lx = LAKE.x + LAKE.r - 2, lz = LAKE.z + 6;
    P.dock(g, lx, lz, LAKE.level + 0.35, 10, 2.4, -Math.PI / 2);
    this.physics.addFloor(lx - 10, lz - 1.2, lx, lz + 1.2, LAKE.level + 0.35);
    this.interactable('fishing_spot', lx - 9, LAKE.level + 0.6, lz, { name: 'Balık Tutma Noktası (Göl)', water: 'lake' });
    this.placeModel('vehicles', 'boat-small', lx - 6, lz + 2.6, 0, 3, { y: LAKE.level - 0.2 });
    // avcı kulesi
    P.watchTower(g, -120, T.heightAt(-120, -205), -205, 4);
    this.physics.addFloor(-121.7, -206.7, -118.3, -203.3, T.heightAt(-120, -205) + 4.15);
    this.interactable('ladder', -118.5, T.heightAt(-120, -205) + 2, -205, { top: T.heightAt(-120, -205) + 4.15, bottom: T.heightAt(-120, -205), name: 'Avcı Kulesi' });
    // dağ kampı: gözetleme kulesi, kaynak suyu, çadırlar
    const mx = -340, mz = -322;
    P.lookout(g, mx + 14, T.heightAt(mx + 14, mz), mz);
    this.physics.addFloor(mx + 12.3, mz - 1.7, mx + 15.7, mz + 1.7, T.heightAt(mx + 14, mz) + 7.15);
    this.interactable('ladder', mx + 15.5, T.heightAt(mx + 14, mz) + 3, mz, { top: T.heightAt(mx + 14, mz) + 7.15, bottom: T.heightAt(mx + 14, mz), name: 'Dağ Gözetleme Kulesi' });
    this.instancer.place('props', 'decoration-tents', mx + 4, T.heightAt(mx + 4, mz - 14), mz - 14, 1.2, 0.7);
    this.interactable('water_spring', mx - 12, T.heightAt(mx - 12, mz + 10) + 0.3, mz + 10, { name: 'Temiz Su Kaynağı' });
    g.cylinder('concrete', mx - 12, T.heightAt(mx - 12, mz + 10), mz + 10, 0.9, 0.5, '#8d8a85', 10);
    g.cylinder('shiny', mx - 12, T.heightAt(mx - 12, mz + 10) + 0.45, mz + 10, 0.75, 0.06, '#7fb3d5', 10, false);
    this.interactable('mountain_camp', mx, T.heightAt(mx, mz) + 0.5, mz, { name: 'Dağ Kampı Hazırlık Noktası' });
    // ormanda terk edilmiş araç ve çanta
    this.abandonedCar(-280, -110, 1.1, rng, true);
    this.container('backpack', -150, -180, { h: 0.3, label: 'Araştırma Ekibinin Çantası', special: 'research_trace' });
    this.container('body', -95, -300, { h: 0.3, label: 'Askerin Cesedi', special: 'soldier_body' });
  }

  manualTrees() {
    const v = this.vegetation, rng = new RNG('mtrees');
    // mahalle: bahçe ağaçları ve park
    for (const [x, z, t] of [[-215, 186, 'oak'], [-170, 236, 'oak2'], [-222, 238, 'birch'], [-165, 190, 'autumn'], [-200, 245, 'oak'], [-182, 242, 'pine'],
      [-300, 112, 'oak2'], [-273, 106, 'birch'], [-245, 140, 'oak'], [-230, 120, 'pine'], [-130, 130, 'oak'], [-90, 125, 'birch'], [-80, 215, 'oak2'], [-50, 205, 'autumn'],
      [-140, 250, 'oak'], [-270, 255, 'oak2'], [-310, 200, 'pine'], [-60, 125, 'oak']]) v.add(t, x, z, rng.next() * 6, 0.9 + rng.next() * 0.3);
    for (let i = 0; i < 26; i++) {
      const x = -310 + rng.next() * 270, z = 82 + rng.next() * 185;
      if (onRoad(x, z, 2) || this.blocked(x, z, 1.5)) continue;
      v.add(rng.chance(0.5) ? 'flowerBush' : 'bush', x, z, rng.next() * 6, 0.7 + rng.next() * 0.5);
    }
    // şehir: ağaç sıraları
    for (const z of [-26, 34]) for (let x = 12; x < 205; x += 14) { if (!onRoad(x, z + 2, 0.5) && !this.blocked(x, z + 2, 1)) v.add('oak2', x, z + 2, rng.next() * 6, 0.75); }
    void REGIONS;
  }

  signposts() {
    const g = this.geo, T = this.terrain;
    for (const s of SIGNPOSTS) {
      const y = T.heightAt(s.x, s.z);
      P.signpost(g, s.x, y, s.z);
      this.physics.add({ shape: 'circle', x: s.x, z: s.z, r: 0.2, minY: y, maxY: y + 3, kind: 'prop' });
      s.lines.forEach((text, i) => {
        const tex = signTexture(text, '#8b5a2b', '#f6e7c8', 512, 96);
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.48, 0.08), [
          new THREE.MeshStandardMaterial({ color: 0x7a4f2a }), new THREE.MeshStandardMaterial({ color: 0x7a4f2a }), new THREE.MeshStandardMaterial({ color: 0x7a4f2a }),
          new THREE.MeshStandardMaterial({ color: 0x7a4f2a }), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex }),
        ]);
        m.position.set(s.x, y + 2.9 - i * 0.55, s.z);
        m.rotation.y = s.rot + (i % 2 ? 0.25 : -0.1);
        m.rotation.z = (i % 2 ? 0.03 : -0.04);
        m.translateX(1.1);
        m.castShadow = true;
        this.root.add(m);
      });
    }
  }
}

export { WORLD };
