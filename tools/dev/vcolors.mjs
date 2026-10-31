// Modellerdeki köşe renkleri (COLOR_0) özeti: node tools/dev/vcolors.mjs <klasör> <ad...>
import { NodeIO } from '@gltf-transform/core';
import path from 'node:path';
const [dir, ...names] = process.argv.slice(2);
const io = new NodeIO();
for (const n of names) {
  const doc = await io.read(path.join(dir, n + '.gltf'));
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const c = p.getAttribute('COLOR_0');
    const mat = p.getMaterial();
    if (!c) { console.log(n, mat && mat.getName(), 'COLOR_0 yok', 'factor', mat && mat.getBaseColorFactor().map((x) => x.toFixed(2)).join(',')); continue; }
    const k = c.getElementSize(), cnt = c.getCount();
    const mn = Array(k).fill(1e9), mx = Array(k).fill(-1e9), sum = Array(k).fill(0);
    const el = [];
    for (let i = 0; i < cnt; i++) { c.getElement(i, el); for (let j = 0; j < k; j++) { mn[j] = Math.min(mn[j], el[j]); mx[j] = Math.max(mx[j], el[j]); sum[j] += el[j]; } }
    console.log(n, mat && mat.getName(), 'COLOR_0', c.getComponentType(), 'min', mn.map((x) => x.toFixed(2)).join(','), 'max', mx.map((x) => x.toFixed(2)).join(','), 'ort', sum.map((x) => (x / cnt).toFixed(2)).join(','), 'factor', mat.getBaseColorFactor().map((x) => x.toFixed(2)).join(','));
  }
}
