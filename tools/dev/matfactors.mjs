// glb malzemelerinin çarpanları: node tools/dev/matfactors.mjs <dosya.glb> [ad-regex]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const filt = process.argv[3] ? new RegExp(process.argv[3]) : null;
for (const m of doc.getRoot().listMaterials()) {
  if (filt && !filt.test(m.getName())) continue;
  const c = m.getBaseColorFactor().map((v) => +v.toFixed(2));
  console.log(m.getName().padEnd(28), 'renk', c.join(','), 'pür', +m.getRoughnessFactor().toFixed(2), 'met', +m.getMetallicFactor().toFixed(2), 'ışıma', m.getEmissiveFactor().map((v) => +v.toFixed(2)).join(','), m.getBaseColorTexture() ? 'DOKU' : '', m.getAlphaMode(), m.getDoubleSided() ? 'çift' : '');
}
