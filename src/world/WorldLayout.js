// Dünya yerleşimi — ada haritasının elle tasarlanmış verisi.
// Koordinatlar metre; +X doğu, +Z güney (kuzey = -Z). Bina 'rot' değeri: ön cephenin baktığı yön
// 0:+Z (güney) 1:+X (doğu) 2:-Z (kuzey) 3:-X (batı).

export const WORLD = { size: 1280, half: 640, cell: 4, sea: 0 };

// Bölgeler: plato = düzleştirilmiş zemin dikdörtgeni [x0, z0, x1, z1] ve yüksekliği
export const REGIONS = [
  { id: 'mahalle', name: 'Mahalle', x: -175, z: 172, h: 6, plateau: [-318, 78, -36, 272], danger: 1, theme: 'safe', desc: 'Başlangıç mahallesi. Evimiz burada.' },
  { id: 'sehir', name: 'Şehir Merkezi', x: 100, z: -5, h: 5, plateau: [-8, -118, 232, 102], danger: 3, theme: 'city', desc: 'Süpermarket, eczane, polis merkezi, AVM. Kaynak bol, tehlike yüksek.' },
  { id: 'hastane', name: 'Hastane', x: -88, z: -45, h: 5, plateau: [-130, -80, -8, -8], danger: 3, theme: 'city', desc: 'İlaç ve tıbbi malzeme. Tahliye sonrası kalabalık.' },
  { id: 'benzin', name: 'Benzin İstasyonu', x: 62, z: 302, h: 4, plateau: [12, 272, 112, 336], danger: 2, theme: 'city', desc: 'Yakıt, yedek parça ve market.' },
  { id: 'orman', name: 'Orman', x: -235, z: -160, danger: 2, theme: 'forest', desc: 'Odun, av, göl ve kamp alanları.' },
  { id: 'dag', name: 'Dağ Kampı', x: -338, z: -338, h: 42, plateau: [-366, -366, -310, -310], danger: 2, theme: 'mountain', desc: 'Temiz su, kulübeler. Alternatif final bölgesi.' },
  { id: 'sanayi', name: 'Sanayi Bölgesi', x: 92, z: -305, h: 6, plateau: [8, -368, 194, -256], danger: 3, theme: 'industrial', desc: 'Metal, makine parçaları, oto tamirhanesi.' },
  { id: 'askeri', name: 'Askerî Bölge', x: 345, z: -248, h: 9, plateau: [266, -324, 424, -172], danger: 4, theme: 'military', desc: 'Silah depoları, telsiz merkezi, helikopter pisti.' },
  { id: 'liman', name: 'Liman', x: 330, z: 300, h: 2.4, plateau: [262, 254, 404, 346], danger: 3, theme: 'port', desc: 'Tekneler, konteynerler. Deniz yoluyla kaçış.' },
  { id: 'lab', name: 'Araştırma Laboratuvarı', x: -20, z: -446, h: 12, plateau: [-64, -484, 24, -408], danger: 5, theme: 'lab', desc: 'Salgının sırrı burada saklı.' },
];
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export const LAKE = { x: -196, z: -100, r: 34, level: 4.2 };
// Anakaraya köprü (araç konvoyu finali): askerî bölgenin kuzey kapısından kuzeydoğuya
export const BRIDGE = { start: { x: 406, z: -321 }, end: { x: 548, z: -540 }, exitR: 34 };
export const MOUNTAIN = { x: -372, z: -352, r: 190, peak: 78 };

