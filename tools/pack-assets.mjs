// KIYAMETTEN ÖNCE — asset paketleyici
// Seçilen CC0 modelleri (Kenney, KayKit) kit başına tek bir GLB dosyasında birleştirir.
// Her model, GLB içinde adıyla isimlendirilmiş bir kök düğüm olarak saklanır; oyun
// çalışırken `kit.getObjectByName(ad)` ile klonlanır.
//
// Kullanım: node tools/pack-assets.mjs <kaynak_klasörü>
// Kaynak klasör şu depoların klonlarını içermelidir (hepsi CC0):
//   pmndrs/market-assets, KayKit-Game-Assets/KayKit-*-1.0, KenneyNL/Starter-Kit-*
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.argv[2] || '/tmp/assets_src');
const OUT = path.resolve('assets/models');

const P = {
  M: (n) => {
    const d = path.join(SRC, 'market-assets/files/models', n);
    return fs.existsSync(path.join(d, 'model.glb')) ? path.join(d, 'model.glb') : path.join(d, 'model.gltf');
  },
  KF: (n) => path.join(SRC, 'KayKit-Furniture-Bits-1.0/addons/kaykit_furniture_bits/Assets/gltf', n + '.gltf'),
  KR: (n) => path.join(SRC, 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf', n + '.gltf'),
  KH: (n) => path.join(SRC, 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf', n + '.gltf'),
  KP: (n) => path.join(SRC, 'KayKit-Prototype-Bits-1.0/addons/kaykit_prototype_bits/Assets/gltf', n + '.gltf'),
  KC: (n) => path.join(SRC, 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf', n + '.gltf'),
  KD: (n) => path.join(SRC, 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf', n + '.gltf.glb'),
  KA: (n) => path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Assets/gltf', n + '.gltf'),
  NC: (n) => path.join(SRC, 'Starter-Kit-City-Builder/models', n + '.glb'),
  NR: (n) => path.join(SRC, 'Starter-Kit-Racing/models', n + '.glb'),
};

const list = (src, names) => names.split(/\s+/).filter(Boolean).map((n) => ({ src, n }));

const KITS = {
  // insan karakterleri ve hayvanlar: tools/pack-rigged.mjs (assets/models/rigged/)
  vehicles: [
    ...list('M', 'sedan suv suv-luxury van police-car ambulance taxi truck truck-flat hatchback delivery-truck garbage-truck firetruck tractor citroen-old-van boat-small boat-large sports-sedan'),
    ...list('NR', 'vehicle-truck-red vehicle-truck-green vehicle-truck-yellow vehicle-motorcycle'),
    ...list('KC', 'car_hatchback car_sedan car_stationwagon car_taxi car_police'),
  ],
  buildings: [
    ...list('M', 'house1 house-3 house-4 house-5 house-6 house-7 house-18 library-large wind-turbine'),
    ...list('NC', 'building-small-a building-small-b building-small-c building-small-d building-garage pavement-fountain grass-trees grass-trees-tall'),
    ...list('KC', 'building_A building_B building_C building_D building_E building_F building_G building_H watertower'),
  ],
  furniture: list('KF', `armchair armchair_pillows bed_double_A bed_double_B bed_single_A bed_single_B book_set book_single
    cabinet_medium cabinet_medium_decorated cabinet_small cabinet_small_decorated cactus_medium_A cactus_small_A chair_A chair_A_wood
    chair_B chair_B_wood chair_C chair_stool chair_stool_wood couch couch_pillows lamp_standing lamp_table pictureframe_large_A
    pictureframe_large_B pictureframe_medium pictureframe_small_A pictureframe_standing_A pillow_A pillow_B rug_oval_A rug_oval_B
    rug_rectangle_A rug_rectangle_B rug_rectangle_stripes_A rug_rectangle_stripes_B shelf_A_big shelf_A_small shelf_B_large
    shelf_B_large_decorated shelf_B_small shelf_B_small_decorated table_low table_medium table_medium_long table_small`),
  kitchen: list('KR', `fridge_A fridge_A_decorated fridge_B oven stove_multi stove_single kitchencabinet kitchencabinet_half
    kitchencounter_straight_A kitchencounter_straight_B kitchencounter_sink kitchencounter_straight_decorated kitchencounter_straight_A_decorated
    kitchentable_A kitchentable_A_large kitchentable_A_large_decorated kitchentable_sink extractorhood crate crate_buns crate_carrots
    crate_cheese crate_ham crate_lettuce crate_onions crate_potatoes crate_steak crate_tomatoes crate_lid jar_A_large jar_B_medium
    jar_C_small jar_D_large pot_A pot_A_stew pan_A plate bowl food_stew food_dinner food_burger ketchup mustard shelf_papertowel
    shelf_papertowel_decorated papertowel dishrack_plates table_round_A table_round_A_decorated chair_A chair_B menu
    food_ingredient_carrot food_ingredient_tomato food_ingredient_lettuce food_ingredient_potato food_ingredient_onion
    food_ingredient_steak food_ingredient_cheese food_ingredient_ham food_ingredient_bun`),
  props: [
    ...list('KC', 'bench box_A box_B bush dumpster firehydrant streetlight trafficlight_A trafficlight_B trash_A trash_B'),
    ...list('KH', `fence fence_broken fence_gate fence_pillar fence_pillar_broken fence_seperate fence_seperate_broken
      tree_dead_large tree_dead_large_decorated tree_dead_medium tree_dead_small tree_pine_orange_large tree_pine_orange_medium
      tree_pine_orange_small tree_pine_yellow_large tree_pine_yellow_medium tree_pine_yellow_small lantern_standing lantern_hanging
      post_lantern post grave_A grave_B grave_A_destroyed gravestone gravemarker_A gravemarker_B pumpkin_orange pumpkin_orange_small
      pumpkin_yellow pumpkin_orange_jackolantern bench_decorated arch_gate crypt candle candle_triple skull bone_A ribcage`),
    ...list('KP', 'Barrel_A Barrel_B Barrel_C Box_A Box_B Box_C Pallet_Large Pallet_Small Pallet_Small_Decorated_A Pallet_Small_Decorated_B Can_A Can_B'),
    ...list('KD', `barrel_large barrel_large_decorated barrel_small barrel_small_stack box_large box_small box_small_decorated box_stacked
      crates_stacked keg keg_decorated shelf_large shelf_small shelves rubble_half rubble_large bed_frame bed_decorated
      bottle_A_brown bottle_A_green bottle_A_labeled_green bottle_B_green`),
    ...list('M', `tree-big tree-small palm-long palm-short palm-detailed-long formation-rock formation-stone
      formation-large-rock formation-large-stone bench barrel pumpkin ship-wreck dogue`),
    ...list('NR', 'decoration-forest decoration-tents'),
  ],
  items: [
    ...list('M', `can can-open can-small soda-can soda-bottle bottle bottle-large bottle-oil bread loaf loaf-round apple banana pear
      orange carrot tomato cabbage corn onion eggplant mushroom fish fish-bones meat-raw meat-cooked meat-sausage whole-ham candy-bar
      chocolate cookie carton carton-small styrofoam-dinner sandwich hot-dog pizza-box bag bag-flat cooking-knife shovel frying-pan
      pot pot-stew honey peanut-butter cheese egg watermelon plate bowl glass cup`),
    ...list('KA', 'axe_1handed axe_2handed crossbow_1handed crossbow_2handed dagger arrow arrow_bundle quiver smokebomb mug_full shield_round'),
    ...list('KD', 'key keyring'),
  ],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

// Draco ile sıkıştırılmış kaynakları açıp uzantıyı kaldırıyoruz: oyun ek bir çözücüye ihtiyaç duymaz.
function stripCompression(doc) {
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression' || ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  }
}

async function packKit(kitName, entries) {
  // Boş bir belge kurup tüm modelleri içine birleştiriyoruz.
  const doc = new Document();
  doc.createBuffer();
  const mainScene = doc.createScene('kit_' + kitName);
  doc.getRoot().setDefaultScene(mainScene);
  const missing = [];
  for (const e of entries) {
    const file = resolvePath(e);
    if (!fs.existsSync(file)) { missing.push(e.n); continue; }
    const src = await io.read(file);
    stripCompression(src);
    const srcScene = src.getRoot().getDefaultScene() || src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const mappedScene = map.get(srcScene);
    const wrapper = doc.createNode(e.n);
    for (const child of mappedScene.listChildren()) {
      mappedScene.removeChild(child);
      wrapper.addChild(child);
    }
    mainScene.addChild(wrapper);
    for (const s of doc.getRoot().listScenes()) if (s !== mainScene) s.dispose();
  }
  await doc.transform(unpartition(), dedup(), prune({ keepLeaves: true }));
  const out = path.join(OUT, kitName + '.glb');
  await io.write(out, doc);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${kitName}.glb: ${entries.length - missing.length} model, ${kb} KB` + (missing.length ? `  (eksik: ${missing.join(', ')})` : ''));
}

function resolvePath(e) { return P[e.src](e.n); }

fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[3];
for (const [name, entries] of Object.entries(KITS)) {
  if (only && only !== name) continue;
  await packKit(name, entries);
}
