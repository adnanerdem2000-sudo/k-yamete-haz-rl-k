// GLB düğüm hiyerarşisi: node tools/dev/nodelist.mjs <dosya.glb> [ad-regex]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const re = new RegExp(process.argv[3] || '.');
const walk = (n, depth, out) => { out.push('  '.repeat(depth) + n.getName() + (n.getMesh() ? ' [mesh: ' + n.getMesh().listPrimitives().map((p) => p.getMaterial() && p.getMaterial().getName()).join(',') + ']' : '')); for (const c of n.listChildren()) walk(c, depth + 1, out); };
for (const scene of doc.getRoot().listScenes()) for (const n of scene.listChildren()) if (re.test(n.getName())) { const out = []; walk(n, 0, out); console.log(out.join('\n')); }
