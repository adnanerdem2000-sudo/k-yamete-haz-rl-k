import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../../src/systems/Inventory.js';
import { MapSystem, FOG_N } from '../../src/systems/MapSystem.js';
import { Weather, WEATHER_TYPES } from '../../src/systems/Weather.js';
import { Quests } from '../../src/systems/Quests.js';
import { SaveSystem } from '../../src/systems/SaveSystem.js';
import { TimeSystem } from '../../src/systems/TimeSystem.js';

/** En küçük sahte oturum */
function fakeSession(over = {}) {
  const handlers = {}, appliers = {};
  const S = {
    isHost: true, seed: 42, localId: 'p1', flags: {}, relations: {}, results: { quests: 0 },
    time: new TimeSystem({ startDay: 1, startMinute: 8 * 60 }),
    world: { spawn: { x: 0, z: 0 } },
    env: { weather: { rain: 0, cloud: 0, fog: 0, wind: 1, snow: 0, storm: 0 }, redMist: 0 },
    local: { pos: { x: 0, y: 5, z: 0 } },
    ui: { toast() {}, questBanner() {}, refreshQuests() {} }, audio: { play() {} },
    net: { active: false, sendToHost() {} },
    players: new Map([['p1', { id: 'p1' }]]),
    on(t, fn) { handlers[t] = fn; }, onEvt(k, fn) { (appliers[k] = appliers[k] || []).push(fn); },
    emit(e) { for (const fn of appliers[e.k] || []) fn(e); },
    applyAction(t, p, from) { return handlers[t] && handlers[t](p, from); },
    act(t, p) { return this.applyAction(t, p, this.localId); },
    ...over,
  };
  return S;
}

test('yiyecek yığınları birleşince eski tazelik korunur', () => {
  const inv = new Inventory(10, 100);
  inv.addStack({ id: 'bread', qty: 1, t0: 5000 });
  inv.addStack({ id: 'bread', qty: 1, t0: 1000 });
  const s = inv.items().find((x) => x.id === 'bread');
  assert.equal(s.qty, 2);
  assert.equal(s.t0, 1000);
});

test('harita keşif sisi RLE ile kaydedilip geri yüklenir', () => {
  const S = fakeSession();
  const m = new MapSystem(S);
  m.revealAround(200, -150, 80);
  const before = m.exploredPct();
  assert.ok(before > 0 && before < 0.2);
  m.addUserMarker(10, 20, 'Test');
  const data = JSON.parse(JSON.stringify(m.serialize()));
  const m2 = new MapSystem(fakeSession());
  m2.fog.fill(0);
  m2.load(data);
  assert.equal(m2.fog.length, FOG_N * FOG_N);
  assert.deepEqual([...m2.fog], [...m.fog]);
  assert.equal(m2.markers.length, 1);
  assert.ok(m2.explored(200, -150));
});

test('hava durumu: sıcaklık gün içinde değişir, kar soğutur, ayar host olayıyla yayılır', () => {
  const S = fakeSession();
  const w = new Weather(S);
  const noon = (S.time.set(12 * 60 + 2 * 60), w.temperature);
  const night = (S.time.set(3 * 60), w.temperature);
  assert.ok(noon > night, `öğle ${noon} > gece ${night}`);
  w.set('snow', 60);
  assert.equal(w.type, 'snow');
  assert.ok(w.temperature < night);
  w.set('olmayan_tur', 60);
  assert.equal(w.type, 'clear');
  for (let i = 0; i < 200; i++) w.update(1, 30);
  assert.ok(WEATHER_TYPES[w.type]);
  assert.ok(S.env.weather.cloud >= 0 && S.env.weather.cloud <= 1);
});

test('görev kancaları: istemci ağdan ad+argüman gönderir, host eşleştirir', () => {
  const sent = [];
  const C = fakeSession({ isHost: false, net: { active: true, sendToHost: (m) => sent.push(m) } });
  const qc = new Quests(C);
  qc.onKill('runner');
  assert.deepEqual(sent[0], { t: 'qhook', type: 'kill', arg: 'runner' });
  assert.ok(sent.every((m) => typeof m.arg !== 'function'));
  const H = fakeSession();
  const q = new Quests(H);
  q.addDynamic('t_kill', { kind: 'random', title: 'Test', objs: [{ t: 'kill', count: 2, label: 'Öldür' }] });
  q.hook('kill', 'normal');
  q.hook('kill', 'runner');
  assert.equal(q.state('t_kill'), 'done');
});

test('kayıt meta bilgisi gün ve oyuncu sayısını çıkarır', () => {
  const meta = SaveSystem.meta({ time: { total: 3 * 1440 + 600 }, players: { a: { charId: 'mert', name: 'A' }, b: { charId: 'elif' } }, hostToken: 'a', savedAt: 1, cfg: { difficulty: 'hard' } });
  assert.equal(meta.day, 4);
  assert.equal(meta.minute, 600);
  assert.equal(meta.players, 2);
  assert.equal(meta.multiplayer, true);
  assert.equal(meta.charId, 'mert');
});
