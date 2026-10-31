// Bina şablonları. Şablon koordinatları: x ∈ [0,w], z ∈ [0,d]; ön cephe z = d.
// Odalar ayak izini tamamen döşemelidir. links: [odaA, odaB, tür('wood'|'arch'|'double'|'metal'|'lab'|'cell'), konum?, kilitSeviyesi?]

const R = (id, type, x0, z0, x1, z1, extra = {}) => ({ id, type, x0, z0, x1, z1, ...extra });

const HOUSE_COLORS = ['#e9c48f', '#b9d3e0', '#f0d9d0', '#d7e8c4', '#f2e2b8', '#e8b6a0', '#c8d6b0', '#e6d2f0', '#f5efe0'];
const ROOF_COLORS = ['#8c3b2a', '#4c5a6a', '#7a3226', '#5b4636', '#3f4b5c', '#6b3a2a', '#7a4a2a', '#4a3d5c'];

function houseStyle(spec, rng) {
  return {
    ext: rng.chance(0.25) ? 'brick' : 'siding',
    extColor: spec.paint || rng.pick(HOUSE_COLORS), roofColor: spec.roofCol || rng.pick(ROOF_COLORS),
    trimColor: '#f7f3ea', intColor: rng.pick(['#f1e9dc', '#e8efe9', '#f2e6e1', '#e9eef5']), roof: 'gable', floor: 'woodfloor',
  };
}