// Yollar: [genişlik, tür, noktalar] — tür: asfalt | toprak | patika (patika araçla geçilemez)
export const ROADS = [
  // Mahalle
  { id: 'mah_main', w: 10, type: 'asphalt', pts: [[-318, 170], [-120, 170], [-40, 170]] },
  { id: 'mah_w', w: 8, type: 'asphalt', pts: [[-235, 84], [-235, 262]] },
  { id: 'mah_e', w: 8, type: 'asphalt', pts: [[-125, 84], [-125, 262]] },
  // Mahalle → Şehir (ana cadde)
  { id: 'avenue', w: 11, type: 'asphalt', pts: [[-40, 170], [-14, 140], [0, 102]] },
  // Şehir ızgarası
  { id: 'c_x0', w: 10, type: 'asphalt', pts: [[0, 102], [0, -118]] },
  { id: 'c_x70', w: 9, type: 'asphalt', pts: [[70, 102], [70, -118]] },
  { id: 'c_x140', w: 9, type: 'asphalt', pts: [[140, 102], [140, -118]] },
  { id: 'c_x210', w: 9, type: 'asphalt', pts: [[210, 102], [210, -118]] },
  { id: 'c_zn', w: 9, type: 'asphalt', pts: [[-6, -100], [214, -100]] },
  { id: 'c_zm', w: 9, type: 'asphalt', pts: [[-6, -30], [214, -30]] },
  { id: 'c_zs', w: 9, type: 'asphalt', pts: [[-6, 38], [214, 38]] },
  { id: 'c_zss', w: 9, type: 'asphalt', pts: [[-6, 98], [214, 98]] },
  { id: 'hosp', w: 8, type: 'asphalt', pts: [[-60, -45], [0, -45]] },
  // Güney sahil yolu: mahalle → benzinlik → liman
  { id: 'coast_s', w: 9, type: 'asphalt', pts: [[-40, 170], [-6, 232], [38, 286], [110, 300], [200, 304], [272, 298], [300, 270]] },
  { id: 'gas_lot', w: 14, type: 'asphalt', pts: [[24, 300], [104, 300]] },
  // Doğu: şehir → liman, şehir → askerî bölge
  { id: 'east_s', w: 9, type: 'asphalt', pts: [[210, 98], [250, 170], [290, 250]] },
  { id: 'east_n', w: 9, type: 'asphalt', pts: [[210, -100], [250, -150], [262, -248]] },
  { id: 'mil_in', w: 8, type: 'asphalt', pts: [[262, -248], [334, -248]] },
  // Şehir → Sanayi
  { id: 'to_ind', w: 9, type: 'asphalt', pts: [[70, -118], [76, -200], [84, -300]] },
  { id: 'ind_main', w: 9, type: 'asphalt', pts: [[4, -300], [192, -300]] },
  // Sanayi → Laboratuvar
  { id: 'to_lab', w: 7, type: 'asphalt', pts: [[20, -300], [4, -360], [-20, -408]] },
  { id: 'lab_in', w: 7, type: 'asphalt', pts: [[-20, -408], [-20, -432]] },
  // Batı orman yolu (halka): mahalle → orman → sanayi
  { id: 'forest_rd', w: 7, type: 'dirt', pts: [[-318, 170], [-326, 100], [-304, 20], [-268, -62], [-226, -150], [-176, -228], [-96, -278], [4, -300]] },
  // Orman → dağ (araçla gidilebilir kısım) + patika
  { id: 'mtn_rd', w: 6, type: 'dirt', pts: [[-226, -150], [-262, -214], [-292, -262]] },
  { id: 'mtn_path', w: 3, type: 'path', pts: [[-292, -262], [-310, -296], [-330, -322]] },
  // Göl ve kamp patikaları
  { id: 'lake_path', w: 3, type: 'path', pts: [[-226, -150], [-206, -130]] },
  { id: 'camp_path', w: 3, type: 'path', pts: [[-268, -62], [-232, -28]] },
];

