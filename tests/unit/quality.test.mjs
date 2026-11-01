// Aşama 8 birim testleri: kalite ön ayarları (alt ayarları birlikte ve tek bildirimle değiştirir) ve performans
// ölçer istatistikleri (FPS, %1 low, CPU süresi, pencere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Settings, DEFAULTS, QUALITY_PRESETS, applyQualityPreset } from '../../src/core/Settings.js';
import { PerfMonitor, PERF_WINDOW } from '../../src/core/PerfMonitor.js';

test('Kalite: dört seviye; Ultra AO ve su yansımasını açar, Düşük gölge/bloom/çimeni kapatır', () => {
  assert.deepEqual(Object.keys(QUALITY_PRESETS), ['low', 'medium', 'high', 'ultra']);
  const seen = [];
  const off = Settings.onChange((p) => seen.push(p));
  applyQualityPreset('ultra');
  assert.equal(Settings.get('graphics.quality'), 'ultra');
  assert.equal(Settings.get('graphics.ao'), true);
  assert.equal(Settings.get('graphics.waterRefl'), true);
  assert.equal(Settings.get('graphics.viewDistance'), 700);
  assert.deepEqual(seen, ['graphics'], 'ön ayar tek bildirimle uygulanmalı (tek yeniden kurulum)');
  applyQualityPreset('low');
  assert.equal(Settings.get('graphics.shadows'), false);
  assert.equal(Settings.get('graphics.bloom'), false);
  assert.equal(Settings.get('graphics.grass'), false);
  assert.equal(Settings.get('graphics.ao'), false);
  assert.equal(Settings.get('graphics.waterRefl'), false);
  // diğer ayarlara dokunulmaz
  assert.equal(typeof Settings.get('graphics.fov'), 'number');
  applyQualityPreset('yok'); // bilinmeyen seviye: değişiklik yok
  assert.equal(Settings.get('graphics.quality'), 'low');
  off();
  applyQualityPreset('medium');
});

const fakeRenderer = () => ({ getContext: () => ({ getExtension: () => null }), info: { render: { calls: 42, triangles: 12345 }, memory: { geometries: 1, textures: 2 } } });

test('PerfMonitor: ortalama kare süresi → FPS, en kötü %1 karelerden "1% low", CPU süresi', () => {
  const pm = new PerfMonitor(fakeRenderer());
  // 99 kare 10 ms + 1 kare 100 ms
  for (let i = 0; i < 100; i++) { pm.begin(); pm.end(i === 50 ? 100 : 10); }
  const s = pm.stats();
  assert.equal(s.frames, 100);
  assert.equal(s.frameMs, 10.9);
  assert.equal(s.fps, +(1000 / 10.9).toFixed(1));
  assert.equal(s.low1, 10, 'en kötü %1 (1 kare, 100 ms) → 10 FPS');
  assert.equal(s.worstMs, 100);
  assert.equal(s.gpuMs, null, 'zaman sorgusu yoksa GPU süresi null');
  assert.equal(s.calls, 42);
  assert.ok(s.cpuMs >= 0);
  // pencere: son 10 kare (hepsi 10 ms)
  const w = pm.stats(null, 10);
  assert.equal(w.frames, 10);
  assert.equal(w.frameMs, 10);
  pm.reset();
  assert.equal(pm.stats().frames, 0);
});

test('PerfMonitor: halka tampon taşınca en yeni kareler kalır; pencere 144 Hz\'de 8 sn\'lik ölçüme yeter', () => {
  assert.ok(PERF_WINDOW >= 144 * 8 * 2, 'performans testinin 8 sn\'lik ölçümü pencereye sığmalı');
  const pm = new PerfMonitor(fakeRenderer());
  for (let i = 0; i < PERF_WINDOW + 100; i++) { pm.begin(); pm.end(i < PERF_WINDOW ? 50 : 20); }
  const s = pm.stats(null, 100);
  assert.equal(s.frameMs, 20, 'son 100 kare 20 ms');
  assert.equal(pm.stats().frames, PERF_WINDOW);
});

