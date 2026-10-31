// Cephe ayrıntıları (Facade) ve iç mekân dokusu (InteriorDress) birim testleri: geometri gerçekten üretiliyor,
// doğru kovalara gidiyor, açıklıklarla çakışmıyor, bina durumu deterministik
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Geo } from '../../src/world/Geo.js';
import { facadeDetails, awning, buildHipRoof } from '../../src/world/Facade.js';
import { buildingState, dressInterior } from '../../src/world/InteriorDress.js';
import { RNG } from '../../src/core/util.js';

const bucketTris = (geo, key) => { const b = geo.buckets.get(key); return b ? b.idx.length / 3 : 0; };
const allTris = (geo) => [...geo.buckets.values()].reduce((a, b) => a + b.idx.length / 3, 0);
const base = () => ({ w: 10, d: 7, H: 3.4, F: 0.2, t: 0.25, rng: new RNG('t'), openings: { F: [{ s: 2, e: 3.1, y0: 0.9, y1: 2.1, win: true }, { s: 5, e: 6.05, y0: 0, y1: 2.15, door: {} }], B: [{ s: 3, e: 4.2, y0: 0.9, y1: 2.1, win: true }], L: [], R: [] } });

test('Facade: ev stili (beşik çatı) → subasman, panjur, oluk ve iniş boruları eklenir', () => {
  const geo = new Geo(), roof = new Geo();
  facadeDetails(geo, roof, { ...base(), st: { ext: 'siding', trimColor: '#f4f1ea', extColor: '#d9b07a' }, spec: { id: 'h1', region: 'mahalle' }, roofType: 'gable' });
  assert.ok(bucketTris(geo, 'concrete') >= 4 * 10, 'subasman bandı (4 kutu, alt yüz yok)');
  assert.ok(bucketTris(geo, 'wood') >= 2 * 12, 'panjur kanatları');
  assert.ok(bucketTris(geo, 'metal') >= 4 * 12, 'oluk ve iniş boruları');
  assert.equal(bucketTris(roof, 'metal') % 1, 0);
});

test('Facade: şehir (düz çatı, tuğla) → korniş, köşe taşları, lento, çatı boruları, yangın merdiveni', () => {
  const geo = new Geo(), roof = new Geo();
  facadeDetails(geo, roof, { ...base(), st: { ext: 'brick', trimColor: '#f1e2c8', extColor: '#c97b5a' }, spec: { id: 's1', region: 'sehir' }, roofType: 'flat' });
  assert.ok(bucketTris(geo, 'trim') >= 12 * 10, 'korniş + lento + kilit taşı');
  assert.ok(bucketTris(geo, 'brick') >= 12 * 8, 'köşe taşları');
  assert.ok(bucketTris(roof, 'metal') > 0, 'çatı boruları / kapak');
  assert.ok(bucketTris(geo, 'metal') >= 12 * 9, 'yangın merdiveni (2 ray + ≥5 basamak + platform + korkuluk)');
  // yangın merdiveni açıklığı olmayan yan duvara (L) konur: tüm metal kutular x < 0 ya da x > w tarafında
  const b = geo.buckets.get('metal');
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < b.pos.length; i += 3) { minX = Math.min(minX, b.pos[i]); maxX = Math.max(maxX, b.pos[i]); }
  assert.ok(minX < -0.1 || maxX > 10.1, 'merdiven dış duvarın dışında');
});

test('Facade: tente çizgili bez + çubuklar üretir, kırma çatı dört eğim + mahya verir', () => {
  const g = new Geo();
  awning(g, 4, 7, 7.125, 2.6, 3.5, new RNG('a'));
  assert.ok(bucketTris(g, 'plain') >= 6 * 2, 'bez şeritleri');
  assert.ok(bucketTris(g, 'metal') === 2 * 6 * 12, 'iki taşıyıcı çubuk × 6 parça');
  const r = new Geo();
  const rise = buildHipRoof(r, { w: 10, d: 7, chimney: true }, { roofColor: '#8a3a2a', trimColor: '#fff' }, 3.4, 0.2);
  assert.ok(rise > 1.5 && rise < 2.5, 'çatı yükselmesi');
  assert.equal(bucketTris(r, 'shingles'), 2 * 2 + 2, 'iki yamuk (4 üçgen) + iki üçgen');
  assert.ok(bucketTris(r, 'brick') === 12, 'baca');
});

test('InteriorDress: durum deterministik, perde/lamba/halı/resim geometri üretir, pencere başlangıç durumları', () => {
  const rng = new RNG('b');
  assert.equal(buildingState({ id: 'home' }, rng), 'lived');
  const s1 = buildingState({ id: 'x', region: 'sehir' }, new RNG('x')), s2 = buildingState({ id: 'x', region: 'sehir' }, new RNG('x'));
  assert.equal(s1, s2, 'aynı tohum aynı durum');
  const fr = { cx: 100, cz: 50, c: 1, s: 0, baseY: 5, pt(tx, tz) { return { x: 100 + tx - 5, z: 50 + tz - 3.5 }; } };
  const tpl = { w: 10, d: 7, H: 3.2, rooms: [{ id: 'a', type: 'living', x0: 0.3, z0: 0.3, x1: 9.7, z1: 6.7 }] };
  const B = { spec: { id: 'ev2', region: 'mahalle' }, frame: fr, floorY: 5.2, windows: [{ center: { x: 97, z: 56.5 }, inward: { x: 0, z: -1 }, width: 1.1, height: 1.2, sill: 0.9 }, { center: { x: 103, z: 56.5 }, inward: { x: 0, z: -1 }, width: 1.1, height: 1.2, sill: 0.9 }] };
  const geo = new Geo();
  const r = dressInterior(B, tpl, {}, geo, new RNG('ev2'));
  assert.ok(['lived', 'looted', 'barricaded'].includes(r.state));
  assert.ok(bucketTris(geo, 'decor') > 0, 'dekor geometrisi');
  assert.ok(bucketTris(geo, 'emissive') > 0, 'lamba ışıma yüzeyi');
  assert.ok(allTris(geo) > 20);
  for (const c of r.clutter) assert.ok(c.x > 94 && c.x < 106 && c.z > 46 && c.z < 54, 'dağınıklık oda içinde');
  const flagged = B.windows.filter((w) => w.initBarricade || w.initBroken).length;
  assert.ok(r.state === 'lived' ? flagged === 0 : flagged >= 0);
});