// Binalar. tpl: şablon adı (BuildingTemplates.js), sign: tabela metni
export const BUILDINGS = [
  // ---------------------------------------------------------------- MAHALLE
  { id: 'home', tpl: 'house_player', x: -285.5, z: 149.5, rot: 0, region: 'mahalle', name: 'Evimiz' },
  { id: 'n1', tpl: 'house_a', x: -256, z: 151, rot: 0, region: 'mahalle', name: 'Komşu Evi (Hasan Amca)', paint: '#e9c48f', roofCol: '#8c3b2a' },
  { id: 'n2', tpl: 'house_b', x: -214, z: 152, rot: 0, region: 'mahalle', paint: '#b9d3e0', roofCol: '#4c5a6a' },
  { id: 'n4', tpl: 'house_a', x: -158, z: 151, rot: 0, region: 'mahalle', paint: '#f0d9d0', roofCol: '#7a3226' },
  { id: 'n6', tpl: 'house_small', x: -104, z: 153, rot: 0, region: 'mahalle', paint: '#d7e8c4', roofCol: '#5b4636' },
  { id: 'depo', tpl: 'warehouse_small', x: -66, z: 146, rot: 0, region: 'mahalle', sign: 'DEPO' },
  { id: 's1', tpl: 'house_b', x: -285, z: 190, rot: 2, region: 'mahalle', paint: '#f2e2b8', roofCol: '#3f4b5c' },
  { id: 's2', tpl: 'house_small', x: -258, z: 189, rot: 2, region: 'mahalle', paint: '#e8b6a0', roofCol: '#6b3a2a' },
  { id: 's3', tpl: 'house_a', x: -150, z: 190, rot: 2, region: 'mahalle', paint: '#c8d6b0', roofCol: '#7a4a2a' },
  { id: 'market', tpl: 'market_small', x: -99, z: 189, rot: 2, region: 'mahalle', sign: 'MARKET' },
  { id: 's5', tpl: 'house_a', x: -66, z: 190, rot: 2, region: 'mahalle', paint: '#e6d2f0', roofCol: '#4a3d5c' },
  { id: 'w1', tpl: 'house_a', x: -258, z: 232, rot: 1, region: 'mahalle', paint: '#f5efe0', roofCol: '#8e4c32' },
  { id: 'e1', tpl: 'house_b', x: -104, z: 236, rot: 3, region: 'mahalle', paint: '#d9c3a5', roofCol: '#575757' },
  { id: 'w2', tpl: 'house_small', x: -212, z: 108, rot: 3, region: 'mahalle', paint: '#cfe3ea', roofCol: '#5a4030' },
  { id: 'e2', tpl: 'house_b', x: -146, z: 108, rot: 1, region: 'mahalle', paint: '#f1d7a7', roofCol: '#6e2f22' },
  // ---------------------------------------------------------------- ŞEHİR
  { id: 'supermarket', tpl: 'supermarket', x: 35, z: -72, rot: 0, region: 'sehir', sign: 'SÜPERMARKET' },
  { id: 'police', tpl: 'police', x: 105, z: -52, rot: 0, region: 'sehir', sign: 'POLİS' },
  { id: 'bank', tpl: 'bank', x: 163, z: -48, rot: 0, region: 'sehir', sign: 'BANKA' },
  { id: 'pharmacy', tpl: 'pharmacy', x: 20, z: 20, rot: 0, region: 'sehir', sign: 'ECZANE' },
  { id: 'restaurant', tpl: 'restaurant', x: 48, z: 19, rot: 0, region: 'sehir', sign: 'LOKANTA' },
  { id: 'mall', tpl: 'mall', x: 105, z: 0, rot: 0, region: 'sehir', sign: 'AVM' },
  { id: 'office', tpl: 'office', x: 166, z: 16, rot: 0, region: 'sehir', sign: 'OFİS' },
  { id: 'hardware', tpl: 'hardware', x: 193, z: 19, rot: 0, region: 'sehir', sign: 'NALBUR' },
  { id: 'cafe', tpl: 'cafe', x: 92, z: 52, rot: 2, region: 'sehir', sign: 'KAFE' },
  { id: 'hospital', tpl: 'hospital', x: -78, z: -45, rot: 1, region: 'hastane', sign: 'HASTANE' },
  // ---------------------------------------------------------------- BENZİNLİK
  { id: 'gas_shop', tpl: 'gas_shop', x: 86, z: 318, rot: 2, region: 'benzin', sign: 'MARKET' },
  { id: 'gas_garage', tpl: 'repair_small', x: 32, z: 319, rot: 2, region: 'benzin', sign: 'LASTİK & TAMİR' },
  // ---------------------------------------------------------------- SANAYİ
  { id: 'factory', tpl: 'factory', x: 58, z: -334, rot: 0, region: 'sanayi', sign: 'FABRİKA' },
  { id: 'metal', tpl: 'warehouse', x: 132, z: -334, rot: 0, region: 'sanayi', sign: 'METAL DEPOSU' },
  { id: 'repair', tpl: 'repair_shop', x: 150, z: -274, rot: 2, region: 'sanayi', sign: 'OTO TAMİR' },
  // ---------------------------------------------------------------- ASKERÎ
  { id: 'barracks_a', tpl: 'barracks', x: 322, z: -292, rot: 0, region: 'askeri', sign: 'KIŞLA' },
  { id: 'barracks_b', tpl: 'barracks', x: 322, z: -204, rot: 2, region: 'askeri' },
  { id: 'armory', tpl: 'armory', x: 392, z: -292, rot: 3, region: 'askeri', sign: 'CEPHANELİK' },
  { id: 'radio', tpl: 'radio_center', x: 392, z: -204, rot: 3, region: 'askeri', sign: 'TELSİZ MERKEZİ' },
  { id: 'checkpoint', tpl: 'booth', x: 276, z: -238, rot: 3, region: 'askeri' },
  // ---------------------------------------------------------------- LİMAN
  { id: 'port_a', tpl: 'port_warehouse', x: 300, z: 284, rot: 0, region: 'liman', sign: 'LİMAN DEPOSU' },
  { id: 'port_b', tpl: 'port_warehouse', x: 360, z: 280, rot: 0, region: 'liman' },
  { id: 'fish', tpl: 'cabin', x: 284, z: 330, rot: 1, region: 'liman', name: 'Balıkçı Kulübesi' },
  { id: 'harbor', tpl: 'harbor_office', x: 386, z: 322, rot: 3, region: 'liman', sign: 'LİMAN OFİSİ' },
  // ---------------------------------------------------------------- LAB
  { id: 'lab', tpl: 'lab', x: -20, z: -455, rot: 0, region: 'lab', sign: 'ARAŞTIRMA TESİSİ' },
  // ---------------------------------------------------------------- ORMAN & DAĞ
  { id: 'hunt_cabin', tpl: 'cabin', x: -140, z: -232, rot: 2, region: 'orman', name: 'Avcı Kulübesi' },
  { id: 'old_cabin', tpl: 'cabin', x: -262, z: 30, rot: 1, region: 'orman', name: 'Terk Edilmiş Kulübe' },
  { id: 'mtn_cabin1', tpl: 'cabin', x: -350, z: -330, rot: 1, region: 'dag', name: 'Dağ Kulübesi' },
  { id: 'mtn_cabin2', tpl: 'cabin', x: -330, z: -352, rot: 2, region: 'dag', name: 'Dağ Kulübesi' },
];

