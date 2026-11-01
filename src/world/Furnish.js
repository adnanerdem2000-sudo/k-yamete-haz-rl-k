// Oda döşeme: oda türüne göre mobilya (KayKit CC0 modelleri + prosedürel parçalar)
// ve yağmalanabilir konteynerler. Konteyner türü loot tablosunu belirler (data/loot.js).
import * as THREE from 'three';

const KK = 0.7; // KayKit mobilya ölçeği
const WALL_GAP = 0.14;
const PI = Math.PI;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

export const CONTAINER_LABELS = {
  fridge: 'Buzdolabı', kitchen_cabinet: 'Mutfak Dolabı', wardrobe: 'Gardırop', nightstand: 'Komodin', dresser: 'Şifonyer', bookshelf: 'Kitaplık',
  desk: 'Masa Çekmecesi', bathroom_cabinet: 'Ecza Dolabı', toolbox: 'Alet Kutusu', garage_shelf: 'Garaj Rafı', crate: 'Sandık', shelf_food: 'Gıda Rafı',
  shelf_drinks: 'İçecek Dolabı', shelf_medical: 'İlaç Rafı', shelf_tools: 'Hırdavat Rafı', shelf_clothes: 'Kıyafet Rafı', shelf_electronics: 'Elektronik Rafı',
  shelf_sports: 'Kamp & Spor Rafı', register: 'Kasa', locker: 'Dolap', weapon_locker: 'Silah Dolabı', ammo_crate: 'Mühimmat Sandığı',
  medical_cart: 'Tıbbi Malzeme Arabası', lab_bench: 'Laboratuvar Tezgâhı', filing_cabinet: 'Dosya Dolabı', safe: 'Çelik Kasa', dumpster: 'Çöp Konteyneri',
  car_trunk: 'Bagaj', barrel: 'Varil', trash_can: 'Çöp Kutusu', cooler: 'Soğutucu', fishing_box: 'Balıkçı Sandığı', military_crate: 'Askerî Sandık',
  parts_shelf: 'Yedek Parça Rafı', vending: 'Otomat', pallet: 'Palet Yükü', server: 'Sunucu Kabini', radio_desk: 'Telsiz Masası', stove: 'Ocak',
  cabin_chest: 'Ahşap Sandık', mailbox: 'Posta Kutusu', workbench: 'Çalışma Tezgâhı', counter: 'Tezgâh', shelf_build: 'Malzeme Rafı', backpack: 'Terk Edilmiş Çanta',
  body: 'Ceset', tent: 'Çadır', cart: 'Alışveriş Arabası', container: 'Konteyner', tank: 'Yakıt Tankı', toolwall: 'Alet Panosu',
};

// ----------------------------------------------------------------------- yerleştirme yardımcıları

function sidesOf(r) {
  return [
    { n: 'B', axis: 'x', c: r.z0, s: r.x0, e: r.x1, inx: 0, inz: 1, rot: 0 },
    { n: 'F', axis: 'x', c: r.z1, s: r.x0, e: r.x1, inx: 0, inz: -1, rot: PI },
    { n: 'L', axis: 'z', c: r.x0, s: r.z0, e: r.z1, inx: 1, inz: 0, rot: PI / 2 },
    { n: 'R', axis: 'z', c: r.x1, s: r.z0, e: r.z1, inx: -1, inz: 0, rot: -PI / 2 },
  ];
}

class RoomPlacer {
  constructor(r, c) {
    this.r = r; this.c = c;
    this.sides = sidesOf(r);
    for (const sd of this.sides) {
      sd.doors = c.doorOps.filter((o) => o.axis === sd.axis && Math.abs(o.c - sd.c) < 0.2 && o.e > sd.s && o.s < sd.e);
      sd.wins = c.winOps.filter((o) => o.axis === sd.axis && Math.abs(o.c - sd.c) < 0.2 && o.e > sd.s && o.s < sd.e);
      sd.used = [];
    }
    this.centerUsed = [];
  }

  /** Duvar boyunca width genişliğinde yer bul. Dönüş: {sd, at} */
  alloc(width, tall, prefer = null, depth = 0.6) {
    const order = prefer ? this.sides.filter((s) => prefer.includes(s.n)) : [...this.sides];
    if (!prefer) this.c.rng.shuffle(order);
    for (const sd of order) {
      const lo = sd.s + 0.14 + (this._cornerPad(sd, 'lo', depth)), hi = sd.e - 0.14 - this._cornerPad(sd, 'hi', depth);
      const blocks = [];
      for (const d of sd.doors) blocks.push([d.s - 0.55, d.e + 0.55]);
      if (tall) for (const w of sd.wins) blocks.push([w.s - 0.05, w.e + 0.05]);
      for (const u of sd.used) blocks.push(u);
      blocks.sort((a, b) => a[0] - b[0]);
      let cur = lo;
      for (const [a, b] of [...blocks, [hi, hi]]) {
        if (a - cur >= width) {
          const at = cur + width / 2;
          sd.used.push([at - width / 2 - 0.05, at + width / 2 + 0.05]);
          return { sd, at };
        }
        cur = Math.max(cur, b);
        if (cur > hi) break;
      }
    }
    return null;
  }

  _cornerPad(sd, end, depth) {
    // komşu duvarlara yaslanmış eşyalarla çakışmayı azaltmak için köşe payı
    return 0.0 * depth;
  }

  /** Duvar yerleşimi → şablon koordinatı (eşya merkezi) */
  wallPos(slot, depth) {
    const { sd, at } = slot;
    const off = WALL_GAP + depth / 2;
    if (sd.axis === 'x') return { x: at, z: sd.c + sd.inz * off, rot: sd.rot };
    return { x: sd.c + sd.inx * off, z: at, rot: sd.rot };
  }

  /** Oda merkezinde dikdörtgen alan uygun mu (kapı önlerine taşmasın) */
  centerFree(x0, z0, x1, z1) {
    const r = this.r;
    if (x0 < r.x0 + 0.9 || x1 > r.x1 - 0.9 || z0 < r.z0 + 0.9 || z1 > r.z1 - 0.9) return false;
    for (const sd of this.sides) for (const d of sd.doors) {
      // kapı önü 1.3 m
      let bx0, bx1, bz0, bz1;
      if (sd.axis === 'x') { bx0 = d.s - 0.3; bx1 = d.e + 0.3; bz0 = sd.c - 1.4; bz1 = sd.c + 1.4; } else { bz0 = d.s - 0.3; bz1 = d.e + 0.3; bx0 = sd.c - 1.4; bx1 = sd.c + 1.4; }
      if (x1 > bx0 && x0 < bx1 && z1 > bz0 && z0 < bz1) return false;
    }
    for (const u of this.centerUsed) if (x1 > u[0] && x0 < u[2] && z1 > u[1] && z0 < u[3]) return false;
    this.centerUsed.push([x0, z0, x1, z1]);
    return true;
  }
}

/** Instancer'a KayKit/Kenney modeli ekle (şablon koordinatı) */
function model(c, kit, name, tx, ty, tz, rot, scale, variant = null) {
  const p = c.fr;
  const sc = typeof scale === 'number' ? _s.set(scale, scale, scale) : _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_p.set(tx, ty, tz), _q.setFromAxisAngle(_Y, rot), sc);
  const world = new THREE.Matrix4().multiplyMatrices(p.matrix, _m);
  c.ctx.instancer.add(kit, name, world, { interior: true, variant });
}

/** Eşyanın çarpışma kutusu (şablon koordinatlarında merkez + yarı boyut, dönüş 90°'nin katı) */
function collide(c, tx, tz, w, d, rot, h, opts = {}) {
  const q = Math.round(rot / (PI / 2)) & 1;
  const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
  const wb = c.fr.box(tx - hw, tz - hd, tx + hw, tz + hd);
  const y0 = c.baseY + c.F + (opts.y0 || 0);
  const col = c.ctx.physics.addBox(wb.minX, wb.minZ, wb.maxX, wb.maxZ, y0, y0 + h, { kind: 'prop', owner: c.B, walkable: h < 1.3 && opts.walkable !== false, blocksSight: h > 1.5, blocksBullets: h > 0.9 });
  c.B.colliders.push(col);
  return col;
}