test('PerfMonitor: GPU kesintisi (disjoint) bildirilirse bekleyen zaman sorguları atılır, sonuç kaydedilmez', () => {
  let disjoint = false;
  const deleted = [];
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    getExtension: () => ext, createQuery: () => ({}), beginQuery() {}, endQuery() {},
    getParameter: (p) => (p === 2 ? disjoint : null), QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    getQueryParameter: (q, p) => (p === 3 ? true : 5e6), deleteQuery: (q) => deleted.push(q),
  };
  const pm = new PerfMonitor({ getContext: () => gl, info: { render: { calls: 1, triangles: 1 }, memory: { geometries: 0, textures: 0 } } });
  pm.begin(); pm.gpuBegin(); pm.gpuEnd(); pm.end(16);
  assert.equal(pm.stats().gpuMs, 5, '5 ms (5e6 ns)');
  disjoint = true;
  pm.begin(); pm.gpuBegin(); pm.gpuEnd(); pm.end(16);
  assert.equal(pm.gn, 1, 'kesintili sorgunun sonucu kaydedilmez');
  assert.equal(deleted.length, 2, 'iki sorgu da silinir');
  assert.equal(pm.pending.length, 0);
});

test('Ayarlar: ön ayar ve tuş değişikliği varsayılanları değiştirmez; "Tüm ayarları sıfırla" varsayılana döner', () => {
  applyQualityPreset('ultra');
  Settings.set('graphics.fov', 91);
  Settings.set('controls.bindings.forward', 'KeyI');
  assert.equal(DEFAULTS.graphics.quality, 'medium', 'DEFAULTS nesnesi değişmemeli');
  assert.equal(DEFAULTS.graphics.ao, false);
  assert.equal(DEFAULTS.graphics.fov, 70);
  assert.equal(DEFAULTS.controls.bindings.forward, 'KeyW');
  const name = Settings.get('player.name');
  Settings.reset();
  assert.equal(Settings.get('graphics.quality'), 'medium');
  assert.equal(Settings.get('graphics.ao'), false);
  assert.equal(Settings.get('graphics.waterRefl'), false);
  assert.equal(Settings.get('graphics.viewDistance'), 420);
  assert.equal(Settings.get('graphics.fov'), 70);
  assert.equal(Settings.get('controls.bindings.forward'), 'KeyW');
  assert.equal(Settings.get('player.name'), name, 'oyuncu adı sıfırlamada korunur');
  // sıfırlamadan sonraki değişiklik de varsayılanlara sızmamalı
  Settings.set('graphics.shadows', false);
  assert.equal(DEFAULTS.graphics.shadows, true);
  Settings.reset();
});

test('Normal onarımı: sıfır/NaN köşe normali komşu üçgenin yüz normaline, yoksa yukarıya çekilir', async () => {
  const THREE = await import('three');
  const { repairNormals, repairTree } = await import('../../src/core/NormalRepair.js');
  // indekssiz: XY düzleminde saat yönü tersine üçgen (yüz normali +Z); normaller [geçerli, sıfır, NaN]
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0, NaN, NaN, NaN], 3));
  assert.equal(repairNormals(g), 2);
  const n = g.attributes.normal;
  for (const i of [1, 2]) assert.deepEqual([n.getX(i), n.getY(i), n.getZ(i)], [0, 0, 1]);
  assert.deepEqual([n.getX(0), n.getY(0), n.getZ(0)], [0, 0, 1], 'geçerli normal değişmez');
  assert.equal(repairNormals(g), 0, 'onarılmış geometri yeniden işlenmez');
  // indeksli: bozuk köşe önce alanı sıfır üçgende, sonra geçerli üçgende; yalnız sıfır alanlı üçgendeki köşe → (0,1,0)
  const h = new THREE.BufferGeometry();
  h.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5], 3));
  h.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  h.setIndex([0, 1, 2, /* sıfır alan (doğrusal) */ 0, 3, 1, /* geçerli: XZ düzlemi */ 4, 5, 6 /* üç köşe aynı nokta */]);
  assert.equal(repairNormals(h), 4);
  const m = h.attributes.normal;
  const v1 = new THREE.Vector3(m.getX(1), m.getY(1), m.getZ(1));
  assert.ok(Math.abs(v1.length() - 1) < 1e-6 && Math.abs(v1.y) > 0.99, 'köşe 1: geçerli (XZ düzlemindeki) üçgenin normali ±Y');
  for (const i of [4, 5, 6]) assert.deepEqual([m.getX(i), m.getY(i), m.getZ(i)], [0, 1, 0], 'yalnız dejenere üçgende: yukarı');
  // ağaç: paylaşılan geometri bir kez sayılır
  const bad = () => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 0, 1], 3)); return q; };
  const shared = bad();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(shared), new THREE.Mesh(shared), new THREE.Mesh(bad()));
  const stats = { meshes: 0, vertices: 0 };
  repairTree(root, new WeakSet(), stats);
  assert.deepEqual(stats, { meshes: 2, vertices: 2 });
});