// Dekoratif (girilemeyen) yapılar: kit modelleri, ölçek ve konumla
export const DECOR_BUILDINGS = [
  // Mahalle çevresi Kenney evleri
  { model: 'house-3', x: -300, z: 238, rot: 1, s: 8.5 },
  { model: 'house-5', x: -58, z: 240, rot: 3, s: 8.5 },
  { model: 'house-6', x: -186, z: 152, rot: 0, s: 8.5 },
  { model: 'house-4', x: -180, z: 104, rot: 2, s: 8.5 },
  { model: 'house-7', x: -60, z: 110, rot: 2, s: 8.5 },
  // Şehir silueti: KayKit binaları
  { model: 'building_A', x: 100, z: -80, rot: 0, s: 8 },
  { model: 'building_B', x: 125, z: -82, rot: 0, s: 8 },
  { model: 'building_C', x: 192, z: -76, rot: 0, s: 8 },
  { model: 'building_D', x: 22, z: -6, rot: 0, s: 8 },
  { model: 'building_E', x: 52, z: -8, rot: 0, s: 8 },
  { model: 'building_F', x: 182, z: -10, rot: 0, s: 8 },
  { model: 'building_G', x: 30, z: 75, rot: 2, s: 8 },
  { model: 'building_H', x: 118, z: 70, rot: 2, s: 8 },
  { model: 'building_A', x: 160, z: 70, rot: 2, s: 8 },
  { model: 'building_C', x: 192, z: 70, rot: 2, s: 8 },
  { model: 'building_B', x: 52, z: 75, rot: 2, s: 8 },
  { model: 'watertower', x: 176, z: -340, rot: 0, s: 24 },
  { model: 'wind-turbine', x: 185, z: -240, rot: 0, s: 6.5 },
  { model: 'wind-turbine', x: 230, z: -330, rot: 0, s: 6.5 },
  { model: 'wind-turbine', x: -60, z: 300, rot: 0, s: 6.5 },
];

