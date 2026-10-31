// İskeletli modelleri (insan tabanları ve hayvanlar) oyun için paketler:
// meshopt sıkıştırmasını çözer, gereksiz düğümleri (kılıç vb.) ve yinelenen animasyonları atar,
// animasyon adlarındaki "Armature|" öneklerini temizler, anahtar kareleri sadeleştirir ve
// meshopt ile sıkıştırır (tarayıcıda vendor/meshopt çözücüsü açar). Kaynak: @netforge/asset-library-files (CC0, Quaternius).
// Kullanım: node tools/pack-rigged.mjs <netforge_lowpoly_klasörü> <çıkış_klasörü>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('kullanım: node tools/pack-rigged.mjs <kaynak> <çıkış>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// oyundaki ad ← kaynak dosya; drop: silinecek düğüm adları
const MODELS = {
  male: { file: 'adventurer.glb', drop: [] },
  female: { file: 'hooded_adventurer.glb', drop: ['Sword'] },
  wolf: { file: 'wolf.glb' },
  deer: { file: 'deer.glb' },
  stag: { file: 'stag.glb' },
  husky: { file: 'husky.glb' },
  fox: { file: 'fox.glb' },
  shiba: { file: 'shiba.glb' },
};

for (const [name, m] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(src, m.file));
  const root = doc.getRoot();
  for (const n of root.listNodes()) if ((m.drop || []).includes(n.getName())) n.dispose();
  // yinelenen animasyonlar: aynı kısa ada sahip olanlardan yalnızca birini tut
  const seen = new Set();
  for (const a of root.listAnimations()) {
    const short = a.getName().split('|').pop();
    if (seen.has(short)) { a.dispose(); continue; }
    seen.add(short);
    a.setName(short);
  }
  await doc.transform(prune(), dedup(), resample({ tolerance: 1e-4 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(out, name + '.glb');
  await io.write(file, doc);
  const anims = root.listAnimations().map((a) => a.getName());
  console.log(name.padEnd(8), (fs.statSync(file).size / 1024).toFixed(0).padStart(5) + ' KB', anims.length, 'anim:', anims.join(' '));
}
