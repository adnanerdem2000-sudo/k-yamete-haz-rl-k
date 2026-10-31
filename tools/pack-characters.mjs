// Modüler insan karakterlerini oyun için paketler (Quaternius "Ultimate Modular Men/Women", CC0).
// Her dosya tek iskelet (62 kemikli CharacterArmature), 24 klip ve kafa/gövde/bacak/ayak parçalarını içerir;
// oyunda karakter başına parçalar seçilip tek deri ağında birleştirilir (CharacterFactory → ModularBase).
// Tema dışı parçalar (kral, uzay, cadı, ortaçağ kafaları) atılır, animasyonlar sadeleştirilir, meshopt ile sıkıştırılır.
// Kullanım: node tools/pack-characters.mjs <men.glb> <women.glb> <çıkış_klasörü>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [menSrc, womenSrc, out] = process.argv.slice(2);
if (!menSrc || !womenSrc || !out) { console.error('kullanım: node tools/pack-characters.mjs <men.glb> <women.glb> <çıkış>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const DROP = {
  men: ['King_Head', 'Spacesuit_Head'],
  women: ['Medieval_Head', 'Witch_Head'],
};

for (const [name, src] of [['men', menSrc], ['women', womenSrc]]) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (DROP[name].includes(n.getName())) n.dispose();
  await doc.transform(prune(), dedup(), resample({ tolerance: 1e-4 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(out, name + '.glb');
  await io.write(file, doc);
  const parts = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  console.log(name.padEnd(6), (fs.statSync(file).size / 1024).toFixed(0).padStart(5) + ' KB', parts.length, 'parça,', root.listAnimations().length, 'klip');
}
