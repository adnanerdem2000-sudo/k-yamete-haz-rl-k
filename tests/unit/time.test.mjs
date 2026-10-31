import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeSystem, phaseOf } from '../../src/systems/TimeSystem.js';

test('varsayılan: 1 oyun günü = 24 gerçek dakika', () => {
  const t = new TimeSystem({ dayMinutes: 24, startMinute: 0 });
  t.update(24 * 60);
  assert.equal(t.day, 2);
  assert.equal(Math.round(t.minuteOfDay), 0);
});

test('gün dönemleri doğru hesaplanır', () => {
  assert.equal(phaseOf(7 * 60), 'Sabah');
  assert.equal(phaseOf(13 * 60), 'Öğle');
  assert.equal(phaseOf(18 * 60), 'Akşam');
  assert.equal(phaseOf(23 * 60), 'Gece');
  assert.equal(phaseOf(3 * 60), 'Gece');
});

test('saat ve gün olayları yayınlanır, geri sayım azalır', () => {
  const t = new TimeSystem({ startDay: 1, startMinute: 8 * 60 });
  const days = [], hours = [];
  t.on((type, d) => { if (type === 'day') days.push(d.day); if (type === 'hour') hours.push(d.hour); });
  const c0 = t.countdown;
  t.advance(1440 * 2);
  assert.deepEqual(days, [2, 3]);
  assert.equal(hours.length, 48);
  assert.equal(c0 - t.countdown, 2880);
});

test('30. gün 22:00 geri sayım sıfıra iner', () => {
  const t = new TimeSystem({ startDay: 30, startMinute: 22 * 60 });
  assert.equal(t.countdown, 0);
  assert.equal(t.daysLeft, 0);
});

test('uyku hızlandırması', () => {
  const t = new TimeSystem({ startMinute: 0 });
  t.ff = 60;
  t.update(1);
  assert.equal(Math.round(t.minuteOfDay), 60);
});
