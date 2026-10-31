// GLB inceleme: düğüm/kemik adları, materyaller, animasyon adları ve süreleri
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import path from 'node:path';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const skins = root.listSkins();
  const joints = skins[0] ? skins[0].listJoints().map((j) => j.getName()) : [];
  const mats = root.listMaterials().map((m) => `${m.getName()}${m.getBaseColorTexture() ? '[tex]' : ''}#${m.getBaseColorFactor().slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`);
  const anims = root.listAnimations().map((a) => { let mx = 0; for (const s of a.listSamplers()) { const t = s.getInput(); if (t) mx = Math.max(mx, t.getMax([])[0]); } return `${a.getName()}(${mx.toFixed(2)})`; });
  const meshes = root.listMeshes().map((m) => m.getName());
  console.log(`\n### ${path.basename(f)}  joints=${joints.length} meshes=${meshes.length}`);
  console.log('materials:', mats.join(', '));
  console.log('joints:', joints.join(' '));
  console.log('anims:', anims.join(' '));
}
