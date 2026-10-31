import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  console.log('###', f.split('/').pop());
  for (const n of root.listNodes()) {
    const m = n.getMesh();
    if (!m) continue;
    const prims = m.listPrimitives().map((p) => `${p.getMaterial() ? p.getMaterial().getName() : '-'}:${p.getAttribute('POSITION').getCount()}v`);
    console.log('  node', n.getName(), 'skin=', !!n.getSkin(), prims.join(' '));
  }
  console.log('  anims:', root.listAnimations().map((a) => a.getName().replace(/.*\|/, '')).join(' '));
}