// Önemli noktalar (harita simgeleri ve görevler için)
export const POIS = [
  { id: 'home', name: 'Üs (Evimiz)', x: -285, z: 150, icon: 'base' },
  { id: 'market', name: 'Market', x: -99, z: 189, icon: 'shop' },
  { id: 'park', name: 'Park', x: -194, z: 212, icon: 'park' },
  { id: 'supermarket', name: 'Süpermarket', x: 35, z: -72, icon: 'shop' },
  { id: 'pharmacy', name: 'Eczane', x: 20, z: 20, icon: 'med' },
  { id: 'hospital', name: 'Hastane', x: -78, z: -45, icon: 'med' },
  { id: 'police', name: 'Polis Merkezi', x: 105, z: -52, icon: 'police' },
  { id: 'mall', name: 'AVM', x: 105, z: 0, icon: 'shop' },
  { id: 'gas', name: 'Benzin İstasyonu', x: 58, z: 290, icon: 'fuel' },
  { id: 'lake', name: 'Göl', x: -196, z: -100, icon: 'fish' },
  { id: 'camp', name: 'Kamp Alanı', x: -232, z: -26, icon: 'camp' },
  { id: 'hunt_cabin', name: 'Avcı Kulübesi', x: -140, z: -232, icon: 'cabin' },
  { id: 'cave', name: 'Mağara', x: -300, z: -196, icon: 'cave' },
  { id: 'mountain', name: 'Dağ Kampı', x: -338, z: -338, icon: 'mountain' },
  { id: 'factory', name: 'Fabrika', x: 58, z: -334, icon: 'factory' },
  { id: 'repair', name: 'Oto Tamir', x: 150, z: -274, icon: 'wrench' },
  { id: 'military', name: 'Askerî Bölge', x: 345, z: -248, icon: 'military' },
  { id: 'helipad', name: 'Helikopter Pisti', x: 366, z: -248, icon: 'heli' },
  { id: 'radio', name: 'Telsiz Merkezi', x: 392, z: -204, icon: 'radio' },
  { id: 'port', name: 'Liman', x: 330, z: 300, icon: 'anchor' },
  { id: 'dock', name: 'İskele', x: 336, z: 368, icon: 'boat' },
  { id: 'lab', name: 'Araştırma Tesisi', x: -20, z: -455, icon: 'lab' },
  { id: 'bridge', name: 'Anakara Köprüsü', x: 470, z: -420, icon: 'bridge' },
];

// Yol tabelaları (konsept sanattaki ahşap yön levhaları)
export const SIGNPOSTS = [
  { x: -36, z: 160, rot: 0.6, lines: ['ŞEHİR MERKEZİ →', 'HASTANE →', 'BENZİNLİK ↓', 'LİMAN ↓'] },
  { x: -312, z: 160, rot: -0.3, lines: ['ORMAN ↑', 'DAĞ KAMPI ↑', 'SANAYİ ↑'] },
  { x: 214, z: -108, rot: 2.2, lines: ['ASKERÎ BÖLGE →', 'LİMAN ↓'] },
  { x: 8, z: -292, rot: 1.0, lines: ['ARAŞTIRMA TESİSİ ↑', 'ORMAN ←'] },
  { x: -220, z: -142, rot: 0.2, lines: ['GÖL →', 'DAĞ KAMPI ↖', 'MAHALLE ↓'] },
];
