// İnşa edilebilir yapılar (BuildingManager). Kategoriler konsept sanattaki "ÜS GELİŞTİRME" menüsüyle aynı.
// size: [genişlik(x), yükseklik, derinlik(z)] metre. time: oyun dakikası (çalışan sayısına bölünür).
// score: üs seviyesine katkı {def: savunma, comfort: konfor, util: altyapı}

export const BUILD_CATS = {
  walls: { name: 'Duvarlar', icon: '🧱' }, defense: { name: 'Savunma', icon: '🛡️' }, craft: { name: 'Üretim', icon: '🔨' }, storage: { name: 'Depolama', icon: '📦' },
  power: { name: 'Elektrik', icon: '⚡' }, garden: { name: 'Bahçe', icon: '🌱' }, decor: { name: 'Dekorasyon', icon: '🛋️' },
};

const B = (id, o) => ({ id, hp: 200, time: 15, tools: ['hammer'], snap: 0.5, size: [2, 1, 0.4], score: {}, ...o });

export const BUILDABLES = {
  // ---- duvarlar
  wood_wall: B('wood_wall', { cat: 'walls', name: 'Tahta Duvar', cost: [['plank', 4], ['nails', 8]], size: [2.2, 2.6, 0.25], hp: 320, time: 20, score: { def: 4 }, navBlock: true, desc: 'Zombileri durdurur. Ağır zombiler kırabilir.' }),
  metal_wall: B('metal_wall', { cat: 'walls', name: 'Metal Duvar', cost: [['metal_sheet', 2], ['screws', 12]], size: [2.2, 2.6, 0.2], hp: 750, time: 35, score: { def: 9 }, navBlock: true, desc: 'En dayanıklı duvar.' }),
  wood_fence: B('wood_fence', { cat: 'walls', name: 'Tahta Çit', cost: [['plank', 2], ['nails', 4]], size: [2.2, 1.2, 0.2], hp: 130, time: 8, score: { def: 2 }, navBlock: true, desc: 'Alçak çit. Zombileri yavaşlatır.' }),
  wood_door: B('wood_door', { cat: 'walls', name: 'Kapılı Duvar', cost: [['plank', 6], ['nails', 12]], size: [2.2, 2.6, 0.25], hp: 260, time: 30, score: { def: 3 }, navBlock: true, door: true, desc: 'Takımın geçebileceği bir kapı (E ile aç/kapat).' }),
  // ---- savunma
  barricade_wood: B('barricade_wood', { cat: 'defense', name: 'Tahta Barikat', cost: [['plank', 3], ['nails', 6]], size: [2.0, 1.3, 0.6], hp: 240, time: 10, score: { def: 3 }, navBlock: true, desc: 'Hızlı kurulan engel. Üzerinden atlanabilir.' }),
  barricade_metal: B('barricade_metal', { cat: 'defense', name: 'Metal Barikat', cost: [['metal_sheet', 2], ['screws', 8], ['scrap_metal', 2]], size: [2.0, 1.4, 0.6], hp: 520, time: 25, score: { def: 6 }, navBlock: true, desc: 'Ağır zombilere karşı.' }),
  barbed_wire: B('barbed_wire', { cat: 'defense', name: 'Dikenli Tel', cost: [['scrap_metal', 2], ['wire', 1]], size: [2.4, 0.8, 0.8], hp: 160, time: 10, score: { def: 3 }, trap: { slow: 0.45, dps: 6 }, desc: 'Zombileri yavaşlatır ve yaralar.' }),
  spike_trap: B('spike_trap', { cat: 'defense', name: 'Çivili Tuzak', cost: [['plank', 2], ['nails', 15]], size: [1.4, 0.2, 1.4], hp: 100, time: 8, score: { def: 2 }, trap: { dmg: 45, uses: 8 }, desc: 'Üstüne basan zombiye ağır hasar (8 kullanım).' }),
  alarm: B('alarm', { cat: 'defense', name: 'Alarm', cost: [['electronics', 1], ['battery', 1], ['wire', 1]], size: [0.4, 0.5, 0.3], hp: 60, time: 10, tools: ['screwdriver'], score: { def: 2, util: 1 }, sensor: 14, desc: 'Yakına zombi gelince takımı uyarır (ve gürültü yapar!).' }),
  camera: B('camera', { cat: 'defense', name: 'Güvenlik Kamerası', cost: [['electronics', 2], ['wire', 1], ['glass', 1]], size: [0.4, 2.2, 0.4], hp: 60, time: 15, tools: ['screwdriver'], score: { def: 2, util: 2 }, power: 1, camera: 40, desc: 'Elektrikle çalışır. 40 m içindeki zombileri mini haritada gösterir.' }),
  floodlight: B('floodlight', { cat: 'defense', name: 'Projektör', cost: [['electronics', 1], ['wire', 2], ['glass', 1], ['scrap_metal', 1]], size: [0.6, 2.6, 0.6], hp: 80, time: 12, tools: ['screwdriver'], score: { def: 2, util: 1 }, power: 2, light: 18, desc: 'Geceleri üssü aydınlatır. Elektrik ister.' }),
  watchtower: B('watchtower', { cat: 'defense', name: 'Gözetleme Kulesi', cost: [['plank', 10], ['nails', 20], ['rope', 2]], size: [3.4, 4.6, 3.4], hp: 400, time: 45, score: { def: 6 }, tower: true, desc: 'Tırmanılabilir savunma kulesi.' }),
  // ---- üretim
  workbench: B('workbench', { cat: 'craft', name: 'Çalışma Tezgâhı', cost: [['plank', 4], ['nails', 8]], size: [1.8, 1.0, 0.9], hp: 200, time: 20, score: { util: 3 }, station: 'workbench', level: 1, desc: 'Gelişmiş üretim için gerekli (Seviye 1).' }),
  workbench2: B('workbench2', { cat: 'craft', name: 'Atölye Seviye 2', cost: [['metal_sheet', 2], ['electronics', 1], ['screws', 10], ['plank', 4]], size: [2.2, 1.6, 1.0], hp: 300, time: 40, score: { util: 5 }, station: 'workbench', level: 2, desc: 'Telsiz, arbalet ve zırh kiti üretimi.' }),
  workbench3: B('workbench3', { cat: 'craft', name: 'Atölye Seviye 3', cost: [['metal_sheet', 4], ['electronics', 3], ['engine_part', 1], ['screws', 20]], size: [2.6, 1.8, 1.1], hp: 400, time: 60, score: { util: 8 }, station: 'workbench', level: 3, desc: 'Mermi doldurma ve ileri seviye üretim.' }),
  campfire: B('campfire', { cat: 'craft', name: 'Kamp Ateşi', cost: [['log', 1], ['plank', 2]], size: [1.4, 0.6, 1.4], hp: 80, time: 5, tools: [], score: { comfort: 2, util: 1 }, station: 'fire', fire: true, light: 9, warmth: 8, desc: 'Yemek pişir, ısın, aydınlan. Zamanla söner (tahta ekle).' }),
  water_filter: B('water_filter', { cat: 'craft', name: 'Su Filtresi', cost: [['plastic', 2], ['glass', 1], ['cloth', 2], ['charcoal', 1]], size: [0.7, 1.4, 0.7], hp: 100, time: 15, score: { util: 4 }, station: 'water_filter', desc: 'Kirli suyu içilebilir hale getirir.' }),
  rain_collector: B('rain_collector', { cat: 'garden', name: 'Yağmur Suyu Deposu', cost: [['plastic', 3], ['plank', 2], ['rope', 1]], size: [1.2, 1.6, 1.2], hp: 120, time: 15, score: { util: 4 }, rain: 20, desc: 'Yağmurda dolar (20 şişe). Şişe doldur.' }),
  // ---- depolama
  storage_crate: B('storage_crate', { cat: 'storage', name: 'Ahşap Sandık', cost: [['plank', 4], ['nails', 6]], size: [1.2, 0.8, 0.8], hp: 150, time: 10, score: { util: 2 }, storage: 20, desc: 'Ortak depo: 20 yuva.' }),
  shelf: B('shelf', { cat: 'storage', name: 'Depo Rafı', cost: [['plank', 6], ['nails', 10], ['scrap_metal', 2]], size: [2.0, 2.0, 0.6], hp: 200, time: 20, score: { util: 3 }, storage: 32, desc: 'Ortak depo: 32 yuva.' }),
  // ---- elektrik
  lamp: B('lamp', { cat: 'power', name: 'Lamba', cost: [['electronics', 1], ['wire', 1], ['glass', 1]], size: [0.4, 1.8, 0.4], hp: 40, time: 8, tools: ['screwdriver'], score: { comfort: 2, util: 1 }, power: 1, light: 10, desc: 'Elektrikle çalışır. Moral verir.' }),
  solar_panel: B('solar_panel', { cat: 'power', name: 'Güneş Paneli', cost: [['electronics', 3], ['glass', 2], ['metal_sheet', 2], ['wire', 4]], size: [2.0, 1.2, 1.4], hp: 120, time: 30, tools: ['screwdriver'], score: { util: 6 }, powerGen: 4, desc: 'Gündüz bedava elektrik üretir.' }),
  antenna: B('antenna', { cat: 'power', name: 'Telsiz Anteni', cost: [['metal_sheet', 2], ['wire', 3], ['electronics', 2]], size: [1.2, 6, 1.2], hp: 150, time: 40, tools: ['screwdriver', 'wrench'], score: { util: 6 }, antenna: true, desc: 'Uzak telsiz yayınlarını yakalar. Askerî tahliye için şart.' }),
  // ---- bahçe
  garden_plot: B('garden_plot', { cat: 'garden', name: 'Sebze Tarhı', cost: [['plank', 4]], size: [2.4, 0.4, 4.2], hp: 100, time: 10, tools: [], score: { util: 3, comfort: 1 }, garden: true, desc: 'Tohum ek, sula, hasat et.' }),
  // ---- dekorasyon
  bed: B('bed', { cat: 'decor', name: 'Yatak', cost: [['plank', 4], ['cloth', 4]], size: [1.2, 0.7, 2.1], hp: 100, time: 15, score: { comfort: 4 }, bed: true, desc: 'Uyuma ve yeniden doğma noktası.' }),
  couch: B('couch', { cat: 'decor', name: 'Kanepe', cost: [['plank', 4], ['cloth', 6]], size: [2.1, 0.9, 1.1], hp: 100, time: 15, score: { comfort: 4 }, desc: 'Moral +' }),
  table: B('table', { cat: 'decor', name: 'Masa', cost: [['plank', 4], ['nails', 4]], size: [1.6, 0.8, 1.0], hp: 80, time: 10, score: { comfort: 2 }, desc: 'Moral +' }),
  rug: B('rug', { cat: 'decor', name: 'Halı', cost: [['cloth', 4]], size: [2.1, 0.05, 1.4], hp: 20, time: 5, tools: [], score: { comfort: 2 }, walkThrough: true, desc: 'Ev sıcaklığı.' }),
  plant: B('plant', { cat: 'decor', name: 'Saksı Bitkisi', cost: [['seeds', 1], ['plastic', 1]], size: [0.6, 0.8, 0.6], hp: 20, time: 3, tools: [], score: { comfort: 1 }, desc: 'Biraz yeşillik.' }),
  guitar: B('guitar', { cat: 'decor', name: 'Gitar Köşesi', cost: [['plank', 2], ['wire', 2]], size: [0.6, 1.2, 0.4], hp: 20, time: 10, score: { comfort: 3 }, music: true, desc: 'E ile çal: yakındaki herkese moral.' }),
};

