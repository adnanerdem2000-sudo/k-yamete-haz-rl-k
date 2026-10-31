// Üretim tarifleri (CraftingManager). time: oyun dakikası. station: none | workbench | fire | water_filter
// level: gerekli atölye seviyesi. perk: süre/çıktı bonusu veren karakter yeteneği.

export const RECIPE_CATS = { all: 'Tümü', basic: 'Temel Ekipman', weapon: 'Silah', survival: 'Yaşam', vehicle: 'Araç', med: 'Tıbbi', cook: 'Yemek' };

const R = (id, o) => ({ id, time: 10, station: 'none', level: 0, tools: [], qty: 1, ...o });

export const RECIPES = [
  // ---- temel
  R('plank', { cat: 'basic', name: 'Tahta Kes', in: [['log', 1]], out: 'plank', qty: 3, tools: ['axe'], time: 6 }),
  R('metal_sheet', { cat: 'basic', name: 'Metal Levha Döv', in: [['scrap_metal', 3], ['nails', 4]], out: 'metal_sheet', tools: ['hammer'], station: 'workbench', level: 1, time: 15, perk: 'repair' }),
  R('rope', { cat: 'basic', name: 'İp Ör', in: [['cloth', 3]], out: 'rope', time: 5 }),
  R('hammer', { cat: 'basic', name: 'Çekiç', in: [['plank', 1], ['scrap_metal', 1]], out: 'hammer', time: 10 }),
  R('axe', { cat: 'basic', name: 'Balta', in: [['plank', 2], ['scrap_metal', 2], ['rope', 1]], out: 'axe', station: 'workbench', level: 1, time: 20 }),
  R('flashlight', { cat: 'basic', name: 'El Feneri', in: [['plastic', 1], ['electronics', 1], ['glass', 1], ['battery', 1]], out: 'flashlight', station: 'workbench', level: 1, time: 15, perk: 'repair' }),
  R('radio', { cat: 'basic', name: 'Telsiz', in: [['electronics', 3], ['wire', 2], ['plastic', 1], ['battery', 2]], out: 'radio', station: 'workbench', level: 2, time: 40, perk: 'repair' }),
  R('lockpick', { cat: 'basic', name: 'Maymuncuk', in: [['scrap_metal', 1]], out: 'lockpick', qty: 3, station: 'workbench', level: 1, time: 5 }),
  R('fishing_rod', { cat: 'basic', name: 'Olta', in: [['plank', 1], ['rope', 1], ['nails', 2]], out: 'fishing_rod', time: 10 }),
  R('bait', { cat: 'basic', name: 'Balık Yemi', in: [['mushroom', 1]], out: 'bait', qty: 6, time: 2 }),
  R('backpack_small', { cat: 'basic', name: 'Küçük Sırt Çantası', in: [['cloth', 3], ['rope', 1]], out: 'backpack_small', time: 20 }),
  R('backpack_large', { cat: 'basic', name: 'Büyük Kamp Çantası', in: [['leather', 2], ['cloth', 4], ['rope', 2]], out: 'backpack_large', station: 'workbench', level: 1, time: 40 }),
  R('sleeping_bag', { cat: 'basic', name: 'Uyku Tulumu', in: [['cloth', 4], ['rope', 1]], out: 'sleeping_bag', time: 20 }),
  R('smoke_bomb', { cat: 'basic', name: 'Ses Bombası', in: [['battery', 1], ['electronics', 1], ['plastic', 1]], out: 'smoke_bomb', station: 'workbench', level: 1, time: 10, perk: 'repair' }),
  R('work_gloves', { cat: 'basic', name: 'İş Eldiveni', in: [['cloth', 2], ['leather', 1]], out: 'work_gloves', time: 10 }),
  // ---- silah
  R('spiked_bat', { cat: 'weapon', name: 'Çivili Sopa', in: [['bat', 1], ['nails', 10]], out: 'spiked_bat', tools: ['hammer'], time: 8 }),
  R('bow', { cat: 'weapon', name: 'Yay', in: [['plank', 2], ['rope', 1]], out: 'bow', station: 'workbench', level: 1, time: 30, perk: 'hunt' }),
  R('arrow', { cat: 'weapon', name: 'Ok (x6)', in: [['plank', 1], ['nails', 3]], out: 'arrow', qty: 6, time: 10, perk: 'hunt' }),
  R('bolt', { cat: 'weapon', name: 'Arbalet Oku (x4)', in: [['plank', 1], ['nails', 4]], out: 'bolt', qty: 4, station: 'workbench', level: 1, time: 10 }),
  R('crossbow', { cat: 'weapon', name: 'Arbalet', in: [['plank', 2], ['metal_sheet', 2], ['rope', 1], ['screws', 10]], out: 'crossbow', station: 'workbench', level: 2, time: 60 }),
  R('molotov', { cat: 'weapon', name: 'Molotof', in: [['empty_bottle', 1], ['cloth', 1]], fuel: 1, out: 'molotov', time: 4 }),
  R('ammo_9mm', { cat: 'weapon', name: '9mm Mermi Doldur (x8)', in: [['scrap_metal', 2], ['electronics', 1]], out: 'ammo_9mm', qty: 8, station: 'workbench', level: 3, time: 30 }),
  R('shells', { cat: 'weapon', name: 'Fişek Doldur (x6)', in: [['scrap_metal', 2], ['plastic', 1]], out: 'shells', qty: 6, station: 'workbench', level: 3, time: 30 }),
  // ---- yaşam
  R('boil_water', { cat: 'survival', name: 'Su Kaynat', in: [['dirty_water', 1]], out: 'water_bottle', station: 'fire', time: 6 }),
  R('filter_water', { cat: 'survival', name: 'Suyu Filtrele', in: [['dirty_water', 1]], out: 'water_bottle', station: 'water_filter', time: 2 }),
  R('charcoal', { cat: 'survival', name: 'Kömür Tableti', in: [['log', 1]], out: 'charcoal', qty: 3, station: 'fire', time: 15 }),
  R('seeds', { cat: 'survival', name: 'Tohum Ayıkla', in: [['tomato', 1]], out: 'seeds', qty: 3, time: 3 }),
  // ---- araç
  R('repair_kit', { cat: 'vehicle', name: 'Tamir Seti', in: [['scrap_metal', 2], ['duct_tape', 1], ['screws', 10]], out: 'repair_kit', station: 'workbench', level: 1, time: 20, perk: 'repair' }),
  R('armor_kit', { cat: 'vehicle', name: 'Araç Zırh Kiti', in: [['metal_sheet', 4], ['screws', 20], ['duct_tape', 1]], out: 'armor_kit', station: 'workbench', level: 2, time: 60, perk: 'repair' }),
  R('jerrycan', { cat: 'vehicle', name: 'Yakıt Bidonu', in: [['plastic', 3], ['duct_tape', 1]], out: 'jerrycan', station: 'workbench', level: 1, time: 15 }),
  // ---- tıbbi
  R('bandage', { cat: 'med', name: 'Bandaj (x2)', in: [['cloth', 2]], out: 'bandage', qty: 2, time: 4, perk: 'heal' }),
  R('splint', { cat: 'med', name: 'Atel', in: [['plank', 2], ['cloth', 1]], out: 'splint', time: 6, perk: 'heal' }),
  R('first_aid', { cat: 'med', name: 'İlk Yardım Çantası', in: [['bandage', 3], ['antiseptic', 1], ['painkiller', 1]], out: 'first_aid', time: 10, perk: 'heal' }),
  // ---- yemek (ateş/ocak gerekir)
  R('cooked_meat', { cat: 'cook', name: 'Et Pişir', in: [['raw_meat', 1]], out: 'cooked_meat', station: 'fire', time: 10 }),
  R('cooked_fish', { cat: 'cook', name: 'Balık Izgara', in: [['raw_fish', 1]], out: 'cooked_fish', station: 'fire', time: 8 }),
  R('stew', { cat: 'cook', name: 'Sebze Güveci', in: [['carrot', 2], ['tomato', 1], ['water_bottle', 1]], out: 'stew', station: 'fire', time: 20 }),
  R('corn_cooked', { cat: 'cook', name: 'Haşlanmış Mısır (Güveç)', in: [['corn', 2], ['cabbage', 1], ['water_bottle', 1]], out: 'stew', station: 'fire', time: 20 }),
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
