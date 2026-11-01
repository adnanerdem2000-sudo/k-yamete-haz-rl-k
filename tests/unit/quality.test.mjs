// Aşama 8 birim testleri: kalite ön ayarları (alt ayarları birlikte ve tek bildirimle değiştirir) ve performans
// ölçer istatistikleri (FPS, %1 low, CPU süresi, pencere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Settings, QUALITY_PRESETS, applyQualityPreset } from '../../src/core/Settings.js';
import { PerfMonitor } from '../../src/core/PerfMonitor.js';

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

test('PerfMonitor: 600 karelik halka tampon taşınca en yeni kareler kalır', () => {
  const pm = new PerfMonitor(fakeRenderer());
  for (let i = 0; i < 700; i++) { pm.begin(); pm.end(i < 600 ? 50 : 20); }
  const s = pm.stats(null, 100);
  assert.equal(s.frameMs, 20, 'son 100 kare 20 ms');
  assert.equal(pm.stats().frames, 600);
});