/** Yağmalanabilir konteyner kaydı */
function container(c, type, tx, tz, h = 0.8, opts = {}) {
  const wp = c.fr.pt(tx, tz);
  const ct = {
    id: `${c.B.id}:${c.B.containers.length}`, type, label: opts.label || CONTAINER_LABELS[type] || 'Konteyner',
    x: wp.x, y: c.baseY + c.F + h, z: wp.z, building: c.B.id, room: c.curRoom, size: opts.size || 1, locked: opts.locked || 0, special: opts.special || null,
  };
  // açılır ön yüzler (Fronts/Drawers) için mobilyanın dünya yönü (yerel +Z ön yüz), ölçüleri, zemin yüksekliği, modeli
  // ve rengi. Kayda girmez (yağma durumu kimlikle saklanır): kayıt biçimi değişmez.
  if (opts.frame) {
    const f = opts.frame;
    ct.yaw = c.fr.angle(f.rot); ct.fw = f.w; ct.fd = f.d; ct.fh = f.h; ct.fy = c.baseY + c.F;
    if (f.model) ct.fmodel = f.model;
    if (opts.frontColor) ct.fcol = opts.frontColor;
  }
  c.B.containers.push(ct);
  c.ctx.containers.push(ct);
  return ct;
}

function furniture(c, P, kit, name, w, d, h, opts = {}) {
  const slot = P.alloc(w, h > 1.0, opts.prefer, d);
  if (!slot) return null;
  const pos = P.wallPos(slot, d);
  model(c, kit, name, pos.x + (opts.dx || 0), c.F + (opts.y || 0), pos.z + (opts.dz || 0), pos.rot + (opts.rotOff || 0), opts.scale || KK, opts.variant || null);
  if (opts.collide !== false) collide(c, pos.x, pos.z, w, d, pos.rot, h, { walkable: opts.walkable });
  if (opts.container) container(c, opts.container, pos.x + Math.sin(pos.rot) * 0.0, pos.z, Math.min(h, 1.2), { label: opts.label, size: opts.size, frame: { rot: pos.rot + (opts.rotOff || 0), w, d, h, model: name } });
  return { ...pos, slot };
}

/** Prosedürel kutu tabanlı eşya: geo'ya yerleştirilir (döndürülmüş yerel koordinatlarla) */
function pbox(c, cx, cz, rot, lx0, y0, lz0, lx1, y1, lz1, mat, color) {
  // yerel kutu (eşya merkezli) → şablon koordinatı (90° adım)
  const q = ((Math.round(rot / (PI / 2)) % 4) + 4) % 4;
  const tr = (x, z) => {
    switch (q) { case 1: return [z, -x]; case 2: return [-x, -z]; case 3: return [-z, x]; default: return [x, z]; }
  };
  const [ax, az] = tr(lx0, lz0), [bx, bz] = tr(lx1, lz1);
  c.geo.box(mat, cx + Math.min(ax, bx), c.F + y0, cz + Math.min(az, bz), cx + Math.max(ax, bx), c.F + y1, cz + Math.max(az, bz), color);
}

function protoItem(c, P, w, d, h, draw, opts = {}) {
  const slot = P.alloc(w, h > 1.0, opts.prefer, d);
  if (!slot) return null;
  const pos = P.wallPos(slot, d);
  c.frontColor = null;
  draw(pos.x, pos.z, pos.rot); // çizim, ön yüz rengini c.frontColor'a bırakabilir (gardırop, dolap)
  if (opts.collide !== false) collide(c, pos.x, pos.z, w, d, pos.rot, h);
  if (opts.container) container(c, opts.container, pos.x, pos.z, Math.min(h, 1.2), { label: opts.label, size: opts.size, locked: opts.locked, frame: { rot: pos.rot, w, d, h, model: 'proto' }, frontColor: c.frontColor });
  c.frontColor = null;
  return pos;
}

const PRODUCT_COLORS = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ecf0f1', '#1abc9c', '#d35400', '#c0392b'];

/** Mağaza rafı (iki taraflı ya da duvar rafı), ürün kutularıyla */
function shelfUnit(c, cx, cz, rot, len, depth, h, levels, frame = '#8e9aa3', palette = PRODUCT_COLORS, density = 0.8) {
  const hl = len / 2, hd = depth / 2;
  pbox(c, cx, cz, rot, -hl, 0, -hd, hl, 0.12, hd, 'metal', frame);
  for (const x of [-hl, hl - 0.06]) pbox(c, cx, cz, rot, x, 0, -hd, x + 0.06, h, hd, 'metal', frame);
  pbox(c, cx, cz, rot, -hl, 0.12, -0.02, hl, h, 0.02, 'metal', '#b7c0c6');
  for (let i = 0; i < levels; i++) {
    const y = 0.15 + (i * (h - 0.25)) / levels;
    pbox(c, cx, cz, rot, -hl, y, -hd, hl, y + 0.04, hd, 'metal', frame);
    let x = -hl + 0.08;
    while (x < hl - 0.2) {
      const pw = 0.12 + c.rng.next() * 0.22, ph = 0.14 + c.rng.next() * 0.22;
      if (c.rng.next() < density) {
        const col = c.rng.pick(palette);
        for (const side of depth > 0.5 ? [-1, 1] : [1]) {
          const z0 = side > 0 ? 0.05 : -hd + 0.04, z1 = side > 0 ? hd - 0.04 : -0.05;
          pbox(c, cx, cz, rot, x, y + 0.04, z0, x + pw, y + 0.04 + ph, z1, 'plain', col);
        }
      }
      x += pw + 0.03;
    }
  }
}

// ----------------------------------------------------------------------- oda türleri

