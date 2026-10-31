import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStats } from '../../src/systems/PlayerStats.js';

test('açlık ve susuzluk zamanla azalır', () => {
  const s = new PlayerStats({});
  const h0 = s.hunger, t0 = s.thirst;
  s.tick(120, { ambient: 18 });
  assert.ok(s.hunger < h0 && s.thirst < t0);
});

test('aç ve susuz kalan oyuncu hasar alır ve sonunda yere düşer', () => {
  const s = new PlayerStats({ health: 100 });
  s.hunger = 0; s.thirst = 0;
  for (let i = 0; i < 48; i++) s.tick(60, { ambient: 18 });
  assert.ok(s.downed, 'oyuncu yere düşmeli');
  assert.equal(s.dead, false, 'kalıcı ölüm varsayılan olarak kapalı');
});

test('hasar zırhla azalır, sıfıra inince oyuncu yere düşer, kaldırılabilir', () => {
  const s = new PlayerStats({ health: 100 });
  s.armor = 0.5;
  s.damage(40, 'fall', () => 0.99);
  assert.equal(Math.round(s.health), 80);
  s.damage(500, 'zombie', () => 0.99);
  assert.ok(s.downed);
  s.revive(30);
  assert.equal(s.downed, false);
  assert.equal(s.health, 30);
});

test('bandaj kanamayı durdurur, antibiyotik hastalığı tedavi eder', () => {
  const s = new PlayerStats({});
  s.cond.bleeding = 1; s.cond.infection = 80; s.cond.sick = true;
  s.consume({ health: 10, cure: ['bleeding'] });
  assert.equal(s.cond.bleeding, 0);
  s.consume({ infection: -70, cure: ['sick'] });
  assert.equal(s.cond.sick, false);
});

test('çiğ et zehirlenme riski taşır', () => {
  const s = new PlayerStats({});
  const r = s.consume({ hunger: 12, poison: 0.45 }, 1, () => 0.1);
  assert.ok(r.includes('poisoned'));
  assert.ok(s.cond.poisoned > 0);
});

test('uyku enerjiyi geri kazandırır', () => {
  const s = new PlayerStats({});
  s.energy = 10;
  s.tick(240, { sleeping: true, ambient: 20, sheltered: true });
  assert.ok(s.energy > 50);
});
