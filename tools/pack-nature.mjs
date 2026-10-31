// Doğa kiti paketleyici: Quaternius "Stylized Nature MegaKit" (CC0) glTF modellerinden oyunda kullanılanları
// tek bir GLB'de toplar (assets/models/nature.glb). Uzak ağaçlar oyunda yükleme anında üretilen kart
// görüntüleriyle (impostor) çizilir. Dokular küçültülüp WebP'ye çevrilir (renk 1024, normal 512), yarı saydam
// yapraklar kesme saydamlığına (MASK) alınır (örnekli çizimde sıralama sorunu olmasın), meshopt ile sıkıştırılır.
// Yaprak dokuları: kitin glTF sürümündeki "_C" dokuları bilerek fantastik renkli (mavi/kırmızı/mor); bunların
// yerine kaynak klasördeki beyaz maskeler + doğal renk çarpanı kullanılır (oyun içinde renk varyantı: sonbahar).
// Kullanım: node tools/pack-nature.mjs <kit_glTF_klasörü> <kit_Blends/textures_klasörü> [çıkış.glb]
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [src, masks, out = 'assets/models/nature.glb'] = process.argv.slice(2);
if (!src || !masks) { console.error('kullanım: node tools/pack-nature.mjs <kit_glTF_klasörü> <kit_Blends/textures_klasörü> [çıkış.glb]'); process.exit(1); }
// yaprak maskesi → doğal renk (sRGB); oyun malzemeyi bu renkten türetir
const LEAF = {
  Leaves_NormalTree_C: ['Leaves_NormalTree', '#5f8f2e'], Leaf_Pine_C: ['Leaf_Pine', '#3b6428'], Leaves_GiantPine_C: ['Leaves_GiantPine', '#41692b'],
  Leaves_TallThick_C: ['Leaves_TallThick', '#3c6a33'], Leaves_Birch_C: ['Leaves_Birch', '#86a83a'], Leaves_TwistedTree_C: ['Leaves_TwistedTree', '#557d2d'],
  Leaves_CherryBlossom_C: ['Leaves_CherryBlossom', '#e7a4c2'],
};
const lin = (hex) => { const c = parseInt(hex.slice(1), 16); return [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); };
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// Oyunda kullanılan modeller (ağaç, çalı, kaya, zemin örtüsü)
const MODELS = {
  CommonTree_1: {}, CommonTree_2: {}, CommonTree_3: {}, CommonTree_4: {}, CommonTree_5: {},
  Pine_1: {}, Pine_2: {}, Pine_3: {}, Pine_4: {},
  GiantPine_1: {}, GiantPine_3: {}, TallThick_1: {}, TallThick_2: {},
  Birch_1: {}, Birch_3: {}, Birch_5: {},
  DeadTree_1: {}, DeadTree_2: {}, DeadTree_3: {}, DeadTree_4: {},
  TwistedTree_1: {}, TwistedTree_3: {}, CherryBlossom_2: {},
  Bush_Common: {}, Bush_Common_Flowers: {}, Bush_Large: {}, Bush_Large_Flowers: {}, Bush_Long_1: {},
  Rock_Big_1: {}, Rock_Big_2: {}, Rock_Medium_1: {}, Rock_Medium_2: {}, Rock_Medium_3: {}, Rock_Medium_4: {},
  Grass_Common_Short: {}, Grass_Common_Tall: {}, Grass_Wide_Short: {}, Grass_Wispy_Short: {}, Grass_Wispy_Tall: {}, Grass_Wheat: {},
  Fern_1: {}, Fern_2: {}, Clover_1: {}, Plant_1: {}, Plant_2: {}, Plant_5: {}, Plant_7: {},
  Flower_1_Group: {}, Flower_2_Group: {}, Flower_3_Group: {}, Flower_4_Group: {}, Flower_7_Group: {},
  Mushroom_Common: {}, Mushroom_RedCap: {}, Pebble_Round_1: {}, Pebble_Round_3: {}, Pebble_Square_2: {},
  RockPath_Round_Thin: {}, RockPath_Square_Wide: {},
};

const target = new Document();
target.createBuffer();
const scene = target.createScene('nature');
/** Belgenin sahne köklerini adı verilen tek düğüm altında topla, hedef belgeye kat */
async function addModel(doc, name) {
  const s = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const holder = doc.createNode(name);
  for (const n of s.listChildren()) { s.removeChild(n); holder.addChild(n); }
  s.addChild(holder);
  const map = mergeDocuments(target, doc);
  const merged = map.get(s);
  for (const n of merged.listChildren()) { merged.removeChild(n); scene.addChild(n); }
  merged.dispose();
}

let n = 0;
for (const [name, opt] of Object.entries(MODELS)) {
  const file = path.join(src, name + '.gltf');
  if (!fs.existsSync(file)) { console.warn('yok:', name); continue; }
  const doc = await io.read(file);
  // yarı saydam yaprak → kesme saydamlığı (örnekli çizimde sıralama hatası olmasın)
  for (const m of doc.getRoot().listMaterials()) if (m.getAlphaMode() === 'BLEND') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); }
  // yaprak: beyaz maske + doğal renk
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getBaseColorTexture();
    const key = t && path.basename(t.getURI() || '', '.png');
    if (!LEAF[key]) continue;
    const [mask, col] = LEAF[key];
    t.setImage(fs.readFileSync(path.join(masks, mask + '.png'))).setURI(mask + '.png').setName(mask);
    m.setBaseColorFactor([...lin(col), 1]);
  }
  await addModel(doc, name);
  n++;
}
const root = target.getRoot();
// tüm tamponları tek tamponda birleştir
const buf = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buf);
for (const b of root.listBuffers()) if (b !== buf) b.dispose();
await target.transform(
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /^normalTexture$/, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], slots: /^baseColorTexture$/, quality: 84 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write(out, target);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log(`${n} model, ${root.listMeshes().length} ağ, ${Math.round(tris / 1000)}k üçgen, ${root.listTextures().length} doku → ${out} (${(fs.statSync(out).size / 1048576).toFixed(2)} MB)`);
for (const t of root.listTextures()) console.log('  ', t.getName() || t.getURI(), t.getMimeType(), t.getSize()?.join('x'), Math.round(t.getImage().byteLength / 1024) + ' KB');