export const TEMPLATES = {
  // ---------------------------------------------------------------- KONUTLAR
  house_player: (spec) => ({
    label: 'Evimiz', w: 25, d: 13, H: 3.0, chimney: true,
    style: { ext: 'siding', extColor: '#d9b07a', extColorRoof: '#d9b07a', roofColor: '#7d3c2b', trimColor: '#f6efe0', intColor: '#f3e7d3', roof: 'gable', floor: 'woodfloor' },
    rooms: [
      R('living', 'living', 0, 6.5, 10, 13, { name: 'Salon' }),
      R('kitchen', 'kitchen', 10, 6.5, 18, 13, { name: 'Mutfak' }),
      R('bed1', 'bedroom', 0, 0, 6, 6.5, { name: 'Yatak Odası 1', beds: 2 }),
      R('bath', 'bathroom', 6, 0, 9.5, 6.5, { name: 'Banyo' }),
      R('bed2', 'bedroom', 9.5, 0, 14, 6.5, { name: 'Yatak Odası 2', beds: 2 }),
      R('storage', 'security', 14, 0, 18, 6.5, { name: 'Depo / Güvenlik Odası' }),
      R('garage', 'garage', 18, 0, 25, 13, { name: 'Garaj & Atölye', workshop: true, keepCarSpace: true }),
    ],
    links: [['living', 'kitchen', 'arch'], ['living', 'bed1'], ['living', 'bath'], ['kitchen', 'bed2'], ['kitchen', 'storage'], ['kitchen', 'garage', 'wood', 9.8]],
    extDoors: [
      { side: 'F', at: 5, w: 1.1, kind: 'wood', name: 'Ön Kapı' },
      { side: 'B', at: 16, w: 1.0, kind: 'wood', name: 'Arka Kapı' },
      { side: 'F', at: 21.5, w: 3.8, kind: 'garage', name: 'Garaj Kapısı' },
    ],
    porch: { x0: 0.5, z0: 13.1, x1: 10, z1: 15.4, roof: true },
    isHome: true,
  }),
  house_a: (spec, rng) => ({
    label: 'Ev', w: 14, d: 11, H: 2.9, chimney: rng.chance(0.5), style: houseStyle(spec, rng),
    rooms: [
      R('living', 'living', 0, 5.5, 8.5, 11), R('kitchen', 'kitchen', 8.5, 5.5, 14, 11),
      R('bed1', 'bedroom', 0, 0, 6, 5.5), R('bath', 'bathroom', 6, 0, 9, 5.5), R('bed2', 'bedroom', 9, 0, 14, 5.5),
    ],
    links: [['living', 'kitchen', 'arch'], ['living', 'bed1'], ['living', 'bath'], ['kitchen', 'bed2']],
    extDoors: [{ side: 'F', at: 4, w: 1.05, kind: 'wood' }, { side: 'R', at: 8.2, w: 1.0, kind: 'wood' }],
    porch: { x0: 1, z0: 11.1, x1: 7, z1: 12.9, roof: rng.chance(0.7) },
  }),
  house_b: (spec, rng) => ({
    label: 'Ev', w: 12, d: 10, H: 2.9, chimney: rng.chance(0.4), style: houseStyle(spec, rng),
    rooms: [
      R('living', 'living', 0, 4.5, 7, 10), R('kitchen', 'kitchen', 7, 4.5, 12, 10),
      R('bed1', 'bedroom', 0, 0, 5, 4.5), R('bath', 'bathroom', 5, 0, 7.5, 4.5), R('bed2', 'bedroom', 7.5, 0, 12, 4.5),
    ],
    links: [['living', 'kitchen', 'arch'], ['living', 'bed1'], ['living', 'bath'], ['kitchen', 'bed2']],
    extDoors: [{ side: 'F', at: 3.5, w: 1.05, kind: 'wood' }, { side: 'L', at: 7.2, w: 1.0, kind: 'wood' }],
    porch: { x0: 0.6, z0: 10.1, x1: 6.4, z1: 11.7, roof: false },
  }),
  house_small: (spec, rng) => ({
    label: 'Küçük Ev', w: 10, d: 8, H: 2.8, style: houseStyle(spec, rng),
    rooms: [R('living', 'living', 0, 3.5, 6, 8), R('bed', 'bedroom', 0, 0, 6, 3.5), R('kitchen', 'kitchen', 6, 3.5, 10, 8), R('bath', 'bathroom', 6, 0, 10, 3.5)],
    links: [['living', 'bed'], ['living', 'kitchen', 'arch'], ['kitchen', 'bath']],
    extDoors: [{ side: 'F', at: 3, w: 1.05, kind: 'wood' }],
  }),
  cabin: (spec, rng) => ({
    label: spec.name || 'Kulübe', w: 6, d: 5, H: 2.7,
    style: { ext: 'wood', extColor: '#9a6a44', extColorRoof: '#9a6a44', roofColor: '#4a3a2c', trimColor: '#6e4a2e', intColor: '#c9a27a', roof: 'gable', floor: 'woodfloor' },
    rooms: [R('main', 'cabin_main', 0, 0, 6, 5)],
    extDoors: [{ side: 'F', at: 3, w: 1.0, kind: 'wood' }],
    porch: { x0: 0.5, z0: 5.1, x1: 5.5, z1: 6.4, roof: true },
    chimney: rng.chance(0.6),
  }),
  // ---------------------------------------------------------------- TİCARİ
  market_small: () => ({
    label: 'Market', w: 14, d: 10, H: 3.6, storefront: true,
    style: { ext: 'plaster', extColor: '#f1e3c6', trimColor: '#c0392b', intColor: '#f4f1e8', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'shop_hall', 0, 3.5, 14, 10, { goods: 'food' }), R('storage', 'shop_storage', 0, 0, 9, 3.5), R('office', 'office', 9, 0, 14, 3.5)],
    links: [['hall', 'storage'], ['hall', 'office']],
    extDoors: [{ side: 'F', at: 7, w: 2.0, kind: 'glass2' }, { side: 'B', at: 4, w: 1.0, kind: 'metal' }],
  }),
  supermarket: () => ({
    label: 'Süpermarket', w: 32, d: 24, H: 5, storefront: true,
    style: { ext: 'plaster', extColor: '#ece6d8', trimColor: '#c0392b', intColor: '#f6f3ea', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'shop_hall', 0, 8, 32, 24, { goods: 'food', big: true }), R('storage', 'shop_storage', 0, 0, 20, 8), R('office', 'office', 20, 0, 26, 8), R('wc', 'bathroom', 26, 0, 32, 8)],
    links: [['hall', 'storage', 'double'], ['hall', 'office'], ['hall', 'wc']],
    extDoors: [{ side: 'F', at: 16, w: 3.0, kind: 'glass2' }, { side: 'B', at: 9, w: 3.2, kind: 'garage' }],
  }),
  pharmacy: () => ({
    label: 'Eczane', w: 12, d: 10, H: 3.6, storefront: true,
    style: { ext: 'plaster', extColor: '#f3f6f4', trimColor: '#27ae60', intColor: '#ffffff', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'shop_hall', 0, 3.5, 12, 10, { goods: 'med' }), R('storage', 'pharmacy_store', 0, 0, 12, 3.5)],
    links: [['hall', 'storage', 'wood', 9]],
    extDoors: [{ side: 'F', at: 6, w: 1.8, kind: 'glass2' }],
  }),
  restaurant: () => ({
    label: 'Lokanta', w: 14, d: 10, H: 3.6, storefront: true,
    style: { ext: 'brick', extColor: '#c97b5a', trimColor: '#f1e2c8', intColor: '#f5e6cf', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'restaurant_hall', 0, 4, 14, 10), R('kitchen', 'kitchen', 0, 0, 9, 4, { pro: true }), R('wc', 'bathroom', 9, 0, 14, 4)],
    links: [['hall', 'kitchen', 'wood', 4.5], ['hall', 'wc']],
    extDoors: [{ side: 'F', at: 7, w: 1.8, kind: 'glass2' }],
  }),
  cafe: () => ({
    label: 'Kafe', w: 10, d: 8, H: 3.4, storefront: true,
    style: { ext: 'plaster', extColor: '#f0d6a8', trimColor: '#6b4226', intColor: '#f7ead6', roof: 'flat', floor: 'woodfloor' },
    rooms: [R('hall', 'cafe_hall', 0, 3, 10, 8), R('kitchen', 'kitchen', 0, 0, 10, 3, { pro: true })],
    links: [['hall', 'kitchen']],
    extDoors: [{ side: 'F', at: 5, w: 1.8, kind: 'glass2' }],
  }),
  mall: () => ({
    label: 'AVM', w: 34, d: 26, H: 5.5, storefront: true,
    style: { ext: 'concrete', extColor: '#d7d2ca', trimColor: '#8e44ad', intColor: '#f4f2ef', roof: 'flat', floor: 'tiles' },
    rooms: [
      R('hall', 'lobby', 8, 8, 26, 26, { name: 'AVM Galerisi', mallHall: true }),
      R('clothes', 'shop_hall', 0, 13, 8, 26, { goods: 'clothes', name: 'Giyim Mağazası' }),
      R('elec', 'shop_hall', 26, 13, 34, 26, { goods: 'electronics', name: 'Elektronik Mağazası' }),
      R('sports', 'shop_hall', 0, 0, 8, 13, { goods: 'sports', name: 'Spor & Kamp Mağazası' }),
      R('toys', 'shop_hall', 26, 0, 34, 13, { goods: 'tools', name: 'Yapı Market' }),
      R('food', 'restaurant_hall', 8, 0, 26, 8, { name: 'Yemek Katı' }),
    ],
    links: [['hall', 'clothes', 'double'], ['hall', 'elec', 'double'], ['hall', 'sports', 'double', 4], ['hall', 'toys', 'double', 4], ['hall', 'food', 'arch']],
    extDoors: [{ side: 'F', at: 17, w: 4.0, kind: 'glass2' }, { side: 'L', at: 6, w: 1.0, kind: 'metal' }],
  }),
  office: () => ({
    label: 'Ofis', w: 18, d: 14, H: 3.6,
    style: { ext: 'concrete', extColor: '#c9d3da', trimColor: '#34495e', intColor: '#eef1f3', roof: 'flat', floor: 'carpet' },
    rooms: [R('lobby', 'lobby', 0, 7, 18, 14), R('o1', 'office', 0, 0, 9, 7), R('o2', 'office', 9, 0, 18, 7)],
    links: [['lobby', 'o1'], ['lobby', 'o2']],
    extDoors: [{ side: 'F', at: 9, w: 2.0, kind: 'glass2' }],
  }),
  hardware: () => ({
    label: 'Nalbur', w: 14, d: 10, H: 3.8, storefront: true,
    style: { ext: 'brick', extColor: '#b65e3c', trimColor: '#f39c12', intColor: '#f1ece2', roof: 'flat', floor: 'concrete' },
    rooms: [R('hall', 'shop_hall', 0, 3.5, 14, 10, { goods: 'tools' }), R('storage', 'shop_storage', 0, 0, 14, 3.5, { goods: 'tools' })],
    links: [['hall', 'storage']],
    extDoors: [{ side: 'F', at: 7, w: 1.8, kind: 'glass2' }],
  }),
  bank: () => ({
    label: 'Banka', w: 16, d: 12, H: 4,
    style: { ext: 'concrete', extColor: '#e3dccb', trimColor: '#1e6b52', intColor: '#f5f1e6', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'bank_hall', 0, 5, 16, 12), R('vault', 'vault', 0, 0, 7, 5), R('office', 'office', 7, 0, 16, 5)],
    links: [['hall', 'vault', 'vault', 3.5, 2], ['hall', 'office']],
    extDoors: [{ side: 'F', at: 8, w: 2.0, kind: 'glass2' }],
  }),
  hospital: () => ({
    label: 'Hastane', w: 40, d: 24, H: 4, storefront: false,
    style: { ext: 'plaster', extColor: '#eef2f3', trimColor: '#c0392b', intColor: '#f7fbfb', roof: 'flat', floor: 'tiles' },
    rooms: [
      R('lobby', 'lobby_med', 14, 12, 26, 24, { name: 'Acil Servis' }), R('wardA', 'ward', 0, 12, 14, 24), R('wardB', 'ward', 26, 12, 40, 24),
      R('corr', 'corridor', 0, 8, 40, 12, { name: 'Koridor', noWindows: true }),
      R('surgery', 'surgery', 0, 0, 10, 8), R('pharm', 'pharmacy_store', 10, 0, 18, 8), R('office', 'office', 18, 0, 26, 8, { name: 'Başhekim Odası', docs: 'hospital' }),
      R('lab', 'lab', 26, 0, 33, 8, { name: 'Tahlil Laboratuvarı' }), R('store', 'storage', 33, 0, 40, 8, { goods: 'med' }),
    ],
    links: [['lobby', 'wardA', 'double'], ['lobby', 'wardB', 'double'], ['lobby', 'corr', 'arch'], ['corr', 'surgery'], ['corr', 'pharm', 'wood', 14, 1], ['corr', 'office'], ['corr', 'lab'], ['corr', 'store'], ['corr', 'wardA'], ['corr', 'wardB']],
    extDoors: [{ side: 'F', at: 20, w: 3.0, kind: 'glass2' }, { side: 'B', at: 36.5, w: 1.2, kind: 'metal' }],
  }),
  police: () => ({
    label: 'Polis Merkezi', w: 22, d: 16, H: 3.8,
    style: { ext: 'brick', extColor: '#8d9aa8', trimColor: '#1f4e8c', intColor: '#eef2f6', roof: 'flat', floor: 'tiles' },
    rooms: [R('lobby', 'lobby', 0, 8, 14, 16, { name: 'Karşılama' }), R('office', 'office', 14, 8, 22, 16, { name: 'Komiser Odası' }), R('offices', 'office', 0, 0, 8, 8), R('armory', 'armory', 8, 0, 14, 8, { police: true }), R('cells', 'cells', 14, 0, 22, 8)],
    links: [['lobby', 'office'], ['lobby', 'offices'], ['lobby', 'armory', 'metal', 11, 1], ['lobby', 'cells', 'metal']],
    extDoors: [{ side: 'F', at: 7, w: 2.0, kind: 'glass2' }],
  }),
  gas_shop: () => ({
    label: 'Benzinlik Marketi', w: 12, d: 9, H: 3.4, storefront: true,
    style: { ext: 'plaster', extColor: '#f6f1e7', trimColor: '#e67e22', intColor: '#fbf8f2', roof: 'flat', floor: 'tiles' },
    rooms: [R('hall', 'shop_hall', 0, 3, 12, 9, { goods: 'gas' }), R('storage', 'shop_storage', 0, 0, 12, 3, { goods: 'car' })],
    links: [['hall', 'storage', 'wood', 9]],
    extDoors: [{ side: 'F', at: 6, w: 1.8, kind: 'glass2' }],
  }),
  repair_small: () => ({
    label: 'Lastikçi', w: 10, d: 9, H: 4,
    style: { ext: 'metal', extColor: '#d0d4d6', trimColor: '#e67e22', intColor: '#d9d6d0', roof: 'flat', floor: 'concrete' },
    rooms: [R('bay', 'garage', 0, 0, 10, 9, { workshop: true, goods: 'car' })],
    extDoors: [{ side: 'F', at: 5, w: 4.0, kind: 'garage' }],
  }),
  // ---------------------------------------------------------------- SANAYİ
  warehouse_small: () => ({
    label: 'Depo', w: 18, d: 14, H: 5,
    style: { ext: 'metal', extColor: '#a7b4b8', trimColor: '#e6c84a', intColor: '#c9cdcc', roof: 'shed', roofMat: 'metal', roofColor: '#8a9599', floor: 'concrete' },
    rooms: [R('hall', 'warehouse_hall', 0, 4, 18, 14), R('office', 'office', 0, 0, 6, 4), R('storage', 'shop_storage', 6, 0, 18, 4, { goods: 'build' })],
    links: [['hall', 'office'], ['hall', 'storage', 'double', 12]],
    extDoors: [{ side: 'F', at: 10.5, w: 4.2, kind: 'garage' }, { side: 'F', at: 3, w: 1.0, kind: 'metal' }],
  }),
  warehouse: () => ({
    label: 'Metal Deposu', w: 24, d: 18, H: 6.5,
    style: { ext: 'metal', extColor: '#8fa3ad', trimColor: '#f1c40f', intColor: '#c7cbc8', roof: 'shed', roofMat: 'metal', roofColor: '#7f8c8d', floor: 'concrete' },
    rooms: [R('hall', 'warehouse_hall', 0, 4, 24, 18, { goods: 'metal' }), R('office', 'office', 0, 0, 8, 4), R('storage', 'shop_storage', 8, 0, 24, 4, { goods: 'build' })],
    links: [['hall', 'office'], ['hall', 'storage', 'double']],
    extDoors: [{ side: 'F', at: 12, w: 5, kind: 'garage' }, { side: 'F', at: 3, w: 1.0, kind: 'metal' }],
  }),
  factory: () => ({
    label: 'Fabrika', w: 36, d: 24, H: 7,
    style: { ext: 'brick', extColor: '#a0523d', trimColor: '#d5c6a1', intColor: '#c9c3b6', roof: 'shed', roofMat: 'metal', roofColor: '#6d7a7e', floor: 'concrete' },
    rooms: [R('hall', 'factory_hall', 0, 6, 36, 24), R('office', 'office', 0, 0, 8, 6, { docs: 'factory' }), R('storage', 'shop_storage', 8, 0, 28, 6, { goods: 'build' }), R('lockers', 'barracks_room', 28, 0, 36, 6, { name: 'Soyunma Odası', lockers: true })],
    links: [['hall', 'office'], ['hall', 'storage', 'double'], ['hall', 'lockers']],
    extDoors: [{ side: 'F', at: 18, w: 5.5, kind: 'garage' }, { side: 'F', at: 4, w: 1.0, kind: 'metal' }],
    windowSpacing: 5,
  }),
  repair_shop: () => ({
    label: 'Oto Tamirhanesi', w: 18, d: 12, H: 5,
    style: { ext: 'metal', extColor: '#c4cdd1', trimColor: '#e74c3c', intColor: '#d3d0ca', roof: 'flat', floor: 'concrete' },
    rooms: [R('bay', 'garage', 0, 0, 12, 12, { workshop: true, goods: 'car', name: 'Tamir Bölmesi' }), R('office', 'office', 12, 6, 18, 12), R('parts', 'storage', 12, 0, 18, 6, { goods: 'car', name: 'Parça Deposu' })],
    links: [['bay', 'office'], ['bay', 'parts'], ['office', 'parts']],
    extDoors: [{ side: 'F', at: 6, w: 5, kind: 'garage' }, { side: 'F', at: 15, w: 1.0, kind: 'wood' }],
  }),
  port_warehouse: () => ({
    label: 'Liman Deposu', w: 22, d: 12, H: 6,
    style: { ext: 'metal', extColor: '#4f8fb0', trimColor: '#f5f5f5', intColor: '#c9cdcc', roof: 'shed', roofMat: 'metal', roofColor: '#3e6f8a', floor: 'concrete' },
    rooms: [R('hall', 'warehouse_hall', 0, 0, 22, 12, { goods: 'port' })],
    extDoors: [{ side: 'F', at: 11, w: 5, kind: 'garage' }, { side: 'F', at: 3, w: 1.0, kind: 'metal' }],
  }),
  harbor_office: () => ({
    label: 'Liman Ofisi', w: 10, d: 8, H: 3.2,
    style: { ext: 'siding', extColor: '#e9f1f4', trimColor: '#2e86c1', intColor: '#f4f7f9', roof: 'gable', roofColor: '#2e4057', floor: 'woodfloor' },
    rooms: [R('office', 'office', 0, 0, 10, 8, { docs: 'port', name: 'Liman Ofisi' })],
    extDoors: [{ side: 'F', at: 5, w: 1.05, kind: 'wood' }],
  }),
  // ---------------------------------------------------------------- ASKERÎ
  barracks: () => ({
    label: 'Kışla', w: 24, d: 10, H: 3.4,
    style: { ext: 'concrete', extColor: '#7d8a5f', trimColor: '#4b5320', intColor: '#d9d8c9', roof: 'gable', roofMat: 'metal', roofColor: '#4e5a3a', floor: 'concrete' },
    rooms: [R('dorm', 'barracks_room', 0, 0, 18, 10), R('store', 'storage', 18, 0, 24, 10, { goods: 'military', name: 'Malzeme Odası' })],
    links: [['dorm', 'store']],
    extDoors: [{ side: 'F', at: 9, w: 1.2, kind: 'metal' }, { side: 'F', at: 21, w: 1.0, kind: 'metal' }],
  }),
  armory: () => ({
    label: 'Cephanelik', w: 12, d: 10, H: 3.5,
    style: { ext: 'concrete', extColor: '#6b7552', trimColor: '#3a4020', intColor: '#cfcfc0', roof: 'flat', floor: 'concrete' },
    rooms: [R('hall', 'armory', 0, 0, 12, 10, { military: true })],
    extDoors: [{ side: 'F', at: 6, w: 1.4, kind: 'metal', locked: true, lockLevel: 1 }],
  }),
  radio_center: () => ({
    label: 'Telsiz Merkezi', w: 12, d: 10, H: 3.5,
    style: { ext: 'concrete', extColor: '#7a8566', trimColor: '#3a4020', intColor: '#d6d6c8', roof: 'flat', floor: 'concrete' },
    rooms: [R('room', 'radio_room', 0, 0, 12, 10, { docs: 'military' })],
    extDoors: [{ side: 'F', at: 6, w: 1.1, kind: 'metal' }],
    extra: (c) => c.ctx.addAntenna && c.ctx.addAntenna(c),
  }),
  booth: () => ({
    label: 'Kontrol Noktası', w: 3.6, d: 3.6, H: 2.8,
    style: { ext: 'concrete', extColor: '#c8c2a8', trimColor: '#d35400', intColor: '#e8e4d6', roof: 'flat', floor: 'concrete' },
    rooms: [R('booth', 'booth', 0, 0, 3.6, 3.6, { docs: 'checkpoint' })],
    extDoors: [{ side: 'F', at: 1.8, w: 1.0, kind: 'metal' }],
  }),
  // ---------------------------------------------------------------- LAB
  lab: () => ({
    label: 'Araştırma Tesisi', w: 28, d: 18, H: 4,
    style: { ext: 'concrete', extColor: '#e4e9ec', trimColor: '#5b2c6f', intColor: '#f2f5f7', roof: 'flat', floor: 'tiles', signBg: '#4a235a', signFg: '#e8daef' },
    rooms: [
      R('lobby', 'lobby', 10, 10, 18, 18, { name: 'Güvenlik Lobisi', security: true }), R('labA', 'lab', 0, 10, 10, 18, { name: 'Laboratuvar A' }), R('labB', 'lab', 18, 10, 28, 18, { name: 'Laboratuvar B', docs: 'lab' }),
      R('corr', 'corridor', 0, 7, 28, 10, { noWindows: true }), R('server', 'server', 0, 0, 7, 7), R('cont', 'containment', 7, 0, 17, 7, { name: 'Karantina Odası', noWindows: true }), R('office', 'office', 17, 0, 28, 7, { docs: 'lab_secret', name: 'Proje Yöneticisi Ofisi' }),
    ],
    links: [['lobby', 'corr', 'lab', 14, 2], ['lobby', 'labA', 'lab'], ['lobby', 'labB', 'lab'], ['corr', 'server', 'lab'], ['corr', 'cont', 'lab', 12, 2], ['corr', 'office', 'lab']],
    extDoors: [{ side: 'F', at: 14, w: 2.0, kind: 'glass2' }],
    windowSpacing: 5,
  }),
};
