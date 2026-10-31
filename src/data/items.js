// Eşya veritabanı (ItemDatabase). Her eşyanın: adı, kategorisi, ağırlığı (kg), yığın sınırı,
// nadirliği, açıklaması, kullanım etkisi, dayanıklılığı ve (varsa) üretim tarifi (recipes.js).
// model: ['kit','ad', ölçek] ya da prosedürel model anahtarı (ItemModels.js).

export const CATEGORIES = {
  all: 'Tümü', food: 'Yiyecek', drink: 'İçecek', weapon: 'Silahlar', ammo: 'Mühimmat', build: 'İnşaat',
  car: 'Araç Parçaları', med: 'Tıbbi', wear: 'Kıyafet', tool: 'Aletler', misc: 'Diğer',
};
export const RARITY = { common: { name: 'Yaygın', color: '#bdc3c7' }, uncommon: { name: 'Az Bulunur', color: '#2ecc71' }, rare: { name: 'Nadir', color: '#3498db' }, epic: { name: 'Çok Nadir', color: '#9b59b6' }, story: { name: 'Hikâye', color: '#f39c12' } };

const I = (id, o) => ({ id, stack: 1, weight: 0.5, rarity: 'common', ...o });

export const ITEMS = {
  // ------------------------------------------------------------ YİYECEK
  canned_food: I('canned_food', { name: 'Konserve Yiyecek', cat: 'food', weight: 0.5, stack: 12, model: ['items', 'can', 1.2], desc: 'Uzun süre dayanır. Açlığı büyük ölçüde giderir.', use: { hunger: 40, morale: 2, time: 1.6 } }),
  canned_beans: I('canned_beans', { name: 'Kuru Fasulye Konservesi', cat: 'food', weight: 0.5, stack: 12, model: ['items', 'can-open', 1.2], desc: 'Bir Türk klasiği. Soğuk bile olsa doyurur.', use: { hunger: 45, morale: 4, time: 1.6 } }),
  bread: I('bread', { name: 'Ekmek', cat: 'food', weight: 0.4, stack: 6, model: ['items', 'loaf', 0.9], desc: 'Taze kaldıkça güzel. 3 günde bayatlar.', use: { hunger: 25, morale: 3, time: 1.4 }, spoil: 3 }),
  apple: I('apple', { name: 'Elma', cat: 'food', weight: 0.2, stack: 10, model: ['items', 'apple', 1.6], desc: 'Biraz açlık, biraz susuzluk giderir.', use: { hunger: 10, thirst: 6, time: 1 }, spoil: 8 }),
  banana: I('banana', { name: 'Muz', cat: 'food', weight: 0.2, stack: 10, model: ['items', 'banana', 1.2], desc: 'Hızlı enerji.', use: { hunger: 12, energy: 4, time: 1 }, spoil: 5 }),
  carrot: I('carrot', { name: 'Havuç', cat: 'food', weight: 0.15, stack: 15, model: ['items', 'carrot', 0.7], desc: 'Bahçeden taze. Pişirilirse daha doyurucu.', use: { hunger: 8, time: 1 }, spoil: 10 }),
  tomato: I('tomato', { name: 'Domates', cat: 'food', weight: 0.15, stack: 15, model: ['items', 'tomato', 2], desc: 'Sulu ve taze.', use: { hunger: 7, thirst: 5, time: 1 }, spoil: 6 }),
  cabbage: I('cabbage', { name: 'Lahana', cat: 'food', weight: 0.6, stack: 6, model: ['items', 'cabbage', 1.2], desc: 'Çorbalık sebze.', use: { hunger: 12, time: 1.3 }, spoil: 10 }),
  corn: I('corn', { name: 'Mısır', cat: 'food', weight: 0.3, stack: 10, model: ['items', 'corn', 1.4], desc: 'Haşlanırsa çok lezzetli.', use: { hunger: 12, time: 1.2 }, spoil: 8 }),
  mushroom: I('mushroom', { name: 'Orman Mantarı', cat: 'food', weight: 0.05, stack: 20, model: ['items', 'mushroom', 3], desc: 'Bazıları zehirli olabilir… Pişirmek riski azaltır.', use: { hunger: 6, poison: 0.25, time: 0.8 }, spoil: 4 }),
  raw_meat: I('raw_meat', { name: 'Çiğ Et', cat: 'food', weight: 0.6, stack: 6, model: ['items', 'meat-raw', 1.1], desc: 'Çiğ yemek tehlikeli. Ateşte pişir.', use: { hunger: 12, poison: 0.45, time: 1.5 }, spoil: 2 }),
  cooked_meat: I('cooked_meat', { name: 'Pişmiş Et', cat: 'food', weight: 0.5, stack: 6, model: ['items', 'meat-cooked', 1.1], desc: 'Sıcak ve doyurucu. Moral yükseltir.', use: { hunger: 48, morale: 6, time: 1.6 }, spoil: 3 }),
  raw_fish: I('raw_fish', { name: 'Çiğ Balık', cat: 'food', weight: 0.5, stack: 6, model: ['items', 'fish', 1.0], desc: 'Göl ya da denizden. Pişirilmeli.', use: { hunger: 9, poison: 0.35, time: 1.4 }, spoil: 2 }),
  cooked_fish: I('cooked_fish', { name: 'Izgara Balık', cat: 'food', weight: 0.4, stack: 6, model: ['items', 'fish-bones', 1.0], desc: 'Kıyamet öncesi son ızgara keyfi.', use: { hunger: 40, morale: 5, time: 1.5 }, spoil: 3 }),
  chips: I('chips', { name: 'Cips', cat: 'food', weight: 0.15, stack: 8, model: ['items', 'bag-flat', 0.7], desc: 'Tuzlu. Moral verir ama susatır.', use: { hunger: 12, morale: 4, thirst: -6, time: 1 } }),
  chocolate: I('chocolate', { name: 'Çikolata', cat: 'food', weight: 0.1, stack: 10, model: ['items', 'chocolate', 1.6], desc: 'Kötü günlerin dostu.', use: { hunger: 14, morale: 7, energy: 5, time: 0.8 } }),
  cookie: I('cookie', { name: 'Kurabiye', cat: 'food', weight: 0.1, stack: 10, model: ['items', 'cookie', 1.8], desc: 'Anneannenin tarifi değil ama idare eder.', use: { hunger: 8, morale: 4, time: 0.8 } }),
  mre: I('mre', { name: 'Hazır Yemek (MRE)', cat: 'food', weight: 0.6, stack: 6, rarity: 'uncommon', model: ['items', 'styrofoam-dinner', 0.45], desc: 'Askerî tayın. Tam bir öğün.', use: { hunger: 62, thirst: 5, morale: 3, time: 2 } }),
  sandwich: I('sandwich', { name: 'Sandviç', cat: 'food', weight: 0.3, stack: 4, model: ['items', 'sandwich', 1.1], desc: 'Bozulmadan yemek lazım.', use: { hunger: 30, morale: 3, time: 1.3 }, spoil: 2 }),
  stew: I('stew', { name: 'Sebze Güveci', cat: 'food', weight: 0.8, stack: 4, rarity: 'uncommon', model: ['items', 'pot-stew', 0.55], desc: 'Takım için sıcak bir yemek. Herkesin moralini yükseltir.', use: { hunger: 55, thirst: 10, morale: 10, time: 2 } }),
  honey: I('honey', { name: 'Bal Kavanozu', cat: 'food', weight: 0.4, stack: 6, model: ['items', 'honey', 1.1], desc: 'Hiç bozulmaz.', use: { hunger: 16, morale: 6, time: 1.2 } }),
  peanut_butter: I('peanut_butter', { name: 'Fıstık Ezmesi', cat: 'food', weight: 0.4, stack: 6, model: ['items', 'peanut-butter', 1.1], desc: 'Yüksek kalori.', use: { hunger: 32, thirst: -4, time: 1.2 } }),
  // ------------------------------------------------------------ İÇECEK
  water_bottle: I('water_bottle', { name: 'Su Şişesi', cat: 'drink', weight: 0.5, stack: 10, model: ['items', 'bottle-large', 1.2], desc: 'Temiz içme suyu. Boş şişe geri kalır.', use: { thirst: 42, time: 1.2, gives: 'empty_bottle' } }),
  dirty_water: I('dirty_water', { name: 'Kirli Su', cat: 'drink', weight: 0.5, stack: 10, model: ['items', 'bottle', 1.2], desc: 'Göl/dere suyu. Kaynatmadan içmek hastalık riski taşır.', use: { thirst: 32, poison: 0.45, time: 1.2, gives: 'empty_bottle' } }),
  juice: I('juice', { name: 'Meyve Suyu', cat: 'drink', weight: 0.4, stack: 8, model: ['items', 'carton', 1.0], desc: 'Şekerli ve ferahlatıcı.', use: { thirst: 30, hunger: 5, morale: 3, time: 1 } }),
  soda: I('soda', { name: 'Gazlı İçecek', cat: 'drink', weight: 0.35, stack: 8, model: ['items', 'soda-can', 1.4], desc: 'Kıyamete karşı bir yudum mutluluk.', use: { thirst: 20, morale: 5, energy: 5, time: 0.8 } }),
  energy_drink: I('energy_drink', { name: 'Enerji İçeceği', cat: 'drink', weight: 0.35, stack: 8, rarity: 'uncommon', model: ['items', 'soda-bottle', 1.0], desc: 'Enerjiyi hızla yükseltir. Fazlası uykusuzluk yapar.', use: { thirst: 15, energy: 35, morale: 2, time: 0.8 } }),
  empty_bottle: I('empty_bottle', { name: 'Boş Şişe', cat: 'misc', weight: 0.08, stack: 10, model: ['items', 'glass', 1.4], desc: 'Su kaynaklarından doldurulabilir. Fırlat: kırılma sesi yakındaki zombileri oraya çeker.', throwable: { noise: 32, kind: 'glass' } }),
  // ------------------------------------------------------------ TIBBİ
  bandage: I('bandage', { name: 'Bandaj', cat: 'med', weight: 0.05, stack: 10, model: 'bandage', desc: 'Kanamayı durdurur, biraz iyileştirir.', use: { health: 10, cure: ['bleeding'], time: 2.2, heal: true } }),
  first_aid: I('first_aid', { name: 'İlk Yardım Çantası', cat: 'med', weight: 0.6, stack: 3, rarity: 'uncommon', model: 'medkit', desc: 'Sağlığı artırır. Yaralanmaları ve kanamayı tedavi eder.', use: { health: 45, cure: ['bleeding', 'injury'], time: 3.5, heal: true } }),
  painkiller: I('painkiller', { name: 'Ağrı Kesici', cat: 'med', weight: 0.02, stack: 20, model: 'pills_white', desc: 'Yaralanma cezasını birkaç saat bastırır.', use: { morale: 5, buff: ['painkiller', 180], time: 1 } }),
  antiseptic: I('antiseptic', { name: 'Antiseptik', cat: 'med', weight: 0.15, stack: 5, model: 'antiseptic', desc: 'Yaraları temizler, erken enfeksiyonu önler.', use: { health: 5, infection: -35, time: 1.8, heal: true } }),
  antibiotics: I('antibiotics', { name: 'İlaç Kutusu (Antibiyotik)', cat: 'med', weight: 0.05, stack: 10, rarity: 'rare', model: 'pills_box', desc: 'Enfeksiyon ve hastalığı tedavi eder.', use: { infection: -70, cure: ['sick'], time: 1.2 } }),
  charcoal: I('charcoal', { name: 'Kömür Tableti', cat: 'med', weight: 0.02, stack: 20, model: 'pills_black', desc: 'Zehirlenmeyi tedavi eder.', use: { cure: ['poisoned'], time: 1 } }),
  splint: I('splint', { name: 'Atel', cat: 'med', weight: 0.3, stack: 4, model: 'splint', desc: 'Kırık ve bacak yaralanmalarını sabitler.', use: { cure: ['injury'], time: 3, heal: true } }),
  vitamins: I('vitamins', { name: 'Vitamin', cat: 'med', weight: 0.05, stack: 10, model: 'pills_orange', desc: 'Moral ve iyileşme hızını artırır.', use: { morale: 6, buff: ['vitamins', 360], time: 0.8 } }),
  // ------------------------------------------------------------ İNŞAAT
  plank: I('plank', { name: 'Tahta', cat: 'build', weight: 1.0, stack: 20, model: 'plank', desc: 'Barikat ve mobilya için temel malzeme.' }),
  log: I('log', { name: 'Kütük', cat: 'build', weight: 3.0, stack: 6, model: 'log', desc: 'Ağaç keserek elde edilir. Tahtaya dönüştürülebilir.' }),
  scrap_metal: I('scrap_metal', { name: 'Hurda Metal', cat: 'build', weight: 1.2, stack: 15, model: 'scrap', desc: 'Metal levha ve silah yapımında kullanılır.' }),
  metal_sheet: I('metal_sheet', { name: 'Metal Levha', cat: 'build', weight: 2.0, stack: 10, rarity: 'uncommon', model: 'sheet', desc: 'Sağlam barikatlar ve araç zırhı için.' }),
  nails: I('nails', { name: 'Çivi', cat: 'build', weight: 0.01, stack: 99, model: 'nails', desc: 'İnşaatın vazgeçilmezi.' }),
  screws: I('screws', { name: 'Vida', cat: 'build', weight: 0.01, stack: 99, model: 'screws', desc: 'Metal ve elektronik işler için.' }),
  glass: I('glass', { name: 'Cam', cat: 'build', weight: 0.8, stack: 10, model: 'glass_pane', desc: 'Pencere ve su filtresi yapımında.' }),
  plastic: I('plastic', { name: 'Plastik', cat: 'build', weight: 0.3, stack: 20, model: 'plastic', desc: 'Su deposu ve filtre için.' }),
  cloth: I('cloth', { name: 'Kumaş', cat: 'build', weight: 0.2, stack: 20, model: 'cloth', desc: 'Bandaj, ip ve yatak yapımında.' }),
  rope: I('rope', { name: 'İp', cat: 'build', weight: 0.3, stack: 10, model: 'rope', desc: 'Tuzaklar ve tırmanma için.' }),
  concrete: I('concrete', { name: 'Beton Torbası', cat: 'build', weight: 5.0, stack: 10, rarity: 'uncommon', model: 'cement', desc: 'Yeraltı sığınağı inşası için şart.' }),
  electronics: I('electronics', { name: 'Elektronik Parça', cat: 'build', weight: 0.3, stack: 15, rarity: 'uncommon', model: 'chip', desc: 'Telsiz, alarm, kamera ve jeneratör için.' }),
  wire: I('wire', { name: 'Kablo', cat: 'build', weight: 0.2, stack: 15, model: 'wire', desc: 'Elektrik sistemleri için.' }),
  duct_tape: I('duct_tape', { name: 'Koli Bandı', cat: 'build', weight: 0.2, stack: 10, model: 'tape', desc: 'Her şeyi tamir eder. Neredeyse.' }),
  leather: I('leather', { name: 'Deri', cat: 'build', weight: 0.5, stack: 10, model: 'leather', desc: 'Avdan elde edilir. Çanta ve zırh için.' }),
  battery: I('battery', { name: 'Pil', cat: 'build', weight: 0.05, stack: 20, model: 'battery', desc: 'El feneri ve telsiz için.' }),
  seeds: I('seeds', { name: 'Sebze Tohumu', cat: 'misc', weight: 0.02, stack: 30, model: 'seeds', desc: 'Bahçe parselinde ek: birkaç günde hasat.' }),
  fertilizer: I('fertilizer', { name: 'Gübre', cat: 'misc', weight: 1.0, stack: 10, model: 'cement', desc: 'Bahçede ürünlerin daha hızlı büyümesini sağlar.' }),
  // ------------------------------------------------------------ ARAÇ PARÇALARI
  engine_part: I('engine_part', { name: 'Motor Parçası', cat: 'car', weight: 3.0, stack: 5, rarity: 'uncommon', model: 'engine', desc: 'Bozuk motorları ve jeneratörü onarmak için.' }),
  tire: I('tire', { name: 'Lastik', cat: 'car', weight: 8.0, stack: 4, model: 'tire', desc: 'Patlak lastikleri değiştirmek için.' }),
  car_battery: I('car_battery', { name: 'Akü', cat: 'car', weight: 6.0, stack: 2, rarity: 'uncommon', model: 'car_battery', desc: 'Aracı çalıştırmak ve jeneratör için.' }),
  jerrycan: I('jerrycan', { name: 'Yakıt Bidonu', cat: 'car', weight: 1.0, stack: 1, model: 'jerrycan', desc: 'En fazla 20 litre yakıt taşır. Benzinlikten ya da tanklardan doldurulur.', fuelCap: 20 }),
  repair_kit: I('repair_kit', { name: 'Tamir Seti', cat: 'car', weight: 1.5, stack: 5, model: 'toolbox', desc: 'Araç hasarını onarır (+%35).' }),
  armor_kit: I('armor_kit', { name: 'Araç Zırh Kiti', cat: 'car', weight: 6.0, stack: 2, rarity: 'rare', model: 'sheet', desc: 'Araca takılabilir zırh plakaları.' }),
  // ------------------------------------------------------------ ALETLER
  flashlight: I('flashlight', { name: 'El Feneri', cat: 'tool', weight: 0.3, model: 'flashlight', desc: 'Karanlıkta yolunu bul. Pil tüketir.', durability: 100, hold: 'flashlight' }),
  hammer: I('hammer', { name: 'Çekiç', cat: 'tool', weight: 0.8, model: 'hammer', desc: 'İnşaat için gerekli. Yakın dövüşte de kullanılabilir.', durability: 120, tool: ['hammer'], melee: { dmg: 22, speed: 1.15, range: 1.6, noise: 6, kind: 'blunt' }, hold: 'melee1' }),
  axe: I('axe', { name: 'Balta', cat: 'tool', weight: 1.6, model: ['items', 'axe_1handed', 0.55], desc: 'Ağaç kesmek ve zombi kafası için.', durability: 150, tool: ['axe'], melee: { dmg: 42, speed: 0.85, range: 1.8, noise: 7, kind: 'sharp' }, hold: 'melee1' }),
  screwdriver: I('screwdriver', { name: 'Tornavida', cat: 'tool', weight: 0.2, model: 'screwdriver', desc: 'Elektronik ve mekanik işler için.', durability: 80, tool: ['screwdriver'], melee: { dmg: 14, speed: 1.5, range: 1.3, noise: 3, kind: 'stab' }, hold: 'melee1' }),
  wrench: I('wrench', { name: 'İngiliz Anahtarı', cat: 'tool', weight: 0.9, model: 'wrench', desc: 'Araç tamiri için.', durability: 150, tool: ['wrench'], melee: { dmg: 24, speed: 1.1, range: 1.5, noise: 6, kind: 'blunt' }, hold: 'melee1' }),
  crowbar: I('crowbar', { name: 'Levye', cat: 'tool', weight: 1.4, model: 'crowbar', desc: 'Kilitli kapı ve kasaları zorlar. Güçlü bir sopa.', durability: 200, tool: ['crowbar'], melee: { dmg: 32, speed: 0.95, range: 1.8, noise: 7, kind: 'blunt' }, hold: 'melee1' }),
  shovel: I('shovel', { name: 'Kürek', cat: 'tool', weight: 1.8, model: ['items', 'shovel', 1.6], desc: 'Kazı (sığınak) ve savunma için.', durability: 150, tool: ['shovel'], melee: { dmg: 30, speed: 0.85, range: 2.0, noise: 8, kind: 'blunt' }, hold: 'melee2' }),
  radio: I('radio', { name: 'Telsiz', cat: 'tool', weight: 0.4, rarity: 'uncommon', model: 'radio', desc: 'Yayınları dinle, takımınla uzaktan haberleş.', durability: 100 }),
  binoculars: I('binoculars', { name: 'Dürbün', cat: 'tool', weight: 0.5, rarity: 'uncommon', model: 'binoculars', desc: 'Sağ tık ile uzağı gözetle.', hold: 'binoculars' }),
  lockpick: I('lockpick', { name: 'Maymuncuk', cat: 'tool', weight: 0.02, stack: 10, model: 'lockpick', desc: 'Kilitli kapı ve dolapları açar (tek kullanımlık olabilir).' }),
  fishing_rod: I('fishing_rod', { name: 'Olta', cat: 'tool', weight: 0.8, model: 'rod', desc: 'Göl ya da iskelede balık tut. Yem şansı artırır.', durability: 60, hold: 'rod' }),
  bait: I('bait', { name: 'Yem', cat: 'misc', weight: 0.02, stack: 30, model: 'seeds', desc: 'Balık tutma şansını artırır.' }),
  lighter: I('lighter', { name: 'Çakmak', cat: 'tool', weight: 0.05, model: 'lighter', desc: 'Ateş yakmak için.', durability: 60 }),
  sleeping_bag: I('sleeping_bag', { name: 'Uyku Tulumu', cat: 'tool', weight: 1.5, model: 'sleepbag', desc: 'Her yerde uyuyabilirsin (dışarısı tehlikeli olabilir).' }),
  backpack_small: I('backpack_small', { name: 'Küçük Sırt Çantası', cat: 'wear', weight: 0.6, model: 'backpack', desc: 'Taşıma kapasitesi +8 kg.', wear: { slot: 'back', carry: 8 } }),
  backpack_large: I('backpack_large', { name: 'Büyük Kamp Çantası', cat: 'wear', weight: 1.2, rarity: 'uncommon', model: 'backpack_big', desc: 'Taşıma kapasitesi +18 kg.', wear: { slot: 'back', carry: 18 } }),
  smoke_bomb: I('smoke_bomb', { name: 'Ses Bombası', cat: 'tool', weight: 0.3, stack: 5, rarity: 'uncommon', model: ['items', 'smokebomb', 0.8], desc: 'Fırlat: zombileri gürültüyle başka yere çeker.', throwable: { noise: 60, kind: 'noise' } }),
  molotov: I('molotov', { name: 'Molotof', cat: 'weapon', weight: 0.6, stack: 5, rarity: 'uncommon', model: 'molotov', desc: 'Fırlat: alanda yangın çıkarır.', throwable: { dmg: 60, radius: 4, kind: 'fire', noise: 30 } }),
  // ------------------------------------------------------------ SİLAHLAR
  knife: I('knife', { name: 'Bıçak', cat: 'weapon', weight: 0.3, model: ['items', 'dagger', 0.55], desc: 'Hızlı ve sessiz.', durability: 120, melee: { dmg: 20, speed: 1.6, range: 1.35, noise: 2, kind: 'stab' }, hold: 'melee1' }),
  bat: I('bat', { name: 'Beyzbol Sopası', cat: 'weapon', weight: 1.0, model: 'bat', desc: 'Klasik zombi kovucu.', durability: 140, melee: { dmg: 30, speed: 1.0, range: 1.9, noise: 7, kind: 'blunt', knock: 1.4 }, hold: 'melee1' }),
  spiked_bat: I('spiked_bat', { name: 'Çivili Sopa', cat: 'weapon', weight: 1.2, rarity: 'uncommon', model: 'spiked_bat', desc: 'Kendi yapımın. Acıtır.', durability: 120, melee: { dmg: 40, speed: 0.95, range: 1.9, noise: 7, kind: 'blunt', knock: 1.4 }, hold: 'melee1' }),
  machete: I('machete', { name: 'Pala', cat: 'weapon', weight: 0.9, rarity: 'uncommon', model: 'machete', desc: 'Keskin ve dengeli.', durability: 160, melee: { dmg: 38, speed: 1.25, range: 1.8, noise: 4, kind: 'sharp' }, hold: 'melee1' }),
  pipe: I('pipe', { name: 'Demir Boru', cat: 'weapon', weight: 1.5, model: 'pipe', desc: 'Sanayiden bir hatıra.', durability: 250, melee: { dmg: 28, speed: 0.95, range: 1.9, noise: 8, kind: 'blunt' }, hold: 'melee1' }),
  pistol: I('pistol', { name: 'Tabanca', cat: 'weapon', weight: 1.0, rarity: 'rare', model: 'pistol', desc: '9mm. Güvenilir ama gürültülü.', durability: 300, gun: { dmg: 34, rate: 0.28, mag: 12, ammo: 'ammo_9mm', spread: 0.02, recoil: 0.5, noise: 55, range: 70, reload: 1.4 }, hold: 'pistol' }),
  shotgun: I('shotgun', { name: 'Av Tüfeği', cat: 'weapon', weight: 3.2, rarity: 'rare', model: 'shotgun', desc: 'Yakın mesafede yıkıcı. Çok gürültülü.', durability: 250, gun: { dmg: 22, pellets: 7, rate: 0.85, mag: 6, ammo: 'shells', spread: 0.11, recoil: 1.6, noise: 85, range: 30, reload: 2.4 }, hold: 'rifle' }),
  rifle: I('rifle', { name: 'Avcı Tüfeği', cat: 'weapon', weight: 3.5, rarity: 'rare', model: 'rifle', desc: 'Uzak mesafe, yüksek hasar.', durability: 300, gun: { dmg: 90, rate: 1.1, mag: 5, ammo: 'ammo_rifle', spread: 0.004, recoil: 1.2, noise: 90, range: 160, reload: 2.2, scope: true }, hold: 'rifle' }),
  smg: I('smg', { name: 'Askerî Hafif Makineli', cat: 'weapon', weight: 2.8, rarity: 'epic', model: 'smg', desc: 'Askerî bölgeden. Mermi yer, iş görür.', durability: 350, gun: { dmg: 24, rate: 0.09, mag: 30, ammo: 'ammo_9mm', spread: 0.04, recoil: 0.35, noise: 75, range: 60, reload: 2.0, auto: true }, hold: 'rifle' }),
  bow: I('bow', { name: 'Yay', cat: 'weapon', weight: 0.9, rarity: 'uncommon', model: 'bow', desc: 'Sessiz. Oklar geri toplanabilir.', durability: 150, gun: { dmg: 55, rate: 0.9, mag: 1, ammo: 'arrow', spread: 0.01, recoil: 0.2, noise: 4, range: 80, reload: 0.7, projectile: 'arrow' }, hold: 'bow' }),
  crossbow: I('crossbow', { name: 'Arbalet', cat: 'weapon', weight: 2.2, rarity: 'rare', model: ['items', 'crossbow_2handed', 0.42], desc: 'Güçlü ve sessiz.', durability: 200, gun: { dmg: 85, rate: 1.4, mag: 1, ammo: 'bolt', spread: 0.006, recoil: 0.4, noise: 5, range: 100, reload: 1.6, projectile: 'bolt' }, hold: 'rifle' }),
  // ------------------------------------------------------------ MÜHİMMAT
  ammo_9mm: I('ammo_9mm', { name: '9mm Mermi', cat: 'ammo', weight: 0.01, stack: 120, rarity: 'uncommon', model: 'ammo_box', desc: 'Tabanca ve hafif makineli için.' }),
  shells: I('shells', { name: 'Av Fişeği', cat: 'ammo', weight: 0.04, stack: 60, rarity: 'uncommon', model: 'shells', desc: 'Av tüfeği için.' }),
  ammo_rifle: I('ammo_rifle', { name: 'Tüfek Mermisi', cat: 'ammo', weight: 0.03, stack: 60, rarity: 'rare', model: 'ammo_box_green', desc: 'Avcı tüfeği için.' }),
  arrow: I('arrow', { name: 'Ok', cat: 'ammo', weight: 0.05, stack: 40, model: ['items', 'arrow', 0.6], desc: 'Yay için. İsabet edince geri alınabilir.' }),
  bolt: I('bolt', { name: 'Arbalet Oku', cat: 'ammo', weight: 0.06, stack: 30, rarity: 'uncommon', model: ['items', 'arrow', 0.5], desc: 'Arbalet için.' }),
  // ------------------------------------------------------------ KIYAFET
  vest: I('vest', { name: 'Koruyucu Yelek', cat: 'wear', weight: 2.5, rarity: 'uncommon', model: 'vest', desc: 'Alınan hasarı %25 azaltır.', wear: { slot: 'body', armor: 0.25 }, durability: 200 }),
  helmet: I('helmet', { name: 'Kask', cat: 'wear', weight: 1.2, rarity: 'uncommon', model: 'helmet', desc: 'Kafa darbelerine karşı +%10 koruma.', wear: { slot: 'head', armor: 0.1 }, durability: 150 }),
  warm_jacket: I('warm_jacket', { name: 'Kalın Mont', cat: 'wear', weight: 1.5, model: 'jacket', desc: 'Soğuğa karşı korur.', wear: { slot: 'body2', warmth: 6 } }),
  raincoat: I('raincoat', { name: 'Yağmurluk', cat: 'wear', weight: 0.6, model: 'raincoat', desc: 'Yağmurda ıslanmanı ve üşümeni önler.', wear: { slot: 'body2', warmth: 2, rain: true } }),
  work_gloves: I('work_gloves', { name: 'İş Eldiveni', cat: 'wear', weight: 0.2, model: 'gloves', desc: 'İnşaat %10 hızlı, kesik yaralanmalarına karşı korur.', wear: { slot: 'hands', build: 0.1 } }),
  // ------------------------------------------------------------ HİKÂYE / ÖZEL
  keycard: I('keycard', { name: 'Güvenlik Kartı (Seviye 3)', cat: 'misc', weight: 0.01, rarity: 'story', model: 'keycard', desc: 'Araştırma tesisinin kapılarını açar. Üzerinde "PROJE KIZILÇAM" yazıyor.' }),
  armory_key: I('armory_key', { name: 'Cephanelik Anahtarı', cat: 'misc', weight: 0.02, rarity: 'story', model: ['items', 'key', 0.35], desc: 'Askerî cephanelik kapısını açar.' }),
  vault_code: I('vault_code', { name: 'Kasa Şifresi Notu', cat: 'misc', weight: 0.01, rarity: 'story', model: 'note', desc: '"Kasa: 2032-30" — banka kasa dairesini açar.' }),
  sea_map: I('sea_map', { name: 'Deniz Haritası', cat: 'misc', weight: 0.1, rarity: 'story', model: 'map', desc: 'Güvenli rotayı gösteren denizci haritası. Deniz yoluyla kaçış için gerekli.' }),
  lab_sample: I('lab_sample', { name: 'Virüs Numunesi', cat: 'misc', weight: 0.2, rarity: 'story', model: 'vial', desc: 'Parlayan yeşil sıvı. Askerlere teslim edilirse her şey değişebilir.' }),
  note: I('note', { name: 'Not', cat: 'misc', weight: 0, stack: 1, rarity: 'story', model: 'note', desc: 'Bir hikâye parçası. Günlüğe eklendi.' }),
  money: I('money', { name: 'Para', cat: 'misc', weight: 0, stack: 9999, model: 'money', desc: 'Takaslarda hâlâ işe yarıyor… şimdilik.' }),
  medal: I('medal', { name: 'Askerî Künye', cat: 'misc', weight: 0.02, stack: 10, rarity: 'uncommon', model: 'tag', desc: 'Askerlere götürürsen ilişkini iyileştirir.' }),
};

export const ITEM_IDS = Object.keys(ITEMS);
export function item(id) { return ITEMS[id]; }
export function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }

/** Envanter yığını oluştur */
export function makeStack(id, qty = 1, data = null) {
  const def = ITEMS[id];
  if (!def) throw new Error('Bilinmeyen eşya: ' + id);
  const s = { id, qty };
  if (def.durability) s.dur = def.durability;
  if (def.gun) s.ammo = 0;
  if (def.fuelCap) s.fuel = 0;
  if (data) Object.assign(s, data);
  return s;
}
