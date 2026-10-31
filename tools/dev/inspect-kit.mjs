// glTF klasöründeki modellerin üçgen/malzeme/doku özeti: node tools/dev/inspect-kit.mjs <klasör> [desen]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';
const [dir, pat = ''] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const texSeen = new Map();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.gltf') && f.includes(pat)).sort()) {
  const doc = await io.read(path.join(dir, f));
  const root = doc.getRoot();
  let tris = 0, verts = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const idx = p.getIndices(); const pos = p.getAttribute('POSITION'); verts += pos.getCount(); tris += (idx ? idx.getCount() : pos.getCount()) / 3; }
  const mats = root.listMaterials().map((m) => `${m.getName()}${m.getAlphaMode() !== 'OPAQUE' ? '(' + m.getAlphaMode() + ')' : ''}${m.getDoubleSided() ? '[2s]' : ''}`);
  const tex = root.listTextures().map((t) => { const s = t.getSize(); const k = t.getURI(); texSeen.set(k, s); return k; });
  // sınır kutusu
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); const lo = a.getMin([]), hi = a.getMax([]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], lo[k]); mx[k] = Math.max(mx[k], hi[k]); } }
  const sz = mx.map((x, k) => (x - mn[k]).toFixed(1)).join('x');
  console.log(f.replace('.gltf', '').padEnd(26), String(tris).padStart(6), 'tri', String(verts).padStart(6), 'v', sz.padEnd(14), mats.join(','), '|', tex.join(','));
}
console.log('dokular:', [...texSeen].map(([k, s]) => `${k}:${s ? s.join('x') : '?'}`).join(' '));
