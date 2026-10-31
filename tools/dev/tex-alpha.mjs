// GLB içindeki dokuların saydamlık istatistiği: node tools/dev/tex-alpha.mjs <dosya.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const t of doc.getRoot().listTextures()) {
  const { data, info } = await sharp(Buffer.from(t.getImage())).raw().toBuffer({ resolveWithObject: true });
  let a0 = 0, a255 = 0;
  if (info.channels === 4) for (let i = 3; i < data.length; i += 4) { if (data[i] < 8) a0++; else if (data[i] > 247) a255++; }
  console.log((t.getName() || '').padEnd(24), info.width + 'x' + info.height, 'kanal', info.channels, 'saydam', (a0 / (data.length / info.channels) * 100).toFixed(1) + '%', 'opak', (a255 / (data.length / info.channels) * 100).toFixed(1) + '%');
}
