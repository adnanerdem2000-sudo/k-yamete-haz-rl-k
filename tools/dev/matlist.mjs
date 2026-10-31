// glb içindeki üst düzey modellerin malzeme özeti: node tools/dev/matlist.mjs <dosya.glb> [ad-regex]
// [T:doku] taban renk dokusu, [N] normal haritası, [BLEND/MASK] saydamlık; sayılar: parça (primitive) sayısı
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const filt = process.argv[3] ? new RegExp(process.argv[3]) : null;
const mats = root.listMaterials();
console.log('malzeme', mats.length, 'dokulu', mats.filter((m) => m.getBaseColorTexture()).length, 'doku', root.listTextures().length);
for (const top of root.listScenes()[0].listChildren()) {
  if (filt && !filt.test(top.getName())) continue;
  const prims = [];
  top.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    for (const p of m.listPrimitives()) {
      const mt = p.getMaterial();
      prims.push(mt ? `${mt.getName()}${mt.getBaseColorTexture() ? '[T:' + (mt.getBaseColorTexture().getName() || mt.getBaseColorTexture().getURI()) + ']' : ''}${mt.getNormalTexture() ? '[N]' : ''}${mt.getAlphaMode() !== 'OPAQUE' ? '[' + mt.getAlphaMode() + ']' : ''}` : 'yok');
    }
  });
  console.log(top.getName(), prims.length, [...new Set(prims)].join(' | '));
}
