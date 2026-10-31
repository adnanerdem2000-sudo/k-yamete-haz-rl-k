import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, HOTBAR, stackWeight } from '../../src/systems/Inventory.js';
import { ITEMS } from '../../src/data/items.js';

test('yığınlanabilir eşyalar birleşir ve yığın sınırına uyar', () => {
  const inv = new Inventory(10, 1000);
  assert.equal(inv.add('canned_food', 20), 0);
  assert.equal(inv.count('canned_food'), 20);
  const stacks = inv.items().filter((s) => s.id === 'canned_food');
  assert.ok(stacks.every((s) => s.qty <= ITEMS.canned_food.stack));
  assert.equal(stacks.length, 2);
});

test('ağırlık sınırı aşılmaz, kalan miktar döndürülür', () => {
  const inv = new Inventory(30, 5);
  const left = inv.add('log', 4); // 3 kg/adet
  assert.equal(left, 3);
  assert.equal(inv.count('log'), 1);
  assert.ok(inv.weight() <= 5);
});

test('yuva sınırı: dolu envanter eşya kabul etmez', () => {
  const inv = new Inventory(2, 1000);
  inv.add('axe', 1); inv.add('hammer', 1);
  assert.equal(inv.add('crowbar', 1), 1);
});

test('çıkarma, taşıma, bölme ve birleştirme', () => {
  const inv = new Inventory(12, 1000);
  inv.add('nails', 50);
  assert.equal(inv.remove('nails', 20), 20);
  assert.equal(inv.count('nails'), 30);
  const i = inv.firstSlotOf('nails');
  assert.ok(inv.split(i));
  assert.equal(inv.count('nails'), 30);
  const slots = inv.slots.map((s, k) => (s && s.id === 'nails' ? k : -1)).filter((k) => k >= 0);
  assert.equal(slots.length, 2);
  inv.move(slots[1], slots[0]);
  assert.equal(inv.slots[slots[0]].qty, 30);
  assert.equal(inv.slots[slots[1]], null);
});

test('silah ve aletler hızlı erişim çubuğuna yerleşir, yiyecekler sonra', () => {
  const inv = new Inventory(20, 1000);
  inv.add('canned_food', 1);
  inv.add('bat', 1);
  assert.ok(inv.firstSlotOf('bat') < HOTBAR);
  assert.ok(inv.firstSlotOf('canned_food') >= HOTBAR);
});

test('serileştirme gidiş-dönüş', () => {
  const inv = new Inventory(15, 40);
  inv.add('pistol', 1, { ammo: 7 }); inv.add('water_bottle', 3);
  const copy = Inventory.deserialize(JSON.parse(JSON.stringify(inv.serialize())), 15);
  assert.equal(copy.count('water_bottle'), 3);
  assert.equal(copy.slots[copy.firstSlotOf('pistol')].ammo, 7);
  assert.equal(copy.maxWeight, 40);
});

test('yakıt bidonu ağırlığı yakıtla artar', () => {
  assert.ok(stackWeight({ id: 'jerrycan', qty: 1, fuel: 20 }) > stackWeight({ id: 'jerrycan', qty: 1, fuel: 0 }) + 10);
});
