// Zombi ve düşman türleri. Görünüm: Kenney zombi tabanı + ton/kostüm + 3D ekler (parlayan göz, sivilce, diken).
// speed: m/s (yürüme/koşma), sight/hear: algı mesafeleri (m), dmg: saldırı hasarı, structDmg: yapı hasar çarpanı

export const ZOMBIE_TYPES = {
  normal: {
    id: 'normal', name: 'Normal Zombi', base: 'zombie-1', tint: '#9fb59a', cloth: '#d8d0c0', hp: 70, walk: 1.0, run: 2.3, sight: 22, hear: 26, dmg: 12, rate: 1.3, reach: 1.25,
    structDmg: 1, xp: 1, build: [1, 1, 1], style: 0, desc: 'Yavaş ama kalabalık olunca ölümcül. Sese ve görüntüye tepki verir.', img: 'normal', color: '#9fb59a',
  },
  normal2: {
    id: 'normal2', name: 'Normal Zombi', base: 'zombie-2', tint: '#a8b6b8', cloth: '#c9c1d0', hp: 70, walk: 0.95, run: 2.2, sight: 22, hear: 26, dmg: 12, rate: 1.3, reach: 1.25,
    structDmg: 1, xp: 1, build: [1.02, 0.98, 1.02], style: 1, desc: 'Yavaş ama kalabalık olunca ölümcül.', img: 'normal', hidden: true, color: '#a8b6b8',
  },
  runner: {
    id: 'runner', name: 'Koşucu', base: 'zombie-2', tint: '#8fa7c8', cloth: '#8899cc', hp: 45, walk: 1.6, run: 5.6, sight: 30, hear: 32, dmg: 9, rate: 0.9, reach: 1.2,
    structDmg: 0.6, xp: 2, build: [0.88, 1.03, 0.88], style: 2, desc: 'Hızlı koşar, oyuncuları kovalar. Dayanıksız. Açık alanda tehlikeli.', img: 'runner', color: '#8fa7c8',
  },
  heavy: {
    id: 'heavy', name: 'Ağır Zombi', base: 'zombie-1', tint: '#b39aa8', cloth: '#a08890', hp: 420, walk: 0.75, run: 1.6, sight: 18, hear: 22, dmg: 32, rate: 2.0, reach: 1.7,
    structDmg: 5, xp: 6, build: [1.55, 1.28, 1.45], style: 0, hunch: true, desc: 'İri ve dayanıklı. Barikatları parçalar. Yavaş ama çok sert vurur.', img: 'heavy', knockResist: 0.85, color: '#b39aa8',
  },
  night: {
    id: 'night', name: 'Gece Zombisi', base: 'zombie-2', tint: '#7a5fa0', cloth: '#5a4a70', hp: 90, walk: 1.2, run: 4.2, sight: 34, hear: 30, dmg: 15, rate: 1.1, reach: 1.3,
    structDmg: 1.2, xp: 3, build: [0.95, 1.05, 0.95], style: 2, eyes: '#ff3df5', glow: '#ff40ff', nightOnly: true, desc: 'Karanlıkta çok daha aktif. Gece görüşü iyi, sessizce yaklaşır.', img: 'night', color: '#7a5fa0',
  },
  special: {
    id: 'special', name: 'Özel Enfekte', base: 'zombie-1', tint: '#78c850', cloth: '#4a6a3a', hp: 260, walk: 1.1, run: 3.2, sight: 26, hear: 28, dmg: 22, rate: 1.2, reach: 1.5,
    structDmg: 2, xp: 8, build: [1.1, 1.08, 1.1], style: 0, eyes: '#b6ff3d', glow: '#9dff3d', pustules: true, emissive: '#3a7a10', toxic: true,
    desc: 'Nadir. Öldüğünde zehirli bulut saçar. Değerli kaynakları ve hikâye içeriklerini korur.', img: 'special', color: '#78c850',
  },
  dog: {
    id: 'dog', name: 'Zombi Köpek', dog: true, tint: '#7d6b58', hp: 40, walk: 2.4, run: 7.0, sight: 28, hear: 36, dmg: 10, rate: 0.8, reach: 1.1,
    structDmg: 0.4, xp: 2, desc: 'Çok hızlı. Küçük gruplar hâlinde saldırır.', img: 'dog', color: '#7d6b58',
  },
  leader: {
    id: 'leader', name: 'Sürü Lideri', base: 'zombie-1', tint: '#b05050', cloth: '#5a2a2a', hp: 900, walk: 0.95, run: 2.6, sight: 30, hear: 40, dmg: 38, rate: 1.7, reach: 1.9,
    structDmg: 4, xp: 20, build: [1.7, 1.42, 1.6], style: 0, eyes: '#ff2020', glow: '#ff3030', leader: true, emissive: '#5a0000', knockResist: 0.95,
    desc: 'Sürüyü bir arada tutar: yakınındaki zombiler hızlanır. Öldürülünce sürü dağılır.', img: 'heavy', color: '#b05050',
  },
  raider: {
    id: 'raider', name: 'Yağmacı', human: true, base: 'survivor-male', hp: 110, walk: 1.4, run: 4.6, sight: 40, hear: 30, dmg: 16, rate: 1.0, reach: 22,
    structDmg: 1, xp: 5, ranged: true, desc: 'Silahlı hayatta kalanlar. Bazıları takas yapar, bazıları saldırır.', img: null, color: '#c0392b',
  },
};

/** Bölge başına zombi yoğunluğu ve tür dağılımı (gün ilerledikçe artar) */
export const SPAWN_ZONES = [
  { region: 'mahalle', cx: -175, cz: 172, r: 140, base: 14, perDay: 0.6, types: [['normal', 6], ['normal2', 5], ['runner', 1]], minDist: 30 },
  { region: 'sehir', cx: 100, cz: -10, r: 130, base: 34, perDay: 1.5, types: [['normal', 5], ['normal2', 5], ['runner', 3], ['heavy', 1], ['dog', 0.6]] },
  { region: 'hastane', cx: -78, cz: -45, r: 50, base: 16, perDay: 0.8, types: [['normal', 4], ['normal2', 4], ['runner', 2], ['special', 0.3]] },
  { region: 'benzin', cx: 62, cz: 302, r: 55, base: 9, perDay: 0.4, types: [['normal', 5], ['normal2', 4], ['runner', 1], ['dog', 1]] },
  { region: 'orman', cx: -235, cz: -160, r: 160, base: 12, perDay: 0.4, types: [['normal', 4], ['normal2', 3], ['dog', 2]] },
  { region: 'sanayi', cx: 92, cz: -305, r: 90, base: 18, perDay: 0.8, types: [['normal', 4], ['normal2', 4], ['heavy', 1.5], ['runner', 1]] },
  { region: 'askeri', cx: 345, cz: -248, r: 75, base: 20, perDay: 0.8, types: [['normal', 3], ['heavy', 2], ['runner', 2], ['special', 0.3]] },
  { region: 'liman', cx: 330, cz: 300, r: 70, base: 14, perDay: 0.6, types: [['normal', 4], ['normal2', 4], ['runner', 1.5], ['heavy', 0.8]] },
  { region: 'lab', cx: -20, cz: -446, r: 45, base: 12, perDay: 0.4, types: [['special', 2], ['runner', 2], ['normal', 2], ['night', 1]] },
  { region: 'dag', cx: -338, cz: -338, r: 50, base: 3, perDay: 0.15, types: [['normal', 3], ['dog', 1]] },
];

export const ZOMBIE_IDS = Object.keys(ZOMBIE_TYPES);