// Özel üs projeleri (etkileşimle yapılır)
export const PROJECTS = {
  generator: {
    name: 'Jeneratör Onarımı', desc: 'Eski jeneratörü onar. Elektrik: lambalar, kamera, buzdolabı, projektör.',
    stages: [{ name: 'Jeneratörü Onar', cost: [['engine_part', 1], ['electronics', 2], ['wire', 1]], time: 30, tools: ['wrench'] }],
  },
  bunker: {
    name: 'Yeraltı Sığınağı', desc: 'Büyük felakete karşı en güvenli yer. 4 aşamada inşa edilir.',
    stages: [
      { name: 'Kazı ve Destekler', cost: [['plank', 8]], time: 120, tools: ['shovel'] },
      { name: 'Beton Dökme', cost: [['concrete', 6], ['scrap_metal', 6]], time: 120, tools: ['shovel', 'hammer'] },
      { name: 'Havalandırma ve Depo', cost: [['metal_sheet', 4], ['wire', 4], ['electronics', 2]], time: 90, tools: ['screwdriver'] },
      { name: 'Enerji ve Su Sistemi', cost: [['car_battery', 1], ['electronics', 3], ['plastic', 3]], time: 90, tools: ['screwdriver', 'wrench'] },
    ],
  },
  window: { name: 'Pencere Güçlendirme', cost: [['plank', 2], ['nails', 4]], time: 5, tools: ['hammer'] },
  door: { name: 'Kapı Güçlendirme', cost: [['plank', 3], ['nails', 6]], time: 6, tools: ['hammer'] },
};