const ROOMS = {
  living(r, c, P) {
    const couch = furniture(c, P, 'furniture', c.rng.chance(0.5) ? 'couch_pillows' : 'couch', 2.1, 1.12, 0.85, { prefer: ['B', 'L', 'R'] });
    furniture(c, P, 'furniture', 'armchair', 1.26, 1.12, 0.85, {});
    furniture(c, P, 'furniture', 'shelf_B_large_decorated', 1.4, 0.35, 0.2, { y: 1.45, collide: false, container: null });
    furniture(c, P, 'furniture', 'cabinet_medium_decorated', 1.43, 0.7, 1.28, { container: 'bookshelf', label: 'Kitaplık' });
    furniture(c, P, 'furniture', 'lamp_standing', 0.6, 0.6, 1.7, { collide: false });
    furniture(c, P, 'furniture', 'pictureframe_large_B', 1.4, 0.14, 0.2, { y: 1.55, collide: false });
    // TV ünitesi
    protoItem(c, P, 1.6, 0.5, 1.2, (x, z, rot) => {
      pbox(c, x, z, rot, -0.8, 0, -0.25, 0.8, 0.5, 0.25, 'wood', '#6b4a33');
      pbox(c, x, z, rot, -0.62, 0.55, -0.06, 0.62, 1.2, 0.02, 'shiny', '#1c1f24');
      pbox(c, x, z, rot, -0.1, 0.5, -0.1, 0.1, 0.56, 0.06, 'plain', '#2c3036');
    }, { container: 'dresser', label: 'TV Ünitesi' });
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (P.centerFree(cx - 1.1, cz - 0.75, cx + 1.1, cz + 0.75)) {
      model(c, 'furniture', c.rng.pick(['rug_rectangle_stripes_A', 'rug_oval_A', 'rug_rectangle_A', 'rug_rectangle_B']), cx, c.F + 0.005, cz, 0, KK);
      model(c, 'furniture', 'table_low', cx, c.F, cz, 0, KK);
      collide(c, cx, cz, 1.6, 1.0, 0, 0.36);
    }
    void couch;
  },
  kitchen(r, c, P) {
    const pro = r.pro;
    const sc = [KK, 0.75, 0.48];
    // tezgâh dizisi tek duvarda (pencere altına da gelebilir; üst dolaplar yalnızca pencere yoksa)
    const n = pro ? 4 : 3;
    const slot = P.alloc(n * 1.4, false, null, 1.0) || P.alloc(2 * 1.4, false, null, 1.0);
    if (slot) {
      const items = pro ? ['kitchencounter_straight_A', 'stove_multi', 'kitchencounter_sink', 'kitchencounter_straight_B'] : ['kitchencounter_sink', 'stove_single', 'kitchencounter_straight_decorated'];
      const span = slot.sd.used[slot.sd.used.length - 1];
      const cnt = Math.max(1, Math.round((span[1] - span[0] - 0.1) / 1.4));
      const hasWin = slot.sd.wins.some((w) => w.e > span[0] && w.s < span[1]);
      for (let i = 0; i < Math.min(cnt, n); i++) {
        const sub = { sd: slot.sd, at: slot.at - (cnt * 1.4) / 2 + 0.7 + i * 1.4 };
        const pos = P.wallPos(sub, 0.98);
        const nm = items[i % items.length];
        if (nm.startsWith('stove')) model(c, 'kitchen', nm, pos.x, c.F, pos.z, pos.rot, [0.7, 0.66, 0.42]);
        else model(c, 'kitchen', nm, pos.x, c.F, pos.z, pos.rot, sc);
        if (!nm.startsWith('stove') && !hasWin) model(c, 'kitchen', i % 2 ? 'kitchencabinet_half' : 'kitchencabinet', pos.x, c.F - 0.15, pos.z, pos.rot, [KK, 0.72, 0.42]);
        collide(c, pos.x, pos.z, 1.4, 0.98, pos.rot, 0.95);
        container(c, nm.startsWith('stove') ? 'stove' : 'kitchen_cabinet', pos.x, pos.z, 0.9, { frame: { rot: pos.rot, w: 1.4, d: 0.98, h: 0.95, model: nm } });
      }
    }
    // buzdolabı kapakları modelden ayrılır ('nodoor'), Fronts sağ ön kenardaki menteşeden açar
    furniture(c, P, 'kitchen', c.rng.chance(0.5) ? 'fridge_A' : 'fridge_B', 1.0, 0.95, 1.8, { scale: [0.5, 0.72, 0.42], container: 'fridge', variant: 'nodoor' });
    if (pro) furniture(c, P, 'kitchen', 'fridge_A_decorated', 1.0, 0.95, 1.8, { scale: [0.5, 0.72, 0.42], container: 'fridge', variant: 'nodoor' });
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (!pro && P.centerFree(cx - 1.3, cz - 1.3, cx + 1.3, cz + 1.3)) {
      model(c, 'kitchen', c.rng.chance(0.5) ? 'kitchentable_A' : 'kitchentable_A_large_decorated', cx, c.F, cz, 0, KK);
      collide(c, cx, cz, 1.6, 1.4, 0, 0.72);
      for (const [dx, dz, rr] of [[-0.95, 0, PI / 2], [0.95, 0, -PI / 2]]) model(c, 'kitchen', 'chair_A', cx + dx, c.F, cz + dz, rr, KK);
    } else if (pro) {
      furniture(c, P, 'kitchen', 'shelf_papertowel_decorated', 1.4, 0.45, 0.4, { y: 1.5, collide: false });
      furniture(c, P, 'kitchen', 'crate_tomatoes', 1.0, 1.0, 0.65, { scale: 0.5, container: 'crate', label: 'Sebze Kasası' });
    }
  },
  bedroom(r, c, P) {
    const double = (r.x1 - r.x0) * (r.z1 - r.z0) > 22 && !r.beds;
    if (r.beds === 2) {
      furniture(c, P, 'furniture', 'bed_single_A', 1.12, 2.1, 0.7, { prefer: ['B', 'F'], walkable: true });
      furniture(c, P, 'furniture', 'bed_single_B', 1.12, 2.1, 0.7, { prefer: ['B', 'F'], walkable: true });
    } else {
      furniture(c, P, 'furniture', double ? c.rng.pick(['bed_double_A', 'bed_double_B']) : 'bed_single_A', double ? 2.17 : 1.12, 2.1, 0.7, { prefer: ['B', 'L', 'R'], walkable: true });
    }
    const ns = furniture(c, P, 'furniture', 'cabinet_small', 0.7, 0.7, 0.7, { container: 'nightstand' });
    if (ns) model(c, 'furniture', 'lamp_table', ns.x, c.F + 0.7, ns.z, ns.rot, 0.5);
    // gardırop
    protoItem(c, P, 1.3, 0.62, 2.0, (x, z, rot) => {
      const col = c.rng.pick(['#8a6244', '#e8e2d8', '#a8794f', '#5d4433']);
      pbox(c, x, z, rot, -0.65, 0, -0.31, 0.65, 2.0, 0.31, 'wood', col);
      c.frontColor = col; // iki kanat, ek yeri ve kulplar Fronts'ta (menteşeden açılır)
    }, { container: 'wardrobe' });
    furniture(c, P, 'furniture', 'cabinet_medium', 1.4, 0.7, 0.7, { container: 'dresser' });
    furniture(c, P, 'furniture', c.rng.pick(['pictureframe_medium', 'pictureframe_small_A']), 0.6, 0.14, 0.2, { y: 1.5, collide: false });
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (P.centerFree(cx - 0.8, cz - 0.6, cx + 0.8, cz + 0.6)) model(c, 'furniture', c.rng.pick(['rug_oval_B', 'rug_rectangle_stripes_B']), cx, c.F + 0.005, cz, PI / 2, 0.55);
  },
  bathroom(r, c, P) {
    protoItem(c, P, 0.6, 0.75, 0.8, (x, z, rot) => { // klozet
      pbox(c, x, z, rot, -0.22, 0, -0.1, 0.22, 0.42, 0.32, 'tiles', '#f4f6f7');
      pbox(c, x, z, rot, -0.25, 0.42, -0.12, 0.25, 0.47, 0.36, 'plain', '#ffffff');
      pbox(c, x, z, rot, -0.25, 0.3, -0.37, 0.25, 0.85, -0.12, 'tiles', '#f4f6f7');
    }, { collide: true });
    protoItem(c, P, 0.8, 0.5, 0.9, (x, z, rot) => { // lavabo + aynalı dolap
      pbox(c, x, z, rot, -0.4, 0, -0.25, 0.4, 0.85, 0.25, 'wood', '#e8e1d5');
      pbox(c, x, z, rot, -0.3, 0.85, -0.18, 0.3, 0.92, 0.18, 'shiny', '#dfe6e9');
      pbox(c, x, z, rot, -0.35, 1.25, -0.25, 0.35, 1.9, -0.13, 'shiny', '#b8d8e8');
    }, { container: 'bathroom_cabinet' });
    protoItem(c, P, 1.7, 0.8, 0.6, (x, z, rot) => { // küvet
      pbox(c, x, z, rot, -0.85, 0, -0.4, 0.85, 0.55, -0.32, 'tiles', '#ffffff');
      pbox(c, x, z, rot, -0.85, 0, 0.32, 0.85, 0.55, 0.4, 'tiles', '#ffffff');
      pbox(c, x, z, rot, -0.85, 0, -0.4, -0.77, 0.55, 0.4, 'tiles', '#ffffff');
      pbox(c, x, z, rot, 0.77, 0, -0.4, 0.85, 0.55, 0.4, 'tiles', '#ffffff');
      pbox(c, x, z, rot, -0.77, 0, -0.32, 0.77, 0.3, 0.32, 'shiny', '#a9cfe0');
    }, { collide: true });
  },
  garage(r, c, P) {
    const bigBay = (r.x1 - r.x0) >= 10;
    // tezgâh + alet panosu
    protoItem(c, P, 2.2, 0.8, 1.0, (x, z, rot) => {
      pbox(c, x, z, rot, -1.1, 0.85, -0.4, 1.1, 0.95, 0.4, 'wood', '#9c6b43');
      for (const [a, b] of [[-1.05, -0.35], [0.95, -0.35], [-1.05, 0.3], [0.95, 0.3]]) pbox(c, x, z, rot, a, 0, b, a + 0.1, 0.85, b + 0.1, 'metal', '#555b60');
      pbox(c, x, z, rot, -1.1, 1.05, -0.42, 1.1, 2.1, -0.38, 'wood', '#c9a77c');
      for (let i = 0; i < 7; i++) pbox(c, x, z, rot, -0.95 + i * 0.28, 1.3 + (i % 3) * 0.2, -0.38, -0.85 + i * 0.28, 1.65 + (i % 3) * 0.2, -0.32, 'shiny', ['#c0392b', '#2c3e50', '#f39c12', '#7f8c8d'][i % 4]);
      pbox(c, x, z, rot, 0.4, 0.95, -0.2, 0.75, 1.1, 0.1, 'metal', '#2f4f6f');
    }, { container: r.workshop ? 'workbench' : 'toolbox', label: r.workshop ? 'Çalışma Tezgâhı' : 'Alet Kutusu', prefer: ['B', 'L', 'R'] });
    shelvesAlong(c, P, 2, 'garage_shelf', ['#c0392b', '#7f8c8d', '#d35400', '#2c3e50', '#16a085', '#f1c40f'], '#5d6d7e');
    protoItem(c, P, 0.7, 0.5, 0.75, (x, z, rot) => { // alet dolabı
      pbox(c, x, z, rot, -0.35, 0, -0.25, 0.35, 0.75, 0.25, 'shiny', '#c0392b');
      for (let i = 0; i < 4; i++) pbox(c, x, z, rot, -0.3, 0.1 + i * 0.16, 0.25, 0.3, 0.12 + i * 0.16, 0.27, 'plain', '#922b21');
    }, { container: 'toolbox' });
    if (r.goods === 'car' || bigBay) {
      // lastik yığını
      protoItem(c, P, 0.9, 0.9, 1.0, (x, z, rot) => {
        for (let i = 0; i < 4; i++) c.geo.cylinder('plain', x, c.F + i * 0.24, z, 0.4, 0.22, '#262626', 12);
      }, { container: 'parts_shelf', label: 'Lastik Yığını' });
      furnitureBarrel(c, P);
    }
    if (!r.keepCarSpace) furnitureBarrel(c, P);
  },
  security(r, c, P) {
    shelvesAlong(c, P, 2, 'garage_shelf', ['#7f8c8d', '#95a5a6', '#c0392b', '#2c3e50'], '#5d6d7e');
    furniture(c, P, 'props', 'crates_stacked', 1.4, 1.4, 1.5, { scale: 0.65, container: 'crate' });
    protoItem(c, P, 1.4, 0.7, 1.0, (x, z, rot) => { // eski masa
      pbox(c, x, z, rot, -0.7, 0.7, -0.35, 0.7, 0.76, 0.35, 'wood', '#8b6a4c');
      for (const a of [-0.65, 0.6]) for (const b of [-0.3, 0.25]) pbox(c, x, z, rot, a, 0, b, a + 0.05, 0.7, b + 0.05, 'wood', '#5d4433');
    }, { container: 'desk' });
  },
  shop_hall(r, c, P) {
    const goods = r.goods || 'food';
    const pal = {
      food: PRODUCT_COLORS, med: ['#ffffff', '#e8f6f3', '#c0392b', '#3498db', '#27ae60', '#fdebd0'], tools: ['#7f8c8d', '#c0392b', '#f39c12', '#2c3e50', '#d35400'],
      clothes: ['#2980b9', '#8e44ad', '#c0392b', '#f5b041', '#1abc9c', '#ecf0f1', '#34495e'], electronics: ['#1c2833', '#566573', '#2e86c1', '#f4f6f7'],
      sports: ['#27ae60', '#e67e22', '#2980b9', '#c0392b', '#f1c40f'], gas: PRODUCT_COLORS,
    }[goods] || PRODUCT_COLORS;
    const ctype = { food: 'shelf_food', med: 'shelf_medical', tools: 'shelf_tools', clothes: 'shelf_clothes', electronics: 'shelf_electronics', sports: 'shelf_sports', gas: 'shelf_food' }[goods];
    // duvar rafları
    shelvesAlong(c, P, r.big ? 6 : 3, ctype, pal, '#8e9aa3', 2.0);
    // kasa tezgâhı ön kapıya yakın
    protoItem(c, P, 1.8, 0.7, 1.0, (x, z, rot) => {
      pbox(c, x, z, rot, -0.9, 0, -0.35, 0.9, 0.95, 0.35, 'wood', '#a04000');
      pbox(c, x, z, rot, -0.95, 0.95, -0.4, 0.95, 1.0, 0.4, 'plain', '#f0e6d2');
      pbox(c, x, z, rot, 0.3, 1.0, -0.15, 0.7, 1.25, 0.15, 'plain', '#2c3e50');
    }, { container: 'register', prefer: ['F', 'L', 'R'] });
    if (goods === 'food' || goods === 'gas') {
      protoItem(c, P, 1.4, 0.75, 2.0, (x, z, rot) => { // içecek dolabı
        pbox(c, x, z, rot, -0.7, 0, -0.37, 0.7, 2.0, 0.37, 'shiny', '#ecf0f1');
        for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) pbox(c, x, z, rot, -0.62 + k * 0.155, 0.2 + i * 0.45, 0.05, -0.52 + k * 0.155, 0.48 + i * 0.45, 0.25, 'plain', c.rng.pick(['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ffffff']));
      }, { container: 'shelf_drinks', prefer: ['B', 'L', 'R'] }); // iki cam kapak Fronts'ta
    }
    if (goods === 'electronics' || goods === 'clothes') {
      furniture(c, P, 'furniture', 'table_medium_long', 2.1, 1.4, 0.7, { container: goods === 'clothes' ? 'shelf_clothes' : 'shelf_electronics', label: 'Teşhir Masası' });
    }
    // orta reyonlar
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const rows = Math.max(0, Math.floor((d - 3.4) / 2.6));
    const aisleLen = Math.min(w - 4.2, r.big ? 9 : 6);
    if (aisleLen > 1.5) {
      for (let i = 0; i < rows; i++) {
        const z = r.z0 + 1.8 + i * 2.6 + 0.4;
        if (r.big) {
          for (const xc of [r.x0 + w * 0.3, r.x0 + w * 0.7]) {
            if (!P.centerFree(xc - aisleLen / 2, z - 0.45, xc + aisleLen / 2, z + 0.45)) continue;
            shelfUnit(c, xc, z, 0, aisleLen, 0.8, 1.7, 4, '#9aa5ad', pal);
            collide(c, xc, z, aisleLen, 0.8, 0, 1.7);
            for (let k = -1; k <= 1; k += 2) container(c, ctype, xc + k * aisleLen * 0.25, z, 1.0);
          }
        } else {
          const xc = (r.x0 + r.x1) / 2;
          if (!P.centerFree(xc - aisleLen / 2, z - 0.45, xc + aisleLen / 2, z + 0.45)) continue;
          shelfUnit(c, xc, z, 0, aisleLen, 0.8, 1.6, 4, '#9aa5ad', pal);
          collide(c, xc, z, aisleLen, 0.8, 0, 1.6);
          container(c, ctype, xc, z, 1.0);
        }
      }
    }
  },
  shop_storage(r, c, P) {
    const goods = r.goods || 'food';
    const ctype = goods === 'build' ? 'shelf_build' : goods === 'car' ? 'parts_shelf' : goods === 'tools' ? 'shelf_tools' : 'crate';
    shelvesAlong(c, P, 3, ctype, ['#c4a484', '#a67c52', '#d2b48c', '#8b5a2b'], '#566573', 2.2);
    furniture(c, P, 'props', 'Pallet_Small_Decorated_A', 1.2, 1.2, 0.9, { scale: 0.6, container: 'pallet' });
    furniture(c, P, 'props', 'crates_stacked', 1.3, 1.3, 1.4, { scale: 0.62, container: 'crate' });
  },
  office(r, c, P) {
    const n = (r.x1 - r.x0) * (r.z1 - r.z0) > 30 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      protoItem(c, P, 1.5, 0.75, 1.1, (x, z, rot) => {
        pbox(c, x, z, rot, -0.75, 0.72, -0.37, 0.75, 0.78, 0.37, 'wood', '#a0785a');
        pbox(c, x, z, rot, -0.75, 0, -0.37, -0.35, 0.72, 0.37, 'wood', '#8b6548');
        pbox(c, x, z, rot, 0.68, 0, -0.37, 0.75, 0.72, 0.37, 'wood', '#8b6548');
        pbox(c, x, z, rot, -0.25, 0.78, -0.3, 0.25, 1.12, -0.25, 'shiny', '#1c2833');
        pbox(c, x, z, rot, -0.25, 0.78, -0.05, 0.25, 0.8, 0.1, 'plain', '#d5d8dc');
      }, { container: r.docs ? 'desk' : 'desk', label: r.docs ? 'Masa (Belgeler)' : 'Masa Çekmecesi' });
    }
    protoItem(c, P, 0.6, 0.6, 1.4, (x, z, rot) => {
      pbox(c, x, z, rot, -0.3, 0, -0.3, 0.3, 1.4, 0.3, 'metal', '#95a5a6');
      for (let i = 0; i < 4; i++) pbox(c, x, z, rot, -0.25, 0.1 + i * 0.33, 0.3, 0.25, 0.12 + i * 0.33, 0.32, 'plain', '#7f8c8d');
    }, { container: 'filing_cabinet' });
    furniture(c, P, 'furniture', 'cabinet_medium_decorated', 1.43, 0.7, 1.28, { container: 'bookshelf', label: 'Dosya Rafı' });
    furniture(c, P, 'furniture', 'cactus_medium_A', 0.6, 0.6, 0.6, { scale: 0.6, collide: false });
    if (r.docs) c.B.docRoom = r.id;
  },
  lobby(r, c, P) {
    if (r.mallHall) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      // çeşme ve banklar
      c.geo.cylinder('concrete', cx, c.F, cz, 2.2, 0.6, '#d5d8dc', 16);
      c.geo.cylinder('shiny', cx, c.F + 0.55, cz, 1.9, 0.06, '#5dade2', 16, false);
      c.geo.cylinder('concrete', cx, c.F, cz, 0.35, 1.6, '#d5d8dc', 10);
      c.ctx.physics.addBox(...boxArgs(c, cx, cz, 2.2, 2.2, 0.6));
      furniture(c, P, 'props', 'Box_C', 0.9, 0.7, 0.6, { scale: 1.2, container: 'cart', label: 'Terk Edilmiş Alışveriş Arabası' });
      protoItem(c, P, 0.9, 0.8, 1.8, (x, z, rot) => {
        pbox(c, x, z, rot, -0.45, 0, -0.4, 0.45, 1.8, 0.4, 'shiny', '#c0392b');
        pbox(c, x, z, rot, -0.38, 0.4, 0.4, 0.38, 1.6, 0.42, 'shiny', '#aed6f1');
      }, { container: 'vending' });
      return;
    }
    protoItem(c, P, 2.4, 0.8, 1.1, (x, z, rot) => { // resepsiyon
      pbox(c, x, z, rot, -1.2, 0, -0.4, 1.2, 1.05, 0.4, 'wood', r.security ? '#5b2c6f' : '#7b5e45');
      pbox(c, x, z, rot, -1.25, 1.05, -0.45, 1.25, 1.1, 0.45, 'plain', '#f2f3f4');
      pbox(c, x, z, rot, -0.5, 1.1, -0.3, -0.1, 1.4, -0.25, 'shiny', '#1c2833');
    }, { container: r.security ? 'desk' : 'desk', label: r.security ? 'Güvenlik Masası' : 'Resepsiyon', prefer: ['B', 'L', 'R'] });
    for (let i = 0; i < 2; i++) furniture(c, P, 'furniture', 'chair_B', 0.6, 0.6, 0.9, {});
    furniture(c, P, 'furniture', 'cactus_medium_A', 0.6, 0.6, 0.6, { scale: 0.6, collide: false });
    protoItem(c, P, 0.9, 0.8, 1.8, (x, z, rot) => {
      pbox(c, x, z, rot, -0.45, 0, -0.4, 0.45, 1.8, 0.4, 'shiny', '#2e86c1');
      pbox(c, x, z, rot, -0.38, 0.4, 0.4, 0.38, 1.6, 0.42, 'shiny', '#d6eaf8');
    }, { container: 'vending' });
  },
  lobby_med(r, c, P) {
    ROOMS.lobby(r, c, P);
    for (let i = 0; i < 2; i++) furniture(c, P, 'furniture', 'bed_single_B', 1.12, 2.1, 0.7, { walkable: true });
    medCart(c, P);
  },
  ward(r, c, P) {
    const n = Math.floor((r.x1 - r.x0 - 0.5) / 1.8);
    for (let i = 0; i < n; i++) {
      const pos = furniture(c, P, 'furniture', 'bed_single_A', 1.12, 2.1, 0.7, { prefer: ['B'], walkable: true });
      if (pos) {
        pbox(c, pos.x + 0.7, pos.z, 0, -0.03, 0, -0.03, 0.03, 1.9, 0.03, 'metal', '#bdc3c7');
        pbox(c, pos.x + 0.7, pos.z, 0, -0.12, 1.75, -0.04, 0.12, 1.95, 0.04, 'shiny', '#d6eaf8');
      }
    }
    for (let i = 0; i < n; i++) furniture(c, P, 'furniture', 'bed_single_A', 1.12, 2.1, 0.7, { prefer: ['F'], walkable: true });
    medCart(c, P); medCart(c, P);
  },
  surgery(r, c, P) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    pbox(c, cx, cz, 0, -1.0, 0, -0.4, 1.0, 0.9, 0.4, 'shiny', '#d5dbdb');
    pbox(c, cx, cz, 0, -1.05, 0.9, -0.45, 1.05, 0.95, 0.45, 'plain', '#a9dfbf');
    c.geo.cylinder('shiny', cx, c.F + 2.6, cz, 0.5, 0.15, '#f8f9f9', 12);
    collide(c, cx, cz, 2.0, 0.8, 0, 0.95);
    medCart(c, P); medCart(c, P);
    shelvesAlong(c, P, 1, 'shelf_medical', ['#ffffff', '#aed6f1', '#f5b7b1'], '#d5d8dc');
  },
  pharmacy_store(r, c, P) { shelvesAlong(c, P, 4, 'shelf_medical', ['#ffffff', '#e8f6f3', '#c0392b', '#3498db', '#27ae60', '#fdebd0'], '#d5d8dc'); medCart(c, P); },
  storage(r, c, P) {
    const g = r.goods;
    const ctype = g === 'med' ? 'shelf_medical' : g === 'car' ? 'parts_shelf' : g === 'military' ? 'military_crate' : 'crate';
    shelvesAlong(c, P, 3, ctype, g === 'med' ? ['#ffffff', '#aed6f1'] : ['#c4a484', '#7f8c8d', '#566573', '#a67c52'], '#5d6d7e');
    if (g === 'military') { militaryCrate(c, P); militaryCrate(c, P); } else furniture(c, P, 'props', 'crates_stacked', 1.3, 1.3, 1.4, { scale: 0.62, container: 'crate' });
  },
  lab(r, c, P) {
    for (let i = 0; i < 3; i++) {
      protoItem(c, P, 2.0, 0.8, 1.1, (x, z, rot) => {
        pbox(c, x, z, rot, -1.0, 0, -0.4, 1.0, 0.9, 0.4, 'plain', '#f4f6f7');
        pbox(c, x, z, rot, -1.02, 0.9, -0.42, 1.02, 0.95, 0.42, 'shiny', '#2c3e50');
        pbox(c, x, z, rot, -0.7, 0.95, -0.15, -0.5, 1.35, 0.05, 'shiny', '#58d68d');
        pbox(c, x, z, rot, -0.3, 0.95, -0.2, -0.15, 1.2, -0.05, 'shiny', '#af7ac5');
        pbox(c, x, z, rot, 0.2, 0.95, -0.25, 0.55, 1.45, 0.1, 'plain', '#d0d3d4');
      }, { container: 'lab_bench' });
    }
    shelvesAlong(c, P, 1, 'shelf_medical', ['#ffffff', '#a9dfbf', '#d7bde2', '#aed6f1'], '#d5d8dc');
    if (r.docs) c.B.docRoom = r.id;
  },
  containment(r, c, P) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    for (const dx of [-2.5, 0, 2.5]) {
      c.geo.cylinder('shiny', cx + dx, c.F, cz - 1.5, 0.75, 0.3, '#5d6d7e', 14);
      c.geo.cylinder('glass', cx + dx, c.F + 0.3, cz - 1.5, 0.7, 2.0, '#a3e4d7', 14, false);
      c.geo.cylinder('shiny', cx + dx, c.F + 2.3, cz - 1.5, 0.75, 0.3, '#5d6d7e', 14);
      collide(c, cx + dx, cz - 1.5, 1.5, 1.5, 0, 2.6);
    }
    container(c, 'lab_bench', cx, cz + 1.5, 0.9, { label: 'Numune Dolabı', special: 'lab_sample' });
    c.B.specialSpawn = c.fr.pt(cx, cz + 0.6);
  },
  server(r, c, P) {
    for (let i = 0; i < 3; i++) protoItem(c, P, 0.8, 0.9, 2.1, (x, z, rot) => {
      pbox(c, x, z, rot, -0.4, 0, -0.45, 0.4, 2.1, 0.45, 'shiny', '#17202a');
      for (let k = 0; k < 10; k++) pbox(c, x, z, rot, -0.3 + (k % 5) * 0.12, 0.3 + Math.floor(k / 5) * 0.8 + (k % 3) * 0.15, 0.45, -0.26 + (k % 5) * 0.12, 0.34 + Math.floor(k / 5) * 0.8 + (k % 3) * 0.15, 0.47, 'emissive', c.rng.pick(['#2ecc71', '#3498db', '#e74c3c']));
    }, { container: i === 0 ? 'server' : null, label: 'Sunucu Kabini' });
  },
  armory(r, c, P) {
    for (let i = 0; i < 3; i++) protoItem(c, P, 1.0, 0.55, 2.0, (x, z, rot) => {
      pbox(c, x, z, rot, -0.5, 0, -0.27, 0.5, 2.0, 0.27, 'metal', r.police ? '#34495e' : '#556b2f');
      c.frontColor = r.police ? '#34495e' : '#556b2f';
      for (let k = 0; k < 3; k++) pbox(c, x, z, rot, -0.42 + k * 0.3, 0.4, 0.2, -0.38 + k * 0.3, 1.6, 0.26, 'plain', '#1b1b1b');
    }, { container: 'weapon_locker' });
    militaryCrate(c, P); militaryCrate(c, P);
  },
  cells(r, c, P) {
    const midX = (r.x0 + r.x1) / 2;
    for (let x = r.x0 + 0.4; x < r.x1 - 0.3; x += 0.25) pbox(c, x, r.z0 + 2.4, 0, -0.025, 0, -0.025, 0.025, 2.4, 0.025, 'metal', '#5f6a6a');
    c.ctx.physics.addBox(...boxArgs(c, midX, r.z0 + 2.4, (r.x1 - r.x0 - 0.6), 0.1, 2.4));
    furniture(c, P, 'furniture', 'bed_single_B', 1.12, 2.1, 0.7, { prefer: ['B'], walkable: true });
    furniture(c, P, 'props', 'Box_A', 0.6, 0.6, 0.6, { scale: 1.2, container: 'locker', label: 'Emanet Kutusu', prefer: ['F', 'L', 'R'] });
  },
  barracks_room(r, c, P) {
    const n = Math.floor((r.x1 - r.x0 - 1) / 2.2);
    for (const side of ['B', 'F']) for (let i = 0; i < n; i++) {
      const pos = furniture(c, P, 'furniture', 'bed_single_A', 1.12, 2.1, 0.7, { prefer: [side], walkable: true });
      if (pos && !r.lockers) {
        model(c, 'furniture', 'bed_single_B', pos.x, c.F + 1.15, pos.z, pos.rot, KK);
        for (const dx of [-0.55, 0.55]) pbox(c, pos.x, pos.z, pos.rot, dx - 0.03, 0, -1.0, dx + 0.03, 1.9, -0.94, 'metal', '#4d5656');
      }
    }
    for (let i = 0; i < 3; i++) protoItem(c, P, 0.6, 0.55, 1.9, (x, z, rot) => {
      pbox(c, x, z, rot, -0.3, 0, -0.27, 0.3, 1.9, 0.27, 'metal', r.lockers ? '#7f8c8d' : '#556b2f');
      c.frontColor = r.lockers ? '#7f8c8d' : '#556b2f'; // kanat (havalandırma yarıklarıyla) Fronts'ta
    }, { container: 'locker' });
  },
  warehouse_hall(r, c, P) {
    const g = r.goods;
    const ctype = g === 'metal' ? 'shelf_build' : g === 'port' ? 'pallet' : 'pallet';
    // büyük raf sistemleri
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const rows = Math.max(1, Math.floor((d - 4) / 4));
    for (let i = 0; i < rows; i++) {
      const z = r.z0 + 2.5 + i * 4;
      const len = Math.min(w - 6, 10);
      const xc = (r.x0 + r.x1) / 2;
      if (!P.centerFree(xc - len / 2, z - 0.8, xc + len / 2, z + 0.8)) continue;
      bigRack(c, xc, z, len);
      collide(c, xc, z, len, 1.4, 0, 3.4);
      container(c, ctype, xc - len / 4, z, 1.0, { label: g === 'metal' ? 'Metal Rafı' : 'Palet Rafı' });
      container(c, ctype, xc + len / 4, z, 1.0, { label: g === 'metal' ? 'Metal Rafı' : 'Palet Rafı' });
    }
    for (let i = 0; i < 3; i++) furniture(c, P, 'props', c.rng.pick(['Pallet_Small_Decorated_A', 'Pallet_Small_Decorated_B']), 1.2, 1.2, 1.0, { scale: 0.6, container: 'pallet' });
    furnitureBarrel(c, P); furnitureBarrel(c, P);
  },
  factory_hall(r, c, P) {
    const w = r.x1 - r.x0;
    for (let i = 0; i < 3; i++) {
      const x = r.x0 + w * (0.22 + i * 0.28), z = (r.z0 + r.z1) / 2;
      if (!P.centerFree(x - 1.8, z - 1.4, x + 1.8, z + 1.4)) continue;
      pbox(c, x, z, 0, -1.6, 0, -1.2, 1.6, 1.4, 1.2, 'metal', c.rng.pick(['#d35400', '#2471a3', '#1e8449']));
      pbox(c, x, z, 0, -1.0, 1.4, -0.8, 0.6, 2.4, 0.8, 'metal', '#7f8c8d');
      c.geo.cylinder('metal', x + 1.0, c.F + 1.4, z, 0.45, 1.6, '#aab7b8', 10);
      pbox(c, x, z, 0, -1.8, 0, 1.25, 1.8, 0.75, 2.0, 'metal', '#34495e');
      collide(c, x, z + 0.3, 3.6, 3.2, 0, 2.4);
      container(c, 'parts_shelf', x, z + 1.9, 0.8, { label: 'Makine Parçaları' });
    }
    shelvesAlong(c, P, 3, 'shelf_build', ['#7f8c8d', '#566573', '#a04000'], '#566573', 2.3);
    for (let i = 0; i < 3; i++) furnitureBarrel(c, P);
  },
  restaurant_hall(r, c, P) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    for (let ix = 0; ix < Math.floor(w / 4); ix++) for (let iz = 0; iz < Math.floor(d / 4); iz++) {
      const x = r.x0 + 2 + ix * 4, z = r.z0 + 2 + iz * 4;
      if (!P.centerFree(x - 1.2, z - 1.2, x + 1.2, z + 1.2)) continue;
      model(c, 'kitchen', c.rng.chance(0.3) ? 'table_round_A_decorated' : 'table_round_A', x, c.F, z, 0, 0.5);
      for (let k = 0; k < 4; k++) { const a = k * PI / 2; model(c, 'kitchen', 'chair_A', x + Math.sin(a) * 1.05, c.F, z + Math.cos(a) * 1.05, a + PI, KK); }
      collide(c, x, z, 1.5, 1.5, 0, 0.75);
    }
    protoItem(c, P, 2.4, 0.7, 1.1, (x, z, rot) => {
      pbox(c, x, z, rot, -1.2, 0, -0.35, 1.2, 1.0, 0.35, 'wood', '#7e5109');
      pbox(c, x, z, rot, -1.25, 1.0, -0.4, 1.25, 1.06, 0.4, 'plain', '#fdfefe');
    }, { container: 'counter', label: 'Servis Tezgâhı' });
  },
  cafe_hall(r, c, P) {
    const w = r.x1 - r.x0;
    for (let ix = 0; ix < Math.floor(w / 3); ix++) {
      const x = r.x0 + 1.6 + ix * 3, z = (r.z0 + r.z1) / 2 + 0.6;
      if (!P.centerFree(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) continue;
      model(c, 'furniture', 'table_small', x, c.F, z, 0, KK);
      model(c, 'furniture', 'chair_stool_wood', x - 0.7, c.F, z, PI / 2, KK);
      model(c, 'furniture', 'chair_stool_wood', x + 0.7, c.F, z, -PI / 2, KK);
      collide(c, x, z, 0.7, 0.7, 0, 0.7);
    }
    protoItem(c, P, 2.4, 0.7, 1.1, (x, z, rot) => {
      pbox(c, x, z, rot, -1.2, 0, -0.35, 1.2, 1.0, 0.35, 'wood', '#6e2c00');
      pbox(c, x, z, rot, 0.3, 1.0, -0.2, 0.8, 1.45, 0.2, 'shiny', '#7b7d7d');
    }, { container: 'counter', label: 'Kafe Tezgâhı', prefer: ['B'] });
    furniture(c, P, 'kitchen', 'shelf_papertowel_decorated', 1.4, 0.45, 0.4, { y: 1.5, collide: false });
  },
  bank_hall(r, c, P) {
    protoItem(c, P, 4.5, 0.8, 1.2, (x, z, rot) => {
      pbox(c, x, z, rot, -2.25, 0, -0.4, 2.25, 1.1, 0.4, 'wood', '#145a32');
      pbox(c, x, z, rot, -2.3, 1.1, -0.45, 2.3, 1.15, 0.45, 'plain', '#f8f9f9');
      pbox(c, x, z, rot, -2.25, 1.15, -0.02, 2.25, 2.0, 0.02, 'glass', '#d6eaf8');
    }, { container: 'desk', label: 'Gişe', prefer: ['B'] });
    protoItem(c, P, 0.9, 0.6, 1.8, (x, z, rot) => {
      pbox(c, x, z, rot, -0.45, 0, -0.3, 0.45, 1.8, 0.3, 'metal', '#7f8c8d');
      pbox(c, x, z, rot, -0.3, 1.0, 0.3, 0.3, 1.45, 0.32, 'emissive', '#5dade2');
    }, { container: 'register', label: 'ATM' });
    for (let i = 0; i < 3; i++) furniture(c, P, 'furniture', 'chair_C', 0.6, 0.6, 0.9, {});
  },
  vault(r, c, P) {
    for (let i = 0; i < 2; i++) protoItem(c, P, 1.2, 0.7, 1.4, (x, z, rot) => {
      pbox(c, x, z, rot, -0.6, 0, -0.35, 0.6, 1.4, 0.35, 'metal', '#717d7e'); // ağır kanat ve çark Fronts'ta
    }, { container: 'safe', label: 'Çelik Kasa' });
  },
  radio_room(r, c, P) {
    protoItem(c, P, 2.6, 0.8, 1.6, (x, z, rot) => {
      pbox(c, x, z, rot, -1.3, 0.72, -0.4, 1.3, 0.78, 0.4, 'metal', '#566573');
      for (const a of [-1.25, 1.2]) pbox(c, x, z, rot, a, 0, -0.35, a + 0.05, 0.72, 0.35, 'metal', '#2c3e50');
      for (let k = 0; k < 3; k++) {
        pbox(c, x, z, rot, -1.1 + k * 0.8, 0.78, -0.35, -0.5 + k * 0.8, 1.2, 0.05, 'metal', '#3d4f2a');
        for (let j = 0; j < 4; j++) pbox(c, x, z, rot, -1.0 + k * 0.8 + j * 0.12, 1.0, 0.05, -0.94 + k * 0.8 + j * 0.12, 1.06, 0.08, 'emissive', j % 2 ? '#2ecc71' : '#f1c40f');
      }
    }, { container: 'radio_desk', label: 'Telsiz Masası', prefer: ['B'] });
    c.B.radioDesk = c.B.containers[c.B.containers.length - 1];
    militaryCrate(c, P);
    protoItem(c, P, 0.6, 0.6, 1.4, (x, z, rot) => { pbox(c, x, z, rot, -0.3, 0, -0.3, 0.3, 1.4, 0.3, 'metal', '#5d6d7e'); }, { container: 'filing_cabinet', label: 'Askerî Arşiv' });
  },
  booth(r, c, P) {
    protoItem(c, P, 1.4, 0.6, 1.0, (x, z, rot) => {
      pbox(c, x, z, rot, -0.7, 0, -0.3, 0.7, 0.95, 0.3, 'metal', '#7d6608');
      pbox(c, x, z, rot, -0.3, 0.95, -0.2, 0.2, 1.2, 0.1, 'plain', '#212f3c');
    }, { container: 'desk', label: 'Nöbetçi Masası', prefer: ['B'] });
  },
  cabin_main(r, c, P) {
    furniture(c, P, 'furniture', 'bed_single_B', 1.12, 2.1, 0.7, { prefer: ['B', 'L', 'R'], walkable: true });
    protoItem(c, P, 0.8, 0.7, 1.2, (x, z, rot) => { // soba
      pbox(c, x, z, rot, -0.35, 0, -0.3, 0.35, 0.75, 0.3, 'metal', '#1b2631');
      pbox(c, x, z, rot, -0.07, 0.75, -0.07, 0.07, 2.6, 0.07, 'metal', '#2c3e50');
      pbox(c, x, z, rot, -0.2, 0.15, 0.3, 0.2, 0.45, 0.32, 'emissive', '#e67e22');
    }, { container: 'stove', label: 'Soba' });
    protoItem(c, P, 1.0, 0.6, 0.6, (x, z, rot) => {
      pbox(c, x, z, rot, -0.5, 0, -0.3, 0.5, 0.55, 0.3, 'wood', '#7e5109');
      c.frontColor = '#6e4b1f'; // kapak Fronts'ta
    }, { container: 'cabin_chest' });
    furniture(c, P, 'furniture', 'shelf_B_small_decorated', 0.7, 0.4, 0.7, { y: 1.4, collide: false });
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (P.centerFree(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5)) { model(c, 'furniture', 'table_small', cx, c.F, cz, 0, KK); model(c, 'furniture', 'chair_A_wood', cx, c.F, cz + 0.7, PI, KK); collide(c, cx, cz, 0.7, 0.7, 0, 0.7); }
  },
  // cami harimi: saf saf halı, mihrap nişi, minber, rahle ve kitaplık, ayakkabılık
  mosque_hall(r, c, P) {
    const W = r.x1 - r.x0, D = r.z1 - r.z0;
    for (let k = 0; k < 6; k++) {
      const z0 = r.z0 + 1.0 + k * ((D - 2.6) / 6), z1 = z0 + (D - 2.6) / 6 - 0.08;
      c.geo.box('decor', r.x0 + 0.5, c.F, z0, r.x1 - 0.5, c.F + 0.015, z1, k % 2 ? '#7b1e24' : '#8e2a2e', 4);
    }
    const mx = (r.x0 + r.x1) / 2;
    c.geo.box('wood', mx - 0.9, c.F, r.z0 + 0.02, mx + 0.9, c.F + 2.4, r.z0 + 0.12, '#e8dcc2'); // mihrap nişi çerçevesi
    c.geo.box('decor', mx - 0.65, c.F + 0.1, r.z0 + 0.12, mx + 0.65, c.F + 2.1, r.z0 + 0.14, '#2f6f5e', 32 | 16);
    protoItem(c, P, 1.0, 2.2, 2.4, (x, z, rot) => { // minber (basamaklı ahşap kürsü)
      for (let k = 0; k < 4; k++) pbox(c, x, z, rot, -0.5, 0, -1.1 + k * 0.5, 0.5, 0.45 + k * 0.45, 1.1, 'wood', '#6e4a2e');
      pbox(c, x, z, rot, -0.55, 0, -1.15, -0.45, 2.4, 1.15, 'wood', '#5d3f26');
      pbox(c, x, z, rot, 0.45, 0, -1.15, 0.55, 2.4, 1.15, 'wood', '#5d3f26');
    }, { prefer: ['B'] });
    for (let i = 0; i < 2; i++) {
      protoItem(c, P, 1.2, 0.4, 1.6, (x, z, rot) => {
        pbox(c, x, z, rot, -0.6, 0, -0.2, 0.6, 1.6, 0.2, 'wood', '#7a5532');
        for (let k = 0; k < 3; k++) pbox(c, x, z, rot, -0.55, 0.35 + k * 0.45, -0.15, 0.55, 0.62 + k * 0.45, 0.18, 'decor', ['#1f4e79', '#7b241c', '#145a32'][k]);
      }, { container: 'bookshelf', label: 'Kitaplık', prefer: ['L', 'R'] });
    }
    protoItem(c, P, 1.8, 0.4, 1.1, (x, z, rot) => {
      pbox(c, x, z, rot, -0.9, 0, -0.2, 0.9, 1.1, 0.2, 'wood', '#8b6a45');
      for (let k = 0; k < 3; k++) pbox(c, x, z, rot, -0.85, 0.1 + k * 0.33, 0.12, 0.85, 0.13 + k * 0.33, 0.21, 'wood', '#5d4630');
    }, { container: 'locker', label: 'Ayakkabılık', prefer: ['F'] });
  },
  corridor() {},
};

