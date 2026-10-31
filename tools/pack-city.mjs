// Şehir kiti paketleyici: Quaternius "Downtown City MegaKit" (CC0) glTF dışa aktarımından hazır binalar ve sokak
// donatısı tek GLB'de (assets/models/city.glb); her model adıyla kök düğüm. Dokular küçültülüp WebP'ye çevrilir
// (renk 1024, normal/ORM 512, sahte iç mekân 256), meshopt ile sıkıştırılır. Oyunda 'city' kiti olarak yüklenir.
// Kullanım: node tools/pack-city.mjs <gltf_ve_dokular_klasörü> [çıkış.glb]
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [src, out = 'assets/models/city.glb'] = process.argv.slice(2);
if (!src) { console.error('kullanım: node tools/pack-city.mjs <klasör> [çıkış.glb]'); process.exit(1); }
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const MODELS = ['Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1', 'Prop_ACUnit', 'Prop_Bollard', 'Prop_Planter_Single', 'Prop_ManholeCover', 'Prop_Drain'];

const target = new Document();
target.createBuffer();
const scene = target.createScene('city');
for (const name of MODELS) {
  const doc = await io.read(path.join(src, name + '.gltf'));
  const s = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const holder = doc.createNode(name);
  // iç düğüm adı kökle çakışmasın (yükleyici benzersiz ad için sonek ekler)
  for (const n of s.listChildren()) { s.removeChild(n); n.setName(n.getName() + '_m'); holder.addChild(n); }
  s.addChild(holder);
  const merged = mergeDocuments(target, doc).get(s);
  for (const n of merged.listChildren()) { merged.removeChild(n); scene.addChild(n); }
  merged.dispose();
}
const root = target.getRoot();
const buf = root.listBuffers()[0];
for (const a of root.listAccessors()) a.setBuffer(buf);
for (const b of root.listBuffers()) if (b !== buf) b.dispose();
await target.transform(
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], pattern: /interior/i, quality: 80 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/, quality: 82 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], slots: /^(baseColorTexture|emissiveTexture)$/, quality: 84 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
await io.write(out, target);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
console.log(`${MODELS.length} model, ${Math.round(tris / 1000)}k üçgen, ${root.listTextures().length} doku → ${out} (${(fs.statSync(out).size / 1048576).toFixed(2)} MB)`);
