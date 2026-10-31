// Kit parça birleştirme (PartMerge) birim testleri: düz renk pişirme, aynı malzeme birleştirme, dokulu ayrık kalma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeParts, isFlatMaterial } from '../../src/core/PartMerge.js';

const box = () => new THREE.BoxGeometry(1, 1, 1);
const at = (x, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);

test('PartMerge: düz renkli malzemeler tek parçaya pişirilir (renk, pürüzlülük/metallik, ışıma köşe başına)', () => {
  const paint = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.2, metalness: 0 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, metalness: 0.5 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa00, emissiveIntensity: 2 });
  const parts = [{ geometry: box(), material: paint, matrix: at(0) }, { geometry: box(), material: tire, matrix: at(3) }, { geometry: box(), material: lamp, matrix: at(0, 2) }];
  const out = mergeParts(parts);
  assert.equal(out.length, 1);
  const g = out[0].geometry, n = g.attributes.position.count;
  assert.equal(n, 24 * 3);
  assert.ok(out[0].matrix.equals(new THREE.Matrix4()));
  assert.equal(out[0].material.vertexColors, true);
  // ilk kutu kırmızı ve pürüzsüz, ikinci kutu 3 m sağda ve metalik, üçüncü ışıyor
  const col = g.attributes.color, rm = g.attributes.aRM, emi = g.attributes.aEmi, pos = g.attributes.position;
  assert.ok(Math.abs(col.getX(0) - paint.color.r) < 1e-6 && col.getY(0) === 0);
  assert.ok(Math.abs(rm.getX(0) - 0.2) < 1e-6);
  assert.ok(pos.getX(24) > 2.4 && Math.abs(rm.getY(24) - 0.5) < 1e-6);
  assert.ok(Math.abs(emi.getX(48) - lamp.emissive.r * 2) < 1e-6 && emi.getX(0) === 0);
  // indeks aralığı doğru
  assert.equal(g.index.count, 36 * 3);
  assert.ok(Math.max(...g.index.array) === n - 1);
});

test('PartMerge: aynı dokulu malzeme birleşir, farklı dokulu ve saydam malzemeler ayrı kalır', () => {
  const tex = new THREE.Texture(), tex2 = new THREE.Texture();
  const a = new THREE.MeshStandardMaterial({ map: tex }), b = new THREE.MeshStandardMaterial({ map: tex2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });
  assert.equal(isFlatMaterial(a), false);
  assert.equal(isFlatMaterial(glass), false);
  const parts = [{ geometry: box(), material: a, matrix: at(0) }, { geometry: box(), material: a, matrix: at(2) }, { geometry: box(), material: b, matrix: at(4) }, { geometry: box(), material: glass, matrix: at(6) }];
  const out = mergeParts(parts);
  assert.equal(out.length, 3);
  const ma = out.find((p) => p.material === a);
  assert.equal(ma.merged, 2);
  assert.equal(ma.geometry.attributes.position.count, 48);
  assert.ok(ma.geometry.attributes.uv, 'uv korunur');
  assert.ok(out.find((p) => p.material === b).matrix.equals(at(4)), 'tek parça olduğu gibi kalır');
});

test('PartMerge: özel gölgelendiricili ya da aynalı parçalar güvenle işlenir', () => {
  const custom = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  custom.onBeforeCompile = () => {};
  assert.equal(isFlatMaterial(custom), false, 'onBeforeCompile kullanan malzemeye dokunulmaz');
  const m1 = new THREE.MeshStandardMaterial({ color: 0x00ff00 }), m2 = new THREE.MeshStandardMaterial({ color: 0x0000ff });
  const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const out = mergeParts([{ geometry: box(), material: m1, matrix: at(0) }, { geometry: box(), material: m2, matrix: mirror }]);
  assert.equal(out.length, 1);
  // aynalanan kutunun ilk üçgeninin yüz normali köşe normaliyle aynı yönde kalmalı (sarım düzeltildi)
  const g = out[0].geometry, ix = g.index.array, P = g.attributes.position, N = g.attributes.normal;
  const off = 36; // ikinci kutunun ilk üçgeni
  const v = (i) => new THREE.Vector3(P.getX(ix[i]), P.getY(ix[i]), P.getZ(ix[i]));
  const fn = new THREE.Vector3().subVectors(v(off + 1), v(off)).cross(new THREE.Vector3().subVectors(v(off + 2), v(off)));
  const vn = new THREE.Vector3(N.getX(ix[off]), N.getY(ix[off]), N.getZ(ix[off]));
  assert.ok(fn.dot(vn) > 0);
});
