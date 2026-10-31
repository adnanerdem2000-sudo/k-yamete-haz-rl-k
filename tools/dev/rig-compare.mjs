// İki iskeletin dinlenme yerel dönüş/konum farkları (aynı adlı kemikler)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [a, b] = await Promise.all(process.argv.slice(2, 4).map((f) => io.read(f)));
const map = (d) => new Map(d.getRoot().listNodes().filter((n) => !n.getMesh()).map((n) => [n.getName(), n]));
const A = map(a), B = map(b);
let maxQ = 0, worst = '', rows = [];
for (const [name, na] of A) {
  const nb = B.get(name); if (!nb) continue;
  const qa = na.getRotation(), qb = nb.getRotation();
  const dot = Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]);
  const ang = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
  const ta = na.getTranslation(), tb = nb.getTranslation();
  const lenA = Math.hypot(...ta), lenB = Math.hypot(...tb);
  rows.push([name, ang.toFixed(2), lenA.toFixed(3), lenB.toFixed(3)]);
  if (ang > maxQ) { maxQ = ang; worst = name; }
}
console.log('max rest angle diff', maxQ.toFixed(2), 'deg at', worst);
console.log(rows.filter((r) => /Hips|Body|Abdomen|Torso|Chest|Neck|Head|UpperArm|LowerArm|Wrist|UpperLeg|LowerLeg|Foot|Shoulder/.test(r[0])).map((r) => r.join(' ')).join('\n'));
