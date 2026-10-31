// Meshopt/Draco sıkıştırmalı GLB'leri çözüp sıkıştırmasız GLB olarak yazar (önizleme/paketleme için).
// Kullanım: node tools/decode-glb.mjs <çıkış_klasörü> <girdi.glb>...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import path from 'node:path';
import fs from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
const [out, ...files] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const f of files) {
  const doc = await io.read(f);
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    const n = ext.extensionName;
    if (n === 'EXT_meshopt_compression' || n === 'KHR_draco_mesh_compression' || n === 'KHR_mesh_quantization') ext.dispose();
  }
  await io.write(path.join(out, path.basename(f)), doc);
  console.log('ok', path.basename(f));
}