// ----------------------------------------------------------------------- ortak parçalar

function boxArgs(c, cx, cz, w, d, h) {
  const wb = c.fr.box(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  const y0 = c.baseY + c.F;
  return [wb.minX, wb.minZ, wb.maxX, wb.maxZ, y0, y0 + h, { kind: 'prop', owner: c.B }];
}

function shelvesAlong(c, P, n, ctype, palette, frame = '#8e9aa3', h = 1.9) {
  for (let i = 0; i < n; i++) {
    const len = 1.8;
    const slot = P.alloc(len, true, null, 0.5);
    if (!slot) return;
    const pos = P.wallPos(slot, 0.5);
    shelfUnit(c, pos.x, pos.z, pos.rot, len, 0.5, h, 4, frame, palette, 0.75);
    collide(c, pos.x, pos.z, len, 0.5, pos.rot, h);
    if (ctype) container(c, ctype, pos.x, pos.z, 1.0);
  }
}

function medCart(c, P) {
  protoItem(c, P, 0.8, 0.5, 1.0, (x, z, rot) => {
    pbox(c, x, z, rot, -0.4, 0.15, -0.25, 0.4, 0.95, 0.25, 'plain', '#ecf0f1');
    pbox(c, x, z, rot, -0.38, 0.95, -0.23, 0.38, 1.0, 0.23, 'plain', '#c0392b');
    for (let i = 0; i < 3; i++) pbox(c, x, z, rot, -0.35, 0.25 + i * 0.24, 0.25, 0.35, 0.27 + i * 0.24, 0.27, 'plain', '#95a5a6');
  }, { container: 'medical_cart' });
}

function militaryCrate(c, P) {
  protoItem(c, P, 1.2, 0.7, 0.7, (x, z, rot) => {
    pbox(c, x, z, rot, -0.6, 0, -0.35, 0.6, 0.6, 0.35, 'wood', '#4d5a2a');
    pbox(c, x, z, rot, -0.15, 0.25, 0.35, 0.15, 0.4, 0.37, 'plain', '#d4ac0d');
    c.frontColor = '#3d4820'; // arkadan menteşeli kapak Fronts'ta
  }, { container: 'ammo_crate' });
}

function furnitureBarrel(c, P) {
  const slot = P.alloc(0.8, false, null, 0.8);
  if (!slot) return;
  const pos = P.wallPos(slot, 0.8);
  model(c, 'props', c.rng.pick(['Barrel_A', 'Barrel_B', 'Barrel_C']), pos.x, c.F + 0.45, pos.z, c.rng.next() * 6, 0.9);
  collide(c, pos.x, pos.z, 0.8, 0.8, 0, 0.95);
  container(c, 'barrel', pos.x, pos.z, 0.9);
}

function bigRack(c, xc, z, len) {
  const hl = len / 2;
  for (let x = -hl; x <= hl + 0.01; x += len / 3) for (const dz of [-0.65, 0.6]) pbox(c, xc + x, z, 0, -0.05, 0, dz, 0.05, 3.4, dz + 0.05, 'metal', '#e67e22');
  for (const y of [0.15, 1.3, 2.45]) {
    pbox(c, xc, z, 0, -hl, y, -0.7, hl, y + 0.12, -0.6, 'metal', '#2471a3');
    pbox(c, xc, z, 0, -hl, y, 0.6, hl, y + 0.12, 0.7, 'metal', '#2471a3');
    for (let x = -hl + 0.3; x < hl - 0.8; x += 1.4) {
      pbox(c, xc, z, 0, x, y + 0.12, -0.55, x + 1.1, y + 0.25, 0.55, 'wood', '#b9770e');
      if (c.rng.next() < 0.8) pbox(c, xc, z, 0, x + 0.05, y + 0.25, -0.5, x + 1.05, y + 0.25 + 0.4 + c.rng.next() * 0.4, 0.5, 'plain', c.rng.pick(['#d2b48c', '#c4a484', '#5d6d7e', '#2e86c1', '#7f8c8d']));
    }
  }
}

/** Dışarıdan çağrılan oda döşeme girişi */
export function furnishRoom(r, c) {
  const fn = ROOMS[r.type];
  if (!fn) return;
  c.curRoom = r.id;
  const P = new RoomPlacer(r, c);
  try { fn(r, c, P); } catch (e) { console.warn('Döşeme hatası', r.type, e); }
}

export { model as placeModel, container as addContainer, collide as addCollide, pbox, shelfUnit };
